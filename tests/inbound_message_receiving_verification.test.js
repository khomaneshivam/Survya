const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { db, setSetting, getSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const { broadcastEngine } = require("../src/services/broadcastEngine");
const config = require("../src/config/env");

test("Inbound WhatsApp Message Receiving & Auto-Reply Impact Test Suite", async (t) => {
  const basePhone = `919900${Date.now().toString().slice(-6)}`;
  const cleanPhone = basePhone.replace(/\D/g, "");

  // Intercept metaWhatsAppService outgoing calls so real Meta API is not hit during tests
  let sentOutboundMessages = [];
  const originalSendText = metaWhatsAppService.sendTextMessage;
  const originalSendButtons = metaWhatsAppService.sendInteractiveButtons;
  const originalSendList = metaWhatsAppService.sendInteractiveList;
  const originalSendFlow = metaWhatsAppService.sendFlowMessage;
  let prevFlowsEnabled = null;
  const testPhoneNumberId = "1510764325447375";

  t.before(() => {
    prevFlowsEnabled = getSetting("WHATSAPP_FLOWS_ENABLED");
    // Enable unified flow engine
    setSetting("AUTO_REPLY_ENABLED", "true");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");

    // Register mock WABA phone line so strict webhook account routing accepts payload
    const preExisting = db.prepare("SELECT id FROM waba_phone_numbers WHERE phone_number_id = ?").get(testPhoneNumberId);
    if (!preExisting) {
      db.prepare(`
        INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, is_default, active_status, quality_rating, status)
        VALUES ('waba_test_inbound_verify_1', 1, 'Test Webhook Line', '919876543210', ?, '1064803546265989', 0, 1, 'GREEN', 'CONNECTED')
      `).run(testPhoneNumberId);
    }

    // Stub outbound WhatsApp message dispatches
    metaWhatsAppService.sendTextMessage = async (params) => {
      sentOutboundMessages.push({ type: "text", params });
      return { success: true, messageId: `wamid.STUB_TEXT_${Date.now()}` };
    };

    metaWhatsAppService.sendInteractiveButtons = async (params) => {
      sentOutboundMessages.push({ type: "buttons", params });
      return { success: true, messageId: `wamid.STUB_BUTTONS_${Date.now()}` };
    };

    metaWhatsAppService.sendInteractiveList = async (params) => {
      sentOutboundMessages.push({ type: "list", params });
      return { success: true, messageId: `wamid.STUB_LIST_${Date.now()}` };
    };

    metaWhatsAppService.sendFlowMessage = async (params) => {
      sentOutboundMessages.push({ type: "flow", params });
      return { success: true, messageId: `wamid.STUB_FLOW_${Date.now()}` };
    };
  });

  t.after(async () => {
    // Restore stubs & settings
    if (prevFlowsEnabled !== null && prevFlowsEnabled !== undefined) {
      setSetting("WHATSAPP_FLOWS_ENABLED", prevFlowsEnabled);
    } else {
      setSetting("WHATSAPP_FLOWS_ENABLED", "false");
    }
    metaWhatsAppService.sendTextMessage = originalSendText;
    metaWhatsAppService.sendInteractiveButtons = originalSendButtons;
    metaWhatsAppService.sendInteractiveList = originalSendList;
    metaWhatsAppService.sendFlowMessage = originalSendFlow;

    // Cleanup DB
    try {
      db.prepare("DELETE FROM customer_replies WHERE from_phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM flow_responses WHERE from_phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM flow_tokens WHERE clean_phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM conversation_handoff_states WHERE clean_phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM booking_enquiries WHERE phone_e164 LIKE ? OR phone_e164 LIKE ?").run(`+${basePhone}%`, `${basePhone}%`);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone LIKE ?").run(`${basePhone}%`);
      db.prepare("DELETE FROM waba_phone_numbers WHERE id = 'waba_test_inbound_verify_1'").run();
    } catch (e) {}
    const { closeAsyncPool } = require("../src/config/asyncDb");
    await closeAsyncPool();
  });

  await t.test("1. Plain Text Greeting: Ingests, saves to customer_replies, and does NOT treat as Flow", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}1`;
    const waMsgId = `wamid.TXT_GREET_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hello, good morning!" }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Rohan Patel" } }]);
    assert.ok(saved.saved, "Inbound greeting must be saved");
    assert.equal(saved.reply.message_type, "text");
    assert.equal(saved.reply.message_body, "Hello, good morning!");
    assert.equal(saved.reply.flow_id, null, "Plain text must not have flow_id");
    assert.equal(saved.reply.flow_response_id, null, "Plain text must not have flow_response_id");
    assert.equal(saved.reply.source, "WHATSAPP");

    // Process conversational response
    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes, "Bot should generate response");
    assert.ok(flowRes.replyText, "Bot response should have text");
    assert.match(flowRes.replyText, /Welcome|KonkanTrip|assist|stay/i);

    // Verify outbound reply recorded in customer_replies
    const outbound = db.prepare("SELECT * FROM customer_replies WHERE from_phone = ? AND message_type = 'outbound' ORDER BY id DESC LIMIT 1").get(phone.replace(/\D/g, ""));
    assert.ok(outbound, "Outbound reply must be saved in customer_replies");
    assert.equal(outbound.reply_status, "AUTO_REPLIED");
  });

  await t.test("2. Visual Flow Option (opt_rooms): Returns villas & amenities overview with interactive follow-up buttons", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}2`;
    // Turn 1: greet to enter Flow 1 welcome menu
    const greetInbound = {
      from: phone,
      id: `wamid.TXT_GREET2_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hi" }
    };
    const savedGreet = webhookService.saveCustomerReply(greetInbound, [{ wa_id: phone, profile: { name: "Kavita Rao" } }]);
    assert.ok(savedGreet.saved);
    await webhookService.processConversationalFlow(savedGreet.reply, greetInbound, {});

    // Turn 2: select "View Villas" (opt_rooms)
    sentOutboundMessages = [];
    const waMsgId = `wamid.OPT_ROOMS_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "opt_rooms", title: "View Villas 🏡" }
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Kavita Rao" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.match(flowRes.replyText, /Garden Villa|Beachfront Suite|Wi-Fi|pool|Accommodations/i);
    assert.ok(sentOutboundMessages.length > 0);
  });

  await t.test("3. Interactive Option (opt_booking): Advances conversation into Room Category selection", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}3`;
    const greetInbound = {
      from: phone,
      id: `wamid.TXT_GREET3_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hello" }
    };
    const savedGreet = webhookService.saveCustomerReply(greetInbound, [{ wa_id: phone, profile: { name: "Sameer Deshmukh" } }]);
    assert.ok(savedGreet.saved);
    await webhookService.processConversationalFlow(savedGreet.reply, greetInbound, {});

    sentOutboundMessages = [];
    const waMsgId = `wamid.OPT_BOOKING_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "opt_booking", title: "Book a Stay 🛏️" }
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Sameer Deshmukh" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.match(flowRes.replyText, /villa|suite|availability|Garden Villa/i);

    assert.ok(sentOutboundMessages.length > 0);
    const lastOut = sentOutboundMessages[sentOutboundMessages.length - 1];
    assert.ok(lastOut.params.buttons);
    const buttonIds = lastOut.params.buttons.map(b => b.id);
    assert.ok(buttonIds.includes("room_garden") || buttonIds.includes("room_beach"));
  });

  await t.test("4. General Booking Inquiry: Dispatches WhatsApp Flow Screen with button fallback", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}4`;
    const waMsgId = `wamid.TXT_BOOKING_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "I want to check room availability for next week" }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Anil Kulkarni" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);

    // Verify either a flow screen was sent, or interactive buttons fallback occurred
    assert.ok(sentOutboundMessages.length > 0);
    const dispatched = sentOutboundMessages.some(m => m.type === "flow" || m.type === "buttons");
    assert.ok(dispatched, "Must dispatch either Flow screen or quick buttons");
  });

  await t.test("5. Interactive Button Click: room_garden progresses booking session to check-in date intake", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}5`;
    const greetMsg = {
      from: phone,
      id: `wamid.TXT_GREET5_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Hi" }
    };
    const sGreet = webhookService.saveCustomerReply(greetMsg, [{ wa_id: phone, profile: { name: "Sunil Mehra" } }]);
    await webhookService.processConversationalFlow(sGreet.reply, greetMsg, {});

    const bookMsg = {
      from: phone,
      id: `wamid.BTN_BOOK5_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "opt_booking", title: "Book a Stay 🛏️" } }
    };
    const sBook = webhookService.saveCustomerReply(bookMsg, [{ wa_id: phone, profile: { name: "Sunil Mehra" } }]);
    await webhookService.processConversationalFlow(sBook.reply, bookMsg, {});

    sentOutboundMessages = [];
    const waMsgId = `wamid.BTN_ROOM_GARDEN_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: "room_garden",
          title: "Garden Villa 🌿"
        }
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Sunil Mehra" } }]);
    assert.ok(saved.saved);
    assert.equal(saved.reply.message_body, "Garden Villa 🌿");

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.match(flowRes.replyText, /Check-in|Date|YYYY-MM-DD/i);
  });

  await t.test("6. Meta Flow Submission (nfm_reply): Validates intake, creates CRM enquiry, and dispatches flow reply", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}6`;
    const waMsgId = `wamid.NFM_${Date.now()}`;
    const flowData = {
      guest_name: "Priya Nair",
      check_in: "2026-12-01",
      check_out: "2026-12-03",
      adults: "2",
      children: "1",
      room_preference: "Deluxe Sea View Room"
    };

    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "nfm_reply",
        nfm_reply: {
          response_json: JSON.stringify(flowData),
          body: "Stay Dates Confirmed"
        }
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Priya Nair" } }]);
    assert.ok(saved.saved);
    assert.ok(saved.reply.flow_response_id, "Must link flow_response_id");

    // Flow responses table check
    const flowResp = db.prepare("SELECT * FROM flow_responses WHERE id = ?").get(saved.reply.flow_response_id);
    assert.ok(flowResp);
    const parsed = JSON.parse(flowResp.parsed_data);
    assert.equal(parsed.guest_name, "Priya Nair");
    assert.equal(parsed.nights, 2);

    // CRM booking enquiry check
    const enquiry = db.prepare("SELECT * FROM booking_enquiries WHERE phone_e164 = ? ORDER BY id DESC LIMIT 1").get(phone);
    assert.ok(enquiry, "CRM Booking enquiry must be auto-created");
    assert.equal(enquiry.guest_name, "Priya Nair");

    // Conversational response check
    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.ok(flowRes.replyText && flowRes.replyText.length > 0);
    assert.ok(sentOutboundMessages.length > 0);
    const lastOut = sentOutboundMessages[sentOutboundMessages.length - 1];
    assert.ok(lastOut.params.buttons);
  });

  await t.test("7. Human Staff Handoff: Detects staff keywords, pauses bot for contact, and alerts duty desk", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}7`;
    const cleanP = phone.replace(/\D/g, "");
    const waMsgId = `wamid.STAFF_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "I want to talk to human staff at reception please" }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Devendra Verma" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.equal(flowRes.handoff, true);
    assert.match(flowRes.replyText, /agent|team|Front Desk|reservations staff|Connecting/i);

    // Check bot paused
    const status = webhookService.getBotStatus(cleanP);
    assert.equal(status.isPaused, true, "Bot must be paused for contact after handoff request");

    // Test follow-up message while bot is paused: bot should NOT auto-reply!
    sentOutboundMessages = [];
    const followUpId = `wamid.FOLLOW_UP_${Date.now()}`;
    const followUp = {
      from: phone,
      id: followUpId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "I am waiting for your staff." }
    };

    const savedFollowUp = webhookService.saveCustomerReply(followUp, [{ wa_id: phone, profile: { name: "Devendra Verma" } }]);
    assert.ok(savedFollowUp.saved, "Inbound message while paused must still be saved to customer_replies");

    const pausedRes = await webhookService.processConversationalFlow(savedFollowUp.reply, followUp, {});
    assert.equal(pausedRes, null, "Bot must NOT reply while paused for staff takeover");
    assert.equal(sentOutboundMessages.length, 0, "No outbound messages should be sent while bot is paused");

    // Clean up pause
    webhookService.resumeBotForPhone(cleanP);
    assert.equal(webhookService.getBotStatus(cleanP).isPaused, false);
  });

  await t.test("8. Inbound Media Message: Ingests image with caption and stores media metadata", () => {
    const phone = `${basePhone}8`;
    const waMsgId = `wamid.IMG_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "image",
      image: {
        id: "media_img_998877",
        mime_type: "image/jpeg",
        caption: "Is this the beach view from the cottage?"
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Meera Sen" } }]);
    assert.ok(saved.saved);
    assert.equal(saved.reply.message_type, "image");
    assert.match(saved.reply.message_body, /Is this the beach view/);
    assert.equal(saved.reply.media_type, "image");
    assert.match(saved.reply.media_url, /media_img_998877/);
  });

  await t.test("9. Message Deduplication: Ignores duplicate wa_message_id to prevent duplicate processing", () => {
    const phone = `${basePhone}9`;
    const waMsgId = `wamid.DUP_CHECK_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "First transmission" }
    };

    const firstSave = webhookService.saveCustomerReply(inbound, []);
    assert.ok(firstSave.saved);

    const dupSave = webhookService.saveCustomerReply(inbound, []);
    assert.equal(dupSave.saved, false, "Duplicate wa_message_id must be skipped");
    assert.equal(dupSave.id, firstSave.reply.id, "Duplicate returns existing message id");
  });

  await t.test("10. End-to-End Webhook Payload Ingestion: processIncomingPayload parses multi-entry payload", async () => {
    const phone = `${basePhone}0`;
    const waMsgId = `wamid.E2E_PAYLOAD_${Date.now()}`;

    const fullPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1064803546265989",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "919876543210",
                  phone_number_id: "1510764325447375"
                },
                contacts: [
                  {
                    profile: { name: "Aakash Gupta" },
                    wa_id: phone
                  }
                ],
                messages: [
                  {
                    from: phone,
                    id: waMsgId,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: { body: "Checking webhook end-to-end processing" }
                  }
                ]
              },
              field: "messages"
            }
          ]
        }
      ]
    };

    const result = await webhookService.processIncomingPayload(fullPayload);
    assert.equal(result.processed, 1);
    assert.equal(result.messages, 1);

    // Verify row in DB
    const row = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(waMsgId);
    assert.ok(row, "Message must be saved in customer_replies");
    assert.equal(row.customer_name, "Aakash Gupta");
    assert.equal(row.message_body, "Checking webhook end-to-end processing");
  });

  await t.test("11. Live HTTP POST to Webhook Endpoint: /webhook and /api/webhook accept notifications with 200 OK", async () => {
    const { app } = require("../server");
    const testServer = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const port = testServer.address().port;

    const postPayload = (endpoint, payload) => {
      return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(payload);
        const secret = config.META_APP_SECRET || getSetting("META_APP_SECRET") || "";
        const headers = {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr)
        };
        if (secret && !/placeholder|your_meta_app_secret|your_app_secret|dummy|optional/i.test(secret)) {
          const crypto = require("crypto");
          headers["x-hub-signature-256"] = "sha256=" + crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
        }
        const req = http.request({
          hostname: "127.0.0.1",
          port,
          path: endpoint,
          method: "POST",
          headers
        }, (res) => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on("error", reject);
        req.write(bodyStr);
        req.end();
      });
    };

    try {
      const httpMsgId = `wamid.HTTP_TEST_${Date.now()}`;
      const httpPhone = `${basePhone}99`;
      const payload = {
        object: "whatsapp_business_account",
        entry: [{
          id: "1064803546265989",
          changes: [{
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1510764325447375" },
              contacts: [{ profile: { name: "HTTP Tester" }, wa_id: httpPhone }],
              messages: [{
                from: httpPhone,
                id: httpMsgId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Testing live HTTP post to /webhook" }
              }]
            },
            field: "messages"
          }]
        }]
      };

      const { JobWorkerEngine } = require("../src/services/queue/jobWorkerEngine");
      const workerEngine = new JobWorkerEngine();

      // Test /webhook
      const res1 = await postPayload("/webhook", payload);
      assert.equal(res1.statusCode, 200);
      assert.equal(res1.body, "EVENT_RECEIVED");

      // Process durable webhook queue item
      for (let i = 0; i < 15; i++) {
        await workerEngine.claimAndProcessNextJob("webhook");
        if (db.prepare("SELECT id FROM customer_replies WHERE wa_message_id = ?").get(httpMsgId)) break;
        await new Promise(r => setTimeout(r, 50));
      }

      // Verify message saved
      const record = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(httpMsgId);
      assert.ok(record, "Message sent via HTTP POST /webhook must be in DB");
      assert.equal(record.message_body, "Testing live HTTP post to /webhook");

      // Test /api/webhook
      const apiMsgId = `wamid.HTTP_API_TEST_${Date.now()}`;
      payload.entry[0].changes[0].value.messages[0].id = apiMsgId;
      payload.entry[0].changes[0].value.messages[0].text.body = "Testing live HTTP post to /api/webhook";

      const res2 = await postPayload("/api/webhook", payload);
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.body, "EVENT_RECEIVED");

      for (let i = 0; i < 15; i++) {
        await workerEngine.claimAndProcessNextJob("webhook");
        if (db.prepare("SELECT id FROM customer_replies WHERE wa_message_id = ?").get(apiMsgId)) break;
        await new Promise(r => setTimeout(r, 50));
      }

      const apiRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(apiMsgId);
      assert.ok(apiRecord, "Message sent via HTTP POST /api/webhook must be in DB");
      assert.equal(apiRecord.message_body, "Testing live HTTP post to /api/webhook");
    } finally {
      await new Promise(r => testServer.close(r));
    }
  });
});
