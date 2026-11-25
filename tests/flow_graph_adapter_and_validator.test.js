const test = require("node:test");
const assert = require("node:assert/strict");

// Dynamic ESM loader helper for frontend modules
async function loadModules() {
  const adapter = await import("../frontend/src/components/flow-studio/flowGraphAdapter.js");
  const validator = await import("../frontend/src/components/flow-studio/flowGraphValidator.js");
  const definitions = await import("../frontend/src/components/flow-studio/nodeDefinitions.js");
  return { ...adapter, ...validator, ...definitions };
}

test("Node Definitions - All composable node types and legacy fallbacks resolve", async () => {
  const { getNodeDefinition, NODE_DEFINITIONS } = await loadModules();

  assert.ok(NODE_DEFINITIONS.length >= 12, "Should define at least 12 composable node types");
  assert.ok(NODE_DEFINITIONS.length >= 14, "Contains all specialized multi-industry node types");

  // Test core types
  const triggerDef = getNodeDefinition("TRIGGER_WHATSAPP");
  assert.equal(triggerDef.category, "TRIGGERS");

  const messageDef = getNodeDefinition("SEND_MESSAGE");
  assert.equal(messageDef.category, "MESSAGING");

  const conditionDef = getNodeDefinition("CONDITION");
  assert.equal(conditionDef.category, "LOGIC");

  const endDef = getNodeDefinition("END");
  assert.equal(endDef.category, "ACTIONS");

  // Test legacy fallback resolution
  assert.equal(getNodeDefinition("START").canonicalType, "TRIGGER_WHATSAPP");
  assert.equal(getNodeDefinition("MESSAGE").canonicalType, "SEND_MESSAGE");
  assert.equal(getNodeDefinition("INPUT_COLLECTION").canonicalType, "COLLECT_INPUT");
  assert.equal(getNodeDefinition("DELAY").canonicalType, "WAIT_DELAY");
  assert.equal(getNodeDefinition("HANDOFF").canonicalType, "HUMAN_HANDOFF");

  // Dynamic handles for BUTTON_MENU / SEND_MESSAGE with options
  const nodeWithOptions = {
    type: "SEND_MESSAGE",
    config: {
      options: [
        { id: "opt_resort", title: "Resort Stay" },
        { id: "opt_dining", title: "Dining" }
      ]
    }
  };
  const handles = messageDef.getOutputHandles(nodeWithOptions);
  assert.equal(handles.length, 3, "2 options + 1 default fallback handle");
  assert.equal(handles[0].id, "opt_resort");
  assert.equal(handles[1].id, "opt_dining");
  assert.equal(handles[2].id, "default");
});

