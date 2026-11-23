/**
 * Conversation Flow Service
 * Enterprise-grade CRUD, graph validation, immutable versioning, rollback, and template operations.
 */

const crypto = require("crypto");
const { db } = require("../config/database");
const { invalidateFlow, invalidateTriggers } = require("./workflow/runtimeCache");
const flowApprovalService = require("./flowApprovalService");
const { getNodeExecutor } = require("./workflow/nodeExecutors");

/**
 * Audit log helper
 */
function logAudit(tenantId, userId, action, targetId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId || 1, userId || null, action, String(targetId || ""), details ? JSON.stringify(details) : null);
  } catch (e) {}
}

/**
 * Validate a conversation flow graph
 */
function validateFlowGraph(nodes, transitions, variables = {}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push("Flow must contain at least one node.");
    return { isValid: false, errors, warnings };
  }

  const nodeMap = new Map();
  nodes.forEach(n => {
    if (!n.id) errors.push("All nodes must have a unique 'id'.");
    else if (nodeMap.has(n.id)) errors.push(`Duplicate node id: '${n.id}'.`);
    else nodeMap.set(n.id, n);
  });

  // 1. Trigger node check (START, TRIGGER_WHATSAPP, or TRIGGER_EVENT)
  const triggerTypes = new Set(["START", "TRIGGER_WHATSAPP", "TRIGGER_EVENT"]);
  const triggerNodes = nodes.filter(n => triggerTypes.has(n.type));
  if (triggerNodes.length === 0) {
    errors.push("Flow must have at least one trigger node (START, TRIGGER_WHATSAPP, or TRIGGER_EVENT).");
  } else if (triggerNodes.length > 1) {
    warnings.push(`Flow contains ${triggerNodes.length} trigger nodes. Execution will begin at the matching trigger.`);
  }

  // 2. Terminal node check (END, HANDOFF, or HUMAN_HANDOFF)
  const terminalTypes = new Set(["END", "HANDOFF", "HUMAN_HANDOFF"]);
  const terminalNodes = nodes.filter(n => terminalTypes.has(n.type));
  if (terminalNodes.length === 0) {
    warnings.push("Flow has no terminal 'END' or 'HANDOFF' node. Conversations may not terminate cleanly.");
  }

  // 3. Transitions validity
  const validTransitions = (Array.isArray(transitions) ? transitions : []).map(t => ({
    ...t,
    source: t.source || t.from,
    target: t.target || t.to
  }));

  validTransitions.forEach((t, idx) => {
    if (!t.source || !nodeMap.has(t.source)) {
      errors.push(`Transition #${idx + 1} has invalid or missing source node '${t.source}'.`);
    }
    if (!t.target || !nodeMap.has(t.target)) {
      errors.push(`Transition #${idx + 1} has invalid or missing target node '${t.target}'.`);
    }
  });

  // 4. Reachability from trigger nodes
  if (triggerNodes.length > 0) {
    const visited = new Set();
    const queue = [];

    triggerNodes.forEach(trg => {
      visited.add(trg.id);
      queue.push(trg.id);
    });

    // Build adjacency list
    const adj = new Map();
    nodes.forEach(n => adj.set(n.id, []));

    validTransitions.forEach(t => {
      if (adj.has(t.source) && t.target) {
        adj.get(t.source).push(t.target);
      }
    });

    // Also include condition rule branch targets, defaultTargetNodeId, and API targets
    nodes.forEach(n => {
      const cfg = n.config || n.data || {};
      if ((n.type === "CONDITION" || n.type === "CONFIRMATION") && cfg.rules) {
        (cfg.rules || []).forEach(r => {
          const tId = r.targetNodeId || r.target;
          if (tId && nodeMap.has(tId)) {
            adj.get(n.id).push(tId);
          }
        });
        const defTId = cfg.defaultTargetNodeId || cfg.defaultTarget;
        if (defTId && nodeMap.has(defTId)) {
          adj.get(n.id).push(defTId);
        }
      }
      if (n.type === "API_INTEGRATION" || n.type === "HTTP_WEBHOOK") {
        if (cfg.successTargetNodeId && nodeMap.has(cfg.successTargetNodeId)) adj.get(n.id).push(cfg.successTargetNodeId);
        if (cfg.failureTargetNodeId && nodeMap.has(cfg.failureTargetNodeId)) adj.get(n.id).push(cfg.failureTargetNodeId);
      }
    });

    while (queue.length > 0) {
      const curr = queue.shift();
      const neighbors = adj.get(curr) || [];
      for (const nxt of neighbors) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      }
    }

    const unreached = nodes.filter(n => !visited.has(n.id));
    if (unreached.length > 0) {
      warnings.push(`${unreached.length} node(s) are disconnected and cannot be reached from any trigger: ${unreached.map(n => n.id).join(", ")}`);
    }
  }

  // 5. Node-specific rules
  const APPROVED_ACTIONS = new Set([
    "HOSPITALITY_CHECK_AVAILABILITY",
    "HOSPITALITY_CALCULATE_QUOTE",
    "HOSPITALITY_CREATE_ENQUIRY",
    "HOSPITALITY_LOOKUP_FAQ",
    "FETCH_PROPERTY_INFO",
    "ASSIGN_STAFF",
    "B2B_CALCULATE_SALES_QUOTE",
    "B2B_CREATE_SALES_DEAL",
    "GENERATE_PAYMENT_LINK",
    "CHECK_AVAILABILITY",
    "CALCULATE_QUOTE",
    "CREATE_BOOKING",
    "PROCESS_PAYMENT"
  ]);

  nodes.forEach(n => {
    const cfg = n.config || n.data || {};
    try { getNodeExecutor(n.type); }
    catch (_) { errors.push(`Node '${n.id || 'unknown'}' has unsupported type '${n.type || ''}'.`); }

    if (n.type === "BUTTON_MENU" || n.type === "SELECTION" || n.type === "CONFIRMATION") {
      const opts = cfg.options || [];
      if (opts.length === 0 && n.type !== "CONFIRMATION") {
        errors.push(`Menu node '${n.id}' must have at least one option.`);
      } else if (opts.length > 10) {
        warnings.push(`Menu node '${n.id}' has ${opts.length} options (WhatsApp interactive list maximum is 10).`);
      }
      opts.forEach(o => {
        if (o.title && o.title.length > 20) {
          warnings.push(`Button title '${o.title}' on node '${n.id}' exceeds WhatsApp 20-character limit (${o.title.length} chars). It will be truncated.`);
        }
      });
    }

    if (n.type === "CONDITION") {
      const rules = cfg.rules || [];
      if (rules.length === 0 && !cfg.defaultTargetNodeId && !cfg.variable) {
        errors.push(`Condition node '${n.id}' has no evaluation rules and no default target.`);
      }
    }

    // Only legacy BUSINESS_ACTION / TRANSACTION / BOOKING requires strict action validation
    if (n.type === "BUSINESS_ACTION" || n.type === "TRANSACTION") {
      const actionName = cfg.action;
      if (!actionName) {
        errors.push(`Action node '${n.id}' does not specify an 'action'.`);
      } else if (!APPROVED_ACTIONS.has(actionName) && !actionName.startsWith("HOSPITALITY_") && !actionName.startsWith("B2B_")) {
        warnings.push(`Action node '${n.id}' specifies custom action '${actionName}'.`);
      }
    }

    if (n.type === "INPUT_COLLECTION" || n.type === "QUESTION" || n.type === "COLLECT_INPUT" || n.type === "SCHEMA_INPUT") {
      if (!cfg.variable && !cfg.saveAs) {
        warnings.push(`Input Collection node '${n.id}' does not specify a target variable. User input will not be stored.`);
      }
      if (n.type === "SCHEMA_INPUT") {
        const name = String(cfg.saveAs || "").trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(name)
            || name.split(".").some(part => ["__proto__", "constructor", "prototype"].includes(part))) {
          errors.push(`Configurable input '${n.id}' requires a safe variable name.`);
        }
        if (!String(cfg.prompt || "").trim() || String(cfg.prompt).length > 1024) {
          errors.push(`Configurable input '${n.id}' requires a question of at most 1024 characters.`);
        }
        if (!["TEXT", "EMAIL", "PHONE", "NUMBER", "DATE"].includes(String(cfg.inputType || "").toUpperCase())) {
          errors.push(`Configurable input '${n.id}' specifies an unsupported answer type.`);
        }
        if (!Number.isInteger(Number(cfg.maxRetries)) || Number(cfg.maxRetries) < 1 || Number(cfg.maxRetries) > 10) {
          errors.push(`Configurable input '${n.id}' must allow between 1 and 10 retries.`);
        }
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * List flows for a tenant
 */
function listFlows(tenantId = 1, options = {}) {
  const { propertyId, status, category, search, page = 1, limit = 20 } = options;
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));

  const conditions = ["f.tenant_id = ?"];
  const params = [tenantId];

  if (propertyId) {
    conditions.push("(f.property_id = ? OR f.property_id IS NULL)");
    params.push(propertyId);
  }
  if (status && status !== "ALL") {
    conditions.push("f.status = ?");
    params.push(status);
  }
  if (category && category !== "ALL") {
    conditions.push("f.category = ?");
    params.push(category);
  }
  if (search && search.trim()) {
    conditions.push("(f.name LIKE ? OR f.description LIKE ?)");
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const whereClause = conditions.join(" AND ");

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM conversation_flows f WHERE ${whereClause}
  `).get(...params);
  const total = Number(countRow?.total || 0);

  const query = `
    SELECT 
      f.*,
      p.name as property_name,
      wpn.display_name as assigned_phone_display_name,
      wpn.phone_number as assigned_phone_number,
      pv.version_number as published_version_number,
      pv.published_at as last_published_at,
      dv.version_number as draft_version_number,
      (SELECT COUNT(*) FROM conversation_flow_versions v WHERE v.flow_id = f.id) as version_count,
      (SELECT COUNT(*) FROM conversation_flow_sessions s WHERE s.flow_id = f.id) as total_sessions_count
    FROM conversation_flows f
    LEFT JOIN properties p ON p.id = f.property_id
    LEFT JOIN waba_phone_numbers wpn ON wpn.phone_number_id = f.phone_number_id
    LEFT JOIN conversation_flow_versions pv ON pv.id = f.published_version_id
    LEFT JOIN conversation_flow_versions dv ON dv.id = f.current_draft_version_id
    WHERE ${whereClause}
    ORDER BY f.is_default DESC, f.priority DESC, f.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(query).all(...params, Number(limit), offset);

  const flows = rows.map(r => ({
    ...r,
    trigger_keywords: r.trigger_keywords_json ? JSON.parse(r.trigger_keywords_json) : [],
    is_default: Boolean(r.is_default)
  }));

  return {
    flows,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit))
  };
}

