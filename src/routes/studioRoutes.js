const express = require("express");
const router = express.Router();
const studioController = require("../controllers/studio/studioController");
const { authenticateToken, requireWorkspaceAdmin } = require("../middleware/authMiddleware");

router.use(authenticateToken, requireWorkspaceAdmin);

router.get("/overview", studioController.getOverview);
router.get("/components", studioController.getComponents);
router.get("/experiences", studioController.listExperiences);
router.post("/experiences/guided", studioController.createGuided);
router.post("/experiences/:id/share-link", studioController.generateShareLink);
router.get("/share-links", studioController.listShareLinks);
router.get("/execution-history", studioController.listExecutionHistory);

// Layer 3: Extensible Industry Experience Library & Isolated Try Demo
router.get("/blueprints", studioController.listBlueprints);
router.post("/blueprints/:key/demo/start", studioController.startBlueprintDemo);
router.post("/blueprints/:key/demo/navigate", studioController.navigateBlueprintDemo);
router.post("/blueprints/:key/install", studioController.installBlueprint);

// Layer 4: Business Goal Outcomes & Durable Email Notifications
router.get("/goals", studioController.listGoals);
router.get("/email-settings", studioController.getEmailSettings);
router.put("/email-settings", studioController.updateEmailSettings);
router.get("/email-logs", studioController.listEmailLogs);
router.post("/email-logs/:id/retry", studioController.retryEmailLog);

// Layer 5 & 6: Governance, Publishing Versioning, Rollback & Analytics
router.get("/experiences/:id/validate", studioController.validateExperience);
router.post("/experiences/:id/approve", studioController.approveExperience);
router.post("/experiences/:id/publish", studioController.publishExperience);
router.post("/experiences/:id/rollback", studioController.rollbackExperience);
router.get("/experiences/:id/versions", studioController.listVersions);
router.get("/audit-logs", studioController.listAuditLogs);
router.get("/analytics", studioController.getAnalytics);
router.get("/domain-access", studioController.getDomainAccess);
router.post("/domain-access/activate", studioController.activateDomain);

module.exports = router;
