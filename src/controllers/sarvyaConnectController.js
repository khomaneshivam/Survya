const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const metaWhatsAppService = require("../services/metaWhatsAppService");
const broadcastController = require("./broadcastController");
const templateController = require("./templateController");
const messagingService = require("../services/whatsappMessagingService");

/**
 * Normalizes a SQLite template row for API responses
 */
function serializeTemplate(row) {
  if (!row) return null;
  let components = [];
  let variables = [];
  let buttons = [];
  try { components = row.components ? JSON.parse(row.components) : []; } catch (e) {}
  try { variables = row.variables ? JSON.parse(row.variables) : []; } catch (e) {}
  try { buttons = row.buttons ? JSON.parse(row.buttons) : []; } catch (e) {}

  return {
    id: row.id,
    name: row.name,
    meta_id: row.meta_id || null,
    language: row.language || "en_US",
    category: String(row.category || "MARKETING").toUpperCase(),
    status: String(row.status || "DRAFT").toUpperCase(),
    parameter_format: row.parameter_format || "POSITIONAL",
    headerType: row.header_type || "NONE",
    headerText: row.header_text || "",
    headerMediaUrl: row.header_media_url || "",
    bodyText: row.body_text || "",
    footerText: row.footer_text || "",
    rejectionReason: row.rejection_reason || null,
    version: row.version || 1,
    variables,
    components,
    buttons,
    submittedAt: row.submitted_at || null,
    approvedAt: row.approved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Computes template breakdown summary across all statuses
 */
function getTemplateStatusSummary(user = null) {
  let query = "SELECT UPPER(COALESCE(status, 'DRAFT')) as status, COUNT(*) as count FROM templates";
  const params = [];
  if (user && user.role !== "ADMIN") {
    query += " WHERE (status != 'DRAFT' OR user_id = ? OR user_id IS NULL)";
    params.push(user.id);
  }
  query += " GROUP BY UPPER(COALESCE(status, 'DRAFT'))";
  const rows = db.prepare(query).all(...params);
  const counts = {
    total: 0,
    approved: 0,
    pending: 0,
    draft: 0,
    rejected: 0,
    paused: 0,
    other: 0
  };

  for (const r of rows) {
    const st = String(r.status || "").toUpperCase();
    const n = Number(r.count || 0);
    counts.total += n;
    if (st === "APPROVED") counts.approved += n;
    else if (st === "PENDING" || st === "IN_REVIEW") counts.pending += n;
    else if (st === "DRAFT") {
      counts.draft += n;
      counts.other += n;
    } else if (st === "REJECTED") {
      counts.rejected += n;
      counts.other += n;
    } else if (st === "PAUSED") {
      counts.paused += n;
      counts.other += n;
    } else {
      counts.other += n;
    }
  }
  return counts;
}

/**
 * POST /api/v1/channels/whatsapp/connect
 * Registers or updates a WhatsApp Business sender account once for the workspace.
 */
async function connectWhatsAppAccount(req, res) {
  try {
    const {
      displayName,
      phoneNumber,
      phoneNumberId,
      wabaId,
      accessToken,
      appSecret,
      isDefault
    } = req.body || {};

    if (!displayName || !String(displayName).trim()) {
      return res.status(400).json({ success: false, message: "Business display name is required." });
    }
    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, message: "Registered WhatsApp phone number is required." });
    }
    if (!phoneNumberId || !String(phoneNumberId).trim()) {
      return res.status(400).json({ success: false, message: "Meta Phone Number ID is required." });
    }

    const cleanDisplay = String(displayName).trim();
    const cleanPhone = String(phoneNumber).trim();
    const cleanPhoneId = String(phoneNumberId).trim();
    const cleanWabaId = wabaId ? String(wabaId).trim() : null;

    // Persist global credentials if Admin supplies them during initial channel setup
    if (accessToken && String(accessToken).trim() && !String(accessToken).includes("••••")) {
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Only Administrators can update the Meta access token." });
      }
      setSetting("WHATSAPP_API_TOKEN", String(accessToken).trim());
    }
    if (appSecret && String(appSecret).trim() && !String(appSecret).includes("••••")) {
      if (req.user?.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Only Administrators can update the Meta App Secret." });
      }
      setSetting("META_APP_SECRET", String(appSecret).trim());
    }
    if (cleanWabaId) {
      setSetting("WHATSAPP_BUSINESS_ACCOUNT_ID", cleanWabaId);
    }

    // Attempt live verification if token exists
    let qualityRating = "GREEN";
    let accountStatus = "ACTIVE";
    const activeToken = (accessToken && !String(accessToken).includes("••••") ? String(accessToken).trim() : null)
      || getSetting("WHATSAPP_API_TOKEN")
      || config.WHATSAPP_API_TOKEN;

    if (activeToken) {
      try {
        const metaInfo = await metaWhatsAppService.testConnection({
          token: activeToken,
          phoneNumberId: cleanPhoneId
        });
        if (metaInfo?.qualityRating) qualityRating = metaInfo.qualityRating;
        if (metaInfo?.status) accountStatus = String(metaInfo.status).toUpperCase();
      } catch (verifyErr) {
        // Store account metadata cleanly while noting verification status
        accountStatus = "PENDING_VERIFICATION";
      }
    }

    const existing = db.prepare("SELECT id, is_default FROM waba_phone_numbers WHERE phone_number_id = ?").get(cleanPhoneId);
    const totalCount = db.prepare("SELECT COUNT(*) as count FROM waba_phone_numbers").get()?.count || 0;
    const makeDefault = Boolean(isDefault) || totalCount === 0 || Boolean(existing?.is_default);

    if (makeDefault) {
      db.prepare("UPDATE waba_phone_numbers SET is_default = 0").run();
      setSetting("WHATSAPP_PHONE_NUMBER_ID", cleanPhoneId);
    }

    let accountId;
    if (existing) {
      accountId = existing.id;
      db.prepare(`
        UPDATE waba_phone_numbers
        SET display_name = ?,
            phone_number = ?,
            waba_id = COALESCE(?, waba_id),
            quality_rating = ?,
            status = ?,
            is_default = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cleanDisplay, cleanPhone, cleanWabaId, qualityRating, accountStatus, makeDefault ? 1 : 0, accountId);
    } else {
      accountId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO waba_phone_numbers (
          id, display_name, phone_number, phone_number_id, waba_id,
          quality_rating, status, is_default, registered_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        accountId,
        cleanDisplay,
        cleanPhone,
        cleanPhoneId,
        cleanWabaId,
        qualityRating,
        accountStatus,
        makeDefault ? 1 : 0,
        req.user?.id || null
      );
    }

    const account = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(accountId);
    return res.status(existing ? 200 : 201).json({
      success: true,
      message: `Connected sender account '${cleanDisplay}' (${cleanPhone}).`,
      account,
      data: account
    });
  } catch (error) {
    console.error("[SARVYA Connect] connectWhatsAppAccount error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/channels/whatsapp/accounts
 * Returns connected sender accounts, active sender card, template counts, and sent volume.
 */
async function listWhatsAppAccounts(req, res) {
  try {
    const accounts = db.prepare(`
      SELECT
        p.*,
        (SELECT COUNT(*) FROM campaigns c WHERE c.phone_number_id = p.phone_number_id OR c.phone_number_id = p.id) as campaigns_count,
        (SELECT COUNT(*) FROM whatsapp_messages m WHERE m.phone_number_id = p.phone_number_id) as direct_messages_count
      FROM waba_phone_numbers p
      ORDER BY p.is_default DESC, p.created_at DESC
    `).all();

    const activeAccount = accounts.find(a => a.is_default === 1) || accounts[0] || null;
    const templateSummary = getTemplateStatusSummary(req.user);

    const isNonAdmin = req.user && req.user.role !== "ADMIN";
    const campSent = isNonAdmin
      ? (db.prepare("SELECT COALESCE(SUM(sent_count), 0) as total FROM campaigns WHERE user_id = ?").get(req.user.id)?.total || 0)
      : (db.prepare("SELECT COALESCE(SUM(sent_count), 0) as total FROM campaigns").get()?.total || 0);
    const directSent = isNonAdmin
      ? (db.prepare("SELECT COUNT(*) as total FROM whatsapp_messages WHERE direction = 'OUTBOUND' AND user_id = ?").get(req.user.id)?.total || 0)
      : (db.prepare("SELECT COUNT(*) as total FROM whatsapp_messages WHERE direction = 'OUTBOUND'").get()?.total || 0);
    const totalMessagesSent = Number(campSent) + Number(directSent);

    const hasToken = Boolean(getSetting("WHATSAPP_API_TOKEN") || config.WHATSAPP_API_TOKEN);
    const wabaId = metaWhatsAppService.resolveWabaId();

    return res.status(200).json({
      success: true,
      connected: Boolean(activeAccount || (hasToken && (getSetting("WHATSAPP_PHONE_NUMBER_ID") || config.WHATSAPP_PHONE_NUMBER_ID))),
      hasToken,
      wabaId,
      activeAccount,
      accounts,
      data: accounts,
      summary: {
        templates: templateSummary,
        messagesSent: totalMessagesSent,
        campaignsSent: Number(campSent),
        oneToOneSent: Number(directSent)
      }
    });
  } catch (error) {
    console.error("[SARVYA Connect] listWhatsAppAccounts error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/whatsapp/templates
 * Creates a new local DRAFT template ready for Visual Builder editing & Meta submission.
 */
async function createCustomTemplate(req, res) {
  try {
    const {
      name,
      category = "MARKETING",
      language = "en_US",
      headerType = "NONE",
      headerText = "",
      headerMediaUrl = "",
      bodyText = "",
      footerText = "",
      buttons = [],
      samples = {}
    } = req.body || {};

    const cleanName = String(name || "").trim().toLowerCase();
    if (!cleanName || !messagingService.TEMPLATE_NAME_REGEX.test(cleanName)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TEMPLATE_NAME",
        message: "Template name must contain only lowercase letters, numbers, and underscores (e.g. 'weekend_resort_offer')."
      });
    }

    const cleanCategory = String(category || "MARKETING").toUpperCase();
    if (!messagingService.ALLOWED_CATEGORIES.has(cleanCategory)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TEMPLATE_CATEGORY",
        message: "Category must be MARKETING, UTILITY, or AUTHENTICATION."
      });
    }

    const duplicate = db.prepare("SELECT id, name, language FROM templates WHERE name = ? AND language = ? LIMIT 1").get(cleanName, language || "en_US");
    if (duplicate) {
      return res.status(409).json({
        success: false,
        code: "TEMPLATE_ALREADY_EXISTS",
        message: `Template '${cleanName}' for language '${language || "en_US"}' already exists.`
      });
    }

    const built = messagingService.buildTemplateComponentsPayload({
      headerType,
      headerText,
      headerMediaUrl,
      bodyText,
      footerText,
      buttons,
      samples
    });

    const id = `tpl_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO templates (
        id, name, meta_id, language, category, status, parameter_format,
        body_text, variables, components, buttons,
        header_type, header_text, header_media_url, footer_text,
        version, user_id, tenant_id, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      cleanName,
      language || "en_US",
      cleanCategory,
      built.parameterFormat,
      String(bodyText).trim(),
      JSON.stringify(built.variables),
      JSON.stringify(built.components),
      JSON.stringify(built.buttons),
      built.headerType,
      built.headerText,
      built.headerMediaUrl,
      built.footerText,
      req.user?.id || null
    );

    metaWhatsAppService.clearTemplateCache();
    const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id);
    const formatted = serializeTemplate(row);

    return res.status(201).json({
      success: true,
      message: `Template draft '${cleanName}' saved.`,
      template: formatted,
      data: formatted
    });
  } catch (error) {
    console.error("[SARVYA Connect] createCustomTemplate error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "TEMPLATE_CREATE_ERROR",
      message: error.message
    });
  }
}

