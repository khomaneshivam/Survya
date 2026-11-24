/**
 * Template Repository
 * Centralized data-access layer for Template Catalog, Immutable Versions,
 * Tenant Installations, and Resource Bindings.
 */

const crypto = require("crypto");
const { db } = require("../../config/database");

class TemplateRepository {
  /**
   * Find templates visible to a tenant
   */
  findVisibleCatalog(tenantId, options = {}) {
    const { industry, category, search, limit = 50, offset = 0 } = options;
    const params = [tenantId];
    let sql = `
      SELECT tc.*, 
        (SELECT COUNT(*) FROM template_versions tv WHERE tv.template_id = tc.id AND tv.delete_status = 0) as version_count,
        (SELECT COUNT(*) FROM template_installations ti WHERE ti.template_id = tc.id AND ti.tenant_id = ? AND ti.delete_status = 0) as installed_by_tenant
      FROM template_catalog tc
      WHERE tc.delete_status = 0 
        AND tc.status = 'PUBLISHED'
        AND (tc.visibility = 'PUBLIC' OR tc.owner_tenant_id = ?)
    `;
    params.unshift(tenantId);

    if (industry && industry !== 'ALL') {
      sql += " AND tc.industry = ?";
      params.push(industry);
    }
    if (category && category !== 'ALL') {
      sql += " AND tc.category = ?";
      params.push(category);
    }
    if (search && search.trim()) {
      sql += " AND (tc.title LIKE ? OR tc.description LIKE ? OR tc.template_key LIKE ?)";
      const pattern = `%${search.trim()}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += " ORDER BY tc.id ASC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(sql).all(...params);
    return rows.map(r => this._hydrateCatalog(r));
  }

  /**
   * Find all templates for platform administrator monitoring
   */
  findAllForAdmin() {
    const rows = db.prepare(`
      SELECT tc.*,
        t.name as owner_tenant_name,
        (SELECT COUNT(*) FROM template_versions tv WHERE tv.template_id = tc.id AND tv.delete_status = 0) as version_count,
        (SELECT COUNT(*) FROM template_installations ti WHERE ti.template_id = tc.id AND ti.delete_status = 0) as total_installations,
        (SELECT COUNT(DISTINCT ti.tenant_id) FROM template_installations ti WHERE ti.template_id = tc.id AND ti.delete_status = 0 AND ti.status = 'ACTIVE') as active_tenants_count
      FROM template_catalog tc
      LEFT JOIN tenants t ON t.id = tc.owner_tenant_id
      WHERE tc.delete_status = 0
      ORDER BY tc.id ASC
    `).all();
    return rows.map(r => this._hydrateCatalog(r));
  }

  /**
   * Find a catalog template by ID or unique key
   */
  findTemplateByIdOrKey(idOrKey, tenantId = null) {
    let row;
    if (typeof idOrKey === 'number' || /^\d+$/.test(String(idOrKey))) {
      row = db.prepare(`
        SELECT tc.* 
        FROM template_catalog tc
        WHERE tc.id = ? AND tc.delete_status = 0
      `).get(Number(idOrKey));
    } else {
      row = db.prepare(`
        SELECT tc.* 
        FROM template_catalog tc
        WHERE (tc.template_key = ? OR tc.uuid = ?) AND tc.delete_status = 0
      `).get(String(idOrKey), String(idOrKey));
    }

    if (!row) return null;

    // Check visibility permissions
    if (row.visibility === 'PRIVATE' && tenantId && row.owner_tenant_id !== tenantId) {
      return null;
    }

    return this._hydrateCatalog(row);
  }

  /**
   * Find a specific template version snapshot
   */
  findVersion(templateId, versionNumber = null) {
    if (versionNumber) {
      return db.prepare(`
        SELECT * FROM template_versions 
        WHERE template_id = ? AND version_number = ? AND delete_status = 0
        LIMIT 1
      `).get(templateId, String(versionNumber));
    }
    // Return latest published version
    return db.prepare(`
      SELECT * FROM template_versions 
      WHERE template_id = ? AND status = 'PUBLISHED' AND delete_status = 0
      ORDER BY id DESC LIMIT 1
    `).get(templateId);
  }

  /**
   * List all versions for a template
   */
  listVersions(templateId) {
    return db.prepare(`
      SELECT id, uuid, template_id, version_number, status, checksum, changelog, created_at
      FROM template_versions
      WHERE template_id = ? AND delete_status = 0
      ORDER BY id DESC
    `).all(templateId);
  }

  /**
   * Create a master template catalog entry
   */
  createTemplate(data) {
    const uuid = data.uuid || crypto.randomUUID();
    const result = db.prepare(`
      INSERT INTO template_catalog (
        uuid, template_key, owner_tenant_id, visibility, industry, category,
        title, description, icon, badge, capabilities_json, current_version,
        status, tenant_id, active_status, delete_status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(
      uuid,
      data.template_key,
      data.owner_tenant_id || null,
      data.visibility || 'PUBLIC',
      data.industry || 'GENERAL',
      data.category || 'GENERAL',
      data.title,
      data.description || '',
      data.icon || 'Bot',
      data.badge || null,
      data.capabilities_json ? (typeof data.capabilities_json === 'string' ? data.capabilities_json : JSON.stringify(data.capabilities_json)) : '[]',
      data.current_version || '1.0.0',
      data.status || 'PUBLISHED',
      data.tenant_id || 1,
      data.created_by || 'system',
      data.updated_by || 'system'
    );
    return this.findTemplateByIdOrKey(result.lastInsertRowid);
  }

  /**
   * Create an immutable template version snapshot
   */
  createVersion(data) {
    const uuid = data.uuid || crypto.randomUUID();
    const result = db.prepare(`
      INSERT INTO template_versions (
        uuid, template_id, version_number, status, graph_json, config_schema_json,
        required_bindings_json, checksum, changelog, tenant_id, active_status,
        delete_status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(
      uuid,
      data.template_id,
      data.version_number || '1.0.0',
      data.status || 'PUBLISHED',
      typeof data.graph_json === 'string' ? data.graph_json : JSON.stringify(data.graph_json || {}),
      typeof data.config_schema_json === 'string' ? data.config_schema_json : JSON.stringify(data.config_schema_json || {}),
      typeof data.required_bindings_json === 'string' ? data.required_bindings_json : JSON.stringify(data.required_bindings_json || []),
      data.checksum || null,
      data.changelog || 'Initial release',
      data.tenant_id || 1,
      data.created_by || 'system',
      data.updated_by || 'system'
    );

    // Update current_version on catalog if newer
    db.prepare(`
      UPDATE template_catalog 
      SET current_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(data.version_number || '1.0.0', data.template_id);

    return db.prepare("SELECT * FROM template_versions WHERE id = ?").get(result.lastInsertRowid);
  }

  /**
   * Find installation by ID for a tenant
   */
  findInstallationById(id, tenantId) {
    const row = db.prepare(`
      SELECT ti.*, tc.title as template_title, tc.template_key, tc.icon as template_icon, tc.industry as template_industry,
             tv.config_schema_json, tv.required_bindings_json, cf.status as flow_status, cf.name as flow_name
      FROM template_installations ti
      JOIN template_catalog tc ON tc.id = ti.template_id
      JOIN template_versions tv ON tv.id = ti.installed_version_id
      LEFT JOIN conversation_flows cf ON cf.id = ti.flow_id
      WHERE ti.id = ? AND ti.tenant_id = ? AND ti.delete_status = 0
    `).get(id, tenantId);
    if (!row) return null;
    return this._hydrateInstallation(row);
  }

  /**
   * Find installation by flow ID for a tenant
   */
  findInstallationByFlowId(flowId, tenantId = null) {
    let sql = `
      SELECT ti.*, tc.title as template_title, tc.template_key
      FROM template_installations ti
      JOIN template_catalog tc ON tc.id = ti.template_id
      WHERE ti.flow_id = ? AND ti.delete_status = 0
    `;
    const params = [flowId];
    if (tenantId) {
      sql += " AND ti.tenant_id = ?";
      params.push(tenantId);
    }
    const row = db.prepare(sql).get(...params);
    if (!row) return null;
    return this._hydrateInstallation(row);
  }

  /**
   * List installations for a tenant
   */
  listInstallations(tenantId) {
    const rows = db.prepare(`
      SELECT ti.*, tc.title as template_title, tc.template_key, tc.icon as template_icon, 
             tc.industry as template_industry, tc.current_version as latest_available_version,
             cf.status as flow_status, cf.name as flow_name
      FROM template_installations ti
      JOIN template_catalog tc ON tc.id = ti.template_id
      LEFT JOIN conversation_flows cf ON cf.id = ti.flow_id
      WHERE ti.tenant_id = ? AND ti.delete_status = 0
      ORDER BY ti.id DESC
    `).all(tenantId);
    return rows.map(r => this._hydrateInstallation(r));
  }

  /**
   * Create an installation record
   */
  createInstallation(data) {
    const uuid = data.uuid || crypto.randomUUID();
    const result = db.prepare(`
      INSERT INTO template_installations (
        uuid, tenant_id, template_id, installed_version_id, installed_version_number,
        flow_id, status, config_values_json, custom_flow_name, installation_notes,
        installed_at, active_status, delete_status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 0, ?, ?)
    `).run(
      uuid,
      data.tenant_id,
      data.template_id,
      data.installed_version_id,
      data.installed_version_number,
      data.flow_id,
      data.status || 'DRAFT',
      typeof data.config_values_json === 'string' ? data.config_values_json : JSON.stringify(data.config_values_json || {}),
      data.custom_flow_name || null,
      data.installation_notes || null,
      data.created_by || 'system',
      data.updated_by || 'system'
    );
    return this.findInstallationById(result.lastInsertRowid, data.tenant_id);
  }

  /**
   * Update installation status / config
   */
  updateInstallation(id, tenantId, updates = {}) {
    const fields = [];
    const params = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      params.push(updates.status);
      if (updates.status === 'ACTIVE') {
        fields.push("activated_at = CURRENT_TIMESTAMP");
      }
    }
    if (updates.config_values_json !== undefined) {
      fields.push("config_values_json = ?");
      params.push(typeof updates.config_values_json === 'string' ? updates.config_values_json : JSON.stringify(updates.config_values_json));
    }
    if (updates.custom_flow_name !== undefined) {
      fields.push("custom_flow_name = ?");
      params.push(updates.custom_flow_name);
    }
    if (updates.installed_version_id !== undefined) {
      fields.push("installed_version_id = ?");
      params.push(updates.installed_version_id);
    }
    if (updates.installed_version_number !== undefined) {
      fields.push("installed_version_number = ?");
      params.push(updates.installed_version_number);
    }
    if (updates.updated_by !== undefined) {
      fields.push("updated_by = ?");
      params.push(updates.updated_by);
    }

    if (fields.length === 0) return this.findInstallationById(id, tenantId);

    fields.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id, tenantId);

    db.prepare(`
      UPDATE template_installations 
      SET ${fields.join(", ")}
      WHERE id = ? AND tenant_id = ? AND delete_status = 0
    `).run(...params);

    return this.findInstallationById(id, tenantId);
  }

  /**
   * Save resource bindings for an installation
   */
  saveBindings(installationId, tenantId, bindings = [], userId = 'system') {
    // Soft-delete existing bindings
    db.prepare(`
      UPDATE template_bindings 
      SET delete_status = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE installation_id = ? AND tenant_id = ?
    `).run(installationId, tenantId);

    const insertStmt = db.prepare(`
      INSERT INTO template_bindings (
        installation_id, tenant_id, logical_key, resource_type,
        target_resource_id, target_resource_name, active_status, delete_status,
        created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `);

    for (const b of bindings) {
      insertStmt.run(
        installationId,
        tenantId,
        b.logical_key || b.key,
        b.resource_type || b.type,
        String(b.target_resource_id || b.targetId || ''),
        b.target_resource_name || b.targetName || null,
        userId,
        userId
      );
    }

    return this.getBindings(installationId, tenantId);
  }

  /**
   * Get bindings for an installation
   */
  getBindings(installationId, tenantId) {
    return db.prepare(`
      SELECT * FROM template_bindings 
      WHERE installation_id = ? AND tenant_id = ? AND delete_status = 0
    `).all(installationId, tenantId);
  }

  _hydrateCatalog(row) {
    if (!row) return null;
    try {
      row.capabilities = typeof row.capabilities_json === 'string' ? JSON.parse(row.capabilities_json) : (row.capabilities_json || []);
    } catch (_) {
      row.capabilities = [];
    }
    return row;
  }

  _hydrateInstallation(row) {
    if (!row) return null;
    try {
      row.config_values = typeof row.config_values_json === 'string' ? JSON.parse(row.config_values_json) : (row.config_values_json || {});
    } catch (_) {
      row.config_values = {};
    }
    try {
      if (row.config_schema_json) {
        row.config_schema = typeof row.config_schema_json === 'string' ? JSON.parse(row.config_schema_json) : row.config_schema_json;
      }
    } catch (_) {}
    try {
      if (row.required_bindings_json) {
        row.required_bindings = typeof row.required_bindings_json === 'string' ? JSON.parse(row.required_bindings_json) : row.required_bindings_json;
      }
    } catch (_) {}
    return row;
  }
}

module.exports = new TemplateRepository();

