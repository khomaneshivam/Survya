/**
 * Flow approval workflow unit tests.
 *
 * The database module is replaced with a tiny in-memory adapter before the
 * approval service is loaded. These tests are entirely offline: no database,
 * network, LLM, or WhatsApp operation is involved.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const databasePath = require.resolve("../src/config/database");
const approvalServicePath = require.resolve("../src/services/flowApprovalService");

function createApprovalDb() {
  const state = {
    flow: {
      id: "flow-1",
      tenant_id: 1,
      approval_required: 1,
      approval_state: "REQUIREMENTS_PENDING"
    },
    approvals: [],
    nextId: 1
  };

  const latest = (flowId, tenantId, stage, status) => state.approvals
    .filter(item => String(item.flow_id) === String(flowId)
      && Number(item.tenant_id) === Number(tenantId)
      && item.stage === stage
      && (!status || item.status === status))
    .at(-1) || null;

  const db = {
    prepare(sql) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
      return {
        get(...params) {
          if (query.includes("from conversation_flows")) {
            const [flowId, tenantId] = params;
            return String(flowId) === String(state.flow.id) && Number(tenantId) === state.flow.tenant_id
              ? { ...state.flow }
              : undefined;
          }

          if (query.includes("from flow_approval_requests")) {
            if (query.includes("where id = ?")) {
              return state.approvals.find(item => Number(item.id) === Number(params[0]));
            }
            const [flowId, tenantId, stage] = params;
            if (query.startsWith("select id") && !query.includes("stage = 'publish'")) {
              return state.approvals
                .filter(item => String(item.flow_id) === String(flowId) && Number(item.tenant_id) === Number(tenantId))
                .at(-1) || undefined;
            }
            if (query.includes("stage = 'publish' and status = 'approved'")) {
              return latest(flowId, tenantId, "PUBLISH", "APPROVED") || undefined;
            }
            if (query.startsWith("select status")) {
              const item = latest(flowId, tenantId, stage);
              return item ? { status: item.status } : undefined;
            }
            if (query.includes("status = 'pending'")) {
              return latest(flowId, tenantId, stage, "PENDING") || undefined;
            }
          }
          return undefined;
        },
        all(...params) {
          if (query.includes("from flow_approval_requests")) {
            const [flowId, tenantId] = params;
            return state.approvals
              .filter(item => String(item.flow_id) === String(flowId) && Number(item.tenant_id) === Number(tenantId))
              .map(item => ({ ...item }));
          }
          return [];
        },
        run(...params) {
          if (query.startsWith("insert into flow_approval_requests")) {
            const [tenantId, flowId, stage, summary, checklistJson, requestedBy] = params;
            const approval = {
              id: state.nextId++,
              tenant_id: Number(tenantId),
              flow_id: flowId,
              stage,
              status: "PENDING",
              summary,
              checklist_json: checklistJson,
              requested_by: requestedBy,
              reviewed_by: null,
              decision_note: null
            };
            state.approvals.push(approval);
            return { lastInsertRowid: approval.id };
          }

          if (query.startsWith("update flow_approval_requests set status = 'superseded'")) {
            const [flowId, tenantId] = params;
            state.approvals.forEach((approval) => {
              if (String(approval.flow_id) === String(flowId) && Number(approval.tenant_id) === Number(tenantId) && ["PENDING", "APPROVED", "CHANGES_REQUESTED"].includes(approval.status)) {
                approval.status = "SUPERSEDED";
              }
            });
            return { changes: 1 };
          }

          if (query.startsWith("update flow_approval_requests set status")) {
            const [status, reviewedBy, note, approvalId] = params;
            const approval = state.approvals.find(item => Number(item.id) === Number(approvalId));
            approval.status = status;
            approval.reviewed_by = reviewedBy;
            approval.decision_note = note;
            return { changes: 1 };
          }

          if (query.startsWith("update conversation_flows set approval_required = 1")) {
            const [approvalState] = params;
            state.flow.approval_required = 1;
            state.flow.approval_state = approvalState;
            return { changes: 1 };
          }

          if (query.startsWith("update conversation_flows set approval_state")) {
            const [approvalState] = params;
            state.flow.approval_state = approvalState;
            return { changes: 1 };
          }

          // Audit writes are intentionally no-ops in the in-memory test adapter.
          return { changes: 1 };
        }
      };
    }
  };

  return { db, state };
}

function loadApprovalService(db) {
  const savedDatabase = require.cache[databasePath];
  const savedService = require.cache[approvalServicePath];
  delete require.cache[databasePath];
  delete require.cache[approvalServicePath];
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: { db }
  };

  const service = require(approvalServicePath);
  return {
    service,
    restore() {
      delete require.cache[databasePath];
      delete require.cache[approvalServicePath];
      if (savedDatabase) require.cache[databasePath] = savedDatabase;
      if (savedService) require.cache[approvalServicePath] = savedService;
    }
  };
}

test("approval-controlled flows advance stages in order and require final publish approval", () => {
  const { db, state } = createApprovalDb();
  const { service, restore } = loadApprovalService(db);
  const admin = { id: "admin-1", name: "Administrator" };

  try {
    const requirements = service.initializeApprovalWorkflow({
      flowId: "flow-1",
      tenantId: 1,
      user: admin,
      requirementsSummary: "Collect booking requirements"
    });
    assert.equal(requirements.stage, "REQUIREMENTS");
    assert.equal(requirements.status, "PENDING");

    assert.throws(
      () => service.requestApproval({ flowId: "flow-1", tenantId: 1, user: admin, stage: "FLOW_DESIGN" }),
      /API READINESS must be approved/i
    );

    let outcome = service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "REQUIREMENTS", decision: "APPROVED"
    });
    assert.equal(outcome.nextStage, "API_READINESS");
    assert.equal(state.flow.approval_state, "API_READINESS_PENDING");

    outcome = service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "API_READINESS", decision: "APPROVED",
      note: "Reviewed the mocked API contract and failure handling."
    });
    assert.equal(outcome.nextStage, "FLOW_DESIGN");

    outcome = service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "FLOW_DESIGN", decision: "APPROVED"
    });
    assert.equal(outcome.nextStage, "SIMULATION");

    outcome = service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "SIMULATION", decision: "APPROVED",
      note: "Completed a mock-only dry run of expected and fallback paths."
    });
    assert.equal(outcome.nextStage, "PUBLISH");

    assert.throws(
      () => service.assertPublishApproved("flow-1", 1),
      error => error.code === "FLOW_APPROVAL_REQUIRED"
    );

    outcome = service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "PUBLISH", decision: "APPROVED",
      note: "Confirmed the unchanged draft and final activation scope."
    });
    assert.equal(outcome.nextStage, null);
    assert.equal(outcome.approvalState, "PUBLISH_APPROVED");
    assert.equal(service.assertPublishApproved("flow-1", 1), true);
  } finally {
    restore();
  }
});

test("draft changes supersede every prior gate and restart at requirements", () => {
  const { db, state } = createApprovalDb();
  const { service, restore } = loadApprovalService(db);
  const admin = { id: "admin-1", name: "Administrator" };

  try {
    service.initializeApprovalWorkflow({ flowId: "flow-1", tenantId: 1, user: admin });
    service.decideApproval({
      flowId: "flow-1", tenantId: 1, user: admin, stage: "REQUIREMENTS", decision: "APPROVED"
    });

    const restarted = service.invalidateApprovalWorkflow(
      "flow-1",
      1,
      admin,
      "The draft graph changed."
    );

    assert.equal(restarted.stage, "REQUIREMENTS");
    assert.equal(restarted.status, "PENDING");
    assert.equal(state.flow.approval_state, "REQUIREMENTS_PENDING");
    assert.equal(state.approvals.filter(item => item.status === "SUPERSEDED").length, 2);
  } finally {
    restore();
  }
});
