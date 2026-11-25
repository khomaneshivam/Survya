/**
 * Formal Conversational Component Registry & Schema Validator
 * Powers customer runtime, isolated demos, and live Studio previews using a single source of truth.
 */

const COMPONENT_TYPES = Object.freeze({
  TEXT_MESSAGE: "text_message",
  IMAGE_MESSAGE: "image_message",
  MEDIA_CARD: "media_card",
  SINGLE_SELECT: "single_select",
  MULTI_SELECT: "multi_select",
  CATALOGUE_CARD: "catalogue_card",
  CATALOGUE_CAROUSEL: "catalogue_carousel",
  PRODUCT_DETAILS: "product_details",
  SERVICE_DETAILS: "service_details",
  DATE_PICKER: "date_picker",
  DATE_RANGE_PICKER: "date_range_picker",
  TIME_SLOT_SELECTOR: "time_slot_selector",
  QUANTITY_SELECTOR: "quantity_selector",
  NUMBER_INPUT: "number_input",
  TEXT_INPUT: "text_input",
  EMAIL_INPUT: "email_input",
  PHONE_INPUT: "phone_input",
  ADDRESS_COLLECTION: "address_collection",
  REQUIREMENT_COLLECTION: "requirement_collection",
  PRICE_BREAKDOWN: "price_breakdown",
  CART_SUMMARY: "cart_summary",
  BOOKING_SUMMARY: "booking_summary",
  QUOTATION_PREVIEW: "quotation_preview",
  TERMS_ACCEPTANCE: "terms_acceptance",
  CONFIRMATION: "confirmation",
  PAYMENT_ACTION: "payment_action",
  SUCCESS_RECEIPT: "success_receipt",
  ERROR_RECOVERY: "error_recovery",
  HUMAN_ASSISTANCE: "human_assistance"
});

