/**
 * AI Flow Generator Service
 * Grounded Prompt-to-Workflow Engine for SARVYA
 * Synthesizes validated, executable multi-branch flows grounded in live system inventory,
 * CRM pipelines, and connected WhatsApp lines.
 */

const { getSetting } = require("../../config/database");
const { buildSystemCapabilitiesContext } = require("./aiFlowContextBuilder");
const flowService = require("../conversationFlowService");

/**
 * Automatically calculates visual layout positions for a node graph
 */
function applyHierarchicalLayout(nodes = [], transitions = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];

  const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
  const adj = new Map();
  const inDegree = new Map();

  nodes.forEach(n => {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  transitions.forEach(t => {
    const src = t.source || t.from;
    const tgt = t.target || t.to;
    if (adj.has(src) && inDegree.has(tgt)) {
      adj.get(src).push(tgt);
      inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
    }
  });

  // Find root nodes (inDegree === 0 or trigger nodes)
  const roots = nodes.filter(n => inDegree.get(n.id) === 0 || n.type.startsWith("TRIGGER_"));
  const queue = roots.map(r => ({ id: r.id, level: 0, branchIndex: 0 }));
  const levels = new Map();
  const visited = new Set();

  while (queue.length > 0) {
    const { id, level, branchIndex } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(id);

    const children = adj.get(id) || [];
    children.forEach((childId, idx) => {
      queue.push({ id: childId, level: level + 1, branchIndex: idx });
    });
  }

  // Any unvisited nodes
  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      const maxLvl = Math.max(0, ...Array.from(levels.keys())) + 1;
      if (!levels.has(maxLvl)) levels.set(maxLvl, []);
      levels.get(maxLvl).push(n.id);
      visited.add(n.id);
    }
  });

  const layoutedNodes = [];
  const LEVEL_HEIGHT = 160;
  const NODE_SPACING_X = 320;
  const START_X = 350;
  const START_Y = 60;

  levels.forEach((nodeIds, level) => {
    const totalWidth = (nodeIds.length - 1) * NODE_SPACING_X;
    const levelStartX = START_X - (totalWidth / 2);

    nodeIds.forEach((id, idx) => {
      const original = nodeMap.get(id);
      const x = Math.round(levelStartX + (idx * NODE_SPACING_X));
      const y = Math.round(START_Y + (level * LEVEL_HEIGHT));

      layoutedNodes.push({
        ...original,
        position: { x, y }
      });
    });
  });

  return layoutedNodes;
}

/**
 * Smart Deterministic Fallback Generator
 * Synthesizes grounded, fully valid workflows from prompt keywords
 * without needing an external API key or internet access.
 */
