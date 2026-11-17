const config = require("./env");
const { createMysqlDatabase } = require("./mysqlAdapter");
const { initSchema } = require("./schema");

const db = createMysqlDatabase({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME
});

function initializeDatabase() {
  initSchema(db, config);
}

// Auto-run schema initialization on startup
initializeDatabase();

module.exports = {
  db,
  initializeDatabase,
  getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE `key` = ?").get(key);
    return row ? row.value : null;
  },
  setSetting(key, value) {
    db.prepare("INSERT OR REPLACE INTO settings (`key`, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, String(value));
  },
  getAllSettings() {
    const rows = db.prepare("SELECT `key`, value FROM settings").all();
    const result = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
};
