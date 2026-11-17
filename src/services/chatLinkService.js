const crypto = require("crypto");
const { db, getSetting } = require("../config/database");
const config = require("../config/env");
const { cleanPhone } = require("./metaWhatsAppService");
const broadcastEngine = require("./broadcastEngine");
const { generateQrSvg } = require("../utils/qrCodeUtil");

let hospitalityChatService = null;
try {
  hospitalityChatService = require("./hospitalityChatService");
} catch (e) {}

let hospitalityFlowEngine = null;
try {
  hospitalityFlowEngine = require("./hospitalityFlowEngine");
} catch (e) {}

const SLUG_REGEX = /^[a-z0-9-]{2,64}$/;

/**
 * Normalizes title into URL-safe slug
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Interpolates {{param}} placeholders in default message with query parameters.
 * Cleans out unpopulated {{variables}} and awkward prepositions so WhatsApp links are natural and unbroken.
 */
function interpolateMessage(messageTemplate, queryParams = {}) {
  if (!messageTemplate) return "";
  let result = String(messageTemplate);

  const hasParams = queryParams && typeof queryParams === "object" && Object.keys(queryParams).length > 0;
  if (hasParams) {
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null && String(v).trim()) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), String(v).trim());
      }
    }
  }

  // Remove unfilled {{optional}} placeholders cleanly
  result = result
    .replace(/\s+for\s+\{\{date\}\}/gi, "")
    .replace(/\s+for\s+\{\{guests\}\}\s+guests/gi, "")
    .replace(/\s+for\s+\{\{guests\}\}/gi, "")
    .replace(/\{\{[a-zA-Z0-9_-]+\}\}/g, "")
    .replace(/\bfor\s+for\b/gi, "for")
    .replace(/\s{2,}/g, " ")
    .trim();

  result = result.replace(/\s+for\s*([.?!,]|$)/gi, "$1").trim();
  result = result.replace(/,\s*\./g, ".").replace(/\s+([.?,!])/g, "$1").trim();
  return result;
}

/**
 * Builds formatted link URLs and embed code snippets
 */
function formatLinkUrls(link, baseUrl = "", queryParams = {}) {
  let root = baseUrl || config.PUBLIC_APP_URL || "";
  if (!root) {
    root = `http://localhost:${config.PORT || 5000}`;
  }
  root = root.replace(/\/+$/, "");
  const shortUrl = `${root}/c/${link.slug}`;
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = cleanPhone(link.phone_number, defaultCountry);
  const cleanMessage = interpolateMessage(link.default_message || "", queryParams);
  const waMeUrl = `https://wa.me/${cleanTo}?text=${encodeURIComponent(cleanMessage)}`;

  const embedHtml = `<a href="${shortUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#ffffff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;font-family:sans-serif;">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/></svg>
  <span>${link.title || "Chat on WhatsApp"}</span>
</a>`;

  return { shortUrl, waMeUrl, embedHtml, cleanMessage };
}

/**
 * Lists all chat links for a tenant with performance metrics and user-account scoping
 */
function listLinks({
  tenantId = 1,
  userId = null,
  isAdmin = false,
  status = "ALL",
  category = "ALL",
  search = "",
  limit = 50,
  offset = 0,
  baseUrl = ""
} = {}) {
  let sql = `
    SELECT cl.*, u.name as creator_name, u.email as creator_email
    FROM chat_links cl
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE cl.tenant_id = ?
  `;
  const params = [tenantId];

  // Account isolation: non-admins only see links belonging to their user account
  if (!isAdmin && userId) {
    sql += ` AND cl.user_id = ?`;
    params.push(userId);
  } else if (isAdmin && userId) {
    // Admin optionally filtering by account
    sql += ` AND cl.user_id = ?`;
    params.push(userId);
  }

  if (status && status !== "ALL") {
    sql += ` AND UPPER(cl.status) = ?`;
    params.push(status.toUpperCase());
  }
  if (category && category !== "ALL") {
    sql += ` AND UPPER(cl.category) = ?`;
    params.push(category.toUpperCase());
  }
  if (search && search.trim()) {
    sql += ` AND (cl.title LIKE ? OR cl.slug LIKE ? OR cl.default_message LIKE ? OR cl.phone_number LIKE ?)`;
    const pat = `%${search.trim()}%`;
    params.push(pat, pat, pat, pat);
  }

  sql += ` ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`;
  params.push(Math.min(parseInt(limit, 10) || 50, 100), Math.max(parseInt(offset, 10) || 0, 0));

  const rows = db.prepare(sql).all(...params);

  // Summary KPIs: strictly scoped to the user account if not admin or if user filter applied
  let kpiSql = `
    SELECT
      COUNT(*) as total_links,
      SUM(CASE WHEN UPPER(status) = 'ACTIVE' THEN 1 ELSE 0 END) as active_links,
      COALESCE(SUM(clicks_count), 0) as total_clicks,
      COALESCE(SUM(conversations_count), 0) as total_conversations
    FROM chat_links
    WHERE tenant_id = ?
  `;
  const kpiParams = [tenantId];
  if (!isAdmin && userId) {
    kpiSql += ` AND user_id = ?`;
    kpiParams.push(userId);
  } else if (isAdmin && userId) {
    kpiSql += ` AND user_id = ?`;
    kpiParams.push(userId);
  }

  const summary = db.prepare(kpiSql).get(...kpiParams);

  const totalClicks = Number(summary?.total_clicks || 0);
  const totalConvos = Number(summary?.total_conversations || 0);
  const conversionRate = totalClicks > 0 ? parseFloat(((totalConvos / totalClicks) * 100).toFixed(1)) : 0.0;

  const links = rows.map(r => {
    const urls = formatLinkUrls(r, baseUrl);
    return {
      ...r,
      auto_reply_enabled: Boolean(r.auto_reply_enabled),
      urls,
      shortUrl: urls.shortUrl,
      waMeUrl: urls.waMeUrl,
      embedHtml: urls.embedHtml
    };
  });

  return {
    summary: {
      totalLinks: Number(summary?.total_links || 0),
      total: Number(summary?.total_links || 0),
      activeLinks: Number(summary?.active_links || 0),
      active: Number(summary?.active_links || 0),
      totalClicks,
      totalConversations: totalConvos,
      conversionRate
    },
    links
  };
}

