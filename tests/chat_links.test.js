const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");

describe("SARVYA Chat Links & In-App Customer Messaging Module", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;
  let regularUser;
  let regularToken;

  const createdLinkIds = [];
  const testPhone = "919307382030";
  const customerPhone = "919876543210";

  before(() => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const adminId = `admin_links_test_${Date.now()}`;
    const regId = `user_links_test_${Date.now()}`;
    const hash = bcrypt.hashSync("Pass1234!", 8);

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Links Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_links_${Date.now()}@test.local`, testPhone, hash);
    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);

    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Regular Staff', ?, '91988887777', ?, 'USER', 'ACTIVE', 1)
    `).run(regId, `staff_links_${Date.now()}@test.local`, hash);
    regularUser = db.prepare("SELECT * FROM users WHERE id = ?").get(regId);

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    regularToken = jwt.sign(
      { id: regularUser.id, email: regularUser.email, role: regularUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) {
      server.close();
    }
    // Cleanup created links
    for (const id of createdLinkIds) {
      try {
        db.prepare("DELETE FROM chat_links WHERE id = ?").run(id);
      } catch (e) {}
    }
    try {
      const c = db.prepare("SELECT id FROM contacts WHERE phone_e164 = ?").get(customerPhone);
      if (c) {
        db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM contacts WHERE id = ?").run(c.id);
      }
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(customerPhone);
      if (adminUser) db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
      if (regularUser) db.prepare("DELETE FROM users WHERE id = ?").run(regularUser.id);
    } catch (e) {}
  });

  test("1. Seeded default chat links exist and listLinks returns summary stats", async () => {
    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2, "Should include default seeded links");

    const defaultSlugs = body.data.map(l => l.slug);
    assert.ok(defaultSlugs.includes("resort-inquiry"), "Should include resort-inquiry");
    assert.ok(defaultSlugs.includes("villa-booking"), "Should include villa-booking");

    assert.ok(body.summary, "Should return summary metrics");
    assert.ok(typeof body.summary.total === "number");
    assert.ok(typeof body.summary.active === "number");
  });

  test("2. Creates a custom chat link with dynamic variables and automated auto-reply", async () => {
    const payload = {
      title: "Spa & Wellness Consultation",
      slug: `spa-wellness-${Date.now()}`,
      category: "MARKETING",
      default_message: "Hi Konkan Resort! I'd like to book a Spa session for {{date}} for {{guests}} guests.",
      welcome_title: "Welcome to Konkan Wellness Spa",
      welcome_description: "Connect with our wellness concierge to reserve your Ayurvedic treatments.",
      auto_reply_enabled: true,
      auto_reply_message: "Thank you for reaching out! A spa specialist will confirm your slots in a few minutes.",
      phone_number: testPhone
    };

    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    createdLinkIds.push(body.data.id);

    assert.equal(body.data.title, payload.title);
    assert.equal(body.data.slug, payload.slug);
    assert.ok(body.data.shortUrl.includes(payload.slug));
    assert.ok(body.data.waMeUrl.includes("wa.me"));
    assert.ok(body.data.embedHtml.includes("<a href=") || body.data.embedHtml.includes("<iframe"));
  });

  test("3. Auto-generates clean unique slug when omitted", async () => {
    const payload = {
      title: "Monsoon Special Offer 2026",
      default_message: "Hi, I am interested in the Monsoon 30% discount package."
    };

    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.slug.startsWith("monsoon-special-offer-2026"));
    createdLinkIds.push(body.data.id);
  });

  test("4. Bulk generates chat links for tables or villa rooms", async () => {
    const bulkPayload = {
      category: "SERVICE",
      title_template: "Dining Table {{item}} QR",
      default_message_template: "Hi Room Service, order from Dining Table {{item}}.",
      items: ["T-01", "T-02", "T-03"],
      auto_reply_enabled: true,
      auto_reply_message: "Welcome to Konkan Beach Dining! Our server is attending your table."
    };

    const res = await fetch(`${baseUrl}/api/v1/chat-links/bulk-generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(bulkPayload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 3);
    assert.equal(body.links.length, 3);

    for (const l of body.links) {
      createdLinkIds.push(l.id);
      assert.ok(l.title.includes("Dining Table T-0"));
      assert.ok(l.shortUrl);
      assert.ok(l.waMeUrl);
    }
  });

  test("5. Generates valid SVG QR code with zero external dependencies", async () => {
    const sampleId = createdLinkIds[0];
    const res = await fetch(`${baseUrl}/api/v1/chat-links/${sampleId}/qr`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("image/svg+xml"));
    const svg = await res.text();
    assert.ok(svg.includes("<svg"), "Must return valid SVG root");
    assert.ok(svg.includes("<rect"), "Must render QR matrix rects");
  });

  test("6. Public endpoint retrieves link metadata, increments clicks, and interpolates dynamic params", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[0]);
    const initialClicks = sampleLink.clicks_count || 0;

    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}?date=Tomorrow&guests=4`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.title, sampleLink.title);
    assert.equal(body.data.default_message, "Hi Konkan Resort! I'd like to book a Spa session for Tomorrow for 4 guests.");
    assert.ok(body.data.waMeUrl.includes("Tomorrow"));
    assert.ok(body.data.waMeUrl.includes("4%20guests"));

    const updated = db.prepare("SELECT clicks_count FROM chat_links WHERE id = ?").get(sampleLink.id);
    assert.equal(updated.clicks_count, initialClicks + 1, "Click count must increment by 1");
  });

  test("7. Public start-chat creates customer conversation, records attribution, and triggers auto-reply", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[0]);
    const initialConvos = sampleLink.conversations_count || 0;

    const payload = {
      phone: customerPhone,
      customer_name: "Aarav Sharma",
      message: "Hi Konkan Resort! I'd like to book a Spa session for Tomorrow for 4 guests."
    };

    const res = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.inboundId);
    assert.equal(body.data.phone, customerPhone);
    assert.ok(body.data.autoReplied, "Auto reply should be enabled");
    assert.ok(body.data.autoReplyMessage.includes("spa specialist"));

    // Verify record in customer_replies with link attribution
    const replyRecord = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(body.data.inboundId);
    assert.ok(replyRecord, "Inbound reply record must exist");
    assert.equal(replyRecord.source, "CHAT_LINK");
    assert.equal(replyRecord.link_id, sampleLink.id);
    assert.equal(replyRecord.customer_name, "Aarav Sharma");

    // Verify conversations_count incremented
    const updated = db.prepare("SELECT conversations_count FROM chat_links WHERE id = ?").get(sampleLink.id);
    assert.equal(updated.conversations_count, initialConvos + 1);

    // Verify Shared Inbox API carries link_id and link_title
    const inboxRes = await fetch(`${baseUrl}/api/inbox/replies?search=${customerPhone}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(inboxRes.status, 200);
    const inboxData = await inboxRes.json();
    const customerMsg = inboxData.replies.find(r => r.from_phone === customerPhone);
    assert.ok(customerMsg, "Customer message should be in Shared Inbox");
    assert.equal(customerMsg.link_id, sampleLink.id);
    assert.equal(customerMsg.source, "CHAT_LINK");
    assert.equal(customerMsg.link_title, sampleLink.title);

    // Verify Contact created in CRM
    const contact = db.prepare("SELECT * FROM contacts WHERE phone_e164 = ?").get(customerPhone);
    assert.ok(contact, "Contact should be created in CRM");
    assert.equal(contact.name, "Aarav Sharma");

    // Verify Booking Enquiry created in CRM
    const enquiry = db.prepare("SELECT * FROM booking_enquiries WHERE contact_id = ?").get(contact.id);
    assert.ok(enquiry, "Booking enquiry lead should be created directly in CRM");
    assert.equal(enquiry.guest_name, "Aarav Sharma");
    assert.equal(enquiry.status, "NEW");
  });

  test("8. Ongoing public web chat message sending and thread retrieval", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[0]);

    // Send a customer follow-up message
    const sendRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: customerPhone,
        message: "Also do you have couple massage rooms available?"
      })
    });
    assert.equal(sendRes.status, 201);
    const sendBody = await sendRes.json();
    assert.equal(sendBody.success, true);

    // Fetch conversation thread
    const listRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/messages?phone=${customerPhone}`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.success, true);
    assert.ok(Array.isArray(listBody.data));
    assert.ok(listBody.data.length >= 2, "Thread should contain initial + follow-up messages");
  });

  test("9. Status toggle pauses link and blocks public start-chat", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[0]);

    // Toggle to PAUSED
    const toggleRes = await fetch(`${baseUrl}/api/v1/chat-links/${sampleLink.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: "PAUSED" })
    });
    assert.equal(toggleRes.status, 200);
    const toggleBody = await toggleRes.json();
    assert.equal(toggleBody.data.status, "PAUSED");

    // Public start-chat should now be rejected
    const blockedRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: customerPhone,
        message: "Testing paused link"
      })
    });
    assert.ok([400, 403].includes(blockedRes.status), "Paused link should return 400 or 403");
    const blockedBody = await blockedRes.json();
    assert.equal(blockedBody.success, false);
    assert.ok(blockedBody.message.includes("inactive") || blockedBody.message.includes("paused"));
  });

  test("10. Short redirect route /c/:slug?redirect=whatsapp performs 302 redirect", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[1]);

    const res = await fetch(`${baseUrl}/c/${sampleLink.slug}?redirect=whatsapp`, {
      redirect: "manual"
    });
    assert.equal(res.status, 302);
    const location = res.headers.get("location");
    assert.ok(location.startsWith("https://wa.me/"), "Should 302 redirect to wa.me");
  });

  test("11. Stores guest contact number, recognizes returning number, and continues chat from past conversation", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[1]);
    const guestPhone = "919988776655";

    // Clean up any test artifacts for this number
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(guestPhone);
    const existingC = db.prepare("SELECT id FROM contacts WHERE phone_e164 = ?").get(guestPhone);
    if (existingC) {
      db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(existingC.id);
      db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(existingC.id);
      db.prepare("DELETE FROM contacts WHERE id = ?").run(existingC.id);
    }

    // Step A: First contact (New number)
    const firstRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Rohan Deshmukh",
        customerPhone: guestPhone,
        message: "Hello! I am inquiring about beachfront rooms for next weekend."
      })
    });

    assert.equal(firstRes.status, 201);
    const firstBody = await firstRes.json();
    assert.equal(firstBody.success, true);
    assert.equal(firstBody.data.isNewGuest, true, "First encounter must be flagged as new guest");
    assert.equal(firstBody.data.isExistingGuest, false);

    // Verify contact stored in contacts table
    const storedContact = db.prepare("SELECT * FROM contacts WHERE phone_e164 = ?").get(guestPhone);
    assert.ok(storedContact, "Guest contact number must be stored in database");
    assert.equal(storedContact.name, "Rohan Deshmukh");

    // Verify generated chat in conversation inbox
    const inboxRes1 = await fetch(`${baseUrl}/api/inbox/replies?search=${guestPhone}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(inboxRes1.status, 200);
    const inboxData1 = await inboxRes1.json();
    const guestThread1 = inboxData1.replies.filter(r => r.from_phone === guestPhone);
    assert.ok(guestThread1.length >= 1, "Generated chat must appear in conversation section");

    // Step B: Returning contact (Number already in database)
    const secondRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Rohan Deshmukh",
        customerPhone: guestPhone,
        message: "Can you also tell me what is the check-in time?"
      })
    });

    assert.equal(secondRes.status, 201);
    const secondBody = await secondRes.json();
    assert.equal(secondBody.success, true);
    assert.equal(secondBody.data.isExistingGuest, true, "Returning number must be recognized as existing guest");
    assert.equal(secondBody.data.isNewGuest, false);
    assert.ok(secondBody.data.pastMessagesCount >= 1, "Must detect past conversation messages");

    // Verify chat continues with past conversation in messages list
    assert.ok(Array.isArray(secondBody.data.messages));
    assert.ok(secondBody.data.messages.length >= 2, "Returned messages must contain past messages + new inquiry");

    const msgBodies = secondBody.data.messages.map(m => m.message_body || m.reply_text);
    assert.ok(msgBodies.some(t => t.includes("beachfront rooms")), "Past message must be preserved");
    assert.ok(msgBodies.some(t => t.includes("check-in time")), "New message must be appended to thread");

    // Verify only ONE contact record exists (no duplicate contact created)
    const contactCount = db.prepare("SELECT COUNT(*) as count FROM contacts WHERE phone_e164 = ?").get(guestPhone).count;
    assert.equal(contactCount, 1, "Should not create duplicate contact records for the same number");

    // Verify full thread in conversation inbox
    const inboxRes2 = await fetch(`${baseUrl}/api/inbox/replies?search=${guestPhone}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(inboxRes2.status, 200);
    const inboxData2 = await inboxRes2.json();
    const guestThread2 = inboxData2.replies.filter(r => r.from_phone === guestPhone);
    assert.ok(guestThread2.length >= 2, "Conversation section must show all continuous messages");

    // Cleanup test number
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(guestPhone);
    db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(storedContact.id);
    db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(storedContact.id);
    db.prepare("DELETE FROM contacts WHERE id = ?").run(storedContact.id);
  });

  test("12. End-to-end 2-way conversation sync: Agent inbox reply delivers to customer web chat", async () => {
    const sampleLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(createdLinkIds[1]);
    const webGuestPhone = "919000888999";

    // 1. Guest starts in-app web chat
    const startRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/start-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Web Visitor Priya",
        customerPhone: webGuestPhone,
        message: "Hi Concierge! What time is the pool open until tonight?"
      })
    });
    assert.equal(startRes.status, 201);

    // 2. Business Agent in Shared Inbox replies to this web guest
    const replyRes = await fetch(`${baseUrl}/api/inbox/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: webGuestPhone,
        message: "Hello Priya! Our oceanfront infinity pool is open until 10:00 PM tonight."
      })
    });
    assert.equal(replyRes.status, 200);
    const replyBody = await replyRes.json();
    assert.equal(replyBody.success, true);
    assert.equal(replyBody.channel, "WEB");

    // 3. Web customer fetches message thread (simulating 2.5s live polling in PublicChatLandingPage)
    const threadRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${sampleLink.slug}/messages?phone=${webGuestPhone}`);
    assert.equal(threadRes.status, 200);
    const threadData = await threadRes.json();
    assert.ok(Array.isArray(threadData.messages));

    const texts = threadData.messages.map(m => m.message_body || m.reply_text);
    assert.ok(texts.some(t => t.includes("pool open until tonight")), "Customer's question must be in thread");
    assert.ok(texts.some(t => t.includes("open until 10:00 PM tonight")), "Agent's reply must be delivered to web chat");

    // Cleanup
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(webGuestPhone);
    const c = db.prepare("SELECT id FROM contacts WHERE phone_e164 = ?").get(webGuestPhone);
    if (c) {
      db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(c.id);
      db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(c.id);
      db.prepare("DELETE FROM contacts WHERE id = ?").run(c.id);
    }
  });

  test("13. Top-level aliases /api/chat-links and /api/public/chat-links function identically without /v1", async () => {
    // Top-level authenticated list
    const res = await fetch(`${baseUrl}/api/chat-links`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.links));
    assert.ok(data.links.length > 0);

    // Top-level public link resolution
    const targetSlug = data.links[0].slug;
    const pubRes = await fetch(`${baseUrl}/api/public/chat-links/${targetSlug}`);
    assert.equal(pubRes.status, 200);
    const pubData = await pubRes.json();
    assert.equal(pubData.success, true);
    assert.equal(pubData.link.slug, targetSlug);
  });

  test("14. Account isolation and user ownership validation on chat links", async () => {
    // 1. Admin creates an admin link
    const adminLinkRes = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: "Admin Exclusive Link", slug: `admin-only-${Date.now()}` })
    });
    assert.equal(adminLinkRes.status, 201);
    const adminLinkData = await adminLinkRes.json();
    const adminLinkId = adminLinkData.link.id;
    createdLinkIds.push(adminLinkId);

    // 2. Regular user creates a private staff link
    const regLinkRes = await fetch(`${baseUrl}/api/v1/chat-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${regularToken}` },
      body: JSON.stringify({ title: "Staff Private Link", slug: `staff-only-${Date.now()}` })
    });
    assert.equal(regLinkRes.status, 201);
    const regLinkData = await regLinkRes.json();
    const regLinkId = regLinkData.link.id;
    createdLinkIds.push(regLinkId);

    assert.equal(regLinkData.link.user_id, regularUser.id, "Link must be mapped to regular user's account");

    // 3. Regular user lists chat links: MUST only see their own link, not admin's link
    const regListRes = await fetch(`${baseUrl}/api/v1/chat-links`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    assert.equal(regListRes.status, 200);
    const regListData = await regListRes.json();
    const regListSlugs = regListData.links.map(l => l.slug);
    assert.ok(regListSlugs.includes(regLinkData.link.slug), "Regular user must see their own link");
    assert.ok(!regListSlugs.includes(adminLinkData.link.slug), "Regular user must NOT see admin's or other accounts' links");

    // 4. Regular user attempts to access Admin's chat link: MUST return 403 Forbidden
    const unauthGetRes = await fetch(`${baseUrl}/api/v1/chat-links/${adminLinkId}`, {
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    assert.equal(unauthGetRes.status, 403, "Regular user must be forbidden from viewing another account's chat link");

    // 5. Regular user attempts to modify Admin's chat link: MUST return 403 Forbidden
    const unauthPutRes = await fetch(`${baseUrl}/api/v1/chat-links/${adminLinkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${regularToken}` },
      body: JSON.stringify({ title: "Hacked Title" })
    });
    assert.equal(unauthPutRes.status, 403, "Regular user must be forbidden from updating another account's chat link");

    // 6. Regular user attempts to toggle Admin's chat link status: MUST return 403 Forbidden
    const unauthPatchRes = await fetch(`${baseUrl}/api/v1/chat-links/${adminLinkId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    assert.equal(unauthPatchRes.status, 403, "Regular user must be forbidden from toggling another account's link status");

    // 7. Regular user attempts to delete Admin's chat link: MUST return 403 Forbidden
    const unauthDelRes = await fetch(`${baseUrl}/api/v1/chat-links/${adminLinkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    assert.equal(unauthDelRes.status, 403, "Regular user must be forbidden from deleting another account's chat link");

    // 8. Regular user successfully updates their own link
    const ownPutRes = await fetch(`${baseUrl}/api/v1/chat-links/${regLinkId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${regularToken}` },
      body: JSON.stringify({ title: "Updated Staff Private Link" })
    });
    assert.equal(ownPutRes.status, 200, "Regular user should be allowed to update their own link");
    const ownPutData = await ownPutRes.json();
    assert.equal(ownPutData.link.title, "Updated Staff Private Link");

    // 9. Admin lists chat links: Admin sees all links across all accounts
    const adminListRes = await fetch(`${baseUrl}/api/v1/chat-links`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminListRes.status, 200);
    const adminListData = await adminListRes.json();
    const adminSlugs = adminListData.links.map(l => l.slug);
    assert.ok(adminSlugs.includes(adminLinkData.link.slug), "Admin sees admin link");
    assert.ok(adminSlugs.includes(regLinkData.link.slug), "Admin sees regular user's link");

    // 10. Regular user successfully deletes their own link
    const ownDelRes = await fetch(`${baseUrl}/api/v1/chat-links/${regLinkId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${regularToken}` }
    });
    assert.equal(ownDelRes.status, 200, "Regular user should be allowed to delete their own link");
  });

  test("15. Link URLs are clean, non-dummy, and support both direct HTML SPA rendering and WhatsApp 302 redirects", async () => {
    // 1. Fetch links from authenticated API
    const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.links.length > 0);

    for (const link of body.links) {
      assert.ok(!link.shortUrl.includes("konkantripbeachresort.com"), `shortUrl must not contain broken dummy domain: ${link.shortUrl}`);
      assert.ok(link.shortUrl.startsWith("http://") || link.shortUrl.startsWith("https://"), `shortUrl must be valid URL: ${link.shortUrl}`);
      assert.ok(link.urls.embedHtml.includes(link.shortUrl), "embedHtml must embed the valid shortUrl");
      assert.ok(!link.urls.embedHtml.includes("konkantripbeachresort.com"), "embedHtml must not contain dummy domain");
      assert.ok(link.waMeUrl.startsWith("https://wa.me/"), `waMeUrl must be valid wa.me link: ${link.waMeUrl}`);
    }

    const testSlug = body.links[0].slug;

    // 2. Direct browser navigation to /c/:slug serves HTML SPA fallback
    const htmlRes = await fetch(`${baseUrl}/c/${testSlug}`);
    assert.equal(htmlRes.status, 200);
    const contentType = htmlRes.headers.get("content-type") || "";
    assert.ok(contentType.includes("text/html"), "Direct navigation to /c/:slug must serve SPA HTML");

    // 3. /c/:slug?redirect=whatsapp triggers direct 302 redirect
    const redirRes = await fetch(`${baseUrl}/c/${testSlug}?redirect=whatsapp`, { redirect: "manual" });
    assert.equal(redirRes.status, 302);
    assert.ok(redirRes.headers.get("location").startsWith("https://wa.me/"));

    // 4. /chat/:slug?redirect=whatsapp alias triggers direct 302 redirect
    const redirAliasRes = await fetch(`${baseUrl}/chat/${testSlug}?redirect=whatsapp`, { redirect: "manual" });
    assert.equal(redirAliasRes.status, 302);
    assert.ok(redirAliasRes.headers.get("location").startsWith("https://wa.me/"));
  });

  test("16. Customer web chat message misattribution prevention, intelligent hospitality response, and template interpolation cleanup", async () => {
    const { interpolateMessage } = require("../src/services/chatLinkService");

    // 1. Verify template interpolation removes empty tokens without leaving "for for guests."
    const template = "Hi KonkanTrip Beach Resort, I want to book a villa for {{date}} for {{guests}} guests.";
    const cleanInterpolated = interpolateMessage(template, {});
    assert.equal(cleanInterpolated, "Hi KonkanTrip Beach Resort, I want to book a villa.");
    assert.ok(!cleanInterpolated.includes("for for"), "Must not have duplicate 'for for'");
    assert.ok(!cleanInterpolated.includes("{{"), "Must not have unresolved template placeholders");

    // 2. Fetch or create a HOSPITALITY chat link
    let hospLink = db.prepare("SELECT * FROM chat_links WHERE category = 'HOSPITALITY' LIMIT 1").get();
    if (!hospLink) {
      const res = await fetch(`${baseUrl}/api/v1/chat-links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          title: "Hospitality Test Link",
          category: "HOSPITALITY",
          auto_reply_enabled: true,
          auto_reply_message: "Welcome to our resort!"
        })
      });
      const data = await res.json();
      hospLink = data.data;
      createdLinkIds.push(hospLink.id);
    }

    const testGuestPhone = "919021499999";

    // 3. Customer sends message asking about villa rates
    const sendRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${hospLink.slug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testGuestPhone,
        message: "Hi! Could you please share the available villa types, amenities, and current room rates?"
      })
    });

    assert.equal(sendRes.status, 201);
    const sendData = await sendRes.json();
    assert.equal(sendData.success, true);
    assert.ok(sendData.message);

    // Verify customer's message record has message_type = 'text' and user_id is NOT 'bot'
    assert.equal(sendData.message.message_type, "text");
    assert.notEqual(sendData.message.user_id, "bot", "Customer message user_id must NOT be 'bot'");

    // Verify intelligent auto-reply is generated with room rates and villa types
    assert.ok(sendData.autoReply, "Automated intelligent reply must be generated for hospitality enquiry");
    assert.equal(sendData.autoReply.message_type, "outbound");
    assert.equal(sendData.autoReply.user_id, "bot");
    assert.ok(
      sendData.autoReply.message_body.includes("Deluxe") ||
      sendData.autoReply.message_body.includes("Room Categories") ||
      sendData.autoReply.message_body.includes("Base Rate"),
      "Auto reply must include room category / rate details"
    );

    // 4. Customer asks about dining options
    const diningRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${hospLink.slug}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: testGuestPhone,
        message: "Hello! Can you share details about the resort dining options and breakfast menu?"
      })
    });
    assert.equal(diningRes.status, 201);
    const diningData = await diningRes.json();
    assert.ok(diningData.autoReply);
    assert.ok(
      diningData.autoReply.message_body.includes("Dining") ||
      diningData.autoReply.message_body.includes("Facilities") ||
      diningData.autoReply.message_body.includes("Breeze"),
      "Auto reply must include dining / facilities details"
    );

    // Cleanup test records
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testGuestPhone);
  });
});
