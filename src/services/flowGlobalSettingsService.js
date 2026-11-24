/**
 * Flow Global Settings Service
 * Manages tenant-wide and phone-line-scoped global conversation navigation keywords,
 * root menu routing, session TTL, and global fallback behavior.
 */

const { db } = require("../config/database");

const DEFAULT_GLOBAL_SETTINGS = {
  root_flow_id: null,
  menu_keywords: ["menu", "restart", "main menu"],
  back_keywords: ["0", "back", "previous"],
  handoff_keywords: ["agent", "human", "help", "support"],
  session_ttl_minutes: 1440,
  fallback_message: "I'm sorry, I didn't understand that. Type 'menu' to return to the main menu or 'agent' to speak with a representative."
};

function safeParseJson(val, fallback) {
  if (!val) return fallback;
  if (Array.isArray(val) || typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch (_) {
    return fallback;
  }
}

/**
 * Retrieves global flow settings for a tenant and optional phone number line.
 * Falls back to tenant-level default (phone_number_id IS NULL) and then hardcoded defaults.
 */
function getSettings(tenantId = 1, phoneNumberId = null) {
  try {
    let row = null;
    if (phoneNumberId) {
      row = db.prepare(`
        SELECT * FROM flow_global_settings
        WHERE tenant_id = ? AND phone_number_id = ?
        LIMIT 1
      `).get(tenantId, String(phoneNumberId).trim());
    }

    if (!row) {
      row = db.prepare(`
        SELECT * FROM flow_global_settings
        WHERE tenant_id = ? AND (phone_number_id IS NULL OR phone_number_id = '')
        LIMIT 1
      `).get(tenantId);
    }

    if (!row) {
      return {
        tenant_id: Number(tenantId),
        phone_number_id: phoneNumberId || null,
        ...DEFAULT_GLOBAL_SETTINGS
      };
    }

    return {
      id: row.id,
      tenant_id: row.tenant_id,
      phone_number_id: row.phone_number_id || null,
      root_flow_id: row.root_flow_id || null,
      menu_keywords: safeParseJson(row.menu_keywords_json, DEFAULT_GLOBAL_SETTINGS.menu_keywords),
      back_keywords: safeParseJson(row.back_keywords_json, DEFAULT_GLOBAL_SETTINGS.back_keywords),
      handoff_keywords: safeParseJson(row.handoff_keywords_json, DEFAULT_GLOBAL_SETTINGS.handoff_keywords),
      session_ttl_minutes: row.session_ttl_minutes || DEFAULT_GLOBAL_SETTINGS.session_ttl_minutes,
      fallback_message: row.fallback_message || DEFAULT_GLOBAL_SETTINGS.fallback_message,
      updated_at: row.updated_at
    };
  } catch (err) {
    console.warn("[flowGlobalSettingsService] getSettings error:", err.message);
    return {
      tenant_id: Number(tenantId),
      phone_number_id: phoneNumberId || null,
      ...DEFAULT_GLOBAL_SETTINGS
    };
  }
}

/**
 * Updates or inserts global flow settings for a tenant and optional phone number line.
 */
function updateSettings(tenantId = 1, phoneNumberId = null, data = {}) {
  const normPhoneId = phoneNumberId ? String(phoneNumberId).trim() : null;
  const menuKeywords = Array.isArray(data.menu_keywords) ? data.menu_keywords : DEFAULT_GLOBAL_SETTINGS.menu_keywords;
  const backKeywords = Array.isArray(data.back_keywords) ? data.back_keywords : DEFAULT_GLOBAL_SETTINGS.back_keywords;
  const handoffKeywords = Array.isArray(data.handoff_keywords) ? data.handoff_keywords : DEFAULT_GLOBAL_SETTINGS.handoff_keywords;
  const sessionTtl = Number(data.session_ttl_minutes) > 0 ? Number(data.session_ttl_minutes) : 1440;
  const rootFlowId = data.root_flow_id ? Number(data.root_flow_id) : null;
  const fallbackMessage = data.fallback_message ? String(data.fallback_message) : DEFAULT_GLOBAL_SETTINGS.fallback_message;

  const existing = normPhoneId
    ? db.prepare("SELECT id FROM flow_global_settings WHERE tenant_id = ? AND phone_number_id = ? LIMIT 1").get(tenantId, normPhoneId)
    : db.prepare("SELECT id FROM flow_global_settings WHERE tenant_id = ? AND (phone_number_id IS NULL OR phone_number_id = '') LIMIT 1").get(tenantId);

  if (existing) {
    db.prepare(`
      UPDATE flow_global_settings
      SET root_flow_id = ?,
          menu_keywords_json = ?,
          back_keywords_json = ?,
          handoff_keywords_json = ?,
          session_ttl_minutes = ?,
          fallback_message = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(
      rootFlowId,
      JSON.stringify(menuKeywords),
      JSON.stringify(backKeywords),
      JSON.stringify(handoffKeywords),
      sessionTtl,
      fallbackMessage,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO flow_global_settings (
        tenant_id, phone_number_id, root_flow_id,
        menu_keywords_json, back_keywords_json, handoff_keywords_json,
        session_ttl_minutes, fallback_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(
      tenantId,
      normPhoneId,
      rootFlowId,
      JSON.stringify(menuKeywords),
      JSON.stringify(backKeywords),
      JSON.stringify(handoffKeywords),
      sessionTtl,
      fallbackMessage
    );
  }

  return getSettings(tenantId, normPhoneId);
}

module.exports = {
  DEFAULT_GLOBAL_SETTINGS,
  getSettings,
  updateSettings
};
