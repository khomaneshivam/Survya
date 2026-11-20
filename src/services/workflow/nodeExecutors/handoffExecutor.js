const { interpolateTemplate } = require('../expressionEvaluator');

/**
 * 12. Human Staff Handoff Node Executor (HUMAN_HANDOFF, HANDOFF)
 */
async function execute(node, context) {
  const { session = {}, variableContext } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const evalContext = variableContext || session;

  const defaultMsg = '🔔 You are now connected with our human team. A specialist will assist you shortly.';
  const handoffMsgRaw = config.handoffMessage || config.prompt || config.text || defaultMsg;
  const renderedMsg = interpolateTemplate(handoffMsgRaw, evalContext);

  const team = config.team || config.department || 'FRONT_DESK';
  const assignedTo = config.assignedTo || 'Duty Agent';

  return {
    action: 'HANDOFF',
    nextHandle: null, // Terminal node
    replyMessages: renderedMsg ? [renderedMsg] : [],
    updatedData: {
      'handoff.team': team,
      'handoff.assigned_to': assignedTo,
      'handoff.timestamp': new Date().toISOString()
    },
    traceNote: `Transferred conversation to human team: "${team}" (${assignedTo}). Automated replies paused.`
  };
}

module.exports = { execute };
