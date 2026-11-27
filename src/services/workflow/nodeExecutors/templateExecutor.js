const { interpolateTemplate } = require('../expressionEvaluator');
const { db } = require('../../../config/database');
const metaRateService = require('../../billing/metaRateService');

/**
 * 3. Send Template Node Executor (SEND_TEMPLATE)
 */
async function execute(node, context) {
  const { session = {}, dryRun = false, tenantId = 1, senderPhone = '' } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const templateName = config.templateName || '';

  if (!templateName) {
    return {
      action: 'CONTINUE',
      nextHandle: 'delivered',
      traceNote: 'Warning: SEND_TEMPLATE step missing templateName, skipping dispatch.'
    };
  }

  // Look up approved template in database
  let tpl = null;
  try {
    tpl = db.prepare('SELECT * FROM templates WHERE (name = ? OR id = ?) LIMIT 1').get(templateName, templateName);
  } catch (e) {}

  const params = Array.isArray(config.parameters) ? config.parameters : [];
  const resolvedParams = params.map(p => {
    const rawVal = p.mapToVariable ? `{{${p.mapToVariable}}}` : (p.value || '');
    return interpolateTemplate(rawVal, context.variableContext || session);
  });

  const renderedBody = tpl?.body_text
    ? resolvedParams.reduce((acc, val, i) => acc.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val), tpl.body_text)
    : `[Template: ${templateName}] (Params: ${resolvedParams.join(', ')})`;

  if (dryRun) {
    return {
      action: 'CONTINUE',
      nextHandle: 'delivered',
      replyMessages: [renderedBody],
      traceNote: `[Simulated] Dispatched Meta template "${templateName}" with parameters: [${resolvedParams.join(', ')}]`
    };
  }

  // Live Mode: Dispatch via whatsappMessagingService & log
  try {
    const whatsappMessagingService = require('../../whatsappMessagingService');
    await whatsappMessagingService.sendOneToOneMessage({
      to: senderPhone,
      type: 'TEMPLATE',
      templateIdOrName: templateName,
      variables: resolvedParams,
      tenantId
    }).catch(err => {
      console.warn(`[templateExecutor] Note on sendOneToOneMessage:`, err.message);
    });
  } catch (e) {}

  try {
    const msgId = `flow_tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(`
      INSERT INTO whatsapp_messages (
        id, tenant_id, recipient_phone, direction, message_type, template_name,
        message_body, status, created_at, updated_at
      ) VALUES (?, ?, ?, 'OUTBOUND', 'TEMPLATE', ?, ?, 'SENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(msgId, tenantId, senderPhone, templateName, renderedBody);

    const isSandboxOrSim = Boolean(dryRun || context.isSimulation || context.transportSimulation);
    const unitRate = isSandboxOrSim ? 0 : metaRateService.calculateUnitRate('UTILITY', null, tenantId);
    db.prepare(`
      INSERT INTO whatsapp_usage_ledger (
        tenant_id, recipient_phone, category, unit_cost, currency, billing_status, created_at
      ) VALUES (?, ?, 'UTILITY', ?, 'INR', ?, CURRENT_TIMESTAMP)
    `).run(tenantId, senderPhone, unitRate, isSandboxOrSim ? 'WAIVED_SANDBOX' : 'BILLED');
  } catch (dbErr) {
    // Non-fatal logging
  }

  return {
    action: 'CONTINUE',
    nextHandle: 'delivered',
    replyMessages: [renderedBody],
    traceNote: `Dispatched Meta template "${templateName}" to ${senderPhone}`
  };
}

module.exports = { execute };
