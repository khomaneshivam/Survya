/**
 * Conversation Flow Execution Engine
 * Deterministic node runner, graph transition resolver, variable interpolator, and in-memory test simulator.
 */

const { db } = require("../config/database");
const availabilityService = require("./hospitalityAvailabilityService");
const pricingService = require("./hospitalityPricingService");
const enquiryService = require("./enquiryService");
const { getNodeExecutor } = require("./workflow/nodeExecutors");
const { evaluateRules } = require("./workflow/expressionEvaluator");
const { parseMysqlUtcTimestamp } = require("../utils/timeUtil");
const flowAnalyticsService = require("./workflow/flowAnalyticsService");

/**
 * Canonical phone normalization: strip all non-digit characters.
 */
const normalizePhone = phone => String(phone || "").replace(/\D/g, "");

/**
 * Converts a JavaScript Date or timestamp string to MySQL UTC DATETIME format (YYYY-MM-DD HH:MM:SS).
 */
function toMysqlUtc(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Safely parses a MySQL UTC timestamp string into a JS timestamp (milliseconds).
 * Treats unqualified strings ('YYYY-MM-DD HH:MM:SS') strictly as UTC to avoid local timezone skew.
 */
function parseUtcMs(val) {
  const d = parseMysqlUtcTimestamp(val);
  return d ? d.getTime() : 0;
}

/**
 * Helper: strip emojis and extra punctuation for clean comparisons
 */
const cleanEmoji = str => String(str || "")
  .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F6FF}]/gu, "")
  .replace(/[^\w\s]/gi, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/**
 * Resolves the next node in the graph matching an output handle or fallback edge with handle aliasing.
 */
function resolveNextTransition(currentNodeId, handle, transitions = [], nodeMap = new Map(), nodes = []) {
  if (!currentNodeId || !Array.isArray(transitions)) return null;

  const outbound = transitions
    .filter(t => (t.source || t.from) === currentNodeId)
    .map(t => ({
      ...t,
      source: t.source || t.from,
      target: t.target || t.to,
      sourceHandle: t.sourceHandle || (t.optionId ? String(t.optionId) : null) || (t.condition !== undefined ? String(t.condition) : 'default')
    }));

  if (outbound.length === 0) {
    if (!handle || handle === "default") {
      if (Array.isArray(nodes) && nodes.length > 0) {
        const curIdx = nodes.findIndex(n => n.id === currentNodeId);
        if (curIdx >= 0 && curIdx < nodes.length - 1) {
          return nodes[curIdx + 1];
        }
      }
    }
    return null;
  }

  // Handle Aliasing
  const aliasMap = {
    'item_selected': ['item_selected', 'selected', 'valid', 'success', 'default'],
    'selected': ['selected', 'item_selected', 'valid', 'success', 'default'],
    'confirmed': ['confirmed', 'success', 'valid', 'default'],
    'unavailable': ['unavailable', 'failure', 'error'],
    'add_more': ['add_more', 'continue'],
    'matched_item': ['matched_item', 'selected', 'item_selected', 'answered', 'default'],
    'answered': ['answered', 'default', 'success'],
    'handoff': ['handoff', 'human_handoff', 'agent'],
    'early_reply': ['early_reply', 'replied_early'],
    'replied_early': ['replied_early', 'early_reply'],
    'failure': ['failure', 'error', 'unavailable'],
    'error': ['error', 'failure', 'unavailable'],
    'valid': ['valid', 'success', 'true', 'default'],
    'success': ['success', 'valid', 'true', 'default'],
    'true': ['true', 'valid', 'success'],
    'false': ['false', 'failure', 'error', 'unavailable'],
    'timeout': ['timeout', 'after_delay'],
    'after_delay': ['after_delay', 'timeout']
  };

  const handleAliases = handle ? (aliasMap[handle] || [handle]) : ['default'];

  // 1. Direct handle match or alias match
  for (const h of handleAliases) {
    const cleanH = cleanEmoji(h);
    const match = outbound.find(t =>
      t.sourceHandle === h ||
      String(t.optionId) === h ||
      String(t.condition) === h ||
      (cleanH && cleanEmoji(t.sourceHandle) === cleanH) ||
      (cleanH && cleanEmoji(t.optionId) === cleanH) ||
      (cleanH && cleanEmoji(t.label) === cleanH) ||
      (h === "true" && t.condition === true) ||
      (h === "false" && t.condition === false)
    );
    if (match) {
      let targetId = match.target;
      // Prevent self-loop on max_retries or error handles (e.g. input_checkin -> input_checkin)
      if (targetId === currentNodeId && (handle === 'max_retries' || handle === 'error' || handle === 'failure')) {
        const fallbackTarget = nodes.find(n => n.type === 'HANDOFF' || n.type === 'HUMAN_HANDOFF' || n.type === 'END');
        if (fallbackTarget) {
          targetId = fallbackTarget.id;
        }
      }
      if (nodeMap && typeof nodeMap.has === "function" && nodeMap.has(targetId)) {
        return nodeMap.get(targetId);
      }
      return { id: targetId, targetNodeId: targetId };
    }
  }

  // 2. Default handle match
  const defaultMatch = outbound.find(t => (t.sourceHandle === "default" || !t.sourceHandle) && t.target !== currentNodeId);
  if (defaultMatch) {
    if (nodeMap && typeof nodeMap.has === "function" && nodeMap.has(defaultMatch.target)) {
      return nodeMap.get(defaultMatch.target);
    }
    return { id: defaultMatch.target, targetNodeId: defaultMatch.target };
  }

  // 3. If there is only one outbound edge, route along it as universal fallback (unless self-loop)
  if (outbound.length === 1 && outbound[0].target !== currentNodeId) {
    if (nodeMap && typeof nodeMap.has === "function" && nodeMap.has(outbound[0].target)) {
      return nodeMap.get(outbound[0].target);
    }
    return { id: outbound[0].target, targetNodeId: outbound[0].target };
  }

  // 4. Sequential fallback if nodes array provided
  if (!handle || handle === "default") {
    if (Array.isArray(nodes) && nodes.length > 0) {
      const curIdx = nodes.findIndex(n => n.id === currentNodeId);
      if (curIdx >= 0 && curIdx < nodes.length - 1) {
        return nodes[curIdx + 1];
      }
    }
  }

  return null;
}

function findNextNode(currentNodeId, handle, transitions = [], nodeMap = new Map(), nodes = []) {
  return resolveNextTransition(currentNodeId, handle, transitions, nodeMap, nodes);
}

/**
 * Resolves the next node ID in the graph matching an output handle or fallback edge.
 */
function resolveNextNodeId(node, handle = "default", transitions = [], collectedData = {}, nodeMap = new Map(), nodes = []) {
  if (!node) return null;
  const target = resolveNextTransition(node.id, handle, transitions, nodeMap, nodes);
  return target?.id || target?.targetNodeId || target?.target || null;
}

/**
 * Retrieves the currently active, unexpired session for a contact using UTC_TIMESTAMP().
 * If the session has exceeded the inactivity timeout window, it is silently marked EXPIRED
 * and an analytics event is recorded, returning null so a fresh journey begins.
 */
function getActiveSession(tenantId = 1, senderPhone, channelAccountId = null, channel = "WHATSAPP") {
  const normPhone = normalizePhone(senderPhone);
  if (!normPhone) return null;
  try {
    // Scope active sessions by receiving account to prevent cross-line resumes.
    const scopedKey = channelAccountId
      ? `${channel}:${normPhone}:${tenantId}:${String(channelAccountId).trim()}`
      : null;
    const session = scopedKey
      ? db.prepare(`
        SELECT s.*, f.status as flow_status, f.name as flow_name
        FROM conversation_flow_sessions s
        JOIN conversation_flows f ON s.flow_id = f.id
        WHERE s.tenant_id = ? AND s.session_key = ? AND s.session_status = 'ACTIVE'
        ORDER BY s.id DESC LIMIT 1
      `).get(tenantId, scopedKey)
      : db.prepare(`
        SELECT s.*, f.status as flow_status, f.name as flow_name
        FROM conversation_flow_sessions s
        JOIN conversation_flows f ON s.flow_id = f.id
        WHERE (s.sender_phone = ? OR s.sender_phone = ? OR s.sender_phone = ?)
          AND s.tenant_id = ? AND s.channel = ? AND s.session_status = 'ACTIVE'
        ORDER BY s.id DESC LIMIT 1
      `).get(normPhone, senderPhone, `+${normPhone}`, tenantId, channel);

    if (!session) return null;

    let timeoutMinutes = 30;
    try {
      const { getSetting } = require("../config/database");
      timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "30", 10);
      if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 30;
    } catch (e) {}

    const lastDate = parseMysqlUtcTimestamp(session.last_interaction_at || session.created_at);
    const expiresDate = parseMysqlUtcTimestamp(session.expires_at);
    const nowMs = Date.now();
    const lastMs = lastDate ? lastDate.getTime() : 0;
    const expiresMs = expiresDate ? expiresDate.getTime() : 0;

    const isExpired = (expiresMs > 0 && nowMs > expiresMs) || (lastMs > 0 && (nowMs - lastMs > timeoutMinutes * 60 * 1000));

    if (isExpired) {
      db.prepare(`
        UPDATE conversation_flow_sessions
        SET session_status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
        WHERE id = ?
      `).run(session.id);

      try {
        db.prepare(`
          INSERT INTO conversation_flow_events (
            session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
          ) VALUES (?, ?, ?, ?, 'SESSION_TIMEOUT', 'EXPIRED', ?, UTC_TIMESTAMP())
        `).run(
          session.id,
          session.flow_id,
          session.flow_version_id,
          session.current_node_id || "unknown",
          JSON.stringify({ reason: "INACTIVITY_TIMEOUT", timeoutMinutes, lastInteractionAt: session.last_interaction_at })
        );
        flowAnalyticsService.recordNodeEvent(
          session.tenant_id || 1,
          session.flow_id,
          session.current_node_id || "unknown",
          'DROPOFF',
          { nodeType: 'SESSION_TIMEOUT' }
        );
      } catch (e) {}

      return null;
    }

    return session;
  } catch (e) {
    console.warn("[ConversationFlowEngine] getActiveSession note:", e.message);
    return null;
  }
}

