/**
 * Default Conversation Flow Templates & System Seeds
 * Provides production-ready templates for Hospitality Booking, Concierge FAQ, and Staff Handoff.
 */

const crypto = require("crypto");

const HOSPITALITY_BOOKING_NODES = [
  {
    id: "node_start",
    type: "START",
    title: "Conversation Start",
    config: {
      triggerType: "INBOUND_ANY",
      triggerKeywords: ["hi", "hello", "hey", "resort", "book", "room", "enquiry", "rates", "namaste", "villa", "cottage"]
    },
    position: { x: 300, y: 50 }
  },
  {
    id: "node_welcome",
    type: "MESSAGE",
    title: "Welcome Greeting",
    config: {
      text: "🌿 *Welcome to {{property.name}}!* 🏖️\n\nExperience luxury seaside tranquility in {{property.city}}. I am your 24/7 Digital Concierge. How may I assist you today?"
    },
    position: { x: 300, y: 150 }
  },
  {
    id: "node_enquiry_type",
    type: "BUTTON_MENU",
    title: "Select Enquiry Type",
    config: {
      prompt: "Please select an option to get started:",
      variable: "enquiry_type",
      options: [
        { id: "opt_booking", title: "Book a Stay 🛏️", value: "BOOKING" },
        { id: "opt_rooms", title: "View Villas 🏡", value: "ROOMS_INFO" },
        { id: "opt_concierge", title: "Ask Concierge 💬", value: "CONCIERGE" }
      ]
    },
    position: { x: 300, y: 260 }
  },
  {
    id: "node_branch_enquiry",
    type: "CONDITION",
    title: "Branch on Enquiry Type",
    config: {
      variable: "enquiry_type",
      rules: [
        { operator: "EQUALS", value: "BOOKING", targetNodeId: "node_select_room" },
        { operator: "EQUALS", value: "ROOMS_INFO", targetNodeId: "node_rooms_overview" },
        { operator: "EQUALS", value: "CONCIERGE", targetNodeId: "node_concierge_handoff" }
      ],
      defaultTargetNodeId: "node_select_room"
    },
    position: { x: 300, y: 380 }
  },
  {
    id: "node_rooms_overview",
    type: "MESSAGE",
    title: "Show Room Types Overview",
    config: {
      text: "🏡 *Our Accommodations:*\n\n1️⃣ *Deluxe Garden Villa* (350 sq.ft) — ₹8,500/night (Private Sit-out & Garden)\n2️⃣ *Luxury Beachfront Suite* (550 sq.ft) — ₹12,500/night (Direct Sea View & Bathtub)\n3️⃣ *Family Pool Cottage* (650 sq.ft) — ₹5,200/night (Interconnected for families)\n\nAll stays include complimentary Wi-Fi & access to the seaside infinity pool."
    },
    position: { x: 600, y: 380 }
  },
  {
    id: "node_select_room",
    type: "BUTTON_MENU",
    title: "Select Room Category",
    config: {
      prompt: "Which villa or suite would you like to check availability for?",
      variable: "selected_room_name",
      options: [
        { id: "room_garden", title: "Garden Villa 🌿", value: "Deluxe Garden Villa" },
        { id: "room_beach", title: "Beachfront Suite 🌊", value: "Luxury Beachfront Suite" },
        { id: "room_pool", title: "Family Cottage 🏊", value: "Family Pool Cottage" }
      ]
    },
    position: { x: 300, y: 500 }
  },
  {
    id: "node_ask_checkin",
    type: "INPUT_COLLECTION",
    title: "Input Check-in Date",
    config: {
      prompt: "📅 Please enter your *Check-in Date* (e.g. YYYY-MM-DD or say *tomorrow*):",
      variable: "check_in_date",
      validation: {
        type: "DATE",
        minDate: "TODAY",
        errorMessage: "⚠️ Please enter a valid date in YYYY-MM-DD format (e.g. 2026-11-20)."
      }
    },
    position: { x: 300, y: 620 }
  },
  {
    id: "node_ask_checkout",
    type: "INPUT_COLLECTION",
    title: "Input Check-out Date",
    config: {
      prompt: "📅 Please enter your *Check-out Date* (e.g. YYYY-MM-DD):",
      variable: "check_out_date",
      validation: {
        type: "DATE",
        afterDateVariable: "check_in_date",
        errorMessage: "⚠️ Check-out date must be after check-in date. Please re-enter (e.g. 2026-11-22):"
      }
    },
    position: { x: 300, y: 740 }
  },
  {
    id: "node_ask_guest_count",
    type: "INPUT_COLLECTION",
    title: "Input Guest Count",
    config: {
      prompt: "👥 How many guests will be staying? (e.g. 2 Adults, 1 Child):",
      variable: "guest_count_text",
      validation: {
        type: "GUEST_PARSER",
        defaultAdults: 2,
        defaultChildren: 0,
        assignAdultsVariable: "adults",
        assignChildrenVariable: "children"
      }
    },
    position: { x: 300, y: 860 }
  },
  {
    id: "node_check_availability",
    type: "BUSINESS_ACTION",
    title: "Check Room Availability",
    config: {
      action: "HOSPITALITY_CHECK_AVAILABILITY",
      inputs: {
        room_name: "{{selected_room_name}}",
        check_in: "{{check_in_date}}",
        check_out: "{{check_out_date}}",
        adults: "{{adults}}"
      },
      outputs: {
        is_available: "is_available",
        available_qty: "available_qty",
        matched_room_id: "matched_room_id",
        matched_room_name: "matched_room_name"
      }
    },
    position: { x: 300, y: 980 }
  },
  {
    id: "node_branch_availability",
    type: "CONDITION",
    title: "Branch on Availability",
    config: {
      variable: "is_available",
      rules: [
        { operator: "EQUALS", value: true, targetNodeId: "node_calc_pricing" },
        { operator: "EQUALS", value: false, targetNodeId: "node_sold_out_notice" }
      ],
      defaultTargetNodeId: "node_calc_pricing"
    },
    position: { x: 300, y: 1100 }
  },
  {
    id: "node_sold_out_notice",
    type: "MESSAGE",
    title: "Sold Out Notification",
    config: {
      text: "⚠️ Apologies! *{{selected_room_name}}* is fully committed for your requested dates ({{check_in_date}} to {{check_out_date}}).\n\nLet me connect you directly with our front desk reservations manager to explore alternative dates."
    },
    position: { x: 600, y: 1100 }
  },
  {
    id: "node_calc_pricing",
    type: "BUSINESS_ACTION",
    title: "Calculate Quote & Taxes",
    config: {
      action: "HOSPITALITY_CALCULATE_QUOTE",
      inputs: {
        room_type_id: "{{matched_room_id}}",
        check_in: "{{check_in_date}}",
        check_out: "{{check_out_date}}",
        adults: "{{adults}}",
        children: "{{children}}"
      },
      outputs: {
        quote_total: "quote_total",
        quote_subtotal: "quote_subtotal",
        tax_total: "tax_total",
        tax_percent: "tax_percent",
        nights: "nights",
        pricing_breakdown: "pricing_breakdown"
      }
    },
    position: { x: 300, y: 1220 }
  },
  {
    id: "node_display_quote",
    type: "MESSAGE",
    title: "Display Stay Quotation",
    config: {
      text: "✨ *Estimated Stay Quotation:*\n\n🏡 *Room:* {{matched_room_name}}\n📅 *Dates:* {{check_in_date}} to {{check_out_date}} ({{nights}} Night(s))\n👥 *Guests:* {{adults}} Adult(s), {{children}} Child(ren)\n\n💵 *Room Charges:* ₹{{quote_subtotal}}\n📊 *GST ({{tax_percent}}%):* ₹{{tax_total}}\n🏷️ *Total Estimated Payable:* *₹{{quote_total}}*\n\n_Includes complimentary breakfast, high-speed Wi-Fi, and pool access._"
    },
    position: { x: 300, y: 1340 }
  },
  {
    id: "node_ask_guest_name",
    type: "INPUT_COLLECTION",
    title: "Input Guest Name",
    config: {
      prompt: "To hold your reservation request and generate your enquiry, please reply with your *Full Name*:",
      variable: "guest_name",
      validation: {
        type: "TEXT",
        minLength: 2,
        errorMessage: "Please provide your name (at least 2 characters):"
      }
    },
    position: { x: 300, y: 1460 }
  },
  {
    id: "node_create_enquiry",
    type: "BUSINESS_ACTION",
    title: "Create CRM Booking Enquiry",
    config: {
      action: "HOSPITALITY_CREATE_ENQUIRY",
      inputs: {
        guest_name: "{{guest_name}}",
        phone: "{{sender_phone}}",
        check_in: "{{check_in_date}}",
        check_out: "{{check_out_date}}",
        adults: "{{adults}}",
        children: "{{children}}",
        room_type_id: "{{matched_room_id}}",
        quote_total: "{{quote_total}}",
        notes: "Automated WhatsApp Booking Flow"
      },
      outputs: {
        enquiry_id: "enquiry_id",
        quote_id: "quote_id",
        assigned_staff: "assigned_staff"
      }
    },
    position: { x: 300, y: 1580 }
  },
  {
    id: "node_confirm_enquiry",
    type: "CONFIRMATION",
    title: "Confirm Stay & Reserve",
    config: {
      prompt: "Dear {{guest_name}}, would you like to confirm your reservation enquiry for {{matched_room_name}} (₹{{quote_total}})?",
      variable: "booking_confirmation_choice",
      options: [
        { id: "opt_confirm_pay", title: "Confirm & Pay 💳", value: "CONFIRM" },
        { id: "opt_modify_stay", title: "Modify Dates 📅", value: "MODIFY" },
        { id: "opt_talk_desk", title: "Talk to Desk 💬", value: "STAFF" }
      ]
    },
    position: { x: 300, y: 1700 }
  },
  {
    id: "node_branch_confirmation",
    type: "CONDITION",
    title: "Branch on Confirmation",
    config: {
      variable: "booking_confirmation_choice",
      rules: [
        { operator: "EQUALS", value: "CONFIRM", targetNodeId: "node_payment_link" },
        { operator: "EQUALS", value: "MODIFY", targetNodeId: "node_select_room" },
        { operator: "EQUALS", value: "STAFF", targetNodeId: "node_concierge_handoff" }
      ],
      defaultTargetNodeId: "node_payment_link"
    },
    position: { x: 300, y: 1820 }
  },
  {
    id: "node_payment_link",
    type: "PAYMENT",
    title: "Generate Advance Payment Link",
    config: {
      amountVariable: "quote_total",
      currency: "INR",
      description: "Advance Deposit for {{matched_room_name}} Stay",
      paymentGateway: "RAZORPAY",
      action: "GENERATE_PAYMENT_LINK",
      outputs: {
        payment_link: "payment_link",
        payment_id: "payment_id",
        payment_status: "payment_status"
      }
    },
    position: { x: 300, y: 1940 }
  },
  {
    id: "node_booking_receipt",
    type: "MESSAGE",
    title: "Official Booking Voucher & Receipt",
    config: {
      text: "🧾 *Official Booking Voucher & Receipt #BK-{{enquiry_id}}* 🎉\n\nDear {{guest_name}}, your booking request has been locked in!\n\n🏡 *Accommodation:* {{matched_room_name}}\n📅 *Check-in:* {{check_in_date}} (14:00 hrs)\n📅 *Check-out:* {{check_out_date}} (11:00 hrs)\n👥 *Guests:* {{adults}} Adult(s), {{children}} Child(ren)\n💵 *Total Estimated Payable:* *₹{{quote_total}}*\n\n💳 *Advance Payment Link:* {{payment_link}}\n_Payment Reference: {{payment_id}}_\n\nAssigned Officer: *{{assigned_staff}}*. We look forward to hosting you in {{property.city}}!"
    },
    position: { x: 300, y: 2060 }
  },
  {
    id: "node_concierge_handoff",
    type: "HANDOFF",
    title: "Live Staff Handoff",
    config: {
      team: "FRONT_DESK",
      assignedTo: "Front Desk Reservations Manager",
      handoffMessage: "🔔 You are now connected with our Front Desk team. A member of our staff will respond to you shortly.",
      pauseAutomationMinutes: 180
    },
    position: { x: 300, y: 2180 }
  },
  {
    id: "node_end",
    type: "END",
    title: "End Journey",
    config: {
      farewellMessage: "Thank you for contacting {{property.name}}. We look forward to welcoming you!"
    },
    position: { x: 300, y: 2300 }
  }
];