/**
 * Get single flow with current draft and published version definitions
 */
function getFlowById(flowId, tenantId = 1) {
  const flow = db.prepare(`
    SELECT f.*, p.name as property_name,
           wpn.display_name as assigned_phone_display_name,
           wpn.phone_number as assigned_phone_number
    FROM conversation_flows f
    LEFT JOIN properties p ON p.id = f.property_id
    LEFT JOIN waba_phone_numbers wpn ON wpn.phone_number_id = f.phone_number_id
    WHERE f.id = ? AND f.tenant_id = ?
    LIMIT 1
  `).get(flowId, tenantId);

  if (!flow) {
    throw new Error(`Conversation flow #${flowId} not found.`);
  }

  flow.trigger_keywords = flow.trigger_keywords_json ? JSON.parse(flow.trigger_keywords_json) : [];

  // Get current draft version
  let draftVersion = null;
  if (flow.current_draft_version_id) {
    const dvRow = db.prepare(`SELECT * FROM conversation_flow_versions WHERE id = ?`).get(flow.current_draft_version_id);
    if (dvRow) {
      draftVersion = {
        ...dvRow,
        nodes: JSON.parse(dvRow.nodes_json || "[]"),
        transitions: JSON.parse(dvRow.transitions_json || "[]"),
        variables: dvRow.variables_json ? JSON.parse(dvRow.variables_json) : {},
        validation_report: dvRow.validation_report_json ? JSON.parse(dvRow.validation_report_json) : null
      };
    }
  }

  // Get published version
  let publishedVersion = null;
  if (flow.published_version_id) {
    const pvRow = db.prepare(`SELECT * FROM conversation_flow_versions WHERE id = ?`).get(flow.published_version_id);
    if (pvRow) {
      publishedVersion = {
        ...pvRow,
        nodes: JSON.parse(pvRow.nodes_json || "[]"),
        transitions: JSON.parse(pvRow.transitions_json || "[]"),
        variables: pvRow.variables_json ? JSON.parse(pvRow.variables_json) : {},
        validation_report: pvRow.validation_report_json ? JSON.parse(pvRow.validation_report_json) : null
      };
    }
  }

  return {
    flow,
    draftVersion,
    publishedVersion
  };
}

