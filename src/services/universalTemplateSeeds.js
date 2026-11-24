/**
 * Universal Flow Template Catalog Seeds
 * Seeds the Master Template Library with reference production templates:
 * 1. Resort Booking Assistant (Hospitality)
 * 2. B2B Lead Qualification Assistant (B2B SaaS / Sales)
 */

const crypto = require("crypto");

const RESORT_BOOKING_TEMPLATE = {
  template_key: "hospitality.resort-booking",
  visibility: "PUBLIC",
  industry: "HOSPITALITY",
  category: "BOOKING",
  title: "Resort Booking Assistant",
  description: "24/7 reservation concierge. Greets guests using your business details, collects check-in dates and guest counts, checks real-time inventory, calculates dynamic quotes, and generates booking enquiries.",
  icon: "Hotel",
  badge: "POPULAR",
  current_version: "1.0.0",
  capabilities_json: [
    "Dynamic tenant business profile & welcome message resolution",
    "Real-time room availability & rates lookup via Universal Catalog",
    "Automated guest count & stay duration calculator",
    "Instant booking enquiry creation & front desk notification"
  ],
  configSchema: {
    "business.name": {
      type: "string",
      label: "Resort / Hotel Name",
      required: true,
      default: "Konkan Beach Resort"
    },
    "business.phone": {
      type: "phone",
      label: "Reservation Phone Number",
      required: true,
      default: "919422359446"
    },
    "greeting": {
      type: "text",
      label: "Welcome Greeting",
      required: true,
      default: "Welcome to our coastal sanctuary! How may we assist your stay today?"
    },
    "checkin_time": {
      type: "time",
      label: "Standard Check-in Time",
      required: false,
      default: "14:00"
    },
    "checkout_time": {
      type: "time",
      label: "Standard Check-out Time",
      required: false,
      default: "11:00"
    },
    "cancellation_policy": {
      type: "text",
      label: "Cancellation Policy Notice",
      required: false,
      default: "Free cancellation up to 48 hours prior to check-in."
    }
  },
  requiredBindings: [
    {
      key: "sender_line",
      type: "WHATSAPP_LINE",
      required: true,
      label: "WhatsApp Sender Line"
    },
    {
      key: "property_id",
      type: "PROPERTY",
      required: true,
      label: "Target Property / Resort Location"
    }
  ],
  graph: {
    nodes: [
      {
        id: "node_start",
        type: "START",
        title: "Inbound Message Trigger",
        config: {
          triggerKeywords: ["hi", "hello", "hey", "resort", "book", "room", "stay", "rates"]
        },
        position: { x: 300, y: 50 }
      },
      {
        id: "node_welcome",
        type: "MESSAGE",
        title: "Dynamic Welcome Greeting",
        config: {
          text: "🌿 *Welcome to {{config.business.name}}!*\n\n{{config.greeting}}\nOur starting rate is {{catalog.starting_price}}.\nFor direct inquiries, contact {{config.business.phone}}."
        },
        position: { x: 300, y: 160 }
      },
      {
        id: "node_room_selection",
        type: "BUTTON_MENU",
        title: "Room Selection",
        config: {
          prompt: "Please choose your preferred room / villa type at {{config.business.name}}:",
          variable: "room_type",
          options: [
            { id: "opt_deluxe", title: "Deluxe Villa 🏡", value: "Deluxe Villa" },
            { id: "opt_beach", title: "Beachfront Suite 🌊", value: "Beachfront Suite" },
            { id: "opt_cottage", title: "Garden Cottage 🌴", value: "Garden Cottage" }
          ]
        },
        position: { x: 300, y: 280 }
      },
      {
        id: "node_ask_checkin",
        type: "INPUT_COLLECTION",
        title: "Date Collection",
        config: {
          prompt: "Great choice! Please reply with your planned *Check-in Date* (e.g. 25th Dec or YYYY-MM-DD):",
          variable: "check_in_date",
          validation: { type: "DATE" }
        },
        position: { x: 300, y: 400 }
      },
      {
        id: "node_ask_guests",
        type: "INPUT_COLLECTION",
        title: "Guest Count",
        config: {
          prompt: "How many guests will be staying in your party (Adults + Children)?",
          variable: "guest_count",
          validation: { type: "NUMBER", min: 1, max: 20 }
        },
        position: { x: 300, y: 520 }
      },
      {
        id: "node_check_avail",
        type: "BUSINESS_ACTION",
        title: "Availability Lookup",
        config: {
          action: "HOSPITALITY_CHECK_AVAILABILITY",
          checkinVar: "check_in_date",
          guestsVar: "guest_count"
        },
        position: { x: 300, y: 640 }
      },
      {
        id: "node_calc_pricing",
        type: "BUSINESS_ACTION",
        title: "Dynamic Pricing",
        config: {
          action: "HOSPITALITY_CALCULATE_QUOTE",
          checkinVar: "check_in_date",
          guestsVar: "guest_count"
        },
        position: { x: 300, y: 760 }
      },
      {
        id: "node_create_enquiry",
        type: "BUSINESS_ACTION",
        title: "Booking Enquiry",
        config: {
          action: "HOSPITALITY_CREATE_ENQUIRY",
          inputs: {
            phone: "{{sender_phone}}",
            check_in: "{{check_in_date}}",
            guests: "{{guest_count}}"
          }
        },
        position: { x: 300, y: 880 }
      },
      {
        id: "node_confirmation",
        type: "MESSAGE",
        title: "Human Handoff or Confirmation",
        config: {
          text: "🎉 *Reservation Enquiry Received for {{config.business.name}}!*\n\n📅 *Check-in:* {{check_in_date}}\n👥 *Guests:* {{guest_count}}\n🏷️ *Estimated Tariff:* ₹{{quote_total}}\n\nOur concierge team will reach you at {{sender_phone}}.\nCheck-in: {{config.checkin_time}} | Check-out: {{config.checkout_time}}\n_{{config.cancellation_policy}}_\nFor immediate concierge handoff, call {{config.business.phone}}."
        },
        position: { x: 300, y: 1000 }
      }
    ],
    transitions: [
      { id: "e1", source: "node_start", target: "node_welcome", sourceHandle: "default" },
      { id: "e2", source: "node_welcome", target: "node_room_selection", sourceHandle: "default" },
      { id: "e3", source: "node_room_selection", target: "node_ask_checkin", sourceHandle: "default" },
      { id: "e4", source: "node_ask_checkin", target: "node_ask_guests", sourceHandle: "default" },
      { id: "e5", source: "node_ask_guests", target: "node_check_avail", sourceHandle: "default" },
      { id: "e6", source: "node_check_avail", target: "node_calc_pricing", sourceHandle: "available" },
      { id: "e7", source: "node_calc_pricing", target: "node_create_enquiry", sourceHandle: "available" },
      { id: "e8", source: "node_create_enquiry", target: "node_confirmation", sourceHandle: "default" }
    ],
    variables: {
      room_type: "Deluxe Villa",
      check_in_date: null,
      guest_count: 2,
      quote_total: "3500"
    }
  }
};

