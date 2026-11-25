const universalCatalogService = require("../../universal/universalCatalogService");
const universalAvailabilityService = require("../../universal/universalAvailabilityService");
const taskScopedAiAgentService = require("../../ai/taskScopedAiAgentService");
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

    const { cleanInput: query, injectionDetected } = taskScopedAiAgentService.sanitizeAiUserInput(String(userInput || ""));
    const qLower = query.toLowerCase();
    const profile = taskScopedAiAgentService.resolveTenantAiProfile(tenantId);

    if (injectionDetected) {
      return {
        action: "CONTINUE",
        nextHandle: "handoff",
        replyMessages: [
          `Pricing and bookings can only be confirmed through authorized workflows. Connecting you with our ${profile.staffTitle}.`
        ],
        traceNote: `AI Hybrid Assist blocked prompt-injection/mutation attempt and routed to handoff.`
      };
    }

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
      const locationStr = [entity.city, entity.state].filter(Boolean).join(", ") || "Not specified";
      const timingStr = entity.checkin_time || entity.opening_time || "Standard business hours";
      answer = `Here are our details for *${entity.name || profile.businessName}*:\n• *Location:* ${locationStr}\n• *Hours / Timing:* ${timingStr}\n• *Contact:* ${entity.phone_e164 || `our ${profile.staffTitle}`}`;
    } else {
      answer = cfg.fallbackAnswer || `Our team is available to assist you with "${query}". Our live catalog and options are right here.`;
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
