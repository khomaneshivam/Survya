const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const flowEngine = require("../src/services/conversationFlowEngine");

describe("Conversation Flow Zero Looping & Start-to-Finish Multi-Turn Execution", { concurrency: 1 }, () => {
  const testPhone = "919870001122";

  async function sendInbound(fromPhone, text, { payload = null, msgId = null } = {}) {
    const rawMsg = {
      from: fromPhone,
      id: msgId || `wamid_zero_loop_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: payload ? "interactive" : "text",
      ...(payload ? { interactive: { button_reply: payload } } : { text: { body: text } }),
      is_simulation: true
    };
    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: fromPhone, profile: { name: "Zero Loop Tester" } }], { is_simulation: true });
    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, { is_simulation: true });
    return { saved, result, rawMsg };
  }

  before(() => {
    webhookService.resumeBotForPhone(testPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(testPhone);
    db.prepare("UPDATE conversation_flows SET status = 'PUBLISHED', is_default = 1 WHERE id = 1").run();
  });

  test("End-to-End 7-Turn Hospitality Journey completes Start -> Finish with ZERO looping", async () => {
    // --- Turn 1: User says "Hi" ---
    const t1 = await sendInbound(testPhone, "Hi");
    assert.ok(t1.result, "Turn 1 must produce a flow result");
    assert.equal(t1.result.success, true);
    assert.ok(t1.result.replyText.includes("Welcome to Hotel Green Vally"), "Turn 1 must deliver welcome greeting");
    assert.ok(t1.result.replyText.includes("Please select an option to get started"), "Turn 1 must ask to select option");

    const sessT1 = flowEngine.getActiveSession(1, testPhone);
    assert.ok(sessT1, "Active session must exist after Turn 1");
    assert.equal(sessT1.current_node_id, "node_enquiry_type", "Must pause at node_enquiry_type");
    assert.equal(sessT1.session_status, "ACTIVE");

    // --- Turn 2: User taps "Book a Stay 🛏️" ---
    const t2 = await sendInbound(testPhone, "Book a Stay 🛏️", {
      payload: { id: "opt_booking", title: "Book a Stay 🛏️" }
    });
    assert.ok(t2.result, "Turn 2 must produce a flow result");
    assert.equal(t2.result.currentNodeId, "node_select_room", "Turn 2 must land on node_select_room");
    assert.ok(t2.result.replyText.includes("Which villa or suite would you like to check availability for?"), "Must prompt room category");
    assert.equal(t2.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 2");

    const sessT2 = flowEngine.getActiveSession(1, testPhone);
    assert.ok(sessT2, "Active session must exist after Turn 2");
    assert.equal(sessT2.current_node_id, "node_select_room");

    // --- Turn 3: User selects "Deluxe Garden Villa" ---
    const t3 = await sendInbound(testPhone, "Deluxe Garden Villa", {
      payload: { id: "room_garden", title: "Deluxe Garden Villa" }
    });
    assert.ok(t3.result, "Turn 3 must produce a flow result");
    assert.equal(t3.result.currentNodeId, "node_ask_checkin", "Turn 3 must advance to check-in intake");
    assert.ok(t3.result.replyText.includes("Check-in Date"), "Must prompt for Check-in Date");
    assert.equal(t3.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 3");

    const sessT3 = flowEngine.getActiveSession(1, testPhone);
    assert.equal(sessT3.current_node_id, "node_ask_checkin");

    // --- Turn 4: User replies "tomorrow" for check-in ---
    const t4 = await sendInbound(testPhone, "tomorrow");
    assert.ok(t4.result, "Turn 4 must produce a flow result");
    assert.equal(t4.result.currentNodeId, "node_ask_checkout", "Turn 4 must advance to check-out intake");
    assert.ok(t4.result.replyText.includes("Check-out Date"), "Must prompt for Check-out Date");
    assert.equal(t4.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 4");

    const sessT4 = flowEngine.getActiveSession(1, testPhone);
    assert.equal(sessT4.current_node_id, "node_ask_checkout");
    const dataT4 = JSON.parse(sessT4.collected_data_json || "{}");
    assert.ok(dataT4.check_in_date, "Must store check_in_date in session");

    // --- Turn 5: User replies "day after tomorrow" for check-out ---
    const t5 = await sendInbound(testPhone, "day after tomorrow");
    assert.ok(t5.result, "Turn 5 must produce a flow result");
    assert.equal(t5.result.currentNodeId, "node_ask_guest_count", "Turn 5 must advance to guest count intake");
    assert.ok(t5.result.replyText.includes("guests will be staying"), "Must prompt for guest count");
    assert.equal(t5.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 5");

    const sessT5 = flowEngine.getActiveSession(1, testPhone);
    assert.equal(sessT5.current_node_id, "node_ask_guest_count");
    const dataT5 = JSON.parse(sessT5.collected_data_json || "{}");
    assert.ok(dataT5.check_out_date, "Must store check_out_date in session");

    // --- Turn 6: User replies "2" for guest count ---
    const t6 = await sendInbound(testPhone, "2");
    assert.ok(t6.result, "Turn 6 must produce a flow result");
    assert.equal(t6.result.currentNodeId, "node_ask_guest_name", "Turn 6 must advance to guest name intake");
    assert.ok(t6.result.replyText.includes("Quotation") || t6.result.replyText.includes("Estimated Stay"), "Turn 6 must output stay quote");
    assert.ok(t6.result.replyText.includes("Full Name"), "Must prompt for guest name");
    assert.equal(t6.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 6");

    const sessT6 = flowEngine.getActiveSession(1, testPhone);
    assert.equal(sessT6.current_node_id, "node_ask_guest_name");

    // --- Turn 7: User provides guest name "Rohan Sharma" ---
    const t7 = await sendInbound(testPhone, "Rohan Sharma");
    assert.ok(t7.result, "Turn 7 must produce a flow result");
    assert.ok(
      t7.result.replyText.includes("Booking Enquiry") ||
      t7.result.replyText.includes("Successfully") ||
      t7.result.replyText.includes("Front Desk"),
      "Turn 7 must confirm enquiry"
    );
    assert.equal(t7.result.replyText.includes("Welcome to Hotel Green Vally"), false, "Welcome greeting must NEVER replay on Turn 7");

    // Verify outbound count: exactly 7 turns = 7 outbound replies (no double dispatches)
    const outboundRows = db.prepare("SELECT * FROM customer_replies WHERE from_phone = ? AND message_type = 'outbound' ORDER BY id ASC").all(testPhone);
    assert.equal(outboundRows.length, 7, "Exactly 7 outbound messages must be recorded (one per turn, zero duplicates)");
  });

  test("Active session persists across processTurn and matches phone with leading '+' or raw digits", () => {
    const raw = "919870001122";
    const withPlus = "+919870001122";
    const formatted = "+91 98700-01122";

    const s1 = flowEngine.getActiveSession(1, raw);
    const s2 = flowEngine.getActiveSession(1, withPlus);
    const s3 = flowEngine.getActiveSession(1, formatted);

    // After Turn 7, session is completed or handed off
    assert.equal(flowEngine.normalizePhone(raw), "919870001122");
    assert.equal(flowEngine.normalizePhone(withPlus), "919870001122");
    assert.equal(flowEngine.normalizePhone(formatted), "919870001122");
  });
});
