const { test, describe, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { db, initializeDatabase } = require("../src/config/database");
const { getAsyncPool, closeAsyncPool } = require("../src/config/asyncDb");
const jobQueueService = require("../src/services/queue/jobQueueService");
const jobWorkerEngine = require("../src/services/queue/jobWorkerEngine");

describe("Production MySQL 8.4 Transactional Job Queue & Worker Engine Test Suite", () => {
  const tenantId = 1;
  const testQueue = "test_queue";

  before(() => {
    initializeDatabase();
    db.prepare("DELETE FROM system_job_queue WHERE queue_name = ?").run(testQueue);
  });

  beforeEach(() => {
    db.prepare("DELETE FROM system_job_queue WHERE queue_name = ?").run(testQueue);
  });

  after(async () => {
    db.prepare("DELETE FROM system_job_queue WHERE queue_name = ?").run(testQueue);
    await closeAsyncPool();
  });

  test("1. Database Schema Parity: system_job_queue and system_job_schedules exist with all required columns", () => {
    const queueCols = db.prepare("DESCRIBE system_job_queue").all().map(c => c.Field);
    const requiredQueueCols = [
      "id", "tenant_id", "queue_name", "job_type", "idempotency_key",
      "payload_json", "priority", "status", "run_at", "attempts",
      "max_attempts", "locked_by", "locked_at", "last_error",
      "completed_at", "created_at", "updated_at"
    ];

    for (const col of requiredQueueCols) {
      assert.ok(queueCols.includes(col), `system_job_queue must have column '${col}'`);
    }

    const schedCols = db.prepare("DESCRIBE system_job_schedules").all().map(c => c.Field);
    const requiredSchedCols = [
      "id", "tenant_id", "schedule_name", "job_type", "queue_name",
      "cron_expression", "interval_seconds", "payload_json", "is_enabled",
      "last_enqueued_at", "next_run_at", "created_at", "updated_at"
    ];

    for (const col of requiredSchedCols) {
      assert.ok(schedCols.includes(col), `system_job_schedules must have column '${col}'`);
    }

    // Verify baseline recurring schedules exist
    const schedules = db.prepare("SELECT schedule_name FROM system_job_schedules").all();
    const names = schedules.map(s => s.schedule_name);
    assert.ok(names.includes("session_cleanup_sweep"), "Must include session_cleanup_sweep schedule");
    assert.ok(names.includes("callback_sla_check_sweep"), "Must include callback_sla_check_sweep schedule");
    assert.ok(names.includes("negotiation_expire_sweep"), "Must include negotiation_expire_sweep schedule");
  });

  test("2. Job Enqueuing with Priority, UTC Timestamp & Idempotency Key Deduplication", () => {
    const uniqueKey = `test_idempotent_${Date.now()}`;

    // First enqueue
    const res1 = jobQueueService.enqueueJob({
      tenantId,
      queueName: testQueue,
      jobType: "TEST_DEDUPE_JOB",
      payload: { message: "Hello Queue" },
      priority: 20,
      idempotencyKey: uniqueKey
    });

    assert.equal(res1.success, true);
    assert.ok(res1.jobId, "Job ID must be generated");
    assert.equal(res1.isDuplicate, false);
    assert.equal(res1.status, "PENDING");

    // Second enqueue with identical idempotency key
    const res2 = jobQueueService.enqueueJob({
      tenantId,
      queueName: testQueue,
      jobType: "TEST_DEDUPE_JOB",
      payload: { message: "Duplicate attempt" },
      priority: 20,
      idempotencyKey: uniqueKey
    });

    assert.equal(res2.success, true);
    assert.equal(res2.jobId, res1.jobId, "Duplicate enqueue must return same jobId");
    assert.equal(res2.isDuplicate, true, "Must flag isDuplicate: true");

    // Verify exactly 1 row exists in DB
    const count = db.prepare("SELECT COUNT(*) as cnt FROM system_job_queue WHERE idempotency_key = ?").get(uniqueKey).cnt;
    assert.equal(count, 1, "Exactly one row should exist for unique idempotency_key");
  });

  test("3. Transactional Claim with SELECT ... FOR UPDATE SKIP LOCKED & Successful Execution", async () => {
    let executedPayload = null;

    jobWorkerEngine.registerHandler("TEST_EXECUTE_SUCCESS", async (payload) => {
      executedPayload = payload;
      return { ok: true };
    });

    // Enqueue job
    const enqueueRes = jobQueueService.enqueueJob({
      tenantId,
      queueName: testQueue,
      jobType: "TEST_EXECUTE_SUCCESS",
      payload: { greeting: "Namaste KonkanTrip", amount: 4500 },
      priority: 10
    });

    assert.ok(enqueueRes.jobId);

    // Worker claims and processes next job
    const processed = await jobWorkerEngine.claimAndProcessNextJob(testQueue);
    assert.equal(processed, true, "Worker must claim and process the job");
    assert.deepEqual(executedPayload, { greeting: "Namaste KonkanTrip", amount: 4500 });

    // Verify job status in database is DONE
    const jobInDb = jobQueueService.getJobById(enqueueRes.jobId, tenantId);
    assert.equal(jobInDb.status, "DONE");
    assert.ok(jobInDb.completed_at, "completed_at must be populated");
    assert.equal(jobInDb.attempts, 1);
  });

  test("4. Error Handling, Exponential Backoff & DEAD_LETTER Transition", async () => {
    let callCount = 0;
    jobWorkerEngine.registerHandler("TEST_FAIL_RETRY", async () => {
      callCount++;
      throw new Error("Simulated transient connection timeout");
    });

    // Enqueue job with maxAttempts = 2
    const enqueueRes = jobQueueService.enqueueJob({
      tenantId,
      queueName: testQueue,
      jobType: "TEST_FAIL_RETRY",
      payload: { test: "retry_logic" },
      maxAttempts: 2
    });

    // Turn 1: Fails once (attempts = 1 < maxAttempts) -> status remains PENDING with future backoff run_at
    const turn1 = await jobWorkerEngine.claimAndProcessNextJob(testQueue);
    assert.equal(turn1, true);
    assert.equal(callCount, 1);

    const jobAfterTurn1 = jobQueueService.getJobById(enqueueRes.jobId, tenantId);
    assert.equal(jobAfterTurn1.status, "PENDING", "Must remain PENDING for backoff retry");
    assert.equal(jobAfterTurn1.attempts, 1);
    assert.ok(jobAfterTurn1.last_error.includes("Simulated transient connection timeout"));

    // Force run_at to past so Turn 2 can claim it immediately
    db.prepare("UPDATE system_job_queue SET run_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id = ?").run(enqueueRes.jobId);

    // Turn 2: Fails second time (attempts = 2 >= maxAttempts) -> moves to DEAD_LETTER
    const turn2 = await jobWorkerEngine.claimAndProcessNextJob(testQueue);
    assert.equal(turn2, true);
    assert.equal(callCount, 2);

    const jobAfterTurn2 = jobQueueService.getJobById(enqueueRes.jobId, tenantId);
    assert.equal(jobAfterTurn2.status, "DEAD_LETTER", "Job must move to DEAD_LETTER after max_attempts reached");
    assert.equal(jobAfterTurn2.attempts, 2);
  });

  test("5. Stale Lock Detection & Recovery", async () => {
    // Insert a fake stuck job in PROCESSING state locked 10 minutes ago
    const res = db.prepare(`
      INSERT INTO system_job_queue (
        tenant_id, queue_name, job_type, payload_json, priority,
        status, run_at, attempts, max_attempts, locked_by, locked_at,
        created_at, updated_at
      ) VALUES (
        1, ?, 'TEST_STALE_JOB', '{}', 10,
        'PROCESSING', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), 1, 5,
        'dead-worker-pid-9999', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE),
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(testQueue);

    const stuckJobId = res.lastInsertRowid;

    jobWorkerEngine.registerHandler("TEST_STALE_JOB", async () => {
      return { recovered: true };
    });

    // Running worker should detect stale lock, reset to PENDING, claim and complete it
    const processed = await jobWorkerEngine.claimAndProcessNextJob(testQueue);
    assert.equal(processed, true);

    const recoveredJob = jobQueueService.getJobById(stuckJobId, tenantId);
    assert.equal(recoveredJob.status, "DONE", "Stale locked job must be recovered and finished");
    assert.ok(recoveredJob.completed_at);
  });

  test("6. Admin Queue Telemetry, Schedules & Action Handlers", () => {
    // Enqueue a job for listing and telemetry
    jobQueueService.enqueueJob({
      tenantId,
      queueName: testQueue,
      jobType: "TEST_TELEMETRY_JOB",
      payload: { hello: "admin" }
    });

    // Stats inspection
    const stats = jobQueueService.getQueueStats(tenantId);
    assert.ok(typeof stats.total === "number", "total must be number");
    assert.ok(typeof stats.pending === "number", "pending must be number");
    assert.ok(typeof stats.done === "number", "done must be number");
    assert.ok(typeof stats.byQueue === "object", "byQueue must be object");

    // List jobs
    const jobList = jobQueueService.listJobs({ tenantId, queueName: testQueue, limit: 10 });
    assert.ok(Array.isArray(jobList.jobs));
    assert.ok(jobList.total > 0);

    // List and toggle schedules
    const schedules = jobQueueService.listSchedules(tenantId);
    assert.ok(schedules.length > 0);
    const targetSched = schedules[0];

    const toggleRes = jobQueueService.toggleSchedule(targetSched.id, !targetSched.is_enabled, tenantId);
    assert.equal(toggleRes.success, true);
    assert.equal(toggleRes.isEnabled, !targetSched.is_enabled);

    // Toggle back
    jobQueueService.toggleSchedule(targetSched.id, targetSched.is_enabled === 1, tenantId);
  });
});
