/**
 * Template Catalog Service
 * Handles template discovery, permissions filtering, detailed inspection,
 * and authorized template publishing.
 */

const templateRepository = require("./templateRepository");
const templateBindingService = require("./templateBindingService");

class TemplateCatalogService {
  /**
   * List templates visible to the authenticated tenant
   */
  listCatalog(tenantId, options = {}) {
    return templateRepository.findVisibleCatalog(tenantId, options);
  }

  /**
   * List all templates for platform administration
   */
  listAllForAdmin() {
    return templateRepository.findAllForAdmin();
  }

  /**
   * Get comprehensive template details, including latest version schema,
   * available versions, and available tenant resources for binding
   */
  getTemplateDetails(templateIdOrKey, tenantId) {
    const template = templateRepository.findTemplateByIdOrKey(templateIdOrKey, tenantId);
    if (!template) {
      return null;
    }

    const latestVersion = templateRepository.findVersion(template.id);
    const allVersions = templateRepository.listVersions(template.id);
    const tenantResources = templateBindingService.getAvailableTenantResources(tenantId);

    let configSchema = {};
    let requiredBindings = [];
    let graph = { nodes: [], transitions: [] };

    if (latestVersion) {
      try {
        configSchema = typeof latestVersion.config_schema_json === 'string'
          ? JSON.parse(latestVersion.config_schema_json)
          : (latestVersion.config_schema_json || {});
      } catch (_) {}

      try {
        requiredBindings = typeof latestVersion.required_bindings_json === 'string'
          ? JSON.parse(latestVersion.required_bindings_json)
          : (latestVersion.required_bindings_json || []);
      } catch (_) {}

      try {
        graph = typeof latestVersion.graph_json === 'string'
          ? JSON.parse(latestVersion.graph_json)
          : (latestVersion.graph_json || {});
      } catch (_) {}
    }

    // Check if tenant has an existing installation of this template
    const existingInstallations = templateRepository.listInstallations(tenantId)
      .filter(i => i.template_id === template.id);

    return {
      template,
      currentVersion: latestVersion ? {
        id: latestVersion.id,
        version_number: latestVersion.version_number,
        status: latestVersion.status,
        changelog: latestVersion.changelog,
        configSchema,
        requiredBindings,
        nodesCount: Array.isArray(graph.nodes) ? graph.nodes.length : 0
      } : null,
      versions: allVersions,
      tenantResources,
      existingInstallations
    };
  }

  /**
   * Create a new template definition (Private or Shared)
   */
  createTemplate(tenantId, userId, data) {
    if (!data.template_key || !data.title) {
      throw new Error("Template key and title are required.");
    }

    const created = templateRepository.createTemplate({
      ...data,
      owner_tenant_id: data.visibility === 'PUBLIC' ? null : tenantId,
      tenant_id: tenantId,
      created_by: userId,
      updated_by: userId
    });

    const hasInitialGraph = Boolean(data.graph_json || data.graph || data.config_schema || data.config_schema_json || data.required_bindings || data.required_bindings_json);
    if (hasInitialGraph) {
      templateRepository.createVersion({
        template_id: created.id,
        tenant_id: tenantId,
        version_number: data.current_version || '1.0.0',
        status: 'PUBLISHED',
        graph_json: data.graph_json || data.graph || { nodes: [], transitions: [], variables: {} },
        config_schema_json: data.config_schema_json || data.config_schema || {},
        required_bindings_json: data.required_bindings_json || data.required_bindings || [],
        changelog: data.changelog || 'Initial release',
        created_by: userId,
        updated_by: userId
      });
    }

    return templateRepository.findTemplateByIdOrKey(created.id, tenantId) || created;
  }

  /**
   * Publish a new immutable release version for a template
   */
  createReleaseVersion(templateId, tenantId, userId, versionData) {
    const template = templateRepository.findTemplateByIdOrKey(templateId, tenantId);
    if (!template) {
      throw new Error("Template not found or not accessible.");
    }

    if (!versionData.version_number) {
      throw new Error("Version number is required (e.g. 1.1.0).");
    }

    const prevVersion = templateRepository.findVersion(template.id);
    const configSchema = versionData.config_schema_json ?? versionData.config_schema ?? (prevVersion?.config_schema_json || {});
    const requiredBindings = versionData.required_bindings_json ?? versionData.required_bindings ?? (prevVersion?.required_bindings_json || []);

    return templateRepository.createVersion({
      ...versionData,
      graph_json: versionData.graph_json || versionData.graph || {},
      config_schema_json: configSchema,
      required_bindings_json: requiredBindings,
      template_id: template.id,
      tenant_id: tenantId,
      created_by: userId,
      updated_by: userId
    });
  }
}

module.exports = new TemplateCatalogService();

