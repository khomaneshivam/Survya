/**
 * Task-Scoped Knowledge AI Agent Service (Meta Jan 2026 AI Policy Compliant)
 *
 * Core Directives:
 * 1. Strict Grounding: Answers exclusively from retrieved tenant knowledge, catalog items, and room rates.
 * 2. Hallucination Prevention: If information is not in knowledge base, refuses gracefully or triggers handoff.
 * 3. Polite Off-Topic Refusal: Declines non-business inquiries politely.
 * 4. Regional Parity: Responds in the customer's chosen language (English, Hindi, Marathi, Hinglish).
 * 5. Automatic Human Handoff: Triggers when confidence < threshold, keywords matched, or turns exceeded.
 */
const { getDb } = require('../../config/database');
const knowledgeRetrievalService = require('./knowledgeRetrievalService');
const voiceTranscriptionService = require('./voiceTranscriptionService');
const config = require('../../config/env');

const DEFAULT_HANDOFF_KEYWORDS = [
  'human', 'agent', 'manager', 'person', 'staff', 'executive',
  'complaint', 'refund', 'cancel', 'fraud', 'police', 'lawyer',
  'court', 'escalate', 'supervisor', 'bad service', 'scam'
];

class TaskScopedAiAgentService {
  /**
   * Get or initialize agent configuration for a tenant
   */
  getAgentConfig(tenantId = 1) {
    const db = getDb();
    let row = db.prepare('SELECT * FROM ai_agent_configs WHERE tenant_id = ?').get(tenantId);
    if (!row) {
      db.prepare(`
        INSERT INTO ai_agent_configs (
          tenant_id, enabled, business_persona, allowed_tasks_json, supported_languages_json,
          handoff_keywords_json, confidence_threshold, max_ai_turns_before_handoff,
          voice_transcription_enabled, auto_sync_catalog, active_status, delete_status
        ) VALUES (
          ?, 0,
          'You are SARVYA, an attentive and courteous guest relations assistant. You provide accurate details about room availability, tariffs, dining menus, amenities, and policies based strictly on verified business records.',
          ?, ?, ?, 0.65, 8, 1, 1, 1, 0
        )
      `).run(
        tenantId,
        JSON.stringify(['ROOM_ENQUIRY', 'TARIFF_DETAILS', 'CATALOG_BROWSING', 'AMENITIES_INFO', 'LOCATION_HOURS']),
        JSON.stringify(['en', 'hi', 'mr', 'hinglish']),
        JSON.stringify(DEFAULT_HANDOFF_KEYWORDS)
      );
      row = db.prepare('SELECT * FROM ai_agent_configs WHERE tenant_id = ?').get(tenantId);
    }

    let allowedTasks = [];
    let supportedLanguages = [];
    let handoffKeywords = [];
    try {
      allowedTasks = typeof row.allowed_tasks_json === 'string' ? JSON.parse(row.allowed_tasks_json) : (row.allowed_tasks_json || []);
      supportedLanguages = typeof row.supported_languages_json === 'string' ? JSON.parse(row.supported_languages_json) : (row.supported_languages_json || []);
      handoffKeywords = typeof row.handoff_keywords_json === 'string' ? JSON.parse(row.handoff_keywords_json) : (row.handoff_keywords_json || []);
    } catch (e) {}

    return {
      ...row,
      allowedTasks,
      supportedLanguages,
      handoffKeywords
    };
  }

