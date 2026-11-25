const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting, getSetting } = require("../src/config/database");
const config = require("../src/config/env");
const webhookService = require("../src/services/webhookService");

describe("Dynamic Bot Options & Programmable Concierge Rules Test Suite", { concurrency: 1 }, () => {
  let server;
  let baseUrl;
  let adminToken;
  let testUserId = `admin_dyn_${Date.now()}`;
  const testPhone = "919307382099";
  const guestPhone = "919988776622";
  let origAutoReplyEnabled;
  let origEngineMode;
  let origBusinessName;
  let origDynamicOptions;

  before(async () => {
    origAutoReplyEnabled = getSetting("AUTO_REPLY_ENABLED");
    origEngineMode = getSetting("AUTO_REPLY_ENGINE_MODE");
    origBusinessName = getSetting("BOT_BUSINESS_NAME");
    origDynamicOptions = getSetting("BOT_DYNAMIC_OPTIONS");

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("TestPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Dynamic Admin', ?, ?, ?, 'ADMIN', 'ACTIVE', 1)
    `).run(testUserId, `dyn_admin_${Date.now()}@konkantrip.local`, testPhone, hash);

    adminToken = jwt.sign(
      { id: testUserId, email: `dyn_admin_${Date.now()}@konkantrip.local`, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Ensure bot is enabled and test phone data is fresh
    webhookService.resumeBotForPhone(guestPhone);
    try {
      db.prepare("DELETE FROM customer_replies WHERE from_phone IN (?, ?, ?, ?, ?)").run(guestPhone, `+${guestPhone}`, "919988776633", "919988776644", "919988776677");
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone IN (?, ?, ?, ?)").run(guestPhone, "919988776633", "919988776644", "919988776677");
      db.prepare("DELETE FROM hospitality_chat_sessions WHERE phone IN (?, ?, ?, ?)").run(guestPhone, "919988776633", "919988776644", "919988776677");
    } catch (e) {}

    webhookService.saveAutoReplySettings({
      enabled: true,
      engineMode: "HOSPITALITY_FLOW",
      businessName: "KonkanTrip Beach Resort & Spa"
    });
  });

  after(() => {
    if (server) {
      server.close();
    }
    // Restore original settings so downstream tests remain isolated
    setSetting("BOT_DYNAMIC_OPTIONS", origDynamicOptions || "");
    setSetting("BOT_BUSINESS_NAME", origBusinessName || "Hotel Green Vally");
    if (origEngineMode !== undefined) setSetting("AUTO_REPLY_ENGINE_MODE", origEngineMode || "HOSPITALITY_FLOW");
    if (origAutoReplyEnabled !== undefined) setSetting("AUTO_REPLY_ENABLED", origAutoReplyEnabled || "true");
    try {
      db.prepare("DELETE FROM customer_replies WHERE from_phone IN (?, ?, ?, ?)").run(guestPhone, "919988776633", "919988776644", "919988776677");
      db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone IN (?, ?, ?, ?)").run(guestPhone, "919988776633", "919988776644", "919988776677");
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    } catch (e) {}
  });

  test("1. GET /api/replies/dynamic-options returns dynamic options array with defaults", async () => {
    const res = await fetch(`${baseUrl}/api/replies/dynamic-options`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 4);

    const spaOpt = body.data.find(d => d.id === "opt_spa");
    assert.ok(spaOpt);
    assert.equal(spaOpt.title, "Spa & Wellness");
    assert.equal(spaOpt.actionType, "REPLY_TEXT");
  });

  test("2. POST /api/replies/dynamic-options saves custom dynamic options and persists to database", async () => {
    const customRules = [
      {
        id: "custom_scuba",
        title: "Scuba Diving & Watersports",
        buttonLabel: "Scuba Diving",
        triggers: "scuba, diving, watersports, parasailing, boat ride",
        matchType: "CONTAINS",
        actionType: "REPLY_TEXT",
        responseText: "🌊 *Konkan Scuba Adventure*\nBook our certified PADI dive with underwater video for {{name}} at {{business_name}}!",
        followUpButtons: [
          { id: "btn_scuba_book", title: "Book Scuba Slot" },
          { id: "btn_staff", title: "Talk to Desk" }
        ],
        active: true
      },
      {
        id: "custom_vip_desk",
        title: "VIP Desk Takeover",
        buttonLabel: "VIP Concierge",
        triggers: "manager, owner, complaint, urgent, vip",
        matchType: "CONTAINS",
        actionType: "STAFF_TAKEOVER",
        responseText: "A VIP concierge manager has been notified and will message you at {{phone}} directly.",
        active: true
      },
      {
        id: "custom_inactive",
        title: "Secret Inactive Promo",
        buttonLabel: "Secret Promo",
        triggers: "secret, promo99",
        matchType: "EXACT",
        actionType: "REPLY_TEXT",
        responseText: "This should not be matched when inactive",
        active: false
      }
    ];

    const saveRes = await fetch(`${baseUrl}/api/replies/dynamic-options`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ dynamicOptions: customRules })
    });

    assert.equal(saveRes.status, 200);
    const saveBody = await saveRes.json();
    assert.equal(saveBody.success, true);
    assert.equal(saveBody.data.length, 3);

    // Verify GET retrieves newly persisted options
    const getRes = await fetch(`${baseUrl}/api/replies/dynamic-options`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const getBody = await getRes.json();
    assert.equal(getBody.data.length, 3);
    assert.equal(getBody.data[0].id, "custom_scuba");
    assert.equal(getBody.data[1].id, "custom_vip_desk");
  });

  test("3. Dynamic Rule Engine matches CONTAINS trigger & interpolates template variables", async () => {
    const phone = "919988776633";
    webhookService.saveAutoReplySettings({
      enabled: true,
      engineMode: "HOSPITALITY_FLOW",
      businessName: "KonkanTrip Beach Resort & Spa"
    });
    webhookService.resumeBotForPhone(phone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);

    const rawMsg = {
      from: phone,
      id: `wamid_dyn_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "Can I know about scuba diving please?" }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: phone, profile: { name: "Rahul Sharma" } }]);
    assert.ok(saved.saved);

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.handledBy, "DYNAMIC_OPTION");
    assert.ok(result.replyText.includes("Konkan Scuba Adventure"));
    assert.ok(result.replyText.includes("Rahul Sharma")); // Interpolated {{name}}
    assert.ok(result.replyText.includes("KonkanTrip Beach Resort & Spa")); // Interpolated {{business_name}}
  });

  test("4. Dynamic Rule Engine handles STAFF_TAKEOVER action and pauses bot", async () => {
    const phone = "919988776644";
    webhookService.resumeBotForPhone(phone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);

    const rawMsg = {
      from: phone,
      id: `wamid_dyn_vip_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "I need to speak to the manager immediately" }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: phone, profile: { name: "Anita Deshmukh" } }]);
    assert.ok(saved.saved);

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.handledBy, "DYNAMIC_OPTION_STAFF");
    assert.ok(result.replyText.includes("VIP concierge manager has been notified"));

    // Verify bot is paused for this phone
    assert.equal(webhookService.isBotPausedForPhone(phone), true);

    // Clean up pause state
    webhookService.resumeBotForPhone(phone);
    assert.equal(webhookService.isBotPausedForPhone(phone), false);
  });

  test("5. Dynamic Rule Engine matches direct button click (dyn_<id>)", async () => {
    webhookService.resumeBotForPhone(guestPhone);

    const rawMsg = {
      from: guestPhone,
      id: `wamid_dyn_btn_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "interactive",
      interactive: {
        type: "button_reply",
        button_reply: { id: "dyn_custom_scuba", title: "Scuba Diving" }
      }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Vikram" } }]);
    assert.ok(saved.saved);

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.handledBy, "DYNAMIC_OPTION");
    assert.ok(result.replyText.includes("Konkan Scuba Adventure"));
  });

  test("6. Inactive rule is ignored even if exact match occurs", async () => {
    webhookService.resumeBotForPhone(guestPhone);

    const rawMsg = {
      from: guestPhone,
      id: `wamid_dyn_inact_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "promo99" }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: guestPhone, profile: { name: "Vikram" } }]);
    assert.ok(saved.saved);

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

    // Should NOT be handled by the inactive dynamic option
    assert.notEqual(result?.handledBy, "DYNAMIC_OPTION");
  });

  test("7. Dynamic Rule with OPEN_URL appends explore link", async () => {
    const urlRule = [
      {
        id: "custom_menu_link",
        title: "Restaurant Menu",
        buttonLabel: "View Menu",
        triggers: "menu, dining, breakfast menu, food",
        matchType: "CONTAINS",
        actionType: "OPEN_URL",
        url: "https://konkantrip.local/dining-menu.pdf",
        responseText: "🍽️ Here is our sea-facing dining menu:",
        active: true
      }
    ];

    const phone = "919988776677";
    webhookService.saveAutoReplySettings({
      enabled: true,
      engineMode: "HOSPITALITY_FLOW",
      dynamicOptions: urlRule
    });
    webhookService.resumeBotForPhone(phone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(phone);

    const rawMsg = {
      from: phone,
      id: `wamid_dyn_menu_${Date.now()}`,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: "text",
      text: { body: "What food is on the dining menu?" }
    };

    const saved = webhookService.saveCustomerReply(rawMsg, [{ wa_id: phone, profile: { name: "Pooja" } }]);
    assert.ok(saved.saved);

    const result = await webhookService.processConversationalFlow(saved.reply, rawMsg, {});

    assert.ok(result);
    assert.equal(result.success, true);
    assert.equal(result.handledBy, "DYNAMIC_OPTION");
    assert.ok(result.replyText.includes("https://konkantrip.local/dining-menu.pdf"));
  });
});
