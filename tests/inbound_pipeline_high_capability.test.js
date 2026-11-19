const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { db, setSetting, getSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");

test("High-Capability Inbound Message & Trigger Pipeline Test Suite", async (t) => {
  const testPhone = `919777${Date.now().toString().slice(-6)}`;
  const cleanPhone = testPhone.replace(/\D/g, "");

  let sentMessages = [];
  const origSendText = metaWhatsAppService.sendTextMessage;
  const origSendButtons = metaWhatsAppService.sendInteractiveButtons;
  const origSendList = metaWhatsAppService.sendInteractiveList;
  const origSendFlow = metaWhatsAppService.sendFlowMessage;

  t.before(() => {
    setSetting("AUTO_REPLY_ENABLED", "true");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");

    metaWhatsAppService.sendTextMessage = async (p) => {
      sentMessages.push({ type: "text", params: p });
      return { success: true, messageId: `wamid.TEST_${Date.now()}` };
    };
    metaWhatsAppService.sendInteractiveButtons = async (p) => {
      sentMessages.push({ type: "buttons", params: p });
      return { success: true, messageId: `wamid.TEST_BTN_${Date.now()}` };
    };
    metaWhatsAppService.sendInteractiveList = async (p) => {
      sentMessages.push({ type: "list", params: p });
      return { success: true, messageId: `wamid.TEST_LIST_${Date.now()}` };
    };
    metaWhatsAppService.sendFlowMessage = async (p) => {
      sentMessages.push({ type: "flow", params: p });
      return { success: true, messageId: `wamid.TEST_FLOW_${Date.now()}` };
    };
  });

  t.after(() => {
    metaWhatsAppService.sendTextMessage = origSendText;
    metaWhatsAppService.sendInteractiveButtons = origSendButtons;
    metaWhatsAppService.sendInteractiveList = origSendList;
    metaWhatsAppService.sendFlowMessage = origSendFlow;

    try {
      db.prepare("DELETE FROM customer_replies WHERE from_phone LIKE ?").run(`${cleanPhone}%`);
      db.prepare("DELETE FROM flow_responses WHERE from_phone LIKE ?").run(`${cleanPhone}%`);
    } catch (e) {}
  });

  await t.test("1. Sequential Burst Message Processing: Rapid consecutive messages from same phone are queued and not dropped", async () => {
    sentMessages = [];
    const phone = `${testPhone}1`;

    const msg1 = {
      from: phone,
      id: `wamid.BURST_1_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hello" }
    };

    const msg2 = {
      from: phone,
      id: `wamid.BURST_2_${Date.now() + 1}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Do you have rooms available this weekend?" }
    };

    const save1 = webhookService.saveCustomerReply(msg1, [{ wa_id: phone, profile: { name: "Aditi Roy" } }]);
    const save2 = webhookService.saveCustomerReply(msg2, [{ wa_id: phone, profile: { name: "Aditi Roy" } }]);

    assert.ok(save1.saved);
    assert.ok(save2.saved);

    // Trigger both concurrently to simulate rapid burst from mobile device
    const [res1, res2] = await Promise.all([
      webhookService.processConversationalFlow(save1.reply, msg1, {}),
      webhookService.processConversationalFlow(save2.reply, msg2, {})
    ]);

    assert.ok(res1, "Message 1 must be processed");
    assert.ok(res2, "Message 2 must NOT be dropped by concurrency lock; queued and processed");
    assert.ok(sentMessages.length >= 2, "Both messages must trigger their automated flow responses");
  });

  await t.test("2. Keyword Bot Unpause: When bot is paused for staff takeover, guest texting 'start' or 'menu' automatically resumes bot", async () => {
    sentMessages = [];
    const phone = `${testPhone}2`;
    const cleanP = phone.replace(/\D/g, "");

    // Pause bot as if staff takeover occurred
    webhookService.pauseBotForPhone(cleanP, 60 * 60 * 1000);
    assert.equal(webhookService.isBotPausedForPhone(cleanP), true);

    // Customer sends "menu"
    const resumeMsg = {
      from: phone,
      id: `wamid.RESUME_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "menu" }
    };

    const saved = webhookService.saveCustomerReply(resumeMsg, [{ wa_id: phone, profile: { name: "Deepak" } }]);
    assert.ok(saved.saved);

    const res = await webhookService.processConversationalFlow(saved.reply, resumeMsg, {});
    assert.ok(res, "Bot should wake up and process request on intent keyword");
    assert.equal(webhookService.isBotPausedForPhone(cleanP), false, "Bot must be unpaused automatically");
  });

  await t.test("3. Scoped Inbox Access: User can access own customer replies and campaigns", () => {
    const userId = "user_test_worker_123";
    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type, message_body, is_read, user_id, source, received_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 'WHATSAPP', CURRENT_TIMESTAMP)
    `).run(`wamid.SCOPED_${Date.now()}`, "919777999888", "Scoped Contact", "text", "Inquiry", userId);

    const res = webhookService.getReplies({ limit: 50, userId, repliesOnly: true });
    assert.ok(res);
    assert.ok(typeof res.totalCount === "number");
    assert.ok(res.totalCount > 0, "User must see assigned customer replies");
  });

  await t.test("4. Resilient Payload Ingestion: Direct unwrapped messages payload is ingested cleanly", async () => {
    const phone = `${testPhone}4`;
    const waId = `wamid.DIRECT_UNWRAPPED_${Date.now()}`;

    const directPayload = {
      messages: [
        {
          from: phone,
          id: waId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: "Direct payload ingestion test" }
        }
      ],
      contacts: [
        { profile: { name: "Direct Sender" }, wa_id: phone }
      ]
    };

    const res = await webhookService.processIncomingPayload(directPayload);
    assert.equal(res.processed, 1);
    assert.equal(res.messages, 1);

    const row = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(waId);
    assert.ok(row, "Unwrapped payload message must be recorded in customer_replies");
    assert.equal(row.customer_name, "Direct Sender");
  });

  await t.test("5. Webhook Trailing Slash Routing: /webhook/ and /api/webhook/ respond with 200 OK", async () => {
    const { app } = require("../server");
    const testServer = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = testServer.address().port;

    try {
      const postReq = (path) => {
        return new Promise((resolve, reject) => {
          const payload = JSON.stringify({
            object: "whatsapp_business_account",
            entry: [{ id: "1064803546265989", changes: [{ value: { messages: [] }, field: "messages" }] }]
          });
          const req = http.request({
            hostname: "127.0.0.1",
            port,
            path,
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          }, (res) => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => resolve({ status: res.statusCode, data }));
          });
          req.on("error", reject);
          req.write(payload);
          req.end();
        });
      };

      const res1 = await postReq("/webhook/");
      assert.equal(res1.status, 200);

      const res2 = await postReq("/api/webhook/");
      assert.equal(res2.status, 200);
    } finally {
      await new Promise(r => testServer.close(r));
    }
  });
});
