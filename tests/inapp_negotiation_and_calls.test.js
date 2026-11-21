const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const inappService = require("../src/services/inapp/inappExperienceService");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const inappNegotiationService = require("../src/services/inapp/inappNegotiationService");
const inappCallService = require("../src/services/inapp/inappCallService");
const inappSseManager = require("../src/services/inapp/inappSseManager");
const crmPipelineService = require("../src/services/crmPipelineService");

describe("In-App Rate Negotiation, Callbacks & Real-Time Live Sync Test Suite", () => {
  const tenantId = 1;
  const createdBy = "test_neg_runner";
  let testExp = null;
  let testItem = null;
  let testSession = null;
  let testCrmRecord = null;

  before(() => {
    // 1. Create a test catalog item with base price 5000
    const catRes = db.prepare(`
      INSERT INTO catalog_items (
        tenant_id, entity_id, item_type, title, slug, description, base_price, tax_rate,
        is_active, created_at, updated_at
      ) VALUES (
        1, 1, 'PRODUCT', 'Royal Sea Facing Suite Test', 'royal-suite-test', 'Luxury suite with balcony', 5000.00, 18.00,
        1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();
    testItem = db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(catRes.lastInsertRowid);

    // 2. Create test experience with RATE_NEGOTIATION and CALL_CONNECT screens
    testExp = inappService.createExperience({
      name: "Konkan Villa Experience Test",
      domain_type: "RETAIL",
      status: "PUBLISHED",
      theme_json: { primaryColor: "#2563EB" },
      business_hours_json: {
        defaultOpen: "00:00",
        defaultClose: "23:59",
        days: {
          monday: { isOpen: true, open: "00:00", close: "23:59" },
          tuesday: { isOpen: true, open: "00:00", close: "23:59" },
          wednesday: { isOpen: true, open: "00:00", close: "23:59" },
          thursday: { isOpen: true, open: "00:00", close: "23:59" },
          friday: { isOpen: true, open: "00:00", close: "23:59" },
          saturday: { isOpen: true, open: "00:00", close: "23:59" },
          sunday: { isOpen: true, open: "00:00", close: "23:59" }
        }
      }
    }, tenantId, createdBy);

    // Publish experience so public runtime can load it
    inappService.updateExperienceStatus(testExp.id, "PUBLISHED", tenantId, createdBy);

    // Add RATE_NEGOTIATION screen with thresholds (autoApprove: 90% = 4500, floorPrice: 75% = 3750)
    inappService.createScreen(testExp.id, {
      screen_key: "rate_nego",
      screen_type: "RATE_NEGOTIATION",
      title: "Interactive Rate Discussion",
      config_json: {
        autoApprovePercent: 90,
        floorPricePercent: 75,
        quoteValidityHours: 24
      }
    }, tenantId, createdBy);

    // Add CALL_CONNECT screen
    inappService.createScreen(testExp.id, {
      screen_key: "call_connect",
      screen_type: "CALL_CONNECT",
      title: "Direct Call & Callback Concierge",
      config_json: {
        callbackSlaMinutes: 5
      }
    }, tenantId, createdBy);

    // 3. Upsert a CRM pipeline and lead for linking
    let pipelines = crmPipelineService.listPipelines(tenantId);
    let pipelineId = pipelines[0]?.id;
    if (!pipelineId) {
      const p = crmPipelineService.createPipeline({
        name: "Test Sales Pipeline",
        industryType: "HOSPITALITY",
        stages: [{ key: "NEW", label: "New" }, { key: "WON", label: "Won" }]
      }, tenantId);
      pipelineId = p.id;
    }

    testCrmRecord = crmPipelineService.createRecord({
      tenantId,
      pipelineId,
      contactPhone: "919876543210",
      contactName: "Rohan Sharma",
      stageKey: "NEW",
      dealValue: 0
    });

    // 4. Create active session linked to CRM record
    const sessRes = inappRuntimeService.startOrResumeSession(testExp.slug, {
      contactPhone: "919876543210",
      contactName: "Rohan Sharma"
    });
    testSession = sessRes;

    // Link CRM record id to session
    db.prepare("UPDATE inapp_sessions SET crm_record_id = ? WHERE session_token = ?").run(
      testCrmRecord.id,
      testSession.sessionToken
    );
  });

  after(() => {
    if (testItem) {
      db.prepare("DELETE FROM catalog_items WHERE id = ?").run(testItem.id);
    }
    if (testExp) {
      db.prepare("DELETE FROM inapp_rate_negotiations WHERE experience_id = ?").run(testExp.id);
      db.prepare("DELETE FROM inapp_call_requests WHERE experience_id = ?").run(testExp.id);
      db.prepare("DELETE FROM inapp_sessions WHERE experience_id = ?").run(testExp.id);
      db.prepare("DELETE FROM inapp_screens WHERE experience_id = ?").run(testExp.id);
      db.prepare("DELETE FROM inapp_experiences WHERE id = ?").run(testExp.id);
    }
    if (testCrmRecord) {
      db.prepare("DELETE FROM crm_records WHERE id = ?").run(testCrmRecord.id);
    }
  });

  test("1. Rate Negotiation - Outcome 1: Auto-Approve (Offer >= 90% of base rate)", () => {
    // Base is 5000. 90% is 4500. Offer is 4600 for 2 units.
    const result = inappNegotiationService.submitOffer(testExp.slug, {
      sessionToken: testSession.sessionToken,
      catalogItemId: testItem.id,
      quantity: 2,
      customerOfferPrice: 4600,
      notes: "Family weekend trip"
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "AUTO_APPROVED");
    assert.equal(result.customerOfferPrice, 4600);
    assert.equal(result.approvedFinalPrice, 4600);
    assert.equal(result.quantity, 2);
    assert.equal(result.subtotal, 9200); // 4600 * 2
    assert.equal(result.gstAmount, 1656); // 18% of 9200
    assert.equal(result.grandTotal, 10856); // 9200 + 1656

    // Verify row in inapp_rate_negotiations
    const row = db.prepare("SELECT * FROM inapp_rate_negotiations WHERE id = ?").get(result.negotiationId);
    assert.ok(row, "Negotiation row must exist");
    assert.equal(row.status, "AUTO_APPROVED");
    assert.equal(Number(row.approved_final_price), 4600);
  });

  test("2. Rate Negotiation - Outcome 3: Below-Floor Price Rejection without spam rows", () => {
    // Floor is 75% of 5000 = 3750. Offer is 3000.
    const beforeCount = db.prepare("SELECT COUNT(*) as cnt FROM inapp_rate_negotiations WHERE experience_id = ?").get(testExp.id).cnt;

    const result = inappNegotiationService.submitOffer(testExp.slug, {
      sessionToken: testSession.sessionToken,
      catalogItemId: testItem.id,
      quantity: 1,
      customerOfferPrice: 3000,
      notes: "Very low offer"
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "OFFER_TOO_LOW");
    assert.equal(result.suggestedMinPrice, 3750);
    assert.ok(result.message.includes("We cannot accept offers below") || result.message.includes("3,750"));

    const afterCount = db.prepare("SELECT COUNT(*) as cnt FROM inapp_rate_negotiations WHERE experience_id = ?").get(testExp.id).cnt;
    assert.equal(afterCount, beforeCount, "Offer below floor must not create spam row in inapp_rate_negotiations");
  });

  test("3. Rate Negotiation - Outcome 2: Pending Agent Review -> Agent Counter -> Customer Accept -> CRM Won Update", () => {
    // Offer is 4000 (between 3750 and 4500)
    const result = inappNegotiationService.submitOffer(testExp.slug, {
      sessionToken: testSession.sessionToken,
      catalogItemId: testItem.id,
      quantity: 1,
      customerOfferPrice: 4000,
      notes: "Can we get 4000 per night?"
    });

    assert.equal(result.success, true);
    assert.equal(result.status, "PENDING_AGENT");
    assert.ok(result.negotiationId);

    // Verify Agent can list negotiations filtered by phone
    const list = inappNegotiationService.listNegotiations(tenantId, {
      phone: "919876543210",
      status: "PENDING_AGENT"
    });
    assert.ok(list.length > 0, "Agent should find pending negotiation by visitor phone");
    const found = list.find(n => n.id === result.negotiationId);
    assert.ok(found, "Pending negotiation should match ID");
    assert.equal(Number(found.customer_offer_price), 4000);

    // Agent takes action: COUNTER with 4200
    const counterRes = inappNegotiationService.agentAction(tenantId, result.negotiationId, {
      action: "COUNTER",
      counterPrice: 4200,
      agentNote: "Best discounted rate with breakfast included",
      userId: "manager_agent"
    });

    assert.equal(counterRes.success, true);
    assert.equal(counterRes.data.status, "AGENT_COUNTERED");
    assert.equal(Number(counterRes.data.agent_counter_price), 4200);

    // Customer views negotiation status
    const fetchedNeg = inappNegotiationService.getNegotiation(testExp.slug, result.negotiationId, testSession.sessionToken);
    assert.equal(fetchedNeg.status, "AGENT_COUNTERED");
    assert.equal(fetchedNeg.agentCounterPrice, 4200);
    assert.equal(fetchedNeg.subtotal, 4200);
    assert.equal(fetchedNeg.gstAmount, 756); // 18% of 4200
    assert.equal(fetchedNeg.grandTotal, 4956);

    // Customer ACCEPTS agent counter offer
    const acceptRes = inappNegotiationService.respondToNegotiation(testExp.slug, result.negotiationId, {
      sessionToken: testSession.sessionToken,
      response: "ACCEPT"
    });

    assert.equal(acceptRes.success, true);
    assert.equal(acceptRes.status, "ACCEPTED");
    assert.equal(acceptRes.approvedFinalPrice, 4200);
    assert.equal(acceptRes.grandTotal, 4956);

    // Verify linked CRM record is updated to WON with deal_value = grandTotal
    const crmRecord = db.prepare("SELECT * FROM crm_records WHERE id = ?").get(testCrmRecord.id);
    assert.equal(crmRecord.stage_key, "WON");
    assert.equal(Number(crmRecord.deal_value), 4956);
  });

  test("4. Call Availability Evaluation in Asia/Kolkata (IST)", () => {
    const avail = inappCallService.getCallAvailability(testExp.slug);

    assert.ok(typeof avail.isOpenNow === "boolean", "isOpenNow must be boolean");
    assert.ok(typeof avail.currentIstTime === "string", "currentIstTime must be string (HH:mm)");
    assert.match(avail.currentIstTime, /^\d{2}:\d{2}$/, "currentIstTime must format as HH:mm");
    assert.ok(avail.directDialPhone, "directDialPhone must be present");
    assert.ok(avail.whatsappCallUrl.startsWith("https://wa.me/"), "whatsappCallUrl must be valid wa.me link");
    assert.ok(Array.isArray(avail.nextAvailableSlots) && avail.nextAvailableSlots.length > 0, "nextAvailableSlots must have slots");
    assert.equal(avail.callbackSlaMinutes, 5);
  });

  test("5. Callback Request Creation with 5-minute SLA & Agent Management", () => {
    // Visitor requests instant callback
    const reqRes = inappCallService.requestCall(testExp.slug, {
      sessionToken: testSession.sessionToken,
      visitorPhone: "919876543210",
      visitorName: "Rohan Sharma",
      callType: "INSTANT_CALLBACK",
      topic: "Dates & Availability confirmation"
    });

    assert.equal(reqRes.success, true);
    assert.equal(reqRes.data.status, "QUEUED");
    assert.equal(reqRes.data.call_type, "INSTANT_CALLBACK");
    assert.ok(reqRes.data.sla_deadline_at, "Instant callback must calculate sla_deadline_at");

    // Agent lists calls filtered by phone
    const calls = inappCallService.listCalls(tenantId, {
      phone: "919876543210",
      status: "QUEUED"
    });
    assert.ok(calls.length > 0, "Agent should find queued call by visitor phone");
    const callItem = calls.find(c => c.id === reqRes.data.id);
    assert.ok(callItem, "Call item must match ID");
    assert.equal(callItem.topic, "Dates & Availability confirmation");

    // Agent updates call status to CALLED
    const updateRes = inappCallService.updateCallStatus(tenantId, reqRes.data.id, {
      status: "CALLED",
      callNotes: "Called guest, confirmed dates for Deluxe suite.",
      userId: "agent_anita"
    });

    assert.equal(updateRes.success, true);
    assert.equal(updateRes.data.status, "CALLED");
    assert.equal(updateRes.data.call_notes, "Called guest, confirmed dates for Deluxe suite.");
  });

  test("6. Real-time Visitor SSE Stream Manager & Keep-Alive", () => {
    const receivedMessages = [];
    const eventHandlers = {};
    const mockRes = {
      writableEnded: false,
      destroyed: false,
      write(chunk) {
        receivedMessages.push(chunk);
      },
      on(event, handler) {
        eventHandlers[event] = handler;
      }
    };

    const token = "mock_session_stream_test_123";
    inappSseManager.addVisitorClient(token, mockRes);

    // Check handshake message
    assert.ok(receivedMessages.length > 0, "Initial handshake ping should be sent");
    assert.ok(receivedMessages[0].includes("In-App SSE Connected"));

    // Push targeted event to visitor
    inappSseManager.sendToVisitor(token, "negotiation_updated", {
      status: "AGENT_APPROVED",
      approvedFinalPrice: 4500
    });

    const lastMsg = receivedMessages[receivedMessages.length - 1];
    assert.ok(lastMsg.includes("negotiation_updated"));
    assert.ok(lastMsg.includes("AGENT_APPROVED"));
    assert.ok(lastMsg.includes("4500"));

    // Push staff broadcast
    assert.doesNotThrow(() => {
      inappSseManager.notifyStaff("inapp:negotiation", { negotiationId: 101, status: "PENDING_AGENT" });
    });

    // Cleanup mock client connection
    if (eventHandlers["close"]) eventHandlers["close"]();
  });
});
