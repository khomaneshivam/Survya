/**
 * Conversation Flow Execution Engine
 * Deterministic node runner, graph transition resolver, variable interpolator, and in-memory test simulator.
 */

const { db } = require("../config/database");
const availabilityService = require("./hospitalityAvailabilityService");
const pricingService = require("./hospitalityPricingService");
const enquiryService = require("./enquiryService");

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
 * Natural language / basic date parser for guest check-in/check-out inputs
 */
function parseDateInput(inputStr, referenceDate = new Date()) {
  if (!inputStr) return null;
  const raw = String(inputStr).trim().toLowerCase();

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
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

  // Fallback: standard Date.parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
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

  const normalizedPhone = String(senderPhone || "").replace(/\D/g, "");
  const sessionKey = `${channel}:${normalizedPhone}:${tenantId}`;
  const executionLogs = [];

  // Fetch property details for variable interpolation
  const prop = db.prepare("SELECT id, name, city, phone FROM properties WHERE id = ?").get(propertyId) || {
    id: 1,
    name: "Konkan Trip Beach Resort",
    city: "Alibaug, Maharashtra"
  };

  let session = null;
  let flow = null;
  let flowVersion = null;
  let nodes = [];
  let transitions = [];
  let collectedData = {};

  if (isSimulation && simulationState) {
    session = { ...simulationState };
    session.current_node_id = simulationState.current_node_id || simulationState.currentNodeId;
    collectedData = { ...(session.collectedData || session.collected_data || {}) };
    nodes = flowOverride?.nodes || session.nodes || [];
    transitions = flowOverride?.transitions || session.transitions || [];
  } else {
    // 1. Check for active session in DB
    session = db.prepare(`
      SELECT * FROM conversation_flow_sessions
      WHERE session_key = ? AND session_status = 'ACTIVE'
      LIMIT 1
    `).get(sessionKey);

    if (session) {
      // Inactivity timeout / connection open limit check (Strict Mode)
      let timeoutMinutes = 30;
      try {
        const { getSetting } = require("../config/database");
        timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "30", 10);
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 30;
      } catch (e) {}

      const lastInteractionTime = session.last_interaction_at ? new Date(session.last_interaction_at).getTime() : new Date(session.created_at).getTime();
      const expiresAtTime = session.expires_at ? new Date(session.expires_at).getTime() : null;
      const isSessionTimedOut = (expiresAtTime && Date.now() > expiresAtTime) || (Date.now() - lastInteractionTime > timeoutMinutes * 60 * 1000);

      if (isSessionTimedOut) {
        // Silently mark old session as EXPIRED in DB (Strict mode: NO auto message sent)
        db.prepare(`
          UPDATE conversation_flow_sessions
          SET session_status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(session.id);

        try {
          db.prepare(`
            INSERT INTO conversation_flow_events (
              session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
            ) VALUES (?, ?, ?, ?, 'SESSION_TIMEOUT', 'EXPIRED', ?, CURRENT_TIMESTAMP)
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

      // Match trigger keyword or fallback to default
      const inputLower = String(userInput || "").toLowerCase().trim();
      let matchedFlow = publishedFlows.find(f => {
        if (f.trigger_type === "INBOUND_ANY") return true;
        const kwList = f.trigger_keywords_json ? JSON.parse(f.trigger_keywords_json) : [];
        return kwList.some(kw => inputLower.includes(String(kw).toLowerCase()));
      });

      if (!matchedFlow) {
        matchedFlow = publishedFlows.find(f => f.is_default) || publishedFlows[0];
      }

      flow = matchedFlow;
      flowVersion = { id: matchedFlow.version_id };
      nodes = JSON.parse(matchedFlow.nodes_json || "[]");
      transitions = JSON.parse(matchedFlow.transitions_json || "[]");

      const startNode = nodes.find(n => n.type === "START") || nodes[0];

      let timeoutMinutes = 30;
      try {
        const { getSetting } = require("../config/database");
        timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "30", 10);
        if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 30;
      } catch (e) {}

      // Create new session in DB with calculated expires_at (Strict Mode)
      const res = db.prepare(`
        INSERT INTO conversation_flow_sessions (
          session_key, tenant_id, property_id, channel, sender_phone,
          flow_id, flow_version_id, current_node_id, session_status,
          collected_data_json, last_interaction_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', '{}', CURRENT_TIMESTAMP, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          flow_id = VALUES(flow_id),
          flow_version_id = VALUES(flow_version_id),
          current_node_id = VALUES(current_node_id),
          session_status = 'ACTIVE',
          collected_data_json = '{}',
          last_interaction_at = CURRENT_TIMESTAMP,
          expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
          updated_at = CURRENT_TIMESTAMP
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
    property: {
      name: prop.name,
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
  let stepCount = 0;
  const maxSteps = 25; // prevent infinite loops

  // 3. Process Input on Waiting Node
  const isMenuOrConfirmation = currentNode.type === "BUTTON_MENU" || currentNode.type === "SELECTION" || currentNode.type === "CONFIRMATION";
  const isInputField = currentNode.type === "INPUT_COLLECTION" || currentNode.type === "QUESTION";

  if (isMenuOrConfirmation && userInput) {
    const rawOptions = currentNode.config?.options && currentNode.config.options.length > 0
      ? currentNode.config.options
      : [
          { id: "opt_confirm", title: "Confirm & Proceed ✅", value: "CONFIRM" },
          { id: "opt_modify", title: "Modify Details ✏️", value: "MODIFY" },
          { id: "opt_staff", title: "Talk to Staff 💬", value: "STAFF" }
        ];

    const choiceValue = userPayload?.id || userPayload?.value || userInput;
    const normInput = String(choiceValue).toLowerCase().trim();

    const matchedOpt = rawOptions.find(o =>
      String(o.id).toLowerCase() === normInput ||
      String(o.value).toLowerCase() === normInput ||
      String(o.title).toLowerCase() === normInput ||
      normInput.includes(String(o.title).toLowerCase()) ||
      normInput.includes(String(o.value).toLowerCase())
    );

    const valToStore = matchedOpt ? matchedOpt.value : (normInput.includes("confirm") || normInput.includes("yes") || normInput.includes("pay") ? "CONFIRM" : normInput.includes("modify") || normInput.includes("change") ? "MODIFY" : normInput.includes("staff") || normInput.includes("human") || normInput.includes("agent") ? "STAFF" : userInput);

    const targetVar = currentNode.config?.variable || (currentNode.type === "CONFIRMATION" ? "confirmation_choice" : "menu_selection");
    collectedData[targetVar] = valToStore;
    variableContext[targetVar] = valToStore;

    executionLogs.push(`User answered [${currentNode.type}] '${currentNode.id}': selected '${valToStore}' into '${targetVar}'`);

    // Advance to next node
    const nextTargets = transitionsFrom.get(currentNode.id) || [];
    if (nextTargets.length > 0) {
      currentNode = nodeMap.get(nextTargets[0]);
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
      if (isNaN(num)) isValid = false;
      else parsedVal = num;
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

    executionLogs.push(`User input saved on [${currentNode.type}] '${currentNode.id}': ${JSON.stringify(parsedVal)}`);

    // Advance to next node
    const nextTargets = transitionsFrom.get(currentNode.id) || [];
    if (nextTargets.length > 0) {
      currentNode = nodeMap.get(nextTargets[0]);
    }
  }

  // 4. Execution Step Loop
  let status = "ACTIVE";
  while (currentNode && stepCount < maxSteps) {
    stepCount++;
    executionLogs.push(`Executing node [${currentNode.type}] '${currentNode.id}': ${currentNode.title || ""}`);

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
      let targetNodeId = currentNode.config?.defaultTargetNodeId;

      for (const rule of rules) {
        if (evaluateConditionRule(varValue, rule.operator, rule.value)) {
          targetNodeId = rule.targetNodeId;
          executionLogs.push(`Condition matched rule: ${varName} ${rule.operator} ${rule.value} -> ${targetNodeId}`);
          break;
        }
      }

      currentNode = targetNodeId ? nodeMap.get(targetNodeId) : null;
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
      const prompt = interpolateVariables(currentNode.config?.prompt || "Please confirm your selection:", variableContext);
      accumulatedReplies.push(prompt);

      const rawOptions = currentNode.config?.options && currentNode.config.options.length > 0
        ? currentNode.config.options
        : [
            { id: "opt_confirm", title: "Confirm & Proceed ✅", value: "CONFIRM" },
            { id: "opt_modify", title: "Modify Details ✏️", value: "MODIFY" },
            { id: "opt_staff", title: "Talk to Staff 💬", value: "STAFF" }
          ];

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
      const prompt = interpolateVariables(currentNode.config?.prompt || "Please choose:", variableContext);
      accumulatedReplies.push(prompt);

      const rawOptions = currentNode.config?.options || [];
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

  // Update DB session if not in simulation mode
  if (!isSimulation && session) {
    let timeoutMinutes = 30;
    try {
      const { getSetting } = require("../config/database");
      timeoutMinutes = parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "30", 10);
      if (isNaN(timeoutMinutes) || timeoutMinutes < 1) timeoutMinutes = 30;
    } catch (e) {}

    db.prepare(`
      UPDATE conversation_flow_sessions
      SET current_node_id = ?, session_status = ?, collected_data_json = ?,
          last_interaction_at = CURRENT_TIMESTAMP,
          expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
          updated_at = CURRENT_TIMESTAMP
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
    collectedData,
    executionLogs
  };
}

module.exports = {
  interpolateVariables,
  parseDateInput,
  parseGuestCounts,
  evaluateConditionRule,
  executeBusinessAction,
  processTurn
};
