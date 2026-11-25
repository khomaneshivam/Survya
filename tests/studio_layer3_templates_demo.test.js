const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { db, initializeDatabase } = require("../src/config/database");
const config = require("../src/config/env");
const studioRoutes = require("../src/routes/studioRoutes");
const industryBlueprintService = require("../src/services/studio/industryBlueprintService");

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

describe("Survya Studio Layer 3 — Industry Library, Extensibility & Isolated Try Demo", () => {
  const T1 = 8821;
  let server;
  let ownerToken;

  before(async () => {
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8821'").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES ('owner-8821', 'Studio L3 Owner', 'owner8821@t.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-8821', 'OWNER', CURRENT_TIMESTAMP)
    `).run(T1);

    ownerToken = jwt.sign(
      { id: "owner-8821", email: "owner8821@t.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
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
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(T1);
    db.prepare("DELETE FROM users WHERE id = 'owner-8821'").run();
  });

  test("1. TC-015 & TC-017: Extensible blueprints list + new custom blueprint plugin registers without core changes", async () => {
    industryBlueprintService.registerBlueprint({
      key: "automotive-test-drive",
      title: "Automotive Test Drive Concierge",
      industry: "SERVICES",
      category: "APPOINTMENT",
      goalType: "APPOINTMENT_CONFIRMED",
      goalLabel: "Test Drive Scheduled",
      description: "Book a showroom or doorstep test drive.",
      defaultWelcome: "Choose your model and preferred test-drive date.",
      demoCatalog: [],
      steps: [
        { screenKey: "welcome", title: "Pick Model", screenType: "HERO_WELCOME", config: { componentType: "single_select", options: ["EV SUV", "Sedan"] }, navigationRules: { defaultNext: "confirmation" } },
        { screenKey: "confirmation", title: "Scheduled", screenType: "CONFIRMATION", config: { componentType: "success_receipt" } }
      ]
    });

    const listRes = await requestJson(server, "GET", "/api/v1/studio/blueprints", { token: ownerToken });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.data.length >= 8, "Should include all 7 built-in blueprints + extensible custom plugin");
    assert.ok(listRes.body.data.some((b) => b.key === "hospitality-resort"));
    assert.ok(listRes.body.data.some((b) => b.key === "automotive-test-drive"));
  });

  test("2. TC-016: Real interactive Try Demo walks through multi-step validation cleanly with ZERO production DB side effects", async () => {
    const beforeSessCount = db.prepare("SELECT COUNT(*) as c FROM inapp_sessions WHERE tenant_id = ?").get(T1).c;

    const startRes = await requestJson(server, "POST", "/api/v1/studio/blueprints/hospitality-resort/demo/start", {
      token: ownerToken,
      body: {}
    });
    assert.equal(startRes.status, 200);
    const { demoToken, demoMode, catalogItems } = startRes.body.data;
    assert.equal(demoMode, true);
    assert.ok(demoToken.startsWith("demo_"));
    assert.ok(catalogItems.length >= 2);

    // Step 1 -> dates
    const s1 = await requestJson(server, "POST", "/api/v1/studio/blueprints/hospitality-resort/demo/navigate", {
      token: ownerToken,
      body: { demoToken, fromScreenKey: "welcome", action: "NEXT", formValues: { intent: "Book a Stay" } }
    });
    assert.equal(s1.status, 200);
    assert.equal(s1.body.data.currentScreenKey, "dates");

    // Step 2 invalid date range blocked cleanly (422)
    const badDate = await requestJson(server, "POST", "/api/v1/studio/blueprints/hospitality-resort/demo/navigate", {
      token: ownerToken,
      body: { demoToken, fromScreenKey: "dates", action: "NEXT", formValues: { check_in: "2026-12-10", check_out: "2026-12-08" } }
    });
    assert.equal(badDate.status, 422);

    // Step 2 valid date range -> catalog
    const s2 = await requestJson(server, "POST", "/api/v1/studio/blueprints/hospitality-resort/demo/navigate", {
      token: ownerToken,
      body: { demoToken, fromScreenKey: "dates", action: "NEXT", formValues: { check_in: "2026-12-08", check_out: "2026-12-10" } }
    });
    assert.equal(s2.status, 200);
    assert.equal(s2.body.data.currentScreenKey, "catalog");

    const afterSessCount = db.prepare("SELECT COUNT(*) as c FROM inapp_sessions WHERE tenant_id = ?").get(T1).c;
    assert.equal(afterSessCount, beforeSessCount, "Try Demo must leave zero rows in production inapp_sessions");
  });

  test("3. Cloning Industry Blueprint installs customizable draft experience into tenant workspace", async () => {
    const res = await requestJson(server, "POST", "/api/v1/studio/blueprints/clinic-appointment/install", {
      token: ownerToken,
      body: { businessName: "Hope Care Clinic" }
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.domain_type, "HEALTHCARE");
    assert.equal(res.body.data.goal_type, "APPOINTMENT_CONFIRMED");
    assert.ok(res.body.data.screens.length >= 5);
  });
});
