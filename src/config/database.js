const config = require("./env");
const { createMysqlDatabase } = require("./mysqlAdapter");
const { initSchema } = require("./schema");
const { encrypt, decrypt } = require("../utils/cryptoUtil");

const SENSITIVE_SETTING_KEYS = new Set([
  "WHATSAPP_API_TOKEN",
  "META_APP_SECRET",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY"
]);

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
  getDb: () => db,
  initializeDatabase,
  getSetting(key) {
    const row = db.prepare("SELECT value FROM settings WHERE `key` = ?").get(key);
    if (!row || row.value === null || row.value === undefined) return null;
    return decrypt(row.value);
  },
  setSetting(key, value) {
    if (value === null || value === undefined) {
      db.prepare("DELETE FROM settings WHERE `key` = ?").run(key);
      return;
    }
    let valToStore = String(value);
    if (SENSITIVE_SETTING_KEYS.has(key)) {
      valToStore = encrypt(valToStore);
    }
    db.prepare("INSERT OR REPLACE INTO settings (`key`, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(key, valToStore);
  },
  getAllSettings() {
    const rows = db.prepare("SELECT `key`, value FROM settings").all();
    const result = {};
    for (const r of rows) {
      result[r.key] = decrypt(r.value);
    }
    return result;
  }
};
