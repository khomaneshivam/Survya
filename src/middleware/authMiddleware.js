const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db } = require("../config/database");

/**
 * Extracts authentication token from Authorization header, custom auth headers,
 * cookies, or query parameters.
 */
function extractRequestToken(req) {
  if (!req) return null;

  // 1. Standard Authorization: Bearer <token>
  const authHeader = req.headers?.["authorization"] || req.headers?.["Authorization"];
  if (authHeader && typeof authHeader === "string") {
    if (authHeader.startsWith("Bearer ")) {
      const tok = authHeader.substring(7).trim();
      if (tok) return tok;
    } else if (authHeader.trim()) {
      return authHeader.trim();
    }
  }

  // 2. Custom headers (x-auth-token or x-access-token)
  const altHeader = req.headers?.["x-auth-token"] || req.headers?.["x-access-token"];
  if (altHeader && typeof altHeader === "string" && altHeader.trim()) {
    return altHeader.trim();
  }

  // 3. Cookies: parse token or auth_token cookie
  if (req.cookies && (req.cookies.token || req.cookies.auth_token)) {
    return String(req.cookies.token || req.cookies.auth_token).trim();
  }
  if (req.headers?.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)(?:token|auth_token)=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }
  }

  // 4. Query param fallback (token or access_token)
  if (req.query && (req.query.token || req.query.access_token)) {
    return String(req.query.token || req.query.access_token).trim();
  }

  return null;
}

function isPlatformAdmin(user) {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "ADMIN") {
    const homeTenantId = Number(user.original_tenant_id || user.tenant_id || 1);
    return homeTenantId === 1;
  }
  return false;
}

function isWorkspaceAdmin(user) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  const wsRole = String(user.workspace_role || "").toUpperCase();
  if (["OWNER", "ADMIN", "AGENCY_ADMIN"].includes(wsRole)) return true;
  if (user.role === "ADMIN" && Number(user.tenant_id || 1) === Number(user.original_tenant_id || user.tenant_id || 1)) {
    return true;
  }
  return false;
}

function resolveWorkspaceAccess(user, req) {
  if (!user) return user;
  user.tenant_id = user.tenant_id ? Number(user.tenant_id) : 1;
  user.original_tenant_id = user.tenant_id;
  user.is_platform_admin = isPlatformAdmin(user);

  try {
    const homeMembership = db.prepare(`
      SELECT role FROM tenant_user_memberships
      WHERE user_id = ? AND tenant_id = ?
    `).get(user.id, user.tenant_id);
    if (homeMembership?.role) {
      user.workspace_role = String(homeMembership.role).toUpperCase();
    } else if (user.is_platform_admin || user.role === "ADMIN") {
      user.workspace_role = "OWNER";
    } else {
      user.workspace_role = "USER";
    }
  } catch (e) {
    user.workspace_role = user.is_platform_admin || user.role === "ADMIN" ? "OWNER" : "USER";
  }

  const requestedWorkspaceId = req.headers?.["x-workspace-id"] || req.headers?.["x-tenant-id"];
  if (requestedWorkspaceId && String(requestedWorkspaceId).trim()) {
    const targetTid = parseInt(String(requestedWorkspaceId).trim(), 10);
    if (!isNaN(targetTid) && targetTid > 0) {
      if (targetTid === user.tenant_id) {
        // Same workspace
      } else if (user.is_platform_admin) {
        const targetTenant = db.prepare("SELECT id, status, delete_status FROM tenants WHERE id = ?").get(targetTid);
        if (targetTenant && targetTenant.delete_status === 0) {
          user.tenant_id = targetTid;
          user.workspace_role = "OWNER";
          user.is_switched_workspace = true;
        }
      } else {
        const membership = db.prepare(`
          SELECT role FROM tenant_user_memberships
          WHERE user_id = ? AND tenant_id = ?
        `).get(user.id, targetTid);

        if (membership) {
          user.tenant_id = targetTid;
          user.workspace_role = String(membership.role).toUpperCase();
          user.is_switched_workspace = true;
        } else {
          const childTenant = db.prepare(`
            SELECT t.id, t.parent_agency_tenant_id
            FROM tenants t
            WHERE t.id = ? AND t.delete_status = 0
          `).get(targetTid);

          if (childTenant && childTenant.parent_agency_tenant_id) {
            const agencyMembership = db.prepare(`
              SELECT role FROM tenant_user_memberships
              WHERE user_id = ? AND tenant_id = ?
            `).get(user.id, childTenant.parent_agency_tenant_id);

            if (agencyMembership && ["OWNER", "ADMIN", "AGENCY_ADMIN"].includes(String(agencyMembership.role).toUpperCase())) {
              user.tenant_id = targetTid;
              user.workspace_role = "AGENCY_ADMIN";
              user.is_switched_workspace = true;
            }
          }
        }
      }
    }
  }

  user.is_workspace_admin = isWorkspaceAdmin(user);
  return user;
}

