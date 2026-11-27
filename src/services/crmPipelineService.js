const { db } = require('../config/database');

/**
 * Dynamic CRM Pipeline & Record Service
 * Provides multi-industry CRM pipelines, custom stages, dynamic schemas, and contact record tracking.
 */

function ensureDefaultPipelines(tenantId = 1) {
  const count = db.prepare('SELECT COUNT(*) as count FROM crm_pipelines WHERE tenant_id = ? AND delete_status = 0').get(tenantId)?.count || 0;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO crm_pipelines (
      tenant_id, name, slug, industry_type, stages_json, custom_fields_schema, active_status, delete_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  insert.run(
    tenantId,
    'B2B Sales Pipeline',
    'b2b-sales-pipeline',
    'B2B_SALES',
    JSON.stringify([
      { key: 'NEW_LEAD', label: 'New Lead', color: '#3B82F6', order: 1 },
      { key: 'MQL', label: 'Marketing Qualified (MQL)', color: '#8B5CF6', order: 2 },
      { key: 'SQL', label: 'Sales Qualified (SQL)', color: '#6366F1', order: 3 },
      { key: 'DEMO_BOOKED', label: 'Demo Booked', color: '#F59E0B', order: 4 },
      { key: 'PROPOSAL_SENT', label: 'Proposal Sent', color: '#EC4899', order: 5 },
      { key: 'WON', label: 'Closed Won', color: '#10B981', order: 6 },
      { key: 'LOST', label: 'Closed Lost', color: '#EF4444', order: 7 }
    ]),
    JSON.stringify([
      { key: 'company_name', label: 'Company Name', type: 'TEXT', required: true },
      { key: 'team_size', label: 'Team Size', type: 'TEXT' },
      { key: 'monthly_budget', label: 'Monthly Budget (₹)', type: 'NUMBER' },
      { key: 'decision_maker', label: 'Decision Maker', type: 'TEXT' },
      { key: 'demo_slot', label: 'Demo Slot', type: 'DATETIME' }
    ])
  );

  insert.run(
    tenantId,
    'Lead Generation Pipeline',
    'lead-generation-pipeline',
    'LEAD_GEN',
    JSON.stringify([
      { key: 'NEW', label: 'New Prospect', color: '#3B82F6', order: 1 },
      { key: 'ENGAGED', label: 'Engaged in Chat', color: '#06B6D4', order: 2 },
      { key: 'QUALIFIED', label: 'Qualified Lead', color: '#10B981', order: 3 },
      { key: 'NURTURING', label: 'Nurturing Drip', color: '#8B5CF6', order: 4 },
      { key: 'CONVERTED', label: 'Converted Customer', color: '#059669', order: 5 },
      { key: 'UNQUALIFIED', label: 'Unqualified / Disqualified', color: '#6B7280', order: 6 }
    ]),
    JSON.stringify([
      { key: 'city', label: 'City', type: 'TEXT' },
      { key: 'service_interest', label: 'Service Interest', type: 'TEXT' },
      { key: 'timeline', label: 'Timeline', type: 'TEXT' },
      { key: 'ad_source', label: 'Ad / Campaign Source', type: 'TEXT' },
      { key: 'lead_notes', label: 'Lead Notes', type: 'TEXTAREA' }
    ])
  );

  insert.run(
    tenantId,
    'Universal Booking Pipeline',
    'universal-booking-pipeline',
    'BOOKING',
    JSON.stringify([
      { key: 'INQUIRY', label: 'Booking Inquiry', color: '#3B82F6', order: 1 },
      { key: 'AVAILABILITY_CHECKED', label: 'Availability Checked', color: '#06B6D4', order: 2 },
      { key: 'QUOTED', label: 'Quotation Sent', color: '#F59E0B', order: 3 },
      { key: 'PAYMENT_PENDING', label: 'Payment Pending', color: '#EC4899', order: 4 },
      { key: 'CONFIRMED', label: 'Booking Confirmed', color: '#10B981', order: 5 },
      { key: 'COMPLETED', label: 'Stay/Service Completed', color: '#059669', order: 6 },
      { key: 'CANCELLED', label: 'Cancelled', color: '#EF4444', order: 7 }
    ]),
    JSON.stringify([
      { key: 'entity_id', label: 'Property / Business Entity ID', type: 'NUMBER' },
      { key: 'catalog_item_id', label: 'Room / Service Item ID', type: 'NUMBER' },
      { key: 'booking_date', label: 'Check-in / Booking Date', type: 'DATE' },
      { key: 'checkout_date', label: 'Check-out Date', type: 'DATE' },
      { key: 'guest_or_slot_count', label: 'Guests / Slots', type: 'NUMBER' },
      { key: 'quote_total', label: 'Estimated Quote Total', type: 'NUMBER' }
    ])
  );
}

function parsePipeline(p) {
  if (!p) return null;
  return {
    ...p,
    industry: p.industry_type,
    industryType: p.industry_type,
    stages: JSON.parse(p.stages_json || '[]'),
    customFieldsSchema: JSON.parse(p.custom_fields_schema || '[]')
  };
}

function normalizeStageKeyForPipeline(rawStageKey, stages = []) {
  const key = String(rawStageKey || '').trim().toUpperCase();
  if (!Array.isArray(stages) || stages.length === 0) return key || 'NEW';
  const exact = stages.find(s => String(s.key || s.id || '').toUpperCase() === key);
  if (exact) return String(exact.key || exact.id);
  const byLabel = stages.find(s => String(s.label || s.name || '').toUpperCase() === key);
  if (byLabel) return String(byLabel.key || byLabel.id);
  // Canonical alias fallback for automated writers (NEW / NEW_LEAD / PROSPECT / INQUIRY -> first stage)
  const aliasGroups = [
    ['NEW', 'NEW_LEAD', 'PROSPECT', 'INQUIRY', 'LEAD'],
    ['QUALIFIED', 'MQL', 'SQL', 'AVAILABILITY_CHECKED'],
    ['QUOTED', 'PROPOSAL_SENT', 'PAYMENT_PENDING'],
    ['WON', 'CLOSED_WON', 'CONFIRMED', 'CONVERTED'],
    ['LOST', 'CLOSED_LOST', 'CANCELLED', 'UNQUALIFIED']
  ];
  for (const grp of aliasGroups) {
    if (grp.includes(key)) {
      const match = stages.find(s => grp.includes(String(s.key || s.id || '').toUpperCase()));
      if (match) return String(match.key || match.id);
    }
  }
  return rawStageKey || String(stages[0]?.key || stages[0]?.id || 'NEW');
}

function parseRecord(r, stages = null) {
  if (!r) return null;
  const tags = JSON.parse(r.tags_json || '[]');
  const customAttrs = JSON.parse(r.custom_attributes || '{}');
  let parsedStages = Array.isArray(stages) ? stages : [];
  if (!parsedStages.length && r.pipeline_stages_json) {
    try { parsedStages = JSON.parse(r.pipeline_stages_json || '[]'); } catch (_) {}
  }
  const matchedStage = parsedStages.find(
    s => String(s.key || s.id || '').toUpperCase() === String(r.stage_key || '').toUpperCase()
  );
  const stageLabel = matchedStage ? (matchedStage.label || matchedStage.name || r.stage_key) : r.stage_key;
  const upperStage = String(r.stage_key || '').toUpperCase();
  return {
    ...r,
    title: r.contact_name || `Deal #${r.id}`,
    stage_id: r.stage_key,
    stage_key: r.stage_key,
    stage_name: stageLabel,
    stage_label: stageLabel,
    status: (upperStage === 'WON' || upperStage === 'CLOSED_WON' || upperStage === 'CONFIRMED' || upperStage === 'CONVERTED' || upperStage === 'COMPLETED')
      ? 'WON'
      : (upperStage === 'LOST' || upperStage === 'CLOSED_LOST' || upperStage === 'CANCELLED' || upperStage === 'UNQUALIFIED')
        ? 'LOST'
        : 'ACTIVE',
    tags,
    customAttributes: customAttrs,
    custom_fields: customAttrs
  };
}

/**
 * List all pipelines for a tenant
 */
function listPipelines(tenantId = 1) {
  ensureDefaultPipelines(tenantId);
  const rows = db.prepare(`
    SELECT * FROM crm_pipelines
    WHERE tenant_id = ? AND delete_status = 0
    ORDER BY id ASC
  `).all(tenantId);

  return rows.map(parsePipeline);
}

/**
 * Get pipeline by ID
 */
function getPipelineById(pipelineId, tenantId = 1) {
  const row = db.prepare(`
    SELECT * FROM crm_pipelines
    WHERE id = ? AND tenant_id = ? AND delete_status = 0
  `).get(pipelineId, tenantId);

  return parsePipeline(row);
}

/**
 * Create a new CRM pipeline
 */
function createPipeline({
  tenantId = 1,
  name,
  slug,
  industryType = 'CUSTOM',
  stages = [],
  customFieldsSchema = [],
  userId = null
}) {
  if (!name || !name.trim()) throw new Error('Pipeline name is required.');
  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const res = db.prepare(`
    INSERT INTO crm_pipelines (
      tenant_id, name, slug, industry_type, stages_json, custom_fields_schema,
      active_status, delete_status, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    tenantId,
    name.trim(),
    finalSlug,
    industryType,
    JSON.stringify(stages),
    JSON.stringify(customFieldsSchema),
    userId,
    userId
  );

  return getPipelineById(res.lastInsertRowid, tenantId);
}

/**
 * Update pipeline
 */
function updatePipeline(pipelineId, updates, tenantId = 1) {
  const current = getPipelineById(pipelineId, tenantId);
  if (!current) throw new Error('Pipeline not found.');

  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const stagesJson = updates.stages !== undefined ? JSON.stringify(updates.stages) : current.stages_json;
  const schemaJson = updates.customFieldsSchema !== undefined ? JSON.stringify(updates.customFieldsSchema) : current.custom_fields_schema;

  db.prepare(`
    UPDATE crm_pipelines
    SET name = ?, stages_json = ?, custom_fields_schema = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(name, stagesJson, schemaJson, updates.userId || null, pipelineId, tenantId);

  return getPipelineById(pipelineId, tenantId);
}

/**
 * List records in a pipeline with optional stage and search filtering
 */
function listRecords({
  tenantId = 1,
  pipelineId = null,
  stage = null,
  search = '',
  limit = 100,
  offset = 0
}) {
  let query = `
    SELECT r.*, p.name as pipeline_name, p.stages_json as pipeline_stages_json
    FROM crm_records r
    JOIN crm_pipelines p ON p.id = r.pipeline_id
    WHERE r.tenant_id = ? AND r.delete_status = 0
  `;
  const params = [tenantId];

  if (pipelineId) {
    query += ' AND r.pipeline_id = ?';
    params.push(pipelineId);
  }

  if (stage && stage !== 'ALL') {
    query += ' AND r.stage_key = ?';
    params.push(stage);
  }

  if (search && search.trim()) {
    query += ' AND (r.contact_phone LIKE ? OR r.contact_name LIKE ? OR r.contact_email LIKE ?)';
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY r.updated_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);

  // Stage summary counts for Kanban
  let stageCounts = [];
  if (pipelineId) {
    stageCounts = db.prepare(`
      SELECT stage_key, COUNT(*) as count, SUM(deal_value) as total_value
      FROM crm_records
      WHERE tenant_id = ? AND pipeline_id = ? AND delete_status = 0
      GROUP BY stage_key
    `).all(tenantId, pipelineId);
  }

  return {
    records: rows.map(parseRecord),
    stageCounts
  };
}

/**
 * Get record by ID
 */
function getRecordById(recordId, tenantId = 1) {
  const row = db.prepare(`
    SELECT r.*, p.name as pipeline_name, p.stages_json as pipeline_stages_json
    FROM crm_records r
    JOIN crm_pipelines p ON p.id = r.pipeline_id
    WHERE r.id = ? AND r.tenant_id = ? AND r.delete_status = 0
  `).get(recordId, tenantId);

  return parseRecord(row);
}

/**
 * Create CRM record
 */
function createRecord(payload = {}) {
  const tenantId = payload.tenantId || payload.tenant_id || 1;
  const pipelineId = payload.pipelineId || payload.pipeline_id;
  const contactPhone = payload.contactPhone || payload.contact_phone || payload.phone;
  const contactName = payload.contactName || payload.contact_name || payload.title || payload.name || '';
  const contactEmail = payload.contactEmail || payload.contact_email || payload.email || null;
  const pipeline = pipelineId ? getPipelineById(pipelineId, tenantId) : null;
  const rawStageKey = payload.stageKey || payload.stage_key || payload.stage_id || payload.stageId || payload.stage || 'NEW_LEAD';
  const stageKey = normalizeStageKeyForPipeline(rawStageKey, pipeline?.stages || []);
  const leadScore = payload.leadScore !== undefined ? payload.leadScore : (payload.lead_score !== undefined ? payload.lead_score : 0);
  const dealValue = payload.dealValue !== undefined ? payload.dealValue : (payload.deal_value !== undefined ? payload.deal_value : 0);
  const tags = payload.tags || payload.tags_json || [];
  const customAttributes = payload.customAttributes || payload.custom_attributes || payload.custom_fields || payload.customFields || {};
  const sourceFlowId = payload.sourceFlowId || payload.source_flow_id || null;
  const sourceSessionId = payload.sourceSessionId || payload.source_session_id || null;
  const assignedUserId = payload.assignedUserId || payload.assigned_user_id || null;
  const userId = payload.userId || payload.user_id || null;

  if (!pipelineId) throw new Error('pipelineId is required.');
  if (!contactPhone) throw new Error('contactPhone is required.');

  const res = db.prepare(`
    INSERT INTO crm_records (
      tenant_id, pipeline_id, contact_phone, contact_name, contact_email,
      stage_key, lead_score, deal_value, tags_json, custom_attributes,
      source_flow_id, source_session_id, assigned_user_id,
      active_status, delete_status, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    tenantId,
    pipelineId,
    String(contactPhone).replace(/\D/g, ''),
    contactName,
    contactEmail,
    stageKey,
    Number(leadScore) || 0,
    Number(dealValue) || 0,
    JSON.stringify(tags),
    JSON.stringify(customAttributes),
    sourceFlowId,
    sourceSessionId,
    assignedUserId,
    userId,
    userId
  );

  return getRecordById(res.lastInsertRowid, tenantId);
}

/**
 * Update CRM record (stage, owner, lead score, deal value, tags, custom attributes)
 */
function updateRecord(recordId, fields = {}, tenantId = 1) {
  const current = getRecordById(recordId, tenantId);
  if (!current) throw new Error('Record not found.');

  const pipeline = current.pipeline_id ? getPipelineById(current.pipeline_id, tenantId) : null;
  const rawStage = fields.stageKey || fields.stage_key || fields.stage_id || fields.stageId || fields.stage || current.stage_key;
  const stageKey = normalizeStageKeyForPipeline(rawStage, pipeline?.stages || []);
  const leadScore = (fields.leadScore !== undefined ? fields.leadScore : fields.lead_score) !== undefined ? Number(fields.leadScore !== undefined ? fields.leadScore : fields.lead_score) : current.lead_score;
  const dealValue = (fields.dealValue !== undefined ? fields.dealValue : fields.deal_value) !== undefined ? Number(fields.dealValue !== undefined ? fields.dealValue : fields.deal_value) : current.deal_value;
  const contactName = fields.contactName || fields.contact_name || fields.title || current.contact_name;
  const contactEmail = fields.contactEmail || fields.contact_email || current.contact_email;
  const assignedUserId = fields.assignedUserId || fields.assigned_user_id || current.assigned_user_id;

  const tags = fields.tags !== undefined ? fields.tags : (fields.tags_json !== undefined ? fields.tags_json : current.tags);
  const customAttrs = fields.customAttributes !== undefined || fields.custom_fields !== undefined
    ? { ...current.customAttributes, ...(fields.customAttributes || fields.custom_fields) }
    : current.customAttributes;

  db.prepare(`
    UPDATE crm_records
    SET stage_key = ?, lead_score = ?, deal_value = ?, contact_name = ?, contact_email = ?,
        assigned_user_id = ?, tags_json = ?, custom_attributes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    stageKey,
    leadScore,
    dealValue,
    contactName,
    contactEmail,
    assignedUserId,
    JSON.stringify(tags),
    JSON.stringify(customAttrs),
    fields.userId || null,
    recordId,
    tenantId
  );

  return getRecordById(recordId, tenantId);
}

/**
 * Soft delete CRM record
 */
function deleteRecord(recordId, tenantId = 1) {
  db.prepare(`
    UPDATE crm_records
    SET delete_status = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(recordId, tenantId);

  return { success: true };
}

/**
 * Canonical tenant-safe CRM lead/deal upsert for fulfillments, flows, and webhooks.
 */
function upsertRecord(tenantId = 1, payload = {}) {
  const numericTenantId = Number(tenantId || payload.tenantId || 1);
  ensureDefaultPipelines(numericTenantId);

  const phoneDigits = String(payload.contactPhone || payload.contact_phone || payload.phone || '').replace(/\D/g, '');
  if (!phoneDigits) throw new Error('contactPhone is required for CRM upsert.');

  let pipelineId = payload.pipelineId || payload.pipeline_id || null;
  if (!pipelineId) {
    const pipelineHint = payload.pipeline || payload.pipelineName || payload.pipelineSlug || payload.industryType || null;
    if (pipelineHint) {
      const matched = db.prepare(`
        SELECT id FROM crm_pipelines
        WHERE tenant_id = ? AND delete_status = 0 AND (slug = ? OR name = ? OR industry_type = ?)
        ORDER BY id ASC LIMIT 1
      `).get(numericTenantId, pipelineHint, pipelineHint, pipelineHint);
      if (matched) pipelineId = matched.id;
    }
    if (!pipelineId) {
      const def = db.prepare(`
        SELECT id FROM crm_pipelines
        WHERE tenant_id = ? AND active_status = 1 AND delete_status = 0
        ORDER BY id ASC LIMIT 1
      `).get(numericTenantId);
      pipelineId = def?.id || null;
    }
  }
  if (!pipelineId) throw new Error(`No CRM pipeline found for tenant #${numericTenantId}`);

  if (payload.crmRecordId) {
    const existingById = getRecordById(payload.crmRecordId, numericTenantId);
    if (existingById) {
      return updateRecord(existingById.id, { ...payload, tenantId: numericTenantId }, numericTenantId);
    }
  }

  const existing = db.prepare(`
    SELECT id FROM crm_records
    WHERE tenant_id = ? AND pipeline_id = ? AND contact_phone = ? AND delete_status = 0
    ORDER BY id DESC LIMIT 1
  `).get(numericTenantId, pipelineId, phoneDigits);

  if (existing) {
    return updateRecord(existing.id, { ...payload, tenantId: numericTenantId }, numericTenantId);
  }

  return createRecord({
    ...payload,
    tenantId: numericTenantId,
    pipelineId,
    contactPhone: phoneDigits
  });
}

module.exports = {
  ensureDefaultPipelines,
  listPipelines,
  getPipelineById,
  createPipeline,
  updatePipeline,
  listRecords,
  getRecordById,
  createRecord,
  updateRecord,
  upsertRecord,
  deleteRecord
};
