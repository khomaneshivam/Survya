const express = require("express");
const router = express.Router();
const agencyController = require("../controllers/agencyController");
const { authenticateToken, requireWorkspaceAdmin } = require("../middleware/authMiddleware");

// All agency white-label endpoints require authentication
router.use(authenticateToken);

router.get("/workspaces", agencyController.listWorkspaces);
router.post("/workspaces", requireWorkspaceAdmin, agencyController.createWorkspace);
router.post("/switch-workspace", agencyController.switchWorkspace);
router.put("/branding", requireWorkspaceAdmin, agencyController.updateBranding);

module.exports = router;

