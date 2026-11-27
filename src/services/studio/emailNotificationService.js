const nodemailer = require("nodemailer");
const { db } = require("../../config/database");
const jobQueueService = require("../queue/jobQueueService");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maskSecrets(text) {
  let str = String(text || "");
  const secrets = [process.env.SMTP_PASS, process.env.JWT_SECRET, process.env.WHATSAPP_API_TOKEN]
    .filter((s) => s && String(s).length >= 4);
  for (const s of secrets) {
    str = str.split(s).join("***REDACTED***");
  }
  str = str.replace(/(pass(?:word)?|secret|token|authorization)\s*[:=]\s*\S+/gi, "$1=***REDACTED***");
  return str.slice(0, 1000);
}

function getEnvEmailStatus() {
  const enabled = String(process.env.EMAIL_ENABLED || "false").toLowerCase() === "true";
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const fromAddress = String(process.env.EMAIL_FROM_ADDRESS || "").trim();
  const fromName = String(process.env.EMAIL_FROM_NAME || "Survya Studio").trim();
  const provider = String(process.env.EMAIL_PROVIDER || "smtp").trim();

  const missingFields = [];
  if (!enabled) missingFields.push("EMAIL_ENABLED=true");
  if (!host) missingFields.push("SMTP_HOST");
  if (!fromAddress) missingFields.push("EMAIL_FROM_ADDRESS");
  if (user && !pass) missingFields.push("SMTP_PASS");

  const configured = enabled && Boolean(host && fromAddress);
  return {
    enabled,
    configured,
    provider,
    host: host || null,
    port,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    user: user ? `${user.slice(0, 2)}***` : null,
    fromName,
    fromAddress: fromAddress || null,
    defaultRecipients: String(process.env.EMAIL_DEFAULT_RECIPIENTS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => EMAIL_RE.test(s)),
    missingFields
  };
}

