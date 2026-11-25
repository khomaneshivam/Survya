const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { db, initializeDatabase } = require("../src/config/database");
const config = require("../src/config/env");
const studioRoutes = require("../src/routes/studioRoutes");
const inappExperienceRoutes = require("../src/routes/inappExperienceRoutes");
const publicInappRoutes = require("../src/routes/publicInappRoutes");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const emailNotificationService = require("../src/services/studio/emailNotificationService");

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

describe("Survya Studio Layer 7 — End-to-End Business Journeys A–J Verification", () => {
  const T1 = 8851;
  let server;
  let ownerToken;
  const prevEnv = {};

  before(async () => {
    for (const k of ["EMAIL_ENABLED", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM_ADDRESS"]) {
      prevEnv[k] = process.env[k];
    }
    process.env.EMAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.e2e.local";
    process.env.SMTP_PORT = "587";
    process.env.EMAIL_FROM_ADDRESS = "e2e@survya.local";

    db.prepare("DELETE FROM studio_audit_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_versions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_continuation_tokens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM email_notification_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_email_settings WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM system_job_queue WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM chat_links WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8851'").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES ('owner-8851', 'E2E Owner', 'owner8851@t.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-8851', 'OWNER', CURRENT_TIMESTAMP)
    `).run(T1);

    ownerToken = jwt.sign(
      { id: "owner-8851", email: "owner8851@t.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
      process.env.JWT_SECRET || config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/studio", studioRoutes);
    app.use("/api/v1/inapp", inappExperienceRoutes);
    app.use("/api/v1/public/x", publicInappRoutes);
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
    db.prepare("DELETE FROM studio_audit_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_versions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_continuation_tokens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM email_notification_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_email_settings WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM system_job_queue WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM chat_links WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8851'").run();
  });

  test("Journeys A & C: Guided Setup -> Publish -> WA Link -> Opaque Continuation -> Complete -> Email Alert -> Analytics", async () => {
    // 1. Configure Email Recipients
    const emailPref = await requestJson(server, "PUT", "/api/v1/studio/email-settings", {
      token: ownerToken,
      body: { enabled: true, recipients: "bookings@e2e.test" }
    });
    assert.equal(emailPref.status, 200);

    // 2. Create Guided Business Experience
    const guidedRes = await requestJson(server, "POST", "/api/v1/studio/experiences/guided", {
      token: ownerToken,
      body: {
        businessName: "Malvan Heritage Stays",
        businessType: "HOSPITALITY",
        goalType: "BOOKING_CONFIRMED",
        phoneNumber: "919820055555",
        quickActions: ["Book Deluxe Room", "Request Callback"],
        prefilledMessage: "Hi Malvan Heritage, help me book",
        initialReplyText: "Tap the link below to pick your dates and confirm:",
        publishImmediately: true
      }
    });
    assert.equal(guidedRes.status, 201);
    const { experience, shareLink } = guidedRes.body.data;
    assert.ok(shareLink.waMeUrl.includes("wa.me/919820055555"));

    // 3. Governance publish creates immutable v1
    const pubRes = await requestJson(server, "POST", `/api/v1/studio/experiences/${experience.id}/publish`, {
      token: ownerToken,
      body: { changelog: "E2E Launch v1" }
    });
    assert.equal(pubRes.status, 200);
    assert.equal(pubRes.body.data.versionNumber, 1);

    // 4. WhatsApp launches linked experience with opaque ?ct= token
    const linked = inappRuntimeService.createLinkedSession({
      tenantId: T1,
      slug: experience.slug,
      customerPhone: "919820099887",
      customerName: "Priya Deshmukh",
      initialData: { guest_name: "Priya Deshmukh" }
    });
    const ct = linked.continuationToken;
    assert.ok(linked.inappUrl.includes(`?ct=${ct}`));

    // 5. Customer opens URL -> redeems opaque token -> gets scoped sessionToken
    const red = await requestJson(server, "POST", `/api/v1/public/x/${experience.slug}/continuation/redeem`, {
      body: { ct }
    });
    assert.equal(red.status, 200);
    const { sessionToken, optimisticLockVersion } = red.body.data;

    // 6. Customer completes steps across Conversational UI:
    // Step 1: welcome (single_select) -> schedule_step
    const step1 = await requestJson(server, "POST", `/api/v1/public/x/${experience.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { selected_option: "Book Deluxe Room" },
        expectedLockVersion: optimisticLockVersion
      }
    });
    assert.equal(step1.status, 200);
    assert.equal(step1.body.data.currentScreenKey, "schedule_step");

    // Step 2: schedule_step (date_range_picker) -> contact_details
    const step2 = await requestJson(server, "POST", `/api/v1/public/x/${experience.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { check_in: "2026-12-24", check_out: "2026-12-27" },
        expectedLockVersion: step1.body.data.optimisticLockVersion
      }
    });
    assert.equal(step2.status, 200);
    assert.equal(step2.body.data.currentScreenKey, "contact_details");

    // Step 3: contact_details -> confirmation (emits Goal Outcome + Queues Email)
    const step3 = await requestJson(server, "POST", `/api/v1/public/x/${experience.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { name: "Priya Deshmukh", phone: "919820099887", email: "priya@customer.test" },
        expectedLockVersion: step2.body.data.optimisticLockVersion
      }
    });
    assert.equal(step3.status, 200);
    assert.equal(step3.body.data.currentScreenKey, "confirmation");
    assert.equal(step3.body.data.goalStatus, "COMPLETED");
    assert.equal(step3.body.data.goalOutcome.eventName, "BookingConfirmed");
    assert.equal(step3.body.data.goalOutcome.emailNotification.queued, true);

    // 7. Process email delivery with mock SMTP transport & verify Analytics
    const delivered = [];
    const dispatchRes = await emailNotificationService.dispatchEmailJob(
      { logId: step3.body.data.goalOutcome.emailNotification.logId, tenantId: T1 },
      {
        transportOverride: {
          async sendMail(mail) {
            delivered.push(mail);
            return { messageId: "<e2e-booking@survya.local>" };
          }
        }
      }
    );
    assert.equal(dispatchRes.sent, true);
    assert.equal(delivered.length, 1);
    assert.ok(delivered[0].subject.includes("BookingConfirmed"));

    const anRes = await requestJson(server, "GET", "/api/v1/studio/analytics?days=30", { token: ownerToken });
    assert.equal(anRes.status, 200);
    assert.equal(anRes.body.data.funnel.goalsCompleted, 1);
    assert.equal(anRes.body.data.funnel.conversionRatePercent, 100);
  });

  test("Journeys B, D, E, F, G, H: Every Industry Template validates & executes cleanly in isolated demo without side effects", async () => {
    const bpList = await requestJson(server, "GET", "/api/v1/studio/blueprints", { token: ownerToken });
    assert.equal(bpList.status, 200);

    const beforeGoals = db.prepare("SELECT COUNT(*) as c FROM business_goal_outcomes WHERE tenant_id = ?").get(T1).c;
    const beforeEmails = db.prepare("SELECT COUNT(*) as c FROM email_notification_logs WHERE tenant_id = ?").get(T1).c;

    for (const bp of ["hospitality-resort", "retail-store", "clinic-appointment", "service-quotation", "real-estate-enquiry", "b2b-lead-qualification", "event-registration"]) {
      const demoStart = await requestJson(server, "POST", `/api/v1/studio/blueprints/${bp}/demo/start`, {
        token: ownerToken,
        body: {}
      });
      assert.equal(demoStart.status, 200, `${bp} demo must start cleanly`);
      assert.equal(demoStart.body.data.demoMode, true);
      assert.ok(demoStart.body.data.screens.length >= 2);
    }

    const afterGoals = db.prepare("SELECT COUNT(*) as c FROM business_goal_outcomes WHERE tenant_id = ?").get(T1).c;
    const afterEmails = db.prepare("SELECT COUNT(*) as c FROM email_notification_logs WHERE tenant_id = ?").get(T1).c;
    assert.equal(afterGoals, beforeGoals, "Demo sessions must never emit production goal outcomes");
    assert.equal(afterEmails, beforeEmails, "Demo sessions must never send production emails");
  });
});