function synthesizeSmartLocalFlow(prompt = "", systemContext = {}) {
  const p = String(prompt || "").toLowerCase();
  const { roomTypes = [], businessEntities = [], crmPipelines = [], catalogItems = [] } = systemContext;

  let configuredBusinessName = "Hotel Green Vally";
  try {
    const { getSetting } = require("../../config/database");
    configuredBusinessName = getSetting("BOT_BUSINESS_NAME") || "Hotel Green Vally";
  } catch (e) {}

  const defaultRoom = roomTypes[0] || { id: 1, name: "Deluxe Sea View Room", base_rate: 4500 };
  const primaryEntity = businessEntities[0] || { name: configuredBusinessName, city: "Alibaug" };
  if (!primaryEntity.name || primaryEntity.name === "KonkanTrip Beach Resort & Spa") {
    primaryEntity.name = configuredBusinessName;
  }
  const b2bPipeline = crmPipelines.find(pip => pip.slug === "b2b-sales-pipeline" || pip.industry_type === "B2B_SALES") || { slug: "b2b-sales-pipeline", id: 1 };
  const leadPipeline = crmPipelines.find(pip => pip.slug === "lead-generation-pipeline" || pip.industry_type === "LEAD_GEN") || { slug: "lead-generation-pipeline", id: 2 };
  const bookingPipeline = crmPipelines.find(pip => pip.slug === "universal-booking-pipeline" || pip.industry_type === "BOOKING") || { slug: "universal-booking-pipeline", id: 3 };

  // 1. HOSPITALITY / HOTEL / RESORT / ROOM BOOKING
  if (p.includes("book") || p.includes("hotel") || p.includes("resort") || p.includes("room") || p.includes("stay") || p.includes("villa")) {
    const flowName = "Universal Room Booking & Direct Tariff Concierge";
    const flowDesc = `Automated room booking flow grounded with ${defaultRoom.name} live availability, GST quote calculation, CRM logging, and instant booking hold.`;
    const triggerKeywords = ["book", "stay", "room", "reservation", "tariff"];

    const nodes = [
      {
        id: "trg_booking",
        type: "TRIGGER_WHATSAPP",
        title: "WhatsApp Booking Trigger",
        config: {
          triggerType: "KEYWORD",
          keywords: triggerKeywords,
          matchType: "CONTAINS"
        }
      },
      {
        id: "msg_welcome",
        type: "SEND_MESSAGE",
        title: "Welcome & Room Showcase",
        config: {
          text: `Namaste! Welcome to ${primaryEntity.name}. We are delighted to host your upcoming beach getaway.\n\nOur featured accommodation: *${defaultRoom.name}* (starting from ₹${defaultRoom.base_rate}/night + GST).\n\nLet's check availability for your planned dates.`,
          options: [
            { id: "opt_check_dates", title: "📅 Check Dates" },
            { id: "opt_explore_villas", title: "🏖️ View Rooms" },
            { id: "opt_talk_agent", title: "👤 Talk to Host" }
          ]
        }
      },
      {
        id: "input_checkin",
        type: "COLLECT_INPUT",
        title: "Collect Check-in Date",
        config: {
          variable: "check_in_date",
          validationType: "DATE",
          promptText: "Please share your planned *Check-in Date* (e.g. 2026-12-05, tomorrow, or next Friday):",
          retryPrompt: "Please provide a valid date for check-in (e.g. 2026-12-05 or DD-MM-YYYY):",
          maxRetries: 3
        }
      },
      {
        id: "input_checkout",
        type: "COLLECT_INPUT",
        title: "Collect Check-out Date",
        config: {
          variable: "check_out_date",
          validationType: "DATE",
          promptText: "Great! And what is your planned *Check-out Date*?",
          retryPrompt: "Please enter a valid check-out date:",
          maxRetries: 3
        }
      },
      {
        id: "input_guests",
        type: "COLLECT_INPUT",
        title: "Collect Guest Count",
        config: {
          variable: "guest_count",
          validationType: "NUMBER",
          promptText: "How many guests will be staying with us? (e.g., 2)",
          retryPrompt: "Please specify the total number of guests:",
          maxRetries: 3
        }
      },
      {
        id: "action_check_avail",
        type: "CATALOG_BOOKING",
        title: "Live Inventory & Tariff Check",
        config: {
          action: "HOSPITALITY_CHECK_AVAILABILITY",
          checkinVar: "check_in_date",
          checkoutVar: "check_out_date",
          guestsVar: "guest_count",
          roomTypeId: defaultRoom.id
        }
      },
      {
        id: "msg_quote_available",
        type: "SEND_MESSAGE",
        title: "Instant Tariff Quote & Reserve",
        config: {
          text: `🎉 Good news! *${defaultRoom.name}* is *AVAILABLE* for your stay from {{check_in_date}} to {{check_out_date}}.\n\n` +
                `• Room: ${defaultRoom.name}\n` +
                `• Rate: ₹${defaultRoom.base_rate}/night\n` +
                `• Inclusions: Complimentary breakfast, beach access & WiFi\n\n` +
                `Would you like to reserve this room or request a customized package?`,
          options: [
            { id: "opt_book_now", title: "✅ Reserve Room" },
            { id: "opt_ask_questions", title: "💬 Ask Questions" }
          ]
        }
      },
      {
        id: "crm_log_booking_lead",
        type: "CRM_UPSERT",
        title: "Log Booking Lead in CRM",
        config: {
          pipeline: bookingPipeline.slug || "universal-booking-pipeline",
          stage: "QUOTED",
          dealValue: defaultRoom.base_rate * 2,
          leadScore: 85,
          customFields: {
            room_type: defaultRoom.name,
            check_in: "{{check_in_date}}",
            check_out: "{{check_out_date}}",
            guests: "{{guest_count}}"
          }
        }
      },
      {
        id: "wait_booking_followup",
        type: "WAIT_DELAY",
        title: "1-Hour Reminder Delay",
        config: {
          delayAmount: 1,
          delayUnit: "HOURS",
          cancelOnReply: true
        }
      },
      {
        id: "msg_followup_reminder",
        type: "SEND_MESSAGE",
        title: "Follow-up Reminder",
        config: {
          text: `Hi {{name}}! Just checking in to see if you would like us to hold *${defaultRoom.name}* for your dates ({{check_in_date}} - {{check_out_date}}). We are here to assist!`,
          options: [
            { id: "opt_confirm_hold", title: "🔒 Hold Room" },
            { id: "opt_speak_concierge", title: "👤 Speak to Host" }
          ]
        }
      },
      {
        id: "handoff_agent",
        type: "HUMAN_HANDOFF",
        title: "Live Concierge Handoff",
        config: {
          reason: "Guest requested personalized booking assistance",
          department: "RESERVATIONS",
          message: "A dedicated reservation executive from our resort has been notified and will assist you shortly!"
        }
      },
      {
        id: "end_flow",
        type: "END",
        title: "Booking Completed",
        config: {
          farewellMessage: `Thank you for choosing ${primaryEntity.name}! Have a fantastic day.`
        }
      }
    ];

    const transitions = [
      { id: "t1", source: "trg_booking", target: "msg_welcome", sourceHandle: "default" },
      { id: "t2", source: "msg_welcome", target: "input_checkin", sourceHandle: "opt_check_dates" },
      { id: "t3", source: "msg_welcome", target: "input_checkin", sourceHandle: "opt_explore_villas" },
      { id: "t4", source: "msg_welcome", target: "handoff_agent", sourceHandle: "opt_talk_agent" },
      { id: "t5", source: "msg_welcome", target: "input_checkin", sourceHandle: "default" },
      { id: "t6", source: "input_checkin", target: "input_checkout", sourceHandle: "valid" },
      { id: "t7", source: "input_checkin", target: "handoff_agent", sourceHandle: "max_retries" },
      { id: "t8", source: "input_checkout", target: "input_guests", sourceHandle: "valid" },
      { id: "t9", source: "input_checkout", target: "handoff_agent", sourceHandle: "max_retries" },
      { id: "t10", source: "input_guests", target: "action_check_avail", sourceHandle: "valid" },
      { id: "t11", source: "input_guests", target: "action_check_avail", sourceHandle: "max_retries" },
      { id: "t12", source: "action_check_avail", target: "msg_quote_available", sourceHandle: "available" },
      { id: "t13", source: "action_check_avail", target: "handoff_agent", sourceHandle: "unavailable" },
      { id: "t14", source: "msg_quote_available", target: "crm_log_booking_lead", sourceHandle: "default" },
      { id: "t15", source: "msg_quote_available", target: "crm_log_booking_lead", sourceHandle: "opt_book_now" },
      { id: "t16", source: "msg_quote_available", target: "handoff_agent", sourceHandle: "opt_ask_questions" },
      { id: "t17", source: "crm_log_booking_lead", target: "wait_booking_followup", sourceHandle: "success" },
      { id: "t18", source: "crm_log_booking_lead", target: "end_flow", sourceHandle: "failure" },
      { id: "t19", source: "wait_booking_followup", target: "msg_followup_reminder", sourceHandle: "after_delay" },
      { id: "t20", source: "wait_booking_followup", target: "end_flow", sourceHandle: "early_reply" },
      { id: "t21", source: "msg_followup_reminder", target: "handoff_agent", sourceHandle: "opt_confirm_hold" },
      { id: "t22", source: "msg_followup_reminder", target: "handoff_agent", sourceHandle: "opt_speak_concierge" },
      { id: "t23", source: "msg_followup_reminder", target: "end_flow", sourceHandle: "default" }
    ];

    const variables = {
      check_in_date: "",
      check_out_date: "",
      guest_count: 2,
      room_type: defaultRoom.name,
      base_rate: defaultRoom.base_rate
    };

    return {
      name: flowName,
      description: flowDesc,
      category: "HOSPITALITY_ENQUIRY",
      triggerKeywords,
      nodes,
      transitions,
      variables
    };
  }

  // 2. B2B SALES / QUALIFICATION / DEMO FLOW
  if (p.includes("b2b") || p.includes("sales") || p.includes("qualification") || p.includes("enterprise") || p.includes("demo") || p.includes("saas")) {
    const flowName = "B2B Sales Qualification & High-Value Demo Routing";
    const flowDesc = "Qualifies inbound enterprise prospects by company size and monthly budget, routes SQL leads to Account Executives, and creates dynamic CRM deals.";
    const triggerKeywords = ["demo", "sales", "enterprise", "pricing", "b2b"];

    const nodes = [
      {
        id: "trg_b2b",
        type: "TRIGGER_WHATSAPP",
        title: "B2B Demo Trigger",
        config: {
          triggerType: "KEYWORD",
          keywords: triggerKeywords,
          matchType: "CONTAINS"
        }
      },
      {
        id: "msg_b2b_welcome",
        type: "SEND_MESSAGE",
        title: "Executive Greeting",
        config: {
          text: "Welcome to SARVYA Enterprise Solutions! We help businesses automate customer acquisition and bookings on WhatsApp.\n\nTo tailor your demo and pricing, I have just 3 quick questions.",
          options: [
            { id: "opt_start_qual", title: "🚀 Start Demo Qs" },
            { id: "opt_talk_sales", title: "👤 Speak to AE" }
          ]
        }
      },
      {
        id: "input_company",
        type: "COLLECT_INPUT",
        title: "Collect Company Name",
        config: {
          variable: "company_name",
          validationType: "TEXT",
          promptText: "What is your *Company Name* and primary industry?",
          retryPrompt: "Please share your company name:",
          maxRetries: 3
        }
      },
      {
        id: "input_team_size",
        type: "COLLECT_INPUT",
        title: "Collect Team Size",
        config: {
          variable: "team_size",
          validationType: "NUMBER",
          promptText: "Approximately how many members are on your sales/ops team? (e.g. 5, 25, 100):",
          retryPrompt: "Please provide your approximate team size:",
          maxRetries: 3
        }
      },
      {
        id: "input_budget",
        type: "COLLECT_INPUT",
        title: "Collect Monthly Budget",
        config: {
          variable: "monthly_budget",
          validationType: "NUMBER",
          promptText: "What is your planned monthly automation/marketing budget in ₹? (e.g., 25000):",
          retryPrompt: "Please provide a numeric monthly budget in ₹:",
          maxRetries: 3
        }
      },
      {
        id: "cond_high_value",
        type: "CONDITION",
        title: "Enterprise SQL Branch",
        config: {
          rules: [{ variable: "monthly_budget", operator: "gte", value: 20000 }],
          matchMode: "ALL"
        }
      },
      {
        id: "crm_upsert_sql",
        type: "CRM_UPSERT",
        title: "Create Enterprise SQL Deal",
        config: {
          pipeline: b2bPipeline.slug || "b2b-sales-pipeline",
          stage: "SQL",
          leadScore: 90,
          dealValue: 120000,
          customFields: {
            company_name: "{{company_name}}",
            team_size: "{{team_size}}",
            monthly_budget: "{{monthly_budget}}",
            priority_tier: "ENTERPRISE_HIGH_VALUE"
          }
        }
      },
      {
        id: "msg_sql_demo_booked",
        type: "SEND_MESSAGE",
        title: "VIP Demo Confirmed",
        config: {
          text: "🌟 Fantastic! Based on your scale and budget, you qualify for our *VIP Enterprise Acceleration Plan*.\n\nAn Enterprise Account Executive is reviewing your profile and will connect with your tailored solution proposal within 15 minutes.",
          options: [
            { id: "opt_vip_call", title: "📞 Connect Now" },
            { id: "opt_view_deck", title: "📑 View Pitch Deck" }
          ]
        }
      },
      {
        id: "crm_upsert_mql",
        type: "CRM_UPSERT",
        title: "Create Growth MQL Lead",
        config: {
          pipeline: b2bPipeline.slug || "b2b-sales-pipeline",
          stage: "MQL",
          leadScore: 50,
          dealValue: 25000,
          customFields: {
            company_name: "{{company_name}}",
            team_size: "{{team_size}}",
            monthly_budget: "{{monthly_budget}}",
            priority_tier: "GROWTH_STANDARD"
          }
        }
      },
      {
        id: "msg_mql_starter",
        type: "SEND_MESSAGE",
        title: "Growth Self-Serve Tour",
        config: {
          text: "Thank you for the details! You are a great fit for our *Growth Pro Suite*. Here is our interactive product tour and instant setup guide: https://sarvya.flex-us.in/tour",
          options: [
            { id: "opt_starter_signup", title: "🚀 Instant Setup" },
            { id: "opt_talk_rep", title: "👤 Contact Sales" }
          ]
        }
      },
      {
        id: "handoff_sales_team",
        type: "HUMAN_HANDOFF",
        title: "Handoff to Sales Rep",
        config: {
          reason: "Enterprise lead ready for live demonstration",
          department: "SALES",
          message: "Transferring you to our senior solutions engineer..."
        }
      },
      {
        id: "end_b2b",
        type: "END",
        title: "B2B Journey Completed",
        config: {
          farewellMessage: "Thank you for exploring SARVYA! We look forward to scaling together."
        }
      }
    ];

    const transitions = [
      { id: "tb1", source: "trg_b2b", target: "msg_b2b_welcome", sourceHandle: "default" },
      { id: "tb2", source: "msg_b2b_welcome", target: "input_company", sourceHandle: "opt_start_qual" },
      { id: "tb3", source: "msg_b2b_welcome", target: "handoff_sales_team", sourceHandle: "opt_talk_sales" },
      { id: "tb4", source: "msg_b2b_welcome", target: "input_company", sourceHandle: "default" },
      { id: "tb5", source: "input_company", target: "input_team_size", sourceHandle: "valid" },
      { id: "tb6", source: "input_company", target: "handoff_sales_team", sourceHandle: "max_retries" },
      { id: "tb7", source: "input_team_size", target: "input_budget", sourceHandle: "valid" },
      { id: "tb8", source: "input_team_size", target: "handoff_sales_team", sourceHandle: "max_retries" },
      { id: "tb9", source: "input_budget", target: "cond_high_value", sourceHandle: "valid" },
      { id: "tb10", source: "input_budget", target: "cond_high_value", sourceHandle: "max_retries" },
      { id: "tb11", source: "cond_high_value", target: "crm_upsert_sql", sourceHandle: "true" },
      { id: "tb12", source: "cond_high_value", target: "crm_upsert_mql", sourceHandle: "false" },
      { id: "tb13", source: "crm_upsert_sql", target: "msg_sql_demo_booked", sourceHandle: "success" },
      { id: "tb14", source: "crm_upsert_sql", target: "msg_sql_demo_booked", sourceHandle: "failure" },
      { id: "tb15", source: "msg_sql_demo_booked", target: "handoff_sales_team", sourceHandle: "opt_vip_call" },
      { id: "tb16", source: "msg_sql_demo_booked", target: "end_b2b", sourceHandle: "opt_view_deck" },
      { id: "tb17", source: "msg_sql_demo_booked", target: "handoff_sales_team", sourceHandle: "default" },
      { id: "tb18", source: "crm_upsert_mql", target: "msg_mql_starter", sourceHandle: "success" },
      { id: "tb19", source: "crm_upsert_mql", target: "msg_mql_starter", sourceHandle: "failure" },
      { id: "tb20", source: "msg_mql_starter", target: "handoff_sales_team", sourceHandle: "opt_talk_rep" },
      { id: "tb21", source: "msg_mql_starter", target: "end_b2b", sourceHandle: "opt_starter_signup" },
      { id: "tb22", source: "msg_mql_starter", target: "end_b2b", sourceHandle: "default" }
    ];

    const variables = {
      company_name: "",
      team_size: 1,
      monthly_budget: 0
    };

    return {
      name: flowName,
      description: flowDesc,
      category: "SALES",
      triggerKeywords,
      nodes,
      transitions,
      variables
    };
  }

  // 3. LEAD GENERATION & 24H NURTURING DRIP
  if (p.includes("lead") || p.includes("nurture") || p.includes("drip") || p.includes("prospect") || p.includes("marketing")) {
    const flowName = "High-Converting Lead Gen & 24h Drip Campaign";
    const flowDesc = "Captures inbound prospects, qualifies service intent, issues brochure link, and schedules a compliant 24h follow-up message.";
    const triggerKeywords = ["offer", "brochure", "info", "inquire", "details"];

    const nodes = [
      {
        id: "trg_lead",
        type: "TRIGGER_WHATSAPP",
        title: "Lead Ad & Inbound Trigger",
        config: {
          triggerType: "KEYWORD",
          keywords: triggerKeywords,
          matchType: "CONTAINS"
        }
      },
      {
        id: "msg_lead_greet",
        type: "SEND_MESSAGE",
        title: "Exclusive Offer Greeting",
        config: {
          text: "Hello! Thank you for your interest in our premium hospitality & luxury event services.\n\nWe have an exclusive early-bird 15% discount for bookings made this week!",
          options: [
            { id: "opt_claim_offer", title: "🎁 Claim 15% Off" },
            { id: "opt_view_catalog", title: "📖 View Catalog" }
          ]
        }
      },
      {
        id: "input_lead_city",
        type: "COLLECT_INPUT",
        title: "Collect Prospect City",
        config: {
          variable: "city",
          validationType: "TEXT",
          promptText: "Which city are you travelling from or hosting your event in?",
          retryPrompt: "Please mention your city:",
          maxRetries: 3
        }
      },
      {
        id: "input_lead_service",
        type: "COLLECT_INPUT",
        title: "Collect Service Interest",
        config: {
          variable: "service_interest",
          validationType: "TEXT",
          promptText: "Are you interested in *Weekend Villa Stays*, *Destination Weddings*, or *Dining Experiences*?",
          retryPrompt: "Please specify your requirement:",
          maxRetries: 3
        }
      },
      {
        id: "crm_log_lead",
        type: "CRM_UPSERT",
        title: "Log Lead to Pipeline",
        config: {
          pipeline: leadPipeline.slug || "lead-generation-pipeline",
          stage: "QUALIFIED",
          leadScore: 65,
          dealValue: 15000,
          customFields: {
            city: "{{city}}",
            service_interest: "{{service_interest}}",
            ad_source: "WHATSAPP_AI_ARCHITECT"
          }
        }
      },
      {
        id: "msg_send_brochure",
        type: "SEND_MESSAGE",
        title: "Brochure & Offer Code",
        config: {
          text: "🎉 Here is your official e-brochure & coupon code *LUXURY15*:\n\n👉 https://konkantrip.com/brochure.pdf\n\nOur team has applied the coupon to your phone number.",
          options: [
            { id: "opt_book_with_code", title: "✅ Book with 15%" },
            { id: "opt_chat_expert", title: "💬 Chat with Team" }
          ]
        }
      },
      {
        id: "wait_nurture_drip",
        type: "WAIT_DELAY",
        title: "Compliant 24h Drip Delay",
        config: {
          delayAmount: 24,
          delayUnit: "HOURS",
          cancelOnReply: true
        }
      },
      {
        id: "msg_drip_followup",
        type: "SEND_MESSAGE",
        title: "24h Nurturing Push",
        config: {
          text: "Hi {{name}}! Just a gentle reminder that your 15% discount code *LUXURY15* expires in 24 hours. Would you like assistance reserving your preferred dates?",
          options: [
            { id: "opt_hold_dates", title: "🔒 Lock Discount" },
            { id: "opt_stop_promo", title: "🛑 Not Interested" }
          ]
        }
      },
      {
        id: "handoff_lead",
        type: "HUMAN_HANDOFF",
        title: "Lead Executive Connect",
        config: {
          reason: "Customer ready to redeem discount",
          department: "RESERVATIONS",
          message: "Connecting you to an executive to lock your reservation..."
        }
      },
      {
        id: "end_lead",
        type: "END",
        title: "Lead Nurtured",
        config: {
          farewellMessage: "Thank you! We remain at your service."
        }
      }
    ];

    const transitions = [
      { id: "tl1", source: "trg_lead", target: "msg_lead_greet", sourceHandle: "default" },
      { id: "tl2", source: "msg_lead_greet", target: "input_lead_city", sourceHandle: "opt_claim_offer" },
      { id: "tl3", source: "msg_lead_greet", target: "input_lead_city", sourceHandle: "opt_view_catalog" },
      { id: "tl4", source: "msg_lead_greet", target: "input_lead_city", sourceHandle: "default" },
      { id: "tl5", source: "input_lead_city", target: "input_lead_service", sourceHandle: "valid" },
      { id: "tl6", source: "input_lead_city", target: "handoff_lead", sourceHandle: "max_retries" },
      { id: "tl7", source: "input_lead_service", target: "crm_log_lead", sourceHandle: "valid" },
      { id: "tl8", source: "input_lead_service", target: "crm_log_lead", sourceHandle: "max_retries" },
      { id: "tl9", source: "crm_log_lead", target: "msg_send_brochure", sourceHandle: "success" },
      { id: "tl10", source: "crm_log_lead", target: "msg_send_brochure", sourceHandle: "failure" },
      { id: "tl11", source: "msg_send_brochure", target: "handoff_lead", sourceHandle: "opt_book_with_code" },
      { id: "tl12", source: "msg_send_brochure", target: "handoff_lead", sourceHandle: "opt_chat_expert" },
      { id: "tl13", source: "msg_send_brochure", target: "wait_nurture_drip", sourceHandle: "default" },
      { id: "tl14", source: "wait_nurture_drip", target: "msg_drip_followup", sourceHandle: "after_delay" },
      { id: "tl15", source: "wait_nurture_drip", target: "end_lead", sourceHandle: "early_reply" },
      { id: "tl16", source: "msg_drip_followup", target: "handoff_lead", sourceHandle: "opt_hold_dates" },
      { id: "tl17", source: "msg_drip_followup", target: "end_lead", sourceHandle: "opt_stop_promo" },
      { id: "tl18", source: "msg_drip_followup", target: "end_lead", sourceHandle: "default" }
    ];

    const variables = {
      city: "",
      service_interest: ""
    };

    return {
      name: flowName,
      description: flowDesc,
      category: "LEAD_GEN",
      triggerKeywords,
      nodes,
      transitions,
      variables
    };
  }

  // 4. RESTAURANT / DINING / FOOD ORDER & UPI PAYMENT
  if (p.includes("food") || p.includes("dine") || p.includes("dining") || p.includes("restaurant") || p.includes("cafe") || p.includes("order") || p.includes("payment")) {
    const flowName = "Dining Table Order & UPI Direct Payment Flow";
    const flowDesc = "Interactive seaside dining menu selection, order summary, instant UPI payment link generation, and kitchen dispatch.";
    const triggerKeywords = ["menu", "order", "food", "table", "dine"];

    const nodes = [
      {
        id: "trg_dining",
        type: "TRIGGER_WHATSAPP",
        title: "Dining Order Trigger",
        config: {
          triggerType: "KEYWORD",
          keywords: triggerKeywords,
          matchType: "CONTAINS"
        }
      },
      {
        id: "msg_dining_welcome",
        type: "SEND_MESSAGE",
        title: "Cafe Menu Greeting",
        config: {
          text: "Welcome to Konkan Wave Cafe & Beach Bar! 🌊🍕\n\nFresh local seafood, artisanal sourdough pizzas, and refreshing Solkadhi coolers are ready for order.",
          options: [
            { id: "opt_view_menu", title: "📜 View Menu" },
            { id: "opt_table_order", title: "🍽️ Table Order" }
          ]
        }
      },
      {
        id: "input_table_no",
        type: "COLLECT_INPUT",
        title: "Collect Table Number",
        config: {
          variable: "table_number",
          validationType: "NUMBER",
          promptText: "Please enter your *Table Number* (or '0' for beach takeout):",
          retryPrompt: "Please specify a numeric table number:",
          maxRetries: 3
        }
      },
      {
        id: "input_item_choice",
        type: "COLLECT_INPUT",
        title: "Collect Food Item Choice",
        config: {
          variable: "selected_item",
          validationType: "TEXT",
          promptText: "What would you like to order today? (e.g. Malvani Surmai Thali, Margherita Pizza, Solkadhi):",
          retryPrompt: "Please tell us what you'd like to order:",
          maxRetries: 3
        }
      },
      {
        id: "msg_order_quote",
        type: "SEND_MESSAGE",
        title: "Order Summary & UPI Payment",
        config: {
          text: "✅ Order Received for Table {{table_number}}!\n\n• Item: {{selected_item}}\n• Estimated Prep Time: 20 mins\n\nClick below to pay via UPI or settle cash upon service:",
          options: [
            { id: "opt_pay_upi", title: "💳 Pay via UPI" },
            { id: "opt_pay_cash", title: "💵 Pay upon Service" }
          ]
        }
      },
      {
        id: "crm_log_dining_order",
        type: "CRM_UPSERT",
        title: "Log Dining Order",
        config: {
          pipeline: bookingPipeline.slug || "universal-booking-pipeline",
          stage: "CONFIRMED",
          dealValue: 950,
          leadScore: 70,
          customFields: {
            table_number: "{{table_number}}",
            item: "{{selected_item}}",
            order_type: "DINING"
          }
        }
      },
      {
        id: "end_dining",
        type: "END",
        title: "Order Dispatched",
        config: {
          farewellMessage: "Your order has been sent to our kitchen team. Enjoy your meal at Konkan Wave Cafe!"
        }
      }
    ];

    const transitions = [
      { id: "td1", source: "trg_dining", target: "msg_dining_welcome", sourceHandle: "default" },
      { id: "td2", source: "msg_dining_welcome", target: "input_table_no", sourceHandle: "opt_view_menu" },
      { id: "td3", source: "msg_dining_welcome", target: "input_table_no", sourceHandle: "opt_table_order" },
      { id: "td4", source: "msg_dining_welcome", target: "input_table_no", sourceHandle: "default" },
      { id: "td5", source: "input_table_no", target: "input_item_choice", sourceHandle: "valid" },
      { id: "td6", source: "input_table_no", target: "msg_order_quote", sourceHandle: "max_retries" },
      { id: "td7", source: "input_item_choice", target: "msg_order_quote", sourceHandle: "valid" },
      { id: "td8", source: "input_item_choice", target: "msg_order_quote", sourceHandle: "max_retries" },
      { id: "td9", source: "msg_order_quote", target: "crm_log_dining_order", sourceHandle: "opt_pay_upi" },
      { id: "td10", source: "msg_order_quote", target: "crm_log_dining_order", sourceHandle: "opt_pay_cash" },
      { id: "td11", source: "msg_order_quote", target: "crm_log_dining_order", sourceHandle: "default" },
      { id: "td12", source: "crm_log_dining_order", target: "end_dining", sourceHandle: "success" },
      { id: "td13", source: "crm_log_dining_order", target: "end_dining", sourceHandle: "failure" }
    ];

    const variables = {
      table_number: 1,
      selected_item: ""
    };

    return {
      name: flowName,
      description: flowDesc,
      category: "DINING",
      triggerKeywords,
      nodes,
      transitions,
      variables
    };
  }

  // 5. DEFAULT / CUSTOM CONCIERGE WORKFLOW
  const flowName = prompt ? `AI Flow: ${prompt.slice(0, 35)}` : "Smart Interactive Concierge";
  const flowDesc = `Custom AI-synthesized workflow for: "${prompt || 'General Customer Service'}"`;
  const triggerKeywords = ["help", "info", "hello", "hi", "support"];

  const nodes = [
    {
      id: "trg_general",
      type: "TRIGGER_WHATSAPP",
      title: "WhatsApp Inbound Trigger",
      config: {
        triggerType: "KEYWORD",
        keywords: triggerKeywords,
        matchType: "CONTAINS"
      }
    },
    {
      id: "msg_general_welcome",
      type: "SEND_MESSAGE",
      title: "Interactive Greeting",
      config: {
        text: `Hello! Welcome to ${primaryEntity.name}. How can we assist you today?`,
        options: [
          { id: "opt_inquire", title: "📋 General Inquiry" },
          { id: "opt_talk_human", title: "👤 Speak to Human" }
        ]
      }
    },
    {
      id: "input_question",
      type: "COLLECT_INPUT",
      title: "Capture Requirement",
      config: {
        variable: "user_query",
        validationType: "TEXT",
        promptText: "Please tell us how we can help you:",
        retryPrompt: "Please describe your question:",
        maxRetries: 3
      }
    },
    {
      id: "crm_log_general",
      type: "CRM_UPSERT",
      title: "Log Enquiry in CRM",
      config: {
        pipeline: leadPipeline.slug || "lead-generation-pipeline",
        stage: "NEW",
        leadScore: 30,
        dealValue: 0,
        customFields: { query: "{{user_query}}" }
      }
    },
    {
      id: "handoff_general",
      type: "HUMAN_HANDOFF",
      title: "Agent Handoff",
      config: {
        reason: "Customer inquiry logged",
        department: "SUPPORT",
        message: "Thank you! Our support team has received your inquiry and will message you right back."
      }
    },
    {
      id: "end_general",
      type: "END",
      title: "End Conversation",
      config: { farewellMessage: "Have a wonderful day!" }
    }
  ];

  const transitions = [
    { id: "tg1", source: "trg_general", target: "msg_general_welcome", sourceHandle: "default" },
    { id: "tg2", source: "msg_general_welcome", target: "input_question", sourceHandle: "opt_inquire" },
    { id: "tg3", source: "msg_general_welcome", target: "handoff_general", sourceHandle: "opt_talk_human" },
    { id: "tg4", source: "msg_general_welcome", target: "input_question", sourceHandle: "default" },
    { id: "tg5", source: "input_question", target: "crm_log_general", sourceHandle: "valid" },
    { id: "tg6", source: "input_question", target: "crm_log_general", sourceHandle: "max_retries" },
    { id: "tg7", source: "crm_log_general", target: "handoff_general", sourceHandle: "success" },
    { id: "tg8", source: "crm_log_general", target: "end_general", sourceHandle: "failure" }
  ];

  const variables = { user_query: "" };

  return {
    name: flowName,
    description: flowDesc,
    category: "SUPPORT",
    triggerKeywords,
    nodes,
    transitions,
    variables
  };
}

