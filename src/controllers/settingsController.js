const crypto = require("crypto");
const { getAllSettings, setSetting, getSetting, db } = require("../config/database");
const config = require("../config/env");
const {
  testConnection,
  registerPhoneNumberWithMeta,
  deregisterPhoneNumberWithMeta,
  getTemplateDetails
} = require("../services/metaWhatsAppService");
const billingService = require("../services/billingService");
const { isPlatformAdmin } = require("../middleware/authMiddleware");

/**
 * Masks sensitive secret strings for secure API presentation
 */
function maskSecret(val) {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.length <= 8) return "••••••••";
  return trimmed.substring(0, 4) + "••••••••" + trimmed.substring(trimmed.length - 4);
}

const SENSITIVE_KEYS = new Set([
  "WHATSAPP_API_TOKEN",
  "META_APP_SECRET",
  "WEBHOOK_VERIFY_TOKEN",
  "JWT_SECRET",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "RAZORPAY_WEBHOOK_SECRET",
  "FLOWS_PRIVATE_KEY",
  "FLOWS_PASSPHRASE"
]);

/**
 * Get current settings with sensitive credentials redacted
 */
async function getSettings(req, res) {
  try {
    const raw = getAllSettings();
    const safeSettings = { ...raw };

    // Redact all sensitive secrets
    for (const key of SENSITIVE_KEYS) {
      if (safeSettings[key]) {
        safeSettings[key] = maskSecret(safeSettings[key]);
      }
    }
    const platformAdmin = isPlatformAdmin(req.user);
    const tenantId = Number(req.user?.tenant_id || 1);
    if (!platformAdmin && tenantId !== 1) {
      delete safeSettings.WHATSAPP_PHONE_NUMBER_ID;
      delete safeSettings.WHATSAPP_BUSINESS_ACCOUNT_ID;
      delete safeSettings.WHATSAPP_WABA_ID;
    }

    return res.status(200).json({
      success: true,
      data: safeSettings,
      settings: safeSettings
    });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update settings (Restricted to Administrator for credentials)
 */
async function updateSettings(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Authentication required." });
    }

    const {
      WHATSAPP_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID,
      WHATSAPP_WABA_ID,
      META_APP_SECRET,
      WEBHOOK_VERIFY_TOKEN,
      DEFAULT_COUNTRY_CODE,
      BROADCAST_DELAY_MS,
      WHATSAPP_TEMPLATE_ID,
      DEFAULT_TEMPLATE_NAME,
      DEFAULT_TEMPLATE_LANG,
      APP_TIMEZONE,
      META_MARKETING_RATE_INR,
      META_UTILITY_RATE_INR
    } = req.body || {};

    const credentialKeysProvided = [
      WHATSAPP_API_TOKEN,
      WHATSAPP_PHONE_NUMBER_ID,
      WHATSAPP_BUSINESS_ACCOUNT_ID,
      WHATSAPP_WABA_ID,
      META_APP_SECRET,
      WEBHOOK_VERIFY_TOKEN
    ].some(v => v !== undefined);

    // Only Master/Platform administrators are permitted to alter platform-wide settings
    if (!isPlatformAdmin(user)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Platform settings can only be modified by Master Administrators."
      });
    }

    if (WHATSAPP_API_TOKEN !== undefined && WHATSAPP_API_TOKEN.trim() && !WHATSAPP_API_TOKEN.includes("••••") && !WHATSAPP_API_TOKEN.startsWith("EAAX_")) {
      setSetting("WHATSAPP_API_TOKEN", WHATSAPP_API_TOKEN.trim());
    }
    if (META_APP_SECRET !== undefined && !META_APP_SECRET.includes("••••")) {
      const cleanAppSecret = META_APP_SECRET.trim();
      setSetting("META_APP_SECRET", cleanAppSecret);
      config.META_APP_SECRET = cleanAppSecret;
    }
    if (WHATSAPP_PHONE_NUMBER_ID !== undefined) {
      setSetting("WHATSAPP_PHONE_NUMBER_ID", WHATSAPP_PHONE_NUMBER_ID.trim());
    }
    if (WHATSAPP_BUSINESS_ACCOUNT_ID !== undefined) {
      const cleanWaba = WHATSAPP_BUSINESS_ACCOUNT_ID.trim();
      setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", cleanWaba);
      if (WHATSAPP_WABA_ID === undefined) setSetting("WHATSAPP_WABA_ID", cleanWaba);
    }
    if (WHATSAPP_WABA_ID !== undefined) {
      const cleanWaba = WHATSAPP_WABA_ID.trim();
      setSetting("WHATSAPP_WABA_ID", cleanWaba);
      if (WHATSAPP_BUSINESS_ACCOUNT_ID === undefined) setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", cleanWaba);
    }
    if (WEBHOOK_VERIFY_TOKEN !== undefined && String(WEBHOOK_VERIFY_TOKEN).trim().length >= 8) {
      setSetting("WEBHOOK_VERIFY_TOKEN", String(WEBHOOK_VERIFY_TOKEN).trim());
    }
    if (DEFAULT_COUNTRY_CODE !== undefined) {
      setSetting("DEFAULT_COUNTRY_CODE", DEFAULT_COUNTRY_CODE.trim());
    }
    if (BROADCAST_DELAY_MS !== undefined) {
      const parsed = Math.min(Math.max(parseInt(BROADCAST_DELAY_MS, 10) || 250, 50), 10000);
      setSetting("BROADCAST_DELAY_MS", String(parsed));
    }
    if (WHATSAPP_TEMPLATE_ID !== undefined) {
      setSetting("WHATSAPP_TEMPLATE_ID", WHATSAPP_TEMPLATE_ID.trim());
    }
    if (DEFAULT_TEMPLATE_NAME !== undefined) {
      setSetting("DEFAULT_TEMPLATE_NAME", DEFAULT_TEMPLATE_NAME.trim());
    }
    if (DEFAULT_TEMPLATE_LANG !== undefined) {
      setSetting("DEFAULT_TEMPLATE_LANG", DEFAULT_TEMPLATE_LANG.trim());
    }
    if (APP_TIMEZONE !== undefined && APP_TIMEZONE.trim()) {
      setSetting("APP_TIMEZONE", APP_TIMEZONE.trim());
    }
    if (META_MARKETING_RATE_INR !== undefined) {
      setSetting("META_MARKETING_RATE_INR", String(parseFloat(META_MARKETING_RATE_INR) || 0.80));
    }
    if (META_UTILITY_RATE_INR !== undefined) {
      setSetting("META_UTILITY_RATE_INR", String(parseFloat(META_UTILITY_RATE_INR) || 0.12));
    }
    if (req.body?.META_GRAPH_VERSION !== undefined) {
      setSetting("META_GRAPH_VERSION", String(req.body.META_GRAPH_VERSION).trim());
    }
    if (req.body?.SETTLEMENT_COMMISSION_PERCENT !== undefined) {
      setSetting("SETTLEMENT_COMMISSION_PERCENT", String(req.body.SETTLEMENT_COMMISSION_PERCENT).trim());
    }
    if (req.body?.SETTLEMENT_MIN_THRESHOLD !== undefined) {
      setSetting("SETTLEMENT_MIN_THRESHOLD", String(req.body.SETTLEMENT_MIN_THRESHOLD).trim());
    }
    if (req.body?.SETTLEMENT_PENNY_DROP !== undefined) {
      setSetting("SETTLEMENT_PENNY_DROP", String(req.body.SETTLEMENT_PENNY_DROP).trim());
    }
    if (req.body?.SETTLEMENT_INSTANT_PAYOUTS !== undefined) {
      setSetting("SETTLEMENT_INSTANT_PAYOUTS", String(req.body.SETTLEMENT_INSTANT_PAYOUTS).trim());
    }

    // AI Flow Architect Credentials & Models
    if (req.body?.AI_PROVIDER !== undefined) {
      const prov = String(req.body.AI_PROVIDER).trim().toUpperCase();
      setSetting("AI_PROVIDER", prov === "OPENAI" ? "OPENAI" : "GEMINI");
    }
    if (req.body?.GEMINI_API_KEY !== undefined && req.body.GEMINI_API_KEY.trim() && !req.body.GEMINI_API_KEY.includes("••••")) {
      setSetting("GEMINI_API_KEY", req.body.GEMINI_API_KEY.trim());
    }
    if (req.body?.GEMINI_MODEL !== undefined && req.body.GEMINI_MODEL.trim()) {
      setSetting("GEMINI_MODEL", req.body.GEMINI_MODEL.trim());
    }
    if (req.body?.OPENAI_API_KEY !== undefined && req.body.OPENAI_API_KEY.trim() && !req.body.OPENAI_API_KEY.includes("••••")) {
      setSetting("OPENAI_API_KEY", req.body.OPENAI_API_KEY.trim());
    }
    if (req.body?.OPENAI_MODEL !== undefined && req.body.OPENAI_MODEL.trim()) {
      setSetting("OPENAI_MODEL", req.body.OPENAI_MODEL.trim());
    }

    const updated = getAllSettings();
    const safeUpdated = { ...updated };
    for (const key of SENSITIVE_KEYS) {
      if (safeUpdated[key]) {
        safeUpdated[key] = maskSecret(safeUpdated[key]);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully.",
      data: safeUpdated
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Test connection to Meta Graph API
 */
async function handleTestConnection(req, res) {
  try {
    const { token, phoneNumberId } = req.body || {};
    let customCreds = null;
    if (token || phoneNumberId) {
      customCreds = {};
      if (token && !token.includes("••••") && !token.startsWith("EAAX_") && !token.includes("placeholder")) {
        customCreds.token = token.trim();
      }
      if (phoneNumberId) {
        customCreds.phoneNumberId = String(phoneNumberId).trim();
      }
    }

    const result = await testConnection(customCreds);
    return res.status(200).json({
      success: true,
      message: "Successfully connected to WhatsApp Meta Cloud API!",
      data: result
    });
  } catch (error) {
    if (!error.message?.includes("EAAX_")) {
      const hintMsg = error.hint ? ` (${error.hint})` : "";
      console.warn(`[Settings] Test connection note: ${error.message}${hintMsg}`);
    }
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to connect to Meta Cloud API.",
      metaCode: error.metaCode,
      code: error.code,
      hint: error.hint
    });
  }
}

