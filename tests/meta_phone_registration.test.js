const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("http");
const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db, getSetting, setSetting } = require("../src/config/database");
const apiRoutes = require("../src/routes/apiRoutes");

describe("Meta Graph Phone Registration API Test Suite", () => {
  let server = null;
  let baseUrl = "";
  let adminToken = "";
  let userToken = "";
  let originalFetch = null;
  const testPhoneId = "109876543210987";
  const testPin = "654321";
  const testToken = "EAABtesttoken999888777";
  let savedGlobalApiToken = null;
  let savedGlobalPhoneId = null;

  before(async () => {
    originalFetch = global.fetch;
    savedGlobalApiToken = getSetting("WHATSAPP_API_TOKEN");
    savedGlobalPhoneId = getSetting("WHATSAPP_PHONE_NUMBER_ID");

    // Ensure Admin & Regular user exist in DB
    let admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (!admin) {
      const adminId = "admin_test_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Meta Test Admin', 'meta_admin@test.internal', '919999999991', 'hash', 'ADMIN', 'ACTIVE')
      `).run(adminId);
      admin = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    }
    adminToken = jwt.sign({ userId: admin.id, email: admin.email, role: "ADMIN" }, config.JWT_SECRET, { expiresIn: "1h" });

    let regular = db.prepare("SELECT * FROM users WHERE role = 'USER' LIMIT 1").get();
    if (!regular) {
      const regId = "user_test_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Meta Test User', 'meta_user@test.internal', '919999999992', 'hash', 'USER', 'ACTIVE')
      `).run(regId);
      regular = db.prepare("SELECT * FROM users WHERE id = ?").get(regId);
    }
    userToken = jwt.sign({ userId: regular.id, email: regular.email, role: "USER" }, config.JWT_SECRET, { expiresIn: "1h" });

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

  after(() => {
    global.fetch = originalFetch;
    if (server) {
      server.close();
    }
    try {
      db.prepare("DELETE FROM waba_phone_numbers WHERE phone_number_id = ?").run(testPhoneId);
    } catch (e) {}
    if (savedGlobalApiToken) {
      setSetting("WHATSAPP_API_TOKEN", savedGlobalApiToken);
    }
    if (savedGlobalPhoneId) {
      setSetting("WHATSAPP_PHONE_NUMBER_ID", savedGlobalPhoneId);
    }
  });

  // =========================================================================
  // 1. INPUT VALIDATION TESTS
  // =========================================================================
  describe("1. Validation & Input Sanitization", () => {
    test("Rejects request missing phone number ID with 400", async () => {
      const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: "123456",
          token: testToken
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /phone number id/i);
    });

    test("Rejects request missing 2-step verification PIN with 400", async () => {
      const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          token: testToken
        })
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /pin/i);
    });

    test("Rejects PIN that is not 6 numeric digits with 400", async () => {
      // 4 digits
      let res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: "1234",
          token: testToken
        })
      });
      assert.strictEqual(res.status, 400);
      let data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /6-digit/i);

      // letters
      res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: "abcdef",
          token: testToken
        })
      });
      assert.strictEqual(res.status, 400);
      data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /6-digit/i);

      // 7 digits
      res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: "1234567",
          token: testToken
        })
      });
      assert.strictEqual(res.status, 400);
      data = await res.json();
      assert.strictEqual(data.success, false);
      assert.match(data.message, /6-digit/i);
    });

    test("Rejects registration when token is missing and not configured in Settings", async () => {
      const oldToken = getSetting("WHATSAPP_API_TOKEN");
      setSetting("WHATSAPP_API_TOKEN", "EAAX_placeholder");

      try {
        const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: testPhoneId,
            pin: "123456"
          })
        });
        assert.ok(res.status === 400 || res.status === 401, "Should reject with 400 or 401 when token is missing/invalid");
        const data = await res.json();
        assert.strictEqual(data.success, false);
      } finally {
        if (oldToken) setSetting("WHATSAPP_API_TOKEN", oldToken);
      }
    });
  });

  // =========================================================================
  // 2. META GRAPH API REGISTRATION SUCCESS
  // =========================================================================
  describe("2. Successful Meta Phone Registration", () => {
    test("Calls Meta Cloud API with correct URL, Headers, and Body payload", async () => {
      const interceptedCalls = [];

      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          interceptedCalls.push({ url, options });
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: testPin,
          token: testToken,
          dataLocalizationRegion: "IN"
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.phoneNumberId, testPhoneId);
      assert.strictEqual(data.data.status, "REGISTERED");
      assert.strictEqual(data.data.metaResponse.success, true);

      // Verify outbound Meta registration call was made
      const registerCall = interceptedCalls.find(c => c.url.includes(`/${testPhoneId}/register`));
      assert.ok(registerCall, "Should have made POST call to /{phoneId}/register");
      assert.strictEqual(registerCall.options.method, "POST");
      assert.strictEqual(registerCall.options.headers.Authorization, `Bearer ${testToken}`);
      assert.strictEqual(registerCall.options.headers["Content-Type"], "application/json");

      const body = JSON.parse(registerCall.options.body);
      assert.strictEqual(body.messaging_product, "whatsapp");
      assert.strictEqual(body.pin, testPin);
      assert.strictEqual(body.data_localization_region, "IN");
    });

    test("Registers via /api/settings/register-phone with Admin authentication", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/settings/register-phone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          phoneNumberId: testPhoneId,
          pin: "654321",
          token: testToken,
          displayName: "Official Booking Line",
          phoneNumber: "+91 93073 82030"
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, "REGISTERED");

      // Verify record exists in waba_phone_numbers
      const dbRecord = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ?").get(testPhoneId);
      assert.ok(dbRecord);
      assert.strictEqual(dbRecord.status, "REGISTERED");
      assert.strictEqual(dbRecord.phone_number_id, testPhoneId);
    });

    test("Registers via /api/admin/phone-numbers/register-meta with alias", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/admin/phone-numbers/register-meta`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          id: testPhoneId,
          pin: 654321,
          token: testToken
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });
  });

  // =========================================================================
  // 3. META GRAPH ERROR HANDLING & HINTS
  // =========================================================================
  describe("3. Meta Cloud API Error Mapping & Hints", () => {
    test("Translates code 133005 into 'Two-step verification PIN is incorrect'", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                message: "Two-step verification PIN is incorrect.",
                type: "OAuthException",
                code: 133005
              }
            })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: "000000",
          token: testToken
        })
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.metaCode, 133005);
      assert.match(data.hint, /Two-step verification PIN is incorrect/i);
    });

    test("Translates code 190 into 'Access Token expired or invalid'", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: {
                message: "Error validating access token: Session has expired.",
                type: "OAuthException",
                code: 190
              }
            })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/meta/register-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          pin: "123456",
          token: "expired_token"
        })
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.metaCode, 190);
      assert.match(data.hint, /Access Token expired or invalid/i);
    });
  });

  // =========================================================================
  // 4. PHONE DEREGISTRATION
  // =========================================================================
  describe("4. Meta Phone Deregistration", () => {
    test("Deregisters phone via /api/meta/deregister-phone", async () => {
      let deregUrl = null;
      let deregOptions = null;

      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          deregUrl = url;
          deregOptions = options;
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/meta/deregister-phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testPhoneId,
          token: testToken
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.status, "DEREGISTERED");

      assert.ok(deregUrl.includes(`/${testPhoneId}/deregister`));
      assert.strictEqual(deregOptions.method, "POST");
      assert.strictEqual(deregOptions.headers.Authorization, `Bearer ${testToken}`);
      const body = JSON.parse(deregOptions.body);
      assert.strictEqual(body.messaging_product, "whatsapp");

      // Verify db record status updated
      const record = db.prepare("SELECT status FROM waba_phone_numbers WHERE phone_number_id = ?").get(testPhoneId);
      if (record) {
        assert.strictEqual(record.status, "DEREGISTERED");
      }
    });
  });

  // =========================================================================
  // 5. SENDER LINE UPSERT, AUTO-FETCH & LINE TEST
  // =========================================================================
  describe("5. Sender Line UPSERT, Auto-Fetch & Line Test", () => {
    const upsertPhoneId = "987654321012345";
    const upsertToken = "EAABupsertTestToken12345";
    let savedApiToken;

    before(() => {
      savedApiToken = getSetting("WHATSAPP_API_TOKEN");
    });

    after(() => {
      try {
        db.prepare("DELETE FROM waba_phone_numbers WHERE phone_number_id = ?").run(upsertPhoneId);
      } catch (e) {}
      if (savedApiToken) {
        setSetting("WHATSAPP_API_TOKEN", savedApiToken);
      }
    });

    test("Registers line with auto-fetch from Meta when display_name and phone_number are omitted", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: upsertPhoneId,
              verified_name: "Sarvya Auto Resort",
              display_phone_number: "+91 98765 43210",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              status: "CONNECTED"
            })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/phone-numbers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          phoneNumberId: upsertPhoneId,
          token: upsertToken
        })
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.phone_number_id, upsertPhoneId);
      assert.strictEqual(data.data.display_name, "Sarvya Auto Resort");
      assert.strictEqual(data.data.phone_number, "+91 98765 43210");
      assert.strictEqual(data.data.quality_rating, "GREEN");
      assert.strictEqual(data.data.status, "VERIFIED");

      // Verify token was saved in waba_phone_numbers table
      const lineRow = db.prepare("SELECT access_token FROM waba_phone_numbers WHERE phone_number_id = ?").get(upsertPhoneId);
      assert.strictEqual(lineRow?.access_token, upsertToken);
    });

    test("Updates existing sender line (UPSERT) instead of returning 409 Conflict", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: upsertPhoneId,
              verified_name: "Sarvya VIP Line",
              display_phone_number: "+91 98765 43210",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              status: "CONNECTED"
            })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/phone-numbers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          phoneNumberId: upsertPhoneId,
          displayName: "Sarvya VIP Line Updated",
          phoneNumber: "+91 98765 43210"
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.phone_number_id, upsertPhoneId);
      assert.strictEqual(data.data.display_name, "Sarvya VIP Line Updated");

      // Verify DB record updated
      const row = db.prepare("SELECT * FROM waba_phone_numbers WHERE phone_number_id = ?").get(upsertPhoneId);
      assert.strictEqual(row.display_name, "Sarvya VIP Line Updated");
    });

    test("Tests line verification via POST /api/admin/phone-numbers/:id/test", async () => {
      global.fetch = async (url, options = {}) => {
        if (typeof url === "string" && url.includes("graph.facebook.com")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: upsertPhoneId,
              verified_name: "Sarvya Verified Line",
              display_phone_number: "+91 98765 43210",
              quality_rating: "GREEN",
              code_verification_status: "VERIFIED",
              status: "CONNECTED"
            })
          };
        }
        return originalFetch(url, options);
      };

      const res = await originalFetch(`${baseUrl}/api/admin/phone-numbers/${upsertPhoneId}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminToken}`
        }
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.match(data.message, /Verified with Meta/i);
      assert.strictEqual(data.data.status, "VERIFIED");
      assert.strictEqual(data.data.display_name, "Sarvya Verified Line");
    });
  });
});
