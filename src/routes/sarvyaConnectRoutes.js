const express = require("express");
const router = express.Router();
const sarvyaConnectController = require("../controllers/sarvyaConnectController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// WhatsApp Sender Channels & WABA Configuration
router.get("/v1/channels/whatsapp/accounts", authenticateToken, sarvyaConnectController.listConnectedAccounts);
router.post("/v1/channels/whatsapp/accounts", authenticateToken, requireAdmin, sarvyaConnectController.connectAccount);
router.post("/v1/channels/whatsapp/accounts/:id/primary", authenticateToken, requireAdmin, sarvyaConnectController.setDefaultAccount);

// Direct 1-to-1 WhatsApp Messaging
router.post("/v1/whatsapp/messages/send", authenticateToken, sarvyaConnectController.sendOneToOneMessage);
router.get("/v1/whatsapp/conversations/:phone/window", authenticateToken, sarvyaConnectController.check24hWindow);

// Usage & Cost Ledger
router.get("/v1/whatsapp/usage-ledger", authenticateToken, sarvyaConnectController.getUsageLedger);

module.exports = router;

