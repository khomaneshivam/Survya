const crypto = require("crypto");
const { db } = require("../config/database");
const { generateQrSvg } = require("../utils/qrCodeUtil");
const cryptoUtil = require("../utils/cryptoUtil");

const PLATFORM_FEE_RATE = 0; // Merchant-Direct Mode (0% platform escrow fee)
const GST_ON_FEE_RATE = 0;   // Merchant-Direct Mode
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function maskAccountNumber(accountNumber) {
  if (!accountNumber) return null;
  try {
    const raw = cryptoUtil.decrypt(accountNumber);
    if (raw.length <= 4) return "****";
    if (raw.length <= 8) return "****" + raw.slice(-4);
    return raw.slice(0, 4) + "****" + raw.slice(-4);
  } catch (e) {
    return "****" + String(accountNumber).slice(-4);
  }
}

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
      payment_mode: "MERCHANT_DIRECT_GATEWAY",
      is_live_mode: 0,
      accept_cod: 1,
      auto_capture: 1
    };
  }
  return {
    ...config,
    payment_mode: config.payment_mode || "MERCHANT_DIRECT_GATEWAY"
  };
}

function savePaymentConfig(entityId, data, tenantId = 1) {
  const existing = db.prepare("SELECT id FROM merchant_payment_configs WHERE entity_id = ?").get(entityId);
  const paymentMode = data.payment_mode || "MERCHANT_DIRECT_GATEWAY";

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
          payment_mode = COALESCE(?, payment_mode),
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
      data.api_secret ? cryptoUtil.encrypt(data.api_secret) : null,
      data.merchant_id || null,
      data.webhook_secret || null,
      paymentMode,
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
        payment_mode, is_live_mode, accept_cod, auto_capture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenantId,
      entityId,
      data.upi_vpa || 'merchant@icici',
      data.upi_payee_name || 'Merchant Business',
      data.gateway_provider || 'RAZORPAY',
      data.api_key || 'rzp_test_mock_sarvya_key',
      data.api_secret ? cryptoUtil.encrypt(data.api_secret) : null,
      data.merchant_id || null,
      data.webhook_secret || null,
      paymentMode,
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
  const fallbackVpa = `${(entity?.slug || "merchant").replace(/[^a-z0-9]/g, "")}@upi`;

  const upiUri = generateUpiUri({
    vpa: config.upi_vpa || fallbackVpa,
    payeeName: config.upi_payee_name || entity?.name || "Merchant",
    amount,
    orderNumber,
    note: `${entity?.name || "Survya"} Pay ${orderNumber}`
  });

  const upiQrSvg = generateUpiQrSvg({ upiUri, size: 280 });

  return {
    orderNumber,
    amount,
    currency: "INR",
    entity: {
      id: entityId,
      name: entity?.name || "Merchant",
      city: entity?.city || ""
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
  const ref = paymentReference || `UTR_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;

  db.prepare("START TRANSACTION").run();
  try {
    const order = db.prepare("SELECT * FROM unified_orders WHERE order_number = ? FOR UPDATE").get(orderNumber);
    if (!order) {
      db.prepare("ROLLBACK").run();
      throw new Error(`Order ${orderNumber} not found`);
    }

    const finalAmount = amountPaid !== null ? parseFloat(amountPaid) : order.grand_total;

    // Strict idempotency under FOR UPDATE lock: if already paid, do not double-decrement inventory or alter status
    if (order.payment_status === "PAID") {
      db.prepare("COMMIT").run();
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

    // If order has items, validate and update inventory atomically inside the locked transaction
    const items = db.prepare("SELECT * FROM unified_order_items WHERE order_id = ?").all(order.id);
    for (const item of items) {
      const lockedCatalogItem = db.prepare(`
        SELECT id, title, stock_qty, stock_quantity, track_inventory, inventory_tracking
        FROM catalog_items
        WHERE id = ?
        FOR UPDATE
      `).get(item.item_id);

      const tracksInv = lockedCatalogItem && (Number(lockedCatalogItem.track_inventory || 0) === 1 || Number(lockedCatalogItem.inventory_tracking || 0) === 1);
      if (tracksInv) {
        const availableStock = Number(lockedCatalogItem.stock_qty ?? lockedCatalogItem.stock_quantity ?? 0);
        if (availableStock < Number(item.quantity || 1)) {
          const stockErr = new Error(`Insufficient stock for '${lockedCatalogItem.title || item.item_title || item.item_id}'`);
          stockErr.statusCode = 409;
          throw stockErr;
        }
      }

      if (order.check_in_date && order.check_out_date) {
        db.prepare(`
          UPDATE daily_inventory_matrix
          SET booked_qty = COALESCE(booked_qty, 0) + ?,
              available_qty = GREATEST(0, COALESCE(available_qty, 0) - ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE entity_id = ? AND item_id = ?
            AND inventory_date >= ? AND inventory_date <= DATE_SUB(?, INTERVAL 1 DAY)
        `).run(item.quantity, item.quantity, order.entity_id, item.item_id, order.check_in_date, order.check_out_date);
      }

      if (tracksInv) {
        db.prepare(`
          UPDATE catalog_items
          SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - ?),
              stock_qty = GREATEST(0, COALESCE(stock_qty, stock_quantity, 0) - ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(item.quantity, item.quantity, item.item_id);
      }
    }

    db.prepare("COMMIT").run();
    return {
      success: true,
      orderId: order.id,
      orderNumber,
      paymentStatus: "PAID",
      orderStatus: order.order_status === "PENDING" ? "CONFIRMED" : order.order_status,
      paymentReference: ref,
      amountPaid: finalAmount
    };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }
}