  /**
   * Update agent configuration
   */
  updateAgentConfig(tenantId = 1, updates = {}) {
    const db = getDb();
    this.getAgentConfig(tenantId); // Ensure exists

    const fields = [];
    const params = [];

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }
    if (updates.business_persona !== undefined) {
      fields.push('business_persona = ?');
      params.push(updates.business_persona);
    }
    if (updates.allowed_tasks_json !== undefined) {
      fields.push('allowed_tasks_json = ?');
      params.push(typeof updates.allowed_tasks_json === 'string' ? updates.allowed_tasks_json : JSON.stringify(updates.allowed_tasks_json));
    }
    if (updates.supported_languages_json !== undefined) {
      fields.push('supported_languages_json = ?');
      params.push(typeof updates.supported_languages_json === 'string' ? updates.supported_languages_json : JSON.stringify(updates.supported_languages_json));
    }
    if (updates.handoff_keywords_json !== undefined) {
      fields.push('handoff_keywords_json = ?');
      params.push(typeof updates.handoff_keywords_json === 'string' ? updates.handoff_keywords_json : JSON.stringify(updates.handoff_keywords_json));
    }
    if (updates.confidence_threshold !== undefined) {
      fields.push('confidence_threshold = ?');
      params.push(Number(updates.confidence_threshold) || 0.65);
    }
    if (updates.max_ai_turns_before_handoff !== undefined) {
      fields.push('max_ai_turns_before_handoff = ?');
      params.push(Number(updates.max_ai_turns_before_handoff) || 8);
    }
    if (updates.voice_transcription_enabled !== undefined) {
      fields.push('voice_transcription_enabled = ?');
      params.push(updates.voice_transcription_enabled ? 1 : 0);
    }
    if (updates.auto_sync_catalog !== undefined) {
      fields.push('auto_sync_catalog = ?');
      params.push(updates.auto_sync_catalog ? 1 : 0);
    }

    if (fields.length > 0) {
      params.push(tenantId);
      db.prepare(`UPDATE ai_agent_configs SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ?`).run(...params);
    }