const B2B_LEAD_QUALIFICATION_TEMPLATE = {
  template_key: "b2b.lead-qualification",
  visibility: "PUBLIC",
  industry: "B2B_SAAS",
  category: "SALES",
  title: "B2B Lead Qualification Assistant",
  description: "High-velocity B2B lead capture. Collects prospect company details, team size, and monthly budget, calculates lead score, and seamlessly creates CRM sales deals.",
  icon: "Building2",
  badge: "FEATURED",
  current_version: "1.0.0",
  capabilities_json: [
    "Dynamic company profile & sales email notification routing",
    "Multi-tier company size & budget qualification",
    "Automated lead scoring & high-value flag",
    "Direct synchronization into CRM Sales Pipeline"
  ],
  configSchema: {
    "business.name": {
      type: "string",
      label: "Company / Brand Name",
      required: true,
      default: "Survya Enterprise"
    },
    "business.sales_email": {
      type: "email",
      label: "Sales Notification Email",
      required: true,
      default: "sales@company.com"
    },
    "business.phone": {
      type: "phone",
      label: "Sales Support Phone",
      required: true,
      default: "919307382030"
    },
    "greeting": {
      type: "text",
      label: "Welcome & Value Proposition",
      required: true,
      default: "Hello! Welcome to our enterprise platform. Let us quickly assess how we can help scale your business."
    },
    "qualification_threshold": {
      type: "number",
      label: "Enterprise Budget Threshold (₹)",
      required: false,
      default: 50000
    }
  },
  requiredBindings: [
    {
      key: "sender_line",
      type: "WHATSAPP_LINE",
      required: true,
      label: "WhatsApp Business Sender Line"
    },
    {
      key: "crm_pipeline",
      type: "CRM_PIPELINE",
      required: true,
      label: "Destination CRM Sales Pipeline"
    }
  ],
  graph: {
    nodes: [
      {
        id: "node_start",
        type: "START",
        title: "B2B Inbound Trigger",
        config: {
          triggerKeywords: ["hi", "hello", "demo", "pricing", "sales", "enterprise", "quote"]
        },
        position: { x: 300, y: 50 }
      },
      {
        id: "node_welcome",
        type: "MESSAGE",
        title: "Welcome and Company Introduction",
        config: {
          text: "🚀 *Welcome to {{config.business.name}}!*\n\n{{config.greeting}}\nWe help high-growth enterprises automate client engagement, conversational commerce, and workflows on WhatsApp."
        },
        position: { x: 300, y: 160 }
      },
      {
        id: "node_ask_contact",
        type: "INPUT_COLLECTION",
        title: "Contact Collection",
        config: {
          prompt: "To get started with your tailored solution, what is your *Full Name* and *Company*?",
          variable: "contact_name",
          validation: { type: "TEXT", minLength: 2 }
        },
        position: { x: 300, y: 280 }
      },
      {
        id: "node_ask_service",
        type: "BUTTON_MENU",
        title: "Service Selection",
        config: {
          prompt: "Which service line would you like to deploy for your organization?",
          variable: "service_interest",
          options: [
            { id: "opt_wa", title: "WhatsApp Automation ⚡", value: "WhatsApp Automation" },
            { id: "opt_crm", title: "Omnichannel CRM 📊", value: "Omnichannel CRM" },
            { id: "opt_ai", title: "Custom AI Agents 🤖", value: "Custom AI Agents" }
          ]
        },
        position: { x: 300, y: 400 }
      },
      {
        id: "node_ask_budget",
        type: "INPUT_COLLECTION",
        title: "Budget Qualification",
        config: {
          prompt: "What is your estimated monthly software & automation budget in INR?",
          variable: "monthly_budget",
          validation: { type: "NUMBER", min: 1000 }
        },
        position: { x: 300, y: 520 }
      },
      {
        id: "node_route_budget",
        type: "CONDITION",
        title: "Conditional Routing",
        config: {
          matchMode: "ALL",
          rules: [
            { variable: "monthly_budget", operator: ">=", value: "{{config.qualification_threshold}}" }
          ]
        },
        position: { x: 300, y: 640 }
      },
      {
        id: "node_sync_crm",
        type: "CRM_UPSERT",
        title: "CRM Lead Creation",
        config: {
          stage: "QUALIFIED_LEAD",
          pipeline: "b2b-sales-pipeline",
          customFields: {
            service_interest: "{{service_interest}}",
            contact_name: "{{contact_name}}",
            monthly_budget: "{{monthly_budget}}"
          }
        },
        position: { x: 300, y: 760 }
      },
      {
        id: "node_sales_handoff",
        type: "MESSAGE",
        title: "Sales Team Handoff",
        config: {
          text: "🎉 *Thank you, {{contact_name}}!*\n\nYour requirements for *{{service_interest}}* have been logged in our enterprise pipeline.\nA Principal Solutions Architect from {{config.business.name}} will contact you directly at {{sender_phone}}.\n\nSales Escalations: {{config.business.sales_email}} | {{config.business.phone}}"
        },
        position: { x: 300, y: 880 }
      }
    ],
    transitions: [
      { id: "e1", source: "node_start", target: "node_welcome", sourceHandle: "default" },
      { id: "e2", source: "node_welcome", target: "node_ask_contact", sourceHandle: "default" },
      { id: "e3", source: "node_ask_contact", target: "node_ask_service", sourceHandle: "default" },
      { id: "e4", source: "node_ask_service", target: "node_ask_budget", sourceHandle: "default" },
      { id: "e5", source: "node_ask_budget", target: "node_route_budget", sourceHandle: "default" },
      { id: "e6", source: "node_route_budget", target: "node_sync_crm", sourceHandle: "true" },
      { id: "e7", source: "node_route_budget", target: "node_sync_crm", sourceHandle: "false" },
      { id: "e8", source: "node_sync_crm", target: "node_sales_handoff", sourceHandle: "default" }
    ],
    variables: {
      contact_name: null,
      service_interest: "WhatsApp Automation",
      monthly_budget: 65000
    }
  }
};

