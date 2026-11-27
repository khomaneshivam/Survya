const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db, getSetting, setSetting } = require("../src/config/database");
const apiRoutes = require("../src/routes/apiRoutes");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");
const cryptoUtil = require("../src/utils/cryptoUtil");
const { closeAsyncPool } = require("../src/config/asyncDb");

describe("Permanent Meta Token Storage & Line Management Test Suite", () => {
  let server = null;
  let baseUrl = null;
  let adminToken = null;
  let originalFetch = null;
  const testPhoneId = "777888999111222";
  const testPermanentToken = "EAAVpermanentTestToken123456789";
  let savedGlobalApiToken = null;
  let savedGlobalPhoneId = null;

  before(async () => {
    originalFetch = global.fetch;
    savedGlobalApiToken = getSetting("WHATSAPP_API_TOKEN");
    savedGlobalPhoneId = getSetting("WHATSAPP_PHONE_NUMBER_ID");

    // Ensure Admin user exists
    let admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (!admin) {
      const adminId = "admin_perm_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Perm Admin', 'perm_admin@test.internal', '919999999993', 'hash', 'ADMIN', 'ACTIVE')
      `).run(adminId);
      admin = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    }
    adminToken = jwt.sign({ userId: admin.id, email: admin.email, role: "ADMIN" }, config.JWT_SECRET, { expiresIn: "1h" });

    // Seed test phone line in waba_phone_numbers
    db.prepare(`
      INSERT INTO waba_phone_numbers (
        id, display_name, phone_number, phone_number_id, waba_id, quality_rating, status, is_default, access_token, token_type
      ) VALUES (?, 'Test Perm Line', '+91 77788 89991', ?, 'waba_test', 'GREEN', 'VERIFIED', 0, ?, 'PERMANENT')
    `).run("waba_test_perm_line", testPhoneId, testPermanentToken);

    const app = express();
    app.use(express.json());
    app.use("/api", apiRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    global.fetch = originalFetch;
    if (server) server.close();
    try {
      db.prepare("DELETE FROM waba_phone_numbers WHERE phone_number_id = ?").run(testPhoneId);
    } catch (e) {}
    if (savedGlobalApiToken) setSetting("WHATSAPP_API_TOKEN", savedGlobalApiToken);
    if (savedGlobalPhoneId) setSetting("WHATSAPP_PHONE_NUMBER_ID", savedGlobalPhoneId);
    await closeAsyncPool();
  });

  test("1. resolveCredentials resolves line-specific permanent token from waba_phone_numbers", () => {
    const creds = metaWhatsAppService.resolveCredentials({ phoneNumberId: testPhoneId });
    assert.strictEqual(creds.phoneNumberId, testPhoneId);
    assert.strictEqual(creds.token, testPermanentToken);
  });

  test("2. resolveCredentials falls back to active token when line has no dedicated token", () => {
    const fallbackPhoneId = "555444333222111";
    const creds = metaWhatsAppService.resolveCredentials({ phoneNumberId: fallbackPhoneId });
    assert.strictEqual(creds.phoneNumberId, fallbackPhoneId);
    assert.ok(creds.token, "Should fall back to global token");
    assert.notStrictEqual(creds.token, testPermanentToken);
  });

  test("3. GET /api/phone-numbers exposes token metadata without leaking raw access_token", async () => {
    const res = await originalFetch(`${baseUrl}/api/phone-numbers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    
    const target = data.data.find(p => p.phone_number_id === testPhoneId);
    assert.ok(target, "Should find test phone number in list");
    assert.strictEqual(target.has_token, true);
    assert.strictEqual(target.token_type, "PERMANENT");
    assert.strictEqual(target.access_token, undefined, "Raw token must not be leaked in list");
    assert.ok(target.access_token_preview.includes("••••••••"));
  });

  test("4. POST /api/phone-numbers/:id/token verifies and updates permanent token", async () => {
    const updatedToken = "EAAVnewPermanentToken987654321";

    global.fetch = async (url, options = {}) => {
      if (typeof url === "string" && (url.includes("graph.facebook.com") || (config.META_API_URL && url.startsWith(config.META_API_URL)))) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testPhoneId,
            verified_name: "Test Perm Line Updated",
            display_phone_number: "+91 77788 89991",
            quality_rating: "GREEN",
            code_verification_status: "VERIFIED"
          })
        };
      }
      return originalFetch(url, options);
    };

    const res = await originalFetch(`${baseUrl}/api/phone-numbers/${testPhoneId}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        token: updatedToken,
        tokenType: "PERMANENT"
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.has_token, true);

    // Verify DB updated with AES-GCM encrypted permanent token (no plaintext leak)
    const row = db.prepare("SELECT access_token, access_token_enc, token_type FROM waba_phone_numbers WHERE phone_number_id = ?").get(testPhoneId);
    assert.strictEqual(row.access_token, null);
    assert.strictEqual(cryptoUtil.decrypt(row.access_token_enc), updatedToken);
    assert.strictEqual(row.token_type, "PERMANENT");
  });

  test("5. POST /api/phone-numbers/:id/test succeeds using line-specific token", async () => {
    let capturedAuthHeader = null;

    global.fetch = async (url, options = {}) => {
      if (typeof url === "string" && (url.includes("graph.facebook.com") || (config.META_API_URL && url.startsWith(config.META_API_URL)))) {
        capturedAuthHeader = options.headers?.Authorization;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testPhoneId,
            verified_name: "Test Perm Line Verified",
            display_phone_number: "+91 77788 89991",
            quality_rating: "GREEN",
            status: "CONNECTED"
          })
        };
      }
      return originalFetch(url, options);
    };

    const res = await originalFetch(`${baseUrl}/api/phone-numbers/${testPhoneId}/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(capturedAuthHeader.includes("EAAVnewPermanentToken987654321"));
  });
});