/**
 * Create a new conversation flow
 */
function createFlow(data, user = { id: "admin", name: "Administrator" }) {
  const {
    tenant_id = 1,
    property_id = 1,
    phone_number_id = null,
    name,
    description = "",
    category = "HOSPITALITY_ENQUIRY",
    trigger_type = "KEYWORD_MATCH",
    trigger_keywords = [],
    is_default = 0,
    priority = 10,
    approval_required = false,
    initialNodes = null,
    initialTransitions = null,
    initialVariables = null
  } = data;

  if (!name || !String(name).trim()) {
    throw new Error("Flow name is required.");
  }

  const targetPhoneId = (!phone_number_id || phone_number_id === "ALL" || phone_number_id === "null") ? null : String(phone_number_id).trim();
  const flowUuid = "flow_" + crypto.randomBytes(8).toString("hex");

  const insertFlow = db.prepare(`
    INSERT INTO conversation_flows (
      uuid, tenant_id, property_id, phone_number_id, name, description, category,
      trigger_type, trigger_keywords_json, status, approval_required, approval_state, is_default, priority,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const res = insertFlow.run(
    flowUuid,
    tenant_id,
    property_id || null,
    targetPhoneId,
    String(name).trim(),
    description || "",
    category,
    trigger_type,
    JSON.stringify(Array.isArray(trigger_keywords) ? trigger_keywords : []),
    approval_required ? 1 : 0,
    approval_required ? "REQUIREMENTS_PENDING" : "NOT_REQUIRED",
    is_default ? 1 : 0,
    Number(priority || 10),
    user.name || user.id || "admin",
    user.name || user.id || "admin"
  );

  const flowId = res.lastInsertRowid || db.prepare("SELECT id FROM conversation_flows WHERE uuid = ?").get(flowUuid)?.id;

  const rawNodes = data.nodes || data.initialNodes;
  const rawTransitions = data.transitions || data.initialTransitions;
  const rawVars = data.variables || data.initialVariables;

  // Modern starter nodes if not provided
  const nodes = rawNodes || [
    {
      id: "node_trigger",
      type: "TRIGGER_WHATSAPP",
      title: "WhatsApp Keyword Trigger",
      config: {
        triggerType: trigger_type || "KEYWORD",
        keywords: Array.isArray(trigger_keywords) && trigger_keywords.length > 0 ? trigger_keywords : ["hi", "hello"],
        matchType: "CONTAINS"
      },
      position: { x: 300, y: 50 }
    },
    {
      id: "node_welcome",
      type: "SEND_MESSAGE",
      title: "Welcome Greeting",
      config: { text: "Hello! Welcome to our automated concierge. How can we assist you today?" },
      position: { x: 300, y: 180 }
    },
    {
      id: "node_end",
      type: "END",
      title: "End Conversation",
      config: { farewellMessage: "Thank you for reaching out!" },
      position: { x: 300, y: 310 }
    }
  ];

  const transitions = (rawTransitions || [
    { id: "t_init_1", source: "node_trigger", target: "node_welcome", sourceHandle: "default" },
    { id: "t_init_2", source: "node_welcome", target: "node_end", sourceHandle: "default" }
  ]).map(t => ({
    ...t,
    source: t.source || t.from,
    target: t.target || t.to
  }));

  const variables = rawVars || {};

  const validationReport = validateFlowGraph(nodes, transitions, variables);

  const insertVersion = db.prepare(`
    INSERT INTO conversation_flow_versions (
      flow_id, version_number, status, nodes_json, transitions_json,
      variables_json, validation_report_json, changelog, created_at
    ) VALUES (?, 1, 'DRAFT', ?, ?, ?, ?, 'Initial Draft Created', CURRENT_TIMESTAMP)
  `);

  const vRes = insertVersion.run(
    flowId,
    JSON.stringify(nodes),
    JSON.stringify(transitions),
    JSON.stringify(variables),
    JSON.stringify(validationReport)
  );

  const versionId = vRes.lastInsertRowid || db.prepare("SELECT id FROM conversation_flow_versions WHERE flow_id = ? AND version_number = 1").get(flowId)?.id;

  db.prepare(`
    UPDATE conversation_flows
    SET current_draft_version_id = ?
    WHERE id = ?
  `).run(versionId, flowId);

  logAudit(tenant_id, user.id, "CREATE_CONVERSATION_FLOW", flowId, { name, uuid: flowUuid });

  return getFlowById(flowId, tenant_id);
}

/**
 * Update flow metadata
 */
function updateFlow(flowId, data, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  const {
    name = flow.name,
    description = flow.description,
    category = flow.category,
    trigger_type = flow.trigger_type,
    trigger_keywords = flow.trigger_keywords_json ? JSON.parse(flow.trigger_keywords_json) : [],
    property_id = flow.property_id,
    phone_number_id = flow.phone_number_id,
    is_default = flow.is_default,
    priority = flow.priority
  } = data;

  const targetPhoneId = phone_number_id !== undefined
    ? ((!phone_number_id || phone_number_id === "ALL" || phone_number_id === "null") ? null : String(phone_number_id).trim())
    : flow.phone_number_id;
  const originalKeywords = flow.trigger_keywords_json ? JSON.parse(flow.trigger_keywords_json) : [];
  const normalizedKeywords = Array.isArray(trigger_keywords) ? trigger_keywords : [];
  const activationScopeChanged = targetPhoneId !== flow.phone_number_id ||
    trigger_type !== flow.trigger_type ||
    JSON.stringify(normalizedKeywords) !== JSON.stringify(originalKeywords) ||
    Number(property_id || 0) !== Number(flow.property_id || 0) ||
    Boolean(is_default) !== Boolean(flow.is_default) ||
    Number(priority || 0) !== Number(flow.priority || 0);

  if (Number(flow.approval_required) && flow.status === "PUBLISHED" && activationScopeChanged) {
    const error = new Error("Pause this governed flow before changing its line, trigger, priority, property, or default routing. Then complete a new approval sequence and publish the reviewed draft.");
    error.code = "FLOW_REVIEW_REQUIRED";
    throw error;
  }

  // If this flow is being set as default, clear default on other flows with same category & tenant
  if (is_default) {
    db.prepare(`
      UPDATE conversation_flows
      SET is_default = 0
      WHERE tenant_id = ? AND category = ? AND id != ?
    `).run(tenantId, category, flowId);
  }

  db.prepare(`
    UPDATE conversation_flows
    SET name = ?, description = ?, category = ?, trigger_type = ?,
        trigger_keywords_json = ?, property_id = ?, phone_number_id = ?, is_default = ?, priority = ?,
        updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    String(name).trim(),
    description || "",
    category,
    trigger_type,
    JSON.stringify(normalizedKeywords),
    property_id || null,
    targetPhoneId,
    is_default ? 1 : 0,
    Number(priority || 10),
    user.name || user.id || "admin",
    flowId,
    tenantId
  );

  const metadataChanged = String(name).trim() !== String(flow.name || "") ||
    String(description || "") !== String(flow.description || "") ||
    category !== flow.category ||
    activationScopeChanged;
  if (metadataChanged) {
    flowApprovalService.invalidateApprovalWorkflow(
      flowId,
      tenantId,
      user,
      "Flow metadata or activation scope changed. Re-review requirements before continuing."
    );
  }

  // If line changed and flow is published, re-sync active triggers
  if (flow.status === "PUBLISHED" && targetPhoneId !== flow.phone_number_id) {
    try {
      const currentFlow = getFlowById(flowId, tenantId);
      const activeNodes = currentFlow?.publishedVersion?.nodes || currentFlow?.draftVersion?.nodes || [];
      const workflowTriggerService = require("./workflow/workflowTriggerService");
      workflowTriggerService.syncFlowTriggers(tenantId, flowId, activeNodes, targetPhoneId);
    } catch (trgErr) {
      console.warn(`[ConversationFlowService] Warning re-syncing triggers for flow ${flowId}:`, trgErr.message);
    }
  }

  logAudit(tenantId, user.id, "UPDATE_CONVERSATION_FLOW_METADATA", flowId, { name, phone_number_id: targetPhoneId });

  return getFlowById(flowId, tenantId);
}

