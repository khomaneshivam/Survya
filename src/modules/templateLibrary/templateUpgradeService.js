/**
 * Template Controlled Upgrade Engine
 * Enables controlled, non-breaking version upgrades across client installations
 * while strictly preserving tenant configurations, custom bindings, and session integrity.
 */

const { db } = require("../../config/database");
const templateRepository = require("./templateRepository");

function parseGraphJson(rawGraph) {
  try {
    const parsed = typeof rawGraph === "string" ? JSON.parse(rawGraph) : (rawGraph || {});
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
      transitions: Array.isArray(parsed.transitions) ? parsed.transitions : [],
      variables: (parsed.variables && typeof parsed.variables === "object") ? parsed.variables : {}
    };
  } catch (_) {
    return { nodes: [], transitions: [], variables: {} };
  }
}

function stableComparableNode(node) {
  if (!node || typeof node !== "object") return {};
  const cfg = { ...(node.config || {}) };
  delete cfg.property_id;
  delete cfg.pipeline_id;
  return {
    type: node.type || "",
    title: node.title || "",
    config: cfg,
    data: node.data || null
  };
}

function transitionKey(t) {
  return `${t.source || t.from || ""}->${t.target || t.to || ""}#${t.sourceHandle || "default"}`;
}

class TemplateUpgradeService {
  /**
   * Detect tenant Level-B graph overrides (modified template nodes & tenant-added custom nodes/edges)
   * relative to the template version originally installed.
   */
  analyzeUpgradeDiff(installation, flow, targetVersion) {
    const installedVer = templateRepository.findVersion(installation.template_id, installation.installed_version_number);
    const activeVersionId = flow?.current_draft_version_id || flow?.published_version_id || null;
    const currentFlowVer = activeVersionId
      ? db.prepare("SELECT * FROM conversation_flow_versions WHERE id = ? AND flow_id = ?").get(activeVersionId, flow.id)
      : null;

    const baseGraph = parseGraphJson(installedVer?.graph_json);
    const targetGraph = parseGraphJson(targetVersion?.graph_json);
    const currentGraph = currentFlowVer
      ? {
          nodes: JSON.parse(currentFlowVer.nodes_json || "[]"),
          transitions: JSON.parse(currentFlowVer.transitions_json || "[]"),
          variables: JSON.parse(currentFlowVer.variables_json || "{}")
        }
      : { nodes: baseGraph.nodes, transitions: baseGraph.transitions, variables: baseGraph.variables };

    const baseNodeMap = new Map(baseGraph.nodes.map((n) => [n.id, n]));
    const targetNodeMap = new Map(targetGraph.nodes.map((n) => [n.id, n]));
    const baseTransitionKeys = new Set(baseGraph.transitions.map(transitionKey));

    const modifiedBaseNodes = new Map();
    const customAddedNodes = [];
    const conflicts = [];

    for (const currNode of currentGraph.nodes) {
      const baseNode = baseNodeMap.get(currNode.id);
      if (!baseNode) {
        customAddedNodes.push(JSON.parse(JSON.stringify(currNode)));
        continue;
      }
      if (JSON.stringify(stableComparableNode(currNode)) !== JSON.stringify(stableComparableNode(baseNode))) {
        modifiedBaseNodes.set(currNode.id, { baseNode, currentNode: JSON.parse(JSON.stringify(currNode)) });
        const targetNode = targetNodeMap.get(currNode.id);
        if (targetNode && JSON.stringify(stableComparableNode(targetNode)) !== JSON.stringify(stableComparableNode(baseNode))) {
          conflicts.push({
            nodeId: currNode.id,
            reason: "Both tenant customization and template release modified this node; preserved tenant customization."
          });
        }
      }
    }

    const customAddedTransitions = currentGraph.transitions
      .filter((t) => !baseTransitionKeys.has(transitionKey(t)))
      .map((t) => JSON.parse(JSON.stringify(t)));

    const addedTemplateNodes = targetGraph.nodes.filter((n) => !baseNodeMap.has(n.id)).map((n) => n.id);
    const updatedTemplateNodes = targetGraph.nodes
      .filter((n) => {
        const b = baseNodeMap.get(n.id);
        return b && JSON.stringify(stableComparableNode(n)) !== JSON.stringify(stableComparableNode(b));
      })
      .map((n) => n.id);

    return {
      modifiedBaseNodes,
      customAddedNodes,
      customAddedTransitions,
      conflicts,
      summary: {
        addedTemplateNodes,
        updatedTemplateNodes,
        preservedCustomNodes: customAddedNodes.length,
        preservedCustomEdits: modifiedBaseNodes.size,
        preservedCustomTransitions: customAddedTransitions.length,
        conflictsCount: conflicts.length,
        conflicts
      }
    };
  }

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

