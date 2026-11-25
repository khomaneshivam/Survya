const express = require("express");
const router = express.Router();
const billingService = require("../services/billingService");
const { authenticateToken, requireWorkspaceAdmin, optionalAuth } = require("../middleware/authMiddleware");
const { db } = require("../config/database");

/**
 * GET /plans
 * List all available subscription tiers
 */
router.get("/plans", (req, res) => {
  try {
    const plans = billingService.getPlans();
    return res.status(200).json({ success: true, data: plans });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /webhook/razorpay
 * Razorpay payment webhook endpoint (HMAC signature verification)
 */
router.post("/webhook/razorpay", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const result = await billingService.handleRazorpayWebhook(req.body, signature, req.rawBody, { requireSignature: true });
    return res.status(200).json(result);
  } catch (err) {
    console.error("[Razorpay Webhook Error]:", err.message);
    const code = /signature|secret/i.test(err.message) ? 401 : 400;
    return res.status(code).json({ success: false, message: err.message });
  }
});

// Authenticated billing routes
router.use(authenticateToken);

/**
 * GET /subscription
 * Returns active subscription status, usage counters and quotas
 */
router.get("/subscription", (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const snap = billingService.getTenantEntitlementSnapshot(tenantId);

    if (!snap) {
      return res.status(404).json({ success: false, message: "Workspace not found." });
    }

    const latestSub = db.prepare(`
      SELECT id, plan_code, billing_cycle, invoice_number, period_start, period_end, status
      FROM tenant_subscriptions
      WHERE tenant_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(tenantId);

    return res.status(200).json({
      success: true,
      data: {
        tenantId: snap.tenantId,
        tenantName: snap.tenantName,
        planCode: snap.planCode,
        subscriptionStatus: snap.subscriptionStatus,
        trialEndsAt: snap.trialEndsAt,
        trialExpired: snap.isTrialExpired,
        gstin: snap.gstin,
        billingAddress: snap.billingAddress,
        usage: {
          wabaLinesUsed: snap.wabaLinesUsed,
          wabaLinesLimit: snap.quotaWabaLines,
          messagesUsed: snap.messagesUsed,
          messagesLimit: snap.quotaMonthlyMessages
        },
        latestSubscription: latestSub || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /checkout
 * Prepares Razorpay order with SAC 998314 18% GST breakdown
 */
router.post("/checkout", (req, res) => {
  try {
    const { planCode, billingCycle, customerStateCode, gstin, billingAddress } = req.body || {};
    const result = billingService.createCheckout({
      tenantId: req.user.tenant_id,
      planCode,
      billingCycle,
      customerStateCode,
      gstin,
      billingAddress
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /verify-payment
 * Verifies Razorpay Checkout signature on the server (HMAC-SHA256) and activates subscription
 */
router.post("/verify-payment", requireWorkspaceAdmin, async (req, res) => {
  try {
    const {
      planCode,
      billingCycle,
      customerStateCode,
      gstin,
      billingAddress,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body || {};

    const result = await billingService.verifyRazorpayCheckoutPayment({
      tenantId: req.user.tenant_id,
      planCode,
      billingCycle,
      customerStateCode,
      gstin,
      billingAddress,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.statusCode || (/signature/i.test(err.message) ? 401 : 400);
    return res.status(status).json({
      success: false,
      code: err.code || undefined,
      message: err.message
    });
  }
});

/**
 * GET /invoices
 * Lists past GST invoices for current tenant
 */
router.get("/invoices", (req, res) => {
  try {
    const invoices = billingService.getInvoices(req.user.tenant_id);
    return res.status(200).json({ success: true, data: invoices });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /invoices/:id/html
 * Renders or downloads printable GST tax invoice
 */
router.get("/invoices/:id/html", (req, res) => {
  try {
    const html = billingService.getInvoiceHtml(req.params.id, req.user.tenant_id);
    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    return res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;

