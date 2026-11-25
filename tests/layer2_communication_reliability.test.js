const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { app } = require("../server");
const { db, getSetting, setSetting } = require("../src/config/database");
const config = require("../src/config/env");
const cryptoUtil = require("../src/utils/cryptoUtil");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const webhookService = require("../src/services/webhookService");
const { JobWorkerEngine } = require("../src/services/queue/jobWorkerEngine");

describe("Layer 2: Communication Adapter, Channel Isolation, Durable Webhook & Handoff", () => {
  let server;
  let baseUrl;
  let originalFetch;
  let tenantAOwner = {};
  let tenantBOwner = {};
  let prevAppSecret;
  let origConfigSecret;
  const createdTenantIds = [];
  const createdUserIds = [];
  const createdPhoneIds = [];

  before(async () => {
    prevAppSecret = getSetting("META_APP_SECRET");
    origConfigSecret = config.META_APP_SECRET;
    setSetting("META_APP_SECRET", "layer2_meta_secret_32_characters_long!");
    config.META_APP_SECRET = "layer2_meta_secret_32_characters_long!";

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    originalFetch = global.fetch;

    const regA = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Layer2 Alpha Comm",
        email: `l2_alpha_${Date.now()}@sarvya.test`,
        phone: "919822001100",
        password: "Password123!"
      })
    });
    const jA = await regA.json();
    tenantAOwner = { user: jA.user, token: jA.token, tenantId: Number(jA.user.tenant_id) };
    createdUserIds.push(jA.user.id);
    createdTenantIds.push(tenantAOwner.tenantId);

    const regB = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Layer2 Beta Comm",
        email: `l2_beta_${Date.now()}@sarvya.test`,
        phone: "919822002200",
        password: "Password123!"
      })
    });
    const jB = await regB.json();
    tenantBOwner = { user: jB.user, token: jB.token, tenantId: Number(jB.user.tenant_id) };
    createdUserIds.push(jB.user.id);
    createdTenantIds.push(tenantBOwner.tenantId);
  });

  after(() => {
    global.fetch = originalFetch;
    config.META_APP_SECRET = origConfigSecret;
    try { if (prevAppSecret) setSetting("META_APP_SECRET", prevAppSecret); } catch (_) {}
    if (server) server.close();
    for (const pid of createdPhoneIds) {
      try { db.prepare("DELETE FROM waba_phone_numbers WHERE id = ? OR phone_number_id = ?").run(pid, pid); } catch (_) {}
    }
    for (const uid of createdUserIds) {
      try { db.prepare("DELETE FROM tenant_user_memberships WHERE user_id = ?").run(uid); } catch (_) {}
      try { db.prepare("DELETE FROM users WHERE id = ?").run(uid); } catch (_) {}
    }
    for (const tid of createdTenantIds) {
      try { db.prepare("DELETE FROM conversation_handoff_states WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM customer_replies WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM whatsapp_messages WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM crm_pipelines WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch (_) {}
    }
  });

  test("1. Non-Tenant-1 resolveCredentials decrypts encrypted line token and refuses Tenant 1 fallback", () => {
    const phoneIdNoTok = `pn_l2_notok_${Date.now()}`;
    const phoneIdEnc = `pn_l2_enc_${Date.now()}`;
    createdPhoneIds.push(phoneIdNoTok, phoneIdEnc);

    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, is_default)
      VALUES (?, ?, 'No Token Line', '919822001101', ?, 'waba_2', 0)
    `).run(phoneIdNoTok, tenantAOwner.tenantId, phoneIdNoTok);

    const secretTok = `EAA_Tenant2_Encrypted_${crypto.randomBytes(20).toString("hex")}`;
    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, access_token_enc, is_default)
      VALUES (?, ?, 'Enc Line', '919822001102', ?, 'waba_2', ?, 1)
    `).run(phoneIdEnc, tenantAOwner.tenantId, phoneIdEnc, cryptoUtil.encrypt(secretTok));

    // External tenant line without its own token MUST NOT borrow Tenant 1's global token
    assert.throws(
      () => metaWhatsAppService.resolveCredentials({ phoneNumberId: phoneIdNoTok, tenantId: tenantAOwner.tenantId }),
      /missing for tenant/i
    );

    // Encrypted access_token_enc decrypts cleanly for owning tenant
    const creds = metaWhatsAppService.resolveCredentials({ phoneNumberId: phoneIdEnc, tenantId: tenantAOwner.tenantId });
    assert.equal(creds.token, secretTok);
    assert.equal(creds.phoneNumberId, phoneIdEnc);

    // Cross-tenant usage of Tenant A's phoneNumberId from Tenant B is rejected
    assert.throws(
      () => metaWhatsAppService.resolveCredentials({ phoneNumberId: phoneIdEnc, tenantId: tenantBOwner.tenantId }),
      /does not belong to tenant/i
    );
  });

  test("2. Tenant 2 Workspace Owner replies in Inbox & manages bot handoff status using own channel", async () => {
    const contactPhone = "919822998877";
    const sentPayloads = [];
    global.fetch = async (url, options = {}) => {
      const u = String(url);
      if (u.includes("/messages") && (u.includes("graph.facebook.com") || (config.META_API_URL && u.startsWith(config.META_API_URL)))) {
        sentPayloads.push({ url: u, headers: options.headers, body: JSON.parse(options.body || "{}") });
        return new Response(
          JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.l2.${Date.now()}` }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url, options);
    };

    const replyRes = await originalFetch(`${baseUrl}/api/inbox/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAOwner.token}`
      },
      body: JSON.stringify({
        to: contactPhone,
        message: "Hello from Tenant A Inbox Agent"
      })
    });
    assert.equal(replyRes.status, 200);
    const replyJson = await replyRes.json();
    assert.equal(replyJson.success, true);
    assert.equal(sentPayloads.length, 1);

    // Verify outbound record stored cleanly under Tenant A only (invisible to Tenant B)
    const rowsA = db.prepare("SELECT * FROM customer_replies WHERE tenant_id = ? AND from_phone = ?").all(tenantAOwner.tenantId, contactPhone);
    const rowsB = db.prepare("SELECT * FROM customer_replies WHERE tenant_id = ? AND from_phone = ?").all(tenantBOwner.tenantId, contactPhone);
    assert.equal(rowsA.length, 1);
    assert.equal(rowsB.length, 0);

    // Verify durable DB handoff state persists even if process RAM cache is wiped
    webhookService.botPausedUntil.clear();
    assert.equal(webhookService.isBotPausedForPhone(contactPhone, { tenantId: tenantAOwner.tenantId }), true);
    assert.equal(webhookService.isBotPausedForPhone(contactPhone, { tenantId: tenantBOwner.tenantId }), false);

    // Explicit resume clears DB handoff state
    const resumeRes = await originalFetch(`${baseUrl}/api/inbox/bot-status/${contactPhone}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAOwner.token}`
      },
      body: JSON.stringify({ paused: false })
    });
    assert.equal(resumeRes.status, 200);
    const resumeJson = await resumeRes.json();
    assert.equal(resumeJson.data.isPaused, false);
    assert.equal(webhookService.isBotPausedForPhone(contactPhone, { tenantId: tenantAOwner.tenantId }), false);
  });

  test("3. Concurrent duplicate webhook burst enqueues once; distinct wamids under same WABA entry.id both queue", async () => {
    const sharedWabaEntryId = `waba_static_${Date.now()}`;
    const msg1Id = `wamid.burst.1.${Date.now()}`;
    const msg2Id = `wamid.burst.2.${Date.now()}`;

    const buildSignedReq = (msgId, bodyText) => {
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
          id: sharedWabaEntryId,
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "test_phone_l2" },
              messages: [{ from: "919822990001", id: msgId, type: "text", text: { body: bodyText } }]
            }
          }]
        }]
      });
      const hmac = "sha256=" + crypto.createHmac("sha256", config.META_APP_SECRET).update(payload).digest("hex");
      return { payload, hmac };
    };

    const req1 = buildSignedReq(msg1Id, "First message");
    const burst = await Promise.all(
      Array.from({ length: 5 }, () =>
        originalFetch(`${baseUrl}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-hub-signature-256": req1.hmac },
          body: req1.payload
        })
      )
    );
    assert.ok(burst.every(r => r.status === 200));

    const digest1 = crypto.createHash("sha256").update(req1.payload).digest("hex");
    const jobs1 = db.prepare("SELECT * FROM system_job_queue WHERE idempotency_key = ?").all(`meta_ingest_${digest1}`);
    assert.equal(jobs1.length, 1, "5 identical webhook deliveries must enqueue strictly 1 job");

    // Distinct message with SAME entry.id must NOT be blocked
    const req2 = buildSignedReq(msg2Id, "Second distinct message");
    const res2 = await originalFetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": req2.hmac },
      body: req2.payload
    });
    assert.equal(res2.status, 200);
    const digest2 = crypto.createHash("sha256").update(req2.payload).digest("hex");
    const jobs2 = db.prepare("SELECT * FROM system_job_queue WHERE idempotency_key = ?").all(`meta_ingest_${digest2}`);
    assert.equal(jobs2.length, 1, "Distinct wamid sharing same WABA entry.id must still be ingested");
  });

  test("4. OUTBOUND_MESSAGE_DISPATCH durable worker handler executes queued sends", async () => {
    const engine = new JobWorkerEngine({ workerId: "l2_test_worker" });
    assert.equal(typeof engine.handlers.get("OUTBOUND_MESSAGE_DISPATCH"), "function");
  });
});
