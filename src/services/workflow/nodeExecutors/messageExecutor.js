const { interpolateTemplate } = require('../expressionEvaluator');

/**
 * 2. Send Message Node Executor (SEND_MESSAGE, MESSAGE, BUTTON_MENU, CONFIRMATION, PAYMENT)
 */
async function execute(node, context) {
  const { session = {}, userInput = '', userPayload = null, isWaitingForThisNode = false } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const options = Array.isArray(config.options) ? config.options : [];

  // Shared emoji/punctuation normalization for button title comparisons
  const cleanEmoji = str => String(str || '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F6FF}]/gu, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Fast-forward first menu when Turn 1 already contains an explicit option click or quoted button text
  if (!isWaitingForThisNode && options.length > 0 && (context.initialUserPayload || context.initialUserInput)) {
    const initInput = String(context.initialUserInput || '').trim().toLowerCase();
    const initCleanInput = cleanEmoji(initInput);
    const initPayloadId = String(context.initialUserPayload?.id || context.initialUserPayload?.payload || '').trim().toLowerCase();
    const initPayloadTitle = cleanEmoji(context.initialUserPayload?.title || '');

    let initMatched = null;
    if (initPayloadId) {
      initMatched = options.find(opt =>
        String(opt.id || '').toLowerCase() === initPayloadId ||
        String(opt.value || '').toLowerCase() === initPayloadId
      );
    }
    if (!initMatched && initPayloadTitle) {
      initMatched = options.find(opt => cleanEmoji(opt.title) === initPayloadTitle);
    }
    if (!initMatched && initCleanInput) {
      initMatched = options.find(opt => {
        const oClean = cleanEmoji(opt.title);
        return oClean.length >= 5 && (initCleanInput === oClean || initCleanInput.includes(oClean));
      });
    }

    if (initMatched) {
      return {
        action: 'CONTINUE',
        nextHandle: initMatched.id,
        fastForwarded: true,
        updatedData: {
          [config.variable || 'selected_option']: initMatched.value || initMatched.id,
          'selected_option_title': initMatched.title
        },
        traceNote: `Fast-forwarded initial option: "${initMatched.title}" [Handle: ${initMatched.id}]`
      };
    }
  }

  // If we were already waiting at this message node for an option click / reply:
  if (isWaitingForThisNode && options.length > 0) {
    const rawInput = String(userInput || '').trim().toLowerCase();
    const payloadId = userPayload?.id || userPayload?.payload || '';
    const payloadTitle = (userPayload?.title || '').trim().toLowerCase();

    const cleanInput = cleanEmoji(rawInput);
    const cleanPayloadTitle = cleanEmoji(payloadTitle);
    const cleanPayloadId = cleanEmoji(payloadId);

    // 1. Match by payload ID
    let matched = options.find(opt => {
      const oId = String(opt.id || '').toLowerCase();
      const oVal = String(opt.value || '').toLowerCase();
      return oId === payloadId.toLowerCase() || oVal === payloadId.toLowerCase() ||
             (cleanPayloadId && (cleanEmoji(oId) === cleanPayloadId || cleanEmoji(oVal) === cleanPayloadId));
    });

    // 2. Match by payload title
    if (!matched && payloadTitle) {
      matched = options.find(opt => {
        const oTitle = (opt.title || '').trim().toLowerCase();
        return oTitle === payloadTitle || (cleanPayloadTitle && cleanEmoji(oTitle) === cleanPayloadTitle);
      });
    }

    // 3. Match by text content / title
    if (!matched && rawInput) {
      matched = options.find(opt => {
        const oTitle = (opt.title || '').trim().toLowerCase();
        return oTitle === rawInput || (cleanInput && cleanEmoji(oTitle) === cleanInput);
      });
    }

    // 4. Substring / partial title match
    if (!matched && cleanInput.length >= 3) {
      matched = options.find(opt => {
        const oClean = cleanEmoji(opt.title);
        return oClean && (oClean.includes(cleanInput) || cleanInput.includes(oClean));
      });
    }

    // 5. Match by index (e.g. user typed "1", "2")
    if (!matched && /^\d+$/.test(rawInput)) {
      const idx = parseInt(rawInput, 10) - 1;
      if (idx >= 0 && idx < options.length) {
        matched = options[idx];
      }
    }

    // 6. Match by option ID directly
    if (!matched && rawInput) {
      matched = options.find(opt => opt.id.toLowerCase() === rawInput || cleanEmoji(opt.id) === cleanInput);
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
  const textRaw = config.text || config.messageText || config.prompt || '';
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