const HOSPITALITY_BOOKING_TRANSITIONS = [
  { id: "t1", source: "node_start", target: "node_welcome" },
  { id: "t2", source: "node_welcome", target: "node_enquiry_type" },
  { id: "t3", source: "node_enquiry_type", target: "node_branch_enquiry" },
  { id: "t4", source: "node_rooms_overview", target: "node_select_room" },
  { id: "t5", source: "node_select_room", target: "node_ask_checkin" },
  { id: "t6", source: "node_ask_checkin", target: "node_ask_checkout" },
  { id: "t7", source: "node_ask_checkout", target: "node_ask_guest_count" },
  { id: "t8", source: "node_ask_guest_count", target: "node_check_availability" },
  { id: "t9", source: "node_check_availability", target: "node_branch_availability" },
  { id: "t10", source: "node_sold_out_notice", target: "node_concierge_handoff" },
  { id: "t11", source: "node_calc_pricing", target: "node_display_quote" },
  { id: "t12", source: "node_display_quote", target: "node_ask_guest_name" },
  { id: "t13", source: "node_ask_guest_name", target: "node_create_enquiry" },
  { id: "t14", source: "node_create_enquiry", target: "node_confirm_enquiry" },
  { id: "t15", source: "node_confirm_enquiry", target: "node_branch_confirmation" },
  { id: "t16", source: "node_payment_link", target: "node_booking_receipt" },
  { id: "t17", source: "node_booking_receipt", target: "node_concierge_handoff" },
  { id: "t18", source: "node_concierge_handoff", target: "node_end" }
];

const HOSPITALITY_BOOKING_VARIABLES = {
  enquiry_type: { type: "STRING", label: "Enquiry Type", defaultValue: "BOOKING" },
  selected_room_name: { type: "STRING", label: "Selected Room Name", defaultValue: "Deluxe Garden Villa" },
  check_in_date: { type: "DATE", label: "Check-in Date" },
  check_out_date: { type: "DATE", label: "Check-out Date" },
  adults: { type: "NUMBER", label: "Adult Count", defaultValue: 2 },
  children: { type: "NUMBER", label: "Child Count", defaultValue: 0 },
  guest_name: { type: "STRING", label: "Guest Name" },
  is_available: { type: "BOOLEAN", label: "Room Available Flag" },
  quote_total: { type: "NUMBER", label: "Quotation Total Amount" },
  quote_subtotal: { type: "NUMBER", label: "Quotation Subtotal" },
  tax_total: { type: "NUMBER", label: "Taxes Total" },
  tax_percent: { type: "NUMBER", label: "Tax Percentage", defaultValue: 12 },
  nights: { type: "NUMBER", label: "Number of Nights", defaultValue: 1 },
  enquiry_id: { type: "NUMBER", label: "Enquiry Record ID" },
  assigned_staff: { type: "STRING", label: "Assigned Staff Member" },
  booking_confirmation_choice: { type: "STRING", label: "Confirmation Choice", defaultValue: "CONFIRM" },
  payment_link: { type: "STRING", label: "Payment Gateway Link" },
  payment_id: { type: "STRING", label: "Payment Reference ID" },
  payment_status: { type: "STRING", label: "Payment Status", defaultValue: "PENDING" }
};

const FAQ_JOURNEY_NODES = [
  {
    id: "faq_start",
    type: "START",
    title: "FAQ Start",
    config: {
      triggerType: "KEYWORD_MATCH",
      triggerKeywords: ["faq", "help", "info", "pool", "food", "timing", "directions", "policy"]
    },
    position: { x: 300, y: 50 }
  },
  {
    id: "faq_welcome",
    type: "MESSAGE",
    title: "Concierge FAQ Menu",
    config: {
      text: "ℹ️ *{{property.name}} Concierge Desk*\n\nHow can we help make your stay effortless? Please select a topic below:"
    },
    position: { x: 300, y: 150 }
  },
  {
    id: "faq_category_menu",
    type: "BUTTON_MENU",
    title: "Select FAQ Topic",
    config: {
      prompt: "Choose a category to view details:",
      variable: "faq_category",
      options: [
        { id: "faq_timings", title: "Timings & Policies ⏰", value: "TIMINGS" },
        { id: "faq_dining", title: "Dining & Cuisine 🍽️", value: "DINING" },
        { id: "faq_travel", title: "How to Reach 🚗", value: "TRAVEL" }
      ]
    },
    position: { x: 300, y: 260 }
  },
  {
    id: "faq_lookup_action",
    type: "BUSINESS_ACTION",
    title: "Lookup FAQ Content",
    config: {
      action: "HOSPITALITY_LOOKUP_FAQ",
      inputs: {
        category: "{{faq_category}}"
      },
      outputs: {
        faq_response: "faq_answer_text"
      }
    },
    position: { x: 300, y: 380 }
  },
  {
    id: "faq_display_answer",
    type: "MESSAGE",
    title: "Display FAQ Answer",
    config: {
      text: "{{faq_answer_text}}"
    },
    position: { x: 300, y: 500 }
  },
  {
    id: "faq_next_steps",
    type: "BUTTON_MENU",
    title: "Next Steps",
    config: {
      prompt: "Can we assist you with anything else?",
      variable: "faq_followup",
      options: [
        { id: "opt_book", title: "Book a Room 🛏️", value: "BOOK" },
        { id: "opt_staff", title: "Talk to Human 💬", value: "STAFF" },
        { id: "opt_done", title: "All Good 👍", value: "DONE" }
      ]
    },
    position: { x: 300, y: 620 }
  },
  {
    id: "faq_branch_followup",
    type: "CONDITION",
    title: "Branch on Followup",
    config: {
      variable: "faq_followup",
      rules: [
        { operator: "EQUALS", value: "STAFF", targetNodeId: "faq_handoff" },
        { operator: "EQUALS", value: "DONE", targetNodeId: "faq_end" }
      ],
      defaultTargetNodeId: "faq_end"
    },
    position: { x: 300, y: 740 }
  },
  {
    id: "faq_handoff",
    type: "HANDOFF",
    title: "Transfer to Front Desk",
    config: {
      team: "FRONT_DESK",
      assignedTo: "Concierge Supervisor",
      handoffMessage: "Connecting you with our Concierge supervisor. Please hold on...",
      pauseAutomationMinutes: 120
    },
    position: { x: 150, y: 860 }
  },
  {
    id: "faq_end",
    type: "END",
    title: "End FAQ Session",
    config: {
      farewellMessage: "Thank you for checking with {{property.name}}. We hope to host you soon!"
    },
    position: { x: 450, y: 860 }
  }
];

const FAQ_JOURNEY_TRANSITIONS = [
  { id: "ft1", source: "faq_start", target: "faq_welcome" },
  { id: "ft2", source: "faq_welcome", target: "faq_category_menu" },
  { id: "ft3", source: "faq_category_menu", target: "faq_lookup_action" },
  { id: "ft4", source: "faq_lookup_action", target: "faq_display_answer" },
  { id: "ft5", source: "faq_display_answer", target: "faq_next_steps" },
  { id: "ft6", source: "faq_next_steps", target: "faq_branch_followup" },
  { id: "ft7", source: "faq_handoff", target: "faq_end" }
];

const FAQ_JOURNEY_VARIABLES = {
  faq_category: { type: "STRING", label: "Selected Category", defaultValue: "TIMINGS" },
  faq_answer_text: { type: "STRING", label: "FAQ Response Text" },
  faq_followup: { type: "STRING", label: "Followup Choice", defaultValue: "DONE" }
};

const STAFF_HANDOFF_NODES = [
  {
    id: "sh_start",
    type: "START",
    title: "Handoff Request Start",
    config: {
      triggerType: "KEYWORD_MATCH",
      triggerKeywords: ["agent", "human", "talk", "manager", "support", "complaint", "emergency"]
    },
    position: { x: 300, y: 50 }
  },
  {
    id: "sh_ask_reason",
    type: "INPUT_COLLECTION",
    title: "Collect Query Reason",
    config: {
      prompt: "Please briefly describe your query so we can connect you with the appropriate team member:",
      variable: "handoff_reason",
      validation: {
        type: "TEXT",
        minLength: 3,
        errorMessage: "Please provide a short description of how we can help:"
      }
    },
    position: { x: 300, y: 160 }
  },
  {
    id: "sh_assign_action",
    type: "BUSINESS_ACTION",
    title: "Log Enquiry & Notify Staff",
    config: {
      action: "ASSIGN_STAFF",
      inputs: {
        reason: "{{handoff_reason}}",
        phone: "{{sender_phone}}"
      },
      outputs: {
        assigned_officer: "assigned_officer"
      }
    },
    position: { x: 300, y: 280 }
  },
  {
    id: "sh_handoff_node",
    type: "HANDOFF",
    title: "Direct Human Transfer",
    config: {
      team: "RESERVATIONS",
      assignedTo: "{{assigned_officer}}",
      handoffMessage: "🔔 You have been transferred to {{assigned_officer}}. They will respond directly on this chat.",
      pauseAutomationMinutes: 240
    },
    position: { x: 300, y: 400 }
  },
  {
    id: "sh_end",
    type: "END",
    title: "End Automation",
    config: {},
    position: { x: 300, y: 520 }
  }
];

const STAFF_HANDOFF_TRANSITIONS = [
  { id: "st1", source: "sh_start", target: "sh_ask_reason" },
  { id: "st2", source: "sh_ask_reason", target: "sh_assign_action" },
  { id: "st3", source: "sh_assign_action", target: "sh_handoff_node" },
  { id: "st4", source: "sh_handoff_node", target: "sh_end" }
];

const STAFF_HANDOFF_VARIABLES = {
  handoff_reason: { type: "STRING", label: "Reason for Handoff" },
  assigned_officer: { type: "STRING", label: "Designated Officer", defaultValue: "Duty Manager" }
};

