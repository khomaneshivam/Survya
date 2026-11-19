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
  } catch (err) {
    console.warn("[ConversationFlowSeeds] Seed notice:", err.message);
  }
}

module.exports = {
  DEFAULT_FLOW_TEMPLATES,
  DEFAULT_MESSAGE_TEMPLATES,
  seedFlowsAndTemplates
};
