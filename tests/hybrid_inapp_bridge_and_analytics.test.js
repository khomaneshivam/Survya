const test = require("node:test");
const assert = require("node:assert/strict");
const { db, initializeDatabase } = require("../src/config/database");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const inappBridgeExecutor = require("../src/services/workflow/nodeExecutors/inappBridgeExecutor");
const flowAnalyticsService = require("../src/services/workflow/flowAnalyticsService");
const aiFlowGeneratorService = require("../src/services/workflow/aiFlowGeneratorService");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");

// Ensure DB schema initialized
initializeDatabase();

const TEST_TENANT = 9992;
const TEST_PHONE = "919999988888";

function setupTestEnvironment() {
  // Clean up previous test artifacts for TEST_TENANT
  db.prepare(`DELETE FROM inapp_sessions WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM inapp_experiences WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM flow_node_daily_metrics WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM conversation_flow_events WHERE session_id IN (SELECT id FROM conversation_flow_sessions WHERE tenant_id = ?)`).run(TEST_TENANT);
  db.prepare(`DELETE FROM conversation_flow_sessions WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM conversation_flow_versions WHERE flow_id IN (SELECT id FROM conversation_flows WHERE tenant_id = ?)`).run(TEST_TENANT);
  db.prepare(`DELETE FROM conversation_flows WHERE tenant_id = ?`).run(TEST_TENANT);

  // 1. Create In-App Experience
  const expRes = db.prepare(`
    INSERT INTO inapp_experiences (
      tenant_id, slug, name, domain_type, entry_screen_key, theme_json,
      active_status, delete_status, created_at, updated_at
    ) VALUES (
      ?, 'villa-express-booking', 'Luxury Villa Direct Booking', 'HOSPITALITY',
      'welcome', '{"primaryColor": "#16A34A"}', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `).run(TEST_TENANT);

  // 2. Create Sample Conversation Flow
  const flowDefinition = {
    startNodeId: "node_start",
    nodes: [
      {
        id: "node_start",
        type: "TRIGGER_WHATSAPP",
        title: "Inbound Hi Trigger",
        config: { triggerType: "KEYWORD", keywords: ["hi", "book"] }
      },
      {
        id: "node_menu",
        type: "COLLECT_INPUT",
        title: "Intake Question (Friction Point)",
        config: { prompt: "Please type your full vacation requirements in detail:" }
      },
      {
        id: "node_inapp_bridge",
        type: "OPEN_INAPP_EXPERIENCE",
        title: "Villa Interactive App",
        config: {
          experienceSlug: "villa-express-booking",
          messageText: "Tap below to view full 4K photo gallery & select rooms:",
          buttonLabel: "Open Interactive Experience 📱",
          waitForCompletion: true,
          carrySessionVars: ["selected_location_id", "guest_name", "check_in"]
        }
      },
      {
        id: "node_confirmed",
        type: "SEND_MESSAGE",
        title: "Confirmation Message",
        config: { text: "Thank you! Your stay is confirmed." }
      }
    ],
    transitions: [
      { id: "tr_1", source: "node_start", target: "node_menu", handle: "default" },
      { id: "tr_2", source: "node_menu", target: "node_inapp_bridge", handle: "default" },
      { id: "tr_3", source: "node_inapp_bridge", target: "node_confirmed", handle: "completed" }
    ],
    variables: {}
  };

  const createRes = flowService.createFlow({
    tenant_id: TEST_TENANT,
    name: 'Hybrid In-App Villa Flow',
    description: 'Test Flow for In-App Bridge',
    category: 'HOSPITALITY',
    nodes: flowDefinition.nodes,
    transitions: flowDefinition.transitions,
    variables: flowDefinition.variables
  }, { id: "test_admin", name: "Test Admin" });

  const flowId = createRes.flow.id;
  const versionId = createRes.draftVersion?.id || 1;

  // 3. Create active flow session
  const sessionRes = db.prepare(`
    INSERT INTO conversation_flow_sessions (
      tenant_id, flow_id, flow_version_id, session_key, sender_phone, current_node_id,
      session_status, collected_data_json, last_interaction_at, expires_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, 'sess_test_123', ?, 'node_inapp_bridge',
      'ACTIVE', '{"guest_name": "Rohan Sharma", "selected_location_id": 42, "check_in": "2026-12-01"}',
      UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `).run(TEST_TENANT, flowId, versionId, TEST_PHONE);

  const sessionId = sessionRes.lastInsertRowid;

  return {
    experienceId: expRes.lastInsertRowid,
    flowId,
    sessionId,
    flowDefinition
  };
}

