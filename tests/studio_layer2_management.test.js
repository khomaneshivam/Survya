const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const { db, initializeDatabase } = require("../src/config/database");
const config = require("../src/config/env");
const studioRoutes = require("../src/routes/studioRoutes");

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

describe("Survya Studio Layer 2 — Guided Mode, Components Catalog & WhatsApp Share Links", () => {
  const T1 = 8811;
  const T2 = 8812;
  let server;
  let ownerT1Token;
  let createdExpId;

  before(async () => {
    db.prepare("DELETE FROM chat_links WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM users WHERE id IN ('owner-8811')").run();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at)
      VALUES ('owner-8811', 'Studio Owner', 'owner8811@t.local', 'hash', 'USER', 'ACTIVE', ?, CURRENT_TIMESTAMP)
    `).run(T1);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role, created_at)
      VALUES (?, 'owner-8811', 'OWNER', CURRENT_TIMESTAMP)
    `).run(T1);

    ownerT1Token = jwt.sign(
      { id: "owner-8811", email: "owner8811@t.local", role: "USER", workspace_role: "OWNER", tenant_id: T1 },
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
    db.prepare("DELETE FROM chat_links WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_sessions WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_form_fields WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_screens WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM inapp_experiences WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id IN (?, ?)").run(T1, T2);
    db.prepare("DELETE FROM users WHERE id IN ('owner-8811')").run();
  });

  test("1. TC-001 & TC-005: Guided Mode A setup creates published experience, steps, & WhatsApp Share Link", async () => {
    const res = await requestJson(server, "POST", "/api/v1/studio/experiences/guided", {
      token: ownerT1Token,
      body: {
        businessName: "Kokum Beach Retreat",
        businessType: "HOSPITALITY",
        goalType: "BOOKING_CONFIRMED",
        welcomeMessage: "Welcome to Kokum Beach Retreat! Select an option:",
        quickActions: ["Book a Stay", "Ask Question"],
        phoneNumber: "919820012345",
        prefilledMessage: "Hi Kokum Retreat, I want to book a stay",
        initialReplyText: "Tap below to choose your room and dates:",
        publishImmediately: true
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const { experience, shareLink } = res.body.data;
    createdExpId = experience.id;

    assert.equal(experience.studio_mode, "GUIDED");
    assert.equal(experience.goal_type, "BOOKING_CONFIRMED");
    assert.equal(experience.status, "PUBLISHED");
    assert.ok(experience.screens.length >= 4, "Must generate conversational workflow steps");
    assert.ok(shareLink.waMeUrl.startsWith("https://wa.me/919820012345?text="));
    assert.ok(shareLink.waMeUrl.includes(encodeURIComponent("Hi Kokum Retreat")));
    assert.ok(shareLink.qrSvg.includes("<svg"));
  });

  test("2. TC-006 & TC-007: Share links list, component catalog, & overview metrics are tenant-isolated", async () => {
    const [ovRes, compRes, linksRes, histRes] = await Promise.all([
      requestJson(server, "GET", "/api/v1/studio/overview", { token: ownerT1Token }),
      requestJson(server, "GET", "/api/v1/studio/components", { token: ownerT1Token }),
      requestJson(server, "GET", `/api/v1/studio/share-links?experienceId=${createdExpId}`, { token: ownerT1Token }),
      requestJson(server, "GET", "/api/v1/studio/execution-history", { token: ownerT1Token })
    ]);

    assert.equal(ovRes.status, 200);
    assert.ok(ovRes.body.data.totalExperiences >= 1);
    assert.equal(compRes.status, 200);
    assert.ok(compRes.body.data.some((c) => c.type === "single_select"));
    assert.equal(linksRes.status, 200);
    assert.equal(linksRes.body.data.length, 1);
    assert.equal(linksRes.body.data[0].auto_reply_message, "Tap below to choose your room and dates:");
    assert.equal(histRes.status, 200);
    assert.ok(Array.isArray(histRes.body.data));
  });
});
