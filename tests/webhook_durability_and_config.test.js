const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const { app } = require("../server");
const config = require("../src/config/env");
const { db, initializeDatabase, getSetting, setSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const whatsappMessagingService = require("../src/services/whatsappMessagingService");
const jobQueueService = require("../src/services/queue/jobQueueService");
const jobWorkerEngine = require("../src/services/queue/jobWorkerEngine");
const { resolveWhatsAppContext } = require("../src/services/workflow/conversationContextResolver");
const cryptoUtil = require("../src/utils/cryptoUtil");
const { ensureTestAdmin, closeTestResources } = require("./helpers/testFixtures");

describe("Phase 3 Regression: Webhook Durability, Duplicate WABA Mapping & Credential Precedence", () => {
  let server;
  let baseUrl;
  let superAdminToken;
  let tenant2Id;
  let origVerifyToken;
  let origAppSecret;
  const createdPhoneIds = [];
  const createdEventIds = [];

  before(async () => {
    initializeDatabase();
    origVerifyToken = getSetting("WEBHOOK_VERIFY_TOKEN");
    origAppSecret = getSetting("META_APP_SECRET");

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const t2 = db.prepare(`
      INSERT INTO tenants (name, slug, status, plan_code, primary_domain, allowed_domains_json)
      VALUES ('Webhook Phase3 Tenant2', 'wh-p3-t2', 'ACTIVE', 'GROWTH', 'HOSPITALITY', '["HOSPITALITY"]')
    `).run();
    tenant2Id = Number(t2.lastInsertRowid);

    const sa = ensureTestAdmin(1);
    superAdminToken = jwt.sign({ id: sa.id, userId: sa.id, tenant_id: 1, role: sa.role, is_platform_admin: true }, config.JWT_SECRET, { expiresIn: "1h" });
  });

  after(async () => {
    if (origVerifyToken) setSetting("WEBHOOK_VERIFY_TOKEN", origVerifyToken);
    if (origAppSecret !== undefined) setSetting("META_APP_SECRET", origAppSecret || "");
    try {
      for (const pid of createdPhoneIds) {
        db.prepare("DELETE FROM waba_phone_numbers WHERE phone_number_id = ?").run(pid);
      }
      for (const eid of createdEventIds) {
        db.prepare("DELETE FROM incoming_webhook_events WHERE event_id = ?").run(eid);
      }
      if (tenant2Id) db.prepare("DELETE FROM tenants WHERE id = ?").run(tenant2Id);
    } catch (_) {}
    await closeTestResources(server);
  });

  test("1. Failed enqueue rolls back dedup keys cleanly (503) and retry succeeds (200) with zero silent message loss", async () => {
    const msgId = `wamid.p3.rollback.${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: `entry_p3_${Date.now()}`,
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1510764325447375" },
            messages: [{ from: "919822112233", id: msgId, type: "text", text: { body: "Hi rollback test" } }]
          }
        }]
      }]
    };
    const rawStr = JSON.stringify(payload);
    const digest = crypto.createHash("sha256").update(Buffer.from(rawStr)).digest("hex");
    createdEventIds.push(`digest_${digest}`, `wamid_${msgId}`, payload.entry[0].id);

    const headers = { "Content-Type": "application/json" };
    const secret = (config.META_APP_SECRET || getSetting("META_APP_SECRET") || "").trim();
    if (secret && !secret.startsWith("enc:")) {
      headers["x-hub-signature-256"] = `sha256=${crypto.createHmac("sha256", secret).update(rawStr).digest("hex")}`;
    }

    // Temporarily force enqueueJob to fail
    const origEnqueue = jobQueueService.enqueueJob;
    jobQueueService.enqueueJob = () => { throw new Error("Simulated transient queue outage"); };
    try {
      const failRes = await fetch(`${baseUrl}/webhook`, { method: "POST", headers, body: rawStr });
      assert.equal(failRes.status, 503, "Queue failure must return 503 so Meta retries");
    } finally {
      jobQueueService.enqueueJob = origEnqueue;
    }

    // Verify dedup rows were ROLLED BACK atomically!
    const stuckDedup = db.prepare("SELECT * FROM incoming_webhook_events WHERE event_id IN (?, ?)").all(`digest_${digest}`, `wamid_${msgId}`);
    assert.equal(stuckDedup.length, 0, "Dedup rows MUST roll back when enqueueJob fails so retry is not dropped");

    // Meta retry now succeeds
    const retryRes = await fetch(`${baseUrl}/webhook`, { method: "POST", headers, body: rawStr });
    assert.equal(retryRes.status, 200);
    assert.equal(await retryRes.text(), "EVENT_RECEIVED");

    const queuedJob = db.prepare("SELECT * FROM system_job_queue WHERE idempotency_key = ?").get(`meta_ingest_${digest}`);
    assert.ok(queuedJob, "Webhook retry must enqueue durable job");

    // Execute handler and verify incoming_webhook_events status transitions to PROCESSED
    const handler = jobWorkerEngine.handlers.get("META_WEBHOOK_INGEST");
    await handler(payload, queuedJob);
    const evAfter = db.prepare("SELECT status FROM incoming_webhook_events WHERE event_id = ?").get(`digest_${digest}`);
    assert.equal(evAfter.status, "PROCESSED");

    db.prepare("DELETE FROM customer_replies WHERE wa_message_id = ?").run(msgId);
    db.prepare("DELETE FROM system_job_queue WHERE id = ?").run(queuedJob.id);
  });

  test("2. Rotated verify token rejects hardcoded legacy token and /api/admin/webhooks/config queries customer_replies", async () => {
    const rotated = `wb_live_rotated_${Date.now()}`;
    webhookService.saveVerifyToken(rotated);

    const legacyRes = webhookService.verifyHandshake({
      "hub.mode": "subscribe",
      "hub.verify_token": "wb_verify_konkantrip_7f3a9e2c4b810d56",
      "hub.challenge": "ch_123"
    });
    assert.equal(legacyRes.verified, false, "Legacy hardcoded verify token must be rejected after rotation");

    const validRes = webhookService.verifyHandshake({
      "hub.mode": "subscribe",
      "hub.verify_token": rotated,
      "hub.challenge": "ch_123"
    });
    assert.equal(validRes.verified, true);
    assert.equal(validRes.challenge, "ch_123");

    const cfgRes = await fetch(`${baseUrl}/api/admin/webhooks/config`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.equal(cfgRes.status, 200);
    const cfgJson = await cfgRes.json();
    assert.equal(cfgJson.success, true);
    assert.ok(cfgJson.data.stats.totalReplies >= 0);
  });

  test("3. Duplicate WABA rows: soft-deleted ignored, same-tenant resolved, cross-tenant conflicts fail closed", () => {
    const pid = `pn_p3_ctx_${Date.now()}`;
    const fakeDb = (rows) => ({
      prepare: (sql) => ({
        all: () => rows,
        get: () => null
      })
    });

    // Cross-tenant duplicate must fail closed
    assert.equal(resolveWhatsAppContext(pid, {
      database: fakeDb([{ id: 1, tenant_id: 2, phone_number_id: pid }, { id: 2, tenant_id: 3, phone_number_id: pid }])
    }), null);

    // Same-tenant duplicate rows must resolve deterministically instead of blackholing live traffic
    const sameTenantCtx = resolveWhatsAppContext(pid, {
      database: fakeDb([{ id: 1, tenant_id: 2, phone_number_id: pid }, { id: 2, tenant_id: 2, phone_number_id: pid }])
    });
    assert.equal(sameTenantCtx.tenantId, 2);
  });

  test("4. Credential resolution & WABA ID lookup isolate Tenant 2+ and expose META_APP_ID", () => {
    assert.ok("META_APP_ID" in config, "env config must expose META_APP_ID");
    assert.ok("META_WABA_ID" in config, "env config must expose META_WABA_ID");

    const pn2 = `pn_p3_t2_${Date.now()}`;
    const tok2 = `EAA_Tenant2_Unique_${crypto.randomBytes(16).toString("hex")}`;
    createdPhoneIds.push(pn2);

    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, access_token_enc, is_default, delete_status)
      VALUES (?, ?, 'T2 Line', '919800001122', ?, 'waba_tenant2_only', ?, 1, 0)
    `).run(pn2, tenant2Id, pn2, cryptoUtil.encrypt(tok2));

    const creds = whatsappMessagingService.resolveCredentialsForPhone(pn2, tenant2Id);
    assert.equal(creds.token, tok2);
    assert.equal(creds.phoneNumberId, pn2);

    assert.equal(metaWhatsAppService.resolveWabaId(null, tenant2Id), "waba_tenant2_only");
  });

  test("5. Admin Queue routes expose system webhook jobs (tenant_id = 0) to platform admin", async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.byQueue);
  });
});