/**
 * Save flow canvas nodes & transitions as draft
 */
function saveFlowDraft(flowId, data, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  const { nodes = [], transitions = [], variables = {}, changelog = "Updated draft via Visual Builder" } = data;

  const normalizedTransitions = (Array.isArray(transitions) ? transitions : []).map(t => ({
    ...t,
    source: t.source || t.from,
    target: t.target || t.to
  }));

  const validationReport = validateFlowGraph(nodes, normalizedTransitions, variables);

  // Check current draft version
  let draftVersion = null;
  if (flow.current_draft_version_id) {
    draftVersion = db.prepare("SELECT * FROM conversation_flow_versions WHERE id = ?").get(flow.current_draft_version_id);
  }

  const serializedNodes = JSON.stringify(nodes);
  const serializedTransitions = JSON.stringify(normalizedTransitions);
  const serializedVariables = JSON.stringify(variables);
  const graphChanged = !draftVersion || draftVersion.status === "PUBLISHED" || draftVersion.status === "ARCHIVED" ||
    draftVersion.nodes_json !== serializedNodes ||
    draftVersion.transitions_json !== serializedTransitions ||
    (draftVersion.variables_json || "{}") !== serializedVariables;

  // If current draft version is already published or missing, create a new DRAFT version
  if (!draftVersion || draftVersion.status === "PUBLISHED" || draftVersion.status === "ARCHIVED") {
    const maxVerRow = db.prepare("SELECT MAX(version_number) as max_ver FROM conversation_flow_versions WHERE flow_id = ?").get(flowId);
    const nextVer = (Number(maxVerRow?.max_ver) || 0) + 1;

    const vRes = db.prepare(`
      INSERT INTO conversation_flow_versions (
        flow_id, version_number, status, nodes_json, transitions_json,
        variables_json, validation_report_json, changelog, created_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      flowId,
      nextVer,
      serializedNodes,
      serializedTransitions,
      serializedVariables,
      JSON.stringify(validationReport),
      changelog
    );

    const newVersionId = vRes.lastInsertRowid || db.prepare("SELECT id FROM conversation_flow_versions WHERE flow_id = ? AND version_number = ?").get(flowId, nextVer)?.id;

    db.prepare(`
      UPDATE conversation_flows
      SET current_draft_version_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newVersionId, user.name || user.id || "admin", flowId);
  } else {
    // Update existing DRAFT version
    db.prepare(`
      UPDATE conversation_flow_versions
      SET nodes_json = ?, transitions_json = ?, variables_json = ?,
          validation_report_json = ?, changelog = ?
      WHERE id = ?
    `).run(
      serializedNodes,
      serializedTransitions,
      serializedVariables,
      JSON.stringify(validationReport),
      changelog,
      draftVersion.id
    );

    db.prepare(`
      UPDATE conversation_flows
      SET updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(user.name || user.id || "admin", flowId);
  }

  if (graphChanged) {
    flowApprovalService.invalidateApprovalWorkflow(
      flowId,
      tenantId,
      user,
      "The draft graph changed. Re-review requirements, API readiness, design, simulation, and publish approval."
    );
  }
  logAudit(tenantId, user.id, "SAVE_FLOW_DRAFT", flowId, { nodeCount: nodes.length, isValid: validationReport.isValid });
  invalidateFlow(flowId);

  const updatedFlow = getFlowById(flowId, tenantId);
  return {
    success: true,
    ...updatedFlow,
    validationReport
  };
}

/**
 * Validate a flow
 */
function validateFlow(flowId, tenantId = 1) {
  const { flow, draftVersion } = getFlowById(flowId, tenantId);
  if (!draftVersion) {
    throw new Error("No draft version exists to validate.");
  }

  const report = validateFlowGraph(draftVersion.nodes, draftVersion.transitions, draftVersion.variables);

  db.prepare(`
    UPDATE conversation_flow_versions
    SET validation_report_json = ?
    WHERE id = ?
  `).run(JSON.stringify(report), draftVersion.id);

  return report;
}

/**
 * Publish a flow version (Immutable Snapshot)
 */
function publishFlow(flowId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const { flow, draftVersion } = getFlowById(flowId, tenantId);
  if (!draftVersion) {
    throw new Error("No draft version available to publish.");
  }

  flowApprovalService.assertPublishApproved(flowId, tenantId);

  // Validate prior to publishing
  const report = validateFlowGraph(draftVersion.nodes, draftVersion.transitions, draftVersion.variables);
  if (!report.isValid) {
    const err = new Error(`Cannot publish flow with validation errors: ${report.errors.join("; ")}`);
    err.validationErrors = report.errors;
    err.validationReport = report;
    throw err;
  }

  // Snapshot this version as PUBLISHED
  db.prepare(`
    UPDATE conversation_flow_versions
    SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, published_by = ?,
        validation_report_json = ?
    WHERE id = ?
  `).run(user.name || user.id || "admin", JSON.stringify(report), draftVersion.id);

  // If this flow is default, enforce single active default per category/property
  if (flow.is_default) {
    db.prepare(`
      UPDATE conversation_flows
      SET is_default = 0
      WHERE tenant_id = ? AND category = ? AND id != ?
    `).run(tenantId, flow.category, flowId);
  }

  // Set flow status to PUBLISHED and point published_version_id
  db.prepare(`
    UPDATE conversation_flows
    SET status = 'PUBLISHED', published_version_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(draftVersion.id, user.name || user.id || "admin", flowId);

  logAudit(tenantId, user.id, "PUBLISH_CONVERSATION_FLOW", flowId, {
    versionNumber: draftVersion.version_number,
    versionId: draftVersion.id
  });

  // Sync and index workflow triggers
  try {
    const workflowTriggerService = require("./workflow/workflowTriggerService");
    workflowTriggerService.syncFlowTriggers(tenantId, flowId, draftVersion.nodes, flow.phone_number_id);
  } catch (trgErr) {
    console.warn(`[ConversationFlowService] Warning: Failed to sync triggers for flow ${flowId}:`, trgErr.message);
  }

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  return getFlowById(flowId, tenantId);
}

/**
 * Assign or rebind a flow to a specific WhatsApp Business Phone Line (or ALL lines)
 */
function assignFlowToLine(flowId, phoneNumberId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const current = getFlowById(flowId, tenantId);
  const flow = current.flow;
  const targetPhoneId = (!phoneNumberId || phoneNumberId === "ALL" || phoneNumberId === "null") ? null : String(phoneNumberId).trim();

  if (Number(flow.approval_required) && flow.status === "PUBLISHED" && targetPhoneId !== flow.phone_number_id) {
    const error = new Error("Pause this governed flow before changing its WhatsApp line. Complete a new approval sequence before publishing the staged change.");
    error.code = "FLOW_REVIEW_REQUIRED";
    throw error;
  }

  let assignedPhone = null;
  if (targetPhoneId) {
    assignedPhone = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ? AND tenant_id = ?").get(targetPhoneId, tenantId);
    if (!assignedPhone) {
      throw new Error(`WhatsApp Business Phone ID '${targetPhoneId}' was not found in registered lines.`);
    }
  }

  db.prepare(`
    UPDATE conversation_flows
    SET phone_number_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(targetPhoneId, user.name || user.id || "admin", flowId, tenantId);

  if (targetPhoneId !== flow.phone_number_id) {
    flowApprovalService.invalidateApprovalWorkflow(
      flowId,
      tenantId,
      user,
      "The WhatsApp line assignment changed. Re-review the activation scope before continuing."
    );
  }

  // If the flow is already published, immediately re-sync triggers with the targetPhoneId
  if (flow.status === "PUBLISHED") {
    try {
      const activeNodes = current.publishedVersion?.nodes || current.draftVersion?.nodes || [];
      const workflowTriggerService = require("./workflow/workflowTriggerService");
      workflowTriggerService.syncFlowTriggers(tenantId, flowId, activeNodes, targetPhoneId);
    } catch (trgErr) {
      console.warn(`[ConversationFlowService] Warning re-syncing triggers for flow ${flowId} after line assignment:`, trgErr.message);
    }
  }

  logAudit(tenantId, user.id, "ASSIGN_FLOW_TO_PHONE_LINE", flowId, {
    previousPhoneId: flow.phone_number_id,
    newPhoneId: targetPhoneId,
    displayName: assignedPhone?.display_name || "ALL_LINES"
  });

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  return getFlowById(flowId, tenantId);
}

/**
 * Set a flow as the default active flow for inbound conversations
 */
function setDefaultFlow(flowId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error(`Conversation flow #${flowId} not found.`);

  // This shortcut changes live routing for the selected flow and the current
  // default. It must not bypass the approval reset enforced by updateFlow.
  const governedPublishedDefault = db.prepare(`
    SELECT id FROM conversation_flows
    WHERE tenant_id = ? AND is_default = 1 AND approval_required = 1
      AND status = 'PUBLISHED' AND id != ?
    LIMIT 1
  `).get(tenantId, flowId);
  if ((Number(flow.approval_required) && flow.status === "PUBLISHED" && !flow.is_default) || governedPublishedDefault) {
    const error = new Error("Pause the governed live flow, change its default routing in the reviewed draft, then complete a new approval sequence before publishing.");
    error.code = "FLOW_REVIEW_REQUIRED";
    throw error;
  }

  db.prepare("UPDATE conversation_flows SET is_default = 0 WHERE tenant_id = ?").run(tenantId);
  db.prepare("UPDATE conversation_flows SET is_default = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    user.name || user.id || "admin",
    flowId
  );

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  logAudit(tenantId, user.id, "SET_DEFAULT_FLOW", flowId, { flowName: flow.name });
  return getFlowById(flowId, tenantId);
}

/**
 * Pause an active flow
 */
function pauseFlow(flowId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  db.prepare(`
    UPDATE conversation_flows
    SET status = 'PAUSED', updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.name || user.id || "admin", flowId);

  // Deactivate triggers for paused flow
  try {
    const workflowTriggerService = require("./workflow/workflowTriggerService");
    workflowTriggerService.deactivateFlowTriggers(tenantId, flowId);
  } catch (trgErr) {
    console.warn(`[ConversationFlowService] Warning: Failed to deactivate triggers for flow ${flowId}:`, trgErr.message);
  }

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  logAudit(tenantId, user.id, "PAUSE_CONVERSATION_FLOW", flowId, null);
  return getFlowById(flowId, tenantId);
}

/**
 * Archive a flow
 */
function archiveFlow(flowId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  db.prepare(`
    UPDATE conversation_flows
    SET status = 'ARCHIVED', is_default = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(user.name || user.id || "admin", flowId);

  // Deactivate triggers for archived flow
  try {
    const workflowTriggerService = require("./workflow/workflowTriggerService");
    workflowTriggerService.deactivateFlowTriggers(tenantId, flowId);
  } catch (trgErr) {
    console.warn(`[ConversationFlowService] Warning: Failed to deactivate triggers for flow ${flowId}:`, trgErr.message);
  }

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  logAudit(tenantId, user.id, "ARCHIVE_CONVERSATION_FLOW", flowId, null);
  return getFlowById(flowId, tenantId);
}

/**
 * Permanently delete a flow and its associated versions, triggers, and sessions.
 */
function deleteFlow(flowId, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) {
    throw new Error("Conversation flow not found.");
  }

  // 1. Deactivate & remove workflow triggers
  try {
    const workflowTriggerService = require("./workflow/workflowTriggerService");
    workflowTriggerService.deactivateFlowTriggers(tenantId, flowId);
  } catch (e) {}

  try {
    db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ? AND tenant_id = ?").run(String(flowId), tenantId);
  } catch (e) {}

  invalidateFlow(flowId);
  invalidateTriggers(tenantId);

  // 2. Clean up events and sessions
  try {
    db.prepare("DELETE FROM conversation_flow_events WHERE flow_id = ?").run(flowId);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE flow_id = ?").run(flowId);
    db.prepare("DELETE FROM flow_approval_requests WHERE flow_id = ? AND tenant_id = ?").run(flowId, tenantId);
  } catch (e) {}

  // Invalidate every public capability token before the flow is removed. The
  // revoked records retain a minimal lifecycle trail without exposing a draft.
  try {
    db.prepare("UPDATE flow_preview_links SET status = 'REVOKED', revoked_at = UTC_TIMESTAMP() WHERE flow_id = ? AND tenant_id = ? AND status = 'ACTIVE'").run(flowId, tenantId);
  } catch (e) {}

  // 3. Delete versions
  try {
    db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id = ?").run(flowId);
  } catch (e) {}

  // 4. Delete the flow record itself
  db.prepare("DELETE FROM conversation_flows WHERE id = ? AND tenant_id = ?").run(flowId, tenantId);

  logAudit(tenantId, user.id, "DELETE_CONVERSATION_FLOW", flowId, { name: flow.name });

  return {
    success: true,
    message: `Flow "${flow.name}" deleted successfully.`,
    deletedFlowId: flowId
  };
}

/**
 * Rollback to a specific historical version
 */
function rollbackFlow(flowId, targetVersionNumber, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const targetVer = db.prepare(`
    SELECT * FROM conversation_flow_versions
    WHERE flow_id = ? AND version_number = ?
  `).get(flowId, targetVersionNumber);

  if (!targetVer) {
    throw new Error(`Version ${targetVersionNumber} not found for flow #${flowId}.`);
  }

  const nodes = JSON.parse(targetVer.nodes_json || "[]");
  const transitions = JSON.parse(targetVer.transitions_json || "[]");
  const variables = targetVer.variables_json ? JSON.parse(targetVer.variables_json) : {};

  return saveFlowDraft(flowId, {
    nodes,
    transitions,
    variables,
    changelog: `Rolled back from version ${targetVersionNumber}`
  }, user, tenantId);
}

/**
 * Version history for a flow
 */
function listVersions(flowId, tenantId = 1) {
  const flow = db.prepare("SELECT id FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  const rows = db.prepare(`
    SELECT id, flow_id, version_number, status, changelog, published_at, published_by, created_at
    FROM conversation_flow_versions
    WHERE flow_id = ?
    ORDER BY version_number DESC
  `).all(flowId);

  return rows;
}

/**
 * List starter templates
 */
function listTemplates(industry = null, category = null) {
  const conditions = ["1=1"];
  const params = [];

  if (industry && industry !== "ALL") {
    conditions.push("industry = ?");
    params.push(industry);
  }
  if (category && category !== "ALL") {
    conditions.push("category = ?");
    params.push(category);
  }

  const rows = db.prepare(`
    SELECT id, slug, title, description, industry, category, is_system, created_at,
           nodes_json, transitions_json, variables_json
    FROM conversation_flow_templates
    WHERE ${conditions.join(" AND ")}
    ORDER BY is_system DESC, id ASC
  `).all(...params);

  return rows.map(r => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    industry: r.industry,
    category: r.category,
    is_system: Boolean(r.is_system),
    nodeCount: JSON.parse(r.nodes_json || "[]").length,
    transitionCount: JSON.parse(r.transitions_json || "[]").length
  }));
}

/**
 * Create flow from template
 */
function createFlowFromTemplate(templateSlug, data = {}, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const tpl = db.prepare(`
    SELECT * FROM conversation_flow_templates WHERE slug = ? LIMIT 1
  `).get(templateSlug);

  if (!tpl) {
    throw new Error(`Template with slug '${templateSlug}' not found.`);
  }

  const nodes = JSON.parse(tpl.nodes_json || "[]");
  const transitions = JSON.parse(tpl.transitions_json || "[]");
  const variables = tpl.variables_json ? JSON.parse(tpl.variables_json) : {};

  // Extract keywords intelligently without hardcoding ["book", "stay", "room"]
  let keywords = data.trigger_keywords;
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    const trgNode = nodes.find(n => n.type === "TRIGGER_WHATSAPP" || n.type === "START");
    if (trgNode?.config?.keywords && Array.isArray(trgNode.config.keywords) && trgNode.config.keywords.length > 0) {
      keywords = trgNode.config.keywords;
    } else if (tpl.category === "B2B_SALES" || tpl.industry === "B2B_SALES") {
      keywords = ["pricing", "plans", "quote", "demo", "sales", "enterprise", "b2b"];
    } else if (tpl.category === "DINING") {
      keywords = ["menu", "order", "food", "table", "dining"];
    } else if (tpl.category === "HOSPITALITY_ENQUIRY" || tpl.industry === "HOSPITALITY") {
      keywords = ["book", "stay", "room", "reservation", "resort", "villa"];
    } else {
      keywords = [];
    }
  }

  return createFlow({
    tenant_id: tenantId,
    property_id: data.property_id || 1,
    name: data.name || `${tpl.title} (Custom)`,
    description: data.description || tpl.description,
    category: tpl.category || "HOSPITALITY_ENQUIRY",
    trigger_type: data.trigger_type || "KEYWORD_MATCH",
    trigger_keywords: keywords,
    is_default: data.is_default ? 1 : 0,
    priority: data.priority || 10,
    initialNodes: nodes,
    initialTransitions: transitions,
    initialVariables: variables
  }, user);
}

/**
 * Create a new template (custom template saved from designer)
 */
function createTemplate(data, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const { title, description, industry = "HOSPITALITY", category = "CUSTOM", nodes = [], transitions = [], variables = {} } = data;
  if (!title || !title.trim()) {
    throw new Error("Template title is required.");
  }

  const baseSlug = (data.slug || title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45) || "custom-flow";
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const res = db.prepare(`
    INSERT INTO conversation_flow_templates (
      slug, title, description, industry, category, is_system,
      nodes_json, transitions_json, variables_json
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    slug,
    title.trim(),
    description || "Custom template saved from Studio Designer",
    industry,
    category,
    JSON.stringify(nodes),
    JSON.stringify(transitions),
    JSON.stringify(variables)
  );

  const tplId = res.lastInsertRowid || db.prepare("SELECT id FROM conversation_flow_templates WHERE slug = ?").get(slug)?.id;
  const created = db.prepare("SELECT * FROM conversation_flow_templates WHERE id = ?").get(tplId);
  return {
    ...created,
    is_system: Boolean(created?.is_system),
    nodeCount: nodes.length,
    transitionCount: transitions.length
  };
}

/**
 * Reusable Message Templates CRUD
 */
function listMessageTemplates(tenantId = 1, propertyId = null) {
  let query = "SELECT * FROM flow_message_templates WHERE tenant_id = ?";
  const params = [tenantId];

  if (propertyId) {
    query += " AND (property_id = ? OR property_id IS NULL)";
    params.push(propertyId);
  }

  query += " ORDER BY category ASC, title ASC";
  const rows = db.prepare(query).all(...params);

  return rows.map(r => ({
    ...r,
    variables: r.variables_json ? JSON.parse(r.variables_json) : [],
    buttons: r.buttons_json ? JSON.parse(r.buttons_json) : []
  }));
}

function saveMessageTemplate(data, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const { id, code, title, category = "CONVERSATION", content, variables = [], buttons = [], property_id = null } = data;
  if (!code || !title || !content) {
    throw new Error("Code, Title, and Content are required for a message template.");
  }

  if (id) {
    db.prepare(`
      UPDATE flow_message_templates
      SET title = ?, category = ?, content = ?, variables_json = ?, buttons_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(title, category, content, JSON.stringify(variables), JSON.stringify(buttons), id, tenantId);
    return db.prepare("SELECT * FROM flow_message_templates WHERE id = ?").get(id);
  } else {
    const res = db.prepare(`
      INSERT INTO flow_message_templates (
        tenant_id, property_id, code, title, category, content, variables_json, buttons_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tenantId, property_id, String(code).trim().toUpperCase(), title, category, content, JSON.stringify(variables), JSON.stringify(buttons));

    const newId = res.lastInsertRowid || db.prepare("SELECT id FROM flow_message_templates WHERE tenant_id = ? AND code = ?").get(tenantId, code)?.id;
    return db.prepare("SELECT * FROM flow_message_templates WHERE id = ?").get(newId);
  }
}

function deleteMessageTemplate(id, tenantId = 1) {
  db.prepare("DELETE FROM flow_message_templates WHERE id = ? AND tenant_id = ?").run(id, tenantId);
  return { success: true, deletedId: id };
}

/**
 * Flow Execution Analytics
 */
function getFlowAnalytics(flowId, tenantId = 1) {
  const flow = db.prepare("SELECT id, name FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");

  const sessionSummary = db.prepare(`
    SELECT 
      COUNT(*) as total_sessions,
      SUM(CASE WHEN session_status = 'ACTIVE' THEN 1 ELSE 0 END) as active_sessions,
      SUM(CASE WHEN session_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_sessions,
      SUM(CASE WHEN session_status = 'PAUSED_AGENT_HANDOFF' THEN 1 ELSE 0 END) as handed_off_sessions,
      SUM(CASE WHEN session_status = 'EXPIRED' THEN 1 ELSE 0 END) as expired_sessions,
      SUM(CASE WHEN session_status = 'FAILED' THEN 1 ELSE 0 END) as failed_sessions
    FROM conversation_flow_sessions
    WHERE flow_id = ?
  `).get(flowId);

  const dropoffByNode = db.prepare(`
    SELECT current_node_id, COUNT(*) as count
    FROM conversation_flow_sessions
    WHERE flow_id = ? AND session_status IN ('EXPIRED', 'FAILED')
    GROUP BY current_node_id
    ORDER BY count DESC
    LIMIT 10
  `).all(flowId);

  const eventsCount = Number(db.prepare("SELECT COUNT(*) as count FROM conversation_flow_events WHERE flow_id = ?").get(flowId)?.count || 0);

  // Compute per-node metrics map for visual graph analytics overlay
  const nodeMetrics = {};
  try {
    const nodeEvents = db.prepare(`
      SELECT node_id,
             COUNT(*) as entered,
             SUM(CASE WHEN event_type IN ('COMPLETE', 'COMPLETED') THEN 1 ELSE 0 END) as completed
      FROM conversation_flow_events
      WHERE flow_id = ?
      GROUP BY node_id
    `).all(flowId);

    const dropoffMap = new Map((dropoffByNode || []).map(d => [d.current_node_id, Number(d.count || 0)]));

    for (const row of nodeEvents) {
      const entered = Number(row.entered || 0);
      const completed = Number(row.completed || 0);
      const dropoffs = dropoffMap.get(row.node_id) || 0;
      nodeMetrics[row.node_id] = {
        entered,
        completed,
        dropoffs,
        dropoffRate: entered > 0 ? Math.round((dropoffs / entered) * 100) : 0
      };
    }
  } catch (metricsErr) {
    // Non-fatal fallback
  }

  return {
    flowId,
    flowName: flow.name,
    totalSessions: Number(sessionSummary?.total_sessions || 0),
    activeSessions: Number(sessionSummary?.active_sessions || 0),
    completedSessions: Number(sessionSummary?.completed_sessions || 0),
    handedOffSessions: Number(sessionSummary?.handed_off_sessions || 0),
    expiredSessions: Number(sessionSummary?.expired_sessions || 0),
    failedSessions: Number(sessionSummary?.failed_sessions || 0),
    totalEvents: eventsCount,
    dropoffByNode,
    nodeMetrics
  };
}

/**
 * Duplicate a flow
 */
function duplicateFlow(flowId, data = {}, user = { id: "admin", name: "Administrator" }, tenantId = 1) {
  const { flow, draftVersion, publishedVersion } = getFlowById(flowId, tenantId);
  const version = draftVersion || publishedVersion;
  if (!version) {
    throw new Error(`Flow #${flowId} has no version to duplicate.`);
  }

  const newName = data.name || `${flow.name} (Copy)`;
  const duplicate = createFlow({
    tenant_id: tenantId,
    property_id: flow.property_id || 1,
    name: newName,
    description: flow.description || "",
    category: flow.category,
    trigger_type: flow.trigger_type,
    trigger_keywords: flow.trigger_keywords,
    is_default: 0,
    priority: flow.priority,
    approval_required: Boolean(flow.approval_required),
    initialNodes: version.nodes,
    initialTransitions: version.transitions,
    initialVariables: version.variables
  }, user);

  if (Number(flow.approval_required)) {
    flowApprovalService.initializeApprovalWorkflow({
      flowId: duplicate.flow.id,
      tenantId,
      user,
      requirementsSummary: `Review the copied flow requirements before design begins: ${String(newName).slice(0, 500)}`
    });
  }
  return duplicate;
}

/**
 * List Flow Executions / Sessions with filter and pagination
 */
function listFlowExecutions(flowId = null, options = {}, tenantId = 1) {
  const { status, phone, page = 1, limit = 20 } = options;
  const offset = (Math.max(1, Number(page)) - 1) * Math.max(1, Number(limit));

  const conditions = ["s.tenant_id = ?"];
  const params = [tenantId];

  if (flowId && String(flowId).toLowerCase() !== "all") {
    conditions.push("s.flow_id = ?");
    params.push(flowId);
  }
  if (status && status !== "ALL") {
    conditions.push("s.session_status = ?");
    params.push(status);
  }
  if (phone && phone.trim()) {
    conditions.push("s.sender_phone LIKE ?");
    params.push(`%${phone.trim().replace(/\D/g, "")}%`);
  }

  const whereClause = conditions.join(" AND ");

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM conversation_flow_sessions s WHERE ${whereClause}
  `).get(...params);
  const total = Number(countRow?.total || 0);

  const query = `
    SELECT 
      s.id,
      s.session_key,
      s.tenant_id,
      s.property_id,
      s.channel,
      s.sender_phone,
      s.flow_id,
      s.flow_version_id,
      s.current_node_id,
      s.session_status,
      s.collected_data_json,
      s.last_interaction_at,
      s.expires_at,
      s.created_at,
      s.updated_at,
      f.name as flow_name,
      f.category as flow_category,
      v.version_number
    FROM conversation_flow_sessions s
    LEFT JOIN conversation_flows f ON f.id = s.flow_id
    LEFT JOIN conversation_flow_versions v ON v.id = s.flow_version_id
    WHERE ${whereClause}
    ORDER BY s.last_interaction_at DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(query).all(...params, Number(limit), offset);

  const executions = rows.map(r => ({
    ...r,
    collected_data: r.collected_data_json ? JSON.parse(r.collected_data_json) : {}
  }));

  return {
    executions,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit))
  };
}

/**
 * Get detailed trace events for a specific execution session
 */
function getExecutionDetails(sessionId, tenantId = 1) {
  const session = db.prepare(`
    SELECT s.*, f.name as flow_name, v.version_number
    FROM conversation_flow_sessions s
    LEFT JOIN conversation_flows f ON f.id = s.flow_id
    LEFT JOIN conversation_flow_versions v ON v.id = s.flow_version_id
    WHERE s.id = ? AND s.tenant_id = ?
  `).get(sessionId, tenantId);

  if (!session) {
    throw new Error(`Execution session #${sessionId} not found.`);
  }

  session.collected_data = session.collected_data_json ? JSON.parse(session.collected_data_json) : {};

  const events = db.prepare(`
    SELECT id, session_id, flow_id, flow_version_id, node_id, node_type, event_type, payload_json, created_at
    FROM conversation_flow_events
    WHERE session_id = ?
    ORDER BY id ASC
  `).all(sessionId);

  const parsedEvents = events.map(e => ({
    ...e,
    payload: e.payload_json ? JSON.parse(e.payload_json) : {}
  }));

  return {
    session,
    events: parsedEvents
  };
}

module.exports = {
  validateFlowGraph,
  listFlows,
  getFlowById,
  createFlow,
  updateFlow,
  duplicateFlow,
  saveFlowDraft,
  validateFlow,
  publishFlow,
  assignFlowToLine,
  setDefaultFlow,
  pauseFlow,
  archiveFlow,
  deleteFlow,
  rollbackFlow,
  listVersions,
  listTemplates,
  createTemplate,
  createFlowFromTemplate,
  listMessageTemplates,
  saveMessageTemplate,
  deleteMessageTemplate,
  getFlowAnalytics,
  listFlowExecutions,
  getExecutionDetails
};
