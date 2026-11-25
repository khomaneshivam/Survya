/**
 * Safe, zero-eval Expression & Template Engine for SARVYA Workflow Execution
 * Provides safe dot-path variable resolution, template interpolation, deterministic
 * condition rule evaluation (ALL/ANY with 13 operators), and variable mutations.
 */

const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function hasOwnSafe(obj, key) {
  if (!obj || typeof obj !== 'object' || BLOCKED_PATH_SEGMENTS.has(key)) return false;
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Safely resolves a dot-separated path from context.
 * Falls back to checking sub-namespaces (session, contact, crm, catalog, trigger)
 * so {{name}} and {{contact.name}} both resolve gracefully.
 */
function getPath(context, path) {
  if (!context || typeof context !== 'object' || !path || typeof path !== 'string') {
    return undefined;
  }

  const cleanPath = path.trim();
  if (!cleanPath || BLOCKED_PATH_SEGMENTS.has(cleanPath)) return undefined;

  // Direct dot traversal (own properties only; blocks prototype-chain lookups)
  const parts = cleanPath.split('.');
  if (parts.some(p => BLOCKED_PATH_SEGMENTS.has(p))) return undefined;

  let curr = context;
  let found = true;

  for (const part of parts) {
    if (!hasOwnSafe(curr, part)) {
      found = false;
      break;
    }
    curr = curr[part];
  }

  if (found && curr !== undefined) {
    return curr;
  }

  // Direct flat key match on context (e.g. context['business.name'])
  if (hasOwnSafe(context, cleanPath) && context[cleanPath] !== undefined) {
    return context[cleanPath];
  }

  // Dynamic template configuration resolution (e.g. {{config.business.name}} or flat config['business.name'])
  if (context.config && typeof context.config === 'object') {
    if (cleanPath.startsWith('config.')) {
      const sub = cleanPath.slice(7);
      if (hasOwnSafe(context.config, sub) && context.config[sub] !== undefined) {
        return context.config[sub];
      }
      const subParts = sub.split('.');
      let ptr = context.config;
      let ok = !subParts.some(p => BLOCKED_PATH_SEGMENTS.has(p));
      if (ok) {
        for (const p of subParts) {
          if (!hasOwnSafe(ptr, p)) {
            ok = false;
            break;
          }
          ptr = ptr[p];
        }
      }
      if (ok && ptr !== undefined) {
        return ptr;
      }
    } else if (hasOwnSafe(context.config, cleanPath) && context.config[cleanPath] !== undefined) {
      return context.config[cleanPath];
    }
  }

  // Fallback checks inside standard SARVYA namespaces if top-level lookup missed
  const namespaces = ['session', 'contact', 'crm', 'catalog', 'trigger', 'api', 'config'];
  for (const ns of namespaces) {
    if (context[ns] && typeof context[ns] === 'object') {
      if (hasOwnSafe(context[ns], cleanPath) && context[ns][cleanPath] !== undefined) {
        return context[ns][cleanPath];
      }
    }
  }

  return undefined;
}

/**
 * Interpolates {{variable}} or {{dot.path}} placeholders within a template string.
 * Preserves empty string if variable is undefined/null.
 */
function interpolateTemplate(templateStr, context = {}) {
  if (!templateStr || typeof templateStr !== 'string') return '';
  return templateStr.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path) => {
    const val = getPath(context, path);
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

/**
 * Deterministic condition rule evaluator.
 * Evaluates an array of rules against a context object using ALL (AND) or ANY (OR).
 */
function evaluateRules(rules = [], matchMode = 'ALL', context = {}) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return true; // Empty rule list defaults to true
  }

  const isAny = String(matchMode).toUpperCase() === 'ANY';

  for (const rule of rules) {
    const { variable, operator, value } = rule;
    const actualVal = getPath(context, variable);
    const expectedVal = typeof value === 'string' ? interpolateTemplate(value, context) : value;

    const passes = evaluateSingleRule(actualVal, operator, expectedVal);

    if (isAny && passes) {
      return true;
    }
    if (!isAny && !passes) {
      return false;
    }
  }

  return !isAny;
}

/**
 * Evaluates a single comparison rule with automatic numeric coercion where appropriate.
 */
