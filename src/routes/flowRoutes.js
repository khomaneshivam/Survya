const express = require("express");
const router = express.Router();
const flowController = require("../controllers/flowController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// WhatsApp Flows CRUD & Draft Management
router.get("/flows", authenticateToken, flowController.listFlows);
router.get("/flows/meta", authenticateToken, flowController.listMetaFlows);
router.get("/flows/details", authenticateToken, flowController.getMetaFlowDetails);
router.get("/flows/starter-templates", authenticateToken, flowController.getStarterTemplates);
router.post("/flows/draft", authenticateToken, flowController.createFlowDraft);
router.put("/flows/draft/:flowId", authenticateToken, flowController.updateFlowDraft);
router.post("/flows/publish", authenticateToken, requireAdmin, flowController.publishFlow);
router.delete("/flows/:flowId", authenticateToken, requireAdmin, flowController.deleteFlow);
router.post("/flows/tokens", authenticateToken, flowController.createFlowToken);
router.post("/flows/validate", authenticateToken, flowController.validateFlowJson);
router.post("/flows/sync", authenticateToken, requireAdmin, flowController.syncFlowsFromMeta);
router.post("/flows/send", authenticateToken, flowController.sendFlowToRecipient);

// Flow Cryptography & Data Exchange
router.get("/flows/crypto/config", authenticateToken, flowController.getCryptoConfig);
router.post("/flows/crypto/generate-keys", authenticateToken, requireAdmin, flowController.generateCryptoKeys);
router.post("/flows/exchange", flowController.handleDataExchange);

module.exports = router;

