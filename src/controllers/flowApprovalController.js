const approvalService = require("../services/flowApprovalService");

function tenantIdFor(req) {
  return Number(req.user?.tenant_id || 1);
}

function getFlowApprovals(req, res) {
  try {
    const data = approvalService.listApprovals(req.params.id, tenantIdFor(req));
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(404).json({ success: false, error: error.message });
  }
}

function requestFlowApproval(req, res) {
  try {
    const { stage, summary, checklist } = req.body || {};
    const approval = approvalService.requestApproval({
      flowId: req.params.id,
      stage,
      summary,
      checklist,
      user: req.user,
      tenantId: tenantIdFor(req)
    });
    return res.status(201).json({ success: true, approval });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

function decideFlowApproval(req, res) {
  try {
    const { stage, decision, note } = req.body || {};
    const data = approvalService.decideApproval({
      flowId: req.params.id,
      stage,
      decision,
      note,
      user: req.user,
      tenantId: tenantIdFor(req)
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
}

module.exports = {
  getFlowApprovals,
  requestFlowApproval,
  decideFlowApproval
};
