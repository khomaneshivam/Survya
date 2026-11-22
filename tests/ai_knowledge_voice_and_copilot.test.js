const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, initializeDatabase } = require('../src/config/database');
const knowledgeRetrievalService = require('../src/services/ai/knowledgeRetrievalService');
const voiceTranscriptionService = require('../src/services/ai/voiceTranscriptionService');
const taskScopedAiAgentService = require('../src/services/ai/taskScopedAiAgentService');
const inboxCopilotService = require('../src/services/ai/inboxCopilotService');
const aiReplyExecutor = require('../src/services/workflow/nodeExecutors/aiReplyExecutor');

describe('Task 2: Task-Scoped Knowledge AI Agent, Voice-Note Transcription & Copilot Suite', () => {
  const tenantId = 1;
  const testPhone = '919876543210';
  let createdKnowledgeId = null;

  before(() => {
    initializeDatabase();

    // Clean up test records
    db.prepare('DELETE FROM ai_interaction_logs WHERE sender_phone = ?').run(testPhone);
    db.prepare("DELETE FROM ai_knowledge_sources WHERE title LIKE 'TEST_SUITE_%'").run();
    db.prepare('DELETE FROM customer_replies WHERE from_phone = ?').run(testPhone);

    // Insert a verified test knowledge item
    const res = db.prepare(`
      INSERT INTO ai_knowledge_sources (
        tenant_id, title, source_type, content_text, tags_json,
        active_status, delete_status, created_by, updated_by
      ) VALUES (
        ?, 'TEST_SUITE_Infinity Pool Timings', 'TEXT_FAQ',
        'Our Olympic-size infinity pool is open daily from 6:00 AM to 9:00 PM. Clean towels and locker facilities are complimentary for all staying guests.',
        ?, 1, 0, 'test_runner', 'test_runner'
      )
    `).run(tenantId, JSON.stringify(['pool', 'timings', 'towels', 'swimming']));

    createdKnowledgeId = res.lastInsertRowid;
  });

  after(() => {
    db.prepare('DELETE FROM ai_interaction_logs WHERE sender_phone = ?').run(testPhone);
    if (createdKnowledgeId) {
      db.prepare('DELETE FROM ai_knowledge_sources WHERE id = ?').run(createdKnowledgeId);
    }
    db.prepare("DELETE FROM ai_knowledge_sources WHERE title LIKE 'TEST_SUITE_%'").run();
    db.prepare('DELETE FROM customer_replies WHERE from_phone = ?').run(testPhone);
  });

  test('1. Schema Verification: AI tables and columns exist in MySQL 8.4', () => {
    const knowCols = db.prepare('DESCRIBE ai_knowledge_sources').all().map(c => c.Field);
    assert.ok(knowCols.includes('title'), 'Missing title in ai_knowledge_sources');
    assert.ok(knowCols.includes('source_type'), 'Missing source_type in ai_knowledge_sources');
    assert.ok(knowCols.includes('content_text'), 'Missing content_text in ai_knowledge_sources');
    assert.ok(knowCols.includes('active_status'), 'Missing active_status in ai_knowledge_sources');
    assert.ok(knowCols.includes('delete_status'), 'Missing delete_status in ai_knowledge_sources');

    const agentCols = db.prepare('DESCRIBE ai_agent_configs').all().map(c => c.Field);
    assert.ok(agentCols.includes('business_persona'), 'Missing business_persona in ai_agent_configs');
    assert.ok(agentCols.includes('confidence_threshold'), 'Missing confidence_threshold in ai_agent_configs');
    assert.ok(agentCols.includes('voice_transcription_enabled'), 'Missing voice_transcription_enabled in ai_agent_configs');
    assert.ok(agentCols.includes('auto_sync_catalog'), 'Missing auto_sync_catalog in ai_agent_configs');

    const logCols = db.prepare('DESCRIBE ai_interaction_logs').all().map(c => c.Field);
    assert.ok(logCols.includes('user_input'), 'Missing user_input in ai_interaction_logs');
    assert.ok(logCols.includes('ai_reply'), 'Missing ai_reply in ai_interaction_logs');
    assert.ok(logCols.includes('confidence'), 'Missing confidence in ai_interaction_logs');
    assert.ok(logCols.includes('triggered_handoff'), 'Missing triggered_handoff in ai_interaction_logs');

    const replyCols = db.prepare('DESCRIBE customer_replies').all().map(c => c.Field);
    assert.ok(replyCols.includes('voice_transcript'), 'Missing voice_transcript in customer_replies');
    assert.ok(replyCols.includes('detected_language'), 'Missing detected_language in customer_replies');
  });

  test('2. Knowledge Retrieval Service: BM25 search grounds in FAQs & live room types', () => {
    // 2a. Query for pool FAQ
    const poolRes = knowledgeRetrievalService.search('swimming pool timings and towels', tenantId);
    assert.ok(poolRes.matches.length > 0, 'Expected at least 1 match for pool query');
    assert.ok(poolRes.bestConfidence >= 0.5, 'Expected confidence score >= 0.5 for pool match');
    assert.ok(poolRes.contextText.includes('infinity pool'), 'Context text should include pool details');

    // 2b. Query for room rates (Live Catalog / Room Type sync)
    const roomRes = knowledgeRetrievalService.search('deluxe room price tariff', tenantId);
    assert.ok(roomRes.matches.length > 0, 'Expected matches for room inquiry');
    assert.ok(roomRes.contextText.includes('Room') || roomRes.contextText.includes('₹'), 'Context should cite room tariffs');
  });

  test('3. Regional Voice-Note Transcription: Detects English, Hindi, Marathi, and Hinglish', async () => {
    // Language detection heuristics
    assert.equal(voiceTranscriptionService.detectLanguageFromText('Hello, what are your check-in timings?'), 'en');
    assert.equal(voiceTranscriptionService.detectLanguageFromText('होटल में कौन सा कमरा खाली है?'), 'hi');
    assert.equal(voiceTranscriptionService.detectLanguageFromText('खोली उपलब्ध आहे का आणि भाडे किती आहे?'), 'mr');
    assert.equal(voiceTranscriptionService.detectLanguageFromText('room khali hai kya bhai pricing batao'), 'hinglish');

    // Simulation / Sandbox transcription
    const tRes = await voiceTranscriptionService.transcribeAudioMedia({
      isSimulation: true,
      sampleText: 'होटलचे भाडे किती आहे?'
    });
    assert.equal(tRes.success, true);
    assert.equal(tRes.detectedLanguage, 'mr');
    assert.ok(tRes.transcript.includes('भाडे'));
  });

  test('4. Task-Scoped AI Agent: Grounding, Off-Topic Refusal & Human Handoff (Meta AI Policy)', async () => {
    // 4a. Grounded reply
    const goodQuery = await taskScopedAiAgentService.generateReply({
      tenantId,
      senderPhone: testPhone,
      userInput: 'What are the swimming pool timings?',
      isSimulation: true
    });
    assert.equal(goodQuery.handled, true);
    assert.equal(goodQuery.handoff, false);
    assert.ok(goodQuery.confidence >= 0.65, 'Confidence should meet threshold');
    assert.ok(goodQuery.replyText.length > 10, 'Should generate a substantive reply');

    // 4b. Polite refusal on off-topic inquiry
    const offTopic = await taskScopedAiAgentService.generateReply({
      tenantId,
      senderPhone: testPhone,
      userInput: 'write python code to solve quantum physics equations',
      isSimulation: true
    });
    assert.equal(offTopic.handled, true);
    assert.equal(offTopic.handoff, false);
    assert.ok(offTopic.replyText.toLowerCase().includes('hotel') || offTopic.replyText.toLowerCase().includes('rooms') || offTopic.replyText.toLowerCase().includes('assisting'), 'Should decline politely and refocus on hotel amenities');

    // 4c. Explicit human handoff keyword
    const handoff = await taskScopedAiAgentService.generateReply({
      tenantId,
      senderPhone: testPhone,
      userInput: 'I have a big complaint and need to speak with your manager immediately',
      isSimulation: true
    });
    assert.equal(handoff.handled, true);
    assert.equal(handoff.handoff, true);
    assert.ok(handoff.replyText.toLowerCase().includes('transferring') || handoff.replyText.toLowerCase().includes('manager') || handoff.replyText.toLowerCase().includes('human'));

    // 4d. Verify interaction logs were written
    const logs = db.prepare('SELECT * FROM ai_interaction_logs WHERE sender_phone = ? ORDER BY id DESC').all(testPhone);
    assert.ok(logs.length >= 3, 'Expected at least 3 interaction logs recorded');
    assert.equal(logs[0].triggered_handoff, 1, 'Latest log should record triggered_handoff = 1');
  });

  test('5. Flow Studio Node Executor (AI_KNOWLEDGE_REPLY)', async () => {
    // 5a. Grounded flow node execution -> nextHandle = 'replied'
    const normalExec = await aiReplyExecutor.execute(
      {
        id: 'node_ai_1',
        type: 'AI_KNOWLEDGE_REPLY',
        data: {}
      },
      {
        session: { senderPhone: testPhone, tenantId },
        userInput: 'When is the swimming pool open?',
        isSimulation: true
      }
    );
    assert.equal(normalExec.action, 'CONTINUE');
    assert.equal(normalExec.nextHandle, 'replied');
    assert.ok(normalExec.replyMessages.length > 0);

    // 5b. Escalation flow node execution -> nextHandle = 'handoff'
    const handoffExec = await aiReplyExecutor.execute(
      {
        id: 'node_ai_2',
        type: 'AI_KNOWLEDGE_REPLY',
        data: {}
      },
      {
        session: { senderPhone: testPhone, tenantId },
        userInput: 'I want a refund right now connect me with staff',
        isSimulation: true
      }
    );
    assert.equal(handoffExec.nextHandle, 'handoff');
    assert.equal(handoffExec.updatedData['ai.triggered_handoff'], 1);
  });

  test('6. Inbox AI Copilot: Draft Reply, Translation & Thread Summarization', async () => {
    const mockMessages = [
      { id: 1, text: 'Hello, what are your pool timings?', is_outbound: false },
      { id: 2, text: 'Our pool is open from 6am to 9pm daily.', is_outbound: true },
      { id: 3, text: 'Can I get extra towels for my children?', is_outbound: false }
    ];

    // 6a. Draft reply
    const drafts = await inboxCopilotService.draftReply({
      conversationPhone: testPhone,
      messages: mockMessages,
      tenantId,
      customerName: 'Rohit Sharma'
    });
    assert.equal(drafts.success, true);
    assert.equal(drafts.suggestions.length, 2, 'Expected 2 reply suggestions (Direct & Commercial)');
    assert.ok(drafts.suggestions[0].text.length > 10);
    assert.ok(drafts.suggestions[1].text.length > 10);

    // 6b. Translation
    const hiTranslate = await inboxCopilotService.translateMessage({
      text: 'hello',
      targetLanguage: 'hi'
    });
    assert.equal(hiTranslate.success, true);
    assert.equal(hiTranslate.targetLanguage, 'hi');
    assert.ok(hiTranslate.translatedText.length > 0);

    // 6c. Thread Summarization
    const summary = await inboxCopilotService.summarizeThread({
      messages: mockMessages,
      customerName: 'Rohit Sharma',
      phone: testPhone
    });
    assert.equal(summary.success, true);
    assert.ok(Array.isArray(summary.bullets) && summary.bullets.length > 0, 'Expected summary bullets');
    assert.ok(summary.urgency, 'Expected urgency rating');
    assert.ok(summary.nextAction, 'Expected recommended next action');
  });

  test('7. Webhook Voice Note Ingestion & Speech Persistence', () => {
    // Simulate webhook inbound audio note
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const audioMsgId = `test_audio_${Date.now()}`;

    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, voice_transcript, detected_language, is_read, received_at
      ) VALUES (
        ?, ?, 'Aarti Deshmukh', 'audio',
        '[Voice Note]', 'खोलीचे भाडे काय आहे आणि नाश्ता समाविष्ट आहे का?', 'mr', 0, ?
      )
    `).run(audioMsgId, testPhone, nowIso);

    const saved = db.prepare('SELECT * FROM customer_replies WHERE wa_message_id = ?').get(audioMsgId);
    assert.equal(saved.message_type, 'audio');
    assert.equal(saved.detected_language, 'mr');
    assert.ok(saved.voice_transcript.includes('भाडे'), 'Transcript should be saved on the customer_replies row');
  });

  test('8. Agent Config & Knowledge CRUD Service Endpoints', () => {
    // 8a. Config getter & updater
    const initialConfig = taskScopedAiAgentService.getAgentConfig(tenantId);
    assert.ok(initialConfig, 'Agent config should exist');

    const updatedConfig = taskScopedAiAgentService.updateAgentConfig(tenantId, {
      confidence_threshold: 0.72,
      max_ai_turns_before_handoff: 6
    });
    assert.equal(updatedConfig.confidence_threshold, 0.72);
    assert.equal(updatedConfig.max_ai_turns_before_handoff, 6);

    // Restore threshold
    taskScopedAiAgentService.updateAgentConfig(tenantId, {
      confidence_threshold: 0.65,
      max_ai_turns_before_handoff: 8
    });
  });
});
