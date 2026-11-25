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

describe("Survya Studio Layers 5 & 6 — Governance, Immutable Versioning, Rollback & Analytics", () => {
  const T1 = 8841;
  let server;
  let ownerToken;
  let exp;
  let welcomeScreenId;

  before(async () => {
    db.prepare("DELETE FROM studio_audit_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_versions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8841'").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES ('owner-8841', 'Studio L5 Owner', 'owner8841@t.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-8841', 'OWNER', CURRENT_TIMESTAMP)
    `).run(T1);

    exp = inappExperienceService.createExperience({
      name: "Governance Resort Flow",
      slug: `gov-resort-${Date.now()}`,
      domain_type: "HOSPITALITY",
      status: "DRAFT",
      entry_screen_key: "welcome"
    }, T1, "owner-8841");

    // Require approval before publishing
    db.prepare("UPDATE inapp_experiences SET approval_required = 1, approval_state = 'PENDING' WHERE id = ?").run(exp.id);

    const w = inappExperienceService.createScreen(exp.id, {
      screen_key: "welcome",
      title: "v1 Welcome Step",
      screen_type: "HERO_WELCOME",
      navigation_rules_json: { defaultNext: "missing_step" } // invalid initially!
    }, T1, "owner-8841");
    welcomeScreenId = w.id;

    inappExperienceService.createScreen(exp.id, {
      screen_key: "confirmation",
      title: "v1 Confirmation",
      screen_type: "CONFIRMATION",
      config_json: { componentType: "success_receipt" }
    }, T1, "owner-8841");

    ownerToken = jwt.sign(
      { id: "owner-8841", email: "owner8841@t.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
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
    if (server) await new Promise((resolve) => server.close(resolve));
    db.prepare("DELETE FROM studio_audit_logs WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM experience_versions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM business_goal_outcomes WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8841'").run();
  });

  test("1. TC-032 & TC-034: Validation rejects broken target, approval gate blocks publish, approve + publish creates v1", async () => {
    const valBad = await requestJson(server, "GET", `/api/v1/studio/experiences/${exp.id}/validate`, { token: ownerToken });
    assert.equal(valBad.status, 200);
    assert.equal(valBad.body.data.valid, false);
    assert.ok(valBad.body.data.errors.some((e) => e.includes("missing_step")));

    const pubFail = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/publish`, { token: ownerToken });
    assert.equal(pubFail.status, 422);

    // Fix navigation link to confirmation
    inappExperienceService.updateScreen(welcomeScreenId, {
      navigation_rules_json: { defaultNext: "confirmation" }
    }, T1, "owner-8841");

    // Still unapproved -> 409 APPROVAL_REQUIRED
    const pubUnapproved = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/publish`, { token: ownerToken });
    assert.equal(pubUnapproved.status, 409);
    assert.equal(pubUnapproved.body.code, "APPROVAL_REQUIRED");

    // Approve & Publish v1
    const appRes = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/approve`, {
      token: ownerToken,
      body: { notes: "LGTM" }
    });
    assert.equal(appRes.status, 200);

    const pubV1 = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/publish`, {
      token: ownerToken,
      body: { changelog: "Initial v1 release" }
    });
    assert.equal(pubV1.status, 200);
    assert.equal(pubV1.body.data.versionNumber, 1);
  });

  test("2. TC-033 & TC-034 & TC-037: Active v1 session remains pinned when v2 publishes, rollback restores v1, analytics accurate", async () => {
    // Customer starts session pinned to v1
    const sV1 = inappRuntimeService.startOrResumeSession(exp.slug, {
      contactPhone: "919820011122",
      contactName: "Pinned Guest"
    });

    // Update draft & publish v2 with different title
    inappExperienceService.updateScreen(welcomeScreenId, {
      title: "v2 Updated Welcome"
    }, T1, "owner-8841");
    const pubV2 = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/publish`, {
      token: ownerToken,
      body: { changelog: "Updated copy v2" }
    });
    assert.equal(pubV2.status, 200);
    assert.equal(pubV2.body.data.versionNumber, 2);

    // Verify new public requests see v2, while existing pinned session finishes safely on v1 snapshot
    const publicV2 = inappRuntimeService.getPublicExperience(exp.slug);
    assert.equal(publicV2.screens[0].title, "v2 Updated Welcome");

    const navV1 = inappRuntimeService.navigateSession(exp.slug, {
      sessionToken: sV1.sessionToken,
      fromScreenKey: "welcome",
      action: "NEXT"
    });
    assert.equal(navV1.goalStatus, "COMPLETED");

    // Rollback to v1
    const rbRes = await requestJson(server, "POST", `/api/v1/studio/experiences/${exp.id}/rollback`, {
      token: ownerToken,
      body: { versionNumber: 1 }
    });
    assert.equal(rbRes.status, 200);
    assert.equal(rbRes.body.data.versionNumber, 1);

    const publicAfterRb = inappRuntimeService.getPublicExperience(exp.slug);
    assert.equal(publicAfterRb.screens[0].title, "v1 Welcome Step");

    // Analytics & Audit checks (demo session excluded from live count)
    inappRuntimeService.startOrResumeSession(exp.slug, { demoMode: true });
    const [anRes, auRes] = await Promise.all([
      requestJson(server, "GET", "/api/v1/studio/analytics?days=30", { token: ownerToken }),
      requestJson(server, "GET", `/api/v1/studio/audit-logs?experienceId=${exp.id}`, { token: ownerToken })
    ]);

    assert.equal(anRes.status, 200);
    assert.equal(anRes.body.data.funnel.chatLaunches, 1);
    assert.equal(anRes.body.data.funnel.demoSessionsExcluded, 1);
    assert.equal(anRes.body.data.funnel.goalsCompleted, 1);
    assert.equal(anRes.body.data.funnel.conversionRatePercent, 100);

    assert.equal(auRes.status, 200);
    const actions = auRes.body.data.map((a) => a.action);
    assert.ok(actions.includes("EXPERIENCE_APPROVED"));
    assert.ok(actions.includes("EXPERIENCE_PUBLISHED"));
    assert.ok(actions.includes("EXPERIENCE_ROLLED_BACK"));
  });
});
