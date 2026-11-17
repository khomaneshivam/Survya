const express = require("express");
const router = express.Router();
const webhookController = require("../controllers/webhookController");
const { authenticateToken } = require("../middleware/authMiddleware");

router.get("/inbox/replies", authenticateToken, webhookController.getReplies);
router.post("/inbox/reply", authenticateToken, webhookController.sendManualReply);
router.post("/inbox/read/:id", authenticateToken, webhookController.markReplyAsRead);
router.post("/inbox/read-all", authenticateToken, webhookController.markAllRepliesAsRead);
router.delete("/inbox/conversation/:phone", authenticateToken, webhookController.deleteConversation);
router.get("/inbox/media/:id", authenticateToken, webhookController.getInboundMedia);
router.get("/inbox/bot-status/:phone", authenticateToken, webhookController.getBotStatus);
router.post("/inbox/bot-status/:phone", authenticateToken, webhookController.setBotStatus);

module.exports = router;

