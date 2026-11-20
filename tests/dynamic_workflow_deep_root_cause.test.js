const test = require("node:test");
const assert = require("node:assert/strict");
const conversationFlowService = require("../src/services/conversationFlowService");
const conversationFlowSeeds = require("../src/services/conversationFlowSeeds");
const conversationFlowEngine = require("../src/services/conversationFlowEngine");
const workflowTriggerService = require("../src/services/workflow/workflowTriggerService");
const { db } = require("../src/config/database");

// Dynamic ESM loader for frontend modules
async function loadFrontendAdapter() {
  const adapter = await import("../frontend/src/components/flow-studio/flowGraphAdapter.js");
  return adapter;
}

test("Deep Root-Cause Fixes & Dynamic Workflow Integration Suite", async (t) => {
  const tenantId = 1;

  await t.test("1. validateFlowGraph() accepts modern triggers and all 7 seeded blueprints", () => {
    const templates = conversationFlowSeeds.DEFAULT_FLOW_TEMPLATES;
    assert.ok(templates.length >= 7, `Expected at least 7 seeded blueprints, found ${templates.length}`);

    // Verify all 7 blueprint slugs exist
    const expectedSlugs = [
      "b2b-sales-qualification-demo",
      "multi-channel-lead-gen-drip",
      "universal-dynamic-booking",
      "d2c-restaurant-order-cod-prepaid",
      "customer-support-triage-sla",
      "payment-recovery-renewal-reminder",
      "event-webinar-registration"
    ];

    for (const slug of expectedSlugs) {
      const bp = templates.find(t => t.slug === slug);
      assert.ok(bp, `Blueprint with slug ${slug} must be seeded`);
      const report = conversationFlowService.validateFlowGraph(bp.nodes, bp.transitions);
      assert.equal(report.isValid, true, `Blueprint ${slug} must pass validateFlowGraph cleanly: ${JSON.stringify(report.errors)}`);
      assert.equal(report.errors.length, 0);
    }
  });

  await t.test("2. Flow Creation, Draft Saving vs Publish Validation", () => {
    // A. Create new flow with default starter nodes
    const createdFlowData = conversationFlowService.createFlow({
      tenant_id: tenantId,
      name: "Root Cause Test Flow",
      description: "Testing modern flow lifecycle"
    });
    assert.ok(createdFlowData && createdFlowData.flow && createdFlowData.flow.id);
    const flowId = createdFlowData.flow.id;
    const initialDraft = createdFlowData.draftVersion;
    assert.ok(initialDraft);
    assert.equal(initialDraft.nodes.length, 3);
    assert.equal(initialDraft.nodes[0].type, "TRIGGER_WHATSAPP");
    assert.equal(initialDraft.nodes[1].type, "SEND_MESSAGE");
    assert.equal(initialDraft.nodes[2].type, "END");
    assert.equal(initialDraft.transitions.length, 2);

    // B. Save draft with an intentional invalid node (BUTTON_MENU with 0 options -> error)
    // Draft save MUST SUCCEED even if validationReport.isValid is false
    const invalidNodes = [
      ...initialDraft.nodes,
      {
        id: "broken_menu_1",
        type: "BUTTON_MENU",
        config: { prompt: "Please select", options: [] }
      }
    ];
    const invalidTransitions = [
      ...initialDraft.transitions,
      { source: "broken_menu_1", target: "node_end" }
    ];

    const draftResult = conversationFlowService.saveFlowDraft(flowId, {
      name: "Root Cause Draft With Broken Menu",
      nodes: invalidNodes,
      transitions: invalidTransitions
    }, { id: "admin", name: "Admin" }, tenantId);

    assert.equal(draftResult.success, true, "saveFlowDraft MUST always succeed and return success: true");
    assert.ok(draftResult.flow, "Should return updated flow object");
    assert.equal(draftResult.validationReport.isValid, false, "validationReport should report isValid: false for broken menu");
    assert.ok(draftResult.validationReport.errors.length > 0, "validationReport should list errors");

    // C. Publishing MUST FAIL when validationReport.isValid is false
    assert.throws(
      () => {
        conversationFlowService.publishFlow(flowId, { id: "admin", name: "Admin" }, tenantId);
      },
      (err) => {
        assert.ok(err.validationErrors && err.validationErrors.length > 0);
        return true;
      },
      "publishFlow must throw an error with validationErrors attached"
    );

    // D. Fix graph and verify publish succeeds
    conversationFlowService.saveFlowDraft(flowId, {
      name: "Root Cause Valid Flow",
      nodes: initialDraft.nodes,
      transitions: initialDraft.transitions
    }, { id: "admin", name: "Admin" }, tenantId);

    const publishResult = conversationFlowService.publishFlow(flowId, { id: "admin", name: "Admin" }, tenantId);
    assert.ok(publishResult);
    assert.equal(publishResult.flow.status, "PUBLISHED");
    assert.ok(publishResult.publishedVersion);
  });

  await t.test("3. toReactFlowGraph / toSarvyaGraph roundtrip sanitization", async () => {
    const { toReactFlowGraph, toSarvyaGraph } = await loadFrontendAdapter();

    const sampleNodes = [
      {
        id: "trg_1",
        type: "TRIGGER_WHATSAPP",
        config: { triggerType: "KEYWORD", keywords: ["hello"] }
      },
      {
        id: "msg_1",
        type: "SEND_MESSAGE",
        config: { messageText: "Welcome!" }
      },
      {
        id: "end_1",
        type: "END",
        config: {}
      }
    ];

    const sampleTransitions = [
      { from: "trg_1", to: "msg_1", sourceHandle: "default" },
      { from: "msg_1", to: "end_1", sourceHandle: "default" }
    ];

    // Convert to React Flow graph
    const rfGraph = toReactFlowGraph(sampleNodes, sampleTransitions);
    assert.equal(rfGraph.nodes.length, 3);
    assert.equal(rfGraph.edges.length, 2);

    // Simulate React Flow injecting UI / selection / drag properties
    rfGraph.nodes[0].selected = true;
    rfGraph.nodes[0].dragging = false;
    rfGraph.nodes[0].data.raw = { ...sampleNodes[0] };
    rfGraph.nodes[0].data.resolvedType = "TRIGGER_WHATSAPP";
    rfGraph.nodes[0].data.validationIssues = ["Sample warning"];
    rfGraph.nodes[0].data.activeSimulatedNodeId = "trg_1";
    rfGraph.nodes[0].data.showAnalyticsOverlay = true;
    rfGraph.nodes[0].data.metrics = { entered: 10, completed: 8 };

    // Convert back to SARVYA graph
    const sarvyaGraph = toSarvyaGraph(rfGraph.nodes, rfGraph.edges);
    assert.equal(sarvyaGraph.nodes.length, 3);
    assert.equal(sarvyaGraph.transitions.length, 2);

    const sanitizedNode = sarvyaGraph.nodes[0];
    assert.strictEqual(sanitizedNode.selected, undefined, "UI property 'selected' must be stripped");
    assert.strictEqual(sanitizedNode.dragging, undefined, "UI property 'dragging' must be stripped");
    assert.strictEqual(sanitizedNode.raw, undefined, "Internal property 'raw' must be stripped");
    assert.strictEqual(sanitizedNode.validationIssues, undefined, "validationIssues must be stripped");
    assert.strictEqual(sanitizedNode.activeSimulatedNodeId, undefined, "activeSimulatedNodeId must be stripped");
    assert.strictEqual(sanitizedNode.showAnalyticsOverlay, undefined, "showAnalyticsOverlay must be stripped");
    assert.strictEqual(sanitizedNode.metrics, undefined, "metrics must be stripped");
  });

  await t.test("4. Handle aliasing & universal fallback in resolveNextTransition()", () => {
    const transitions = [
      { from: "wait_1", to: "msg_early", sourceHandle: "early_reply" },
      { from: "wait_1", to: "msg_timeout", sourceHandle: "timeout" },
      { from: "intake_1", to: "msg_valid", sourceHandle: "valid" },
      { from: "intake_1", to: "msg_invalid", sourceHandle: "invalid" },
      { from: "webhook_1", to: "msg_fail", sourceHandle: "failure" }
    ];

    // Early reply aliasing
    const nextEarly = conversationFlowEngine.resolveNextTransition("wait_1", "replied_early", transitions);
    assert.ok(nextEarly);
    assert.equal(nextEarly.targetNodeId || nextEarly.id, "msg_early");

    // Timeout aliasing
    const nextTimeout = conversationFlowEngine.resolveNextTransition("wait_1", "after_delay", transitions);
    assert.ok(nextTimeout);
    assert.equal(nextTimeout.targetNodeId || nextTimeout.id, "msg_timeout");

    // Valid / Success aliasing
    const nextSuccess = conversationFlowEngine.resolveNextTransition("intake_1", "success", transitions);
    assert.ok(nextSuccess);
    assert.equal(nextSuccess.targetNodeId || nextSuccess.id, "msg_valid");

    // Failure / Error aliasing
    const nextError = conversationFlowEngine.resolveNextTransition("webhook_1", "error", transitions);
    assert.ok(nextError);
    assert.equal(nextError.targetNodeId || nextError.id, "msg_fail");

    // Single-edge universal fallback
    const singleEdgeTransitions = [
      { from: "single_node", to: "next_node", sourceHandle: "specific_handle_xyz" }
    ];
    const fallbackNext = conversationFlowEngine.resolveNextTransition("single_node", "unmatched_handle", singleEdgeTransitions);
    assert.ok(fallbackNext);
    assert.equal(fallbackNext.targetNodeId || fallbackNext.id, "next_node");
  });

  await t.test("5. Global escape keywords handling in flow engine", async () => {
    const testFlow = {
      id: "flow_escape_test",
      name: "Escape Test",
      status: "PUBLISHED",
      nodes: [
        { id: "node_trg", type: "TRIGGER_WHATSAPP", config: { triggerType: "KEYWORD", keywords: ["help"] } },
        { id: "node_ask", type: "COLLECT_INPUT", config: { prompt: "Please enter your name", variableName: "customer_name" } },
        { id: "node_end", type: "END", config: {} }
      ],
      transitions: [
        { from: "node_trg", to: "node_ask" },
        { from: "node_ask", to: "node_end", sourceHandle: "valid" }
      ]
    };

    // Simulate session in node_ask
    const mockSession = {
      id: "sess_esc_1",
      session_key: "WHATSAPP:919000000001:1",
      tenant_id: tenantId,
      flow_id: testFlow.id,
      sender_phone: "919000000001",
      current_node_id: "node_ask",
      session_status: "ACTIVE",
      variables: {},
      collected_data: {}
    };

    // Test 'cancel' keyword -> terminates session with replyText
    const exitResult = await conversationFlowEngine.processTurn({
      senderPhone: "919000000001",
      userInput: "cancel",
      context: {
        tenantId,
        isSimulation: true,
        simulationState: mockSession,
        flowOverride: testFlow
      }
    });

    assert.equal(exitResult.handled, true);
    assert.equal(exitResult.sessionStatus, "CANCELLED");
    assert.ok(exitResult.replyText.toLowerCase().includes("cancelled") || exitResult.replyText.toLowerCase().includes("cancel"));

    // Test 'restart' keyword -> resets to start node
    const restartResult = await conversationFlowEngine.processTurn({
      senderPhone: "919000000001",
      userInput: "restart",
      context: {
        tenantId,
        isSimulation: true,
        simulationState: mockSession,
        flowOverride: testFlow
      }
    });

    assert.equal(restartResult.handled, true);
    assert.ok(restartResult.replyText || restartResult.accumulatedReplies || restartResult.interactivePayload);
  });
});
