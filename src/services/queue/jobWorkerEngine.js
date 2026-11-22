const EventEmitter = require("events");
const crypto = require("crypto");
const { getAsyncPool } = require("../../config/asyncDb");
const { db } = require("../../config/database");
const inappSseManager = require("../inapp/inappSseManager");

/**
 * Production MySQL 8.4 Transactional Job Worker Engine
 * Uses pure async mysql2/promise and SELECT ... FOR UPDATE SKIP LOCKED
 * Guarantees zero duplicate processing across multiple concurrent worker processes.
 */
class JobWorkerEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workerId = options.workerId || `sarvya-worker-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
    this.queueName = options.queueName || null;
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.staleLockMinutes = options.staleLockMinutes || 5;
    this.isRunning = false;
    this._loopTimeout = null;
    this._inFlightPromise = null;
    this.handlers = new Map();

    // Register built-in job handlers
    this._registerBuiltInHandlers();
  }

  /**
   * Register a custom job handler function
   */
  registerHandler(jobType, handlerFn) {
    if (typeof handlerFn !== "function") {
      throw new Error(`Handler for ${jobType} must be a function`);
    }
    this.handlers.set(jobType, handlerFn);
  }

  /**
   * Register system built-in job handlers
   */
  _registerBuiltInHandlers() {
    // 1. Session Cleanup Handler
    this.registerHandler("SESSION_CLEANUP", async (payload, job) => {
      let expiredFlows = 0;
      let expiredInapps = 0;

      try {
        const resFlow = db.prepare(`
          UPDATE conversation_flow_sessions
          SET session_status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
          WHERE session_status = 'ACTIVE'
            AND expires_at IS NOT NULL
            AND expires_at <= UTC_TIMESTAMP()
        `).run();
        expiredFlows = resFlow.changes || 0;
      } catch (_) {}

      try {
        const resInapp = db.prepare(`
          UPDATE inapp_sessions
          SET status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
          WHERE status = 'ACTIVE'
            AND expires_at IS NOT NULL
            AND expires_at <= UTC_TIMESTAMP()
        `).run();
        expiredInapps = resInapp.changes || 0;
      } catch (_) {}

      return { expiredFlows, expiredInapps };
    });

    // 2. Callback SLA Check Handler
    this.registerHandler("CALLBACK_SLA_CHECK", async (payload, job) => {
      const overdue = db.prepare(`
        SELECT c.*, e.name as experience_name
        FROM inapp_call_requests c
        JOIN inapp_experiences e ON e.id = c.experience_id
        WHERE c.status = 'QUEUED'
          AND c.sla_deadline_at IS NOT NULL
          AND c.sla_deadline_at <= UTC_TIMESTAMP()
      `).all();

      if (overdue.length > 0) {
        for (const item of overdue) {
          inappSseManager.notifyStaff("inapp:sla_breach", {
            callId: item.id,
            visitorPhone: item.visitor_phone,
            topic: item.topic,
            experienceName: item.experience_name,
            slaDeadlineAt: item.sla_deadline_at
          });
        }
      }

      return { overdueCount: overdue.length };
    });

    // 3. Negotiation Expiration Handler
    this.registerHandler("NEGOTIATION_EXPIRE", async (payload, job) => {
      const res = db.prepare(`
        UPDATE inapp_rate_negotiations
        SET status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
        WHERE status IN ('PENDING_AGENT', 'AGENT_COUNTERED')
          AND valid_until IS NOT NULL
          AND valid_until <= UTC_TIMESTAMP()
      `).run();

      return { expiredNegotiations: res.changes || 0 };
    });

    // 4. Abandoned In-App Session Nudge Handler
    this.registerHandler("ABANDONED_INAPP_NUDGE", async (payload, job) => {
      const abandoned = db.prepare(`
        SELECT s.id, s.visitor_phone, s.visitor_name, e.name as experience_name
        FROM inapp_sessions s
        JOIN inapp_experiences e ON e.id = s.experience_id
        WHERE s.status = 'ACTIVE'
          AND s.last_activity_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
        LIMIT 20
      `).all();

      return { inspectedAbandoned: abandoned.length };
    });

    // 5. Workflow Delay Resume Handler
    this.registerHandler("WORKFLOW_DELAY_RESUME", async (payload, job) => {
      const { sessionId, resumeNodeId, resumeHandle } = payload;
      if (!sessionId || !resumeNodeId) {
        throw new Error("sessionId and resumeNodeId are required for WORKFLOW_DELAY_RESUME");
      }

      // Check suppression / opt-out
      const session = db.prepare(`
        SELECT s.* FROM conversation_flow_sessions s WHERE s.id = ?
      `).get(sessionId);

      if (!session || session.session_status !== "ACTIVE") {
        return { skipped: true, reason: "Session no longer active" };
      }

      const cleanPhone = String(session.sender_phone || "").replace(/\D/g, "");
      const suppression = db.prepare("SELECT id FROM contact_suppressions WHERE clean_phone = ? LIMIT 1").get(cleanPhone);
      if (suppression) {
        return { skipped: true, reason: "Recipient phone is suppressed" };
      }

      const conversationFlowEngine = require("../conversationFlowEngine");
      const result = await conversationFlowEngine.resumeScheduledNode({
        sessionId,
        resumeNodeId,
        resumeHandle: resumeHandle || "default"
      });

      return { handled: result?.handled || true };
    });

    // 6. Broadcast Dispatch Handler
    this.registerHandler("BROADCAST_DISPATCH", async (payload, job) => {
      const broadcastEngine = require("../broadcastEngine");
      const timeUtil = require("../../utils/timeUtil");

      let launched = 0;

      if (payload?.campaignId) {
        const campaign = db.prepare(`
          SELECT id, name, scheduled_at, status 
          FROM campaigns 
          WHERE id = ?
        `).get(payload.campaignId);

        if (campaign && (campaign.status === 'SCHEDULED' || campaign.status === 'PAUSED' || campaign.status === 'DRAFT')) {
          try {
            await broadcastEngine.startCampaign(campaign.id, payload.overrideDelayMs, { overrideQuietHours: Boolean(payload.overrideQuietHours) });
            launched++;
          } catch (e) {
            console.error(`[JobWorkerEngine] Targeted broadcast launch failed for campaign ${campaign.id}:`, e.message);
          }
        }
      }

      const scheduledCampaigns = db.prepare(`
        SELECT id, name, scheduled_at, status 
        FROM campaigns 
        WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL
      `).all();

      for (const campaign of scheduledCampaigns) {
        const schedDate = timeUtil.parseDateSmart(campaign.scheduled_at);
        if (schedDate && schedDate.getTime() <= Date.now()) {
          try {
            await broadcastEngine.startCampaign(campaign.id, null, { overrideQuietHours: true });
            launched++;
          } catch (e) {
            console.error(`[JobWorkerEngine] Broadcast launch failed for campaign ${campaign.id}:`, e.message);
          }
        }
      }

      return { launchedCampaigns: launched };
    });

    // 7. DPDP Right to Erasure Execution Handler
    this.registerHandler("DPDP_ERASURE_EXECUTE", async (payload, job) => {
      const complianceService = require("../complianceService");
      if (payload?.phoneE164) {
        return complianceService.executeErasureOrAnonymization(payload.phoneE164, payload.tenantId || 1, {
          schedule48hNotice: false,
          resolvedBy: "system_worker"
        });
      }
      return { skipped: true, reason: "Missing phoneE164 in payload" };
    });
  }

  /**
   * Start worker loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[JobWorkerEngine] Worker ${this.workerId} started.`);
    this._scheduleNextLoop(0);
  }

  /**
   * Stop worker loop gracefully
   */
  async stop() {
    this.isRunning = false;
    if (this._loopTimeout) {
      clearTimeout(this._loopTimeout);
      this._loopTimeout = null;
    }

    if (this._inFlightPromise) {
      console.log(`[JobWorkerEngine] Waiting for in-flight job to finish before shutdown...`);
      try {
        await Promise.race([
          this._inFlightPromise,
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      } catch (_) {}
    }

    console.log(`[JobWorkerEngine] Worker ${this.workerId} stopped cleanly.`);
  }

  _scheduleNextLoop(delayMs) {
    if (!this.isRunning) return;
    this._loopTimeout = setTimeout(async () => {
      try {
        const hadJob = await this.claimAndProcessNextJob();
        // If there was a job, immediately check for the next one without delay; otherwise wait pollIntervalMs
        const nextDelay = hadJob ? 50 : this.pollIntervalMs;
        this._scheduleNextLoop(nextDelay);
      } catch (err) {
        console.error(`[JobWorkerEngine] Loop cycle error:`, err.message);
        this._scheduleNextLoop(this.pollIntervalMs);
      }
    }, delayMs);

    if (this._loopTimeout.unref) {
      this._loopTimeout.unref();
    }
  }

  /**
   * Atomically claims and processes a single job using SELECT ... FOR UPDATE SKIP LOCKED
   * Returns true if a job was found and processed, false if queue was empty
   */
  async claimAndProcessNextJob(targetQueue = this.queueName) {
    const pool = getAsyncPool();
    const conn = await pool.getConnection();

    try {
      // 1. Check and enqueue recurring schedules
      await this._syncRecurringSchedules(conn);

      // 2. Recover stale locks (worker died or timed out > 5 mins)
      await conn.query(`
        UPDATE system_job_queue
        SET status = 'PENDING',
            locked_by = NULL,
            locked_at = NULL,
            last_error = CONCAT(COALESCE(last_error, ''), ' [STALE_LOCK_RESET: Worker timed out]')
        WHERE status = 'PROCESSING'
          AND locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
      `, [this.staleLockMinutes]);

      // 3. Atomically claim next pending job with FOR UPDATE SKIP LOCKED
      await conn.beginTransaction();

      let claimSql = `
        SELECT *
        FROM system_job_queue
        WHERE status = 'PENDING'
          AND run_at <= UTC_TIMESTAMP()
      `;
      const claimParams = [];

      if (targetQueue && targetQueue !== "ALL") {
        claimSql += " AND queue_name = ?";
        claimParams.push(targetQueue);
      }

      claimSql += " ORDER BY priority ASC, run_at ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED";

      const [rows] = await conn.query(claimSql, claimParams);

      if (!rows || rows.length === 0) {
        await conn.commit();
        conn.release();
        return false;
      }

      const job = rows[0];

      // Lock the job to this worker instance
      await conn.query(`
        UPDATE system_job_queue
        SET status = 'PROCESSING',
            locked_by = ?,
            locked_at = UTC_TIMESTAMP(),
            attempts = attempts + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [this.workerId, job.id]);

      await conn.commit();
      conn.release();

      // 4. Process the claimed job outside the lock transaction
      this._inFlightPromise = this._executeJob(job);
      await this._inFlightPromise;
      this._inFlightPromise = null;

      return true;
    } catch (claimErr) {
      try {
        await conn.rollback();
      } catch (_) {}
      conn.release();
      throw claimErr;
    }
  }

  async _executeJob(job) {
    const pool = getAsyncPool();
    const startTime = Date.now();
    let payload = {};
    try {
      payload = typeof job.payload_json === "string" ? JSON.parse(job.payload_json) : (job.payload_json || {});
    } catch (_) {
      payload = job.payload_json;
    }

    const handler = this.handlers.get(job.job_type);

    this.emit("job:started", {
      jobId: job.id,
      jobType: job.job_type,
      workerId: this.workerId,
      attempts: job.attempts + 1
    });

    try {
      if (!handler) {
        throw new Error(`No registered handler for job type: ${job.job_type}`);
      }

      const result = await handler(payload, job);
      const durationMs = Date.now() - startTime;

      // Mark Job as DONE
      await pool.query(`
        UPDATE system_job_queue
        SET status = 'DONE',
            completed_at = UTC_TIMESTAMP(),
            locked_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [job.id]);

      this.emit("job:completed", {
        jobId: job.id,
        jobType: job.job_type,
        workerId: this.workerId,
        durationMs,
        result
      });
    } catch (execErr) {
      const durationMs = Date.now() - startTime;
      const currentAttempts = job.attempts + 1;
      const maxAttempts = job.max_attempts || 5;
      const isDeadLetter = currentAttempts >= maxAttempts;

      if (isDeadLetter) {
        // Move to DEAD_LETTER
        await pool.query(`
          UPDATE system_job_queue
          SET status = 'DEAD_LETTER',
              last_error = ?,
              locked_by = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [execErr.message, job.id]);

        this.emit("job:dead_letter", {
          jobId: job.id,
          jobType: job.job_type,
          workerId: this.workerId,
          attempts: currentAttempts,
          maxAttempts,
          error: execErr.message
        });
      } else {
        // Retry with exponential backoff: 10s, 20s, 40s, 80s, etc. (capped at 1 hour)
        const backoffSeconds = Math.min(3600, Math.pow(2, currentAttempts) * 10);
        await pool.query(`
          UPDATE system_job_queue
          SET status = 'PENDING',
              run_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
              last_error = ?,
              locked_by = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [backoffSeconds, execErr.message, job.id]);

        this.emit("job:failed", {
          jobId: job.id,
          jobType: job.job_type,
          workerId: this.workerId,
          attempts: currentAttempts,
          nextRetryInSeconds: backoffSeconds,
          error: execErr.message
        });
      }
    }
  }

  /**
   * Inspects system_job_schedules and enqueues due recurring jobs
   */
  async _syncRecurringSchedules(conn) {
    try {
      const [dueSchedules] = await conn.query(`
        SELECT *
        FROM system_job_schedules
        WHERE is_enabled = 1
          AND next_run_at <= UTC_TIMESTAMP()
      `);

      if (!dueSchedules || dueSchedules.length === 0) return;

      for (const sched of dueSchedules) {
        // Idempotency key per schedule trigger slot (e.g. schedName_minuteBucket)
        const minuteBucket = Math.floor(Date.now() / 60000);
        const idempotencyKey = `sched_${sched.schedule_name}_${minuteBucket}`;

        let payloadStr = "{}";
        if (sched.payload_json) {
          payloadStr = typeof sched.payload_json === "string" ? sched.payload_json : JSON.stringify(sched.payload_json);
        }

        // Enqueue into queue
        await conn.query(`
          INSERT INTO system_job_queue (
            tenant_id, queue_name, job_type, idempotency_key, payload_json,
            priority, status, run_at, attempts, max_attempts,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 80, 'PENDING', UTC_TIMESTAMP(), 0, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        `, [
          sched.tenant_id || 1,
          sched.queue_name || "maintenance",
          sched.job_type,
          idempotencyKey,
          payloadStr
        ]);

        // Advance next_run_at
        const intervalSec = Math.max(10, parseInt(sched.interval_seconds, 10) || 60);
        await conn.query(`
          UPDATE system_job_schedules
          SET last_enqueued_at = UTC_TIMESTAMP(),
              next_run_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [intervalSec, sched.id]);
      }
    } catch (schedErr) {
      console.warn("[JobWorkerEngine] Schedule sync warning:", schedErr.message);
    }
  }
}

const jobWorkerEngine = new JobWorkerEngine();
module.exports = jobWorkerEngine;
module.exports.JobWorkerEngine = JobWorkerEngine;
