const { db } = require("../../config/database");
const config = require("../../config/env");
const { generateQrSvg } = require("../../utils/qrCodeUtil");

/**
 * Normalizes title into URL-safe slug
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "inapp-exp";
}

/**
 * Generates an idempotent, unique slug for an inapp experience
 */
function generateUniqueSlug(baseText, tenantId = 1) {
  const baseSlug = slugify(baseText);
  let finalSlug = baseSlug;
  let counter = 1;

  while (db.prepare("SELECT id FROM inapp_experiences WHERE slug = ?").get(finalSlug)) {
    finalSlug = `${baseSlug}-${counter++}`;
  }
  return finalSlug;
}

/**
 * In-App Experience Service
 * 100% database-driven, domain-agnostic web experience platform
 */
class InappExperienceService {
  /**
   * List experiences for a tenant with screen counts
   */
  listExperiences(tenantId = 1, { domainType, status, search } = {}) {
    let sql = `
      SELECT e.*,
        (SELECT COUNT(*) FROM inapp_screens s WHERE s.experience_id = e.id AND s.delete_status = 0) as screens_count
      FROM inapp_experiences e
      WHERE e.tenant_id = ? AND e.delete_status = 0
    `;
    const params = [tenantId];

    if (domainType && domainType !== "ALL") {
      sql += " AND e.domain_type = ?";
      params.push(domainType);
    }

    if (status && status !== "ALL") {
      sql += " AND e.status = ?";
      params.push(status);
    }

    if (search && String(search).trim()) {
      sql += " AND (e.name LIKE ? OR e.slug LIKE ?)";
      const term = `%${String(search).trim()}%`;
      params.push(term, term);
    }

    sql += " ORDER BY e.id DESC";
    return db.prepare(sql).all(...params);
  }

  /**
   * Get experience by ID with full nested screens and form fields
   */
  getExperienceById(id, tenantId = 1) {
    const exp = db.prepare(`
      SELECT * FROM inapp_experiences
      WHERE id = ? AND tenant_id = ? AND delete_status = 0
    `).get(id, tenantId);

    if (!exp) return null;

    const screens = db.prepare(`
      SELECT * FROM inapp_screens
      WHERE experience_id = ? AND tenant_id = ? AND delete_status = 0
      ORDER BY display_order ASC, id ASC
    `).all(id, tenantId);

    for (const screen of screens) {
      if (screen.screen_type === "DYNAMIC_FORM") {
        screen.fields = db.prepare(`
          SELECT * FROM inapp_form_fields
          WHERE screen_id = ? AND tenant_id = ? AND delete_status = 0
          ORDER BY display_order ASC, id ASC
        `).all(screen.id, tenantId);
      } else {
        screen.fields = [];
      }
    }

    exp.screens = screens;
    return exp;
  }

  /**
   * Get experience by slug (for runtime / public access)
   */
  getExperienceBySlug(slug, tenantId = null) {
    let sql = "SELECT * FROM inapp_experiences WHERE slug = ? AND delete_status = 0";
    const params = [slug];
    if (tenantId) {
      sql += " AND tenant_id = ?";
      params.push(tenantId);
    }
    const exp = db.prepare(sql).get(...params);
    if (!exp) return null;

    return this.getExperienceById(exp.id, exp.tenant_id);
  }

  /**
   * Create a new In-App Experience
   */
  createExperience(data, tenantId = 1, createdBy = "system") {
    if (!data.name || !String(data.name).trim()) {
      throw new Error("Experience name is required");
    }

    const name = String(data.name).trim();
    const slug = data.slug ? slugify(data.slug) : generateUniqueSlug(name, tenantId);

    // Verify slug uniqueness
    const existing = db.prepare("SELECT id FROM inapp_experiences WHERE slug = ?").get(slug);
    if (existing) {
      throw new Error(`Experience slug '${slug}' already exists. Please choose a unique slug.`);
    }

    const domainType = String(data.domain_type || "CUSTOM").toUpperCase();
    const entryScreenKey = data.entry_screen_key || "welcome";
    const themeJson = typeof data.theme_json === "object" ? JSON.stringify(data.theme_json) : (data.theme_json || JSON.stringify({
      primaryColor: "#059669",
      secondaryColor: "#10B981",
      fontFamily: "Inter, sans-serif",
      borderRadius: "12px"
    }));

    const featuresJson = typeof data.features_json === "object" ? JSON.stringify(data.features_json) : (data.features_json || JSON.stringify({
      enablePriceFilter: true,
      enableRateDiscussion: true,
      enableCallbacks: true,
      enableLiveChat: true
    }));

    const businessHoursJson = typeof data.business_hours_json === "object" ? JSON.stringify(data.business_hours_json) : (data.business_hours_json || JSON.stringify({
      timezone: "Asia/Kolkata",
      openTime: "09:00",
      closeTime: "21:00",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    }));

    const status = data.status || "DRAFT";

    const stmt = db.prepare(`
      INSERT INTO inapp_experiences (
        tenant_id, slug, name, domain_type, business_entity_id, crm_pipeline_id,
        assigned_phone_number_id, entry_screen_key, theme_json, features_json,
        business_hours_json, status, active_status, delete_status, created_by, updated_by,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, 1, 0, ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      tenantId,
      slug,
      name,
      domainType,
      data.business_entity_id || null,
      data.crm_pipeline_id || null,
      data.assigned_phone_number_id || null,
      entryScreenKey,
      themeJson,
      featuresJson,
      businessHoursJson,
      status,
      createdBy,
      createdBy
    );

    return this.getExperienceById(result.lastInsertRowid, tenantId);
  }

  /**
   * Update an experience
   */
  updateExperience(id, data, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_experiences WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(id, tenantId);
    if (!existing) {
      throw new Error(`In-App Experience #${id} not found.`);
    }

    let finalSlug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      const cleanSlug = slugify(data.slug);
      const duplicate = db.prepare("SELECT id FROM inapp_experiences WHERE slug = ? AND id != ?").get(cleanSlug, id);
      if (duplicate) {
        throw new Error(`Slug '${cleanSlug}' is already in use by another experience.`);
      }
      finalSlug = cleanSlug;
    }

