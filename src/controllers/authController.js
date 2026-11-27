const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/env");
const { db } = require("../config/database");
const timeUtil = require("../utils/timeUtil");

const crmPipelineService = require("../services/crmPipelineService");
const domainProfileService = require("../services/domainProfileService");

/**
 * Build safe workspace-aware user payload shared across register & login
 */
function buildSafeUser(user, defaultWorkspaceRole = null) {
  const resolvedTenantId = user.tenant_id ? Number(user.tenant_id) : 1;
  let workspaceRole = defaultWorkspaceRole || ((user.role === "ADMIN" || user.role === "SUPER_ADMIN") ? "OWNER" : "USER");
  try {
    const mem = db.prepare(`
      SELECT role FROM tenant_user_memberships WHERE user_id = ? AND tenant_id = ?
    `).get(user.id, resolvedTenantId);
    if (mem?.role) workspaceRole = String(mem.role).toUpperCase();
  } catch (_) {}

  const isPlatformAdminFlag = user.role === "SUPER_ADMIN" || (user.role === "ADMIN" && resolvedTenantId === 1);
  const isWorkspaceAdminFlag = isPlatformAdminFlag || ["OWNER", "ADMIN", "AGENCY_ADMIN"].includes(workspaceRole);
  let domainAccess = null;
  let tenantSummary = null;
  try {
    const tRow = db.prepare(`
      SELECT id, name, slug, status, plan_code, primary_domain, allowed_domains_json,
             subscription_status, trial_ends_at, branding_json
      FROM tenants WHERE id = ? AND COALESCE(delete_status, 0) = 0
    `).get(resolvedTenantId);
    if (tRow) {
      domainAccess = domainProfileService.getTenantDomainAccess(tRow, { isPlatformAdmin: isPlatformAdminFlag });
      tenantSummary = {
        ...tRow,
        branding_json: tRow.branding_json && typeof tRow.branding_json === "string" ? JSON.parse(tRow.branding_json) : tRow.branding_json,
        primary_domain: domainAccess.primaryDomain,
        allowed_domains: domainAccess.allowedDomains,
        domain_access: domainAccess
      };
    }
  } catch (_) {}

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    workspace_role: workspaceRole,
    is_platform_admin: isPlatformAdminFlag,
    is_workspace_admin: isWorkspaceAdminFlag,
    status: user.status,
    assigned_phone_id: user.assigned_phone_id,
    tenant_id: resolvedTenantId,
    primary_domain: domainAccess?.primaryDomain || "HOSPITALITY",
    allowed_domains: domainAccess?.allowedDomains || ["HOSPITALITY"],
    domain_access: domainAccess,
    tenant: tenantSummary,
    created_at: user.created_at,
    last_login_at: user.last_login_at || null
  };
}

/**
 * Generates signed JWT session token
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id ? Number(user.tenant_id) : 1
    },
    config.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Register a new user account with dedicated multi-tenant workspace & 7-day trial
 */
