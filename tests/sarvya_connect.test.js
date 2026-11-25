const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting, getSetting } = require("../src/config/database");
const config = require("../src/config/env");

describe("SARVYA Connect — WhatsApp Campaign, Custom Template Management & Rule Enforcement", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;
  let originalFetch;

  let prevTokenSetting;
  let prevPhoneIdSetting;
  let prevWabaIdSetting;
  let prevAppSecretSetting;
  let origConfigAppSecret;

  const createdTemplateIds = [];
  const createdCampaignIds = [];
  const createdMessageIds = [];
  const createdPhoneRecordIds = [];
  const createdPhones = ["919307382030", "919811112222", "919811113333"];

  before(() => {
    prevTokenSetting = getSetting("WHATSAPP_API_TOKEN");
    prevPhoneIdSetting = getSetting("WHATSAPP_PHONE_NUMBER_ID");
    prevWabaIdSetting = getSetting("WHATSAPP_BUSINESS_ACCOUNT_ID");
    prevAppSecretSetting = getSetting("META_APP_SECRET");
    origConfigAppSecret = config.META_APP_SECRET;

    setSetting("WHATSAPP_API_TOKEN", "EAASarvyaTestMockToken_00000000000000000000000000000000");
    setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", "998877665544332");
    setSetting("META_APP_SECRET", "test_meta_app_secret_32_characters_long!");
    config.META_APP_SECRET = "test_meta_app_secret_32_characters_long!";

    // Clean up test phone records before running tests to ensure clean state
    for (const ph of createdPhones) {
      db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(ph);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(ph);
      const c = db.prepare("SELECT id FROM contacts WHERE phone_e164 = ?").get(ph);
      if (c) {
        db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM contacts WHERE id = ?").run(c.id);
      }
    }

    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const adminId = `sarvya_test_admin_${Date.now()}`;
    const hash = bcrypt.hashSync("Pass1234!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'SARVYA Admin', ?, '919307382030', ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `sarvya_admin_${Date.now()}@test.local`, hash);
    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Intercept only outbound Meta Graph API calls so local HTTP tests are deterministic & fast
    originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (urlStr.startsWith("https://graph.facebook.com/") || (config.META_API_URL && urlStr.startsWith(config.META_API_URL))) {
        if (urlStr.includes("/message_templates") && options.method === "POST") {
          return new Response(
            JSON.stringify({
              id: `meta_tpl_${Date.now()}`,
              status: "PENDING",
              category: "MARKETING"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (urlStr.includes("/messages") && options.method === "POST") {
          return new Response(
            JSON.stringify({
              messaging_product: "whatsapp",
              messages: [{ id: `wamid.test.${crypto.randomBytes(6).toString("hex")}` }]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!options.method || options.method === "GET") {
          return new Response(
            JSON.stringify({
              id: "112233445566778",
              display_phone_number: "+91 93073 82030",
              verified_name: "Resort Business",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              status: "CONNECTED"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      return originalFetch(url, options);
    };
  });

  after(() => {
    global.fetch = originalFetch;

    for (const tid of createdTemplateIds) {
      db.prepare("DELETE FROM templates WHERE id = ?").run(tid);
    }
    for (const cid of createdCampaignIds) {
      db.prepare("DELETE FROM whatsapp_usage_ledger WHERE campaign_id = ?").run(cid);
      db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(cid);
      db.prepare("DELETE FROM campaigns WHERE id = ?").run(cid);
    }
    for (const mid of createdMessageIds) {
      db.prepare("DELETE FROM whatsapp_usage_ledger WHERE message_id = ?").run(mid);
      db.prepare("DELETE FROM whatsapp_messages WHERE id = ?").run(mid);
    }
    for (const pid of createdPhoneRecordIds) {
      db.prepare("DELETE FROM waba_phone_numbers WHERE id = ?").run(pid);
    }
    for (const ph of createdPhones) {
      db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(ph);
      db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(ph);
      const c = db.prepare("SELECT id FROM contacts WHERE phone_e164 = ?").get(ph);
      if (c) {
        db.prepare("DELETE FROM contact_consents WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM booking_enquiries WHERE contact_id = ?").run(c.id);
        db.prepare("DELETE FROM contacts WHERE id = ?").run(c.id);
      }
    }
    if (adminUser?.id) {
      db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
    }

    if (prevTokenSetting !== null && prevTokenSetting !== undefined) setSetting("WHATSAPP_API_TOKEN", prevTokenSetting);
    if (prevPhoneIdSetting !== null && prevPhoneIdSetting !== undefined) setSetting("WHATSAPP_PHONE_NUMBER_ID", prevPhoneIdSetting);
    if (prevWabaIdSetting !== null && prevWabaIdSetting !== undefined) setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", prevWabaIdSetting);
    if (prevAppSecretSetting !== null && prevAppSecretSetting !== undefined) setSetting("META_APP_SECRET", prevAppSecretSetting);
    config.META_APP_SECRET = origConfigAppSecret;

    if (server) server.close();
    const { closeAsyncPool } = require("../src/config/asyncDb");
    return closeAsyncPool();
  });

  test("1. Connect & list WhatsApp sender accounts once (/api/v1/channels/whatsapp/*)", async () => {
    const connRes = await originalFetch(`${baseUrl}/api/v1/channels/whatsapp/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        displayName: "Resort Business",
        phoneNumber: "+91 93073 82030",
        phoneNumberId: "112233445566778",
        wabaId: "998877665544332",
        isDefault: true
      })
    });
    const connJson = await connRes.json();
    assert.equal(connRes.ok, true);
    assert.equal(connJson.account.display_name, "Resort Business");
    createdPhoneRecordIds.push(connJson.account.id);

    const listRes = await originalFetch(`${baseUrl}/api/v1/channels/whatsapp/accounts`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const listJson = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(listJson.connected, true);
    assert.ok(listJson.accounts.some(a => a.phone_number_id === "112233445566778"));
    assert.ok(listJson.summary.templates);
  });

  test("2. Custom Template Builder: Create DRAFT, edit, enforce samples on Submit, lock APPROVED via webhook", async () => {
    const draftName = `sarvya_offer_${Date.now()}`;
    const createRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: draftName,
        category: "MARKETING",
        language: "en_US",
        headerType: "TEXT",
        headerText: "Summer Retreat Offer",
        bodyText: "Hi {{1}}, enjoy {{2}} off your next beach stay!",
        footerText: "Reply STOP to unsubscribe",
        buttons: [{ type: "QUICK_REPLY", text: "Book Now" }],
        samples: { "1": "", "2": "" }
      })
    });
    const createJson = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createJson.template.status, "DRAFT");
    createdTemplateIds.push(createJson.template.id);
    const tplId = createJson.template.id;

    // Submitting without sample values must fail validation (400)
    const badSubmitRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates/${tplId}/submit`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.equal(badSubmitRes.status, 400);

    // Update draft with sample values
    const putRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates/${tplId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        bodyText: "Hi {{1}}, enjoy {{2}} off your next stay!",
        samples: { "1": "Aarav", "2": "20%" }
      })
    });
    assert.equal(putRes.status, 200);

    // Submit valid draft to Meta -> transitions to PENDING
    const submitRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates/${tplId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({})
    });
    const submitJson = await submitRes.json();
    assert.equal(submitRes.status, 200);
    assert.equal(submitJson.template.status, "PENDING");
    assert.ok(submitJson.template.meta_id);

    // Attempting to send PENDING template is blocked (400)
    const pendingSendRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: "919811112222",
        type: "TEMPLATE",
        templateId: tplId,
        variables: ["Aarav", "20%"]
      })
    });
    const pendingSendJson = await pendingSendRes.json();
    assert.equal(pendingSendRes.status, 400);
    assert.equal(pendingSendJson.code, "TEMPLATE_NOT_APPROVED");

    // Simulate Meta webhook approval (message_template_status_update -> APPROVED)
    const whPayload = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "message_template_status_update",
          value: {
            event: "APPROVED",
            message_template_id: submitJson.template.meta_id,
            message_template_name: draftName,
            message_template_language: "en_US"
          }
        }]
      }]
    });
    const sig = "sha256=" + crypto.createHmac("sha256", config.META_APP_SECRET).update(whPayload).digest("hex");
    const whRes = await originalFetch(`${baseUrl}/api/v1/webhooks/meta/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig
      },
      body: whPayload
    });
    assert.equal(whRes.status, 200);

    // Wait for async webhook worker to process approval
    const { JobWorkerEngine } = require("../src/services/queue/jobWorkerEngine");
    const workerEngine = new JobWorkerEngine();
    for (let i = 0; i < 25; i++) {
      await workerEngine.claimAndProcessNextJob("webhook");
      const checkTpl = db.prepare("SELECT status FROM templates WHERE id = ?").get(tplId);
      if (checkTpl && checkTpl.status === 'APPROVED') break;
      await new Promise(r => setTimeout(r, 100));
    }

    // APPROVED template cannot be directly mutated via PUT (409 Conflict)
    const lockRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates/${tplId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ bodyText: "Illegal edit" })
    });
    assert.equal(lockRes.status, 409);

    // Dispatch APPROVED template succeeds + records message & usage ledger + tracks webhook status
    const okSendRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: "919811112222",
        type: "TEMPLATE",
        templateId: tplId,
        variables: ["Aarav", "20%"]
      })
    });
    const okSendJson = await okSendRes.json();
    assert.equal(okSendRes.status, 200);
    assert.ok(okSendJson.data.id);
    assert.ok(okSendJson.data.metaMessageId);
    createdMessageIds.push(okSendJson.data.id);

    const lookupRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/${okSendJson.data.id}`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const lookupJson = await lookupRes.json();
    assert.equal(lookupRes.status, 200);
    assert.equal(lookupJson.data.status, "SENT");
  });

  test("3. Enforce 24-hour customer-service window and opt-out suppression on 1-to-1 messaging", async () => {
    const cleanNum = "919811113333";

    // No inbound message -> 24h window closed -> free-form TEXT blocked with 422 WINDOW_CLOSED_24H
    const closedRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: cleanNum,
        type: "TEXT",
        text: "Hello outside 24h window"
      })
    });
    const closedJson = await closedRes.json();
    assert.equal(closedRes.status, 422);
    assert.equal(closedJson.code, "WINDOW_CLOSED_24H");

    // Simulate inbound customer reply opening 24h window
    db.prepare(`
      INSERT INTO customer_replies (wa_message_id, from_phone, customer_name, message_type, message_body, received_at)
      VALUES (?, ?, 'Guest', 'text', 'Hi, room rates?', CURRENT_TIMESTAMP)
    `).run(`wamid.in.${Date.now()}`, cleanNum);

    const openRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: cleanNum,
        type: "TEXT",
        text: "Hi! Deluxe Sea View rooms are ₹4,500/night."
      })
    });
    const openJson = await openRes.json();
    assert.equal(openRes.status, 200);
    createdMessageIds.push(openJson.data.id);

    // Add phone to contact_suppressions -> outbound messages blocked with 403 CONTACT_OPTED_OUT
    db.prepare("INSERT OR REPLACE INTO contact_suppressions (clean_phone, reason) VALUES (?, 'USER_STOP')").run(cleanNum);
    const optOutRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        to: cleanNum,
        type: "TEXT",
        text: "Should be suppressed"
      })
    });
    const optOutJson = await optOutRes.json();
    assert.equal(optOutRes.status, 403);
    assert.equal(optOutJson.code, "CONTACT_OPTED_OUT");
  });

  test("4. Campaign create, non-approved template launch guard, validated launch & usage ledger", async () => {
    const draftTplName = `draft_camp_guard_${Date.now()}`;
    const draftRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: draftTplName,
        category: "UTILITY",
        language: "en_US",
        bodyText: "Reminder for {{1}}",
        samples: { "1": "Guest" }
      })
    });
    const draftJson = await draftRes.json();
    createdTemplateIds.push(draftJson.template.id);

    const campRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: "Utility Check Campaign",
        messageType: "TEMPLATE",
        templateName: draftTplName,
        templateLanguage: "en_US",
        contacts: [{ phone: "919811112222", name: "Aarav" }]
      })
    });
    const campJson = await campRes.json();
    assert.equal(campRes.status, 201);
    const campId = campJson.data.id;
    createdCampaignIds.push(campId);

    // Launch must be blocked because template is DRAFT
    const blockedLaunch = await originalFetch(`${baseUrl}/api/v1/whatsapp/campaigns/${campId}/launch`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const blockedLaunchJson = await blockedLaunch.json();
    assert.equal(blockedLaunch.status, 400);
    assert.equal(blockedLaunchJson.code, "TEMPLATE_NOT_APPROVED");

    // Approve template and re-launch cleanly
    db.prepare("UPDATE templates SET status = 'APPROVED' WHERE id = ?").run(draftJson.template.id);
    const launchRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/campaigns/${campId}/launch`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const launchJson = await launchRes.json();
    assert.equal(launchRes.status, 200);
    assert.equal(launchJson.data.deliverableCount, 1);
    assert.equal(launchJson.data.category, "UTILITY");

    const usageRes = await originalFetch(`${baseUrl}/api/v1/whatsapp/usage`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    const usageJson = await usageRes.json();
    assert.equal(usageRes.status, 200);
    assert.ok(usageJson.totals.messages >= 1);
  });
});

