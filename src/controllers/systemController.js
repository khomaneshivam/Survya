const timeUtil = require("../utils/timeUtil");
const { setSetting } = require("../config/database");

/**
 * Get current system date and time
 * Consistently formatted for both local dev and cloud deployments
 */
async function getSystemTime(req, res) {
  try {
    const tz = req.query.tz || null;
    const timeData = timeUtil.getSystemTime(tz);

    return res.status(200).json({
      success: true,
      data: {
        ...timeData,
        today: timeUtil.getTodayDateString(tz),
        tomorrow: timeUtil.getOffsetDateString(1, tz),
        yesterday: timeUtil.getOffsetDateString(-1, tz)
      }
    });
  } catch (error) {
    console.error("getSystemTime error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update system timezone configuration
 */
async function updateTimezone(req, res) {
  try {
    const { timezone } = req.body || {};
    if (!timezone || typeof timezone !== "string") {
      return res.status(400).json({ success: false, message: "Valid timezone identifier is required (e.g. 'Asia/Kolkata')." });
    }

    const trimmed = timezone.trim();
    // Validate timezone string with Intl
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    } catch (tzErr) {
      return res.status(400).json({ success: false, message: `Invalid timezone identifier: '${trimmed}'` });
    }

    setSetting("APP_TIMEZONE", trimmed);

    const updatedTime = timeUtil.getSystemTime(trimmed);
    return res.status(200).json({
      success: true,
      message: `System timezone updated to ${trimmed}`,
      data: updatedTime
    });
  } catch (error) {
    console.error("updateTimezone error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Live System Health & Telemetry Endpoint
 * Returns process metrics, database connectivity, host, and active tenant status.
 */
async function getSystemHealth(req, res) {
  try {
    const { db, getSetting } = require("../config/database");
    const mem = process.memoryUsage();
    let tenantCount = 1;
    try {
      tenantCount = db.prepare("SELECT COUNT(*) as cnt FROM tenants WHERE COALESCE(delete_status, 0) = 0").get()?.cnt || 1;
    } catch (e) {}

    return res.status(200).json({
      success: true,
      data: {
        status: "healthy",
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMb: {
          rss: Math.round(mem.rss / (1024 * 1024)),
          heapUsed: Math.round(mem.heapUsed / (1024 * 1024)),
          heapTotal: Math.round(mem.heapTotal / (1024 * 1024))
        },
        dbEngine: "MySQL 8.4",
        dbHost: process.env.DB_HOST || "localhost",
        dbPort: parseInt(process.env.DB_PORT || "3306", 10),
        dbName: process.env.DB_NAME || "whatsapp_bulk_db",
        environment: process.env.NODE_ENV || "development",
        activeTenantCount: tenantCount,
        timezone: getSetting("APP_TIMEZONE") || "Asia/Kolkata",
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("getSystemHealth error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  getSystemTime,
  updateTimezone,
  getSystemHealth
};