    return this.getAgentConfig(tenantId);
  }

  /**
   * Determine if input warrants an immediate human handoff
   */
  checkHandoffIntent(userInput, agentConfig) {
    if (!userInput || typeof userInput !== 'string') return false;
    const lower = userInput.toLowerCase();
    const keywords = Array.isArray(agentConfig?.handoffKeywords) && agentConfig.handoffKeywords.length > 0
      ? agentConfig.handoffKeywords
      : DEFAULT_HANDOFF_KEYWORDS;

    for (const kw of keywords) {
      if (kw && kw.trim()) {
        const cleanKw = kw.trim().toLowerCase();
        if (cleanKw.length <= 3) {
          const re = new RegExp(`\\b${cleanKw}\\b`, 'i');
          if (re.test(lower)) return true;
        } else if (lower.includes(cleanKw)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if query is completely off-topic (e.g. general code, politics, trivia)
   */
  isOffTopic(userInput) {
    const lower = (userInput || '').toLowerCase();
    const offTopicPatterns = [
      /\b(write python|javascript code|write a poem|who is the president|solve this math|quantum physics|tell me a joke about|bitcoin price)\b/i
    ];
    return offTopicPatterns.some(p => p.test(lower));
  }

  /**
   * Primary method: Generate a task-scoped, grounded response
   */
  async generateReply(params = {}) {
    const startTime = Date.now();
    const {
      tenantId = 1,
      senderPhone = 'anonymous',
      userInput = '',
      inputType = 'TEXT',
      turnCount = 1,
      overridePrompt = null,
      isSimulation = false
    } = params;

    const db = getDb();
    const agentConfig = this.getAgentConfig(tenantId);
    const detectedLang = voiceTranscriptionService.detectLanguageFromText(userInput);

    // 1. Check for immediate explicit Human Handoff triggers
    const isHandoffRequested = this.checkHandoffIntent(userInput, agentConfig);
    const maxTurns = agentConfig.max_ai_turns_before_handoff || 8;
    const turnsExceeded = turnCount >= maxTurns;

    if (isHandoffRequested || turnsExceeded) {
      let handoffMsg = 'I understand. I am transferring this chat to a human guest relations manager who will assist you shortly.';
      if (detectedLang === 'hi' || detectedLang === 'hinglish') {
        handoffMsg = 'जी बिल्कुल, मैं आपकी बात हमारे मैनेजर/अधिकारी से करवा रहा हूँ। हमारी टीम जल्द ही आपसे संपर्क करेगी।';
      } else if (detectedLang === 'mr') {
        handoffMsg = 'नक्कीच, मी ही चर्चा आमच्या व्यवस्थापकांकडे वर्ग करत आहे. आमचे प्रतिनिधी लवकरच आपल्याशी संपर्क साधतील.';
      }

      this._logInteraction({
        tenantId,
        senderPhone,
        inputType,
        userInput,
        detectedLanguage: detectedLang,
        matchedSources: [],
        aiReply: handoffMsg,
        confidence: 1.0,
        triggeredHandoff: 1,
        latencyMs: Date.now() - startTime
      });

      return {
        handled: true,
        handoff: true,
        replyText: handoffMsg,
        confidence: 1.0,
        sources: [],
        detectedLanguage: detectedLang
      };
    }

    // 2. Off-Topic Check
    if (this.isOffTopic(userInput)) {
      let offTopicMsg = 'I am dedicated solely to assisting you with our hotel rooms, amenities, dining, pricing, and bookings. Please let me know how I can help with our property!';
      if (detectedLang === 'hi' || detectedLang === 'hinglish') {
        offTopicMsg = 'माफ़ कीजिए, मैं केवल होटल के कमरे, भोजन, सुविधाएँ, बुकिंग और कीमतों से जुड़े सवालों में आपकी सहायता कर सकता हूँ।';
      } else if (detectedLang === 'mr') {
        offTopicMsg = 'क्षमस्व, मी फक्त हॉटेलच्या खोल्या, सुविधा, जेवण आणि बुकिंग संबंधी माहिती देऊ शकतो.';
      }

      this._logInteraction({
        tenantId,
        senderPhone,
        inputType,
        userInput,
        detectedLanguage: detectedLang,
        matchedSources: [],
        aiReply: offTopicMsg,
        confidence: 0.95,
        triggeredHandoff: 0,
        latencyMs: Date.now() - startTime
      });

      return {
        handled: true,
        handoff: false,
        replyText: offTopicMsg,
        confidence: 0.95,
        sources: [],
        detectedLanguage: detectedLang
      };
    }

    // 3. Retrieve relevant grounded knowledge
    const retrievalResult = knowledgeRetrievalService.search(userInput, tenantId, {
      includeCatalog: Boolean(agentConfig.auto_sync_catalog)
    });

    const confidence = retrievalResult.bestConfidence;
    const minThreshold = agentConfig.confidence_threshold || 0.65;
    const matchedSources = retrievalResult.matches.map(m => ({
      title: m.title,
      reference: m.reference,
      score: Number(m.score?.toFixed(2) || 0)
    }));

    // 4. If confidence is too low -> Trigger graceful handoff / contact notice
    if (confidence < minThreshold) {
      let lowConfMsg = 'I want to be sure you receive the most accurate information. Let me connect you with our team so they can assist you with your specific request.';
      if (detectedLang === 'hi' || detectedLang === 'hinglish') {
        lowConfMsg = 'मैं आपकी बात सीधे हमारे फ्रंट-डेस्क से करा देता हूँ ताकि आपको सटीक जानकारी मिल सके।';
      } else if (detectedLang === 'mr') {
        lowConfMsg = 'योग्य व अचूक माहितीसाठी मी आमचे प्रतिनिधी आपल्याशी जोडत आहे.';
      }

      this._logInteraction({
        tenantId,
        senderPhone,
        inputType,
        userInput,
        detectedLanguage: detectedLang,
        matchedSources,
        aiReply: lowConfMsg,
        confidence,
        triggeredHandoff: 1,
        latencyMs: Date.now() - startTime
      });

      return {
        handled: true,
        handoff: true,
        replyText: lowConfMsg,
        confidence,
        sources: matchedSources,
        detectedLanguage: detectedLang
      };
    }

    // 5. Generate Grounded Reply via LLM (or deterministic grounder for simulation/mock)
    let aiReplyText = '';
    const geminiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;

    if (!isSimulation && geminiKey) {
      try {
        const persona = overridePrompt || agentConfig.business_persona ||
          'You are an attentive and courteous guest relations assistant.';
        const systemPrompt = `${persona}
Grounding Rules (Meta AI Policy):
1. Only state facts directly present in the Grounded Context below. Never invent discounts, amenities, rooms, or policies.
2. If the user asks in Hindi or Hinglish, reply warmly in natural Hindi/Hinglish. If in Marathi, reply in Marathi. If in English, reply in English.
3. Keep the response concise, clear, and WhatsApp-friendly (2 to 4 sentences). Use bullet points where appropriate.

Grounded Context:
${retrievalResult.contextText}

User Query: "${userInput}"`;

        const modelName = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
          })
        });

        if (res.ok) {
          const resJson = await res.json();
          aiReplyText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }
      } catch (err) {
        console.warn('[TaskScopedAiAgent] Gemini LLM generation notice:', err.message);
      }
    }

    // Deterministic High-Quality Grounded Synthesis fallback (for unit tests, offline, or fallback)
    if (!aiReplyText) {
      const topMatch = retrievalResult.matches[0];
      if (detectedLang === 'hi' || detectedLang === 'hinglish') {
        aiReplyText = `नमस्ते! ${topMatch.title} के बारे में जानकारी:\n${topMatch.content}\n\nयदि आप बुकिंग करना चाहते हैं या अधिक जानकारी चाहिए, तो कृपया हमें बताएं।`;
      } else if (detectedLang === 'mr') {
        aiReplyText = `नमस्कार! ${topMatch.title} संबंधी तपशील:\n${topMatch.content}\n\nअधिक माहितीसाठी किंवा आरक्षणासाठी कृपया कळवा.`;
      } else {
        aiReplyText = `Hello! Regarding ${topMatch.title}:\n${topMatch.content}\n\nPlease let us know if you would like to proceed with a booking or need additional assistance!`;
      }
    }

    // 6. Log the verified interaction
    this._logInteraction({
      tenantId,
      senderPhone,
      inputType,
      userInput,
      detectedLanguage: detectedLang,
      matchedSources,
      aiReply: aiReplyText,
      confidence,
      triggeredHandoff: 0,
      latencyMs: Date.now() - startTime
    });

    return {
      handled: true,
      handoff: false,
      replyText: aiReplyText,
      confidence,
      sources: matchedSources,
      detectedLanguage: detectedLang
    };
  }

  _logInteraction(log) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO ai_interaction_logs (
          tenant_id, sender_phone, input_type, user_input, detected_language,
          matched_sources_json, ai_reply, confidence, triggered_handoff, latency_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        log.tenantId || 1,
        log.senderPhone || 'unknown',
        log.inputType || 'TEXT',
        log.userInput || '',
        log.detectedLanguage || 'en',
        JSON.stringify(log.matchedSources || []),
        log.aiReply || '',
        log.confidence || 1.0,
        log.triggeredHandoff ? 1 : 0,
        log.latencyMs || 0
      );
    } catch (err) {
      console.warn('[TaskScopedAiAgent] Interaction log write error:', err.message);
    }
  }

  /**
   * Fetch recent AI interaction logs
   */
  getInteractionLogs(tenantId = 1, limit = 50) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM ai_interaction_logs
      WHERE tenant_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(tenantId, limit).map(row => {
      let matchedSources = [];
      try {
        matchedSources = typeof row.matched_sources_json === 'string' ? JSON.parse(row.matched_sources_json) : (row.matched_sources_json || []);
      } catch (e) {}
      return {
        ...row,
        matchedSources
      };
    });
  }
}

module.exports = new TaskScopedAiAgentService();