/**
 * Creates a new chat link
 */
function createLink({
  tenantId = 1,
  userId = "system",
  title,
  slug,
  phoneNumber,
  phoneNumberId,
  defaultMessage,
  welcomeTitle,
  welcomeDescription,
  autoReplyEnabled = 1,
  autoReplyMessage,
  flowId = null,
  category = "GENERAL",
  customFields = null,
  custom_fields = null,
  baseUrl = ""
}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    const err = new Error("Link Title is required.");
    err.statusCode = 400;
    throw err;
  }

  let finalSlug = slugify(slug || cleanTitle);
  if (!finalSlug || !SLUG_REGEX.test(finalSlug)) {
    finalSlug = `chat-${Date.now().toString(36)}`;
  }

  // Ensure slug uniqueness
  const existing = db.prepare("SELECT id FROM chat_links WHERE slug = ?").get(finalSlug);
  if (existing) {
    finalSlug = `${finalSlug}-${Math.floor(100 + Math.random() * 899)}`;
  }

  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  let rawPhone = phoneNumber;
  if (!rawPhone || !String(rawPhone).trim()) {
    try {
      if (userId && userId !== "system") {
        const userAssigned = db.prepare(`
          SELECT p.phone_number, p.phone_number_id
          FROM users u
          JOIN waba_phone_numbers p ON u.assigned_phone_id = p.id
          WHERE u.id = ?
        `).get(userId);
        if (userAssigned?.phone_number) {
          rawPhone = userAssigned.phone_number;
          if (!phoneNumberId) phoneNumberId = userAssigned.phone_number_id;
        }
      }
      if (!rawPhone) {
        const waba = db.prepare("SELECT phone_number, phone_number_id FROM waba_phone_numbers ORDER BY is_default DESC, id ASC LIMIT 1").get();
        if (waba?.phone_number) {
          rawPhone = waba.phone_number;
          if (!phoneNumberId) phoneNumberId = waba.phone_number_id;
        }
      }
    } catch (e) {}
  }
  if (!rawPhone || !String(rawPhone).trim()) {
    try {
      const u = db.prepare("SELECT phone FROM users WHERE id = ?").get(userId);
      if (u?.phone) rawPhone = u.phone;
    } catch (e) {}
  }
  if (!rawPhone || !String(rawPhone).trim()) {
    rawPhone = "918766590634";
  }

  const cleanTo = cleanPhone(rawPhone, defaultCountry);
  if (!cleanTo || cleanTo.length < 10) {
    const err = new Error("A valid WhatsApp Phone Number is required.");
    err.statusCode = 400;
    throw err;
  }

  const cleanMessage = String(defaultMessage || "").trim() || "Hi! I would like to get more information.";
  const id = `link_${crypto.randomUUID()}`;

  const fieldsVal = customFields || custom_fields;
  const fieldsJson = fieldsVal ? (typeof fieldsVal === "string" ? fieldsVal : JSON.stringify(fieldsVal)) : null;

  db.prepare(`
    INSERT INTO chat_links (
      id, tenant_id, user_id, phone_number_id, phone_number,
      title, slug, default_message, welcome_title, welcome_description,
      auto_reply_enabled, auto_reply_message, flow_id, category, status, custom_fields
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(
    id,
    tenantId,
    userId,
    phoneNumberId || null,
    cleanTo,
    cleanTitle,
    finalSlug,
    cleanMessage,
    welcomeTitle || cleanTitle,
    welcomeDescription || "Chat with us directly on WhatsApp or through our web chat.",
    autoReplyEnabled ? 1 : 0,
    autoReplyMessage || "Hello! Thank you for reaching out. We have received your message and an agent will reply shortly.",
    flowId || null,
    String(category || "GENERAL").toUpperCase(),
    fieldsJson
  );

  const row = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(id);
  const urls = formatLinkUrls(row, baseUrl);
  let parsedCustomFields = null;
  if (row.custom_fields) {
    try {
      parsedCustomFields = JSON.parse(row.custom_fields);
    } catch (e) {}
  }
  return {
    ...row,
    custom_fields: parsedCustomFields,
    auto_reply_enabled: Boolean(row.auto_reply_enabled),
    urls,
    shortUrl: urls.shortUrl,
    waMeUrl: urls.waMeUrl,
    embedHtml: urls.embedHtml
  };
}

/**
 * Bulk automated generator: clients can pass an array of items (e.g. rooms, campaigns) to create multiple links
 */
function bulkGenerateLinks(items = [], { tenantId = 1, userId = "system", defaultPhone = null, defaultPhoneId = null, baseUrl = "" } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error("At least one link specification object is required for bulk generation.");
    err.statusCode = 400;
    throw err;
  }

  const results = [];
  db.exec("BEGIN IMMEDIATE TRANSACTION;");
  try {
    for (const item of items) {
      const created = createLink({
        tenantId,
        userId,
        title: item.title || item.name || "Special Offer Chat",
        slug: item.slug,
        phoneNumber: item.phoneNumber || defaultPhone,
        phoneNumberId: item.phoneNumberId || defaultPhoneId,
        defaultMessage: item.defaultMessage || item.message,
        welcomeTitle: item.welcomeTitle,
        welcomeDescription: item.welcomeDescription,
        autoReplyEnabled: item.autoReplyEnabled !== undefined ? item.autoReplyEnabled : 1,
        autoReplyMessage: item.autoReplyMessage,
        flowId: item.flowId,
        category: item.category || "HOSPITALITY",
        baseUrl
      });
      results.push(created);
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
  return results;
}

/**
 * Gets a single link by ID or Slug (optionally tracking click counter)
 */
function getLinkByIdOrSlug(idOrSlug, {
  tenantId = 1,
  userId = null,
  isAdmin = false,
  incrementClicks = false,
  queryParams = {},
  baseUrl = ""
} = {}) {
  const row = db.prepare(`
    SELECT cl.*, u.name as creator_name, u.email as creator_email
    FROM chat_links cl
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE (cl.id = ? OR cl.slug = ?) AND cl.tenant_id = ?
    LIMIT 1
  `).get(idOrSlug, idOrSlug, tenantId);

  if (!row) return null;

  // Account ownership check on private management requests
  if (!incrementClicks && !isAdmin && userId && row.user_id && row.user_id !== userId) {
    const err = new Error("Forbidden: You do not have permission to access this chat link.");
    err.statusCode = 403;
    throw err;
  }

  if (incrementClicks) {
    try {
      db.prepare(`
        UPDATE chat_links 
        SET clicks_count = clicks_count + 1, last_clicked_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(row.id);
      row.clicks_count += 1;
    } catch (e) {}
  }

  const interpolated = interpolateMessage(row.default_message, queryParams);
  const urls = formatLinkUrls({ ...row, default_message: interpolated }, baseUrl);

  let parsedCustomFields = null;
  if (row.custom_fields) {
    try {
      parsedCustomFields = typeof row.custom_fields === "string" ? JSON.parse(row.custom_fields) : row.custom_fields;
    } catch (e) {}
  }
  if (!parsedCustomFields || !Array.isArray(parsedCustomFields) || parsedCustomFields.length === 0) {
    if (row.category === "HOSPITALITY" || /resort|villa|hotel|beach/i.test(`${row.title} ${row.slug}`)) {
      if (hospitalityFlowEngine) {
        parsedCustomFields = hospitalityFlowEngine.DEFAULT_HOSPITALITY_INTAKE_FIELDS;
      }
    } else {
      parsedCustomFields = [];
    }
  }

  return {
    ...row,
    custom_fields: parsedCustomFields,
    default_message: interpolated,
    raw_default_message: row.default_message,
    auto_reply_enabled: Boolean(row.auto_reply_enabled),
    urls,
    shortUrl: urls.shortUrl,
    waMeUrl: urls.waMeUrl,
    embedHtml: urls.embedHtml
  };
}

