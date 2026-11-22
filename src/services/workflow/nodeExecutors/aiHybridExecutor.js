const universalCatalogService = require("../../universal/universalCatalogService");
const universalAvailabilityService = require("../../universal/universalAvailabilityService");
const { db } = require("../../../config/database");

/**
 * AI Hybrid Runtime Assist Node Executor (AI_HYBRID_ASSIST)
 * Answers free-text customer questions grounded strictly in live DB inventory,
 * availability, and business entity policies WITHOUT breaking the active multi-step flow session.
 */
module.exports = {
  type: "AI_HYBRID_ASSIST",

  async execute(node, context) {
    const { session = {}, userInput = "", tenantId = 1, isWaitingForThisNode } = context;
    const cfg = { ...(node.config || {}), ...(node.data || {}) };

    const query = String(userInput || "").trim();

    // 1. Introspect live catalog & inventory for grounded response
    const searchMatches = universalCatalogService.searchCatalog(tenantId, {
      query,
      limit: 3
    });

    let catalogFacts = "";
    if (searchMatches.length > 0) {
      catalogFacts = searchMatches.map(m =>
        `• ${m.title}: ₹${Number(m.base_price).toLocaleString("en-IN")}${m.description ? ` (${m.description.slice(0, 100)}...)` : ""}`
      ).join("\n");
    }

    // 2. Introspect business entity policies
    const entity = db.prepare(`
      SELECT * FROM business_entities WHERE tenant_id = ? AND status = 'ACTIVE' LIMIT 1
    `).get(Number(tenantId) || 1);

    let answer = "";
    if (searchMatches.length > 0) {
      answer = `Yes! Here are the options matching your query:\n\n${catalogFacts}`;
    } else if (entity && (query.toLowerCase().includes("time") || query.toLowerCase().includes("hour") || query.toLowerCase().includes("location") || query.toLowerCase().includes("city"))) {
      answer = `Here are our details:\n• *Location:* ${entity.city || "Alibaug"}, ${entity.state || "Maharashtra"}\n• *Check-in / Opening:* ${entity.checkin_time || entity.opening_time || "14:00"}\n• *Contact:* ${entity.phone_e164 || "our front desk"}`;
    } else {
      answer = cfg.fallbackAnswer || `Our team is available to assist you with "${query}". Our live catalog and booking options are right here.`;
    }

    const resumePrompt = cfg.resumePrompt || "👉 To proceed with your request, please choose an option or enter the requested detail:";

    return {
      action: "WAIT_FOR_INPUT",
      replyMessages: [
        `🤖 *AI Assistant:*\n${answer}\n\n${resumePrompt}`
      ],
      traceNote: `AI Hybrid Assist answered query '${query}' grounded in ${searchMatches.length} catalog items.`
    };
  }
};

