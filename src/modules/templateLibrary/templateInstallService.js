/**
 * Template Installation & Lifecycle Engine
 * Handles atomic provisioning of conversation flows from template versions,
 * tenant configuration persistence, and 1-click validation & activation.
 */

const crypto = require("crypto");
const { db } = require("../../config/database");
const templateRepository = require("./templateRepository");
const templateConfigValidator = require("./templateConfigValidator");
const templateBindingService = require("./templateBindingService");

class TemplateInstallService {
  /**
   * Install a template into a tenant workspace
   */
  installTemplate(options = {}) {
    const {
      templateIdOrKey,
      tenantId,
      userId = 'system',
      customFlowName = null,
      configValues = {},
      bindings = [],
      activateImmediately = false
    } = options;

    if (!tenantId) {
      throw new Error("Tenant ID is required for template installation.");
    }

    // 1. Fetch template & latest published version
    const template = templateRepository.findTemplateByIdOrKey(templateIdOrKey, tenantId);
    if (!template) {
      throw new Error(`Template '${templateIdOrKey}' not found or not accessible.`);
    }

    const version = templateRepository.findVersion(template.id);
    if (!version) {
      throw new Error(`Template '${template.title}' has no published versions available.`);
    }

    // 2. Parse version schema & required bindings
    let configSchema = {};
    let requiredBindings = [];
    let graphData = { nodes: [], transitions: [], variables: {} };

    try {
      configSchema = typeof version.config_schema_json === 'string' 
        ? JSON.parse(version.config_schema_json) 
        : (version.config_schema_json || {});
    } catch (_) {}

    try {
      requiredBindings = typeof version.required_bindings_json === 'string'
        ? JSON.parse(version.required_bindings_json)
        : (version.required_bindings_json || []);
    } catch (_) {}

    try {
      graphData = typeof version.graph_json === 'string'
        ? JSON.parse(version.graph_json)
        : (version.graph_json || {});
    } catch (_) {}

    // 3. Validate user configuration against schema
    const configValidation = templateConfigValidator.validate(configSchema, configValues);
    if (!configValidation.isValid && activateImmediately) {
      throw new Error(`Configuration validation failed: ${configValidation.errors.join("; ")}`);
    }

    // 4. Validate and resolve resource bindings
    const bindingValidation = templateBindingService.validateBindings(requiredBindings, bindings, tenantId);
    if (!bindingValidation.isValid && activateImmediately) {
      throw new Error(`Resource binding validation failed: ${bindingValidation.errors.join("; ")}`);
    }

    // Extract key bindings
    const phoneBinding = bindingValidation.resolvedBindings.find(b => b.resource_type === 'WHATSAPP_LINE' || b.logical_key === 'sender_line');
    const propertyBinding = bindingValidation.resolvedBindings.find(b => b.resource_type === 'PROPERTY' || b.logical_key === 'property_id');
    const crmBinding = bindingValidation.resolvedBindings.find(b => b.resource_type === 'CRM_PIPELINE' || b.logical_key === 'crm_pipeline');

    // 5. Clone and adapt graph with tenant-specific bindings
    const rawNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
    const rawTransitions = Array.isArray(graphData.transitions) ? graphData.transitions : [];
    const rawVariables = graphData.variables || {};

    const clonedNodes = rawNodes.map(n => {
      const nodeCopy = JSON.parse(JSON.stringify(n));
      nodeCopy.config = nodeCopy.config || {};

      // Inject bound property
      if (propertyBinding && (!nodeCopy.config.property_id || nodeCopy.config.property_id === 1)) {
        nodeCopy.config.property_id = Number(propertyBinding.target_resource_id);
      }

      // Inject bound CRM pipeline
      if (crmBinding && (!nodeCopy.config.pipeline_id || nodeCopy.config.pipeline_id === 'b2b-sales-pipeline')) {
        nodeCopy.config.pipeline_id = crmBinding.target_resource_id;
      }

      return nodeCopy;
    });

    const flowUuid = crypto.randomUUID();
    const finalFlowName = customFlowName || `${template.title} (${configValidation.cleanConfig['business.name'] || 'Custom'})`;

    // 6. Transactional Database Writes
    // Create flow record
    const insertFlowResult = db.prepare(`
      INSERT INTO conversation_flows (
        uuid, tenant_id, property_id, phone_number_id, name, description,
        category, trigger_type, trigger_keywords_json, status, approval_required,
        approval_state, is_default, installed_from_template_id, installed_from_version_id,
        priority, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'KEYWORD_MATCH', ?, 'DRAFT', 0, 'NOT_REQUIRED', 0, ?, ?, 10, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      flowUuid,
      tenantId,
      propertyBinding ? Number(propertyBinding.target_resource_id) : 1,
      phoneBinding ? phoneBinding.target_resource_id : null,
      finalFlowName,
      template.description || '',
      template.category || 'HOSPITALITY_ENQUIRY',
      JSON.stringify(["hi", "hello", "hey", "enquiry", "book", "rates", "pricing"]),
      template.id,
      version.id,
      userId,
      userId
    );
    const newFlowId = insertFlowResult.lastInsertRowid;

    // Create flow version record
    const insertVersionResult = db.prepare(`
      INSERT INTO conversation_flow_versions (
        flow_id, version_number, status, nodes_json, transitions_json,
        variables_json, validation_report_json, changelog, created_at
      ) VALUES (?, 1, 'DRAFT', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      newFlowId,
      JSON.stringify(clonedNodes),
      JSON.stringify(rawTransitions),
      JSON.stringify(rawVariables),
      JSON.stringify({ valid: true, installed_at: new Date().toISOString() }),
      `Installed from template ${template.template_key} v${version.version_number}`
    );
    const newVersionId = insertVersionResult.lastInsertRowid;

    // Link current_draft_version_id
    db.prepare(`
      UPDATE conversation_flows 
      SET current_draft_version_id = ? 
      WHERE id = ?
    `).run(newVersionId, newFlowId);

    // 7. Create template_installations record
    const installationStatus = activateImmediately ? 'ACTIVE' : (configValidation.isValid ? 'CONFIGURED' : 'DRAFT');
    const installation = templateRepository.createInstallation({
      tenant_id: tenantId,
      template_id: template.id,
      installed_version_id: version.id,
      installed_version_number: version.version_number,
      flow_id: newFlowId,
      status: installationStatus,
      config_values_json: configValidation.cleanConfig,
      custom_flow_name: finalFlowName,
      installation_notes: `Installed via Universal Flow Template Library`,
      created_by: userId,
      updated_by: userId
    });

    // 8. Persist bindings
    const savedBindings = templateRepository.saveBindings(
      installation.id,
      tenantId,
      bindingValidation.resolvedBindings,
      userId
    );

    // 9. If activateImmediately, publish flow and set trigger
    if (activateImmediately) {
      this.validateAndActivateInstallation(installation.id, tenantId, userId);
    }

    return {
      success: true,
      installation: templateRepository.findInstallationById(installation.id, tenantId),
      flow: db.prepare("SELECT * FROM conversation_flows WHERE id = ?").get(newFlowId),
      bindings: savedBindings
    };
  }

  /**
   * Validate and Activate (Publish) an installed template workflow
   */
  validateAndActivateInstallation(installationId, tenantId, userId = 'system') {
    const installation = templateRepository.findInstallationById(installationId, tenantId);
    if (!installation) {
      throw new Error("Installation not found.");
    }

    const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(installation.flow_id, tenantId);
    if (!flow) {
      throw new Error("Associated conversation flow not found.");
    }

    const version = db.prepare(`
      SELECT * FROM conversation_flow_versions 
      WHERE flow_id = ? AND version_number = 1
      ORDER BY id DESC LIMIT 1
    `).get(flow.id);
    if (!version) {
      throw new Error("Flow draft version not found.");
    }

    // 1. Re-validate config schema
    const configValidation = templateConfigValidator.validate(installation.config_schema, installation.config_values);
    if (!configValidation.isValid) {
      throw new Error(`Cannot activate: Missing required configuration: ${configValidation.errors.join(", ")}`);
    }

    // 2. Re-validate required bindings
    const currentBindings = templateRepository.getBindings(installationId, tenantId);
    const bindingValidation = templateBindingService.validateBindings(installation.required_bindings, currentBindings, tenantId);
    if (!bindingValidation.isValid) {
      throw new Error(`Cannot activate: Incomplete resource bindings: ${bindingValidation.errors.join(", ")}`);
    }

    // 3. Mark version PUBLISHED
    db.prepare(`
      UPDATE conversation_flow_versions 
      SET status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, published_by = ?
      WHERE id = ?
    `).run(userId, version.id);

    // 4. Mark flow PUBLISHED
    db.prepare(`
      UPDATE conversation_flows 
      SET status = 'PUBLISHED', published_version_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(version.id, userId, flow.id);

    // 5. Register active workflow trigger for incoming messages
    const phoneBinding = currentBindings.find(b => b.resource_type === 'WHATSAPP_LINE' || b.logical_key === 'sender_line');
    const phoneId = phoneBinding?.target_resource_id || flow.phone_number_id || null;

    try {
      const triggerKey = `trg_${tenantId}_flow_${flow.id}_default`;
      const matchConfigJson = JSON.stringify({
        nodeId: "node_start",
        nodeType: "START",
        keywords: ["hi", "hello", "hey", "start", "enquiry", "book", "help"],
        matchType: "CONTAINS",
        ignoreCase: true,
        priority: 50
      });

      db.prepare(`
        INSERT INTO workflow_triggers (
          tenant_id, phone_number_id, flow_id, trigger_key, trigger_type,
          match_config_json, priority, active_status, delete_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'KEYWORD', ?, 50, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          phone_number_id = VALUES(phone_number_id),
          match_config_json = VALUES(match_config_json),
          active_status = 1,
          delete_status = 0,
          updated_at = CURRENT_TIMESTAMP
      `).run(tenantId, phoneId, String(flow.id), triggerKey, matchConfigJson);
    } catch (_) {}

    // 6. Update installation status to ACTIVE
    const updatedInstallation = templateRepository.updateInstallation(installationId, tenantId, {
      status: 'ACTIVE',
      updated_by: userId
    });

    return {
      success: true,
      installation: updatedInstallation,
      flow: db.prepare("SELECT * FROM conversation_flows WHERE id = ?").get(flow.id)
    };
  }
}

module.exports = new TemplateInstallService();

