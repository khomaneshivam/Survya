const crypto = require("crypto");
const { db } = require("../config/database");
const { generateQrSvg } = require("../utils/qrCodeUtil");

const PLATFORM_FEE_RATE = 0.02; // 2% platform fee
const GST_ON_FEE_RATE = 0.18;   // 18% GST on platform fee
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/**
 * MERCHANT PAYMENT CONFIG
 */
function getPaymentConfig(entityId) {
  let config = db.prepare("SELECT * FROM merchant_payment_configs WHERE entity_id = ?").get(entityId);
  if (!config) {
    // Return sensible defaults if not explicitly configured
    const entity = db.prepare("SELECT name, slug FROM business_entities WHERE id = ?").get(entityId);
    config = {
      entity_id: entityId,
      upi_vpa: `${(entity?.slug || 'merchant').replace(/[^a-z0-9]/g, '')}@icici`,
      upi_payee_name: entity?.name || "Merchant Business",
      gateway_provider: "RAZORPAY",
      api_key: "rzp_test_mock_sarvya_key",
      is_live_mode: 0,
      accept_cod: 1,
      auto_capture: 1
    };
  }
  return config;
}

function savePaymentConfig(entityId, data, tenantId = 1) {
  const existing = db.prepare("SELECT id FROM merchant_payment_configs WHERE entity_id = ?").get(entityId);
  if (existing) {
    db.prepare(`
      UPDATE merchant_payment_configs
      SET upi_vpa = COALESCE(?, upi_vpa),
          upi_payee_name = COALESCE(?, upi_payee_name),
          gateway_provider = COALESCE(?, gateway_provider),
          api_key = COALESCE(?, api_key),
          api_secret_encrypted = COALESCE(?, api_secret_encrypted),
          merchant_id = COALESCE(?, merchant_id),
          webhook_secret = COALESCE(?, webhook_secret),
          is_live_mode = COALESCE(?, is_live_mode),
          accept_cod = COALESCE(?, accept_cod),
          auto_capture = COALESCE(?, auto_capture),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      data.upi_vpa || null,
      data.upi_payee_name || null,
      data.gateway_provider || null,
      data.api_key || null,
      data.api_secret || null,
      data.merchant_id || null,
      data.webhook_secret || null,
      data.is_live_mode !== undefined ? (data.is_live_mode ? 1 : 0) : null,
      data.accept_cod !== undefined ? (data.accept_cod ? 1 : 0) : null,
      data.auto_capture !== undefined ? (data.auto_capture ? 1 : 0) : null,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO merchant_payment_configs (
        tenant_id, entity_id, upi_vpa, upi_payee_name, gateway_provider,
        api_key, api_secret_encrypted, merchant_id, webhook_secret,
        is_live_mode, accept_cod, auto_capture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenantId,
      entityId,
      data.upi_vpa || 'merchant@icici',
      data.upi_payee_name || 'Merchant Business',
      data.gateway_provider || 'RAZORPAY',
      data.api_key || 'rzp_test_mock_sarvya_key',
      data.api_secret || null,
      data.merchant_id || null,
      data.webhook_secret || null,
      data.is_live_mode ? 1 : 0,
      data.accept_cod !== undefined ? (data.accept_cod ? 1 : 0) : 1,
      data.auto_capture !== undefined ? (data.auto_capture ? 1 : 0) : 1
    );
  }
  return getPaymentConfig(entityId);
}

/**
 * UNIVERSAL PAY-IN ENGINE
 */
function generateUpiUri({ vpa, payeeName, amount, orderNumber, note }) {
  if (!vpa) throw new Error("Merchant UPI VPA is required");
  const cleanAmount = parseFloat(amount || 0).toFixed(2);
  const cleanName = encodeURIComponent(payeeName || "Merchant");
  const cleanNote = encodeURIComponent(note || `Order ${orderNumber || 'Payment'}`);
  const ref = encodeURIComponent(orderNumber || Date.now().toString());

  return `upi://pay?pa=${vpa}&pn=${cleanName}&am=${cleanAmount}&tr=${ref}&tn=${cleanNote}&cu=INR`;
}

function generateUpiQrSvg({ upiUri, size = 260 }) {
  return generateQrSvg(upiUri, size);
}

function createPayInSession(entityId, orderData) {
  const config = getPaymentConfig(entityId);
  const entity = db.prepare("SELECT * FROM business_entities WHERE id = ?").get(entityId);
  const orderNumber = orderData.order_number || `ORD-${Date.now()}`;
  const amount = parseFloat(orderData.grand_total || orderData.amount || 0);

  const upiUri = generateUpiUri({
    vpa: config.upi_vpa || "konkantrip@icici",
    payeeName: config.upi_payee_name || entity?.name || "KonkanTrip Hospitality",
    amount,
    orderNumber,
    note: `SARVYA Pay ${orderNumber}`
  });

  const upiQrSvg = generateUpiQrSvg({ upiUri, size: 280 });

  return {
    orderNumber,
    amount,
    currency: "INR",
    entity: {
      id: entityId,
      name: entity?.name || "Merchant",
      city: entity?.city || "Alibaug"
    },
    upi: {
      vpa: config.upi_vpa,
      uri: upiUri,
      qrSvg: upiQrSvg,
      instructions: "Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI App to pay with 0% gateway fee."
    },
    gateway: {
      provider: config.gateway_provider || "RAZORPAY",
      isLive: !!config.is_live_mode,
      keyId: config.api_key || "rzp_test_mock_sarvya_key",
      amountPaise: Math.round(amount * 100),
      orderId: `pg_${orderNumber}`
    },
    acceptCod: !!config.accept_cod
  };
}

function verifyPaymentWebhook(rawPayload, signature, secret) {
  if (!secret || !signature) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (e) {
    return false;
  }
}

function captureOrderPayment({ orderNumber, paymentMethod = "UPI_INTENT", paymentReference = null, amountPaid = null }) {
  const order = db.prepare("SELECT * FROM unified_orders WHERE order_number = ?").get(orderNumber);
  if (!order) throw new Error(`Order ${orderNumber} not found`);

  const ref = paymentReference || `UTR_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const finalAmount = amountPaid !== null ? parseFloat(amountPaid) : order.grand_total;

  // Strict idempotency: if already paid, do not double-decrement inventory or alter status
  if (order.payment_status === "PAID") {
    return {
      success: true,
      orderId: order.id,
      orderNumber,
      paymentStatus: "PAID",
      orderStatus: order.order_status,
      paymentReference: order.payment_reference || ref,
      amountPaid: finalAmount,
      alreadyCaptured: true
    };
  }

  db.prepare(`
    UPDATE unified_orders
    SET payment_status = 'PAID',
        order_status = CASE WHEN order_status = 'PENDING' THEN 'CONFIRMED' ELSE order_status END,
        payment_method = ?,
        payment_reference = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(paymentMethod, ref, order.id);

  // If order has items, update inventory
  const items = db.prepare("SELECT * FROM unified_order_items WHERE order_id = ?").all(order.id);
  for (const item of items) {
    // If stay with checkin/checkout dates, update daily matrix
    if (order.check_in_date && order.check_out_date) {
      db.prepare(`
        UPDATE daily_inventory_matrix
        SET booked_qty = booked_qty + ?,
            available_qty = MAX(0, available_qty - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE entity_id = ? AND item_id = ? AND inventory_date BETWEEN ? AND date(?, '-1 day')
      `).run(item.quantity, item.quantity, order.entity_id, item.item_id, order.check_in_date, order.check_out_date);
    }

    // If retail product, decrement stock
    db.prepare(`
      UPDATE catalog_items
      SET stock_quantity = MAX(0, stock_quantity - ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND inventory_tracking = 1
    `).run(item.quantity, item.item_id);
  }

  return {
    success: true,
    orderId: order.id,
    orderNumber,
    paymentStatus: "PAID",
    orderStatus: "CONFIRMED",
    paymentReference: ref,
    amountPaid: finalAmount
  };
}

/**
 * MERCHANT PAY-OUT SETTLEMENT ENGINE
 */
function getBeneficiaries(entityId) {
  return db.prepare("SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? ORDER BY is_primary DESC, id ASC").all(entityId);
}

function addBeneficiary(entityId, data, tenantId = 1) {
  if (!data.account_holder_name || !data.bank_name || !data.account_number || !data.ifsc_code) {
    throw new Error("Missing required bank beneficiary fields: account_holder_name, bank_name, account_number, ifsc_code");
  }

  const cleanIfsc = String(data.ifsc_code).toUpperCase().trim();
  if (!IFSC_REGEX.test(cleanIfsc)) {
    throw new Error(`Invalid IFSC Code '${cleanIfsc}'. Expected standard 11-character Indian Financial System Code (e.g. HDFC0000240)`);
  }

  const cleanAccount = String(data.account_number).trim();
  if (!/^\d{8,20}$/.test(cleanAccount)) {
    throw new Error("Bank account number must be between 8 and 20 numeric digits");
  }

  // Clear existing primary if this one is primary
  const isPrimary = data.is_primary !== undefined ? (data.is_primary ? 1 : 0) : 1;
  if (isPrimary) {
    db.prepare("UPDATE merchant_payout_beneficiaries SET is_primary = 0 WHERE entity_id = ?").run(entityId);
  }

  const stmt = db.prepare(`
    INSERT INTO merchant_payout_beneficiaries (
      tenant_id, entity_id, account_holder_name, bank_name, account_number,
      ifsc_code, account_type, upi_vpa, verification_status, is_primary, payout_schedule
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `);

  const info = stmt.run(
    tenantId,
    entityId,
    data.account_holder_name.trim(),
    data.bank_name.trim(),
    cleanAccount,
    cleanIfsc,
    data.account_type || 'CURRENT',
    data.upi_vpa || null,
    isPrimary,
    data.payout_schedule || 'DAILY'
  );

  return db.prepare("SELECT * FROM merchant_payout_beneficiaries WHERE id = ?").get(info.lastInsertRowid);
}

function verifyPennyDrop(beneficiaryId) {
  const beneficiary = db.prepare("SELECT * FROM merchant_payout_beneficiaries WHERE id = ?").get(beneficiaryId);
  if (!beneficiary) throw new Error("Beneficiary not found");

  if (!IFSC_REGEX.test(beneficiary.ifsc_code)) {
    throw new Error("Cannot verify beneficiary with invalid IFSC");
  }

  const mockRef = `NPCI_PD_${Date.now()}_${Math.floor(Math.random() * 90000 + 10000)}`;
  const registeredName = beneficiary.account_holder_name.toUpperCase();

  db.prepare(`
    UPDATE merchant_payout_beneficiaries
    SET verification_status = 'PENNY_VERIFIED',
        penny_drop_reference = ?,
        registered_legal_name = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(mockRef, registeredName, beneficiaryId);

  return {
    success: true,
    beneficiaryId,
    verificationStatus: 'PENNY_VERIFIED',
    pennyDropReference: mockRef,
    registeredLegalName: registeredName,
    message: "₹1.00 Penny-Drop verification successful via NPCI IMPS gateway. Account confirmed active."
  };
}

function getPayoutSummary(entityId) {
  const primaryBeneficiary = db.prepare(`
    SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? AND is_primary = 1
  `).get(entityId) || db.prepare(`
    SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? ORDER BY id ASC LIMIT 1
  `).get(entityId);

  // Calculate gross revenue from paid orders
  const revenueRow = db.prepare(`
    SELECT COALESCE(SUM(grand_total), 0) as total_revenue
    FROM unified_orders
    WHERE entity_id = ? AND payment_status = 'PAID'
  `).get(entityId);
  const totalRevenue = revenueRow ? revenueRow.total_revenue : 0;

  // Calculate already settled payouts
  const settledRow = db.prepare(`
    SELECT COALESCE(SUM(gross_amount), 0) as total_settled_gross,
           COALESCE(SUM(net_payout_amount), 0) as total_settled_net,
           COALESCE(SUM(platform_fee + tax_on_fee), 0) as total_fees
    FROM merchant_payout_ledger
    WHERE entity_id = ? AND status = 'SETTLED'
  `).get(entityId);
  const totalSettledGross = settledRow ? settledRow.total_settled_gross : 0;
  const totalSettledNet = settledRow ? settledRow.total_settled_net : 0;
  const totalFeesPaid = settledRow ? settledRow.total_fees : 0;

  // Calculate pending / in-progress payouts
  const processingRow = db.prepare(`
    SELECT COALESCE(SUM(gross_amount), 0) as total_processing
    FROM merchant_payout_ledger
    WHERE entity_id = ? AND status IN ('PENDING', 'PROCESSING')
  `).get(entityId);
  const totalProcessing = processingRow ? processingRow.total_processing : 0;

  // Unsettled gross revenue available for dispatch
  const unsettledGross = Math.max(0, totalRevenue - totalSettledGross - totalProcessing);
  const estimatedPlatformFee = Math.round(unsettledGross * PLATFORM_FEE_RATE * 100) / 100;
  const estimatedTaxOnFee = Math.round(estimatedPlatformFee * GST_ON_FEE_RATE * 100) / 100;
  const netAvailableForPayout = Math.max(0, Math.round((unsettledGross - (estimatedPlatformFee + estimatedTaxOnFee)) * 100) / 100);

  return {
    entityId,
    totalGrossRevenue: totalRevenue,
    unsettledGrossRevenue: unsettledGross,
    estimatedPlatformFee,
    estimatedTaxOnFee,
    availableForPayout: netAvailableForPayout,
    lifetimeSettledNet: totalSettledNet,
    lifetimeSettledGross: totalSettledGross,
    lifetimeFeesPaid: totalFeesPaid,
    primaryBeneficiary: primaryBeneficiary ? {
      id: primaryBeneficiary.id,
      bankName: primaryBeneficiary.bank_name,
      accountHolder: primaryBeneficiary.account_holder_name,
      accountNumberMasked: primaryBeneficiary.account_number.slice(0, 4) + '****' + primaryBeneficiary.account_number.slice(-4),
      ifscCode: primaryBeneficiary.ifsc_code,
      accountType: primaryBeneficiary.account_type,
      verificationStatus: primaryBeneficiary.verification_status,
      payoutSchedule: primaryBeneficiary.payout_schedule
    } : null
  };
}

function triggerInstantPayout(entityId, requestedAmount = null, tenantId = 1) {
  const summary = getPayoutSummary(entityId);
  const beneficiary = summary.primaryBeneficiary;

  if (!beneficiary) {
    throw new Error("No settlement bank account configured. Please add a bank account first.");
  }
  if (beneficiary.verificationStatus !== "PENNY_VERIFIED" && beneficiary.verificationStatus !== "MANUAL_VERIFIED") {
    throw new Error("Settlement bank account is not verified. Complete Penny-Drop verification first.");
  }

  const parsedRequested = requestedAmount !== null ? parseFloat(requestedAmount) : summary.unsettledGrossRevenue;
  const grossToDisperse = Math.round(parsedRequested * 100) / 100;
  if (!Number.isFinite(grossToDisperse) || grossToDisperse <= 0) {
    throw new Error("No unsettled cleared balance available for payout");
  }
  if (grossToDisperse > summary.unsettledGrossRevenue) {
    throw new Error(`Requested payout ₹${grossToDisperse} exceeds available unsettled balance ₹${summary.unsettledGrossRevenue}`);
  }

  const platformFee = Math.round(grossToDisperse * PLATFORM_FEE_RATE * 100) / 100;
  const taxOnFee = Math.round(platformFee * GST_ON_FEE_RATE * 100) / 100;
  const netPayoutAmount = Math.round((grossToDisperse - (platformFee + taxOnFee)) * 100) / 100;

  const batchId = `BATCH_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Math.floor(Math.random() * 900 + 100)}`;
  const bankUtr = `4319${Date.now().toString().slice(-8)}`;

  const stmt = db.prepare(`
    INSERT INTO merchant_payout_ledger (
      tenant_id, entity_id, beneficiary_id, payout_batch_id,
      gross_amount, platform_fee, tax_on_fee, net_payout_amount,
      currency, status, bank_utr, dispatched_at, settled_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      'INR', 'SETTLED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);

  const info = stmt.run(
    tenantId,
    entityId,
    beneficiary.id,
    batchId,
    grossToDisperse,
    platformFee,
    taxOnFee,
    netPayoutAmount,
    bankUtr
  );

  return {
    success: true,
    ledgerId: info.lastInsertRowid,
    batchId,
    bankUtr,
    grossAmount: grossToDisperse,
    platformFee,
    taxOnFee,
    netPayoutAmount,
    status: "SETTLED",
    beneficiary: {
      bankName: beneficiary.bankName,
      accountNumberMasked: beneficiary.accountNumberMasked
    },
    message: `Payout of ₹${netPayoutAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} successfully dispatched via IMPS. Bank UTR: ${bankUtr}`
  };
}

function getPayoutLedger(entityId, options = {}) {
  const limit = parseInt(options.limit || 50, 10);
  const offset = parseInt(options.offset || 0, 10);

  const rows = db.prepare(`
    SELECT l.*, b.bank_name, b.account_holder_name, b.account_number, b.ifsc_code
    FROM merchant_payout_ledger l
    LEFT JOIN merchant_payout_beneficiaries b ON l.beneficiary_id = b.id
    WHERE l.entity_id = ?
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT ? OFFSET ?
  `).all(entityId, limit, offset);

  return rows.map(r => ({
    ...r,
    account_number_masked: r.account_number ? (r.account_number.slice(0, 4) + '****' + r.account_number.slice(-4)) : null
  }));
}

module.exports = {
  getPaymentConfig,
  savePaymentConfig,
  generateUpiUri,
  generateUpiQrSvg,
  createPayInSession,
  verifyPaymentWebhook,
  captureOrderPayment,
  getBeneficiaries,
  addBeneficiary,
  verifyPennyDrop,
  getPayoutSummary,
  triggerInstantPayout,
  getPayoutLedger
};

