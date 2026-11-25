const { db } = require("../config/database");
const crmPipelineService = require("../services/crmPipelineService");
const { isPlatformAdmin, isWorkspaceAdmin } = require("../middleware/authMiddleware");

/**
 * Lists all workspaces accessible to the authenticated user.
 * Supports Master Admin, Direct Memberships, and Child Agency Workspaces.
 */
async function listWorkspaces(req, res) {
  try {
    const user = req.user;
    const currentTenantId = user.tenant_id;
    const platformAdmin = isPlatformAdmin(user);
    let tenants = [];

    if (platformAdmin && !user.is_switched_workspace) {
      // Master Admin can view all non-deleted workspaces
      tenants = db.prepare(`
        SELECT id, name, slug, status, plan_code, subscription_status, trial_ends_at,
               parent_agency_tenant_id, branding_json, quota_monthly_messages, quota_waba_lines, created_at
        FROM tenants
        WHERE delete_status = 0
        ORDER BY id ASC
      `).all();
    } else {
      // Find workspaces where user is an enrolled member OR child of user's parent agency
      tenants = db.prepare(`
        SELECT DISTINCT t.id, t.name, t.slug, t.status, t.plan_code, t.subscription_status,
               t.trial_ends_at, t.parent_agency_tenant_id, t.branding_json,
               t.quota_monthly_messages, t.quota_waba_lines, t.created_at,
               m.role as user_role
        FROM tenants t
        LEFT JOIN tenant_user_memberships m ON t.id = m.tenant_id AND m.user_id = ?
        WHERE t.delete_status = 0
          AND (
            m.id IS NOT NULL
            OR t.id = ?
            OR (t.parent_agency_tenant_id = ? AND EXISTS (
              SELECT 1 FROM tenant_user_memberships pm
              WHERE pm.user_id = ? AND pm.tenant_id = t.parent_agency_tenant_id
                AND UPPER(pm.role) IN ('OWNER', 'ADMIN', 'AGENCY_ADMIN')
            ))
          )
        ORDER BY t.id ASC
      `).all(user.id, currentTenantId, user.original_tenant_id || currentTenantId, user.id);
    }

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count FROM waba_phone_numbers
      WHERE tenant_id = ? AND delete_status = 0
    `);

    const result = tenants.map((t) => {
      let branding = null;
      if (t.branding_json) {
        try {
          branding = typeof t.branding_json === "string" ? JSON.parse(t.branding_json) : t.branding_json;
        } catch (e) {}
      }

      const linesCount = countStmt.get(t.id)?.count || 0;

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        planCode: t.plan_code,
        subscriptionStatus: t.subscription_status,
        trialEndsAt: t.trial_ends_at,
        parentAgencyTenantId: t.parent_agency_tenant_id,
        branding,
        quotaMonthlyMessages: t.quota_monthly_messages,
        quotaWabaLines: t.quota_waba_lines,
        connectedLinesCount: linesCount,
        isCurrent: t.id === currentTenantId,
        userRole: t.user_role || (platformAdmin ? "OWNER" : (user.workspace_role || "USER"))
      };
    });

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("[AgencyController] listWorkspaces error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Creates a child client workspace under the agency tenant.
 */
async function createWorkspace(req, res) {
  try {
    const user = req.user;
    const agencyTenantId = user.original_tenant_id || user.tenant_id;

    // Check permissions: Platform Admin or Enterprise Workspace Owner/Admin
    const agencyTenant = db.prepare(`
      SELECT id, plan_code, branding_json FROM tenants WHERE id = ?
    `).get(agencyTenantId);

    const isEnterprise = agencyTenant?.plan_code === "ENTERPRISE";
    const isMasterAdmin = isPlatformAdmin(user);

    if (!isMasterAdmin && (!isEnterprise || !isWorkspaceAdmin(user))) {
      return res.status(403).json({
        success: false,
        message: "Multi-workspace client management requires an ENTERPRISE plan or Master Admin privileges."
      });
    }

    const { name, slug, inheritBranding = true, brandingJson } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Workspace name is required." });
    }

    const cleanName = String(name).trim();
    let baseSlug = (slug || cleanName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!baseSlug) baseSlug = "client-workspace";

    let uniqueSlug = baseSlug;
    let counter = 1;
    while (db.prepare("SELECT id FROM tenants WHERE slug = ?").get(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    let finalBranding = null;
    if (brandingJson && typeof brandingJson === "object") {
      finalBranding = JSON.stringify(brandingJson);
    } else if (inheritBranding && agencyTenant?.branding_json) {
      finalBranding = typeof agencyTenant.branding_json === "string"
        ? agencyTenant.branding_json
        : JSON.stringify(agencyTenant.branding_json);
    }

    const insertRes = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, parent_agency_tenant_id,
        branding_json, quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES (?, ?, 'ACTIVE', 'STARTER', 'ACTIVE', ?, ?, 10000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(cleanName, uniqueSlug, agencyTenantId, finalBranding);

    const newWorkspaceId = Number(insertRes.lastInsertRowid);

    // Add agency admin to the new workspace's memberships
    db.prepare(`
      INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
      VALUES (?, ?, 'AGENCY_ADMIN')
    `).run(user.id, newWorkspaceId);

    // Seed CRM pipelines for this workspace
    try {
      crmPipelineService.ensureDefaultPipelines(newWorkspaceId);
    } catch (e) {
      console.warn("[AgencyController] Notice seeding pipelines for child workspace:", e.message);
    }

    return res.status(201).json({
      success: true,
      message: `Client workspace '${cleanName}' created successfully.`,
      workspace: {
        id: newWorkspaceId,
        name: cleanName,
        slug: uniqueSlug,
        parentAgencyTenantId: agencyTenantId
      }
    });
  } catch (err) {
    console.error("[AgencyController] createWorkspace error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Validates permission and switches the active workspace context
 */
async function switchWorkspace(req, res) {
  try {
    const user = req.user;
    const { workspaceId } = req.body || {};
    const targetTid = parseInt(String(workspaceId).trim(), 10);

    if (isNaN(targetTid) || targetTid <= 0) {
      return res.status(400).json({ success: false, message: "Valid workspaceId is required." });
    }

    const targetTenant = db.prepare(`
      SELECT id, name, slug, plan_code, subscription_status, parent_agency_tenant_id, branding_json
      FROM tenants
      WHERE id = ? AND delete_status = 0
    `).get(targetTid);

    if (!targetTenant) {
      return res.status(404).json({ success: false, message: "Workspace not found or deleted." });
    }

    // Permission check
    let hasAccess = false;
    let role = "USER";

    if (isPlatformAdmin(user)) {
      hasAccess = true;
      role = "OWNER";
    } else {
      const membership = db.prepare(`
        SELECT role FROM tenant_user_memberships
        WHERE user_id = ? AND tenant_id = ?
      `).get(user.id, targetTid);

      if (membership) {
        hasAccess = true;
        role = membership.role;
      } else if (
        targetTenant.parent_agency_tenant_id &&
        targetTenant.parent_agency_tenant_id === (user.original_tenant_id || user.tenant_id) &&
        isWorkspaceAdmin(user)
      ) {
        hasAccess = true;
        role = "AGENCY_ADMIN";
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this workspace."
      });
    }

    let branding = null;
    if (targetTenant.branding_json) {
      try {
        branding = typeof targetTenant.branding_json === "string"
          ? JSON.parse(targetTenant.branding_json)
          : targetTenant.branding_json;
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      message: `Switched to workspace: ${targetTenant.name}`,
      workspaceId: targetTid,
      workspaceName: targetTenant.name,
      slug: targetTenant.slug,
      planCode: targetTenant.plan_code,
      role,
      branding
    });
  } catch (err) {
    console.error("[AgencyController] switchWorkspace error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Updates white-label branding for the active workspace
 */
async function updateBranding(req, res) {
  try {
    const user = req.user;
    const tenantId = user.tenant_id;
    const { appName, logoUrl, primaryColor, accentColor, customCss } = req.body || {};

    const brandingObj = {
      appName: appName ? String(appName).trim() : "SARVYA",
      logoUrl: logoUrl ? String(logoUrl).trim() : null,
      primaryColor: primaryColor ? String(primaryColor).trim() : "#2563eb",
      accentColor: accentColor ? String(accentColor).trim() : "#3b82f6",
      customCss: customCss ? String(customCss).trim() : null,
      updatedAt: new Date().toISOString()
    };

    db.prepare(`
      UPDATE tenants SET
        branding_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(brandingObj), tenantId);

    return res.status(200).json({
      success: true,
      message: "Branding updated successfully.",
      branding: brandingObj
    });
  } catch (err) {
    console.error("[AgencyController] updateBranding error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  switchWorkspace,
  updateBranding
};

