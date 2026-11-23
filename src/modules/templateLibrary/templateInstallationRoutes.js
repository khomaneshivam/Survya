/**
 * Template Installations Routes
 * Mounted at /api/v1/template-installations
 */

const express = require("express");
const router = express.Router();
const templateController = require("./templateController");
const { authenticateToken } = require("../../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

router.get("/", (req, res) => templateController.listInstallations(req, res));
router.get("/:id", (req, res) => templateController.getInstallation(req, res));
router.patch("/:id/config", (req, res) => templateController.updateConfig(req, res));
router.post("/:id/validate", (req, res) => templateController.validateInstallation(req, res));
router.post("/:id/activate", (req, res) => templateController.activateInstallation(req, res));
router.get("/:id/upgrade", (req, res) => templateController.checkUpgrade(req, res));
router.post("/:id/upgrade", (req, res) => templateController.upgradeInstallation(req, res));

module.exports = router;

