const { interpolateTemplate } = require('../expressionEvaluator');
const taskScopedAiAgentService = require('../../ai/taskScopedAiAgentService');

/**
 * AI Knowledge Reply Node Executor (AI_KNOWLEDGE_REPLY)
 * Meta-policy-compliant conversational RAG node.
 * Answers customer questions using tenant knowledge base & live catalog items.
 *
 * Output Handles:
 * - 'replied': Answer generated with confidence >= threshold
 * - 'handoff': Low confidence or handoff keywords triggered
 */
async function execute(node, context) {
  const { session = {}, userInput = '', variableContext } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const evalContext = variableContext || session;

  const phone = session.senderPhone || session.phone_e164 || 'anonymous';
  const tenantId = session.tenantId || session.tenant_id || 1;
  const turnCount = session.turn_count || 1;

  // Resolve user query: either explicit variable or recent userInput
  let queryText = userInput;
  if (config.queryVariable && evalContext[config.queryVariable]) {
    queryText = evalContext[config.queryVariable];
  }
  if (!queryText && config.prompt) {
    queryText = interpolateTemplate(config.prompt, evalContext);
  }

  const overridePrompt = config.personaPrompt ? interpolateTemplate(config.personaPrompt, evalContext) : null;
  const isSimulation = Boolean(context.isSimulation || session.isSimulation);

  const result = await taskScopedAiAgentService.generateReply({
    tenantId,
    senderPhone: phone,
    userInput: queryText,
    inputType: session.inputType || 'TEXT',
    turnCount,
    overridePrompt,
    isSimulation
  });

  const nextHandle = result.handoff ? 'handoff' : 'replied';

  return {
    action: result.handoff ? 'CONTINUE' : 'CONTINUE',
    nextHandle,
    replyMessages: result.replyText ? [result.replyText] : [],
    updatedData: {
      'ai.last_reply': result.replyText,
      'ai.confidence': result.confidence,
      'ai.detected_language': result.detectedLanguage,
      'ai.triggered_handoff': result.handoff ? 1 : 0,
      'ai.matched_sources': result.sources
    },
    traceNote: `AI Knowledge Reply: ${result.handoff ? 'Triggered Human Handoff' : 'Replied with confidence ' + (result.confidence * 100).toFixed(0) + '%'}`
  };
}

module.exports = { execute };
