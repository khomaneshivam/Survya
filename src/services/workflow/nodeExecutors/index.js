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

  // Intake
  COLLECT_INPUT: intakeExecutor,
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
  CATALOG_BOOKING: catalogBookingExecutor,
  BUSINESS_ACTION: catalogBookingExecutor,
  TRANSACTION: catalogBookingExecutor,
  BOOKING: catalogBookingExecutor,
  QUOTATION: catalogBookingExecutor,
  HTTP_WEBHOOK: webhookExecutor,
  API_INTEGRATION: webhookExecutor,

  // Terminal
  HUMAN_HANDOFF: handoffExecutor,
  HANDOFF: handoffExecutor,
  END: endExecutor
};

/**
 * Returns the executor for a given node type.
 * Falls back to messageExecutor or generic continuation if unknown.
 */
function getNodeExecutor(nodeType) {
  if (!nodeType) return messageExecutor;
  const upper = String(nodeType).toUpperCase();
  return EXECUTORS[upper] || messageExecutor;
}

module.exports = {
  EXECUTORS,
  getNodeExecutor
};
