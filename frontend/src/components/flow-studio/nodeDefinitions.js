import {
  Play,
  Zap,
  MessageSquare,
  FileSpreadsheet,
  Sliders,
  CheckCircle2,
  Clock,
  PhoneCall,
  Globe,
  Building,
  FileText,
  UserCheck,
  Layers,
  Hash,
  Database,
  Bot,
  Sparkles
} from 'lucide-react';

export const NODE_CATEGORIES = {
  TRIGGERS: { id: 'TRIGGERS', label: 'Triggers', color: '#16A34A', bg: '#DCFCE7' },
  MESSAGING: { id: 'MESSAGING', label: 'Messaging & Content', color: '#2563EB', bg: '#DBEAFE' },
  INTAKE: { id: 'INTAKE', label: 'Data Intake & Forms', color: '#D97706', bg: '#FEF3C7' },
  LOGIC: { id: 'LOGIC', label: 'Logic & Routing', color: '#7C3AED', bg: '#EDE9FE' },
  TIMING: { id: 'TIMING', label: 'Timing & Delays', color: '#0284C7', bg: '#E0F2FE' },
  ACTIONS: { id: 'ACTIONS', label: 'CRM & Integrations', color: '#0D9488', bg: '#CCFBF1' }
};

export const NODE_DEFINITIONS = [
  // 1. TRIGGERS
  {
    type: 'TRIGGER_WHATSAPP',
    label: 'WhatsApp Trigger',
    category: 'TRIGGERS',
    icon: Play,
    color: '#16A34A',
    bg: '#DCFCE7',
    badge: 'Trigger',
    desc: 'Starts flow on inbound message, keyword match, regex, or CTWA ad',
    defaultConfig: {
      triggerType: 'KEYWORD_MATCH', // KEYWORD_MATCH | REGEX | FIRST_MESSAGE | CTWA_AD | INBOUND_ANY
      keywords: ['hi', 'hello', 'enquiry', 'book', 'info'],
      regexPattern: '',
      caseSensitive: false
    },
    getOutputHandles: () => [
      { id: 'default', label: 'Start Flow', type: 'source' }
    ]
  },
  {
    type: 'TRIGGER_EVENT',
    label: 'Lifecycle Event Trigger',
    category: 'TRIGGERS',
    icon: Zap,
    color: '#15803D',
    bg: '#DCFCE7',
    badge: 'Trigger',
    desc: 'Triggers on external webhook, CRM stage change, chat link click, or Meta Flow submission',
    defaultConfig: {
      eventType: 'WEBHOOK', // WEBHOOK | CRM_STAGE_CHANGE | CHAT_LINK_CLICK | META_FLOW_SUBMISSION
      eventName: 'lead.created',
      filterCriteria: {}
    },
    getOutputHandles: () => [
      { id: 'default', label: 'On Event', type: 'source' }
    ]
  },

  // 2. MESSAGING
  {
    type: 'SEND_MESSAGE',
    label: 'Send WhatsApp Message',
    category: 'MESSAGING',
    icon: MessageSquare,
    color: '#2563EB',
    bg: '#DBEAFE',
    badge: 'Message',
    desc: 'Send rich text, media, interactive buttons (up to 3), or interactive list (up to 10)',
    defaultConfig: {
      messageType: 'BUTTONS', // TEXT | MEDIA | BUTTONS | LIST
      text: 'Hello {{contact.name}}! Welcome to {{property.name}}. How may we assist you today?',
      mediaUrl: '',
      mediaType: 'IMAGE', // IMAGE | DOCUMENT | VIDEO | AUDIO
      caption: '',
      options: [
        { id: 'opt_1', title: 'Check Availability 🏨', value: 'AVAILABILITY' },
        { id: 'opt_2', title: 'View Pricing 💵', value: 'PRICING' },
        { id: 'opt_3', title: 'Talk to Staff 💬', value: 'STAFF' }
      ],
      listButtonText: 'Choose an Option',
      listTitle: 'Main Menu'
    },
    getOutputHandles: (node) => {
      const opts = node?.config?.options || [];
      if (opts.length > 0) {
        const optionHandles = opts.map((opt, i) => ({
          id: opt.id || `opt_${i + 1}`,
          label: opt.title || `Option ${i + 1}`,
          type: 'source',
          color: '#2563EB'
        }));
        return [
          ...optionHandles,
          { id: 'default', label: 'Fallback / Other Reply', type: 'source', color: '#94A3B8' }
        ];
      }
      return [{ id: 'default', label: 'Next Step', type: 'source' }];
    }
  },
  {
    type: 'SEND_TEMPLATE',
    label: 'Send Meta Template',
    category: 'MESSAGING',
    icon: FileText,
    color: '#1D4ED8',
    bg: '#DBEAFE',
    badge: 'Template',
    desc: 'Dispatches pre-approved Meta Cloud API template with dynamic body parameters',
    defaultConfig: {
      templateName: 'booking_confirmation_v1',
      templateLanguage: 'en_US',
      parameters: [
        { param: '1', mapToVariable: 'contact.name' },
        { param: '2', mapToVariable: 'booking.reference' }
      ]
    },
    getOutputHandles: () => [
      { id: 'delivered', label: 'On Sent', type: 'source' }
    ]
  },
  {
    type: 'SEND_WHATSAPP_FLOW',
    label: 'Meta Flow Screen',
    category: 'MESSAGING',
    icon: Layers,
    color: '#4338CA',
    bg: '#EDE9FE',
    badge: 'Meta Flow',
    desc: 'Dispatches native in-chat Meta Flow multi-screen form for structured intake',
    defaultConfig: {
      metaFlowId: '',
      flowCta: 'Open Booking Form',
      flowTitle: 'Reservation Details',
      initialScreen: 'CHECKIN_DETAILS',
      saveResponseAs: 'flow_submission_data'
    },
    getOutputHandles: () => [
      { id: 'submitted', label: 'On Form Submitted', type: 'source', color: '#16A34A' },
      { id: 'fallback', label: 'Fallback Buttons', type: 'source', color: '#EA580C' }
    ]
  },
  {
    type: 'AI_KNOWLEDGE_REPLY',
    label: 'AI Knowledge Reply',
    category: 'MESSAGING',
    icon: Sparkles,
    color: '#8B5CF6',
    bg: '#F5F3FF',
    badge: 'Task AI',
    desc: 'Grounded RAG responder using tenant knowledge & live catalog. Enforces Meta Jan 2026 AI Policy.',
    defaultConfig: {
      personaPrompt: 'You are SARVYA, an attentive and courteous guest relations assistant.',
      queryVariable: '',
      confidenceThreshold: 0.65,
      saveResponseAs: 'ai_last_reply'
    },
    getOutputHandles: () => [
      { id: 'replied', label: 'AI Replied', type: 'source', color: '#16A34A' },
      { id: 'handoff', label: 'Human Handoff', type: 'source', color: '#DC2626' }
    ]
  },

  // 3. INTAKE
  {
    type: 'COLLECT_INPUT',
    label: 'Collect & Validate Input',
    category: 'INTAKE',
    icon: FileSpreadsheet,
    color: '#D97706',
    bg: '#FEF3C7',
    badge: 'Intake',
    desc: 'Prompts user for structured info (Text, Email, Phone, Date, Guests) with retry logic',
    defaultConfig: {
      prompt: 'Please enter your check-in date (e.g. tomorrow or YYYY-MM-DD):',
      inputType: 'DATE', // TEXT | EMAIL | PHONE | NUMBER | DATE | DATE_RANGE | GUEST_PARSER | REGEX
      saveAs: 'check_in_date',
      minVal: '',
      maxVal: '',
      regexPattern: '',
      maxRetries: 3,
      retryMessage: '⚠️ We couldn’t recognize that date. Please enter a valid date in YYYY-MM-DD format:'
    },
    getOutputHandles: () => [
      { id: 'valid', label: 'Valid Input ✅', type: 'source', color: '#16A34A' },
      { id: 'max_retries', label: 'Max Retries Exceeded ⚠️', type: 'source', color: '#EA580C' }
    ]
  },

  // One executor, unlimited no-code question instances configured by metadata.
  {
    type: 'SCHEMA_INPUT',
    label: 'Configurable Question',
    category: 'INTAKE',
    icon: FileSpreadsheet,
    color: '#B45309',
    bg: '#FEF3C7',
    badge: 'No-code',
    desc: 'Collect and validate customer answers without client-specific code',
    defaultConfig: {
      prompt: 'What information would you like to provide?',
      saveAs: 'customer_response',
      inputType: 'TEXT',
      maxRetries: 3,
      retryMessage: 'Please provide a valid response.'
    },
    configFields: [
      { key: 'prompt', label: 'Question shown to customer', type: 'textarea',
        required: true, maxLength: 1024, placeholder: 'What date would you prefer?' },
      { key: 'saveAs', label: 'Save answer as variable', type: 'text',
        required: true, pattern: '^[A-Za-z_][A-Za-z0-9_.]{0,63}$',
        placeholder: 'appointment_date' },
      { key: 'inputType', label: 'Expected answer', type: 'select',
        required: true, options: [
          { value: 'TEXT', label: 'Text' },
          { value: 'EMAIL', label: 'Email address' },
          { value: 'PHONE', label: 'Phone number' },
          { value: 'NUMBER', label: 'Number' },
          { value: 'DATE', label: 'Date' }
        ] },
      { key: 'maxRetries', label: 'Maximum retry attempts',
        type: 'number', min: 1, max: 10, required: true },
      { key: 'retryMessage', label: 'Invalid answer message',
        type: 'textarea', maxLength: 1024 }
    ],
    getOutputHandles: () => [
      { id: 'valid', label: 'Valid answer', type: 'source', color: '#16A34A' },
      { id: 'max_retries', label: 'Maximum retries', type: 'source', color: '#EA580C' }
    ]
  },

  // 4. LOGIC & ROUTING
  {
    type: 'CONDITION',
    label: 'Condition & Branching',
    category: 'LOGIC',
    icon: Sliders,
    color: '#7C3AED',
    bg: '#EDE9FE',
    badge: 'Logic',
    desc: 'Evaluates rules against conversation variables and routes to True or False branches',
    defaultConfig: {
      matchMode: 'ALL', // ALL | ANY
      rules: [
        { variable: 'lead_score', operator: 'gte', value: '50' }
      ]
    },
    getOutputHandles: () => [
      { id: 'true', label: 'True / Matched ✅', type: 'source', color: '#16A34A' },
      { id: 'false', label: 'False / Otherwise ❌', type: 'source', color: '#E11D48' }
    ]
  },
  {
    type: 'SET_VARIABLE',
    label: 'Set Variable / Score',
    category: 'LOGIC',
    icon: Hash,
    color: '#9333EA',
    bg: '#EDE9FE',
    badge: 'Variable',
    desc: 'Sets, updates, or increments a conversation variable or lead score',
    defaultConfig: {
      operation: 'SET', // SET | INCREMENT | DECREMENT | APPEND | CLEAR
      targetVar: 'lead_score',
      value: '10'
    },
    getOutputHandles: () => [
      { id: 'default', label: 'Next Step', type: 'source' }
    ]
  },

  // 5. TIMING
  {
    type: 'WAIT_DELAY',
    label: 'Wait & Delay Timer',
    category: 'TIMING',
    icon: Clock,
    color: '#0284C7',
    bg: '#E0F2FE',
    badge: 'Timing',
    desc: 'Pauses journey for a set duration or until specific time, with early reply branching',
    defaultConfig: {
      delayType: 'DURATION', // DURATION | UNTIL_TIME
      durationValue: 2,
      durationUnit: 'HOURS', // MINUTES | HOURS | DAYS
      untilTime: '10:00',
      cancelOnUserReply: true
    },
    getOutputHandles: (node) => {
      const handles = [{ id: 'after_delay', label: 'After Delay ⏰', type: 'source', color: '#0284C7' }];
      if (node?.config?.cancelOnUserReply) {
        handles.push({ id: 'early_reply', label: 'If Replied Early 💬', type: 'source', color: '#7C3AED' });
      }
      return handles;
    }
  },

  // 6. ACTIONS & CRM
  {
    type: 'CRM_UPSERT',
    label: 'CRM Lead / Deal Upsert',
    category: 'ACTIONS',
    icon: UserCheck,
    color: '#0D9488',
    bg: '#CCFBF1',
    badge: 'CRM',
    desc: 'Creates or updates contact, sets pipeline stage, tags, and assigns account owner',
    defaultConfig: {
      pipeline: 'HOSPITALITY_ENQUIRIES',
      stage: 'QUALIFIED',
      tags: ['whatsapp_lead', 'high_intent'],
      assignee: 'front_desk_duty',
      customFields: {
        enquiry_source: 'whatsapp_flow'
      }
    },
    getOutputHandles: () => [
      { id: 'success', label: 'Record Created', type: 'source', color: '#16A34A' },
      { id: 'failure', label: 'CRM Error', type: 'source', color: '#E11D48' }
    ]
  },
  {
    type: 'CATALOG_BOOKING',
    label: 'Catalog & Booking Hold',
    category: 'ACTIONS',
    icon: Building,
    color: '#0F766E',
    bg: '#CCFBF1',
    badge: 'Booking',
    desc: 'Checks inventory, computes dynamic pricing with GST slabs, and creates temporary hold',
    defaultConfig: {
      entityType: 'ROOM', // ROOM | SEAT | PRODUCT | SERVICE
      action: 'HOSPITALITY_CHECK_AVAILABILITY', // HOSPITALITY_CHECK_AVAILABILITY | HOSPITALITY_CALCULATE_QUOTE | HOSPITALITY_CREATE_ENQUIRY | B2B_CALCULATE_SALES_QUOTE
      checkinVar: 'check_in_date',
      checkoutVar: 'check_out_date',
      guestsVar: 'guest_count',
      saveQuoteAs: 'quote_total',
      saveSubtotalAs: 'quote_subtotal',
      saveTaxAs: 'tax_total'
    },
    getOutputHandles: () => [
      { id: 'available', label: 'Available / Quoted ✅', type: 'source', color: '#16A34A' },
      { id: 'unavailable', label: 'Sold Out / Unavailable 🚫', type: 'source', color: '#E11D48' }
    ]
  },
  {
    type: 'HTTP_WEBHOOK',
    label: 'HTTP Webhook / API Call',
    category: 'ACTIONS',
    icon: Globe,
    color: '#4F46E5',
    bg: '#EEF2FF',
    badge: 'Integration',
    desc: 'Invokes external REST API, parses response, and maps JSON keys into flow variables',
    defaultConfig: {
      method: 'POST',
      url: 'https://api.example.com/v1/enrich-lead',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{\n  "phone": "{{contact.phone}}",\n  "name": "{{contact.name}}"\n}',
      responseMappings: [
        { jsonPath: 'data.status', mapToVariable: 'api_lead_status' }
      ]
    },
    getOutputHandles: () => [
      { id: 'success', label: '2xx Success', type: 'source', color: '#16A34A' },
      { id: 'failure', label: 'Error / Timeout', type: 'source', color: '#E11D48' }
    ]
  },
  {
    type: 'HUMAN_HANDOFF',
    label: 'Human Staff Handoff',
    category: 'ACTIONS',
    icon: PhoneCall,
    color: '#E11D48',
    bg: '#FFE4E6',
    badge: 'Handoff',
    desc: 'Pauses automated bot responses and routes conversation to on-duty staff inbox',
    defaultConfig: {
      team: 'FRONT_DESK',
      assignedTo: 'Duty Concierge',
      handoffMessage: '🔔 You are now connected with our front desk team. A concierge specialist will assist you shortly.',
      pauseAutomationMinutes: 120
    },
    getOutputHandles: () => [] // Terminal node
  },

  // 7. TERMINAL
  {
    type: 'END',
    label: 'End Conversation',
    category: 'ACTIONS',
    icon: CheckCircle2,
    color: '#475569',
    bg: '#F1F5F9',
    badge: 'Terminal',
    desc: 'Gracefully concludes conversation journey with optional farewell message',
    defaultConfig: {
      farewellMessage: 'Thank you for connecting with us! Have a wonderful day.'
    },
    getOutputHandles: () => [] // Terminal node
  },

  // 7. UNIVERSAL COMMERCE & HYBRID AI NODES
  {
    type: 'CATALOG_BROWSER',
    label: 'Universal Catalog Browser',
    category: 'MESSAGING',
    icon: Layers,
    color: '#0284C7',
    bg: '#E0F2FE',
    badge: 'Catalog',
    desc: 'Displays interactive WhatsApp lists/buttons of products, rooms, services, or dishes',
    defaultConfig: {
      title: '🛍️ Explore Our Offerings',
      pageSize: 6,
      categoryName: '',
      inventoryMode: 'UNIT_STOCK'
    },
    getOutputHandles: () => [
      { id: 'item_selected', label: 'Item Selected', type: 'source' },
      { id: 'empty', label: 'Catalog Empty', type: 'source' },
      { id: 'default', label: 'Fallback', type: 'source' }
    ]
  },
  {
    type: 'ADDON_UPSELL_AND_QUOTE',
    label: 'Add-Ons & Dynamic Quote',
    category: 'ACTIONS',
    icon: Sparkles,
    color: '#D97706',
    bg: '#FEF3C7',
    badge: 'Pricing & Add-ons',
    desc: 'Offers extras/upsells, applies promo codes, and calculates itemized GST quotation',
    defaultConfig: {
      allowAddons: true,
      allowPromoCode: true
    },
    getOutputHandles: () => [
      { id: 'confirmed', label: 'Quote Confirmed', type: 'source' },
      { id: 'default', label: 'Continue', type: 'source' }
    ]
  },
  {
    type: 'AI_HYBRID_ASSIST',
    label: 'AI Hybrid Assist',
    category: 'MESSAGING',
    icon: Bot,
    color: '#7C3AED',
    bg: '#EDE9FE',
    badge: 'Hybrid AI',
    desc: 'Answers off-script customer questions grounded in live DB inventory without breaking active session',
    defaultConfig: {
      resumePrompt: "👉 Let's continue where we left off:"
    },
    getOutputHandles: () => [
      { id: 'default', label: 'Next Step', type: 'source' }
    ]
  },
  {
    type: 'MASTER_PICKER',
    label: 'Master Data Picker',
    category: 'MESSAGING',
    icon: Database,
    color: '#059669',
    bg: '#D1FAE5',
    badge: 'Master ERP',
    desc: 'Dynamic WhatsApp buttons (2-3) or list menu (4-10) resolving live categories, branches, staff, or payment modes',
    defaultConfig: {
      masterType: 'master_categories',
      promptText: 'Please select an option:',
      outputVariable: 'selected_category',
      autoAdvanceOnSingle: true,
      maxButtons: 3,
      listButtonTitle: 'Choose Option'
    },
    getOutputHandles: () => [
      { id: 'default', label: 'Option Selected', type: 'source' },
      { id: 'empty', label: 'No Options Found', type: 'source' }
    ]
  },
  {
    type: 'OPEN_INAPP_EXPERIENCE',
    label: 'Interactive Web App (/x/)',
    category: 'ACTIONS',
    icon: Globe,
    color: '#0284C7',
    bg: '#E0F2FE',
    badge: 'In-App /x/',
    desc: 'Transitions WhatsApp customer into a personalized In-App Experience with pre-populated variables, then resumes on completion',
    defaultConfig: {
      experienceSlug: '',
      messageText: 'Tap the button below to view all options, compare features & customize add-ons:',
      buttonLabel: 'Open Interactive App 📱',
      waitForCompletion: true,
      carrySessionVars: ['selected_location_id', 'selected_category_id', 'guest_name', 'phone']
    },
    getOutputHandles: () => [
      { id: 'completed', label: 'In-App Completed', type: 'source' },
      { id: 'cancelled', label: 'User Cancelled', type: 'source' },
      { id: 'default', label: 'Default / Continue', type: 'source' }
    ]
  }
];