    const name = data.name !== undefined ? String(data.name).trim() : existing.name;
    const domainType = data.domain_type !== undefined ? String(data.domain_type).toUpperCase() : existing.domain_type;
    const businessEntityId = data.business_entity_id !== undefined ? (data.business_entity_id || null) : existing.business_entity_id;
    const crmPipelineId = data.crm_pipeline_id !== undefined ? (data.crm_pipeline_id || null) : existing.crm_pipeline_id;
    const assignedPhoneId = data.assigned_phone_number_id !== undefined ? (data.assigned_phone_number_id || null) : existing.assigned_phone_number_id;
    const entryScreenKey = data.entry_screen_key !== undefined ? data.entry_screen_key : existing.entry_screen_key;

    const themeJson = data.theme_json !== undefined ? (typeof data.theme_json === "object" ? JSON.stringify(data.theme_json) : data.theme_json) : existing.theme_json;
    const featuresJson = data.features_json !== undefined ? (typeof data.features_json === "object" ? JSON.stringify(data.features_json) : data.features_json) : existing.features_json;
    const businessHoursJson = data.business_hours_json !== undefined ? (typeof data.business_hours_json === "object" ? JSON.stringify(data.business_hours_json) : data.business_hours_json) : existing.business_hours_json;
    const status = data.status !== undefined ? data.status : existing.status;

    db.prepare(`
      UPDATE inapp_experiences
      SET name = ?,
          slug = ?,
          domain_type = ?,
          business_entity_id = ?,
          crm_pipeline_id = ?,
          assigned_phone_number_id = ?,
          entry_screen_key = ?,
          theme_json = ?,
          features_json = ?,
          business_hours_json = ?,
          status = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(
      name,
      finalSlug,
      domainType,
      businessEntityId,
      crmPipelineId,
      assignedPhoneId,
      entryScreenKey,
      themeJson,
      featuresJson,
      businessHoursJson,
      status,
      updatedBy,
      id,
      tenantId
    );

    return this.getExperienceById(id, tenantId);
  }

  /**
   * Update experience publication status (DRAFT | PUBLISHED | PAUSED)
   */
  updateExperienceStatus(id, status, tenantId = 1, updatedBy = "system") {
    const validStatuses = ["DRAFT", "PUBLISHED", "PAUSED"];
    const targetStatus = String(status || "").toUpperCase();
    if (!validStatuses.includes(targetStatus)) {
      throw new Error(`Invalid status '${status}'. Must be DRAFT, PUBLISHED, or PAUSED.`);
    }

    const existing = db.prepare("SELECT * FROM inapp_experiences WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(id, tenantId);
    if (!existing) {
      throw new Error(`In-App Experience #${id} not found.`);
    }

    db.prepare(`
      UPDATE inapp_experiences
      SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(targetStatus, updatedBy, id, tenantId);

    return { id, status: targetStatus, updated_at: new Date().toISOString() };
  }

  /**
   * Soft-delete an experience, including all associated screens and form fields
   */
  deleteExperience(id, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_experiences WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(id, tenantId);
    if (!existing) {
      throw new Error(`In-App Experience #${id} not found.`);
    }

    // Soft-delete experience
    db.prepare(`
      UPDATE inapp_experiences
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(updatedBy, id, tenantId);

    // Soft-delete child screens
    db.prepare(`
      UPDATE inapp_screens
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE experience_id = ? AND tenant_id = ?
    `).run(updatedBy, id, tenantId);

    // Soft-delete child form fields
    db.prepare(`
      UPDATE inapp_form_fields
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE screen_id IN (SELECT id FROM inapp_screens WHERE experience_id = ? AND tenant_id = ?)
    `).run(updatedBy, id, tenantId);

    return { success: true, id, message: "Experience soft-deleted successfully" };
  }

  /**
   * Generate QR Code SVG for sharing an experience
   */
  getExperienceQrCode(idOrSlug, tenantId = 1) {
    const exp = isNaN(Number(idOrSlug))
      ? db.prepare("SELECT * FROM inapp_experiences WHERE slug = ? AND delete_status = 0").get(idOrSlug)
      : db.prepare("SELECT * FROM inapp_experiences WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(idOrSlug, tenantId);

    if (!exp) {
      throw new Error(`In-App Experience not found for '${idOrSlug}'`);
    }

    const publicBase = config.PUBLIC_APP_URL || "https://sarvya.flex-us.com";
    const shareUrl = `${publicBase.replace(/\/+$/, "")}/x/${exp.slug}`;
    const svg = generateQrSvg(shareUrl, { size: 320 });

    return {
      experience_id: exp.id,
      name: exp.name,
      slug: exp.slug,
      share_url: shareUrl,
      qr_svg: svg
    };
  }

  // =========================================================================
  // SCREENS CRUD & REORDER
  // =========================================================================

  listScreens(experienceId, tenantId = 1) {
    return db.prepare(`
      SELECT * FROM inapp_screens
      WHERE experience_id = ? AND tenant_id = ? AND delete_status = 0
      ORDER BY display_order ASC, id ASC
    `).all(experienceId, tenantId);
  }

  createScreen(experienceId, data, tenantId = 1, createdBy = "system") {
    const exp = db.prepare("SELECT id FROM inapp_experiences WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(experienceId, tenantId);
    if (!exp) {
      throw new Error(`In-App Experience #${experienceId} not found.`);
    }