const REGISTRY_DEFINITIONS = {
  [COMPONENT_TYPES.TEXT_MESSAGE]: {
    type: COMPONENT_TYPES.TEXT_MESSAGE,
    label: "Text Message",
    category: "MESSAGE",
    requiresInput: false,
    outputKey: null
  },
  [COMPONENT_TYPES.IMAGE_MESSAGE]: {
    type: COMPONENT_TYPES.IMAGE_MESSAGE,
    label: "Image Message",
    category: "MESSAGE",
    requiresInput: false,
    outputKey: null
  },
  [COMPONENT_TYPES.MEDIA_CARD]: {
    type: COMPONENT_TYPES.MEDIA_CARD,
    label: "Media Card",
    category: "MESSAGE",
    requiresInput: false,
    outputKey: "selected_action"
  },
  [COMPONENT_TYPES.SINGLE_SELECT]: {
    type: COMPONENT_TYPES.SINGLE_SELECT,
    label: "Quick Replies / Single Select",
    category: "SELECTION",
    requiresInput: true,
    outputKey: "selected_option"
  },
  [COMPONENT_TYPES.MULTI_SELECT]: {
    type: COMPONENT_TYPES.MULTI_SELECT,
    label: "Multi-Select Chips",
    category: "SELECTION",
    requiresInput: true,
    outputKey: "selected_options"
  },
  [COMPONENT_TYPES.CATALOGUE_CARD]: {
    type: COMPONENT_TYPES.CATALOGUE_CARD,
    label: "Catalogue Card",
    category: "CATALOG",
    requiresInput: true,
    outputKey: "selectedItemId"
  },
  [COMPONENT_TYPES.CATALOGUE_CAROUSEL]: {
    type: COMPONENT_TYPES.CATALOGUE_CAROUSEL,
    label: "Catalogue Carousel",
    category: "CATALOG",
    requiresInput: true,
    outputKey: "selectedItemId"
  },
  [COMPONENT_TYPES.PRODUCT_DETAILS]: {
    type: COMPONENT_TYPES.PRODUCT_DETAILS,
    label: "Product Details Card",
    category: "CATALOG",
    requiresInput: false,
    outputKey: "selectedItemId"
  },
  [COMPONENT_TYPES.SERVICE_DETAILS]: {
    type: COMPONENT_TYPES.SERVICE_DETAILS,
    label: "Service Details Card",
    category: "CATALOG",
    requiresInput: false,
    outputKey: "selectedItemId"
  },
  [COMPONENT_TYPES.DATE_PICKER]: {
    type: COMPONENT_TYPES.DATE_PICKER,
    label: "Date Picker",
    category: "SCHEDULE",
    requiresInput: true,
    outputKey: "selected_date"
  },
  [COMPONENT_TYPES.DATE_RANGE_PICKER]: {
    type: COMPONENT_TYPES.DATE_RANGE_PICKER,
    label: "Date Range Picker",
    category: "SCHEDULE",
    requiresInput: true,
    outputKey: "date_range"
  },
  [COMPONENT_TYPES.TIME_SLOT_SELECTOR]: {
    type: COMPONENT_TYPES.TIME_SLOT_SELECTOR,
    label: "Time Slot Selector",
    category: "SCHEDULE",
    requiresInput: true,
    outputKey: "selected_slot"
  },
  [COMPONENT_TYPES.QUANTITY_SELECTOR]: {
    type: COMPONENT_TYPES.QUANTITY_SELECTOR,
    label: "Quantity Selector",
    category: "INPUT",
    requiresInput: true,
    outputKey: "quantity"
  },
  [COMPONENT_TYPES.NUMBER_INPUT]: {
    type: COMPONENT_TYPES.NUMBER_INPUT,
    label: "Number Input",
    category: "INPUT",
    requiresInput: true,
    outputKey: "number_value"
  },
  [COMPONENT_TYPES.TEXT_INPUT]: {
    type: COMPONENT_TYPES.TEXT_INPUT,
    label: "Text Input",
    category: "INPUT",
    requiresInput: true,
    outputKey: "text_value"
  },
  [COMPONENT_TYPES.EMAIL_INPUT]: {
    type: COMPONENT_TYPES.EMAIL_INPUT,
    label: "Email Input",
    category: "INPUT",
    requiresInput: true,
    outputKey: "email"
  },
  [COMPONENT_TYPES.PHONE_INPUT]: {
    type: COMPONENT_TYPES.PHONE_INPUT,
    label: "Phone Input",
    category: "INPUT",
    requiresInput: true,
    outputKey: "phone"
  },
  [COMPONENT_TYPES.ADDRESS_COLLECTION]: {
    type: COMPONENT_TYPES.ADDRESS_COLLECTION,
    label: "Address Collection",
    category: "INPUT",
    requiresInput: true,
    outputKey: "address"
  },
  [COMPONENT_TYPES.REQUIREMENT_COLLECTION]: {
    type: COMPONENT_TYPES.REQUIREMENT_COLLECTION,
    label: "Requirement Collection Form",
    category: "INPUT",
    requiresInput: true,
    outputKey: "requirements"
  },
  [COMPONENT_TYPES.PRICE_BREAKDOWN]: {
    type: COMPONENT_TYPES.PRICE_BREAKDOWN,
    label: "Price Breakdown",
    category: "COMMERCE",
    requiresInput: false,
    outputKey: "pricing_reviewed"
  },
  [COMPONENT_TYPES.CART_SUMMARY]: {
    type: COMPONENT_TYPES.CART_SUMMARY,
    label: "Cart Summary",
    category: "COMMERCE",
    requiresInput: false,
    outputKey: "cart_reviewed"
  },
  [COMPONENT_TYPES.BOOKING_SUMMARY]: {
    type: COMPONENT_TYPES.BOOKING_SUMMARY,
    label: "Booking Summary",
    category: "COMMERCE",
    requiresInput: false,
    outputKey: "booking_reviewed"
  },
  [COMPONENT_TYPES.QUOTATION_PREVIEW]: {
    type: COMPONENT_TYPES.QUOTATION_PREVIEW,
    label: "Quotation Preview",
    category: "COMMERCE",
    requiresInput: false,
    outputKey: "quote_reviewed"
  },
  [COMPONENT_TYPES.TERMS_ACCEPTANCE]: {
    type: COMPONENT_TYPES.TERMS_ACCEPTANCE,
    label: "Terms Acceptance",
    category: "COMPLETION",
    requiresInput: true,
    outputKey: "terms_accepted"
  },
  [COMPONENT_TYPES.CONFIRMATION]: {
    type: COMPONENT_TYPES.CONFIRMATION,
    label: "Confirmation Card",
    category: "COMPLETION",
    requiresInput: true,
    outputKey: "confirmed"
  },
  [COMPONENT_TYPES.PAYMENT_ACTION]: {
    type: COMPONENT_TYPES.PAYMENT_ACTION,
    label: "Payment Action",
    category: "COMPLETION",
    requiresInput: false,
    outputKey: "payment_status"
  },
  [COMPONENT_TYPES.SUCCESS_RECEIPT]: {
    type: COMPONENT_TYPES.SUCCESS_RECEIPT,
    label: "Success Receipt",
    category: "COMPLETION",
    requiresInput: false,
    outputKey: null
  },
  [COMPONENT_TYPES.ERROR_RECOVERY]: {
    type: COMPONENT_TYPES.ERROR_RECOVERY,
    label: "Error Recovery Prompt",
    category: "SYSTEM",
    requiresInput: false,
    outputKey: null
  },
  [COMPONENT_TYPES.HUMAN_ASSISTANCE]: {
    type: COMPONENT_TYPES.HUMAN_ASSISTANCE,
    label: "Human Assistance Handoff",
    category: "HANDOFF",
    requiresInput: false,
    outputKey: "handoff_requested"
  }
};

