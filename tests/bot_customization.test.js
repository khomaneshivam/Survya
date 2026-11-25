const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting, getSetting } = require("../src/config/database");
const config = require("../src/config/env");
const webhookService = require("../src/services/webhookService");
const chatLinkService = require("../src/services/chatLinkService");

describe("Conversational Concierge & Auto-Reply Bot Customization Test Suite", { concurrency: 1 }, () => {
  let server;
  let baseUrl;
  let adminToken;
  let testUserId = `admin_custombot_${Date.now()}`;
  const testPhone = "919307382031";
  const guestPhone = "919988776656";
  let testLinkId = null;
  const testSlug = `custom-bot-test-${Date.now().toString(36)}`;
  const prevSettings = {};
  const settingKeys = [
    "AUTO_REPLY_ENGINE_MODE", "AUTO_REPLY_ENABLED", "AUTO_REPLY_MODE",
    "BOT_BUSINESS_NAME", "AUTO_REPLY_MESSAGE", "BOT_WELCOME_MESSAGE",
    "BOT_BUTTON_1", "BOT_BUTTON_2", "BOT_BUTTON_3",
    "BOT_QUOTE_CONFIRM", "BOT_QUOTE_MODIFY", "BOT_QUOTE_ROOMS",
    "BOT_CONFIRMED_BUTTON_1", "BOT_CONFIRMED_BUTTON_2", "BOT_CONFIRMED_BUTTON_3",
    "BOT_HANDOFF_PHONE", "BOT_HANDOFF_MESSAGE", "BOT_TAKEOVER_PAUSE_MINUTES"
  ];

  before(async () => {
    for (const k of settingKeys) {
      prevSettings[k] = getSetting(k);
    }
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("TestPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Custom Bot Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(testUserId, `custom_bot_admin_${Date.now()}@konkantrip.local`, testPhone, hash);

    adminToken = jwt.sign(
      { id: testUserId, email: `custom_bot_admin_${Date.now()}@konkantrip.local`, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const createdLink = chatLinkService.createLink({
      tenantId: 1,
      userId: testUserId,
      title: "Custom Bot Test Resort",
      slug: testSlug,
      phoneNumber: testPhone,
      defaultMessage: "Hi KonkanTrip Beach Resort, I want to book a stay",
      welcomeTitle: "Welcome to Custom Bot Test Resort",
      autoReplyEnabled: 1,
      category: "HOSPITALITY"
    });
    testLinkId = createdLink.id;
    try {
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(guestPhone);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(guestPhone);
    } catch (e) {}
  });

  test("1. GET /api/replies/auto-reply-settings returns comprehensive bot configuration", async () => {
    const res = await fetch(`${baseUrl}/api/replies/auto-reply-settings`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data);
    assert.equal(typeof body.data.enabled, "boolean");
    assert.ok(body.data.mode);
    assert.ok(body.data.engineMode);
    assert.ok(body.data.businessName);
    assert.ok(body.data.welcomeMessage);
    assert.ok(body.data.button1);
    assert.ok(body.data.button2);
    assert.ok(body.data.button3);
    assert.ok(body.data.quoteConfirm);
    assert.ok(body.data.quoteModify);
    assert.ok(body.data.quoteRooms);
    assert.ok(body.data.confirmedButton1);
    assert.ok(body.data.confirmedButton2);
    assert.ok(body.data.confirmedButton3);
    assert.ok(body.data.handoffPhone);
    assert.ok(body.data.handoffMessage);
    assert.equal(typeof body.data.takeoverPauseMinutes, "number");
  });

  test("2. POST /api/replies/auto-reply-settings saves client customizations & enforces 20-char button limit", async () => {
    const customPayload = {
      enabled: true,
      mode: "ONCE_PER_CONTACT",
      engineMode: "HOSPITALITY_FLOW",
      businessName: "Seaside Haven Resort",
      welcomeMessage: "Hello {{name}}! Welcome to {{business_name}}. Tap below to check rooms:",
      button1: "Weekend Getaway Deal", // exactly 20 chars
      button2: "This button title is deliberately way too long for Meta Cloud API", // > 20 chars, must be shortened
      button3: "Call Front Desk",
      quoteConfirm: "Confirm My Villa",
      quoteModify: "Different Dates",
      quoteRooms: "Browse Categories",
      confirmedButton1: "Pool & Spa",
      confirmedButton2: "Seafood Cafe",
      confirmedButton3: "Driving Route",
      handoffPhone: "+91 98765 43210",
      handoffMessage: "Connecting you with {{business_name}} staff at {{phone}}.",
      takeoverPauseMinutes: 120
    };

    const res = await fetch(`${baseUrl}/api/replies/auto-reply-settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(customPayload)
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.businessName, "Seaside Haven Resort");
    assert.equal(body.data.button1, "Weekend Getaway Deal");
    // Verify <= 20 chars limit enforcement
    assert.ok(body.data.button2.length <= 20);
    assert.equal(body.data.button3, "Call Front Desk");
    assert.equal(body.data.quoteConfirm, "Confirm My Villa");
    assert.equal(body.data.quoteModify, "Different Dates");
    assert.equal(body.data.quoteRooms, "Browse Categories");
    assert.equal(body.data.confirmedButton1, "Pool & Spa");
    assert.equal(body.data.confirmedButton2, "Seafood Cafe");
    assert.equal(body.data.confirmedButton3, "Driving Route");
    assert.equal(body.data.handoffPhone, "+91 98765 43210");
    assert.equal(body.data.takeoverPauseMinutes, 120);
  });

  test("3. Inbound WhatsApp message uses customized buttons and business name in conversational flow", async () => {
    webhookService.resumeBotForPhone(guestPhone);

    const fakeWaId = `wamid_custom_flow_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hi Seaside Haven Resort, check availability for tomorrow for 2 nights for 2 guests" }
    };

    const saveResult = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Aditi" } }]);
    assert.ok(saveResult.saved);

    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {});
    assert.ok(flowResult, "Flow result should be produced");
    assert.ok(flowResult.replyText, "Flow text should be present");

    const botReply = db.prepare(`
      SELECT * FROM customer_replies
      WHERE from_phone = ? AND message_type = 'outbound'
      ORDER BY id DESC LIMIT 1
    `).get(guestPhone);

    assert.ok(botReply);
    assert.ok(["AUTO_REPLIED", "SENT"].includes(botReply.reply_status));
  });

  test("4. Clicking customized staff button triggers custom handoff message and number", async () => {
    webhookService.resumeBotForPhone(guestPhone);

    const fakeWaId = `wamid_custom_staff_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "btn_staff", title: "Call Front Desk" }
      }
    };

    const saveResult = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Aditi" } }]);
    assert.ok(saveResult.saved);

    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {});
    assert.ok(flowResult);
    assert.equal(flowResult.handoff, true);
    assert.ok(
      flowResult.replyText.includes("+91 98765 43210") || flowResult.replyText.includes("Seaside Haven"),
      `Expected custom phone or business name: ${flowResult.replyText}`
    );

    // Verify bot is paused for 120 minutes (takeoverPauseMinutes)
    const botStatus = webhookService.getBotStatus(guestPhone);
    assert.equal(botStatus.paused, true);
    assert.ok(botStatus.remainingMinutes > 100, `Remaining minutes should be close to 120: ${botStatus.remainingMinutes}`);
  });

  test("5. SIMPLE_GREETING engine mode delivers simple greeting template and respects deduplication", async () => {
    const simplePhone = `919977${Date.now().toString().slice(-6)}`;
    webhookService.resumeBotForPhone(simplePhone);

    // Set engineMode to SIMPLE_GREETING
    webhookService.saveAutoReplySettings({
      engineMode: "SIMPLE_GREETING",
      mode: "ONCE_PER_CONTACT",
      businessName: "Sunset Beach Villas",
      fallbackMessage: "Hello {{name}}, welcome to {{business_name}}! We received your message."
    });

    const fakeWaId1 = `wamid_simple_1_${Date.now()}`;
    const rawMsg1 = {
      from: simplePhone,
      id: fakeWaId1,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hey there" }
    };

    const save1 = webhookService.saveCustomerReply(rawMsg1, [{ wa_id: simplePhone, profile: { name: "Rohan" } }]);
    assert.ok(save1.saved);

    const res1 = await webhookService.processConversationalFlow(save1.reply, rawMsg1, {});
    assert.ok(res1, "Simple greeting response should be generated");
    assert.equal(res1.replyText, "Hello Rohan, welcome to Sunset Beach Villas! We received your message.");

    // Verify record in customer_replies was marked as AUTO_REPLIED
    const updated1 = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(save1.reply.id);
    assert.equal(updated1.reply_status, "AUTO_REPLIED");

    // Second message from same contact should be skipped by deduplication
    const fakeWaId2 = `wamid_simple_2_${Date.now()}`;
    const rawMsg2 = {
      from: simplePhone,
      id: fakeWaId2,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Are you available?" }
    };

    const save2 = webhookService.saveCustomerReply(rawMsg2, [{ wa_id: simplePhone, profile: { name: "Rohan" } }]);
    assert.ok(save2.saved);

    const res2 = await webhookService.processConversationalFlow(save2.reply, rawMsg2, {});
    assert.equal(res2, null, "Deduplication should skip second message from same contact");

    // Reset settings back to default HOSPITALITY_FLOW for consistency
    webhookService.saveAutoReplySettings({
      engineMode: "HOSPITALITY_FLOW",
      mode: "ONCE_PER_CONTACT",
      businessName: "KonkanTrip Beach Resort & Spa",
      button1: "This Weekend",
      button2: "Tomorrow (2 N)",
      button3: "Talk to Staff",
      quoteConfirm: "Confirm Booking",
      quoteModify: "Change Dates",
      quoteRooms: "Other Rooms",
      confirmedButton1: "Facilities",
      confirmedButton2: "Dining Menu",
      confirmedButton3: "Location / Map",
      handoffPhone: "+91 87665 90634",
      takeoverPauseMinutes: 60
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
    for (const [k, v] of Object.entries(prevSettings)) {
      if (v !== null && v !== undefined) {
        setSetting(k, v);
      } else {
        try {
          db.prepare("DELETE FROM settings WHERE `key` = ?").run(k);
        } catch (_) {}
      }
    }

    try {
      if (testLinkId) {
        db.prepare("DELETE FROM chat_links WHERE id = ?").run(testLinkId);
      }
      db.prepare("DELETE FROM chat_links WHERE slug LIKE 'custom-bot-test-%'").run();
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ? OR from_phone = ?").run(guestPhone, `+${guestPhone}`);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(guestPhone);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(guestPhone);
    } catch (e) {}
  });
});
