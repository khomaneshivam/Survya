const { Worker } = require('worker_threads');
const path = require('path');

function createMysqlDatabase(dbConfig) {
  const sab = new SharedArrayBuffer(16 * 1024 * 1024); // 16MB shared buffer
  const status = new Int32Array(sab, 0, 2);
  const decoder = new TextDecoder('utf-8');

  const workerPath = path.join(__dirname, 'mysqlWorker.js');
  const worker = new Worker(workerPath, {
    workerData: {
      sab,
      dbConfig
    }
  });

  worker.unref(); // Don't prevent process from exiting

  function executeSync(type, sql, params = [], mode = 'all') {
    const trimmedSql = (sql || '').trim();

    // Check if PRAGMA statement from SQLite
    if (trimmedSql.toUpperCase().startsWith('PRAGMA')) {
      if (!trimmedSql.match(/PRAGMA\s+table_info/i)) {
        if (mode === 'run') return { changes: 0, lastInsertRowid: 0 };
        if (mode === 'get') return undefined;
        return [];
      }
      // PRAGMA table_info continues to worker for SHOW COLUMNS reflection
    }

    status[0] = 0;
    worker.postMessage({ type, sql, params, mode });
    Atomics.wait(status, 0, 0);

    const state = status[0];
    const len = status[1];
    const bytes = new Uint8Array(sab, 8, len);
    const jsonStr = decoder.decode(bytes);
    const result = JSON.parse(jsonStr);

    if (state === 2) {
      const err = new Error(result.error);
      err.sql = sql;
      throw err;
    }

    return result;
  }

  const db = {
    prepare(sql) {
      return {
        get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const rows = executeSync('query', sql, flatParams, 'all');
          return Array.isArray(rows) && rows.length > 0 ? rows[0] : undefined;
        },
        all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const rows = executeSync('query', sql, flatParams, 'all');
          return Array.isArray(rows) ? rows : [];
        },
        run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return executeSync('query', sql, flatParams, 'run');
        }
      };
    },
    exec(sql) {
      if (!sql || !sql.trim()) return;
      return executeSync('exec', sql);
    },
    close() {
      try {
        worker.terminate();
      } catch (e) {}
    }
  };

  return db;
}

module.exports = {
  createMysqlDatabase
};
