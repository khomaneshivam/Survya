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

  // Live Mode: Upsert via canonical crmPipelineService
  let recordId = null;
  let resolvedStage = stageKey;
  try {
    const crmPipelineService = require('../../crmPipelineService');
    const savedRecord = crmPipelineService.upsertRecord(tenantId, {
      pipeline: pipelineNameOrSlug,
      contactPhone: phone,
      contactName: name,
      contactEmail: email,
      stageKey,
      leadScore,
      dealValue,
      tags,
      customAttributes: customAttrs,
      sourceFlowId: context.flowId || null
    });
    recordId = savedRecord?.id || null;
    resolvedStage = savedRecord?.stage_key || stageKey;
  } catch (err) {
    console.warn('[CRM Executor] Error upserting record:', err.message);
  }

  return {
    action: 'CONTINUE',
    nextHandle: 'success',
    updatedData: {
      'crm.record_id': recordId || 1,
      'crm.stage': resolvedStage,
      'crm.lead_score': leadScore
    },
    traceNote: `CRM Record #${recordId || 1} upserted for ${phone} in stage "${resolvedStage}"`
  };
}

module.exports = { execute };
