const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");

const expressionEvaluator = require("../src/services/workflow/expressionEvaluator");
const workflowTriggerService = require("../src/services/workflow/workflowTriggerService");
const flowEngine = require("../src/services/conversationFlowEngine");
const flowService = require("../src/services/conversationFlowService");
const crmService = require("../src/services/crmPipelineService");
const schedulerService = require("../src/services/schedulerService");
const webhookExecutor = require("../src/services/workflow/nodeExecutors/webhookExecutor");

describe("Dynamic Multi-Industry Workflow Platform Test Suite (Phases 2, 3 & 4)", () => {
  let server;
  let baseUrl;
  let adminToken;
  const testUserId = `admin_workflow_${Date.now()}`;
  const testPhone = "919876543210"; // Sandbox test phone

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("AdminPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Workflow Platform Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(testUserId, `wf_admin_${Date.now()}@survya.local`, testPhone, hash);

    adminToken = jwt.sign(
      { id: testUserId, email: `wf_admin_${Date.now()}@survya.local`, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) server.close();
    try {
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone LIKE '919876%'").run();
      db.prepare("DELETE FROM workflow_scheduled_jobs WHERE tenant_id = 1 AND session_id LIKE 'test_%'").run();
      db.prepare("DELETE FROM crm_records WHERE tenant_id = 1 AND contact_phone LIKE '919876%'").run();
    } catch (e) {}
  });

  // =========================================================================
  // 1. EXPRESSION EVALUATOR & ZERO-EVAL SAFE ENGINE
  // =========================================================================
  describe("1. Expression & Template Engine", () => {
    test("A. Dot-path resolution and mustache template interpolation", () => {
      const context = {
        guest: { name: "Aditi Sharma", address: { city: "Pune" } },
        order: { total: 12500 }
      };

      const template = "Hello {{guest.name}} from {{guest.address.city}}! Total: ₹{{order.total}}";
      const rendered = expressionEvaluator.interpolateTemplate(template, context);
      assert.equal(rendered, "Hello Aditi Sharma from Pune! Total: ₹12500");
    });

    test("B. Condition rule evaluation (ALL and ANY logic with numbers)", () => {
      const vars = { seats: 50, budget: 100000, industry: "Finance" };

      // ALL match (true)
      const allRules = [
        { variable: "seats", operator: "GREATER_THAN_OR_EQUAL", value: 25 },
        { variable: "industry", operator: "EQUALS", value: "Finance" }
      ];
      assert.equal(expressionEvaluator.evaluateRules(allRules, "ALL", vars), true);

      // ALL match (false due to budget)
      const failingRules = [
        { variable: "seats", operator: "GREATER_THAN_OR_EQUAL", value: 25 },
        { variable: "budget", operator: "LESS_THAN", value: 50000 }
      ];
      assert.equal(expressionEvaluator.evaluateRules(failingRules, "ALL", vars), false);

      // ANY match (true)
      assert.equal(expressionEvaluator.evaluateRules(failingRules, "ANY", vars), true);
    });

    test("C. Variable mutations (SET, INCREMENT, DECREMENT, APPEND_TAG, CONCAT)", () => {
      const state = { score: 50, tags: ["Enterprise"], name: "Rahul" };

      assert.equal(expressionEvaluator.computeVariable(state.score, "INCREMENT", 25), 75);
      assert.equal(expressionEvaluator.computeVariable(state.score, "DECREMENT", 10), 40);
      assert.deepEqual(expressionEvaluator.computeVariable(state.tags, "APPEND_TAG", "Hot Lead"), ["Enterprise", "Hot Lead"]);
      assert.equal(expressionEvaluator.computeVariable(state.name, "CONCAT", " Verma"), "Rahul Verma");
      assert.equal(expressionEvaluator.computeVariable(state.score, "SET", 100), 100);
    });
  });

  // =========================================================================
  // 2. HTTP WEBHOOK SSRF GUARD & DRY-RUN SAFETY
  // =========================================================================
  describe("2. HTTP Webhook SSRF Guard & Dry-Run Execution", () => {
    test("A. Rejects internal localhost, 127.0.0.1 and private IPs (SSRF protection)", () => {
      assert.throws(() => {
        webhookExecutor.validateUrlSecurity("http://127.0.0.1:8080/internal");
      }, /Loopback and local addresses are blocked/);

      assert.throws(() => {
        webhookExecutor.validateUrlSecurity("http://localhost:5000/api");
      }, /Loopback and local addresses are blocked/);

      assert.throws(() => {
        webhookExecutor.validateUrlSecurity("http://169.254.169.254/latest/meta-data/");
      }, /Cloud provider instance metadata endpoints are strictly prohibited/);

      assert.throws(() => {
        webhookExecutor.validateUrlSecurity("http://192.168.1.1/admin");
      }, /Private network IP ranges are blocked/);
    });

    test("B. Allows public HTTPS endpoints and returns mock result on dryRun", async () => {
      const mockNode = {
        id: "webhook_1",
        type: "HTTP_WEBHOOK",
        data: {
          url: "https://api.example.com/lead-notify",
          method: "POST",
          headers: { "x-api-key": "test_key" },
          bodyTemplate: "{\"lead\":\"test\"}"
        }
      };

      const execResult = await webhookExecutor.execute(mockNode, {
        session: {},
        collectedData: {},
        dryRun: true
      });

      assert.equal(execResult.success, true);
      assert.equal(execResult.mock, true);
      assert.equal(execResult.responseStatus, 200);
    });
  });

  // =========================================================================
  // 3. DYNAMIC CRM PIPELINES & RECORDS API
  // =========================================================================
  describe("3. Dynamic CRM Pipelines & Records API", () => {
    let pipelineId;
    let recordId;

    test("A. GET /api/v1/crm/pipelines returns seeded multi-industry pipelines", async () => {
      const res = await fetch(`${baseUrl}/api/v1/crm/pipelines`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.length >= 3);

      const b2bPipeline = data.data.find(p => p.industry === "B2B_SAAS" || p.industry === "B2B_SALES");
      assert.ok(b2bPipeline);
      pipelineId = b2bPipeline.id;
    });

    test("B. POST /api/v1/crm/records creates a deal record with lead score and tags", async () => {
      const res = await fetch(`${baseUrl}/api/v1/crm/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          stage_id: "demo",
          stage_name: "Demo Scheduled",
          title: "Acme Corp Enterprise Suite",
          contact_phone: "919876543210",
          contact_name: "Vikram Malhotra",
          deal_value: 75000,
          lead_score: 92,
          tags: ["Enterprise", "High Value"],
          custom_fields: { seats: 120, plan: "Custom Enterprise" }
        })
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.id);
      recordId = data.data.id;
    });

    test("C. POST /api/v1/crm/records/:id/stage updates deal stage cleanly", async () => {
      const res = await fetch(`${baseUrl}/api/v1/crm/records/${recordId}/stage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          stage_id: "won",
          stage_name: "Closed Won",
          status: "WON"
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.stage_id, "WON");
      assert.equal(data.data.status, "WON");
    });
  });

  // =========================================================================
  // 4. MULTI-CHANNEL TRIGGER INDEXING & INBOUND WEBHOOK EXECUTION
  // =========================================================================
  describe("4. Multi-Channel Trigger Indexing & Inbound Webhooks", () => {
    let createdTriggerFlowId = null;

    after(() => {
      if (createdTriggerFlowId) {
        try {
          db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ?").run(String(createdTriggerFlowId));
          db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id = ?").run(createdTriggerFlowId);
          db.prepare("DELETE FROM conversation_flows WHERE id = ?").run(createdTriggerFlowId);
          require("../src/services/workflow/runtimeCache").invalidateTriggers(1);
        } catch (_) {}
      }
    });

    test("A. Trigger sync indexes keywords and external webhook triggers", () => {
      const sampleNodes = [
        {
          id: "node_trg_wa",
          type: "TRIGGER_WHATSAPP",
          data: {
            keywords: ["alpha_custom_trigger_xyz", "gamma_custom_kw"],
            matchType: "CONTAINS",
            triggerKey: "trg_test_demo"
          }
        },
        {
          id: "node_trg_hook",
          type: "TRIGGER_EVENT",
          data: {
            eventType: "WEBHOOK",
            triggerKey: "hook_test_lead_inbound",
            secretToken: "secret_12345"
          }
        }
      ];

      const flowCreated = flowService.createFlow({
        tenant_id: 1,
        name: "Dynamic Platform Trigger Test Flow",
        description: "Temporary trigger verification flow",
        nodes: sampleNodes,
        transitions: []
      }, { id: testUserId });
      createdTriggerFlowId = flowCreated.flow.id;
      const verId = flowCreated.draftVersion.id;
      db.prepare("UPDATE conversation_flow_versions SET status = 'PUBLISHED' WHERE id = ?").run(verId);
      db.prepare("UPDATE conversation_flows SET status = 'PUBLISHED', published_version_id = ? WHERE id = ?").run(verId, createdTriggerFlowId);

      workflowTriggerService.syncFlowTriggers(1, createdTriggerFlowId, sampleNodes);

      // Verify keyword match
      const kwMatch = workflowTriggerService.matchInboundTrigger(1, { text: "I want a alpha_custom_trigger_xyz please" });
      assert.ok(kwMatch);
      assert.equal(Number(kwMatch.flowId), Number(createdTriggerFlowId));
      assert.equal(kwMatch.nodeId, "node_trg_wa");

      // Verify no match on random text
      const noMatch = workflowTriggerService.matchInboundTrigger(1, { text: "Unrelated afternoon greeting xyz999" });
      assert.equal(noMatch, null);
    });

    test("B. POST /api/v1/workflows/hooks/:triggerKey rejects missing secret and invalid phone", async () => {
      // 1. Missing secret
      const res1 = await fetch(`${baseUrl}/api/v1/workflows/hooks/hook_test_lead_inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "919876543210" })
      });
      assert.equal(res1.status, 401);

      // 2. Missing phone with valid secret
      const res2 = await fetch(`${baseUrl}/api/v1/workflows/hooks/hook_test_lead_inbound`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": "secret_12345"
        },
        body: JSON.stringify({ name: "Rohan" })
      });
      assert.equal(res2.status, 400);
    });
  });

  // =========================================================================
  // 5. ASYNC DELAY SCHEDULER, CANCEL-ON-REPLY & 24H WINDOW COMPLIANCE
  // =========================================================================
  describe("5. Async Delay Worker & Compliance Guard", () => {
    test("A. Inserts pending delay job and fast-forwards in simulator", async () => {
      const delayNode = {
        id: "delay_1",
        type: "WAIT_DELAY",
        data: { delayAmount: 15, delayUnit: "MINUTES", cancelOnReply: true }
      };

      // In simulation mode (dryRun: true), WAIT_DELAY should return pendingDelay without blocking
      const delayExecutor = require("../src/services/workflow/nodeExecutors/delayExecutor");
      const res = await delayExecutor.execute(delayNode, {
        session: { id: "test_sess_1" },
        collectedData: {},
        dryRun: true
      });

      assert.equal(res.success, true);
      assert.equal(res.delayScheduled, true);
      assert.equal(res.pendingDelay.amount, 15);
      assert.equal(res.pendingDelay.unit, "MINUTES");
    });

    test("B. Scheduler blocks free-form messages when Meta 24-hour window has expired", async () => {
      // Create a test session whose last_interaction_at is 25 hours ago
      const sessKey = `test_sess_${Date.now()}`;
      const sessRes = db.prepare(`
        INSERT INTO conversation_flow_sessions (
          tenant_id, property_id, flow_id, flow_version_id, current_node_id,
          session_key, sender_phone, session_status, last_interaction_at, created_at
        ) VALUES (1, 1, '1', 1, 'node_welcome', ?, ?, 'ACTIVE', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 25 HOUR), UTC_TIMESTAMP())
      `).run(sessKey, testPhone);
      const sessId = sessRes.lastInsertRowid;

      // Insert scheduled job for this session whose run_at <= UTC_TIMESTAMP()
      const jobRes = db.prepare(`
        INSERT INTO workflow_scheduled_jobs (
          tenant_id, session_id, flow_id, resume_node_id, resume_handle,
          job_type, cancel_on_reply, run_at, status
        ) VALUES (1, ?, '1', 'node_welcome', 'default', 'DELAY_RESUME', 1, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE), 'PENDING')
      `).run(String(sessId));

      // Trigger scheduler worker sweep
      await schedulerService.checkWorkflowScheduledJobs();

      // Check job status in DB
      const job = db.prepare("SELECT * FROM workflow_scheduled_jobs WHERE id = ?").get(jobRes.lastInsertRowid);
      assert.ok(job);
      assert.equal(job.status, "FAILED");
      assert.ok(job.last_error.includes("WINDOW_CLOSED_24H"));

      // Clean up
      db.prepare("DELETE FROM workflow_scheduled_jobs WHERE id = ?").run(job.id);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE id = ?").run(sessId);
    });
  });

  // =========================================================================
  // 6. MULTI-INDUSTRY BLUEPRINTS & LIVE ANALYTICS OVERLAY
  // =========================================================================
  describe("6. Multi-Industry Starter Blueprints & Visual Analytics", () => {
    test("A. All 3 multi-industry blueprints are available in templates API", async () => {
      const res = await fetch(`${baseUrl}/api/flows/conversation-templates`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      const slugs = data.templates.map(t => t.slug);
      assert.ok(slugs.includes("b2b-sales-qualification-demo"), "B2B Sales Blueprint missing");
      assert.ok(slugs.includes("multi-channel-lead-gen-drip"), "Lead Gen Drip Blueprint missing");
      assert.ok(slugs.includes("universal-dynamic-booking"), "Universal Dynamic Booking Blueprint missing");
    });

    test("B. Flow analytics returns nodeMetrics map with entered, completed and dropoff rates", async () => {
      const res = await fetch(`${baseUrl}/api/flows/conversation-flows/1/analytics`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.analytics.nodeMetrics);
      assert.equal(typeof data.analytics.nodeMetrics, "object");
    });
  });
});