const SALES_QUOTATION_B2B_NODES = [
  {
    id: "b2b_start",
    type: "START",
    title: "B2B Sales Inquiry Start",
    config: {
      triggerType: "KEYWORD_MATCH",
      triggerKeywords: ["pricing", "plans", "quote", "demo", "sales", "enterprise", "software", "api", "b2b"]
    },
    position: { x: 300, y: 50 }
  },
  {
    id: "b2b_welcome",
    type: "MESSAGE",
    title: "Welcome to Survya Enterprise",
    config: {
      text: "💼 *Welcome to Survya Enterprise Automation!* 🚀\n\nPower your customer operations with high-throughput WhatsApp Cloud API, visual workflow journeys, and unified CRM automation. Let's design the right stack for your business."
    },
    position: { x: 300, y: 150 }
  },
  {
    id: "b2b_select_plan",
    type: "BUTTON_MENU",
    title: "Select Software Edition",
    config: {
      prompt: "Which software edition aligns with your business goals?",
      variable: "selected_plan",
      options: [
        { id: "opt_starter", title: "Starter Suite 🚀", value: "STARTER" },
        { id: "opt_growth", title: "Growth Hub ⚡", value: "GROWTH" },
        { id: "opt_enterprise", title: "Enterprise Cloud 🏢", value: "ENTERPRISE" }
      ]
    },
    position: { x: 300, y: 260 }
  },
  {
    id: "b2b_show_plan_features",
    type: "MESSAGE",
    title: "Show Plan Features",
    config: {
      text: "📋 *{{selected_plan}} Edition Inclusions:*\n\n✅ Official Meta Cloud API Connectivity\n✅ Drag-and-Drop Visual Workflow Studio\n✅ Multi-Agent Team Inbox & Handoff\n✅ Webhooks & CRM Integration Endpoints\n\nLet's calculate your monthly investment."
    },
    position: { x: 300, y: 380 }
  },
  {
    id: "b2b_ask_team_size",
    type: "INPUT_COLLECTION",
    title: "Collect Team Size",
    config: {
      prompt: "👥 How many team members or agents will need access? (e.g. 5, 10, 25):",
      variable: "team_size",
      validation: {
        type: "NUMBER",
        errorMessage: "Please enter a valid number of team members (e.g. 5):"
      }
    },
    position: { x: 300, y: 500 }
  },
  {
    id: "b2b_ask_volume",
    type: "INPUT_COLLECTION",
    title: "Collect Message Volume",
    config: {
      prompt: "📈 What is your estimated monthly outgoing WhatsApp message volume? (e.g. 10000, 50000, 250000):",
      variable: "monthly_volume",
      validation: {
        type: "NUMBER",
        errorMessage: "Please enter a valid numeric message volume (e.g. 25000):"
      }
    },
    position: { x: 300, y: 620 }
  },
  {
    id: "b2b_calc_quote",
    type: "BUSINESS_ACTION",
    title: "Calculate B2B Quotation",
    config: {
      action: "B2B_CALCULATE_SALES_QUOTE",
      inputs: {
        plan_name: "{{selected_plan}}",
        team_size: "{{team_size}}",
        monthly_volume: "{{monthly_volume}}"
      },
      outputs: {
        quote_total: "quote_total",
        quote_subtotal: "quote_subtotal",
        tax_total: "tax_total",
        tax_percent: "tax_percent",
        deposit_amount: "deposit_amount"
      }
    },
    position: { x: 300, y: 740 }
  },
  {
    id: "b2b_display_quote",
    type: "MESSAGE",
    title: "Display Sales Quotation",
    config: {
      text: "📊 *Survya Custom Quotation & Proposal:*\n\n💼 *Edition:* {{selected_plan}}\n👥 *Team Seats:* {{team_size}} Authorized Users\n📈 *Volume Allowance:* {{monthly_volume}} Monthly Messages\n\n💵 *Software License:* ₹{{quote_subtotal}}/mo\n📊 *GST ({{tax_percent}}%):* ₹{{tax_total}}\n🏷️ *Total Monthly Investment:* *₹{{quote_total}}*\n\n_Includes 99.9% uptime SLA, dedicated onboarding manager, and 24/7 technical support._"
    },
    position: { x: 300, y: 860 }
  },
  {
    id: "b2b_confirm_quote",
    type: "CONFIRMATION",
    title: "Confirm Proposal",
    config: {
      prompt: "Would you like to lock in this proposal and connect with your Enterprise Solutions Architect?",
      variable: "b2b_confirm_choice",
      options: [
        { id: "opt_lockin", title: "Lock In Proposal ✅", value: "CONFIRM" },
        { id: "opt_adjust", title: "Adjust Plan ✏️", value: "MODIFY" },
        { id: "opt_speak", title: "Talk to Sales 💬", value: "SALES" }
      ]
    },
    position: { x: 300, y: 980 }
  },
  {
    id: "b2b_branch_confirm",
    type: "CONDITION",
    title: "Branch on Client Decision",
    config: {
      variable: "b2b_confirm_choice",
      rules: [
        { operator: "EQUALS", value: "CONFIRM", targetNodeId: "b2b_create_deal" },
        { operator: "EQUALS", value: "MODIFY", targetNodeId: "b2b_select_plan" },
        { operator: "EQUALS", value: "SALES", targetNodeId: "b2b_sales_handoff" }
      ],
      defaultTargetNodeId: "b2b_create_deal"
    },
    position: { x: 300, y: 1100 }
  },
  {
    id: "b2b_create_deal",
    type: "BUSINESS_ACTION",
    title: "Create CRM Deal Record",
    config: {
      action: "B2B_CREATE_SALES_DEAL",
      inputs: {
        plan_name: "{{selected_plan}}",
        team_size: "{{team_size}}",
        monthly_volume: "{{monthly_volume}}",
        quote_total: "{{quote_total}}",
        phone: "{{sender_phone}}"
      },
      outputs: {
        deal_id: "deal_id",
        assigned_executive: "assigned_executive",
        deal_stage: "deal_stage"
      }
    },
    position: { x: 300, y: 1220 }
  },
  {
    id: "b2b_deal_receipt",
    type: "MESSAGE",
    title: "Deal Confirmation Notice",
    config: {
      text: "🎉 *Deal #DEAL-{{deal_id}} Registered Successfully!* 🚀\n\nYour formal enterprise proposal has been initialized with stage *{{deal_stage}}*.\nAssigned Account Executive: *{{assigned_executive}}*.\n\nNext step: To reserve your deployment slot and setup provisioning, you may authorize the onboarding retainer below."
    },
    position: { x: 300, y: 1340 }
  },
  {
    id: "b2b_payment_deposit",
    type: "PAYMENT",
    title: "Onboarding Retainer Link",
    config: {
      amountVariable: "deposit_amount",
      currency: "INR",
      description: "Priority Onboarding Retainer for Proposal #DEAL-{{deal_id}}",
      paymentGateway: "RAZORPAY",
      action: "GENERATE_PAYMENT_LINK",
      outputs: {
        payment_link: "payment_link",
        payment_id: "payment_id",
        payment_status: "payment_status"
      }
    },
    position: { x: 300, y: 1460 }
  },
  {
    id: "b2b_sales_handoff",
    type: "HANDOFF",
    title: "Transfer to Account Executive",
    config: {
      team: "ENTERPRISE_SALES",
      assignedTo: "{{assigned_executive}}",
      handoffMessage: "🔔 Transferring you to your dedicated Enterprise Solutions Architect ({{assigned_executive}}). We will follow up right here on WhatsApp shortly.",
      pauseAutomationMinutes: 240
    },
    position: { x: 300, y: 1580 }
  },
  {
    id: "b2b_end",
    type: "END",
    title: "End Sales Session",
    config: {
      farewellMessage: "Thank you for contacting Survya. We look forward to powering your customer conversations!"
    },
    position: { x: 300, y: 1700 }
  }
];

const SALES_QUOTATION_B2B_TRANSITIONS = [
  { id: "bt1", source: "b2b_start", target: "b2b_welcome" },
  { id: "bt2", source: "b2b_welcome", target: "b2b_select_plan" },
  { id: "bt3", source: "b2b_select_plan", target: "b2b_show_plan_features" },
  { id: "bt4", source: "b2b_show_plan_features", target: "b2b_ask_team_size" },
  { id: "bt5", source: "b2b_ask_team_size", target: "b2b_ask_volume" },
  { id: "bt6", source: "b2b_ask_volume", target: "b2b_calc_quote" },
  { id: "bt7", source: "b2b_calc_quote", target: "b2b_display_quote" },
  { id: "bt8", source: "b2b_display_quote", target: "b2b_confirm_quote" },
  { id: "bt9", source: "b2b_confirm_quote", target: "b2b_branch_confirm" },
  { id: "bt10", source: "b2b_create_deal", target: "b2b_deal_receipt" },
  { id: "bt11", source: "b2b_deal_receipt", target: "b2b_payment_deposit" },
  { id: "bt12", source: "b2b_payment_deposit", target: "b2b_sales_handoff" },
  { id: "bt13", source: "b2b_sales_handoff", target: "b2b_end" }
];

const SALES_QUOTATION_B2B_VARIABLES = {
  selected_plan: { type: "STRING", label: "Selected Software Plan", defaultValue: "GROWTH" },
  team_size: { type: "NUMBER", label: "Number of Team Seats", defaultValue: 5 },
  monthly_volume: { type: "NUMBER", label: "Monthly Message Volume", defaultValue: 25000 },
  quote_total: { type: "NUMBER", label: "Quotation Total Amount" },
  quote_subtotal: { type: "NUMBER", label: "Quotation Subtotal" },
  tax_total: { type: "NUMBER", label: "Tax Amount" },
  tax_percent: { type: "NUMBER", label: "Tax Percentage", defaultValue: 18 },
  deposit_amount: { type: "NUMBER", label: "Onboarding Deposit", defaultValue: 5000 },
  b2b_confirm_choice: { type: "STRING", label: "Confirmation Choice", defaultValue: "CONFIRM" },
  deal_id: { type: "NUMBER", label: "CRM Deal ID" },
  assigned_executive: { type: "STRING", label: "Assigned Account Exec", defaultValue: "Enterprise Solutions Architect" },
  deal_stage: { type: "STRING", label: "Deal Stage", defaultValue: "QUALIFIED_PROSPECT" },
  payment_link: { type: "STRING", label: "Payment Gateway Link" },
  payment_id: { type: "STRING", label: "Payment Reference ID" },
  payment_status: { type: "STRING", label: "Payment Status", defaultValue: "PENDING" }
};