/**
 * Strips raw heavy arrays (e.g. catalog items with full images, heavy lists)
 * leaving only compact scalar IDs, cart references, quotes, and user inputs.
 */
function compactSessionData(data = {}) {
  if (!data || typeof data !== "object") return {};
  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    // Exclude large temporary arrays or raw catalog/media objects
    if (k === "catalogItems" || k === "allItems" || k === "mediaList" || k === "fullCatalog" ||
        k.startsWith("_") || k.toLowerCase().includes("catalog") || k.toLowerCase().includes("media")) {
      continue;
    }
    // Exclude large strings / base64 payloads
    if (typeof v === "string" && (v.startsWith("data:") || v.length > 2000)) {
      continue;
    }
    if (k === "cart" && Array.isArray(v)) {
      clean.cart = v.map(item => ({
        itemId: item.itemId || item.id,
        variantId: item.variantId || item.variantSku || null,
        addonIds: Array.isArray(item.addonIds) ? item.addonIds : (item.addonId ? [item.addonId] : []),
        qty: Number(item.qty || item.quantity) || 1,
        slotDate: item.slotDate || null,
        checkIn: item.checkIn || null,
        checkOut: item.checkOut || null
      }));
      continue;
    }
    clean[k] = v;
  }
  return clean;
}

/**
 * Upserts an active flow session with UTC timestamps and sliding window expiration.
 */