    if (!data.screen_key || !String(data.screen_key).trim()) {
      throw new Error("Screen key is required.");
    }
    if (!data.title || !String(data.title).trim()) {
      throw new Error("Screen title is required.");
    }

    const screenKey = slugify(data.screen_key).replace(/-/g, "_");
    const existing = db.prepare("SELECT id FROM inapp_screens WHERE experience_id = ? AND screen_key = ? AND delete_status = 0").get(experienceId, screenKey);
    if (existing) {
      throw new Error(`Screen with key '${screenKey}' already exists in this experience.`);
    }

    const maxOrder = db.prepare("SELECT MAX(display_order) as m FROM inapp_screens WHERE experience_id = ? AND delete_status = 0").get(experienceId)?.m || 0;
    const displayOrder = data.display_order !== undefined ? data.display_order : (data.sort_order !== undefined ? data.sort_order : maxOrder + 1);

    const screenType = String(data.screen_type || "HERO_WELCOME").toUpperCase();
    const configJson = typeof data.config_json === "object" ? JSON.stringify(data.config_json) : (data.config_json || "{}");
    const navRulesJson = typeof data.navigation_rules_json === "object" ? JSON.stringify(data.navigation_rules_json) : (data.navigation_rules_json || "{}");

    const stmt = db.prepare(`
      INSERT INTO inapp_screens (
        tenant_id, experience_id, screen_key, title, subtitle, screen_type,
        config_json, navigation_rules_json, display_order, active_status, delete_status,
        created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 1, 0,
        ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      tenantId,
      experienceId,
      screenKey,
      data.title,
      data.subtitle || null,
      screenType,
      configJson,
      navRulesJson,
      displayOrder,
      createdBy,
      createdBy
    );

    return db.prepare("SELECT * FROM inapp_screens WHERE id = ?").get(result.lastInsertRowid);
  }

  updateScreen(screenId, data, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_screens WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(screenId, tenantId);
    if (!existing) {
      throw new Error(`Screen #${screenId} not found.`);
    }

    let screenKey = existing.screen_key;
    if (data.screen_key && data.screen_key !== existing.screen_key) {
      const cleanKey = slugify(data.screen_key).replace(/-/g, "_");
      const duplicate = db.prepare("SELECT id FROM inapp_screens WHERE experience_id = ? AND screen_key = ? AND id != ? AND delete_status = 0").get(existing.experience_id, cleanKey, screenId);
      if (duplicate) {
        throw new Error(`Screen key '${cleanKey}' already exists in this experience.`);
      }
      screenKey = cleanKey;
    }

    const title = data.title !== undefined ? data.title : existing.title;
    const subtitle = data.subtitle !== undefined ? data.subtitle : existing.subtitle;
    const screenType = data.screen_type !== undefined ? String(data.screen_type).toUpperCase() : existing.screen_type;
    const configJson = data.config_json !== undefined ? (typeof data.config_json === "object" ? JSON.stringify(data.config_json) : data.config_json) : existing.config_json;
    const navRulesJson = data.navigation_rules_json !== undefined ? (typeof data.navigation_rules_json === "object" ? JSON.stringify(data.navigation_rules_json) : data.navigation_rules_json) : existing.navigation_rules_json;
    const displayOrder = data.display_order !== undefined ? data.display_order : (data.sort_order !== undefined ? data.sort_order : existing.display_order);

    db.prepare(`
      UPDATE inapp_screens
      SET screen_key = ?,
          title = ?,
          subtitle = ?,
          screen_type = ?,
          config_json = ?,
          navigation_rules_json = ?,
          display_order = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(
      screenKey,
      title,
      subtitle,
      screenType,
      configJson,
      navRulesJson,
      displayOrder,
      updatedBy,
      screenId,
      tenantId
    );

    return db.prepare("SELECT * FROM inapp_screens WHERE id = ?").get(screenId);
  }

  deleteScreen(screenId, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_screens WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(screenId, tenantId);
    if (!existing) {
      throw new Error(`Screen #${screenId} not found.`);
    }

    db.prepare(`
      UPDATE inapp_screens
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(updatedBy, screenId, tenantId);

    db.prepare(`
      UPDATE inapp_form_fields
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE screen_id = ? AND tenant_id = ?
    `).run(updatedBy, screenId, tenantId);

    return { success: true, screenId, message: "Screen soft-deleted successfully" };
  }

  reorderScreens(experienceId, screenIds = [], tenantId = 1) {
    if (!Array.isArray(screenIds)) return { success: false, message: "screenIds must be an array" };

    const updateStmt = db.prepare(`
      UPDATE inapp_screens
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND experience_id = ? AND tenant_id = ?
    `);

    screenIds.forEach((id, idx) => {
      updateStmt.run(idx + 1, id, experienceId, tenantId);
    });

    return { success: true, reorderedCount: screenIds.length };
  }

  // =========================================================================
  // FORM FIELDS CRUD & REORDER
  // =========================================================================

  listFormFields(screenId, tenantId = 1) {
    return db.prepare(`
      SELECT * FROM inapp_form_fields
      WHERE screen_id = ? AND tenant_id = ? AND delete_status = 0
      ORDER BY display_order ASC, id ASC
    `).all(screenId, tenantId);
  }

  createFormField(screenId, data, tenantId = 1, createdBy = "system") {
    const screen = db.prepare("SELECT id FROM inapp_screens WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(screenId, tenantId);
    if (!screen) {
      throw new Error(`Screen #${screenId} not found.`);
    }

