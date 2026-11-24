const express = require("express");
const router = express.Router();
const inappController = require("../controllers/inappExperienceController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// All routes require authentication and tenant context
router.use(authenticateToken);

// Experiences CRUD & Lifecycle (Admin Only)
router.get("/experiences", requireAdmin, inappController.listExperiences);
router.post("/experiences", requireAdmin, inappController.createExperience);
router.post("/experiences/from-starter", requireAdmin, inappController.createFromStarter);

router.get("/experiences/:id", requireAdmin, inappController.getExperience);
router.put("/experiences/:id", requireAdmin, inappController.updateExperience);
router.delete("/experiences/:id", requireAdmin, inappController.deleteExperience);
router.patch("/experiences/:id/status", requireAdmin, inappController.updateStatus);
router.get("/experiences/:id/qr", requireAdmin, inappController.getQrCode);

// Screens Management (Admin Only)
router.get("/experiences/:id/screens", requireAdmin, inappController.listScreens);
router.post("/experiences/:id/screens", requireAdmin, inappController.createScreen);
router.post("/experiences/:id/screens/reorder", requireAdmin, inappController.reorderScreens);

router.put("/screens/:screenId", requireAdmin, inappController.updateScreen);
router.delete("/screens/:screenId", requireAdmin, inappController.deleteScreen);

// Form Fields Management & Validation (Admin Only)
router.get("/screens/:screenId/fields", requireAdmin, inappController.listFields);
router.post("/screens/:screenId/fields", requireAdmin, inappController.createField);
router.post("/screens/:screenId/fields/reorder", requireAdmin, inappController.reorderFields);

router.put("/fields/:fieldId", requireAdmin, inappController.updateField);
router.delete("/fields/:fieldId", requireAdmin, inappController.deleteField);

router.post("/screens/:screenId/validate", requireAdmin, inappController.validateForm);

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

