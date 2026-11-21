const { evaluateRules, evaluateSingleRule, getPath } = require('../expressionEvaluator');

/**
 * 6. Condition & Branching Node Executor (CONDITION)
 */
async function execute(node, context) {
  const { session = {}, variableContext } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const evalContext = variableContext || session;

  const rules = Array.isArray(config.rules) ? config.rules : [];
  const hasTargetNodeIds = rules.some(r => r.targetNodeId);

  // If rules specify explicit targetNodeIds (graph branch routing)
  if (hasTargetNodeIds || config.defaultTargetNodeId) {
    for (const rule of rules) {
      const varName = rule.variable || config.variable;
      const actualVal = varName ? getPath(evalContext, varName) : undefined;
      if (rule.targetNodeId && evaluateSingleRule(actualVal, rule.operator || 'equals', rule.value)) {
        return {
          action: 'CONTINUE',
          targetNodeId: rule.targetNodeId,
          nextHandle: rule.targetNodeId,
          traceNote: `Condition matched rule: ${varName} ${rule.operator || 'equals'} ${rule.value} -> ${rule.targetNodeId}`
        };
      }
    }
    if (config.defaultTargetNodeId) {
      return {
        action: 'CONTINUE',
        targetNodeId: config.defaultTargetNodeId,
        nextHandle: config.defaultTargetNodeId,
        traceNote: `Condition using default target -> ${config.defaultTargetNodeId}`
      };
    }
  }

  // Standard boolean handle evaluation (true/false edges)
  const matchMode = config.matchMode || config.conditionMatch || 'ALL';
  let passes = false;

  if (rules.length > 0) {
    passes = evaluateRules(rules, matchMode, evalContext);
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
