const crypto = require("crypto");
const { db } = require("../../config/database");
const inappExperienceService = require("../inapp/inappExperienceService");
const { getRegisteredComponents } = require("./conversationalComponentRegistry");
const { generateQrSvg } = require("../../utils/qrCodeUtil");
const { cleanPhone } = require("../metaWhatsAppService");
const config = require("../../config/env");

const BUSINESS_GOAL_PRESETS = Object.freeze({
  LEAD_QUALIFICATION: {
    eventName: "LeadQualified",
    label: "Lead Qualification",
    summaryPrompt: "Tell us your requirements so we can match the best option."
  },
  BOOKING_CONFIRMED: {
    eventName: "BookingConfirmed",
    label: "Booking Confirmation",
    summaryPrompt: "Choose your preferred dates and room/package."
  },
  APPOINTMENT_CONFIRMED: {
    eventName: "AppointmentConfirmed",
    label: "Appointment Scheduling",
    summaryPrompt: "Select a suitable date and time slot."
  },
  ORDER_PLACED: {
    eventName: "OrderPlaced",
    label: "Product Ordering",
    summaryPrompt: "Browse items and confirm your order quantity."
  },
  QUOTATION_REQUESTED: {
    eventName: "QuotationRequested",
    label: "Quotation Request",
    summaryPrompt: "Share your quantity and specifications for an instant estimate."
  },
  PROPERTY_ENQUIRY: {
    eventName: "LeadQualified",
    label: "Property Enquiry",
    summaryPrompt: "Tell us your budget and preferred location for viewing."
  },
  REGISTRATION_COMPLETED: {
    eventName: "RegistrationCompleted",
    label: "Customer Registration",
    summaryPrompt: "Complete your registration details below."
  }
});

function slugifyShare(text) {
  return String(text || "studio")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "studio";
}

function resolveBaseUrl(overrideUrl = "") {
  const root = String(overrideUrl || config.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || `http://localhost:${config.PORT || 5000}`).trim();
  return root.replace(/\/+$/, "");
}

function getTenantPhone(tenantId, phoneNumberId = null) {
  if (phoneNumberId) {
    const row = db.prepare(`
      SELECT phone_number, display_name, phone_number_id
      FROM waba_phone_numbers
      WHERE tenant_id = ? AND phone_number_id = ?
      LIMIT 1
    `).get(tenantId, String(phoneNumberId));
    if (row) return row;
  }
  return db.prepare(`
    SELECT phone_number, display_name, phone_number_id
    FROM waba_phone_numbers
    WHERE tenant_id = ? AND status IN ('VERIFIED', 'CONNECTED', 'REGISTERED')
    ORDER BY id ASC LIMIT 1
  `).get(tenantId) || null;
}

/**
 * Mode A: Guided Business Setup — creates an objective-driven conversational experience
 * and optionally attaches a WhatsApp Share Link + initial automated reply without requiring flow authoring.
 */
