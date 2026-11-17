const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");
const hospitalityFlowEngine = require("../src/services/hospitalityFlowEngine");

describe("SARVYA In-Chat Meta-Flow Card & Interactive Data Collection", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;

  const testPhone = "919307382040";
  const guestPhone = "919876543277";
  let createdLinkId;
  let testSlug;

  before(() => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const adminId = `admin_inchat_flow_${Date.now()}`;
    const hash = bcrypt.hashSync("Pass1234!", 8);

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Flow Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_inchat_${Date.now()}@test.local`, testPhone, hash);
    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) server.close();
    try {
      if (createdLinkId) {
        db.prepare("DELETE FROM chat_links WHERE id = ?").run(createdLinkId);
      }
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone = ?").run(guestPhone);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(guestPhone);
      db.prepare("DELETE FROM booking_enquiries WHERE phone_e164 = ?").run(guestPhone);
      if (adminUser) db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
    } catch (e) {}
  });

  test("1. generateInChatFlowPayload returns interactive Meta Flow schema with default & custom fields", () => {
    const mockLink = {
      id: 999,
      property_id: 1,
      custom_fields: [
        { id: "dietary_preference", label: "Dietary Preference", type: "select", options: ["Veg", "Non-Veg"], required: false, enabled: true },
        { id: "arrival_time", label: "Estimated Arrival Time", type: "text", required: false, enabled: true }
      ]
    };
    const mockRooms = [
      { id: 1, name: "Deluxe Sea View Room", base_rate: 4500 },
      { id: 2, name: "Luxury Coconut Cottage", base_rate: 6500 }
    ];

    const payload = hospitalityFlowEngine.generateInChatFlowPayload(1, mockLink, 1, mockRooms);

    assert.equal(payload.interactive_type, "in_chat_flow");
    assert.equal(payload.flow_id, "flow_hospitality_stay_intake");
    assert.ok(Array.isArray(payload.fields));

    const checkIn = payload.fields.find(f => f.id === "check_in");
    const checkOut = payload.fields.find(f => f.id === "check_out");
    const guests = payload.fields.find(f => f.id === "total_guests");
    const roomPref = payload.fields.find(f => f.id === "room_preference");
    const dietary = payload.fields.find(f => f.id === "dietary_preference");
    const arrival = payload.fields.find(f => f.id === "arrival_time");

    assert.ok(checkIn, "check_in field exists");
    assert.ok(checkOut, "check_out field exists");
    assert.ok(guests, "total_guests field exists");
    assert.ok(roomPref, "room_preference field exists");
    assert.ok(roomPref.options.includes("Deluxe Sea View Room"));
    assert.ok(dietary, "custom dietary_preference field included");
    assert.ok(arrival, "custom arrival_time field included");
  });

  test("2. Admin creates a hospitality chat link with custom fields", async () => {
    testSlug = `inchat-flow-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: "KonkanTrip Beach Concierge",
        slug: testSlug,
        category: "HOSPITALITY",
        phoneNumber: testPhone,
        defaultMessage: "Hi KonkanTrip Beach Resort, I want to book a villa for guests.",
        welcomeTitle: "KonkanTrip Beach Resort & Spa",
        welcomeDescription: "Instant Villa Concierge Desk",
        autoReplyEnabled: true,
        custom_fields: [
          { id: "meal_plan", label: "Meal Plan", type: "select", options: ["EP (Room Only)", "CP (Breakfast)", "MAP (Breakfast + Dinner)"], required: false, enabled: true },
          { id: "special_note", label: "Special Requests", type: "text", required: false, enabled: true }
        ]
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    createdLinkId = body.data.id;
  });

  test("3. Guest starts conversation without pre-filled dates: Concierge replies with in_chat_flow card", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Rohan Varma",
        customerPhone: guestPhone,
        message: "Hi KonkanTrip Beach Resort, I want to book a villa for guests.",
        channel: "WEB"
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);

    const autoReply = body.data.autoReply;
    assert.ok(autoReply, "Concierge auto reply returned");
    assert.ok(autoReply.raw_payload, "raw_payload present");

    const payload = typeof autoReply.raw_payload === "string" ? JSON.parse(autoReply.raw_payload) : autoReply.raw_payload;
    assert.equal(payload.interactive_type, "in_chat_flow");
    assert.equal(payload.flow_id, "flow_hospitality_stay_intake");
    assert.ok(payload.fields.some(f => f.id === "check_in"));
    assert.ok(payload.fields.some(f => f.id === "check_out"));
    assert.ok(payload.fields.some(f => f.id === "total_guests"));
    assert.ok(payload.fields.some(f => f.id === "meal_plan"));

    // Session should be placed in AWAITING_INTAKE
    const session = hospitalityFlowEngine.getSession(hospitalityFlowEngine.getSessionKey("WEB", guestPhone, 1));
    assert.ok(session);
    assert.equal(session.current_step, "AWAITING_INTAKE");
  });

  test("4. Guest submits In-Chat Flow Card with dates & party size: Concierge returns live room availability & quotes", async () => {
    const cin = "2026-12-25";
    const cout = "2026-12-27";

    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: `📅 Check Availability: ${cin} to ${cout} (2 Guests) · Deluxe Sea View Room`,
        flowSubmission: {
          intake_data: {
            check_in: cin,
            check_out: cout,
            total_guests: 2,
            room_preference: "Deluxe Sea View Room",
            meal_plan: "CP (Breakfast)",
            special_note: "Quiet room facing garden"
          }
        }
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);

    const autoReply = body.autoReply;
    assert.ok(autoReply, "Auto reply returned for flow submission");
    assert.ok(autoReply.message_body.includes("Real-Time Availability & Rates"));
    assert.ok(autoReply.message_body.includes(cin));
    assert.ok(autoReply.message_body.includes(cout));

    const payload = typeof autoReply.raw_payload === "string" ? JSON.parse(autoReply.raw_payload) : autoReply.raw_payload;
    assert.equal(payload.interactive_type, "flow_step");
    assert.equal(payload.step, "ROOM_SELECTION");
    assert.ok(Array.isArray(payload.options));
    assert.ok(payload.options.length > 0);

    // Verify session updated with criteria and preferred room
    const session = hospitalityFlowEngine.getSession(hospitalityFlowEngine.getSessionKey("WEB", guestPhone, 1));
    assert.ok(session);
    assert.equal(session.sessionData.check_in, cin);
    assert.equal(session.sessionData.check_out, cout);
    assert.equal(session.sessionData.total_guests, 2);
    assert.equal(session.sessionData.custom_fields.meal_plan, "CP (Breakfast)");
  });

  test("5. Guest confirms room selection: Enquiry & official Quotation registered in CRM", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: "CONFIRM"
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);

    const autoReply = body.autoReply;
    assert.ok(autoReply.message_body.includes("Reservation Inquiry Confirmed"));
    assert.ok(autoReply.message_body.includes("Rohan Varma"));

    const payload = typeof autoReply.raw_payload === "string" ? JSON.parse(autoReply.raw_payload) : autoReply.raw_payload;
    assert.equal(payload.interactive_type, "enquiry_confirmed");
    assert.ok(payload.enquiry_id);

    // Verify CRM booking enquiry record in DB
    const enq = db.prepare("SELECT * FROM booking_enquiries WHERE id = ?").get(payload.enquiry_id);
    assert.ok(enq);
    assert.equal(enq.check_in, "2026-12-25");
    assert.equal(enq.check_out, "2026-12-27");

    // Verify quotation was generated
    const quotes = db.prepare("SELECT * FROM quotes WHERE enquiry_id = ?").all(payload.enquiry_id);
    assert.ok(quotes.length > 0);
  });

  test("6. Guest says 'change dates': Concierge returns a new in_chat_flow card", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: "Can I please change dates for this booking?"
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);

    const autoReply = body.autoReply;
    const payload = typeof autoReply.raw_payload === "string" ? JSON.parse(autoReply.raw_payload) : autoReply.raw_payload;
    assert.equal(payload.interactive_type, "in_chat_flow");
    assert.ok(payload.fields.some(f => f.id === "check_in"));
  });

  test("7. Real-Time Inventory Check: Sold-out / blocked dates reflect as Sold Out in chat options & text", async () => {
    // Dates 2026-11-16 to 2026-11-18 have active blocks in hospitality_inventory_blocks
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "919999888811",
        message: "Check availability for 2026-11-16 to 2026-11-18",
        flowSubmission: {
          intake_data: {
            check_in: "2026-11-16",
            check_out: "2026-11-18",
            total_guests: 2
          }
        }
      })
    });

    const body = await res.json();
    assert.equal(res.status, 201);
    assert.equal(body.success, true);

    const autoReply = body.autoReply;
    assert.ok(autoReply.message_body.includes("Sold Out"), "Message mentions sold out status");

    const payload = typeof autoReply.raw_payload === "string" ? JSON.parse(autoReply.raw_payload) : autoReply.raw_payload;
    assert.equal(payload.interactive_type, "flow_step");
    assert.equal(payload.step, "ROOM_SELECTION");

    // All options in this range should have available: false because they are blocked in DB
    const deluxeOpt = payload.options.find(o => o.name === "Deluxe Sea View Room");
    assert.ok(deluxeOpt);
    assert.equal(deluxeOpt.available, false);
    assert.equal(deluxeOpt.available_count, 0);

    // If customer tries to book a sold-out room on these dates, bot politely declines and asks for other dates
    const bookRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: "919999888811",
        message: "I want to book Deluxe Sea View Room"
      })
    });

    const bookBody = await bookRes.json();
    assert.equal(bookRes.status, 201);
    assert.ok(bookBody.autoReply.message_body.includes("Sold Out") || bookBody.autoReply.message_body.includes("currently sold out"));
  });
});
