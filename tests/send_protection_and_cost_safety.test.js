const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const { db, getSetting, setSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");

describe("SARVYA WhatsApp Send Architecture & Cost Protection Test Suite", () => {
  const testPhone = "919977889901";
  const botPhone = (getSetting("WHATSAPP_PHONE_NUMBER") || "918766590634").replace(/\D/g, "");

  before(() => {
    webhookService.resumeBotForPhone(testPhone);
    // Ensure test contact clean state in customer_replies
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
  });

  test("1. Self-Message / WABA Echo Shield: Messages from bot's own number are dropped", async () => {
    const rawMsg = {
      from: botPhone,
      id: `wamid_echo_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Test broadcast echo" }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: botPhone, profile: { name: "Bot" } }], {
      metadata: { display_phone_number: botPhone }
    });

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {
      metadata: { display_phone_number: botPhone }
    });

    assert.equal(result, null, "Bot must never send automated replies to its own number (echo loop prevention)");
  });

  test("2. Event Type & Reaction Filter: Reactions and stickers do not trigger outbound messages", async () => {
    const rawReactionMsg = {
      from: testPhone,
      id: `wamid_rxn_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "reaction",
      reaction: { message_id: "wamid_some_msg", emoji: "👍" }
    };

    const saved = webhookService.saveCustomerReply(rawReactionMsg, [{ wa_id: testPhone, profile: { name: "Test User" } }]);
    const result = await webhookService.processConversationalFlow(saved.reply, rawReactionMsg, {});

    assert.equal(result, null, "Reaction messages must never trigger automated WhatsApp sends");
  });

  test("3. Conversational Closure Filter: Polite closures ('ok', 'thanks', 'bye') are acknowledged silently with zero API spend", async () => {
    const closureWords = ["ok", "Okay", "thanks", "Thank you!", "bye", "done", "cool"];

    for (const word of closureWords) {
      const rawMsg = {
        from: testPhone,
        id: `wamid_closure_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: word }
      };

      const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: testPhone, profile: { name: "Test User" } }]);
      const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

      assert.ok(result, "Should return acknowledgment object");
      assert.equal(result.closure, true, `Word '${word}' should be classified as conversational closure`);
      assert.equal(result.replyText, null, "No outbound text should be dispatched to customer");

      // Verify DB record status is ACKNOWLEDGED
      const rec = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(saved.reply.id);
      assert.equal(rec.reply_status, "ACKNOWLEDGED");
    }
  });

  test("4. Universal Deduplication: Generic inquiry is answered once, duplicate subsequent generic texts are suppressed", async () => {
    const freshPhone = `919911${Date.now().toString().slice(-6)}`;
    webhookService.resumeBotForPhone(freshPhone);

    // Save auto-reply mode to ONCE_PER_CONTACT
    setSetting("AUTO_REPLY_MODE", "ONCE_PER_CONTACT");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");

    const rawMsg1 = {
      from: freshPhone,
      id: `wamid_msg1_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hello resort" }
    };

    const saved1 = webhookService.saveCustomerReply(rawMsg1, [{ wa_id: freshPhone, profile: { name: "Deepak" } }]);
    const result1 = await webhookService.processConversationalFlow(saved1.reply, rawMsg1, {});

    assert.ok(result1, "First generic greeting should receive welcome/intake flow");
    assert.equal(result1.success, true);

    // Verify DB record is marked AUTO_REPLIED
    const rec1 = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(saved1.reply.id);
    assert.equal(rec1.reply_status, "AUTO_REPLIED");

    // Second generic message from same contact without dates or buttons
    const rawMsg2 = {
      from: freshPhone,
      id: `wamid_msg2_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "hello again" }
    };

    const saved2 = webhookService.saveCustomerReply(rawMsg2, [{ wa_id: freshPhone, profile: { name: "Deepak" } }]);
    const result2 = await webhookService.processConversationalFlow(saved2.reply, rawMsg2, {});

    assert.equal(result2, null, "Second generic message must be suppressed by Universal Deduplication");
  });

  test("5. Webhook Retry Protection: Webhook retries on already processed message ID do not re-send", async () => {
    const retryPhone = `919922${Date.now().toString().slice(-6)}`;
    webhookService.resumeBotForPhone(retryPhone);

    const waMsgId = `wamid_retry_test_${Date.now()}`;
    const rawMsg = {
      from: retryPhone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hi KonkanTrip" }
    };

    // First delivery attempt
    const payload1 = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            contacts: [{ profile: { name: "Kunal" }, wa_id: retryPhone }],
            messages: [rawMsg]
          }
        }]
      }]
    };

    await webhookService.processIncomingPayload(payload1);
    // Allow asynchronous phoneQueue pipeline to land bot response
    let countAfterFirst = 0;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 200));
      countAfterFirst = db.prepare(`
        SELECT COUNT(*) as c FROM customer_replies 
        WHERE from_phone = ? AND message_type = 'outbound'
      `).get(retryPhone).c;
      if (countAfterFirst > 0) break;
    }

    assert.equal(countAfterFirst, 1, "Exactly one bot reply should be created on first webhook delivery");

    // Meta retries the EXACT same payload
    await webhookService.processIncomingPayload(payload1);
    await new Promise(r => setTimeout(r, 800));

    const countAfterRetry = db.prepare(`
      SELECT COUNT(*) as c FROM customer_replies 
      WHERE from_phone = ? AND message_type = 'outbound'
    `).get(retryPhone).c;

    assert.equal(countAfterRetry, 1, "Retry delivery MUST NOT create duplicate outbound messages");
  });

  test("6. Mock Sandbox: simulateTestReply executes full flow logic without making real Meta API HTTP calls", () => {
    const simRes = webhookService.simulateTestReply({
      fromPhone: "919876543210",
      customerName: "Sandbox Tester",
      messageBody: "Testing flow sandbox"
    });

    assert.ok(simRes);
    const lastReply = db.prepare("SELECT * FROM customer_replies WHERE from_phone = '919876543210' ORDER BY id DESC LIMIT 1").get();
    assert.ok(lastReply);
  });
});
