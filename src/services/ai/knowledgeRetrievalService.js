/**
 * Knowledge Retrieval Service (SARVYA Task-Scoped RAG)
 * High-performance, zero-external-dependency BM25 retrieval engine grounded in:
 * 1. Tenant Knowledge Base (`ai_knowledge_sources`)
 * 2. Live Catalog Items & Categories (`catalog_items`, `catalog_categories`)
 * 3. Live Room Inventory & Types (`room_types`)
 */
const { getDb } = require('../../config/database');

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do',
  'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had',
  'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves', 'please', 'tell'
]);

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  // Clean punctuation but keep Hindi/Marathi devanagari characters and alphanumeric words
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  return cleaned
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

class KnowledgeRetrievalService {
  /**
   * Fetch all grounded knowledge corpus for a tenant:
   * - Curated FAQ / Documents
   * - Real-time Catalog Items
   * - Real-time Room Types
   */
  loadCorpus(tenantId = 1, options = { includeCatalog: true }) {
    const db = getDb();
    const documents = [];

    // 1. Curated Tenant Knowledge Sources
    try {
      const sources = db.prepare(`
        SELECT id, title, source_type, content_text, tags_json
        FROM ai_knowledge_sources
        WHERE tenant_id = ? AND active_status = 1 AND delete_status = 0
        ORDER BY id ASC
      `).all(tenantId);

      for (const s of sources) {
        let tags = [];
        try {
          tags = typeof s.tags_json === 'string' ? JSON.parse(s.tags_json) : (s.tags_json || []);
        } catch (e) {}

        documents.push({
          id: `know_${s.id}`,
          sourceType: s.source_type,
          title: s.title,
          content: s.content_text,
          tags: Array.isArray(tags) ? tags : [],
          reference: `Knowledge: ${s.title}`
        });
      }
    } catch (err) {
      console.warn('[KnowledgeRetrieval] Knowledge sources query note:', err.message);
    }

    if (options.includeCatalog !== false) {
      // 2. Live Catalog Items (Food, Retail, Services)
      try {
        const items = db.prepare(`
          SELECT ci.id, ci.title, ci.item_type, ci.base_price, ci.short_description,
                 ci.description, ci.dietary_flag, ci.bed_type, cc.name as category_name
          FROM catalog_items ci
          LEFT JOIN catalog_categories cc ON ci.category_id = cc.id
          WHERE ci.tenant_id = ? AND ci.delete_status = 0 AND ci.is_active = 1
        `).all(tenantId);

        for (const item of items) {
          const cat = item.category_name ? `Category: ${item.category_name}. ` : '';
          const diet = item.dietary_flag && item.dietary_flag !== 'NONE' ? `Dietary: ${item.dietary_flag}. ` : '';
          const desc = item.description || item.short_description || '';
          const content = `${item.title} (${item.item_type}). ${cat}${diet}Price: ₹${item.base_price}. ${desc}`.trim();

          documents.push({
            id: `catalog_${item.id}`,
            sourceType: 'CATALOG_SYNC',
            title: item.title,
            content,
            tags: [item.item_type, item.category_name, 'catalog', 'pricing'].filter(Boolean),
            reference: `Catalog Item: ${item.title} (₹${item.base_price})`
          });
        }
      } catch (err) {
        console.warn('[KnowledgeRetrieval] Catalog items query note:', err.message);
      }

      // 3. Live Room Types (Hospitality & Accommodation)
      try {
        const rooms = db.prepare(`
          SELECT id, name, base_rate, max_occupancy, bed_type, view_type, description, amenities_json
          FROM room_types
          WHERE tenant_id = ? AND delete_status = 0 AND active = 1
        `).all(tenantId);

        for (const r of rooms) {
          let amenities = [];
          try {
            amenities = typeof r.amenities_json === 'string' ? JSON.parse(r.amenities_json) : (r.amenities_json || []);
          } catch (e) {}

          const amenStr = Array.isArray(amenities) && amenities.length > 0 ? `Amenities: ${amenities.join(', ')}. ` : '';
          const viewStr = r.view_type ? `View: ${r.view_type}. ` : '';
          const bedStr = r.bed_type ? `Bedding: ${r.bed_type}. ` : '';
          const occStr = r.max_occupancy ? `Max Occupancy: ${r.max_occupancy} guests. ` : '';
          const desc = r.description || '';
          const content = `${r.name} Room. Tariff: ₹${r.base_rate}/night. ${occStr}${bedStr}${viewStr}${amenStr}${desc}`.trim();

          documents.push({
            id: `room_${r.id}`,
            sourceType: 'CATALOG_SYNC',
            title: `${r.name} Room`,
            content,
            tags: ['room', 'hotel', 'stay', 'tariff', 'booking', ...(Array.isArray(amenities) ? amenities : [])],
            reference: `Room Type: ${r.name} (₹${r.base_rate}/night)`
          });
        }
      } catch (err) {
        console.warn('[KnowledgeRetrieval] Room types query note:', err.message);
      }
    }

    return documents;
  }

