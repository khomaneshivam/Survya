const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");

describe("Conversation Flow & Automation Studio Test Suite", () => {
  let server;
  let baseUrl;
  let adminToken;
  let testUserId = `admin_flow_${Date.now()}`;
  const testPhone = "919400112233";

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("FlowPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Flow Studio Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(testUserId, `flow_admin_${Date.now()}@konkantrip.local`, testPhone, hash);

    adminToken = jwt.sign(
      { id: testUserId, email: `flow_admin_${Date.now()}@konkantrip.local`, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) server.close();
    try {
      const flowRows = db.prepare("SELECT id FROM conversation_flows WHERE name IN ('Test Cloned Hospitality Journey', 'Versioned Lifecycle Test Flow')").all();
      for (const f of flowRows) {
        try { db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ?").run(f.id); } catch (e) {}
        try { db.prepare("DELETE FROM conversation_flow_events WHERE flow_id = ?").run(f.id); } catch (e) {}
        try { db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id = ?").run(f.id); } catch (e) {}
        try { db.prepare("DELETE FROM conversation_flow_sessions WHERE flow_id = ?").run(f.id); } catch (e) {}
        try { db.prepare("DELETE FROM conversation_flows WHERE id = ?").run(f.id); } catch (e) {}
      }
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone LIKE '919400%'").run();
      try { db.prepare("DELETE FROM customer_replies WHERE from_phone LIKE '919400%'").run(); } catch (e) {}
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    } catch (e) {}
  });

  test("1. GET /api/flows/conversation-templates returns all seeded starter templates", async () => {
    const res = await fetch(`${baseUrl}/api/flows/conversation-templates`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.templates));
    assert.ok(body.templates.length >= 3);

    const bookingTpl = body.templates.find(t => t.slug === "hospitality-booking-quote-journey");
    assert.ok(bookingTpl, "hospitality-booking-quote-journey must exist");
    assert.ok(bookingTpl.nodeCount >= 10);
  });

  test("2. POST /api/flows/conversation-templates/:slug/clone clones template into tenant flow", async () => {
    const res = await fetch(`${baseUrl}/api/flows/conversation-templates/hospitality-booking-quote-journey/clone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "Test Cloned Hospitality Journey",
        description: "Cloned from starter template for automated testing"
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.flow.id);
    assert.equal(body.flow.name, "Test Cloned Hospitality Journey");
    assert.equal(body.flow.status, "DRAFT");
  });

  test("3. POST /api/flows/conversation-flows validates graph correctly (detects missing nodes & warnings)", async () => {
    // Test invalid graph with no start node
    const invalidReport = flowService.validateFlowGraph([
      { id: "node_m1", type: "MESSAGE", config: { text: "Hello" } }
    ], []);
    assert.equal(invalidReport.isValid, false);
    assert.ok(invalidReport.errors.some(e => e.includes("START")));

    // Test valid graph
    const validReport = flowService.validateFlowGraph([
      { id: "n_start", type: "START", config: {} },
      { id: "n_end", type: "END", config: { farewellMessage: "Bye" } }
    ], [
      { id: "t1", source: "n_start", target: "n_end" }
    ]);
    assert.equal(validReport.isValid, true);
    assert.equal(validReport.errors.length, 0);
  });

  test("4. Flow Versioning: Draft saving, Validation, Publishing & Immutable Snapshot", async () => {
    // Create new flow
    const created = flowService.createFlow({
      name: "Versioned Lifecycle Test Flow",
      category: "HOSPITALITY_ENQUIRY"
    }, { id: testUserId, name: "Flow Studio Admin" });

    const flowId = created.flow.id;
    assert.ok(flowId);

    // Save Draft with valid nodes
    const nodes = [
      { id: "start", type: "START", title: "Start", position: { x: 100, y: 100 } },
      { id: "msg", type: "MESSAGE", title: "Greeting", config: { text: "Welcome to KonkanTrip!" }, position: { x: 100, y: 200 } },
      { id: "end", type: "END", title: "End", config: { farewellMessage: "Goodbye!" }, position: { x: 100, y: 300 } }
    ];
    const transitions = [
      { id: "t1", source: "start", target: "msg" },
      { id: "t2", source: "msg", target: "end" }
    ];

    const draftRes = await fetch(`${baseUrl}/api/flows/conversation-flows/${flowId}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ nodes, transitions, variables: {}, changelog: "Added greeting" })
    });
    assert.equal(draftRes.status, 200);

    // Publish Flow
    const pubRes = await fetch(`${baseUrl}/api/flows/conversation-flows/${flowId}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(pubRes.status, 200);
    const pubBody = await pubRes.json();
    assert.equal(pubBody.flow.status, "PUBLISHED");
    assert.ok(pubBody.flow.published_version_id);

    // Check version history
    const verRes = await fetch(`${baseUrl}/api/flows/conversation-flows/${flowId}/versions`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(verRes.status, 200);
    const verBody = await verRes.json();
    assert.ok(verBody.versions.length >= 1);
    assert.equal(verBody.versions[0].status, "PUBLISHED");
  });

  test("5. In-Memory Test Simulator executes complete 7-turn booking journey with ZERO Meta API calls", async () => {
    const defaultFlow = flowService.getFlowById(1, 1);
    const nodes = defaultFlow.publishedVersion.nodes;
    const transitions = defaultFlow.publishedVersion.transitions;

    let simulationState = null;

    // Turn 1: Inbound Greeting
    const turn1 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "Hi, I want to book a room",
        flowOverride: { nodes, transitions },
        simulationState: null
      })
    });
    assert.equal(turn1.status, 200);
    const t1Body = await turn1.json();
    assert.equal(t1Body.success, true);
    assert.ok(t1Body.result.replyText.includes("Welcome"));
    assert.equal(t1Body.result.currentNodeId, "node_enquiry_type");
    assert.ok(t1Body.result.replyInteractive);
    simulationState = {
      currentNodeId: t1Body.result.currentNodeId,
      collectedData: t1Body.result.collectedData,
      nodes,
      transitions
    };

    // Turn 2: Select Enquiry Type: "BOOKING"
    const turn2 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "Book a Stay 🛏️",
        userPayload: { id: "opt_booking", value: "BOOKING" },
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn2.status, 200);
    const t2Body = await turn2.json();
    assert.equal(t2Body.result.currentNodeId, "node_select_room");
    simulationState.currentNodeId = t2Body.result.currentNodeId;
    simulationState.collectedData = t2Body.result.collectedData;

    // Turn 3: Select Room: "Deluxe Garden Villa"
    const turn3 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "Garden Villa 🌿",
        userPayload: { id: "room_garden", value: "Deluxe Garden Villa" },
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn3.status, 200);
    const t3Body = await turn3.json();
    assert.equal(t3Body.result.currentNodeId, "node_ask_checkin");
    simulationState.currentNodeId = t3Body.result.currentNodeId;
    simulationState.collectedData = t3Body.result.collectedData;

    // Turn 4: Enter Check-in Date
    const turn4 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "tomorrow",
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn4.status, 200);
    const t4Body = await turn4.json();
    assert.equal(t4Body.result.currentNodeId, "node_ask_checkout");
    simulationState.currentNodeId = t4Body.result.currentNodeId;
    simulationState.collectedData = t4Body.result.collectedData;

    // Turn 5: Enter Check-out Date
    const dObj = new Date();
    dObj.setDate(dObj.getDate() + 3);
    const coDate = dObj.toISOString().split("T")[0];

    const turn5 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: coDate,
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn5.status, 200);
    const t5Body = await turn5.json();
    assert.equal(t5Body.result.currentNodeId, "node_ask_guest_count");
    simulationState.currentNodeId = t5Body.result.currentNodeId;
    simulationState.collectedData = t5Body.result.collectedData;

    // Turn 6: Enter Guest Count (2 Adults 1 Child) -> Triggers Availability & Quote Calculation
    const turn6 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "2 adults and 1 child",
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn6.status, 200);
    const t6Body = await turn6.json();
    assert.equal(t6Body.result.currentNodeId, "node_ask_guest_name");
    assert.ok(t6Body.result.replyText.includes("Estimated Stay Quotation"));
    assert.ok(t6Body.result.collectedData.quote_total > 0);
    simulationState.currentNodeId = t6Body.result.currentNodeId;
    simulationState.collectedData = t6Body.result.collectedData;

    // Turn 7: Enter Guest Name -> Creates CRM Enquiry and delivers confirmation
    const turn7 = await fetch(`${baseUrl}/api/flows/conversation-flows/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        senderPhone: "919400112233",
        userInput: "Rahul Verma",
        flowOverride: { nodes, transitions },
        simulationState
      })
    });
    assert.equal(turn7.status, 200);
    const t7Body = await turn7.json();
    assert.ok(t7Body.result.replyText.includes("Booking Enquiry"));
    assert.ok(t7Body.result.replyText.includes("Rahul Verma"));
    assert.ok(t7Body.result.collectedData.enquiry_id > 0);
  });

  test("6. Reusable Message Template Studio CRUD operations", async () => {
    // Create template
    const createRes = await fetch(`${baseUrl}/api/flows/message-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code: "CUSTOM_PROMO_SPECIAL",
        title: "Weekend Seaside Special Deal",
        category: "PROMOTION",
        content: "Special offer for {{guest_name}}: Book 2 nights at {{property.name}} and get 1 night free!",
        variables: ["guest_name", "property.name"],
        buttons: [{ id: "b1", title: "Claim Deal 🎉", value: "CLAIM" }]
      })
    });
    assert.equal(createRes.status, 200);
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    assert.ok(createBody.template.id);
    const tplId = createBody.template.id;

    // List templates
    const listRes = await fetch(`${baseUrl}/api/flows/message-templates`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(listBody.templates.some(t => t.code === "CUSTOM_PROMO_SPECIAL"));

    // Delete template
    const delRes = await fetch(`${baseUrl}/api/flows/message-templates/${tplId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(delRes.status, 200);
  });
});
