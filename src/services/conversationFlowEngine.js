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
      if (nodeMap && typeof nodeMap.has === "function" && nodeMap.has(match.target)) {
        return nodeMap.get(match.target);
      }
      return { id: match.target, targetNodeId: match.target };
    }
  }

  // 2. Default handle match
  const defaultMatch = outbound.find(t => t.sourceHandle === "default" || !t.sourceHandle);
  if (defaultMatch) {
    if (nodeMap && typeof nodeMap.has === "function" && nodeMap.has(defaultMatch.target)) {
      return nodeMap.get(defaultMatch.target);
    }
    return { id: defaultMatch.target, targetNodeId: defaultMatch.target };
  }

  // 3. If there is only one outbound edge, route along it as universal fallback
  if (outbound.length === 1) {
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

  const effectivePhoneNumberId = phoneNumberId || context.phoneNumberId || null;

  const normalizedPhone = String(senderPhone || "").replace(/\D/g, "");
  const sessionKey = `${channel}:${normalizedPhone}:${tenantId}`;
  const executionLogs = [];

  // Fetch property details for variable interpolation
  let configuredBusinessName = "Hotel Green Vally";
  try {
    const { getSetting } = require("../config/database");
    configuredBusinessName = getSetting("BOT_BUSINESS_NAME") || "Hotel Green Vally";
  } catch (e) {}

  const prop = db.prepare("SELECT id, name, city, phone FROM properties WHERE id = ?").get(propertyId) || {
    id: 1,
    name: configuredBusinessName,
    city: "Alibaug, Maharashtra"
  };
  if (configuredBusinessName && configuredBusinessName !== "KonkanTrip Beach Resort & Spa") {
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
    // 1. Check for active session in DB with strict expiration check
    session = db.prepare(`
      SELECT * FROM conversation_flow_sessions
      WHERE session_key = ? AND session_status = 'ACTIVE'
      LIMIT 1
    `).get(sessionKey);

    if (session) {
      let timeoutMinutes = 1440;
      try {
        const { getSetting } = require("../config/database");
        timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "1440", 10);
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 1440;
      } catch (e) {}

      // Check whether session expired in DB or exceeded inactivity window
      const expCheck = db.prepare("SELECT (? IS NOT NULL AND ? <= NOW()) as is_expired").get(session.expires_at, session.expires_at);
      const lastMs = session.last_interaction_at ? new Date(session.last_interaction_at).getTime() : new Date(session.created_at).getTime();
      const isSessionTimedOut = Boolean(expCheck?.is_expired) || (Date.now() - lastMs > timeoutMinutes * 60 * 1000);

      if (isSessionTimedOut) {
        // Silently mark old session as EXPIRED in DB (Strict mode: NO auto message sent)
        db.prepare(`
          UPDATE conversation_flow_sessions
          SET session_status = 'EXPIRED', updated_at = NOW()
          WHERE id = ?
        `).run(session.id);

        try {
          db.prepare(`
            INSERT INTO conversation_flow_events (
              session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
            ) VALUES (?, ?, ?, ?, 'SESSION_TIMEOUT', 'EXPIRED', ?, NOW())
          `).run(
            session.id,
            session.flow_id,
            session.flow_version_id,
            session.current_node_id || "unknown",
            JSON.stringify({ reason: "INACTIVITY_TIMEOUT", timeoutMinutes, lastInteractionAt: session.last_interaction_at })
          );
        } catch (e) {}

        session = null; // Session expired; fresh journey will start for this new incoming turn
      } else {
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
  }

  // 2. If no active session, find matching published flow
  if (!session || (!isSimulation && !flowVersion)) {
    if (isSimulation && flowOverride) {
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

      const startNode = (startNodeId ? nodes.find(n => n.id === startNodeId) : null) || 
                        nodes.find(n => n.type === "START" || n.type === "TRIGGER_WHATSAPP" || n.type === "TRIGGER_EVENT") || 
                        nodes[0];

      let timeoutMinutes = 1440;
      try {
        const { getSetting } = require("../config/database");
        timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "1440", 10);
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 1440;
      } catch (e) {}

      // Create new session in DB with calculated expires_at (Strict Mode)
      const res = db.prepare(`
        INSERT INTO conversation_flow_sessions (
          session_key, tenant_id, property_id, channel, sender_phone,
          flow_id, flow_version_id, current_node_id, session_status,
          collected_data_json, last_interaction_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', '{}', NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          flow_id = VALUES(flow_id),
          flow_version_id = VALUES(flow_version_id),
          current_node_id = VALUES(current_node_id),
          session_status = 'ACTIVE',
          collected_data_json = '{}',
          last_interaction_at = NOW(),
          expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
          updated_at = NOW()
      `).run(
        sessionKey,
        tenantId,
        propertyId,
        channel,
        normalizedPhone,
        flow.id,
        flowVersion.id,
        startNode.id,
        timeoutMinutes,
        timeoutMinutes
      );

      session = db.prepare("SELECT * FROM conversation_flow_sessions WHERE session_key = ?").get(sessionKey);
      collectedData = {};
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

  let currentNode = nodeMap.get(session.current_node_id || session.currentNodeId);
  if (!currentNode) {
    currentNode = nodes.find(n => n.type === "START") || nodes[0];
  }

  let accumulatedReplies = [];
  let interactivePayload = null;
  let pendingDelay = null;
  let stepCount = 0;
  const maxSteps = 25; // prevent infinite loops
  let inputConsumed = false;

  // 3. Global Escape Keywords Handling (cancel, restart, reset, menu)
  const normInput = String(userInput || "").trim().toLowerCase();
  const isGlobalCancel = ["cancel", "stop", "exit"].includes(normInput);
  const isGlobalRestart = ["restart", "reset", "menu", "/start", "/menu"].includes(normInput);

  if (isGlobalCancel) {
    if (!isSimulation && session?.id) {
      try {
        db.prepare("UPDATE conversation_flow_sessions SET session_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(session.id);
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
    const startNode = nodes.find(n => n.type === "TRIGGER_WHATSAPP" || n.type === "START") || nodes[0];
    currentNode = startNode;
    collectedData = {};
    Object.keys(variableContext).forEach(k => {
      if (!['sender_phone', 'property'].includes(k)) delete variableContext[k];
    });
    if (!isSimulation && session?.id) {
      try {
        db.prepare("UPDATE conversation_flow_sessions SET current_node_id = ?, collected_data_json = '{}', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(startNode.id, session.id);
      } catch (e) {}
    }
    executionLogs.push(`Customer requested restart ('${normInput}'). Reset state and restarted from ${startNode.id}.`);
    inputConsumed = true;
  }

  // 4. Process Input on Waiting Node
  if (!inputConsumed && (userInput || userPayload)) {
    // 3a. Modern COLLECT_INPUT
    if (currentNode.type === "COLLECT_INPUT") {
      const intakeExec = getNodeExecutor("COLLECT_INPUT");
      const execRes = await intakeExec.execute(currentNode, {
        session: collectedData,
        userInput,
        userPayload,
        variableContext,
        isWaitingForThisNode: true
      });

      if (execRes.updatedData) {
        for (const [k, v] of Object.entries(execRes.updatedData)) {
          collectedData[k] = v;
          variableContext[k] = v;
        }
      }
      if (execRes.traceNote) executionLogs.push(execRes.traceNote);

      if (execRes.action === "WAIT_FOR_INPUT") {
        return {
          handled: true,
          sessionKey,
          currentNodeId: currentNode.id,
          sessionStatus: "ACTIVE",
          replyText: execRes.replyMessages ? execRes.replyMessages.join("\n\n") : "Please try again.",
          replyInteractive: null,
          collectedData,
          executionLogs
        };
      }

      inputConsumed = true;
      currentNode = findNextNode(currentNode.id, execRes.nextHandle || "valid", transitions, nodeMap, nodes);
    }
    // 3b. Modern SEND_MESSAGE with options
    else if (currentNode.type === "SEND_MESSAGE" && (currentNode.config?.options || []).length > 0) {
      const msgExec = getNodeExecutor("SEND_MESSAGE");
      const execRes = await msgExec.execute(currentNode, {
        session: collectedData,
        userInput,
        userPayload,
        variableContext,
        isWaitingForThisNode: true
      });

      if (execRes.updatedData) {
        for (const [k, v] of Object.entries(execRes.updatedData)) {
          collectedData[k] = v;
          variableContext[k] = v;
        }
      }
      if (execRes.traceNote) executionLogs.push(execRes.traceNote);

      inputConsumed = true;
      currentNode = findNextNode(currentNode.id, execRes.nextHandle || "default", transitions, nodeMap, nodes);
    }
    // 3c. Modern SEND_WHATSAPP_FLOW
    else if (currentNode.type === "SEND_WHATSAPP_FLOW") {
      const flowExec = getNodeExecutor("SEND_WHATSAPP_FLOW");
      const execRes = await flowExec.execute(currentNode, {
        session: collectedData,
        userInput,
        userPayload,
        variableContext,
        isWaitingForThisNode: true
      });

      if (execRes.updatedData) {
        for (const [k, v] of Object.entries(execRes.updatedData)) {
          collectedData[k] = v;
          variableContext[k] = v;
        }
      }
      if (execRes.traceNote) executionLogs.push(execRes.traceNote);

      inputConsumed = true;
      currentNode = findNextNode(currentNode.id, execRes.nextHandle || "submitted", transitions, nodeMap, nodes);
    }
  }

  const isMenuOrConfirmation = currentNode.type === "BUTTON_MENU" || currentNode.type === "SELECTION" || currentNode.type === "CONFIRMATION";
  const isInputField = currentNode.type === "INPUT_COLLECTION" || currentNode.type === "QUESTION";

  if (isMenuOrConfirmation && (userInput || userPayload)) {
    const rawOptions = currentNode.config?.options && currentNode.config.options.length > 0
      ? currentNode.config.options
      : [
          { id: "opt_confirm", title: "Confirm & Proceed ✅", value: "CONFIRM" },
          { id: "opt_modify", title: "Modify Details ✏️", value: "MODIFY" },
          { id: "opt_staff", title: "Talk to Staff 💬", value: "STAFF" }
        ];

    const choiceValue = userPayload?.id || userPayload?.value || userInput;
    const matchedOpt = matchOption(rawOptions, choiceValue, userInput);
    const normInput = String(choiceValue || userInput).toLowerCase().trim();

    if (!matchedOpt) {
      // Intent Shortcuts & Smart Navigation
      const isDateIntent = choiceValue === "btn_check_avail" || choiceValue === "opt_check_dates" || /^(check\s*dates|check\s*avail|dates|rates|availability)/i.test(normInput);
      const isStaffIntent = choiceValue === "btn_staff" || choiceValue === "opt_talk_agent" || choiceValue === "opt_staff" || /^(talk|staff|human|agent|host|help|call)/i.test(normInput);

      if (isDateIntent) {
        if (!collectedData.selected_room_name && !variableContext.selected_room_name) {
          const defaultRoomName = "Deluxe Garden Villa";
          collectedData.selected_room_name = defaultRoomName;
          variableContext.selected_room_name = defaultRoomName;
        }
        collectedData.enquiry_type = "BOOKING";
        variableContext.enquiry_type = "BOOKING";
        inputConsumed = true;
        const checkinNode = nodes.find(n => n.id === "node_ask_checkin" || n.id === "input_checkin" || (n.config?.variable === "check_in_date"));
        if (checkinNode) {
          currentNode = checkinNode;
        }
      } else if (isStaffIntent) {
        collectedData.enquiry_type = "STAFF";
        variableContext.enquiry_type = "STAFF";
        inputConsumed = true;
        const handoffNode = nodes.find(n => n.type === "HANDOFF" || n.type === "HUMAN_HANDOFF" || n.id === "node_concierge_handoff" || n.id === "handoff_agent");
        if (handoffNode) {
          currentNode = handoffNode;
        }
      } else {
        // Natural date input check: If user typed a date while on a button menu (e.g. "tomorrow" or "2026-12-01")
        const parsedDate = parseDateInput(userInput);
        if (parsedDate) {
          collectedData.check_in_date = parsedDate;
          variableContext.check_in_date = parsedDate;
          if (!collectedData.selected_room_name) {
            collectedData.selected_room_name = "Deluxe Garden Villa";
            variableContext.selected_room_name = "Deluxe Garden Villa";
          }
          collectedData.enquiry_type = "BOOKING";
          variableContext.enquiry_type = "BOOKING";
          inputConsumed = true;
          const checkoutNode = nodes.find(n => n.id === "node_ask_checkout" || n.id === "input_checkout" || (n.config?.variable === "check_out_date"));
          if (checkoutNode) {
            currentNode = checkoutNode;
          }
        } else {
          // Unrecognized input: DO NOT advance to arbitrary node! Re-prompt and stay on current node.
          executionLogs.push(`Unrecognized option '${userInput}' on [${currentNode.type}] '${currentNode.id}'. Re-prompting options.`);
          const promptText = (currentNode.config?.prompt || "Please choose one of the options below:") + "\n\n*(Please choose one of the options to proceed)*";
          return {
            handled: true,
            sessionKey,
            currentNodeId: currentNode.id,
            sessionStatus: "ACTIVE",
            replyText: promptText,
            replyInteractive: {
              type: "BUTTONS",
              options: rawOptions
            },
            collectedData,
            executionLogs
          };
        }
      }
    }

    if (matchedOpt) {
      const valToStore = matchedOpt.value || matchedOpt.id || matchedOpt.title;
      const targetVar = currentNode.config?.variable || (currentNode.type === "CONFIRMATION" ? "confirmation_choice" : "menu_selection");
      collectedData[targetVar] = valToStore;
      variableContext[targetVar] = valToStore;
      inputConsumed = true;

      executionLogs.push(`User answered [${currentNode.type}] '${currentNode.id}': selected '${valToStore}' into '${targetVar}'`);

      // Advance to next node: prioritize option targetNodeId, then explicit edge, then next sequential node
      let nextNodeId = matchedOpt?.targetNodeId;
      if (!nextNodeId || !nodeMap.has(nextNodeId)) {
        const nextTargets = transitionsFrom.get(currentNode.id) || [];
        nextNodeId = nextTargets.length > 0 ? nextTargets[0] : null;
      }

      if (nextNodeId && nodeMap.has(nextNodeId)) {
        currentNode = nodeMap.get(nextNodeId);
      } else {
        const curIdx = nodes.findIndex(n => n.id === currentNode.id);
        currentNode = curIdx >= 0 && curIdx < nodes.length - 1 ? nodes[curIdx + 1] : null;
      }
    }
  } else if (isInputField && userInput) {
    const valConfig = currentNode.config?.validation || {};
    let parsedVal = userInput;
    let isValid = true;
    let validationErrorMsg = valConfig.errorMessage || "Please enter a valid response.";

    if (valConfig.type === "DATE") {
      const dateStr = parseDateInput(userInput);
      if (!dateStr) {
        isValid = false;
        validationErrorMsg = valConfig.errorMessage || "⚠️ Please enter a valid date in YYYY-MM-DD format (or say *tomorrow*), or reply 'menu' to return to the main menu.";
        if (!validationErrorMsg.toLowerCase().includes("menu")) {
          validationErrorMsg += " (or reply 'menu' to return to the main menu)";
        }
      } else {
        parsedVal = dateStr;
      }
    } else if (valConfig.type === "GUEST_PARSER") {
      const counts = parseGuestCounts(userInput, valConfig.defaultAdults, valConfig.defaultChildren);
      parsedVal = `${counts.adults} Adults, ${counts.children} Children`;
      if (valConfig.assignAdultsVariable) {
        collectedData[valConfig.assignAdultsVariable] = counts.adults;
        variableContext[valConfig.assignAdultsVariable] = counts.adults;
      }
      if (valConfig.assignChildrenVariable) {
        collectedData[valConfig.assignChildrenVariable] = counts.children;
        variableContext[valConfig.assignChildrenVariable] = counts.children;
      }
    } else if (valConfig.type === "NUMBER") {
      const num = Number(String(userInput).replace(/[^0-9.]/g, ""));
      if (isNaN(num)) {
        isValid = false;
      } else {
        if (valConfig.min !== undefined && num < Number(valConfig.min)) isValid = false;
        if (valConfig.max !== undefined && num > Number(valConfig.max)) isValid = false;
        parsedVal = num;
      }
    } else if (valConfig.type === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(userInput).trim())) {
        isValid = false;
      } else {
        parsedVal = String(userInput).trim().toLowerCase();
      }
    } else if (valConfig.type === "PHONE") {
      const digits = String(userInput).replace(/\D/g, "");
      if (digits.length < (valConfig.minDigits || 10) || digits.length > (valConfig.maxDigits || 15)) {
        isValid = false;
      } else {
        parsedVal = digits;
      }
    } else if (valConfig.type === "REGEX" && valConfig.regex) {
      try {
        const re = new RegExp(valConfig.regex);
        if (!re.test(String(userInput).trim())) isValid = false;
      } catch (e) {}
    } else if (valConfig.type === "TEXT" && valConfig.minLength) {
      if (String(userInput).trim().length < valConfig.minLength) {
        isValid = false;
      }
    }

    if (!isValid) {
      executionLogs.push(`Validation failed on [${currentNode.type}] '${currentNode.id}': '${userInput}'`);
      return {
        handled: true,
        sessionKey,
        currentNodeId: currentNode.id,
        sessionStatus: "ACTIVE",
        replyText: validationErrorMsg,
        replyInteractive: null,
        collectedData,
        executionLogs
      };
    }

    if (currentNode.config?.variable) {
      collectedData[currentNode.config.variable] = parsedVal;
      variableContext[currentNode.config.variable] = parsedVal;
    }
    inputConsumed = true;

    executionLogs.push(`User input saved on [${currentNode.type}] '${currentNode.id}': ${JSON.stringify(parsedVal)}`);

    // Advance to next node: explicit edge, then next sequential node
    const nextTargets = transitionsFrom.get(currentNode.id) || [];
    let nextNodeId = nextTargets.length > 0 ? nextTargets[0] : null;

    if (nextNodeId && nodeMap.has(nextNodeId)) {
      currentNode = nodeMap.get(nextNodeId);
    } else {
      const curIdx = nodes.findIndex(n => n.id === currentNode.id);
      currentNode = curIdx >= 0 && curIdx < nodes.length - 1 ? nodes[curIdx + 1] : null;
    }
  }

  // 4. Execution Step Loop
  let status = "ACTIVE";
  while (currentNode && stepCount < maxSteps) {
    stepCount++;
    executionLogs.push(`Executing node [${currentNode.type}] '${currentNode.id}': ${currentNode.title || ""}`);

    // Modern Composable Node Executors Check
    const modernTypes = new Set([
      "TRIGGER_WHATSAPP", "TRIGGER_EVENT", "SEND_MESSAGE", "SEND_TEMPLATE",
      "SEND_WHATSAPP_FLOW", "COLLECT_INPUT", "SET_VARIABLE", "WAIT_DELAY",
      "CRM_UPSERT", "CATALOG_BOOKING", "HTTP_WEBHOOK", "HUMAN_HANDOFF"
    ]);

    if (modernTypes.has(currentNode.type)) {
      const executor = getNodeExecutor(currentNode.type);
      const execRes = await executor.execute(currentNode, {
        session: collectedData,
        userInput: inputConsumed ? "" : userInput,
        userPayload: inputConsumed ? null : userPayload,
        variableContext,
        dryRun: Boolean(isSimulation),
        fastForward: Boolean(context.fastForward),
        tenantId,
        propertyId,
        phoneNumberId: effectivePhoneNumberId || flow?.phone_number_id || null,
        senderPhone: normalizedPhone,
        flowId: session?.flow_id || flow?.id || 1,
        isWaitingForThisNode: false
      });

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

      if (execRes.action === "WAIT_FOR_INPUT" || execRes.action === "WAIT_UNTIL") {
        break;
      }
      if (execRes.action === "HANDOFF") {
        status = "PAUSED_AGENT_HANDOFF";
        break;
      }
      if (execRes.action === "COMPLETE") {
        status = "COMPLETED";
        break;
      }

      // Default: CONTINUE
      currentNode = findNextNode(currentNode.id, execRes.nextHandle || "default", transitions, nodeMap, nodes);
      continue;
    }

    if (currentNode.type === "START") {
      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
      continue;
    }

    if (currentNode.type === "MESSAGE") {
      const text = interpolateVariables(currentNode.config?.text || "", variableContext);
      if (text) accumulatedReplies.push(text);

      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
      continue;
    }

    if (currentNode.type === "CONDITION") {
      const varName = currentNode.config?.variable;
      const varValue = variableContext[varName];
      const rules = currentNode.config?.rules || [];
      let targetNodeId = null;

      let matchedRule = false;
      for (const rule of rules) {
        if (rule.targetNodeId && evaluateConditionRule(varValue, rule.operator, rule.value)) {
          targetNodeId = rule.targetNodeId;
          matchedRule = true;
          executionLogs.push(`Condition matched rule: ${varName} ${rule.operator} ${rule.value} -> ${targetNodeId}`);
          break;
        }
      }

      if (!matchedRule && currentNode.config?.defaultTargetNodeId) {
        targetNodeId = currentNode.config.defaultTargetNodeId;
        executionLogs.push(`Condition using default target -> ${targetNodeId}`);
      }

      if (targetNodeId && nodeMap.has(targetNodeId)) {
        currentNode = nodeMap.get(targetNodeId);
        continue;
      }

      // Modern rule evaluation against handle transitions
      const passes = evaluateRules(
        rules.length > 0 ? rules : [{ variable: varName, operator: currentNode.config?.operator || "eq", value: currentNode.config?.value }],
        currentNode.config?.matchMode || "ALL",
        variableContext
      );
      const handle = passes ? "true" : "false";
      const nextFromHandle = findNextNode(currentNode.id, handle, transitions, nodeMap, nodes);
      if (nextFromHandle) {
        executionLogs.push(`Condition evaluated to ${passes ? "TRUE" : "FALSE"} -> ${nextFromHandle.id} [Handle: ${handle}]`);
        currentNode = nextFromHandle;
        continue;
      }

      currentNode = null;
      continue;
    }

    if (currentNode.type === "BUSINESS_ACTION" || currentNode.type === "TRANSACTION" || currentNode.type === "BOOKING") {
      const actionName = currentNode.config?.action;
      const rawInputs = currentNode.config?.inputs || {};
      const resolvedInputs = {};

      for (const [k, v] of Object.entries(rawInputs)) {
        resolvedInputs[k] = typeof v === "string" ? interpolateVariables(v, variableContext) : v;
      }

      executionLogs.push(`Running action '${actionName}' with inputs: ${JSON.stringify(resolvedInputs)}`);

      const outputs = executeBusinessAction(actionName, resolvedInputs, { propertyId, tenantId });
      executionLogs.push(`Action '${actionName}' outputs: ${JSON.stringify(outputs)}`);

      const outputMappings = currentNode.config?.outputs || {};
      for (const [outKey, varTarget] of Object.entries(outputMappings)) {
        if (outputs[outKey] !== undefined) {
          collectedData[varTarget] = outputs[outKey];
          variableContext[varTarget] = outputs[outKey];
        }
      }

      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
      continue;
    }

    if (currentNode.type === "API_INTEGRATION") {
      const { method = "GET", url = "", headers = {}, body = {}, outputMappings = {}, mockResponse = null, successTargetNodeId = null } = currentNode.config || {};
      executionLogs.push(`API_INTEGRATION [${method}] '${url}'`);

      // Safe mock or sandbox response mapping
      const resolvedResponse = mockResponse || {
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        data: { id: "ext_" + Math.random().toString(36).substring(2, 8) }
      };

      for (const [resKey, varTarget] of Object.entries(outputMappings)) {
        if (resolvedResponse[resKey] !== undefined) {
          collectedData[varTarget] = resolvedResponse[resKey];
          variableContext[varTarget] = resolvedResponse[resKey];
        } else if (resolvedResponse.data && resolvedResponse.data[resKey] !== undefined) {
          collectedData[varTarget] = resolvedResponse.data[resKey];
          variableContext[varTarget] = resolvedResponse.data[resKey];
        }
      }

      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = successTargetNodeId ? nodeMap.get(successTargetNodeId) : (nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null);
      continue;
    }

    if (currentNode.type === "PAYMENT") {
      const amountVar = currentNode.config?.amountVariable;
      const rawAmount = amountVar ? variableContext[amountVar] : currentNode.config?.amount;
      const amount = Number(rawAmount) || 5000;
      const currency = currentNode.config?.currency || "INR";
      const desc = interpolateVariables(currentNode.config?.description || "Payment Deposit", variableContext);

      const payRes = executeBusinessAction("GENERATE_PAYMENT_LINK", { amount, currency, description: desc }, { propertyId, tenantId });
      collectedData.payment_link = payRes.payment_link;
      collectedData.payment_id = payRes.payment_id;
      collectedData.payment_status = payRes.payment_status;
      variableContext.payment_link = payRes.payment_link;
      variableContext.payment_id = payRes.payment_id;
      variableContext.payment_status = payRes.payment_status;

      const outputMappings = currentNode.config?.outputs || {};
      for (const [outKey, varTarget] of Object.entries(outputMappings)) {
        if (payRes[outKey] !== undefined) {
          collectedData[varTarget] = payRes[outKey];
          variableContext[varTarget] = payRes[outKey];
        }
      }

      if (currentNode.config?.prompt) {
        const prompt = interpolateVariables(currentNode.config.prompt, variableContext);
        accumulatedReplies.push(prompt);
      }

      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
      continue;
    }

    if (currentNode.type === "QUOTATION") {
      if (currentNode.config?.action) {
        const rawInputs = currentNode.config?.inputs || {};
        const resolvedInputs = {};
        for (const [k, v] of Object.entries(rawInputs)) {
          resolvedInputs[k] = typeof v === "string" ? interpolateVariables(v, variableContext) : v;
        }
        const outputs = executeBusinessAction(currentNode.config.action, resolvedInputs, { propertyId, tenantId });
        const outputMappings = currentNode.config?.outputs || {};
        for (const [outKey, varTarget] of Object.entries(outputMappings)) {
          if (outputs[outKey] !== undefined) {
            collectedData[varTarget] = outputs[outKey];
            variableContext[varTarget] = outputs[outKey];
          }
        }
      }

      if (currentNode.config?.text) {
        const text = interpolateVariables(currentNode.config.text, variableContext);
        if (text) accumulatedReplies.push(text);
      }

      const nextTargets = transitionsFrom.get(currentNode.id) || [];
      currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
      continue;
    }

    if (currentNode.type === "CONFIRMATION") {
      const rawOptions = currentNode.config?.options && currentNode.config.options.length > 0
        ? currentNode.config.options
        : [
            { id: "opt_confirm", title: "Confirm & Proceed ✅", value: "CONFIRM" },
            { id: "opt_modify", title: "Modify Details ✏️", value: "MODIFY" },
            { id: "opt_staff", title: "Talk to Staff 💬", value: "STAFF" }
          ];

      const choiceValue = userPayload?.id || userPayload?.value || userInput;
      if (!inputConsumed && (userInput || userPayload)) {
        const matchedOpt = matchOption(rawOptions, choiceValue, userInput, true);
        if (matchedOpt) {
          const targetVar = currentNode.config?.variable || "confirmation_choice";
          collectedData[targetVar] = matchedOpt.value;
          variableContext[targetVar] = matchedOpt.value;
          inputConsumed = true;
          executionLogs.push(`User input pre-answered [${currentNode.type}] '${currentNode.id}': selected '${matchedOpt.value}' into '${targetVar}'`);
          let nextNodeId = matchedOpt?.targetNodeId;
          if (!nextNodeId || !nodeMap.has(nextNodeId)) {
            const nextTargets = transitionsFrom.get(currentNode.id) || [];
            nextNodeId = nextTargets.length > 0 ? nextTargets[0] : null;
          }
          if (nextNodeId && nodeMap.has(nextNodeId)) {
            currentNode = nodeMap.get(nextNodeId);
          } else {
            const curIdx = nodes.findIndex(n => n.id === currentNode.id);
            currentNode = curIdx >= 0 && curIdx < nodes.length - 1 ? nodes[curIdx + 1] : null;
          }
          continue;
        }
      }

      const prompt = interpolateVariables(currentNode.config?.prompt || "Please confirm your selection:", variableContext);
      accumulatedReplies.push(prompt);

      const formattedOptions = rawOptions.map(o => ({
        id: o.id,
        title: interpolateVariables(o.title || o.id, variableContext).slice(0, 20),
        value: o.value || o.id
      }));

      interactivePayload = {
        type: formattedOptions.length <= 3 ? "button" : "list",
        prompt,
        options: formattedOptions
      };

      // Halt loop and wait for user response on this confirmation node
      break;
    }

    if (currentNode.type === "BUTTON_MENU" || currentNode.type === "SELECTION") {
      const rawOptions = currentNode.config?.options || [];
      const choiceValue = userPayload?.id || userPayload?.value || userInput;

      if (!inputConsumed && (userInput || userPayload)) {
        const matchedOpt = matchOption(rawOptions, choiceValue, userInput, true);
        if (matchedOpt) {
          const targetVar = currentNode.config?.variable || "menu_selection";
          collectedData[targetVar] = matchedOpt.value;
          variableContext[targetVar] = matchedOpt.value;
          inputConsumed = true;
          executionLogs.push(`User intent pre-selected [${currentNode.type}] '${currentNode.id}': '${matchedOpt.value}' into '${targetVar}'`);
          let nextNodeId = matchedOpt?.targetNodeId;
          if (!nextNodeId || !nodeMap.has(nextNodeId)) {
            const nextTargets = transitionsFrom.get(currentNode.id) || [];
            nextNodeId = nextTargets.length > 0 ? nextTargets[0] : null;
          }
          if (nextNodeId && nodeMap.has(nextNodeId)) {
            currentNode = nodeMap.get(nextNodeId);
          } else {
            const curIdx = nodes.findIndex(n => n.id === currentNode.id);
            currentNode = curIdx >= 0 && curIdx < nodes.length - 1 ? nodes[curIdx + 1] : null;
          }
          continue;
        }
      }

      const prompt = interpolateVariables(currentNode.config?.prompt || "Please choose:", variableContext);
      accumulatedReplies.push(prompt);

      const formattedOptions = rawOptions.map(o => ({
        id: o.id,
        title: interpolateVariables(o.title || o.id, variableContext).slice(0, 20), // 20 chars limit
        value: o.value || o.id
      }));

      interactivePayload = {
        type: formattedOptions.length <= 3 ? "button" : "list",
        prompt,
        options: formattedOptions
      };

      // Halt loop and wait for user response on this node
      break;
    }

    if (currentNode.type === "INPUT_COLLECTION" || currentNode.type === "QUESTION") {
      const prompt = interpolateVariables(currentNode.config?.prompt || "Please enter information:", variableContext);
      accumulatedReplies.push(prompt);

      // Halt loop and wait for user response on this node
      break;
    }

    if (currentNode.type === "HANDOFF" || currentNode.type === "HANDOVER") {
      const msg = interpolateVariables(
        currentNode.config?.handoffMessage || "🔔 Transferring you to a live team member...",
        variableContext
      );
      if (msg) accumulatedReplies.push(msg);

      status = "PAUSED_AGENT_HANDOFF";
      executionLogs.push(`Handoff reached: paused automation`);
      break;
    }

    if (currentNode.type === "END") {
      const msg = interpolateVariables(currentNode.config?.farewellMessage || "", variableContext);
      if (msg) accumulatedReplies.push(msg);

      status = "COMPLETED";
      executionLogs.push(`End reached: session completed`);
      break;
    }

    // Default step advance
    const nextTargets = transitionsFrom.get(currentNode.id) || [];
    currentNode = nextTargets.length > 0 ? nodeMap.get(nextTargets[0]) : null;
  }

  const finalNodeId = currentNode ? currentNode.id : "node_end";

  // Update DB session if not in pure in-memory simulation mode
  if (session && session.id && !simulationState) {
    let timeoutMinutes = 1440;
    try {
      const { getSetting } = require("../config/database");
      timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "1440", 10);
      if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 1440;
    } catch (e) {}

    db.prepare(`
      UPDATE conversation_flow_sessions
      SET current_node_id = ?, session_status = ?, collected_data_json = ?,
          last_interaction_at = NOW(),
          expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
          updated_at = NOW()
      WHERE id = ?
    `).run(
      finalNodeId,
      status,
      JSON.stringify(collectedData),
      timeoutMinutes,
      session.id
    );

    // Record flow event
    try {
      db.prepare(`
        INSERT INTO conversation_flow_events (
          session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        session.id,
        session.flow_id,
        session.flow_version_id,
        finalNodeId,
        currentNode?.type || "UNKNOWN",
        status === "COMPLETED" ? "COMPLETE" : status === "PAUSED_AGENT_HANDOFF" ? "HANDOFF" : "TRANSITION",
        JSON.stringify({ accumulatedReplies, collectedData })
      );
    } catch (e) {}
  }

  const combinedReplyText = accumulatedReplies.join("\n\n");

  return {
    handled: true,
    sessionKey,
    sessionId: session?.id || 1,
    flowId: session?.flow_id || 1,
    flowVersionId: session?.flow_version_id || 1,
    currentNodeId: finalNodeId,
    sessionStatus: status,
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
  db.prepare("UPDATE conversation_flow_sessions SET current_node_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(nextNode.id, session.id);

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
  interpolateVariables,
  parseDateInput,
  parseGuestCounts,
  evaluateConditionRule,
  executeBusinessAction,
  findNextNode,
  resolveNextTransition,
  resumeScheduledNode,
  processTurn
};
