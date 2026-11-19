const { interpolateTemplate } = require('../expressionEvaluator');

/**
 * 2. Send Message Node Executor (SEND_MESSAGE, MESSAGE, BUTTON_MENU, CONFIRMATION, PAYMENT)
 */
async function execute(node, context) {
  const { session = {}, userInput = '', userPayload = null, isWaitingForThisNode = false } = context;
  const config = node.config || {};
  const options = Array.isArray(config.options) ? config.options : [];

  // If we were already waiting at this message node for an option click / reply:
  if (isWaitingForThisNode && options.length > 0) {
    const rawInput = String(userInput || '').trim().toLowerCase();
    const payloadId = userPayload?.id || userPayload?.payload || '';
    const payloadTitle = (userPayload?.title || '').trim().toLowerCase();

    // 1. Match by payload ID
    let matched = options.find(opt => opt.id === payloadId || opt.value === payloadId);

    // 2. Match by payload title
    if (!matched && payloadTitle) {
      matched = options.find(opt => (opt.title || '').trim().toLowerCase() === payloadTitle);
    }

    // 3. Match by text content / title
    if (!matched && rawInput) {
      matched = options.find(opt => (opt.title || '').trim().toLowerCase() === rawInput);
    }

    // 4. Match by index (e.g. user typed "1", "2")
    if (!matched && /^\d+$/.test(rawInput)) {
      const idx = parseInt(rawInput, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        matched = options[idx];
      }
    }

    // 5. Match by option ID directly
    if (!matched && rawInput) {
      matched = options.find(opt => opt.id.toLowerCase() === rawInput);
    }

    if (matched) {
      return {
        action: 'CONTINUE',
        nextHandle: matched.id,
        updatedData: {
          [config.variable || 'selected_option']: matched.value || matched.id,
          'selected_option_title': matched.title
        },
        traceNote: `Interactive option matched: "${matched.title}" [Handle: ${matched.id}]`
      };
    }

    // Fallback: no specific button matched, route to default handle
    return {
      action: 'CONTINUE',
      nextHandle: 'default',
      updatedData: {
        [config.variable || 'selected_option']: userInput
      },
      traceNote: `User text did not match options, proceeding via default handle: "${userInput}"`
    };
  }

  // First time entering this node: compile and return reply message
  const textRaw = config.text || config.prompt || '';
  const renderedText = interpolateTemplate(textRaw, context.variableContext || session);

  const reply = {
    type: config.messageType || (options.length > 0 ? 'BUTTONS' : 'TEXT'),
    text: renderedText,
    mediaUrl: config.mediaUrl ? interpolateTemplate(config.mediaUrl, context.variableContext || session) : undefined,
    mediaType: config.mediaType || 'IMAGE',
    caption: config.caption ? interpolateTemplate(config.caption, context.variableContext || session) : undefined,
    options: options.map(opt => ({
      id: opt.id,
      title: interpolateTemplate(opt.title || '', context.variableContext || session),
      value: opt.value || opt.id
    })),
    listButtonText: config.listButtonText || 'View Options',
    listTitle: config.listTitle || 'Options'
  };

  // If node offers interactive options, pause execution to wait for user's selection
  if (options.length > 0) {
    return {
      action: 'WAIT_FOR_INPUT',
      replyMessages: [renderedText],
      replyInteractive: reply,
      traceNote: `Sent interactive message with ${options.length} options. Pausing for user selection.`
    };
  }

  // Plain text / media: send and immediately continue to next connected step
  return {
    action: 'CONTINUE',
    nextHandle: 'default',
    replyMessages: renderedText ? [renderedText] : [],
    replyInteractive: reply.mediaUrl ? reply : null,
    traceNote: `Sent message: "${renderedText.slice(0, 60)}..."`
  };
}

module.exports = { execute };
