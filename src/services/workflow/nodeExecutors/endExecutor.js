const { interpolateTemplate } = require('../expressionEvaluator');

/**
 * 13. End Flow Node Executor (END)
 */
async function execute(node, context) {
  const { session = {}, variableContext } = context;
  const config = node.config || {};
  const evalContext = variableContext || session;

  const farewellMsg = config.farewellMessage
    ? interpolateTemplate(config.farewellMessage, evalContext)
    : '';

  return {
    action: 'COMPLETE',
    nextHandle: null, // Terminal node
    replyMessages: farewellMsg ? [farewellMsg] : [],
    traceNote: `Conversation workflow ended cleanly [Node: ${node.id}]`
  };
}

module.exports = { execute };
