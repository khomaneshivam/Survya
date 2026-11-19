const test = require("node:test");
const assert = require("node:assert/strict");
const flowEngine = require("../src/services/conversationFlowEngine");
const { db } = require("../src/config/database");

test("Step Designer - Custom dynamically generated workflow executes end-to-end with zero hardcoding", async () => {
  // Define custom 6-step workflow created via StepJourneyDesigner (no hardcoded buttons or fields)
  const customNodes = [
    {
      id: "node_custom_start",
      type: "START",
      title: "Inbound Trigger",
      config: { triggerType: "INBOUND_ANY" }
    },
    {
      id: "node_custom_welcome",
      type: "MESSAGE",
      title: "Custom Welcome Greeting",
      config: {
        text: "🌴 Welcome to Azure Horizon Retreat! Please tell us how we can help you today."
      }
    },
    {
      id: "node_custom_menu",
      type: "BUTTON_MENU",
      title: "Select Service",
      config: {
        prompt: "Choose an option:",
        variable: "chosen_service",
        options: [
          { id: "opt_custom_resort", title: "Resort Stay 🏖️", value: "STAY" },
          { id: "opt_custom_dining", title: "Dining Reservation 🍷", value: "DINING" }
        ]
      }
    },
    {
      id: "node_custom_collect_email",
      type: "INPUT_COLLECTION",
      title: "Collect Guest Email",
      config: {
        prompt: "Please provide your email address for the reservation confirmation:",
        variable: "guest_email",
        validation: {
          type: "EMAIL",
          errorMessage: "⚠️ Please enter a valid email address (e.g. guest@example.com)."
        }
      }
    },
    {
      id: "node_custom_collect_party_size",
      type: "INPUT_COLLECTION",
      title: "Collect Party Size",
      config: {
        prompt: "How many guests in your party? (1 to 20)",
        variable: "party_size",
        validation: {
          type: "NUMBER",
          min: 1,
          max: 20,
          errorMessage: "⚠️ Party size must be between 1 and 20 guests."
        }
      }
    },
    {
      id: "node_custom_handoff",
      type: "HANDOFF",
      title: "Concierge Confirmation",
      config: {
        handoffMessage: "🎉 Thank you! Your request for {{party_size}} guests (Email: {{guest_email}}) has been received. Our team will message you shortly.",
        alertStaff: true
      }
    }
  ];

  const customTransitions = [
    { id: "t1", source: "node_custom_start", target: "node_custom_welcome" },
    { id: "t2", source: "node_custom_welcome", target: "node_custom_menu" },
    { id: "t3", source: "node_custom_menu", target: "node_custom_collect_email" },
    { id: "t4", source: "node_custom_collect_email", target: "node_custom_collect_party_size" },
    { id: "t5", source: "node_custom_collect_party_size", target: "node_custom_handoff" }
  ];

  // Turn 1: Inbound Greeting -> Welcomes and shows 2 custom dynamic buttons
  let state = {
    session_key: "WHATSAPP:919900881122:1",
    current_node_id: "node_custom_start",
    session_status: "ACTIVE",
    collectedData: {}
  };

  const turn1 = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "Hello",
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn1.handled, true);
  assert.match(turn1.replyText, /Azure Horizon Retreat/i);
  assert.equal(turn1.replyInteractive?.options?.length, 2);
  assert.equal(turn1.replyInteractive.options[0].id, "opt_custom_resort");
  assert.equal(turn1.currentNodeId, "node_custom_menu");

  // Turn 2: Customer clicks "Resort Stay 🏖️" -> advances to email collection
  state.current_node_id = turn1.currentNodeId;
  state.collectedData = turn1.collectedData;

  const turn2 = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "Resort Stay 🏖️",
    userPayload: { id: "opt_custom_resort", title: "Resort Stay 🏖️" },
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn2.handled, true);
  assert.equal(turn2.collectedData.chosen_service, "STAY");
  assert.match(turn2.replyText, /email address/i);
  assert.equal(turn2.currentNodeId, "node_custom_collect_email");

  // Turn 3A: Customer enters INVALID email -> Validation rejects with custom retry error
  state.current_node_id = turn2.currentNodeId;
  state.collectedData = turn2.collectedData;

  const turn3Invalid = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "not-an-email",
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn3Invalid.handled, true);
  assert.match(turn3Invalid.replyText, /Please enter a valid email address/i);
  assert.equal(turn3Invalid.currentNodeId, "node_custom_collect_email"); // Stays on same question

  // Turn 3B: Customer enters VALID email -> Advances to party size question
  const turn3Valid = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "vip.guest@retreat.com",
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn3Valid.handled, true);
  assert.equal(turn3Valid.collectedData.guest_email, "vip.guest@retreat.com");
  assert.match(turn3Valid.replyText, /How many guests/i);
  assert.equal(turn3Valid.currentNodeId, "node_custom_collect_party_size");

  // Turn 4A: Customer enters INVALID party size (> 20) -> Validation rejects
  state.current_node_id = turn3Valid.currentNodeId;
  state.collectedData = turn3Valid.collectedData;

  const turn4Invalid = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "35 guests",
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn4Invalid.handled, true);
  assert.match(turn4Invalid.replyText, /Party size must be between 1 and 20/i);
  assert.equal(turn4Invalid.currentNodeId, "node_custom_collect_party_size");

  // Turn 4B: Customer enters VALID party size -> Reaches handoff with interpolated variables
  const turn4Valid = await flowEngine.processTurn({
    senderPhone: "919900881122",
    userInput: "6",
    context: {
      isSimulation: true,
      simulationState: state,
      flowOverride: { nodes: customNodes, transitions: customTransitions }
    }
  });

  assert.equal(turn4Valid.handled, true);
  assert.equal(turn4Valid.collectedData.party_size, 6);
  assert.equal(turn4Valid.sessionStatus, "PAUSED_AGENT_HANDOFF");
  assert.match(turn4Valid.replyText, /Your request for 6 guests/i);
  assert.match(turn4Valid.replyText, /vip\.guest@retreat\.com/i);
});

