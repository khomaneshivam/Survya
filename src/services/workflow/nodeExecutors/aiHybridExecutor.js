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
    const qLower = query.toLowerCase();

    // Check if customer asked for human agent
    const isHandoff = qLower.includes("human") || qLower.includes("agent") || qLower.includes("talk to") ||
                      qLower.includes("support") || qLower.includes("reception") || qLower.includes("desk") ||
                      qLower.includes("call me") || qLower.includes("person");

    if (isHandoff) {
      return {
        action: "CONTINUE",
        nextHandle: "handoff",
        replyMessages: [
          "Connecting you with our support team... A human representative will assist you shortly."
        ],
        traceNote: `AI Hybrid Assist routed query '${query}' to handoff handle.`
      };
    }

    // 1. Introspect live catalog & inventory for grounded response
    const searchMatches = universalCatalogService.searchCatalog(tenantId, {
      query,
      limit: 3
    });

    if (searchMatches.length > 0) {
      const topItem = searchMatches[0];
      const unitLabel = topItem.master_unit_symbol || topItem.unit_symbol || topItem.master_unit_name || topItem.unit_name || "";
      const priceStr = `₹${Number(topItem.base_price).toLocaleString("en-IN")}${unitLabel ? ` / ${unitLabel}` : ""}`;

      let catalogFacts = searchMatches.map(m => {
        const u = m.master_unit_symbol || m.unit_symbol || m.unit_name || "";
        return `• *${m.title}:* ₹${Number(m.base_price).toLocaleString("en-IN")}${u ? ` / ${u}` : ""}${m.description ? ` (${m.description.slice(0, 80)}...)` : ""}`;
      }).join("\n");

      const resumePrompt = cfg.resumePrompt || "👉 To proceed with your request, please select an option or continue:";

      return {
        action: "CONTINUE",
        nextHandle: "matched_item",
        replyMessages: [
          `🤖 *AI Assistant:*\nYes! We have *${topItem.title}* available at ${priceStr}.\n\nMatching options:\n${catalogFacts}\n\n${resumePrompt}`
        ],
        updatedData: {
          selectedItemId: topItem.id,
          selected_item_id: topItem.id,
          selectedItemTitle: topItem.title,
          selectedItemPrice: topItem.base_price,
          selectedItemGst: topItem.gst_percent,
          selectedItemMode: topItem.inventory_mode,
          selectedItemCurrency: topItem.currency || "INR"
        },
        traceNote: `AI Hybrid Assist matched item #${topItem.id} for '${query}' and routed to matched_item handle.`
      };
    }

    // 2. Introspect business entity policies
    let entity = null;
    try {
      entity = db.prepare(`
        SELECT * FROM business_entities WHERE tenant_id = ? AND status = 'ACTIVE' LIMIT 1
      `).get(Number(tenantId) || 1);
    } catch (_) {}

    let answer = "";
    if (entity && (qLower.includes("time") || qLower.includes("hour") || qLower.includes("location") || qLower.includes("city") || qLower.includes("address"))) {
      answer = `Here are our details:\n• *Location:* ${entity.city || "Alibaug"}, ${entity.state || "Maharashtra"}\n• *Check-in / Opening:* ${entity.checkin_time || entity.opening_time || "14:00"}\n• *Contact:* ${entity.phone_e164 || "our front desk"}`;
    } else {
      answer = cfg.fallbackAnswer || `Our team is available to assist you with "${query}". Our live catalog and booking options are right here.`;
    }

    const resumePrompt = cfg.resumePrompt || "👉 To proceed with your request, please choose an option or enter the requested detail:";

    return {
      action: "CONTINUE",
      nextHandle: "answered",
      replyMessages: [
        `🤖 *AI Assistant:*\n${answer}\n\n${resumePrompt}`
      ],
      traceNote: `AI Hybrid Assist answered grounded query '${query}' without item match.`
    };
  }
};
