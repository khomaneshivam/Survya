const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("../config/database");
const { isPlatformAdmin } = require("../middleware/authMiddleware");

const ALLOWED_WORKSPACE_ROLES = ["ADMIN", "USER", "AGENT"];

function formatWorkspaceMember(row) {
  if (!row) return null;
  const wsRole = String(row.workspace_role || (row.role === "ADMIN" ? "OWNER" : "USER")).toUpperCase();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    workspaceRole: wsRole,
    status: row.status,
    assigned_phone_id: row.assigned_phone_id,
    tenant_id: Number(row.tenant_id || 1),
    created_at: row.created_at,
    last_login_at: row.last_login_at
  };
}

/**
 * List members belonging strictly to the caller's active workspace tenant.
 */
async function listWorkspaceUsers(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.assigned_phone_id, u.tenant_id, u.created_at, u.last_login_at,
             COALESCE(m.role, CASE WHEN u.role = 'ADMIN' THEN 'OWNER' ELSE 'USER' END) AS workspace_role
      FROM users u
      LEFT JOIN tenant_user_memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE COALESCE(u.delete_status, 0) = 0
        AND (u.tenant_id = ? OR m.tenant_id = ?)
      ORDER BY u.created_at ASC
    `).all(tenantId, tenantId, tenantId);

    return res.status(200).json({
      success: true,
      data: rows.map(formatWorkspaceMember)
    });
  } catch (err) {
    console.error("[WorkspaceTeam] listWorkspaceUsers error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Create/invite an employee or workspace admin strictly inside caller's workspace tenant.
 * Never grants platform-wide users.role='ADMIN'.
 */
async function createWorkspaceUser(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const { name, email, phone, password, workspaceRole = "USER", role, assigned_phone_id } = req.body || {};

    if (!name || !String(name).trim() || !email || !String(email).trim() || !password || String(password).length < 8) {
      return res.status(400).json({
        success: false,
        message: "Name, valid email, and password (minimum 8 characters) are required."
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const existing = db.prepare("SELECT id, delete_status FROM users WHERE LOWER(email) = LOWER(?)").get(cleanEmail);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: existing.delete_status === 1
          ? "A user with this email exists in the archive."
          : "An account with this email already exists."
      });
    }

    const requestedWsRole = String(workspaceRole || role || "USER").toUpperCase();
    const safeWsRole = ALLOWED_WORKSPACE_ROLES.includes(requestedWsRole) ? requestedWsRole : "USER";

    let verifiedPhoneId = null;
    if (assigned_phone_id) {
      const phoneRow = db.prepare(`
        SELECT id FROM waba_phone_numbers
        WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
      `).get(assigned_phone_id, tenantId);
      if (!phoneRow) {
        return res.status(403).json({
          success: false,
          message: "Assigned phone number does not belong to your workspace."
        });
      }
      verifiedPhoneId = phoneRow.id;
    }

    const newUserId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(String(password), 10);

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      // Never promote workspace staff to global ADMIN in users table
      db.prepare(`
        INSERT INTO users (
          id, name, email, phone, role, status, password_hash, assigned_phone_id,
          tenant_id, active_status, delete_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
      `).run(newUserId, String(name).trim(), cleanEmail, phone ? String(phone).trim() : null, passwordHash, verifiedPhoneId, tenantId);

      db.prepare(`
        INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
        VALUES (?, ?, ?)
      `).run(newUserId, tenantId, safeWsRole);

      try {
        db.prepare(`
          INSERT INTO audit_logs (user_id, action, target_id, details, ip_address, created_at)
          VALUES (?, 'WORKSPACE_CREATE_USER', ?, ?, ?, UTC_TIMESTAMP())
        `).run(req.user.id, newUserId, `Workspace #${tenantId} member ${cleanEmail} (${safeWsRole})`, req.ip || null);
      } catch (_) {}

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    const created = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.assigned_phone_id, u.tenant_id, u.created_at,
             m.role AS workspace_role
      FROM users u
      LEFT JOIN tenant_user_memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE u.id = ?
    `).get(tenantId, newUserId);

    return res.status(201).json({
      success: true,
      message: `Team member '${name}' added to workspace.`,
      data: formatWorkspaceMember(created)
    });
  } catch (err) {
    console.error("[WorkspaceTeam] createWorkspaceUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Update workspace team member's workspace role or status within caller's tenant.
 */
async function updateWorkspaceUser(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const { userId } = req.params;
    const { name, phone, status, workspaceRole, role, assigned_phone_id } = req.body || {};

    const target = db.prepare(`
      SELECT u.*, m.role AS membership_role
      FROM users u
      LEFT JOIN tenant_user_memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE u.id = ? AND COALESCE(u.delete_status, 0) = 0
    `).get(tenantId, userId);

    if (!target || (Number(target.tenant_id || 1) !== tenantId && !target.membership_role)) {
      return res.status(404).json({ success: false, message: "Workspace team member not found." });
    }

    if (isPlatformAdmin(target) && !isPlatformAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Cannot modify a Platform Super-Admin account." });
    }

    if (req.user.id === userId && status === "SUSPENDED") {
      return res.status(400).json({ success: false, message: "You cannot suspend your own account." });
    }

    if (status && !["ACTIVE", "SUSPENDED"].includes(String(status).toUpperCase())) {
      return res.status(400).json({ success: false, message: "Status must be 'ACTIVE' or 'SUSPENDED'." });
    }

    const reqWsRole = workspaceRole || role;
    let nextWsRole = null;
    if (reqWsRole) {
      const upper = String(reqWsRole).toUpperCase();
      if (!ALLOWED_WORKSPACE_ROLES.includes(upper)) {
        return res.status(400).json({ success: false, message: "Workspace role must be 'ADMIN', 'USER', or 'AGENT'." });
      }
      if (String(target.membership_role || "").toUpperCase() === "OWNER" && upper !== "OWNER") {
        const ownerCount = db.prepare(`
          SELECT COUNT(*) as cnt FROM tenant_user_memberships WHERE tenant_id = ? AND UPPER(role) = 'OWNER'
        `).get(tenantId)?.cnt || 0;
        if (ownerCount <= 1) {
          return res.status(400).json({ success: false, message: "Cannot demote the sole workspace owner." });
        }
      }
      nextWsRole = upper;
    }

    let nextPhoneId = target.assigned_phone_id;
    if (assigned_phone_id !== undefined) {
      if (!assigned_phone_id) {
        nextPhoneId = null;
      } else {
        const phoneRow = db.prepare(`
          SELECT id FROM waba_phone_numbers
          WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
        `).get(assigned_phone_id, tenantId);
        if (!phoneRow) {
          return res.status(403).json({ success: false, message: "Assigned phone number does not belong to your workspace." });
        }
        nextPhoneId = phoneRow.id;
      }
    }

    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = ?,
          status = COALESCE(?, status),
          assigned_phone_id = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(
      name ? String(name).trim() : null,
      phone !== undefined ? (phone ? String(phone).trim() : null) : target.phone,
      status ? String(status).toUpperCase() : null,
      nextPhoneId,
      userId
    );

    if (nextWsRole) {
      db.prepare(`
        INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE role = VALUES(role), updated_at = CURRENT_TIMESTAMP
      `).run(userId, tenantId, nextWsRole);
    }

    const updated = db.prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.assigned_phone_id, u.tenant_id, u.created_at, u.last_login_at,
             COALESCE(m.role, CASE WHEN u.role = 'ADMIN' THEN 'OWNER' ELSE 'USER' END) AS workspace_role
      FROM users u
      LEFT JOIN tenant_user_memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE u.id = ?
    `).get(tenantId, userId);

    return res.status(200).json({
      success: true,
      message: "Team member updated successfully.",
      data: formatWorkspaceMember(updated)
    });
  } catch (err) {
    console.error("[WorkspaceTeam] updateWorkspaceUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Remove / soft-delete a workspace member strictly within caller's tenant.
 */
async function deleteWorkspaceUser(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const { userId } = req.params;

    if (req.user.id === userId) {
      return res.status(400).json({ success: false, message: "You cannot delete your own account." });
    }

    const target = db.prepare(`
      SELECT u.*, m.role AS membership_role
      FROM users u
      LEFT JOIN tenant_user_memberships m ON m.user_id = u.id AND m.tenant_id = ?
      WHERE u.id = ? AND COALESCE(u.delete_status, 0) = 0
    `).get(tenantId, userId);

    if (!target || (Number(target.tenant_id || 1) !== tenantId && !target.membership_role)) {
      return res.status(404).json({ success: false, message: "Workspace team member not found." });
    }

    if (isPlatformAdmin(target) || String(target.membership_role || "").toUpperCase() === "OWNER") {
      return res.status(403).json({ success: false, message: "Cannot delete workspace owner or platform administrator." });
    }

    db.prepare(`
      UPDATE users
      SET active_status = 0,
          delete_status = 1,
          deleted_at = UTC_TIMESTAMP(),
          deleted_by = ?,
          updated_at = UTC_TIMESTAMP()
      WHERE id = ?
    `).run(req.user.id, userId);

    db.prepare("DELETE FROM tenant_user_memberships WHERE user_id = ? AND tenant_id = ?").run(userId, tenantId);

    return res.status(200).json({
      success: true,
      message: `Team member '${target.name}' removed from workspace.`
    });
  } catch (err) {
    console.error("[WorkspaceTeam] deleteWorkspaceUser error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function getWorkspaceSandboxMode(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const row = db.prepare("SELECT id, name, slug, is_sandbox FROM tenants WHERE id = ? LIMIT 1").get(tenantId);
    if (!row) {
      return res.status(404).json({ success: false, message: "Workspace tenant not found." });
    }
    return res.json({
      success: true,
      tenantId: Number(row.id),
      isSandbox: Boolean(Number(row.is_sandbox) === 1),
      mode: Number(row.is_sandbox) === 1 ? "SANDBOX" : "LIVE"
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function updateWorkspaceSandboxMode(req, res) {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const desiredSandbox = Boolean(req.body?.isSandbox ?? req.body?.is_sandbox ?? (String(req.body?.mode || "").toUpperCase() === "SANDBOX"));

    if (desiredSandbox && !isPlatformAdmin(req.user)) {
      if (tenantId === 1) {
        return res.status(403).json({
          success: false,
          code: "SANDBOX_PRODUCTION_GUARD",
          message: "Primary live workspace cannot be switched into Sandbox mode by non-platform users. Provision a dedicated Sandbox workspace instead."
        });
      }
      const paidTx = db.prepare("SELECT COUNT(*) as c FROM universal_transactions WHERE tenant_id = ? AND payment_status IN ('PAID', 'SETTLED') AND COALESCE(delete_status, 0) = 0").get(tenantId)?.c || 0;
      const paidOrders = db.prepare("SELECT COUNT(*) as c FROM unified_orders WHERE tenant_id = ? AND payment_status IN ('PAID', 'SETTLED')").get(tenantId)?.c || 0;
      if ((Number(paidTx) + Number(paidOrders)) > 0) {
        return res.status(409).json({
          success: false,
          code: "SANDBOX_LIVE_TRANSACTIONS_EXIST",
          message: "Cannot convert a workspace with settled live payments into Sandbox mode. Create a dedicated Sandbox workspace instead."
        });
      }
    }

    db.prepare("UPDATE tenants SET is_sandbox = ? WHERE id = ?").run(desiredSandbox ? 1 : 0, tenantId);
    try {
      db.prepare(`
        INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, ip_address, created_at)
        VALUES (?, ?, 'WORKSPACE_SANDBOX_MODE', ?, ?, ?, UTC_TIMESTAMP())
      `).run(
        tenantId,
        req.user?.id || "system",
        tenantId,
        JSON.stringify({ isSandbox: desiredSandbox, mode: desiredSandbox ? "SANDBOX" : "LIVE" }),
        req.ip || "127.0.0.1"
      );
    } catch (_) {}
    return res.json({
      success: true,
      tenantId,
      isSandbox: desiredSandbox,
      mode: desiredSandbox ? "SANDBOX" : "LIVE"
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  listWorkspaceUsers,
  createWorkspaceUser,
  updateWorkspaceUser,
  deleteWorkspaceUser,
  getWorkspaceSandboxMode,
  updateWorkspaceSandboxMode
};
