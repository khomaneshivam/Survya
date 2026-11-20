const { db } = require('../../../config/database');
const { interpolateTemplate, getPath } = require('../expressionEvaluator');

/**
 * 9. Dynamic CRM Lead / Deal Upsert Executor (CRM_UPSERT)
 */
async function execute(node, context) {
  const { session = {}, dryRun = false, tenantId = 1, senderPhone = '', variableContext } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const evalContext = variableContext || session;

  const phone = senderPhone || getPath(evalContext, 'contact.phone') || getPath(evalContext, 'phone') || '919876543210';
  const name = getPath(evalContext, 'contact.name') || getPath(evalContext, 'name') || getPath(evalContext, 'guest_name') || getPath(evalContext, 'customer_name') || 'Guest';
  const email = getPath(evalContext, 'contact.email') || getPath(evalContext, 'email') || null;
  const stageKey = config.stage || config.stageName || config.stageKey || 'NEW_LEAD';
  const pipelineNameOrSlug = config.pipeline || config.pipelineName || config.pipelineId || 'b2b-sales-pipeline';
  const leadScore = Number(getPath(evalContext, 'lead_score') || config.leadScore || 0);
  const dealValue = Number(getPath(evalContext, 'deal_value') || getPath(evalContext, 'quote_total') || config.dealValue || 0);

  // Compile custom attributes
  const customAttrs = {};
  if (config.customFields && typeof config.customFields === 'object') {
    for (const [k, v] of Object.entries(config.customFields)) {
      customAttrs[k] = typeof v === 'string' ? interpolateTemplate(v, evalContext) : v;
    }
  }

  // Merge any session keys that match known CRM pipeline fields or collected input
  const commonFields = [
    'company_name', 'team_size', 'team_seats', 'monthly_budget', 'decision_maker',
    'demo_slot', 'city', 'service_interest', 'timeline', 'ad_source', 'check_in_date',
    'check_out_date', 'guest_count', 'booking_date', 'selected_item', 'customer_name'
  ];
  for (const f of commonFields) {
    const val = getPath(evalContext, f);
    if (val !== undefined && customAttrs[f] === undefined) {
      customAttrs[f] = val;
    }
  }

  // Also include all scalar session keys
  for (const [k, v] of Object.entries(evalContext)) {
    if (!k.startsWith('_') && typeof v !== 'object' && v !== undefined && v !== null && customAttrs[k] === undefined) {
      customAttrs[k] = v;
    }
  }

  const tags = Array.isArray(config.tags) ? config.tags : ['flow_intake'];

  if (dryRun) {
    return {
      action: 'CONTINUE',
      nextHandle: 'success',
      updatedData: {
        'crm.record_id': 'SIM-REC-1',
        'crm.stage': stageKey,
        'crm.lead_score': leadScore
      },
      traceNote: `[Simulated] CRM Record upserted for ${phone} in stage "${stageKey}" (Score: ${leadScore}, Value: ₹${dealValue})`
    };
  }

  // Live Mode: Resolve pipeline ID
  let pipelineId = 1;
  try {
    const pipelineNameOrSlug = config.pipeline || 'b2b-sales-pipeline';
    const pipeline = db.prepare(`
      SELECT id FROM crm_pipelines
      WHERE tenant_id = ? AND delete_status = 0 AND (slug = ? OR name = ? OR industry_type = ?)
      ORDER BY id ASC LIMIT 1
    `).get(tenantId, pipelineNameOrSlug, pipelineNameOrSlug, pipelineNameOrSlug);

    if (pipeline) {
      pipelineId = pipeline.id;
    }
  } catch (e) {}

  // Check if existing record exists for this contact in this pipeline
  let recordId = null;
  try {
    const existing = db.prepare(`
      SELECT id, tags_json, custom_attributes FROM crm_records
      WHERE tenant_id = ? AND pipeline_id = ? AND contact_phone = ? AND delete_status = 0
      LIMIT 1
    `).get(tenantId, pipelineId, phone);

    const customAttrsJson = JSON.stringify(customAttrs);
    const tagsJson = JSON.stringify(tags);

    if (existing) {
      recordId = existing.id;
      db.prepare(`
        UPDATE crm_records
        SET contact_name = COALESCE(?, contact_name),
            contact_email = COALESCE(?, contact_email),
            stage_key = ?,
            lead_score = GREATEST(lead_score, ?),
            deal_value = CASE WHEN ? > 0 THEN ? ELSE deal_value END,
            tags_json = ?,
            custom_attributes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(name, email, stageKey, leadScore, dealValue, dealValue, tagsJson, customAttrsJson, recordId);
    } else {
      const ins = db.prepare(`
        INSERT INTO crm_records (
          tenant_id, pipeline_id, contact_phone, contact_name, contact_email,
          stage_key, lead_score, deal_value, tags_json, custom_attributes,
          source_flow_id, active_status, delete_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(tenantId, pipelineId, phone, name, email, stageKey, leadScore, dealValue, tagsJson, customAttrsJson, context.flowId || null);

      recordId = ins.lastInsertRowid;
    }
  } catch (err) {
    console.warn('[CRM Executor] Error upserting record:', err.message);
  }

  return {
    action: 'CONTINUE',
    nextHandle: 'success',
    updatedData: {
      'crm.record_id': recordId || 1,
      'crm.stage': stageKey,
      'crm.lead_score': leadScore
    },
    traceNote: `CRM Record #${recordId || 1} upserted for ${phone} in stage "${stageKey}"`
  };
}

module.exports = { execute };
