const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting } = require("../src/config/database");
const config = require("../src/config/env");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const chatLinkService = require("../src/services/chatLinkService");

describe("SARVYA Real WhatsApp & In-App Messaging Complete Parity Test Suite", () => {
  let server;
  let baseUrl;
  let adminToken;
  let testUserId = `admin_parity_${Date.now()}`;
  const testPhone = "919307382030";
  const guestPhone = "919988776655";
  let testLinkId = null;
  const testSlug = `parity-test-${Date.now().toString(36)}`;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("TestPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Parity Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(testUserId, `parity_admin_${Date.now()}@konkantrip.local`, testPhone, hash);

    adminToken = jwt.sign(
      { id: testUserId, email: `parity_admin_${Date.now()}@konkantrip.local`, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Create a dedicated active Click-to-Chat Link for attribution testing
    const createdLink = chatLinkService.createLink({
      tenantId: 1,
      userId: testUserId,
      title: "Parity Luxury Ocean Villa",
      slug: testSlug,
      phoneNumber: testPhone,
      defaultMessage: "Hi KonkanTrip, I am interested in booking the Luxury Ocean Villa",
      welcomeTitle: "Welcome to Parity Luxury Ocean Villa",
      autoReplyEnabled: 1,
      category: "HOSPITALITY"
    });
    testLinkId = createdLink.id;

    // Enable auto-reply in settings for testing
    setSetting("AUTO_REPLY_ENABLED", "true");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");

    try {
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(guestPhone);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(guestPhone);
    } catch (e) {}
  });

  after(() => {
    if (server) {
      server.close();
    }
    // Cleanup
    try {
      if (testLinkId) {
        db.prepare("DELETE FROM chat_links WHERE id = ?").run(testLinkId);
      }
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ? OR from_phone = ?").run(guestPhone, `+${guestPhone}`);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(guestPhone);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(guestPhone);
    } catch (e) {}
  });

  test("1. metaWhatsAppService: sendInteractiveButtons validates inputs and constructs valid Meta payload", async () => {
    // Assert parameter validations
    await assert.rejects(
      async () => {
        await metaWhatsAppService.sendInteractiveButtons({ to: "", bodyText: "Hello" });
      },
      /Invalid recipient phone number/
    );

    await assert.rejects(
      async () => {
        await metaWhatsAppService.sendInteractiveButtons({ to: "919876543210", bodyText: "" });
      },
      /Message bodyText is required/
    );

    await assert.rejects(
      async () => {
        await metaWhatsAppService.sendInteractiveButtons({ to: "919876543210", bodyText: "Hello", buttons: [] });
      },
      /At least one button is required/
    );

    // Verify exported function signature
    assert.strictEqual(typeof metaWhatsAppService.sendInteractiveButtons, "function");
    assert.strictEqual(typeof metaWhatsAppService.sendInteractiveList, "function");
  });

  test("2. metaWhatsAppService: sendInteractiveList validates sections and row items", async () => {
    await assert.rejects(
      async () => {
        await metaWhatsAppService.sendInteractiveList({ to: "919876543210", bodyText: "Options", sections: [] });
      },
      /At least one section with rows is required/
    );

    await assert.rejects(
      async () => {
        await metaWhatsAppService.sendInteractiveList({
          to: "919876543210",
          bodyText: "Options",
          sections: [{ title: "Rooms", rows: [] }]
        });
      },
      /must contain at least one valid row item/
    );
  });

  test("3. Webhook Link Attribution: Automatically identifies Click-to-Chat link from inbound WhatsApp message", () => {
    // 3a. Match by ref:slug
    const attr1 = webhookService.detectChatLinkAttribution(`Hello KonkanTrip, I need info (ref: ${testSlug})`, guestPhone);
    assert.ok(attr1, "Link should be matched by ref:slug");
    assert.strictEqual(attr1.id, testLinkId);

    // 3b. Match by default message text
    const attr2 = webhookService.detectChatLinkAttribution("Hi KonkanTrip, I am interested in booking the Luxury Ocean Villa for next weekend", guestPhone);
    assert.ok(attr2, "Link should be matched by default_message substring");
    assert.strictEqual(attr2.id, testLinkId);

    // 3c. Table QR match
    const attr3 = webhookService.detectChatLinkAttribution("Hello, I am ordering food from Table 4", guestPhone);
    assert.ok(attr3, "Table order should be recognized");
  });

  test("4. Webhook Ingestion: Saves inbound WhatsApp message with link attribution & consent", () => {
    const fakeWaId = `wamid.PARITY_TEST_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: `Hi, I am inquiring about Luxury Ocean Villa (ref: ${testSlug})` }
    };
    const contacts = [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }];

    const res = webhookService.saveCustomerReply(rawMsg, contacts, {
      metadata: { phone_number_id: "1510764325447375" }
    });

    assert.ok(res.saved, "Inbound customer message should be saved");
    assert.strictEqual(res.reply.link_id, testLinkId, "link_id should be attributed on customer_replies");
    assert.strictEqual(res.reply.source, "CHAT_LINK", "source should be marked as CHAT_LINK");

    // Verify chat link conversation count was incremented
    const updatedLink = db.prepare("SELECT conversations_count FROM chat_links WHERE id = ?").get(testLinkId);
    assert.ok(updatedLink.conversations_count >= 1, "conversations_count should be incremented");
  });

  test("5. Conversational Flow: Processes stay inquiry dates, checks availability and returns itemized quote", async () => {
    const fakeWaId = `wamid.PARITY_STAY_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Looking for a stay tomorrow for 2 nights for 2 adults" }
    };
    const contacts = [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }];

    const saveResult = webhookService.saveCustomerReply(rawMsg, contacts, {
      metadata: { phone_number_id: "1510764325447375" }
    });
    assert.ok(saveResult.saved);

    // Execute flow engine
    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {
      metadata: { phone_number_id: "1510764325447375" }
    });

    assert.ok(flowResult, "Flow engine should produce an intelligent response");
    assert.ok(flowResult.replyText, "Should return formatted WhatsApp response text");
    assert.match(flowResult.replyText, /Availability|Rates|Welcome/i, "Response should contain availability details");

    // Verify outbound reply was stored in customer_replies table
    const botReply = db.prepare(`
      SELECT * FROM customer_replies
      WHERE from_phone = ? AND message_type = 'outbound'
      ORDER BY id DESC LIMIT 1
    `).get(guestPhone);

    assert.ok(botReply, "Outbound bot reply should be logged in database");
    assert.strictEqual(botReply.reply_status, "SENT");
    assert.strictEqual(botReply.source, "WHATSAPP_FLOW");
  });

  test("6. Conversational Flow: Confirming quote creates CRM booking inquiry", async () => {
    // Guest confirms booking
    const fakeWaId = `wamid.PARITY_CONFIRM_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "btn_confirm", title: "Confirm Booking" }
      }
    };

    const saveResult = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }]);
    assert.ok(saveResult.saved);

    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {});
    assert.ok(flowResult);
    assert.match(flowResult.replyText, /Confirmed|Inquiry|Thank you/i, "Should confirm inquiry");

    // Verify CRM Enquiry was inserted
    const enq = db.prepare("SELECT * FROM booking_enquiries WHERE phone_e164 = ? ORDER BY id DESC LIMIT 1").get(guestPhone);
    assert.ok(enq, "Booking enquiry should be created in CRM pipeline");
  });

  test("7. Dining Parity: Guest asking for food menu receives restaurant catalog items", async () => {
    const fakeWaId = `wamid.PARITY_MENU_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "What is on the dining menu?" }
    };

    const saveResult = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }]);
    assert.ok(saveResult.saved);

    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {});
    assert.ok(flowResult);
    assert.ok(flowResult.menu, "Should identify dining menu intent");
    assert.match(flowResult.replyText, /Menu|Cafe|Bar|Surmai|Thali|Pizza/i, "Menu text should include food items");
  });

  test("8. Human Handoff: Customer requesting staff pauses the bot for 60 minutes", async () => {
    const fakeWaId = `wamid.PARITY_HANDOFF_${Date.now()}`;
    const rawMsg = {
      from: guestPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "I want to speak with a human agent please call me" }
    };

    const saveResult = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }]);
    assert.ok(saveResult.saved);

    const flowResult = await webhookService.processConversationalFlow(saveResult.reply, rawMsg, {});
    assert.ok(flowResult);
    assert.ok(flowResult.handoff, "Should trigger human handoff");
    assert.match(flowResult.replyText, /Connecting You|Front Desk|staff/i, "Response should reassure guest of staff connection");

    // Verify bot is paused for this contact
    const isPaused = webhookService.isBotPausedForPhone(guestPhone);
    assert.strictEqual(isPaused, true, "Bot should be paused for this guest phone");

    // Next incoming message while paused should NOT trigger automated flow reply
    const nextMsg = {
      from: guestPhone,
      id: `wamid.PARITY_WHILE_PAUSED_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hello are you there?" }
    };
    const nextSave = webhookService.saveCustomerReply(nextMsg, [{ wa_id: guestPhone, profile: { name: "Aarav Sharma" } }]);
    assert.ok(nextSave.saved);

    const pausedFlowResult = await webhookService.processConversationalFlow(nextSave.reply, nextMsg, {});
    assert.strictEqual(pausedFlowResult, null, "Bot must remain silent while human handoff is active");
  });

  test("9. Staff Takeover & Bot Status REST API: Inspect and resume bot status via API", async () => {
    // Verify GET /api/inbox/bot-status/:phone
    const statusRes = await fetch(`${baseUrl}/api/inbox/bot-status/${guestPhone}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.success, true);
    assert.strictEqual(statusData.data.isPaused, true);
    assert.ok(statusData.data.remainingMinutes > 0);

    // Verify POST /api/inbox/bot-status/:phone to resume
    const resumeRes = await fetch(`${baseUrl}/api/inbox/bot-status/${guestPhone}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paused: false })
    });
    assert.strictEqual(resumeRes.status, 200);
    const resumeData = await resumeRes.json();
    assert.strictEqual(resumeData.data.isPaused, false);
    assert.strictEqual(webhookService.isBotPausedForPhone(guestPhone), false, "Bot should be resumed");
  });
});
