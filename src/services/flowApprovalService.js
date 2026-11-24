const { db } = require("../config/database");

const APPROVAL_STAGES = [
  "REQUIREMENTS",
  "API_READINESS",
  "FLOW_DESIGN",
  "SIMULATION",
  "PUBLISH"
];

const DEFAULT_STAGE_CHECKLISTS = Object.freeze({
  REQUIREMENTS: [
    "Business objective, audience, trigger, and exit conditions are explicit.",
    "Customer data collection is necessary and appropriate.",
    "Human-handoff and escalation expectations are defined."
  ],
  API_READINESS: [
    "Every required API or integration has an approved contract and owner.",
    "Secrets, allowlists, timeouts, failures, and mock responses were reviewed.",
    "Missing integrations are recorded as gaps and are not activated by this draft."
  ],
  FLOW_DESIGN: [
    "Messages, choices, validation, branches, and fallbacks match the approved requirements.",
    "Data variables and external-action placeholders were reviewed for privacy and safety.",
    "The reviewed canvas is the draft that will be simulated."
  ],
  SIMULATION: [
    "A mock-only test or browser-only dry run was completed for the reviewed draft.",
    "Expected paths, validation failures, and fallback/handoff paths were checked.",
    "No WhatsApp message, Meta request, AI request, webhook, CRM write, or live integration was run."
  ],
  PUBLISH: [
    "All previous approvals apply to the current unchanged draft.",
    "The intended line, trigger, and activation scope were reviewed.",
    "Activation is an explicit administrator action and is not performed by AI."
  ]
});

function parseApproval(row) {
  if (!row) return null;
  let checklist = [];
  try {
    checklist = row.checklist_json ? JSON.parse(row.checklist_json) : [];
  } catch (_) {}
  return { ...row, checklist };
}

function logAudit(tenantId, userId, action, flowId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId, userId || null, action, String(flowId), JSON.stringify(details || {}));
  } catch (_) {
    // Approval records remain available if the optional audit ledger is unavailable.
  }
}

function assertStage(stage) {
  const normalized = String(stage || "").trim().toUpperCase();
  if (!APPROVAL_STAGES.includes(normalized)) {
    throw new Error(`Unknown approval stage '${stage}'.`);
  }
  return normalized;
}

