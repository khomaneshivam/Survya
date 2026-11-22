const { db } = require("../../config/database");

/**
 * Production MySQL 8.4 Job Queue Service
 * Handles transactional enqueuing, idempotency deduplication, job status inspection, and admin actions.
 */

/**
 * Format any date/timestamp into UTC MySQL DATETIME string: YYYY-MM-DD HH:mm:ss
 */
function toUtcDatetimeString(dateInput) {
  if (!dateInput) {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace("T", " ");
  }

  let d = dateInput;
  if (!(d instanceof Date)) {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) {
    d = new Date();
  }

  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Enqueue a new job into system_job_queue
 */
function enqueueJob({
  tenantId = 1,
  queueName = "default",
  jobType,
  payload = {},
  runAt,
  priority = 50,
  idempotencyKey = null,
  maxAttempts = 5
} = {}) {
  if (!jobType) {
    throw new Error("jobType is required to enqueue a job");
  }

  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  const formattedRunAt = toUtcDatetimeString(runAt);
  const cleanIdempotencyKey = idempotencyKey ? String(idempotencyKey).trim() : null;

  try {
    if (cleanIdempotencyKey) {
      const existing = db.prepare(`
        SELECT id, status FROM system_job_queue WHERE idempotency_key = ?
      `).get(cleanIdempotencyKey);

      if (existing) {
        return {
          success: true,
          jobId: existing.id,
          queueName,
          jobType,
          runAt: formattedRunAt,
          isDuplicate: true,
          status: existing.status
        };
      }
    }

    const res = db.prepare(`
      INSERT INTO system_job_queue (
        tenant_id, queue_name, job_type, idempotency_key, payload_json,
        priority, status, run_at, attempts, max_attempts,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      queueName,
      jobType,
      cleanIdempotencyKey,
      payloadStr,
      Number(priority) || 50,
      formattedRunAt,
      Number(maxAttempts) || 5
    );

    return {
      success: true,
      jobId: res.lastInsertRowid,
      queueName,
      jobType,
      runAt: formattedRunAt,
      isDuplicate: false,
      status: "PENDING"
    };
  } catch (err) {
    // If concurrent race condition triggered duplicate idempotency key
    if (cleanIdempotencyKey && (err.message.includes("Duplicate entry") || err.message.includes("UNIQUE"))) {
      const existing = db.prepare(`
        SELECT id, status FROM system_job_queue WHERE idempotency_key = ?
      `).get(cleanIdempotencyKey);

      if (existing) {
        return {
          success: true,
          jobId: existing.id,
          queueName,
          jobType,
          runAt: formattedRunAt,
          isDuplicate: true,
          status: existing.status
        };
      }
    }
    throw err;
  }
}

/**
 * Retrieve a single job by ID
 */
function getJobById(jobId, tenantId = 1) {
  const row = db.prepare(`
    SELECT * FROM system_job_queue WHERE id = ? AND tenant_id = ?
  `).get(jobId, tenantId);

  if (!row) return null;

  return parseJobRow(row);
}

/**
 * List jobs with filtering and pagination
 */
function listJobs({
  tenantId = 1,
  queueName,
  jobType,
  status,
  page = 1,
  limit = 50
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * pageLimit;

  let query = "SELECT * FROM system_job_queue WHERE tenant_id = ?";
  let countQuery = "SELECT COUNT(*) as total FROM system_job_queue WHERE tenant_id = ?";
  const params = [tenantId];
  const countParams = [tenantId];

  if (queueName && queueName !== "ALL") {
    query += " AND queue_name = ?";
    countQuery += " AND queue_name = ?";
    params.push(queueName);
    countParams.push(queueName);
  }

  if (jobType && jobType !== "ALL") {
    query += " AND job_type = ?";
    countQuery += " AND job_type = ?";
    params.push(jobType);
    countParams.push(jobType);
  }

  if (status && status !== "ALL") {
    query += " AND status = ?";
    countQuery += " AND status = ?";
    params.push(status);
    countParams.push(status);
  }

  query += " ORDER BY run_at DESC, id DESC LIMIT ? OFFSET ?";
  params.push(pageLimit, offset);

  const total = db.prepare(countQuery).get(...countParams)?.total || 0;
  const rows = db.prepare(query).all(...params);

  return {
    jobs: rows.map(parseJobRow),
    total,
    page: pageNum,
    limit: pageLimit,
    totalPages: Math.ceil(total / pageLimit)
  };
}

/**
 * Return aggregate statistics for queue monitoring
 */
function getQueueStats(tenantId = 1) {
  const counts = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM system_job_queue
    WHERE tenant_id = ?
    GROUP BY status
  `).all(tenantId);

  const stats = {
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    deadLetter: 0,
    cancelled: 0,
    byQueue: {},
    activeWorkers: []
  };

  for (const c of counts) {
    stats.total += Number(c.count);
    if (c.status === "PENDING") stats.pending = Number(c.count);
    else if (c.status === "PROCESSING") stats.processing = Number(c.count);
    else if (c.status === "DONE") stats.done = Number(c.count);
    else if (c.status === "FAILED") stats.failed = Number(c.count);
    else if (c.status === "DEAD_LETTER") stats.deadLetter = Number(c.count);
    else if (c.status === "CANCELLED") stats.cancelled = Number(c.count);
  }

  const queueRows = db.prepare(`
    SELECT queue_name, COUNT(*) as count
    FROM system_job_queue
    WHERE tenant_id = ?
    GROUP BY queue_name
  `).all(tenantId);

  for (const q of queueRows) {
    stats.byQueue[q.queue_name] = Number(q.count);
  }

  const workerRows = db.prepare(`
    SELECT DISTINCT locked_by
    FROM system_job_queue
    WHERE tenant_id = ? AND status = 'PROCESSING' AND locked_by IS NOT NULL
  `).all(tenantId);

  stats.activeWorkers = workerRows.map(w => w.locked_by);

  return stats;
}

/**
 * Retry a failed or dead-letter job
 */
function retryJob(jobId, tenantId = 1) {
  const job = db.prepare("SELECT * FROM system_job_queue WHERE id = ? AND tenant_id = ?").get(jobId, tenantId);
  if (!job) {
    throw new Error("Job not found");
  }

  db.prepare(`
    UPDATE system_job_queue
    SET status = 'PENDING',
        attempts = 0,
        run_at = UTC_TIMESTAMP(),
        locked_by = NULL,
        locked_at = NULL,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(jobId);

  return { success: true, message: `Job #${jobId} requeued for immediate processing.` };
}

/**
 * Cancel a pending or failed job
 */
function cancelJob(jobId, tenantId = 1) {
  const job = db.prepare("SELECT * FROM system_job_queue WHERE id = ? AND tenant_id = ?").get(jobId, tenantId);
  if (!job) {
    throw new Error("Job not found");
  }

  if (job.status === "PROCESSING") {
    throw new Error("Cannot cancel a job that is currently PROCESSING");
  }

  db.prepare(`
    UPDATE system_job_queue
    SET status = 'CANCELLED',
        locked_by = NULL,
        locked_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(jobId);

  return { success: true, message: `Job #${jobId} cancelled.` };
}

/**
 * Delete a job permanently
 */
function deleteJob(jobId, tenantId = 1) {
  const job = db.prepare("SELECT * FROM system_job_queue WHERE id = ? AND tenant_id = ?").get(jobId, tenantId);
  if (!job) {
    throw new Error("Job not found");
  }

  if (job.status === "PROCESSING") {
    throw new Error("Cannot delete a job while it is actively PROCESSING");
  }

  db.prepare("DELETE FROM system_job_queue WHERE id = ?").run(jobId);

  return { success: true, message: `Job #${jobId} permanently deleted.` };
}

/**
 * List all recurring schedules
 */
function listSchedules(tenantId = 1) {
  const rows = db.prepare(`
    SELECT * FROM system_job_schedules
    WHERE tenant_id = ?
    ORDER BY schedule_name ASC
  `).all(tenantId);

  return rows.map(r => {
    let payload = {};
    try {
      payload = typeof r.payload_json === "string" ? JSON.parse(r.payload_json) : (r.payload_json || {});
    } catch (_) {}
    return {
      ...r,
      payload_json: payload
    };
  });
}

/**
 * Toggle a schedule on or off
 */
function toggleSchedule(scheduleId, isEnabled, tenantId = 1) {
  const schedule = db.prepare("SELECT * FROM system_job_schedules WHERE id = ? AND tenant_id = ?").get(scheduleId, tenantId);
  if (!schedule) {
    throw new Error("Schedule not found");
  }

  const enabledVal = isEnabled ? 1 : 0;
  db.prepare(`
    UPDATE system_job_schedules
    SET is_enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabledVal, scheduleId);

  return { success: true, isEnabled: enabledVal === 1 };
}

/**
 * Purge completed or cancelled jobs older than specified days
 */
function purgeOldJobs(olderThanDays = 7, tenantId = 1) {
  const days = Math.max(1, parseInt(olderThanDays, 10) || 7);
  const res = db.prepare(`
    DELETE FROM system_job_queue
    WHERE tenant_id = ?
      AND status IN ('DONE', 'CANCELLED')
      AND completed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
  `).run(tenantId, days);

  return { success: true, purgedCount: res.changes };
}

function parseJobRow(row) {
  if (!row) return null;
  let payload = {};
  try {
    payload = typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : (row.payload_json || {});
  } catch (_) {
    payload = row.payload_json;
  }

  return {
    ...row,
    payload_json: payload
  };
}

module.exports = {
  enqueueJob,
  getJobById,
  listJobs,
  getQueueStats,
  retryJob,
  cancelJob,
  deleteJob,
  listSchedules,
  toggleSchedule,
  purgeOldJobs,
  toUtcDatetimeString
};

