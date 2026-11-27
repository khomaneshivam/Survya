const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const config = require("../src/config/env");
const { db, initializeDatabase } = require("../src/config/database");
const { app } = require("../server");
const billingService = require("../src/services/billingService");
const broadcastEngine = require("../src/services/broadcastEngine");
const { logEvent } = require("../src/utils/logger");

describe("Layer 9: SaaS Plan Quotas, Composite Indexes, Correlation Logging & DB Health Check", () => {
  let tenantXId = null;
  let tenantYId = null;
  const userXId = "usr_l9_owner_x";
  const userYId = "usr_l9_owner_y";
  let tokenX = "";
  let tokenY = "";
  let server = null;
  let baseUrl = "";

  function cleanup() {
    for (const tid of [tenantXId, tenantYId].filter(Boolean)) {
      try { db.prepare("DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = ?)").run(tid); } catch {}
      try { db.prepare("DELETE FROM campaigns WHERE tenant_id = ?").run(tid); } catch {}
      try { db.prepare("DELETE FROM whatsapp_messages WHERE tenant_id = ?").run(tid); } catch {}
      try { db.prepare("DELETE FROM waba_phone_numbers WHERE tenant_id = ?").run(tid); } catch {}
      try { db.prepare("DELETE FROM tenant_subscriptions WHERE tenant_id = ?").run(tid); } catch {}
      try { db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(tid); } catch {}
      try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch {}
    }
    try { db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userXId, userYId); } catch {}
  }

  before(async () => {
    initializeDatabase();
    try { db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userXId, userYId); } catch {}
    try { db.prepare("DELETE FROM tenants WHERE slug IN ('l9-tenant-x', 'l9-tenant-y')").run(); } catch {}

    const rX = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('L9 Tenant X', 'l9-tenant-x', 'ACTIVE', 'TRIAL', 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 5, 1, 'Asia/Kolkata', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run();
    tenantXId = Number(rX.lastInsertRowid);

    const rY = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('L9 Tenant Y', 'l9-tenant-y', 'ACTIVE', 'TRIAL', 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 10, 1, 'Asia/Kolkata', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run();
    tenantYId = Number(rY.lastInsertRowid);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status)
      VALUES (?, ?, 'Owner X', 'l9_x@test.internal', '919909000001', 'hash', 'USER', 'ACTIVE')
    `).run(userXId, tenantXId);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status)
      VALUES (?, ?, 'Owner Y', 'l9_y@test.internal', '919909000002', 'hash', 'USER', 'ACTIVE')
    `).run(userYId, tenantYId);

    db.prepare("INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')").run(userXId, tenantXId);
    db.prepare("INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')").run(userYId, tenantYId);

    tokenX = jwt.sign({ userId: userXId, tenantId: tenantXId, role: "USER" }, config.JWT_SECRET, { expiresIn: "1h" });
    tokenY = jwt.sign({ userId: userYId, tenantId: tenantYId, role: "USER" }, config.JWT_SECRET, { expiresIn: "1h" });

    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    cleanup();
    const { closeTestResources } = require("./helpers/testFixtures");
    await closeTestResources(server);
  });

  test("1. Enforces monthly message quota & trial expiration fail-closed with HTTP 402", async () => {
    // 1. Over-quota single batch (6 > 5) must fail with 402
    const overRes = await fetch(`${baseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        name: "Over Quota Batch",
        messageType: "TEXT",
        messageBody: "Hello",
        contacts: Array.from({ length: 6 }, (_, i) => ({ phone: `91980000001${i}`, name: `Lead ${i}` }))
      })
    });
    assert.equal(overRes.status, 402);
    const overJson = await overRes.json();
    assert.equal(overJson.code, "MESSAGE_QUOTA_EXCEEDED");

    // 2. Under-quota campaign (3 <= 5) succeeds, then adding 3 sent usage rows blocks subsequent 3-contact batch
    const okRes = await fetch(`${baseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        name: "Within Quota Batch",
        messageType: "TEXT",
        messageBody: "Hello {{name}}",
        contacts: Array.from({ length: 3 }, (_, i) => ({ phone: `91980000002${i}`, name: `Lead ${i}` }))
      })
    });
    assert.equal(okRes.status, 201);
    const okCampId = (await okRes.json()).data.id;

    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO whatsapp_messages (id, tenant_id, recipient_phone, message_type, status, created_at, updated_at)
        VALUES (?, ?, ?, 'TEXT', 'SENT', UTC_TIMESTAMP(), UTC_TIMESTAMP())
      `).run(`msg_l9_${Date.now()}_${i}`, tenantXId, `91980000002${i}`);
    }

    // Now 3 used + 3 in campaign = 6 > 5 -> engine startCampaign must fail closed with MESSAGE_QUOTA_EXCEEDED
    await assert.rejects(
      async () => broadcastEngine.startCampaign(okCampId, 50, { overrideQuietHours: true }),
      (err) => err.code === "MESSAGE_QUOTA_EXCEEDED" && err.statusCode === 402
    );

    // 3. Expired trial blocks both campaign creation & billing subscription check shows trialExpired: true
    db.prepare("UPDATE tenants SET trial_ends_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?").run(tenantXId);

    const subJson = await (await fetch(`${baseUrl}/api/v1/billing/subscription`, {
      headers: { Authorization: `Bearer ${tokenX}` }
    })).json();
    assert.equal(subJson.data.trialExpired, true);

    const expiredRes = await fetch(`${baseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        name: "Expired Trial Batch",
        messageType: "TEXT",
        messageBody: "Hello",
        contacts: [{ phone: "919800000099", name: "Solo" }]
      })
    });
    assert.equal(expiredRes.status, 402);
    assert.equal((await expiredRes.json()).code, "TRIAL_EXPIRED");

    // Restore trial expiry for subsequent test
    db.prepare("UPDATE tenants SET trial_ends_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY) WHERE id = ?").run(tenantXId);
  });

  test("2. Enforces WABA line quota (402), cross-tenant line hijack protection (403), and post-upgrade expansion", async () => {
    // Line 1 for Tenant X via Connect API succeeds
    const line1Id = "l9_line_1_" + Date.now();
    const res1 = await fetch(`${baseUrl}/api/v1/channels/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        displayName: "Tenant X Line 1",
        phoneNumber: "+919909000011",
        phoneNumberId: line1Id
      })
    });
    assert.equal(res1.status, 201);

    // Line 2 for Tenant X exceeds TRIAL quota (1) -> 402 WABA_LINE_QUOTA_EXCEEDED
    const line2Id = "l9_line_2_" + Date.now();
    const res2 = await fetch(`${baseUrl}/api/v1/channels/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        displayName: "Tenant X Line 2",
        phoneNumber: "+919909000012",
        phoneNumberId: line2Id
      })
    });
    assert.equal(res2.status, 402);
    assert.equal((await res2.json()).code, "WABA_LINE_QUOTA_EXCEEDED");

    // Tenant Y attempting to register Tenant X's existing phoneNumberId -> 403 Forbidden
    const hijackRes = await fetch(`${baseUrl}/api/v1/channels/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenY}` },
      body: JSON.stringify({
        displayName: "Spoof Line",
        phoneNumber: "+919909000011",
        phoneNumberId: line1Id
      })
    });
    assert.equal(hijackRes.status, 403);

    // After upgrading Tenant X via Razorpay webhook to GROWTH (quota_waba_lines: 3), Line 2 succeeds
    await billingService.handleRazorpayWebhook({
      event: "payment.captured",
      payment: {
        id: "pay_l9_" + Date.now(),
        notes: { tenant_id: tenantXId, plan_code: "GROWTH", billing_cycle: "MONTHLY", customer_state_code: "27" }
      }
    }, "mock_signature");

    const res2AfterUpgrade = await fetch(`${baseUrl}/api/v1/channels/whatsapp/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenX}` },
      body: JSON.stringify({
        displayName: "Tenant X Line 2",
        phoneNumber: "+919909000012",
        phoneNumberId: line2Id
      })
    });
    assert.equal(res2AfterUpgrade.status, 201);
  });

  test("3. DB-verified /api/health readiness check echoes x-request-id and reports connected latency", async () => {
    const traceId = "req-l9-trace-" + Date.now();
    const res = await fetch(`${baseUrl}/api/health`, {
      headers: { "x-request-id": traceId }
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-request-id"), traceId);
    const body = await res.json();
    assert.equal(body.status, "healthy");
    assert.equal(body.database, "connected");
    assert.equal(body.requestId, traceId);
    assert.ok(typeof body.dbLatencyMs === "number" && body.dbLatencyMs >= 0);
    assert.ok(typeof body.uptimeSeconds === "number" && body.uptimeSeconds >= 0);

    const entry = logEvent("info", "l9_health_probe", { traceId });
    assert.equal(entry.event, "l9_health_probe");
    assert.equal(entry.traceId, traceId);

    // Phase 9 SRE probes (/livez, /readyz, /metrics)
    const liveRes = await fetch(`${baseUrl}/livez`);
    assert.equal(liveRes.status, 200);
    assert.equal((await liveRes.json()).status, "alive");

    const readyRes = await fetch(`${baseUrl}/readyz`);
    assert.equal(readyRes.status, 200);
    assert.equal((await readyRes.json()).database, "connected");

    const metricsRes = await fetch(`${baseUrl}/metrics`);
    assert.equal(metricsRes.status, 200);
    const metricsBody = await metricsRes.text();
    assert.match(metricsBody, /process_uptime_seconds/);
    assert.match(metricsBody, /survya_job_queue_pending/);
  });

  test("4. Hot composite tenant indexes exist across campaigns, messages, ledger, sessions, consents & jobs", () => {
    const checks = [
      ["campaigns", "idx_campaigns_tenant_created"],
      ["whatsapp_messages", "idx_wa_messages_tenant_created"],
      ["whatsapp_usage_ledger", "idx_wa_usage_tenant_created"],
      ["conversation_flow_sessions", "idx_conv_flow_sessions_tenant_status"],
      ["contact_consents", "idx_contact_consents_tenant_contact"],
      ["workflow_scheduled_jobs", "idx_workflow_jobs_due"]
    ];
    for (const [table, idxName] of checks) {
      const idx = db.prepare(`SHOW INDEX FROM ${table} WHERE Key_name = ?`).all(idxName);
      assert.ok(idx.length >= 1, `Missing composite index ${idxName} on ${table}`);
    }
  });

  test("5. Security hardening: unauthenticated /v1/orders/:id blocked, custom template delete scoped, and admin routes guarded", async () => {
    // Unauthenticated /v1/orders/:id rejected with 401
    const unauthOrd = await fetch(`${baseUrl}/api/v1/orders/99999`);
    assert.equal(unauthOrd.status, 401);

    // Employee token in Tenant Y blocked from master mutations and flow approvals decision
    const empUserId = `usr_l9_emp_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Emp L9', ?, 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(empUserId, tenantYId, `emp_l9_${Date.now()}@test.local`);
    db.prepare("INSERT INTO tenant_user_memberships (tenant_id, user_id, role) VALUES (?, ?, 'USER')").run(tenantYId, empUserId);
    const empTokenY = jwt.sign(
      { id: empUserId, userId: empUserId, tenant_id: tenantYId, role: "USER", workspace_role: "USER" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const masterWriteRes = await fetch(`${baseUrl}/api/v1/masters/seed-sector`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${empTokenY}` },
      body: JSON.stringify({ sector: "HOSPITALITY" })
    });
    assert.equal(masterWriteRes.status, 403);

    const approvalRes = await fetch(`${baseUrl}/api/v1/flows/conversation-flows/1/approvals/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${empTokenY}` },
      body: JSON.stringify({ decision: "APPROVE" })
    });
    assert.equal(approvalRes.status, 403);

    // Cross-tenant custom template deletion isolated (Tenant Y cannot delete Tenant X template)
    const tplXId = `tpl_l9_x_${Date.now()}`;
    db.prepare(`
      INSERT INTO templates (id, tenant_id, name, language, category, status, body_text)
      VALUES (?, ?, ?, 'en', 'MARKETING', 'DRAFT', 'Hi')
    `).run(tplXId, tenantXId, `tpl_x_${Date.now()}`);
    const delCross = await fetch(`${baseUrl}/api/templates/custom/${tplXId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenY}` }
    });
    assert.equal(delCross.status, 404);
    assert.ok(db.prepare("SELECT id FROM templates WHERE id = ?").get(tplXId));
  });
});
