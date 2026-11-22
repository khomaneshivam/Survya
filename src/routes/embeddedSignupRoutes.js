const express = require("express");
const router = express.Router();
const metaEmbeddedSignupService = require("../services/metaEmbeddedSignupService");
const { authenticateToken } = require("../middleware/authMiddleware");

// All embedded signup endpoints require authentication
router.use(authenticateToken);

/**
 * GET /config
 * Returns parameters for Meta FB SDK & Embedded Signup v4
 */
router.get("/config", async (req, res) => {
  try {
    const config = metaEmbeddedSignupService.getConfig({ tenantId: req.user.tenant_id });
    return res.status(200).json({ success: true, data: config });
  } catch (err) {
    console.error("[EmbeddedSignupRoutes] /config error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /exchange
 * Exchanges OAuth code, encrypts token, subscribes webhooks and registers line
 */
router.post("/exchange", async (req, res) => {
  try {
    const {
      code,
      wabaId,
      phoneNumberId,
      displayName,
      phoneNumber,
      coexistenceMode,
      isSimulation
    } = req.body || {};

    const result = await metaEmbeddedSignupService.exchangeCode({
      code,
      wabaId,
      phoneNumberId,
      displayName,
      phoneNumber,
      coexistenceMode: Boolean(coexistenceMode),
      tenantId: req.user.tenant_id,
      userId: req.user.id,
      isSimulation: Boolean(isSimulation)
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("[EmbeddedSignupRoutes] /exchange error:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /test-coexistence
 * Validates coexistence status and readiness checklist for a phone line
 */
router.post("/test-coexistence", async (req, res) => {
  try {
    const { phoneNumberId } = req.body || {};
    if (!phoneNumberId) {
      return res.status(400).json({ success: false, message: "phoneNumberId is required." });
    }

    const result = metaEmbeddedSignupService.testCoexistence({
      phoneNumberId,
      tenantId: req.user.tenant_id
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("[EmbeddedSignupRoutes] /test-coexistence error:", err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;

