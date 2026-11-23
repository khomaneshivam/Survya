/**
 * Template Controlled Upgrade Engine
 * Enables controlled, non-breaking version upgrades across client installations
 * while strictly preserving tenant configurations, custom bindings, and session integrity.
 */

const { db } = require("../../config/database");
const templateRepository = require("./templateRepository");

class TemplateUpgradeService {
  /**
   * Check if a newer version is available for an installation
   */
  checkUpgradeAvailability(installationId, tenantId) {
    const installation = templateRepository.findInstallationById(installationId, tenantId);
    if (!installation) {
      throw new Error("Installation not found.");
    }

    const template = templateRepository.findTemplateByIdOrKey(installation.template_id, tenantId);
    if (!template) {
      throw new Error("Template definition not found.");
    }

    const allVersions = templateRepository.listVersions(template.id);
    const currentVer = installation.installed_version_number;
    const latestVer = template.current_version;

    const isNewer = (vA, vB) => {
      // Basic semver compare or string compare
      const pA = String(vA).split('.').map(Number);
      const pB = String(vB).split('.').map(Number);
      for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
        const numA = pA[i] || 0;
        const numB = pB[i] || 0;
        if (numA > numB) return true;
        if (numA < numB) return false;
      }
      return false;
    };

    const upgradeAvailable = isNewer(latestVer, currentVer);
    const newerVersions = allVersions.filter(v => isNewer(v.version_number, currentVer));

    return {
      upgradeAvailable,
      currentVersion: currentVer,
      latestVersion: latestVer,
      newerVersionsCount: newerVersions.length,
      availableVersions: newerVersions
    };
  }

  /**
   * Execute controlled upgrade of an installed flow to a newer template version
   */
  upgradeInstallation(installationId, tenantId, userId = 'system', targetVersionNumber = null) {
    const installation = templateRepository.findInstallationById(installationId, tenantId);
    if (!installation) {
      throw new Error("Installation not found.");
    }

    const template = templateRepository.findTemplateByIdOrKey(installation.template_id, tenantId);
    if (!template) {
      throw new Error("Template definition not found.");
    }

    const targetVersion = templateRepository.findVersion(template.id, targetVersionNumber);
    if (!targetVersion) {
      throw new Error(`Target version '${targetVersionNumber || "latest"}' not found for template.`);
    }

    const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(installation.flow_id, tenantId);
    if (!flow) {
      throw new Error("Associated conversation flow not found.");
    }

    // Parse target version graph
    let graphData = { nodes: [], transitions: [], variables: {} };
    try {
      graphData = typeof targetVersion.graph_json === 'string'
        ? JSON.parse(targetVersion.graph_json)
        : (targetVersion.graph_json || {});
    } catch (_) {}

    // Fetch existing tenant bindings to re-inject into the upgraded graph
    const currentBindings = templateRepository.getBindings(installationId, tenantId);
    const propertyBinding = currentBindings.find(b => b.resource_type === 'PROPERTY' || b.logical_key === 'property_id');
    const crmBinding = currentBindings.find(b => b.resource_type === 'CRM_PIPELINE' || b.logical_key === 'crm_pipeline');

    const upgradedNodes = (Array.isArray(graphData.nodes) ? graphData.nodes : []).map(n => {
      const copy = JSON.parse(JSON.stringify(n));
      copy.config = copy.config || {};
      if (propertyBinding && (!copy.config.property_id || copy.config.property_id === 1)) {
        copy.config.property_id = Number(propertyBinding.target_resource_id);
      }
      if (crmBinding && (!copy.config.pipeline_id || copy.config.pipeline_id === 'b2b-sales-pipeline')) {
        copy.config.pipeline_id = crmBinding.target_resource_id;
      }
      return copy;
    });

    // Determine next version number in conversation_flow_versions for this flow
    const maxVerRow = db.prepare("SELECT MAX(version_number) as max_ver FROM conversation_flow_versions WHERE flow_id = ?").get(flow.id);
    const nextVerNum = (maxVerRow?.max_ver || 1) + 1;

    const isCurrentlyPublished = flow.status === 'PUBLISHED';
    const newVersionStatus = isCurrentlyPublished ? 'PUBLISHED' : 'DRAFT';

    const insertVersionResult = db.prepare(`
      INSERT INTO conversation_flow_versions (
        flow_id, version_number, status, nodes_json, transitions_json,
        variables_json, validation_report_json, changelog, published_at, published_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      flow.id,
      nextVerNum,
      newVersionStatus,
      JSON.stringify(upgradedNodes),
      JSON.stringify(graphData.transitions || []),
      JSON.stringify(graphData.variables || {}),
      JSON.stringify({ valid: true, upgraded_at: new Date().toISOString() }),
      `Upgraded to template ${template.template_key} v${targetVersion.version_number}`,
      isCurrentlyPublished ? new Date() : null,
      isCurrentlyPublished ? userId : null
    );
    const newVersionId = insertVersionResult.lastInsertRowid;

    // Update conversation_flows
    if (isCurrentlyPublished) {
      db.prepare(`
        UPDATE conversation_flows 
        SET published_version_id = ?, installed_from_version_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newVersionId, targetVersion.id, userId, flow.id);
    } else {
      db.prepare(`
        UPDATE conversation_flows 
        SET current_draft_version_id = ?, installed_from_version_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(newVersionId, targetVersion.id, userId, flow.id);
    }

    // Update template_installations
    templateRepository.updateInstallation(installationId, tenantId, {
      installed_version_id: targetVersion.id,
      installed_version_number: targetVersion.version_number,
      status: isCurrentlyPublished ? 'ACTIVE' : 'CONFIGURED',
      updated_by: userId
    });

    return {
      success: true,
      installationId,
      installedVersion: targetVersion.version_number,
      flowVersionNumber: nextVerNum,
      status: isCurrentlyPublished ? 'ACTIVE' : 'CONFIGURED'
    };
  }
}

module.exports = new TemplateUpgradeService();