test("Graph Adapter - toReactFlowGraph transforms legacy hospitality flow with Dagre layout", async () => {
  const { toReactFlowGraph, toSarvyaGraph } = await loadModules();

  const sarvyaNodes = [
    {
      id: "node_start",
      type: "START",
      title: "Inbound Greeting",
      config: { triggerKeywords: ["hi", "hello"] }
      // missing position -> Dagre should compute coordinates
    },
    {
      id: "node_menu",
      type: "BUTTON_MENU",
      title: "Choose Intent",
      config: {
        text: "How can we assist you today?",
        options: [
          { id: "btn_stay", title: "Book a Room" },
          { id: "btn_support", title: "Contact Front Desk" }
        ]
      }
    },
    {
      id: "node_end",
      type: "END",
      title: "End Conversation",
      config: { farewellMessage: "Thank you!" }
    }
  ];

  const sarvyaTransitions = [
    { id: "t1", source: "node_start", target: "node_menu" },
    { id: "t2", source: "node_menu", target: "node_end", sourceHandle: "btn_stay", optionId: "btn_stay" }
  ];

  const { nodes: rfNodes, edges: rfEdges } = toReactFlowGraph(sarvyaNodes, sarvyaTransitions);

  assert.equal(rfNodes.length, 3);
  assert.equal(rfEdges.length, 2);

  // Verify node structure
  const startRf = rfNodes.find((n) => n.id === "node_start");
  assert.ok(startRf);
  assert.equal(startRf.type, "customFlowNode");
  assert.equal(startRf.data.type, "START");
  assert.equal(startRf.data.resolvedType, "TRIGGER_WHATSAPP");
  assert.ok(typeof startRf.position.x === "number");
  assert.ok(typeof startRf.position.y === "number");

  // Verify non-overlapping coordinates calculated by Dagre
  const menuRf = rfNodes.find((n) => n.id === "node_menu");
  assert.notEqual(startRf.position.y, menuRf.position.y, "Dagre should arrange nodes with distinct Y coordinates in TB layout");

  // Verify edge structure
  const edge2 = rfEdges.find((e) => e.id === "t2");
  assert.ok(edge2);
  assert.equal(edge2.source, "node_menu");
  assert.equal(edge2.target, "node_end");
  assert.equal(edge2.sourceHandle, "btn_stay");

  // Round-trip back to SARVYA graph format
  const { nodes: roundTripNodes, transitions: roundTripTransitions } = toSarvyaGraph(rfNodes, rfEdges);
  assert.equal(roundTripNodes.length, 3);
  assert.equal(roundTripTransitions.length, 2);

  const rtStart = roundTripNodes.find((n) => n.id === "node_start");
  assert.equal(rtStart.type, "START");
  assert.deepEqual(rtStart.config.triggerKeywords, ["hi", "hello"]);
  assert.equal(rtStart.position.x, startRf.position.x);
  assert.equal(rtStart.position.y, startRf.position.y);
});

test("Graph Adapter - Preserves existing positions without forcing layout repositioning", async () => {
  const { toReactFlowGraph } = await loadModules();

  const sarvyaNodes = [
    {
      id: "node_a",
      type: "TRIGGER_WHATSAPP",
      title: "Start",
      position: { x: 150, y: 300 }
    },
    {
      id: "node_b",
      type: "END",
      title: "End",
      position: { x: 450, y: 600 }
    }
  ];

  const { nodes } = toReactFlowGraph(sarvyaNodes, []);
  assert.equal(nodes[0].position.x, 150);
  assert.equal(nodes[0].position.y, 300);
  assert.equal(nodes[1].position.x, 450);
  assert.equal(nodes[1].position.y, 600);
});

test("Flow Validator - Flags empty graphs and missing triggers", async () => {
  const { validateFlowGraph } = await loadModules();

  // Empty graph
  const emptyRes = validateFlowGraph([], []);
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.errors.some((e) => e.message.includes("contains no steps")));

  // Graph without trigger
  const noTriggerNodes = [
    {
      id: "n1",
      type: "SEND_MESSAGE",
      title: "Welcome",
      config: { text: "Hello!" }
    }
  ];
  const noTriggerRes = validateFlowGraph(noTriggerNodes, []);
  assert.equal(noTriggerRes.isValid, false);
  assert.ok(noTriggerRes.errors.some((e) => e.message.includes("Trigger")));
});

test("Flow Validator - Flags unconfigured required node fields", async () => {
  const { validateFlowGraph } = await loadModules();

  const invalidNodes = [
    {
      id: "node_trigger",
      type: "TRIGGER_WHATSAPP",
      title: "Inbound",
      config: {}
    },
    {
      id: "node_msg_empty",
      type: "SEND_MESSAGE",
      title: "Send Message",
      config: { text: "   " } // Empty text error
    },
    {
      id: "node_intake_empty",
      type: "COLLECT_INPUT",
      title: "Collect Data",
      config: { saveAs: "", prompt: "" } // Missing saveAs and prompt
    }
  ];

  const transitions = [
    { id: "t1", source: "node_trigger", target: "node_msg_empty" },
    { id: "t2", source: "node_msg_empty", target: "node_intake_empty" }
  ];

  const res = validateFlowGraph(invalidNodes, transitions);
  assert.equal(res.isValid, false);

  assert.ok(res.errors.some((e) => e.nodeId === "node_msg_empty" && e.message.includes("empty content")));
  assert.ok(res.errors.some((e) => e.nodeId === "node_intake_empty" && e.message.includes("variable")));
});

