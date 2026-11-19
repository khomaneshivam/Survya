const crmService = require('../services/crmPipelineService');

async function listPipelines(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const pipelines = crmService.listPipelines(tenantId);
    return res.json({ success: true, pipelines, data: pipelines });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getPipeline(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const pipeline = crmService.getPipelineById(req.params.id, tenantId);
    if (!pipeline) return res.status(404).json({ success: false, error: 'Pipeline not found.' });
    return res.json({ success: true, pipeline, data: pipeline });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createPipeline(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const pipeline = crmService.createPipeline({
      ...req.body,
      tenantId,
      userId: req.user?.id
    });
    return res.status(201).json({ success: true, pipeline, data: pipeline });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updatePipeline(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const pipeline = crmService.updatePipeline(req.params.id, {
      ...req.body,
      userId: req.user?.id
    }, tenantId);
    return res.json({ success: true, pipeline, data: pipeline });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function listRecords(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { pipeline_id, pipelineId, stage, search, limit, offset } = req.query;
    const targetPipelineId = pipeline_id || pipelineId;
    const result = crmService.listRecords({
      tenantId,
      pipelineId: targetPipelineId ? Number(targetPipelineId) : null,
      stage: stage || null,
      search: search || '',
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0
    });
    return res.json({ success: true, ...result, data: result.records });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getRecord(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const record = crmService.getRecordById(req.params.id, tenantId);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found.' });
    return res.json({ success: true, record, data: record });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createRecord(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const record = crmService.createRecord({
      ...req.body,
      tenantId,
      userId: req.user?.id
    });
    return res.status(201).json({ success: true, record, data: record });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateRecord(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const record = crmService.updateRecord(req.params.id, {
      ...req.body,
      userId: req.user?.id
    }, tenantId);
    return res.json({ success: true, record, data: record });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateStage(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { stage_id, stage_name, status } = req.body;
    const record = crmService.updateRecord(req.params.id, {
      stageId: stage_id,
      stageName: stage_name,
      status: status,
      userId: req.user?.id
    }, tenantId);
    return res.json({ success: true, record, data: record });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteRecord(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    crmService.deleteRecord(req.params.id, tenantId);
    return res.json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  listPipelines,
  getPipeline,
  createPipeline,
  updatePipeline,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  updateStage,
  deleteRecord
};
