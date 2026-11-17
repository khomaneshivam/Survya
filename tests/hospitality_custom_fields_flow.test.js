const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");

describe("SARVYA Hospitality Customizable Intake Fields & Multi-Turn Conversational Flow", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;

  const testPhone = "919307382030";
  const guestPhone = "919876543299";
  let createdLinkId;
  let testSlug;

  before(() => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const adminId = `admin_flow_test_${Date.now()}`;
    const hash = bcrypt.hashSync("Pass1234!", 8);

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Flow Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_flow_${Date.now()}@test.local`, testPhone, hash);
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
      if (adminUser) db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
    } catch (e) {}
  });

  test("1. Admin creates a Hospitality chat link with custom intake fields", async () => {
    const customFields = [
      { id: "check_in", label: "Check-in Date", type: "date", required: true, enabled: true },
      { id: "check_out", label: "Check-out Date", type: "date", required: true, enabled: true },
      { id: "total_guests", label: "Total Guests", type: "number", min: 1, max: 15, defaultValue: 2, required: true, enabled: true },
      { id: "dietary_preference", label: "Dietary Preference", type: "select", options: ["Vegetarian", "Non-Vegetarian", "Jain"], required: false, enabled: true },
      { id: "flight_number", label: "Arrival Flight / Ferry", type: "text", required: false, enabled: true }
    ];

    testSlug = `resort-intake-test-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: "Konkan Villa Reservations Intake",
        slug: testSlug,
        category: "HOSPITALITY",
        phoneNumber: testPhone,
        defaultMessage: "Hi KonkanTrip Resort, I want to book a villa.",
        welcomeTitle: "KonkanTrip Beach Resort & Spa",
        welcomeDescription: "Direct Villa Booking & Concierge Desk",
        autoReplyEnabled: true,
        custom_fields: customFields
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.link);
    createdLinkId = body.link.id;

    assert.ok(Array.isArray(body.link.custom_fields));
    assert.equal(body.link.custom_fields.length, 5);
    assert.equal(body.link.custom_fields[0].id, "check_in");
    assert.equal(body.link.custom_fields[3].id, "dietary_preference");
  });

  test("2. Public chat link endpoint returns published custom intake fields for guest landing page", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.link);

    assert.ok(Array.isArray(body.link.custom_fields));
    assert.equal(body.link.custom_fields.length, 5);
    const dietaryField = body.link.custom_fields.find(f => f.id === "dietary_preference");
    assert.ok(dietaryField);
    assert.deepEqual(dietaryField.options, ["Vegetarian", "Non-Vegetarian", "Jain"]);
  });

  test("3. Admin updates custom fields by disabling a field and adding a new custom note", async () => {
    const updatedFields = [
      { id: "check_in", label: "Check-in Date", type: "date", required: true, enabled: true },
      { id: "check_out", label: "Check-out Date", type: "date", required: true, enabled: true },
      { id: "total_guests", label: "Total Guests", type: "number", min: 1, max: 15, defaultValue: 2, required: true, enabled: true },
      { id: "dietary_preference", label: "Dietary Preference", type: "select", options: ["Vegetarian", "Non-Vegetarian", "Jain"], required: false, enabled: false }, // Disabled
      { id: "special_occasion", label: "Special Occasion", type: "text", required: false, enabled: true } // New field
    ];

    const res = await fetch(`${baseUrl}/api/v1/chat-links/${createdLinkId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        custom_fields: updatedFields
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.link.custom_fields.length, 5);
    assert.equal(body.link.custom_fields.find(f => f.id === "dietary_preference").enabled, false);
    assert.ok(body.link.custom_fields.find(f => f.id === "special_occasion"));
  });

  test("4. Guest initiates chat with stay intake data -> receives availability and calculated room options", async () => {
    // Generate dates 40 days in the future (after active admin inventory blocks)
    const today = new Date();
    const cin = new Date(today);
    cin.setDate(today.getDate() + 40);
    const cout = new Date(today);
    cout.setDate(today.getDate() + 43); // 3 nights

    const y1 = cin.getFullYear();
    const m1 = String(cin.getMonth() + 1).padStart(2, "0");
    const d1 = String(cin.getDate()).padStart(2, "0");
    const checkInStr = `${y1}-${m1}-${d1}`;

    const y2 = cout.getFullYear();
    const m2 = String(cout.getMonth() + 1).padStart(2, "0");
    const d2 = String(cout.getDate()).padStart(2, "0");
    const checkOutStr = `${y2}-${m2}-${d2}`;

    const intakeData = {
      check_in: checkInStr,
      check_out: checkOutStr,
      total_guests: 2,
      special_occasion: "10th Wedding Anniversary"
    };

    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Vikram Malhotra",
        customerPhone: guestPhone,
        message: `Hi! I would like to book a villa from ${checkInStr} to ${checkOutStr} for 2 guests.`,
        intakeData,
        channel: "WEB"
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.autoReplied);
    assert.ok(body.data.autoReplyMessage);

    // Response should list available rooms with estimated totals for the 3 nights
    assert.ok(
      body.data.autoReplyMessage.includes("Available Villas") ||
      body.data.autoReplyMessage.includes("Deluxe Sea View Room") ||
      body.data.autoReplyMessage.includes("Room Categories")
    );
    assert.ok(body.data.autoReplyMessage.includes("3 night"));

    // Check that interactive room selector cards payload was delivered
    if (body.data.rawPayload) {
      assert.equal(body.data.rawPayload.interactive_type, "room_selector_cards");
      assert.ok(Array.isArray(body.data.rawPayload.rooms));
      assert.ok(body.data.rawPayload.rooms.length > 0);
    }
  });

  test("5. Guest selects room -> receives itemized price quotation with mandatory disclaimer", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: "I want to select the Deluxe Sea View Room option"
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.autoReply);

    const replyText = body.autoReply.message_body;
    assert.ok(replyText.includes("Estimated Price Quote") || replyText.includes("Quote"));
    assert.ok(replyText.includes("Deluxe Sea View Room"));
    assert.ok(replyText.includes("Estimated Grand Total") || replyText.includes("Estimated Total"));
    assert.ok(replyText.includes("Subject to Staff Confirmation") || replyText.includes("IMPORTANT NOTICE"));

    // Check structured quote payload
    if (body.autoReply.raw_payload) {
      const payload = typeof body.autoReply.raw_payload === "string" ? JSON.parse(body.autoReply.raw_payload) : body.autoReply.raw_payload;
      assert.ok(payload.interactive_type === "quote_summary" || payload.interactive_type === "quote_summary_card");
    }
  });

  test("6. Guest asks an amenity FAQ during conversation -> answered without losing stay context", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: "Do you have free high-speed wifi and swimming pool facilities?"
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.autoReply);

    const replyText = body.autoReply.message_body;
    assert.ok(replyText.includes("Swimming Pool") || replyText.includes("Wi-Fi") || replyText.includes("Facilities"));
  });

  test("7. Guest confirms quote -> system creates CRM Enquiry and Quotation record with booking reference", async () => {
    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${testSlug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: guestPhone,
        message: "Yes please confirm and submit this stay request to reservations"
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.autoReply);

    const replyText = body.autoReply.message_body;
    assert.ok(replyText.includes("Reservation Request Submitted") || replyText.includes("Enquiry Reference"));
    assert.ok(replyText.includes("ENQ-") || replyText.includes("Ref"));

    // Verify record exists in booking_enquiries in database
    const enq = db.prepare("SELECT * FROM booking_enquiries WHERE phone_e164 = ? ORDER BY id DESC LIMIT 1").get(guestPhone);
    assert.ok(enq, "Booking enquiry must be created in CRM database");
    assert.equal(enq.guest_name, "Vikram Malhotra");
    assert.equal(enq.status, "NEW");

    // Verify quotation record exists in quotes in database
    const quote = db.prepare("SELECT * FROM quotes WHERE enquiry_id = ? LIMIT 1").get(enq.id);
    assert.ok(quote, "Quotation record linked to enquiry must exist");
    assert.ok(quote.total > 0);
  });
});
