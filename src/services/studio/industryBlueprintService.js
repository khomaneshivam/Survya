const crypto = require("crypto");
const inappExperienceService = require("../inapp/inappExperienceService");
const {
  mapLegacyScreenToComponent,
  validateComponentTurnInput,
  sanitizePayloadValue,
  sanitizeText
} = require("./conversationalComponentRegistry");
const { appendConversationTurn } = require("./transcriptHelper");
const { db } = require("../../config/database");

// Ephemeral in-memory isolated store for Try Demo sessions (TTL 2h, zero DB side effects)
const DEMO_SESSIONS = new Map();

function cleanupExpiredDemos() {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [token, sess] of DEMO_SESSIONS.entries()) {
    if (sess.updatedAtMs < cutoff) {
      DEMO_SESSIONS.delete(token);
    }
  }
}

const BUILTIN_BLUEPRINTS = [
  {
    key: "hospitality-resort",
    title: "Hotel & Resort Booking",
    industry: "HOSPITALITY",
    category: "BOOKING",
    goalType: "BOOKING_CONFIRMED",
    goalLabel: "Booking Confirmation",
    badge: "POPULAR",
    description: "Check dates, browse room categories with pricing, customize add-ons, and capture confirmed booking requests.",
    defaultWelcome: "Welcome to our coastal sanctuary! Let's plan your stay.",
    demoCatalog: [
      { id: 901, title: "Oceanfront Pool Villa", price: 12500, currency: "INR", description: "Private plunge pool, sea view deck, breakfast included." },
      { id: 902, title: "Garden Heritage Cottage", price: 6800, currency: "INR", description: "Spacious garden sit-out, king bed, peaceful greenery." }
    ],
    steps: [
      {
        screenKey: "welcome",
        title: "Welcome & Intent",
        subtitle: "How would you like to plan your stay?",
        screenType: "HERO_WELCOME",
        config: {
          componentType: "single_select",
          outputKey: "intent",
          options: ["Book a Stay", "Check Villa Rates", "Group Retreat Quote"]
        },
        navigationRules: { defaultNext: "dates" }
      },
      {
        screenKey: "dates",
        title: "Select Stay Dates",
        subtitle: "Choose your check-in and check-out dates",
        screenType: "INFO",
        config: { componentType: "date_range_picker" },
        navigationRules: { defaultNext: "catalog" }
      },
      {
        screenKey: "catalog",
        title: "Available Rooms & Villas",
        subtitle: "Select your preferred accommodation",
        screenType: "CATALOG_EXPLORER",
        config: { componentType: "catalogue_carousel" },
        navigationRules: { defaultNext: "guest_info" }
      },
      {
        screenKey: "guest_info",
        title: "Guest Details",
        subtitle: "Enter your name and WhatsApp/email for confirmation",
        screenType: "INFO",
        config: { componentType: "email_input", outputKey: "email", required: true, placeholder: "guest@example.com" },
        navigationRules: { defaultNext: "summary" }
      },
      {
        screenKey: "summary",
        title: "Booking Summary",
        subtitle: "Review your stay details and confirm",
        screenType: "INFO",
        config: { componentType: "booking_summary" },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Booking Request Confirmed",
        subtitle: "Your reservation summary has been shared.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "retail-store",
    title: "Retail & Product Ordering",
    industry: "RETAIL",
    category: "ORDER",
    goalType: "ORDER_PLACED",
    goalLabel: "Order Placed",
    badge: "ECOMMERCE",
    description: "Showcase featured products, select quantity & delivery address, review order breakdown, and confirm orders.",
    defaultWelcome: "Browse our curated catalog and place your order in seconds.",
    demoCatalog: [
      { id: 911, title: "Artisan Gift Hamper", price: 2499, currency: "INR", description: "Curated box with organic teas, honey & brass diffuser." },
      { id: 912, title: "Cold-Pressed Gift Set", price: 1450, currency: "INR", description: "Small-batch wellness collection ready to ship." }
    ],
    steps: [
      {
        screenKey: "welcome",
        title: "Browse Store Catalog",
        subtitle: "Choose an item to customize your order",
        screenType: "CATALOG_EXPLORER",
        config: { componentType: "catalogue_carousel" },
        navigationRules: { defaultNext: "quantity" }
      },
      {
        screenKey: "quantity",
        title: "Select Quantity",
        subtitle: "How many units would you like?",
        screenType: "INFO",
        config: { componentType: "quantity_selector", min: 1, max: 20 },
        navigationRules: { defaultNext: "address" }
      },
      {
        screenKey: "address",
        title: "Delivery Address",
        subtitle: "Share where we should deliver your order",
        screenType: "INFO",
        config: { componentType: "address_collection" },
        navigationRules: { defaultNext: "cart" }
      },
      {
        screenKey: "cart",
        title: "Order Summary",
        subtitle: "Review your order total before confirming",
        screenType: "INFO",
        config: { componentType: "cart_summary" },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Order Confirmed",
        subtitle: "Your order reference has been generated.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "clinic-appointment",
    title: "Clinic & Consultation Booking",
    industry: "HEALTHCARE",
    category: "APPOINTMENT",
    goalType: "APPOINTMENT_CONFIRMED",
    goalLabel: "Appointment Confirmed",
    badge: "HEALTHCARE",
    description: "Select consultation specialty, pick date & time slot, capture patient phone, and confirm the appointment.",
    defaultWelcome: "Book your clinic or video consultation without waiting on hold.",
    demoCatalog: [
      { id: 921, title: "General Physician Consultation", price: 700, currency: "INR", description: "30-minute in-clinic or video consultation." },
      { id: 922, title: "Dental Checkup & Scaling", price: 1200, currency: "INR", description: "Comprehensive oral exam with specialist." }
    ],
    steps: [
      {
        screenKey: "welcome",
        title: "Select Consultation Type",
        subtitle: "Choose how you would like to consult",
        screenType: "HERO_WELCOME",
        config: {
          componentType: "single_select",
          outputKey: "consultation_type",
          options: ["In-Clinic Visit", "Video Consultation", "Follow-up Review"]
        },
        navigationRules: { defaultNext: "date" }
      },
      {
        screenKey: "date",
        title: "Preferred Date",
        subtitle: "Choose an appointment date",
        screenType: "INFO",
        config: { componentType: "date_picker" },
        navigationRules: { defaultNext: "slot" }
      },
      {
        screenKey: "slot",
        title: "Available Time Slots",
        subtitle: "Select a convenient time",
        screenType: "INFO",
        config: { componentType: "time_slot_selector", slots: ["10:00 AM", "11:30 AM", "04:00 PM", "06:00 PM"] },
        navigationRules: { defaultNext: "phone" }
      },
      {
        screenKey: "phone",
        title: "Patient Mobile Number",
        subtitle: "We will send appointment confirmation on WhatsApp",
        screenType: "INFO",
        config: { componentType: "phone_input", outputKey: "phone", required: true },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Appointment Confirmed",
        subtitle: "Your slot is reserved.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "service-quotation",
    title: "Service Enquiry & Quotation",
    industry: "SERVICES",
    category: "QUOTATION",
    goalType: "QUOTATION_REQUESTED",
    goalLabel: "Quotation Requested",
    badge: "B2B / SERVICES",
    description: "Qualify service requirements, quantity/budget, accept terms, preview quotation, and notify the sales desk.",
    defaultWelcome: "Share your project scope and receive a tailored estimate.",
    demoCatalog: [
      { id: 931, title: "Annual Maintenance Plan", price: 18000, currency: "INR", description: "Quarterly preventive servicing with priority SLA." }
    ],
    steps: [
      {
        screenKey: "welcome",
        title: "Select Service Scope",
        subtitle: "What service do you require?",
        screenType: "HERO_WELCOME",
        config: {
          componentType: "single_select",
          outputKey: "service_scope",
          options: ["One-Time Installation", "Annual AMC Plan", "Custom Enterprise Proposal"]
        },
        navigationRules: { defaultNext: "qty" }
      },
      {
        screenKey: "qty",
        title: "Estimated Units / Locations",
        subtitle: "Enter quantity or team size",
        screenType: "INFO",
        config: { componentType: "quantity_selector", min: 1, max: 500 },
        navigationRules: { defaultNext: "quote_preview" }
      },
      {
        screenKey: "quote_preview",
        title: "Instant Quotation Preview",
        subtitle: "Review estimate breakdown",
        screenType: "INFO",
        config: { componentType: "quotation_preview" },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Quotation Request Submitted",
        subtitle: "Our team has received your requirement.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "real-estate-enquiry",
    title: "Real Estate Property Concierge",
    industry: "REAL_ESTATE",
    category: "LEAD_GENERATION",
    goalType: "PROPERTY_ENQUIRY",
    goalLabel: "Lead Qualified",
    badge: "REAL ESTATE",
    description: "Capture buyer/tenant budget, unit preference, site-visit date, and contact info for instant broker follow-up.",
    defaultWelcome: "Explore available residences and schedule a private site tour.",
    demoCatalog: [
      { id: 941, title: "2 BHK Sea-Breeze Residence", price: 8500000, currency: "INR", description: "1,120 sq.ft carpet area with covered parking." }
    ],
    steps: [
      {
        screenKey: "welcome",
        title: "Configuration & Budget",
        subtitle: "Select your preferred configuration",
        screenType: "HERO_WELCOME",
        config: { componentType: "single_select", outputKey: "unit_type", options: ["2 BHK", "3 BHK", "Commercial Space"] },
        navigationRules: { defaultNext: "visit_date" }
      },
      {
        screenKey: "visit_date",
        title: "Schedule Site Visit",
        subtitle: "Pick a preferred date for your visit",
        screenType: "INFO",
        config: { componentType: "date_picker" },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Site Visit Requested",
        subtitle: "A property advisor will confirm your visit shortly.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "b2b-lead-qualification",
    title: "B2B Lead Qualification & Demo",
    industry: "B2B_SALES",
    category: "LEAD_GENERATION",
    goalType: "LEAD_QUALIFICATION",
    goalLabel: "Lead Qualified",
    badge: "SAAS / B2B",
    description: "Qualify company size, use-cases, work email, and schedule a consultative discovery call.",
    defaultWelcome: "Answer 3 quick questions so we tailor the product walkthrough for your team.",
    demoCatalog: [],
    steps: [
      {
        screenKey: "welcome",
        title: "Primary Use Case",
        subtitle: "Select all workflows you want to automate",
        screenType: "HERO_WELCOME",
        config: {
          componentType: "multi_select",
          outputKey: "use_cases",
          options: ["Lead Capture", "Booking Automation", "Order Desk", "Customer Support"]
        },
        navigationRules: { defaultNext: "work_email" }
      },
      {
        screenKey: "work_email",
        title: "Work Email",
        subtitle: "Enter your work email for calendar invite",
        screenType: "INFO",
        config: { componentType: "email_input", outputKey: "email", required: true },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Qualification Complete",
        subtitle: "You are matched with our solutions team.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  },
  {
    key: "event-registration",
    title: "Admissions & Customer Registration",
    industry: "EDUCATION",
    category: "REGISTRATION",
    goalType: "REGISTRATION_COMPLETED",
    goalLabel: "Registration Complete",
    badge: "EDUCATION",
    description: "Capture program preference, applicant email, and terms acceptance with instant registration receipt.",
    defaultWelcome: "Register in under a minute — choose your preferred program below.",
    demoCatalog: [],
    steps: [
      {
        screenKey: "welcome",
        title: "Select Program Track",
        subtitle: "Which cohort or course are you applying for?",
        screenType: "HERO_WELCOME",
        config: {
          componentType: "single_select",
          outputKey: "program_track",
          options: ["Full-Stack Engineering", "AI & Data Science", "Product Design"]
        },
        navigationRules: { defaultNext: "terms" }
      },
      {
        screenKey: "terms",
        title: "Terms & Consent",
        subtitle: "Please confirm registration terms",
        screenType: "INFO",
        config: { componentType: "terms_acceptance" },
        navigationRules: { defaultNext: "confirmation" }
      },
      {
        screenKey: "confirmation",
        title: "Registration Confirmed",
        subtitle: "Your application reference is saved.",
        screenType: "CONFIRMATION",
        config: { componentType: "success_receipt" }
      }
    ]
  }
];

const EXTRA_BLUEPRINTS = [];

function registerBlueprint(blueprint) {
  if (!blueprint || !blueprint.key || !Array.isArray(blueprint.steps) || blueprint.steps.length === 0) {
    throw new Error("Blueprint must include unique 'key' and non-empty 'steps' array");
  }
  const existingIdx = EXTRA_BLUEPRINTS.findIndex((b) => b.key === blueprint.key);
  if (existingIdx >= 0) {
    EXTRA_BLUEPRINTS[existingIdx] = blueprint;
  } else {
    EXTRA_BLUEPRINTS.push(blueprint);
  }
  return blueprint;
}

function listBlueprints({ industry = "ALL", search = "" } = {}) {
  const all = [...BUILTIN_BLUEPRINTS, ...EXTRA_BLUEPRINTS];
  return all
    .filter((b) => {
      if (industry && industry !== "ALL" && b.industry !== String(industry).toUpperCase()) return false;
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        return b.title.toLowerCase().includes(q)
          || b.description.toLowerCase().includes(q)
          || b.industry.toLowerCase().includes(q)
          || b.goalLabel.toLowerCase().includes(q);
      }
      return true;
    })
    .map((b) => ({
      key: b.key,
      title: b.title,
      industry: b.industry,
      category: b.category,
      goalType: b.goalType,
      goalLabel: b.goalLabel,
      badge: b.badge || b.industry,
      description: b.description,
      stepsCount: b.steps.length,
      components: b.steps.map((s) => s.config?.componentType || "text_message"),
      hasDemoCatalog: Array.isArray(b.demoCatalog) && b.demoCatalog.length > 0
    }));
}

function getBlueprintByKey(key) {
  const all = [...BUILTIN_BLUEPRINTS, ...EXTRA_BLUEPRINTS];
  const bp = all.find((b) => b.key === key);
  if (!bp) {
    const err = new Error(`Industry blueprint '${key}' not found`);
    err.statusCode = 404;
    throw err;
  }
  return bp;
}

/**
 * Starts an isolated interactive Try Demo session in memory — ZERO production DB/WA/email/inventory side effects.
 */
function startInteractiveDemo(key) {
  cleanupExpiredDemos();
  const bp = getBlueprintByKey(key);
  const demoToken = `demo_${crypto.randomBytes(16).toString("hex")}`;

  const screens = bp.steps.map((s, idx) => {
    const scr = {
      id: 10000 + idx,
      screenKey: s.screenKey,
      title: s.title,
      subtitle: s.subtitle,
      screenType: s.screenType || "INFO",
      config: s.config || {},
      navigationRules: s.navigationRules || {},
      displayOrder: idx
    };
    scr.component = mapLegacyScreenToComponent(scr, []);
    return scr;
  });

  const entryScreen = screens[0];
  const transcript = [
    {
      id: `demo_init_${Date.now()}`,
      role: "assistant",
      screenKey: entryScreen.screenKey,
      componentType: entryScreen.component.componentType,
      title: entryScreen.title,
      message: entryScreen.subtitle || bp.defaultWelcome,
      timestamp: new Date().toISOString()
    }
  ];

  const sessionState = {
    demoToken,
    demoMode: true,
    blueprintKey: bp.key,
    experience: {
      id: `demo_${bp.key}`,
      slug: `demo-${bp.key}`,
      name: `${bp.title} (Interactive Demo)`,
      domainType: bp.industry,
      theme: { primaryColor: "#2F5219" },
      features: { enableRateDiscussion: false, enableCallbacks: false, enableLiveChat: false },
      status: "PUBLISHED"
    },
    screens,
    catalogItems: bp.demoCatalog || [],
    currentScreenKey: entryScreen.screenKey,
    navigationStack: [entryScreen.screenKey],
    stateData: { demoMode: true },
    transcript,
    goalAchieved: false,
    updatedAtMs: Date.now()
  };

  DEMO_SESSIONS.set(demoToken, sessionState);
  return { ...sessionState };
}

/**
 * Advances an isolated interactive Try Demo session using the authoritative Component Registry validator.
 */
function advanceInteractiveDemo(demoToken, {
  fromScreenKey = null,
  action = "NEXT",
  targetScreenKey = null,
  formValues = {},
  selectedItemId = null
} = {}) {
  const sess = DEMO_SESSIONS.get(demoToken);
  if (!sess) {
    const err = new Error("Demo session expired. Please restart Try Demo.");
    err.statusCode = 404;
    throw err;
  }

  sess.updatedAtMs = Date.now();
  const screens = sess.screens;

  if (action === "BACK") {
    if (sess.navigationStack.length > 1) sess.navigationStack.pop();
    sess.currentScreenKey = sess.navigationStack[sess.navigationStack.length - 1] || screens[0].screenKey;
    return { ...sess };
  }

  const activeKey = fromScreenKey || sess.currentScreenKey;
  const fromScreen = screens.find((s) => s.screenKey === activeKey);
  const safeValues = sanitizePayloadValue(formValues || {});

  if (fromScreen?.component?.componentType && Object.keys(safeValues).length > 0) {
    const check = validateComponentTurnInput(fromScreen.component.componentType, safeValues, fromScreen.config || {});
    if (!check.valid) {
      const err = new Error("Demo step validation failed");
      err.statusCode = 422;
      err.fieldErrors = check.fieldErrors;
      throw err;
    }
  }

  sess.stateData = { ...sess.stateData, ...safeValues };

  if (selectedItemId) {
    const matched = sess.catalogItems.find((i) => String(i.id) === String(selectedItemId));
    if (matched) {
      sess.stateData.selectedItemId = matched.id;
      sess.stateData.selectedItem = matched;
      sess.stateData.selectedItemTitle = matched.title;
      sess.stateData.selectedItemPrice = matched.price;
    }
  }

  let nextKey = targetScreenKey || fromScreen?.navigationRules?.defaultNext || null;
  if (!nextKey && fromScreen) {
    const idx = screens.findIndex((s) => s.screenKey === fromScreen.screenKey);
    nextKey = screens[Math.min(idx + 1, screens.length - 1)]?.screenKey;
  }
  if (!nextKey) nextKey = activeKey;

  const nextScreen = screens.find((s) => s.screenKey === nextKey);
  const isDone = nextScreen?.screenType === "CONFIRMATION" || action === "COMPLETE";
  if (isDone) {
    sess.goalAchieved = true;
    sess.stateData.referenceCode = `DEMO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }

  const summaryText = sess.stateData.selectedItemTitle
    || (Object.keys(safeValues).length > 0 ? Object.values(safeValues).slice(0, 3).join(", ") : action);

  sess.transcript = appendConversationTurn(sess.transcript, {
    userSummary: summaryText,
    userData: safeValues,
    fromScreenKey: activeKey,
    nextScreen,
    nextFields: [],
    channelOwner: "SURVYA"
  });

  if (sess.navigationStack[sess.navigationStack.length - 1] !== nextKey) {
    sess.navigationStack.push(nextKey);
  }
  sess.currentScreenKey = nextKey;

  return { ...sess };
}

/**
 * Clones an Industry Blueprint into a tenant's workspace as a customizable Studio experience.
 */
function cloneBlueprintToTenant(tenantId = 1, key, options = {}, actor = "studio_user") {
  const numericTenantId = Number(tenantId) || 1;
  const bp = getBlueprintByKey(key);
  const expName = sanitizeText(options.name || options.businessName || bp.title) || bp.title;

  const created = inappExperienceService.createExperience({
    name: expName,
    slug: options.slug || undefined,
    domain_type: bp.industry,
    entry_screen_key: bp.steps[0]?.screenKey || "welcome",
    theme_json: options.theme || { primaryColor: "#2F5219" },
    status: options.publishImmediately ? "PUBLISHED" : "DRAFT"
  }, numericTenantId, actor);

  db.prepare(`
    UPDATE inapp_experiences
    SET studio_mode = 'GUIDED',
        goal_type = ?,
        goal_config_json = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    bp.goalType,
    JSON.stringify({ goalType: bp.goalType, blueprintKey: bp.key }),
    actor,
    created.id,
    numericTenantId
  );

  for (let i = 0; i < bp.steps.length; i += 1) {
    const s = bp.steps[i];
    inappExperienceService.createScreen(created.id, {
      screen_key: s.screenKey,
      title: s.title,
      subtitle: s.subtitle,
      screen_type: s.screenType || "INFO",
      config_json: s.config || {},
      navigation_rules_json: s.navigationRules || {},
      display_order: i
    }, numericTenantId, actor);
  }

  return inappExperienceService.getExperienceById(created.id, numericTenantId);
}

module.exports = {
  listBlueprints,
  getBlueprintByKey,
  registerBlueprint,
  startInteractiveDemo,
  advanceInteractiveDemo,
  cloneBlueprintToTenant
};