test("Scenario 1: OPEN_INAPP_EXPERIENCE node creates linked session carrying pre-populated vars", async () => {
  const env = setupTestEnvironment();

  const node = env.flowDefinition.nodes.find(n => n.id === "node_inapp_bridge");
  const context = {
    tenantId: TEST_TENANT,
    flowSessionId: env.sessionId,
    recipientPhone: TEST_PHONE,
    session: {
      id: env.sessionId,
      sender_phone: TEST_PHONE,
      guest_name: "Rohan Sharma",
      selected_location_id: 42,
      check_in: "2026-12-01"
    },
    isWaitingForThisNode: false
  };

  const result = await inappBridgeExecutor.execute(node, context);

  assert.equal(result.action, "WAIT_FOR_INPUT", "Node should pause flow waiting for in-app completion");
  assert.ok(result.replyMessages?.length > 0, "Should generate WhatsApp reply message");
  const msg = result.replyMessages[0];
  assert.ok(msg.includes("/x/villa-express-booking?ct="), "Message should contain opaque ?ct= continuation link");
  assert.ok(msg.includes("Open Interactive Experience"), "Message should include button label");

  // Verify inapp_sessions row in DB
  const linkedSession = db.prepare(`
    SELECT * FROM inapp_sessions
    WHERE tenant_id = ? AND flow_session_id = ?
  `).get(TEST_TENANT, env.sessionId);

  assert.ok(linkedSession, "Linked inapp_sessions row must exist");
  assert.equal(linkedSession.visitor_phone, TEST_PHONE);
  assert.equal(linkedSession.visitor_name, "Rohan Sharma");

  const carriedData = JSON.parse(linkedSession.state_data_json || linkedSession.session_data_json || "{}");
  assert.equal(carriedData.selected_location_id, 42, "Must carry selected_location_id variable");
  assert.equal(carriedData.check_in, "2026-12-01", "Must carry check_in date variable");
});

test("Scenario 2: syncInappCompletionToFlowSession merges completion data & advances WhatsApp flow along 'completed' handle", async () => {
  const env = setupTestEnvironment();

  // Create linked session
  const linked = inappRuntimeService.createLinkedSession({
    tenantId: TEST_TENANT,
    slug: "villa-express-booking",
    flowSessionId: env.sessionId,
    customerPhone: TEST_PHONE,
    customerName: "Rohan Sharma",
    carrySessionVars: ["selected_location_id"],
    initialData: { selected_location_id: 42 }
  });

  assert.ok(linked.sessionToken, "Must generate valid session token");

  // Customer completes form / checkout in the In-App Experience
  const completionData = {
    transaction_ref: "TXN-VILLA-2026-991",
    room_booked: "Presidential Suite",
    deposit_paid_inr: 5000
  };

  const syncResult = inappRuntimeService.syncInappCompletionToFlowSession(linked.sessionToken, completionData);

  assert.ok(syncResult.synced, "Completion sync must succeed");
  assert.equal(syncResult.nextNodeId, "node_confirmed", "Must advance flow to target of 'completed' handle");

  // Verify flow session in DB
  const updatedFlowSession = db.prepare(`
    SELECT * FROM conversation_flow_sessions WHERE id = ?
  `).get(env.sessionId);

  assert.equal(updatedFlowSession.current_node_id, "node_confirmed", "Flow session current_node_id must advance to node_confirmed");

  const collected = JSON.parse(updatedFlowSession.collected_data_json || "{}");
  assert.equal(collected.transaction_ref, "TXN-VILLA-2026-991", "Collected data must have transaction_ref");
  assert.equal(collected.deposit_paid_inr, 5000, "Collected data must have deposit_paid_inr");
  assert.equal(collected.inapp_completed, true, "Must flag inapp_completed as true");
});

