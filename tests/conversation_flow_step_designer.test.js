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