/**
 * Inspect template details by ID or Name
 */
async function getTemplateInfo(req, res) {
  try {
    const { templateId } = req.params;
    const details = await getTemplateDetails(templateId);
    if (!details) {
      return res.status(404).json({ success: false, message: `Template '${templateId}' not found.` });
    }
    return res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error("Get template info error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Register phone number with Meta WhatsApp Cloud API using ID, PIN, and Token
 * POST /api/settings/register-phone
 * POST /api/settings/register-meta-phone
 * POST /api/meta/register-phone
 * POST /api/admin/phone-numbers/register-meta
 * POST /api/phone-numbers/register-meta
 */
async function registerMetaPhone(req, res) {
  try {
    const id = req.body?.id || req.body?.phoneNumberId || req.body?.phone_number_id || req.params?.id || req.query?.id;
    const pin = req.body?.pin || req.body?.pinCode || req.body?.pin_code || req.query?.pin;
    let customToken = req.body?.token || req.body?.accessToken || req.body?.access_token;
    if (!customToken && req.headers.authorization?.startsWith("Bearer ")) {
      const headerToken = req.headers.authorization.slice(7).trim();
      if (!headerToken.startsWith("eyJ")) {
        customToken = headerToken;
      }
    }

    const dataLocalizationRegion = req.body?.dataLocalizationRegion || req.body?.data_localization_region;
    const displayName = req.body?.displayName || req.body?.display_name;
    const phoneNumber = req.body?.phoneNumber || req.body?.phone_number;
    const wabaId = req.body?.wabaId || req.body?.waba_id;
    const isDefault = req.body?.isDefault ?? req.body?.is_default;

    if (!id || !String(id).trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone Number ID ('id' or 'phoneNumberId') is required."
      });
    }

    if (pin === undefined || pin === null || !String(pin).trim()) {
      return res.status(400).json({
        success: false,
        message: "Two-step verification PIN ('pin', 6 digits) is required."
      });
    }

    const cleanPin = String(pin).trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: "Two-step verification PIN must be a 6-digit numeric string (e.g. '123456')."
      });
    }

    const cleanPhoneId = String(id).trim();
    const tenantId = Number(req.user?.tenant_id || 1);

    try {
      billingService.assertCanConnectWabaLine(tenantId, cleanPhoneId);
    } catch (quotaErr) {
      return res.status(quotaErr.statusCode || 402).json({
        success: false,
        code: quotaErr.code || "WABA_LINE_QUOTA_EXCEEDED",
        message: quotaErr.message
      });
    }

    // Call Meta Graph API registration service
    const metaResult = await registerPhoneNumberWithMeta({
      phoneNumberId: cleanPhoneId,
      pin: cleanPin,
      token: customToken,
      dataLocalizationRegion
    });

    if (tenantId === 1 && customToken && !customToken.startsWith("EAAX_") && !customToken.includes("placeholder")) {
      try {
        setSetting("WHATSAPP_API_TOKEN", customToken);
      } catch (e) {
        // ignore
      }
    }

    // Attempt to retrieve phone metadata from Meta Graph API using the token
    let phoneMetaInfo = null;
    const activeToken = customToken || (tenantId === 1 ? (getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN) : null);
    if (activeToken && !activeToken.startsWith("EAAX_") && !activeToken.includes("••••")) {
      try {
        phoneMetaInfo = await testConnection({ token: activeToken, phoneNumberId: cleanPhoneId });
      } catch (infoErr) {
        // Non-blocking: registration succeeded even if info read fails
      }
    }

    // Sync with local waba_phone_numbers database table (tenant-scoped)
    let localRecord = null;
    try {
      const existing = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ?").get(cleanPhoneId);
      if (existing) {
        if (Number(existing.tenant_id || 1) !== tenantId) {
          return res.status(403).json({ success: false, message: "Forbidden: Phone line belongs to another workspace." });
        }
        db.prepare(`
          UPDATE waba_phone_numbers 
          SET status = 'REGISTERED',
              display_name = COALESCE(?, display_name),
              phone_number = COALESCE(?, phone_number),
              quality_rating = COALESCE(?, quality_rating),
              updated_at = CURRENT_TIMESTAMP
          WHERE phone_number_id = ? AND COALESCE(tenant_id, 1) = ?
        `).run(
          displayName?.trim() || phoneMetaInfo?.verifiedName || null,
          phoneNumber?.trim() || phoneMetaInfo?.displayPhoneNumber || null,
          phoneMetaInfo?.qualityRating || null,
          cleanPhoneId,
          tenantId
        );
        localRecord = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ?").get(cleanPhoneId);
      } else {
        const newId = crypto.randomUUID();
        const cleanDisplay = (displayName && String(displayName).trim()) || phoneMetaInfo?.verifiedName || `WhatsApp (${cleanPhoneId})`;
        const cleanPhoneStr = (phoneNumber && String(phoneNumber).trim()) || phoneMetaInfo?.displayPhoneNumber || cleanPhoneId;
        const phoneCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers WHERE COALESCE(tenant_id, 1) = ? AND COALESCE(delete_status, 0) = 0").get(tenantId).count;
        const shouldBeDefault = Boolean(isDefault) || phoneCount === 0;

        if (shouldBeDefault) {
          db.prepare("UPDATE waba_phone_numbers SET is_default = 0 WHERE COALESCE(tenant_id, 1) = ?").run(tenantId);
          if (tenantId === 1) setSetting("WHATSAPP_PHONE_NUMBER_ID", cleanPhoneId);
        }

        const encryptedToken = (customToken && !customToken.startsWith("EAAX_") && !customToken.includes("placeholder"))
          ? require("../utils/cryptoUtil").encrypt(customToken)
          : null;
        db.prepare(`
          INSERT INTO waba_phone_numbers (
            id, tenant_id, display_name, phone_number, phone_number_id, waba_id,
            quality_rating, status, is_default, registered_by, access_token, access_token_enc
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'REGISTERED', ?, ?, NULL, ?)
        `).run(
          newId,
          tenantId,
          cleanDisplay,
          cleanPhoneStr,
          cleanPhoneId,
          wabaId ? String(wabaId).trim() : null,
          phoneMetaInfo?.qualityRating || "GREEN",
          shouldBeDefault ? 1 : 0,
          req.user ? req.user.id : null,
          encryptedToken
        );
        localRecord = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(newId);
      }
    } catch (dbErr) {
      console.warn("[Register Meta Phone] Local database sync note:", dbErr.message);
    }

    // Set default setting only for Tenant 1
    if (tenantId === 1 && (isDefault || !getSetting("WHATSAPP_PHONE_NUMBER_ID"))) {
      setSetting("WHATSAPP_PHONE_NUMBER_ID", cleanPhoneId);
    }

    return res.status(200).json({
      success: true,
      message: "WhatsApp phone number registered successfully with Meta Cloud API!",
      data: {
        phoneNumberId: cleanPhoneId,
        status: "REGISTERED",
        displayPhoneNumber: phoneMetaInfo?.displayPhoneNumber || phoneNumber || null,
        verifiedName: phoneMetaInfo?.verifiedName || displayName || null,
        qualityRating: phoneMetaInfo?.qualityRating || "GREEN",
        metaResponse: metaResult.metaResponse,
        localRecord
      }
    });
  } catch (error) {
    if (!error.message?.includes("EAAX_")) {
      const hintMsg = error.hint ? ` (${error.hint})` : "";
      console.warn(`[Settings] Register Meta phone note: ${error.message}${hintMsg}`);
    }
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to register phone number with Meta Cloud API.",
      metaCode: error.metaCode,
      code: error.code,
      hint: error.hint
    });
  }
}

