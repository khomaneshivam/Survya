/**
 * Validates a conversation flow graph deterministically on the client side.
 * Returns { isValid, errors, warnings, allIssues } with precise node IDs for interactive canvas navigation.
 */
export function validateFlowGraph(nodes = [], transitions = []) {
  const errors = [];
  const warnings = [];

  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeTransitions = Array.isArray(transitions) ? transitions : [];

  if (safeNodes.length === 0) {
    errors.push({
      nodeId: null,
      severity: 'error',
      message: 'Flow contains no steps. Drag a Trigger from the left palette to begin.'
    });
    return {
      isValid: false,
      errors,
      warnings,
      allIssues: errors
    };
  }

  const nodeMap = new Map();
  safeNodes.forEach((node) => {
    if (!node.id) {
      errors.push({
        nodeId: null,
        severity: 'error',
        message: 'All steps must have a unique identifier.'
      });
    } else if (nodeMap.has(node.id)) {
      errors.push({
        nodeId: node.id,
        severity: 'error',
        message: `Duplicate step ID detected: '${node.id}'.`
      });
    } else {
      nodeMap.set(node.id, node);
    }
  });

  // 1. Trigger / Start Step Check
  const triggerTypes = new Set(['START', 'TRIGGER_WHATSAPP', 'TRIGGER_EVENT']);
  const triggerNodes = safeNodes.filter((n) => triggerTypes.has(n.type));

  if (triggerNodes.length === 0) {
    errors.push({
      nodeId: null,
      severity: 'error',
      message: 'No trigger or start step present. Add a WhatsApp Trigger to begin.'
    });
  } else if (triggerNodes.length > 1) {
    warnings.push({
      nodeId: triggerNodes[1].id,
      severity: 'warning',
      message: `${triggerNodes.length} trigger steps detected. Only one primary trigger is recommended.`
    });
  }

  // 2. Transitions Validity Check
  const outgoingMap = new Map(); // sourceId -> array of transitions
  const incomingMap = new Map(); // targetId -> array of transitions
  safeNodes.forEach((n) => {
    outgoingMap.set(n.id, []);
    incomingMap.set(n.id, []);
  });

  safeTransitions.forEach((t, idx) => {
    if (!t.source || !nodeMap.has(t.source)) {
      errors.push({
        nodeId: t.source || null,
        severity: 'error',
        message: `Connection #${idx + 1} has an invalid or missing source step '${t.source}'.`
      });
    } else {
      outgoingMap.get(t.source).push(t);
    }

    if (!t.target || !nodeMap.has(t.target)) {
      errors.push({
        nodeId: t.target || null,
        severity: 'error',
        message: `Connection #${idx + 1} has an invalid or missing target step '${t.target}'.`
      });
    } else {
      incomingMap.get(t.target).push(t);
    }

    if (t.source && t.target && t.source === t.target) {
      errors.push({
        nodeId: t.source,
        severity: 'error',
        message: `Self-loop detected on '${nodeMap.get(t.source)?.title || t.source}': a step cannot connect directly to itself.`
      });
    }
  });

  // 3. Node Configuration & Required Fields Check
  safeNodes.forEach((node) => {
    const config = node.config || {};
    const type = node.type;

    // Send Message / Message / Button Menu
    if (type === 'SEND_MESSAGE' || type === 'MESSAGE' || type === 'BUTTON_MENU' || type === 'SELECTION') {
      const text = config.text || '';
      const options = config.options || [];
      const mediaUrl = config.mediaUrl || '';
      if (!text.trim() && options.length === 0 && !mediaUrl) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Message step '${node.title || node.id}' has empty content and no options.`
        });
      }

      const msgType = String(config.messageType || '').toUpperCase();
      const isButtonMode = msgType === 'BUTTONS' || (options.length > 0 && options.length <= 3 && msgType !== 'LIST');
      const isListMode = msgType === 'LIST' || options.length > 3;

      if (isButtonMode && options.length > 3) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Button menu on '${node.title || node.id}' has ${options.length} buttons (WhatsApp limit is 3). Use a list menu instead.`
        });
      }

      if (isListMode && options.length > 10) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `List menu on '${node.title || node.id}' has ${options.length} rows (WhatsApp limit is 10).`
        });
      }

      options.forEach((opt, oIdx) => {
        const titleStr = String(opt.title || opt.label || '').trim();
        if (isButtonMode && titleStr.length > 20) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Button #${oIdx + 1} "${titleStr}" on '${node.title || node.id}' exceeds WhatsApp 20-character limit (${titleStr.length} chars).`
          });
        }
        if (isListMode && titleStr.length > 24) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `List row #${oIdx + 1} "${titleStr}" on '${node.title || node.id}' exceeds WhatsApp 24-character limit (${titleStr.length} chars).`
          });
        }
      });
    }

    // Call Subflow
    if (type === 'CALL_SUBFLOW' || type === 'SUBFLOW') {
      const targetFlowId = config.targetFlowId || config.subflowId || config.flowId;
      if (!targetFlowId) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Sub-flow step '${node.title || node.id}' must specify a target sub-flow.`
        });
      }
    }

    // Send Template
    if (type === 'SEND_TEMPLATE') {
      if (!config.templateName || !String(config.templateName).trim()) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Template step '${node.title || node.id}' is missing Meta template name.`
        });
      }
    }

    // WhatsApp Flow Form
    if (type === 'SEND_WHATSAPP_FLOW') {
      if (!config.metaFlowId || !String(config.metaFlowId).trim()) {
        warnings.push({
          nodeId: node.id,
          severity: 'warning',
          message: `Meta Flow step '${node.title || node.id}' is missing Meta Flow ID.`
        });
      }
    }

    // Collect Input
    if (type === 'COLLECT_INPUT' || type === 'INPUT_COLLECTION' || type === 'QUESTION' || type === 'SCHEMA_INPUT') {
      const variableName = config.saveAs || config.variable;
      if (!variableName || !String(variableName).trim()) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Data Intake step '${node.title || node.id}' must specify a variable name to save input (e.g. check_in_date).`
        });
      }
      if (!config.prompt || !String(config.prompt).trim()) {
        warnings.push({
          nodeId: node.id,
          severity: 'warning',
          message: `Data Intake step '${node.title || node.id}' has an empty question prompt.`
        });
      }
    }

    // Configurable input fields are validated again by the backend on publish.
    if (type === 'SCHEMA_INPUT') {
      if (!/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(config.saveAs || '') ||
          String(config.saveAs || '').split('.').some(v => ['__proto__', 'constructor', 'prototype'].includes(v))) {
        errors.push({ nodeId: node.id, severity: 'error', message: 'Choose a safe variable name.' });
      }
      if (!String(config.prompt || '').trim() || String(config.prompt).length > 1024) {
        errors.push({ nodeId: node.id, severity: 'error', message: 'Question text must be between 1 and 1024 characters.' });
      }
      if (!['TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'DATE'].includes(String(config.inputType || '').toUpperCase())) {
        errors.push({ nodeId: node.id, severity: 'error', message: 'Answer type is not supported.' });
      }
      if (!Number.isInteger(Number(config.maxRetries)) || Number(config.maxRetries) < 1 || Number(config.maxRetries) > 10) {
        errors.push({ nodeId: node.id, severity: 'error', message: 'Retry count must be between 1 and 10.' });
      }
    }

    // Condition
    if (type === 'CONDITION') {
      const rules = config.rules || [];
      const variable = config.variable;
      if (rules.length === 0 && !variable && !config.defaultTargetNodeId) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Condition step '${node.title || node.id}' has no evaluation rules.`
        });
      }
    }

    // Webhook / API
    if (type === 'HTTP_WEBHOOK' || type === 'API_INTEGRATION') {
      if (!config.url || !String(config.url).trim()) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Webhook step '${node.title || node.id}' is missing endpoint URL.`
        });
      }
    }

    // Catalog & Booking
    if (type === 'CATALOG_BOOKING' || type === 'BUSINESS_ACTION') {
      if (!config.action && !config.entityType) {
        errors.push({
          nodeId: node.id,
          severity: 'error',
          message: `Booking step '${node.title || node.id}' does not have an action specified.`
        });
      }
    }
  });

  // 4. Reachability & Disconnected Node Check
  if (triggerNodes.length >= 1) {
    const startId = triggerNodes[0].id;
    const visited = new Set([startId]);
    const queue = [startId];

    while (queue.length > 0) {
      const currId = queue.shift();
      const transitionsFromCurr = outgoingMap.get(currId) || [];

      transitionsFromCurr.forEach((t) => {
        if (!visited.has(t.target)) {
          visited.add(t.target);
          queue.push(t.target);
        }
      });
    }

    safeNodes.forEach((node) => {
      if (!visited.has(node.id)) {
        warnings.push({
          nodeId: node.id,
          severity: 'warning',
          message: `Step '${node.title || node.id}' is disconnected and cannot be reached from the trigger.`
        });
      }
    });
  }

  // 5. Unconnected Branch Handles Check
  safeNodes.forEach((node) => {
    const outgoing = outgoingMap.get(node.id) || [];

    if (node.type === 'CONDITION') {
      const hasTrue = outgoing.some((t) => t.sourceHandle === 'true' || t.condition === true);
      const hasFalse = outgoing.some((t) => t.sourceHandle === 'false' || t.condition === false);

      if (!hasTrue && outgoing.length === 0) {
        warnings.push({
          nodeId: node.id,
          severity: 'warning',
          message: `Condition step '${node.title || node.id}' 'True' branch has no outgoing connection.`
        });
      }
      if (!hasFalse && outgoing.length <= 1) {
        warnings.push({
          nodeId: node.id,
          severity: 'warning',
          message: `Condition step '${node.title || node.id}' 'False' branch has no outgoing connection.`
        });
      }
    }

    if ((node.type === 'SEND_MESSAGE' || node.type === 'BUTTON_MENU') && (node.config?.options || []).length > 0) {
      const options = node.config.options;
      options.forEach((opt) => {
        const hasEdge = outgoing.some((t) => t.sourceHandle === opt.id || t.optionId === opt.id);
        if (!hasEdge && outgoing.length < options.length) {
          warnings.push({
            nodeId: node.id,
            severity: 'warning',
            message: `Button '${opt.title || opt.id}' on '${node.title || node.id}' has no outgoing connection.`
          });
        }
      });
    }
  });

  // 6. Terminal Node Warning
  const terminalTypes = new Set(['END', 'HUMAN_HANDOFF', 'HANDOFF']);
  const hasTerminal = safeNodes.some((n) => terminalTypes.has(n.type));
  if (!hasTerminal && safeNodes.length > 1) {
    warnings.push({
      nodeId: null,
      severity: 'warning',
      message: 'Flow has no terminal step (e.g. End Journey or Staff Handoff). Conversations may not terminate cleanly.'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    allIssues: [...errors, ...warnings]
  };
}