    let diffPreview = null;
    if (upgradeAvailable) {
      const targetVersion = templateRepository.findVersion(template.id, latestVer);
      const flow = db.prepare("SELECT * FROM conversation_flows WHERE id = ? AND tenant_id = ?").get(installation.flow_id, tenantId);
      if (targetVersion && flow) {
        diffPreview = this.analyzeUpgradeDiff(installation, flow, targetVersion).summary;
      }
    }

    return {
      upgradeAvailable,
      currentVersion: currentVer,
      latestVersion: latestVer,
      newerVersionsCount: newerVersions.length,
      availableVersions: newerVersions,
      diffPreview
    };
  }

  /**
   * Execute controlled upgrade of an installed flow to a newer template version
   */
  upgradeInstallation(installationId, tenantId, userId = 'system', targetVersionNumber = null, options = {}) {
    const { preserveCustomizations = true } = options || {};
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

    const graphData = parseGraphJson(targetVersion.graph_json);
    const diffAnalysis = preserveCustomizations
      ? this.analyzeUpgradeDiff(installation, flow, targetVersion)
      : { modifiedBaseNodes: new Map(), customAddedNodes: [], customAddedTransitions: [], conflicts: [], summary: { preservedCustomNodes: 0, preservedCustomEdits: 0, preservedCustomTransitions: 0, conflictsCount: 0, conflicts: [] } };

    // Fetch existing tenant bindings to re-inject into the upgraded graph
    const currentBindings = templateRepository.getBindings(installationId, tenantId);
    const propertyBinding = currentBindings.find(b => b.resource_type === 'PROPERTY' || b.logical_key === 'property_id');
    const crmBinding = currentBindings.find(b => b.resource_type === 'CRM_PIPELINE' || b.logical_key === 'crm_pipeline');

    const upgradedNodes = (Array.isArray(graphData.nodes) ? graphData.nodes : []).map(n => {
      const copy = JSON.parse(JSON.stringify(n));
      copy.config = copy.config || {};

      // Merge tenant Level-B overrides for keys that differ from installed base version
      const modEntry = diffAnalysis.modifiedBaseNodes.get(copy.id);
      if (modEntry) {
        const { baseNode, currentNode } = modEntry;
        if (currentNode.title !== baseNode.title) copy.title = currentNode.title;
        if (JSON.stringify(currentNode.data || null) !== JSON.stringify(baseNode.data || null)) {
          copy.data = JSON.parse(JSON.stringify(currentNode.data));
        }
        const baseCfg = baseNode.config || {};
        const currCfg = currentNode.config || {};
        for (const [k, v] of Object.entries(currCfg)) {
          if (JSON.stringify(v) !== JSON.stringify(baseCfg[k])) {
            copy.config[k] = JSON.parse(JSON.stringify(v));
          }
        }
      }

      if (propertyBinding && (!copy.config.property_id || copy.config.property_id === 1)) {
        copy.config.property_id = Number(propertyBinding.target_resource_id);
      }
      if (crmBinding && (!copy.config.pipeline_id || copy.config.pipeline_id === 'b2b-sales-pipeline')) {
        copy.config.pipeline_id = crmBinding.target_resource_id;
      }
      return copy;
    });

    // Append tenant Level-B custom added nodes and splice/preserve their transitions
    const nodeIds = new Set(upgradedNodes.map((n) => n.id));
    const customNodeIds = new Set(diffAnalysis.customAddedNodes.map((n) => n.id));
    for (const customNode of diffAnalysis.customAddedNodes) {
      if (!nodeIds.has(customNode.id)) {
        upgradedNodes.push(customNode);
        nodeIds.add(customNode.id);
      }
    }

    const upgradedTransitions = (graphData.transitions || []).map((t) => ({ ...t }));
    const existingEdgeKeys = new Set(upgradedTransitions.map(transitionKey));
    const collidingTplTargets = new Map();

    // Detect edges entering a custom chain where the template also defined an outgoing edge on (source, handle)
    for (const customEdge of diffAnalysis.customAddedTransitions) {
      const src = customEdge.source || customEdge.from;
      const tgt = customEdge.target || customEdge.to;
      const handle = customEdge.sourceHandle || "default";
      if (!customNodeIds.has(src) && customNodeIds.has(tgt)) {
        const collisionIdx = upgradedTransitions.findIndex(
          (t) => (t.source || t.from) === src && (t.sourceHandle || "default") === handle
        );
        if (collisionIdx >= 0) {
          const tplEdge = upgradedTransitions[collisionIdx];
          collidingTplTargets.set(tgt, tplEdge.target || tplEdge.to);
          upgradedTransitions[collisionIdx] = { ...customEdge };
          existingEdgeKeys.add(transitionKey(customEdge));
        }
      }
    }

    for (const customEdge of diffAnalysis.customAddedTransitions) {
      const src = customEdge.source || customEdge.from;
      const tgt = customEdge.target || customEdge.to;
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) continue;
      // If a single custom node previously terminated into a template node replaced by upstream additions, bridge it to the new upstream continuation
      const bridgedTarget = (customNodeIds.has(src) && !customNodeIds.has(tgt) && collidingTplTargets.has(src))
        ? collidingTplTargets.get(src)
        : tgt;
      const normalizedEdge = bridgedTarget !== tgt
        ? { ...customEdge, target: bridgedTarget, ...(customEdge.to ? { to: bridgedTarget } : {}) }
        : customEdge;
      const key = transitionKey(normalizedEdge);
      if (!existingEdgeKeys.has(key)) {
        upgradedTransitions.push(normalizedEdge);
        existingEdgeKeys.add(key);
      }
    }

    // Determine next version number in conversation_flow_versions for this flow
    const maxVerRow = db.prepare("SELECT MAX(version_number) as max_ver FROM conversation_flow_versions WHERE flow_id = ?").get(flow.id);
    const nextVerNum = (maxVerRow?.max_ver || 1) + 1;

    const isCurrentlyPublished = flow.status === 'PUBLISHED';
    const newVersionStatus = isCurrentlyPublished ? 'PUBLISHED' : 'DRAFT';
    const nowUtcStr = new Date().toISOString().slice(0, 19).replace("T", " ");

    const insertVersionResult = db.prepare(`
      INSERT INTO conversation_flow_versions (
        flow_id, version_number, status, nodes_json, transitions_json,
        variables_json, validation_report_json, changelog, published_at, published_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    `).run(
      flow.id,
      nextVerNum,
      newVersionStatus,
      JSON.stringify(upgradedNodes),
      JSON.stringify(upgradedTransitions),
      JSON.stringify(graphData.variables || {}),
      JSON.stringify({ valid: true, upgraded_at: new Date().toISOString(), upgradeSummary: diffAnalysis.summary }),
      `Upgraded to template ${template.template_key} v${targetVersion.version_number}`,
      isCurrentlyPublished ? nowUtcStr : null,
      isCurrentlyPublished ? userId : null
    );
    const newVersionId = insertVersionResult.lastInsertRowid;

    // Update conversation_flows
    if (isCurrentlyPublished) {
      db.prepare(`
        UPDATE conversation_flows 
        SET published_version_id = ?, installed_from_version_id = ?, updated_by = ?, updated_at = UTC_TIMESTAMP() 
        WHERE id = ?
      `).run(newVersionId, targetVersion.id, userId, flow.id);
    } else {
      db.prepare(`
        UPDATE conversation_flows 
        SET current_draft_version_id = ?, installed_from_version_id = ?, updated_by = ?, updated_at = UTC_TIMESTAMP() 
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

    try {
      const runtimeCache = require("../../services/workflow/runtimeCache");
      runtimeCache.invalidateFlow(flow.id);
    } catch (_) {}

    return {
      success: true,
      installationId,
      installedVersion: targetVersion.version_number,
      flowVersionNumber: nextVerNum,
      status: isCurrentlyPublished ? 'ACTIVE' : 'CONFIGURED',
      upgradeSummary: diffAnalysis.summary
    };
  }
}

module.exports = new TemplateUpgradeService();

