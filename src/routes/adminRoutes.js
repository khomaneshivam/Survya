const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const aiFlowBuilderConfigController = require("../controllers/aiFlowBuilderConfigController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

// User Management (Admin Only)
router.get("/users", authenticateToken, requireAdmin, adminController.listUsers);
router.post("/users", authenticateToken, requireAdmin, adminController.createUser);
router.get("/users/:userId", authenticateToken, requireAdmin, adminController.getUserDetails);
router.put("/users/:userId", authenticateToken, requireAdmin, adminController.updateUser);
router.delete("/users/:userId", authenticateToken, requireAdmin, adminController.deleteUser);
router.post("/users/:userId/status", authenticateToken, requireAdmin, adminController.updateUserStatus);
router.post("/users/:userId/role", authenticateToken, requireAdmin, adminController.updateUserRole);
router.post("/users/:userId/reset-password", authenticateToken, requireAdmin, adminController.resetUserPassword);
router.post("/users/:userId/assign-phone", authenticateToken, requireAdmin, adminController.assignPhoneNumber);
router.post("/users/:userId/claim-history", authenticateToken, requireAdmin, adminController.claimLegacyHistory);
router.get("/unassigned-summary", authenticateToken, requireAdmin, adminController.getUnassignedSummary);
router.post("/impersonate/:userId", authenticateToken, requireAdmin, adminController.impersonateUser);
router.get("/overview", authenticateToken, requireAdmin, adminController.getSystemOverview);

// AI Flow Builder configuration is platform-wide and must never disclose credentials.
router.get("/ai-flow-config", authenticateToken, requireAdmin, aiFlowBuilderConfigController.getAiFlowBuilderConfig);
router.put("/ai-flow-config", authenticateToken, requireAdmin, aiFlowBuilderConfigController.updateAiFlowBuilderConfig);

// Recycle Bin (Universal Soft/Hard Delete Recovery)
router.get("/recycle-bin", authenticateToken, requireAdmin, adminController.listRecycleBin);
router.post("/recycle-bin/:entityType/:id/restore", authenticateToken, requireAdmin, adminController.restoreRecycleBinItem);
router.delete("/recycle-bin/:entityType/:id/hard-delete", authenticateToken, requireAdmin, adminController.hardDeleteRecycleBinItem);

// DPDP Act 2023 Compliance & Privacy Desk
router.post("/compliance/consent", authenticateToken, requireAdmin, adminController.recordComplianceConsent);
router.get("/compliance/export/:phone", authenticateToken, requireAdmin, adminController.exportCompliancePii);
router.post("/compliance/erasure/:phone", authenticateToken, requireAdmin, adminController.executeComplianceErasure);
router.get("/compliance/requests", authenticateToken, requireAdmin, adminController.listComplianceRequests);
router.post("/compliance/requests", authenticateToken, requireAdmin, adminController.createComplianceRequest);
router.patch("/compliance/requests/:id", authenticateToken, requireAdmin, adminController.updateComplianceRequest);
router.get("/compliance/consent-ledger", authenticateToken, requireAdmin, adminController.listConsentLedger);

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

