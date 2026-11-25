const express = require("express");
const router = express.Router();
const inappController = require("../controllers/inappExperienceController");
const { authenticateToken, requireWorkspaceAdmin } = require("../middleware/authMiddleware");

// All routes require authentication and tenant context
router.use(authenticateToken);

// Experiences CRUD & Lifecycle (Workspace Owner / Platform Admin)
router.get("/experiences", requireWorkspaceAdmin, inappController.listExperiences);
router.post("/experiences", requireWorkspaceAdmin, inappController.createExperience);
router.post("/experiences/from-starter", requireWorkspaceAdmin, inappController.createFromStarter);

router.get("/experiences/:id", requireWorkspaceAdmin, inappController.getExperience);
router.put("/experiences/:id", requireWorkspaceAdmin, inappController.updateExperience);
router.delete("/experiences/:id", requireWorkspaceAdmin, inappController.deleteExperience);
router.patch("/experiences/:id/status", requireWorkspaceAdmin, inappController.updateStatus);
router.get("/experiences/:id/qr", requireWorkspaceAdmin, inappController.getQrCode);

// Screens Management (Workspace Owner / Platform Admin)
router.get("/experiences/:id/screens", requireWorkspaceAdmin, inappController.listScreens);
router.post("/experiences/:id/screens", requireWorkspaceAdmin, inappController.createScreen);
router.post("/experiences/:id/screens/reorder", requireWorkspaceAdmin, inappController.reorderScreens);

router.put("/screens/:screenId", requireWorkspaceAdmin, inappController.updateScreen);
router.delete("/screens/:screenId", requireWorkspaceAdmin, inappController.deleteScreen);

// Form Fields Management & Validation (Workspace Owner / Platform Admin)
router.get("/screens/:screenId/fields", requireWorkspaceAdmin, inappController.listFields);
router.post("/screens/:screenId/fields", requireWorkspaceAdmin, inappController.createField);
router.post("/screens/:screenId/fields/reorder", requireWorkspaceAdmin, inappController.reorderFields);

router.put("/fields/:fieldId", requireWorkspaceAdmin, inappController.updateField);
router.delete("/fields/:fieldId", requireWorkspaceAdmin, inappController.deleteField);

router.post("/screens/:screenId/validate", requireWorkspaceAdmin, inappController.validateForm);

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

