/**
 * Browser-preview graph sanitizer and simulator.
 *
 * This module is deliberately dependency-free: it does not import the normal
 * flow engine, node executors, network clients, or persistence services. That
 * keeps public preview execution strictly local and side-effect free.
 */

const MAX_NODES = 250;
const MAX_TRANSITIONS = 600;
const MAX_STATE_FIELDS = 60;
const MAX_TRACE_ITEMS = 40;
const MAX_HOPS = 30;

const TOKEN_LIKE_VALUE = /(?:bearer\s+|api[ _-]?key|secret|password|authorization|token\s*[:=]|sk-[a-z0-9_-]{8,}|xox[baprs]-)/i;
const SENSITIVE_URL = /:\/\/[^/\s:@]+:[^/\s@]+@/;
const SAFE_CONFIG_TEXT_KEYS = [
  "text", "messageText", "prompt", "caption", "farewellMessage", "retryMessage",
  "errorMessage", "variable", "saveAs", "inputType", "validationType", "messageType",
  "listButtonText", "listTitle", "flowTitle", "flowCta", "placeholder", "label",
  "operator", "value", "matchMode", "conditionMatch", "defaultTargetNodeId",
  "targetNodeId", "queryVariable", "action", "description"
];

function text(value, maxLength = 1000) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value).replace(/\0/g, "").trim();
  if (!stringValue) return "";
  if (TOKEN_LIKE_VALUE.test(stringValue) || SENSITIVE_URL.test(stringValue)) return "[redacted]";
  return stringValue.slice(0, maxLength);
}

function identifier(value, maxLength = 128) {
  return text(value, maxLength).replace(/[\r\n]/g, " ");
}

