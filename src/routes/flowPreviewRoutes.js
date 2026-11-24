const express = require("express");
const flowPreviewController = require("../controllers/flowPreviewController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const { publicLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// A preview snapshot can only be created, inspected, or revoked by an
// authenticated administrator in the selected tenant.
router.post(
  "/flows/conversation-flows/:flowId/preview-links",
  authenticateToken,
  requireAdmin,
  flowPreviewController.createPreviewLink
);
router.get(
  "/flows/conversation-flows/:flowId/preview-links",
  authenticateToken,
  requireAdmin,
  flowPreviewController.listPreviewLinks
);
router.post(
  "/flow-preview-links/:previewLinkId/revoke",
  authenticateToken,
  requireAdmin,
  flowPreviewController.revokePreviewLink
);
router.delete(
  "/flow-preview-links/:previewLinkId",
  authenticateToken,
  requireAdmin,
  flowPreviewController.revokePreviewLink
);

// Public token access is deliberately limited to a sanitized, frozen graph
// and a pure local interpreter. These endpoints never receive a WhatsApp
// phone number and never invoke the production flow engine.
router.get("/public/flow-previews/:token", publicLimiter, flowPreviewController.getPublicPreview);
router.post("/public/flow-previews/:token/simulate", publicLimiter, flowPreviewController.simulatePublicPreview);

module.exports = router;