/**
 * Updates an existing link
 */
function updateLink(id, payload = {}, { tenantId = 1, userId = null, isAdmin = false, baseUrl = "" } = {}) {
  const link = db.prepare("SELECT * FROM chat_links WHERE id = ? AND tenant_id = ?").get(id, tenantId);
  if (!link) {
    const err = new Error("Chat Link not found.");
    err.statusCode = 404;
    throw err;
  }

  // Account ownership validation: regular users cannot modify another account's link
  if (!isAdmin && userId && link.user_id && link.user_id !== userId) {
    const err = new Error("Forbidden: You do not have permission to modify this chat link.");
    err.statusCode = 403;
    throw err;
  }

  let finalSlug = link.slug;
  if (payload.slug && payload.slug !== link.slug) {
    finalSlug = slugify(payload.slug);
    if (!SLUG_REGEX.test(finalSlug)) {
      const err = new Error("Invalid custom slug format (must be 2-64 lowercase letters, numbers, hyphens).");
      err.statusCode = 400;
      throw err;
    }
    const duplicate = db.prepare("SELECT id FROM chat_links WHERE slug = ? AND id != ?").get(finalSlug, id);
    if (duplicate) {
      const err = new Error(`Slug '${finalSlug}' is already in use by another link.`);
      err.statusCode = 409;
      throw err;
    }
  }

  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const nextPhone = payload.phoneNumber ? cleanPhone(payload.phoneNumber, defaultCountry) : link.phone_number;
  const nextUserId = (isAdmin && payload.userId !== undefined) ? payload.userId : link.user_id;

  const customFieldsVal = payload.customFields !== undefined ? payload.customFields : payload.custom_fields;
  const customFieldsJson = customFieldsVal !== undefined
    ? (customFieldsVal ? (typeof customFieldsVal === "string" ? customFieldsVal : JSON.stringify(customFieldsVal)) : null)
    : link.custom_fields;

  db.prepare(`
    UPDATE chat_links
    SET title = COALESCE(?, title),
        slug = ?,
        phone_number = ?,
        phone_number_id = COALESCE(?, phone_number_id),
        default_message = COALESCE(?, default_message),
        welcome_title = COALESCE(?, welcome_title),
        welcome_description = COALESCE(?, welcome_description),
        auto_reply_enabled = COALESCE(?, auto_reply_enabled),
        auto_reply_message = COALESCE(?, auto_reply_message),
        flow_id = COALESCE(?, flow_id),
        category = COALESCE(?, category),
        status = COALESCE(?, status),
        custom_fields = ?,
        user_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    payload.title !== undefined ? String(payload.title).trim() : link.title,
    finalSlug,
    nextPhone,
    payload.phoneNumberId !== undefined ? payload.phoneNumberId : link.phone_number_id,
    payload.defaultMessage !== undefined ? String(payload.defaultMessage).trim() : link.default_message,
    payload.welcomeTitle !== undefined ? payload.welcomeTitle : link.welcome_title,
    payload.welcomeDescription !== undefined ? payload.welcomeDescription : link.welcome_description,
    payload.autoReplyEnabled !== undefined ? (payload.autoReplyEnabled ? 1 : 0) : link.auto_reply_enabled,
    payload.autoReplyMessage !== undefined ? payload.autoReplyMessage : link.auto_reply_message,
    payload.flowId !== undefined ? payload.flowId : link.flow_id,
    payload.category !== undefined ? String(payload.category).toUpperCase() : link.category,
    payload.status !== undefined ? String(payload.status).toUpperCase() : link.status,
    customFieldsJson,
    nextUserId,
    id
  );

  const updated = db.prepare(`
    SELECT cl.*, u.name as creator_name, u.email as creator_email
    FROM chat_links cl
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE cl.id = ?
  `).get(id);
  const urls = formatLinkUrls(updated, baseUrl);
  let updatedCustomFields = null;
  if (updated.custom_fields) {
    try {
      updatedCustomFields = JSON.parse(updated.custom_fields);
    } catch (e) {}
  }
  return {
    ...updated,
    custom_fields: updatedCustomFields,
    auto_reply_enabled: Boolean(updated.auto_reply_enabled),
    urls,
    shortUrl: urls.shortUrl,
    waMeUrl: urls.waMeUrl,
    embedHtml: urls.embedHtml
  };
}

/**
 * Deletes a link with account ownership validation
 */
function deleteLink(id, { tenantId = 1, userId = null, isAdmin = false } = {}) {
  const link = db.prepare("SELECT * FROM chat_links WHERE id = ? AND tenant_id = ?").get(id, tenantId);
  if (!link) {
    return false;
  }

  // Account ownership validation: regular users cannot delete another account's link
  if (!isAdmin && userId && link.user_id && link.user_id !== userId) {
    const err = new Error("Forbidden: You do not have permission to delete this chat link.");
    err.statusCode = 403;
    throw err;
  }

  const info = db.prepare("DELETE FROM chat_links WHERE id = ? AND tenant_id = ?").run(id, tenantId);
  return info.changes > 0;
}

/**
 * Customer initiates a live conversation via the public chat link landing page
 */
function startConversationFromLink({
  slug,
  customerName = "Guest Customer",
  customerPhone = "",
  message = "",
  queryParams = {},
  intakeData = null
}) {
  const link = getLinkByIdOrSlug(slug, { incrementClicks: true, queryParams });
  if (!link) {
    const err = new Error("Chat Link not found or invalid.");
    err.statusCode = 404;
    throw err;
  }

  if (link.status !== "ACTIVE") {
    const err = new Error("This conversation link is currently paused or inactive.");
    err.statusCode = 403;
    throw err;
  }

  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  let targetPhone = cleanPhone(customerPhone, defaultCountry);

  // If visitor is an anonymous web guest, generate a consistent web guest session phone ID
  if (!targetPhone || targetPhone.length < 10) {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    targetPhone = `919000${randomSuffix}`;
  }

  const tenantId = link.tenant_id || 1;

  // 1. Check if the contact number already exists in the database
  const existingContact = db.prepare(`
    SELECT * FROM contacts WHERE tenant_id = ? AND phone_e164 = ?
  `).get(tenantId, targetPhone);

  const pastMessages = db.prepare(`
    SELECT * FROM customer_replies
    WHERE from_phone = ?
    ORDER BY id ASC
  `).all(targetPhone);

  const isExistingGuest = Boolean(existingContact || pastMessages.length > 0);

  // Determine final guest name: if returning guest and no new name provided, retain known name
  let cleanGuestName = String(customerName || "").trim();
  if (!cleanGuestName || cleanGuestName === "Guest Customer") {
    cleanGuestName = existingContact?.name || pastMessages.find(m => m.customer_name && m.customer_name !== "Guest Customer")?.customer_name || "Guest Customer";
  }

  const sentMessage = String(message || link.default_message || "").trim();
  const waMsgId = `wamsg_link_${crypto.randomUUID()}`;

  // 2. Insert customer message into customer_replies table
  db.prepare(`
    INSERT INTO customer_replies (
      wa_message_id, from_phone, customer_name, message_type,
      message_body, reply_text, link_id, source, is_read, user_id, received_at
    ) VALUES (?, ?, ?, 'text', ?, NULL, ?, 'CHAT_LINK', 0, ?, CURRENT_TIMESTAMP)
  `).run(
    waMsgId,
    targetPhone,
    cleanGuestName,
    sentMessage,
    link.id,
    link.user_id || null
  );

  // 3. Increment conversation count on link
  try {
    db.prepare("UPDATE chat_links SET conversations_count = conversations_count + 1 WHERE id = ?").run(link.id);
  } catch (e) {}

  // 4. Store / upsert the guest contact in CRM contacts table & capture consent
  let contactRecord = null;
  let enquiryRecord = null;
  const enquiryService = require("./enquiryService");
  try {
    contactRecord = enquiryService.upsertContact(tenantId, targetPhone, cleanGuestName, null, "CHAT_LINK");

    // Also record consent in contact_consents
    try {
      if (contactRecord?.id) {
        db.prepare(`
          INSERT INTO contact_consents (tenant_id, contact_id, purpose, status, source)
          VALUES (?, ?, 'CHAT_LINK', 'GRANTED', 'CHAT_LINK')
        `).run(tenantId, contactRecord.id);
      }
    } catch (consentErr) {}

    // Register CRM booking enquiry for the inquiry from this chat link
    try {
      const checkIn = intakeData?.check_in || queryParams?.check_in || queryParams?.checkin || queryParams?.date || new Date(Date.now() + 86400000).toISOString().split("T")[0];
      const checkOut = intakeData?.check_out || queryParams?.check_out || queryParams?.checkout || new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0];
      const adults = Math.max(1, parseInt(intakeData?.adults || intakeData?.total_guests || queryParams?.guests || queryParams?.adults || 2, 10));
      const children = Math.max(0, parseInt(intakeData?.children || 0, 10));
      const roomPref = intakeData?.room_preference || link.title;

      enquiryRecord = enquiryService.createEnquiry(tenantId, {
        phone: targetPhone,
        guest_name: cleanGuestName,
        check_in: checkIn,
        check_out: checkOut,
        adults: adults,
        children: children,
        room_preference: roomPref,
        notes: `Inbound lead from Click-to-Chat Link: "${link.title}" (/c/${link.slug}). Initial Inquiry: "${sentMessage}"`,
        preferences: {
          source: "CHAT_LINK",
          link_id: link.id,
          link_slug: link.slug,
          link_title: link.title,
          initial_message: sentMessage,
          is_returning: isExistingGuest,
          intakeData,
          queryParams
        }
      });
      broadcastEngine.emit("enquiry:created", enquiryRecord);
    } catch (enqErr) {
      console.warn("[ChatLinkService] CRM Enquiry insertion note:", enqErr.message);
    }
  } catch (e) {
    console.error("[ChatLinkService] CRM Upsert error:", e.message);
  }

  // 5. Fetch saved customer message record
  const customerReplyRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(waMsgId);

  // 6. Automated Interactive Response (if enabled)
  let autoReplyRecord = null;
  if (link.auto_reply_enabled) {
    let autoReplyText = String(link.auto_reply_message || "").trim();
    let rawPayload = null;

    const isHospitality = link.category === "HOSPITALITY" ||
      (!link.category && /resort|villa|hotel|cottage/i.test(link.title || ""));

    if (isHospitality && hospitalityFlowEngine) {
      try {
        const flowRes = hospitalityFlowEngine.handleCustomerInquiry({
          channel: "WEB",
          phone: targetPhone,
          guestName: cleanGuestName,
          text: sentMessage,
          link,
          intakeData,
          tenantId
        });
        if (flowRes && flowRes.text) {
          autoReplyText = flowRes.text;
          rawPayload = flowRes.raw_payload || null;
        }
      } catch (flowErr) {
        console.warn("[ChatLinkService] Hospitality flow first reply notice:", flowErr.message);
      }
    }

    if (autoReplyText) {
      const autoReplyId = `auto_${crypto.randomUUID()}`;

      db.prepare(`
        INSERT INTO customer_replies (
          wa_message_id, from_phone, customer_name, message_type,
          message_body, reply_text, reply_sent_at, reply_status,
          link_id, source, is_read, user_id, received_at, raw_payload
        ) VALUES (?, ?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP, 'SENT', ?, 'CHAT_LINK', 1, 'bot', CURRENT_TIMESTAMP, ?)
      `).run(
        autoReplyId,
        targetPhone,
        cleanGuestName,
        autoReplyText,
        autoReplyText,
        link.id,
        rawPayload ? JSON.stringify(rawPayload) : null
      );

      autoReplyRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(autoReplyId);
      try {
        broadcastEngine.emit("webhook:reply", autoReplyRecord);
      } catch (e) {}
    }
  }

  // 7. Emit real-time notification for SARVYA Conversations / Shared Inbox
  try {
    broadcastEngine.emit("webhook:reply", {
      ...customerReplyRecord,
      link_title: link.title,
      link_slug: link.slug
    });
  } catch (e) {}

  const cleanResortPhone = cleanPhone(link.phone_number, defaultCountry);
  const personalizedWaText = `Hi, my name is ${cleanGuestName}. ${sentMessage}`;
  const personalizedWaMeUrl = `https://wa.me/${cleanResortPhone}?text=${encodeURIComponent(personalizedWaText)}`;

  // If returning guest, concatenate past messages + current inbound + auto-reply so they continue seamlessly
  const allMessages = isExistingGuest
    ? [...pastMessages, customerReplyRecord, ...(autoReplyRecord ? [autoReplyRecord] : [])]
    : [customerReplyRecord, ...(autoReplyRecord ? [autoReplyRecord] : [])];

  return {
    success: true,
    linkId: link.id,
    linkTitle: link.title,
    customerPhone: targetPhone,
    phone: targetPhone,
    customerName: cleanGuestName,
    message: sentMessage,
    customerMessage: customerReplyRecord,
    inboundId: customerReplyRecord?.id,
    contact: contactRecord,
    enquiry: enquiryRecord,
    autoReply: autoReplyRecord,
    autoReplied: Boolean(autoReplyRecord),
    autoReplyMessage: autoReplyRecord ? autoReplyRecord.message_body : null,
    personalizedWaMeUrl,
    isExistingGuest,
    isNewGuest: !isExistingGuest,
    pastMessagesCount: pastMessages.length,
    messages: allMessages
  };
}

/**
 * Retrieves message history for an in-app web conversation session
 * Restricted to chat link or web guest messages to prevent leaking CRM broadcasts
 */
function getWebConversationMessages(phone, linkId = null) {
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const clean = cleanPhone(phone, defaultCountry);
  if (!clean) return [];

  let query = `
    SELECT * FROM customer_replies
    WHERE from_phone = ?
  `;
  const params = [clean];

  if (linkId) {
    query += ` AND (link_id = ? OR source = 'CHAT_LINK' OR from_phone LIKE '919000%')`;
    params.push(linkId);
  } else {
    query += ` AND (source = 'CHAT_LINK' OR from_phone LIKE '919000%')`;
  }

  query += ` ORDER BY id ASC`;
  return db.prepare(query).all(...params);
}

/**
 * Resolves an intelligent automated response for hospitality or general customer inquiries
 */
function resolveAutomatedCustomerReply(cleanText, link, guestName, cleanPhoneNum) {
  if (!link || !link.auto_reply_enabled) return null;

  const isHospitality = link.category === "HOSPITALITY" ||
    (!link.category && /resort|villa|hotel|cottage/i.test(link.title || ""));

  if (isHospitality && hospitalityChatService) {
    const tenantId = link.tenant_id || 1;
    let prop = null;
    try {
      prop = db.prepare("SELECT id, name FROM properties WHERE tenant_id = ? AND publication_status = 'PUBLISHED' LIMIT 1").get(tenantId);
      if (!prop) {
        prop = db.prepare("SELECT id, name FROM properties WHERE tenant_id = ? LIMIT 1").get(tenantId);
      }
    } catch (e) {}
    const propertyId = prop?.id || 1;
    const lower = cleanText.toLowerCase();

    // 1. Human Handoff / Talk to Desk / Call request
    if (/\b(call|phone|speak|talk|agent|human|manager|executive|desk|staff|someone|person|call back)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.requestHumanHandoff({
          propertyId,
          customerName: guestName,
          customerPhone: cleanPhoneNum,
          inquiryDetails: cleanText,
          tenantId
        });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 2. Dining / Food / Restaurant / Breakfast / Meals
    if (/\b(dining|food|restaurant|breakfast|dinner|lunch|menu|meals|cuisine|eat|eating|bar|cafe)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getPropertyFacilitiesAction({
          propertyId,
          category: "DINING",
          tenantId
        });
        if (res && res.facilities && res.facilities.length > 0) {
          return res.whatsapp_text;
        }
        return hospitalityChatService.getPropertyFacilitiesAction({ propertyId, tenantId }).whatsapp_text;
      } catch (e) {}
    }

    // 3. Room categories / Villa types / Rates / Pricing
    if (/\b(room|rooms|villa|villas|cottage|suite|rate|rates|price|pricing|tariff|types|cost|how much|accommodat)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getRoomCategories({ propertyId, tenantId });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 3b. Photos / Gallery / Property Views
    if (/\b(photo|photos|image|images|pic|pics|picture|pictures|gallery|view photos|see photos|look like)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getPropertyGallery({ propertyId, tenantId });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 4. Amenities / Facilities / Pool / Wi-Fi / Parking / Beach
    if (/\b(amenities|amenity|facility|facilities|pool|swimming|wifi|wi-fi|internet|parking|park|beach|gym|spa|activities|garden)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getPropertyFacilitiesAction({ propertyId, tenantId });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 5. Location / Directions / How to reach / Route / Ferry / Distance
    if (/\b(location|reach|address|direction|directions|where|map|route|ferry|mandwa|mumbai|pune|distance|highway)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getPropertyFaqAction({
          propertyId,
          question: "directions location reach ferry distance",
          tenantId
        });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 6. Policies / Timings / Check-in / Check-out / Cancellation / Pets / Smoking
    if (/\b(policy|policies|check-in|checkin|check-out|checkout|timing|timings|cancel|cancellation|refund|pet|pets|dog|smoking)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getPropertyPolicyAction({ propertyId, tenantId });
        return res.whatsapp_text;
      } catch (e) {}
    }

    // 7. General Availability check
    if (/\b(availab|book|booking|reserve|reservation|dates|stay)\b/i.test(lower)) {
      try {
        const res = hospitalityChatService.getRoomCategories({ propertyId, tenantId });
        return `🗓️ *KonkanTrip Concierge Desk*\n\nWe would be delighted to host you! Here are our available room & villa categories:\n\n${res.whatsapp_text}`;
      } catch (e) {}
    }

    // 8. General greetings or fallbacks for hospitality
    if (/\b(hi|hello|hey|good morning|good afternoon|good evening|namaste)\b/i.test(lower) || lower.length < 15) {
      if (link.auto_reply_message) return link.auto_reply_message;
      return `Hello ${guestName}! Welcome to ${prop ? prop.name : "KonkanTrip Beach Resort & Spa"}.\n\nOur concierge desk is at your service. You can ask about our:\n• 🛏️ Villa types & room rates\n• 🍽️ Dining options & breakfast timings\n• ✨ Resort facilities & swimming pool\n• 📋 Check-in / check-out policies\n• 📍 Exact location & driving directions\n\nOr reply *"Call back"* to speak directly with our reservations team.`;
    }
  }

  // Non-hospitality or standard auto-reply message
  return link.auto_reply_message || null;
}

/**
 * Handles ongoing in-app web chat message from customer
 */
function sendWebCustomerMessage(phone, text, linkId = null, extraData = {}) {
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const clean = cleanPhone(phone, defaultCountry);
  const cleanText = String(text || "").trim();
  const flowSubmission = extraData?.flowSubmission || extraData?.flow_submission || null;
  const intakeData = extraData?.intakeData || extraData?.intake_data || null;

  if (!clean || !cleanText) {
    const err = new Error("Phone and message text are required.");
    err.statusCode = 400;
    throw err;
  }

  // Lookup contact name from CRM contacts table, then fallback to past replies
  const contact = db.prepare("SELECT name FROM contacts WHERE phone_e164 = ? LIMIT 1").get(clean);
  const prior = db.prepare("SELECT customer_name, link_id, user_id FROM customer_replies WHERE from_phone = ? AND customer_name IS NOT NULL AND customer_name != 'Guest Customer' ORDER BY id DESC LIMIT 1").get(clean);
  const guestName = contact?.name || prior?.customer_name || "Guest Customer";
  const targetLinkId = linkId || prior?.link_id || null;

  // Never assign 'bot' as user_id for customer's incoming message
  let assignedUserId = null;
  if (targetLinkId) {
    try {
      const lk = db.prepare("SELECT user_id FROM chat_links WHERE id = ?").get(targetLinkId);
      if (lk?.user_id && lk.user_id !== "bot") assignedUserId = lk.user_id;
    } catch (e) {}
  }
  if (!assignedUserId && prior?.user_id && prior.user_id !== "bot") {
    assignedUserId = prior.user_id;
  }

  const waMsgId = `wamsg_web_${crypto.randomUUID()}`;

  db.prepare(`
    INSERT INTO customer_replies (
      wa_message_id, from_phone, customer_name, message_type,
      message_body, link_id, source, is_read, user_id, received_at
    ) VALUES (?, ?, ?, 'text', ?, ?, 'CHAT_LINK', 0, ?, CURRENT_TIMESTAMP)
  `).run(
    waMsgId,
    clean,
    guestName,
    cleanText,
    targetLinkId,
    assignedUserId
  );

  const saved = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(waMsgId);
  try {
    broadcastEngine.emit("webhook:reply", saved);
  } catch (e) {}

  // Automated Intelligent Response (if enabled)
  let autoReplyRecord = null;
  const link = targetLinkId ? db.prepare("SELECT * FROM chat_links WHERE id = ? OR slug = ?").get(targetLinkId, targetLinkId) : null;
  let botReplyText = null;
  let rawPayload = null;

  const isHospitality = link && (link.category === "HOSPITALITY" ||
    (!link.category && /resort|villa|hotel|cottage/i.test(link.title || "")));

  if (isHospitality && hospitalityFlowEngine) {
    try {
      const flowRes = hospitalityFlowEngine.handleCustomerInquiry({
        channel: "WEB",
        phone: clean,
        guestName,
        text: cleanText,
        link,
        intakeData,
        flowSubmission,
        tenantId: link.tenant_id || 1
      });
      if (flowRes && flowRes.text) {
        botReplyText = flowRes.text;
        rawPayload = flowRes.raw_payload || null;
      }
    } catch (e) {
      console.error("[ChatLinkService] hospitalityFlowEngine error:", e);
      botReplyText = resolveAutomatedCustomerReply(cleanText, link, guestName, clean);
    }
  } else {
    botReplyText = resolveAutomatedCustomerReply(cleanText, link, guestName, clean);
  }

  if (botReplyText) {
    const autoReplyId = `auto_${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, reply_text, reply_sent_at, reply_status,
        link_id, source, is_read, user_id, received_at, raw_payload
      ) VALUES (?, ?, ?, 'outbound', ?, ?, CURRENT_TIMESTAMP, 'SENT', ?, 'CHAT_LINK', 1, 'bot', CURRENT_TIMESTAMP, ?)
    `).run(
      autoReplyId,
      clean,
      guestName,
      botReplyText,
      botReplyText,
      targetLinkId,
      rawPayload ? JSON.stringify(rawPayload) : null
    );

    autoReplyRecord = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(autoReplyId);
    try {
      broadcastEngine.emit("webhook:reply", autoReplyRecord);
    } catch (e) {}
  }

  return {
    ...saved,
    autoReply: autoReplyRecord
  };
}

module.exports = {
  SLUG_REGEX,
  slugify,
  interpolateMessage,
  formatLinkUrls,
  listLinks,
  createLink,
  bulkGenerateLinks,
  getLinkByIdOrSlug,
  updateLink,
  deleteLink,
  startConversationFromLink,
  getWebConversationMessages,
  sendWebCustomerMessage
};