/**
 * Authenticates incoming request using JWT Bearer token in Authorization header,
 * cookie, or session context.
 * Fails closed with 401 if token is missing, malformed, expired, or user is not found/active.
 */
function authenticateToken(req, res, next) {
  const token = extractRequestToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. Authentication Bearer token required in Authorization header."
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (!uId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload."
      });
    }

    // Always verify current user status and role against active database record
    const user = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, tenant_id, created_at
      FROM users
      WHERE id = ?
    `).get(uId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found."
      });
    }

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Account is inactive or suspended. Please contact administrator."
      });
    }

    req.user = resolveWorkspaceAccess(user, req);
    return next();
  } catch (err) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: isExpired ? "Session expired. Please log in again." : "Invalid authentication token."
    });
  }
}

/**
 * Dedicated authentication middleware for Server-Sent Events (SSE) connections.
 * Accepts short-lived stream token or Bearer header, validates DB user and fails closed.
 */
function authenticateStreamToken(req, res, next) {
  let token = null;
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.query && (req.query.streamToken || req.query.stream_token || req.query.token)) {
    token = String(req.query.streamToken || req.query.stream_token || req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required for live stream connection."
    });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (!uId) {
      return res.status(401).json({ success: false, message: "Invalid stream token." });
    }

    const user = db.prepare("SELECT id, name, email, phone, role, status, tenant_id FROM users WHERE id = ?").get(uId);
    if (!user || user.status !== "ACTIVE") {
      return res.status(403).json({ success: false, message: "Unauthorized or suspended account." });
    }

    req.user = resolveWorkspaceAccess(user, req);
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired stream token." });
  }
}

/**
 * Strictly ensures authenticated user has Platform Master Administrator privileges.
 * Fails closed with 401 if unauthenticated and 403 if not a platform super-admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (!isPlatformAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Master Administrator privileges required."
    });
  }

  return next();
}

/**
 * Ensures authenticated user has administrative authority within their own active workspace
 * (Workspace OWNER/ADMIN/AGENCY_ADMIN or Platform Master Admin). Rejects employees/regular USERs with 403.
 */
function requireWorkspaceAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  if (!isWorkspaceAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      message: "Forbidden. Workspace Administrator privileges required."
    });
  }

  return next();
}

/**
 * Optional authentication middleware (attaches verified user if present, sets null if absent).
 * Never attaches fallback admin identity.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  req.user = null;

  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const uId = decoded?.userId || decoded?.id;
    if (uId) {
      const user = db.prepare(`
        SELECT id, name, email, phone, role, status, assigned_phone_id, tenant_id
        FROM users
        WHERE id = ?
      `).get(uId);
      if (user && user.status === "ACTIVE") {
        req.user = resolveWorkspaceAccess(user, req);
      }
    }
  } catch (e) {
    // Proceed unauthenticated
  }

  return next();
}

/**
 * Determines target User ID filter based on caller role:
 * - Admin can inspect any target user if specified or null (all users).
 * - Regular user is strictly restricted to their own user ID, ignoring client override attempts.
 */
function getScopedUserId(req) {
  if (!req.user) return null;
  if (isPlatformAdmin(req.user)) {
    const requested = req.query?.userId || req.body?.userId || req.headers["x-target-user-id"];
    return requested ? String(requested).trim() : null; // null means all users for platform admin
  }
  return req.user.id;
}

module.exports = {
  authenticateToken,
  authenticateStreamToken,
  requireAdmin,
  requireWorkspaceAdmin,
  isPlatformAdmin,
  isWorkspaceAdmin,
  optionalAuth,
  getScopedUserId
};

