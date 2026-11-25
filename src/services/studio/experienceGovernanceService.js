const { db } = require("../../config/database");
const inappExperienceService = require("../inapp/inappExperienceService");
const {
  validateComponentStepConfig,
  mapLegacyScreenToComponent,
  sanitizeText
} = require("./conversationalComponentRegistry");

function logAudit(tenantId, { experienceId = null, versionId = null, actor = "studio", actorEmail = null, action, details = {} }) {
  db.prepare(`
    INSERT INTO studio_audit_logs (
      tenant_id, experience_id, version_id, actor_id, actor_email, action, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
  `).run(
    Number(tenantId) || 1,
    experienceId || null,
    versionId || null,
    String(actor || "studio"),
    actorEmail || null,
    String(action),
    JSON.stringify(details || {})
  );
}

/**
 * Validates structural integrity, reachability, component schemas, and goal readiness.
 */
function validateExperience(tenantId = 1, experienceId) {
  const numericTenantId = Number(tenantId) || 1;
  const exp = inappExperienceService.getExperienceById(experienceId, numericTenantId);
  if (!exp) {
    const err = new Error(`Experience #${experienceId} not found`);
    err.statusCode = 404;
    throw err;
  }

  const errors = [];
  const warnings = [];
  const screens = exp.screens || [];

  if (!exp.name || !String(exp.name).trim()) {
    errors.push("Experience name is required.");
  }

  if (screens.length === 0) {
    errors.push("Experience must have at least one conversational step/screen.");
  } else {
    const entryKey = exp.entry_screen_key || screens[0].screen_key;
    const screenMap = new Map(screens.map((s) => [s.screen_key, s]));
    if (!screenMap.has(entryKey)) {
      errors.push(`Entry step '${entryKey}' does not exist in screens.`);
    }

    // BFS reachability from entry step
    const visited = new Set();
    const queue = screenMap.has(entryKey) ? [entryKey] : [];
    while (queue.length > 0) {
      const curKey = queue.shift();
      if (visited.has(curKey)) continue;
      visited.add(curKey);
      const scr = screenMap.get(curKey);
      let nav = {};
      try {
        nav = typeof scr.navigation_rules_json === "string" ? JSON.parse(scr.navigation_rules_json || "{}") : (scr.navigation_rules_json || {});
      } catch (_) {}

      const targets = [];
      if (nav.defaultNext) targets.push(nav.defaultNext);
      if (nav.nextScreenKey) targets.push(nav.nextScreenKey);
      if (Array.isArray(nav.rules)) {
        for (const r of nav.rules) {
          if (r.targetScreenKey) targets.push(r.targetScreenKey);
        }
      }
      if (targets.length === 0) {
        const idx = screens.findIndex((s) => s.screen_key === curKey);
        if (idx >= 0 && idx < screens.length - 1) {
          targets.push(screens[idx + 1].screen_key);
        }
      }

      for (const t of targets) {
        if (!screenMap.has(t)) {
          errors.push(`Step '${curKey}' transitions to non-existent step '${t}'.`);
        } else if (!visited.has(t)) {
          queue.push(t);
        }
      }
    }

    for (const s of screens) {
      if (!visited.has(s.screen_key)) {
        warnings.push(`Unreachable step detected: '${s.screen_key}'.`);
      }

      let cfg = {};
      try {
        cfg = typeof s.config_json === "string" ? JSON.parse(s.config_json || "{}") : (s.config_json || {});
      } catch (_) {}

      const mapped = mapLegacyScreenToComponent({
        id: s.id,
        screenKey: s.screen_key,
        screenType: s.screen_type,
        title: s.title,
        subtitle: s.subtitle,
        config: cfg
      }, s.fields || []);

      const check = validateComponentStepConfig(mapped.componentType, cfg);
      if (!check.valid) {
        errors.push(`Step '${s.screen_key}': ${check.errors.join("; ")}`);
      }
    }

    const hasTerminal = screens.some((s) => s.screen_type === "CONFIRMATION" || s.screen_key === "confirmation" || s.screen_key === "thank_you");
    if (!hasTerminal) {
      warnings.push("No explicit confirmation / receipt step found; Goal Engine may only trigger on action COMPLETE.");
    }
  }

  return {
    valid: errors.length === 0,
    experienceId: exp.id,
    errors,
    warnings,
    stepsChecked: screens.length
  };
}

