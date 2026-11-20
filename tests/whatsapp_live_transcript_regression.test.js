const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { db, getSetting, setSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");

describe("WhatsApp Live Transcript Regression Suite: Zero Double Messages, Zero Welcome Replays, Zero Cross-Flow Hijacking", { concurrency: 1 }, () => {
  const hospitalityPhone = "919922157931";
  const b2bPhone = "919911884422";
  const dedupPhone = "919933557711";
  const escapePhone = "919944668822";

  async function sendInbound(fromPhone, text, { payload = null, msgId = null } = {}) {
    const rawMsg = {
      from: fromPhone,
      id: msgId || `wamid_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: payload ? "interactive" : "text",
      ...(payload ? { interactive: { button_reply: payload } } : { text: { body: text } }),
      is_simulation: true
    };
    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: fromPhone, profile: { name: "Live Guest" } }], { is_simulation: true });
    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, { is_simulation: true });
    return { saved, result, rawMsg };
  }

  before(() => {
    // Ensure clean state for test phone numbers
    [hospitalityPhone, b2bPhone, dedupPhone, escapePhone].forEach(phone => {
      webhookService.resumeBotForPhone(phone);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
    });

    // Ensure Flow 1 is PUBLISHED and marked is_default = 1
    db.prepare("UPDATE conversation_flows SET status = 'PUBLISHED', is_default = 1 WHERE id = 1").run();
  });

  test("1. Hospitality Full Multi-Turn Journey: Zero welcome replay, zero double messages, active session continued across turns", async () => {
    // Turn 1: User says "Hi"
    const t1 = await sendInbound(hospitalityPhone, "Hi");
    assert.ok(t1.result, "Turn 1 must produce a flow result");
    assert.equal(t1.result.success, true);
    assert.ok(t1.result.replyText.includes("Welcome to Hotel Green Vally"), "Turn 1 must deliver welcome greeting");
    assert.ok(t1.result.replyText.includes("Please select an option to get started"), "Turn 1 must ask to select option");

    // Verify exactly 1 outbound row exists in customer_replies for this turn
    const outT1 = db.prepare("SELECT * FROM customer_replies WHERE from_phone = ? AND message_type = 'outbound'").all(hospitalityPhone);
    assert.equal(outT1.length, 1, "Exactly one outbound reply row must be logged in database");
    assert.equal(outT1[0].reply_status, "AUTO_REPLIED");

    // Verify active session state in DB
    const sessT1 = db.prepare("SELECT * FROM conversation_flow_sessions WHERE sender_phone = ? AND session_status = 'ACTIVE'").get(hospitalityPhone);
    assert.ok(sessT1, "Active session must exist in DB");
    assert.equal(sessT1.current_node_id, "node_enquiry_type");

    // Turn 2: User taps "View Villas 🏡"
    const t2 = await sendInbound(hospitalityPhone, "View Villas 🏡", {
      payload: { id: "opt_villas", title: "View Villas 🏡" }
    });
    assert.ok(t2.result, "Turn 2 must produce a flow result");
    assert.equal(t2.result.currentNodeId, "node_select_room", "Turn 2 must land on node_select_room");
    assert.ok(t2.result.replyText.includes("Our Accommodations"), "Must display villa accommodations overview");
    assert.ok(t2.result.replyText.includes("Deluxe Garden Villa"), "Must list Deluxe Garden Villa");
    assert.ok(t2.result.replyText.includes("Which villa or suite would you like to check availability for?"), "Must prompt room category");
    
    // CRITICAL REGRESSION ASSERTION: Welcome message must NEVER be replayed!
    assert.equal(t2.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NOT replay when user clicks a button");

    // Turn 3: User taps "Garden Villa 🌿"
    const t3 = await sendInbound(hospitalityPhone, "Garden Villa 🌿", {
      payload: { id: "room_garden", title: "Garden Villa 🌿" }
    });
    assert.ok(t3.result, "Turn 3 must produce a flow result");
    assert.equal(t3.result.currentNodeId, "node_ask_checkin", "Turn 3 must advance to check-in collection");
    assert.ok(t3.result.replyText.includes("Check-in Date"), "Must prompt for Check-in Date");
    assert.equal(t3.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NOT replay");

    // Turn 4: User replies "tomorrow"
    const t4 = await sendInbound(hospitalityPhone, "tomorrow");
    assert.ok(t4.result, "Turn 4 must produce a flow result");
    assert.equal(t4.result.currentNodeId, "node_ask_checkout", "Turn 4 must advance to check-out collection");
    assert.ok(t4.result.replyText.includes("Check-out Date"), "Must prompt for Check-out Date");

    // Turn 5: User replies "2026-12-15"
    const t5 = await sendInbound(hospitalityPhone, "2026-12-15");
    assert.ok(t5.result, "Turn 5 must produce a flow result");
    assert.equal(t5.result.currentNodeId, "node_ask_guest_count", "Turn 5 must advance to guest count collection");
    assert.ok(t5.result.replyText.includes("guests will be staying"), "Must prompt for guest count");

    // Turn 6: User replies "2"
    const t6 = await sendInbound(hospitalityPhone, "2");
    assert.ok(t6.result, "Turn 6 must produce a flow result");
    assert.ok(t6.result.replyText.includes("Quotation") || t6.result.replyText.includes("Estimated Stay"), "Turn 6 must display stay quotation");
    assert.ok(t6.result.replyText.includes("₹"), "Quotation must display price in INR");
  });

  test("2. Hospitality 'Book a Stay 🛏️' does NOT hijack to legacy bot or B2B flow", async () => {
    const testHijackPhone = "919911993344";
    webhookService.resumeBotForPhone(testHijackPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testHijackPhone);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(testHijackPhone);

    // Initial greeting
    const t1 = await sendInbound(testHijackPhone, "Hi");
    assert.ok(t1.result.replyText.includes("Welcome to Hotel Green Vally"));

    // User taps "Book a Stay 🛏️"
    const t2 = await sendInbound(testHijackPhone, "Book a Stay 🛏️", {
      payload: { id: "opt_book", title: "Book a Stay 🛏️" }
    });

    // CRITICAL ASSERTIONS:
    // Must NOT hijack to legacy hospitality engine ("Namaste! Welcome to KonkanTrip Beach Resort & Spa. We are delighted to host your upcoming beach getaway")
    assert.equal(t2.result.replyText.includes("KonkanTrip Beach Resort & Spa"), false, "Must never hijack into legacy KonkanTrip engine");
    assert.equal(t2.result.replyText.includes("delighted to host your upcoming beach getaway"), false, "Must never output legacy getaway message");
    // Must NOT hijack into B2B sales ("Welcome to Survya Enterprise Automation!")
    assert.equal(t2.result.replyText.includes("Survya Enterprise Automation"), false, "Must never hijack into B2B Sales flow");

    // Must stay inside Flow 1, asking which room/villa to book
    assert.ok(t2.result.replyText.includes("Which villa or suite would you like to check availability for?"), "Must proceed to room selection");
    assert.equal(t2.result.currentNodeId, "node_select_room");
  });

  test("3. B2B Sales Full Journey: Answering team size '5' and volume '25000' does NOT reset to Resort Welcome", async () => {
    // Create and publish a dedicated B2B flow for this regression test
    const cloned = flowService.createFlowFromTemplate("sales-quotation-b2b-journey", {
      name: "Enterprise B2B Automated Quoting Regression",
      category: "B2B_SALES",
      trigger_keywords: ["pricing", "demo", "quote", "b2b"]
    });
    const b2bFlow = flowService.publishFlow(cloned.flow.id).flow;

    // Trigger B2B journey with keyword "pricing"
    const t1 = await sendInbound(b2bPhone, "pricing");
    assert.ok(t1.result, "Should match B2B flow trigger");
    assert.ok(t1.result.replyText.includes("Enterprise") || t1.result.replyText.includes("Plan") || t1.result.replyText.includes("Survya") || t1.result.replyText.includes("Edition"), "Must deliver B2B welcome");

    // Select "Starter Suite 🚀"
    const t2 = await sendInbound(b2bPhone, "Starter Suite 🚀", {
      payload: { id: "opt_starter", title: "Starter Suite 🚀" }
    });
    assert.ok(t2.result, "Should process plan selection");
    assert.ok(t2.result.replyText.includes("team members") || t2.result.replyText.includes("agents"), "Must ask for team size");
    assert.equal(t2.result.currentNodeId, "b2b_ask_team_size");

    // Reply team size "5"
    const t3 = await sendInbound(b2bPhone, "5");
    assert.ok(t3.result, "Should process team size");
    
    // CRITICAL ASSERTION: Must NOT reset back to Hotel Green Vally Resort Welcome!
    assert.equal(t3.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Replying numeric team size '5' must NOT reset to resort welcome");
    assert.ok(t3.result.replyText.includes("volume") || t3.result.replyText.includes("message"), "Must prompt for outgoing message volume");
    assert.equal(t3.result.currentNodeId, "b2b_ask_volume");

    // Reply monthly volume "25000"
    const t4 = await sendInbound(b2bPhone, "25000");
    assert.ok(t4.result, "Should process message volume");
    assert.equal(t4.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Must NOT reset to resort welcome");
    assert.ok(t4.result.replyText.includes("Quote") || t4.result.replyText.includes("Estimated Investment") || t4.result.replyText.includes("₹"), "Must display calculated B2B quote");
  });

  test("4. Duplicate Webhook Replay Guard: Same wa_message_id is safely ignored without duplicate send", async () => {
    const dupMessageId = `wamid_dup_guard_${Date.now()}`;
    const rawMsg = {
      from: dedupPhone,
      id: dupMessageId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hi resort" },
      is_simulation: true
    };

    // First arrival
    const saved1 = webhookService.saveCustomerReply(rawMsg, [{ wa_id: dedupPhone, profile: { name: "Dedup Test" } }], { is_simulation: true });
    const res1 = await webhookService.processConversationalFlow(saved1.reply, rawMsg, { is_simulation: true });
    assert.ok(res1, "First delivery must be handled");

    // Duplicate webhook delivery with identical wa_message_id
    const saved2 = webhookService.saveCustomerReply(rawMsg, [{ wa_id: dedupPhone, profile: { name: "Dedup Test" } }], { is_simulation: true });
    assert.equal(saved2.duplicate, true, "saveCustomerReply must flag duplicate: true");
    const res2 = await webhookService.processConversationalFlow(saved2.reply, rawMsg, { is_simulation: true });
    assert.equal(res2, null, "processConversationalFlow must safely suppress duplicate delivery with 0 duplicate outbound calls");
  });

  test("5. Global Escape Keyword: Typing 'restart' or 'menu' cleanly resets active flow session", async () => {
    // Start session
    await sendInbound(escapePhone, "Hi");
    await sendInbound(escapePhone, "View Villas 🏡", { payload: { id: "opt_villas", title: "View Villas 🏡" } });

    // Send reset keyword
    const tReset = await sendInbound(escapePhone, "restart");
    assert.ok(tReset.result, "Should handle reset keyword");
    assert.ok(tReset.result.replyText.includes("Welcome to Hotel Green Vally"), "Should reset back to start node and output welcome greeting");
    assert.ok(tReset.result.replyText.includes("Please select an option to get started"), "Should present start options");
  });

  test("6. Date Intake Friendly Guidance: Typing 'Hi' while waiting for check-in date provides clear guidance", async () => {
    const intakePhone = "919955883311";
    webhookService.resumeBotForPhone(intakePhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(intakePhone);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(intakePhone);

    await sendInbound(intakePhone, "Hi");
    await sendInbound(intakePhone, "Book a Stay 🛏️", { payload: { id: "opt_book", title: "Book a Stay 🛏️" } });
    await sendInbound(intakePhone, "Garden Villa 🌿", { payload: { id: "room_garden", title: "Garden Villa 🌿" } });

    // User types "Hi" instead of a date
    const tHi = await sendInbound(intakePhone, "Hi");
    assert.ok(tHi.result, "Should handle turn");
    assert.ok(tHi.result.replyText.includes("valid date") || tHi.result.replyText.includes("tomorrow"), "Must prompt for valid date");
    assert.ok(tHi.result.replyText.toLowerCase().includes("menu"), "Must provide guidance on how to reply 'menu' to return to main menu");
  });
});
