/**
 * Template Library Routes
 * Mounted at /api/v1/template-library
 */

const express = require("express");
const router = express.Router();
const templateController = require("./templateController");
const { authenticateToken, requireAdmin, requireWorkspaceAdmin } = require("../../middleware/authMiddleware");

// All routes require authentication
router.use(authenticateToken);

// Catalog Discovery & Inspection
router.get("/admin/all", requireAdmin, (req, res) => templateController.listAllForAdmin(req, res));
router.get("/resources", (req, res) => templateController.getResources(req, res));
router.get("/", (req, res) => templateController.listCatalog(req, res));
router.get("/:id", (req, res) => templateController.getTemplate(req, res));

// Authoring & Version Releases (Platform Admin for PUBLIC; Workspace Admin for PRIVATE)
router.post("/", requireWorkspaceAdmin, (req, res) => templateController.createTemplate(req, res));
router.post("/:id/versions", requireWorkspaceAdmin, (req, res) => templateController.createVersion(req, res));

// Client Installation (Workspace Admins only for state mutations)
router.post("/:id/install", requireWorkspaceAdmin, (req, res) => templateController.installTemplate(req, res));

// Installation sub-routes alias
router.get("/installations/list", (req, res) => templateController.listInstallations(req, res));
router.get("/installations/:id", (req, res) => templateController.getInstallation(req, res));
router.patch("/installations/:id/config", requireWorkspaceAdmin, (req, res) => templateController.updateConfig(req, res));
router.post("/installations/:id/validate", (req, res) => templateController.validateInstallation(req, res));
router.post("/installations/:id/activate", requireWorkspaceAdmin, (req, res) => templateController.activateInstallation(req, res));
router.get("/installations/:id/upgrade", (req, res) => templateController.checkUpgrade(req, res));
router.post("/installations/:id/upgrade", requireWorkspaceAdmin, (req, res) => templateController.upgradeInstallation(req, res));

module.exports = router;