function evaluateSingleRule(actual, op, expected) {
  const normOp = String(op || 'eq').toLowerCase().trim();

  // Special existence operators
  if (normOp === 'is_empty') {
    if (actual === null || actual === undefined) return true;
    if (typeof actual === 'string') return actual.trim().length === 0;
    if (Array.isArray(actual)) return actual.length === 0;
    if (typeof actual === 'object') return Object.keys(actual).length === 0;
    return false;
  }
  if (normOp === 'is_not_empty') {
    return !evaluateSingleRule(actual, 'is_empty', expected);
  }

  // Coerce actual/expected to numbers if both represent valid numeric values
  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  const bothNumeric = !isNaN(actualNum) && !isNaN(expectedNum) && actual !== '' && expected !== '' && actual !== null && expected !== null;

  switch (normOp) {
    case 'eq':
    case '==':
    case 'equal':
    case 'equals':
      if (bothNumeric) return actualNum === expectedNum;
      return String(actual ?? '').toLowerCase().trim() === String(expected ?? '').toLowerCase().trim();

    case 'neq':
    case '!=':
    case 'not_equal':
    case 'not_equals':
      if (bothNumeric) return actualNum !== expectedNum;
      return String(actual ?? '').toLowerCase().trim() !== String(expected ?? '').toLowerCase().trim();

    case 'gt':
    case '>':
    case 'greater_than':
      return bothNumeric && actualNum > expectedNum;

    case 'gte':
    case '>=':
    case 'greater_than_or_equal':
    case 'greater_than_or_equals':
      return bothNumeric && actualNum >= expectedNum;

    case 'lt':
    case '<':
    case 'less_than':
      return bothNumeric && actualNum < expectedNum;

    case 'lte':
    case '<=':
    case 'less_than_or_equal':
    case 'less_than_or_equals':
      return bothNumeric && actualNum <= expectedNum;

    case 'contains': {
      if (Array.isArray(actual)) {
        return actual.some(item => String(item).toLowerCase() === String(expected).toLowerCase());
      }
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    }

    case 'not_contains': {
      return !evaluateSingleRule(actual, 'contains', expected);
    }

    case 'in': {
      const list = Array.isArray(expected)
        ? expected
        : String(expected ?? '').split(',').map(s => s.trim().toLowerCase());
      return list.includes(String(actual ?? '').trim().toLowerCase());
    }

    case 'not_in': {
      return !evaluateSingleRule(actual, 'in', expected);
    }

    case 'regex': {
      try {
        const regex = new RegExp(String(expected), 'i');
        return regex.test(String(actual ?? ''));
      } catch (e) {
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Computes variable mutation based on operation.
 * Supports both (op, currentVal, value) and (currentVal, op, value).
 */
function computeVariable(arg1, arg2, arg3, context = {}) {
  let op, currentVal, value;
  const knownOps = ['set', 'increment', 'add', 'decrement', 'subtract', 'append_tag', 'concat', 'clear'];
  if (typeof arg1 === 'string' && knownOps.includes(arg1.toLowerCase().trim())) {
    op = arg1;
    currentVal = arg2;
    value = arg3;
  } else {
    currentVal = arg1;
    op = arg2;
    value = arg3;
  }

  const normOp = String(op || 'set').toLowerCase().trim();
  const resolvedVal = typeof value === 'string' ? interpolateTemplate(value, context) : value;

  switch (normOp) {
    case 'set':
      // If resolvedVal looks like a pure integer/number, cast it
      if (typeof resolvedVal === 'string' && /^-?\d+(\.\d+)?$/.test(resolvedVal.trim())) {
        return Number(resolvedVal.trim());
      }
      return resolvedVal;

    case 'increment':
    case 'add': {
      const cur = Number(currentVal) || 0;
      const add = Number(resolvedVal) || 0;
      return cur + add;
    }

    case 'decrement':
    case 'subtract': {
      const cur = Number(currentVal) || 0;
      const sub = Number(resolvedVal) || 0;
      return cur - sub;
    }

    case 'append_tag': {
      let tags = [];
      if (Array.isArray(currentVal)) {
        tags = [...currentVal];
      } else if (typeof currentVal === 'string' && currentVal.trim()) {
        tags = currentVal.split(',').map(s => s.trim());
      }
      const newTags = String(resolvedVal).split(',').map(s => s.trim()).filter(Boolean);
      for (const t of newTags) {
        if (!tags.includes(t)) tags.push(t);
      }
      return tags;
    }

    case 'concat': {
      return `${String(currentVal ?? '')}${String(resolvedVal ?? '')}`;
    }

    case 'clear':
      return null;

    default:
      return resolvedVal;
  }
}

module.exports = {
  getPath,
  interpolateTemplate,
  evaluateRules,
  evaluateSingleRule,
  computeVariable
};
