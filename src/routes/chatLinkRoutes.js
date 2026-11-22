const express = require("express");
const router = express.Router();
const chatLinkController = require("../controllers/chatLinkController");
const { authenticateToken } = require("../middleware/authMiddleware");
const { publicLimiter } = require("../middleware/rateLimiter");

// Authenticated Chat Links Management
router.get("/v1/chat-links", authenticateToken, chatLinkController.listLinks);
router.get("/chat-links", authenticateToken, chatLinkController.listLinks);
router.post("/v1/chat-links", authenticateToken, chatLinkController.createLink);
router.post("/chat-links", authenticateToken, chatLinkController.createLink);
router.post("/v1/chat-links/bulk-generate", authenticateToken, chatLinkController.bulkGenerateLinks);
router.post("/chat-links/bulk-generate", authenticateToken, chatLinkController.bulkGenerateLinks);
router.post("/v1/chat-links/bulk", authenticateToken, chatLinkController.bulkGenerateLinks);
router.post("/chat-links/bulk", authenticateToken, chatLinkController.bulkGenerateLinks);
router.get("/v1/chat-links/:id", authenticateToken, chatLinkController.getLink);
router.get("/chat-links/:id", authenticateToken, chatLinkController.getLink);
router.put("/v1/chat-links/:id", authenticateToken, chatLinkController.updateLink);
router.put("/chat-links/:id", authenticateToken, chatLinkController.updateLink);
router.patch("/v1/chat-links/:id/status", authenticateToken, chatLinkController.toggleLinkStatus);
router.patch("/chat-links/:id/status", authenticateToken, chatLinkController.toggleLinkStatus);
router.delete("/v1/chat-links/:id", authenticateToken, chatLinkController.deleteLink);
router.delete("/chat-links/:id", authenticateToken, chatLinkController.deleteLink);
router.get("/v1/chat-links/:id/qr", authenticateToken, chatLinkController.getQrCode);
router.get("/chat-links/:id/qr", authenticateToken, chatLinkController.getQrCode);

// Public Customer In-App Endpoints (No Auth, Protected with publicLimiter)
router.get("/v1/public/chat-links/:slug/gallery", publicLimiter, chatLinkController.getPublicChatLinkGallery);
router.get("/public/chat-links/:slug/gallery", publicLimiter, chatLinkController.getPublicChatLinkGallery);
router.get("/v1/public/chat-links/:slug", publicLimiter, chatLinkController.getPublicLinkBySlug);
router.get("/public/chat-links/:slug", publicLimiter, chatLinkController.getPublicLinkBySlug);
router.post("/v1/public/chat-links/:slug/start-chat", publicLimiter, chatLinkController.startPublicChat);
router.post("/public/chat-links/:slug/start-chat", publicLimiter, chatLinkController.startPublicChat);
router.get("/v1/public/chat-links/:slug/messages", publicLimiter, chatLinkController.getPublicChatMessages);
router.get("/public/chat-links/:slug/messages", publicLimiter, chatLinkController.getPublicChatMessages);
router.post("/v1/public/chat-links/:slug/send-message", publicLimiter, chatLinkController.sendPublicChatMessage);
router.post("/public/chat-links/:slug/send-message", publicLimiter, chatLinkController.sendPublicChatMessage);
router.post("/v1/public/chat-links/:slug/messages", publicLimiter, chatLinkController.sendPublicChatMessage);
router.post("/public/chat-links/:slug/messages", publicLimiter, chatLinkController.sendPublicChatMessage);
router.get("/v1/public/chat-links/:slug/qr", publicLimiter, chatLinkController.getQrCode);
router.get("/public/chat-links/:slug/qr", publicLimiter, chatLinkController.getQrCode);

module.exports = router;

