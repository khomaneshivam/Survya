const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const schedulerService = require("../src/services/schedulerService");
const { app } = require("../server");
const http = require("http");

describe("Server Stability: Cancel-On-Reply, CORS 403 & PM2 Graceful Shutdown", { concurrency: 1 }, () => {
  const testPhone = "919900998811";
  let testSessionId = null;
  let testJobId = null;
  let serverInstance = null;
  let serverPort = null;

  before(async () => {
    // 1. Create a dummy session for cancel-on-reply test
    db.prepare("DELETE FROM workflow_scheduled_jobs WHERE flow_id = '99999'").run();
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(testPhone);

    const sRes = db.prepare(`
      INSERT INTO conversation_flow_sessions (
        session_key, tenant_id, property_id, channel, sender_phone,
        flow_id, flow_version_id, current_node_id, session_status,
        collected_data_json, last_interaction_at, expires_at, created_at, updated_at
      ) VALUES (?, 1, 1, 'WHATSAPP', ?, 1, 1, 'node_ask_checkin', 'ACTIVE', '{}', NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW(), NOW())
    `).run(`WHATSAPP:${testPhone}:1`, testPhone);

    const session = db.prepare("SELECT id FROM conversation_flow_sessions WHERE sender_phone = ?").get(testPhone);
    testSessionId = session.id;

    // 2. Insert test scheduled job with cancel_on_reply = 1
    const jRes = db.prepare(`
      INSERT INTO workflow_scheduled_jobs (
        tenant_id, session_id, flow_id, resume_node_id, resume_handle,
        job_type, cancel_on_reply, run_at, status, created_at, updated_at
      ) VALUES (1, ?, '99999', 'node_delayed_reminder', 'default', 'DELAY_RESUME', 1, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 'PENDING', NOW(), NOW())
    `).run(String(testSessionId));

    const job = db.prepare("SELECT id FROM workflow_scheduled_jobs WHERE flow_id = '99999'").get();
    testJobId = job.id;

    // 3. Start ephemeral test server for HTTP CORS assertions
    await new Promise((resolve) => {
      serverInstance = http.createServer(app);
      serverInstance.listen(0, "127.0.0.1", () => {
        serverPort = serverInstance.address().port;
        resolve();
      });
    });
  });

  after(() => {
    if (testSessionId) {
      db.prepare("DELETE FROM conversation_flow_sessions WHERE id = ?").run(testSessionId);
    }
    if (testJobId) {
      db.prepare("DELETE FROM workflow_scheduled_jobs WHERE id = ?").run(testJobId);
    }
    if (serverInstance) {
      serverInstance.close();
    }
  });

  test("1. Cancel-on-reply SQL query succeeds with s.flow_id (No s.current_flow_id typo)", () => {
    // Exact SQL executed in webhookService on customer reply
    const pendingJobs = db.prepare(`
      SELECT j.*, s.flow_id, s.current_node_id
      FROM workflow_scheduled_jobs j
      JOIN conversation_flow_sessions s ON (j.session_id = s.id OR j.session_id = s.session_key)
      WHERE s.sender_phone = ? AND j.status = 'PENDING' AND j.cancel_on_reply = 1
    `).all(testPhone);

    assert.ok(Array.isArray(pendingJobs), "Must return array of pending jobs");
    assert.equal(pendingJobs.length, 1, "Must find exactly 1 pending job for test phone");
    assert.equal(pendingJobs[0].flow_id, 1, "Must return s.flow_id correctly");
    assert.equal(pendingJobs[0].current_node_id, "node_ask_checkin", "Must return s.current_node_id correctly");

    // Execute cancellation update
    db.prepare(`
      UPDATE workflow_scheduled_jobs
      SET status = 'CANCELLED', last_error = 'Customer replied before delay elapsed (cancel_on_reply)', updated_at = NOW()
      WHERE id = ?
    `).run(pendingJobs[0].id);

    const cancelledJob = db.prepare("SELECT status FROM workflow_scheduled_jobs WHERE id = ?").get(pendingJobs[0].id);
    assert.equal(cancelledJob.status, "CANCELLED");
  });

  test("2. Non-browser / server-to-server request (no Origin header) succeeds with 200", async () => {
    const res = await makeRequest(`http://127.0.0.1:${serverPort}/api/health`, {
      method: "GET"
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.status, "healthy");
  });

  test("3. CORS Whitelist: Rejected origin returns clean HTTP 403 { success: false, message: 'Origin not allowed' }", async () => {
    // Temporarily simulate production environment with explicit CORS whitelist
    const config = require("../src/config/env");
    const prevEnv = config.NODE_ENV;
    const prevCors = config.CORS_ORIGIN;
    try {
      config.NODE_ENV = "production";
      config.CORS_ORIGIN = "https://sarvya.com, https://admin.sarvya.com/";

      const res = await makeRequest(`http://127.0.0.1:${serverPort}/api/health`, {
        method: "GET",
        headers: {
          Origin: "https://evil-unauthorized-site.com"
        }
      });

      assert.equal(res.statusCode, 403, "Must return HTTP 403 for disallowed origin in production");
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.message, "Origin not allowed");

      // Verify that authorized origin (with apex expansion & trailing slash normalization) succeeds
      const okRes = await makeRequest(`http://127.0.0.1:${serverPort}/api/health`, {
        method: "GET",
        headers: {
          Origin: "https://www.sarvya.com"
        }
      });
      assert.equal(okRes.statusCode, 200, "Must allow expanded www origin");
      assert.equal(okRes.headers["access-control-allow-origin"], "https://www.sarvya.com");

      // Verify second comma-separated origin with trailing slash normalized
      const okRes2 = await makeRequest(`http://127.0.0.1:${serverPort}/api/health`, {
        method: "GET",
        headers: {
          Origin: "https://admin.sarvya.com"
        }
      });
      assert.equal(okRes2.statusCode, 200, "Must allow normalized admin origin");
    } finally {
      config.NODE_ENV = prevEnv;
      config.CORS_ORIGIN = prevCors;
    }
  });

  test("4. SchedulerService exports stopSchedulers and clears all interval timers", () => {
    assert.equal(typeof schedulerService.stopSchedulers, "function", "Must export stopSchedulers function");
    assert.equal(typeof schedulerService.stopScheduler, "function", "Must export stopScheduler alias");

    // Initialize scheduler
    schedulerService.initScheduler();
    assert.ok(schedulerService.intervalTimer !== null, "Campaign interval timer must be set");
    assert.ok(schedulerService.workflowJobsTimer !== null, "Workflow delay timer must be set");

    // Stop schedulers
    schedulerService.stopSchedulers();
    assert.equal(schedulerService.intervalTimer, null, "Campaign interval timer must be cleared");
    assert.equal(schedulerService.workflowJobsTimer, null, "Workflow delay timer must be cleared");
    assert.equal(schedulerService.bookingIntervalTimer, null, "Booking interval timer must be cleared");
  });

  test("5. Database adapter provides callable close() method", () => {
    assert.equal(typeof db.close, "function", "db.close must be a function");
  });
});

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {}
    }, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
