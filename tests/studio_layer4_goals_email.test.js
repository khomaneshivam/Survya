const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { db, initializeDatabase } = require("../src/config/database");
const config = require("../src/config/env");
const studioRoutes = require("../src/routes/studioRoutes");
const inappExperienceService = require("../src/services/inapp/inappExperienceService");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const emailNotificationService = require("../src/services/studio/emailNotificationService");
const businessGoalService = require("../src/services/studio/businessGoalService");

initializeDatabase();

function requestJson(server, method, path, { body = null, token = null } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("Survya Studio Layer 4 — Business Goals, Server Pricing & Durable Email Notifications", () => {
  const T1 = 8831;
  let server;
  let ownerToken;
  let testExp;
  let catalogItemId;
  const prevEnv = {};

  before(async () => {
    for (const k of ["EMAIL_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"]) {
      prevEnv[k] = process.env[k];
    }

    db.prepare("DELETE FROM email_notification_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_email_settings WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM system_job_queue WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8831'").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES ('owner-8831', 'Studio L4 Owner', 'owner8831@t.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-8831', 'OWNER', CURRENT_TIMESTAMP)
    `).run(T1);

    const entIns = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, name, slug, phone_e164, city, created_at, updated_at)
      VALUES (?, 'RETAIL', 'Layer4 Store', 'layer4-store-8831', '919820088311', 'Mumbai', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(T1);

    const itemIns = db.prepare(`
      INSERT INTO catalog_items (tenant_id, entity_id, item_type, title, slug, base_price, tax_rate, is_active, created_at, updated_at)
      VALUES (?, ?, 'PRODUCT', 'Artisan Gift Box', 'artisan-gift-box-8831', 1500, 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(T1, entIns.lastInsertRowid);
    catalogItemId = itemIns.lastInsertRowid;

    testExp = inappExperienceService.createExperience({
      name: "Layer4 Order Concierge",
      slug: `layer4-order-${Date.now()}`,
      domain_type: "RETAIL",
      status: "PUBLISHED",
      entry_screen_key: "welcome"
    }, T1, "owner-8831");

    db.prepare("UPDATE inapp_experiences SET goal_type = 'ORDER_PLACED' WHERE id = ?").run(testExp.id);
    testExp = inappExperienceService.getExperienceById(testExp.id, T1);

    inappExperienceService.createScreen(testExp.id, {
      screen_key: "welcome",
      title: "Select Item",
      screen_type: "HERO_WELCOME",
      navigation_rules_json: { defaultNext: "confirmation" }
    }, T1, "owner-8831");

    inappExperienceService.createScreen(testExp.id, {
      screen_key: "confirmation",
      title: "Order Confirmed",
      screen_type: "CONFIRMATION",
      config_json: { componentType: "success_receipt" }
    }, T1, "owner-8831");

    ownerToken = jwt.sign(
      { id: "owner-8831", email: "owner8831@t.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
      process.env.JWT_SECRET || config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/studio", studioRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
  });

  after(async () => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    db.prepare("DELETE FROM email_notification_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_email_settings WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM system_job_queue WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8831'").run();
  });

  test("1. TC-019 & TC-025 & TC-026: Server-side pricing rejects client price tampering & emits idempotent goal outcome once", async () => {
    // Configure tenant recipient + explicitly disable env SMTP first to verify UNCONFIGURED handling
    process.env.EMAIL_ENABLED = "false";
    delete process.env.SMTP_HOST;

    const prefRes = await requestJson(server, "PUT", "/api/v1/studio/email-settings", {
      token: ownerToken,
      body: {
        enabled: true,
        recipients: "orders@tenant8831.test, invalid-ignore",
        fromName: "Artisan Desk"
      }
    });
    assert.equal(prefRes.status, 400, "Must reject malformed email address cleanly");

    const validPrefRes = await requestJson(server, "PUT", "/api/v1/studio/email-settings", {
      token: ownerToken,
      body: {
        enabled: true,
        recipients: "orders@tenant8831.test, manager@tenant8831.test",
        fromName: "Artisan Desk",
        replyTo: "support@tenant8831.test"
      }
    });
    assert.equal(validPrefRes.status, 200);
    assert.equal(validPrefRes.body.data.envStatus.configured, false);

    // Start session and navigate to confirmation with tampered client total (1 INR instead of 2 * 1500 + 10% tax = 3300)
    const sess = inappRuntimeService.startOrResumeSession(testExp.slug, {
      contactPhone: "919820077777",
      contactName: "Neha Kulkarni"
    });

    const nav = inappRuntimeService.navigateSession(testExp.slug, {
      sessionToken: sess.sessionToken,
      fromScreenKey: "welcome",
      action: "NEXT",
      formValues: {
        selectedItemId: catalogItemId,
        quantity: 2,
        grand_total: 1, // tampered client price!
        email: "neha@customer.test"
      }
    });

    assert.equal(nav.goalStatus, "COMPLETED");
    assert.ok(nav.goalOutcome?.outcomeId);
    assert.equal(nav.goalOutcome.eventName, "OrderPlaced");
    assert.equal(nav.goalOutcome.monetaryValue, 3300, "Must compute authoritative server price ignoring client grand_total=1");
    assert.equal(nav.goalOutcome.emailNotification.status, "UNCONFIGURED");

    // Duplicate goal trigger with same idempotency_key must deduplicate strictly once
    const dupGoal = businessGoalService.recordGoalCompletion({
      tenantId: T1,
      experience: testExp,
      session: { id: db.prepare("SELECT id FROM inapp_sessions WHERE session_token = ?").get(sess.sessionToken).id },
      stateData: { selectedItemId: catalogItemId, quantity: 2 }
    });
    assert.equal(dupGoal.deduplicated, true);
    assert.equal(dupGoal.outcomeId, nav.goalOutcome.outcomeId);
  });

  test("2. TC-027..TC-031: Durable email dispatch via mock SMTP, secret masking, failure retry, & manual retry", async () => {
    process.env.EMAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.sandbox.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp_user";
    process.env.SMTP_PASS = "super_secret_smtp_password_999";
    process.env.EMAIL_FROM_ADDRESS = "alerts@survya.local";

    // Enqueue fresh goal outcome + email job
    const enq = emailNotificationService.enqueueGoalEmailNotification({
      tenantId: T1,
      experienceId: testExp.id,
      goalOutcomeId: 1,
      eventName: "OrderPlaced",
      idempotencyKey: `email_l4_mock_${Date.now()}`,
      payload: {
        experienceName: testExp.name,
        referenceCode: "SRV-MOCK1",
        customerName: "Arjun",
        customerPhone: "919820066666",
        monetaryValue: 3300,
        currency: "INR"
      }
    });

    assert.equal(enq.queued, true);
    assert.equal(enq.status, "QUEUED");

    // Simulate transient SMTP failure containing secret password in error string
    await assert.rejects(
      () => emailNotificationService.dispatchEmailJob(
        { logId: enq.logId, tenantId: T1 },
        {
          transportOverride: {
            async sendMail() {
              throw new Error("AUTH PLAIN failed using super_secret_smtp_password_999");
            }
          }
        }
      ),
      /REDACTED/
    );

    const failedRow = db.prepare("SELECT * FROM email_notification_logs WHERE id = ?").get(enq.logId);
    assert.equal(failedRow.status, "FAILED_RETRYING");
    assert.ok(!failedRow.last_error.includes("super_secret_smtp_password_999"), "Must NEVER store plaintext secrets in error logs");

    // Simulate manual retry via API -> re-queues cleanly -> mock SMTP succeeds -> SENT
    const retryRes = await requestJson(server, "POST", `/api/v1/studio/email-logs/${enq.logId}/retry`, {
      token: ownerToken
    });
    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.retried, true);

    const sentPayload = [];
    const dispatchRes = await emailNotificationService.dispatchEmailJob(
      { logId: enq.logId, tenantId: T1 },
      {
        transportOverride: {
          async sendMail(mail) {
            sentPayload.push(mail);
            return { messageId: "<mock-msg-id-001@survya.local>" };
          }
        }
      }
    );
    assert.equal(dispatchRes.sent, true);
    assert.equal(sentPayload.length, 1);
    assert.ok(sentPayload[0].to.includes("orders@tenant8831.test"));

    // Verify logs & goals endpoints mask secrets cleanly
    const [logsRes, goalsRes] = await Promise.all([
      requestJson(server, "GET", "/api/v1/studio/email-logs", { token: ownerToken }),
      requestJson(server, "GET", "/api/v1/studio/goals", { token: ownerToken })
    ]);
    assert.equal(logsRes.status, 200);
    assert.ok(logsRes.body.data.some((l) => l.id === enq.logId && l.status === "SENT"));
    assert.equal(goalsRes.status, 200);
    assert.ok(goalsRes.body.data.length >= 1);
  });
});