const SEED_TEMPLATES = [
  RESORT_BOOKING_TEMPLATE,
  B2B_LEAD_QUALIFICATION_TEMPLATE
];

function seedTemplateCatalog(db) {
  for (const tpl of SEED_TEMPLATES) {
    try {
      // 1. Upsert template_catalog
      const existing = db.prepare("SELECT id FROM template_catalog WHERE template_key = ?").get(tpl.template_key);
      let templateId;

      if (existing) {
        templateId = existing.id;
        db.prepare(`
          UPDATE template_catalog 
          SET title = ?, description = ?, industry = ?, category = ?, icon = ?, badge = ?,
              capabilities_json = ?, current_version = ?, status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          tpl.title,
          tpl.description,
          tpl.industry,
          tpl.category,
          tpl.icon,
          tpl.badge,
          JSON.stringify(tpl.capabilities_json),
          tpl.current_version,
          templateId
        );
      } else {
        const uuid = crypto.randomUUID();
        const res = db.prepare(`
          INSERT INTO template_catalog (
            uuid, template_key, owner_tenant_id, visibility, industry, category,
            title, description, icon, badge, capabilities_json, current_version,
            status, tenant_id, active_status, delete_status, created_by, updated_by
          ) VALUES (?, ?, NULL, 'PUBLIC', ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', 1, 1, 0, 'system', 'system')
        `).run(
          uuid,
          tpl.template_key,
          tpl.industry,
          tpl.category,
          tpl.title,
          tpl.description,
          tpl.icon,
          tpl.badge,
          JSON.stringify(tpl.capabilities_json),
          tpl.current_version
        );
        templateId = res.lastInsertRowid;
      }

      // 2. Upsert template_versions for 1.0.0
      const existingVer = db.prepare("SELECT id FROM template_versions WHERE template_id = ? AND version_number = ?").get(templateId, tpl.current_version);
      if (existingVer) {
        db.prepare(`
          UPDATE template_versions
          SET graph_json = ?, config_schema_json = ?, required_bindings_json = ?,
              checksum = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          JSON.stringify(tpl.graph),
          JSON.stringify(tpl.configSchema),
          JSON.stringify(tpl.requiredBindings),
          crypto.createHash('sha256').update(JSON.stringify(tpl.graph)).digest('hex'),
          existingVer.id
        );
      } else {
        const verUuid = crypto.randomUUID();
        db.prepare(`
          INSERT INTO template_versions (
            uuid, template_id, version_number, status, graph_json, config_schema_json,
            required_bindings_json, checksum, changelog, tenant_id, active_status, delete_status, created_by, updated_by
          ) VALUES (?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, 'Initial production baseline', 1, 1, 0, 'system', 'system')
        `).run(
          verUuid,
          templateId,
          tpl.current_version,
          JSON.stringify(tpl.graph),
          JSON.stringify(tpl.configSchema),
          JSON.stringify(tpl.requiredBindings),
          crypto.createHash('sha256').update(JSON.stringify(tpl.graph)).digest('hex')
        );
      }
    } catch (err) {
      console.warn(`[UniversalTemplateSeeds] Error seeding template ${tpl.template_key}:`, err.message);
    }
  }
}

module.exports = {
  RESORT_BOOKING_TEMPLATE,
  B2B_LEAD_QUALIFICATION_TEMPLATE,
  seedTemplateCatalog
};

