/**
 * 1. Trigger Node Executor (TRIGGER_WHATSAPP, TRIGGER_EVENT, START)
 */
async function execute(node, context) {
  const { session = {}, userInput = '', userPayload = null } = context;
  const config = node.config || {};

  const triggerData = {
    keyword: userInput || '',
    source: config.eventType || (userPayload ? 'INTERACTIVE' : 'INBOUND_MESSAGE'),
    payload: userPayload || null,
    triggeredAt: new Date().toISOString()
  };

  return {
    action: 'CONTINUE',
    nextHandle: 'default',
    updatedData: {
      'trigger.keyword': triggerData.keyword,
      'trigger.source': triggerData.source,
      'trigger.payload': triggerData.payload
    },
    traceNote: `Trigger initialized [${node.type}] via ${triggerData.source}`
  };
}

module.exports = { execute };
