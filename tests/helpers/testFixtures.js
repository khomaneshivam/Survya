const { db } = require("../../src/config/database");
const { closeAsyncPool } = require("../../src/config/asyncDb");

/**
 * Ensures a clean isolated DB always has an active Workspace/Platform Admin for tenant `tenantId`.
 */
function ensureTestAdmin(tenantId = 1) {
  const numericTid = Number(tenantId) || 1;
  let admin = db.prepare(
    "SELECT * FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN') AND COALESCE(tenant_id, 1) = ? AND COALESCE(delete_status, 0) = 0 LIMIT 1"
  ).get(numericTid);

  if (!admin) {
    const id = `test_admin_t${numericTid}_${Date.now()}`;
    const email = `admin_t${numericTid}_${Date.now()}@survya.test`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Test Admin', ?, '919999999900', 'hash', 'ADMIN', 'ACTIVE', 1, 0)
    `).run(id, numericTid, email);
    try {
      db.prepare("INSERT IGNORE INTO tenant_user_memberships (tenant_id, user_id, role) VALUES (?, ?, 'OWNER')").run(numericTid, id);
    } catch (_) {}
    admin = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }
  return admin;
}

/**
 * Ensures a clean isolated DB has a default WABA line for `tenantId`.
 */
function ensureTestWabaLine(tenantId = 1, phoneNumberId = "1510764325447375") {
  const numericTid = Number(tenantId) || 1;
  let existing = db.prepare(
    "SELECT * FROM waba_phone_numbers WHERE COALESCE(tenant_id, 1) = ? AND COALESCE(delete_status, 0) = 0 ORDER BY is_default DESC, id ASC LIMIT 1"
  ).get(numericTid);

  if (!existing) {
    const id = `waba_fixture_${numericTid}_${Date.now()}`;
    db.prepare(`
      INSERT INTO waba_phone_numbers (
        id, tenant_id, display_name, phone_number, phone_number_id, waba_id,
        quality_rating, status, is_default, delete_status
      ) VALUES (?, ?, 'Survya Test Line', '+919999999900', ?, 'waba_test_fixture', 'GREEN', 'VERIFIED', 1, 0)
    `).run(id, numericTid, phoneNumberId);
    existing = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(id);
  }
  return existing;
}

/**
 * Gracefully shuts down an HTTP server and closes the shared async MySQL pool
 * so `node --test` never hangs on open handles.
 */
async function closeTestResources(server = null) {
  if (server) {
    try {
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(() => resolve()));
    } catch (_) {}
  }
  try {
    await closeAsyncPool();
  } catch (_) {}
}

module.exports = {
  ensureTestAdmin,
  ensureTestWabaLine,
  closeTestResources
};
