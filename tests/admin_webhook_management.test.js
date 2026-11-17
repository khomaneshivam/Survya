const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db, getSetting, setSetting } = require("../src/config/database");
const apiRoutes = require("../src/routes/apiRoutes");
const adminRoutes = require("../src/routes/adminRoutes");
const webhookService = require("../src/services/webhookService");

describe("Admin-Only Webhook URL & Token Management Test Suite", () => {
  let server = null;
  let baseUrl = null;
  let adminToken = null;
  let userToken = null;
  let savedVerifyToken = null;
  let savedPublicUrl = null;

  before(async () => {
    savedVerifyToken = getSetting("WEBHOOK_VERIFY_TOKEN");
    savedPublicUrl = getSetting("PUBLIC_WEBHOOK_URL");

    // Ensure Admin & Regular user exist in DB
    let admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (!admin) {
      const adminId = "admin_wh_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Webhook Admin', 'wh_admin@test.internal', '919999999981', 'hash', 'ADMIN', 'ACTIVE')
      `).run(adminId);
      admin = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    }
    adminToken = jwt.sign(
      { userId: admin.id, id: admin.id, email: admin.email, role: "ADMIN" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    let regular = db.prepare("SELECT * FROM users WHERE role = 'USER' LIMIT 1").get();
    if (!regular) {
      const regId = "user_wh_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Webhook Staff', 'wh_user@test.internal', '919999999982', 'hash', 'USER', 'ACTIVE')
      `).run(regId);
      regular = db.prepare("SELECT * FROM users WHERE id = ?").get(regId);
    }
    userToken = jwt.sign(
      { userId: regular.id, id: regular.id, email: regular.email, role: "USER" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
    app.use("/api", apiRoutes);
    // Public webhooks
    app.get("/webhook", (req, res) => require("../src/controllers/webhookController").handleVerification(req, res));
    app.post("/webhook", (req, res) => require("../src/controllers/webhookController").handleIncomingEvent(req, res));

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
    if (savedVerifyToken) setSetting("WEBHOOK_VERIFY_TOKEN", savedVerifyToken);
    if (savedPublicUrl !== undefined) setSetting("PUBLIC_WEBHOOK_URL", savedPublicUrl || "");
  });

  // =========================================================================
  // 1. RBAC PERIMETER TESTS (NON-ADMIN BLOCKED)
  // =========================================================================
  describe("1. RBAC Perimeter & Access Control", () => {
    test("Non-admin (USER) receives 403 Forbidden on GET /api/admin/webhooks/config", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/config`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /admin/i);
    });

    test("Non-admin (USER) receives 403 Forbidden on POST /api/admin/webhooks/generate-token", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/generate-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" }
      });
      assert.strictEqual(res.status, 403);
    });

    test("Non-admin (USER) receives 403 Forbidden on legacy GET /api/webhook/config", async () => {
      const res = await fetch(`${baseUrl}/api/webhook/config`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      assert.strictEqual(res.status, 403);
    });

    test("Non-admin (USER) receives 403 Forbidden on POST /api/webhook/test-handshake", async () => {
      const res = await fetch(`${baseUrl}/api/webhook/test-handshake`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" }
      });
      assert.strictEqual(res.status, 403);
    });

    test("Unauthenticated request receives 401 Unauthorized", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/config`);
      assert.strictEqual(res.status, 401);
    });
  });

  // =========================================================================
  // 2. ADMIN CONFIGURATION & UNMASKED TOKEN ACCESS
  // =========================================================================
  describe("2. Admin Configuration Retrieval", () => {
    test("Admin receives 200 OK with unmasked token and formatted callback URLs", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/config`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.verifyToken, "Verify token must be present");
      assert.ok(!data.data.verifyToken.includes("••••••••"), "Token must NOT be masked for admin");
      assert.ok(data.data.primaryUrl.endsWith("/webhook"));
      assert.ok(data.data.altUrl.endsWith("/api/webhook"));
      assert.ok(Array.isArray(data.data.subscriptionFields));
      assert.ok(data.data.subscriptionFields.includes("messages"));
    });
  });

  // =========================================================================
  // 3. SYSTEM TOKEN GENERATION & AUDIT LOGGING
  // =========================================================================
  describe("3. System Token Generation & Rotation", () => {
    let generatedToken = null;

    test("Generates high-entropy wb_live_ token and records audit log", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/generate-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.data.verifyToken.startsWith("wb_live_"), "Token must start with wb_live_ prefix");
      assert.ok(data.data.verifyToken.length >= 24, "Token must be high entropy (>= 24 chars)");
      generatedToken = data.data.verifyToken;

      // Verify token persisted in settings
      const dbToken = getSetting("WEBHOOK_VERIFY_TOKEN");
      assert.strictEqual(dbToken, generatedToken);

      // Verify audit log created
      const audit = db.prepare(`
        SELECT * FROM audit_logs 
        WHERE action = 'WEBHOOK_TOKEN_ROTATED' 
        ORDER BY id DESC LIMIT 1
      `).get();
      assert.ok(audit, "Audit log must be recorded");
      assert.strictEqual(audit.target_id, "WEBHOOK_VERIFY_TOKEN");
    });

    test("Meta handshake succeeds with newly generated token (hub.challenge echo)", async () => {
      assert.ok(generatedToken, "Must have generated token from previous test");
      const testChallenge = "meta_handshake_challenge_998877";

      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.challenge=${testChallenge}&hub.verify_token=${encodeURIComponent(generatedToken)}`
      );
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.strictEqual(text, testChallenge, "Challenge must be echoed back to Meta");
    });

    test("Meta handshake fails with 403 Forbidden when token is invalid", async () => {
      const res = await fetch(
        `${baseUrl}/webhook?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=wrong_token_xyz`
      );
      assert.strictEqual(res.status, 403);
    });
  });

  // =========================================================================
  // 4. HANDSHAKE TEST SIMULATOR & CUSTOM TOKEN
  // =========================================================================
  describe("4. Handshake Simulator & Custom Token", () => {
    test("POST /api/admin/webhooks/test-handshake returns success and challenge verification", async () => {
      const res = await fetch(`${baseUrl}/api/admin/webhooks/test-handshake`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.challengeEchoed, true);
      assert.ok(typeof data.data.latencyMs === "number");
    });

    test("Saves valid custom verify token and rejects too short tokens", async () => {
      // Rejects short token (< 8 chars)
      const badRes = await fetch(`${baseUrl}/api/admin/webhooks/save-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ verifyToken: "short" })
      });
      assert.strictEqual(badRes.status, 400);

      // Saves valid custom token
      const customToken = "custom_wb_token_secure_999";
      const goodRes = await fetch(`${baseUrl}/api/admin/webhooks/save-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ verifyToken: customToken })
      });
      assert.strictEqual(goodRes.status, 200);
      const data = await goodRes.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.verifyToken, customToken);

      // Verify handshake with custom token
      const handshake = webhookService.testHandshake(customToken);
      assert.strictEqual(handshake.success, true);
    });
  });

  // =========================================================================
  // 5. PUBLIC WEBHOOK URL OVERRIDE
  // =========================================================================
  describe("5. Public Webhook URL Override", () => {
    test("Sets and resets custom public URL override", async () => {
      const customHost = "https://webhook.sarvya-enterprise.com";
      const res = await fetch(`${baseUrl}/api/admin/webhooks/url-override`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ publicUrl: customHost })
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.primaryUrl, `${customHost}/webhook`);
      assert.strictEqual(data.data.isCustomOverride, true);

      // Reset
      const resetRes = await fetch(`${baseUrl}/api/admin/webhooks/url-override`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ publicUrl: "" })
      });
      assert.strictEqual(resetRes.status, 200);
      const resetData = await resetRes.json();
      assert.strictEqual(resetData.data.isCustomOverride, false);
    });
  });
});
