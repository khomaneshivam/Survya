const express = require("express");
const router = express.Router();
const payoutController = require("../controllers/payoutController");
const { authenticateToken, optionalAuth, requireWorkspaceAdmin } = require("../middleware/authMiddleware");
const { publicLimiter } = require("../middleware/rateLimiter");

// Merchant Payment Configuration
router.get("/v1/entities/:id/payment-config", authenticateToken, payoutController.getPaymentConfig);
router.get("/entities/:id/payment-config", authenticateToken, payoutController.getPaymentConfig);
router.put("/v1/entities/:id/payment-config", authenticateToken, requireWorkspaceAdmin, payoutController.savePaymentConfig);
router.put("/entities/:id/payment-config", authenticateToken, requireWorkspaceAdmin, payoutController.savePaymentConfig);

// Pay-In Checkout Sessions, Capture & Webhooks
router.post("/v1/entities/:id/create-checkout", optionalAuth, publicLimiter, payoutController.createCheckoutSession);
router.post("/entities/:id/create-checkout", optionalAuth, publicLimiter, payoutController.createCheckoutSession);
router.post("/v1/orders/:orderNumber/capture-payment", authenticateToken, requireWorkspaceAdmin, payoutController.capturePayment);
router.post("/orders/:orderNumber/capture-payment", authenticateToken, requireWorkspaceAdmin, payoutController.capturePayment);
router.post("/v1/webhooks/payments/razorpay", payoutController.handleRazorpayWebhook);
router.post("/webhooks/payments/razorpay", payoutController.handleRazorpayWebhook);

// Bank Beneficiaries & Penny-Drop Verification
router.get("/v1/entities/:id/payouts/beneficiaries", authenticateToken, payoutController.listBeneficiaries);
router.get("/entities/:id/payouts/beneficiaries", authenticateToken, payoutController.listBeneficiaries);
router.post("/v1/entities/:id/payouts/beneficiaries", authenticateToken, requireWorkspaceAdmin, payoutController.addBeneficiary);
router.post("/entities/:id/payouts/beneficiaries", authenticateToken, requireWorkspaceAdmin, payoutController.addBeneficiary);
router.post("/v1/payouts/beneficiaries/:id/verify-penny-drop", authenticateToken, requireWorkspaceAdmin, payoutController.verifyPennyDrop);
router.post("/payouts/beneficiaries/:id/verify-penny-drop", authenticateToken, requireWorkspaceAdmin, payoutController.verifyPennyDrop);

// Payout Summary & Ledger Settlements
router.get("/v1/entities/:id/payouts/summary", authenticateToken, payoutController.getPayoutSummary);
router.get("/entities/:id/payouts/summary", authenticateToken, payoutController.getPayoutSummary);
router.post("/v1/entities/:id/payouts/request-instant", authenticateToken, requireWorkspaceAdmin, payoutController.triggerInstantPayout);
router.post("/entities/:id/payouts/request-instant", authenticateToken, requireWorkspaceAdmin, payoutController.triggerInstantPayout);
router.get("/v1/entities/:id/payouts/ledger", authenticateToken, payoutController.getPayoutLedger);
router.get("/entities/:id/payouts/ledger", authenticateToken, payoutController.getPayoutLedger);

module.exports = router;