function assertFlow(flowId, tenantId) {
  const flow = db.prepare("SELECT id, tenant_id, approval_required, approval_state FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(flowId, tenantId);
  if (!flow) throw new Error("Conversation flow not found.");
  return flow;
}

function listApprovals(flowId, tenantId = 1) {
  assertFlow(flowId, tenantId);
  const approvals = db.prepare(`
    SELECT * FROM flow_approval_requests
    WHERE flow_id = ? AND tenant_id = ?
    ORDER BY requested_at ASC, id ASC
  `).all(flowId, tenantId).map(parseApproval);
  const latestByStage = Object.fromEntries(APPROVAL_STAGES.map(stage => [
    stage,
    approvals.filter(item => item.stage === stage).at(-1) || null
  ]));
  return { stages: APPROVAL_STAGES, approvals, latestByStage };
}

function requestApproval({ flowId, stage, summary = "", checklist = [], user, tenantId = 1 }) {
  const normalizedStage = assertStage(stage);
  assertFlow(flowId, tenantId);
  const stageIndex = APPROVAL_STAGES.indexOf(normalizedStage);
  if (stageIndex > 0) {
    const previousStage = APPROVAL_STAGES[stageIndex - 1];
    const previousApproval = db.prepare(`
      SELECT status FROM flow_approval_requests
      WHERE flow_id = ? AND tenant_id = ? AND stage = ?
      ORDER BY id DESC LIMIT 1
    `).get(flowId, tenantId, previousStage);
    if (previousApproval?.status !== "APPROVED") {
      throw new Error(`${previousStage.replace(/_/g, " ")} must be approved before requesting ${normalizedStage.replace(/_/g, " ")}.`);
    }
  }
  const existing = db.prepare(`
    SELECT * FROM flow_approval_requests
    WHERE flow_id = ? AND tenant_id = ? AND stage = ? AND status = 'PENDING'
    ORDER BY id DESC LIMIT 1
  `).get(flowId, tenantId, normalizedStage);
  if (existing) return parseApproval(existing);

  const requestedChecklist = Array.isArray(checklist)
    ? checklist.slice(0, 25).map(item => String(item).slice(0, 500))
    : [];
  const safeChecklist = requestedChecklist.length > 0
    ? requestedChecklist
    : (DEFAULT_STAGE_CHECKLISTS[normalizedStage] || []);
  const result = db.prepare(`
    INSERT INTO flow_approval_requests (
      tenant_id, flow_id, stage, status, summary, checklist_json, requested_by, requested_at, updated_at
    ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    tenantId,
    flowId,
    normalizedStage,
    String(summary || "").slice(0, 5000),
    JSON.stringify(safeChecklist),
    user?.id || user?.name || null
  );

  db.prepare(`
    UPDATE conversation_flows
    SET approval_required = 1, approval_state = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(`${normalizedStage}_PENDING`, flowId, tenantId);

  const approval = db.prepare("SELECT * FROM flow_approval_requests WHERE id = ?").get(result.lastInsertRowid);
  logAudit(tenantId, user?.id, "REQUEST_FLOW_APPROVAL", flowId, { stage: normalizedStage, summary });
  return parseApproval(approval);
}

function initializeApprovalWorkflow({ flowId, user, tenantId = 1, requirementsSummary = "" }) {
  return requestApproval({
    flowId,
    tenantId,
    user,
    stage: "REQUIREMENTS",
    summary: requirementsSummary || "Review the AI-generated business requirements before design begins.",
    checklist: [
      "Business objective and audience are accurate.",
      "Trigger and exit conditions are explicit.",
      "Customer data collection is necessary and appropriate."
    ]
  });
}

function decideApproval({ flowId, stage, decision, note = "", user, tenantId = 1 }) {
  const normalizedStage = assertStage(stage);
  const normalizedDecision = String(decision || "").trim().toUpperCase();
  const normalizedNote = String(note || "").trim().slice(0, 5000);
  if (!["APPROVED", "CHANGES_REQUESTED"].includes(normalizedDecision)) {
    throw new Error("Decision must be APPROVED or CHANGES_REQUESTED.");
  }
  if (normalizedDecision === "CHANGES_REQUESTED" && !normalizedNote) {
    throw new Error("A decision note is required when requesting changes.");
  }
  if (normalizedDecision === "APPROVED" && ["API_READINESS", "SIMULATION", "PUBLISH"].includes(normalizedStage) && !normalizedNote) {
    throw new Error(`${normalizedStage.replace(/_/g, " ")} approval requires an attestation note describing the evidence reviewed.`);
  }

  assertFlow(flowId, tenantId);
  const pending = db.prepare(`
    SELECT * FROM flow_approval_requests
    WHERE flow_id = ? AND tenant_id = ? AND stage = ? AND status = 'PENDING'
    ORDER BY id DESC LIMIT 1
  `).get(flowId, tenantId, normalizedStage);
  if (!pending) throw new Error(`No pending ${normalizedStage} approval request exists.`);

  const updateResult = db.prepare(`
    UPDATE flow_approval_requests
    SET status = ?, reviewed_by = ?, decision_note = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'PENDING'
  `).run(normalizedDecision, user?.id || user?.name || null, normalizedNote, pending.id);
  if (!Number(updateResult?.changes || 0)) {
    throw new Error("This approval was already decided by another administrator. Refresh the review history and try again.");
  }

  let nextStage = null;
  if (normalizedDecision === "APPROVED") {
    const currentIndex = APPROVAL_STAGES.indexOf(normalizedStage);
    nextStage = APPROVAL_STAGES[currentIndex + 1] || null;
    if (nextStage) {
      requestApproval({
        flowId,
        tenantId,
        user,
        stage: nextStage,
        summary: `Review ${nextStage.toLowerCase().replace(/_/g, " ")} before progressing this flow.`,
        checklist: []
      });
    }
  }

  const approvalState = normalizedDecision === "APPROVED"
    ? (nextStage ? `${nextStage}_PENDING` : "PUBLISH_APPROVED")
    : `${normalizedStage}_CHANGES_REQUESTED`;
  db.prepare(`
    UPDATE conversation_flows
    SET approval_state = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(approvalState, flowId, tenantId);

  logAudit(tenantId, user?.id, "DECIDE_FLOW_APPROVAL", flowId, {
    stage: normalizedStage,
    decision: normalizedDecision,
    note: normalizedNote
  });

  return {
    approval: parseApproval(db.prepare("SELECT * FROM flow_approval_requests WHERE id = ?").get(pending.id)),
    nextStage,
    approvalState
  };
}

function assertPublishApproved(flowId, tenantId = 1) {
  const flow = assertFlow(flowId, tenantId);
  if (!Number(flow.approval_required)) return true;
  const approved = db.prepare(`
    SELECT id FROM flow_approval_requests
    WHERE flow_id = ? AND tenant_id = ? AND stage = 'PUBLISH' AND status = 'APPROVED'
    ORDER BY id DESC LIMIT 1
  `).get(flowId, tenantId);
  if (!approved) {
    const error = new Error("This flow requires final PUBLISH approval before it can be activated.");
    error.code = "FLOW_APPROVAL_REQUIRED";
    throw error;
  }
  return true;
}

function invalidateApprovalWorkflow(flowId, tenantId = 1, user = null, reason = "The reviewed draft changed. Re-review the business requirements before continuing.") {
  const flow = assertFlow(flowId, tenantId);
  if (!Number(flow.approval_required)) return null;

  const existingApproval = db.prepare(`
    SELECT id FROM flow_approval_requests
    WHERE flow_id = ? AND tenant_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(flowId, tenantId);
  if (!existingApproval) return null;

  db.prepare(`
    UPDATE flow_approval_requests
    SET status = 'SUPERSEDED', updated_at = CURRENT_TIMESTAMP
    WHERE flow_id = ? AND tenant_id = ?
      AND status IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED')
  `).run(flowId, tenantId);
  db.prepare(`
    UPDATE conversation_flows
    SET approval_state = 'REQUIREMENTS_PENDING', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(flowId, tenantId);
  const approval = requestApproval({
    flowId,
    tenantId,
    user,
    stage: "REQUIREMENTS",
    summary: String(reason || "The reviewed draft changed. Re-review the business requirements before continuing.").slice(0, 5000)
  });
  logAudit(tenantId, user?.id, "INVALIDATE_FLOW_APPROVALS", flowId, { reason: approval.summary });
  return approval;
}

function invalidateDesignApprovals(flowId, tenantId = 1, user = null) {
  return invalidateApprovalWorkflow(
    flowId,
    tenantId,
    user,
    "The draft changed after review. Re-review requirements, integrations, design, simulation, and publish approval."
  );
}

module.exports = {
  APPROVAL_STAGES,
  DEFAULT_STAGE_CHECKLISTS,
  listApprovals,
  requestApproval,
  initializeApprovalWorkflow,
  decideApproval,
  assertPublishApproved,
  invalidateApprovalWorkflow,
  invalidateDesignApprovals
};
