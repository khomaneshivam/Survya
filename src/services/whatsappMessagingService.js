const crypto = require("crypto");
const { db, getSetting } = require("../config/database");
const config = require("../config/env");
const metaWhatsAppService = require("./metaWhatsAppService");
const broadcastEngine = require("./broadcastEngine");

const TEMPLATE_NAME_REGEX = /^[a-z0-9_]{1,512}$/;
const ALLOWED_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);
const ALLOWED_HEADER_TYPES = new Set(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]);
const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Generates common digit variations for phone lookups across tables
 */
function getPhoneVariations(phone) {
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleaned = metaWhatsAppService.cleanPhone(phone, defaultCountry);
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  const set = new Set([raw, digits, cleaned, `+${cleaned}`].filter(Boolean));

  if (cleaned.startsWith(defaultCountry) && cleaned.length > defaultCountry.length) {
    const national = cleaned.slice(defaultCountry.length);
    set.add(national);
    set.add(`0${national}`);
  }
  return { cleaned, variations: Array.from(set) };
}

/**
 * Checks whether the 24-hour WhatsApp customer-service window is currently active for a phone number.
 */
function check24HourCustomerServiceWindow(phone) {
  const { cleaned, variations } = getPhoneVariations(phone);
  if (!cleaned) {
    return { isOpen: false, lastInboundAt: null, expiresAt: null, remainingMinutes: 0 };
  }

  const placeholders = variations.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT received_at
    FROM customer_replies
    WHERE from_phone IN (${placeholders})
      AND COALESCE(LOWER(message_type), 'text') != 'outbound'
    ORDER BY datetime(received_at) DESC, id DESC
    LIMIT 1
  `).get(...variations);

  if (!row || !row.received_at) {
    return { isOpen: false, lastInboundAt: null, expiresAt: null, remainingMinutes: 0 };
  }

  // SQLite CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC
  const rawTs = String(row.received_at).trim();
  const isoTs = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTs)
    ? `${rawTs.replace(" ", "T")}Z`
    : rawTs;

  const inboundMs = Date.parse(isoTs);
  if (isNaN(inboundMs)) {
    return { isOpen: false, lastInboundAt: row.received_at, expiresAt: null, remainingMinutes: 0 };
  }

  const expiresMs = inboundMs + WINDOW_DURATION_MS;
  const remainingMs = expiresMs - Date.now();
  return {
    isOpen: remainingMs > 0,
    lastInboundAt: new Date(inboundMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000))
  };
}

/**
 * Checks opt-out / suppression registry for a phone number.
 */
function isPhoneOptedOut(phone) {
  const { cleaned, variations } = getPhoneVariations(phone);
  if (!cleaned) {
    return { optedOut: false, reason: null };
  }

  const placeholders = variations.map(() => "?").join(",");
  const supp = db.prepare(`
    SELECT reason, created_at
    FROM contact_suppressions
    WHERE clean_phone IN (${placeholders})
    LIMIT 1
  `).get(...variations);

  if (supp) {
    return { optedOut: true, reason: supp.reason || "USER_OPT_OUT" };
  }

  return { optedOut: false, reason: null };
}

const metaRateService = require("./billing/metaRateService");

/**
 * Returns unit rate in INR based on configurable Meta conversation tariff settings.
 */
function getCategoryUnitRate(category = "MARKETING", phoneNumberId = null) {
  return metaRateService.calculateUnitRate(category, phoneNumberId);
}

/**
 * Parses placeholders from body text and extracts variable descriptors cleanly.
 */
function extractTemplateVariables(bodyText = "", samples = {}) {
  const matches = [...String(bodyText || "").matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)];
  const uniqueKeys = [...new Set(matches.map(m => m[1]))];
  const isPositional = uniqueKeys.every(k => /^\d+$/.test(k));

  const variables = uniqueKeys.map((key, idx) => {
    let exampleVal = "";
    if (Array.isArray(samples)) {
      exampleVal = samples[idx] !== undefined ? String(samples[idx]) : "";
    } else if (samples && typeof samples === "object") {
      exampleVal = samples[key] !== undefined
        ? String(samples[key])
        : (samples[String(idx + 1)] !== undefined ? String(samples[String(idx + 1)]) : "");
    }
    return {
      type: isPositional ? "positional" : "named",
      index: idx + 1,
      key,
      label: `{{${key}}}`,
      name: key,
      example: exampleVal
    };
  });

  return {
    parameterFormat: isPositional ? "POSITIONAL" : "NAMED",
    variables
  };
}

/**
 * Normalizes and validates custom template definition into Meta Cloud API components.
 */
function buildTemplateComponentsPayload({
  headerType = "NONE",
  headerText = "",
  headerMediaUrl = "",
  bodyText = "",
  footerText = "",
  buttons = [],
  samples = {}
}) {
  const cleanHeaderType = String(headerType || "NONE").toUpperCase();
  if (!ALLOWED_HEADER_TYPES.has(cleanHeaderType)) {
    const err = new Error(`Unsupported header type '${cleanHeaderType}'. Allowed: NONE, TEXT, IMAGE, VIDEO, DOCUMENT.`);
    err.statusCode = 400;
    throw err;
  }

  const cleanBody = String(bodyText || "").trim();
  if (!cleanBody) {
    const err = new Error("Template body text is required.");
    err.statusCode = 400;
    throw err;
  }
  if (cleanBody.length > 1024) {
    const err = new Error("Template body text cannot exceed 1024 characters.");
    err.statusCode = 400;
    throw err;
  }

  const cleanFooter = String(footerText || "").trim();
  if (cleanFooter.length > 60) {
    const err = new Error("Template footer text cannot exceed 60 characters.");
    err.statusCode = 400;
    throw err;
  }

  const { parameterFormat, variables } = extractTemplateVariables(cleanBody, samples);
  const components = [];

  // HEADER component
  if (cleanHeaderType === "TEXT") {
    const hText = String(headerText || "").trim();
    if (!hText) {
      const err = new Error("Header text is required when Header Type is TEXT.");
      err.statusCode = 400;
      throw err;
    }
    if (hText.length > 60) {
      const err = new Error("Header text cannot exceed 60 characters.");
      err.statusCode = 400;
      throw err;
    }
    const hComp = { type: "HEADER", format: "TEXT", text: hText };
    const hVarMatch = hText.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
    if (hVarMatch) {
      const sampleVal = (samples && samples.header) || "Sample Header";
      hComp.example = { header_text: [String(sampleVal)] };
    }
    components.push(hComp);
  } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(cleanHeaderType)) {
    const hComp = { type: "HEADER", format: cleanHeaderType };
    if (headerMediaUrl && String(headerMediaUrl).trim()) {
      hComp.example = { header_handle: [String(headerMediaUrl).trim()] };
    }
    components.push(hComp);
  }

  // BODY component
  const bodyComp = { type: "BODY", text: cleanBody };
  if (variables.length > 0) {
    const exampleValues = variables.map(v => v.example || "");
    if (parameterFormat === "POSITIONAL") {
      bodyComp.example = { body_text: [exampleValues] };
    } else {
      bodyComp.example = {
        body_text_named_params: variables.map(v => ({
          param_name: v.key,
          example: v.example || ""
        }))
      };
    }
  }
  components.push(bodyComp);

  // FOOTER component
  if (cleanFooter) {
    components.push({ type: "FOOTER", text: cleanFooter });
  }

  // BUTTONS component
  const normalizedButtons = Array.isArray(buttons) ? buttons.slice(0, 3).map(btn => {
    const bType = String(btn.type || "QUICK_REPLY").toUpperCase();
    const bText = String(btn.text || "").trim();
    if (!bText) {
      const err = new Error("Every template button must have non-empty label text.");
      err.statusCode = 400;
      throw err;
    }
    if (bText.length > 25) {
      const err = new Error(`Button label '${bText}' exceeds Meta's 25-character limit.`);
      err.statusCode = 400;
      throw err;
    }

    if (bType === "URL") {
      const urlVal = String(btn.url || "").trim();
      if (!urlVal || !/^https?:\/\//i.test(urlVal)) {
        const err = new Error(`Button '${bText}' requires a valid http(s) URL.`);
        err.statusCode = 400;
        throw err;
      }
      const out = { type: "URL", text: bText, url: urlVal };
      if (/\{\{\d+\}\}/.test(urlVal)) {
        out.example = [String(btn.example || urlVal.replace(/\{\{\d+\}\}/g, "sample"))];
      }
      return out;
    }

    if (bType === "PHONE_NUMBER") {
      const phoneVal = String(btn.phone_number || btn.phoneNumber || "").trim();
      if (!phoneVal) {
        const err = new Error(`Phone button '${bText}' requires a phone number.`);
        err.statusCode = 400;
        throw err;
      }
      return { type: "PHONE_NUMBER", text: bText, phone_number: phoneVal };
    }

    if (bType === "FLOW") {
      return {
        type: "FLOW",
        text: bText,
        flow_id: btn.flow_id || undefined,
        flow_action: btn.flow_action || "navigate",
        navigate_screen: btn.navigate_screen || undefined
      };
    }

    return { type: "QUICK_REPLY", text: bText };
  }) : [];

  if (normalizedButtons.length > 0) {
    components.push({ type: "BUTTONS", buttons: normalizedButtons });
  }

  return {
    parameterFormat,
    variables,
    components,
    buttons: normalizedButtons,
    headerType: cleanHeaderType,
    headerText: cleanHeaderType === "TEXT" ? String(headerText || "").trim() : null,
    headerMediaUrl: ["IMAGE", "VIDEO", "DOCUMENT"].includes(cleanHeaderType) ? (String(headerMediaUrl || "").trim() || null) : null,
    footerText: cleanFooter || null
  };
}

