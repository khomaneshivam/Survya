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
  createTemplate(tenantId, userId, rawData = {}) {
    const normalizedBindings = Array.isArray(rawData.requiredBindings)
      ? rawData.requiredBindings.map(b => typeof b === 'string' ? { resource_type: b, logical_key: b.toLowerCase(), label: b, required: true } : b)
      : (rawData.required_bindings_json || rawData.required_bindings);
    const data = {
      ...rawData,
      template_key: rawData.template_key || rawData.templateKey,
      title: rawData.title || rawData.name,
      graph_json: rawData.graph_json || rawData.graph || rawData.workflowGraph,
      config_schema_json: rawData.config_schema_json || rawData.config_schema || rawData.configSchema,
      required_bindings_json: normalizedBindings
    };
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

    const hasInitialGraph = Boolean(data.graph_json || data.config_schema_json || data.required_bindings_json);
    if (hasInitialGraph) {
      templateRepository.createVersion({
        template_id: created.id,
        tenant_id: tenantId,
        version_number: data.current_version || '1.0.0',
        status: 'PUBLISHED',
        graph_json: data.graph_json || { nodes: [], transitions: [], variables: {} },
        config_schema_json: data.config_schema_json || {},
        required_bindings_json: data.required_bindings_json || [],
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
  createReleaseVersion(templateId, tenantId, userId, rawVersionData = {}) {
    const template = templateRepository.findTemplateByIdOrKey(templateId, tenantId);
    if (!template) {
      throw new Error("Template not found or not accessible.");
    }

    const versionData = {
      ...rawVersionData,
      version_number: rawVersionData.version_number || rawVersionData.versionNumber,
      graph_json: rawVersionData.graph_json || rawVersionData.graph || rawVersionData.workflowGraph || {}
    };

    if (!versionData.version_number) {
      throw new Error("Version number is required (e.g. 1.1.0).");
    }

    const prevVersion = templateRepository.findVersion(template.id);
    const configSchema = versionData.config_schema_json ?? versionData.config_schema ?? rawVersionData.configSchema ?? (prevVersion?.config_schema_json || {});
    const requiredBindings = versionData.required_bindings_json ?? versionData.required_bindings ?? rawVersionData.requiredBindings ?? (prevVersion?.required_bindings_json || []);

    return templateRepository.createVersion({
      ...versionData,
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