const DANGEROUS_URI_RE = /^(?:javascript|vbscript|data:text\/html):/i;
const SCRIPT_TAG_RE = /<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

function sanitizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(SCRIPT_TAG_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(/javascript:/gi, "")
    .trim();
}

function sanitizeSafeUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed || DANGEROUS_URI_RE.test(trimmed)) return "";
  return trimmed;
}

function sanitizePayloadValue(val, depth = 0) {
  if (depth > 8) return null;
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    if (SCRIPT_TAG_RE.test(val) || /javascript:/i.test(val)) {
      SCRIPT_TAG_RE.lastIndex = 0;
      return sanitizeText(val);
    }
    SCRIPT_TAG_RE.lastIndex = 0;
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(v => sanitizePayloadValue(v, depth + 1));
  }
  if (typeof val === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      clean[sanitizeText(k)] = sanitizePayloadValue(v, depth + 1);
    }
    return clean;
  }
  return val;
}

function getRegisteredComponents() {
  return Object.values(REGISTRY_DEFINITIONS);
}

function isSupportedComponentType(componentType) {
  return Boolean(componentType && REGISTRY_DEFINITIONS[componentType]);
}

function mapLegacyScreenToComponent(screen = {}, fields = []) {
  const cfg = screen.config && typeof screen.config === "object" ? screen.config : {};
  const explicitType = cfg.componentType || cfg.component_type;

  if (explicitType && isSupportedComponentType(explicitType)) {
    return {
      componentType: explicitType,
      meta: REGISTRY_DEFINITIONS[explicitType],
      config: sanitizePayloadValue(cfg)
    };
  }

  let mappedType = COMPONENT_TYPES.TEXT_MESSAGE;
  switch (String(screen.screenType || "").toUpperCase()) {
    case "HERO_WELCOME":
      mappedType = COMPONENT_TYPES.MEDIA_CARD;
      break;
    case "CATALOG_EXPLORER":
      mappedType = COMPONENT_TYPES.CATALOGUE_CAROUSEL;
      break;
    case "ITEM_DETAIL":
      mappedType = COMPONENT_TYPES.PRODUCT_DETAILS;
      break;
    case "DYNAMIC_FORM":
    case "FORM":
      mappedType = fields.length === 1 && fields[0].inputType === "DATE"
        ? COMPONENT_TYPES.DATE_PICKER
        : COMPONENT_TYPES.REQUIREMENT_COLLECTION;
      break;
    case "RATE_NEGOTIATION":
      mappedType = COMPONENT_TYPES.QUOTATION_PREVIEW;
      break;
    case "CALL_CONNECT":
    case "LIVE_CHAT":
      mappedType = COMPONENT_TYPES.HUMAN_ASSISTANCE;
      break;
    case "CONFIRMATION":
      mappedType = COMPONENT_TYPES.SUCCESS_RECEIPT;
      break;
    default:
      mappedType = COMPONENT_TYPES.TEXT_MESSAGE;
      break;
  }

  return {
    componentType: mappedType,
    meta: REGISTRY_DEFINITIONS[mappedType],
    config: sanitizePayloadValue(cfg)
  };
}

