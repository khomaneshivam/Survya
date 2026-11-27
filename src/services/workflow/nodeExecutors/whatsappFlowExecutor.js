/**
 * 4. Meta Flow Form Node Executor (SEND_WHATSAPP_FLOW)
 */
async function execute(node, context) {
  const { session = {}, userPayload = null, isWaitingForThisNode = false } = context;
  const config = node.config || {};

  // If user completed and submitted the Meta Flow
  if (isWaitingForThisNode && userPayload) {
    let flowData = {};
    if (userPayload.response_json) {
      try {
        flowData = typeof userPayload.response_json === 'string'
          ? JSON.parse(userPayload.response_json)
          : userPayload.response_json;
      } catch (e) {
        flowData = userPayload;
      }
    } else {
      flowData = userPayload;
    }

    const saveAs = config.saveResponseAs || 'flow_submission_data';
    const updatedData = {
      [saveAs]: flowData
    };

    // Flatten top-level keys into session for easy {{key}} access
    if (typeof flowData === 'object' && flowData !== null) {
      for (const [k, v] of Object.entries(flowData)) {
        updatedData[k] = v;
      }
    }

    return {
      action: 'CONTINUE',
      nextHandle: 'submitted',
      updatedData,
      traceNote: `Meta Flow submitted with ${Object.keys(flowData).length} fields [Handle: submitted]`
    };
  }

  // Entering node: prepare interactive Flow CTA or conversational fallback
  const flowCta = config.flowCta || 'Open Form';
  const flowTitle = config.flowTitle || 'Please fill in details';

  const { getSetting } = require('../../../config/database');
  const envConfig = require('../../../config/env');
  const settingVal = getSetting('WHATSAPP_FLOWS_ENABLED');
  const flowsEnabled = settingVal !== null ? settingVal === 'true' : Boolean(envConfig.WHATSAPP_FLOWS_ENABLED);

  if (!flowsEnabled) {
    return {
      action: 'WAIT_FOR_INPUT',
      replyMessages: [`📋 *${flowTitle}*\n\nPlease reply with your details directly in this chat:`],
      traceNote: `WhatsApp Flows disabled. Prompted customer with standard in-chat conversational input for "${flowTitle}".`
    };
  }

  const promptText = `📋 *${flowTitle}*\n\nPlease tap the button below to complete the secure in-chat form.`;

  return {
    action: 'WAIT_FOR_INPUT',
    replyMessages: [promptText],
    replyInteractive: {
      type: 'FLOW',
      title: flowTitle,
      ctaText: flowCta,
      flowId: config.metaFlowId,
      screen: config.initialScreen || 'START'
    },
    traceNote: `Dispatched Meta Flow form CTA: "${flowTitle}". Pausing for form submission.`
  };
}

module.exports = { execute };
