const express = require("express");
const router = express.Router();
const templateController = require("../controllers/templateController");
const sarvyaConnectController = require("../controllers/sarvyaConnectController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Meta Template Registry & Auto-Mapping
router.get("/templates", authenticateToken, templateController.listTemplates);
router.post("/templates", authenticateToken, templateController.addTemplate);
router.get("/templates/inspect", authenticateToken, templateController.getTemplate);
router.delete("/templates/:templateId", authenticateToken, templateController.deleteTemplate);

// Custom Template Builder & Sync
router.post("/templates/custom", authenticateToken, sarvyaConnectController.createCustomTemplate);
router.put("/templates/custom/:id", authenticateToken, sarvyaConnectController.updateCustomTemplate);
router.post("/templates/custom/:id/submit", authenticateToken, sarvyaConnectController.submitTemplateToMeta);
router.delete("/templates/custom/:id", authenticateToken, templateController.deleteTemplate);
router.post("/templates/sync-meta", authenticateToken, templateController.syncTemplatesFromMeta);

module.exports = router;