  /**
   * Search knowledge base using BM25 scoring algorithm
   */
  search(query, tenantId = 1, options = {}) {
    const topK = options.topK || 4;
    const documents = this.loadCorpus(tenantId, options);
    if (!documents || documents.length === 0) {
      return {
        query,
        matches: [],
        bestConfidence: 0.0,
        contextText: ''
      };
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return {
        query,
        matches: [],
        bestConfidence: 0.0,
        contextText: ''
      };
    }

    // Compute document token distributions
    const docTokensList = [];
    const docTermFreqs = [];
    let totalLength = 0;

    for (const doc of documents) {
      const fullText = `${doc.title} ${doc.tags.join(' ')} ${doc.content}`;
      const tokens = tokenize(fullText);
      docTokensList.push(tokens);
      totalLength += tokens.length;

      const tf = new Map();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
      }
      docTermFreqs.push(tf);
    }

    const N = documents.length;
    const avgDocLength = totalLength / (N || 1);
    const k1 = 1.2;
    const b = 0.75;

    // Document frequencies for query tokens
    const df = new Map();
    for (const qToken of queryTokens) {
      let count = 0;
      for (const tf of docTermFreqs) {
        if (tf.has(qToken)) count++;
      }
      df.set(qToken, count);
    }

    // Score documents
    const scored = [];
    const queryLower = query.toLowerCase();

    for (let i = 0; i < N; i++) {
      const doc = documents[i];
      const tf = docTermFreqs[i];
      const docLen = docTokensList[i].length;
      let score = 0.0;

      for (const qToken of queryTokens) {
        const freq = tf.get(qToken) || 0;
        if (freq === 0) continue;

        const docFreq = df.get(qToken) || 0;
        const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
        const num = freq * (k1 + 1);
        const denom = freq + k1 * (1 - b + b * (docLen / (avgDocLength || 1)));
        score += idf * (num / denom);
      }

      // Title or phrase match boost
      if (doc.title && queryLower.includes(doc.title.toLowerCase())) {
        score += 3.5;
      }
      for (const tag of doc.tags) {
        if (typeof tag === 'string' && queryLower.includes(tag.toLowerCase())) {
          score += 1.5;
        }
      }

      if (score > 0) {
        scored.push({
          ...doc,
          score
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, topK);

    // Normalize confidence score between 0.0 and 0.98
    let bestConfidence = 0.0;
    if (topMatches.length > 0) {
      const maxScore = topMatches[0].score;
      // Heuristic: a strong BM25 match with 2+ overlapping keywords typically reaches score >= 3.0
      bestConfidence = Math.min(0.98, Number((maxScore / (maxScore + 2.0)).toFixed(2)));
    }

    const contextText = topMatches
      .map((m, idx) => `[Source ${idx + 1}: ${m.reference}]\n${m.content}`)
      .join('\n\n');

    return {
      query,
      matches: topMatches,
      bestConfidence,
      contextText
    };
  }
}

module.exports = new KnowledgeRetrievalService();
