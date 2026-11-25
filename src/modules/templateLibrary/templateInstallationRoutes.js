/**
 * Template Installations Routes
 * Mounted at /api/v1/template-installations
 */

const express = require("express");
const router = express.Router();
const templateController = require("./templateController");
const { authenticateToken, requireWorkspaceAdmin } = require("../../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

router.get("/", (req, res) => templateController.listInstallations(req, res));
router.get("/:id", (req, res) => templateController.getInstallation(req, res));
router.patch("/:id/config", requireWorkspaceAdmin, (req, res) => templateController.updateConfig(req, res));
router.post("/:id/validate", (req, res) => templateController.validateInstallation(req, res));
router.post("/:id/activate", requireWorkspaceAdmin, (req, res) => templateController.activateInstallation(req, res));
router.get("/:id/upgrade", (req, res) => templateController.checkUpgrade(req, res));
router.post("/:id/upgrade", requireWorkspaceAdmin, (req, res) => templateController.upgradeInstallation(req, res));

module.exports = router;

