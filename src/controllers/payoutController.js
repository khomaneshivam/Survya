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
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret || !signature) {
      return res.status(401).json({ success: false, message: "Missing webhook signature or verification secret." });
    }
    const rawPayload = req.rawBody ? Buffer.from(req.rawBody) : JSON.stringify(req.body);

    const isValid = paymentPayoutService.verifyPaymentWebhook(rawPayload, signature, webhookSecret);
    if (!isValid) {
      console.warn("[Payment Webhook] Invalid signature rejected");
      return res.status(401).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = req.body.event;
    if (event === "payment.captured" || event === "order.paid") {
      const paymentEntity = req.body.payload?.payment?.entity;
      const orderRef = paymentEntity?.notes?.order_number || paymentEntity?.description;
      if (orderRef) {
        paymentPayoutService.captureOrderPayment({
          orderNumber: orderRef,
          paymentMethod: "RAZORPAY",
          paymentReference: paymentEntity.id,
          amountPaid: (paymentEntity.amount || 0) / 100
        });
      }
    }

    res.json({ status: "ok" });
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
    const result = paymentPayoutService.verifyPennyDrop(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
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
    const tenantId = req.user?.tenant_id || 1;
    const { amount } = req.body;
    const result = paymentPayoutService.triggerInstantPayout(req.params.id, amount, tenantId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
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