function createGuidedExperience(tenantId = 1, payload = {}, actor = "studio_user") {
  const numericTenantId = Number(tenantId) || 1;
  const businessName = String(payload.businessName || payload.name || "").trim();
  if (!businessName) {
    throw new Error("businessName is required");
  }

  const businessType = String(payload.businessType || payload.domain_type || "SERVICES").toUpperCase();
  const goalType = String(payload.goalType || "LEAD_QUALIFICATION").toUpperCase();
  const goalMeta = BUSINESS_GOAL_PRESETS[goalType] || BUSINESS_GOAL_PRESETS.LEAD_QUALIFICATION;
  const welcomeMessage = String(payload.welcomeMessage || `Welcome to ${businessName}! ${goalMeta.summaryPrompt}`).trim();
  const quickActions = Array.isArray(payload.quickActions) && payload.quickActions.length > 0
    ? payload.quickActions.map(String)
    : [goalMeta.label, "Talk to Support"];

  const initialReplyConfig = {
    mode: payload.initialReplyMode || "WHATSAPP_WITH_LINK",
    greetingText: String(payload.initialReplyText || `Hi! Thanks for messaging ${businessName}. Tap below to continue in our quick interactive chat:`).trim(),
    ctaLabel: String(payload.ctaLabel || "Open Interactive Chat").trim()
  };

  const goalConfig = {
    goalType,
    eventName: goalMeta.eventName,
    notifyEmails: Array.isArray(payload.emailRecipients) ? payload.emailRecipients : [],
    requireTerms: Boolean(payload.requireTerms)
  };

  const created = inappExperienceService.createExperience({
    name: payload.experienceName ? String(payload.experienceName).trim() : `${businessName} Assistant`,
    slug: payload.slug || undefined,
    domain_type: businessType,
    assigned_phone_number_id: payload.phoneNumberId || null,
    entry_screen_key: "welcome",
    theme_json: payload.theme || { primaryColor: payload.primaryColor || "#2F5219" },
    status: payload.publishImmediately ? "PUBLISHED" : "DRAFT"
  }, numericTenantId, actor);

  db.prepare(`
    UPDATE inapp_experiences
    SET studio_mode = 'GUIDED',
        goal_type = ?,
        goal_config_json = ?,
        initial_reply_config_json = ?,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    goalType,
    JSON.stringify(goalConfig),
    JSON.stringify(initialReplyConfig),
    actor,
    created.id,
    numericTenantId
  );

  // Build clean conversational steps driven by the Component Registry
  const welcomeScreen = inappExperienceService.createScreen(created.id, {
    screen_key: "welcome",
    title: businessName,
    subtitle: welcomeMessage,
    screen_type: "HERO_WELCOME",
    config_json: {
      componentType: "single_select",
      outputKey: "selected_option",
      options: quickActions
    },
    navigation_rules_json: {
      defaultNext: goalType === "BOOKING_CONFIRMED" || goalType === "APPOINTMENT_CONFIRMED" ? "schedule_step" : "contact_details"
    }
  }, numericTenantId, actor);

  if (goalType === "BOOKING_CONFIRMED" || goalType === "APPOINTMENT_CONFIRMED") {
    inappExperienceService.createScreen(created.id, {
      screen_key: "schedule_step",
      title: goalType === "BOOKING_CONFIRMED" ? "Select Check-in & Check-out Dates" : "Select Preferred Date",
      subtitle: "Choose dates so we can confirm availability.",
      screen_type: "INFO",
      config_json: {
        componentType: goalType === "BOOKING_CONFIRMED" ? "date_range_picker" : "date_picker"
      },
      navigation_rules_json: { defaultNext: "contact_details" }
    }, numericTenantId, actor);
  }

  const detailsScreen = inappExperienceService.createScreen(created.id, {
    screen_key: "contact_details",
    title: "Your Contact Details",
    subtitle: "So our team can confirm and notify you promptly.",
    screen_type: "DYNAMIC_FORM",
    config_json: { componentType: "requirement_collection" },
    navigation_rules_json: { defaultNext: "confirmation" }
  }, numericTenantId, actor);

  inappExperienceService.createFormField(detailsScreen.id, {
    field_key: "name",
    label: "Full Name",
    input_type: "TEXT",
    placeholder: "Enter your name",
    validation_rules_json: { required: true }
  }, numericTenantId, actor);

  inappExperienceService.createFormField(detailsScreen.id, {
    field_key: "phone",
    label: "WhatsApp / Phone Number",
    input_type: "PHONE",
    placeholder: "+91 98XXXXXXXX",
    validation_rules_json: { required: true }
  }, numericTenantId, actor);

  inappExperienceService.createFormField(detailsScreen.id, {
    field_key: "email",
    label: "Email Address",
    input_type: "EMAIL",
    placeholder: "you@company.com",
    validation_rules_json: { required: false }
  }, numericTenantId, actor);

  inappExperienceService.createScreen(created.id, {
    screen_key: "confirmation",
    title: `${goalMeta.label} Complete`,
    subtitle: `Thank you! ${businessName} has received your request and will notify you shortly.`,
    screen_type: "CONFIRMATION",
    config_json: { componentType: "success_receipt" }
  }, numericTenantId, actor);

  let shareLink = null;
  if (payload.autoCreateShareLink !== false && (payload.phoneNumber || payload.phoneNumberId)) {
    shareLink = generateWhatsAppShareLink(numericTenantId, created.id, {
      phoneNumberId: payload.phoneNumberId,
      phoneNumber: payload.phoneNumber,
      title: `${businessName} WhatsApp Link`,
      prefilledMessage: payload.prefilledMessage || `Hi ${businessName}, I want to ${goalMeta.label.toLowerCase()}`,
      initialReplyText: initialReplyConfig.greetingText,
      baseUrl: payload.baseUrl
    }, actor);
  }

  const full = inappExperienceService.getExperienceById(created.id, numericTenantId);
  return {
    experience: full,
    welcomeScreenId: welcomeScreen.id,
    shareLink
  };
}

/**
 * Generates or updates a WhatsApp Entry Link (`wa.me/...?text=...` + `/c/:slug` + QR SVG)
 * attached cleanly to a Studio experience and configurable initial reply copy.
 */
function generateWhatsAppShareLink(tenantId = 1, experienceId, opts = {}, actor = "studio_user") {
  const numericTenantId = Number(tenantId) || 1;
  const exp = db.prepare(`
    SELECT * FROM inapp_experiences
    WHERE id = ? AND tenant_id = ? AND delete_status = 0
  `).get(experienceId, numericTenantId);

  if (!exp) {
    throw new Error(`Experience #${experienceId} not found in tenant workspace.`);
  }

  const waba = getTenantPhone(numericTenantId, opts.phoneNumberId || exp.assigned_phone_number_id);
  const rawPhone = String(opts.phoneNumber || waba?.phone_number || "919999999999").trim();
  const cleanTo = cleanPhone(rawPhone, "91");
  const prefilled = String(opts.prefilledMessage || `Hi ${exp.name}, I would like to get started`).trim();
  const initialReply = String(
    opts.initialReplyText
    || `Welcome to ${exp.name}! Tap the link below to explore and complete your request:`
  ).trim();

  // Persist initial reply copy onto the experience
  db.prepare(`
    UPDATE inapp_experiences
    SET initial_reply_config_json = ?,
        assigned_phone_number_id = COALESCE(?, assigned_phone_number_id),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(
    JSON.stringify({ greetingText: initialReply, prefilledMessage: prefilled }),
    opts.phoneNumberId || waba?.phone_number_id || null,
    actor,
    exp.id,
    numericTenantId
  );

  // Check if an attached chat_link already exists for this experience
  let linkRow = db.prepare(`
    SELECT * FROM chat_links
    WHERE tenant_id = ? AND experience_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(numericTenantId, exp.id);

  if (!linkRow) {
    const id = crypto.randomUUID();
    const shareSlug = `${slugifyShare(exp.slug)}-${crypto.randomBytes(2).toString("hex")}`;
    db.prepare(`
      INSERT INTO chat_links (
        id, tenant_id, user_id, phone_number_id, phone_number,
        title, slug, default_message, welcome_title, welcome_description,
        auto_reply_enabled, auto_reply_message, experience_id, category, status,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        1, ?, ?, ?, 'ACTIVE',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run(
      id,
      numericTenantId,
      String(actor || "studio"),
      opts.phoneNumberId || waba?.phone_number_id || null,
      cleanTo,
      String(opts.title || `${exp.name} Entry Link`),
      shareSlug,
      prefilled,
      exp.name,
      `WhatsApp entry point for ${exp.name}`,
      initialReply,
      exp.id,
      exp.domain_type || "STUDIO"
    );
    linkRow = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(id);
  } else {
    db.prepare(`
      UPDATE chat_links
      SET phone_number = ?,
          phone_number_id = COALESCE(?, phone_number_id),
          title = ?,
          default_message = ?,
          auto_reply_enabled = 1,
          auto_reply_message = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(
      cleanTo,
      opts.phoneNumberId || waba?.phone_number_id || null,
      String(opts.title || linkRow.title),
      prefilled,
      initialReply,
      linkRow.id,
      numericTenantId
    );
    linkRow = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(linkRow.id);
  }

  const root = resolveBaseUrl(opts.baseUrl);
  const waMeUrl = `https://wa.me/${cleanTo}?text=${encodeURIComponent(prefilled)}`;
  const shortUrl = `${root}/c/${linkRow.slug}`;
  const directChatUrl = `${root}/x/${exp.slug}`;

  return {
    id: linkRow.id,
    experienceId: exp.id,
    experienceSlug: exp.slug,
    slug: linkRow.slug,
    phoneNumber: cleanTo,
    prefilledMessage: prefilled,
    initialReplyText: initialReply,
    waMeUrl,
    shortUrl,
    directChatUrl,
    qrSvg: generateQrSvg(waMeUrl)
  };
}

function listShareLinks(tenantId = 1, { experienceId = null, baseUrl = "" } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const root = resolveBaseUrl(baseUrl);
  let sql = `
    SELECT cl.*, ie.name as experience_name, ie.slug as experience_slug, ie.status as experience_status
    FROM chat_links cl
    LEFT JOIN inapp_experiences ie ON ie.id = cl.experience_id AND ie.delete_status = 0
    WHERE cl.tenant_id = ?
  `;
  const params = [numericTenantId];
  const numericExpId = Number(experienceId);
  if (experienceId && Number.isFinite(numericExpId) && numericExpId > 0) {
    sql += " AND cl.experience_id = ?";
    params.push(numericExpId);
  }
  sql += " ORDER BY cl.created_at DESC LIMIT 100";

  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => {
    const cleanTo = cleanPhone(r.phone_number, "91");
    const waMeUrl = `https://wa.me/${cleanTo}?text=${encodeURIComponent(r.default_message || "")}`;
    return {
      ...r,
      waMeUrl,
      shortUrl: `${root}/c/${r.slug}`,
      directChatUrl: r.experience_slug ? `${root}/x/${r.experience_slug}` : null
    };
  });
}

function listExecutionHistory(tenantId = 1, { experienceId = null, limit = 50 } = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT s.id, s.experience_id, s.session_token, s.visitor_phone, s.visitor_name,
           s.current_screen_key, s.channel_owner, s.goal_status, s.demo_mode,
           s.status, s.last_activity_at, s.created_at,
           e.name as experience_name, e.slug as experience_slug, e.goal_type
    FROM inapp_sessions s
    JOIN inapp_experiences e ON e.id = s.experience_id
    WHERE s.tenant_id = ? AND s.delete_status = 0
  `;
  const params = [numericTenantId];
  const numericExpId = Number(experienceId);
  if (experienceId && Number.isFinite(numericExpId) && numericExpId > 0) {
    sql += " AND s.experience_id = ?";
    params.push(numericExpId);
  }
  sql += " ORDER BY s.id DESC LIMIT ?";
  params.push(Math.max(1, Math.min(200, Number(limit) || 50)));

  return db.prepare(sql).all(...params).map((row) => ({
    ...row,
    // Mask session token before returning to admin history views
    sessionTokenMasked: row.session_token ? `${String(row.session_token).slice(0, 10)}***` : null,
    session_token: undefined
  }));
}

function getStudioOverview(tenantId = 1) {
  const numericTenantId = Number(tenantId) || 1;
  const expStats = db.prepare(`
    SELECT
      COUNT(*) as total_experiences,
      SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) as published_experiences,
      SUM(CASE WHEN studio_mode = 'GUIDED' THEN 1 ELSE 0 END) as guided_experiences
    FROM inapp_experiences
    WHERE tenant_id = ? AND delete_status = 0
  `).get(numericTenantId) || {};

  const sessStats = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(CASE WHEN demo_mode = 1 THEN 1 ELSE 0 END) as demo_sessions,
      SUM(CASE WHEN goal_status = 'COMPLETED' AND demo_mode = 0 THEN 1 ELSE 0 END) as completed_goals
    FROM inapp_sessions
    WHERE tenant_id = ? AND delete_status = 0
  `).get(numericTenantId) || {};

  const linkStats = db.prepare(`
    SELECT
      COUNT(*) as total_links,
      COALESCE(SUM(clicks_count), 0) as total_clicks,
      COALESCE(SUM(conversations_count), 0) as total_conversations
    FROM chat_links
    WHERE tenant_id = ?
  `).get(numericTenantId) || {};

  return {
    totalExperiences: Number(expStats.total_experiences || 0),
    publishedExperiences: Number(expStats.published_experiences || 0),
    guidedExperiences: Number(expStats.guided_experiences || 0),
    totalSessions: Number(sessStats.total_sessions || 0),
    demoSessions: Number(sessStats.demo_sessions || 0),
    completedGoals: Number(sessStats.completed_goals || 0),
    shareLinksCount: Number(linkStats.total_links || 0),
    totalLinkClicks: Number(linkStats.total_clicks || 0),
    totalConversations: Number(linkStats.total_conversations || 0),
    goalPresets: Object.entries(BUSINESS_GOAL_PRESETS).map(([key, v]) => ({ key, ...v })),
    registeredComponentsCount: getRegisteredComponents().length
  };
}

module.exports = {
  BUSINESS_GOAL_PRESETS,
  getStudioOverview,
  createGuidedExperience,
  generateWhatsAppShareLink,
  listShareLinks,
  listExecutionHistory,
  getComponentsCatalog: () => getRegisteredComponents()
};