function buildSnapshotPayload(exp) {
  return {
    experience: {
      id: exp.id,
      tenantId: exp.tenant_id,
      slug: exp.slug,
      name: exp.name,
      domainType: exp.domain_type,
      businessEntityId: exp.business_entity_id,
      crmPipelineId: exp.crm_pipeline_id,
      assignedPhoneNumberId: exp.assigned_phone_number_id,
      entryScreenKey: exp.entry_screen_key,
      theme: typeof exp.theme_json === "string" ? JSON.parse(exp.theme_json || "{}") : (exp.theme_json || {}),
      features: typeof exp.features_json === "string" ? JSON.parse(exp.features_json || "{}") : (exp.features_json || {}),
      businessHours: typeof exp.business_hours_json === "string" ? JSON.parse(exp.business_hours_json || "{}") : (exp.business_hours_json || {}),
      goalType: exp.goal_type || "LEAD_QUALIFICATION"
    },
    screens: (exp.screens || []).map((s) => ({
      id: s.id,
      screenKey: s.screen_key,
      title: sanitizeText(s.title),
      subtitle: sanitizeText(s.subtitle),
      screenType: s.screen_type,
      config: typeof s.config_json === "string" ? JSON.parse(s.config_json || "{}") : (s.config_json || {}),
      navigationRules: typeof s.navigation_rules_json === "string" ? JSON.parse(s.navigation_rules_json || "{}") : (s.navigation_rules_json || {}),
      displayOrder: s.display_order,
      fields: (s.fields || []).map((f) => ({
        id: f.id,
        screenId: f.screen_id,
        fieldKey: f.field_key,
        label: f.label,
        inputType: f.input_type,
        placeholder: f.placeholder,
        options: typeof f.options_json === "string" ? JSON.parse(f.options_json || "[]") : (f.options_json || []),
        validationRules: typeof f.validation_rules_json === "string" ? JSON.parse(f.validation_rules_json || "{}") : (f.validation_rules_json || {}),
        crmFieldMapping: f.crm_field_mapping,
        displayOrder: f.display_order
      }))
    }))
  };
}

function approveExperience(tenantId = 1, experienceId, { actor = "approver", actorEmail = null, notes = "" } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const report = validateExperience(numericTenantId, experienceId);
  if (!report.valid) {
    const err = new Error(`Validation failed before approval: ${report.errors.join("; ")}`);
    err.statusCode = 422;
    err.validationReport = report;
    throw err;
  }

  db.prepare(`
    UPDATE inapp_experiences
    SET approval_state = 'APPROVED',
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND delete_status = 0
  `).run(String(actor), experienceId, numericTenantId);

  logAudit(numericTenantId, {
    experienceId,
    actor,
    actorEmail,
    action: "EXPERIENCE_APPROVED",
    details: { notes, validationWarnings: report.warnings }
  });

  return { approved: true, experienceId, validationReport: report };
}