function parseJsonSafe(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function getTenantEmailSettings(tenantId = 1) {
  const numericTenantId = Number(tenantId) || 1;
  const row = db.prepare("SELECT * FROM tenant_email_settings WHERE tenant_id = ?").get(numericTenantId);
  const envStatus = getEnvEmailStatus();

  return {
    tenantId: numericTenantId,
    enabled: row ? Boolean(row.enabled) : true,
    recipients: row ? parseJsonSafe(row.recipients_json, []) : envStatus.defaultRecipients,
    notifyEvents: row ? parseJsonSafe(row.notify_events_json, ["*"]) : ["*"],
    fromName: row?.from_name || envStatus.fromName,
    replyTo: row?.reply_to || null,
    templateOverrides: row ? parseJsonSafe(row.template_overrides_json, {}) : {},
    envStatus
  };
}

function updateTenantEmailSettings(tenantId = 1, payload = {}, actor = "studio") {
  const numericTenantId = Number(tenantId) || 1;
  const rawRecipients = Array.isArray(payload.recipients)
    ? payload.recipients
    : String(payload.recipients || "").split(",");

  const cleanRecipients = [...new Set(
    rawRecipients
      .map((r) => String(r || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  for (const email of cleanRecipients) {
    if (!EMAIL_RE.test(email)) {
      throw new Error(`Invalid recipient email address: ${email}`);
    }
  }

  const notifyEvents = Array.isArray(payload.notifyEvents) && payload.notifyEvents.length > 0
    ? payload.notifyEvents.map(String)
    : ["*"];

  const replyTo = payload.replyTo ? String(payload.replyTo).trim() : null;
  if (replyTo && !EMAIL_RE.test(replyTo)) {
    throw new Error(`Invalid replyTo email address: ${replyTo}`);
  }

  const enabled = payload.enabled !== false ? 1 : 0;
  const fromName = payload.fromName ? String(payload.fromName).trim() : null;
  const templates = payload.templateOverrides && typeof payload.templateOverrides === "object"
    ? payload.templateOverrides
    : {};

  db.prepare(`
    INSERT INTO tenant_email_settings (
      tenant_id, enabled, recipients_json, notify_events_json,
      from_name, reply_to, template_overrides_json, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      enabled = VALUES(enabled),
      recipients_json = VALUES(recipients_json),
      notify_events_json = VALUES(notify_events_json),
      from_name = VALUES(from_name),
      reply_to = VALUES(reply_to),
      template_overrides_json = VALUES(template_overrides_json),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    numericTenantId,
    enabled,
    JSON.stringify(cleanRecipients),
    JSON.stringify(notifyEvents),
    fromName,
    replyTo,
    JSON.stringify(templates),
    actor
  );

  return getTenantEmailSettings(numericTenantId);
}

function renderNotificationContent(eventName, payload = {}, templateOverrides = {}) {
  const customSubj = templateOverrides[eventName]?.subject;
  const expName = payload.experienceName || "Survya Experience";
  const refCode = payload.referenceCode || "N/A";
  const custName = payload.customerName || "Customer";
  const custPhone = payload.customerPhone || "N/A";
  const custEmail = payload.customerEmail || "N/A";
  const totalAmount = Number(payload.monetaryValue || 0);

  const subject = customSubj
    ? customSubj.replace(/\{\{referenceCode\}\}/g, refCode).replace(/\{\{experienceName\}\}/g, expName)
    : `[Survya Alert] ${eventName} — ${expName} (${refCode})`;

  const lines = [
    `Business Event: ${eventName}`,
    `Experience: ${expName}`,
    `Reference: ${refCode}`,
    `Customer Name: ${custName}`,
    `Phone: ${custPhone}`,
    `Email: ${custEmail}`,
    payload.selectedItemTitle ? `Selected Item: ${payload.selectedItemTitle}` : null,
    payload.datesSummary ? `Schedule: ${payload.datesSummary}` : null,
    totalAmount > 0 ? `Amount: ${payload.currency || "INR"} ${totalAmount}` : null
  ].filter(Boolean);

  const text = lines.join("\n");
  const htmlRows = lines
    .map((line) => {
      const [k, ...rest] = line.split(": ");
      return `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-weight:600;">${escapeHtml(k)}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;">${escapeHtml(rest.join(": "))}</td></tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
      <h2 style="color:#2F5219;margin-bottom:8px;">${escapeHtml(eventName)}</h2>
      <p style="margin-top:0;color:#475569;">Triggered by <strong>${escapeHtml(expName)}</strong></p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${htmlRows}</table>
    </div>
  `;

  return { subject, text, html };
}

function enqueueGoalEmailNotification({
  tenantId = 1,
  experienceId = null,
  goalOutcomeId = null,
  eventName,
  idempotencyKey,
  payload = {},
  explicitRecipients = []
} = {}) {
  const numericTenantId = Number(tenantId) || 1;
  try {
    const trow = db.prepare("SELECT is_sandbox FROM tenants WHERE id = ? LIMIT 1").get(numericTenantId);
    if (Number(trow?.is_sandbox) === 1) {
      return {
        queued: false,
        suppressed: true,
        isSandbox: true,
        status: "SANDBOX_SUPPRESSED",
        reason: "External email dispatch is disabled in Workspace Sandbox Mode."
      };
    }
  } catch (_) {}
  const settings = getTenantEmailSettings(numericTenantId);

  if (!settings.enabled) {
    return { queued: false, reason: "Tenant email notifications are disabled" };
  }

  const eventAllowed = settings.notifyEvents.includes("*") || settings.notifyEvents.includes(eventName);
  if (!eventAllowed) {
    return { queued: false, reason: `Event '${eventName}' excluded by tenant settings` };
  }

  const combinedRecipients = [...new Set([
    ...(Array.isArray(explicitRecipients) ? explicitRecipients : []),
    ...(settings.recipients || [])
  ].map((e) => String(e || "").trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];

  if (combinedRecipients.length === 0) {
    return { queued: false, reason: "No valid recipient email addresses configured" };
  }

  const cleanKey = String(idempotencyKey || `email_${numericTenantId}_${goalOutcomeId || Date.now()}`);
  const existingLog = db.prepare("SELECT * FROM email_notification_logs WHERE idempotency_key = ?").get(cleanKey);
  if (existingLog) {
    return {
      queued: false,
      deduplicated: true,
      logId: existingLog.id,
      status: existingLog.status
    };
  }

  const rendered = renderNotificationContent(eventName, payload, settings.templateOverrides);
  const envConfigured = settings.envStatus.configured;
  const initialStatus = envConfigured ? "QUEUED" : "UNCONFIGURED";
  const initialError = envConfigured
    ? null
    : `SMTP unconfigured: set ${settings.envStatus.missingFields.join(", ")}`;

  const res = db.prepare(`
    INSERT INTO email_notification_logs (
      tenant_id, experience_id, goal_outcome_id, event_name, idempotency_key,
      recipients_json, subject, payload_json, status, attempts, max_attempts, last_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5, ?)
  `).run(
    numericTenantId,
    experienceId || null,
    goalOutcomeId || null,
    eventName,
    cleanKey,
    JSON.stringify(combinedRecipients),
    rendered.subject,
    JSON.stringify({ ...payload, text: rendered.text, html: rendered.html }),
    initialStatus,
    initialError
  );

  const logId = res.lastInsertRowid;

  if (!envConfigured) {
    return {
      queued: false,
      unconfigured: true,
      logId,
      status: "UNCONFIGURED",
      missingFields: settings.envStatus.missingFields
    };
  }

  const jobRes = jobQueueService.enqueueJob({
    tenantId: numericTenantId,
    queueName: "default",
    jobType: "EMAIL_NOTIFICATION_DISPATCH",
    idempotencyKey: `job_${cleanKey}`,
    payload: {
      logId,
      tenantId: numericTenantId
    },
    priority: 30,
    maxAttempts: 5
  });

  return {
    queued: true,
    logId,
    jobId: jobRes.jobId || null,
    status: "QUEUED",
    recipients: combinedRecipients
  };
}

function createSmtpTransportFromEnv() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();

  const opts = { host, port, secure };
  if (user) {
    opts.auth = { user, pass };
  }
  return nodemailer.createTransport(opts);
}

/**
 * Worker execution handler for EMAIL_NOTIFICATION_DISPATCH jobs.
 */
async function dispatchEmailJob(jobPayload = {}, { transportOverride = null } = {}) {
  const logId = jobPayload.logId;
  if (!logId) {
    throw new Error("Missing logId in EMAIL_NOTIFICATION_DISPATCH payload");
  }

  const logRow = db.prepare("SELECT * FROM email_notification_logs WHERE id = ?").get(logId);
  if (!logRow) {
    return { skipped: true, reason: "Notification log not found" };
  }

  if (logRow.status === "SENT") {
    return { skipped: true, reason: "Already SENT", logId };
  }

  try {
    const trow = db.prepare("SELECT is_sandbox FROM tenants WHERE id = ? LIMIT 1").get(Number(logRow.tenant_id || 1));
    if (Number(trow?.is_sandbox) === 1) {
      db.prepare("UPDATE email_notification_logs SET status = 'SANDBOX_SUPPRESSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(logRow.id);
      return { skipped: true, status: "SANDBOX_SUPPRESSED", logId: logRow.id };
    }
  } catch (_) {}

  const settings = getTenantEmailSettings(logRow.tenant_id);
  const recipients = parseJsonSafe(logRow.recipients_json, []);
  const msgPayload = parseJsonSafe(logRow.payload_json, {});

  if (!transportOverride && !settings.envStatus.configured) {
    db.prepare(`
      UPDATE email_notification_logs
      SET status = 'UNCONFIGURED',
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(`SMTP unconfigured: ${settings.envStatus.missingFields.join(", ")}`, logRow.id);
    return { skipped: true, status: "UNCONFIGURED", logId };
  }

  const transporter = transportOverride || createSmtpTransportFromEnv();
  const fromEmail = settings.envStatus.fromAddress || "no-reply@example.com";
  const fromName = settings.fromName || "Survya Studio";

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: recipients.join(", "),
      replyTo: settings.replyTo || undefined,
      subject: logRow.subject,
      text: msgPayload.text || logRow.subject,
      html: msgPayload.html || `<p>${escapeHtml(logRow.subject)}</p>`
    });

    db.prepare(`
      UPDATE email_notification_logs
      SET status = 'SENT',
          attempts = attempts + 1,
          provider_message_id = ?,
          last_error = NULL,
          sent_at = UTC_TIMESTAMP(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(info?.messageId || null, logRow.id);

    return { sent: true, logId: logRow.id, messageId: info?.messageId || null };
  } catch (err) {
    const safeErr = maskSecrets(err.message || "SMTP delivery failure");
    const nextAttempts = Number(logRow.attempts || 0) + 1;
    const isDead = nextAttempts >= Number(logRow.max_attempts || 5);
    db.prepare(`
      UPDATE email_notification_logs
      SET status = ?,
          attempts = ?,
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(isDead ? "DEAD_LETTER" : "FAILED_RETRYING", nextAttempts, safeErr, logRow.id);
    throw new Error(safeErr);
  }
}

function listNotificationLogs(tenantId = 1, { limit = 50, status = "ALL" } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT id, tenant_id, experience_id, goal_outcome_id, event_name,
           recipients_json, subject, status, attempts, max_attempts,
           last_error, provider_message_id, sent_at, created_at
    FROM email_notification_logs
    WHERE tenant_id = ?
  `;
  const params = [numericTenantId];
  if (status && status !== "ALL") {
    sql += " AND status = ?";
    params.push(String(status).toUpperCase());
  }
  sql += " ORDER BY id DESC LIMIT ?";
  params.push(Math.max(1, Math.min(200, Number(limit) || 50)));
  return db.prepare(sql).all(...params);
}

function retryNotificationLog(tenantId = 1, logId) {
  const numericTenantId = Number(tenantId) || 1;
  const row = db.prepare("SELECT * FROM email_notification_logs WHERE id = ? AND tenant_id = ?").get(logId, numericTenantId);
  if (!row) {
    throw new Error("Notification log not found");
  }
  if (row.status === "SENT") {
    return { alreadySent: true, logId: row.id };
  }

  db.prepare(`
    UPDATE email_notification_logs
    SET status = 'QUEUED',
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(row.id, numericTenantId);

  const jobRes = jobQueueService.enqueueJob({
    tenantId: numericTenantId,
    queueName: "default",
    jobType: "EMAIL_NOTIFICATION_DISPATCH",
    idempotencyKey: `retry_${row.idempotency_key}_${Date.now()}`,
    payload: { logId: row.id, tenantId: numericTenantId },
    priority: 20,
    maxAttempts: 5
  });

  return { retried: true, logId: row.id, jobId: jobRes.jobId || null };
}

module.exports = {
  getEnvEmailStatus,
  getTenantEmailSettings,
  updateTenantEmailSettings,
  renderNotificationContent,
  enqueueGoalEmailNotification,
  dispatchEmailJob,
  listNotificationLogs,
  retryNotificationLog,
  maskSecrets
};
