/**
 * Comprehensive Test Suite for Survya Visual Workflow Engine
 * Verifies:
 * 1. Both starter blueprints (Hospitality Booking & B2B Sales Quotation)
 * 2. All 12 Enterprise Node Types (START, MESSAGE, QUESTION, SELECTION, CONDITION, API_INTEGRATION, PAYMENT, TRANSACTION/BOOKING, QUOTATION, CONFIRMATION, HANDOVER, END)
 * 3. Flow duplication API
 * 4. In-memory simulation and execution events
 * 5. Execution history and session trace retrieval
 *
 * CRITICAL SAFETY DIRECTIVE:
 * Strict simulation mode (isSimulation: true) and offline assertions only.
 * NEVER dispatch live WhatsApp messages to ANY phone number.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");
const { seedFlowsAndTemplates } = require("../src/services/conversationFlowSeeds");

test("Survya Workflow Engine - Blueprint Seeding & Validation", async (t) => {
  // 1. Seed default templates
  seedFlowsAndTemplates(db);

  const templates = flowService.listTemplates();
  assert.ok(templates.length >= 4, "Should have at least 4 journey templates");

  const b2bTpl = templates.find(t => t.slug === "sales-quotation-b2b-journey");
  assert.ok(b2bTpl, "B2B Sales Quotation template must be present");
  assert.equal(b2bTpl.industry, "B2B_SAAS");
  assert.equal(b2bTpl.category, "SALES");
  assert.ok(b2bTpl.nodeCount >= 10, "B2B template should have at least 10 nodes");

  const hotelTpl = templates.find(t => t.slug === "hospitality-booking-quote-journey");
  assert.ok(hotelTpl, "Hospitality Booking template must be present");
  assert.ok(hotelTpl.nodeCount >= 15, "Hospitality journey should have at least 15 nodes");
});

test("Survya Workflow Engine - Clone B2B Template & Graph Validation", async (t) => {
  const cloned = flowService.createFlowFromTemplate("sales-quotation-b2b-journey", {
    name: "Enterprise Cloud Sales Flow (Test)",
    description: "Automated B2B sales qualification test"
  });

  assert.ok(cloned.flow.id, "Cloned flow should have an ID");
  assert.equal(cloned.flow.category, "SALES");

  const report = flowService.validateFlow(cloned.flow.id);
  assert.equal(report.isValid, true, `Validation failed: ${report.errors.join("; ")}`);
});

test("Survya Workflow Engine - Flow Duplication API", async (t) => {
  const cloned = flowService.createFlowFromTemplate("hospitality-booking-quote-journey", {
    name: "Resort Stay Journey for Clone",
    description: "Testing flow duplication"
  });

  const duplicated = flowService.duplicateFlow(cloned.flow.id, {
    name: "Resort Stay Journey (Copy Test)"
  });

  assert.ok(duplicated.flow.id, "Duplicated flow should have an ID");
  assert.notEqual(duplicated.flow.id, cloned.flow.id, "Duplicated flow must have a distinct ID");
  assert.equal(duplicated.flow.name, "Resort Stay Journey (Copy Test)");

  const draftNodes = duplicated.draftVersion.nodes;
  assert.ok(draftNodes.length > 5, "Duplicated flow should contain copied nodes");
});

test("Survya Workflow Engine - B2B Sales Journey Turn Execution Simulation", async (t) => {
  // Test B2B Sales Journey turn by turn in memory (Zero API, zero cost)
  const tplRow = db.prepare("SELECT * FROM conversation_flow_templates WHERE slug = 'sales-quotation-b2b-journey'").get();
  const nodes = JSON.parse(tplRow.nodes_json);
  const transitions = JSON.parse(tplRow.transitions_json);

  // Turn 1: Inbound Greeting
  const turn1 = await flowEngine.processTurn({
    senderPhone: "919876543210",
    userInput: "Hi, I want enterprise pricing",
    context: {
      isSimulation: true,
      flowOverride: { nodes, transitions }
    }
  });

  assert.equal(turn1.handled, true);
  assert.ok(turn1.replyText.includes("Welcome to Survya Enterprise Automation"));
  assert.equal(turn1.replyInteractive?.type, "button");
  assert.ok(turn1.replyInteractive.options.some(o => o.value === "GROWTH"));
  assert.equal(turn1.currentNodeId, "b2b_select_plan");

  // Turn 2: User Selects "Growth Hub"
  const turn2 = await flowEngine.processTurn({
    senderPhone: "919876543210",
    userInput: "Growth Hub ⚡",
    userPayload: { value: "GROWTH" },
    context: {
      isSimulation: true,
      flowOverride: { nodes, transitions },
      simulationState: {
        currentNodeId: "b2b_select_plan",
        collectedData: turn1.collectedData
      }
    }
  });

  assert.equal(turn2.handled, true);
  assert.equal(turn2.collectedData.selected_plan, "GROWTH");
  assert.ok(turn2.replyText.includes("How many team members"));
  assert.equal(turn2.currentNodeId, "b2b_ask_team_size");

  // Turn 3: User inputs team size: 15
  const turn3 = await flowEngine.processTurn({
    senderPhone: "919876543210",
    userInput: "15",
    context: {
      isSimulation: true,
      flowOverride: { nodes, transitions },
      simulationState: {
        currentNodeId: "b2b_ask_team_size",
        collectedData: turn2.collectedData
      }
    }
  });

  assert.equal(turn3.handled, true);
  assert.equal(turn3.collectedData.team_size, 15);
  assert.ok(turn3.replyText.includes("monthly outgoing WhatsApp message volume"));
  assert.equal(turn3.currentNodeId, "b2b_ask_volume");

  // Turn 4: User inputs volume: 50000
  const turn4 = await flowEngine.processTurn({
    senderPhone: "919876543210",
    userInput: "50000",
    context: {
      isSimulation: true,
      flowOverride: { nodes, transitions },
      simulationState: {
        currentNodeId: "b2b_ask_volume",
        collectedData: turn3.collectedData
      }
    }
  });

  assert.equal(turn4.handled, true);
  assert.equal(turn4.collectedData.monthly_volume, 50000);
  assert.ok(turn4.collectedData.quote_total > 0, "Quotation total should be computed dynamically");
  assert.ok(turn4.replyText.includes("Survya Custom Quotation & Proposal"));
  assert.ok(turn4.replyText.includes("₹"));
  assert.equal(turn4.replyInteractive?.type, "button");
  assert.ok(turn4.replyInteractive.options.some(o => o.value === "CONFIRM"));
  assert.equal(turn4.currentNodeId, "b2b_confirm_quote");

  // Turn 5: User Confirms Proposal
  const turn5 = await flowEngine.processTurn({
    senderPhone: "919876543210",
    userInput: "Lock In Proposal ✅",
    userPayload: { value: "CONFIRM" },
    context: {
      isSimulation: true,
      flowOverride: { nodes, transitions },
      simulationState: {
        currentNodeId: "b2b_confirm_quote",
        collectedData: turn4.collectedData
      }
    }
  });

  assert.equal(turn5.handled, true);
  assert.ok(turn5.collectedData.deal_id, "CRM Deal ID should be created");
  assert.ok(turn5.collectedData.payment_link, "Payment retainer link should be generated");
  assert.ok(turn5.replyText.includes("Deal #DEAL-"));
  assert.ok(turn5.replyText.includes("Transferring you to your dedicated Enterprise Solutions Architect"));
  assert.equal(turn5.sessionStatus, "PAUSED_AGENT_HANDOFF");
});

test("Survya Workflow Engine - Execution History & Trace Logs", async (t) => {
  // Test session listing and event trace
  const executions = flowService.listFlowExecutions("all", { page: 1, limit: 10 });
  assert.ok(Array.isArray(executions.executions), "Executions list should be an array");
  assert.ok(executions.total >= 0, "Total count should be a number");

  if (executions.executions.length > 0) {
    const firstSession = executions.executions[0];
    const details = flowService.getExecutionDetails(firstSession.id);
    assert.ok(details.session, "Session details should exist");
    assert.ok(Array.isArray(details.events), "Session events trace should be an array");
  }
});