/**
 * Calls external LLM (Gemini or OpenAI) with grounded system capabilities
 */
async function callLlmGenerator(prompt, systemContext) {
  const { aiConfig, roomTypes, businessEntities, crmPipelines } = systemContext;
  const provider = aiConfig.provider || "GEMINI";

  const systemInstruction = `
You are the AI Flow Architect for SARVYA, a multi-industry WhatsApp business automation platform.
Your task is to generate a complete, valid, executable workflow graph grounded in the live system inventory and CRM pipelines.

SYSTEM CAPABILITIES & RESOURCES:
- Primary Business: ${JSON.stringify(businessEntities[0] || {})}
- Available Room Types / Inventory: ${JSON.stringify(roomTypes.map(r => ({ id: r.id, name: r.name, rate: r.base_rate })))}
- Available CRM Pipelines: ${JSON.stringify(crmPipelines.map(p => ({ slug: p.slug, name: p.name, stages: p.stages.map(s => s.key) })))}

RULES & CONSTRAINTS:
1. Every flow MUST start with a TRIGGER_WHATSAPP node.
2. Max 3 buttons per SEND_MESSAGE node; button title max 20 characters.
3. Every button option ID MUST have a matching transition or fallback to default handle.
4. Accepted Node Types: TRIGGER_WHATSAPP, SEND_MESSAGE, SEND_TEMPLATE, COLLECT_INPUT, CONDITION, SET_VARIABLE, WAIT_DELAY, CRM_UPSERT, CATALOG_BOOKING, HTTP_WEBHOOK, HUMAN_HANDOFF, END.
5. Handles:
   - TRIGGER_WHATSAPP: 'default'
   - SEND_MESSAGE: option IDs or 'default'
   - COLLECT_INPUT: 'valid', 'max_retries' (route 'max_retries' to HUMAN_HANDOFF or next fallback node; NEVER self-loop to same node)
   - CONDITION: 'true', 'false'
   - WAIT_DELAY: 'after_delay', 'early_reply'
   - CRM_UPSERT: 'success', 'failure'
   - CATALOG_BOOKING: 'available', 'unavailable'
   - HTTP_WEBHOOK: 'success', 'failure'
   - HUMAN_HANDOFF / END: no outputs (terminal)

Respond ONLY with valid JSON in this exact structure:
{
  "name": "Flow Name",
  "description": "Short description",
  "category": "HOSPITALITY_ENQUIRY | SALES | LEAD_GEN | DINING | SUPPORT",
  "triggerKeywords": ["kw1", "kw2"],
  "nodes": [...],
  "transitions": [...],
  "variables": {...}
}
`;

  // 1. Google Gemini API
  if (provider === "GEMINI") {
    const apiKey = getSetting("GEMINI_API_KEY") || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("No GEMINI_API_KEY configured");

    const model = getSetting("GEMINI_MODEL") || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemInstruction}\n\nUSER PROMPT: "${prompt}"` }] }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) throw new Error("Empty response from Gemini API");
    return JSON.parse(rawJson);
  }

  // 2. OpenAI API
  if (provider === "OPENAI") {
    const apiKey = getSetting("OPENAI_API_KEY") || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OPENAI_API_KEY configured");

    const model = getSetting("OPENAI_MODEL") || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: `Generate a complete workflow for: "${prompt}"` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const rawJson = data.choices?.[0]?.message?.content;
    return JSON.parse(rawJson);
  }

  throw new Error(`Unsupported AI Provider: ${provider}`);
}

/**
 * Main AI Flow Generator Entrypoint
 * Generates, validates, positions, saves, optionally publishes, and assigns flow to WhatsApp line.
 */
async function generateFlowFromPrompt({
  prompt,
  tenantId = 1,
  propertyId = 1,
  phoneNumberId = null,
  autoPublish = false,
  user = { id: "admin", name: "Administrator" }
}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error("Prompt is required to generate a workflow.");
  }

  const cleanPrompt = String(prompt).trim();
  const systemContext = buildSystemCapabilitiesContext(tenantId, propertyId);

  let flowDraft = null;
  let usedProvider = "SMART_LOCAL";

  // Try LLM first if configured
  if (systemContext.aiConfig.hasApiKey) {
    try {
      flowDraft = await callLlmGenerator(cleanPrompt, systemContext);
      usedProvider = systemContext.aiConfig.provider;
    } catch (llmErr) {
      console.warn(`[AIFlowGenerator] LLM generation failed (${llmErr.message}), falling back to smart local synthesis.`);
      flowDraft = null;
    }
  }

  // Fallback to Smart Deterministic Synthesizer
  if (!flowDraft) {
    flowDraft = synthesizeSmartLocalFlow(cleanPrompt, systemContext);
    usedProvider = "SMART_LOCAL";
  }

  // Apply visual layout coordinates
  let nodes = flowDraft.nodes || [];
  let transitions = (flowDraft.transitions || []).map((t, idx) => ({
    id: t.id || `t_ai_${idx + 1}`,
    source: t.source || t.from,
    target: t.target || t.to,
    sourceHandle: t.sourceHandle || "default"
  }));
  const variables = flowDraft.variables || {};

  nodes = applyHierarchicalLayout(nodes, transitions);

  // Validate the graph
  const validationReport = flowService.validateFlowGraph(nodes, transitions, variables);

  // Determine line assignment
  let assignedPhone = null;
  let targetPhoneId = (!phoneNumberId || phoneNumberId === "ALL" || phoneNumberId === "null") ? null : String(phoneNumberId).trim();

  if (targetPhoneId) {
    const foundLine = (systemContext.connectedPhoneNumbers || []).find(p => p.phone_number_id === targetPhoneId);
    if (foundLine) {
      assignedPhone = foundLine;
    }
  }

  // Create the flow in the database
  const createResult = flowService.createFlow({
    tenant_id: tenantId,
    property_id: propertyId,
    phone_number_id: targetPhoneId,
    name: flowDraft.name || `AI Flow: ${cleanPrompt.slice(0, 30)}`,
    description: flowDraft.description || `Generated by AI for: "${cleanPrompt}"`,
    category: flowDraft.category || "HOSPITALITY_ENQUIRY",
    trigger_type: "KEYWORD_MATCH",
    trigger_keywords: flowDraft.triggerKeywords || ["hi", "hello"],
    is_default: 0,
    priority: 10,
    initialNodes: nodes,
    initialTransitions: transitions,
    initialVariables: variables
  }, user);

  let finalFlow = createResult.flow;
  if (finalFlow && createResult?.draftVersion) {
    finalFlow.nodes_json = createResult.draftVersion.nodes_json;
    finalFlow.edges_json = createResult.draftVersion.transitions_json;
    finalFlow.transitions_json = createResult.draftVersion.transitions_json;
  }
  let publishedVersion = null;

  // Auto-publish if requested and valid
  if (autoPublish) {
    if (validationReport.isValid) {
      try {
        const pubResult = flowService.publishFlow(finalFlow.id, user, tenantId);
        finalFlow = pubResult.flow;
        publishedVersion = pubResult.publishedVersion;
      } catch (pubErr) {
        console.warn(`[AIFlowGenerator] Auto-publish note for flow ${finalFlow.id}:`, pubErr.message);
      }
    } else {
      console.warn(`[AIFlowGenerator] Skipping auto-publish: Flow has validation warnings/errors:`, validationReport.errors);
    }
  }

  return {
    success: true,
    flow: finalFlow,
    draftVersion: createResult.draftVersion,
    publishedVersion,
    validationReport,
    usedProvider,
    assignedPhone: assignedPhone ? {
      displayName: assignedPhone.display_name,
      phoneNumber: assignedPhone.phone_number,
      phoneNumberId: assignedPhone.phone_number_id
    } : null,
    summary: {
      nodeCount: nodes.length,
      transitionCount: transitions.length,
      isPublished: Boolean(publishedVersion),
      assignedLine: assignedPhone?.display_name || "All Connected Lines"
    }
  };
}

/**
 * Iterative Prompt Refiner
 * Modifies an existing flow graph based on conversational user instructions.
 */
async function refineFlowWithAi({
  flowId,
  prompt,
  tenantId = 1,
  user = { id: "admin", name: "Administrator" }
}) {
  if (!flowId) throw new Error("flowId is required for AI refinement.");
  if (!prompt || !String(prompt).trim()) throw new Error("Refinement prompt is required.");

  const current = flowService.getFlowById(flowId, tenantId);
  const draftVersion = current.draftVersion;
  if (!draftVersion) throw new Error("No draft version found to refine.");

  const nodes = [...(draftVersion.nodes || [])];
  const transitions = [...(draftVersion.transitions || [])];
  const variables = { ...(draftVersion.variables || {}) };
  const p = String(prompt).toLowerCase();

  let modified = false;

  // 1. ADD WAIT_DELAY NODE
  if (p.includes("delay") || p.includes("wait") || p.includes("drip") || p.includes("follow up") || p.includes("followup")) {
    const delayId = `delay_ai_${Date.now()}`;
    const delayNode = {
      id: delayId,
      type: "WAIT_DELAY",
      title: "AI-Added Follow-Up Delay",
      config: {
        delayAmount: p.includes("15") ? 15 : (p.includes("24") ? 24 : 1),
        delayUnit: p.includes("minute") ? "MINUTES" : (p.includes("day") ? "DAYS" : "HOURS"),
        cancelOnReply: true
      },
      position: { x: 350, y: 300 }
    };

    // Find a message or CRM node to insert delay after
    const targetParent = nodes.find(n => n.type === "SEND_MESSAGE" || n.type === "CRM_UPSERT") || nodes[0];
    if (targetParent) {
      nodes.push(delayNode);
      transitions.push({
        id: `t_refine_${Date.now()}`,
        source: targetParent.id,
        target: delayId,
        sourceHandle: "default"
      });
      modified = true;
    }
  }

  // 2. ADD CRM_UPSERT NODE
  if (p.includes("crm") || p.includes("lead") || p.includes("deal") || p.includes("pipeline")) {
    const crmId = `crm_ai_${Date.now()}`;
    const crmNode = {
      id: crmId,
      type: "CRM_UPSERT",
      title: "AI-Added CRM Record",
      config: {
        pipeline: "b2b-sales-pipeline",
        stage: p.includes("won") ? "WON" : (p.includes("sql") ? "SQL" : "NEW_LEAD"),
        dealValue: 50000,
        leadScore: 80,
        customFields: { notes: `Refined via prompt: "${prompt}"` }
      },
      position: { x: 350, y: 400 }
    };
    nodes.push(crmNode);
    modified = true;
  }

  // 3. ADD PAYMENT LINK
  if (p.includes("pay") || p.includes("upi") || p.includes("payment")) {
    const payId = `pay_ai_${Date.now()}`;
    const payNode = {
      id: payId,
      type: "SEND_MESSAGE",
      title: "Direct UPI Payment Step",
      config: {
        text: "💳 Instant UPI Payment Link: Click below to complete your booking securely:\n\n👉 https://upiqr.in/pay/konkantrip",
        options: [
          { id: "opt_paid", title: "✅ Payment Done" },
          { id: "opt_need_help", title: "❓ Need Help" }
        ]
      },
      position: { x: 350, y: 450 }
    };
    nodes.push(payNode);
    modified = true;
  }

  // Default: Apply hierarchical layout
  const layoutedNodes = applyHierarchicalLayout(nodes, transitions);
  const validationReport = flowService.validateFlowGraph(layoutedNodes, transitions, variables);

  const saveResult = flowService.saveFlowDraft(flowId, {
    nodes: layoutedNodes,
    transitions,
    variables,
    changelog: `Refined with AI: "${prompt.slice(0, 50)}"`
  }, user, tenantId);

  return {
    success: true,
    modified,
    flow: saveResult.flow,
    draftVersion: saveResult.draftVersion,
    validationReport
  };
}

/**
 * Returns capabilities and connected resources summary for UI modals
 */
function getAiCapabilities(tenantId = 1, propertyId = 1) {
  const context = buildSystemCapabilitiesContext(tenantId, propertyId);
  return {
    success: true,
    capabilities: {
      roomTypesCount: context.roomTypes.length,
      roomTypesPreview: context.roomTypes.slice(0, 3).map(r => ({ id: r.id, name: r.name, rate: r.base_rate })),
      entitiesCount: context.businessEntities.length,
      entitiesPreview: context.businessEntities.slice(0, 3).map(e => ({ id: e.id, name: e.name, domain: e.domain })),
      pipelinesCount: context.crmPipelines.length,
      pipelinesPreview: context.crmPipelines.map(p => ({ slug: p.slug, name: p.name, stageCount: p.stages.length })),
      catalogItemsCount: context.catalogItems.length,
      approvedTemplatesCount: context.approvedTemplates.length,
      connectedLines: context.connectedPhoneNumbers.map(p => ({
        id: p.id,
        displayName: p.display_name,
        phoneNumber: p.phone_number,
        phoneNumberId: p.phone_number_id,
        isDefault: Boolean(p.is_default)
      })),
      aiConfig: context.aiConfig
    }
  };
}

module.exports = {
  applyHierarchicalLayout,
  synthesizeSmartLocalFlow,
  generateFlowFromPrompt,
  refineFlowWithAi,
  getAiCapabilities
};