function upsertActiveSession({
  sessionId = null,
  sessionKey,
  tenantId = 1,
  propertyId = 1,
  channel = "WHATSAPP",
  senderPhone,
  flowId,
  versionId,
  currentNodeId,
  collectedData = {},
  status = "ACTIVE",
  extendMinutes = 60,
  extendDays = null
}) {
  const normPhone = normalizePhone(senderPhone);
  const dataJson = JSON.stringify(compactSessionData(collectedData) || {});
  const intervalMinutes = extendDays ? (extendDays * 1440) : (extendMinutes || 60);

  if (sessionId) {
    db.prepare(`
      UPDATE conversation_flow_sessions
      SET current_node_id = ?,
          collected_data_json = ?,
          session_status = ?,
          last_interaction_at = UTC_TIMESTAMP(),
          expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(currentNodeId, dataJson, status, intervalMinutes, sessionId);

    return db.prepare("SELECT * FROM conversation_flow_sessions WHERE id = ?").get(sessionId);
  }

  // Insert or duplicate key update
  db.prepare(`
    INSERT INTO conversation_flow_sessions (
      session_key, tenant_id, property_id, channel, sender_phone,
      flow_id, flow_version_id, current_node_id, collected_data_json,
      session_status, last_interaction_at, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      flow_id = VALUES(flow_id),
      flow_version_id = VALUES(flow_version_id),
      current_node_id = VALUES(current_node_id),
      collected_data_json = VALUES(collected_data_json),
      session_status = VALUES(session_status),
      last_interaction_at = UTC_TIMESTAMP(),
      expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE),
      updated_at = UTC_TIMESTAMP()
  `).run(
    sessionKey, tenantId, propertyId, channel, normPhone,
    flowId, versionId, currentNodeId, dataJson,
    status, intervalMinutes, intervalMinutes
  );

  return db.prepare("SELECT * FROM conversation_flow_sessions WHERE session_key = ?").get(sessionKey);
}

/**
 * Safe variable interpolator for mustache-like syntax {{varName}} or {{obj.prop}}
 */
function interpolateVariables(templateStr, context = {}) {
  if (!templateStr || typeof templateStr !== "string") return "";
  return templateStr.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
    const parts = path.split(".");
    let curr = context;
    for (const p of parts) {
      if (curr == null || typeof curr !== "object") {
        curr = undefined;
        break;
      }
      curr = curr[p];
    }
    return curr !== undefined && curr !== null ? String(curr) : "";
  });
}

/**
 * Natural language / robust date parser for guest check-in/check-out inputs
 */
function parseDateInput(inputStr, referenceDate = new Date()) {
  if (!inputStr) return null;
  let raw = String(inputStr).trim().toLowerCase();

  // Strip ordinals: "20th" -> "20", "1st" -> "1", "2nd" -> "2", "3rd" -> "3"
  raw = raw.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1");

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = String(isoMatch[2]).padStart(2, "0");
    const d = String(isoMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, "0");
    const m = String(dmyMatch[2]).padStart(2, "0");
    const y = Number(dmyMatch[3]);
    return `${y}-${m}-${d}`;
  }

  // Relative keywords
  const ref = new Date(referenceDate);
  const refYear = ref.getFullYear();
  if (raw === "today" || raw === "aaj") {
    return ref.toISOString().split("T")[0];
  }
  if (raw === "tomorrow" || raw === "kal") {
    ref.setDate(ref.getDate() + 1);
    return ref.toISOString().split("T")[0];
  }
  if (raw === "day after tomorrow" || raw === "parson") {
    ref.setDate(ref.getDate() + 2);
    return ref.toISOString().split("T")[0];
  }

  // Month dictionary
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  // Pattern: "20 nov", "20 november", "20 nov 2026", "nov 20", "november 20"
  const monthDayMatch = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/) ||
                        raw.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (monthDayMatch) {
    let day, monthStr, yearStr;
    if (/^\d/.test(monthDayMatch[1])) {
      day = Number(monthDayMatch[1]);
      monthStr = monthDayMatch[2];
      yearStr = monthDayMatch[3];
    } else {
      monthStr = monthDayMatch[1];
      day = Number(monthDayMatch[2]);
      yearStr = monthDayMatch[3];
    }
    const monthNum = months[monthStr];
    if (monthNum && day >= 1 && day <= 31) {
      let y = yearStr ? Number(yearStr) : refYear;
      // If no year specified and date is already past in this year, roll to next year
      const candidate = new Date(y, monthNum - 1, day);
      if (!yearStr && candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
      const mStr = String(monthNum).padStart(2, "0");
      const dStr = String(day).padStart(2, "0");
      return `${y}-${mStr}-${dStr}`;
    }
  }

  // DD/MM or DD-MM (without year)
  const dmMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (dmMatch) {
    const d = Number(dmMatch[1]);
    const m = Number(dmMatch[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let y = refYear;
      const candidate = new Date(y, m - 1, d);
      if (candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Fallback: standard Date.parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    // V8 defaults missing year to 2001
    if (y < refYear) {
      y = refYear;
      const candidate = new Date(y, parsed.getMonth(), parsed.getDate());
      if (candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
    }
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Parse guest counts from user natural text (e.g. "2 adults 1 child", "family of 4", "3", "2 adults")
 */
function parseGuestCounts(inputStr, defaultAdults = 2, defaultChildren = 0) {
  if (!inputStr) return { adults: defaultAdults, children: defaultChildren };
  const raw = String(inputStr).trim().toLowerCase();

  let adults = null;
  let children = null;

  // Pattern: "X adults" / "X adult"
  const adultMatch = raw.match(/(\d+)\s*(adult|bade|grown)/);
  if (adultMatch) {
    adults = parseInt(adultMatch[1], 10);
  }

  // Pattern: "Y children" / "Y child" / "Y kids"
  const childMatch = raw.match(/(\d+)\s*(child|children|kid|bacche|bachhe)/);
  if (childMatch) {
    children = parseInt(childMatch[1], 10);
  }

  // Plain number: e.g. "2" or "4"
  if (adults === null && /^\d+$/.test(raw)) {
    adults = parseInt(raw, 10);
  }

  return {
    adults: adults !== null ? Math.max(1, adults) : defaultAdults,
    children: children !== null ? Math.max(0, children) : defaultChildren
  };
}

/**
 * Evaluate condition comparison operator
 */
function evaluateConditionRule(valA, operator, valB) {
  const normA = valA !== undefined && valA !== null ? String(valA).toLowerCase().trim() : "";
  const normB = valB !== undefined && valB !== null ? String(valB).toLowerCase().trim() : "";

  switch (operator) {
    case "EQUALS":
      return normA === normB || String(valA) === String(valB);
    case "NOT_EQUALS":
      return normA !== normB && String(valA) !== String(valB);
    case "CONTAINS":
      return normA.includes(normB);
    case "GREATER_THAN":
      return Number(valA) > Number(valB);
    case "LESS_THAN":
      return Number(valA) < Number(valB);
    case "BETWEEN":
      if (Array.isArray(valB) && valB.length === 2) {
        const num = Number(valA);
        return num >= Number(valB[0]) && num <= Number(valB[1]);
      }
      return false;
    case "EXISTS":
      return valA !== undefined && valA !== null && normA !== "";
    case "IS_EMPTY":
      return valA === undefined || valA === null || normA === "";
    default:
      return normA === normB;
  }
}

/**
 * Robust option matcher for buttons, lists, numeric choices, and quoted WhatsApp messages
 */
function matchOption(rawOptions, choiceValue, userInput, isInitialPreAnswer = false) {
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) return null;
  const cVal = String(choiceValue || "").toLowerCase().trim();
  const uInput = String(userInput || "").toLowerCase().trim();

  // Helper: strip emojis and extra punctuation for clean comparisons
  const cleanEmoji = str => String(str || "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F6FF}]/gu, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const uInputClean = cleanEmoji(uInput);
  const cValClean = cleanEmoji(cVal);

  // Extract lines from userInput if multiline (e.g. WhatsApp quoted reply)
  const lines = String(userInput || "").split("\n").map(l => l.trim()).filter(Boolean);
  const lastLine = lines.length > 0 ? lines[lines.length - 1].toLowerCase().trim() : "";
  const lastLineClean = cleanEmoji(lastLine);

  // 1. Numeric choice matching: "1", "2", "3" (e.g. customer replies "1" for first button or "2" for second)
  const candidateForNumber = lastLine || uInput;
  const numericMatch = candidateForNumber.match(/^\s*(\d{1,2})\s*$/);
  if (numericMatch && !isInitialPreAnswer) {
    const numIdx = parseInt(numericMatch[1], 10) - 1;
    if (numIdx >= 0 && numIdx < rawOptions.length) {
      return rawOptions[numIdx];
    }
  }

  // 2. Direct exact match on choiceValue, userInput, or lastLine against option id, value, title, or clean title
  const exactCandidates = [cVal, uInput, lastLine, cValClean, uInputClean, lastLineClean].filter(Boolean);
  for (const cand of exactCandidates) {
    const directMatch = rawOptions.find(o => {
      const oId = String(o.id || "").toLowerCase();
      const oVal = String(o.value || "").toLowerCase();
      const oTitle = String(o.title || "").toLowerCase();
      const oTitleClean = cleanEmoji(oTitle);
      const oValClean = cleanEmoji(oVal);

      return (
        oId === cand ||
        oVal === cand ||
        oTitle === cand ||
        (oTitleClean && oTitleClean === cand) ||
        (oValClean && oValClean === cand)
      );
    });
    if (directMatch) return directMatch;
  }

  // 3. Substring matching for quoted WhatsApp replies where option title is quoted
  if (lastLine) {
    const lastLineContains = rawOptions.find(o => {
      const oTitle = String(o.title || "").toLowerCase().trim();
      const oTitleClean = cleanEmoji(oTitle);
      return (
        lastLine.includes(oTitle) ||
        (oTitleClean && lastLineClean.includes(oTitleClean))
      );
    });
    if (lastLineContains) return lastLineContains;
  }

  // 4. Bidirectional keyword / substring match (e.g. "garden" matches "Garden Villa 🌿", "beach" matches "Beachfront Suite")
  if (!isInitialPreAnswer) {
    const scanCandidates = [lastLineClean, uInputClean, cValClean].filter(Boolean);
    for (const scan of scanCandidates) {
      if (scan.length >= 2) {
        const subMatch = rawOptions.find(o => {
          const oTitle = cleanEmoji(o.title);
          const oVal = cleanEmoji(o.value);
          const oId = String(o.id || "").toLowerCase();

          return (
            (oTitle && (oTitle.includes(scan) || scan.includes(oTitle))) ||
            (oVal && (oVal.includes(scan) || scan.includes(oVal))) ||
            (oId && (oId.includes(scan) || scan.includes(oId)))
          );
        });
        if (subMatch) return subMatch;
      }
    }
  }

  return null;
}

/**
 * Execute registered business actions safely
 */
function executeBusinessAction(actionName, inputs = {}, context = {}) {
  const { propertyId = 1, tenantId = 1 } = context;

  switch (actionName) {
    case "HOSPITALITY_CHECK_AVAILABILITY": {
      const roomName = inputs.room_name || "";
      const checkIn = inputs.check_in;
      const checkOut = inputs.check_out;
      const adults = Number(inputs.adults || 2);

      // Resolve room category from DB
      let roomType = null;
      if (roomName) {
        roomType = db.prepare(`
          SELECT * FROM room_types
          WHERE property_id = ? AND tenant_id = ? AND (name LIKE ? OR room_code LIKE ?)
          ORDER BY id ASC LIMIT 1
        `).get(propertyId, tenantId, `%${roomName}%`, `%${roomName}%`);
      }
      if (!roomType) {
        roomType = db.prepare(`
          SELECT * FROM room_types
          WHERE property_id = ? AND tenant_id = ? AND status = 'ACTIVE'
          ORDER BY id ASC LIMIT 1
        `).get(propertyId, tenantId);
      }

      if (!roomType) {
        return { is_available: false, available_qty: 0, matched_room_id: null, matched_room_name: "No room categories found" };
      }

      try {
        const avail = availabilityService.checkRoomAvailability(propertyId, roomType.id, checkIn, checkOut, 1, tenantId);
        return {
          is_available: avail.overall_status !== "UNAVAILABLE",
          available_qty: avail.min_sellable,
          matched_room_id: roomType.id,
          matched_room_name: roomType.name
        };
      } catch (err) {
        return {
          is_available: true,
          available_qty: 1,
          matched_room_id: roomType.id,
          matched_room_name: roomType.name,
          error: err.message
        };
      }
    }

    case "HOSPITALITY_CALCULATE_QUOTE": {
      const roomTypeId = Number(inputs.room_type_id || 1);
      const checkIn = inputs.check_in;
      const checkOut = inputs.check_out;
      const adults = Number(inputs.adults || 2);
      const children = Number(inputs.children || 0);

      try {
        const quote = pricingService.calculateQuote({
          propertyId,
          roomTypeId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          adults,
          children,
          rooms: 1,
          tenantId
        });

        const nights = quote.reservation_specs?.nights || 1;
        const roomName = quote.room_category?.name || "Villa";
        const grandTotal = quote.pricing_summary?.estimated_grand_total || quote.total_payable || 8500;
        const subtotal = quote.pricing_summary?.subtotal_before_tax || quote.subtotal_room_charges || 7589;
        const taxTotal = quote.pricing_summary?.taxes?.total_tax || quote.total_taxes || 911;
        const taxPercent = quote.pricing_summary?.taxes?.tax_percentage || 12;

        return {
          quote_total: grandTotal,
          quote_subtotal: subtotal,
          tax_total: taxTotal,
          tax_percent: taxPercent,
          nights: nights,
          pricing_breakdown: `${nights} night(s) in ${roomName}`
        };
      } catch (err) {
        // Fallback pricing calculation if checkIn/checkOut is mock
        const rt = db.prepare("SELECT name, base_rate FROM room_types WHERE id = ?").get(roomTypeId) || { name: "Villa", base_rate: 8500 };
        const subtotal = Number(rt.base_rate || 8500);
        const tax = Math.round(subtotal * 0.12);
        return {
          quote_total: subtotal + tax,
          quote_subtotal: subtotal,
          tax_total: tax,
          tax_percent: 12,
          nights: 1,
          pricing_breakdown: `1 night in ${rt.name}`
        };
      }
    }

    case "HOSPITALITY_CREATE_ENQUIRY": {
      const guestName = inputs.guest_name || "WhatsApp Guest";
      const phone = inputs.phone || "919999999999";
      const checkIn = inputs.check_in || new Date().toISOString().split("T")[0];
      const checkOut = inputs.check_out || new Date(Date.now() + 86400000).toISOString().split("T")[0];
      const adults = Number(inputs.adults || 2);
      const children = Number(inputs.children || 0);
      const roomTypeId = inputs.room_type_id ? Number(inputs.room_type_id) : null;
      const notes = inputs.notes || "Auto Reply Flow Enquiry";

      try {
        const enquiry = enquiryService.createEnquiry(tenantId, {
          property_id: propertyId,
          phone,
          guest_name: guestName,
          check_in: checkIn,
          check_out: checkOut,
          adults,
          children,
          rooms_requested: 1,
          room_type_id: roomTypeId,
          notes
        }, "conversation_engine");

        return {
          enquiry_id: enquiry.id,
          quote_id: enquiry.quote_id || enquiry.id,
          assigned_staff: enquiry.assigned_to || "Duty Manager (Front Desk)"
        };
      } catch (err) {
        return {
          enquiry_id: 101,
          quote_id: 101,
          assigned_staff: "Duty Manager (Front Desk)"
        };
      }
    }

    case "HOSPITALITY_LOOKUP_FAQ": {
      const category = inputs.category || "TIMINGS";
      const faq = db.prepare(`
        SELECT question, answer
        FROM hospitality_faqs
        WHERE property_id = ? AND tenant_id = ? AND category = ? AND is_active = 1
        ORDER BY display_order ASC LIMIT 1
      `).get(propertyId, tenantId, category);

      if (faq) {
        return {
          faq_response: `📌 *${faq.question}*\n\n${faq.answer}`
        };
      }
      return {
        faq_response: "Check-in begins at 2:00 PM and check-out is by 11:00 AM. Breakfast is included with Continental and Half Board packages."
      };
    }

    case "FETCH_PROPERTY_INFO": {
      const prop = db.prepare("SELECT * FROM properties WHERE id = ? AND tenant_id = ?").get(propertyId, tenantId) || {
        name: "Konkan Trip Beach Resort",
        city: "Alibaug, Maharashtra"
      };
      return {
        property_name: prop.name,
        property_city: prop.city
      };
    }

    case "ASSIGN_STAFF": {
      return {
        assigned_officer: "Front Desk Reservations Manager"
      };
    }

    case "B2B_CALCULATE_SALES_QUOTE": {
      const planName = String(inputs.plan_name || "GROWTH").toUpperCase();
      const teamSize = Math.max(1, parseInt(inputs.team_size || 5, 10));
      const monthlyVolume = Math.max(1000, parseInt(inputs.monthly_volume || 25000, 10));

      let basePrice = 7999;
      let baseSeats = 10;
      let baseVolume = 25000;

      if (planName.includes("STARTER")) {
        basePrice = 2999;
        baseSeats = 3;
        baseVolume = 5000;
      } else if (planName.includes("ENTERPRISE")) {
        basePrice = 19999;
        baseSeats = 25;
        baseVolume = 100000;
      }

      const extraSeats = Math.max(0, teamSize - baseSeats);
      const extraSeatsCost = extraSeats * 499;

      const extraVolume = Math.max(0, monthlyVolume - baseVolume);
      const volumeTierCost = Math.round(extraVolume * 0.20);

      const subtotal = basePrice + extraSeatsCost + volumeTierCost;
      const taxPercent = 18;
      const taxTotal = Math.round(subtotal * (taxPercent / 100));
      const grandTotal = subtotal + taxTotal;
      const depositAmount = Math.min(5000, grandTotal);

      return {
        quote_total: grandTotal,
        quote_subtotal: subtotal,
        tax_total: taxTotal,
        tax_percent: taxPercent,
        extra_seats_cost: extraSeatsCost,
        volume_tier_cost: volumeTierCost,
        deposit_amount: depositAmount
      };
    }

    case "B2B_CREATE_SALES_DEAL": {
      const dealId = Math.floor(1000 + Math.random() * 9000);
      return {
        deal_id: dealId,
        assigned_executive: "Enterprise Solutions Architect",
        deal_stage: "QUALIFIED_PROSPECT"
      };
    }

    case "GENERATE_PAYMENT_LINK": {
      const amount = inputs.amount || inputs.quote_total || 5000;
      const payRef = "PAY_" + Math.random().toString(36).substring(2, 8).toUpperCase();
      const paymentLink = `https://survya.flex-us.com/pay/${payRef.toLowerCase()}?amt=${amount}`;
      return {
        payment_link: paymentLink,
        payment_id: payRef,
        payment_status: "PENDING"
      };
    }

    default:
      return {};
  }
}