function finiteNumber(value, fallback = null, min = -100000, max = 100000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readNodeConfig(node) {
  // Some older canvas records keep display-safe configuration under `data`.
  // Only explicitly allowlisted fields are copied below.
  return { ...plainObject(node?.data), ...plainObject(node?.config) };
}

function sanitizePrimitive(value, maxLength = 500) {
  if (typeof value === "string") return text(value, maxLength);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return "";
}

function sanitizeOption(option, index) {
  const raw = plainObject(option);
  const id = identifier(raw.id || raw.value || `option_${index + 1}`, 96);
  if (!id) return null;
  return {
    id,
    title: text(raw.title || raw.label || id, 240),
    value: sanitizePrimitive(raw.value === undefined ? id : raw.value, 300)
  };
}

function sanitizeRule(rule) {
  const raw = plainObject(rule);
  const variable = identifier(raw.variable, 128);
  const operator = identifier(raw.operator || "equals", 48).toLowerCase();
  if (!variable) return null;
  return {
    variable,
    operator,
    value: sanitizePrimitive(raw.value, 300),
    targetNodeId: identifier(raw.targetNodeId, 128)
  };
}

function sanitizeNode(rawNode, index) {
  const raw = plainObject(rawNode);
  const id = identifier(raw.id || `node_${index + 1}`, 128);
  const type = identifier(raw.type || "UNKNOWN", 64).toUpperCase();
  if (!id || !type) return null;

  const rawConfig = readNodeConfig(raw);
  const config = {};
  for (const key of SAFE_CONFIG_TEXT_KEYS) {
    if (rawConfig[key] === undefined || rawConfig[key] === null) continue;
    const value = sanitizePrimitive(rawConfig[key], key === "text" || key === "messageText" || key === "prompt" ? 4000 : 800);
    if (value !== "") config[key] = value;
  }

  if (Array.isArray(rawConfig.options)) {
    config.options = rawConfig.options
      .slice(0, 20)
      .map(sanitizeOption)
      .filter(Boolean);
  }

  if (Array.isArray(rawConfig.rules)) {
    config.rules = rawConfig.rules
      .slice(0, 30)
      .map(sanitizeRule)
      .filter(Boolean);
  }

  const maxRetries = finiteNumber(rawConfig.maxRetries, null, 0, 10);
  if (maxRetries !== null) config.maxRetries = Math.round(maxRetries);

  const node = {
    id,
    type,
    title: text(raw.title || raw.label || type, 300),
    config
  };

  const position = plainObject(raw.position);
  const x = finiteNumber(position.x, null, -10000, 10000);
  const y = finiteNumber(position.y, null, -10000, 10000);
  if (x !== null || y !== null) node.position = { x: x ?? 0, y: y ?? 0 };

  return node;
}

function sanitizeTransition(rawTransition, index, nodeIds) {
  const raw = plainObject(rawTransition);
  const source = identifier(raw.source || raw.from, 128);
  const target = identifier(raw.target || raw.to, 128);
  if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return null;

  return {
    id: identifier(raw.id || `transition_${index + 1}`, 128),
    source,
    target,
    sourceHandle: identifier(raw.sourceHandle || raw.optionId || (raw.condition === undefined ? "default" : raw.condition), 128) || "default",
    label: text(raw.label, 240)
  };
}

/**
 * Produces a frozen, public-safe graph. It intentionally does not include raw
 * node config, headers, URLs, API keys, tenant identifiers, phone IDs, or
 * variables. This function can safely be called again when reading a snapshot.
 */
function sanitizePreviewGraph(rawGraph = {}) {
  const raw = plainObject(rawGraph);
  const sourceNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  if (sourceNodes.length === 0) throw new Error("The draft has no nodes to preview.");
  if (sourceNodes.length > MAX_NODES) throw new Error(`A browser preview supports at most ${MAX_NODES} nodes.`);

  const seenIds = new Set();
  const nodes = [];
  for (let index = 0; index < sourceNodes.length; index += 1) {
    const node = sanitizeNode(sourceNodes[index], index);
    if (!node || seenIds.has(node.id)) continue;
    seenIds.add(node.id);
    nodes.push(node);
  }
  if (nodes.length === 0) throw new Error("The draft has no valid nodes to preview.");

  const sourceTransitions = Array.isArray(raw.transitions) ? raw.transitions : [];
  if (sourceTransitions.length > MAX_TRANSITIONS) throw new Error(`A browser preview supports at most ${MAX_TRANSITIONS} transitions.`);
  const transitions = sourceTransitions
    .map((transition, index) => sanitizeTransition(transition, index, seenIds))
    .filter(Boolean);

  const startNode = nodes.find(node => ["START", "TRIGGER_WHATSAPP", "TRIGGER_EVENT"].includes(node.type)) || nodes[0];
  return {
    schemaVersion: 1,
    title: text(raw.title || raw.name || "Flow preview", 255),
    description: text(raw.description, 1200),
    startNodeId: startNode.id,
    nodes,
    transitions
  };
}

function cleanStateValue(value, depth = 0) {
  if (depth > 2) return "[truncated]";
  if (typeof value === "string") return text(value, 1000);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map(item => cleanStateValue(item, depth + 1));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value).slice(0, 20)) {
      const safeKey = identifier(key, 80);
      if (safeKey) result[safeKey] = cleanStateValue(child, depth + 1);
    }
    return result;
  }
  return "";
}

function cleanStateData(value) {
  const input = plainObject(value);
  const result = {};
  for (const [key, child] of Object.entries(input).slice(0, MAX_STATE_FIELDS)) {
    const safeKey = identifier(key, 80);
    if (safeKey) result[safeKey] = cleanStateValue(child);
  }
  return result;
}

function normalizeSimulationState(rawState, graph) {
  const raw = plainObject(rawState);
  const validNodeIds = new Set((graph?.nodes || []).map(node => node.id));
  const currentNodeId = identifier(raw.currentNodeId, 128);
  const retryCountsRaw = plainObject(raw.retryCounts);
  const retryCounts = {};
  for (const [key, value] of Object.entries(retryCountsRaw).slice(0, 30)) {
    const safeKey = identifier(key, 128);
    if (!safeKey || !validNodeIds.has(safeKey)) continue;
    retryCounts[safeKey] = Math.round(finiteNumber(value, 0, 0, 10));
  }

  return {
    currentNodeId: validNodeIds.has(currentNodeId) ? currentNodeId : null,
    collectedData: cleanStateData(raw.collectedData),
    retryCounts
  };
}

