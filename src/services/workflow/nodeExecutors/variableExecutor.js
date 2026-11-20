const { computeVariable, getPath } = require('../expressionEvaluator');

/**
 * 7. Set Variable / Lead Score Node Executor (SET_VARIABLE)
 */
async function execute(node, context) {
  const { session = {}, variableContext } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const targetVar = config.targetVar || config.variable || 'temp_var';
  const operation = config.operation || config.action || 'set';
  const rawValue = config.value !== undefined ? config.value : '';

  const evalContext = variableContext || session;
  const currentVal = getPath(evalContext, targetVar);
  const newVal = computeVariable(operation, currentVal, rawValue, evalContext);

  return {
    action: 'CONTINUE',
    nextHandle: 'default',
    updatedData: {
      [targetVar]: newVal
    },
    traceNote: `Variable "${targetVar}" [${operation}] updated: ${JSON.stringify(currentVal)} -> ${JSON.stringify(newVal)}`
  };
}

module.exports = { execute };