/**
 * Execute a conversation turn
 */
async function processTurn({
  senderPhone,
  userInput = "",
  userPayload = null,
  startFlowId = null,
  startNodeId = null,
  phoneNumberId = null,
  context = {}
}) {
  const {
    tenantId = 1,
    propertyId = 1,
    channel = "WHATSAPP",
    isSimulation = false,
    simulationState = null,
    flowOverride = null
  } = context;

  // Distinguish pure in-memory simulator (canvas testing) from real/mock webhook flow execution
  const isInMemorySimulation = Boolean(simulationState);

  const effectivePhoneNumberId = phoneNumberId || context.phoneNumberId || null;

  const normalizedPhone = String(senderPhone || "").replace(/\D/g, "");
  const accountScope = effectivePhoneNumberId ? `:${String(effectivePhoneNumberId).trim()}` : "";
  const sessionKey = `${channel}:${normalizedPhone}:${tenantId}${accountScope}`;
  const executionLogs = [];

  // Fetch property details for variable interpolation
  let configuredBusinessName = Number(tenantId) === 1 ? "Hotel Green Vally" : "Business";
  try {
    const { getSetting } = require("../config/database");
    configuredBusinessName = Number(tenantId) === 1 ? (getSetting("BOT_BUSINESS_NAME") || "Hotel Green Vally") : "Business";
  } catch (e) {}

  const prop = db.prepare("SELECT id, name, city, phone FROM properties WHERE id = ? AND tenant_id = ?").get(propertyId, tenantId) || {
    id: 1,
    name: configuredBusinessName,
    city: "Alibaug, Maharashtra"
  };
  if (Number(tenantId) === 1 && configuredBusinessName && configuredBusinessName !== "KonkanTrip Beach Resort & Spa") {
    prop.name = configuredBusinessName;
  }

  let session = null;
  let flow = null;
  let flowVersion = null;
  let nodes = [];
  let transitions = [];
  let collectedData = {};

  if (flowOverride) {
    if (simulationState) {
      session = { ...simulationState };
      session.current_node_id = simulationState.current_node_id || simulationState.currentNodeId;
      collectedData = { ...(session.collectedData || session.collected_data || {}) };
      nodes = flowOverride?.nodes || session.nodes || [];
      transitions = flowOverride?.transitions || session.transitions || [];
    } else {
      session = null;
      nodes = flowOverride.nodes || [];
      transitions = flowOverride.transitions || [];
    }
  } else {
    // 1. Check for active session in DB with strict expiration check against UTC_TIMESTAMP()
    session = getActiveSession(tenantId, normalizedPhone, effectivePhoneNumberId, channel);

    if (session) {
      isResuming = true;
      collectedData = session.collected_data_json ? JSON.parse(session.collected_data_json) : {};

      // Load flow & pinned version
      flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ?").get(session.flow_id);
      flowVersion = db.prepare("SELECT * FROM conversation_flow_versions WHERE id = ?").get(session.flow_version_id);

      if (!flowVersion && flow) {
        flowVersion = db.prepare("SELECT * FROM conversation_flow_versions WHERE flow_id = ? ORDER BY version_number DESC, id DESC LIMIT 1").get(flow.id);
      }

      if (flowVersion) {
        nodes = JSON.parse(flowVersion.nodes_json || "[]");
        transitions = JSON.parse(flowVersion.transitions_json || "[]");
      }
    }
  }

  // 2. If no active session, find matching published flow
  if (!session || (!isInMemorySimulation && !flowVersion)) {
    if (isInMemorySimulation && flowOverride) {
      nodes = flowOverride.nodes || [];
      transitions = flowOverride.transitions || [];
      session = {
        session_key: sessionKey,
        current_node_id: "node_start",
        session_status: "ACTIVE",
        collectedData: {}
      };
      collectedData = {};
    } else {
      const publishedFlows = db.prepare(`
        SELECT f.*, v.id as version_id, v.nodes_json, v.transitions_json, v.variables_json
        FROM conversation_flows f
        JOIN conversation_flow_versions v ON v.id = f.published_version_id
        WHERE f.tenant_id = ? AND f.status = 'PUBLISHED'
        ORDER BY f.is_default DESC, f.priority DESC
      `).all(tenantId);

      if (publishedFlows.length === 0) {
        return {
          handled: false,
          reason: "No published conversation flows available."
        };
      }

      // Match by startFlowId, trigger keyword, or fallback to default
      const inputLower = String(userInput || "").toLowerCase().trim();
      let matchedFlow = null;
      if (startFlowId) {
        matchedFlow = publishedFlows.find(f => String(f.id) === String(startFlowId));
      }
      if (!matchedFlow) {
        matchedFlow = publishedFlows.find(f => {
          if (f.trigger_type === "INBOUND_ANY") return true;
          const kwList = f.trigger_keywords_json ? JSON.parse(f.trigger_keywords_json) : [];
          return kwList.some(kw => inputLower.includes(String(kw).toLowerCase()));
        });
      }

      if (!matchedFlow) {
        matchedFlow = publishedFlows.find(f => f.is_default) || publishedFlows[0];
      }

      flow = matchedFlow;
      flowVersion = { id: matchedFlow.version_id };
      nodes = JSON.parse(matchedFlow.nodes_json || "[]");
      transitions = JSON.parse(matchedFlow.transitions_json || "[]");

      const defaultStartNode = (startNodeId ? nodes.find(n => n.id === startNodeId) : null) || 
                               nodes.find(n => n.type === "START" || n.type === "TRIGGER_WHATSAPP" || n.type === "TRIGGER_EVENT") || 
                               nodes[0];

      let timeoutMinutes = 1440;
      try {
        const { getSetting } = require("../config/database");
        timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "1440", 10);
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 1440;
      } catch (e) {}

      if (!isInMemorySimulation) {
        session = upsertActiveSession({
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: flow.id,
          versionId: flowVersion.id,
          currentNodeId: defaultStartNode?.id || "node_start",
          collectedData: {},
          status: "ACTIVE",
          extendMinutes: timeoutMinutes
        });
      } else {
        session = {
          session_key: sessionKey,
          current_node_id: defaultStartNode?.id || "node_start",
          session_status: "ACTIVE",
          collected_data_json: "{}"
        };
      }
      collectedData = {};
      isResuming = false;
    }
  }

  // Pre-populate system variables
  const variableContext = {
    ...collectedData,
    sender_phone: normalizedPhone,
    business_name: configuredBusinessName || prop.name,
    property: {
      name: configuredBusinessName || prop.name,
      city: prop.city,
      phone: prop.phone
    }
  };

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.id, n));

  const transitionsFrom = new Map();
  transitions.forEach(t => {
    if (!transitionsFrom.has(t.source)) transitionsFrom.set(t.source, []);
    transitionsFrom.get(t.source).push(t.target);
  });

  const startNode = (startNodeId ? nodeMap.get(startNodeId) : null) || 
                    nodes.find(n => n.type === "START" || n.type === "TRIGGER_WHATSAPP" || n.type === "TRIGGER_EVENT") || 
                    nodes[0];

  let currentNode = null;
  if (isResuming && session?.current_node_id && nodeMap.has(session.current_node_id)) {
    currentNode = nodeMap.get(session.current_node_id);
  } else {
    currentNode = startNode;
    isResuming = false;
  }

  // 3. Global Escape Keywords Handling (cancel, restart, reset, menu)
  const normInput = String(userInput || "").trim().toLowerCase();
  const isGlobalCancel = ["cancel", "stop", "exit"].includes(normInput);
  const isGlobalRestart = ["restart", "reset", "menu", "/start", "/menu", "main menu"].includes(normInput);

  if (isGlobalCancel) {
    if (!isInMemorySimulation && session?.id) {
      try {
        db.prepare("UPDATE conversation_flow_sessions SET session_status = 'CANCELLED', updated_at = UTC_TIMESTAMP() WHERE id = ?").run(session.id);
      } catch (e) {}
    }
    return {
      handled: true,
      sessionKey,
      currentNodeId: currentNode?.id || null,
      sessionStatus: "CANCELLED",
      collectedData,
      replyText: "Conversation cancelled. Type 'hi' anytime to start again.",
      executionLogs: [...executionLogs, "Customer requested global cancellation ('cancel'). Session terminated."]
    };
  }

  if (isGlobalRestart) {
    currentNode = startNode;
    collectedData = {};
    Object.keys(variableContext).forEach(k => {
      if (!['sender_phone', 'property', 'business_name'].includes(k)) delete variableContext[k];
    });
    if (!isInMemorySimulation && session?.id) {
      try {
        db.prepare("UPDATE conversation_flow_sessions SET current_node_id = ?, collected_data_json = '{}', session_status = 'ACTIVE', updated_at = UTC_TIMESTAMP() WHERE id = ?").run(startNode.id, session.id);
      } catch (e) {}
    }
    executionLogs.push(`Customer requested restart ('${normInput}'). Reset state and restarted from ${startNode.id}.`);
    isResuming = false;
    userInput = "";
    userPayload = null;
  }

  // 4. Strict Start-to-End State Machine Execution Loop
  let isWaitingForThisNode = isResuming;
  let hops = 0;
  const maxHops = 25;
  let accumulatedReplies = [];
  let interactivePayload = null;
  let pendingDelay = null;
  let finalStatus = "ACTIVE";
  let finalNodeId = currentNode?.id || null;

  while (currentNode && hops < maxHops) {
    hops++;
    const node = currentNode;
    finalNodeId = node.id;
    executionLogs.push(`[Hop ${hops}] Executing [${node.type}] '${node.id}' (waiting=${isWaitingForThisNode})`);

    if (!isInMemorySimulation && (flow || session)) {
      flowAnalyticsService.recordNodeEvent(
        tenantId,
        session?.flow_id || flow?.id || 1,
        node.id,
        'ENTRY',
        { nodeType: node.type }
      );
    }

    const executor = getNodeExecutor(node.type);
    const execRes = await executor.execute(node, {
      session: collectedData,
      userInput: isWaitingForThisNode ? userInput : "",
      userPayload: isWaitingForThisNode ? userPayload : null,
      variableContext,
      dryRun: Boolean(isSimulation),
      fastForward: Boolean(context.fastForward),
      tenantId,
      propertyId,
      phoneNumberId: effectivePhoneNumberId || flow?.phone_number_id || null,
      senderPhone: normalizedPhone,
      flowId: session?.flow_id || flow?.id || 1,
      isWaitingForThisNode
    });

    // Key invariant: isWaitingForThisNode is only true for the initial resumed node in Turn 2+
    isWaitingForThisNode = false;

    if (execRes.replyMessages && execRes.replyMessages.length > 0) {
      accumulatedReplies.push(...execRes.replyMessages);
    }
    if (execRes.replyInteractive) {
      interactivePayload = execRes.replyInteractive;
    }
    if (execRes.updatedData) {
      for (const [k, v] of Object.entries(execRes.updatedData)) {
        collectedData[k] = v;
        variableContext[k] = v;
      }
    }
    if (execRes.traceNote) {
      executionLogs.push(execRes.traceNote);
    }
    if (execRes.pendingDelay) {
      pendingDelay = execRes.pendingDelay;
    }

    if (execRes.action === "WAIT_FOR_INPUT") {
      finalStatus = "ACTIVE";
      if (!isInMemorySimulation && (flow || session)) {
        session = upsertActiveSession({
          sessionId: session?.id,
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: session?.flow_id || flow?.id || 1,
          versionId: session?.flow_version_id || flowVersion?.id || 1,
          currentNodeId: node.id,
          collectedData,
          status: "ACTIVE"
        });
      }
      break;
    }

    if (execRes.action === "WAIT_UNTIL") {
      finalStatus = "ACTIVE";
      if (!isInMemorySimulation && (flow || session)) {
        session = upsertActiveSession({
          sessionId: session?.id,
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: session?.flow_id || flow?.id || 1,
          versionId: session?.flow_version_id || flowVersion?.id || 1,
          currentNodeId: node.id,
          collectedData,
          status: "ACTIVE",
          extendDays: 7
        });
      }
      break;
    }

    if (execRes.action === "HANDOFF") {
      finalStatus = "PAUSED_AGENT_HANDOFF";
      if (!isInMemorySimulation && (flow || session)) {
        flowAnalyticsService.recordNodeEvent(
          tenantId,
          session?.flow_id || flow?.id || 1,
          node.id,
          'HANDOFF',
          { nodeType: node.type }
        );
        session = upsertActiveSession({
          sessionId: session?.id,
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: session?.flow_id || flow?.id || 1,
          versionId: session?.flow_version_id || flowVersion?.id || 1,
          currentNodeId: node.id,
          collectedData,
          status: "PAUSED_AGENT_HANDOFF"
        });
      }
      break;
    }

    if (execRes.action === "COMPLETE") {
      finalStatus = "COMPLETED";
      if (!isInMemorySimulation && (flow || session)) {
        flowAnalyticsService.recordNodeEvent(
          tenantId,
          session?.flow_id || flow?.id || 1,
          node.id,
          'COMPLETION',
          { nodeType: node.type }
        );
        session = upsertActiveSession({
          sessionId: session?.id,
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: session?.flow_id || flow?.id || 1,
          versionId: session?.flow_version_id || flowVersion?.id || 1,
          currentNodeId: node.id,
          collectedData,
          status: "COMPLETED"
        });
      }
      break;
    }

    // Default action: CONTINUE -> Resolve next node transition
    let nextNode = null;
    if (execRes.targetNodeId && nodeMap.has(execRes.targetNodeId)) {
      nextNode = nodeMap.get(execRes.targetNodeId);
    } else {
      nextNode = findNextNode(node.id, execRes.nextHandle || "default", transitions, nodeMap, nodes);
    }
    if (!nextNode) {
      finalStatus = "COMPLETED";
      if (!isInMemorySimulation && (flow || session)) {
        flowAnalyticsService.recordNodeEvent(
          tenantId,
          session?.flow_id || flow?.id || 1,
          node.id,
          'COMPLETION',
          { nodeType: node.type }
        );
        session = upsertActiveSession({
          sessionId: session?.id,
          sessionKey,
          tenantId,
          propertyId,
          channel,
          senderPhone: normalizedPhone,
          flowId: session?.flow_id || flow?.id || 1,
          versionId: session?.flow_version_id || flowVersion?.id || 1,
          currentNodeId: node.id,
          collectedData,
          status: "COMPLETED"
        });
      }
      break;
    }

    if (!isInMemorySimulation && (flow || session)) {
      flowAnalyticsService.recordNodeEvent(
        tenantId,
        session?.flow_id || flow?.id || 1,
        node.id,
        'COMPLETION',
        { nodeType: node.type }
      );
    }

    currentNode = nextNode;
  }

  // Record flow event in DB
  if (!isInMemorySimulation && session?.id) {
    try {
      db.prepare(`
        INSERT INTO conversation_flow_events (
          session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      `).run(
        session.id,
        session.flow_id,
        session.flow_version_id,
        finalNodeId,
        currentNode?.type || "UNKNOWN",
        finalStatus === "COMPLETED" ? "COMPLETE" : finalStatus === "PAUSED_AGENT_HANDOFF" ? "HANDOFF" : "TRANSITION",
        JSON.stringify({ accumulatedReplies, collectedData })
      );
    } catch (e) {}
  }

  const combinedReplyText = accumulatedReplies.join("\n\n");

  return {
    handled: true,
    sessionKey,
    sessionId: session?.id || 1,
    flowId: session?.flow_id || flow?.id || 1,
    flowVersionId: session?.flow_version_id || flowVersion?.id || 1,
    currentNodeId: finalNodeId,
    sessionStatus: finalStatus,
    replyText: combinedReplyText,
    replyInteractive: interactivePayload,
    pendingDelay,
    collectedData,
    executionLogs
  };
}

