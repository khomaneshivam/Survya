const { evaluateRules, evaluateSingleRule, getPath } = require('../expressionEvaluator');

/**
 * 6. Condition & Branching Node Executor (CONDITION)
 */
async function execute(node, context) {
  const { session = {}, variableContext } = context;
  const config = node.config || {};
  const evalContext = variableContext || session;

  const rules = Array.isArray(config.rules) ? config.rules : [];
  let passes = false;

  if (rules.length > 0) {
    passes = evaluateRules(rules, config.matchMode || 'ALL', evalContext);
  } else if (config.variable) {
    // Legacy single rule fallback
    const val = getPath(evalContext, config.variable);
    passes = evaluateSingleRule(val, config.operator || 'eq', config.value);
  } else {
    passes = true;
  }

  const handle = passes ? 'true' : 'false';
  return {
    action: 'CONTINUE',
    nextHandle: handle,
    traceNote: `Condition evaluated to ${passes ? 'TRUE ✅' : 'FALSE ❌'} [Routing handle: ${handle}]`
  };
}

module.exports = { execute };