test("Flow Validator - Detects unreachable orphan nodes and unhandled branches", async () => {
  const { validateFlowGraph } = await loadModules();

  const nodes = [
    {
      id: "start_node",
      type: "TRIGGER_WHATSAPP",
      title: "Trigger",
      config: {}
    },
    {
      id: "cond_node",
      type: "CONDITION",
      title: "VIP Check",
      config: { rules: [{ variable: "is_vip", operator: "eq", value: "true" }] }
    },
    {
      id: "orphan_node",
      type: "SEND_MESSAGE",
      title: "Lonely Island",
      config: { text: "Nobody can reach me!" }
    },
    {
      id: "end_node",
      type: "END",
      title: "End",
      config: {}
    }
  ];

  const transitions = [
    { id: "t1", source: "start_node", target: "cond_node" },
    { id: "t2", source: "cond_node", target: "end_node", sourceHandle: "true" }
    // false branch on cond_node is not connected
    // orphan_node is not reachable
  ];

  const res = validateFlowGraph(nodes, transitions);

  // Should detect orphan_node disconnected/unreachable
  assert.ok(res.warnings.some((w) => w.nodeId === "orphan_node" && (w.message.includes("cannot be reached") || w.message.includes("disconnected"))));

  // Should warn on unhandled false branch
  assert.ok(res.warnings.some((w) => w.nodeId === "cond_node" && w.message.includes("False")));
});

test("Flow Validator - Complete multi-industry flow passes validation cleanly", async () => {
  const { validateFlowGraph } = await loadModules();

  const completeFlowNodes = [
    {
      id: "trigger_inbound",
      type: "TRIGGER_WHATSAPP",
      title: "Guest Inbound",
      config: { triggerKeywords: ["book", "stay"] }
    },
    {
      id: "msg_welcome",
      type: "SEND_MESSAGE",
      title: "Welcome Options",
      config: {
        text: "Welcome to KonkanTrip! Select an option:",
        options: [
          { id: "opt_book", title: "Book Room" },
          { id: "opt_staff", title: "Talk to Concierge" }
        ]
      }
    },
    {
      id: "collect_dates",
      type: "COLLECT_INPUT",
      title: "Check-in Date",
      config: {
        prompt: "Please provide your check-in date:",
        saveAs: "check_in_date"
      }
    },
    {
      id: "check_inventory",
      type: "CATALOG_BOOKING",
      title: "Inventory Availability",
      config: { action: "HOSPITALITY_CHECK_AVAILABILITY" }
    },
    {
      id: "handoff_staff",
      type: "HUMAN_HANDOFF",
      title: "Concierge Team",
      config: { team: "FRONT_DESK" }
    },
    {
      id: "journey_end",
      type: "END",
      title: "End Conversation",
      config: { farewellMessage: "Have a great day!" }
    }
  ];

  const completeTransitions = [
    { id: "t1", source: "trigger_inbound", target: "msg_welcome" },
    { id: "t2", source: "msg_welcome", target: "collect_dates", sourceHandle: "opt_book" },
    { id: "t3", source: "msg_welcome", target: "handoff_staff", sourceHandle: "opt_staff" },
    { id: "t4", source: "collect_dates", target: "check_inventory" },
    { id: "t5", source: "check_inventory", target: "journey_end" }
  ];

  const report = validateFlowGraph(completeFlowNodes, completeTransitions);
  assert.equal(report.isValid, true, `Expected valid flow, got errors: ${JSON.stringify(report.errors)}`);
  assert.equal(report.errors.length, 0);
});