// =========================================================================
// 5. BLUEPRINT: B2B SALES QUALIFICATION & PIPELINE ROUTING
// =========================================================================
const B2B_SALES_QUALIFICATION_NODES = [
  {
    id: "b2b_start",
    type: "TRIGGER_WHATSAPP",
    title: "Inbound Keyword Trigger",
    data: {
      triggerType: "KEYWORD",
      keywords: ["demo", "enterprise", "pricing", "sales", "b2b"],
      matchType: "CONTAINS"
    },
    config: {
      triggerType: "KEYWORD",
      keywords: ["demo", "enterprise", "pricing", "sales", "b2b"],
      matchType: "CONTAINS"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "b2b_welcome",
    type: "SEND_MESSAGE",
    title: "Welcome & Value Prop",
    data: {
      messageText: "💼 *Welcome to Survya Enterprise Solutions!* 🚀\n\nI can qualify your requirements, prepare volume pricing, and connect you with a dedicated Solutions Architect. Let's get started!"
    },
    config: {
      text: "💼 *Welcome to Survya Enterprise Solutions!* 🚀\n\nI can qualify your requirements, prepare volume pricing, and connect you with a dedicated Solutions Architect. Let's get started!"
    },
    position: { x: 400, y: 160 }
  },
  {
    id: "b2b_ask_company",
    type: "COLLECT_INPUT",
    title: "Collect Company Name",
    data: {
      prompt: "🏢 What is the name of your organization or company?",
      variable: "company_name",
      validationType: "ANY"
    },
    config: {
      prompt: "🏢 What is the name of your organization or company?",
      variable: "company_name",
      validation: { type: "ANY" }
    },
    position: { x: 400, y: 270 }
  },
  {
    id: "b2b_ask_seats",
    type: "COLLECT_INPUT",
    title: "Collect Team Seats",
    data: {
      prompt: "👥 How many team seats or active agents do you anticipate deploying? (e.g. 10, 50, 200)",
      variable: "team_seats",
      validationType: "NUMBER"
    },
    config: {
      prompt: "👥 How many team seats or active agents do you anticipate deploying? (e.g. 10, 50, 200)",
      variable: "team_seats",
      validation: { type: "NUMBER" }
    },
    position: { x: 400, y: 380 }
  },
  {
    id: "b2b_set_score",
    type: "SET_VARIABLE",
    title: "Calculate Lead Score",
    data: {
      variable: "lead_score",
      action: "SET",
      value: "85"
    },
    config: {
      variable: "lead_score",
      action: "SET",
      value: "85"
    },
    position: { x: 400, y: 490 }
  },
  {
    id: "b2b_eval_tier",
    type: "CONDITION",
    title: "Evaluate Enterprise Threshold",
    data: {
      rules: [
        { variable: "team_seats", operator: "GREATER_THAN_OR_EQUAL", value: 25 }
      ],
      conditionMatch: "ALL"
    },
    config: {
      rules: [
        { variable: "team_seats", operator: "GREATER_THAN_OR_EQUAL", value: 25 }
      ],
      conditionMatch: "ALL"
    },
    position: { x: 400, y: 600 }
  },
  {
    id: "b2b_crm_sql",
    type: "CRM_UPSERT",
    title: "Record SQL Deal",
    data: {
      pipelineName: "B2B Sales Pipeline",
      stageName: "Demo Scheduled",
      dealValue: 60000,
      leadScore: 90,
      tags: ["Enterprise", "High Value"],
      recordTitle: "{{company_name}} Enterprise Demo"
    },
    config: {
      pipelineName: "B2B Sales Pipeline",
      stageName: "Demo Scheduled",
      dealValue: 60000,
      leadScore: 90,
      tags: ["Enterprise", "High Value"],
      recordTitle: "{{company_name}} Enterprise Demo"
    },
    position: { x: 250, y: 720 }
  },
  {
    id: "b2b_notify_webhook",
    type: "HTTP_WEBHOOK",
    title: "Notify Sales Webhook",
    data: {
      url: "https://api.example.com/webhooks/sales-alert",
      method: "POST",
      bodyTemplate: "{\"company\":\"{{company_name}}\",\"seats\":\"{{team_seats}}\"}"
    },
    config: {
      url: "https://api.example.com/webhooks/sales-alert",
      method: "POST",
      bodyTemplate: "{\"company\":\"{{company_name}}\",\"seats\":\"{{team_seats}}\"}"
    },
    position: { x: 250, y: 830 }
  },
  {
    id: "b2b_sql_message",
    type: "SEND_MESSAGE",
    title: "Send SQL Confirmation",
    data: {
      messageText: "🔥 *Priority Enterprise Demo Reserved!*\n\nThank you, *{{company_name}}*. Based on your {{team_seats}} team seats, an Enterprise Solutions Architect has been assigned to your account."
    },
    config: {
      text: "🔥 *Priority Enterprise Demo Reserved!*\n\nThank you, *{{company_name}}*. Based on your {{team_seats}} team seats, an Enterprise Solutions Architect has been assigned to your account."
    },
    position: { x: 250, y: 940 }
  },
  {
    id: "b2b_delay",
    type: "WAIT_DELAY",
    title: "Short Delay Before Follow-up",
    data: {
      delayAmount: 15,
      delayUnit: "MINUTES",
      cancelOnReply: true
    },
    config: {
      delayAmount: 15,
      delayUnit: "MINUTES",
      cancelOnReply: true
    },
    position: { x: 250, y: 1050 }
  },
  {
    id: "b2b_followup_msg",
    type: "SEND_MESSAGE",
    title: "Follow-up Availability Check",
    data: {
      messageText: "👋 Checking in from Survya! Would you prefer a morning (11 AM) or afternoon (3 PM IST) slot for your architecture walkthrough?"
    },
    config: {
      text: "👋 Checking in from Survya! Would you prefer a morning (11 AM) or afternoon (3 PM IST) slot for your architecture walkthrough?"
    },
    position: { x: 250, y: 1160 }
  },
  {
    id: "b2b_crm_mql",
    type: "CRM_UPSERT",
    title: "Record MQL Lead",
    data: {
      pipelineName: "B2B Sales Pipeline",
      stageName: "Lead Inflow",
      dealValue: 12000,
      leadScore: 50,
      tags: ["Starter", "Self-Serve"],
      recordTitle: "{{company_name}} Starter"
    },
    config: {
      pipelineName: "B2B Sales Pipeline",
      stageName: "Lead Inflow",
      dealValue: 12000,
      leadScore: 50,
      tags: ["Starter", "Self-Serve"],
      recordTitle: "{{company_name}} Starter"
    },
    position: { x: 550, y: 720 }
  },
  {
    id: "b2b_mql_message",
    type: "SEND_MESSAGE",
    title: "Send MQL Self-Serve Guide",
    data: {
      messageText: "✨ *Thank you, {{company_name}}!*\n\nWe've sent our self-service pricing details and developer quickstart to your number. Let us know if you need any assistance!"
    },
    config: {
      text: "✨ *Thank you, {{company_name}}!*\n\nWe've sent our self-service pricing details and developer quickstart to your number. Let us know if you need any assistance!"
    },
    position: { x: 550, y: 830 }
  },
  {
    id: "b2b_end",
    type: "END",
    title: "End Journey",
    data: {
      reason: "COMPLETED"
    },
    config: {
      reason: "COMPLETED"
    },
    position: { x: 400, y: 1280 }
  }
];

const B2B_SALES_QUALIFICATION_TRANSITIONS = [
  { id: "e_b2b_1", source: "b2b_start", target: "b2b_welcome", sourceHandle: "default" },
  { id: "e_b2b_2", source: "b2b_welcome", target: "b2b_ask_company", sourceHandle: "default" },
  { id: "e_b2b_3", source: "b2b_ask_company", target: "b2b_ask_seats", sourceHandle: "default" },
  { id: "e_b2b_4", source: "b2b_ask_seats", target: "b2b_set_score", sourceHandle: "default" },
  { id: "e_b2b_5", source: "b2b_set_score", target: "b2b_eval_tier", sourceHandle: "default" },
  { id: "e_b2b_6", source: "b2b_eval_tier", target: "b2b_crm_sql", sourceHandle: "true" },
  { id: "e_b2b_7", source: "b2b_eval_tier", target: "b2b_crm_mql", sourceHandle: "false" },
  { id: "e_b2b_8", source: "b2b_crm_sql", target: "b2b_notify_webhook", sourceHandle: "default" },
  { id: "e_b2b_9", source: "b2b_notify_webhook", target: "b2b_sql_message", sourceHandle: "default" },
  { id: "e_b2b_10", source: "b2b_sql_message", target: "b2b_delay", sourceHandle: "default" },
  { id: "e_b2b_11", source: "b2b_delay", target: "b2b_followup_msg", sourceHandle: "default" },
  { id: "e_b2b_12", source: "b2b_followup_msg", target: "b2b_end", sourceHandle: "default" },
  { id: "e_b2b_13", source: "b2b_crm_mql", target: "b2b_mql_message", sourceHandle: "default" },
  { id: "e_b2b_14", source: "b2b_mql_message", target: "b2b_end", sourceHandle: "default" }
];

const B2B_SALES_QUALIFICATION_VARIABLES = {
  company_name: { type: "STRING", label: "Company Name" },
  team_seats: { type: "NUMBER", label: "Team Seats", defaultValue: 10 },
  lead_score: { type: "NUMBER", label: "Lead Score", defaultValue: 50 },
  crm_record_id: { type: "NUMBER", label: "CRM Record ID" }
};

// =========================================================================
// 6. BLUEPRINT: MULTI-CHANNEL LEAD GENERATION & SMART DRIP
// =========================================================================
const MULTI_CHANNEL_LEAD_GEN_NODES = [
  {
    id: "lead_start",
    type: "TRIGGER_EVENT",
    title: "Web Form or Inbound Trigger",
    data: {
      eventType: "WEBHOOK",
      triggerKey: "hook_lead_gen_drip",
      eventName: "lead_form_submitted"
    },
    config: {
      eventType: "WEBHOOK",
      triggerKey: "hook_lead_gen_drip",
      eventName: "lead_form_submitted"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "lead_welcome",
    type: "SEND_MESSAGE",
    title: "Instant Brochure Delivery",
    data: {
      messageText: "🎁 *Your Growth Playbook is Ready!*\n\nThank you for reaching out! You can download your copy directly here: https://survya.flex-us.com/resources/growth-playbook.pdf\n\nI'll check back in shortly to see if you have any questions."
    },
    config: {
      text: "🎁 *Your Growth Playbook is Ready!*\n\nThank you for reaching out! You can download your copy directly here: https://survya.flex-us.com/resources/growth-playbook.pdf\n\nI'll check back in shortly to see if you have any questions."
    },
    position: { x: 400, y: 160 }
  },
  {
    id: "lead_crm_upsert",
    type: "CRM_UPSERT",
    title: "Sync to Lead Pipeline",
    data: {
      pipelineName: "Lead Generation Pipeline",
      stageName: "New Lead",
      dealValue: 5000,
      leadScore: 60,
      tags: ["Inbound Web", "Playbook Download"],
      recordTitle: "New Growth Playbook Lead"
    },
    config: {
      pipelineName: "Lead Generation Pipeline",
      stageName: "New Lead",
      dealValue: 5000,
      leadScore: 60,
      tags: ["Inbound Web", "Playbook Download"],
      recordTitle: "New Growth Playbook Lead"
    },
    position: { x: 400, y: 270 }
  },
  {
    id: "lead_delay",
    type: "WAIT_DELAY",
    title: "30-Minute Nurture Delay",
    data: {
      delayAmount: 30,
      delayUnit: "MINUTES",
      cancelOnReply: true
    },
    config: {
      delayAmount: 30,
      delayUnit: "MINUTES",
      cancelOnReply: true
    },
    position: { x: 400, y: 380 }
  },
  {
    id: "lead_ask_feedback",
    type: "COLLECT_INPUT",
    title: "Ask for Feedback",
    data: {
      prompt: "👋 Quick question! Did you get a chance to review the playbook? Would you like us to share 3 custom ideas for your business? (Reply *Yes* or *No*)",
      variable: "user_interest",
      validationType: "ANY"
    },
    config: {
      prompt: "👋 Quick question! Did you get a chance to review the playbook? Would you like us to share 3 custom ideas for your business? (Reply *Yes* or *No*)",
      variable: "user_interest",
      validation: { type: "ANY" }
    },
    position: { x: 400, y: 490 }
  },
  {
    id: "lead_branch_interest",
    type: "CONDITION",
    title: "Branch on Interest",
    data: {
      rules: [
        { variable: "user_interest", operator: "CONTAINS", value: "yes" }
      ],
      conditionMatch: "ANY"
    },
    config: {
      rules: [
        { variable: "user_interest", operator: "CONTAINS", value: "yes" }
      ],
      conditionMatch: "ANY"
    },
    position: { x: 400, y: 600 }
  },
  {
    id: "lead_handoff",
    type: "HUMAN_HANDOFF",
    title: "Consultant Handoff",
    data: {
      prompt: "Awesome! Connecting you with our Senior Growth Consultant right now.",
      department: "SALES"
    },
    config: {
      prompt: "Awesome! Connecting you with our Senior Growth Consultant right now.",
      department: "SALES"
    },
    position: { x: 250, y: 720 }
  },
  {
    id: "lead_nurture_msg",
    type: "SEND_MESSAGE",
    title: "Gentle Nurture Note",
    data: {
      messageText: "No worries at all! Enjoy the playbook, and feel free to reach out anytime if questions pop up."
    },
    config: {
      text: "No worries at all! Enjoy the playbook, and feel free to reach out anytime if questions pop up."
    },
    position: { x: 550, y: 720 }
  },
  {
    id: "lead_end",
    type: "END",
    title: "End Drip",
    data: {
      reason: "COMPLETED"
    },
    config: {
      reason: "COMPLETED"
    },
    position: { x: 400, y: 840 }
  }
];

const MULTI_CHANNEL_LEAD_GEN_TRANSITIONS = [
  { id: "e_lead_1", source: "lead_start", target: "lead_welcome", sourceHandle: "default" },
  { id: "e_lead_2", source: "lead_welcome", target: "lead_crm_upsert", sourceHandle: "default" },
  { id: "e_lead_3", source: "lead_crm_upsert", target: "lead_delay", sourceHandle: "default" },
  { id: "e_lead_4", source: "lead_delay", target: "lead_ask_feedback", sourceHandle: "default" },
  { id: "e_lead_5", source: "lead_ask_feedback", target: "lead_branch_interest", sourceHandle: "default" },
  { id: "e_lead_6", source: "lead_branch_interest", target: "lead_handoff", sourceHandle: "true" },
  { id: "e_lead_7", source: "lead_branch_interest", target: "lead_nurture_msg", sourceHandle: "false" },
  { id: "e_lead_8", source: "lead_handoff", target: "lead_end", sourceHandle: "default" },
  { id: "e_lead_9", source: "lead_nurture_msg", target: "lead_end", sourceHandle: "default" }
];

const MULTI_CHANNEL_LEAD_GEN_VARIABLES = {
  user_interest: { type: "STRING", label: "User Interest Response" },
  lead_score: { type: "NUMBER", label: "Lead Score", defaultValue: 60 }
};

// =========================================================================
// 7. BLUEPRINT: UNIVERSAL DYNAMIC BOOKING & RESERVATION ENGINE
// =========================================================================
const UNIVERSAL_DYNAMIC_BOOKING_NODES = [
  {
    id: "ub_start",
    type: "TRIGGER_WHATSAPP",
    title: "Reservation Trigger",
    data: {
      triggerType: "KEYWORD",
      keywords: ["book", "reserve", "appointment", "schedule", "stay"],
      matchType: "CONTAINS"
    },
    config: {
      triggerType: "KEYWORD",
      keywords: ["book", "reserve", "appointment", "schedule", "stay"],
      matchType: "CONTAINS"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "ub_welcome",
    type: "SEND_MESSAGE",
    title: "Booking Welcome",
    data: {
      messageText: "🗓️ *Welcome to Dynamic Reservations!* ✨\n\nLet's check real-time availability and lock in your reservation in under 60 seconds."
    },
    config: {
      text: "🗓️ *Welcome to Dynamic Reservations!* ✨\n\nLet's check real-time availability and lock in your reservation in under 60 seconds."
    },
    position: { x: 400, y: 160 }
  },
  {
    id: "ub_catalog",
    type: "CATALOG_BOOKING",
    title: "Check Inventory Availability",
    data: {
      action: "CHECK_AVAILABILITY",
      prompt: "Please select an available room or package:",
      variable: "selected_item"
    },
    config: {
      action: "CHECK_AVAILABILITY",
      prompt: "Please select an available room or package:",
      variable: "selected_item"
    },
    position: { x: 400, y: 270 }
  },
  {
    id: "ub_date",
    type: "COLLECT_INPUT",
    title: "Input Reservation Date",
    data: {
      prompt: "📅 Please enter your requested date (e.g. YYYY-MM-DD or say *tomorrow*):",
      variable: "booking_date",
      validationType: "DATE"
    },
    config: {
      prompt: "📅 Please enter your requested date (e.g. YYYY-MM-DD or say *tomorrow*):",
      variable: "booking_date",
      validation: { type: "DATE" }
    },
    position: { x: 400, y: 380 }
  },
  {
    id: "ub_name",
    type: "COLLECT_INPUT",
    title: "Input Customer Name",
    data: {
      prompt: "👤 Please enter your full name for the booking confirmation:",
      variable: "customer_name",
      validationType: "ANY"
    },
    config: {
      prompt: "👤 Please enter your full name for the booking confirmation:",
      variable: "customer_name",
      validation: { type: "ANY" }
    },
    position: { x: 400, y: 490 }
  },
  {
    id: "ub_crm",
    type: "CRM_UPSERT",
    title: "Create Reservation Record",
    data: {
      pipelineName: "Universal Booking Pipeline",
      stageName: "Booking Requested",
      dealValue: 8500,
      leadScore: 80,
      tags: ["Dynamic Booking", "Direct WhatsApp"],
      recordTitle: "{{customer_name}} - {{booking_date}}"
    },
    config: {
      pipelineName: "Universal Booking Pipeline",
      stageName: "Booking Requested",
      dealValue: 8500,
      leadScore: 80,
      tags: ["Dynamic Booking", "Direct WhatsApp"],
      recordTitle: "{{customer_name}} - {{booking_date}}"
    },
    position: { x: 400, y: 600 }
  },
  {
    id: "ub_confirm_msg",
    type: "SEND_MESSAGE",
    title: "Booking Acknowledgment",
    data: {
      messageText: "✅ *Reservation Request Received!*\n\nDear *{{customer_name}}*, your booking for *{{booking_date}}* is recorded. Our team is verifying room allocation and will send instant confirmation shortly."
    },
    config: {
      text: "✅ *Reservation Request Received!*\n\nDear *{{customer_name}}*, your booking for *{{booking_date}}* is recorded. Our team is verifying room allocation and will send instant confirmation shortly."
    },
    position: { x: 400, y: 710 }
  },
  {
    id: "ub_end",
    type: "END",
    title: "End Booking Journey",
    data: {
      reason: "COMPLETED"
    },
    config: {
      reason: "COMPLETED"
    },
    position: { x: 400, y: 820 }
  }
];

const UNIVERSAL_DYNAMIC_BOOKING_TRANSITIONS = [
  { id: "e_ub_1", source: "ub_start", target: "ub_welcome", sourceHandle: "default" },
  { id: "e_ub_2", source: "ub_welcome", target: "ub_catalog", sourceHandle: "default" },
  { id: "e_ub_3", source: "ub_catalog", target: "ub_date", sourceHandle: "available" },
  { id: "e_ub_3b", source: "ub_catalog", target: "ub_date", sourceHandle: "default" },
  { id: "e_ub_4", source: "ub_date", target: "ub_name", sourceHandle: "default" },
  { id: "e_ub_5", source: "ub_name", target: "ub_crm", sourceHandle: "default" },
  { id: "e_ub_6", source: "ub_crm", target: "ub_confirm_msg", sourceHandle: "default" },
  { id: "e_ub_7", source: "ub_confirm_msg", target: "ub_end", sourceHandle: "default" }
];

const UNIVERSAL_DYNAMIC_BOOKING_VARIABLES = {
  customer_name: { type: "STRING", label: "Customer Full Name" },
  booking_date: { type: "DATE", label: "Reservation Date" },
  selected_item: { type: "STRING", label: "Selected Catalog Item" }
};

// =========================================================================
// 8. BLUEPRINT: D2C FOOD & RESTAURANT ORDERING (COD & PREPAID)
// =========================================================================
const D2C_RESTAURANT_ORDER_NODES = [
  {
    id: "order_start",
    type: "TRIGGER_WHATSAPP",
    title: "Food Order Trigger",
    config: {
      triggerType: "KEYWORD",
      keywords: ["order", "menu", "food", "hungry", "tasty"],
      matchType: "CONTAINS"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "order_welcome",
    type: "SEND_MESSAGE",
    title: "Menu & Cuisine Selection",
    config: {
      text: "🍔 *Welcome to TastyBites Kitchen!* 🍕\n\nFreshly prepared meals delivered straight to your door in 30 minutes. What are you craving today?",
      variable: "selected_category",
      options: [
        { id: "opt_combos", title: "Special Combos 🍱", value: "COMBOS" },
        { id: "opt_burgers", title: "Burgers & Fries 🍔", value: "BURGERS" },
        { id: "opt_pizza", title: "Woodfired Pizza 🍕", value: "PIZZA" }
      ]
    },
    position: { x: 400, y: 170 }
  },
  {
    id: "order_ask_address",
    type: "COLLECT_INPUT",
    title: "Input Delivery Address",
    config: {
      prompt: "📍 Please share your full delivery address and landmark:",
      saveAs: "delivery_address",
      inputType: "TEXT"
    },
    position: { x: 400, y: 300 }
  },
  {
    id: "order_ask_payment",
    type: "SEND_MESSAGE",
    title: "Select Payment Method",
    config: {
      text: "💳 Order Total: *₹599* (Incl. Taxes & Delivery)\n\nHow would you like to pay?",
      variable: "payment_method",
      options: [
        { id: "pay_online", title: "Pay Online / UPI ⚡", value: "ONLINE" },
        { id: "pay_cod", title: "Cash on Delivery 💵", value: "COD" }
      ]
    },
    position: { x: 400, y: 430 }
  },
  {
    id: "order_branch_pay",
    type: "CONDITION",
    title: "Branch on Payment Mode",
    config: {
      rules: [
        { variable: "payment_method", operator: "EQUALS", value: "ONLINE" }
      ],
      matchMode: "ALL"
    },
    position: { x: 400, y: 560 }
  },
  {
    id: "order_online_pay",
    type: "SEND_MESSAGE",
    title: "Prepaid Instant Link",
    config: {
      text: "⚡ Click here to complete your instant payment: https://survya.flex-us.com/pay/order-tasty?amt=599\n\nYour order is locked in as *Prepaid VIP*."
    },
    position: { x: 250, y: 680 }
  },
  {
    id: "order_cod_confirm",
    type: "SEND_MESSAGE",
    title: "COD Order Placed",
    config: {
      text: "💵 *Cash on Delivery Confirmed!*\n\nPlease keep exact change of *₹599* ready for our delivery rider."
    },
    position: { x: 550, y: 680 }
  },
  {
    id: "order_crm_upsert",
    type: "CRM_UPSERT",
    title: "Sync Order to CRM",
    config: {
      pipeline: "d2c-orders-pipeline",
      stage: "ORDER_PLACED",
      dealValue: 599,
      leadScore: 80,
      tags: ["D2C Food", "WhatsApp Order"],
      recordTitle: "Food Order #{{sender_phone}}"
    },
    position: { x: 400, y: 800 }
  },
  {
    id: "order_end",
    type: "END",
    title: "Order Completed",
    config: {
      farewellMessage: "🎉 Your order is being prepared! Tracking updates will arrive shortly."
    },
    position: { x: 400, y: 920 }
  }
];

const D2C_RESTAURANT_ORDER_TRANSITIONS = [
  { id: "e_ord_1", source: "order_start", target: "order_welcome", sourceHandle: "default" },
  { id: "e_ord_2", source: "order_welcome", target: "order_ask_address", sourceHandle: "default" },
  { id: "e_ord_3", source: "order_ask_address", target: "order_ask_payment", sourceHandle: "valid" },
  { id: "e_ord_4", source: "order_ask_payment", target: "order_branch_pay", sourceHandle: "default" },
  { id: "e_ord_5", source: "order_branch_pay", target: "order_online_pay", sourceHandle: "true" },
  { id: "e_ord_6", source: "order_branch_pay", target: "order_cod_confirm", sourceHandle: "false" },
  { id: "e_ord_7", source: "order_online_pay", target: "order_crm_upsert", sourceHandle: "default" },
  { id: "e_ord_8", source: "order_cod_confirm", target: "order_crm_upsert", sourceHandle: "default" },
  { id: "e_ord_9", source: "order_crm_upsert", target: "order_end", sourceHandle: "default" }
];

const D2C_RESTAURANT_ORDER_VARIABLES = {
  selected_category: { type: "STRING", label: "Selected Category", defaultValue: "COMBOS" },
  delivery_address: { type: "STRING", label: "Delivery Address" },
  payment_method: { type: "STRING", label: "Payment Mode", defaultValue: "ONLINE" }
};

// =========================================================================
// 9. BLUEPRINT: CUSTOMER SUPPORT TRIAGE & PRIORITY SLA ROUTER
// =========================================================================
const CUSTOMER_SUPPORT_TRIAGE_NODES = [
  {
    id: "sup_start",
    type: "TRIGGER_WHATSAPP",
    title: "Support Request Trigger",
    config: {
      triggerType: "KEYWORD",
      keywords: ["support", "help", "issue", "complaint", "broken"],
      matchType: "CONTAINS"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "sup_welcome",
    type: "SEND_MESSAGE",
    title: "Issue Category Intake",
    config: {
      text: "👋 *Customer Support Desk*\n\nWe're here to help resolve your issue swiftly. What area do you need help with?",
      variable: "support_category",
      options: [
        { id: "cat_billing", title: "Billing & Refund 💰", value: "BILLING" },
        { id: "cat_tech", title: "Technical Glitch 🛠️", value: "TECHNICAL" },
        { id: "cat_delivery", title: "Delivery Status 🚚", value: "DELIVERY" }
      ]
    },
    position: { x: 400, y: 170 }
  },
  {
    id: "sup_ask_details",
    type: "COLLECT_INPUT",
    title: "Input Issue Details",
    config: {
      prompt: "📝 Please describe your issue in detail (include any invoice or tracking numbers):",
      saveAs: "issue_details",
      inputType: "TEXT"
    },
    position: { x: 400, y: 300 }
  },
  {
    id: "sup_eval_urgency",
    type: "CONDITION",
    title: "Check Priority SLA",
    config: {
      rules: [
        { variable: "support_category", operator: "EQUALS", value: "BILLING" },
        { variable: "issue_details", operator: "CONTAINS", value: "urgent" }
      ],
      matchMode: "ANY"
    },
    position: { x: 400, y: 430 }
  },
  {
    id: "sup_escalate_human",
    type: "HUMAN_HANDOFF",
    title: "L2 Priority Escalation",
    config: {
      team: "L2_SUPPORT",
      handoffMessage: "🚨 This inquiry has been marked *High Priority*. Transferring you immediately to a Senior Support Supervisor (Target SLA: < 15 mins)."
    },
    position: { x: 250, y: 560 }
  },
  {
    id: "sup_crm_ticket",
    type: "CRM_UPSERT",
    title: "Register Support Ticket",
    config: {
      pipeline: "support-tickets-pipeline",
      stage: "TICKET_CREATED",
      dealValue: 0,
      leadScore: 40,
      tags: ["Support", "Automated Triage"],
      recordTitle: "Ticket: {{support_category}} - {{sender_phone}}"
    },
    position: { x: 550, y: 560 }
  },
  {
    id: "sup_auto_reply",
    type: "SEND_MESSAGE",
    title: "Ticket Acknowledgment",
    config: {
      text: "✅ *Support Ticket Logged!*\n\nOur team is reviewing your ticket for {{support_category}}. We will update you directly here."
    },
    position: { x: 550, y: 680 }
  },
  {
    id: "sup_end",
    type: "END",
    title: "End Triage Session",
    config: {
      farewellMessage: "Thank you for reaching out. We will get your issue resolved quickly!"
    },
    position: { x: 400, y: 800 }
  }
];

const CUSTOMER_SUPPORT_TRIAGE_TRANSITIONS = [
  { id: "e_sup_1", source: "sup_start", target: "sup_welcome", sourceHandle: "default" },
  { id: "e_sup_2", source: "sup_welcome", target: "sup_ask_details", sourceHandle: "default" },
  { id: "e_sup_3", source: "sup_ask_details", target: "sup_eval_urgency", sourceHandle: "valid" },
  { id: "e_sup_4", source: "sup_eval_urgency", target: "sup_escalate_human", sourceHandle: "true" },
  { id: "e_sup_5", source: "sup_eval_urgency", target: "sup_crm_ticket", sourceHandle: "false" },
  { id: "e_sup_6", source: "sup_crm_ticket", target: "sup_auto_reply", sourceHandle: "default" },
  { id: "e_sup_7", source: "sup_auto_reply", target: "sup_end", sourceHandle: "default" },
  { id: "e_sup_8", source: "sup_escalate_human", target: "sup_end", sourceHandle: "default" }
];

const CUSTOMER_SUPPORT_TRIAGE_VARIABLES = {
  support_category: { type: "STRING", label: "Issue Category", defaultValue: "BILLING" },
  issue_details: { type: "STRING", label: "Issue Description" }
};

// =========================================================================
// 10. BLUEPRINT: PAYMENT RECOVERY & SUBSCRIPTION RENEWAL REMINDER
// =========================================================================
const PAYMENT_RECOVERY_RENEWAL_NODES = [
  {
    id: "pay_start",
    type: "TRIGGER_EVENT",
    title: "Invoice Due Trigger",
    config: {
      eventType: "WEBHOOK",
      triggerKey: "hook_invoice_due",
      eventName: "invoice_payment_due"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "pay_welcome",
    type: "SEND_MESSAGE",
    title: "Renewal Invoice Reminder",
    config: {
      text: "⚠️ *Invoice Due Reminder*\n\nDear subscriber, your plan renewal invoice of *₹2,499* is due today. Renew now to maintain uninterrupted access.",
      variable: "renewal_choice",
      options: [
        { id: "opt_pay_now", title: "Pay Invoice Now 💳", value: "PAY_NOW" },
        { id: "opt_extend", title: "Request 7-Day Grace ⏳", value: "EXTEND" },
        { id: "opt_agent", title: "Talk to Billing 💬", value: "BILLING_AGENT" }
      ]
    },
    position: { x: 400, y: 170 }
  },
  {
    id: "pay_branch_choice",
    type: "CONDITION",
    title: "Check Renewal Intent",
    config: {
      rules: [
        { variable: "renewal_choice", operator: "EQUALS", value: "PAY_NOW" }
      ],
      matchMode: "ALL"
    },
    position: { x: 400, y: 300 }
  },
  {
    id: "pay_send_link",
    type: "SEND_MESSAGE",
    title: "Send Payment Gateway Link",
    config: {
      text: "💳 Click here to settle your invoice via UPI / Card: https://survya.flex-us.com/pay/inv-renew-2026?amt=2499\n\nReceipt will be issued instantly."
    },
    position: { x: 250, y: 420 }
  },
  {
    id: "pay_check_extend",
    type: "CONDITION",
    title: "Check Grace Request",
    config: {
      rules: [
        { variable: "renewal_choice", operator: "EQUALS", value: "EXTEND" }
      ],
      matchMode: "ALL"
    },
    position: { x: 550, y: 420 }
  },
  {
    id: "pay_grace_granted",
    type: "SEND_MESSAGE",
    title: "Grace Period Confirmed",
    config: {
      text: "⏳ *7-Day Grace Period Activated!*\n\nYour services remain fully active until next week. We'll send a reminder before the grace period ends."
    },
    position: { x: 450, y: 550 }
  },
  {
    id: "pay_crm_grace",
    type: "CRM_UPSERT",
    title: "Update Renewal Grace",
    config: {
      pipeline: "subscription-renewal-pipeline",
      stage: "GRACE_PERIOD",
      dealValue: 2499,
      leadScore: 65,
      tags: ["Grace Extension", "Renewal"]
    },
    position: { x: 450, y: 670 }
  },
  {
    id: "pay_handoff",
    type: "HUMAN_HANDOFF",
    title: "Billing Team Escalation",
    config: {
      team: "BILLING_TEAM",
      handoffMessage: "Connecting you with an Account Manager to discuss plan customization or billing questions."
    },
    position: { x: 700, y: 550 }
  },
  {
    id: "pay_crm_paid",
    type: "CRM_UPSERT",
    title: "Mark Payment Initiated",
    config: {
      pipeline: "subscription-renewal-pipeline",
      stage: "PAYMENT_INITIATED",
      dealValue: 2499,
      leadScore: 95,
      tags: ["Renewal", "Payment Initiated"]
    },
    position: { x: 250, y: 550 }
  },
  {
    id: "pay_end",
    type: "END",
    title: "End Reminder Session",
    config: {
      farewellMessage: "Thank you for your ongoing partnership with us!"
    },
    position: { x: 400, y: 800 }
  }
];

const PAYMENT_RECOVERY_RENEWAL_TRANSITIONS = [
  { id: "e_pay_1", source: "pay_start", target: "pay_welcome", sourceHandle: "default" },
  { id: "e_pay_2", source: "pay_welcome", target: "pay_branch_choice", sourceHandle: "default" },
  { id: "e_pay_3", source: "pay_branch_choice", target: "pay_send_link", sourceHandle: "true" },
  { id: "e_pay_4", source: "pay_branch_choice", target: "pay_check_extend", sourceHandle: "false" },
  { id: "e_pay_5", source: "pay_send_link", target: "pay_crm_paid", sourceHandle: "default" },
  { id: "e_pay_6", source: "pay_crm_paid", target: "pay_end", sourceHandle: "default" },
  { id: "e_pay_7", source: "pay_check_extend", target: "pay_grace_granted", sourceHandle: "true" },
  { id: "e_pay_8", source: "pay_check_extend", target: "pay_handoff", sourceHandle: "false" },
  { id: "e_pay_9", source: "pay_grace_granted", target: "pay_crm_grace", sourceHandle: "default" },
  { id: "e_pay_10", source: "pay_crm_grace", target: "pay_end", sourceHandle: "default" },
  { id: "e_pay_11", source: "pay_handoff", target: "pay_end", sourceHandle: "default" }
];

const PAYMENT_RECOVERY_RENEWAL_VARIABLES = {
  renewal_choice: { type: "STRING", label: "Renewal Choice", defaultValue: "PAY_NOW" }
};

// =========================================================================
// 11. BLUEPRINT: EVENT & WEBINAR REGISTRATION ENGINE
// =========================================================================
const EVENT_WEBINAR_REGISTRATION_NODES = [
  {
    id: "event_start",
    type: "TRIGGER_WHATSAPP",
    title: "Webinar Registration Trigger",
    config: {
      triggerType: "KEYWORD",
      keywords: ["webinar", "register", "event", "summit", "conference"],
      matchType: "CONTAINS"
    },
    position: { x: 400, y: 50 }
  },
  {
    id: "event_welcome",
    type: "SEND_MESSAGE",
    title: "Webinar Overview & Intro",
    config: {
      text: "🚀 *Welcome to the AI & Business Growth Summit 2026!*\n\nJoin 5,000+ industry leaders this Thursday at 4 PM IST. Let's reserve your complimentary delegate pass in under 30 seconds."
    },
    position: { x: 400, y: 170 }
  },
  {
    id: "event_ask_name",
    type: "COLLECT_INPUT",
    title: "Input Attendee Name",
    config: {
      prompt: "👤 Please enter your full name for the delegate pass:",
      saveAs: "attendee_name",
      inputType: "TEXT"
    },
    position: { x: 400, y: 300 }
  },
  {
    id: "event_ask_role",
    type: "SEND_MESSAGE",
    title: "Select Job Role",
    config: {
      text: "💼 What best describes your primary business role?",
      variable: "attendee_role",
      options: [
        { id: "role_cxo", title: "Founder / CEO / CXO 👑", value: "CXO" },
        { id: "role_manager", title: "Product / Team Lead 🎯", value: "LEAD" },
        { id: "role_individual", title: "Developer / Creator 💻", value: "CREATOR" }
      ]
    },
    position: { x: 400, y: 430 }
  },
  {
    id: "event_eval_vip",
    type: "CONDITION",
    title: "Check VIP Delegate Status",
    config: {
      rules: [
        { variable: "attendee_role", operator: "EQUALS", value: "CXO" }
      ],
      matchMode: "ALL"
    },
    position: { x: 400, y: 560 }
  },
  {
    id: "event_set_vip_score",
    type: "SET_VARIABLE",
    title: "Assign VIP Lead Score",
    config: {
      targetVar: "lead_score",
      operation: "SET",
      value: 95
    },
    position: { x: 250, y: 680 }
  },
  {
    id: "event_crm_reg",
    type: "CRM_UPSERT",
    title: "Record Webinar Registration",
    config: {
      pipeline: "event-attendees-pipeline",
      stage: "REGISTERED",
      dealValue: 0,
      leadScore: 70,
      tags: ["Webinar 2026", "Registered Attendee"],
      recordTitle: "Attendee: {{attendee_name}}"
    },
    position: { x: 400, y: 800 }
  },
  {
    id: "event_confirm_pass",
    type: "SEND_MESSAGE",
    title: "Instant Delegate Pass Delivery",
    config: {
      text: "🎟️ *Registration Confirmed, {{attendee_name}}!*\n\n📅 Date: Thursday, 4 PM IST\n🔗 Zoom Access Link: https://survya.flex-us.com/events/summit2026/room\n\nAdd to calendar: https://survya.flex-us.com/events/summit2026/calendar.ics"
    },
    position: { x: 400, y: 920 }
  },
  {
    id: "event_delay_pulse",
    type: "WAIT_DELAY",
    title: "Pre-Event Reminder Delay",
    config: {
      delayAmount: 24,
      delayUnit: "HOURS",
      cancelOnReply: false
    },
    position: { x: 400, y: 1040 }
  },
  {
    id: "event_reminder_msg",
    type: "SEND_MESSAGE",
    title: "1-Hour Countdown Reminder",
    config: {
      text: "⏰ *Reminder:* The Summit begins in 1 hour! Have your questions ready. See you inside: https://survya.flex-us.com/events/summit2026/room"
    },
    position: { x: 400, y: 1160 }
  },
  {
    id: "event_end",
    type: "END",
    title: "End Registration Journey",
    config: {
      farewellMessage: "See you at the summit!"
    },
    position: { x: 400, y: 1280 }
  }
];

const EVENT_WEBINAR_REGISTRATION_TRANSITIONS = [
  { id: "e_ev_1", source: "event_start", target: "event_welcome", sourceHandle: "default" },
  { id: "e_ev_2", source: "event_welcome", target: "event_ask_name", sourceHandle: "default" },
  { id: "e_ev_3", source: "event_ask_name", target: "event_ask_role", sourceHandle: "valid" },
  { id: "e_ev_4", source: "event_ask_role", target: "event_eval_vip", sourceHandle: "default" },
  { id: "e_ev_5", source: "event_eval_vip", target: "event_set_vip_score", sourceHandle: "true" },
  { id: "e_ev_6", source: "event_eval_vip", target: "event_crm_reg", sourceHandle: "false" },
  { id: "e_ev_7", source: "event_set_vip_score", target: "event_crm_reg", sourceHandle: "default" },
  { id: "e_ev_8", source: "event_crm_reg", target: "event_confirm_pass", sourceHandle: "default" },
  { id: "e_ev_9", source: "event_confirm_pass", target: "event_delay_pulse", sourceHandle: "default" },
  { id: "e_ev_10", source: "event_delay_pulse", target: "event_reminder_msg", sourceHandle: "default" },
  { id: "e_ev_11", source: "event_reminder_msg", target: "event_end", sourceHandle: "default" }
];

const EVENT_WEBINAR_REGISTRATION_VARIABLES = {
  attendee_name: { type: "STRING", label: "Attendee Full Name" },
  attendee_role: { type: "STRING", label: "Job Role", defaultValue: "CXO" },
  lead_score: { type: "NUMBER", label: "Lead Score", defaultValue: 70 }
};

const DEFAULT_FLOW_TEMPLATES = [
  {
    slug: "hospitality-booking-quote-journey",
    title: "Hospitality Direct Booking & Instant Quote Journey",
    description: "End-to-end hotel and resort booking journey with live inventory checks, real-time pricing calculation, automated quotation breakdown, and CRM enquiry generation.",
    industry: "HOSPITALITY",
    category: "BOOKING",
    nodes: HOSPITALITY_BOOKING_NODES,
    transitions: HOSPITALITY_BOOKING_TRANSITIONS,
    variables: HOSPITALITY_BOOKING_VARIABLES,
    is_system: 1
  },
  {
    slug: "sales-quotation-b2b-journey",
    title: "B2B Sales & Dynamic Quotation Journey",
    description: "Configurable B2B sales automation collecting volume and seat requirements, generating dynamic price quotations with GST, registering CRM deals, and routing to account executives.",
    industry: "B2B_SAAS",
    category: "SALES",
    nodes: SALES_QUOTATION_B2B_NODES,
    transitions: SALES_QUOTATION_B2B_TRANSITIONS,
    variables: SALES_QUOTATION_B2B_VARIABLES,
    is_system: 1
  },
  {
    slug: "b2b-sales-qualification-demo",
    title: "B2B Enterprise Sales Qualification & Auto-Routing",
    description: "Multi-stage enterprise B2B sales funnel with seat intake, dynamic lead score calculation, CRM deal registration, automated webhook notification, and intelligent delayed follow-up.",
    industry: "B2B_SAAS",
    category: "SALES",
    nodes: B2B_SALES_QUALIFICATION_NODES,
    transitions: B2B_SALES_QUALIFICATION_TRANSITIONS,
    variables: B2B_SALES_QUALIFICATION_VARIABLES,
    is_system: 1
  },
  {
    slug: "multi-channel-lead-gen-drip",
    title: "Multi-Channel Lead Generation & Nurture Drip",
    description: "Cross-channel lead capture from web forms and WhatsApp with instant brochure delivery, CRM contact sync, time-delayed nurture pulse, and customer response branching.",
    industry: "LEAD_GEN",
    category: "LEAD_GEN",
    nodes: MULTI_CHANNEL_LEAD_GEN_NODES,
    transitions: MULTI_CHANNEL_LEAD_GEN_TRANSITIONS,
    variables: MULTI_CHANNEL_LEAD_GEN_VARIABLES,
    is_system: 1
  },
  {
    slug: "universal-dynamic-booking",
    title: "Universal Dynamic Catalog Booking & Reservation Engine",
    description: "Industry-agnostic booking engine supporting hotels, clinic appointments, rentals, and salon visits with catalog availability check, date intake, and pipeline synchronization.",
    industry: "BOOKING",
    category: "BOOKING",
    nodes: UNIVERSAL_DYNAMIC_BOOKING_NODES,
    transitions: UNIVERSAL_DYNAMIC_BOOKING_TRANSITIONS,
    variables: UNIVERSAL_DYNAMIC_BOOKING_VARIABLES,
    is_system: 1
  },
  {
    slug: "general-faq-concierge-journey",
    title: "Resort Concierge FAQ & Property Knowledge Guide",
    description: "Interactive concierge assistant delivering dynamic answers on property timings, food options, amenities, and travel routes, with optional front-desk handoff.",
    industry: "HOSPITALITY",
    category: "CONCIERGE",
    nodes: FAQ_JOURNEY_NODES,
    transitions: FAQ_JOURNEY_TRANSITIONS,
    variables: FAQ_JOURNEY_VARIABLES,
    is_system: 1
  },
  {
    slug: "direct-staff-handoff-journey",
    title: "Priority Staff & Human Concierge Handoff",
    description: "Seamless automated escalation to human front-desk staff with customer requirement capture and temporary bot silence.",
    industry: "GENERAL",
    category: "SUPPORT",
    nodes: STAFF_HANDOFF_NODES,
    transitions: STAFF_HANDOFF_TRANSITIONS,
    variables: STAFF_HANDOFF_VARIABLES,
    is_system: 1
  },
  {
    slug: "d2c-restaurant-order-cod-prepaid",
    title: "D2C Food & Restaurant Order (COD & Prepaid)",
    description: "Complete WhatsApp food ordering system with menu item selection, delivery address intake, prepaid vs COD payment routing, and instant order tracking.",
    industry: "D2C_ECOMMERCE",
    category: "ORDERS",
    nodes: D2C_RESTAURANT_ORDER_NODES,
    transitions: D2C_RESTAURANT_ORDER_TRANSITIONS,
    variables: D2C_RESTAURANT_ORDER_VARIABLES,
    is_system: 1
  },
  {
    slug: "customer-support-triage-sla",
    title: "Customer Support Triage & Priority SLA Router",
    description: "Intelligent ticketing triage categorizing customer complaints, detecting high-priority escalation, enforcing SLA routing, and handing off VIP cases to live staff.",
    industry: "SUPPORT",
    category: "SUPPORT",
    nodes: CUSTOMER_SUPPORT_TRIAGE_NODES,
    transitions: CUSTOMER_SUPPORT_TRIAGE_TRANSITIONS,
    variables: CUSTOMER_SUPPORT_TRIAGE_VARIABLES,
    is_system: 1
  },
  {
    slug: "payment-recovery-renewal-reminder",
    title: "Payment Recovery & Subscription Renewal Reminder",
    description: "Automated recovery and renewal workflow reminding customers of pending invoices, offering 7-day extensions, and reducing subscriber churn.",
    industry: "FINTECH",
    category: "BILLING",
    nodes: PAYMENT_RECOVERY_RENEWAL_NODES,
    transitions: PAYMENT_RECOVERY_RENEWAL_TRANSITIONS,
    variables: PAYMENT_RECOVERY_RENEWAL_VARIABLES,
    is_system: 1
  },
  {
    slug: "event-webinar-registration",
    title: "Event & Live Webinar Registration Engine",
    description: "High-conversion event registration with attendee qualification, calendar link delivery, VIP attendee tagging, and automated pre-event reminder pulses.",
    industry: "EVENTS",
    category: "LEAD_GEN",
    nodes: EVENT_WEBINAR_REGISTRATION_NODES,
    transitions: EVENT_WEBINAR_REGISTRATION_TRANSITIONS,
    variables: EVENT_WEBINAR_REGISTRATION_VARIABLES,
    is_system: 1
  }
];

const DEFAULT_MESSAGE_TEMPLATES = [
  {
    code: "WELCOME_GREETING",
    title: "Standard Welcome Greeting",
    category: "WELCOME",
    content: "🌿 *Welcome to {{property.name}}!* 🏖️\n\nExperience luxury seaside tranquility in {{property.city}}. I am your 24/7 Digital Concierge. How may I assist you today?",
    variables: ["property.name", "property.city"],
    buttons: [
      { id: "b1", title: "Book a Stay 🛏️", value: "BOOKING" },
      { id: "b2", title: "View Villas 🏡", value: "ROOMS_INFO" },
      { id: "b3", title: "Ask Concierge 💬", value: "CONCIERGE" }
    ]
  },
  {
    code: "QUOTATION_SUMMARY",
    title: "Estimated Stay Quotation Breakdown",
    category: "QUOTE",
    content: "✨ *Estimated Stay Quotation:*\n\n🏡 *Room:* {{matched_room_name}}\n📅 *Dates:* {{check_in_date}} to {{check_out_date}} ({{nights}} Night(s))\n👥 *Guests:* {{adults}} Adult(s), {{children}} Child(ren)\n\n💵 *Room Charges:* ₹{{quote_subtotal}}\n📊 *GST ({{tax_percent}}%):* ₹{{tax_total}}\n🏷️ *Total Estimated Payable:* *₹{{quote_total}}*\n\n_Includes complimentary breakfast, high-speed Wi-Fi, and pool access._",
    variables: ["matched_room_name", "check_in_date", "check_out_date", "nights", "adults", "children", "quote_subtotal", "tax_percent", "tax_total", "quote_total"],
    buttons: [
      { id: "qb1", title: "Confirm Enquiry ✅", value: "CONFIRM" },
      { id: "qb2", title: "Modify Dates 📅", value: "MODIFY" }
    ]
  },
  {
    code: "B2B_SALES_PROPOSAL",
    title: "Enterprise Sales Proposal Breakdown",
    category: "QUOTE",
    content: "📊 *Survya Custom Quotation & Proposal:*\n\n💼 *Edition:* {{selected_plan}}\n👥 *Team Seats:* {{team_size}} Authorized Users\n📈 *Volume Allowance:* {{monthly_volume}} Monthly Messages\n\n💵 *Software License:* ₹{{quote_subtotal}}/mo\n📊 *GST ({{tax_percent}}%):* ₹{{tax_total}}\n🏷️ *Total Monthly Investment:* *₹{{quote_total}}*\n\n_Includes 99.9% uptime SLA, dedicated onboarding manager, and 24/7 technical support._",
    variables: ["selected_plan", "team_size", "monthly_volume", "quote_subtotal", "tax_percent", "tax_total", "quote_total"],
    buttons: [
      { id: "sb1", title: "Lock In Proposal ✅", value: "CONFIRM" },
      { id: "sb2", title: "Adjust Plan ✏️", value: "MODIFY" },
      { id: "sb3", title: "Talk to Sales 💬", value: "SALES" }
    ]
  },
  {
    code: "ENQUIRY_CONFIRMED",
    title: "Booking Enquiry Forwarded Notice",
    category: "ENQUIRY",
    content: "✅ *Booking Enquiry #{{enquiry_id}} Logged Successfully!* 🎉\n\nDear {{guest_name}}, your booking request has been forwarded to our front desk team. Assigned Officer: *{{assigned_staff}}*.\n\nOur reservation team is reviewing room allocation and will connect with you right here on WhatsApp to confirm payment details and seal your booking.",
    variables: ["enquiry_id", "guest_name", "assigned_staff"],
    buttons: []
  },
  {
    code: "HANDOFF_NOTICE",
    title: "Front Desk Staff Handoff Alert",
    category: "HANDOFF",
    content: "🔔 You are now connected with our Front Desk team. A member of our staff will respond to you shortly.",
    variables: [],
    buttons: []
  }
];

function seedFlowsAndTemplates(db) {
  try {
    // 1. Seed Flow Templates
    const insertTemplate = db.prepare(`
      INSERT INTO conversation_flow_templates (
        slug, title, description, industry, category,
        nodes_json, transitions_json, variables_json, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        description = VALUES(description),
        nodes_json = VALUES(nodes_json),
        transitions_json = VALUES(transitions_json),
        variables_json = VALUES(variables_json)
    `);

    for (const tpl of DEFAULT_FLOW_TEMPLATES) {
      insertTemplate.run(
        tpl.slug,
        tpl.title,
        tpl.description,
        tpl.industry,
        tpl.category,
        JSON.stringify(tpl.nodes),
        JSON.stringify(tpl.transitions),
        JSON.stringify(tpl.variables),
        tpl.is_system
      );
    }

    // 2. Seed Message Templates
    const insertMsgTpl = db.prepare(`
      INSERT INTO flow_message_templates (
        tenant_id, property_id, code, title, category,
        content, variables_json, buttons_json
      ) VALUES (1, 1, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        content = VALUES(content),
        variables_json = VALUES(variables_json),
        buttons_json = VALUES(buttons_json)
    `);

    for (const mt of DEFAULT_MESSAGE_TEMPLATES) {
      insertMsgTpl.run(
        mt.code,
        mt.title,
        mt.category,
        mt.content,
        JSON.stringify(mt.variables),
        JSON.stringify(mt.buttons)
      );
    }

    // 3. Ensure a default Published Flow exists for tenant 1
    const existingFlowCount = Number(db.prepare("SELECT COUNT(*) as count FROM conversation_flows WHERE tenant_id = 1").get()?.count || 0);
    if (existingFlowCount === 0) {
      const defaultTpl = DEFAULT_FLOW_TEMPLATES[0];
      const flowUuid = "flow_" + crypto.randomBytes(8).toString("hex");

      const insertFlow = db.prepare(`
        INSERT INTO conversation_flows (
          uuid, tenant_id, property_id, name, description, category,
          trigger_type, trigger_keywords_json, status, is_default, priority,
          created_by, updated_by
        ) VALUES (?, 1, 1, ?, ?, ?, ?, ?, 'PUBLISHED', 1, 100, 'system', 'system')
      `);

      const result = insertFlow.run(
        flowUuid,
        defaultTpl.title,
        defaultTpl.description,
        "HOSPITALITY_ENQUIRY",
        "INBOUND_ANY",
        JSON.stringify(["hi", "hello", "book", "room", "enquiry", "resort", "rates"])
      );

      const flowId = result.lastInsertRowid || db.prepare("SELECT id FROM conversation_flows WHERE uuid = ?").get(flowUuid)?.id;

      if (flowId) {
        const insertVersion = db.prepare(`
          INSERT INTO conversation_flow_versions (
            flow_id, version_number, status, nodes_json, transitions_json,
            variables_json, validation_report_json, changelog, published_at, published_by
          ) VALUES (?, 1, 'PUBLISHED', ?, ?, ?, ?, 'Initial system seed release', CURRENT_TIMESTAMP, 'system')
        `);

        const vResult = insertVersion.run(
          flowId,
          JSON.stringify(defaultTpl.nodes),
          JSON.stringify(defaultTpl.transitions),
          JSON.stringify(defaultTpl.variables),
          JSON.stringify({ isValid: true, errors: [], warnings: [] })
        );

        const versionId = vResult.lastInsertRowid || db.prepare("SELECT id FROM conversation_flow_versions WHERE flow_id = ? AND version_number = 1").get(flowId)?.id;

        if (versionId) {
          db.prepare(`
            UPDATE conversation_flows
            SET published_version_id = ?, current_draft_version_id = ?
            WHERE id = ?
          `).run(versionId, versionId, flowId);
        }
      }
    }

    // Ensure flow 1 triggers are cleanly indexed in workflow_triggers using pure SQL
    try {
      const flow1 = db.prepare("SELECT * FROM conversation_flows WHERE id = 1 AND tenant_id = 1").get();
      if (flow1 && flow1.published_version_id) {
        const v1 = db.prepare("SELECT nodes_json FROM conversation_flow_versions WHERE id = ?").get(flow1.published_version_id);
        if (v1) {
          const configJson = JSON.stringify({
            nodeId: "node_start",
            nodeType: "START",
            keywords: ["hi", "hello", "hey", "resort", "book", "room", "enquiry", "rates", "namaste", "villa", "cottage"],
            matchType: "CONTAINS",
            ignoreCase: true,
            isCatchAll: false,
            isCtwa: false,
            priority: 100
          });

          db.prepare(`
            INSERT INTO workflow_triggers (
              tenant_id, phone_number_id, flow_id, trigger_key, trigger_type, match_config_json,
              secret_token, priority, active_status, delete_status, created_at, updated_at
            ) VALUES (1, NULL, '1', 'trg_1_node_start', 'KEYWORD', ?, NULL, 100, 1, 0, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
              trigger_type = 'KEYWORD',
              match_config_json = VALUES(match_config_json),
              priority = 100,
              active_status = 1,
              delete_status = 0,
              updated_at = NOW()
          `).run(configJson);
        }
      }
    } catch (_) {}
  } catch (err) {
    console.warn("[ConversationFlowSeeds] Seed notice:", err.message);
  }
}

module.exports = {
  DEFAULT_FLOW_TEMPLATES,
  DEFAULT_MESSAGE_TEMPLATES,
  seedFlowsAndTemplates
};
