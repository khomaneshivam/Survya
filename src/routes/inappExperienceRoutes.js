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

module.exports = router;
