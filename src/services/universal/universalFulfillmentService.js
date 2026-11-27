const { db } = require("../../config/database");
const crypto = require("crypto");
const universalPricingService = require("./universalPricingService");
const universalAvailabilityService = require("./universalAvailabilityService");
const jobQueueService = require("../queue/jobQueueService");
const inappSseManager = require("../inapp/inappSseManager");

/**
 * Universal Fulfillment, Checkout & Payment Reconciliation Service
 * Covers UNIT_STOCK, DATE_RANGE, TIME_SLOT, and QUOTE_SERVICE transactions across all sectors.
 */

/**
 * Format date to MySQL UTC DATETIME string (YYYY-MM-DD HH:MM:SS)
 */
function toMysqlUtc(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Generate unique, ERP-grade reference code
 * Format: SRV-YYYY-XXXXXX (under 40 chars)
 */
function generateReferenceCode(tenantId = 1) {
  const yyyy = new Date().getUTCFullYear();
  const tPad = String(Number(tenantId) || 1).padStart(2, "0");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  const time = Date.now().toString().slice(-4);
  return `SRV-${yyyy}-${tPad}${rand}${time}`;
}

/**
 * Create a transaction from a validated quote
 */
async function createTransactionFromQuote({
  tenantId = 1,
  sourceChannel = "WHATSAPP_FLOW",
  customer = {},
  cartItems = [],
  addOns = [],
  promoCode = null,
  paymentModeId = null,
  holdId = null,
  locationId = null,
  crmRecordId = null,
  flowSessionId = null,
  inappSessionId = null,
  serviceDate = null,
  serviceEndDate = null,
  serviceSlotTime = null,
  notes = null,
  metadata = {},
  userId = "system"
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const customerPhone = String(customer.phone || customer.customer_phone || "").trim().replace(/\D/g, "");
  const customerName = customer.name || customer.customer_name || null;
  const customerEmail = customer.email || customer.customer_email || null;

  if (!customerPhone) {
    throw new Error("Customer phone number is required to create a transaction");
  }

  // 1. Authoritative Recalculation: Never trust client-submitted totals
  const quote = universalPricingService.calculateCartQuote(numericTenantId, {
    items: cartItems,
    addOns,
    promoCode,
    checkIn: serviceDate,
    checkOut: serviceEndDate
  });

  if (!quote.items || quote.items.length === 0) {
    throw new Error("Cart items are empty or invalid");
  }

  // 2. Infer Transaction Type
  let transactionType = "ORDER";
  const firstItem = quote.items[0];
  if (firstItem?.inventory_mode === "DATE_RANGE" || (serviceDate && serviceEndDate)) {
    transactionType = "BOOKING";
  } else if (firstItem?.inventory_mode === "TIME_SLOT" || serviceSlotTime) {
    transactionType = "APPOINTMENT";
  } else if (firstItem?.inventory_mode === "QUOTE_SERVICE") {
    transactionType = "QUOTE";
  }

  // 3. Resolve Payment Mode
  let paymentMode = null;
  if (paymentModeId) {
    paymentMode = db.prepare(`
      SELECT * FROM master_payment_modes
      WHERE tenant_id = ? AND id = ? AND delete_status = 0
    `).get(numericTenantId, paymentModeId);
  }
  if (!paymentMode) {
    // Fallback to active payment mode
    paymentMode = db.prepare(`
      SELECT * FROM master_payment_modes
      WHERE tenant_id = ? AND active_status = 1 AND delete_status = 0
      ORDER BY sort_order ASC, id ASC
      LIMIT 1
    `).get(numericTenantId);
  }

  const isPayLater = paymentMode
    ? paymentMode.deposit_type === "PAY_LATER" ||
      paymentMode.mode_code === "CASH_ON_DELIVERY" ||
      Number(paymentMode.is_online) === 0
    : false;

  const referenceCode = generateReferenceCode(numericTenantId);

  const effectiveHoldTokens = [];
  if (holdId) effectiveHoldTokens.push(String(holdId));
  let txnMetadata = { ...(metadata || {}) };

  // 4. Calculate Deposit & Balance (and reserve/confirm atomic inventory inside transaction)
  let depositDue = 0;
  let balanceDue = quote.grandTotal;
  let paymentStatus = "UNPAID";
  let fulfillmentStatus = "PENDING";
  let paymentLinkUrl = null;
  let paymentExpiresAt = null;
  let primaryHoldId = holdId ? String(holdId) : null;

  if (isPayLater) {
    paymentStatus = paymentMode?.mode_code === "CASH_ON_DELIVERY" ? "COD_PENDING" : "PAY_AT_DESK";
    fulfillmentStatus = "CONFIRMED";
    depositDue = 0;
    balanceDue = quote.grandTotal;
  } else {
    const depType = paymentMode?.deposit_type || "FULL";
    const depVal = Number(paymentMode?.deposit_value) || 100;
    if (depType === "PERCENTAGE") {
      depositDue = Math.round((quote.grandTotal * depVal) / 100);
    } else if (depType === "FIXED") {
      depositDue = Math.min(quote.grandTotal, depVal);
    } else {
      depositDue = quote.grandTotal;
    }
    balanceDue = Math.max(0, Math.round((quote.grandTotal - depositDue) * 100) / 100);
    paymentStatus = "LINK_SENT";
    fulfillmentStatus = "PENDING";

    const expiresDate = new Date(Date.now() + 30 * 60 * 1000);
    paymentExpiresAt = toMysqlUtc(expiresDate);
    paymentLinkUrl = `/api/v1/public/pay/${referenceCode}`;
  }

  // 5. Atomic Inventory Check/Hold + Insert inside Transaction
  db.prepare("START TRANSACTION").run();
  let txnId = null;

  try {
    if (holdId) {
      if (isPayLater) {
        const confRes = universalAvailabilityService.confirmHold(numericTenantId, holdId);
        if (!confRes || !confRes.success) {
          const err = new Error(confRes?.reason || "Inventory hold expired or unavailable");
          err.statusCode = 409;
          throw err;
        }
      } else {
        const heldRow = db.prepare(`
          SELECT id, status,
                 CASE WHEN expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END AS is_expired
          FROM catalog_inventory_holds
          WHERE tenant_id = ? AND (hold_token = ? OR id = ?)
          FOR UPDATE
        `).get(numericTenantId, String(holdId), /^\d+$/.test(String(holdId)) ? Number(holdId) : 0);
        if (!heldRow || heldRow.status !== "HELD" || Number(heldRow.is_expired) === 1) {
          const err = new Error(heldRow?.is_expired ? "Inventory hold has expired" : "Inventory hold is not active");
          err.statusCode = 409;
          throw err;
        }
      }
    } else {
      // Auto-acquire atomic holds for every tracked catalog item / slot / date range so stock cannot oversell
      for (let idx = 0; idx < quote.items.length; idx++) {
        const qItem = quote.items[idx];
        const rawItem = cartItems[idx] || {};
        const itemIdVal = qItem.id ?? qItem.itemId ?? rawItem.itemId ?? null;
        const slotIdVal = rawItem.slotId || rawItem.slot_id || null;
        if (!itemIdVal && !slotIdVal) continue;

        const dbItem = itemIdVal
          ? db.prepare("SELECT id, inventory_mode, track_inventory FROM catalog_items WHERE tenant_id = ? AND id = ? AND delete_status = 0").get(numericTenantId, itemIdVal)
          : null;

        const needsHold = Boolean(slotIdVal) || Boolean(dbItem && (Number(dbItem.track_inventory) === 1 || dbItem.inventory_mode === "DATE_RANGE"));
        if (!needsHold) continue;

        const autoHold = universalAvailabilityService.createInventoryHold(numericTenantId, {
          itemId: itemIdVal,
          slotId: slotIdVal,
          quantity: qItem.quantity || 1,
          holdMinutes: 30,
          customerPhone,
          customerName,
          checkIn: serviceDate,
          checkOut: serviceEndDate,
          holdType: dbItem?.inventory_mode === "DATE_RANGE" ? "DATE_RANGE" : undefined
        });

        if (autoHold?.holdToken) {
          effectiveHoldTokens.push(autoHold.holdToken);
          if (!primaryHoldId) primaryHoldId = autoHold.holdToken;
          if (isPayLater) {
            const confRes = universalAvailabilityService.confirmHold(numericTenantId, autoHold.holdToken);
            if (!confRes || !confRes.success) {
              const err = new Error(confRes?.reason || "Could not confirm inventory hold");
              err.statusCode = 409;
              throw err;
            }
          }
        }
      }
    }

    if (effectiveHoldTokens.length > 0) {
      txnMetadata = { ...txnMetadata, holdTokens: [...new Set(effectiveHoldTokens)] };
    }

    const txnRes = db.prepare(`
      INSERT INTO universal_transactions (
        tenant_id, reference_code, transaction_type, source_channel,
        master_location_id, master_payment_mode_id, master_status_tag_code,
        customer_phone, customer_name, customer_email,
        crm_record_id, flow_session_id, inapp_session_id, hold_id,
        service_date, service_end_date, service_slot_time,
        subtotal_amount, addons_amount, discount_amount, tax_amount, grand_total,
        deposit_due, amount_paid, balance_due, currency,
        payment_status, payment_gateway_ref, payment_link_url, payment_expires_at,
        fulfillment_status, notes, metadata_json,
        active_status, delete_status, created_by, updated_by,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0, ?, ?,
        ?, NULL, ?, ?,
        ?, ?, ?,
        1, 0, ?, ?,
        UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(
      numericTenantId,
      referenceCode,
      transactionType,
      sourceChannel,
      locationId || null,
      paymentMode?.id || null,
      fulfillmentStatus === "CONFIRMED" ? "CONFIRMED" : "NEW",
      customerPhone,
      customerName,
      customerEmail,
      crmRecordId || null,
      flowSessionId || null,
      inappSessionId || null,
      primaryHoldId || null,
      serviceDate || null,
      serviceEndDate || null,
      serviceSlotTime || null,
      quote.netSubtotal,
      quote.addonsSubtotal,
      quote.promoDiscount,
      quote.totalGst,
      quote.grandTotal,
      depositDue,
      balanceDue,
      quote.currency || "INR",
      paymentStatus,
      paymentLinkUrl,
      paymentExpiresAt,
      fulfillmentStatus,
      notes || null,
      JSON.stringify(txnMetadata),
      userId,
      userId
    );

    txnId = txnRes.lastInsertRowid;

    // Insert transaction items
    const insertItemStmt = db.prepare(`
      INSERT INTO universal_transaction_items (
        tenant_id, transaction_id, catalog_item_id, master_resource_id,
        item_title, variant_label, inventory_mode, quantity,
        duration_units, unit_label, unit_price, addons_json,
        tax_percent, tax_amount, line_total, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, UTC_TIMESTAMP()
      )
    `);

    for (const item of quote.items) {
      const resolvedItemId = item.id ?? item.itemId ?? item.catalog_item_id ?? null;
      const resolvedTaxPct = Number(item.gstPercent ?? item.taxRate ?? item.master_tax_rate ?? 0);
      const resolvedTaxAmt = Number((item.gstAmount ?? item.taxAmount ?? 0).toFixed(2));
      const resolvedLineTotal = Number((item.lineTotal ?? ((item.lineSubtotal || 0) + resolvedTaxAmt)).toFixed(2));
      insertItemStmt.run(
        numericTenantId,
        txnId,
        resolvedItemId,
        item.master_resource_id || null,
        item.title || "Item",
        item.variantName || item.variant_label || null,
        item.inventory_mode || "UNIT_STOCK",
        item.quantity || 1,
        item.nights || quote.nights || 1,
        item.unitSymbol || item.master_unit_symbol || item.master_unit_name || "unit",
        item.unitPrice || item.base_price || 0,
        item.addons ? JSON.stringify(item.addons) : null,
        resolvedTaxPct,
        resolvedTaxAmt,
        resolvedLineTotal
      );
    }

    // Insert any global add-ons as transaction items
    if (Array.isArray(quote.addOns) && quote.addOns.length > 0) {
      for (const addon of quote.addOns) {
        const addonTaxPct = Number(addon.gstPercent ?? addon.taxRate ?? 0);
        const addonTaxAmt = Number((addon.gstAmount ?? addon.taxAmount ?? 0).toFixed(2));
        const addonLineTotal = Number((addon.lineTotal ?? ((addon.lineSubtotal || 0) + addonTaxAmt)).toFixed(2));
        insertItemStmt.run(
          numericTenantId,
          txnId,
          null,
          null,
          `Add-on: ${addon.name}`,
          null,
          "ADDON",
          addon.quantity || 1,
          1,
          "addon",
          addon.price ?? addon.unitPrice ?? 0,
          null,
          addonTaxPct,
          addonTaxAmt,
          addonLineTotal
        );
      }
    }

    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }

  // Enqueue lifecycle jobs ONLY after atomic transaction succeeds
  if (!isPayLater) {
    try {
      const nudgeRunAt = new Date(Date.now() + 15 * 60 * 1000);
      jobQueueService.enqueueJob({
        tenantId: numericTenantId,
        jobType: "PAYMENT_LINK_NUDGE",
        idempotencyKey: `pln-${referenceCode}`,
        runAt: nudgeRunAt,
        payload: {
          tenantId: numericTenantId,
          referenceCode,
          customerPhone,
          customerName,
          amount: depositDue,
          paymentLinkUrl
        }
      });

      const expireRunAt = new Date(Date.now() + 30 * 60 * 1000);
      jobQueueService.enqueueJob({
        tenantId: numericTenantId,
        jobType: "PAYMENT_HOLD_EXPIRE",
        idempotencyKey: `phe-${referenceCode}`,
        runAt: expireRunAt,
        payload: {
          tenantId: numericTenantId,
          referenceCode,
          holdId: primaryHoldId
        }
      });
    } catch (jobErr) {
      console.warn(`[UniversalFulfillment] Could not enqueue payment reminder jobs: ${jobErr.message}`);
    }
  }

  // 6. Sync CRM Record
  try {
    syncCrmRecord(numericTenantId, {
      customerPhone,
      customerName,
      customerEmail,
      dealValue: quote.grandTotal,
      stageKey: fulfillmentStatus === "CONFIRMED" ? "CONFIRMED" : "PROSPECT",
      crmRecordId
    });
  } catch (crmErr) {
    console.warn(`[UniversalFulfillment] CRM sync warning: ${crmErr.message}`);
  }

  // 7. Real-Time Telemetry & Notification
  try {
    inappSseManager.notifyStaff({
      type: "NEW_TRANSACTION",
      tenantId: numericTenantId,
      transactionId: txnId,
      referenceCode,
      customerPhone,
      customerName,
      grandTotal: quote.grandTotal,
      paymentStatus,
      fulfillmentStatus
    });
  } catch (sseErr) {}

  const fullTxn = getTransactionById(numericTenantId, txnId);

  return {
    success: true,
    transactionId: txnId,
    referenceCode,
    transaction: fullTxn,
    quote,
    receiptText: quote.receiptText,
    paymentLinkUrl,
    isPayLater
  };
}

/**
 * Reconcile payment confirmation idempotently (from Razorpay Webhook or Staff)
 */
async function reconcilePaymentSuccess({
  tenantId = 1,
  referenceCode,
  gatewayRef = null,
  paidAmount = null,
  source = "GATEWAY_WEBHOOK"
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const cleanRef = String(referenceCode || "").trim();

  if (!cleanRef) {
    throw new Error("Reference code is required for payment reconciliation");
  }

  let txn = null;
  let newAmountPaid = 0;
  let newBalanceDue = 0;
  let newPaymentStatus = "UNPAID";
  const newFulfillmentStatus = "CONFIRMED";

  db.prepare("START TRANSACTION").run();

  try {
    txn = db.prepare(`
      SELECT * FROM universal_transactions
      WHERE tenant_id = ? AND reference_code = ? AND delete_status = 0
      FOR UPDATE
    `).get(numericTenantId, cleanRef);

    if (!txn) {
      db.prepare("ROLLBACK").run();
      throw new Error(`Transaction ${cleanRef} not found`);
    }

    if (txn.fulfillment_status === "CANCELLED") {
      db.prepare("ROLLBACK").run();
      const err = new Error("Cannot reconcile payment for a cancelled transaction");
      err.statusCode = 409;
      throw err;
    }

    // Idempotency inside exclusive row lock: prevent concurrent webhook double-crediting
    if (
      txn.payment_status === "PAID" ||
      (gatewayRef && txn.payment_gateway_ref === gatewayRef && txn.fulfillment_status === "CONFIRMED")
    ) {
      db.prepare("COMMIT").run();
      return {
        success: true,
        alreadyProcessed: true,
        message: "Transaction is already paid and reconciled",
        transaction: getTransactionById(numericTenantId, txn.id)
      };
    }

    // Confirm all bound inventory holds BEFORE committing payment — fail closed if expired/unavailable
    let metaHoldTokens = [];
    try {
      const parsedMeta = typeof txn.metadata_json === "string" ? JSON.parse(txn.metadata_json || "{}") : (txn.metadata_json || {});
      if (Array.isArray(parsedMeta.holdTokens)) metaHoldTokens = parsedMeta.holdTokens;
    } catch (_) {}
    const holdTokensToConfirm = [...new Set([txn.hold_id, ...metaHoldTokens].filter(Boolean).map(String))];
    for (const hTok of holdTokensToConfirm) {
      const holdConf = universalAvailabilityService.confirmHold(numericTenantId, hTok);
      if (!holdConf || !holdConf.success) {
        const err = new Error(holdConf?.reason || `Inventory hold ${hTok} expired or unavailable`);
        err.statusCode = 409;
        throw err;
      }
    }

    const paymentToCredit = paidAmount != null
      ? Number(paidAmount)
      : (Number(txn.deposit_due) > 0 ? Number(txn.deposit_due) : Number(txn.grand_total));

    newAmountPaid = Number(txn.amount_paid || 0) + paymentToCredit;
    newBalanceDue = Math.max(0, Number(txn.grand_total) - newAmountPaid);
    newPaymentStatus = newBalanceDue <= 0 ? "PAID" : "PARTIALLY_PAID";

    // 1. Update Transaction
    db.prepare(`
      UPDATE universal_transactions
      SET amount_paid = ?,
          balance_due = ?,
          payment_status = ?,
          fulfillment_status = ?,
          payment_gateway_ref = COALESCE(?, payment_gateway_ref),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(
      newAmountPaid,
      newBalanceDue,
      newPaymentStatus,
      newFulfillmentStatus,
      gatewayRef || `REC-${Date.now()}`,
      txn.id
    );

    // 2. Cancel pending payment reminder and hold-expiry jobs
    db.prepare(`
      UPDATE system_job_queue
      SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ?
        AND status = 'PENDING'
        AND (idempotency_key = ? OR idempotency_key = ?)
    `).run(numericTenantId, `pln-${cleanRef}`, `phe-${cleanRef}`);

    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }

  // 4. Schedule Post-Purchase Reminders (if service_date is in future)
  if (txn.service_date) {
    try {
      const sDate = new Date(txn.service_date);
      const reminder24h = new Date(sDate.getTime() - 24 * 60 * 60 * 1000);
      if (reminder24h.getTime() > Date.now()) {
        jobQueueService.enqueueJob({
          tenantId: numericTenantId,
          jobType: "UPCOMING_BOOKING_REMINDER",
          idempotencyKey: `ubr-24h-${cleanRef}`,
          runAt: reminder24h,
          payload: {
            tenantId: numericTenantId,
            referenceCode: cleanRef,
            hoursBefore: 24
          }
        });
      }
    } catch (schedErr) {
      console.warn(`[UniversalFulfillment] Post-purchase reminder schedule warning: ${schedErr.message}`);
    }
  }

  // 5. Notify Staff via SSE
  try {
    inappSseManager.notifyStaff({
      type: "PAYMENT_RECONCILED",
      tenantId: numericTenantId,
      referenceCode: cleanRef,
      amountPaid: newAmountPaid,
      paymentStatus: newPaymentStatus,
      fulfillmentStatus: newFulfillmentStatus
    });
  } catch (sseErr) {}

  const updatedTxn = getTransactionById(numericTenantId, txn.id);
  const receiptUrl = `/api/v1/public/receipt/${cleanRef}`;

  return {
    success: true,
    alreadyProcessed: false,
    transaction: updatedTxn,
    receiptUrl
  };
}

/**
 * Update transaction fulfillment status (with post-completion CSAT job)
 */
async function updateFulfillmentStatus(tenantId = 1, txnId, newStatus, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  let txn = null;

  db.prepare("START TRANSACTION").run();
  try {
    txn = db.prepare(`
      SELECT * FROM universal_transactions
      WHERE tenant_id = ? AND id = ? AND delete_status = 0
      FOR UPDATE
    `).get(numericTenantId, txnId);

    if (!txn) {
      db.prepare("ROLLBACK").run();
      throw new Error(`Transaction #${txnId} not found`);
    }

    if (newStatus === "CANCELLED" && txn.fulfillment_status === "CANCELLED") {
      db.prepare("COMMIT").run();
      return {
        success: true,
        alreadyCancelled: true,
        transaction: getTransactionById(numericTenantId, txn.id)
      };
    }

    db.prepare(`
      UPDATE universal_transactions
      SET fulfillment_status = ?,
          updated_by = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(newStatus, userId, txn.id);

    // If CANCELLED, release held OR confirmed inventory holds atomically
    if (newStatus === "CANCELLED") {
      let metaHoldTokens = [];
      try {
        const parsedMeta = typeof txn.metadata_json === "string" ? JSON.parse(txn.metadata_json || "{}") : (txn.metadata_json || {});
        if (Array.isArray(parsedMeta.holdTokens)) metaHoldTokens = parsedMeta.holdTokens;
      } catch (_) {}
      const holdTokensToRelease = [...new Set([txn.hold_id, ...metaHoldTokens].filter(Boolean).map(String))];
      for (const hTok of holdTokensToRelease) {
        universalAvailabilityService.releaseHold(numericTenantId, hTok);
      }
    }

    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }

  // If COMPLETED, enqueue CSAT / Google review feedback job (+2 hours)
  if (newStatus === "COMPLETED") {
    try {
      const feedbackRunAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      jobQueueService.enqueueJob({
        tenantId: numericTenantId,
        jobType: "POST_FULFILLMENT_FEEDBACK",
        idempotencyKey: `pff-${txn.reference_code}`,
        runAt: feedbackRunAt,
        payload: {
          tenantId: numericTenantId,
          referenceCode: txn.reference_code,
          customerPhone: txn.customer_phone,
          customerName: txn.customer_name,
          locationId: txn.master_location_id
        }
      });
    } catch (fbErr) {
      console.warn(`[UniversalFulfillment] Feedback job enqueue warning: ${fbErr.message}`);
    }
  }

  // Audit cancellation
  if (newStatus === "CANCELLED") {
    try {
      db.prepare(`
        INSERT INTO audit_logs (
          tenant_id, user_id, action, target_id, details, ip_address, created_at
        ) VALUES (?, ?, 'CANCEL_TRANSACTION', ?, ?, '127.0.0.1', UTC_TIMESTAMP())
      `).run(
        numericTenantId,
        userId,
        txn.id,
        JSON.stringify({ referenceCode: txn.reference_code, reason: "Status changed to CANCELLED" })
      );
    } catch (auditErr) {}
  }

  return {
    success: true,
    transaction: getTransactionById(numericTenantId, txn.id)
  };
}

/**
 * Record manual offline payment (Cash, Desk UPI, POS)
 */
async function recordOfflinePayment(tenantId = 1, txnId, {
  amount,
  paymentMethod = "CASH",
  notes = null,
  userId = "staff"
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const txn = db.prepare(`
    SELECT * FROM universal_transactions
    WHERE tenant_id = ? AND id = ? AND delete_status = 0
  `).get(numericTenantId, txnId);

  if (!txn) {
    throw new Error(`Transaction #${txnId} not found`);
  }

  const gatewayRef = `OFFLINE-${paymentMethod.toUpperCase()}-${Date.now()}`;
  return reconcilePaymentSuccess({
    tenantId: numericTenantId,
    referenceCode: txn.reference_code,
    gatewayRef,
    paidAmount: Number(amount),
    source: "OFFLINE_STAFF"
  });
}

/**
 * Retrieve transaction with items by ID
 */
function getTransactionById(tenantId = 1, txnId) {
  const numericTenantId = Number(tenantId) || 1;
  const txn = db.prepare(`
    SELECT t.*,
           ml.name as location_name, ml.address_line1 as location_address, ml.city as location_city,
           mpm.name as payment_mode_name, mpm.mode_code as payment_mode_code, mpm.deposit_type,
           mst.tag_name as status_tag_name, mst.color_hex as status_tag_color
    FROM universal_transactions t
    LEFT JOIN master_locations ml ON ml.id = t.master_location_id AND ml.delete_status = 0
    LEFT JOIN master_payment_modes mpm ON mpm.id = t.master_payment_mode_id AND mpm.delete_status = 0
    LEFT JOIN master_status_tags mst ON mst.tag_code = t.master_status_tag_code AND mst.tenant_id = t.tenant_id AND mst.delete_status = 0
    WHERE t.tenant_id = ? AND t.id = ? AND t.delete_status = 0
  `).get(numericTenantId, txnId);

  if (!txn) return null;

  const items = db.prepare(`
    SELECT * FROM universal_transaction_items
    WHERE transaction_id = ?
    ORDER BY id ASC
  `).all(txn.id);

  return {
    ...txn,
    items: items.map(item => ({
      ...item,
      addons_json: item.addons_json ? safeJsonParse(item.addons_json) : null
    })),
    metadata_json: txn.metadata_json ? safeJsonParse(txn.metadata_json) : null
  };
}

/**
 * Retrieve transaction with items by reference code
 */
function getTransactionByRef(tenantId = 1, referenceCode) {
  const numericTenantId = Number(tenantId) || 1;
  const txn = db.prepare(`
    SELECT t.*,
           ml.name as location_name, ml.address_line1 as location_address, ml.city as location_city,
           mpm.name as payment_mode_name, mpm.mode_code as payment_mode_code, mpm.deposit_type,
           mst.tag_name as status_tag_name, mst.color_hex as status_tag_color
    FROM universal_transactions t
    LEFT JOIN master_locations ml ON ml.id = t.master_location_id AND ml.delete_status = 0
    LEFT JOIN master_payment_modes mpm ON mpm.id = t.master_payment_mode_id AND mpm.delete_status = 0
    LEFT JOIN master_status_tags mst ON mst.tag_code = t.master_status_tag_code AND mst.tenant_id = t.tenant_id AND mst.delete_status = 0
    WHERE t.tenant_id = ? AND t.reference_code = ? AND t.delete_status = 0
  `).get(numericTenantId, referenceCode);

  if (!txn) return null;

  const items = db.prepare(`
    SELECT * FROM universal_transaction_items
    WHERE transaction_id = ?
    ORDER BY id ASC
  `).all(txn.id);

  return {
    ...txn,
    items: items.map(item => ({
      ...item,
      addons_json: item.addons_json ? safeJsonParse(item.addons_json) : null
    })),
    metadata_json: txn.metadata_json ? safeJsonParse(txn.metadata_json) : null
  };
}

/**
 * List transactions with filtering and pagination
 */
function listTransactions(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const {
    transactionType,
    fulfillmentStatus,
    paymentStatus,
    locationId,
    serviceDate,
    search,
    limit = 25,
    offset = 0
  } = options;

  let whereSql = `WHERE t.tenant_id = ? AND t.delete_status = 0`;
  const params = [numericTenantId];

  if (transactionType) {
    whereSql += ` AND t.transaction_type = ?`;
    params.push(transactionType);
  }
  if (fulfillmentStatus) {
    whereSql += ` AND t.fulfillment_status = ?`;
    params.push(fulfillmentStatus);
  }
  if (paymentStatus) {
    whereSql += ` AND t.payment_status = ?`;
    params.push(paymentStatus);
  }
  if (locationId) {
    whereSql += ` AND t.master_location_id = ?`;
    params.push(locationId);
  }
  if (serviceDate) {
    whereSql += ` AND t.service_date = ?`;
    params.push(serviceDate);
  }
  if (search) {
    whereSql += ` AND (t.reference_code LIKE ? OR t.customer_phone LIKE ? OR t.customer_name LIKE ?)`;
    const sTerm = `%${search}%`;
    params.push(sTerm, sTerm, sTerm);
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM universal_transactions t ${whereSql}
  `).get(...params);

  const rows = db.prepare(`
    SELECT t.*,
           ml.name as location_name,
           mpm.name as payment_mode_name,
           mst.tag_name as status_tag_name, mst.color_hex as status_tag_color
    FROM universal_transactions t
    LEFT JOIN master_locations ml ON ml.id = t.master_location_id AND ml.delete_status = 0
    LEFT JOIN master_payment_modes mpm ON mpm.id = t.master_payment_mode_id AND mpm.delete_status = 0
    LEFT JOIN master_status_tags mst ON mst.tag_code = t.master_status_tag_code AND mst.tenant_id = t.tenant_id AND mst.delete_status = 0
    ${whereSql}
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit) || 25, Number(offset) || 0);

  return {
    total: countRow ? countRow.total : 0,
    page: Math.floor((Number(offset) || 0) / (Number(limit) || 25)) + 1,
    limit: Number(limit) || 25,
    data: rows
  };
}

/**
 * Get context bundle for InboxPage.jsx Commerce Side-Drawer
 */
function getCommerceDrawerContext(tenantId = 1, customerPhone) {
  const numericTenantId = Number(tenantId) || 1;
  const cleanPhone = String(customerPhone || "").trim().replace(/\D/g, "");

  if (!cleanPhone) {
    return { success: false, reason: "Phone number required" };
  }

  // 1. Transactions for this phone
  const txns = db.prepare(`
    SELECT t.*, ml.name as location_name, mpm.name as payment_mode_name
    FROM universal_transactions t
    LEFT JOIN master_locations ml ON ml.id = t.master_location_id AND ml.delete_status = 0
    LEFT JOIN master_payment_modes mpm ON mpm.id = t.master_payment_mode_id AND mpm.delete_status = 0
    WHERE t.tenant_id = ? AND t.customer_phone = ? AND t.delete_status = 0
    ORDER BY t.created_at DESC
    LIMIT 5
  `).all(numericTenantId, cleanPhone);

  // 2. Active hold for this phone (by session_ref or customer_phone)
  const activeHold = db.prepare(`
    SELECT h.*, ci.title as item_title
    FROM catalog_inventory_holds h
    LEFT JOIN catalog_items ci ON ci.id = h.catalog_item_id
    WHERE h.tenant_id = ?
      AND (h.session_ref LIKE ? OR h.hold_token LIKE ?)
      AND h.status = 'HELD'
      AND h.expires_at > UTC_TIMESTAMP()
    ORDER BY h.created_at DESC
    LIMIT 1
  `).get(numericTenantId, `%${cleanPhone}%`, `%${cleanPhone}%`);

  // 3. Domain profile terminology
  const profile = db.prepare(`
    SELECT * FROM master_domain_profiles
    WHERE tenant_id = ? AND is_active = 1 AND delete_status = 0
    LIMIT 1
  `).get(numericTenantId);

  // 4. Quick Catalog Items for payment link generation
  const catalogItems = db.prepare(`
    SELECT id, title, base_price, inventory_mode, currency
    FROM catalog_items
    WHERE tenant_id = ? AND is_active = 1 AND is_sold_out = 0 AND delete_status = 0
    ORDER BY sort_order ASC, id ASC
    LIMIT 15
  `).all(numericTenantId);

  // 5. Available published flows
  const availableFlows = db.prepare(`
    SELECT id, name, description, trigger_keywords
    FROM conversation_flows
    WHERE tenant_id = ? AND status = 'PUBLISHED' AND delete_status = 0
    ORDER BY name ASC
    LIMIT 10
  `).all(numericTenantId);

  return {
    success: true,
    customerPhone: cleanPhone,
    transactions: txns,
    latestTransaction: txns[0] || null,
    activeHold: activeHold || null,
    terminology: profile?.terminology_json ? safeJsonParse(profile.terminology_json) : null,
    catalogItems,
    availableFlows
  };
}

/**
 * Generate clean printable HTML GST Tax Invoice / Booking Voucher
 */
function generatePrintableReceiptHtml(transaction, items = [], tenant = {}) {
  const isBooking = transaction.transaction_type === "BOOKING";
  const isAppointment = transaction.transaction_type === "APPOINTMENT";
  const docTitle = isBooking ? "BOOKING VOUCHER & TAX INVOICE" : (isAppointment ? "APPOINTMENT CONFIRMATION" : "GST TAX INVOICE");

  const tenantName = tenant.name || "SARVYA Enterprise Merchant";
  const tenantGstin = tenant.gstin || "27AADCS1234F1Z5";
  const locationName = transaction.location_name || tenantName;
  const locationAddr = transaction.location_address || "Mumbai, Maharashtra, India";

  const rowsHtml = items.map((it, idx) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8; text-align: center;">${idx + 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8;">
        <strong>${escapeHtml(it.item_title)}</strong>
        ${it.variant_label ? `<br><small style="color: #67676B;">Variant: ${escapeHtml(it.variant_label)}</small>` : ""}
        ${it.duration_units > 1 ? `<br><small style="color: #67676B;">Duration: ${it.duration_units} units</small>` : ""}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8; text-align: center;">${it.quantity} ${escapeHtml(it.unit_label || "unit")}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8; text-align: right;">₹${Number(it.unit_price).toLocaleString("en-IN")}</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8; text-align: right;">${it.tax_percent}%</td>
      <td style="padding: 10px; border-bottom: 1px solid #E5E5E8; text-align: right;"><strong>₹${Number(it.line_total).toLocaleString("en-IN")}</strong></td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle} - ${transaction.reference_code}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #171719; margin: 0; padding: 24px; background: #F8F9FA; }
    .invoice-card { max-width: 800px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E5E5E8; box-shadow: 0 4px 16px rgba(0,0,0,0.06); padding: 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2F5219; padding-bottom: 20px; }
    .brand { font-size: 1.5rem; font-weight: 800; color: #2F5219; }
    .doc-type { font-size: 1.1rem; font-weight: 700; color: #3A3A3E; text-align: right; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; font-size: 0.88rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 0.88rem; }
    th { background: #F1F4ED; color: #2F5219; font-weight: 700; padding: 10px; border-bottom: 2px solid #C3D1AC; }
    .totals { margin-top: 20px; margin-left: auto; width: 320px; font-size: 0.9rem; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .grand-total { font-size: 1.15rem; font-weight: 800; color: #2F5219; border-top: 2px solid #2F5219; border-bottom: 2px solid #2F5219; padding: 10px 0; margin-top: 8px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.78rem; }
    .badge-paid { background: #EDF4E6; color: #2F5219; border: 1px solid #C3D1AC; }
    .badge-pending { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
    .print-bar { text-align: center; margin-top: 24px; }
    .btn-print { background: #2F5219; color: #FFFFFF; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    @media print {
      body { background: #FFFFFF; padding: 0; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      .print-bar { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand">${escapeHtml(tenantName)}</div>
        <div style="font-size: 0.82rem; color: #67676B; margin-top: 4px;">
          ${escapeHtml(locationName)}<br>
          ${escapeHtml(locationAddr)}<br>
          GSTIN: <strong>${escapeHtml(tenantGstin)}</strong>
        </div>
      </div>
      <div class="doc-type">
        ${docTitle}
        <div style="font-size: 0.82rem; color: #67676B; margin-top: 4px;">
          Ref: <strong>${escapeHtml(transaction.reference_code)}</strong><br>
          Date: ${new Date(transaction.created_at).toLocaleDateString("en-IN")}<br>
          Status: <span class="badge ${transaction.payment_status === "PAID" ? "badge-paid" : "badge-pending"}">${escapeHtml(transaction.payment_status)}</span>
        </div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <strong style="color: #2F5219;">Billed To:</strong><br>
        <strong>${escapeHtml(transaction.customer_name || "Guest / Customer")}</strong><br>
        Phone: +${escapeHtml(transaction.customer_phone)}<br>
        ${transaction.customer_email ? `Email: ${escapeHtml(transaction.customer_email)}<br>` : ""}
        Channel: ${escapeHtml(transaction.source_channel)}
      </div>
      <div>
        ${isBooking ? `
          <strong style="color: #2F5219;">Stay Details:</strong><br>
          Check-in: <strong>${transaction.service_date || "N/A"}</strong><br>
          Check-out: <strong>${transaction.service_end_date || "N/A"}</strong><br>
        ` : (isAppointment ? `
          <strong style="color: #2F5219;">Appointment Details:</strong><br>
          Date: <strong>${transaction.service_date || "N/A"}</strong><br>
          Time Slot: <strong>${transaction.service_slot_time || "N/A"}</strong><br>
        ` : `
          <strong style="color: #2F5219;">Payment Details:</strong><br>
          Payment Mode: <strong>${escapeHtml(transaction.payment_mode_name || "Online / UPI")}</strong><br>
          Gateway Ref: <strong>${escapeHtml(transaction.payment_gateway_ref || "Direct")}</strong><br>
        `)}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th style="text-align: left;">Item Description</th>
          <th>Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">GST</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Items Subtotal:</span>
        <span>₹${Number(transaction.subtotal_amount).toLocaleString("en-IN")}</span>
      </div>
      ${transaction.addons_amount > 0 ? `
        <div class="totals-row">
          <span>Add-ons / Upgrades:</span>
          <span>₹${Number(transaction.addons_amount).toLocaleString("en-IN")}</span>
        </div>
      ` : ""}
      ${transaction.discount_amount > 0 ? `
        <div class="totals-row" style="color: #059669;">
          <span>Promo Discount:</span>
          <span>-₹${Number(transaction.discount_amount).toLocaleString("en-IN")}</span>
        </div>
      ` : ""}
      <div class="totals-row">
        <span>GST Total (CGST + SGST):</span>
        <span>₹${Number(transaction.tax_amount).toLocaleString("en-IN")}</span>
      </div>
      <div class="totals-row grand-total">
        <span>Grand Total:</span>
        <span>₹${Number(transaction.grand_total).toLocaleString("en-IN")}</span>
      </div>
      <div class="totals-row" style="font-weight: 700; color: #2F5219;">
        <span>Amount Paid:</span>
        <span>₹${Number(transaction.amount_paid).toLocaleString("en-IN")}</span>
      </div>
      ${transaction.balance_due > 0 ? `
        <div class="totals-row" style="font-weight: 700; color: #B45309;">
          <span>Balance Due:</span>
          <span>₹${Number(transaction.balance_due).toLocaleString("en-IN")}</span>
        </div>
      ` : ""}
    </div>

    <div style="margin-top: 36px; padding-top: 16px; border-top: 1px solid #E5E5E8; font-size: 0.76rem; color: #96969C; text-align: center;">
      This is a system-generated electronic GST tax invoice / booking voucher compliant with Indian IT & GST regulations.
    </div>

    <div class="print-bar">
      <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Helper to sync CRM record
 */
function syncCrmRecord(tenantId, { customerPhone, customerName, customerEmail, dealValue, stageKey, crmRecordId }) {
  if (crmRecordId) {
    db.prepare(`
      UPDATE crm_records
      SET deal_value = ?, stage_key = ?, updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
    `).run(dealValue, stageKey, tenantId, crmRecordId);
    return;
  }

  // Look for existing contact by phone
  const existing = db.prepare(`
    SELECT id FROM crm_records
    WHERE tenant_id = ? AND contact_phone = ? AND delete_status = 0
    ORDER BY id DESC LIMIT 1
  `).get(tenantId, customerPhone);

  if (existing) {
    db.prepare(`
      UPDATE crm_records
      SET deal_value = ?, stage_key = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(dealValue, stageKey, existing.id);
  } else {
    // Look up default pipeline
    let pipeline = db.prepare(`
      SELECT id FROM crm_pipelines
      WHERE tenant_id = ? AND active_status = 1 AND delete_status = 0
      LIMIT 1
    `).get(tenantId);

    if (!pipeline) {
      pipeline = db.prepare(`SELECT id FROM crm_pipelines WHERE delete_status = 0 LIMIT 1`).get();
    }

    if (!pipeline) {
      try {
        const pRes = db.prepare(`
          INSERT INTO crm_pipelines (
            tenant_id, name, slug, industry_type, active_status, delete_status, created_at, updated_at
          ) VALUES (?, 'Default Sales Pipeline', 'default-sales', 'GENERAL', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        `).run(tenantId);
        pipeline = { id: pRes.lastInsertRowid };
      } catch (_) {}
    }

    if (pipeline) {
      db.prepare(`
        INSERT INTO crm_records (
          tenant_id, pipeline_id, contact_phone, contact_name, contact_email,
          stage_key, deal_value, custom_attributes, active_status, delete_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
      `).run(
        tenantId,
        pipeline.id,
        customerPhone,
        customerName || null,
        customerEmail || null,
        stageKey || "PROSPECT",
        dealValue
      );
    }
  }
}

function safeJsonParse(val) {
  try {
    return typeof val === "string" ? JSON.parse(val) : val;
  } catch (e) {
    return null;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  createTransactionFromQuote,
  reconcilePaymentSuccess,
  updateFulfillmentStatus,
  recordOfflinePayment,
  getTransactionById,
  getTransactionByRef,
  listTransactions,
  getCommerceDrawerContext,
  generatePrintableReceiptHtml
};