/**
 * PUT /api/v1/whatsapp/templates/:id
 * Edits a DRAFT or REJECTED template. Blocks direct mutation on APPROVED or PENDING templates.
 */
async function updateCustomTemplate(req, res) {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM templates WHERE id = ? OR meta_id = ? LIMIT 1").get(id, id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Template not found." });
    }

    const currentStatus = String(row.status || "DRAFT").toUpperCase();
    if (currentStatus === "APPROVED" || currentStatus === "PENDING" || currentStatus === "IN_REVIEW") {
      return res.status(409).json({
        success: false,
        code: "TEMPLATE_LOCKED",
        message: `Templates in '${currentStatus}' status cannot be edited directly. Clone this template into a new Draft to make changes.`
      });
    }

    const {
      name,
      category,
      language,
      headerType,
      headerText,
      headerMediaUrl,
      bodyText,
      footerText,
      buttons,
      samples
    } = req.body || {};

    const nextName = name !== undefined ? String(name).trim().toLowerCase() : row.name;
    if (!messagingService.TEMPLATE_NAME_REGEX.test(nextName)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TEMPLATE_NAME",
        message: "Template name must contain only lowercase letters, numbers, and underscores."
      });
    }

    const nextCategory = String(category || row.category || "MARKETING").toUpperCase();
    if (!messagingService.ALLOWED_CATEGORIES.has(nextCategory)) {
      return res.status(400).json({ success: false, message: "Invalid template category." });
    }

    let existingButtons = [];
    try { existingButtons = row.buttons ? JSON.parse(row.buttons) : []; } catch (e) {}

    const built = messagingService.buildTemplateComponentsPayload({
      headerType: headerType !== undefined ? headerType : (row.header_type || "NONE"),
      headerText: headerText !== undefined ? headerText : (row.header_text || ""),
      headerMediaUrl: headerMediaUrl !== undefined ? headerMediaUrl : (row.header_media_url || ""),
      bodyText: bodyText !== undefined ? bodyText : row.body_text,
      footerText: footerText !== undefined ? footerText : (row.footer_text || ""),
      buttons: buttons !== undefined ? buttons : existingButtons,
      samples: samples || {}
    });

    db.prepare(`
      UPDATE templates
      SET name = ?,
          language = ?,
          category = ?,
          status = 'DRAFT',
          parameter_format = ?,
          body_text = ?,
          variables = ?,
          components = ?,
          buttons = ?,
          header_type = ?,
          header_text = ?,
          header_media_url = ?,
          footer_text = ?,
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextName,
      language || row.language || "en_US",
      nextCategory,
      built.parameterFormat,
      bodyText !== undefined ? String(bodyText).trim() : row.body_text,
      JSON.stringify(built.variables),
      JSON.stringify(built.components),
      JSON.stringify(built.buttons),
      built.headerType,
      built.headerText,
      built.headerMediaUrl,
      built.footerText,
      row.id
    );

    metaWhatsAppService.clearTemplateCache();
    const updated = db.prepare("SELECT * FROM templates WHERE id = ?").get(row.id);
    const formatted = serializeTemplate(updated);

    return res.status(200).json({
      success: true,
      message: `Template '${formatted.name}' updated.`,
      template: formatted,
      data: formatted
    });
  } catch (error) {
    console.error("[SARVYA Connect] updateCustomTemplate error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/whatsapp/templates/:id/clone
 * Clones any template (e.g. APPROVED) into a new editable DRAFT version.
 */
async function cloneCustomTemplate(req, res) {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM templates WHERE id = ? OR meta_id = ? LIMIT 1").get(id, id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Template not found." });
    }

    const baseName = row.name.replace(/_v\d+$/, "");
    const nextVersion = Number(row.version || 1) + 1;
    let candidateName = `${baseName}_v${nextVersion}`;
    while (db.prepare("SELECT id FROM templates WHERE name = ? AND language = ?").get(candidateName, row.language)) {
      candidateName = `${baseName}_v${Math.floor(100 + Math.random() * 899)}`;
    }

    const newId = `tpl_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO templates (
        id, name, meta_id, language, category, status, parameter_format,
        body_text, variables, components, buttons,
        header_type, header_text, header_media_url, footer_text,
        version, user_id, tenant_id, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      newId,
      candidateName,
      row.language,
      row.category,
      row.parameter_format,
      row.body_text,
      row.variables,
      row.components,
      row.buttons,
      row.header_type || "NONE",
      row.header_text,
      row.header_media_url,
      row.footer_text,
      nextVersion,
      req.user?.id || row.user_id || null
    );

    const cloned = serializeTemplate(db.prepare("SELECT * FROM templates WHERE id = ?").get(newId));
    return res.status(201).json({
      success: true,
      message: `Cloned '${row.name}' into editable draft '${candidateName}'.`,
      template: cloned,
      data: cloned
    });
  } catch (error) {
    console.error("[SARVYA Connect] cloneCustomTemplate error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/whatsapp/templates/:id/submit
 * Validates variable sample values and submits a draft template to Meta Graph API for approval.
 */
async function submitTemplateToMeta(req, res) {
  try {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM templates WHERE id = ? OR meta_id = ? LIMIT 1").get(id, id);
    if (!row) {
      return res.status(404).json({ success: false, message: "Template not found." });
    }

    const currentStatus = String(row.status || "DRAFT").toUpperCase();
    if (currentStatus === "APPROVED" || currentStatus === "PENDING") {
      return res.status(409).json({
        success: false,
        message: `Template is already in '${currentStatus}' state.`
      });
    }

    let variables = [];
    let components = [];
    try { variables = row.variables ? JSON.parse(row.variables) : []; } catch (e) {}
    try { components = row.components ? JSON.parse(row.components) : []; } catch (e) {}

    // Ensure every body placeholder has a sample value before submitting to Meta
    const missingSamples = variables.filter(v => !v.example || !String(v.example).trim());
    if (missingSamples.length > 0) {
      return res.status(400).json({
        success: false,
        code: "MISSING_TEMPLATE_SAMPLES",
        message: `Provide sample values for all template variables before submitting to Meta (${missingSamples.map(v => v.label).join(", ")}).`
      });
    }

    const wabaId = req.body?.wabaId || metaWhatsAppService.resolveWabaId();
    const metaResult = await metaWhatsAppService.createWabaTemplate({
      name: row.name,
      category: row.category,
      language: row.language || "en_US",
      components,
      parameterFormat: row.parameter_format || "POSITIONAL",
      wabaId
    });

    const newStatus = String(metaResult.status || "PENDING").toUpperCase();
    const metaTplId = metaResult.id ? String(metaResult.id) : row.meta_id;

    db.prepare(`
      UPDATE templates
      SET meta_id = ?,
          status = ?,
          rejection_reason = NULL,
          submitted_at = CURRENT_TIMESTAMP,
          approved_at = CASE WHEN ? = 'APPROVED' THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(metaTplId, newStatus, newStatus, row.id);

    metaWhatsAppService.clearTemplateCache();
    const updated = serializeTemplate(db.prepare("SELECT * FROM templates WHERE id = ?").get(row.id));

    return res.status(200).json({
      success: true,
      message: `Template '${row.name}' submitted to Meta for approval (status: ${newStatus}).`,
      template: updated,
      data: updated
    });
  } catch (error) {
    console.error("[SARVYA Connect] submitTemplateToMeta error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "META_TEMPLATE_SUBMIT_ERROR",
      message: error.message
    });
  }
}

/**
 * GET /api/v1/whatsapp/templates
 * Lists custom & synced templates along with category/status summary counters.
 */
async function listCustomTemplates(req, res) {
  try {
    if (String(req.query?.sync || "").toLowerCase() === "true") {
      try {
        await templateController.syncTemplatesFromMeta(req, {
          status() { return this; },
          json() { return null; }
        });
      } catch (syncErr) {}
    }

    const statusParam = String(req.query?.status || "ALL").trim().toUpperCase();
    const categoryParam = String(req.query?.category || "ALL").trim().toUpperCase();
    const searchParam = String(req.query?.search || req.query?.q || "").trim();

    let sql = "SELECT * FROM templates WHERE 1=1";
    const params = [];

    if (req.user?.role !== "ADMIN") {
      sql += " AND (status != 'DRAFT' OR user_id = ? OR user_id IS NULL)";
      params.push(req.user.id);
    }

    if (statusParam && statusParam !== "ALL") {
      sql += " AND UPPER(COALESCE(status, 'DRAFT')) = ?";
      params.push(statusParam);
    }
    if (categoryParam && categoryParam !== "ALL") {
      sql += " AND UPPER(COALESCE(category, 'MARKETING')) = ?";
      params.push(categoryParam);
    }
    if (searchParam) {
      sql += " AND (name LIKE ? OR body_text LIKE ? OR meta_id LIKE ?)";
      const pattern = `%${searchParam}%`;
      params.push(pattern, pattern, pattern);
    }

    sql += " ORDER BY updated_at DESC, created_at DESC";
    const rows = db.prepare(sql).all(...params);
    const templates = rows.map(serializeTemplate);
    const summary = getTemplateStatusSummary(req.user);

    return res.status(200).json({
      success: true,
      summary,
      templates,
      data: templates
    });
  } catch (error) {
    console.error("[SARVYA Connect] listCustomTemplates error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/whatsapp/contacts/eligibility?phone=...
 * Evaluates 24-hour customer-service window and opt-out status for a contact.
 */
async function checkContactEligibility(req, res) {
  try {
    const phone = req.query?.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone query parameter is required." });
    }
    const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
    const cleanTo = metaWhatsAppService.cleanPhone(phone, defaultCountry);
    const optOut = messagingService.isPhoneOptedOut(cleanTo);
    const window = messagingService.check24HourCustomerServiceWindow(cleanTo);

    return res.status(200).json({
      success: true,
      phone: cleanTo,
      optedOut: optOut.optedOut,
      optOutReason: optOut.reason,
      window,
      canSendFreeForm: !optOut.optedOut && window.isOpen,
      requiresApprovedTemplate: !window.isOpen
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/v1/whatsapp/messages/send
 * Dispatches a 1-to-1 WhatsApp message while enforcing opt-out, 24h window, and approved-template rules.
 */
async function sendOneToOneMessage(req, res) {
  try {
    const {
      to,
      phone,
      type,
      text,
      message,
      mediaUrl,
      mediaId,
      mediaType,
      templateId,
      templateName,
      templateLanguage,
      variables,
      components,
      headerMediaUrl,
      phoneNumberId,
      flowActionData
    } = req.body || {};

    const result = await messagingService.sendOneToOneMessage({
      to: to || phone,
      type: type || ((templateId || templateName) ? "TEMPLATE" : (mediaUrl || mediaId ? "MEDIA" : "TEXT")),
      text: text !== undefined ? text : message,
      mediaUrl,
      mediaId,
      mediaType,
      templateIdOrName: templateId || templateName,
      templateLanguage,
      variables,
      components,
      headerMediaUrl,
      phoneNumberId,
      userId: req.user?.id || "system",
      tenantId: req.user?.tenant_id || 1,
      flowActionData
    });

    return res.status(200).json({
      success: true,
      message: "WhatsApp message sent successfully.",
      data: result,
      result
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      code: error.code || "WHATSAPP_SEND_ERROR",
      message: error.message,
      window: error.window || undefined
    });
  }
}

/**
 * POST /api/v1/whatsapp/campaigns
 * Creates a WhatsApp broadcast campaign with audience hygiene & Meta category cost estimation.
 */
async function createCampaignV1(req, res) {
  const payload = { ...(req.body || {}) };
  if (!payload.contacts && Array.isArray(payload.contactIds) && payload.contactIds.length > 0) {
    const placeholders = payload.contactIds.map(() => "?").join(",");
    const rows = db.prepare(`SELECT id, phone_e164 as phone, name FROM contacts WHERE id IN (${placeholders})`).all(...payload.contactIds);
    payload.contacts = rows.map(r => ({ phone: r.phone, name: r.name || "Customer" }));
  }

  // Determine template category rate accurately if templateName / templateId given
  if (!payload.templateName && payload.templateId) {
    const tpl = db.prepare("SELECT name, language, category FROM templates WHERE id = ? OR meta_id = ? LIMIT 1").get(payload.templateId, payload.templateId);
    if (tpl) {
      payload.templateName = tpl.name;
      payload.templateLanguage = payload.templateLanguage || tpl.language;
    } else {
      payload.templateName = payload.templateId;
    }
  }

  req.body = payload;
  return broadcastController.createCampaign(req, res);
}

/**
 * POST /api/v1/whatsapp/campaigns/:id/launch
 * Validates template APPROVED status, filters opted-out contacts, records estimated cost ledger, and starts dispatch.
 */
async function launchCampaignV1(req, res) {
  try {
    const { id } = req.params;
    const rawDelay = req.body?.delayMs;
    const parsedDelay = rawDelay !== undefined && rawDelay !== null && String(rawDelay).trim() !== ""
      ? Math.min(Math.max(parseInt(rawDelay, 10), 50), 10000)
      : null;

    const launchInfo = await messagingService.validateAndLaunchCampaign(id, req.user, parsedDelay);
    return res.status(200).json({
      success: true,
      message: `Campaign '${id}' launched (${launchInfo.deliverableCount} deliverable recipients, estimated cost ₹${launchInfo.estimatedCost}).`,
      data: launchInfo,
      launch: launchInfo
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || "CAMPAIGN_LAUNCH_ERROR",
      message: error.message
    });
  }
}

/**
 * GET /api/v1/whatsapp/messages/:id
 * Unified lookup for message status by local ID or Meta wamid across 1-to-1 & campaigns.
 */
async function getMessageStatusById(req, res) {
  try {
    const { id } = req.params;
    const waMsg = db.prepare(`
      SELECT * FROM whatsapp_messages
      WHERE id = ? OR meta_message_id = ?
      LIMIT 1
    `).get(id, id);

    if (waMsg) {
      return res.status(200).json({
        success: true,
        source: "direct",
        data: waMsg,
        messageRecord: waMsg
      });
    }

    const campRecip = db.prepare(`
      SELECT r.*, c.name as campaign_name, c.template_name, c.template_language
      FROM campaign_recipients r
      LEFT JOIN campaigns c ON c.id = r.campaign_id
      WHERE CAST(r.id AS TEXT) = ? OR r.meta_message_id = ?
      LIMIT 1
    `).get(id, id);

    if (campRecip) {
      return res.status(200).json({
        success: true,
        source: "campaign",
        data: campRecip,
        messageRecord: campRecip
      });
    }

    return res.status(404).json({
      success: false,
      message: `Message '${id}' not found.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/v1/whatsapp/usage
 * Returns usage counts, spend estimates by Meta category, configured unit rates, and ledger history.
 */
async function getUsageAndBilling(req, res) {
  try {
    const isNonAdmin = req.user && req.user.role !== "ADMIN";
    const userFilterClause = isNonAdmin ? " WHERE user_id = ?" : "";
    const userParams = isNonAdmin ? [req.user.id] : [];

    const byCategory = db.prepare(`
      SELECT
        UPPER(COALESCE(category, 'MARKETING')) as category,
        COUNT(*) as count,
        COALESCE(SUM(unit_cost), 0) as total_cost
      FROM whatsapp_usage_ledger
      ${userFilterClause}
      GROUP BY UPPER(COALESCE(category, 'MARKETING'))
    `).all(...userParams);

    const ledger = db.prepare(`
      SELECT * FROM whatsapp_usage_ledger
      ${userFilterClause}
      ORDER BY created_at DESC, id DESC
      LIMIT 50
    `).all(...userParams);

    const recentMessages = db.prepare(`
      SELECT id, recipient_phone, message_type, template_name, template_category, status, meta_message_id, estimated_cost, currency, created_at, delivered_at, read_at
      FROM whatsapp_messages
      ${userFilterClause}
      ORDER BY created_at DESC
      LIMIT 30
    `).all(...userParams);

    const rates = {
      MARKETING: messagingService.getCategoryUnitRate("MARKETING"),
      UTILITY: messagingService.getCategoryUnitRate("UTILITY"),
      AUTHENTICATION: messagingService.getCategoryUnitRate("AUTHENTICATION"),
      SERVICE: 0
    };

    const totals = byCategory.reduce((acc, row) => {
      acc.messages += Number(row.count || 0);
      acc.estimatedSpend += Number(row.total_cost || 0);
      return acc;
    }, { messages: 0, estimatedSpend: 0 });
    totals.estimatedSpend = parseFloat(totals.estimatedSpend.toFixed(2));

    return res.status(200).json({
      success: true,
      currency: "INR",
      rates,
      totals,
      byCategory,
      ledger,
      recentMessages
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  connectWhatsAppAccount,
  listWhatsAppAccounts,
  createCustomTemplate,
  updateCustomTemplate,
  cloneCustomTemplate,
  submitTemplateToMeta,
  listCustomTemplates,
  checkContactEligibility,
  sendOneToOneMessage,
  createCampaignV1,
  launchCampaignV1,
  getMessageStatusById,
  getUsageAndBilling
};