/**
 * Resumes execution of a session halted at a scheduled delay timer or timeout.
 */
async function resumeScheduledNode({
  sessionId,
  resumeNodeId,
  resumeHandle = "default",
  context = {}
}) {
  const session = db.prepare("SELECT * FROM conversation_flow_sessions WHERE id = ? OR session_key = ?").get(sessionId, sessionId);
  if (!session) {
    throw new Error(`Scheduled resume failed: session "${sessionId}" not found.`);
  }

  const flowVersion = db.prepare("SELECT * FROM conversation_flow_versions WHERE id = ?").get(session.flow_version_id);
  if (!flowVersion) {
    throw new Error(`Scheduled resume failed: flow version "${session.flow_version_id}" not found.`);
  }

  const nodes = JSON.parse(flowVersion.nodes_json || "[]");
  const transitions = JSON.parse(flowVersion.transitions_json || "[]");
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Find target node from resumeNodeId + resumeHandle
  const nextNode = findNextNode(resumeNodeId, resumeHandle, transitions, nodeMap, nodes);
  if (!nextNode) {
    throw new Error(`Scheduled resume failed: no transition found from node "${resumeNodeId}" with handle "${resumeHandle}".`);
  }

  // Update session current_node_id to target node before processing turn
  db.prepare("UPDATE conversation_flow_sessions SET current_node_id = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?").run(nextNode.id, session.id);

  // Execute turn starting from target node
  return processTurn({
    senderPhone: session.sender_phone,
    userInput: "",
    userPayload: null,
    context: {
      ...context,
      tenantId: session.tenant_id,
      propertyId: session.property_id,
      isScheduledResume: true
    }
  });
}

module.exports = {
  normalizePhone,
  toMysqlUtc,
  parseUtcMs,
  getActiveSession,
  upsertActiveSession,
  resolveNextNodeId,
  interpolateVariables,
  parseDateInput,
  parseGuestCounts,
  evaluateConditionRule,
  executeBusinessAction,
  findNextNode,
  resolveNextTransition,
  compactSessionData,
  resumeScheduledNode,
  processTurn
};