function publishExperience(tenantId = 1, experienceId, { actor = "publisher", actorEmail = null, changelog = "" } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const exp = inappExperienceService.getExperienceById(experienceId, numericTenantId);
  if (!exp) {
    const err = new Error(`Experience #${experienceId} not found`);
    err.statusCode = 404;
    throw err;
  }

  const report = validateExperience(numericTenantId, experienceId);
  if (!report.valid) {
    const err = new Error(`Cannot publish experience with validation errors: ${report.errors.join("; ")}`);
    err.statusCode = 422;
    err.validationReport = report;
    throw err;
  }

  if (Number(exp.approval_required) === 1 && exp.approval_state !== "APPROVED") {
    const err = new Error("Workspace governance requires approval before publishing this experience.");
    err.statusCode = 409;
    err.code = "APPROVAL_REQUIRED";
    throw err;
  }

  const maxRow = db.prepare(`
    SELECT COALESCE(MAX(version_number), 0) as max_v
    FROM experience_versions
    WHERE experience_id = ?
  `).get(exp.id);
  const nextVer = Number(maxRow?.max_v || 0) + 1;
  const snapshot = buildSnapshotPayload(exp);

  // Demote previous published version to ARCHIVED
  db.prepare(`
    UPDATE experience_versions
    SET status = 'ARCHIVED'
    WHERE experience_id = ? AND status = 'PUBLISHED'
  `).run(exp.id);

  const verRes = db.prepare(`
    INSERT INTO experience_versions (
      tenant_id, experience_id, version_number, status,
      snapshot_json, validation_report_json, changelog,
      approved_by, approved_at, published_by, published_at
    ) VALUES (
      ?, ?, ?, 'PUBLISHED',
      ?, ?, ?,
      ?, CASE WHEN ? = 'APPROVED' THEN UTC_TIMESTAMP() ELSE NULL END,
      ?, UTC_TIMESTAMP()
    )
  `).run(
    numericTenantId,
    exp.id,
    nextVer,
    JSON.stringify(snapshot),
    JSON.stringify(report),
    sanitizeText(changelog || `Published v${nextVer}`),
    exp.approval_state === "APPROVED" ? String(actor) : null,
    exp.approval_state || "NOT_REQUIRED",
    String(actor)
  );

  const versionId = verRes.lastInsertRowid;

  db.prepare(`
    UPDATE inapp_experiences
    SET status = 'PUBLISHED',
        published_version_id = ?,
        published_version_number = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(versionId, nextVer, String(actor), exp.id, numericTenantId);

  logAudit(numericTenantId, {
    experienceId: exp.id,
    versionId,
    actor,
    actorEmail,
    action: "EXPERIENCE_PUBLISHED",
    details: { versionNumber: nextVer, changelog }
  });

  return {
    published: true,
    experienceId: exp.id,
    versionId,
    versionNumber: nextVer,
    validationReport: report
  };
}

function rollbackExperienceVersion(tenantId = 1, experienceId, targetVersionIdOrNumber, { actor = "publisher", actorEmail = null } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const exp = inappExperienceService.getExperienceById(experienceId, numericTenantId);
  if (!exp) {
    const err = new Error(`Experience #${experienceId} not found`);
    err.statusCode = 404;
    throw err;
  }

  const targetRow = db.prepare(`
    SELECT * FROM experience_versions
    WHERE tenant_id = ? AND experience_id = ? AND (id = ? OR version_number = ?)
    LIMIT 1
  `).get(numericTenantId, exp.id, Number(targetVersionIdOrNumber), Number(targetVersionIdOrNumber));

  if (!targetRow) {
    const err = new Error(`Target version '${targetVersionIdOrNumber}' not found for rollback`);
    err.statusCode = 404;
    throw err;
  }

  db.prepare(`
    UPDATE experience_versions
    SET status = 'ARCHIVED'
    WHERE experience_id = ? AND status = 'PUBLISHED'
  `).run(exp.id);

  db.prepare(`
    UPDATE experience_versions
    SET status = 'PUBLISHED', published_by = ?, published_at = UTC_TIMESTAMP()
    WHERE id = ?
  `).run(String(actor), targetRow.id);

  db.prepare(`
    UPDATE inapp_experiences
    SET status = 'PUBLISHED',
        published_version_id = ?,
        published_version_number = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(targetRow.id, targetRow.version_number, String(actor), exp.id, numericTenantId);

  logAudit(numericTenantId, {
    experienceId: exp.id,
    versionId: targetRow.id,
    actor,
    actorEmail,
    action: "EXPERIENCE_ROLLED_BACK",
    details: { rolledBackToVersion: targetRow.version_number }
  });

  return {
    rolledBack: true,
    experienceId: exp.id,
    versionId: targetRow.id,
    versionNumber: targetRow.version_number
  };
}

function listVersions(tenantId = 1, experienceId) {
  return db.prepare(`
    SELECT id, tenant_id, experience_id, version_number, status, changelog,
           approved_by, approved_at, published_by, published_at, created_at
    FROM experience_versions
    WHERE tenant_id = ? AND experience_id = ?
    ORDER BY version_number DESC
  `).all(Number(tenantId) || 1, Number(experienceId));
}

function listAuditLogs(tenantId = 1, { experienceId = null, limit = 100 } = {}) {
  let sql = `
    SELECT id, tenant_id, experience_id, version_id, actor_id, actor_email, action, details_json, created_at
    FROM studio_audit_logs
    WHERE tenant_id = ?
  `;
  const params = [Number(tenantId) || 1];
  const numericExpId = Number(experienceId);
  if (experienceId && Number.isFinite(numericExpId) && numericExpId > 0) {
    sql += " AND experience_id = ?";
    params.push(numericExpId);
  }
  sql += " ORDER BY id DESC LIMIT ?";
  params.push(Math.max(1, Math.min(200, Number(limit) || 100)));
  return db.prepare(sql).all(...params);
}

module.exports = {
  validateExperience,
  approveExperience,
  publishExperience,
  rollbackExperienceVersion,
  listVersions,
  listAuditLogs,
  logAudit
};
