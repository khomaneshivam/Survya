const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhookController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// Public Meta Webhook Handshake & Ingestion
router.get("/webhook", webhookController.handleVerification);
router.post("/webhook", webhookController.handleIncomingEvent);
router.get("/v1/webhook", webhookController.handleVerification);
router.post("/v1/webhook", webhookController.handleIncomingEvent);

// Webhook Configuration & Diagnostics (Admin Only)
router.get("/webhook/config", authenticateToken, requireAdmin, webhookController.getConfig);
router.post("/webhook/test-handshake", authenticateToken, requireAdmin, webhookController.testHandshake);
router.post("/webhook/tunnel/restart", authenticateToken, requireAdmin, webhookController.restartTunnel);
router.post("/webhook/generate-token", authenticateToken, requireAdmin, webhookController.generateNewToken);
router.post("/webhook/token", authenticateToken, requireAdmin, webhookController.saveToken);
router.post("/webhook/test-event", authenticateToken, requireAdmin, webhookController.simulateTestReply);
router.post("/webhook/simulate-reply", authenticateToken, requireAdmin, webhookController.simulateTestReply);

module.exports = router;

