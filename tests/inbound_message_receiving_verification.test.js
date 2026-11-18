const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { db, setSetting, getSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const { broadcastEngine } = require("../src/services/broadcastEngine");

test("Inbound WhatsApp Message Receiving & Auto-Reply Impact Test Suite", async (t) => {
  const basePhone = `919900${Date.now().toString().slice(-6)}`;
  const cleanPhone = basePhone.replace(/\D/g, "");

  // Intercept metaWhatsAppService outgoing calls so real Meta API is not hit during tests
  let sentOutboundMessages = [];
  const originalSendText = metaWhatsAppService.sendTextMessage;
  const originalSendButtons = metaWhatsAppService.sendInteractiveButtons;
  const originalSendList = metaWhatsAppService.sendInteractiveList;
  const originalSendFlow = metaWhatsAppService.sendFlowMessage;

  t.before(() => {
    // Enable hospitality flow engine
    setSetting("AUTO_REPLY_ENABLED", "true");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");

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

  t.after(() => {
    // Restore stubs
    metaWhatsAppService.sendTextMessage = originalSendText;
    metaWhatsAppService.sendInteractiveButtons = originalSendButtons;
    metaWhatsAppService.sendInteractiveList = originalSendList;
    metaWhatsAppService.sendFlowMessage = originalSendFlow;

    // Cleanup DB
    try {
      db.prepare("DELETE FROM customer_replies WHERE from_phone LIKE '9199%'").run();
      db.prepare("DELETE FROM flow_responses WHERE from_phone LIKE '9199%'").run();
      db.prepare("DELETE FROM flow_tokens WHERE clean_phone LIKE '9199%'").run();
      db.prepare("DELETE FROM booking_enquiries WHERE phone_e164 LIKE '+9199%' OR phone_e164 LIKE '9199%'").run();
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone LIKE '9199%'").run();
    } catch (e) {}
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
    assert.equal(outbound.reply_status, "SENT");
  });

  await t.test("2. Amenity / Facility Inquiry: Returns facilities text and interactive buttons", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}2`;
    const waMsgId = `wamid.TXT_AMENITY_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Do you have a swimming pool and free wifi?" }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Kavita Rao" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.match(flowRes.replyText, /pool|wifi|beach|amenities|facilities/i);

    // Outbound message should include buttons: Check Rates, Dining Menu, Talk to Staff
    assert.ok(sentOutboundMessages.length > 0);
    const lastOut = sentOutboundMessages[sentOutboundMessages.length - 1];
    assert.ok(lastOut.params.buttons, "Should deliver interactive buttons for amenity inquiry");
  });

  await t.test("3. Dining Inquiry: Returns dining menu card with interactive action buttons", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}3`;
    const waMsgId = `wamid.TXT_DINING_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Can I see your restaurant dining menu and food items?" }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Sameer Deshmukh" } }]);
    assert.ok(saved.saved);

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.ok(flowRes.menu);
    assert.match(flowRes.replyText, /Menu|Cafe|Bar|Dining/i);

    // Verify outbound buttons include order/rooms/staff
    assert.ok(sentOutboundMessages.length > 0);
    const lastOut = sentOutboundMessages[sentOutboundMessages.length - 1];
    assert.ok(lastOut.params.buttons);
    const buttonIds = lastOut.params.buttons.map(b => b.id);
    assert.ok(buttonIds.includes("btn_table_order") || buttonIds.includes("btn_rooms"));
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

  await t.test("5. Interactive Button Click: btn_dates_weekend calculates dates and returns available rooms", async () => {
    sentOutboundMessages = [];
    const phone = `${basePhone}5`;
    const waMsgId = `wamid.BTN_WEEKEND_${Date.now()}`;
    const inbound = {
      from: phone,
      id: waMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: {
          id: "btn_dates_weekend",
          title: "This Weekend"
        }
      }
    };

    const saved = webhookService.saveCustomerReply(inbound, [{ wa_id: phone, profile: { name: "Sunil Mehra" } }]);
    assert.ok(saved.saved);
    assert.equal(saved.reply.message_body, "This Weekend");

    const flowRes = await webhookService.processConversationalFlow(saved.reply, inbound, {});
    assert.ok(flowRes);
    assert.match(flowRes.replyText, /Availability|Available|Rooms|night/i);
  });

  await t.test("6. Meta Flow Submission (nfm_reply): Validates intake, creates CRM enquiry, and delivers itemized quote", async () => {
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
    assert.match(flowRes.replyText, /Deluxe Sea View|Availability & Rates|Total for 2 night/i);

    // Verify quote action buttons sent
    assert.ok(sentOutboundMessages.length > 0);
    const lastOut = sentOutboundMessages[sentOutboundMessages.length - 1];
    assert.ok(lastOut.params.buttons);
    const buttonIds = lastOut.params.buttons.map(b => b.id);
    assert.ok(buttonIds.includes("btn_confirm"));
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
    assert.match(flowRes.replyText, /Front Desk|reservations staff|Connecting/i);

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
        const req = http.request({
          hostname: "127.0.0.1",
          port,
          path: endpoint,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr)
          }
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

      // Test /webhook
      const res1 = await postPayload("/webhook", payload);
      assert.equal(res1.statusCode, 200);
      assert.equal(res1.body, "EVENT_RECEIVED");

      // Wait a brief moment for async processing
      await new Promise(r => setTimeout(r, 200));

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

      await new Promise(r => setTimeout(r, 200));

      const apiRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(apiMsgId);
      assert.ok(apiRecord, "Message sent via HTTP POST /api/webhook must be in DB");
      assert.equal(apiRecord.message_body, "Testing live HTTP post to /api/webhook");
    } finally {
      await new Promise(r => testServer.close(r));
    }
  });
});
