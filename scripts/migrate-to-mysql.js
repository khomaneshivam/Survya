/**
 * Complete Zero-Loss Data & Schema Migration from SQLite (whatsapp_bulk.db) to MySQL (whatsapp_bulk_db)
 */
const { DatabaseSync } = require('node:sqlite');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD;
if (!DB_PASSWORD) {
  console.error("Error: DB_PASSWORD environment variable is required.");
  process.exit(1);
}
const DB_NAME = process.env.DB_NAME || 'whatsapp_bulk_db';

function formatMySqlValue(val, mysqlType) {
  if (val === null || val === undefined) return null;
  if (mysqlType === 'DATETIME') {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.includes('T')) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 19).replace('T', ' ');
        }
      }
    }
  }
  return val;
}

const sqliteDbPath = path.join(__dirname, '../data/whatsapp_bulk.db');

if (!fs.existsSync(sqliteDbPath)) {
  console.error('SQLite database not found at:', sqliteDbPath);
  process.exit(1);
}

const sqlite = new DatabaseSync(sqliteDbPath);

async function runMigration() {
  console.log(`=== Starting SQLite to MySQL Migration ===`);
  console.log(`Target MySQL: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);

  // 1. Connect without database to ensure database exists
  const rootConn = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD
  });

  console.log(`Creating database '${DB_NAME}' if not exists...`);
  await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await rootConn.end();

  // 2. Connect to the target database
  const target = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: true
  });

  await target.query('SET FOREIGN_KEY_CHECKS = 0;');

  // List all tables from SQLite
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;").all();
  console.log(`Found ${tables.length} tables in SQLite to migrate.\n`);

  for (const { name: tableName } of tables) {
    // Read table column info from SQLite PRAGMA table_info
    const cols = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all();
    if (!cols || cols.length === 0) continue;

    const colDefs = [];
    const pkCols = [];

    for (const c of cols) {
      const colName = `\`${c.name}\``;
      const colTypeUpper = (c.type || 'TEXT').toUpperCase();
      let mysqlType = 'TEXT';

      const isPk = Boolean(c.pk);
      if (isPk) pkCols.push(`\`${c.name}\``);

      const hasDefault = Boolean(c.dflt_value !== null && c.dflt_value !== undefined);

      if (colTypeUpper.includes('INT')) {
        mysqlType = isPk && cols.length === 1 ? 'BIGINT AUTO_INCREMENT' : 'BIGINT';
      } else if (colTypeUpper.includes('REAL') || colTypeUpper.includes('FLOA') || colTypeUpper.includes('DOUB')) {
        mysqlType = 'DOUBLE';
      } else if (colTypeUpper.includes('BOOL')) {
        mysqlType = 'TINYINT(1)';
      } else if (colTypeUpper.includes('DATE') || colTypeUpper.includes('TIME')) {
        mysqlType = 'DATETIME';
      } else {
        // String / Text: In MySQL, if column has a default value or is an ID/key/status, it must be VARCHAR
        if (isPk || hasDefault || c.name.endsWith('_id') || c.name.endsWith('_status') || c.name === 'status' || c.name === 'key' || c.name === 'id' || c.name === 'slug' || c.name === 'phone' || c.name === 'email' || c.name === 'wa_message_id' || c.name === 'source' || c.name === 'type' || c.name === 'role') {
          mysqlType = 'VARCHAR(255)';
        } else {
          mysqlType = 'LONGTEXT';
        }
      }

      // Default value
      let defaultClause = '';
      if (c.dflt_value !== null && c.dflt_value !== undefined) {
        const dflt = String(c.dflt_value).trim();
        if (dflt.toUpperCase() === 'CURRENT_TIMESTAMP') {
          defaultClause = 'DEFAULT CURRENT_TIMESTAMP';
        } else if (dflt.startsWith("'") && dflt.endsWith("'")) {
          defaultClause = `DEFAULT ${dflt}`;
        } else if (!isNaN(Number(dflt))) {
          defaultClause = `DEFAULT ${dflt}`;
        }
      }

      const nullableClause = isPk || c.notnull ? 'NOT NULL' : 'NULL';
      colDefs.push(`${colName} ${mysqlType} ${nullableClause} ${defaultClause}`.trim());
    }

    if (pkCols.length > 0) {
      colDefs.push(`PRIMARY KEY (${pkCols.join(', ')})`);
    }

    // Drop and re-create table
    const createSql = `DROP TABLE IF EXISTS \`${tableName}\`; CREATE TABLE \`${tableName}\` (${colDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
    await target.query(createSql);

    // Fetch all rows from SQLite
    const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
    if (rows.length > 0) {
      const keys = Object.keys(rows[0]);
      const quotedKeys = keys.map(k => `\`${k}\``).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const insertSql = `INSERT INTO \`${tableName}\` (${quotedKeys}) VALUES (${placeholders})`;

      // Batch insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        for (const row of chunk) {
          const values = keys.map(k => {
            let v = row[k];
            if (v === undefined || v === null) return null;
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
              return v.replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
            }
            return v;
          });
          await target.query(insertSql, values);
        }
      }
      console.log(` ✓ ${tableName.padEnd(32)}: Migrated ${rows.length} rows`);
    } else {
      console.log(` ✓ ${tableName.padEnd(32)}: Schema created (0 rows)`);
    }
  }

  await target.query('SET FOREIGN_KEY_CHECKS = 1;');
  await target.end();

  console.log(`\n=== Migration Completed Successfully! ===`);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