function validateComponentStepConfig(componentType, config = {}) {
  if (!isSupportedComponentType(componentType)) {
    return { valid: false, errors: [`Unsupported conversational component type: ${componentType}`] };
  }
  const errors = [];
  if (config.imageUrl && !sanitizeSafeUrl(config.imageUrl)) {
    errors.push("Unsafe or invalid imageUrl rejected");
  }
  if ((componentType === COMPONENT_TYPES.SINGLE_SELECT || componentType === COMPONENT_TYPES.MULTI_SELECT) &&
      config.options !== undefined && !Array.isArray(config.options)) {
    errors.push("options must be an array");
  }
  return {
    valid: errors.length === 0,
    errors,
    sanitizedConfig: sanitizePayloadValue(config)
  };
}

function validateComponentTurnInput(componentType, input = {}, config = {}) {
  const cleanInput = sanitizePayloadValue(input || {});
  const fieldErrors = {};

  if (!isSupportedComponentType(componentType)) {
    return { valid: true, fieldErrors, normalized: cleanInput };
  }

  const requiredKey = config.outputKey || REGISTRY_DEFINITIONS[componentType]?.outputKey;

  switch (componentType) {
    case COMPONENT_TYPES.EMAIL_INPUT: {
      const val = String(cleanInput.email || cleanInput[requiredKey] || "").trim();
      if (config.required !== false && (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))) {
        fieldErrors.email = "Please enter a valid email address.";
      }
      if (val) cleanInput.email = val.toLowerCase();
      break;
    }
    case COMPONENT_TYPES.PHONE_INPUT: {
      const digits = String(cleanInput.phone || cleanInput[requiredKey] || "").replace(/\D/g, "");
      if (config.required !== false && (digits.length < 8 || digits.length > 15)) {
        fieldErrors.phone = "Please enter a valid phone number (8-15 digits).";
      }
      if (digits) cleanInput.phone = digits;
      break;
    }
    case COMPONENT_TYPES.NUMBER_INPUT:
    case COMPONENT_TYPES.QUANTITY_SELECTOR: {
      const raw = cleanInput[requiredKey] ?? cleanInput.quantity ?? cleanInput.value;
      const num = Number(raw);
      const min = config.min !== undefined ? Number(config.min) : (componentType === COMPONENT_TYPES.QUANTITY_SELECTOR ? 1 : -Infinity);
      const max = config.max !== undefined ? Number(config.max) : Infinity;
      if (Number.isNaN(num) || num < min || num > max) {
        fieldErrors[requiredKey || "value"] = `Please provide a number between ${min} and ${max}.`;
      } else {
        cleanInput[requiredKey || "value"] = num;
      }
      break;
    }
    case COMPONENT_TYPES.DATE_PICKER: {
      const dateStr = String(cleanInput.selected_date || cleanInput[requiredKey] || "").trim();
      if (config.required !== false && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        fieldErrors.selected_date = "Please choose a valid date (YYYY-MM-DD).";
      }
      break;
    }
    case COMPONENT_TYPES.DATE_RANGE_PICKER: {
      const start = String(cleanInput.check_in || cleanInput.start_date || "").trim();
      const end = String(cleanInput.check_out || cleanInput.end_date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start >= end) {
        fieldErrors.date_range = "Check-out date must be after check-in date.";
      }
      break;
    }
    case COMPONENT_TYPES.TERMS_ACCEPTANCE: {
      if (config.required !== false && !cleanInput.terms_accepted) {
        fieldErrors.terms_accepted = "Please accept the terms to proceed.";
      }
      break;
    }
    case COMPONENT_TYPES.SINGLE_SELECT: {
      const val = cleanInput[requiredKey] ?? cleanInput.value ?? cleanInput.selection;
      if (config.required !== false && (val === undefined || val === null || String(val).trim() === "")) {
        fieldErrors[requiredKey] = "Please select one option.";
      }
      break;
    }
    case COMPONENT_TYPES.MULTI_SELECT: {
      const arr = cleanInput[requiredKey] ?? cleanInput.values ?? cleanInput.selections;
      if (config.required !== false && (!Array.isArray(arr) || arr.length === 0)) {
        fieldErrors[requiredKey] = "Please select at least one option.";
      }
      break;
    }
    default:
      break;
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalized: cleanInput
  };
}

module.exports = {
  COMPONENT_TYPES,
  REGISTRY_DEFINITIONS,
  getRegisteredComponents,
  isSupportedComponentType,
  mapLegacyScreenToComponent,
  validateComponentStepConfig,
  validateComponentTurnInput,
  sanitizeText,
  sanitizeSafeUrl,
  sanitizePayloadValue
};