    if (!data.field_key || !String(data.field_key).trim()) {
      throw new Error("Field key is required.");
    }
    if (!data.label || !String(data.label).trim()) {
      throw new Error("Field label is required.");
    }

    const fieldKey = slugify(data.field_key).replace(/-/g, "_");
    const existing = db.prepare("SELECT id FROM inapp_form_fields WHERE screen_id = ? AND field_key = ? AND delete_status = 0").get(screenId, fieldKey);
    if (existing) {
      throw new Error(`Field with key '${fieldKey}' already exists on this screen.`);
    }

    const maxOrder = db.prepare("SELECT MAX(display_order) as m FROM inapp_form_fields WHERE screen_id = ? AND delete_status = 0").get(screenId)?.m || 0;
    const displayOrder = data.display_order !== undefined ? data.display_order : (data.sort_order !== undefined ? data.sort_order : maxOrder + 1);

    const inputType = String(data.input_type || "TEXT").toUpperCase();
    const optionsJson = typeof data.options_json === "object" ? JSON.stringify(data.options_json) : (data.options_json || null);
    const validationJson = typeof data.validation_rules_json === "object" ? JSON.stringify(data.validation_rules_json) : (data.validation_rules_json || "{}");

    const stmt = db.prepare(`
      INSERT INTO inapp_form_fields (
        tenant_id, screen_id, field_key, label, placeholder, input_type,
        options_json, validation_rules_json, crm_field_mapping, display_order,
        active_status, delete_status, created_by, updated_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        1, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    const result = stmt.run(
      tenantId,
      screenId,
      fieldKey,
      data.label,
      data.placeholder || "",
      inputType,
      optionsJson,
      validationJson,
      data.crm_field_mapping || null,
      displayOrder,
      createdBy,
      createdBy
    );

    return db.prepare("SELECT * FROM inapp_form_fields WHERE id = ?").get(result.lastInsertRowid);
  }

  updateFormField(fieldId, data, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_form_fields WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(fieldId, tenantId);
    if (!existing) {
      throw new Error(`Form field #${fieldId} not found.`);
    }

    let fieldKey = existing.field_key;
    if (data.field_key && data.field_key !== existing.field_key) {
      const cleanKey = slugify(data.field_key).replace(/-/g, "_");
      const duplicate = db.prepare("SELECT id FROM inapp_form_fields WHERE screen_id = ? AND field_key = ? AND id != ? AND delete_status = 0").get(existing.screen_id, cleanKey, fieldId);
      if (duplicate) {
        throw new Error(`Field key '${cleanKey}' already exists on this screen.`);
      }
      fieldKey = cleanKey;
    }

    const label = data.label !== undefined ? data.label : existing.label;
    const placeholder = data.placeholder !== undefined ? data.placeholder : existing.placeholder;
    const inputType = data.input_type !== undefined ? String(data.input_type).toUpperCase() : existing.input_type;
    const optionsJson = data.options_json !== undefined ? (typeof data.options_json === "object" ? JSON.stringify(data.options_json) : data.options_json) : existing.options_json;
    const validationJson = data.validation_rules_json !== undefined ? (typeof data.validation_rules_json === "object" ? JSON.stringify(data.validation_rules_json) : data.validation_rules_json) : existing.validation_rules_json;
    const crmMapping = data.crm_field_mapping !== undefined ? (data.crm_field_mapping || null) : existing.crm_field_mapping;
    const displayOrder = data.display_order !== undefined ? data.display_order : (data.sort_order !== undefined ? data.sort_order : existing.display_order);

    db.prepare(`
      UPDATE inapp_form_fields
      SET field_key = ?,
          label = ?,
          placeholder = ?,
          input_type = ?,
          options_json = ?,
          validation_rules_json = ?,
          crm_field_mapping = ?,
          display_order = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(
      fieldKey,
      label,
      placeholder,
      inputType,
      optionsJson,
      validationJson,
      crmMapping,
      displayOrder,
      updatedBy,
      fieldId,
      tenantId
    );

    return db.prepare("SELECT * FROM inapp_form_fields WHERE id = ?").get(fieldId);
  }

  deleteFormField(fieldId, tenantId = 1, updatedBy = "system") {
    const existing = db.prepare("SELECT * FROM inapp_form_fields WHERE id = ? AND tenant_id = ? AND delete_status = 0").get(fieldId, tenantId);
    if (!existing) {
      throw new Error(`Form field #${fieldId} not found.`);
    }

