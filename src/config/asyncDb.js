const mysql = require("mysql2/promise");
const config = require("./env");

let pool = null;

/**
 * Returns a shared async connection pool for transactional queue operations
 * Pure UTC (+00:00) ensures zero shift between IST and UTC MySQL DATETIME
 */
function getAsyncPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.DB_HOST || "localhost",
      port: config.DB_PORT || 3306,
      user: config.DB_USER || "root",
      password: config.DB_PASSWORD || "",
      database: config.DB_NAME || "whatsapp_bulk_db",
      waitForConnections: true,
      connectionLimit: 12,
      queueLimit: 0,
      multipleStatements: true,
      timezone: "+00:00",
      dateStrings: true
    });
  }
  return pool;
}

/**
 * Gracefully close the connection pool during shutdown
 */
async function closeAsyncPool() {
  if (pool) {
    try {
      await pool.end();
    } catch (_) {}
    pool = null;
  }
}

module.exports = {
  getAsyncPool,
  closeAsyncPool
};
