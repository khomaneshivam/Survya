/**
 * AI Flow Context Builder
 * Introspects live system capabilities, inventory, pipelines, templates,
 * and connected WhatsApp phone lines to ground the AI Flow Architect.
 */

const { db, getSetting } = require("../../config/database");
const crmPipelineService = require("../crmPipelineService");

/**
 * Builds the complete live system capabilities and resources context
 */
function buildSystemCapabilitiesContext(tenantId = 1, propertyId = 1) {
  const numericTenantId = Number(tenantId) || 1;
  const numericPropertyId = Number(propertyId) || 1;

  // 1. Business Entities (Resorts, Cafes, Entities)
  let businessEntities = [];
  try {
    businessEntities = db.prepare(`
      SELECT id, domain, name, legal_name, slug, phone_e164, city, currency
      FROM business_entities
      WHERE tenant_id = ? AND status = 'ACTIVE'
      ORDER BY id ASC
      LIMIT 10
    `).all(numericTenantId);
  } catch (e) {
    businessEntities = [];
  }

  // 2. Room Types & Rates
  let roomTypes = [];
  try {
    roomTypes = db.prepare(`
      SELECT id, name, room_code, base_rate, max_adults, max_children, bed_type, view_type
      FROM room_types
      WHERE tenant_id = ? AND property_id = ? AND active = 1
      ORDER BY id ASC
    `).all(numericTenantId, numericPropertyId);
  } catch (e) {
    roomTypes = [];
  }

  // 3. Catalog Items (Universal across all sectors)
  let catalogItems = [];
  try {
    catalogItems = db.prepare(`
      SELECT id, entity_id, item_type, title, slug, sku, base_price, compare_at_price, gst_percent, inventory_mode, category_name
      FROM catalog_items
      WHERE tenant_id = ? AND is_active = 1 AND delete_status = 0
      ORDER BY sort_order ASC, id ASC
      LIMIT 30
    `).all(numericTenantId);
  } catch (e) {
    catalogItems = [];
  }

  // 3b. Add-On Groups & Pricing Rules
  let addonGroups = [];
  try {
    addonGroups = db.prepare(`
      SELECT g.id, g.title, g.code, g.selection_type,
             (SELECT COUNT(*) FROM catalog_addons a WHERE a.group_id = g.id AND a.delete_status = 0) as addon_count
      FROM catalog_addon_groups g
      WHERE g.tenant_id = ? AND g.delete_status = 0
      LIMIT 10
    `).all(numericTenantId);
  } catch (e) {
    addonGroups = [];
  }

  let pricingRules = [];
  try {
    pricingRules = db.prepare(`
      SELECT id, title, rule_type, discount_mode, discount_value, promo_code
      FROM catalog_pricing_rules
      WHERE tenant_id = ? AND is_active = 1 AND delete_status = 0
      LIMIT 10
    `).all(numericTenantId);
  } catch (e) {
    pricingRules = [];
  }

  // 3b. Master Data Layer (Categories, Locations, Resources, Payment Modes)
  let masterDataBundle = null;
  try {
    const masterDataService = require("../masters/masterDataService");
    masterDataBundle = masterDataService.getMasterBundle(numericTenantId);
  } catch (e) {
    masterDataBundle = null;
  }

  // 4. Dynamic CRM Pipelines & Custom Fields Schema
  let crmPipelines = [];
  try {
    const rawPipelines = crmPipelineService.listPipelines(numericTenantId);
    crmPipelines = (rawPipelines || []).map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      industry_type: p.industry_type,
      stages: (p.stages || []).map(s => ({ key: s.key, label: s.label })),
      custom_fields: (p.custom_fields || []).map(f => ({ key: f.key, label: f.label, type: f.type, required: Boolean(f.required) }))
    }));
  } catch (e) {
    crmPipelines = [];
  }

  // 5. Approved Meta WhatsApp Message Templates
  let approvedTemplates = [];
  try {
    const rows = db.prepare(`
      SELECT id, name, language, category, body_text, buttons
      FROM templates
      WHERE (tenant_id = ? OR tenant_id = 1) AND status = 'APPROVED'
      ORDER BY name ASC
      LIMIT 20
    `).all(numericTenantId);

    approvedTemplates = rows.map(t => {
      let buttons = [];
      try { buttons = JSON.parse(t.buttons || "[]"); } catch (err) {}
      return {
        id: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        body_text: t.body_text,
        buttons
      };
    });
  } catch (e) {
    approvedTemplates = [];
  }

  // 6. Connected WhatsApp Business Phone Lines (Deduplicated by phone_number_id)
  let connectedPhoneNumbers = [];
  try {
    const rawPhones = db.prepare(`
      SELECT id, display_name, phone_number, phone_number_id, quality_rating, status, is_default
      FROM waba_phone_numbers
      WHERE delete_status = 0
      ORDER BY is_default DESC, id ASC
    `).all();
    const seenPhoneIds = new Set();
    connectedPhoneNumbers = rawPhones.filter(p => {
      const pid = p.phone_number_id || p.id;
      if (!pid || seenPhoneIds.has(pid)) return false;
      seenPhoneIds.add(pid);
      return true;
    });
  } catch (e) {
    connectedPhoneNumbers = [];
  }

  // 7. Canonical Modern Node Specifications & Valid Handles
  const canonicalNodes = [
    {
      type: "TRIGGER_WHATSAPP",
      description: "Entry trigger matching inbound customer messages by keyword, referral, or catch-all",
      handles: ["default"],
      configSchema: {
        triggerType: "KEYWORD | CATCH_ALL | CTWA_AD",
        keywords: ["array of trigger keywords"],
        matchType: "CONTAINS | EXACT | REGEX"
      }
    },
    {
      type: "TRIGGER_EVENT",
      description: "External API or webhook trigger",
      handles: ["default"],
      configSchema: {
        eventType: "WEBHOOK | ORDER_CREATED | PAYMENT_RECEIVED",
        secretToken: "string"
      }
    },
    {
      type: "SEND_MESSAGE",
      description: "Dispatches text or interactive WhatsApp buttons (max 3 buttons, max 20 chars per title)",
      handles: ["default", "button_option_ids..."],
      configSchema: {
        text: "Message body with {{variable}} placeholders",
        options: [{ id: "opt_id", title: "Max 20 chars" }]
      }
    },
    {
      type: "SEND_TEMPLATE",
      description: "Dispatches approved Meta HSM template",
      handles: ["default"],
      configSchema: {
        templateName: "template_name",
        language: "en",
        variables: {}
      }
    },
    {
      type: "COLLECT_INPUT",
      description: "Prompts user for input and validates dates, numbers, text, emails, or phone numbers",
      handles: ["valid", "max_retries"],
      configSchema: {
        variable: "variable_name",
        validationType: "DATE | NUMBER | EMAIL | PHONE | TEXT",
        promptText: "Question to ask user",
        retryPrompt: "Error prompt if validation fails",
        maxRetries: 3
      }
    },
    {
      type: "CONDITION",
      description: "Branching decision logic comparing variables",
      handles: ["true", "false"],
      configSchema: {
        rules: [{ variable: "budget", operator: "gte", value: 50000 }],
        matchMode: "ALL | ANY"
      }
    },
    {
      type: "SET_VARIABLE",
      description: "Sets or transforms session variables",
      handles: ["default"],
      configSchema: {
        variable: "var_name",
        value: "value or expression"
      }
    },
    {
      type: "WAIT_DELAY",
      description: "Asynchronous delay for drip marketing or follow-ups",
      handles: ["after_delay", "early_reply"],
      configSchema: {
        delayAmount: 1,
        delayUnit: "HOURS | MINUTES | DAYS",
        cancelOnReply: true
      }
    },
    {
      type: "CRM_UPSERT",
      description: "Upserts contact/lead/deal into dynamic CRM pipeline",
      handles: ["success", "failure"],
      configSchema: {
        pipeline: "pipeline-slug",
        stage: "STAGE_KEY",
        leadScore: 10,
        dealValue: 5000,
        customFields: {}
      }
    },
    {
      type: "MASTER_PICKER",
      description: "Presents dynamically resolved master options (categories, locations, resources/doctors/staff, payment modes) as WhatsApp quick-reply buttons (2-3) or interactive list menu (4-10) with auto-advance on single option",
      handles: ["opt_<value>", "empty", "default"],
      configSchema: {
        masterType: "master_categories | master_locations | master_resources | master_payment_modes | master_status_tags | master_attributes",
        promptText: "Please select an option:",
        outputVariable: "selected_category",
        filterCriteria: {},
        autoAdvanceOnSingle: true
      }
    },
    {
      type: "CATALOG_BROWSER",
      description: "Interactive catalog browsing with WhatsApp list/buttons, filters, and prices with master unit labels",
      handles: ["item_selected", "selected", "empty", "default"],
      configSchema: {
        title: "Catalog title",
        pageSize: 6,
        categoryName: "string",
        inventoryMode: "UNIT_STOCK | TIME_SLOT | DATE_RANGE | QUOTE_SERVICE"
      }
    },
    {
      type: "ADDON_UPSELL_AND_QUOTE",
      description: "Presents signature add-on upsells, 15-min atomic inventory hold, dynamic GST quote calculation, and order/payment buttons",
      handles: ["confirmed", "unavailable", "add_more", "handoff", "default"],
      configSchema: {
        title: "Add-on title",
        allowAddons: true,
        allowPromoCode: true
      }
    },
    {
      type: "AI_HYBRID_ASSIST",
      description: "Answers free-text customer queries grounded in live masters & catalog without breaking active flow session",
      handles: ["matched_item", "answered", "handoff", "default"],
      configSchema: {
        resumePrompt: "Prompt to continue active flow"
      }
    },
    {
      type: "CATALOG_BOOKING",
      description: "Direct inventory lookup, quote calculation, and booking creation",
      handles: ["available", "unavailable"],
      configSchema: {
        action: "HOSPITALITY_CHECK_AVAILABILITY | HOSPITALITY_CALCULATE_QUOTE | HOSPITALITY_CREATE_ENQUIRY | GENERATE_PAYMENT_LINK",
        checkinVar: "check_in_date",
        checkoutVar: "check_out_date",
        guestsVar: "guest_count"
      }
    },
    {
      type: "HTTP_WEBHOOK",
      description: "Makes outbound HTTP POST/GET request to 3rd party API",
      handles: ["success", "failure"],
      configSchema: {
        url: "https://api.example.com",
        method: "POST",
        headers: {},
        bodyTemplate: "{}"
      }
    },
    {
      type: "HUMAN_HANDOFF",
      description: "Transfers conversation to live human agent and pauses automated bot",
      handles: [],
      configSchema: {
        reason: "Customer requested human support",
        department: "RESERVATIONS | SALES | SUPPORT",
        message: "Connecting you with our team..."
      }
    },
    {
      type: "END",
      description: "Terminates conversation session gracefully",
      handles: [],
      configSchema: {
        farewellMessage: "Thank you for contacting us!"
      }
    }
  ];

  // 8. AI Provider Credentials Status
  const aiProvider = getSetting("AI_PROVIDER") || "GEMINI";
  const geminiKey = getSetting("GEMINI_API_KEY") || process.env.GEMINI_API_KEY || "";
  const openAiKey = getSetting("OPENAI_API_KEY") || process.env.OPENAI_API_KEY || "";
  const geminiModel = getSetting("GEMINI_MODEL") || "gemini-1.5-flash";
  const openAiModel = getSetting("OPENAI_MODEL") || "gpt-4o-mini";

  const hasApiKey = (aiProvider === "OPENAI" && Boolean(openAiKey)) ||
                    (aiProvider === "GEMINI" && Boolean(geminiKey)) ||
                    Boolean(geminiKey) || Boolean(openAiKey);

  return {
    tenantId: numericTenantId,
    propertyId: numericPropertyId,
    businessEntities,
    roomTypes,
    catalogItems,
    addonGroups,
    pricingRules,
    masters: masterDataBundle,
    crmPipelines,
    approvedTemplates,
    connectedPhoneNumbers,
    canonicalNodes,
    aiConfig: {
      provider: aiProvider,
      hasApiKey,
      geminiModel,
      openAiModel,
      hasGeminiKey: Boolean(geminiKey),
      hasOpenAiKey: Boolean(openAiKey)
    }
  };
}

module.exports = {
  buildSystemCapabilitiesContext
};
