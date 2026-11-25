const { db } = require("../../config/database");
const { mapLegacyScreenToComponent, sanitizeText } = require("./conversationalComponentRegistry");

/**
 * Builds the initial assistant bubble(s) for an experience entry screen.
 */
function buildTranscriptFromScreen(experienceId, screenKey = null) {
  let screen = null;
  if (screenKey) {
    screen = db.prepare(`
      SELECT * FROM inapp_screens
      WHERE experience_id = ? AND screen_key = ? AND delete_status = 0 AND active_status = 1
      LIMIT 1
    `).get(experienceId, screenKey);
  }
  if (!screen) {
    screen = db.prepare(`
      SELECT * FROM inapp_screens
      WHERE experience_id = ? AND delete_status = 0 AND active_status = 1
      ORDER BY display_order ASC, id ASC
      LIMIT 1
    `).get(experienceId);
  }
  if (!screen) return [];

  let fields = [];
  if (screen.screen_type === "DYNAMIC_FORM" || screen.screen_type === "FORM") {
    fields = db.prepare(`
      SELECT * FROM inapp_form_fields
      WHERE screen_id = ? AND delete_status = 0 AND active_status = 1
      ORDER BY display_order ASC, id ASC
    `).all(screen.id);
  }

  let parsedConfig = {};
  try {
    parsedConfig = JSON.parse(screen.config_json || "{}");
  } catch (_) {}

  const mapped = mapLegacyScreenToComponent({
    id: screen.id,
    screenKey: screen.screen_key,
    screenType: screen.screen_type,
    title: screen.title,
    subtitle: screen.subtitle,
    config: parsedConfig
  }, fields);

  return [
    {
      id: `turn_${Date.now()}_init`,
      role: "assistant",
      screenKey: screen.screen_key,
      componentType: mapped.componentType,
      title: sanitizeText(screen.title || ""),
      message: sanitizeText(screen.subtitle || parsedConfig.welcomeMessage || parsedConfig.prompt || screen.title || ""),
      timestamp: new Date().toISOString()
    }
  ];
}

/**
 * Appends a pair of user action + next assistant step into session transcript cleanly.
 */
function appendConversationTurn(existingTranscript = [], {
  userSummary = null,
  userData = null,
  fromScreenKey = null,
  nextScreen = null,
  nextFields = [],
  channelOwner = "SURVYA"
} = {}) {
  const transcript = Array.isArray(existingTranscript) ? [...existingTranscript] : [];
  const now = new Date().toISOString();

  if (userSummary || (userData && Object.keys(userData).length > 0)) {
    transcript.push({
      id: `turn_${Date.now()}_u_${transcript.length}`,
      role: "customer",
      screenKey: fromScreenKey || null,
      channelOwner,
      summary: sanitizeText(userSummary || "Submitted details"),
      payload: userData || {},
      timestamp: now
    });
  }

  if (nextScreen && nextScreen.screenKey !== fromScreenKey) {
    const mapped = mapLegacyScreenToComponent(nextScreen, nextFields);
    transcript.push({
      id: `turn_${Date.now()}_a_${transcript.length}`,
      role: "assistant",
      screenKey: nextScreen.screenKey,
      componentType: mapped.componentType,
      title: sanitizeText(nextScreen.title || ""),
      message: sanitizeText(nextScreen.subtitle || nextScreen.config?.prompt || nextScreen.title || ""),
      timestamp: now
    });
  }

  // Keep transcript bounded cleanly to last 100 entries
  return transcript.slice(-100);
}

module.exports = {
  buildTranscriptFromScreen,
  appendConversationTurn
};
