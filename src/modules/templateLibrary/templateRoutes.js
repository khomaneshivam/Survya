/**
 * Template Library Routes
 * Mounted at /api/v1/template-library
 */

const express = require("express");
const router = express.Router();
const templateController = require("./templateController");
const { authenticateToken, requireAdmin } = require("../../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

// Catalog Discovery & Inspection
router.get("/admin/all", requireAdmin, (req, res) => templateController.listAllForAdmin(req, res));
router.get("/", (req, res) => templateController.listCatalog(req, res));
router.get("/:id", (req, res) => templateController.getTemplate(req, res));

// Authoring & Version Releases (Admin / Publisher)
router.post("/", requireAdmin, (req, res) => templateController.createTemplate(req, res));
router.post("/:id/versions", requireAdmin, (req, res) => templateController.createVersion(req, res));

// Client Installation
router.post("/:id/install", (req, res) => templateController.installTemplate(req, res));

// Installation sub-routes alias
router.get("/installations/list", (req, res) => templateController.listInstallations(req, res));
router.get("/installations/:id", (req, res) => templateController.getInstallation(req, res));
router.patch("/installations/:id/config", (req, res) => templateController.updateConfig(req, res));
router.post("/installations/:id/validate", (req, res) => templateController.validateInstallation(req, res));
router.post("/installations/:id/activate", (req, res) => templateController.activateInstallation(req, res));
router.get("/installations/:id/upgrade", (req, res) => templateController.checkUpgrade(req, res));
router.post("/installations/:id/upgrade", (req, res) => templateController.upgradeInstallation(req, res));

module.exports = router;

