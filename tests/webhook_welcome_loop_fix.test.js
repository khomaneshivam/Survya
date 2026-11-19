const test = require("node:test");
const assert = require("node:assert/strict");
const flowEngine = require("../src/services/conversationFlowEngine");
const webhookService = require("../src/services/webhookService");
const { db } = require("../src/config/database");

test("Conversation Flow - Initial intent 'Ask Concierge 💬' transfers directly to handoff without looping welcome menu", async () => {
  const phone = "919811002201";
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
  const res = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: "Ask Concierge 💬",
    userPayload: { id: "opt_concierge", title: "Ask Concierge 💬" },
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP", isSimulation: true }
  });

  assert.equal(res.handled, true);
  assert.equal(res.sessionStatus, "PAUSED_AGENT_HANDOFF");
  assert.equal(res.currentNodeId, "node_concierge_handoff");
  assert.match(res.replyText, /Digital Concierge/i);
  assert.match(res.replyText, /Front Desk/i);
  assert.equal(res.replyInteractive, null);
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
});

test("Conversation Flow - Quoted text with 'Book a Stay 🛏️' advances immediately to room selection", async () => {
  const phone = "919811002202";
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
  const quotedText = "🌿 Welcome to KonkanTrip Beach Resort & Spa! 🏖️\n\nExperience luxury seaside tranquility in Alibaug, Maharashtra. I am your 24/7 Digital Concierge. How may I assist you today?\n\nPlease select an option to get started:\nBook a Stay 🛏️";

  const res = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: quotedText,
    userPayload: null,
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP", isSimulation: true }
  });

  assert.equal(res.handled, true);
  assert.equal(res.sessionStatus, "ACTIVE");
  assert.equal(res.currentNodeId, "node_select_room");
  assert.match(res.replyText, /Which villa or suite would you like to check availability for\?/i);
  assert.ok(Array.isArray(res.replyInteractive?.options));
  assert.equal(res.replyInteractive.options.length, 3);
  assert.equal(res.replyInteractive.options[0].id, "room_garden");
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
});

test("Conversation Flow - Multi-turn booking enquiry state persistence", async () => {
  const phone = "919811002203";
  // Clean up any existing session for this test phone
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);

  // Turn 1: Initial greeting
  const t1 = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: "Hi",
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP" }
  });
  assert.equal(t1.currentNodeId, "node_enquiry_type");
  assert.match(t1.replyText, /Please select an option to get started/i);

  // Turn 2: User clicks 'Book a Stay 🛏️'
  const t2 = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: "Book a Stay 🛏️",
    userPayload: { id: "opt_booking", title: "Book a Stay 🛏️" },
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP" }
  });
  assert.equal(t2.currentNodeId, "node_select_room");
  assert.equal(t2.collectedData.enquiry_type, "BOOKING");
  assert.match(t2.replyText, /Which villa or suite/i);

  // Turn 3: User selects 'Beachfront Suite 🌊'
  const t3 = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: "Beachfront Suite 🌊",
    userPayload: { id: "room_beach", title: "Beachfront Suite 🌊" },
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP" }
  });
  assert.equal(t3.currentNodeId, "node_ask_checkin");
  assert.equal(t3.collectedData.selected_room_name, "Luxury Beachfront Suite");
  assert.match(t3.replyText, /Check-in Date/i);

  // Turn 4: User enters check-in date
  const t4 = await flowEngine.processTurn({
    senderPhone: phone,
    userInput: "2026-12-01",
    context: { tenantId: 1, propertyId: 1, channel: "WHATSAPP" }
  });
  assert.equal(t4.currentNodeId, "node_ask_checkout");
  assert.equal(t4.collectedData.check_in_date, "2026-12-01");
  assert.match(t4.replyText, /Check-out Date/i);

  // Clean up test session
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
});

test("WebhookService - getAutoReplySettings does not crash with unbound this", () => {
  const settings = webhookService.getAutoReplySettings();
  assert.ok(settings);
  assert.equal(typeof settings.engineMode, "string");
  assert.equal(typeof settings.sessionTimeoutMinutes, "number");
  assert.ok(settings.sessionTimeoutMinutes >= 30);
});

test("Conversation Flow - Second message loop resolution: text 'garden', '1', and '20th Nov' advance cleanly", async () => {
  const phone = "919000000077";
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
  db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);

  // Turn 1: User says Hi
  const r1 = await webhookService.processConversationalFlow(
    { id: 999801, from_phone: phone, message_body: "Hi", customer_name: "Shivam", received_at: new Date().toISOString() },
    { id: "wamid_t1", from: phone, type: "text", text: { body: "Hi" } }
  );
  assert.equal(r1?.currentNodeId, "node_enquiry_type");
  assert.match(r1?.replyText, /Please select an option to get started/i);

  // Turn 2: User clicks 'Book a Stay 🛏️' -> Dispatches second message
  const r2 = await webhookService.processConversationalFlow(
    { id: 999802, from_phone: phone, message_body: "Book a Stay 🛏️", customer_name: "Shivam", received_at: new Date().toISOString() },
    { id: "wamid_t2", from: phone, type: "interactive", interactive: { button_reply: { id: "opt_booking", title: "Book a Stay 🛏️" } } }
  );
  assert.equal(r2?.currentNodeId, "node_select_room");
  assert.match(r2?.replyText, /Which villa or suite would you like to check availability for/i);

  // Turn 3: User replies with '1' (numeric choice) -> Must advance to Check-in date (NO second message loop!)
  const r3 = await webhookService.processConversationalFlow(
    { id: 999803, from_phone: phone, message_body: "1", customer_name: "Shivam", received_at: new Date().toISOString() },
    { id: "wamid_t3", from: phone, type: "text", text: { body: "1" } }
  );
  assert.equal(r3?.currentNodeId, "node_ask_checkin");
  assert.match(r3?.replyText, /Check-in Date/i);

  // Turn 4: User enters '20th Nov' -> Must parse correctly and advance to Check-out date
  const r4 = await webhookService.processConversationalFlow(
    { id: 999804, from_phone: phone, message_body: "20th Nov", customer_name: "Shivam", received_at: new Date().toISOString() },
    { id: "wamid_t4", from: phone, type: "text", text: { body: "20th Nov" } }
  );
  assert.equal(r4?.currentNodeId, "node_ask_checkout");
  assert.match(r4?.replyText, /Check-out Date/i);

  // Clean up
  db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(phone);
  db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);
});