/**
 * MERCHANT PAY-OUT SETTLEMENT ENGINE
 */
function getBeneficiaries(entityId) {
  const rows = db.prepare("SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? ORDER BY is_primary DESC, id ASC").all(entityId);
  return rows.map(b => {
    const masked = maskAccountNumber(b.account_number);
    return {
      ...b,
      account_number_masked: masked,
      accountNumberMasked: masked,
      account_number: masked
    };
  });
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

  const encryptedAccount = cryptoUtil.encrypt(cleanAccount);

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
    encryptedAccount,
    cleanIfsc,
    data.account_type || 'CURRENT',
    data.upi_vpa || null,
    isPrimary,
    data.payout_schedule || 'DAILY'
  );

  const created = db.prepare("SELECT * FROM merchant_payout_beneficiaries WHERE id = ?").get(info.lastInsertRowid);
  return {
    ...created,
    account_number_masked: maskAccountNumber(created.account_number),
    account_number: maskAccountNumber(created.account_number)
  };
}

function verifyPennyDrop(beneficiaryId) {
  const err = new Error("Simulated NPCI Penny-Drop verification is retired. Survya operates in Merchant-Direct Payment Mode.");
  err.statusCode = 410;
  err.code = "MERCHANT_DIRECT_MODE";
  throw err;
}

function getPayoutSummary(entityId) {
  const primaryBeneficiary = db.prepare(`
    SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? AND is_primary = 1
  `).get(entityId) || db.prepare(`
    SELECT * FROM merchant_payout_beneficiaries WHERE entity_id = ? ORDER BY id ASC LIMIT 1
  `).get(entityId);

  const revenueRow = db.prepare(`
    SELECT COUNT(*) as paid_count,
           COALESCE(SUM(grand_total), 0) as total_revenue
    FROM unified_orders
    WHERE entity_id = ? AND payment_status IN ('PAID', 'SETTLED')
  `).get(entityId);
  const totalRevenue = Number(revenueRow?.total_revenue || 0);
  const paidCount = Number(revenueRow?.paid_count || 0);

  const pendingRow = db.prepare(`
    SELECT COALESCE(SUM(grand_total), 0) as pending_revenue
    FROM unified_orders
    WHERE entity_id = ?
      AND payment_status IN ('UNPAID', 'PENDING', 'PARTIALLY_PAID')
      AND order_status != 'CANCELLED'
  `).get(entityId);
  const pendingCollections = Number(pendingRow?.pending_revenue || 0);

  return {
    entityId,
    paymentMode: "MERCHANT_DIRECT",
    platformFeeRate: 0,
    totalGrossRevenue: totalRevenue,
    totalSettledInr: totalRevenue,
    pendingCollectionsInr: pendingCollections,
    merchantDirectTransactionsCount: paidCount,
    unsettledGrossRevenue: 0,
    estimatedPlatformFee: 0,
    estimatedTaxOnFee: 0,
    availableForPayout: 0,
    lifetimeSettledNet: totalRevenue,
    lifetimeSettledGross: totalRevenue,
    lifetimeFeesPaid: 0,
    primaryBeneficiary: primaryBeneficiary ? {
      id: primaryBeneficiary.id,
      bankName: primaryBeneficiary.bank_name,
      accountHolder: primaryBeneficiary.account_holder_name,
      accountNumberMasked: maskAccountNumber(primaryBeneficiary.account_number),
      ifscCode: primaryBeneficiary.ifsc_code,
      accountType: primaryBeneficiary.account_type,
      verificationStatus: primaryBeneficiary.verification_status,
      payoutSchedule: primaryBeneficiary.payout_schedule
    } : null
  };
}

function triggerInstantPayout(entityId, requestedAmount = null, tenantId = 1) {
  const err = new Error("Simulated pooled instant IMPS payouts are retired. Customer payments settle directly via your merchant UPI VPA or Razorpay account.");
  err.statusCode = 410;
  err.code = "MERCHANT_DIRECT_MODE";
  throw err;
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
    account_number_masked: maskAccountNumber(r.account_number),
    account_number: maskAccountNumber(r.account_number)
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

