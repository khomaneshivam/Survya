const express = require("express");
const router = express.Router();
const settingsController = require("../controllers/settingsController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");

router.get("/settings", authenticateToken, settingsController.getSettings);
router.post("/settings", authenticateToken, requireAdmin, settingsController.updateSettings || settingsController.saveSettings);
router.get("/settings/verify-meta", authenticateToken, requireAdmin, settingsController.handleTestConnection || settingsController.verifyMetaCredentials);
router.post("/settings/test-connection", authenticateToken, requireAdmin, settingsController.handleTestConnection);
router.post("/settings/register-phone", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/settings/register-meta-phone", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/settings/deregister-phone", authenticateToken, requireAdmin, settingsController.deregisterMetaPhone);

module.exports = router;

