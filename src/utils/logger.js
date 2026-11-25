const crypto = require("crypto");

/**
 * Lightweight structured logger with correlation ID support.
 */
function logEvent(level, event, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level: String(level || "info").toLowerCase(),
    event,
    ...meta
  };
  if (process.env.LOG_STRUCTURED === "true") {
    const line = JSON.stringify(entry);
    if (entry.level === "error") console.error(line);
    else if (entry.level === "warn") console.warn(line);
    else console.log(line);
  }
  return entry;
}

/**
 * Express middleware attaching deterministic/incoming x-request-id correlation header
 * and recording structured API latency telemetry when LOG_STRUCTURED=true.
 */
function correlationMiddleware(req, res, next) {
  const incoming = req.headers["x-request-id"];
  const requestId = (incoming && String(incoming).trim()) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    if (process.env.LOG_STRUCTURED !== "true") return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logEvent("info", "http_request", {
      requestId,
      tenantId: req.user?.tenant_id ? Number(req.user.tenant_id) : null,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100
    });
  });

  next();
}

module.exports = {
  logEvent,
  correlationMiddleware
};