async function register(req, res) {
  try {
    const { name, email, phone, password, domain, businessName } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Full Name is required." });
    }
    if (!email || !String(email).trim() || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const selectedDomain = domain ? domainProfileService.normalizeDomainCode(domain, null) : "HOSPITALITY";
    if (!selectedDomain) {
      return res.status(400).json({ success: false, message: `Unsupported business domain '${domain}'.` });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(name).trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanBizName = businessName && String(businessName).trim() ? String(businessName).trim() : `${cleanName}'s Workspace`;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Check optional admin bootstrap token from header or body
    const bootstrapToken = req.headers["x-admin-bootstrap-token"] || req.body?.adminBootstrapToken;
    const configuredBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

    let role = "ADMIN";
    let assignedPhoneId = null;
    let tenantId = 1;

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const existing = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
      if (existing) {
        db.exec("ROLLBACK;");
        return res.status(409).json({
          success: false,
          message: "An account with this email address already exists. Please log in instead."
        });
      }

      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
      if (configuredBootstrapToken && bootstrapToken === configuredBootstrapToken) {
        role = "ADMIN";
        tenantId = 1;
      } else if (userCount === 0) {
        // The first registered user in the platform is always Master Administrator on Tenant 1
        role = "ADMIN";
        tenantId = 1;
      } else {
        // Self-serve SaaS: create a dedicated workspace with 7-day TRIAL pinned to chosen domain.
        role = "USER";
        let baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!baseSlug) baseSlug = "workspace";
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (db.prepare("SELECT id FROM tenants WHERE slug = ?").get(uniqueSlug)) {
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }

        const insertTenant = db.prepare(`
          INSERT INTO tenants (
            name, slug, status, plan_code, primary_domain, allowed_domains_json,
            subscription_status, trial_ends_at,
            quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
          ) VALUES (?, ?, 'ACTIVE', 'TRIAL', ?, ?, 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 1000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(cleanBizName, uniqueSlug, selectedDomain, JSON.stringify([selectedDomain]));

        tenantId = Number(insertTenant.lastInsertRowid);
      }

      const defaultPhone = db.prepare("SELECT id FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1").get();
      assignedPhoneId = defaultPhone ? defaultPhone.id : null;

      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status, assigned_phone_id, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `).run(userId, cleanName, cleanEmail, cleanPhone, passwordHash, role, assignedPhoneId, tenantId);

      // Record owner membership in tenant_user_memberships
      db.prepare(`
        INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
        VALUES (?, ?, 'OWNER')
      `).run(userId, tenantId);

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    // Seed default CRM pipelines & complete pre-built industry profile outside transaction
    if (tenantId > 1) {
      try {
        crmPipelineService.ensureDefaultPipelines(tenantId);
      } catch (pipeErr) {
        console.warn("[Register] Notice seeding default CRM pipelines:", pipeErr.message);
      }
      try {
        domainProfileService.provisionTenantDomainProfile(tenantId, {
          domain: selectedDomain,
          businessName: businessName && String(businessName).trim() ? String(businessName).trim() : null,
          phone: cleanPhone,
          userId
        });
      } catch (domErr) {
        console.warn("[Register] Notice provisioning domain profile:", domErr.message);
      }
    }

    const newUserRow = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, tenant_id, created_at
      FROM users WHERE id = ?
    `).get(userId);
    const safeNewUser = buildSafeUser(newUserRow, "OWNER");

    const token = generateToken(safeNewUser);

    try {
      res.cookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch (_) {}

    return res.status(201).json({
      success: true,
      message: `Account created successfully! Welcome, ${cleanName}.`,
      token,
      user: safeNewUser
    });
  } catch (error) {
    console.error("User registration error:", error);
    return res.status(500).json({ success: false, message: error.message || "Registration failed." });
  }
}

/**
 * Log in with existing email and password
 */
async function login(req, res) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = db.prepare(`
      SELECT * FROM users WHERE email = ? COLLATE NOCASE
    `).get(cleanEmail);

    if (!user || Number(user.delete_status || 0) === 1 || Number(user.active_status ?? 1) === 0) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact platform administration."
      });
    }

    const passwordValid = await bcrypt.compare(String(password), user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Update last login timestamp
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    const safeUser = buildSafeUser(user);

    const token = generateToken(safeUser);

    try {
      res.cookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      token,
      user: safeUser
    });
  } catch (error) {
    console.error("User login error:", error);
    return res.status(500).json({ success: false, message: error.message || "Login failed." });
  }
}

/**
 * Get profile of current authenticated user
 */
async function getMe(req, res) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "Not authenticated." });
    }

    // Fetch assigned phone details if assigned
    let assignedPhone = null;
    if (user.assigned_phone_id) {
      assignedPhone = db.prepare(`
        SELECT id, display_name, phone_number, phone_number_id, quality_rating, status, is_default
        FROM waba_phone_numbers WHERE id = ?
      `).get(user.assigned_phone_id);
    } else {
      // Fallback to default system phone number
      assignedPhone = db.prepare(`
        SELECT id, display_name, phone_number, phone_number_id, quality_rating, status, is_default
        FROM waba_phone_numbers WHERE is_default = 1 LIMIT 1
      `).get();
    }

    // Fetch tenant details with plan-gated domain access
    const tenant = db.prepare(`
      SELECT id, name, slug, status, plan_code, primary_domain, allowed_domains_json,
             subscription_status, trial_ends_at,
             parent_agency_tenant_id, branding_json, gstin, billing_address,
             quota_monthly_messages, quota_waba_lines, timezone, created_at
      FROM tenants
      WHERE id = ? AND delete_status = 0
    `).get(user.tenant_id || 1);

    if (tenant && tenant.branding_json && typeof tenant.branding_json === "string") {
      try {
        tenant.branding_json = JSON.parse(tenant.branding_json);
      } catch (e) {}
    }

    const domainAccess = tenant
      ? domainProfileService.getTenantDomainAccess(tenant, { isPlatformAdmin: Boolean(user.is_platform_admin) })
      : null;

    if (tenant && domainAccess) {
      tenant.primary_domain = domainAccess.primaryDomain;
      tenant.allowed_domains = domainAccess.allowedDomains;
      tenant.domain_access = domainAccess;
    }

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        assignedPhone,
        tenant: tenant || null,
        primary_domain: domainAccess?.primaryDomain || user.primary_domain || "HOSPITALITY",
        allowed_domains: domainAccess?.allowedDomains || user.allowed_domains || ["HOSPITALITY"],
        domain_access: domainAccess || user.domain_access || null,
        workspace_role: user.workspace_role || (user.role === "ADMIN" ? "OWNER" : "USER"),
        is_switched_workspace: Boolean(user.is_switched_workspace),
        original_tenant_id: user.original_tenant_id || user.tenant_id
      }
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Update authenticated user's profile
 */
async function updateProfile(req, res) {
  try {
    const { name, phone, currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (name) {
      db.prepare("UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(String(name).trim(), userId);
    }
    if (phone !== undefined) {
      db.prepare("UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(phone ? String(phone).trim() : null, userId);
    }

    // Password change
    if (newPassword) {
      if (String(newPassword).length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters long." });
      }

      const userRow = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: "Current password is required to change password." });
      }

      const match = await bcrypt.compare(String(currentPassword), userRow.password_hash);
      if (!match) {
        return res.status(400).json({ success: false, message: "Current password is incorrect." });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, userId);
    }

    const updated = db.prepare(`
      SELECT id, name, email, phone, role, status, assigned_phone_id, created_at
      FROM users WHERE id = ?
    `).get(userId);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: updated
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Request password recovery code (Sent via WhatsApp or logged for emergency access)
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email || !String(email).trim()) {
      return res.status(400).json({ success: false, message: "Email address is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id, name, email, phone, role FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);

    if (!user) {
      // Return generic message to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: "If an account with this email exists, a password recovery code has been generated."
      });
    }

    // Generate 6-digit cryptographically random numeric recovery code
    const code = crypto.randomInt(100000, 1000000).toString();
    const tokenHash = crypto.createHash("sha256").update(code).digest("hex");
    const expiresAt = config.DB_CLIENT === "mysql"
      ? timeUtil.getIndianTimestampString(new Date(Date.now() + 30 * 60 * 1000))
      : new Date(Date.now() + 30 * 60 * 1000).toISOString().replace("T", " ").substring(0, 19);

    // Invalidate previous unused codes for this user
    db.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0").run(user.id);

    // Record new reset code
    db.prepare(`
      INSERT INTO password_resets (user_id, token_hash, expires_at, ip_address)
      VALUES (?, ?, ?, ?)
    `).run(user.id, tokenHash, expiresAt, req.ip || null);

    let whatsappSent = false;
    let recipientPhone = null;

    if (user.phone) {
      try {
        const metaWhatsAppService = require("../services/metaWhatsAppService");
        const targetPhone = metaWhatsAppService.cleanPhone(user.phone, "91");
        if (targetPhone) {
          recipientPhone = targetPhone;
          const sendRes = await metaWhatsAppService.sendTextMessage({
            to: targetPhone,
            body: `Your KonkanTrip engine password reset code is: *${code}*\n\nThis verification code expires in 30 minutes. If you did not request this, you can safely ignore this message.`
          });
          if (sendRes?.success || sendRes?.messageId) {
            whatsappSent = true;
          }
        }
      } catch (waErr) {
        console.warn("[Auth] WhatsApp password reset dispatch note:", waErr.message);
      }
    }

    console.log(`[Auth Recovery] Password reset requested for ${user.email}. Code: ${code} (Expires: ${expiresAt})`);

    const isDev = config.NODE_ENV !== "production";
    const maskedPhone = recipientPhone ? recipientPhone.replace(/(\d{2})(\d+)(\d{4})/, "$1******$3") : null;

    return res.status(200).json({
      success: true,
      message: whatsappSent
        ? `A 6-digit recovery code was dispatched to your WhatsApp number (${maskedPhone}).`
        : `A password reset code was generated. Please enter the 6-digit code${isDev ? ` (Dev Code: ${code})` : " provided by your administrator"}.`,
      data: {
        email: cleanEmail,
        whatsappSent,
        maskedPhone,
        // Include code in non-production environments or when WhatsApp delivery wasn't configured
        devRecoveryCode: isDev ? code : undefined
      }
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to process recovery request." });
  }
}

/**
 * Verifies validity of a reset code
 */
async function verifyResetToken(req, res) {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and recovery code are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or recovery code." });
    }

    const tokenHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used
      FROM password_resets
      WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1
    `).get(user.id, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: "Recovery code is invalid or has expired." });
    }

    return res.status(200).json({
      success: true,
      message: "Recovery code verified successfully."
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Resets password using verified reset code
 */
async function resetPassword(req, res) {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, recovery code, and new password are required." });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE email = ? COLLATE NOCASE").get(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid email or recovery code." });
    }

    const tokenHash = crypto.createHash("sha256").update(String(code).trim()).digest("hex");
    const resetRecord = db.prepare(`
      SELECT id, expires_at, used
      FROM password_resets
      WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP
      ORDER BY id DESC LIMIT 1
    `).get(user.id, tokenHash);

    if (!resetRecord) {
      return res.status(400).json({ success: false, message: "Recovery code is invalid or has expired. Please request a new one." });
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10);

    db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      // Update password
      db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, user.id);

      // Invalidate recovery code
      db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(resetRecord.id);

      // Only Platform Master Admin on Tenant 1 may backfill unassigned legacy root records
      if (user.role === "ADMIN" && Number(user.tenant_id || 1) === 1) {
        db.prepare("UPDATE customer_replies SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
        db.prepare("UPDATE campaigns SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
        db.prepare("UPDATE automated_booking_dispatches SET user_id = ? WHERE user_id IS NULL OR user_id = '' OR user_id = 'admin_root'").run(user.id);
      }

      db.exec("COMMIT;");
    } catch (txErr) {
      db.exec("ROLLBACK;");
      throw txErr;
    }

    console.log(`[Auth Recovery] Password successfully reset for user ${user.email} (${user.id})`);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new credentials."
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to reset password." });
  }
}

/**
 * Change password for authenticated user
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required." });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters long." });
    }

    const userRow = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(userId);
    if (!userRow) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const match = await bcrypt.compare(String(currentPassword), userRow.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newHash, userId);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully."
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

async function listPublicDomains(req, res) {
  try {
    const domains = domainProfileService.getPublicDomainCatalog();
    const billingService = require("../services/billingService");
    return res.status(200).json({
      success: true,
      domains,
      plans: billingService.getPlans(),
      planPolicy: domainProfileService.PLAN_DOMAIN_POLICY
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  verifyResetToken,
  resetPassword,
  changePassword,
  listPublicDomains
};