// Fallback & mapping dictionary for legacy node types
export const LEGACY_NODE_TYPE_MAP = {
  START: 'TRIGGER_WHATSAPP',
  MESSAGE: 'SEND_MESSAGE',
  BUTTON_MENU: 'SEND_MESSAGE',
  INPUT_COLLECTION: 'COLLECT_INPUT',
  QUESTION: 'COLLECT_INPUT',
  BUSINESS_ACTION: 'CATALOG_BOOKING',
  CONFIRMATION: 'SEND_MESSAGE',
  PAYMENT: 'SEND_MESSAGE',
  QUOTATION: 'CATALOG_BOOKING',
  API_INTEGRATION: 'HTTP_WEBHOOK',
  DELAY: 'WAIT_DELAY',
  HANDOFF: 'HUMAN_HANDOFF',
  END: 'END',
  INAPP_BRIDGE: 'OPEN_INAPP_EXPERIENCE',
  INTERACTIVE_APP: 'OPEN_INAPP_EXPERIENCE'
};

/**
 * Resolves full node metadata by node type, with fallback for legacy types
 */
export function getNodeDefinition(type) {
  if (!type) return NODE_DEFINITIONS[0];
  const direct = NODE_DEFINITIONS.find(d => d.type === type);
  if (direct) return direct;

  const mappedType = LEGACY_NODE_TYPE_MAP[type];
  if (mappedType) {
    const mapped = NODE_DEFINITIONS.find(d => d.type === mappedType);
    if (mapped) return { ...mapped, type, canonicalType: mappedType };
  }

  // Generic fallback
  return {
    type,
    label: type.replace(/_/g, ' '),
    category: 'ACTIONS',
    icon: Database,
    color: '#64748B',
    bg: '#F1F5F9',
    badge: 'Node',
    desc: 'Custom workflow step',
    defaultConfig: {},
    getOutputHandles: () => [{ id: 'default', label: 'Next Step', type: 'source' }]
  };
}
