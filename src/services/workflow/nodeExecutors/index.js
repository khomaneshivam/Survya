const triggerExecutor = require('./triggerExecutor');
const messageExecutor = require('./messageExecutor');
const templateExecutor = require('./templateExecutor');
const whatsappFlowExecutor = require('./whatsappFlowExecutor');
const intakeExecutor = require('./intakeExecutor');
const conditionExecutor = require('./conditionExecutor');
const variableExecutor = require('./variableExecutor');
const delayExecutor = require('./delayExecutor');
const crmUpsertExecutor = require('./crmUpsertExecutor');
const catalogBookingExecutor = require('./catalogBookingExecutor');
const webhookExecutor = require('./webhookExecutor');
const handoffExecutor = require('./handoffExecutor');
const endExecutor = require('./endExecutor');
const aiReplyExecutor = require('./aiReplyExecutor');
const catalogBrowserExecutor = require('./catalogBrowserExecutor');
const addonQuoteExecutor = require('./addonQuoteExecutor');
const aiHybridExecutor = require('./aiHybridExecutor');
const masterPickerExecutor = require('./masterPickerExecutor');
const inappBridgeExecutor = require('./inappBridgeExecutor');

const EXECUTORS = {
  // Triggers
  TRIGGER_WHATSAPP: triggerExecutor,
  TRIGGER_EVENT: triggerExecutor,
  START: triggerExecutor,

  // Messaging & Browsing
  SEND_MESSAGE: messageExecutor,
  MESSAGE: messageExecutor,
  BUTTON_MENU: messageExecutor,
  SELECTION: messageExecutor,
  CONFIRMATION: messageExecutor,
  PAYMENT: messageExecutor,
  SEND_TEMPLATE: templateExecutor,
  SEND_WHATSAPP_FLOW: whatsappFlowExecutor,
  AI_KNOWLEDGE_REPLY: aiReplyExecutor,
  AI_REPLY: aiReplyExecutor,
  AI_HYBRID_ASSIST: aiHybridExecutor,
  CATALOG_BROWSER: catalogBrowserExecutor,
  ADDON_UPSELL_AND_QUOTE: addonQuoteExecutor,
  MASTER_PICKER: masterPickerExecutor,
  DYNAMIC_MASTER_SELECTION: masterPickerExecutor,
  OPEN_INAPP_EXPERIENCE: inappBridgeExecutor,
  INAPP_BRIDGE: inappBridgeExecutor,
  INTERACTIVE_APP: inappBridgeExecutor,

  // Intake
  COLLECT_INPUT: intakeExecutor,
  SCHEMA_INPUT: intakeExecutor,
  INPUT_COLLECTION: intakeExecutor,
  QUESTION: intakeExecutor,

  // Logic & Routing
  CONDITION: conditionExecutor,
  SET_VARIABLE: variableExecutor,

  // Timing
  WAIT_DELAY: delayExecutor,
  DELAY: delayExecutor,

  // Actions & Integrations
  CRM_UPSERT: crmUpsertExecutor,
  CRM_CREATE_OR_UPDATE_RECORD: crmUpsertExecutor,
  CATALOG_BOOKING: catalogBookingExecutor,
  BUSINESS_ACTION: catalogBookingExecutor,
  TRANSACTION: catalogBookingExecutor,
  BOOKING: catalogBookingExecutor,
  QUOTATION: catalogBookingExecutor,
  HTTP_WEBHOOK: webhookExecutor,
  API_INTEGRATION: webhookExecutor,

  // Terminal
  HUMAN_HANDOFF: handoffExecutor,
  AGENT_HANDOFF: handoffExecutor,
  HANDOFF: handoffExecutor,
  END: endExecutor
};

/**
 * Returns the executor for a given node type.
 * Falls back to messageExecutor or generic continuation if unknown.
 */
function getNodeExecutor(nodeType) {
  const type = String(nodeType || '').trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(EXECUTORS, type)) {
    const error = new Error(`Unsupported workflow node type: ${type || '(empty)'}`);
    error.code = 'UNSUPPORTED_WORKFLOW_NODE';
    throw error;
  }
  return EXECUTORS[type];
}

function registerNodeExecutor(nodeType, executor) {
  const type = String(nodeType || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(type)) throw new TypeError('Invalid node type');
  if (!executor || typeof executor.execute !== 'function') throw new TypeError('Invalid executor');
  if (Object.prototype.hasOwnProperty.call(EXECUTORS, type)) throw new Error('Already registered');
  EXECUTORS[type] = executor;
  return type;
}

module.exports = {
  EXECUTORS,
  getNodeExecutor,
  registerNodeExecutor
};
