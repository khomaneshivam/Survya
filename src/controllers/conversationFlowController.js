/**
 * Conversation Flow Controller
 * Handles HTTP requests for the Conversation Flow & Automation Studio
 */

const flowService = require("../services/conversationFlowService");
const flowEngine = require("../services/conversationFlowEngine");

async function listFlows(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { propertyId, status, category, search, page, limit } = req.query;
    const data = flowService.listFlows(tenantId, { propertyId, status, category, search, page, limit });
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getFlowById(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const flowId = req.params.id;
    const data = flowService.getFlowById(flowId, tenantId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
}

async function createFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const result = flowService.createFlow({ ...req.body, tenant_id: tenantId }, user);
    return res.status(201).json({
      success: true,
      flow: result.flow,
      draftVersion: result.draftVersion,
      publishedVersion: result.publishedVersion
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const data = flowService.updateFlow(flowId, req.body, user, tenantId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function saveFlowDraft(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const data = flowService.saveFlowDraft(flowId, req.body, user, tenantId);
    return res.json({ success: true, message: "Flow draft saved successfully", ...data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function validateFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const flowId = req.params.id;
    const report = flowService.validateFlow(flowId, tenantId);
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function publishFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const data = flowService.publishFlow(flowId, user, tenantId);
    return res.json({ success: true, message: "Flow published successfully", ...data });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
      validationErrors: err.validationErrors || []
    });
  }
}

async function pauseFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const data = flowService.pauseFlow(flowId, user, tenantId);
    return res.json({ success: true, message: "Flow paused", ...data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function archiveFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const data = flowService.archiveFlow(flowId, user, tenantId);
    return res.json({ success: true, message: "Flow archived", ...data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function rollbackFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const { targetVersionNumber } = req.body;
    if (!targetVersionNumber) {
      return res.status(400).json({ success: false, error: "targetVersionNumber is required." });
    }
    const data = flowService.rollbackFlow(flowId, Number(targetVersionNumber), user, tenantId);
    return res.json({ success: true, message: `Rolled back to version ${targetVersionNumber}`, ...data });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function listVersions(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const flowId = req.params.id;
    const versions = flowService.listVersions(flowId, tenantId);
    return res.json({ success: true, versions });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
}

async function getFlowAnalytics(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const flowId = req.params.id;
    const analytics = flowService.getFlowAnalytics(flowId, tenantId);
    return res.json({ success: true, analytics });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
}

/**
 * In-memory test simulator endpoint (ZERO DISPATCH, ZERO CHARGE)
 */
async function simulateTurn(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const {
      senderPhone = "919876543210",
      userInput = "",
      userPayload = null,
      simulationState = null,
      flowOverride = null,
      propertyId = 1,
      fastForward = false
    } = req.body;

    const result = await flowEngine.processTurn({
      senderPhone,
      userInput,
      userPayload,
      context: {
        tenantId,
        propertyId,
        channel: "WHATSAPP",
        isSimulation: true,
        dryRun: true,
        simulationState,
        flowOverride,
        fastForward
      }
    });

    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function listTemplates(req, res) {
  try {
    const { industry, category } = req.query;
    const templates = flowService.listTemplates(industry, category);
    return res.json({ success: true, templates });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createTemplate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const template = flowService.createTemplate(req.body, user, tenantId);
    return res.status(201).json({ success: true, template });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function cloneTemplate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const { slug } = req.params;
    const result = flowService.createFlowFromTemplate(slug, req.body, user, tenantId);
    return res.status(201).json({
      success: true,
      flow: result.flow,
      draftVersion: result.draftVersion,
      publishedVersion: result.publishedVersion
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function listMessageTemplates(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { propertyId } = req.query;
    const templates = flowService.listMessageTemplates(tenantId, propertyId);
    return res.json({ success: true, templates });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function saveMessageTemplate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const tpl = flowService.saveMessageTemplate(req.body, user, tenantId);
    return res.json({ success: true, template: tpl });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteMessageTemplate(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { id } = req.params;
    const result = flowService.deleteMessageTemplate(id, tenantId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function duplicateFlow(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const user = req.user || { id: "admin", name: "Administrator" };
    const flowId = req.params.id;
    const result = flowService.duplicateFlow(flowId, req.body, user, tenantId);
    return res.status(201).json({
      success: true,
      message: "Flow duplicated successfully",
      flow: result.flow,
      draftVersion: result.draftVersion,
      publishedVersion: result.publishedVersion
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function listFlowExecutions(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const flowId = req.params.id || req.query.flowId;
    const { status, phone, page, limit } = req.query;
    const data = flowService.listFlowExecutions(flowId, { status, phone, page, limit }, tenantId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getExecutionDetails(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const sessionId = req.params.sessionId;
    const data = flowService.getExecutionDetails(sessionId, tenantId);
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(404).json({ success: false, error: err.message });
  }
}

module.exports = {
  listFlows,
  getFlowById,
  createFlow,
  updateFlow,
  duplicateFlow,
  saveFlowDraft,
  validateFlow,
  publishFlow,
  pauseFlow,
  archiveFlow,
  rollbackFlow,
  listVersions,
  getFlowAnalytics,
  listFlowExecutions,
  getExecutionDetails,
  simulateTurn,
  listTemplates,
  createTemplate,
  cloneTemplate,
  listMessageTemplates,
  saveMessageTemplate,
  deleteMessageTemplate
};