function getPath(object, path) {
  if (!path || typeof path !== "string") return undefined;
  return path.split(".").slice(0, 8).reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, object);
}

function interpolate(template, variables) {
  return text(template, 4000).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawPath) => {
    const value = getPath(variables, String(rawPath).trim());
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return "[value]";
    return text(value, 500);
  });
}

function normalizeComparable(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function evaluateRule(actualValue, operator, expectedValue) {
  const op = String(operator || "equals").toLowerCase();
  const actual = normalizeComparable(actualValue);
  const expected = normalizeComparable(expectedValue);
  switch (op) {
    case "equals": case "eq": case "=": return actual === expected;
    case "not_equals": case "neq": case "!=": return actual !== expected;
    case "contains": return actual.includes(expected);
    case "not_contains": return !actual.includes(expected);
    case "exists": case "is_set": return actual !== "";
    case "not_exists": case "is_empty": return actual === "";
    case "greater_than": case "gt": return Number(actualValue) > Number(expectedValue);
    case "greater_than_or_equal": case "gte": return Number(actualValue) >= Number(expectedValue);
    case "less_than": case "lt": return Number(actualValue) < Number(expectedValue);
    case "less_than_or_equal": case "lte": return Number(actualValue) <= Number(expectedValue);
    default: return actual === expected;
  }
}

function chooseTransition(graph, nodeId, requestedHandle = "default") {
  const outbound = (graph.transitions || []).filter(transition => transition.source === nodeId);
  if (outbound.length === 0) {
    const index = graph.nodes.findIndex(node => node.id === nodeId);
    return index >= 0 ? graph.nodes[index + 1]?.id || null : null;
  }

  const handle = String(requestedHandle || "default");
  const aliases = {
    selected: ["selected", "item_selected", "valid", "success", "default"],
    item_selected: ["item_selected", "selected", "valid", "success", "default"],
    valid: ["valid", "success", "true", "default"],
    success: ["success", "valid", "true", "default"],
    true: ["true", "valid", "success", "default"],
    false: ["false", "failure", "error", "default"],
    failure: ["failure", "error", "default"],
    error: ["error", "failure", "default"],
    submitted: ["submitted", "success", "default"],
    delivered: ["delivered", "success", "default"],
    after_delay: ["after_delay", "timeout", "default"]
  };
  const candidates = aliases[handle] || [handle, "default"];
  for (const candidate of candidates) {
    const match = outbound.find(transition => String(transition.sourceHandle || "default") === candidate);
    if (match) return match.target;
  }
  return outbound.length === 1 ? outbound[0].target : null;
}

function matchOption(options, input, selectedOptionId) {
  const selected = normalizeComparable(selectedOptionId);
  const typed = normalizeComparable(input);
  if (selected) {
    const found = options.find(option => normalizeComparable(option.id) === selected || normalizeComparable(option.value) === selected);
    if (found) return found;
  }
  if (typed) {
    const byText = options.find(option =>
      normalizeComparable(option.id) === typed ||
      normalizeComparable(option.value) === typed ||
      normalizeComparable(option.title) === typed
    );
    if (byText) return byText;
    if (/^\d+$/.test(typed)) {
      const index = Number(typed) - 1;
      if (index >= 0 && index < options.length) return options[index];
    }
  }
  return null;
}

function validPreviewInput(input, inputType) {
  const value = String(input || "").trim();
  const type = String(inputType || "TEXT").toUpperCase();
  if (!value) return false;
  if (type === "EMAIL") return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  if (type === "PHONE") return value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15;
  if (type === "NUMBER") return Number.isFinite(Number(value.replace(/,/g, "")));
  // Date/regex rules are intentionally not evaluated in a public simulator.
  // A non-empty response demonstrates the routing without running arbitrary regex.
  return true;
}

function isInputNode(type) {
  return ["COLLECT_INPUT", "INPUT_COLLECTION", "QUESTION", "FORM_INPUT"].includes(type);
}

function isMessageNode(type) {
  return ["SEND_MESSAGE", "MESSAGE", "TEXT", "BUTTON_MENU", "CONFIRMATION", "PAYMENT"].includes(type);
}

function isExternalActionNode(type) {
  return [
    "HTTP_WEBHOOK", "API_INTEGRATION", "CRM_UPSERT", "CATALOG_BOOKING", "BUSINESS_ACTION",
    "TRANSACTION", "BOOKING", "QUOTATION", "SEND_TEMPLATE", "SEND_WHATSAPP_FLOW",
    "AI_KNOWLEDGE_REPLY", "AI_REPLY", "AI_HYBRID", "INAPP_BRIDGE", "ADDON_QUOTE"
  ].includes(type);
}

function reply({ graph, state, status = "ACTIVE", currentNodeId = null, messages = [], interactive = null, trace = [], terminal = false, pendingDelay = null }) {
  return {
    mode: "BROWSER_ONLY_DRY_RUN",
    status,
    terminal,
    currentNodeId,
    replyText: messages.filter(Boolean).join("\n\n"),
    messages: messages.filter(Boolean).slice(0, 10),
    interactive,
    pendingDelay,
    trace: trace.slice(0, MAX_TRACE_ITEMS),
    state: {
      currentNodeId,
      collectedData: cleanStateData(state.collectedData),
      retryCounts: state.retryCounts
    },
    safety: {
      browserOnly: true,
      dryRun: true,
      outboundMessaging: false,
      externalRequests: false,
      persistence: false,
      codeExecution: false
    }
  };
}

/**
 * Executes only this sanitized graph in local memory. No call from this
 * function can dispatch a message, call an integration, or write application
 * data. Unsupported/external nodes are rendered as explicit simulated steps.
 */
function simulateBrowserPreview(graph, { input = "", selectedOptionId = "", state: rawState = null } = {}) {
  const safeGraph = sanitizePreviewGraph(graph);
  const state = normalizeSimulationState(rawState, safeGraph);
  const nodeMap = new Map(safeGraph.nodes.map(node => [node.id, node]));
  const cleanInput = text(input, 2000);
  const cleanSelectedOptionId = identifier(selectedOptionId, 128);
  let currentNodeId = state.currentNodeId || safeGraph.startNodeId;
  let resumed = Boolean(state.currentNodeId);
  let inputConsumed = false;
  const messages = [];
  const trace = [];

  for (let hops = 0; hops < MAX_HOPS && currentNodeId; hops += 1) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;
    const config = node.config || {};
    trace.push(`Simulated ${node.type} (${node.id})`);

    if (["END", "END_CONVERSATION", "TERMINATE"].includes(node.type)) {
      const farewell = interpolate(config.farewellMessage || config.text || "Preview complete.", state.collectedData);
      if (farewell) messages.push(farewell);
      return reply({ graph: safeGraph, state, status: "COMPLETED", messages, trace, terminal: true });
    }

    if (["HANDOFF", "HUMAN_HANDOFF"].includes(node.type)) {
      messages.push(interpolate(config.text || config.prompt || "This flow would hand off to a team member. In browser preview, no handoff is created.", state.collectedData));
      return reply({ graph: safeGraph, state, status: "HANDOFF_SIMULATED", currentNodeId: node.id, messages, trace, terminal: true });
    }

    if (isMessageNode(node.type)) {
      const options = Array.isArray(config.options) ? config.options : [];
      if (resumed && options.length > 0 && !inputConsumed) {
        const selection = matchOption(options, cleanInput, cleanSelectedOptionId);
        inputConsumed = true;
        if (selection) {
          state.collectedData[config.variable || "selected_option"] = selection.value || selection.id;
          state.collectedData.selected_option_title = selection.title;
          currentNodeId = chooseTransition(safeGraph, node.id, selection.id);
          resumed = false;
          continue;
        }
        messages.push("Please choose one of the available options.");
        return reply({
          graph: safeGraph,
          state,
          currentNodeId: node.id,
          messages,
          interactive: { type: "BUTTONS", text: interpolate(config.text || config.messageText || "Choose an option", state.collectedData), options },
          trace
        });
      }

      const message = interpolate(config.text || config.messageText || config.prompt || "", state.collectedData);
      if (message) messages.push(message);
      if (options.length > 0) {
        return reply({
          graph: safeGraph,
          state,
          currentNodeId: node.id,
          messages,
          interactive: { type: "BUTTONS", text: message, options },
          trace
        });
      }
      currentNodeId = chooseTransition(safeGraph, node.id, "default");
      resumed = false;
      continue;
    }

    if (isInputNode(node.type)) {
      const variable = config.saveAs || config.variable || "user_input";
      if (resumed && !inputConsumed) {
        inputConsumed = true;
        if (validPreviewInput(cleanInput, config.inputType || config.validationType)) {
          state.collectedData[variable] = cleanInput;
          state.retryCounts[node.id] = 0;
          currentNodeId = chooseTransition(safeGraph, node.id, "valid");
          resumed = false;
          continue;
        }

        const retryCount = Math.min(10, Number(state.retryCounts[node.id] || 0) + 1);
        state.retryCounts[node.id] = retryCount;
        const maxRetries = Number(config.maxRetries ?? 3);
        if (retryCount > maxRetries) {
          state.retryCounts[node.id] = 0;
          currentNodeId = chooseTransition(safeGraph, node.id, "max_retries");
          resumed = false;
          continue;
        }
        messages.push(interpolate(config.retryMessage || config.errorMessage || "Please enter a valid response.", state.collectedData));
        return reply({ graph: safeGraph, state, currentNodeId: node.id, messages, trace });
      }

      messages.push(interpolate(config.prompt || `Please provide ${variable}:`, state.collectedData));
      state.retryCounts[node.id] = 0;
      return reply({ graph: safeGraph, state, currentNodeId: node.id, messages, trace });
    }

    if (node.type === "CONDITION") {
      const rules = Array.isArray(config.rules) ? config.rules : [];
      let matchingRule = null;
      for (const rule of rules) {
        if (evaluateRule(getPath(state.collectedData, rule.variable), rule.operator, rule.value)) {
          matchingRule = rule;
          break;
        }
      }
      currentNodeId = matchingRule?.targetNodeId || chooseTransition(safeGraph, node.id, matchingRule ? "true" : "false");
      resumed = false;
      continue;
    }

    if (["START", "TRIGGER_WHATSAPP", "TRIGGER_EVENT", "TRIGGER"].includes(node.type)) {
      currentNodeId = chooseTransition(safeGraph, node.id, "default");
      resumed = false;
      continue;
    }

    if (["WAIT_DELAY", "DELAY", "WAIT_UNTIL"].includes(node.type)) {
      trace.push("Delay skipped in browser-only preview; no timer was scheduled.");
      currentNodeId = chooseTransition(safeGraph, node.id, "after_delay");
      resumed = false;
      continue;
    }

    if (isExternalActionNode(node.type)) {
      const label = node.title || node.type;
      messages.push(`${label} was simulated locally. No WhatsApp message, Meta request, AI request, webhook, CRM write, or external action was run.`);
      const handle = node.type === "SEND_TEMPLATE" ? "delivered" : node.type === "SEND_WHATSAPP_FLOW" ? "submitted" : "success";
      currentNodeId = chooseTransition(safeGraph, node.id, handle);
      resumed = false;
      continue;
    }

    messages.push(`${node.title || node.type} is shown as a simulated preview step.`);
    currentNodeId = chooseTransition(safeGraph, node.id, "default");
    resumed = false;
  }

  if (currentNodeId) {
    messages.push("Preview stopped after the safe simulation limit was reached.");
    return reply({ graph: safeGraph, state, status: "SIMULATION_LIMIT", currentNodeId, messages, trace, terminal: true });
  }

  return reply({ graph: safeGraph, state, status: "COMPLETED", messages, trace, terminal: true });
}

module.exports = {
  MAX_NODES,
  MAX_TRANSITIONS,
  sanitizePreviewGraph,
  normalizeSimulationState,
  simulateBrowserPreview
};
