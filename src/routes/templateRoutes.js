const express = require("express");
const router = express.Router();
const templateController = require("../controllers/templateController");
const sarvyaConnectController = require("../controllers/sarvyaConnectController");
const { authenticateToken } = require("../middleware/authMiddleware");

// Meta Template Registry & Auto-Mapping
router.get("/templates", authenticateToken, templateController.getTemplates);
router.post("/templates", authenticateToken, templateController.addTemplate);
router.get("/templates/inspect", authenticateToken, templateController.inspectMetaTemplate);
router.post("/templates/auto-map", authenticateToken, templateController.autoMapVariables);
router.delete("/templates/:name", authenticateToken, templateController.deleteTemplate);

// Custom Template Builder & Sync
router.post("/templates/custom", authenticateToken, sarvyaConnectController.createCustomTemplate);
router.put("/templates/custom/:id", authenticateToken, sarvyaConnectController.updateCustomTemplate);
router.post("/templates/custom/:id/submit", authenticateToken, sarvyaConnectController.submitCustomTemplateToMeta);
router.delete("/templates/custom/:id", authenticateToken, sarvyaConnectController.deleteCustomTemplate);
router.post("/templates/sync-meta", authenticateToken, sarvyaConnectController.syncMetaTemplates);

module.exports = router;

