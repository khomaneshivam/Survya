const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db } = require("../src/config/database");
const { authenticateToken } = require("../src/middleware/authMiddleware");
const { app } = require("../server");
const http = require("http");

describe("Authentication & Bearer Token Resolution Suite", { concurrency: 1 }, () => {
  let serverInstance = null;
  let serverPort = null;
  let testUser = null;
  let validToken = null;

  before(async () => {
    // 1. Fetch or create an active test user
    testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE status = 'ACTIVE' LIMIT 1").get();
    if (!testUser) {
      const uId = "test_auth_user_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
        VALUES (?, 'Auth Test User', 'authtest@example.com', 'dummy_hash', 'USER', 'ACTIVE', NOW(), NOW())
      `).run(uId);
      testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE id = ?").get(uId);
    }

    // 2. Generate valid JWT token
    validToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Start local HTTP test server
    await new Promise((resolve) => {
      serverInstance = http.createServer(app);
      serverInstance.listen(0, () => {
        serverPort = serverInstance.address().port;
        resolve();
      });
    });
  });

  after(() => {
    if (serverInstance) {
      serverInstance.close();
    }
  });

  test("1. Direct middleware: rejects request without token with 401 and standard message", () => {
    const req = { headers: {} };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status(s) {
        statusSent = s;
        return this;
      },
      json(j) {
        jsonSent = j;
        return this;
      }
    };
    let nextCalled = false;

    authenticateToken(req, res, () => { nextCalled = true; });

    assert.equal(statusSent, 401);
    assert.equal(nextCalled, false);
    assert.equal(jsonSent.success, false);
    assert.match(jsonSent.message, /Access denied\. Authentication Bearer token required/i);
  });

  test("2. Direct middleware: accepts standard Authorization Bearer header", () => {
    const req = {
      headers: {
        authorization: `Bearer ${validToken}`
      }
    };
    let nextCalled = false;
    const res = {};

    authenticateToken(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, testUser.id);
  });

  test("3. Direct middleware: accepts Cookie token (token=<jwt>)", () => {
    const req = {
      headers: {
        cookie: `sidebar_collapsed=false; token=${validToken}; other_cookie=123`
      }
    };
    let nextCalled = false;
    const res = {};

    authenticateToken(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, testUser.id);
  });

  test("4. Direct middleware: accepts custom x-auth-token header", () => {
    const req = {
      headers: {
        "x-auth-token": validToken
      }
    };
    let nextCalled = false;
    const res = {};

    authenticateToken(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.ok(req.user);
    assert.equal(req.user.id, testUser.id);
  });

  test("5. HTTP Route GET /api/v1/inapp/experiences returns 401 without Bearer token", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/inapp/experiences`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Access denied\. Authentication Bearer token required/i);
  });

  test("6. HTTP Route GET /api/v1/inapp/experiences succeeds with 200 when Authorization Bearer token is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/inapp/experiences`, {
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });

  test("7. HTTP Route GET /api/v1/inapp/experiences succeeds with 200 when Cookie token is provided", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/inapp/experiences`, {
      headers: {
        Cookie: `token=${validToken}`
      }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
  });
});
