const paymentPayoutService = require("../services/paymentPayoutService");
const unifiedOrderService = require("../services/unifiedOrderService");
const catalogService = require("../services/catalogService");
const { db } = require("../config/database");
const { isPlatformAdmin } = require("../middleware/authMiddleware");

function checkEntityAccess(entityId, user) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  const entity = catalogService.getEntityById(entityId);
  if (!entity) return false;
  const userTenant = Number(user.tenant_id || 1);
  return Number(entity.tenant_id || 1) === userTenant;
}

async function getPaymentConfig(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's payment configuration." });
    }
    const config = paymentPayoutService.getPaymentConfig(req.params.id);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function savePaymentConfig(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's payment configuration." });
    }
    const tenantId = req.user?.tenant_id || 1;
    const config = paymentPayoutService.savePaymentConfig(req.params.id, req.body, tenantId);
    res.json({ success: true, config });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function createCheckoutSession(req, res) {
  try {
    const entity = catalogService.getEntityById(req.params.id);
    if (!entity || Number(entity.delete_status || 0) === 1 || Number(entity.active_status ?? 1) === 0 || String(entity.status || "ACTIVE").toUpperCase() !== "ACTIVE") {
      return res.status(404).json({ success: false, message: "Active business entity not found." });
    }
    if (req.user && !checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's checkout." });
    }
    const session = paymentPayoutService.createPayInSession(req.params.id, req.body);
    res.json({ success: true, session });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function capturePayment(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required to capture payments." });
    }
    const { orderNumber } = req.params;
    const order = db.prepare("SELECT id, entity_id, tenant_id FROM unified_orders WHERE order_number = ?").get(orderNumber);
    if (!order) {
      return res.status(404).json({ success: false, message: `Order ${orderNumber} not found.` });
    }
    if (!checkEntityAccess(order.entity_id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to capture payment for this order." });
    }
    const { paymentMethod, paymentReference, amountPaid } = req.body;
    const result = paymentPayoutService.captureOrderPayment({
      orderNumber,
      paymentMethod,
      paymentReference,
      amountPaid
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function handleRazorpayWebhook(req, res) {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const event = String(req.body?.event || "").trim().toLowerCase();
    const paymentEntity = req.body?.payload?.payment?.entity;
    const orderRef = paymentEntity?.notes?.order_number || paymentEntity?.description || req.body?.order_number || null;

    let order = null;
    if (orderRef) {
      order = db.prepare("SELECT id, tenant_id, entity_id, grand_total, currency FROM unified_orders WHERE order_number = ?").get(orderRef);
    }

    const candidateSecrets = [];
    if (order) {
      try {
        const cfgs = db.prepare(`
          SELECT webhook_secret FROM merchant_payment_configs
          WHERE tenant_id = ? AND entity_id = ? AND webhook_secret IS NOT NULL AND webhook_secret != ''
        `).all(order.tenant_id, order.entity_id);
        for (const row of cfgs) {
          if (row?.webhook_secret) candidateSecrets.push(String(row.webhook_secret).trim());
        }
      } catch (_) {}
    }
    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      candidateSecrets.push(String(process.env.RAZORPAY_WEBHOOK_SECRET).trim());
    }

    if (!signature || candidateSecrets.length === 0) {
      return res.status(401).json({ success: false, message: "Missing webhook signature or verification secret." });
    }
    const rawPayload = req.rawBody ? Buffer.from(req.rawBody) : Buffer.from(JSON.stringify(req.body));

    const isValid = candidateSecrets.some(secret => paymentPayoutService.verifyPaymentWebhook(rawPayload, signature, secret));
    if (!isValid) {
      console.warn("[Payment Webhook] Invalid signature rejected");
      return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }

    if (event === "payment.captured" || event === "order.paid") {
      if (orderRef && order) {
        const receivedCurrency = String(paymentEntity?.currency || order.currency || "INR").toUpperCase();
        const expectedCurrency = String(order.currency || "INR").toUpperCase();
        if (receivedCurrency !== expectedCurrency) {
          return res.status(400).json({ success: false, message: `Currency mismatch: expected ${expectedCurrency}, got ${receivedCurrency}` });
        }
        const paidAmount = paymentEntity?.amount != null ? Number(paymentEntity.amount) / 100 : null;
        if (paidAmount !== null && (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount + 0.01 < Number(order.grand_total || 0))) {
          return res.status(400).json({ success: false, message: "Underpayment or invalid amount rejected." });
        }

        paymentPayoutService.captureOrderPayment({
          orderNumber: orderRef,
          paymentMethod: "RAZORPAY",
          paymentReference: paymentEntity?.id,
          amountPaid: paidAmount
        });
      }
    }

    res.json({ status: "ok", event });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function listBeneficiaries(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's bank beneficiaries." });
    }
    const beneficiaries = paymentPayoutService.getBeneficiaries(req.params.id);
    res.json({ success: true, beneficiaries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function addBeneficiary(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to register beneficiaries for this entity." });
    }
    const tenantId = req.user?.tenant_id || 1;
    const beneficiary = paymentPayoutService.addBeneficiary(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, beneficiary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function verifyPennyDrop(req, res) {
  try {
    const beneficiary = db.prepare("SELECT id, entity_id FROM merchant_payout_beneficiaries WHERE id = ?").get(req.params.id);
    if (!beneficiary) {
      return res.status(404).json({ success: false, message: "Beneficiary not found." });
    }
    if (!checkEntityAccess(beneficiary.entity_id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to verify this beneficiary." });
    }
    return res.status(410).json({
      success: false,
      code: "MERCHANT_DIRECT_MODE",
      message: "Simulated ₹1 Penny-Drop KYC verification has been retired. Configure your own gateway keys or UPI VPA in Merchant-Direct Payment Mode."
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

async function getPayoutSummary(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's payout ledger." });
    }
    const summary = paymentPayoutService.getPayoutSummary(req.params.id);
    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function triggerInstantPayout(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to disburse payouts for this entity." });
    }
    return res.status(410).json({
      success: false,
      code: "MERCHANT_DIRECT_MODE",
      message: "Simulated pooled IMPS payout disbursement has been retired. Customer payments settle directly to your merchant account."
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
}

async function getPayoutLedger(req, res) {
  try {
    if (!checkEntityAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Unauthorized access to this entity's payout ledger." });
    }
    const ledger = paymentPayoutService.getPayoutLedger(req.params.id, req.query);
    res.json({ success: true, ledger });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getPaymentConfig,
  savePaymentConfig,
  createCheckoutSession,
  capturePayment,
  handleRazorpayWebhook,
  listBeneficiaries,
  addBeneficiary,
  verifyPennyDrop,
  getPayoutSummary,
  triggerInstantPayout,
  getPayoutLedger
};