/**
 * Deregister phone number from Meta WhatsApp Cloud API
 * POST /api/settings/deregister-phone
 * POST /api/meta/deregister-phone
 */
async function deregisterMetaPhone(req, res) {
  try {
    const id = req.body?.id || req.body?.phoneNumberId || req.body?.phone_number_id || req.params?.id || req.query?.id;
    let customToken = req.body?.token || req.body?.accessToken || req.body?.access_token;
    if (!customToken && req.headers.authorization?.startsWith("Bearer ")) {
      const headerToken = req.headers.authorization.slice(7).trim();
      if (!headerToken.startsWith("eyJ")) {
        customToken = headerToken;
      }
    }

    if (!id || !String(id).trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone Number ID ('id' or 'phoneNumberId') is required."
      });
    }

    const cleanPhoneId = String(id).trim();
    const existingPhone = db.prepare("SELECT id, tenant_id, access_token, access_token_enc FROM waba_phone_numbers WHERE phone_number_id = ? AND COALESCE(delete_status, 0) = 0 LIMIT 1").get(cleanPhoneId);
    if (existingPhone && req.user && !isPlatformAdmin(req.user) && Number(existingPhone.tenant_id || 1) !== Number(req.user?.tenant_id || 1)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Phone line belongs to another workspace."
      });
    }

    const { decrypt } = require("../utils/cryptoUtil");
    const decryptedLineToken = existingPhone?.access_token_enc ? decrypt(existingPhone.access_token_enc) : null;
    const result = await deregisterPhoneNumberWithMeta({
      phoneNumberId: cleanPhoneId,
      token: customToken || decryptedLineToken || existingPhone?.access_token || null,
      tenantId: existingPhone?.tenant_id || req.user?.tenant_id || 1
    });

    try {
      db.prepare(`
        UPDATE waba_phone_numbers 
        SET status = 'DEREGISTERED',
            updated_at = CURRENT_TIMESTAMP
        WHERE phone_number_id = ?
      `).run(cleanPhoneId);
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      success: true,
      message: "WhatsApp phone number deregistered successfully from Meta Cloud API.",
      data: {
        phoneNumberId: cleanPhoneId,
        status: "DEREGISTERED",
        metaResponse: result.metaResponse
      }
    });
  } catch (error) {
    console.error("deregisterMetaPhone error:", error);
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to deregister phone number from Meta Cloud API.",
      metaCode: error.metaCode,
      hint: error.hint
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  handleTestConnection,
  getTemplateInfo,
  registerMetaPhone,
  deregisterMetaPhone
};