    db.prepare(`
      UPDATE inapp_form_fields
      SET delete_status = 1, active_status = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(updatedBy, fieldId, tenantId);

    return { success: true, fieldId, message: "Form field soft-deleted successfully" };
  }

  reorderFormFields(screenId, fieldIds = [], tenantId = 1) {
    if (!Array.isArray(fieldIds)) return { success: false, message: "fieldIds must be an array" };

    const updateStmt = db.prepare(`
      UPDATE inapp_form_fields
      SET display_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND screen_id = ? AND tenant_id = ?
    `);

    fieldIds.forEach((id, idx) => {
      updateStmt.run(idx + 1, id, screenId, tenantId);
    });

    return { success: true, reorderedCount: fieldIds.length };
  }

  // =========================================================================
  // 4 DOMAIN STARTER PACKS
  // =========================================================================

  seedStarterExperience(domainType = "HOSPITALITY", tenantId = 1, createdBy = "system", overrides = {}) {
    const domain = String(domainType || "HOSPITALITY").toUpperCase();

    switch (domain) {
      case "HOSPITALITY":
        return this._seedHospitalityStarter(tenantId, createdBy, overrides);
      case "RETAIL":
        return this._seedRetailStarter(tenantId, createdBy, overrides);
      case "B2B_SALES":
        return this._seedB2BStarter(tenantId, createdBy, overrides);
      case "SERVICES":
        return this._seedServicesStarter(tenantId, createdBy, overrides);
      default:
        throw new Error(`Unknown starter domain type '${domainType}'. Allowed: HOSPITALITY, RETAIL, B2B_SALES, SERVICES.`);
    }
  }

  _seedHospitalityStarter(tenantId, createdBy, overrides) {
    const name = overrides.name || "Beachfront Villa & Resort Booking Experience";
    const exp = this.createExperience({
      name,
      domain_type: "HOSPITALITY",
      slug: overrides.slug,
      entry_screen_key: "welcome",
      theme_json: {
        primaryColor: "#059669",
        secondaryColor: "#10B981",
        accentColor: "#F59E0B",
        fontFamily: "Inter, sans-serif",
        borderRadius: "16px"
      },
      features_json: {
        enablePriceFilter: true,
        enableRateDiscussion: true,
        enableCallbacks: true,
        enableLiveChat: true
      },
      status: "PUBLISHED"
    }, tenantId, createdBy);

    // 1. Welcome Hero
    this.createScreen(exp.id, {
      screen_key: "welcome",
      title: "Welcome to Konkan Seaside Villas",
      subtitle: "Discover private luxury villas, sea-view suites, and tranquil weekend stays in Alibaug.",
      screen_type: "HERO_WELCOME",
      config_json: {
        heroImageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
        ctaButtonText: "Explore Villas & Rates 🏖️",
        accentBadge: "Direct Booking Guarantee"
      },
      navigation_rules_json: { nextScreenKey: "villa_explorer" },
      display_order: 1
    }, tenantId, createdBy);

    // 2. Villa Explorer
    this.createScreen(exp.id, {
      screen_key: "villa_explorer",
      title: "Select Your Luxury Villa",
      subtitle: "Browse available villas, filter by nightly rate and room capacity.",
      screen_type: "CATALOG_EXPLORER",
      config_json: {
        enablePriceSlider: true,
        priceMin: 2500,
        priceMax: 15000,
        priceStep: 500,
        currencySymbol: "₹",
        itemCardStyle: "GRID",
        showAmenities: true
      },
      navigation_rules_json: { nextScreenKey: "room_detail" },
      display_order: 2
    }, tenantId, createdBy);

    // 3. Room Detail & Availability
    this.createScreen(exp.id, {
      screen_key: "room_detail",
      title: "Deluxe Sea View Villa",
      subtitle: "Includes breakfast, private plunge pool access, and sunset lawn view.",
      screen_type: "ITEM_DETAIL",
      config_json: {
        enableGallery: true,
        images: [
          "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
          "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80"
        ],
        showAvailabilityBadge: true
      },
      navigation_rules_json: { nextScreenKey: "guest_intake" },
      display_order: 3
    }, tenantId, createdBy);

    // 4. Guest Intake Form
    const intakeScreen = this.createScreen(exp.id, {
      screen_key: "guest_intake",
      title: "Plan Your Beach Getaway",
      subtitle: "Enter your contact and stay dates to check exact rates.",
      screen_type: "DYNAMIC_FORM",
      config_json: {
        submitButtonText: "Proceed to Rate Summary ➡️"
      },
      navigation_rules_json: { nextScreenKey: "rate_discussion" },
      display_order: 4
    }, tenantId, createdBy);

    // Intake fields
    this.createFormField(intakeScreen.id, {
      field_key: "guest_name",
      label: "Full Name",
      placeholder: "e.g. Rahul Sharma",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2, maxLength: 80 },
      crm_field_mapping: "contact_name",
      display_order: 1
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "guest_phone",
      label: "WhatsApp Phone Number",
      placeholder: "e.g. 919876543210",
      input_type: "PHONE",
      validation_rules_json: { required: true, phone_e164: true },
      crm_field_mapping: "contact_phone",
      display_order: 2
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "guest_email",
      label: "Email Address",
      placeholder: "e.g. rahul@example.com",
      input_type: "EMAIL",
      validation_rules_json: { required: false, email: true },
      crm_field_mapping: "contact_email",
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "check_in",
      label: "Check-in Date",
      placeholder: "Select Date",
      input_type: "DATE",
      validation_rules_json: { required: true, date_min_today: true },
      crm_field_mapping: "check_in_date",
      display_order: 4
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "check_out",
      label: "Check-out Date",
      placeholder: "Select Date",
      input_type: "DATE",
      validation_rules_json: { required: true, date_after_field: "check_in" },
      crm_field_mapping: "check_out_date",
      display_order: 5
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "adults",
      label: "Number of Adults",
      placeholder: "2",
      input_type: "NUMBER",
      validation_rules_json: { required: true, min: 1, max: 10 },
      crm_field_mapping: "adults",
      display_order: 6
    }, tenantId, createdBy);

    this.createFormField(intakeScreen.id, {
      field_key: "special_requests",
      label: "Special Requests / Meal Preferences",
      placeholder: "e.g. High floor, anniversary cake, late check-in",
      input_type: "TEXTAREA",
      validation_rules_json: { required: false, maxLength: 500 },
      crm_field_mapping: "notes",
      display_order: 7
    }, tenantId, createdBy);

    // 5. Rate Negotiation
    this.createScreen(exp.id, {
      screen_key: "rate_discussion",
      title: "Direct Villa Booking Quote",
      subtitle: "Best rate guarantee. You can request a special group or extended stay offer.",
      screen_type: "RATE_NEGOTIATION",
      config_json: {
        allowOffer: true,
        minDiscountPercent: 5,
        maxDiscountPercent: 20,
        autoApproveFloorPercent: 10
      },
      navigation_rules_json: { nextScreenKey: "call_or_chat" },
      display_order: 5
    }, tenantId, createdBy);

    // 6. Call Connect / Live Assistance
    this.createScreen(exp.id, {
      screen_key: "call_or_chat",
      title: "Concierge Assistance",
      subtitle: "Would you like our Front Desk Concierge to call you instantly?",
      screen_type: "CALL_CONNECT",
      config_json: {
        enableInstantCallback: true,
        enableDirectDial: true,
        enableWhatsAppChat: true,
        conciergePhone: "+919922157931"
      },
      navigation_rules_json: { nextScreenKey: "confirmation" },
      display_order: 6
    }, tenantId, createdBy);

    // 7. Confirmation
    this.createScreen(exp.id, {
      screen_key: "confirmation",
      title: "Booking Request Confirmed! 🎉",
      subtitle: "We have received your reservation request. Our concierge will send your voucher on WhatsApp.",
      screen_type: "CONFIRMATION",
      config_json: {
        showReferenceNumber: true,
        showWhatsAppContinueButton: true
      },
      navigation_rules_json: {},
      display_order: 7
    }, tenantId, createdBy);

    return this.getExperienceById(exp.id, tenantId);
  }

  _seedRetailStarter(tenantId, createdBy, overrides) {
    const name = overrides.name || "Storefront Catalog & Instant Order Experience";
    const exp = this.createExperience({
      name,
      domain_type: "RETAIL",
      slug: overrides.slug,
      entry_screen_key: "store_welcome",
      theme_json: {
        primaryColor: "#2563EB",
        secondaryColor: "#3B82F6",
        borderRadius: "12px"
      },
      features_json: {
        enablePriceFilter: true,
        enableRateDiscussion: true,
        enableCallbacks: true,
        enableLiveChat: true
      },
      status: "PUBLISHED"
    }, tenantId, createdBy);

    // 1. Welcome
    this.createScreen(exp.id, {
      screen_key: "store_welcome",
      title: "Direct Retail Storefront",
      subtitle: "Explore our curated catalog with real-time stock sync and fast home delivery.",
      screen_type: "HERO_WELCOME",
      config_json: {
        heroImageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
        ctaButtonText: "Browse Catalog 🛍️"
      },
      navigation_rules_json: { nextScreenKey: "catalog_grid" },
      display_order: 1
    }, tenantId, createdBy);

    // 2. Catalog Grid
    this.createScreen(exp.id, {
      screen_key: "catalog_grid",
      title: "Product Collection",
      subtitle: "Filter by price range and live inventory availability.",
      screen_type: "CATALOG_EXPLORER",
      config_json: {
        enablePriceSlider: true,
        priceMin: 499,
        priceMax: 9999,
        priceStep: 250,
        showOutOfStockBadge: true
      },
      navigation_rules_json: { nextScreenKey: "item_detail" },
      display_order: 2
    }, tenantId, createdBy);

    // 3. Item Detail
    this.createScreen(exp.id, {
      screen_key: "item_detail",
      title: "Product Overview",
      subtitle: "Includes warranty, free delivery, and bulk order options.",
      screen_type: "ITEM_DETAIL",
      config_json: {
        enableGallery: true,
        enableBulkInquiry: true
      },
      navigation_rules_json: { nextScreenKey: "delivery_form" },
      display_order: 3
    }, tenantId, createdBy);

    // 4. Delivery Form
    const deliveryScreen = this.createScreen(exp.id, {
      screen_key: "delivery_form",
      title: "Delivery & Shipping Details",
      subtitle: "Enter delivery address for doorstep dispatch.",
      screen_type: "DYNAMIC_FORM",
      config_json: {
        submitButtonText: "Review & Confirm Order 📦"
      },
      navigation_rules_json: { nextScreenKey: "order_confirmation" },
      display_order: 4
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "customer_name",
      label: "Customer Name",
      placeholder: "e.g. Priya Patel",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2 },
      crm_field_mapping: "contact_name",
      display_order: 1
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "customer_phone",
      label: "WhatsApp Mobile Number",
      placeholder: "e.g. 919876543210",
      input_type: "PHONE",
      validation_rules_json: { required: true, phone_e164: true },
      crm_field_mapping: "contact_phone",
      display_order: 2
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "delivery_address",
      label: "Street Address",
      placeholder: "Flat / Building, Street name, Landmark",
      input_type: "TEXTAREA",
      validation_rules_json: { required: true, minLength: 5 },
      crm_field_mapping: "address",
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "city",
      label: "City",
      placeholder: "e.g. Mumbai",
      input_type: "TEXT",
      validation_rules_json: { required: true },
      crm_field_mapping: "city",
      display_order: 4
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "pincode",
      label: "PIN Code (6 Digits)",
      placeholder: "e.g. 400001",
      input_type: "TEXT",
      validation_rules_json: { required: true, regex: "^[1-9][0-9]{5}$", errorMessage: "Please enter a valid 6-digit Indian PIN code" },
      crm_field_mapping: "pincode",
      display_order: 5
    }, tenantId, createdBy);

    this.createFormField(deliveryScreen.id, {
      field_key: "delivery_slot",
      label: "Preferred Delivery Slot",
      input_type: "SELECT",
      options_json: ["Morning (9 AM - 1 PM)", "Afternoon (1 PM - 5 PM)", "Evening (5 PM - 9 PM)"],
      validation_rules_json: { required: true },
      crm_field_mapping: "delivery_slot",
      display_order: 6
    }, tenantId, createdBy);

    // 5. Order Confirmation
    this.createScreen(exp.id, {
      screen_key: "order_confirmation",
      title: "Order Placed Successfully! 🛍️",
      subtitle: "Your order details and tracking link have been dispatched to your WhatsApp.",
      screen_type: "CONFIRMATION",
      config_json: {
        showReferenceNumber: true,
        showWhatsAppContinueButton: true
      },
      navigation_rules_json: {},
      display_order: 5
    }, tenantId, createdBy);

    return this.getExperienceById(exp.id, tenantId);
  }

  _seedB2BStarter(tenantId, createdBy, overrides) {
    const name = overrides.name || "Survya Enterprise Solution & Qualification";
    const exp = this.createExperience({
      name,
      domain_type: "B2B_SALES",
      slug: overrides.slug,
      entry_screen_key: "b2b_hero",
      theme_json: {
        primaryColor: "#4F46E5",
        secondaryColor: "#6366F1",
        borderRadius: "14px"
      },
      features_json: {
        enablePriceFilter: false,
        enableRateDiscussion: true,
        enableCallbacks: true,
        enableLiveChat: true
      },
      status: "PUBLISHED"
    }, tenantId, createdBy);

    // 1. Hero
    this.createScreen(exp.id, {
      screen_key: "b2b_hero",
      title: "Enterprise WhatsApp Automation Suite",
      subtitle: "Scalable omni-channel messaging, CRM pipelines, and automated reservation bots.",
      screen_type: "HERO_WELCOME",
      config_json: {
        heroImageUrl: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80",
        ctaButtonText: "Explore Enterprise Plans 🚀"
      },
      navigation_rules_json: { nextScreenKey: "tier_explorer" },
      display_order: 1
    }, tenantId, createdBy);

    // 2. Tier Explorer
    this.createScreen(exp.id, {
      screen_key: "tier_explorer",
      title: "Choose Your Growth Tier",
      subtitle: "Select the plan tailored to your team size and message volume.",
      screen_type: "CATALOG_EXPLORER",
      config_json: {
        enablePriceSlider: false
      },
      navigation_rules_json: { nextScreenKey: "qualification_form" },
      display_order: 2
    }, tenantId, createdBy);

    // 3. Qualification Form
    const qualScreen = this.createScreen(exp.id, {
      screen_key: "qualification_form",
      title: "Enterprise Qualification & Demo Request",
      subtitle: "Tell us about your organization to unlock custom enterprise pricing.",
      screen_type: "DYNAMIC_FORM",
      config_json: {
        submitButtonText: "Get Custom Quote & Proposal 📈"
      },
      navigation_rules_json: { nextScreenKey: "custom_pricing" },
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "contact_name",
      label: "Full Name",
      placeholder: "e.g. Vikram Mehta",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2 },
      crm_field_mapping: "contact_name",
      display_order: 1
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "work_email",
      label: "Official Work Email",
      placeholder: "e.g. vikram@acme.corp",
      input_type: "EMAIL",
      validation_rules_json: { required: true, email: true },
      crm_field_mapping: "contact_email",
      display_order: 2
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "contact_phone",
      label: "Direct Phone Number",
      placeholder: "e.g. 919876543210",
      input_type: "PHONE",
      validation_rules_json: { required: true, phone_e164: true },
      crm_field_mapping: "contact_phone",
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "company_name",
      label: "Company / Organization Name",
      placeholder: "e.g. Acme Technologies",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2 },
      crm_field_mapping: "company_name",
      display_order: 4
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "team_size",
      label: "Estimated User Seats / Agents",
      input_type: "SELECT",
      options_json: ["1-5 Agents", "6-20 Agents", "21-50 Agents", "50+ Enterprise"],
      validation_rules_json: { required: true },
      crm_field_mapping: "team_size",
      display_order: 5
    }, tenantId, createdBy);

    this.createFormField(qualScreen.id, {
      field_key: "requirements",
      label: "Core Requirements / Systems to Integrate",
      placeholder: "e.g. Opera PMS, Salesforce CRM, custom webhook triggers",
      input_type: "TEXTAREA",
      validation_rules_json: { required: false },
      crm_field_mapping: "notes",
      display_order: 6
    }, tenantId, createdBy);

    // 4. Custom Pricing & Offer Discussion
    this.createScreen(exp.id, {
      screen_key: "custom_pricing",
      title: "Enterprise Rate Discussion",
      subtitle: "Negotiate volume tiers or SLA commitments directly.",
      screen_type: "RATE_NEGOTIATION",
      config_json: {
        allowOffer: true,
        baseUnitPrice: 19999
      },
      navigation_rules_json: { nextScreenKey: "schedule_call" },
      display_order: 4
    }, tenantId, createdBy);

    // 5. Schedule Call
    this.createScreen(exp.id, {
      screen_key: "schedule_call",
      title: "Schedule Architecture Review",
      subtitle: "Connect with an Enterprise Solutions Architect.",
      screen_type: "CALL_CONNECT",
      config_json: {
        enableInstantCallback: true,
        enableScheduledCall: true
      },
      navigation_rules_json: { nextScreenKey: "b2b_confirmation" },
      display_order: 5
    }, tenantId, createdBy);

    // 6. Confirmation
    this.createScreen(exp.id, {
      screen_key: "b2b_confirmation",
      title: "Enterprise Request Logged! 🤝",
      subtitle: "A Dedicated Account Executive will reach out within 15 minutes.",
      screen_type: "CONFIRMATION",
      config_json: {
        showReferenceNumber: true
      },
      navigation_rules_json: {},
      display_order: 6
    }, tenantId, createdBy);

    return this.getExperienceById(exp.id, tenantId);
  }

  _seedServicesStarter(tenantId, createdBy, overrides) {
    const name = overrides.name || "Clinic & Professional Services Experience";
    const exp = this.createExperience({
      name,
      domain_type: "SERVICES",
      slug: overrides.slug,
      entry_screen_key: "clinic_welcome",
      theme_json: {
        primaryColor: "#0D9488",
        secondaryColor: "#14B8A6",
        borderRadius: "16px"
      },
      features_json: {
        enablePriceFilter: true,
        enableRateDiscussion: false,
        enableCallbacks: true,
        enableLiveChat: true
      },
      status: "PUBLISHED"
    }, tenantId, createdBy);

    // 1. Welcome
    this.createScreen(exp.id, {
      screen_key: "clinic_welcome",
      title: "Apex Wellness & Aesthetic Clinic",
      subtitle: "Expert healthcare and specialized wellness therapies with easy appointment scheduling.",
      screen_type: "HERO_WELCOME",
      config_json: {
        heroImageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
        ctaButtonText: "Book Appointment 🩺"
      },
      navigation_rules_json: { nextScreenKey: "service_menu" },
      display_order: 1
    }, tenantId, createdBy);

    // 2. Service Menu
    this.createScreen(exp.id, {
      screen_key: "service_menu",
      title: "Clinical Services & Therapies",
      subtitle: "Filter services by category and consultation fees.",
      screen_type: "CATALOG_EXPLORER",
      config_json: {
        enablePriceSlider: true,
        priceMin: 500,
        priceMax: 7500,
        priceStep: 250
      },
      navigation_rules_json: { nextScreenKey: "appointment_form" },
      display_order: 2
    }, tenantId, createdBy);

    // 3. Appointment Form
    const apptScreen = this.createScreen(exp.id, {
      screen_key: "appointment_form",
      title: "Schedule Your Consultation",
      subtitle: "Select appointment date, preferred slot, and patient information.",
      screen_type: "DYNAMIC_FORM",
      config_json: {
        submitButtonText: "Confirm Slot & Proceed 🗓️"
      },
      navigation_rules_json: { nextScreenKey: "appointment_confirm" },
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(apptScreen.id, {
      field_key: "client_name",
      label: "Patient / Client Name",
      placeholder: "e.g. Sunita Rao",
      input_type: "TEXT",
      validation_rules_json: { required: true, minLength: 2 },
      crm_field_mapping: "contact_name",
      display_order: 1
    }, tenantId, createdBy);

    this.createFormField(apptScreen.id, {
      field_key: "client_phone",
      label: "Mobile Number",
      placeholder: "e.g. 919876543210",
      input_type: "PHONE",
      validation_rules_json: { required: true, phone_e164: true },
      crm_field_mapping: "contact_phone",
      display_order: 2
    }, tenantId, createdBy);

    this.createFormField(apptScreen.id, {
      field_key: "service_type",
      label: "Select Therapy / Service",
      input_type: "SELECT",
      options_json: ["Consultation & Assessment", "Wellness Therapy", "Skin Care & Rejuvenation", "Physiotherapy Session"],
      validation_rules_json: { required: true },
      crm_field_mapping: "service_type",
      display_order: 3
    }, tenantId, createdBy);

    this.createFormField(apptScreen.id, {
      field_key: "appointment_date",
      label: "Appointment Date",
      input_type: "DATE",
      validation_rules_json: { required: true, date_min_today: true },
      crm_field_mapping: "appointment_date",
      display_order: 4
    }, tenantId, createdBy);

    this.createFormField(apptScreen.id, {
      field_key: "preferred_time",
      label: "Preferred Time Window",
      input_type: "SELECT",
      options_json: ["10:00 AM - 11:30 AM", "12:00 PM - 01:30 PM", "03:00 PM - 04:30 PM", "05:30 PM - 07:00 PM"],
      validation_rules_json: { required: true },
      crm_field_mapping: "preferred_time",
      display_order: 5
    }, tenantId, createdBy);

    // 4. Confirmation
    this.createScreen(exp.id, {
      screen_key: "appointment_confirm",
      title: "Appointment Requested! 🩺",
      subtitle: "We have held your preferred consultation slot. You will receive an SMS/WhatsApp reminder.",
      screen_type: "CONFIRMATION",
      config_json: {
        showReferenceNumber: true
      },
      navigation_rules_json: {},
      display_order: 4
    }, tenantId, createdBy);

    return this.getExperienceById(exp.id, tenantId);
  }
}

module.exports = new InappExperienceService();

