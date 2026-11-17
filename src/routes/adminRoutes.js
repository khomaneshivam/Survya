const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// User Management (Admin Only)
router.get("/users", authenticateToken, requireAdmin, adminController.listUsers);
router.get("/users/:userId", authenticateToken, requireAdmin, adminController.getUserDetails);
router.post("/users/:userId/status", authenticateToken, requireAdmin, adminController.updateUserStatus);
router.post("/users/:userId/role", authenticateToken, requireAdmin, adminController.updateUserRole);
router.post("/users/:userId/reset-password", authenticateToken, requireAdmin, adminController.resetUserPassword);
router.post("/users/:userId/assign-phone", authenticateToken, requireAdmin, adminController.assignPhoneNumber);
router.post("/users/:userId/claim-history", authenticateToken, requireAdmin, adminController.claimLegacyHistory);
router.get("/unassigned-summary", authenticateToken, requireAdmin, adminController.getUnassignedSummary);
router.post("/impersonate/:userId", authenticateToken, requireAdmin, adminController.impersonateUser);
router.get("/overview", authenticateToken, requireAdmin, adminController.getSystemOverview);

// WhatsApp Phone Number Registry (Protected & Admin Only for mutations)
router.get("/phone-numbers", authenticateToken, adminController.listPhoneNumbers);
router.post("/phone-numbers", authenticateToken, requireAdmin, adminController.registerPhoneNumber);
router.post("/phone-numbers/register-meta", authenticateToken, requireAdmin, adminController.registerMetaPhoneNumber);
router.post("/phone-numbers/:id/register-meta", authenticateToken, requireAdmin, adminController.registerMetaPhoneNumber);
router.post("/phone-numbers/:id/deregister-meta", authenticateToken, requireAdmin, adminController.deregisterMetaPhoneNumber);
router.post("/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);
router.post("/phone-numbers/:id/token", authenticateToken, requireAdmin, adminController.updatePhoneNumberToken);
router.post("/phone-numbers/:id/test", authenticateToken, requireAdmin, adminController.testPhoneNumber);
router.delete("/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);

// Webhook Management & Diagnostics (Admin Only)
router.get("/webhooks/config", authenticateToken, requireAdmin, adminController.getWebhookConfig);
router.post("/webhooks/generate-token", authenticateToken, requireAdmin, adminController.generateNewVerifyToken);
router.post("/webhooks/save-token", authenticateToken, requireAdmin, adminController.saveWebhookToken);
router.post("/webhooks/test-handshake", authenticateToken, requireAdmin, adminController.testWebhookHandshake);
router.post("/webhooks/url-override", authenticateToken, requireAdmin, adminController.updateWebhookUrlOverride);

// Audit & Backup
router.get("/audit-logs", authenticateToken, requireAdmin, adminController.getAuditLogs);
router.post("/backup", authenticateToken, requireAdmin, adminController.exportBackup);

module.exports = router;

