/**
 * Template Controller
 * Express request handlers for Template Catalog and Client Installations.
 * Enforces authenticated tenant boundary on all operations.
 */

const templateCatalogService = require("./templateCatalogService");
const templateInstallService = require("./templateInstallService");
const templateUpgradeService = require("./templateUpgradeService");
const templateRepository = require("./templateRepository");
const templateConfigValidator = require("./templateConfigValidator");
const templateBindingService = require("./templateBindingService");

class TemplateController {
  /**
   * GET /api/v1/template-library
   * List templates visible to tenant
   */
  async listCatalog(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const { industry, category, search, limit, offset } = req.query;
      const templates = templateCatalogService.listCatalog(tenantId, {
        industry,
        category,
        search,
        limit,
        offset
      });
      res.json({ success: true, count: templates.length, templates });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/template-library/admin/all
   * Platform admin template monitoring
   */
  async listAllForAdmin(req, res) {
    try {
      const templates = templateCatalogService.listAllForAdmin();
      res.json({ success: true, count: templates.length, templates });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/template-library/:id
   * Get template details, configuration schema, and tenant resources
   */
  async getTemplate(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const details = templateCatalogService.getTemplateDetails(req.params.id, tenantId);
      if (!details) {
        return res.status(404).json({ success: false, error: "Template not found" });
      }
      res.json({ success: true, ...details });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-library
   * Create a new template (Private or System)
   */
  async createTemplate(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const template = templateCatalogService.createTemplate(tenantId, userId, req.body);
      res.status(201).json({ success: true, template });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-library/:id/versions
   * Release a new immutable version
   */
  async createVersion(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const version = templateCatalogService.createReleaseVersion(req.params.id, tenantId, userId, req.body);
      res.status(201).json({ success: true, version });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-library/:id/install
   * Install template into authenticated tenant
   */
  async installTemplate(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const { customFlowName, configValues, bindings, activateImmediately } = req.body;

      const result = templateInstallService.installTemplate({
        templateIdOrKey: req.params.id,
        tenantId,
        userId,
        customFlowName,
        configValues,
        bindings,
        activateImmediately: Boolean(activateImmediately)
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/template-installations
   * List installations for tenant
   */
  async listInstallations(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const installations = templateRepository.listInstallations(tenantId);
      res.json({ success: true, count: installations.length, installations });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/template-installations/:id
   * Get specific installation details and bindings
   */
  async getInstallation(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const installation = templateRepository.findInstallationById(req.params.id, tenantId);
      if (!installation) {
        return res.status(404).json({ success: false, error: "Installation not found" });
      }
      const bindings = templateRepository.getBindings(installation.id, tenantId);
      const tenantResources = templateBindingService.getAvailableTenantResources(tenantId);
      const upgradeStatus = templateUpgradeService.checkUpgradeAvailability(installation.id, tenantId);

      res.json({
        success: true,
        installation,
        bindings,
        tenantResources,
        upgradeStatus
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /api/v1/template-installations/:id/config
   * Update configuration values and/or bindings
   */
  async updateConfig(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const installation = templateRepository.findInstallationById(req.params.id, tenantId);
      if (!installation) {
        return res.status(404).json({ success: false, error: "Installation not found" });
      }

      const { configValues, bindings, customFlowName } = req.body;
      const updates = { updated_by: userId };

      if (customFlowName !== undefined) {
        updates.custom_flow_name = customFlowName;
      }

      if (configValues !== undefined) {
        const merged = { ...installation.config_values, ...configValues };
        const validation = templateConfigValidator.validate(installation.config_schema, merged);
        updates.config_values_json = validation.cleanConfig;
      }

      if (Array.isArray(bindings)) {
        templateRepository.saveBindings(installation.id, tenantId, bindings, userId);
      }

      const updated = templateRepository.updateInstallation(installation.id, tenantId, updates);
      res.json({
        success: true,
        installation: updated,
        bindings: templateRepository.getBindings(installation.id, tenantId)
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-installations/:id/validate
   * Validate configuration, bindings, and flow graph connectivity
   */
  async validateInstallation(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const installation = templateRepository.findInstallationById(req.params.id, tenantId);
      if (!installation) {
        return res.status(404).json({ success: false, error: "Installation not found" });
      }

      const configValidation = templateConfigValidator.validate(installation.config_schema, installation.config_values);
      const bindings = templateRepository.getBindings(installation.id, tenantId);
      const bindingValidation = templateBindingService.validateBindings(installation.required_bindings, bindings, tenantId);

      const isValid = configValidation.isValid && bindingValidation.isValid;
      const errors = [...configValidation.errors, ...bindingValidation.errors];

      res.json({
        success: true,
        isValid,
        errors,
        configErrors: configValidation.errors,
        bindingErrors: bindingValidation.errors
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-installations/:id/activate
   * 1-Click Validate & Publish flow into active execution
   */
  async activateInstallation(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const result = templateInstallService.validateAndActivateInstallation(req.params.id, tenantId, userId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /api/v1/template-installations/:id/upgrade
   * Check upgrade availability
   */
  async checkUpgrade(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const result = templateUpgradeService.checkUpgradeAvailability(req.params.id, tenantId);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * POST /api/v1/template-installations/:id/upgrade
   * Execute controlled version upgrade
   */
  async upgradeInstallation(req, res) {
    try {
      const tenantId = req.user?.tenantId || 1;
      const userId = req.user?.id || 'system';
      const { targetVersionNumber } = req.body;
      const result = templateUpgradeService.upgradeInstallation(req.params.id, tenantId, userId, targetVersionNumber);
      res.json(result);
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
}

module.exports = new TemplateController();

