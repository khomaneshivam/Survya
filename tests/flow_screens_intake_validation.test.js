const test = require("node:test");
const assert = require("node:assert/strict");
const { db, setSetting, getSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const flowService = require("../src/services/flowService");
const flowCryptoService = require("../src/services/flowCryptoService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");

test("WhatsApp Flow Screens: Data Collection, Validation & Automated Response Test Suite", async (t) => {
  const testPhone = `919811${Date.now().toString().slice(-6)}`;
  const cleanPhone = testPhone.replace(/\D/g, "");
  let testFlowId = null;

  t.before(() => {
    // Ensure test flow exists and is published
    const publishedFlow = db.prepare("SELECT * FROM whatsapp_flows WHERE id = 'flow_hospitality_booking'").get();
    if (!publishedFlow) {
      const { RESORT_BOOKING_TEMPLATE } = require("../src/services/flowStarterTemplates");
      db.prepare(`
        INSERT INTO whatsapp_flows (
          id, user_id, name, description, meta_flow_id, status, categories,
          flow_json, json_version, data_api_version, sync_status, created_at, updated_at
        ) VALUES (
          'flow_hospitality_booking',
          'system',
          'KonkanTrip Stay & Booking Flow',
          'Test Booking Flow',
          '887766554433221',
          'PUBLISHED',
          '["LEAD_GENERATION"]',
          ?,
          '3.1',
          '3.0',
          'SYNCED',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).run(JSON.stringify(RESORT_BOOKING_TEMPLATE.flow_json));
    }
    testFlowId = "flow_hospitality_booking";

    // Set bot to HOSPITALITY_FLOW engine
    const { getSetting } = require("../src/config/database");
    t._prevFlowsEnabled = getSetting("WHATSAPP_FLOWS_ENABLED");
    setSetting("AUTO_REPLY_ENABLED", "true");
    setSetting("AUTO_REPLY_ENGINE_MODE", "HOSPITALITY_FLOW");
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");
    setSetting("DEFAULT_WHATSAPP_FLOW_ID", "flow_hospitality_booking");
  });

  t.after(() => {
    // Cleanup records generated for testPhone
    try {
      setSetting("WHATSAPP_FLOWS_ENABLED", t._prevFlowsEnabled ?? "false");
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ? OR clean_phone = ?").run(testPhone, cleanPhone);
      db.prepare("DELETE FROM flow_responses WHERE from_phone = ? OR clean_phone = ?").run(testPhone, cleanPhone);
      db.prepare("DELETE FROM flow_tokens WHERE recipient_phone = ? OR clean_phone = ?").run(testPhone, cleanPhone);
      db.prepare("DELETE FROM booking_enquiries WHERE phone_e164 = ?").run(testPhone);
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(cleanPhone);
    } catch (e) {}
  });

  await t.test("1. Flow Submission Normalization & Validation: Auto-corrects invalid checkout dates & sanitizes fields", () => {
    // Inverted dates test (check_out is before check_in)
    const invalidSubmission = {
      guest_name: "Vikram Malhotra",
      check_in: "2026-12-10",
      check_out: "2026-12-05", // invalid: 5 days before check_in
      adults: "3",
      children: "2",
      room_preference: "Deluxe Sea View Room",
      special_requests: "Late check-in requested"
    };

    const result = webhookService.validateAndNormalizeFlowSubmission(invalidSubmission, "Default Guest");

    assert.equal(result.isValid, true);
    assert.equal(result.isBooking, true);
    assert.equal(result.intakeData.guest_name, "Vikram Malhotra");
    assert.equal(result.intakeData.check_in, "2026-12-10");
    // Check-out should have been auto-corrected to strictly after check_in (check_in + 1 day)
    assert.equal(result.intakeData.check_out, "2026-12-11");
    assert.equal(result.intakeData.date_auto_corrected, true);
    assert.equal(result.intakeData.nights, 1);
    assert.equal(result.intakeData.adults, 3);
    assert.equal(result.intakeData.children, 2);
    assert.equal(result.intakeData.total_guests, 5);
    assert.equal(result.intakeData.room_preference, "Deluxe Sea View Room");
    assert.equal(result.intakeData.special_requests, "Late check-in requested");
  });

  await t.test("2. Flow Triggering: General booking inquiry dispatches native Meta Flow Screen when intake values are needed", async () => {
    let capturedFlowParams = null;
    const originalSendFlow = metaWhatsAppService.sendFlowMessage;

    // Intercept sendFlowMessage to verify flow screen parameters
    metaWhatsAppService.sendFlowMessage = async (params) => {
      capturedFlowParams = params;
      return { success: true, messageId: `wamid.FLOW_DISPATCH_${Date.now()}` };
    };

    const flowService = require("../src/services/conversationFlowService");
    const createdFlow = flowService.createFlow({
      tenant_id: 1,
      name: "Meta Flow Screen Booking Trigger Test",
      description: "Verifies SEND_WHATSAPP_FLOW node dispatch via conversationFlowEngine",
      nodes: [
        {
          id: "trg_meta_flow",
          type: "TRIGGER_WHATSAPP",
          data: {
            triggerType: "KEYWORD",
            keywords: ["meta_flow_intake_card"],
            matchType: "CONTAINS",
            priority: 1
          }
        },
        {
          id: "node_send_meta_flow",
          type: "SEND_WHATSAPP_FLOW",
          config: {
            flowTitle: "Stay Dates & Guests Form",
            flowCta: "Select Dates & Guests",
            metaFlowId: "887766554433221",
            initialScreen: "BOOKING_ENQUIRY_SCREEN"
          }
        }
      ],
      transitions: [
        { source: "trg_meta_flow", target: "node_send_meta_flow" }
      ]
    }, { id: "system" });
    const verId = createdFlow.draftVersion.id;
    db.prepare("UPDATE conversation_flow_versions SET status = 'PUBLISHED' WHERE id = ?").run(verId);
    db.prepare("UPDATE conversation_flows SET status = 'PUBLISHED', published_version_id = ? WHERE id = ?").run(verId, createdFlow.flow.id);
    require("../src/services/workflow/workflowTriggerService").syncFlowTriggers(1, createdFlow.flow.id, createdFlow.draftVersion.nodes);

    try {
      const inboundMsg = {
        from: testPhone,
        id: `wamid.INTAKE_REQ_${Date.now()}`,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "text",
        text: { body: "Please send meta_flow_intake_card" }
      };

      const saved = webhookService.saveCustomerReply(inboundMsg, [{ wa_id: testPhone, profile: { name: "Ananya Roy" } }]);
      assert.ok(saved.saved, "Inbound message should be saved");

      const flowRes = await webhookService.processConversationalFlow(saved.reply, inboundMsg, {});

      assert.ok(flowRes, "Bot should generate a response");
      assert.ok(capturedFlowParams, "Flow screen should have been dispatched via sendFlowMessage");
      assert.equal(capturedFlowParams.to, cleanPhone);
      assert.ok(capturedFlowParams.flowId, "Flow ID must be passed to Meta");
      assert.ok(capturedFlowParams.flowToken, "Dynamic flowToken must be generated");
      assert.ok(capturedFlowParams.ctaText, "CTA text must be set");
      assert.match(capturedFlowParams.ctaText, /Dates|Guests|Form/i);

      // Verify token was recorded in flow_tokens table
      const tokenRow = db.prepare("SELECT * FROM flow_tokens WHERE token = ?").get(capturedFlowParams.flowToken);
      assert.ok(tokenRow, "Flow token record must exist in DB");
      assert.equal(tokenRow.status, "ACTIVE");
      assert.equal(tokenRow.clean_phone, cleanPhone);
    } finally {
      metaWhatsAppService.sendFlowMessage = originalSendFlow;
      try {
        db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ?").run(String(createdFlow.flow.id));
        db.prepare("DELETE FROM conversation_flow_sessions WHERE flow_id = ?").run(createdFlow.flow.id);
        db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id = ?").run(createdFlow.flow.id);
        db.prepare("DELETE FROM conversation_flows WHERE id = ?").run(createdFlow.flow.id);
        require("../src/services/workflow/runtimeCache").invalidateTriggers(1);
      } catch (_) {}
    }
  });

  await t.test("3. Flow Submission & Instant Response: nfm_reply webhook validates data, creates CRM enquiry and sends itemized quote", async () => {
    const waFlowMsgId = `wamid.NFM_SUBMIT_${Date.now()}`;
    const flowAnswers = {
      guest_name: "Ananya Roy",
      check_in: "2026-11-28",
      check_out: "2026-11-30",
      adults: "2",
      children: "0",
      room_preference: "Deluxe Sea View Room",
      special_requests: "Sea facing balcony"
    };

    const nfmMsg = {
      from: testPhone,
      id: waFlowMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "nfm_reply",
        nfm_reply: {
          response_json: JSON.stringify(flowAnswers),
          body: "Sent from WhatsApp Flow"
        }
      }
    };

    // 1. Ingest nfm_reply via webhook
    const saveRes = webhookService.saveCustomerReply(nfmMsg, [{ wa_id: testPhone, profile: { name: "Ananya Roy" } }]);
    assert.ok(saveRes.saved, "nfm_reply should be saved in customer_replies");
    assert.ok(saveRes.reply.flow_response_id, "flow_response_id must be linked on reply record");

    // 2. Verify flow_responses table has validated parsed data
    const flowResp = db.prepare("SELECT * FROM flow_responses WHERE id = ?").get(saveRes.reply.flow_response_id);
    assert.ok(flowResp, "Flow response record must exist");
    const parsedData = JSON.parse(flowResp.parsed_data);
    assert.equal(parsedData.guest_name, "Ananya Roy");
    assert.equal(parsedData.check_in, "2026-11-28");
    assert.equal(parsedData.check_out, "2026-11-30");
    assert.equal(parsedData.nights, 2);

    // 3. Verify CRM Booking Enquiry was created automatically
    const enquiry = db.prepare("SELECT * FROM booking_enquiries WHERE phone_e164 = ? ORDER BY id DESC LIMIT 1").get(testPhone);
    assert.ok(enquiry, "CRM Booking Enquiry must be auto-created");
    assert.equal(enquiry.guest_name, "Ananya Roy");
    assert.equal(enquiry.check_in, "2026-11-28");
    assert.equal(enquiry.check_out, "2026-11-30");

    // 4. Process conversational response to the Flow submission
    const botResponse = await webhookService.processConversationalFlow(saveRes.reply, nfmMsg, {});

    assert.ok(botResponse, "Bot must respond immediately to flow submission");
    assert.ok(botResponse.replyText, "Should generate itemized quote text");
    assert.match(botResponse.replyText, /Availability|Rates|Total for 2 night/i, "Quotation text must contain rates breakdown");
    assert.match(botResponse.replyText, /Deluxe Sea View/i, "Quotation text must reference preferred room");

    // 5. Verify outbound reply in database has interactive confirm action buttons
    const outboundReply = db.prepare(`
      SELECT * FROM customer_replies
      WHERE from_phone = ? AND message_type = 'outbound'
      ORDER BY id DESC LIMIT 1
    `).get(testPhone);

    assert.ok(outboundReply, "Outbound reply must be saved in customer_replies");
    assert.equal(outboundReply.reply_status, "SENT");
    assert.equal(outboundReply.source, "WHATSAPP_FLOW");
    assert.ok(outboundReply.raw_payload, "Raw payload with action buttons should be saved");
    const rawP = JSON.parse(outboundReply.raw_payload);
    assert.equal(rawP.step, "ROOM_SELECTION");
  });

  await t.test("4. Customer Feedback Flow Submission: Validates rating and replies with thank-you & discovery buttons", async () => {
    const feedbackPhone = `919822${Date.now().toString().slice(-6)}`;
    const waFeedbackMsgId = `wamid.FEEDBACK_${Date.now()}`;
    const feedbackAnswers = {
      overall_rating: "5",
      favorite_aspect: "hospitality",
      suggestions: "Keep up the wonderful breakfast spread!",
      would_recommend: "yes"
    };

    const feedbackMsg = {
      from: feedbackPhone,
      id: waFeedbackMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "nfm_reply",
        nfm_reply: {
          response_json: JSON.stringify(feedbackAnswers),
          body: "Survey Response"
        }
      }
    };

    const saveRes = webhookService.saveCustomerReply(feedbackMsg, [{ wa_id: feedbackPhone, profile: { name: "Pooja Shah" } }]);
    assert.ok(saveRes.saved);

    const botResponse = await webhookService.processConversationalFlow(saveRes.reply, feedbackMsg, {});

    assert.ok(botResponse);
    assert.equal(botResponse.feedback, true);
    assert.match(botResponse.replyText, /Thank You For Your Feedback/i);
    assert.match(botResponse.replyText, /5\/5/);
    assert.match(botResponse.replyText, /hospitality/i);

    // Cleanup
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(feedbackPhone);
    db.prepare("DELETE FROM flow_responses WHERE from_phone = ?").run(feedbackPhone);
  });

  await t.test("5. Concierge Support Ticket Flow Submission: Validates ticket, pauses bot for staff takeover and alerts duty desk", async () => {
    const supportPhone = `919833${Date.now().toString().slice(-6)}`;
    const waSupportMsgId = `wamid.SUPPORT_${Date.now()}`;
    const supportAnswers = {
      issue_category: "checkin_guidance",
      booking_id: "BK-9921",
      issue_description: "What time does the Mandwa ferry boat depart?"
    };

    const supportMsg = {
      from: supportPhone,
      id: waSupportMsgId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "nfm_reply",
        nfm_reply: {
          response_json: JSON.stringify(supportAnswers),
          body: "Support Ticket"
        }
      }
    };

    const saveRes = webhookService.saveCustomerReply(supportMsg, [{ wa_id: supportPhone, profile: { name: "Sameer Joshi" } }]);
    assert.ok(saveRes.saved);

    const botResponse = await webhookService.processConversationalFlow(saveRes.reply, supportMsg, {});

    assert.ok(botResponse);
    assert.equal(botResponse.supportTicket, true);
    assert.match(botResponse.replyText, /Ticket Created/i);
    assert.match(botResponse.replyText, /CHECKIN GUIDANCE/i);
    assert.match(botResponse.replyText, /BK-9921/);

    // Verify bot is paused for staff takeover for this contact
    const botStatus = webhookService.getBotStatus(supportPhone);
    assert.equal(botStatus.isPaused, true, "Bot must be paused for staff takeover");

    // Cleanup
    webhookService.resumeBotForPhone(supportPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(supportPhone);
    db.prepare("DELETE FROM flow_responses WHERE from_phone = ?").run(supportPhone);
  });

  await t.test("6. Meta Flow Dynamic Data Exchange Endpoint: Validates date ranges and returns dynamic rooms & prices", () => {
    // 6a. Check validation error when check_out is <= check_in
    const invalidExchangePayload = {
      action: "data_exchange",
      screen: "BOOKING_ENQUIRY_SCREEN",
      data: {
        check_in: "2026-12-25",
        check_out: "2026-12-20"
      }
    };

    const errRes = flowCryptoService.processFlowAction(invalidExchangePayload);
    assert.equal(errRes.version, "3.0");
    assert.ok(errRes.data.error_messages, "Validation errors should be returned");
    assert.match(errRes.data.error_messages.check_out, /strictly after check-in/i);

    // 6b. Check success and dynamic rooms returned when dates are valid
    const validExchangePayload = {
      action: "data_exchange",
      screen: "BOOKING_ENQUIRY_SCREEN",
      data: {
        check_in: "2026-11-28",
        check_out: "2026-11-30"
      }
    };

    const validRes = flowCryptoService.processFlowAction(validExchangePayload);
    assert.equal(validRes.version, "3.0");
    assert.equal(validRes.data.verified, true);
    assert.equal(validRes.data.error_messages, undefined);
    assert.ok(Array.isArray(validRes.data.dynamic_rooms), "Dynamic room list must be returned");
    assert.ok(validRes.data.dynamic_rooms.length > 0, "Should contain active room categories");
    assert.match(validRes.data.dynamic_rooms[0].title, /₹|night/i, "Room option should display pricing");
  });
});