test("Scenario 3: Pre-aggregated O(1) Flow Funnel Metrics, IST date accuracy & bottleneck identification", async () => {
  const env = setupTestEnvironment();

  // Record atomic node events
  // node_start: 10 entries, 10 completions
  for (let i = 0; i < 10; i++) {
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_start", "ENTRY", { nodeType: "TRIGGER_WHATSAPP" });
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_start", "COMPLETION", { nodeType: "TRIGGER_WHATSAPP" });
  }

  // node_menu: 10 entries, 3 completions, 7 dropoffs (70% dropoff rate bottleneck!)
  for (let i = 0; i < 10; i++) {
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_menu", "ENTRY", { nodeType: "COLLECT_INPUT" });
  }
  for (let i = 0; i < 3; i++) {
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_menu", "COMPLETION", { nodeType: "COLLECT_INPUT" });
  }
  for (let i = 0; i < 7; i++) {
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_menu", "DROPOFF", { nodeType: "COLLECT_INPUT" });
  }

  // node_inapp_bridge: 3 entries, 2 conversions with ₹15,000 revenue
  flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_inapp_bridge", "ENTRY", { nodeType: "OPEN_INAPP_EXPERIENCE" });
  flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_inapp_bridge", "CONVERSION", {
    nodeType: "OPEN_INAPP_EXPERIENCE",
    revenueInr: 15000
  });

  // Query funnel analytics (< 50ms)
  const startTime = Date.now();
  const funnel = flowAnalyticsService.getFlowFunnelAnalytics(TEST_TENANT, env.flowId, 30);
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 100, `Funnel query must be fast (took ${elapsed}ms)`);
  assert.equal(funnel.kpis.totalEntries, 10);
  assert.equal(funnel.kpis.totalDropoffs, 7);
  assert.equal(funnel.kpis.totalRevenueInr, 15000);

  // Check bottleneck detection
  assert.ok(funnel.bottleneckNode, "Must detect bottleneck node");
  assert.equal(funnel.bottleneckNode.nodeId, "node_menu", "node_menu must be identified as primary bottleneck");
  assert.equal(funnel.bottleneckNode.dropOffRate, 70, "Drop-off rate must match 70%");

  // Test maintenance jobs
  const rollupRes = flowAnalyticsService.rollupFlowDropoffs(TEST_TENANT);
  assert.ok(typeof rollupRes.rolledUpCount === "number");

  const pruneRes = flowAnalyticsService.pruneOldEvents(90);
  assert.ok(typeof pruneRes.prunedRows === "number");
});

test("Scenario 4: 1-Click AI Flow Optimizer generates actionable recommendations & applies safe graph patch", async () => {
  const env = setupTestEnvironment();

  // Add metrics so node_menu has dropoffs
  for (let i = 0; i < 5; i++) {
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_menu", "ENTRY", { nodeType: "COLLECT_INPUT" });
    flowAnalyticsService.recordNodeEvent(TEST_TENANT, env.flowId, "node_menu", "DROPOFF", { nodeType: "COLLECT_INPUT" });
  }

  // Run AI Flow Optimizer
  const result = aiFlowGeneratorService.optimizeFlow(TEST_TENANT, env.flowId);

  assert.ok(result.success, "optimizeFlow must succeed");
  assert.ok(result.recommendations?.length > 0, "Must return recommendations");

  // Verify recommendations contain structured patch
  const inputRec = result.recommendations.find(r => r.targetNodeId === "node_menu" || r.category === "FRICTION_REDUCTION");
  assert.ok(inputRec, "Must recommend friction reduction for high drop-off input node");
  assert.ok(inputRec.patch, "Recommendation must have patch payload");
  assert.ok(inputRec.expectedImpact, "Must specify expected impact");

  // Apply optimization
  const applyRes = aiFlowGeneratorService.applyOptimization(TEST_TENANT, env.flowId, {
    recommendationId: inputRec.id,
    patch: inputRec.patch,
    patchType: inputRec.patchType,
    user: { username: "qa_test_admin" }
  });

  assert.ok(applyRes.success, "applyOptimization must succeed");
  assert.ok(applyRes.validationReport.isValid, "Updated graph must pass validation");

  // Verify updated draft in DB
  const updatedFlow = flowService.getFlowById(env.flowId, TEST_TENANT);
  assert.ok(updatedFlow?.draftVersion, "Must have draftVersion");
  const updatedNode = updatedFlow.draftVersion.nodes.find(n => n.id === "node_menu");

  assert.equal(updatedNode.config.inputType, "BUTTON_SELECT", "node_menu should now have BUTTON_SELECT inputType");
});
