const express = require("express");
const router = express.Router();
const inappController = require("../controllers/inappExperienceController");
const { authenticateToken } = require("../middleware/authMiddleware");

// All routes require authentication and tenant context
router.use(authenticateToken);

// Experiences CRUD & Lifecycle
router.get("/experiences", inappController.listExperiences);
router.post("/experiences", inappController.createExperience);
router.post("/experiences/from-starter", inappController.createFromStarter);

router.get("/experiences/:id", inappController.getExperience);
router.put("/experiences/:id", inappController.updateExperience);
router.delete("/experiences/:id", inappController.deleteExperience);
router.patch("/experiences/:id/status", inappController.updateStatus);
router.get("/experiences/:id/qr", inappController.getQrCode);

// Screens Management
router.get("/experiences/:id/screens", inappController.listScreens);
router.post("/experiences/:id/screens", inappController.createScreen);
router.post("/experiences/:id/screens/reorder", inappController.reorderScreens);

router.put("/screens/:screenId", inappController.updateScreen);
router.delete("/screens/:screenId", inappController.deleteScreen);

// Form Fields Management & Validation
router.get("/screens/:screenId/fields", inappController.listFields);
router.post("/screens/:screenId/fields", inappController.createField);
router.post("/screens/:screenId/fields/reorder", inappController.reorderFields);

router.put("/fields/:fieldId", inappController.updateField);
router.delete("/fields/:fieldId", inappController.deleteField);

router.post("/screens/:screenId/validate", inappController.validateForm);

// Agent Rate Negotiations Management
const inappNegotiationService = require("../services/inapp/inappNegotiationService");
router.get("/negotiations", (req, res) => {
  try {
    const list = inappNegotiationService.listNegotiations(req.tenantId || req.user?.tenant_id || 1, req.query);
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/negotiations/:id/agent-action", (req, res) => {
  try {
    const result = inappNegotiationService.agentAction(
      req.tenantId || req.user?.tenant_id || 1,
      req.params.id,
      { ...req.body, userId: req.user?.name || req.user?.id || "agent" }
    );
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// Agent Call Requests Management
const inappCallService = require("../services/inapp/inappCallService");
router.get("/calls", (req, res) => {
  try {
    const list = inappCallService.listCalls(req.tenantId || req.user?.tenant_id || 1, req.query);
    return res.status(200).json({ success: true, data: list });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch("/calls/:id", (req, res) => {
  try {
    const result = inappCallService.updateCallStatus(
      req.tenantId || req.user?.tenant_id || 1,
      req.params.id,
      { ...req.body, userId: req.user?.name || req.user?.id || "agent" }
    );
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

module.exports = router;