test("Step Designer - Dynamic condition branching routes based on variable thresholds", async () => {
  const branchingNodes = [
    {
      id: "node_b_start",
      type: "START",
      title: "Inbound Start",
      config: { triggerType: "INBOUND_ANY" }
    },
    {
      id: "node_b_ask_guests",
      type: "INPUT_COLLECTION",
      title: "Ask Guest Count",
      config: {
        prompt: "How many guests will be joining us?",
        variable: "guest_count",
        validation: { type: "NUMBER", min: 1, max: 50, errorMessage: "Enter a number between 1 and 50" }
      }
    },
    {
      id: "node_b_condition",
      type: "CONDITION",
      title: "Branch by Group Size",
      config: {
        variable: "guest_count",
        rules: [
          { operator: "GREATER_THAN", value: "10", targetNodeId: "node_b_large_group" }
        ],
        defaultTargetNodeId: "node_b_standard_group"
      }
    },
    {
      id: "node_b_large_group",
      type: "MESSAGE",
      title: "Large Group Notice",
      config: {
        text: "🎉 You have a large group of {{guest_count}} guests! Our Banquet & Events coordinator will arrange group discounts."
      }
    },
    {
      id: "node_b_standard_group",
      type: "MESSAGE",
      title: "Standard Group Notice",
      config: {
        text: "🌴 Welcome! We have private luxury villas perfectly suited for {{guest_count}} guests."
      }
    }
  ];

  const branchingTransitions = [
    { id: "tb1", source: "node_b_start", target: "node_b_ask_guests" },
    { id: "tb2", source: "node_b_ask_guests", target: "node_b_condition" }
  ];

  // Test Case A: Customer enters 15 guests (> 10) -> Routes to large group branch
  const stateLarge = {
    session_key: "WHATSAPP:919911223344:1",
    current_node_id: "node_b_ask_guests",
    session_status: "ACTIVE",
    collectedData: {}
  };

  const turnLarge = await flowEngine.processTurn({
    senderPhone: "919911223344",
    userInput: "15",
    context: {
      isSimulation: true,
      simulationState: stateLarge,
      flowOverride: { nodes: branchingNodes, transitions: branchingTransitions }
    }
  });

  assert.equal(turnLarge.handled, true);
  assert.equal(turnLarge.collectedData.guest_count, 15);
  assert.match(turnLarge.replyText, /large group of 15 guests/i);
  assert.match(turnLarge.replyText, /Banquet & Events coordinator/i);

  // Test Case B: Customer enters 4 guests (<= 10) -> Routes to default standard group branch
  const stateStandard = {
    session_key: "WHATSAPP:919911223355:1",
    current_node_id: "node_b_ask_guests",
    session_status: "ACTIVE",
    collectedData: {}
  };

  const turnStandard = await flowEngine.processTurn({
    senderPhone: "919911223355",
    userInput: "4",
    context: {
      isSimulation: true,
      simulationState: stateStandard,
      flowOverride: { nodes: branchingNodes, transitions: branchingTransitions }
    }
  });

  assert.equal(turnStandard.handled, true);
  assert.equal(turnStandard.collectedData.guest_count, 4);
  assert.match(turnStandard.replyText, /private luxury villas perfectly suited for 4 guests/i);
});

test("Step Designer - Reusable Template creation and listing persists zero-hardcoded journey", async () => {
  const flowService = require("../src/services/conversationFlowService");

  const templatePayload = {
    title: "Eco Resort Glamping Journey",
    description: "Automated booking and eco-activity tour enquiry flow",
    industry: "HOSPITALITY",
    category: "GLAMPING",
    nodes: [
      { id: "n1", type: "START", title: "Start", config: { triggerType: "INBOUND_ANY" } },
      { id: "n2", type: "MESSAGE", title: "Greeting", config: { text: "Welcome to Eco Glamping!" } }
    ],
    transitions: [
      { id: "t1", source: "n1", target: "n2" }
    ]
  };

  const created = flowService.createTemplate(templatePayload);
  assert.ok(created.id);
  assert.ok(created.slug.startsWith("eco-resort-glamping-journey"));
  assert.equal(created.title, "Eco Resort Glamping Journey");

  // Verify it appears in template listing
  const allTemplates = flowService.listTemplates();
  const found = allTemplates.find(t => t.slug === created.slug);
  assert.ok(found);
  assert.equal(found.title, "Eco Resort Glamping Journey");
  assert.equal(found.nodeCount, 2);

  // Clean up
  db.prepare("DELETE FROM conversation_flow_templates WHERE id = ?").run(created.id);
});

