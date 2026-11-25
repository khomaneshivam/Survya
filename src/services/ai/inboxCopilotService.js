/**
 * Inbox AI Copilot Service (SARVYA Agent Assistant)
 * Provides real-time assistance to human operators in InboxPage:
 * 1. `draftReply`: Generates 2 grounded, high-converting reply options (Concise & Commercial).
 * 2. `translateMessage`: Translates between English, Hindi, Marathi, and Hinglish.
 * 3. `summarizeThread`: Generates 3-bullet executive summary + urgency + recommended next step.
 */
const knowledgeRetrievalService = require('./knowledgeRetrievalService');
const voiceTranscriptionService = require('./voiceTranscriptionService');
const taskScopedAiAgentService = require('./taskScopedAiAgentService');
const config = require('../../config/env');

class InboxCopilotService {
  /**
   * Draft 2 contextual, grounded reply suggestions
   */
  async draftReply(params = {}) {
    const {
      conversationPhone = '',
      messages = [],
      tenantId = 1,
      customerName = 'Guest'
    } = params;

    const recent = Array.isArray(messages) ? messages.slice(-5) : [];
    const lastInbound = [...recent].reverse().find(m => !m.is_outbound) || recent[recent.length - 1];
    const userQuery = lastInbound?.text || lastInbound?.message_body || '';
    const detectedLang = voiceTranscriptionService.detectLanguageFromText(userQuery);
    const profile = taskScopedAiAgentService.resolveTenantAiProfile(tenantId);

    // Retrieve relevant knowledge
    const searchRes = knowledgeRetrievalService.search(userQuery || profile.domainLabel, tenantId, { topK: 3 });
    const topKnowledge = searchRes.matches[0];
    const topDetail = topKnowledge ? `${topKnowledge.title}: ${topKnowledge.content}` : '';

    const geminiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;

    if (geminiKey && userQuery) {
      try {
        const prompt = `You are ${profile.businessName}'s customer service ${profile.staffTitle} specializing in ${profile.domainLabel}.
Context from conversation:
Customer Name: ${customerName}
Last Message: "${userQuery}"
Detected Language: ${detectedLang}

Grounded Knowledge:
${searchRes.contextText || 'Standard business policies and catalog pricing apply.'}

Task: Provide 2 distinct reply suggestions in the customer's language (${detectedLang}).
Format strictly as JSON with keys:
{
  "optionA": { "label": "Friendly & Direct", "text": "..." },
  "optionB": { "label": "Detailed & Commercial", "text": "..." }
}`;

        const modelName = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, response_mime_type: 'application/json' }
          })
        });

        if (res.ok) {
          const resJson = await res.json();
          const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            return {
              success: true,
              suggestions: [
                { id: 'opt_a', label: parsed.optionA?.label || 'Friendly & Direct', text: parsed.optionA?.text || '' },
                { id: 'opt_b', label: parsed.optionB?.label || 'Detailed & Commercial', text: parsed.optionB?.text || '' }
              ],
              detectedLanguage: detectedLang,
              sources: searchRes.matches.map(m => m.reference)
            };
          }
        }
      } catch (err) {
        console.warn('[InboxCopilot] Gemini draft reply notice:', err.message);
      }
    }

    // Deterministic fallback suggestions
    let optAText = '';
    let optBText = '';

    if (detectedLang === 'hi' || detectedLang === 'hinglish') {
      optAText = `नमस्ते ${customerName}! आपकी पूछताछ के लिए धन्यवाद। ${topKnowledge ? topKnowledge.content : 'हम आपकी सहायता के लिए तैयार हैं।'} क्या आप बुकिंग के साथ आगे बढ़ना चाहेंगे?`;
      optBText = `नमस्ते ${customerName}, हमारे पास आपके लिए सर्वोत्तम विकल्प उपलब्ध हैं। ${topDetail} क्या मैं आपके लिए आज की बुकिंग सुनिश्चित कर दूँ?`;
    } else if (detectedLang === 'mr') {
      optAText = `नमस्कार ${customerName}! आपल्या विचारणेसाठी धन्यवाद. ${topKnowledge ? topKnowledge.content : 'आम्ही मदतीसाठी सदैव तत्पर आहोत.'} कृपया आरक्षणासाठी पुढील माहिती सांगा.`;
      optBText = `नमस्कार ${customerName}, आपल्या सेवेसाठी सर्वोत्तम पर्याय उपलब्ध आहेत. ${topDetail} आम्ही आपले बुकिंग आता निश्चित करू का?`;
    } else {
      optAText = `Hello ${customerName}! Thank you for reaching out. ${topKnowledge ? topKnowledge.content : 'We are delighted to assist you.'} Would you like to proceed with booking details?`;
      optBText = `Hi ${customerName}, here are the details for your stay: ${topDetail} Let me know if you would like me to reserve this for you right away!`;
    }

    return {
      success: true,
      suggestions: [
        { id: 'opt_a', label: 'Friendly & Direct', text: optAText },
        { id: 'opt_b', label: 'Detailed & Commercial', text: optBText }
      ],
      detectedLanguage: detectedLang,
      sources: searchRes.matches.map(m => m.reference)
    };
  }

  /**
   * Translate text between English, Hindi, and Marathi
   */
  async translateMessage(params = {}) {
    const { text = '', targetLanguage = 'en' } = params;
    if (!text || !text.trim()) {
      return { success: false, translatedText: '', targetLanguage };
    }

    const currentLang = voiceTranscriptionService.detectLanguageFromText(text);
    if (currentLang === targetLanguage) {
      return { success: true, translatedText: text, sourceLanguage: currentLang, targetLanguage };
    }

    const geminiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const langNames = { en: 'English', hi: 'Hindi (हिन्दी)', mr: 'Marathi (मराठी)', hinglish: 'Hinglish (Hindi in Latin script)' };
        const prompt = `Translate the following customer service text accurately into ${langNames[targetLanguage] || targetLanguage}. Preserve all names, dates, phone numbers, and numbers.
Text: "${text}"
Return ONLY the direct translated text.`;

        const modelName = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1 }
          })
        });

        if (res.ok) {
          const resJson = await res.json();
          const translated = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (translated) {
            return {
              success: true,
              translatedText: translated,
              sourceLanguage: currentLang,
              targetLanguage
            };
          }
        }
      } catch (err) {
        console.warn('[InboxCopilot] Gemini translation notice:', err.message);
      }
    }

    // Deterministic fallback dictionary / mock for common hospitality phrases
    const fallbackMap = {
      'en': {
        'namaste': 'Hello',
        'room khali hai kya': 'Are rooms available?',
        'kitna bhav hai': 'What is the price?',
        'shukriya': 'Thank you'
      },
      'hi': {
        'hello': 'नमस्ते',
        'are rooms available?': 'क्या कमरे उपलब्ध हैं?',
        'what is the price?': 'कमरे का किराया कितना है?',
        'thank you': 'धन्यवाद'
      },
      'mr': {
        'hello': 'नमस्कार',
        'are rooms available?': 'खोली उपलब्ध आहे का?',
        'what is the price?': 'दर काय आहे?',
        'thank you': 'धन्यवाद'
      }
    };

    const targetDict = fallbackMap[targetLanguage] || {};
    const lower = text.toLowerCase().trim();
    const translated = targetDict[lower] || text;

    return {
      success: true,
      translatedText: translated,
      sourceLanguage: currentLang,
      targetLanguage,
      isSimulated: true
    };
  }

  /**
   * Summarize a conversation thread for staff handover
   */
  async summarizeThread(params = {}) {
    const { messages = [], customerName = 'Guest', phone = '' } = params;
    const msgs = Array.isArray(messages) ? messages : [];

    if (msgs.length === 0) {
      return {
        success: true,
        bullets: ['No customer messages in this thread yet.'],
        urgency: 'LOW',
        sentiment: 'NEUTRAL',
        nextAction: 'Wait for customer message or send proactive greeting.'
      };
    }

    const conversationTranscript = msgs.slice(-10).map(m => {
      const sender = m.is_outbound ? 'Agent/Bot' : (customerName || 'Customer');
      const text = m.text || m.message_body || (m.media_type ? `[Media: ${m.media_type}]` : '');
      return `${sender}: ${text}`;
    }).join('\n');

    const geminiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        const prompt = `Analyze this WhatsApp customer thread.
Customer: ${customerName} (${phone})
Transcript:
${conversationTranscript}

Task: Return strictly JSON with:
{
  "bullets": ["Point 1: customer need", "Point 2: what was shared", "Point 3: pending question/blocker"],
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "sentiment": "POSITIVE" | "NEUTRAL" | "CONCERNED",
  "nextAction": "One clear action for human staff"
}`;

        const modelName = 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, response_mime_type: 'application/json' }
          })
        });

        if (res.ok) {
          const resJson = await res.json();
          const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            return {
              success: true,
              bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [parsed.bullets],
              urgency: parsed.urgency || 'MEDIUM',
              sentiment: parsed.sentiment || 'NEUTRAL',
              nextAction: parsed.nextAction || 'Reply to customer inquiry.'
            };
          }
        }
      } catch (err) {
        console.warn('[InboxCopilot] Gemini summarize notice:', err.message);
      }
    }

    // Deterministic rule-based summary
    const lastMsg = msgs[msgs.length - 1];
    const inboundCount = msgs.filter(m => !m.is_outbound).length;
    const outboundCount = msgs.filter(m => m.is_outbound).length;

    const bullets = [
      `Customer ${customerName || phone} initiated conversation (${inboundCount} inbound messages received).`,
      `Staff / automated bot responded with ${outboundCount} total dispatches.`,
      `Latest interaction: "${(lastMsg?.text || lastMsg?.message_body || 'Message received').substring(0, 80)}..."`
    ];

    return {
      success: true,
      bullets,
      urgency: inboundCount > outboundCount ? 'HIGH' : 'MEDIUM',
      sentiment: 'NEUTRAL',
      nextAction: 'Confirm customer selection and dispatch verified quote or details.'
    };
  }
}

module.exports = new InboxCopilotService();