/**
 * Resolves credentials for a specific registered waba_phone_numbers ID or falls back to active defaults.
 */
function resolveCredentialsForPhone(requestedPhoneNumberId = null, tenantId = null) {
  const cleanPhoneId = requestedPhoneNumberId ? String(requestedPhoneNumberId).trim() : null;
  const creds = metaWhatsAppService.resolveCredentials({
    phoneNumberId: cleanPhoneId || undefined,
    tenantId: tenantId ? Number(tenantId) : undefined
  });
  return {
    token: creds.token,
    phoneNumberId: creds.phoneNumberId,
    isSimulation: Boolean(creds.isSimulation),
    isSandbox: Boolean(creds.isSandbox),
    tenantId: creds.tenantId
  };
}

/**
 * Sends a single 1-to-1 WhatsApp message while enforcing:
 * 1. Opt-out / suppression check
 * 2. 24-hour customer-service window rule for non-template messages
 * 3. Approved-only status guard for template messages
 * 4. Usage & message status ledger persistence
 */
async function sendOneToOneMessage({
  to,
  type = "TEXT",
  text = "",
  mediaUrl = null,
  mediaId = null,
  mediaType = "image",
  templateIdOrName = null,
  templateLanguage = null,
  variables = [],
  components = null,
  headerMediaUrl = null,
  phoneNumberId = null,
  userId = "system",
  tenantId = 1,
  flowActionData = null,
  bypassWindowCheck = false
}) {
  const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
  const cleanTo = metaWhatsAppService.cleanPhone(to, defaultCountry);
  if (!cleanTo || cleanTo.length < 10 || cleanTo.length > 15) {
    const err = new Error("Valid recipient WhatsApp phone number is required.");
    err.statusCode = 400;
    err.code = "INVALID_RECIPIENT_PHONE";
    throw err;
  }

  // Rule 1: Opt-out / Suppression enforcement
  const optOutState = isPhoneOptedOut(cleanTo);
  if (optOutState.optedOut) {
    const err = new Error(`Recipient +${cleanTo} has opted out (${optOutState.reason}). Outbound messaging is blocked.`);
    err.statusCode = 403;
    err.code = "CONTACT_OPTED_OUT";
    throw err;
  }

  const normalizedType = String(type || (templateIdOrName ? "TEMPLATE" : "TEXT")).toUpperCase();
  const windowState = check24HourCustomerServiceWindow(cleanTo);

  // Rule 2 (fast policy gate): Outside 24-hour customer service window -> Free-form TEXT/MEDIA blocked
  if (normalizedType !== "TEMPLATE" && !bypassWindowCheck && !windowState.isOpen) {
    const err = new Error("24-hour customer-service window is closed for this recipient. Send an APPROVED template message to initiate outreach.");
    err.statusCode = 422;
    err.code = "WINDOW_CLOSED_24H";
    err.window = windowState;
    throw err;
  }

  const creds = resolveCredentialsForPhone(phoneNumberId, tenantId);

  // Rule 2 (bypass gate): Only Workspace Sandbox / Simulation mode may bypass the 24h window check
  if (normalizedType !== "TEMPLATE" && !(bypassWindowCheck && (creds.isSandbox || creds.isSimulation))) {
    if (!windowState.isOpen) {
      const err = new Error("24-hour customer-service window is closed for this recipient. Send an APPROVED template message to initiate outreach.");
      err.statusCode = 422;
      err.code = "WINDOW_CLOSED_24H";
      err.window = windowState;
      throw err;
    }
  }
  let sendRes = null;
  let resolvedTpl = null;
  let renderedBody = String(text || "").trim();
  let messageCategory = "SERVICE";
  let resolvedComponents = Array.isArray(components) ? [...components] : [];

  if (normalizedType === "TEMPLATE") {
    const lookupKey = String(templateIdOrName || "").trim();
    if (!lookupKey) {
      const err = new Error("templateId or templateName is required when sending a TEMPLATE message.");
      err.statusCode = 400;
      err.code = "TEMPLATE_REQUIRED";
      throw err;
    }

    resolvedTpl = db.prepare(`
      SELECT * FROM templates
      WHERE id = ? OR meta_id = ? OR name = ? COLLATE NOCASE
      LIMIT 1
    `).get(lookupKey, lookupKey, lookupKey);

    if (!resolvedTpl) {
      const err = new Error(`Template '${lookupKey}' not found in workspace.`);
      err.statusCode = 404;
      err.code = "TEMPLATE_NOT_FOUND";
      throw err;
    }

    const tplStatus = String(resolvedTpl.status || "").toUpperCase();
    // Rule 3: Only APPROVED templates are allowed to be sent
    if (tplStatus !== "APPROVED") {
      const err = new Error(`Template '${resolvedTpl.name}' has status '${tplStatus}'. Only APPROVED templates may be dispatched.`);
      err.statusCode = 400;
      err.code = "TEMPLATE_NOT_APPROVED";
      err.templateStatus = tplStatus;
      throw err;
    }

    messageCategory = String(resolvedTpl.category || "MARKETING").toUpperCase();

    // Auto-build components from variables if caller passed variables map/array instead of raw Meta components
    if (resolvedComponents.length === 0) {
      const headerMedia = headerMediaUrl || mediaUrl || resolvedTpl.header_media_url;
      const hType = String(resolvedTpl.header_type || "NONE").toUpperCase();
      if (headerMedia && ["IMAGE", "VIDEO", "DOCUMENT"].includes(hType)) {
        const mKey = hType.toLowerCase();
        resolvedComponents.push({
          type: "header",
          parameters: [{ type: mKey, [mKey]: { link: headerMedia } }]
        });
      }

      let tplVars = [];
      try {
        tplVars = resolvedTpl.variables ? JSON.parse(resolvedTpl.variables) : [];
      } catch (e) {}

      if (Array.isArray(variables) && variables.length > 0) {
        resolvedComponents.push({
          type: "body",
          parameters: variables.map((val, idx) => {
            const varMeta = tplVars[idx];
            if (resolvedTpl.parameter_format === "NAMED" && varMeta?.key) {
              return { type: "text", parameter_name: varMeta.key, text: String(val ?? "") };
            }
            return { type: "text", text: String(val ?? "") };
          })
        });
      } else if (variables && typeof variables === "object" && !Array.isArray(variables) && Object.keys(variables).length > 0) {
        const params = [];
        if (tplVars.length > 0) {
          tplVars.forEach((v, idx) => {
            const val = variables[v.key] ?? variables[String(idx + 1)] ?? v.example ?? "";
            if (resolvedTpl.parameter_format === "NAMED") {
              params.push({ type: "text", parameter_name: v.key, text: String(val) });
            } else {
              params.push({ type: "text", text: String(val) });
            }
          });
        } else {
          Object.entries(variables).forEach(([k, val]) => {
            params.push(resolvedTpl.parameter_format === "NAMED"
              ? { type: "text", parameter_name: k, text: String(val ?? "") }
              : { type: "text", text: String(val ?? "") });
          });
        }
        if (params.length > 0) {
          resolvedComponents.push({ type: "body", parameters: params });
        }
      }
    }

    renderedBody = broadcastEngine.renderReadableTemplate(
      resolvedTpl.name,
      resolvedComponents,
      typeof variables === "object" && !Array.isArray(variables) ? variables : {},
      ""
    ) || resolvedTpl.body_text || `[Template: ${resolvedTpl.name}]`;

    sendRes = await metaWhatsAppService.sendTemplateMessage({
      to: cleanTo,
      templateName: resolvedTpl.name,
      languageCode: templateLanguage || resolvedTpl.language || "en",
      components: resolvedComponents,
      customCredentials: creds,
      flowActionData,
      userId
    });
  } else if (normalizedType === "MEDIA" || mediaUrl || mediaId) {
    if (!mediaUrl && !mediaId) {
      const err = new Error("mediaUrl or mediaId is required for MEDIA messages.");
      err.statusCode = 400;
      throw err;
    }
    sendRes = await metaWhatsAppService.sendMediaMessage({
      to: cleanTo,
      type: mediaType || "image",
      mediaId: mediaId || null,
      mediaUrl: mediaUrl || null,
      caption: renderedBody,
      customCredentials: creds
    });
    if (!renderedBody) {
      renderedBody = `[${String(mediaType || "image").toUpperCase()}]`;
    }
  } else {
    if (!renderedBody) {
      const err = new Error("Message text is required.");
      err.statusCode = 400;
      throw err;
    }
    sendRes = await metaWhatsAppService.sendTextMessage({
      to: cleanTo,
      body: renderedBody,
      customCredentials: creds
    });
  }

  const localMsgId = `wamsg_${crypto.randomUUID()}`;
  const metaMsgId = sendRes?.messageId || localMsgId;
  const unitCost = getCategoryUnitRate(messageCategory);

  // Persist unified message record
  db.prepare(`
    INSERT INTO whatsapp_messages (
      id, tenant_id, user_id, phone_number_id, campaign_id, recipient_phone,
      direction, message_type, template_id, template_name, template_category,
      message_body, components_json, status, meta_message_id, estimated_cost, currency
    ) VALUES (?, ?, ?, ?, NULL, ?, 'OUTBOUND', ?, ?, ?, ?, ?, ?, 'SENT', ?, ?, 'INR')
  `).run(
    localMsgId,
    tenantId,
    userId,
    creds.phoneNumberId,
    cleanTo,
    normalizedType,
    resolvedTpl?.id || null,
    resolvedTpl?.name || null,
    messageCategory,
    renderedBody,
    JSON.stringify(resolvedComponents || []),
    metaMsgId,
    unitCost
  );

  const ledgerStatus = (creds?.isSimulation || creds?.isSandbox) ? "WAIVED_SANDBOX" : "ESTIMATED";
  const effectiveUnitCost = (creds?.isSimulation || creds?.isSandbox) ? 0 : unitCost;

  // Record in usage ledger
  db.prepare(`
    INSERT INTO whatsapp_usage_ledger (
      tenant_id, user_id, phone_number_id, campaign_id, message_id, meta_message_id,
      recipient_phone, category, unit_cost, currency, billing_status
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, 'INR', ?)
  `).run(
    tenantId,
    userId,
    creds.phoneNumberId,
    localMsgId,
    metaMsgId,
    cleanTo,
    messageCategory,
    effectiveUnitCost,
    ledgerStatus
  );

  // Sync into shared inbox timeline cleanly with tenant & channel scope
  try {
    db.prepare(`
      INSERT IGNORE INTO customer_replies (
        tenant_id, channel_account_id, wa_message_id, from_phone, customer_name, message_type,
        message_body, reply_text, media_url, media_type,
        reply_sent_at, reply_status, is_read, user_id, received_at
      ) VALUES (?, ?, ?, ?, 'Customer', 'outbound', ?, ?, ?, ?, CURRENT_TIMESTAMP, 'SENT', 1, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      creds.phoneNumberId || null,
      metaMsgId,
      cleanTo,
      renderedBody,
      renderedBody,
      mediaUrl || null,
      normalizedType === "MEDIA" ? (mediaType || "image") : null,
      userId
    );
  } catch (inboxErr) {}

  return {
    id: localMsgId,
    metaMessageId: metaMsgId,
    recipient: cleanTo,
    messageType: normalizedType,
    category: messageCategory,
    status: "SENT",
    estimatedCost: unitCost,
    currency: "INR",
    window: windowState,
    template: resolvedTpl ? { id: resolvedTpl.id, name: resolvedTpl.name, status: resolvedTpl.status } : null
  };
}

/**
 * Validates template approval & recipient readiness prior to campaign launch, records estimated cost ledger, and starts dispatch.
 */
async function validateAndLaunchCampaign(campaignId, reqUser = null, delayOverride = null) {
  const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
  if (!campaign) {
    const err = new Error("Campaign not found.");
    err.statusCode = 404;
    throw err;
  }

  if (reqUser && reqUser.role !== "ADMIN" && campaign.user_id && campaign.user_id !== reqUser.id) {
    const err = new Error("Forbidden: You do not own this campaign.");
    err.statusCode = 403;
    throw err;
  }

  if (["RUNNING", "COMPLETED", "CANCELLED"].includes(campaign.status)) {
    const err = new Error(`Campaign cannot be launched from '${campaign.status}' status.`);
    err.statusCode = 400;
    throw err;
  }

  let tplCategory = "MARKETING";
  if (campaign.message_type === "TEMPLATE") {
    const tplRow = db.prepare(`
      SELECT * FROM templates
      WHERE name = ? OR meta_id = ? OR id = ? COLLATE NOCASE
      LIMIT 1
    `).get(campaign.template_name, campaign.template_name, campaign.template_name);

    if (tplRow) {
      const tplStatus = String(tplRow.status || "").toUpperCase();
      if (tplStatus !== "APPROVED") {
        const err = new Error(`Campaign launch blocked: Template '${tplRow.name}' status is '${tplStatus}'. Wait for Meta approval before launching.`);
        err.statusCode = 400;
        err.code = "TEMPLATE_NOT_APPROVED";
        throw err;
      }
      tplCategory = String(tplRow.category || "MARKETING").toUpperCase();
    }
  } else if (campaign.message_type === "TEXT") {
    tplCategory = "SERVICE";
  }

  // Re-evaluate opt-outs at launch time and count pending recipients
  const suppressions = db.prepare("SELECT clean_phone FROM contact_suppressions").all();
  const suppressedSet = new Set(suppressions.map(s => s.clean_phone));
  const pendingRows = db.prepare("SELECT id, clean_phone FROM campaign_recipients WHERE campaign_id = ? AND status = 'PENDING'").all(campaignId);

  let deliverableCount = 0;
  let suppressedAtLaunch = 0;
  const skipStmt = db.prepare("UPDATE campaign_recipients SET status = 'FAILED', error_message = 'Suppressed (Opted Out)' WHERE id = ?");

  for (const row of pendingRows) {
    if (suppressedSet.has(row.clean_phone)) {
      skipStmt.run(row.id);
      suppressedAtLaunch++;
    } else {
      deliverableCount++;
    }
  }

  if (deliverableCount === 0) {
    const err = new Error("No eligible PENDING recipients remain for launch (all suppressed or already processed).");
    err.statusCode = 400;
    throw err;
  }

  const unitCost = getCategoryUnitRate(tplCategory);
  const estimatedCost = parseFloat((deliverableCount * unitCost).toFixed(2));
  db.prepare("UPDATE campaigns SET estimated_cost = ? WHERE id = ?").run(estimatedCost, campaignId);

  const campaignTenantId = Number(campaign.tenant_id || reqUser?.tenant_id || 1);
  let isSandboxTenant = false;
  try {
    const tRow = db.prepare("SELECT is_sandbox FROM tenants WHERE id = ? LIMIT 1").get(campaignTenantId);
    isSandboxTenant = Number(tRow?.is_sandbox) === 1;
  } catch (_) {}

  // Record campaign launch ledger entry if none recorded yet for this campaign
  const existingLedger = db.prepare("SELECT id FROM whatsapp_usage_ledger WHERE campaign_id = ? LIMIT 1").get(campaignId);
  if (!existingLedger) {
    db.prepare(`
      INSERT INTO whatsapp_usage_ledger (
        tenant_id, user_id, phone_number_id, campaign_id, message_id, meta_message_id,
        recipient_phone, category, unit_cost, currency, billing_status
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'INR', ?)
    `).run(
      campaignTenantId,
      reqUser?.id || campaign.user_id || "system",
      campaign.phone_number_id || null,
      campaignId,
      campaignId,
      `BATCH:${deliverableCount}`,
      tplCategory,
      isSandboxTenant ? 0 : estimatedCost,
      isSandboxTenant ? "WAIVED_SANDBOX" : "ESTIMATED"
    );
  }

  // Trigger background broadcast engine execution (non-blocking)
  broadcastEngine.startCampaign(campaignId, delayOverride).catch(err => {
    console.error(`[SARVYA Connect] Async campaign start error (${campaignId}):`, err.message);
  });

  return {
    campaignId,
    status: "RUNNING",
    deliverableCount,
    suppressedAtLaunch,
    category: tplCategory,
    unitCost,
    estimatedCost,
    currency: "INR"
  };
}

module.exports = {
  TEMPLATE_NAME_REGEX,
  ALLOWED_CATEGORIES,
  ALLOWED_HEADER_TYPES,
  check24HourCustomerServiceWindow,
  isPhoneOptedOut,
  getCategoryUnitRate,
  extractTemplateVariables,
  buildTemplateComponentsPayload,
  resolveCredentialsForPhone,
  sendOneToOneMessage,
  validateAndLaunchCampaign
};

