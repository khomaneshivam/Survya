const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { db, initializeDatabase } = require("../src/config/database");
const config = require("../src/config/env");
const inappExperienceService = require("../src/services/inapp/inappExperienceService");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");
const continuationTokenService = require("../src/services/studio/continuationTokenService");
const registry = require("../src/services/studio/conversationalComponentRegistry");
const inappBridgeExecutor = require("../src/services/workflow/nodeExecutors/inappBridgeExecutor");
const inappExperienceRoutes = require("../src/routes/inappExperienceRoutes");
const publicInappRoutes = require("../src/routes/publicInappRoutes");

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
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => { raw += chunk; });
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

describe("Survya Studio Layer 1 — Conversational Experience Foundation", () => {
  const createdBy = "layer1_test_suite";
  const T1 = 8801;
  const T2 = 8802;
  let server;
  let ownerToken;
  let employeeToken;
  let expT1;
  let expT2;

  before(async () => {
    db.prepare("DELETE FROM experience_continuation_tokens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM users WHERE id IN ('owner-t1', 'emp-t1')").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES
        ('owner-t1', 'Owner T1', 'owner@t1.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP),
        ('emp-t1', 'Employee T1', 'emp@t1.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1, T1);

    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-t1', 'OWNER', CURRENT_TIMESTAMP),
             (?, 'emp-t1', 'STAFF', CURRENT_TIMESTAMP)
    `).run(T1, T1);

    expT1 = inappExperienceService.createExperience({
      name: "Layer1 Resort Chat Experience",
      slug: `layer1-resort-${Date.now()}`,
      domain_type: "HOSPITALITY",
      status: "PUBLISHED",
      entry_screen_key: "welcome"
    }, T1, createdBy);

    inappExperienceService.createScreen(expT1.id, {
      screen_key: "welcome",
      title: "Welcome to Coastal Villas",
      subtitle: "Select how we can help you today",
      screen_type: "HERO_WELCOME",
      config_json: {
        componentType: "single_select",
        outputKey: "intent",
        options: ["Book Stay", "Ask Quotation"]
      },
      navigation_rules_json: { defaultNext: "guests_email" }
    }, T1, createdBy);

    inappExperienceService.createScreen(expT1.id, {
      screen_key: "guests_email",
      title: "Where should we send your confirmation?",
      subtitle: "Enter your best email address",
      screen_type: "INFO",
      config_json: {
        componentType: "email_input",
        outputKey: "email",
        required: true
      },
      navigation_rules_json: { defaultNext: "confirmation" }
    }, T1, createdBy);

    inappExperienceService.createScreen(expT1.id, {
      screen_key: "confirmation",
      title: "Request Confirmed",
      subtitle: "We have received your booking request.",
      screen_type: "CONFIRMATION",
      config_json: { componentType: "success_receipt" }
    }, T1, createdBy);

    expT2 = inappExperienceService.createExperience({
      name: "Layer1 Tenant 2 Clinic",
      slug: `layer1-clinic-t2-${Date.now()}`,
      domain_type: "HEALTHCARE",
      status: "PUBLISHED",
      entry_screen_key: "welcome"
    }, T2, createdBy);

    inappExperienceService.createScreen(expT2.id, {
      screen_key: "welcome",
      title: "Clinic Welcome",
      screen_type: "HERO_WELCOME"
    }, T2, createdBy);

    const jwtSecret = process.env.JWT_SECRET || config.JWT_SECRET;
    ownerToken = jwt.sign(
      { id: "owner-t1", email: "owner@t1.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
      jwtSecret,
      { expiresIn: "1h" }
    );
    employeeToken = jwt.sign(
      { id: "emp-t1", email: "emp@t1.local", role: "USER", workspace_role: "AGENT", tenant_id: T1 },
      jwtSecret,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use("/api/v1/inapp", inappExperienceRoutes);
    app.use("/api/v1/public/x", publicInappRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    db.prepare("DELETE FROM experience_continuation_tokens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM users WHERE id IN ('owner-t1', 'emp-t1')").run();
  });

  test("1. Workspace Owner RBAC: OWNER accesses Studio API (200) while plain employee is denied (403)", async () => {
    const ownerRes = await requestJson(server, "GET", "/api/v1/inapp/experiences", { token: ownerToken });
    assert.equal(ownerRes.status, 200);
    assert.equal(ownerRes.body.success, true);
    assert.ok(ownerRes.body.data.some((e) => e.id === expT1.id));
    assert.ok(!ownerRes.body.data.some((e) => e.id === expT2.id), "Must isolate cross-tenant experiences");

    const empRes = await requestJson(server, "GET", "/api/v1/inapp/experiences", { token: employeeToken });
    assert.equal(empRes.status, 403);
  });

  test("2. TC-008 & TC-010: Opaque continuation token (?ct=) issued, stored hashed, redeemed atomically once, replay rejected", async () => {
    const bridgeOut = await inappBridgeExecutor.execute(
      {
        id: "node_bridge",
        type: "OPEN_INAPP_EXPERIENCE",
        config: {
          experienceSlug: expT1.slug,
          waitForCompletion: true
        }
      },
      {
        tenantId: T1,
        recipientPhone: "919820012345",
        session: {
          id: 5001,
          sender_phone: "919820012345",
          guest_name: "Asha Mehta",
          check_in: "2026-12-20"
        },
        isWaitingForThisNode: false
      }
    );

    assert.equal(bridgeOut.action, "WAIT_FOR_INPUT");
    const urlMatch = String(bridgeOut.updatedData.inapp_url).match(/\?ct=([A-Za-z0-9_-]+)/);
    assert.ok(urlMatch, "Linked bridge URL must use opaque ?ct= continuation token");
    const rawCt = urlMatch[1];

    // Verify database does NOT contain plaintext continuation token
    const storedTokenRow = db.prepare("SELECT * FROM experience_continuation_tokens WHERE token_hash = ?")
      .get(continuationTokenService.hashToken(rawCt));
    assert.ok(storedTokenRow, "SHA-256 token hash row must exist");
    assert.notEqual(storedTokenRow.token_prefix, rawCt, "Prefix must not equal raw token");

    // Concurrent double-redemption: strictly 1 succeeds, 1 fails with 401
    const [r1, r2] = await Promise.all([
      requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/continuation/redeem`, { body: { ct: rawCt } }),
      requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/continuation/redeem`, { body: { ct: rawCt } })
    ]);

    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 401], "Concurrent single-use continuation redemption must allow strictly once");

    const okRes = r1.status === 200 ? r1 : r2;
    const failRes = r1.status === 401 ? r1 : r2;
    assert.equal(okRes.body.data.channelOwner, "SURVYA");
    assert.equal(okRes.body.data.stateData.check_in, "2026-12-20");
    assert.ok(okRes.body.data.sessionToken.startsWith("csess_"));
    assert.equal(failRes.body.code, "CONTINUATION_TOKEN_REPLAYED");
  });

  test("3. TC-009, TC-011 & TC-012: Expired, revoked, and cross-tenant continuation tokens are denied", async () => {
    const expiredCt = continuationTokenService.issueContinuationToken({
      tenantId: T1,
      experienceId: expT1.id,
      contactPhone: "919820012345",
      ttlMinutes: 10
    });
    db.prepare("UPDATE experience_continuation_tokens SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) WHERE id = ?")
      .run(expiredCt.id);

    const expRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/continuation/redeem`, {
      body: { ct: expiredCt.continuationToken }
    });
    assert.equal(expRes.status, 401);
    assert.equal(expRes.body.code, "CONTINUATION_TOKEN_EXPIRED");

    const crossTenantRes = await requestJson(server, "POST", `/api/v1/public/x/${expT2.slug}/continuation/redeem`, {
      body: { ct: continuationTokenService.issueContinuationToken({ tenantId: T1, experienceId: expT1.id }).continuationToken }
    });
    assert.equal(crossTenantRes.status, 403);

    const revokedCt = continuationTokenService.issueContinuationToken({
      tenantId: T1,
      experienceId: expT1.id
    });
    continuationTokenService.revokeContinuationTokens({
      tenantId: T1,
      inappSessionId: null
    });
    db.prepare("UPDATE experience_continuation_tokens SET revoked_at = UTC_TIMESTAMP() WHERE id = ?").run(revokedCt.id);
    const revRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/continuation/redeem`, {
      body: { ct: revokedCt.continuationToken }
    });
    assert.equal(revRes.status, 401);
  });

  test("4. TC-013, TC-014 & TC-036: Conversational Registry validation, XSS strip, optimistic lock CAS, & channel handoff", async () => {
    // Registry coverage & XSS guard
    const components = registry.getRegisteredComponents();
    assert.ok(components.length >= 25, "Component registry must define all required conversational widgets");
    const badCfg = registry.validateComponentStepConfig("image_message", { imageUrl: "javascript:alert(1)" });
    assert.equal(badCfg.valid, false);
    const cleaned = registry.sanitizePayloadValue({ note: "<script>alert(1)</script>Hello" });
    assert.equal(cleaned.note, "Hello");

    const sessRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/session`, {
      body: { contactPhone: "919820099999", contactName: "Rohan" }
    });
    assert.equal(sessRes.status, 200);
    const { sessionToken, optimisticLockVersion, transcript } = sessRes.body.data;
    assert.ok(Array.isArray(transcript) && transcript.length >= 1);

    // Step 1 -> email_input step
    const nav1 = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { intent: "Book Stay" },
        expectedLockVersion: optimisticLockVersion
      }
    });
    assert.equal(nav1.status, 200);
    assert.equal(nav1.body.data.currentScreenKey, "guests_email");
    assert.equal(nav1.body.data.optimisticLockVersion, optimisticLockVersion + 1);

    // Stale lock version rejected with 409 Conflict
    const staleRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { email: "rohan@example.com" },
        expectedLockVersion: optimisticLockVersion // intentionally stale
      }
    });
    assert.equal(staleRes.status, 409);
    assert.equal(staleRes.body.code, "CONCURRENT_SESSION_UPDATE");

    // Invalid email blocked cleanly by Component Registry validation (422)
    const badEmailRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { email: "not-an-email" },
        expectedLockVersion: nav1.body.data.optimisticLockVersion
      }
    });
    assert.equal(badEmailRes.status, 422);
    assert.ok(badEmailRes.body.fieldErrors?.email);

    // Valid email transitions cleanly and emits transcript
    const nav2 = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { email: "rohan@example.com" },
        expectedLockVersion: nav1.body.data.optimisticLockVersion
      }
    });
    assert.equal(nav2.status, 200);
    assert.equal(nav2.body.data.currentScreenKey, "confirmation");
    assert.equal(nav2.body.data.channelOwner, "WHATSAPP");

    // Explicit channel switch to HUMAN
    const swRes = await requestJson(server, "POST", `/api/v1/public/x/${expT1.slug}/channel-switch`, {
      body: { sessionToken, targetChannel: "HUMAN", note: "Customer clicked support" }
    });
    assert.equal(swRes.status, 200);
    assert.equal(swRes.body.data.channelOwner, "HUMAN");
  });
});
