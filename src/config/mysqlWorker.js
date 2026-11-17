const { parentPort, workerData } = require('worker_threads');
const mysql = require('mysql2/promise');

const { sab, dbConfig } = workerData;
const status = new Int32Array(sab, 0, 2); // status[0] = state, status[1] = byte length
const dataView = new Uint8Array(sab, 8);
const encoder = new TextEncoder();

let pool;

async function init() {
  try {
    pool = mysql.createPool({
      host: dbConfig.host || 'localhost',
      port: dbConfig.port || 3306,
      user: dbConfig.user || 'root',
      password: dbConfig.password || '',
      database: dbConfig.database || 'whatsapp_bulk_db',
      waitForConnections: true,
      connectionLimit: 15,
      multipleStatements: true,
      timezone: '+05:30',
      dateStrings: true
    });
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message });
  }
}

parentPort.on('message', async (task) => {
  try {
    let sql = task.sql;
    let params = task.params || [];

    // Intercept PRAGMA table_info(tableName) for schema reflection
    const pragmaMatch = sql.match(/PRAGMA\s+table_info\(['"]?(\w+)['"]?\)/i);
    if (pragmaMatch) {
      const tableName = pragmaMatch[1];
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
      const tableInfo = cols.map(c => ({
        name: c.Field,
        type: c.Type,
        notnull: c.Null === 'NO' ? 1 : 0,
        dflt_value: c.Default,
        pk: c.Key === 'PRI' ? 1 : 0
      }));
      const json = JSON.stringify(tableInfo);
      const encoded = encoder.encode(json);
      dataView.set(encoded);
      status[1] = encoded.length;
      status[0] = 1;
      Atomics.notify(status, 0, 1);
      return;
    }

    // SQLite dialect translation
    if (/BEGIN\s+(IMMEDIATE\s+)?TRANSACTION/i.test(sql)) {
      sql = sql.replace(/BEGIN\s+(IMMEDIATE\s+)?TRANSACTION/gi, 'START TRANSACTION');
    }
    if (/BEGIN\s+IMMEDIATE/i.test(sql)) {
      sql = sql.replace(/BEGIN\s+IMMEDIATE/gi, 'START TRANSACTION');
    }
    if (sql.includes('INSERT OR IGNORE')) {
      sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO');
    }
    if (sql.includes('INSERT OR REPLACE')) {
      sql = sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, 'REPLACE INTO');
    }
    if (sql.includes('ON CONFLICT')) {
      sql = sql.replace(/ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
      sql = sql.replace(/\bexcluded\.([a-zA-Z0-9_]+)/gi, 'VALUES($1)');
    }
    if (sql.includes('AUTOINCREMENT')) {
      sql = sql.replace(/\bAUTOINCREMENT\b/gi, 'AUTO_INCREMENT');
    }
    if (sql.includes('CREATE INDEX IF NOT EXISTS')) {
      sql = sql.replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi, 'CREATE INDEX');
    }
    if (sql.includes("date(?, '-1 day')")) {
      sql = sql.replace(/date\(\?,\s*'-1 day'\)/gi, 'DATE_SUB(?, INTERVAL 1 DAY)');
    }
    if (sql.includes("datetime('now', '-24 hours')")) {
      sql = sql.replace(/datetime\('now',\s*'-24 hours'\)/gi, 'DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    }
    if (sql.includes("datetime('now'")) {
      sql = sql.replace(/datetime\('now'\)/gi, 'NOW()');
    }
    // Handle datetime(received_at) or datetime(col)
    sql = sql.replace(/\bdatetime\(\s*([a-zA-Z0-9_]+)\s*\)/gi, '$1');

    // MySQL uses GREATEST / LEAST for multi-argument scalar max / min
    sql = sql.replace(/\bMAX\s*\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/gi, 'GREATEST($1, $2)');
    sql = sql.replace(/\bMIN\s*\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/gi, 'LEAST($1, $2)');

    // MySQL is case-insensitive by default in utf8mb4; strip SQLite-specific COLLATE NOCASE
    sql = sql.replace(/\s+COLLATE\s+NOCASE\b/gi, '');

    // Quote MySQL reserved keywords like `key` in settings table and `read`
    sql = sql.replace(/\bas\s+read\b/gi, 'as `read`');
    sql = sql.replace(/\bWHERE\s+key\b/gi, 'WHERE `key`');
    sql = sql.replace(/\bSELECT\s+key\b/gi, 'SELECT `key`');
    sql = sql.replace(/\bkey\s*=/gi, '`key` =');
    sql = sql.replace(/\(key,/gi, '(`key`,');
    sql = sql.replace(/, key\)/gi, ', `key`)');
    sql = sql.replace(/, key,/gi, ', `key`,');
    sql = sql.replace(/\bsettings\s*\(\s*key\b/gi, 'settings (`key`');

    // Sanitize parameters for MySQL strict mode (e.g. ISO datetimes and undefined)
    const sanitizedParams = params.map(p => {
      if (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p)) {
        const d = new Date(p);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
      return p === undefined ? null : p;
    });

    if (task.type === 'exec') {
      try {
        await pool.query(sql);
      } catch (execErr) {
        if (execErr.code === 'ER_DUP_KEYNAME' || execErr.errno === 1061) {
          // Index already exists in MySQL
        } else {
          throw execErr;
        }
      }
      const json = JSON.stringify({ ok: true });
      const encoded = encoder.encode(json);
      dataView.set(encoded);
      status[1] = encoded.length;
      status[0] = 1; // success
    } else {
      const [rows] = await pool.query(sql, sanitizedParams);
      
      let payload;
      if (task.mode === 'run') {
        payload = {
          changes: rows?.affectedRows || 0,
          lastInsertRowid: rows?.insertId || 0
        };
      } else {
        payload = Array.isArray(rows) ? rows : (rows ? [rows] : []);
      }

      const json = JSON.stringify(payload);
      const encoded = encoder.encode(json);
      dataView.set(encoded);
      status[1] = encoded.length;
      status[0] = 1; // success
    }
  } catch (err) {
    const json = JSON.stringify({ error: err.message, sql: task.sql });
    const encoded = encoder.encode(json);
    dataView.set(encoded);
    status[1] = encoded.length;
    status[0] = 2; // error
  } finally {
    Atomics.notify(status, 0, 1);
  }
});

init();
