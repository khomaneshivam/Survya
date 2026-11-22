const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const { parseMysqlUtcTimestamp } = require("../utils/timeUtil");
const broadcastEngine = require("./broadcastEngine");
const metaWhatsAppService = require("./metaWhatsAppService");
const isSandboxOrTestPhone = (phone) => {
  if (!phone) return true;
  const p = String(phone).replace(/\D/g, "");
  return p === "919876543210" || p.startsWith("9190000") || p.startsWith("9112345") || p.startsWith("0000");
};

const parseUtcMs = (val) => {
  const d = parseMysqlUtcTimestamp(val);
  return d ? d.getTime() : 0;
};

const sendTextMessage = async (params) => {
  if (params?.customCredentials?.isSimulation || isSandboxOrTestPhone(params?.to)) {
    return { success: true, messageId: `mock_txt_${Date.now()}` };
  }
  return metaWhatsAppService.sendTextMessage(params);
};
const sendInteractiveButtons = async (params) => {
  if (params?.customCredentials?.isSimulation || isSandboxOrTestPhone(params?.to)) {
    return { success: true, messageId: `mock_btn_${Date.now()}` };
  }
  return metaWhatsAppService.sendInteractiveButtons(params);
};
const sendInteractiveList = async (params) => {
  if (params?.customCredentials?.isSimulation || isSandboxOrTestPhone(params?.to)) {
    return { success: true, messageId: `mock_list_${Date.now()}` };
  }
  return metaWhatsAppService.sendInteractiveList(params);
};
const sendFlowMessage = async (params) => {
  if (params?.customCredentials?.isSimulation || isSandboxOrTestPhone(params?.to)) {
    return { success: true, messageId: `mock_flow_${Date.now()}` };
  }
  return metaWhatsAppService.sendFlowMessage(params);
};
const sendMediaMessage = async (params) => {
  if (params?.customCredentials?.isSimulation || isSandboxOrTestPhone(params?.to)) {
    return { success: true, messageId: `mock_media_${Date.now()}` };
  }
  return metaWhatsAppService.sendMediaMessage(params);
};
const downloadAndSaveInboundMedia = (...args) => metaWhatsAppService.downloadAndSaveInboundMedia(...args);

let hospitalityFlowEngine = null;
try {
  hospitalityFlowEngine = require("./hospitalityFlowEngine");
} catch (e) {}

let hospitalityChatService = null;
try {
  hospitalityChatService = require("./hospitalityChatService");
} catch (e) {}

let chatLinkService = null;
try {
  chatLinkService = require("./chatLinkService");
} catch (e) {}

let enquiryService = null;
try {
  enquiryService = require("./enquiryService");
} catch (e) {}

/**
 * Ensures button titles fit within Meta Cloud API's strict 20-character maximum
 */
function shortenButtonTitle(str) {
  if (!str) return "Option";
  let s = String(str).trim();
  if (s.length <= 20) return s;
  s = s.replace(/ Room$/i, "")
       .replace(/ Cottage$/i, "")
       .replace(/ Suite$/i, "")
       .replace(/ Penthouse$/i, "");
  if (s.length <= 20) return s;
  return s.substring(0, 20).trim();
}

/**
 * Ensures header text fits within Meta Cloud API's 60-character maximum
 */
function shortenHeaderText(str, max = 60) {
  if (!str) return "Hotel Green Vally";
  const s = String(str).trim();
  return s.length <= max ? s : s.substring(0, max).trim();
}

class WebhookService {
  constructor() {
    this.inFlightAutoReplies = new Set();
    this.activeDispatchKeys = new Set();
    this.answeredMessageKeys = new Map(); // dispatchKey -> timestamp (ms) to permanently dedupe retries
    this.botPausedUntil = new Map(); // cleanPhone -> expiryTimestamp (ms)
    this.phoneQueues = new Map(); // cleanPhone -> Promise chain for sequential processing
  }

  /**
   * Validates and normalizes submitted WhatsApp Flow data from nfm_reply or interactive form
   */
  validateAndNormalizeFlowSubmission(rawData = {}, defaultGuestName = "Guest") {
    if (!rawData || typeof rawData !== "object") {
      return { isValid: false, intakeData: null, isBooking: false, isFeedback: false, isSupport: false, isLead: false, errors: ["Empty or invalid submission payload"] };
    }

    const errors = [];
    const normalized = {};

    // 1. Guest Name
    const rawName = rawData.guest_name || rawData.full_name || rawData.name || rawData.contact_name;
    normalized.guest_name = (rawName && String(rawName).trim()) ? String(rawName).trim() : defaultGuestName;

    // 2. Dates extraction & normalization
    let rawCheckIn = rawData.check_in || rawData.checkin || rawData.arrival_date || rawData.preferred_date || rawData.start_date || rawData.date;
    let rawCheckOut = rawData.check_out || rawData.checkout || rawData.departure_date || rawData.end_date;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Normalize check-in date
    if (rawCheckIn) {
      const cinDate = new Date(rawCheckIn);
      if (!isNaN(cinDate.getTime())) {
        normalized.check_in = cinDate.toISOString().split("T")[0];
      }
    }

    // Normalize check-out date
    if (rawCheckOut) {
      const coutDate = new Date(rawCheckOut);
      if (!isNaN(coutDate.getTime())) {
        normalized.check_out = coutDate.toISOString().split("T")[0];
      }
    }

    // Default dates if missing: tomorrow to day after tomorrow (2 nights)
    if (!normalized.check_in) {
      const tmrw = new Date(today);
      tmrw.setDate(today.getDate() + 1);
      normalized.check_in = tmrw.toISOString().split("T")[0];
      normalized.dates_defaulted = true;
    }

    if (!normalized.check_out) {
      const cin = new Date(normalized.check_in);
      const cout = new Date(cin);
      cout.setDate(cin.getDate() + 2); // 2 nights default
      normalized.check_out = cout.toISOString().split("T")[0];
      normalized.dates_defaulted = true;
    }

    // Validate date sequence: check_out must be strictly after check_in
    const dIn = new Date(normalized.check_in);
    const dOut = new Date(normalized.check_out);
    if (dOut <= dIn) {
      // Auto-correct to check_in + 1 night
      const corrected = new Date(dIn);
      corrected.setDate(dIn.getDate() + 1);
      normalized.check_out = corrected.toISOString().split("T")[0];
      normalized.date_auto_corrected = true;
    }

    normalized.nights = Math.max(1, Math.round((new Date(normalized.check_out) - new Date(normalized.check_in)) / (1000 * 60 * 60 * 24)));

    // 3. Guest counts (adults, children, total)
    const rawAdults = rawData.adults || rawData.adult_count || rawData.total_guests || rawData.party_size || rawData.guests;
    let adults = parseInt(rawAdults, 10);
    if (isNaN(adults) || adults < 1) adults = 2; // Default 2 adults
    normalized.adults = adults;

    const rawChildren = rawData.children || rawData.child_count || rawData.kids;
    let children = parseInt(rawChildren, 10);
    if (isNaN(children) || children < 0) children = 0;
    normalized.children = children;

    normalized.total_guests = adults + children;

    // 4. Room preference / category selection
    const rawRoom = rawData.room_preference || rawData.room_type || rawData.selected_room || rawData.room;
    if (rawRoom && String(rawRoom).trim() && String(rawRoom).trim() !== "Any Available Room") {
      normalized.room_preference = String(rawRoom).trim();
    } else {
      normalized.room_preference = "Any Available Room";
    }

    // 5. Special requests / notes
    const rawReq = rawData.special_requests || rawData.notes || rawData.comments || rawData.requests;
    if (rawReq && String(rawReq).trim()) {
      normalized.special_requests = String(rawReq).trim();
    }

    // 6. Contact info (email, phone if provided in flow)
    if (rawData.email && String(rawData.email).trim()) {
      normalized.email = String(rawData.email).trim().toLowerCase();
    }
    if (rawData.phone && String(rawData.phone).trim()) {
      normalized.phone = String(rawData.phone).trim();
    }

    // Preserve raw fields
    normalized.custom_fields = { ...rawData };

    // Detect flow submission purpose
    const isFeedback = Boolean(rawData.overall_rating || rawData.rating || rawData.suggestions);
    const isSupport = Boolean(rawData.issue_category || rawData.issue_description || rawData.booking_id);
    const isLead = Boolean(rawData.service_interest || rawData.lead_form);
    const isBooking = !isFeedback && !isSupport && (Boolean(rawCheckIn) || Boolean(rawData.adults) || Boolean(rawRoom) || Boolean(rawData.enquiry_form) || !isLead);

    return {
      isValid: errors.length === 0,
      intakeData: normalized,
      isBooking,
      isFeedback,
      isSupport,
      isLead,
      errors
    };
  }

  /**
   * Pauses automated bot responses for a specific phone number (Staff Takeover)
   */
  pauseBotForPhone(phone, durationMs = 3600000) {
    const clean = String(phone || "").replace(/\D/g, "");
    if (!clean) return 0;
    const expiresAt = Date.now() + durationMs;
    this.botPausedUntil.set(clean, expiresAt);
    console.log(`[Webhook Flow] Bot paused for ${clean} for ${Math.round(durationMs / 60000)} minutes.`);
    return expiresAt;
  }

  /**
   * Resumes automated bot responses for a specific phone number
   */
  resumeBotForPhone(phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    if (!clean) return false;
    this.botPausedUntil.delete(clean);
    console.log(`[Webhook Flow] Bot resumed for ${clean}.`);
    return true;
  }

  /**
   * Checks whether the bot is currently paused for a phone number
   */
  isBotPausedForPhone(phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    if (!clean) return false;
    const expiry = this.botPausedUntil.get(clean);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.botPausedUntil.delete(clean);
      return false;
    }
    return true;
  }

  /**
   * Retrieves bot status and pause expiry for a phone number
   */
  getBotStatus(phone) {
    const clean = String(phone || "").replace(/\D/g, "");
    const isPaused = this.isBotPausedForPhone(clean);
    const expiresAt = this.botPausedUntil.get(clean) || null;
    return {
      phone: clean,
      isPaused,
      paused: isPaused,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      remainingMinutes: expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 60000)) : 0
    };
  }

  /**
   * Automatically detects and attributes Click-to-Chat Link or Table QR from incoming WhatsApp message
   */
  detectChatLinkAttribution(messageBody = "", cleanPhone = "", recipientPhoneOrId = null) {
    if (!messageBody && !cleanPhone) return null;
    const text = String(messageBody || "").trim();

    // 1. Explicit slug or link ID pattern: ref:slug, link:id, or [slug]
    const refMatch = text.match(/\b(?:ref|link):\s*([a-z0-9_-]+)\b/i) || text.match(/\[([a-z0-9_-]+)\]/);
    if (refMatch && refMatch[1]) {
      const slugOrId = refMatch[1].trim();
      const link = db.prepare("SELECT * FROM chat_links WHERE (slug = ? OR id = ?) AND status = 'ACTIVE' LIMIT 1").get(slugOrId, slugOrId);
      if (link) return link;
    }

    // 2. Table QR match: "Table 4" or "tab:4"
    const tableMatch = text.match(/\b(?:table|tab)\s*([0-9a-zA-Z]+)\b/i);
    if (tableMatch) {
      const tableLink = db.prepare("SELECT * FROM chat_links WHERE (category = 'DINING' OR category = 'RESTAURANT' OR title LIKE '%Table%' OR slug LIKE '%table%') AND status = 'ACTIVE' LIMIT 1").get();
      return tableLink ? { ...tableLink, detectedTable: tableMatch[1] } : { id: null, title: `Table ${tableMatch[1]} Order`, category: "DINING", detectedTable: tableMatch[1] };
    }

    // 3. Match against active chat_links.default_message or slug in text
    if (text.length >= 10) {
      const activeLinks = db.prepare("SELECT * FROM chat_links WHERE status = 'ACTIVE'").all();
      const cleanRecipient = recipientPhoneOrId ? String(recipientPhoneOrId).replace(/\D/g, "") : "";

      // Pass 1: Prioritize links strictly bound to the receiving WhatsApp Business Number / Phone ID
      if (cleanRecipient || recipientPhoneOrId) {
        for (const lk of activeLinks) {
          const lkDigits = String(lk.phone_number || "").replace(/\D/g, "");
          const isSameLine = (cleanRecipient && lkDigits.slice(-10) === cleanRecipient.slice(-10)) ||
                             (recipientPhoneOrId && lk.phone_number_id === recipientPhoneOrId);
          if (isSameLine) {
            if (lk.default_message && text.includes(lk.default_message.trim())) {
              return lk;
            }
            if (lk.slug && text.toLowerCase().includes(lk.slug.toLowerCase())) {
              return lk;
            }
          }
        }
      }

      // Pass 2: Fallback across active links if receiving phone is unstated or generic
      for (const lk of activeLinks) {
        if (lk.default_message && text.includes(lk.default_message.trim())) {
          return lk;
        }
        if (lk.slug && text.toLowerCase().includes(lk.slug.toLowerCase())) {
          return lk;
        }
      }
    }

    // 4. Fallback to existing session or past conversation link for this contact
    if (cleanPhone) {
      const pastLink = db.prepare(`
        SELECT cl.* 
        FROM customer_replies cr
        JOIN chat_links cl ON cr.link_id = cl.id
        WHERE cr.from_phone = ? AND cr.link_id IS NOT NULL
        ORDER BY cr.id DESC LIMIT 1
      `).get(cleanPhone);
      if (pastLink) return pastLink;
    }

    return null;
  }

  /**
   * Generates phone number variations to match across all formats (+91, 91, 10-digit national)
   */
  getPhoneVariations(phone) {
    const raw = String(phone || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw ? [raw] : [];

    const set = new Set([raw, digits, `+${digits}`]);
    if (digits.startsWith("91") && digits.length === 12) {
      const national = digits.substring(2);
      set.add(national);
      set.add(`+${national}`);
      set.add(`0${national}`);
    } else if (digits.length === 10) {
      set.add(`91${digits}`);
      set.add(`+91${digits}`);
      set.add(`0${digits}`);
    }
    return Array.from(set);
  }

  /**
   * Retrieves active webhook verify token from database or env
   */
  getVerifyToken() {
    return getSetting("WEBHOOK_VERIFY_TOKEN") || config.WEBHOOK_VERIFY_TOKEN || "wb_verify_konkantrip_7f3a9e2c4b810d56";
  }

  /**
   * Generates a new cryptographically secure verify token and updates DB settings
   */
  generateVerifyToken() {
    const randomBytes = crypto.randomBytes(24).toString("base64url");
    const newToken = `wb_live_${randomBytes}`;
    this.saveVerifyToken(newToken);
    return newToken;
  }

  /**
   * Ensures a valid system-generated verify token exists on initial startup
   */
  ensureDefaultVerifyToken() {
    const current = getSetting("WEBHOOK_VERIFY_TOKEN");
    if (!current || current === "wb_verify_konkantrip_7f3a9e2c4b810d56" || current.startsWith("EAAX_") || current.includes("placeholder")) {
      const initialToken = this.generateVerifyToken();
      console.log(`[WebhookService] Auto-provisioned secure system webhook verify token: ${initialToken}`);
      return initialToken;
    }
    return current;
  }

  /**
   * Resolves primary and secondary Webhook URLs with proxy and custom domain support
   */
  resolveWebhookUrls(req = null) {
    const publicUrl = getSetting("PUBLIC_WEBHOOK_URL") || process.env.PUBLIC_WEBHOOK_URL || null;
    let host = null;
    let protocol = "https";

    if (req) {
      host = req.get("x-forwarded-host") || req.get("host") || `localhost:${config.PORT || 5000}`;
      protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    } else {
      host = `localhost:${config.PORT || 5000}`;
      protocol = config.NODE_ENV === "production" ? "https" : "http";
    }

    const cleanBaseUrl = publicUrl ? publicUrl.replace(/\/+$/, "") : `${protocol}://${host}`;
    return {
      primaryUrl: `${cleanBaseUrl}/webhook`,
      altUrl: `${cleanBaseUrl}/api/webhook`,
      baseUrl: cleanBaseUrl,
      isCustomOverride: Boolean(publicUrl),
      isHttps: cleanBaseUrl.startsWith("https://")
    };
  }

  /**
   * Performs an instant in-memory verification handshake test
   */
  testHandshake(token = null, challenge = "meta_test_challenge_11582012") {
    const start = Date.now();
    const testToken = token || this.getVerifyToken();
    const result = this.verifyHandshake({
      "hub.mode": "subscribe",
      "hub.verify_token": testToken,
      "hub.challenge": challenge
    });
    const latencyMs = Math.max(1, Date.now() - start);

    return {
      success: result.verified,
      challengeEchoed: result.challenge === challenge,
      challenge,
      tokenUsedPreview: testToken ? `${testToken.substring(0, 8)}••••` : null,
      latencyMs,
      verifiedAt: new Date().toISOString()
    };
  }

  /**
   * Saves verify token to DB settings table (fully managed inside system)
   */
  saveVerifyToken(token) {
    if (!token || !String(token).trim()) {
      throw new Error("Verify token cannot be empty");
    }
    const cleanToken = String(token).trim();
    setSetting("WEBHOOK_VERIFY_TOKEN", cleanToken);
    return cleanToken;
  }

  /**
   * Verifies the Meta Webhook handshake request (hub.mode, hub.verify_token, hub.challenge)
   */
  verifyHandshake(query) {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];
    const expectedToken = this.getVerifyToken();

    const validTokens = new Set([
      expectedToken,
      getSetting("WEBHOOK_VERIFY_TOKEN"),
      config.WEBHOOK_VERIFY_TOKEN,
      process.env.WEBHOOK_VERIFY_TOKEN,
      "wb_verify_konkantrip_7f3a9e2c4b810d56"
    ].filter(Boolean).map(t => String(t).trim()));

    if (mode === "subscribe" && token && validTokens.has(String(token).trim())) {
      console.log("[Webhook] Meta handshake verification SUCCEEDED for token:", token);
      return { verified: true, challenge };
    }

    console.warn(`[Webhook] Verification FAILED. Expected: ${expectedToken}, Received: ${token}`);
    return { verified: false, challenge: null };
  }

  /**
   * Parses and processes incoming Webhook notification payload from Meta
   */
  async processIncomingPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return { processed: 0, messages: 0, statuses: 0 };
    }

    let entries = Array.isArray(payload.entry) ? payload.entry : [];

    // Enterprise Resilient Fallback: support direct unwrapped payload from webhook proxies / cloud relays
    if (entries.length === 0 && (Array.isArray(payload.messages) || Array.isArray(payload.statuses))) {
      entries = [{
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: payload.metadata || {},
            contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
            messages: Array.isArray(payload.messages) ? payload.messages : [],
            statuses: Array.isArray(payload.statuses) ? payload.statuses : []
          }
        }]
      }];
    }

    let processedMessages = 0;
    let processedStatuses = 0;

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change.value || {};

        // 0. Process Template Status Updates from Meta (APPROVED, REJECTED, PAUSED, PENDING_DELETION)
        if (change.field === "message_template_status_update" && val && (val.message_template_id || val.message_template_name)) {
          try {
            const tplEvent = String(val.event || val.status || "").toUpperCase();
            const tplId = val.message_template_id ? String(val.message_template_id) : null;
            const tplName = val.message_template_name ? String(val.message_template_name) : null;
            const reason = val.reason || val.other_info?.title || null;
            if (tplEvent) {
              db.prepare(`
                UPDATE templates
                SET status = ?,
                    rejection_reason = CASE WHEN ? IS NOT NULL AND ? != 'NONE' THEN ? ELSE rejection_reason END,
                    approved_at = CASE WHEN ? = 'APPROVED' THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE meta_id = ? OR id = ? OR (name = ? AND language = COALESCE(?, language))
              `).run(tplEvent, reason, reason, reason, tplEvent, tplId || "", tplId || "", tplName || "", val.message_template_language || null);
              processedStatuses++;
            }
          } catch (tplErr) {
            console.warn("[Webhook] Template status update notice:", tplErr.message);
          }
        }

        // 1. Process Incoming Customer Messages / Replies
        if (Array.isArray(val.messages) && val.messages.length > 0) {
          const contacts = Array.isArray(val.contacts) ? val.contacts : [];

          for (const msg of val.messages) {
            try {
              const result = this.saveCustomerReply(msg, contacts, val);
              if (result && result.saved) {
                processedMessages++;
                // Emit real-time event for SSE clients
                broadcastEngine.emit("webhook:reply", result.reply);

                // Conversational Flow Engine & Auto-Reply trigger (asynchronous)
                this.triggerAutoReply(result.reply, msg, val).catch(arErr => {
                  console.error("[Webhook Flow] Error:", arErr.message);
                });
              } else if (result && !result.saved && result.id) {
                // Duplicate webhook delivery from Meta - ignore to prevent duplicate bot replies
                console.log(`[Webhook] Duplicate delivery ignored for message #${result.id}`);
              }
            } catch (err) {
              console.error("[Webhook] Error saving customer reply:", err);
            }
          }
        }

        // 2. Process Delivery Status Updates (SENT, DELIVERED, READ, FAILED)
        if (Array.isArray(val.statuses) && val.statuses.length > 0) {
          for (const st of val.statuses) {
            try {
              const updated = this.updateRecipientDeliveryStatus(st);
              if (updated) {
                processedStatuses++;
                broadcastEngine.emit("webhook:status", st);
              }
            } catch (err) {
              console.error("[Webhook] Error processing delivery status:", err);
            }
          }
        }
      }
    }

    return {
      processed: processedMessages + processedStatuses,
      messages: processedMessages,
      statuses: processedStatuses
    };
  }

  /**
   * Saves incoming customer message to customer_replies table
   */
  saveCustomerReply(msg, contacts = [], rawValue = {}) {
    const waMessageId = msg.id;
    if (!waMessageId) return null;

    // Check if message already exists (idempotency)
    const existing = db.prepare("SELECT id FROM customer_replies WHERE wa_message_id = ?").get(waMessageId);
    if (existing) {
      console.log(`[Webhook] Duplicate message ID skipped: ${waMessageId}`);
      return { saved: false, id: existing.id, duplicate: true };
    }

    const fromPhone = String(msg.from || "").trim();
    const cleanPhone = fromPhone.replace(/\D/g, "");

    // Extract profile name from Meta contacts list
    const contactObj = contacts.find(c => c.wa_id === fromPhone || c.wa_id === cleanPhone);
    let customerName = contactObj?.profile?.name || "";

    // Parse message body by type
    const msgType = msg.type || "text";
    let messageBody = "";

    switch (msgType) {
      case "text":
        messageBody = msg.text?.body || "";
        break;
      case "button":
        messageBody = msg.button?.text || msg.button?.payload || "[Button Clicked]";
        break;
      case "interactive": {
        const interactiveType = msg.interactive?.type;
        if (interactiveType === "nfm_reply" && msg.interactive?.nfm_reply) {
          const nfm = msg.interactive.nfm_reply;
          let parsedResponse = {};
          try {
            parsedResponse = typeof nfm.response_json === "string" ? JSON.parse(nfm.response_json) : (nfm.response_json || {});
          } catch (e) {
            parsedResponse = { raw: nfm.response_json };
          }
          const fieldEntries = Object.entries(parsedResponse).filter(([k]) => k !== "flow_token");
          const fieldsSummary = fieldEntries
            .map(([k, v]) => `${k.replace(/^[a-zA-Z0-9]+_/, "")}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
            .slice(0, 4)
            .join(", ");
          messageBody = `[Flow Completed] ${fieldsSummary || nfm.body || "Form submitted"}`;
        } else {
          messageBody =
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            msg.interactive?.button_reply?.id ||
            "[Interactive Reply]";
        }
        break;
      }
      case "reaction":
        messageBody = msg.reaction?.emoji ? `[Reaction: ${msg.reaction.emoji}]` : "[Reaction]";
        break;
      case "image":
        messageBody = msg.image?.caption ? `[Image] ${msg.image.caption}` : "[Image received]";
        break;
      case "document":
        messageBody = msg.document?.filename ? `[Document] ${msg.document.filename}` : "[Document received]";
        break;
      case "audio":
        messageBody = msg.audio?.voice ? "[Voice Note]" : "[Audio received]";
        break;
      case "video":
        messageBody = msg.video?.caption ? `[Video] ${msg.video.caption}` : "[Video received]";
        break;
      case "location":
        messageBody = msg.location?.name
          ? `[Location: ${msg.location.name}]`
          : `[Location: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
        break;
      default:
        messageBody = `[${msgType} message]`;
    }

    const contextMsgId = msg.context?.id || null;
    let matchedCampaignId = null;

    // 1. Try to match campaign via context.id (reply to a sent broadcast template)
    if (contextMsgId) {
      const matchByContext = db.prepare(`
        SELECT campaign_id, contact_name 
        FROM campaign_recipients 
        WHERE meta_message_id = ? 
        LIMIT 1
      `).get(contextMsgId);

      if (matchByContext) {
        matchedCampaignId = matchByContext.campaign_id;
        if (!customerName && matchByContext.contact_name) {
          customerName = matchByContext.contact_name;
        }
      }
    }

    // 2. If no context match, match most recent campaign for this recipient phone
    if (!matchedCampaignId && cleanPhone) {
      const matchByPhone = db.prepare(`
        SELECT campaign_id, contact_name 
        FROM campaign_recipients 
        WHERE clean_phone = ? OR phone_number = ? 
        ORDER BY id DESC 
        LIMIT 1
      `).get(cleanPhone, fromPhone);

      if (matchByPhone) {
        matchedCampaignId = matchByPhone.campaign_id;
        if (!customerName && matchByPhone.contact_name) {
          customerName = matchByPhone.contact_name;
        }
      }
    }

    // Convert UNIX timestamp to ISO string
    let receivedAt = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (msg.timestamp) {
      const tsMs = parseInt(msg.timestamp, 10) * 1000;
      if (!isNaN(tsMs)) {
        receivedAt = new Date(tsMs).toISOString().replace("T", " ").substring(0, 19);
      }
    }

    // Extract media metadata if incoming message is image, video, document, audio, or sticker
    let incomingMediaId = null;
    let incomingMediaUrl = null;
    let incomingMediaType = null;
    let incomingMediaCaption = null;

    if (msgType === "image") {
      incomingMediaType = "image";
      incomingMediaId = msg.image?.id || null;
      incomingMediaCaption = msg.image?.caption || null;
    } else if (msgType === "video") {
      incomingMediaType = "video";
      incomingMediaId = msg.video?.id || null;
      incomingMediaCaption = msg.video?.caption || null;
    } else if (msgType === "document") {
      incomingMediaType = "document";
      incomingMediaId = msg.document?.id || null;
      incomingMediaCaption = msg.document?.filename || msg.document?.caption || null;
    } else if (msgType === "audio") {
      incomingMediaType = "audio";
      incomingMediaId = msg.audio?.id || null;
      incomingMediaCaption = msg.audio?.voice ? "Voice Note" : null;
    } else if (msgType === "sticker") {
      incomingMediaType = "image";
      incomingMediaId = msg.sticker?.id || null;
    }

    if (incomingMediaId) {
      // Check if file was already downloaded to disk previously
      try {
        const inboundDir = path.resolve(__dirname, "../../public/uploads/inbound");
        if (fs.existsSync(inboundDir)) {
          const matched = fs.readdirSync(inboundDir).find(f => f.startsWith(`${incomingMediaId}.`));
          if (matched) {
            incomingMediaUrl = `/uploads/inbound/${matched}`;
          }
        }
      } catch (e) {}

      // Fallback to proxy route so it can be streamed or downloaded on demand
      if (!incomingMediaUrl) {
        incomingMediaUrl = `/api/media/inbound/${incomingMediaId}`;
      }
    }

    // Resolve owning user_id for multi-tenant isolation
    let replyUserId = null;
    if (matchedCampaignId) {
      const camp = db.prepare("SELECT user_id FROM campaigns WHERE id = ?").get(matchedCampaignId);
      if (camp?.user_id) replyUserId = camp.user_id;
    }
    if (!replyUserId && cleanPhone) {
      const pastCamp = db.prepare(`
        SELECT c.user_id 
        FROM campaign_recipients cr 
        JOIN campaigns c ON cr.campaign_id = c.id 
        WHERE cr.clean_phone = ? 
        ORDER BY cr.id DESC LIMIT 1
      `).get(cleanPhone);
      if (pastCamp?.user_id) replyUserId = pastCamp.user_id;
    }
    if (!replyUserId) {
      try {
        const ph = db.prepare("SELECT registered_by FROM waba_phone_numbers WHERE is_default = 1").get();
        if (ph?.registered_by) replyUserId = ph.registered_by;
      } catch (e) {}
    }
    if (!replyUserId) {
      try {
        const primaryAdmin = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY created_at ASC LIMIT 1").get();
        if (primaryAdmin?.id) replyUserId = primaryAdmin.id;
      } catch (e) {}
    }

    // Auto-opt-out detection (Suppression handling)
    const normalizedBody = String(messageBody || "").trim().toUpperCase();
    if (["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL"].includes(normalizedBody)) {
      try {
        db.prepare(`
          INSERT OR REPLACE INTO contact_suppressions (clean_phone, reason, user_id, created_at)
          VALUES (?, 'USER_OPT_OUT', ?, CURRENT_TIMESTAMP)
        `).run(cleanPhone, replyUserId);
        const maskedPhone = cleanPhone.length > 4 ? `***${cleanPhone.slice(-4)}` : "***";
        console.log(`[Opt-Out] Contact ${maskedPhone} opted out via STOP keyword.`);
      } catch (optErr) {
        console.warn("[Opt-Out] Suppression insert notice:", optErr.message);
      }
    }

    // ---------------------------------------------------------------------
    // Flow Submission Processing (nfm_reply)
    // ---------------------------------------------------------------------
    let flowId = null;
    let flowResponseId = null;
    if (msgType === "interactive" && msg.interactive?.type === "nfm_reply") {
      const nfm = msg.interactive.nfm_reply;
      let parsedResponse = {};
      try {
        parsedResponse = typeof nfm.response_json === "string" ? JSON.parse(nfm.response_json) : (nfm.response_json || {});
      } catch (e) {
        parsedResponse = { raw: nfm.response_json };
      }

      const clientToken = parsedResponse.flow_token;
      let tokenRecord = null;
      if (clientToken) {
        tokenRecord = db.prepare("SELECT * FROM flow_tokens WHERE token = ?").get(clientToken);
      }
      if (!tokenRecord && contextMsgId) {
        tokenRecord = db.prepare("SELECT * FROM flow_tokens WHERE meta_message_id = ?").get(contextMsgId);
      }
      if (!tokenRecord && cleanPhone) {
        tokenRecord = db.prepare("SELECT * FROM flow_tokens WHERE clean_phone = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1").get(cleanPhone);
      }

      if (tokenRecord) {
        flowId = tokenRecord.flow_id;
        if (!replyUserId && tokenRecord.user_id) replyUserId = tokenRecord.user_id;
        if (!matchedCampaignId && tokenRecord.campaign_id) matchedCampaignId = tokenRecord.campaign_id;
        try {
          db.prepare("UPDATE flow_tokens SET status = 'COMPLETED' WHERE id = ?").run(tokenRecord.id);
        } catch (e) {}
      }

      // Lookup flow title for clean message body
      if (flowId) {
        try {
          const flowMeta = db.prepare("SELECT name FROM whatsapp_flows WHERE id = ? OR meta_flow_id = ?").get(flowId, flowId);
          if (flowMeta?.name) {
            const fieldEntries = Object.entries(parsedResponse).filter(([k]) => k !== "flow_token");
            const fieldsSummary = fieldEntries
              .map(([k, v]) => `${k.replace(/^[a-zA-Z0-9]+_/, "")}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .slice(0, 4)
              .join(", ");
            messageBody = `[Flow: ${flowMeta.name}] ${fieldsSummary || "Form submitted"}`;
          }
        } catch (e) {}
      }

      // Insert into flow_responses (idempotent by wa_message_id)
      try {
        const flowValidation = this.validateAndNormalizeFlowSubmission(parsedResponse, customerName);
        const normalizedData = flowValidation.intakeData || parsedResponse;
        const jsonString = typeof nfm.response_json === "string" ? nfm.response_json : JSON.stringify(nfm.response_json || {});
        const insertFlowResp = db.prepare(`
          INSERT OR IGNORE INTO flow_responses (
            flow_id, flow_token, wa_message_id, from_phone, sender_phone, clean_phone,
            customer_name, response_json, response_data, parsed_data, user_id, campaign_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        const respResult = insertFlowResp.run(
          flowId || (tokenRecord?.flow_id || "unassigned_flow"),
          tokenRecord?.token || clientToken || "untracked",
          waMessageId,
          fromPhone,
          fromPhone,
          cleanPhone,
          normalizedData.guest_name || customerName,
          jsonString,
          jsonString,
          JSON.stringify(normalizedData),
          replyUserId,
          matchedCampaignId
        );
        flowResponseId = respResult.lastInsertRowid || null;

        // Broadcast real-time SSE event
        broadcastEngine.emit("webhook:flow_response", {
          responseId: flowResponseId,
          flowId,
          customerName: normalizedData.guest_name || customerName,
          fromPhone,
          cleanPhone,
          answers: normalizedData,
          validation: {
            isValid: flowValidation.isValid,
            isBooking: flowValidation.isBooking,
            isFeedback: flowValidation.isFeedback,
            isSupport: flowValidation.isSupport
          }
        });

        // PRD PR-007: Automatic Booking Enquiry Creation from Flow Submission
        if (flowValidation.isBooking && normalizedData.check_in && normalizedData.check_out) {
          try {
            const enquiryService = require("./enquiryService");
            enquiryService.createEnquiry(1, {
              phone: cleanPhone,
              guest_name: normalizedData.guest_name || customerName,
              check_in: normalizedData.check_in,
              check_out: normalizedData.check_out,
              adults: Number(normalizedData.adults || 2),
              children: Number(normalizedData.children || 0),
              room_preference: normalizedData.room_preference,
              flow_session_id: waMessageId || clientToken || `flow_${Date.now()}`,
              preferences: normalizedData
            });
          } catch (enquiryErr) {
            console.warn("[WebhookService] Auto-enquiry creation notice:", enquiryErr.message);
          }
        }
      } catch (respErr) {
        console.warn("[Webhook FlowResponse] Insert notice:", respErr.message);
      }
    }

    // PRD Attribution: Automatically detect and associate Click-to-Chat Link or Table QR
    let matchedLinkId = null;
    let matchedLink = null;
    try {
      const recipientLine = rawValue?.metadata?.display_phone_number || rawValue?.metadata?.phone_number_id || null;
      matchedLink = this.detectChatLinkAttribution(messageBody, cleanPhone, recipientLine);
      if (matchedLink) {
        matchedLinkId = matchedLink.id;
        if (!replyUserId && matchedLink.user_id && matchedLink.user_id !== "bot") {
          replyUserId = matchedLink.user_id;
        }
        // Increment conversations counter on chat_links
        try {
          db.prepare("UPDATE chat_links SET conversations_count = conversations_count + 1 WHERE id = ?").run(matchedLink.id);
        } catch (e) {}

        // PRD: Upsert contact and capture consent for chat link lead
        if (enquiryService) {
          try {
            const contact = enquiryService.upsertContact(matchedLink.tenant_id || 1, cleanPhone, customerName, null, "CHAT_LINK");
            if (contact?.id) {
              db.prepare(`
                INSERT INTO contact_consents (tenant_id, contact_id, purpose, status, source)
                VALUES (?, ?, 'CHAT_LINK', 'GRANTED', 'WHATSAPP_INBOUND')
              `).run(matchedLink.tenant_id || 1, contact.id);
            }
          } catch (e) {}
        }
      }
    } catch (attrErr) {
      console.warn("[Webhook Attribution] Match warning:", attrErr.message);
    }

    const replySource = matchedLinkId ? "CHAT_LINK" : "WHATSAPP";

    const insertStmt = db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, raw_payload, context_message_id, campaign_id,
        media_url, media_type, media_caption, flow_id, flow_response_id,
        link_id, source, is_read, user_id, received_at, reply_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'PENDING_REPLY')
    `);

    const runResult = insertStmt.run(
      waMessageId,
      fromPhone,
      customerName,
      msgType,
      messageBody,
      JSON.stringify(msg),
      contextMsgId,
      matchedCampaignId,
      incomingMediaUrl,
      incomingMediaType,
      incomingMediaCaption,
      flowId,
      flowResponseId,
      matchedLinkId,
      replySource,
      replyUserId,
      receivedAt
    );

    const maskedSender = cleanPhone.length > 4 ? `***${cleanPhone.slice(-4)}` : "***";
    console.log(`[Webhook] Saved customer reply #${runResult.lastInsertRowid} from ${maskedSender} (type: ${msgType}, link: ${matchedLinkId || 'direct'})`);

    // PRD PR-004: Upsert contact for incoming guest message
    try {
      const enquiryService = require("./enquiryService");
      enquiryService.upsertContact(1, cleanPhone, customerName, null, "WHATSAPP_INBOUND");
    } catch (contactErr) {}

    // If inbound media needs background downloading from Meta
    if (incomingMediaId && (!incomingMediaUrl || incomingMediaUrl.startsWith("/api/media/inbound/"))) {
      this.downloadMediaInBackground(runResult.lastInsertRowid, incomingMediaId, incomingMediaType);
    }

    // Fetch saved record with joined campaign name
    const savedRecord = db.prepare(`
      SELECT r.*, c.name as campaign_name 
      FROM customer_replies r 
      LEFT JOIN campaigns c ON r.campaign_id = c.id 
      WHERE r.id = ?
    `).get(runResult.lastInsertRowid);

    return { saved: true, reply: savedRecord };
  }

  /**
   * Helper to handle customer reply for ingestion and webhook testing
   */
  async handleCustomerReply(msg, customerName = "") {
    if (!msg || !msg.id) return null;
    const existing = db.prepare("SELECT id FROM customer_replies WHERE wa_message_id = ?").get(msg.id);
    if (existing) {
      return null;
    }

    const contacts = customerName ? [{ wa_id: msg.from, profile: { name: customerName } }] : [];
    const res = this.saveCustomerReply(msg, contacts);
    if (!res || !res.saved || !res.reply) {
      return null;
    }

    const reply = res.reply;
    const isFlow = (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") || reply.flow_id || reply.flow_response_id;
    const returnType = isFlow ? "flow_response" : (reply.message_type || msg.type);

    return {
      ...reply,
      wa_message_id: reply.wa_message_id,
      message_type: returnType,
      text: reply.message_body || ""
    };
  }

  /**
   * Downloads incoming media asynchronously from Meta and updates customer_replies record
   */
  async downloadMediaInBackground(replyId, mediaId, mediaType) {
    if (!mediaId || !replyId) return;
    try {
      const res = await downloadAndSaveInboundMedia(mediaId);
      if (res && res.relativeUrl) {
        db.prepare("UPDATE customer_replies SET media_url = ?, media_type = ? WHERE id = ?")
          .run(res.relativeUrl, mediaType || "image", replyId);

        const updated = db.prepare(`
          SELECT r.*, c.name as campaign_name 
          FROM customer_replies r 
          LEFT JOIN campaigns c ON r.campaign_id = c.id 
          WHERE r.id = ?
        `).get(replyId);

        if (updated) {
          broadcastEngine.emit("webhook:reply_updated", updated);
        }
      }
    } catch (err) {
      console.warn(`[WebhookService] Background media download for reply #${replyId} (${mediaId}):`, err.message);
    }
  }

  /**
   * Updates campaign_recipients delivery status (DELIVERED, READ, FAILED)
   */
  updateRecipientDeliveryStatus(statusObj) {
    const metaMessageId = statusObj.id;
    if (!metaMessageId) return false;

    const rawStatus = String(statusObj.status || "").toUpperCase();
    let newStatus = rawStatus;

    if (rawStatus === "DELIVERED") {
      newStatus = "DELIVERED";
    } else if (rawStatus === "READ") {
      newStatus = "READ";
    } else if (rawStatus === "FAILED") {
      newStatus = "FAILED";
    } else {
      return false; // ignore other states like 'sent'
    }

    // Resolve event timestamp from Meta payload (UNIX epoch seconds)
    let eventTime = new Date().toISOString().replace("T", " ").substring(0, 19);
    if (statusObj.timestamp) {
      const tsSec = parseInt(statusObj.timestamp, 10);
      if (!isNaN(tsSec) && tsSec > 0) {
        eventTime = new Date(tsSec * 1000).toISOString().replace("T", " ").substring(0, 19);
      }
    }

    // Update unified whatsapp_messages & whatsapp_usage_ledger tables if tracking this meta_message_id
    let updatedUnified = false;
    try {
      let waErrMsg = null;
      let waErrCode = null;
      if (newStatus === "FAILED" && Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
        const firstErr = statusObj.errors[0];
        waErrCode = String(firstErr.code || "");
        if (waErrCode === "131049") {
          waErrMsg = "Meta Marketing Cap (131049): Recipient reached WhatsApp's promo limit. Not billed — auto-paused for 24h.";
        } else {
          waErrMsg = firstErr.message || firstErr.title || `Meta delivery error (${waErrCode})`;
        }
      }

      if (newStatus === "DELIVERED") {
        const resWa = db.prepare(`
          UPDATE whatsapp_messages
          SET status = CASE WHEN status = 'READ' THEN 'READ' ELSE 'DELIVERED' END,
              delivered_at = COALESCE(delivered_at, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE meta_message_id = ?
        `).run(eventTime, metaMessageId);
        updatedUnified = resWa.changes > 0;
        db.prepare(`UPDATE whatsapp_usage_ledger SET billing_status = 'RECORDED' WHERE meta_message_id = ?`).run(metaMessageId);
      } else if (newStatus === "READ") {
        const resWa = db.prepare(`
          UPDATE whatsapp_messages
          SET status = 'READ',
              read_at = COALESCE(read_at, ?),
              delivered_at = COALESCE(delivered_at, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE meta_message_id = ?
        `).run(eventTime, eventTime, metaMessageId);
        updatedUnified = resWa.changes > 0;
        db.prepare(`UPDATE whatsapp_usage_ledger SET billing_status = 'RECORDED' WHERE meta_message_id = ?`).run(metaMessageId);
      } else if (newStatus === "FAILED") {
        const resWa = db.prepare(`
          UPDATE whatsapp_messages
          SET status = 'FAILED',
              error_code = ?,
              error_message = ?,
              failed_at = COALESCE(failed_at, ?),
              updated_at = CURRENT_TIMESTAMP
          WHERE meta_message_id = ?
        `).run(waErrCode, waErrMsg, eventTime, metaMessageId);
        updatedUnified = resWa.changes > 0;
        db.prepare(`UPDATE whatsapp_usage_ledger SET billing_status = 'WAIVED', unit_cost = 0 WHERE meta_message_id = ?`).run(metaMessageId);

        if (waErrCode === "131049") {
          const msgInfo = db.prepare(`SELECT tenant_id, recipient_phone, phone_number_id FROM whatsapp_messages WHERE meta_message_id = ?`).get(metaMessageId);
          const phoneE164 = statusObj.recipient_id || msgInfo?.recipient_phone;
          if (phoneE164) {
            const cleanPhone = String(phoneE164).replace(/\D/g, "");
            try {
              db.prepare(`
                INSERT INTO contact_marketing_cooldowns (
                  tenant_id, phone_e164, phone_number_id, error_code, reason, cooldown_until, created_at, updated_at
                ) VALUES (
                  ?, ?, ?, '131049', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), UTC_TIMESTAMP()
                )
                ON DUPLICATE KEY UPDATE
                  phone_number_id = COALESCE(VALUES(phone_number_id), phone_number_id),
                  error_code = '131049',
                  reason = VALUES(reason),
                  cooldown_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
                  updated_at = UTC_TIMESTAMP()
              `).run(
                msgInfo?.tenant_id || 1,
                cleanPhone,
                msgInfo?.phone_number_id || null,
                waErrMsg
              );
            } catch (cdErr) {
              console.warn("[Webhook] Failed to insert contact_marketing_cooldowns:", cdErr.message);
            }
          }
        }
      }
    } catch (waSyncErr) {}

    // Check existing recipient record (indexed by meta_message_id for O(1) lookup)
    const recipient = db.prepare(`
      SELECT id, status, campaign_id, delivered_at, read_at 
      FROM campaign_recipients 
      WHERE meta_message_id = ?
    `).get(metaMessageId);

    if (!recipient) {
      return updatedUnified;
    }

    // Idempotency: Do not downgrade READ -> DELIVERED
    if (recipient.status === "READ" && newStatus === "DELIVERED") {
      return false;
    }

    let errorMsg = null;
    let errorCode = null;
    if (newStatus === "FAILED" && Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
      const err = statusObj.errors[0];
      errorCode = String(err.code || "");
      if (errorCode === "131049") {
        errorMsg = "Meta Marketing Cap (131049): Recipient reached WhatsApp's promo limit. Not billed — auto-paused for 24h.";
      } else {
        errorMsg = err.message || err.title || `Meta delivery error (${errorCode})`;
        if (err.error_data?.details) {
          errorMsg += ` - ${err.error_data.details}`;
        }
      }
    }

    // Update recipient with stage-specific delivery timestamps
    if (newStatus === "DELIVERED") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'DELIVERED', delivered_at = COALESCE(delivered_at, ?) 
        WHERE id = ?
      `).run(eventTime, recipient.id);

      if (recipient.campaign_id && recipient.status !== "DELIVERED" && recipient.status !== "READ") {
        try {
          db.prepare("UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id = ?").run(recipient.campaign_id);
        } catch (e) {}
      }
    } else if (newStatus === "READ") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'READ', read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?) 
        WHERE id = ?
      `).run(eventTime, eventTime, recipient.id);

      if (recipient.campaign_id && recipient.status !== "READ") {
        try {
          const isFirstDelivery = recipient.status !== "DELIVERED";
          db.prepare(`
            UPDATE campaigns 
            SET read_count = read_count + 1
            ${isFirstDelivery ? ", delivered_count = delivered_count + 1" : ""}
            WHERE id = ?
          `).run(recipient.campaign_id);
        } catch (e) {}
      }
    } else if (newStatus === "FAILED") {
      db.prepare(`
        UPDATE campaign_recipients 
        SET status = 'FAILED', error_message = ?, error_code = ?, failed_at = COALESCE(failed_at, ?) 
        WHERE id = ?
      `).run(errorMsg, errorCode, eventTime, recipient.id);

      if (errorCode === "131049") {
        try {
          const recRow = db.prepare("SELECT clean_phone, phone, campaign_id FROM campaign_recipients WHERE id = ?").get(recipient.id);
          const campRow = recRow?.campaign_id ? db.prepare("SELECT tenant_id, phone_number_id FROM campaigns WHERE id = ?").get(recRow.campaign_id) : null;
          const phoneE164 = statusObj.recipient_id || recRow?.clean_phone || recRow?.phone;
          if (phoneE164) {
            const cleanPhone = String(phoneE164).replace(/\D/g, "");
            db.prepare(`
              INSERT INTO contact_marketing_cooldowns (
                tenant_id, phone_e164, phone_number_id, error_code, reason, cooldown_until, created_at, updated_at
              ) VALUES (
                ?, ?, ?, '131049', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), UTC_TIMESTAMP()
              )
              ON DUPLICATE KEY UPDATE
                phone_number_id = COALESCE(VALUES(phone_number_id), phone_number_id),
                error_code = '131049',
                reason = VALUES(reason),
                cooldown_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR),
                updated_at = UTC_TIMESTAMP()
            `).run(
              campRow?.tenant_id || 1,
              cleanPhone,
              campRow?.phone_number_id || null,
              errorMsg
            );
          }
        } catch (cdErr) {
          console.warn("[Webhook] Failed to insert contact_marketing_cooldowns for recipient:", cdErr.message);
        }
      }

      if (newStatus === "FAILED" && recipient.status !== "FAILED" && recipient.campaign_id) {
        try {
          db.prepare(`
            UPDATE campaigns 
            SET sent_count = MAX(0, sent_count - 1), failed_count = failed_count + 1 
            WHERE id = ?
          `).run(recipient.campaign_id);
        } catch (err) {}
      }
    }

    return true;
  }

  /**
   * Retrieves customer replies and outbound broadcast messages with filtering, searching, and pagination
   */
  getReplies({ limit = 50, offset = 0, search = "", campaignId = "", unreadOnly = false, userId = null, repliesOnly = true }) {
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 2000);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
    const onlyWithReplies = repliesOnly === undefined ? true : (repliesOnly === true || repliesOnly === "true" || repliesOnly === "1" || repliesOnly === 1);

    const conditions = [];
    const params = [];

    // Tenant scoping (match assigned user or campaign owner)
    if (userId) {
      conditions.push("(m.user_id = ? OR m.campaign_user_id = ?)");
      params.push(userId, userId);
    }

    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      conditions.push("(m.from_phone LIKE ? OR m.customer_name LIKE ? OR m.message_body LIKE ?)");
      params.push(q, q, q);
    }

    if (campaignId && String(campaignId).trim()) {
      conditions.push("m.campaign_id = ?");
      params.push(String(campaignId).trim());
    }

    if (unreadOnly === true || unreadOnly === "true" || unreadOnly === 1 || unreadOnly === "1") {
      conditions.push("m.is_read = 0");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 2-Way Inbox scoping: when onlyWithReplies is true, only include broadcast dispatches for contacts who actually replied
    const repliesFilterClause = onlyWithReplies
      ? "AND cr.clean_phone IN (SELECT from_phone FROM customer_replies WHERE message_type != 'outbound')"
      : "";

    const cteSql = `
      WITH combined_messages AS (
        SELECT 
          r.id as id,
          r.wa_message_id as wa_message_id,
          r.from_phone as from_phone,
          r.customer_name as customer_name,
          r.message_type as message_type,
          r.message_body as message_body,
          r.raw_payload as raw_payload,
          r.context_message_id as context_message_id,
          r.campaign_id as campaign_id,
          r.is_read as is_read,
          r.received_at as received_at,
          r.reply_text as reply_text,
          r.reply_sent_at as reply_sent_at,
          r.reply_status as reply_status,
          r.media_url as media_url,
          r.media_type as media_type,
          r.media_caption as media_caption,
          COALESCE(r.user_id, l.user_id) as user_id,
          r.link_id as link_id,
          r.source as source,
          l.title as link_title,
          l.slug as link_slug,
          c.name as campaign_name,
          c.user_id as campaign_user_id,
          c.template_name as template_name,
          c.message_body as campaign_message_body,
          NULL as recipient_raw_data
        FROM customer_replies r
        LEFT JOIN campaigns c ON r.campaign_id = c.id
        LEFT JOIN chat_links l ON r.link_id = l.id

        UNION ALL

        SELECT 
          CONCAT('cr_', cr.id) as id,
          cr.meta_message_id as wa_message_id,
          cr.clean_phone as from_phone,
          cr.contact_name as customer_name,
          'outbound' as message_type,
          cr.rendered_message as message_body,
          cr.raw_data as raw_payload,
          NULL as context_message_id,
          cr.campaign_id as campaign_id,
          1 as is_read,
          cr.sent_at as received_at,
          NULL as reply_text,
          NULL as reply_sent_at,
          cr.status as reply_status,
          NULL as media_url,
          NULL as media_type,
          NULL as media_caption,
          c.user_id as user_id,
          NULL as link_id,
          NULL as source,
          NULL as link_title,
          NULL as link_slug,
          c.name as campaign_name,
          c.user_id as campaign_user_id,
          c.template_name as template_name,
          c.message_body as campaign_message_body,
          cr.raw_data as recipient_raw_data
        FROM campaign_recipients cr
        LEFT JOIN campaigns c ON cr.campaign_id = c.id
        WHERE cr.status IN ('SENT', 'DELIVERED', 'READ') AND cr.sent_at IS NOT NULL
        ${repliesFilterClause}
      )
    `;

    // Total count
    const countSql = `${cteSql} SELECT COUNT(*) as total FROM combined_messages m ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).total;

    // Unread count
    const unreadConditions = ["m.is_read = 0"];
    const unreadParams = [];
    if (userId) {
      unreadConditions.push("(m.user_id = ? OR m.campaign_user_id = ?)");
      unreadParams.push(userId, userId);
    }
    const unreadSql = `${cteSql} SELECT COUNT(*) as unread FROM combined_messages m WHERE ${unreadConditions.join(" AND ")}`;
    const unreadCount = db.prepare(unreadSql).get(...unreadParams).unread;

    // Distinct customer contacts count
    const distinctConditions = [];
    const distinctParams = [];
    if (userId) {
      distinctConditions.push("(m.user_id = ? OR m.campaign_user_id = ?)");
      distinctParams.push(userId, userId);
    }
    const distinctWhere = distinctConditions.length > 0 ? `WHERE ${distinctConditions.join(" AND ")}` : "";
    const distinctSql = `${cteSql} SELECT COUNT(DISTINCT m.from_phone) as count FROM combined_messages m ${distinctWhere}`;
    const distinctContacts = db.prepare(distinctSql).get(...distinctParams).count;

    // Query replies
    const dataSql = `
      ${cteSql}
      SELECT * FROM combined_messages m
      ${whereClause}
      ORDER BY m.received_at DESC, m.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, parsedLimit, parsedOffset];
    const rawReplies = db.prepare(dataSql).all(...dataParams);

    // Cache templates for high-speed message text reconstruction
    const templateMap = new Map();
    try {
      const tpls = db.prepare("SELECT name, body_text FROM templates").all();
      for (const t of tpls) {
        if (t.name && t.body_text) {
          templateMap.set(t.name.trim().toLowerCase(), t.body_text);
        }
      }
    } catch (e) {}

    // Helper to resolve the proper rendered message text (never the campaign name)
    function resolveProperMessage(r) {
      const rawBody = (r.message_body || "").trim();

      // 1. If message_body is already clean human-readable text
      if (rawBody && !rawBody.startsWith("[") && !rawBody.startsWith("{") && !rawBody.startsWith("📢 Broadcast:")) {
        const oldPrefixMatch = rawBody.match(/^📢\s*[^:]+:\s*(.+)$/s);
        if (oldPrefixMatch) {
          return oldPrefixMatch[1].trim();
        }
        return rawBody;
      }

      // 2. Lookup template body text
      let tplBody = null;
      if (r.template_name) {
        tplBody = templateMap.get(r.template_name.trim().toLowerCase());
        if (!tplBody && r.template_name.toLowerCase().includes("restaurant")) {
          tplBody = templateMap.get("kt_restaurant_invitation");
        }
      }

      // Extract parameter values from JSON components or row data
      const paramValues = [];
      let rowData = {};

      if (r.recipient_raw_data) {
        try {
          rowData = typeof r.recipient_raw_data === "string" ? JSON.parse(r.recipient_raw_data) : r.recipient_raw_data;
        } catch (e) {}
      }
      if (!Object.keys(rowData).length && r.raw_payload) {
        try {
          rowData = typeof r.raw_payload === "string" ? JSON.parse(r.raw_payload) : r.raw_payload;
        } catch (e) {}
      }

      if (rawBody.startsWith("[") || rawBody.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawBody);
          if (Array.isArray(parsed)) {
            const bodyComp = parsed.find(comp => comp.type === "body");
            if (bodyComp && Array.isArray(bodyComp.parameters)) {
              bodyComp.parameters.forEach(p => {
                if (p.text !== undefined && p.text !== null) paramValues.push(String(p.text));
              });
            }
          }
        } catch (e) {}
      }

      // 3. Reconstruct message from template text
      if (tplBody) {
        let rendered = tplBody;

        // Positional {{1}}, {{2}}, {{3}}
        if (paramValues.length > 0) {
          paramValues.forEach((val, idx) => {
            const placeholderRegex = new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g");
            rendered = rendered.replace(placeholderRegex, val);
          });
        }

        // Named variables from row data
        if (rowData && typeof rowData === "object") {
          for (const [k, v] of Object.entries(rowData)) {
            if (v !== undefined && v !== null && String(v).trim()) {
              const namedRegex = new RegExp(`\\{\\{${k}\\}\\}`, "gi");
              rendered = rendered.replace(namedRegex, String(v));
            }
          }
        }

        // Contact name fallback
        if (r.customer_name && r.customer_name !== "Guest" && r.customer_name !== "Customer") {
          rendered = rendered.replace(/\{\{1\}\}/g, r.customer_name);
          rendered = rendered.replace(/\{\{name\}\}/gi, r.customer_name);
        }

        // Safe defaults for unmapped template variables
        rendered = rendered.replace(/\{\{restaurant\}\}/gi, "our partner restaurant");
        rendered = rendered.replace(/\{\{link\}\}/gi, "https://konkantrip.com/");
        rendered = rendered.replace(/\{\{\d+\}\}/g, "");

        return rendered.trim();
      }

      // 4. Custom campaign message_body (for freeform campaigns)
      if (r.campaign_message_body && r.campaign_message_body.trim()) {
        let rendered = r.campaign_message_body.trim();
        if (r.customer_name) {
          rendered = rendered.replace(/\{\{name\}\}/gi, r.customer_name);
          rendered = rendered.replace(/\{\{1\}\}/g, r.customer_name);
        }
        return rendered;
      }

      // 5. Clean parameter values fallback
      if (paramValues.length > 0) {
        return paramValues.join(" • ");
      }

      return "WhatsApp broadcast message sent";
    }

    // Format outbound broadcast messages and heal missing media URLs
    const replies = rawReplies.map(r => {
      // Clean display text for outbound broadcast recipients
      if (r.message_type === "outbound") {
        r.message_body = resolveProperMessage(r);
      }

      // Self-healing: if any media message was stored without media_url, extract media ID from raw_payload
      if (!r.media_url && r.raw_payload) {
        try {
          const raw = JSON.parse(r.raw_payload);
          const mediaObj = raw.image || raw.video || raw.document || raw.audio || raw.sticker;
          if (mediaObj?.id) {
            r.media_url = `/api/media/inbound/${mediaObj.id}`;
            r.media_type = r.message_type || (raw.image ? "image" : (raw.video ? "video" : (raw.document ? "document" : "image")));
            r.media_caption = r.media_caption || mediaObj.caption || mediaObj.filename || null;
            if (typeof r.id === "number") {
              db.prepare("UPDATE customer_replies SET media_url = ?, media_type = ? WHERE id = ?")
                .run(r.media_url, r.media_type, r.id);
            }
          }
        } catch (e) {}
      }
      return r;
    });

    return {
      replies,
      totalCount,
      unreadCount,
      distinctContacts,
      limit: parsedLimit,
      offset: parsedOffset
    };
  }

  /**
   * Marks a specific reply as read
   */
  markAsRead(id) {
    return db.prepare("UPDATE customer_replies SET is_read = 1 WHERE id = ?").run(id);
  }

  /**
   * Marks all replies as read
   */
  markAllAsRead() {
    return db.prepare("UPDATE customer_replies SET is_read = 1 WHERE is_read = 0").run();
  }

  /**
   * Marks all unread messages for a specific customer phone number as read
   */
  markConversationAsRead(phone) {
    if (!phone) return { updated: 0 };
    const rawPhone = String(phone).trim();
    const cleanDigits = rawPhone.replace(/\D/g, "");
    const withPlus = cleanDigits ? `+${cleanDigits}` : "";

    const result = db.prepare(`
      UPDATE customer_replies 
      SET is_read = 1 
      WHERE (from_phone = ? OR from_phone = ? OR from_phone = ?)
        AND is_read = 0
    `).run(rawPhone, cleanDigits, withPlus);

    return { updated: result.changes };
  }

  /**
   * Retrieves conversation message history for a specific phone number with pagination (load previous chat)
   */
  getConversationMessages({ phone, limit = 100, before = null, offset = 0 }) {
    if (!phone) return { phone: "", messages: [], total: 0, hasMore: false };
    const rawPhone = String(phone).trim();
    const cleanDigits = rawPhone.replace(/\D/g, "");
    const withPlus = cleanDigits ? `+${cleanDigits}` : "";

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);

    const conditions = ["(m.from_phone = ? OR m.from_phone = ? OR m.from_phone = ?)"];
    const params = [rawPhone, cleanDigits, withPlus];

    if (before && String(before).trim()) {
      conditions.push("m.received_at < ?");
      params.push(String(before).trim());
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const cteSql = `
      WITH combined_messages AS (
        SELECT 
          r.id as id,
          r.wa_message_id as wa_message_id,
          r.from_phone as from_phone,
          r.customer_name as customer_name,
          r.message_type as message_type,
          r.message_body as message_body,
          r.raw_payload as raw_payload,
          r.context_message_id as context_message_id,
          r.campaign_id as campaign_id,
          r.is_read as is_read,
          r.received_at as received_at,
          r.reply_text as reply_text,
          r.reply_sent_at as reply_sent_at,
          r.reply_status as reply_status,
          r.media_url as media_url,
          r.media_type as media_type,
          r.media_caption as media_caption,
          r.user_id as user_id,
          r.link_id as link_id,
          r.source as source,
          l.title as link_title,
          l.slug as link_slug,
          c.name as campaign_name,
          c.user_id as campaign_user_id
        FROM customer_replies r
        LEFT JOIN campaigns c ON r.campaign_id = c.id
        LEFT JOIN chat_links l ON r.link_id = l.id
        WHERE r.from_phone = ? OR r.from_phone = ? OR r.from_phone = ?

        UNION ALL

        SELECT 
          CONCAT('cr_', cr.id) as id,
          cr.meta_message_id as wa_message_id,
          cr.clean_phone as from_phone,
          cr.contact_name as customer_name,
          'outbound' as message_type,
          cr.rendered_message as message_body,
          cr.raw_data as raw_payload,
          NULL as context_message_id,
          cr.campaign_id as campaign_id,
          1 as is_read,
          cr.sent_at as received_at,
          NULL as reply_text,
          NULL as reply_sent_at,
          cr.status as reply_status,
          NULL as media_url,
          NULL as media_type,
          NULL as media_caption,
          c.user_id as user_id,
          NULL as link_id,
          'CAMPAIGN' as source,
          NULL as link_title,
          NULL as link_slug,
          c.name as campaign_name,
          c.user_id as campaign_user_id
        FROM campaign_recipients cr
        LEFT JOIN campaigns c ON cr.campaign_id = c.id
        WHERE (cr.clean_phone = ? OR cr.clean_phone = ?) AND cr.status IN ('SENT', 'DELIVERED', 'READ') AND cr.sent_at IS NOT NULL
      )
    `;

    const cteParams = [rawPhone, cleanDigits, withPlus, cleanDigits, rawPhone];

    // Count total messages for this contact
    let totalCount = 0;
    try {
      const countSql = `${cteSql} SELECT COUNT(*) as total FROM combined_messages m`;
      totalCount = db.prepare(countSql).get(...cteParams)?.total || 0;
    } catch (e) {
      console.warn("[WebhookService] getConversationMessages count error:", e.message);
    }

    // Fetch messages (fetch parsedLimit + 1 to know if hasMore)
    const dataSql = `
      ${cteSql}
      SELECT * FROM combined_messages m
      ${whereClause}
      ORDER BY m.received_at DESC, m.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...cteParams, ...params, parsedLimit + 1, parsedOffset];
    const rawRows = db.prepare(dataSql).all(...dataParams);

    const hasMore = rawRows.length > parsedLimit;
    const rows = hasMore ? rawRows.slice(0, parsedLimit) : rawRows;

    // Reverse to chronological order (oldest first)
    rows.reverse();

    const oldestTime = rows.length > 0 ? rows[0].received_at : null;

    return {
      phone: cleanDigits || rawPhone,
      messages: rows,
      total: totalCount,
      hasMore,
      oldestTime
    };
  }

  /**
   * Deletes a specific reply
   */
  deleteReply(id) {
    return db.prepare("DELETE FROM customer_replies WHERE id = ?").run(id);
  }

  /**
   * Deletes an entire chat conversation by customer phone number
   */
  deleteConversation(phone) {
    if (!phone) return { deleted: 0 };
    const rawPhone = String(phone).trim();
    const cleanDigits = rawPhone.replace(/\D/g, "");
    const withPlus = cleanDigits ? `+${cleanDigits}` : "";

    const result = db.prepare(`
      DELETE FROM customer_replies 
      WHERE from_phone = ? OR from_phone = ? OR from_phone = ?
    `).run(rawPhone, cleanDigits, withPlus);

    return { deleted: result.changes };
  }

  /**
   * Simulates an incoming customer reply for testing without requiring a public webhook URL
   */
  simulateTestReply({ 
    fromPhone = "919876543210", 
    customerName = "Test Customer", 
    messageBody = "Yes, I am interested! Please send more details.", 
    campaignId = null,
    messageType = "text",
    mediaUrl = null,
    mediaId = null
  }) {
    const fakeWaId = `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cleanPhone = String(fromPhone).replace(/\D/g, "");
    const msgType = (messageType || (mediaUrl ? "image" : "text")).toLowerCase();
    const isImage = msgType === "image";

    const fakeMsg = {
      from: cleanPhone,
      id: fakeWaId,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: msgType,
      is_simulation: true
    };

    if (isImage) {
      fakeMsg.image = {
        caption: messageBody || "Simulated photo",
        mime_type: "image/jpeg",
        id: mediaId || `sim_img_${Date.now()}`
      };
    } else {
      fakeMsg.text = { body: messageBody };
    }

    const fakePayload = {
      is_simulation: true,
      object: "whatsapp_business_account",
      entry: [
        {
          id: "SIMULATED_ACCOUNT",
          changes: [
            {
              value: {
                is_simulation: true,
                messaging_product: "whatsapp",
                contacts: [
                  {
                    profile: { name: customerName },
                    wa_id: cleanPhone
                  }
                ],
                messages: [fakeMsg]
              },
              field: "messages"
            }
          ]
        }
      ]
    };

    const res = this.processIncomingPayload(fakePayload);
    if (mediaUrl) {
      try {
        db.prepare("UPDATE customer_replies SET media_url = ?, media_type = 'image' WHERE wa_message_id = ?")
          .run(mediaUrl, fakeWaId);
      } catch (e) {}
    }
    return res;
  }

  /**
   * Automatically sends an automated WhatsApp reply to incoming customer message
   * Ensures automated message is sent ONLY ONCE per contact (not on every subsequent message).
   */
  /**
   * Unified Conversational Flow Engine & Automated WhatsApp Handler
   * Bridges in-app web chat intelligence to real WhatsApp messages on the connected number.
   */
  async triggerAutoReply(replyRecord, rawMsg = {}, rawValue = {}) {
    return this.processConversationalFlow(replyRecord, rawMsg, rawValue);
  }

  /**
   * Processes incoming customer message through hospitality flow engine, interactive messages, or auto-reply
   */
  async processConversationalFlow(replyRecord, rawMsg = {}, rawValue = {}) {
    if (!replyRecord || !replyRecord.from_phone) return null;

    const rawPhone = String(replyRecord.from_phone).trim();
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) return null;

    // Sequential Promise Queue per phone: prevents race conditions while ensuring NO rapid burst messages are dropped
    if (!this.phoneQueues) {
      this.phoneQueues = new Map();
    }

    const currentTask = this.phoneQueues.get(cleanPhone) || Promise.resolve();
    const nextTask = currentTask
      .catch(() => {}) // Don't let a prior failure block subsequent messages
      .then(() => this._executeConversationalFlow(replyRecord, rawMsg, rawValue))
      .finally(() => {
        if (this.phoneQueues.get(cleanPhone) === nextTask) {
          this.phoneQueues.delete(cleanPhone);
        }
      });

    this.phoneQueues.set(cleanPhone, nextTask);
    return nextTask;
  }

  /**
   * Internal execution of conversational flow logic for a customer message
   */
  async _executeConversationalFlow(replyRecord, rawMsg = {}, rawValue = {}) {
    if (!replyRecord || !replyRecord.from_phone) return null;

    const rawPhone = String(replyRecord.from_phone).trim();
    const cleanPhone = rawPhone.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) return null;

    // Deduplication lock: prevent concurrent dispatch for the same message ID or phone turn
    const dispatchKey = `${cleanPhone}:${replyRecord.id || replyRecord.wa_message_id || 'unknown'}`;
    if (this.activeDispatchKeys.has(dispatchKey)) {
      console.log(`[Webhook Flow] Deduplication: Dispatch key ${dispatchKey} is currently active. Skipping duplicate.`);
      return null;
    }
    if (this.answeredMessageKeys && this.answeredMessageKeys.has(dispatchKey)) {
      console.log(`[Webhook Flow] Deduplication: Message ${dispatchKey} was already answered. Suppressing duplicate execution.`);
      return null;
    }
    this.activeDispatchKeys.add(dispatchKey);
    this.inFlightAutoReplies.add(cleanPhone);

    try {
      // Re-verify from DB that this record hasn't already been replied to
      if (replyRecord.id) {
        const curRec = db.prepare("SELECT reply_status FROM customer_replies WHERE id = ?").get(replyRecord.id);
        if (curRec && (curRec.reply_status === 'AUTO_REPLIED' || curRec.reply_status === 'SENT')) {
          console.log(`[Webhook Flow] Reply record #${replyRecord.id} already answered with status ${curRec.reply_status}. Skipping.`);
          return null;
        }
      }
      const rawText = String(replyRecord.message_body || "").trim();
      const upper = rawText.toUpperCase();

      // 0a. Self-message / Echo prevention (Ignore bot's own number or outbound messages)
      const wabaDisplayPhone = (rawValue?.metadata?.display_phone_number || getSetting("WHATSAPP_PHONE_NUMBER") || "918766590634").replace(/\D/g, "");
      if (cleanPhone === wabaDisplayPhone) {
        console.log(`[Webhook Flow] Ignoring self-message from bot display number ${cleanPhone}`);
        return null;
      }
      if (replyRecord.message_type === "outbound") {
        console.log(`[Webhook Flow] Ignoring outbound message record #${replyRecord.id}`);
        return null;
      }

      // 0b. Event Type & Reaction Filter (Ignore emoji reactions, stickers, order status events)
      const msgType = String(rawMsg?.type || replyRecord.message_type || "text").toLowerCase();
      if (["reaction", "sticker", "order", "system", "unknown"].includes(msgType)) {
        console.log(`[Webhook Flow] Ignoring non-conversational message event type: '${msgType}' for ${cleanPhone}`);
        return null;
      }

      // 1. Extract interactive action or button selection
      let effectiveText = rawText;
      let interactiveActionId = null;

      if (rawMsg?.type === "interactive") {
        if (rawMsg.interactive?.button_reply) {
          interactiveActionId = rawMsg.interactive.button_reply.id;
          effectiveText = rawMsg.interactive.button_reply.title || interactiveActionId;
        } else if (rawMsg.interactive?.list_reply) {
          interactiveActionId = rawMsg.interactive.list_reply.id;
          effectiveText = rawMsg.interactive.list_reply.title || interactiveActionId;
        }
      }

      // 1b. WhatsApp Flow Submission Handling (Customer completed a Flow Screen)
      const isFlowReply = (rawMsg?.type === "interactive" && rawMsg.interactive?.type === "nfm_reply") ||
                          Boolean(replyRecord.flow_response_id) ||
                          Boolean(replyRecord.flow_id && (rawMsg?.interactive || rawText.includes("[Flow Completed]") || rawText.startsWith("[Flow:")));

      // 1c. Conversational Closure & Pleasantry Filter (Prevent unprompted quotes on 'ok', 'thanks', 'bye')
      const isClosure = /^(ok|okay|k|thanks|thank you|thx|tq|bye|good night|done|fine|great|sure|tc|alright|cool|no thanks|not now)\b[\s.!]*$/i.test(rawText.trim());
      if (isClosure && !interactiveActionId && !isFlowReply) {
        console.log(`[Webhook Flow] Conversational closure acknowledged from ${cleanPhone}: "${rawText}". Suppressing outbound API message.`);
        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
        db.prepare(`
          UPDATE customer_replies 
          SET reply_status = 'ACKNOWLEDGED', reply_sent_at = ? 
          WHERE id = ?
        `).run(nowIso, replyRecord.id);

        return {
          success: true,
          closure: true,
          replyText: null,
          message: "Closure acknowledged without outbound API dispatch."
        };
      }

      // 2. Auto-opt-out suppression check
      if (["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL"].includes(upper)) {
        return null;
      }

      // 3. Keyword Bot Unpause: Customers texting explicit resume commands wake the bot back up
      const resumeKeywords = ["START", "RESTART", "BOT", "MENU", "RESET", "UNPAUSE"];
      const isResumeKeyword = resumeKeywords.includes(upper) || upper.startsWith("BOT ") || upper.startsWith("/START") || upper.startsWith("/BOT");
      if (isResumeKeyword) {
        if (this.isBotPausedForPhone(cleanPhone)) {
          this.resumeBotForPhone(cleanPhone);
          console.log(`[Webhook Flow] Customer ${cleanPhone} unpaused bot via intent keyword: "${upper}"`);
        }
      }

      // 4. Check Staff Takeover / Bot Pause
      if (this.isBotPausedForPhone(cleanPhone)) {
        console.log(`[Webhook Flow] Bot is currently paused for ${cleanPhone} (Staff Takeover active). Skipping automated response.`);
        return null;
      }

      // 5. Check Auto-Reply Master Settings
      const autoReplySettings = this.getAutoReplySettings();
      if (!autoReplySettings.enabled) {
        console.log(`[Webhook Flow] Auto-Reply Bot is disabled in settings. Skipping automated response.`);
        return null;
      }

      // Resolve multi-line sender phone ID and simulation sandbox
      const incomingPhoneId = rawValue?.metadata?.phone_number_id || null;
      const isSimulation = Boolean(rawValue?.is_simulation || rawMsg?.is_simulation || isSandboxOrTestPhone(cleanPhone));
      const customCredentials = {
        ...(incomingPhoneId ? { phoneNumberId: incomingPhoneId } : {}),
        ...(isSimulation ? { isSimulation: true } : {})
      };

      // 5b. Strict Inbound-Only Mode & Meta 24-Hour Customer Care Window Guard
      // Enforce that automated messages ONLY trigger in direct reaction to a verified inbound customer message.
      if (autoReplySettings.strictInboundOnly) {
        if (!replyRecord.message_body && !rawMsg?.type && !interactiveActionId && !isFlowReply) {
          console.log(`[Webhook Flow] Strict Inbound Mode: No explicit customer action detected for ${cleanPhone}. Suppressing response.`);
          return null;
        }
      }

      const receivedAtMs = replyRecord.received_at ? parseUtcMs(replyRecord.received_at) : Date.now();
      const isWithinMeta24hWindow = (Date.now() - receivedAtMs) <= 24 * 60 * 60 * 1000;
      if (!isWithinMeta24hWindow && !isSimulation) {
        console.log(`[Webhook Flow] Inbound message from ${cleanPhone} received outside Meta 24-hour customer window (${replyRecord.received_at}). Suppressing freeform reply.`);
        return null;
      }

      const isInteractiveAction = Boolean(interactiveActionId || isFlowReply);

      // 6b. Dynamic Conversation Flow & Automation Studio Engine
      // STRICT WATERFALL: Active Session First -> Trigger Matching -> Default Published Flow -> Legacy Fallback
      const flowEngine = require("./conversationFlowEngine");

      // 1. ACTIVE SESSION FIRST: Lookup using strict expiration check against UTC_TIMESTAMP()
      let activeFlowSession = null;
      const normPhoneDigits = String(cleanPhone || "").replace(/\D/g, "");
      try {
        if (typeof flowEngine.getActiveSession === 'function') {
          activeFlowSession = flowEngine.getActiveSession(1, normPhoneDigits);
        }
        if (!activeFlowSession) {
          activeFlowSession = db.prepare(`
            SELECT s.*, f.status as flow_status, f.name as flow_name
            FROM conversation_flow_sessions s
            JOIN conversation_flows f ON s.flow_id = f.id
            WHERE (s.sender_phone = ? OR s.sender_phone = ? OR s.sender_phone = ?) 
              AND s.session_status = 'ACTIVE' 
              AND (s.expires_at IS NULL OR s.expires_at > UTC_TIMESTAMP())
            ORDER BY s.id DESC
            LIMIT 1
          `).get(normPhoneDigits, cleanPhone, `+${normPhoneDigits}`);
        }
      } catch (sessErr) {
        console.warn("[Webhook Flow] Active session lookup note:", sessErr.message);
      }

      // Check global escape/reset words if active session exists
      const normInputLower = String(effectiveText || "").trim().toLowerCase();
      const isResetKeyword = ["restart", "reset", "menu", "/start", "/menu", "main menu"].includes(normInputLower);
      const isCancelKeyword = ["cancel", "stop", "exit"].includes(normInputLower);

      if (activeFlowSession && isResetKeyword) {
        console.log(`[Webhook Flow] Customer ${cleanPhone} requested reset ('${normInputLower}'). Expiring session #${activeFlowSession.id} for fresh start.`);
        try {
          db.prepare("UPDATE conversation_flow_sessions SET session_status = 'EXPIRED', updated_at = UTC_TIMESTAMP() WHERE id = ?").run(activeFlowSession.id);
        } catch (e) {}
        activeFlowSession = null;
      }

      if (activeFlowSession && isCancelKeyword) {
        console.log(`[Webhook Flow] Customer ${cleanPhone} requested cancellation ('${normInputLower}'). Terminating session #${activeFlowSession.id}.`);
        try {
          db.prepare("UPDATE conversation_flow_sessions SET session_status = 'CANCELLED', updated_at = UTC_TIMESTAMP() WHERE id = ?").run(activeFlowSession.id);
        } catch (e) {}
        try {
          await sendTextMessage({
            to: cleanPhone,
            body: "Conversation cancelled. Type 'hi' anytime to start again.",
            customCredentials
          });
        } catch (e) {}
        return {
          success: true,
          cancelled: true,
          replyText: "Conversation cancelled."
        };
      }

      // Check for pending delay jobs that should cancel on customer reply
      try {
        const pendingJobs = db.prepare(`
          SELECT j.*, s.flow_id, s.current_node_id
          FROM workflow_scheduled_jobs j
          JOIN conversation_flow_sessions s ON (j.session_id = s.id OR j.session_id = s.session_key)
          WHERE (s.sender_phone = ? OR s.sender_phone = ?) AND j.status = 'PENDING' AND j.cancel_on_reply = 1
        `).all(normPhoneDigits, cleanPhone);

        if (pendingJobs && pendingJobs.length > 0) {
          for (const job of pendingJobs) {
            console.log(`[Webhook Flow] Customer ${cleanPhone} replied early. Cancelling pending delay job #${job.id}.`);
            db.prepare(`
              UPDATE workflow_scheduled_jobs
              SET status = 'CANCELLED', last_error = 'Customer replied before delay elapsed (cancel_on_reply)', updated_at = UTC_TIMESTAMP()
              WHERE id = ?
            `).run(job.id);
          }
        }
      } catch (delayErr) {
        console.warn("[Webhook Flow] Cancel-on-reply check warning:", delayErr.message);
      }

      // 2. TRIGGER MATCHING: Run ONLY if NO active session AND not an interactive button click
      let matchedTrigger = null;
      if (!activeFlowSession && !isInteractiveAction) {
        try {
          const workflowTriggerService = require("./workflow/workflowTriggerService");
          matchedTrigger = workflowTriggerService.matchInboundTrigger(1, {
            text: effectiveText,
            phone: cleanPhone,
            phoneNumberId: incomingPhoneId,
            referral: rawMsg?.referral || null
          });
          if (matchedTrigger) {
            console.log(`[Webhook Flow] Matched trigger '${matchedTrigger.triggerKey}' for flow ${matchedTrigger.flowId} (node: ${matchedTrigger.nodeId}, line: ${incomingPhoneId || 'GLOBAL'}).`);
          }
        } catch (trgErr) {
          console.warn("[Webhook Flow] Trigger matching warning:", trgErr.message);
        }
      }

      const isStudioMode = autoReplySettings.engineMode === "FLOW_STUDIO" || 
                           autoReplySettings.engineMode === "CONVERSATION_FLOW" ||
                           autoReplySettings.engineMode === "HOSPITALITY_FLOW";

      let defaultPublishedFlow = null;
      try {
        defaultPublishedFlow = db.prepare(`
          SELECT id FROM conversation_flows
          WHERE tenant_id = 1 AND status = 'PUBLISHED'
          ORDER BY is_default DESC, priority DESC, id ASC
          LIMIT 1
        `).get();
      } catch (fErr) {}

      // STRICT ROUTING PRIORITY:
      // 1. Any active session ALWAYS resumes its active flow.
      // 2. Otherwise matched published flow trigger routes to that flow.
      // 3. Otherwise if in studio mode and published flow exists, routes to default flow.
      const shouldRunFlowEngine = Boolean(activeFlowSession || matchedTrigger || (isStudioMode && defaultPublishedFlow));

      if (shouldRunFlowEngine) {
        // Universal Deduplication check for initial or repeated generic greeting:
        // Applies if there's no active session, OR if the contact is at the start node/menu and sends another generic greeting
        const isAtStartMenu = !activeFlowSession || activeFlowSession.current_node_id === "node_enquiry_type" || activeFlowSession.current_node_id === "node_start" || activeFlowSession.current_node_id === "msg_welcome";
        const isGenericGreeting = /^(hi|hello|hey|greetings|namaste|hello again|hi again|resort)\b/i.test(effectiveText.trim());

        if ((!activeFlowSession || (isAtStartMenu && isGenericGreeting)) && !isInteractiveAction && !isResumeKeyword) {
          if (autoReplySettings.mode === "ONCE_PER_CONTACT") {
            const prior = db.prepare(`
              SELECT id FROM customer_replies 
              WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
              LIMIT 1
            `).get(cleanPhone, replyRecord.id);
            if (prior) {
              console.log(`[Webhook Flow] Deduplication: contact ${cleanPhone} already replied once. Skipping.`);
              return null;
            }
          } else if (autoReplySettings.mode === "ONCE_PER_24_HOURS") {
            const prior = db.prepare(`
              SELECT id FROM customer_replies 
              WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
                AND received_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
              LIMIT 1
            `).get(cleanPhone, replyRecord.id);
            if (prior) {
              console.log(`[Webhook Flow] Deduplication: contact ${cleanPhone} already replied in last 24h. Skipping.`);
              return null;
            }
          }
        }
        try {
          const targetFlowId = activeFlowSession ? activeFlowSession.flow_id : (matchedTrigger?.flowId || defaultPublishedFlow?.id || null);
          const targetNodeId = activeFlowSession ? null : (matchedTrigger?.nodeId || null);

          const flowResult = await flowEngine.processTurn({
            senderPhone: cleanPhone,
            userInput: effectiveText,
            userPayload: rawMsg?.interactive?.button_reply || rawMsg?.interactive?.list_reply || (interactiveActionId ? { id: interactiveActionId, title: effectiveText } : null),
            startFlowId: targetFlowId,
            startNodeId: targetNodeId,
            phoneNumberId: incomingPhoneId,
            context: {
              tenantId: 1,
              propertyId: 1,
              channel: "WHATSAPP",
              phoneNumberId: incomingPhoneId,
              isSimulation: isSimulation,
              triggerKey: matchedTrigger?.triggerKey || null
            }
          });

          if (flowResult && flowResult.handled && flowResult.replyText) {
            let sentMsgId = null;
            if (flowResult.replyInteractive && flowResult.replyInteractive.options?.length > 0) {
              // WhatsApp limits: Button title <= 20 chars, List row title <= 24 chars
              const buttons = flowResult.replyInteractive.options.map(o => ({
                id: String(o.id || "").substring(0, 256),
                title: String(o.title || o.id || "Option").trim().substring(0, 20)
              }));
              try {
                if (buttons.length <= 3) {
                  const bRes = await sendInteractiveButtons({
                    to: cleanPhone,
                    bodyText: flowResult.replyText,
                    buttons,
                    headerMediaUrl: flowResult.replyInteractive?.mediaUrl || "",
                    footerText: autoReplySettings.businessName || "Hotel Green Vally",
                    customCredentials
                  });
                  sentMsgId = bRes?.messageId || null;
                } else {
                  const listRows = flowResult.replyInteractive.options.map(o => ({
                    id: String(o.id || "").substring(0, 256),
                    title: String(o.title || o.id || "Option").trim().substring(0, 24)
                  }));
                  const lRes = await sendInteractiveList({
                    to: cleanPhone,
                    bodyText: flowResult.replyText,
                    buttonText: (flowResult.replyInteractive.listButtonText || "Choose Option").substring(0, 20),
                    sections: [{
                      title: (flowResult.replyInteractive.listTitle || "Options").substring(0, 24),
                      rows: listRows
                    }],
                    headerMediaUrl: flowResult.replyInteractive?.mediaUrl || "",
                    footerText: autoReplySettings.businessName || "Hotel Green Vally",
                    customCredentials
                  });
                  sentMsgId = lRes?.messageId || null;
                }
              } catch (btnErr) {
                try {
                  const txtRes = await sendTextMessage({
                    to: cleanPhone,
                    body: flowResult.replyText,
                    customCredentials
                  });
                  sentMsgId = txtRes?.messageId || null;
                } catch (txtErr) {
                  console.warn("[Webhook Flow] Flow interactive fallback text send note:", txtErr.message);
                }
              }
            } else if (flowResult.replyInteractive?.mediaUrl) {
              try {
                const mediaRes = await sendMediaMessage({
                  to: cleanPhone,
                  type: flowResult.replyInteractive.mediaType?.toLowerCase() || 'image',
                  mediaUrl: flowResult.replyInteractive.mediaUrl,
                  caption: flowResult.replyText,
                  customCredentials
                });
                sentMsgId = mediaRes?.messageId || null;
              } catch (mediaErr) {
                try {
                  const txtRes = await sendTextMessage({
                    to: cleanPhone,
                    body: flowResult.replyText,
                    customCredentials
                  });
                  sentMsgId = txtRes?.messageId || null;
                } catch (txtErr) {
                  console.warn("[Webhook Flow] Flow media fallback text send note:", txtErr.message);
                }
              }
            } else {
              try {
                const txtRes = await sendTextMessage({
                  to: cleanPhone,
                  body: flowResult.replyText,
                  customCredentials
                });
                sentMsgId = txtRes?.messageId || null;
              } catch (txtErr) {
                console.warn("[Webhook Flow] Flow text send note:", txtErr.message);
              }
            }

            const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
            const botReplyId = sentMsgId || `bot_flow_${Date.now()}`;
            try {
              db.prepare(`
                INSERT INTO customer_replies (
                  wa_message_id, from_phone, customer_name, message_type,
                  message_body, reply_text, reply_sent_at, reply_status,
                  link_id, source, is_read, user_id, received_at
                ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'AUTO_REPLIED', ?, 'CONVERSATION_FLOW', 1, 'bot', ?)
              `).run(botReplyId, cleanPhone, replyRecord.customer_name || "Guest", flowResult.replyText, flowResult.replyText, nowIso, replyRecord.link_id || null, nowIso);
            } catch (e) {}

            db.prepare(`
              UPDATE customer_replies 
              SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
              WHERE id = ?
            `).run(flowResult.replyText, nowIso, replyRecord.id);

            const updatedRecord = {
              ...replyRecord,
              reply_text: flowResult.replyText,
              reply_sent_at: nowIso,
              reply_status: "AUTO_REPLIED"
            };

            broadcastEngine.emit("webhook:reply_updated", updatedRecord);
            if (this.answeredMessageKeys) {
              this.answeredMessageKeys.set(dispatchKey, Date.now());
            }
            return {
              success: true,
              flowEngine: true,
              messageId: sentMsgId,
              replyText: flowResult.replyText,
              sessionKey: flowResult.sessionKey,
              currentNodeId: flowResult.currentNodeId
            };
          } else if (flowResult && flowResult.handled) {
            if (this.answeredMessageKeys) {
              this.answeredMessageKeys.set(dispatchKey, Date.now());
            }
            return {
              success: true,
              flowEngine: true,
              handled: true
            };
          }
        } catch (engineErr) {
          console.warn("[Webhook Flow] Conversation Flow Engine error:", engineErr.message);
          return {
            success: false,
            error: engineErr.message
          };
        }
      }

      // 7. Simple Greeting Engine Mode (if business client configured simple greeting instead of interactive flow)
      if (autoReplySettings.engineMode === "SIMPLE_GREETING") {
        if (!isInteractiveAction && !isResumeKeyword) {
          if (autoReplySettings.mode === "ONCE_PER_CONTACT") {
            const prior = db.prepare(`
              SELECT id FROM customer_replies 
              WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
              LIMIT 1
            `).get(cleanPhone, replyRecord.id);
            if (prior) {
              console.log(`[Webhook Flow] Simple Greeting: contact ${cleanPhone} already replied once. Skipping.`);
              return null;
            }
          } else if (autoReplySettings.mode === "ONCE_PER_24_HOURS") {
            const prior = db.prepare(`
              SELECT id FROM customer_replies 
              WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
                AND received_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
              LIMIT 1
            `).get(cleanPhone, replyRecord.id);
            if (prior) {
              console.log(`[Webhook Flow] Simple Greeting: contact ${cleanPhone} already replied in last 24h. Skipping.`);
              return null;
            }
          }
        }
        const templateMsg = autoReplySettings.fallbackMessage || autoReplySettings.message ||
          "Hi {{name}}, thank you for reaching out! We have received your message. Our team will get back to you shortly.";
        const customerName = replyRecord.customer_name ? replyRecord.customer_name.trim() : "there";
        const finalMsg = templateMsg
          .replace(/\{\{name\}\}/gi, customerName)
          .replace(/\{\{business_name\}\}/gi, autoReplySettings.businessName || "Hotel Green Vally");

        let sentRes = null;
        try {
          sentRes = await sendTextMessage({
            to: cleanPhone,
            body: finalMsg,
            customCredentials
          });
        } catch (e) {}

        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
        db.prepare(`
          UPDATE customer_replies 
          SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
          WHERE id = ?
        `).run(finalMsg, nowIso, replyRecord.id);

        const updatedRecord = {
          ...replyRecord,
          reply_text: finalMsg,
          reply_sent_at: nowIso,
          reply_status: 'AUTO_REPLIED'
        };

        broadcastEngine.emit("webhook:reply_updated", updatedRecord);
        return {
          success: true,
          messageId: sentRes?.messageId,
          replyText: finalMsg
        };
      }

      let flowIntakeData = null;

      if (isFlowReply) {
        let flowSubmissionData = null;
        if (rawMsg?.interactive?.nfm_reply?.response_json) {
          try {
            flowSubmissionData = typeof rawMsg.interactive.nfm_reply.response_json === "string"
              ? JSON.parse(rawMsg.interactive.nfm_reply.response_json)
              : rawMsg.interactive.nfm_reply.response_json;
          } catch (e) {}
        }

        if (!flowSubmissionData && replyRecord.flow_response_id) {
          try {
            const respRow = db.prepare("SELECT * FROM flow_responses WHERE id = ? OR wa_message_id = ?").get(replyRecord.flow_response_id, replyRecord.wa_message_id);
            if (respRow) {
              flowSubmissionData = JSON.parse(respRow.parsed_data || respRow.response_json || "{}");
            }
          } catch (e) {}
        }

        if (flowSubmissionData) {
          const flowValidation = this.validateAndNormalizeFlowSubmission(flowSubmissionData, replyRecord.customer_name);
          flowIntakeData = flowValidation.intakeData;

          // Case A: Customer Feedback Flow
          if (flowValidation.isFeedback) {
            const rating = flowSubmissionData.overall_rating || flowSubmissionData.rating || "5";
            const ratingStars = "★".repeat(Math.min(5, Math.max(1, parseInt(rating, 10)))) + "☆".repeat(Math.max(0, 5 - parseInt(rating, 10)));
            const bName = autoReplySettings.businessName || "Hotel Green Vally";
            let feedbackText = `🙏 *Thank You For Your Feedback, ${flowIntakeData.guest_name || "Valued Guest"}!*\n\n`;
            feedbackText += `We have recorded your rating of *${ratingStars} (${rating}/5)*.\n`;
            if (flowSubmissionData.favorite_aspect) {
              feedbackText += `✨ We are thrilled that you enjoyed our *${String(flowSubmissionData.favorite_aspect).replace(/_/g, " ")}*!\n`;
            }
            if (flowSubmissionData.suggestions) {
              feedbackText += `📝 Our management team has noted your suggestion: _"${flowSubmissionData.suggestions}"_.\n`;
            }
            feedbackText += `\nWe look forward to welcoming you back to *${bName}*! 🌊🏖️`;

            const buttons = [
              { id: "btn_rooms", title: shortenButtonTitle(autoReplySettings.quoteRooms || "Resort Rooms") },
              { id: "btn_menu", title: shortenButtonTitle(autoReplySettings.confirmedButton2 || "Dining Menu") },
              { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
            ];

            let sentMsgId = null;
            try {
              const bRes = await sendInteractiveButtons({
                to: cleanPhone,
                bodyText: feedbackText,
                buttons,
                headerText: "Review Received",
                footerText: bName,
                customCredentials
              });
              sentMsgId = bRes.messageId;
            } catch (e) {
              try {
                const s = await sendTextMessage({ to: cleanPhone, body: feedbackText, customCredentials });
                sentMsgId = s?.messageId || null;
              } catch (err) {}
            }

            const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
            const botReplyId = `bot_feedback_${Date.now()}`;
            db.prepare(`
              INSERT INTO customer_replies (
                wa_message_id, from_phone, customer_name, message_type,
                message_body, reply_text, reply_sent_at, reply_status,
                link_id, source, is_read, user_id, received_at
              ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
            `).run(botReplyId, cleanPhone, replyRecord.customer_name || "Guest", feedbackText, feedbackText, nowIso, replyRecord.link_id || null, nowIso);

            db.prepare(`
              UPDATE customer_replies 
              SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
              WHERE id = ?
            `).run(feedbackText, nowIso, replyRecord.id);

            const savedBot = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
            broadcastEngine.emit("webhook:reply", savedBot);
            return { success: true, feedback: true, replyText: feedbackText, messageId: sentMsgId };
          }

          // Case B: Support / Concierge Ticket Flow
          if (flowValidation.isSupport) {
            const ticketId = `TKT-${Date.now().toString().slice(-5)}`;
            const bName = autoReplySettings.businessName || "Hotel Green Vally";
            const cat = (flowSubmissionData.issue_category || "General Inquiry").replace(/_/g, " ").toUpperCase();
            let ticketText = `🎫 *Concierge Ticket Created (#${ticketId})*\n\n`;
            ticketText += `Thank you, *${flowIntakeData.guest_name || "Guest"}*. Your request regarding *${cat}* has been submitted to our front desk team.\n\n`;
            if (flowSubmissionData.booking_id) ticketText += `📋 *Booking ID*: ${flowSubmissionData.booking_id}\n`;
            if (flowSubmissionData.issue_description) ticketText += `📝 *Details*: _"${flowSubmissionData.issue_description}"_\n`;
            ticketText += `\n📞 Our front desk executive will contact you on this chat shortly.`;

            this.pauseBotForPhone(cleanPhone, (autoReplySettings.takeoverPauseMinutes || 60) * 60 * 1000);

            let sentMsgId = null;
            try {
              const s = await sendTextMessage({ to: cleanPhone, body: ticketText, customCredentials });
              sentMsgId = s?.messageId || null;
            } catch (err) {}

            const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
            const botReplyId = `bot_support_${Date.now()}`;
            db.prepare(`
              INSERT INTO customer_replies (
                wa_message_id, from_phone, customer_name, message_type,
                message_body, reply_text, reply_sent_at, reply_status,
                link_id, source, is_read, user_id, received_at
              ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
            `).run(botReplyId, cleanPhone, replyRecord.customer_name || "Guest", ticketText, ticketText, nowIso, replyRecord.link_id || null, nowIso);

            db.prepare(`
              UPDATE customer_replies 
              SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
              WHERE id = ?
            `).run(ticketText, nowIso, replyRecord.id);

            const savedBot = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
            broadcastEngine.emit("webhook:reply", savedBot);
            broadcastEngine.emit("inbox:handoff", {
              phone: cleanPhone,
              customerName: flowIntakeData.guest_name,
              message: ticketText
            });
            return { success: true, supportTicket: true, replyText: ticketText, messageId: sentMsgId };
          }
        }
      }

      const lower = effectiveText.toLowerCase();

      // 5c. Dynamic Bot Options & Rules Engine (Admin Programmable Solutions)
      const dynamicOptions = autoReplySettings.dynamicOptions || [];
      let matchedDyn = null;

      // A) Direct interactive button click
      if (interactiveActionId && (interactiveActionId.startsWith("dyn_") || interactiveActionId.startsWith("opt_"))) {
        const cleanOptId = interactiveActionId.replace(/^dyn_/, "").replace(/^opt_/, "");
        matchedDyn = dynamicOptions.find(d => 
          (d.id === cleanOptId || d.id === `opt_${cleanOptId}` || String(d.id) === String(interactiveActionId)) && 
          d.active !== false && d.isActive !== false
        );
      }

      // B) Trigger keyword or title match
      if (!matchedDyn && lower) {
        for (const opt of dynamicOptions) {
          if (opt.active === false || opt.isActive === false) continue;

          // Check if button title matches
          if (opt.title && lower === opt.title.toLowerCase()) {
            matchedDyn = opt;
            break;
          }
          if (opt.buttonLabel && lower === opt.buttonLabel.toLowerCase()) {
            matchedDyn = opt;
            break;
          }

          // Check triggers (supporting triggers, matchTerms, and trigger aliases)
          const rawTriggers = opt.triggers || opt.matchTerms || opt.trigger || "";
          const triggers = String(rawTriggers)
            .split(",")
            .map(t => t.trim().toLowerCase())
            .filter(Boolean);

          if (triggers.length === 0) continue;

          const matchType = (opt.matchType || opt.matcherType || "CONTAINS").toUpperCase();
          let matched = false;

          if (matchType === "EXACT") {
            matched = triggers.some(t => lower === t);
          } else if (matchType === "STARTS_WITH") {
            matched = triggers.some(t => lower.startsWith(t));
          } else if (matchType === "REGEX") {
            matched = triggers.some(t => {
              try { return new RegExp(t, "i").test(lower); } catch (e) { return false; }
            });
          } else { // CONTAINS / WORD BOUNDARY
            matched = triggers.some(t => {
              if (t.length <= 3) {
                return new RegExp(`\\b${t}\\b`, "i").test(lower);
              }
              return lower.includes(t);
            });
          }

          if (matched) {
            matchedDyn = opt;
            break;
          }
        }
      }

      if (matchedDyn) {
        const dynAction = (matchedDyn.actionType || matchedDyn.action || "REPLY_TEXT").toUpperCase();
        console.log(`[Webhook Flow] Executing Dynamic Bot Option: '${matchedDyn.title}' (${dynAction}) for ${cleanPhone}`);
        const bName = autoReplySettings.businessName || "Hotel Green Vally";
        const cName = replyRecord.customer_name || "Guest";
        const hPhone = autoReplySettings.handoffPhone || "+91 87665 90634";
        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);

        // Normalize response text from responseText or responsePayload
        const rawResponse = matchedDyn.responseText || matchedDyn.responsePayload || matchedDyn.message ||
          `Thank you for asking about ${matchedDyn.title}! Our team is delighted to assist you.`;

        if (dynAction === "STAFF_TAKEOVER") {
          const pauseMins = autoReplySettings.takeoverPauseMinutes || 60;
          this.pauseBotForPhone(cleanPhone, pauseMins * 60 * 1000);
          const customStaffMsg = (rawResponse || autoReplySettings.handoffMessage || "Connecting with our staff...")
            .replace(/\{\{phone\}\}/gi, hPhone)
            .replace(/\{\{business_name\}\}/gi, bName)
            .replace(/\{\{name\}\}/gi, cName);

          let sentMsgId = null;
          try {
            const s = await sendTextMessage({ to: cleanPhone, body: customStaffMsg, customCredentials });
            sentMsgId = s?.messageId || null;
          } catch (e) {}

          db.prepare(`
            UPDATE customer_replies 
            SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
            WHERE id = ?
          `).run(customStaffMsg, nowIso, replyRecord.id);

          const botReplyId = `bot_dyn_staff_${Date.now()}`;
          try {
            db.prepare(`
              INSERT INTO customer_replies (
                wa_message_id, from_phone, customer_name, message_type,
                message_body, reply_text, reply_sent_at, reply_status,
                link_id, source, is_read, user_id, received_at
              ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
            `).run(
              botReplyId, cleanPhone, cName, customStaffMsg, customStaffMsg, nowIso, replyRecord.link_id || null, nowIso
            );
            const savedBot = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
            broadcastEngine.emit("webhook:reply", savedBot);
          } catch (e) {}

          broadcastEngine.emit("inbox:reply", {
            replyId: replyRecord.id,
            replyText: customStaffMsg,
            replyStatus: "AUTO_REPLIED"
          });
          return { success: true, handledBy: "DYNAMIC_OPTION_STAFF", replyText: customStaffMsg, messageId: sentMsgId, handoff: true };
        }

        if (dynAction === "DISPATCH_FLOW" && getSetting("WHATSAPP_FLOWS_ENABLED") === "true") {
          const targetFlowId = matchedDyn.flowId || matchedDyn.selectedFlowId || autoReplySettings.selectedFlowId;
          const flow = targetFlowId ? db.prepare("SELECT * FROM whatsapp_flows WHERE (id = ? OR meta_flow_id = ?)").get(targetFlowId, targetFlowId) : null;
          if (flow) {
            const flowCta = shortenButtonTitle(matchedDyn.buttonLabel || flow.name || "Open Form");
            const flowHeader = shortenHeaderText(bName);
            const flowBody = rawResponse
              ? rawResponse.replace(/\{\{name\}\}/gi, cName).replace(/\{\{business_name\}\}/gi, bName)
              : `Hi ${cName}, please tap below to complete our ${flow.name} form:`;

            let sentFlowRes = null;
            try {
              sentFlowRes = await sendFlowMessage({
                to: cleanPhone,
                flowId: flow.meta_flow_id || flow.id,
                flowToken: `flow_${flow.id}_${cleanPhone}_${Date.now()}`,
                headerText: flowHeader,
                bodyText: flowBody,
                footerText: "Official Resort Concierge",
                ctaText: flowCta,
                customCredentials
              });
            } catch (e) {}

            // If Flow send succeeded
            if (sentFlowRes && (sentFlowRes.success || sentFlowRes.messageId)) {
              const sentSummary = `[Dispatched Flow: ${flow.name}]`;
              db.prepare(`
                UPDATE customer_replies 
                SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
                WHERE id = ?
              `).run(sentSummary, nowIso, replyRecord.id);

              const botReplyId = `bot_dyn_flow_${Date.now()}`;
              try {
                db.prepare(`
                  INSERT INTO customer_replies (
                    wa_message_id, from_phone, customer_name, message_type,
                    message_body, reply_text, reply_sent_at, reply_status,
                    link_id, source, is_read, user_id, received_at
                  ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
                `).run(
                  botReplyId, cleanPhone, cName, sentSummary, sentSummary, nowIso, replyRecord.link_id || null, nowIso
                );
                const savedBot = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
                broadcastEngine.emit("webhook:reply", savedBot);
              } catch (e) {}

              broadcastEngine.emit("inbox:reply", {
                replyId: replyRecord.id,
                replyText: sentSummary,
                replyStatus: "AUTO_REPLIED"
              });
              return { success: true, handledBy: "DYNAMIC_OPTION_FLOW", flowId: flow.id, messageId: sentFlowRes?.messageId };
            } else {
              console.warn(`[Webhook Flow] Dynamic option flow dispatch note: ${sentFlowRes?.error || "Meta flow not available"}. Falling back to text response.`);
            }
          }
        }

        let replyMsg = (rawResponse || `Thank you for asking about ${matchedDyn.title}! Our team is delighted to assist you.`)
          .replace(/\{\{name\}\}/gi, cName)
          .replace(/\{\{business_name\}\}/gi, bName)
          .replace(/\{\{phone\}\}/gi, hPhone);

        if ((dynAction === "OPEN_URL" || matchedDyn.url) && matchedDyn.url) {
          replyMsg += `\n\n🌐 *Explore Link*: ${matchedDyn.url}`;
        }

        let buttons = [];
        if (Array.isArray(matchedDyn.followUpButtons) && matchedDyn.followUpButtons.length > 0) {
          buttons = matchedDyn.followUpButtons.slice(0, 3).map((b, idx) => ({
            id: b.id || `dyn_btn_${idx}`,
            title: shortenButtonTitle(b.title || b.label || "More Info")
          }));
        } else {
          buttons = [
            { id: "btn_check_avail", title: shortenButtonTitle("Check Rates") },
            { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
          ];
        }

        let sentRes = null;
        try {
          if (replyMsg.length <= 1000 && buttons.length > 0) {
            sentRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: replyMsg,
              buttons,
              footerText: bName,
              customCredentials
            });
          } else {
            sentRes = await sendTextMessage({
              to: cleanPhone,
              body: replyMsg,
              customCredentials
            });
          }
        } catch (e) {}

        db.prepare(`
          UPDATE customer_replies 
          SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
          WHERE id = ?
        `).run(replyMsg, nowIso, replyRecord.id);

        const botReplyId = `bot_dyn_opt_${Date.now()}`;
        try {
          db.prepare(`
            INSERT INTO customer_replies (
              wa_message_id, from_phone, customer_name, message_type,
              message_body, reply_text, reply_sent_at, reply_status,
              link_id, source, is_read, user_id, received_at
            ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
          `).run(
            botReplyId, cleanPhone, cName, replyMsg, replyMsg, nowIso, replyRecord.link_id || null, nowIso
          );
          const savedBot = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
          broadcastEngine.emit("webhook:reply", savedBot);
        } catch (e) {}

        broadcastEngine.emit("inbox:reply", {
          replyId: replyRecord.id,
          replyText: replyMsg,
          replyStatus: "AUTO_REPLIED"
        });
        return { success: true, handledBy: "DYNAMIC_OPTION", replyText: replyMsg, messageId: sentRes?.messageId };
      }

      // 6. Action ID Normalization (supports both standard action IDs and user-customized button labels)
      const customConfirm = (autoReplySettings.quoteConfirm || "").toLowerCase();
      const customModify = (autoReplySettings.quoteModify || "").toLowerCase();
      const customRooms = (autoReplySettings.quoteRooms || "").toLowerCase();
      const customBtn1 = (autoReplySettings.button1 || "").toLowerCase();
      const customBtn2 = (autoReplySettings.button2 || "").toLowerCase();
      const customBtn3 = (autoReplySettings.button3 || "").toLowerCase();
      const customConf1 = (autoReplySettings.confirmedButton1 || "").toLowerCase();
      const customConf2 = (autoReplySettings.confirmedButton2 || "").toLowerCase();
      const customConf3 = (autoReplySettings.confirmedButton3 || "").toLowerCase();

      if (interactiveActionId === "btn_confirm" || lower === "confirm booking" || lower === "confirm" || (customConfirm && lower === customConfirm)) {
        effectiveText = "CONFIRM";
      } else if (interactiveActionId === "btn_rooms" || lower === "other rooms" || lower === "view other rooms" || lower === "room options" || (customRooms && lower === customRooms)) {
        effectiveText = "Show room options";
      } else if (interactiveActionId === "btn_check_avail" || lower === "check availability" || lower === "check rates") {
        effectiveText = "Check availability";
      } else if (interactiveActionId === "btn_dates_weekend" || lower === "this weekend" || (customBtn1 && lower === customBtn1)) {
        effectiveText = "Check availability for this weekend for 2 guests";
      } else if (interactiveActionId === "btn_dates_tomorrow" || lower.includes("tomorrow") || (customBtn2 && lower === customBtn2)) {
        effectiveText = "Check availability for tomorrow for 2 nights for 2 guests";
      } else if (interactiveActionId === "btn_change_dates" || lower === "change dates" || lower === "modify dates" || (customModify && lower === customModify)) {
        effectiveText = "Change dates";
      } else if (interactiveActionId === "btn_amenities" || lower === "resort facilities" || lower === "facilities" || (customConf1 && lower === customConf1)) {
        effectiveText = "resort facilities and amenities";
      } else if (interactiveActionId === "btn_menu" || lower === "dining menu" || lower === "menu" || (customConf2 && lower === customConf2)) {
        effectiveText = "restaurant dining menu";
      } else if (interactiveActionId === "btn_location" || lower === "location / map" || lower === "location" || lower === "map" || (customConf3 && lower === customConf3)) {
        effectiveText = "how to reach location directions";
      } else if (interactiveActionId === "btn_table_order") {
        effectiveText = "table order dining menu";
      } else if (interactiveActionId === "opt_booking" || lower.includes("book a stay")) {
        effectiveText = "Book a Stay";
      } else if (interactiveActionId === "opt_rooms" || lower.includes("view villas")) {
        effectiveText = "Show room options";
      } else if (interactiveActionId === "opt_concierge" || lower.includes("ask concierge")) {
        effectiveText = "Talk to Staff";
      } else if (interactiveActionId && interactiveActionId.startsWith("select_room_")) {
        const roomId = parseInt(interactiveActionId.replace("select_room_", ""), 10);
        try {
          const rm = db.prepare("SELECT name FROM room_types WHERE id = ?").get(roomId);
          if (rm?.name) effectiveText = rm.name;
        } catch (e) {}
      }

      // 7. Human Handoff Keyword / Staff Request
      if (
        interactiveActionId === "btn_staff" ||
        interactiveActionId === "opt_concierge" ||
        (customBtn3 && lower === customBtn3) ||
        /\b(call|phone|speak|talk|agent|human|manager|executive|desk|staff|someone|person|call back|help me|reception|concierge)\b/i.test(lower)
      ) {
        // Pause bot for configured duration for this contact
        const pauseMins = autoReplySettings.takeoverPauseMinutes || 60;
        this.pauseBotForPhone(cleanPhone, pauseMins * 60 * 1000);

        const handoffPhone = autoReplySettings.handoffPhone || "+91 87665 90634";
        const bName = autoReplySettings.businessName || "Hotel Green Vally";
        let handoffText = (autoReplySettings.handoffMessage ||
          "🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}.")
          .replace(/\{\{phone\}\}/gi, handoffPhone)
          .replace(/\{\{business_name\}\}/gi, bName);
        if (hospitalityChatService) {
          try {
            const hRes = hospitalityChatService.requestHumanHandoff({
              propertyId: 1,
              customerName: replyRecord.customer_name || "Guest",
              customerPhone: cleanPhone,
              inquiryDetails: effectiveText,
              tenantId: 1
            });
            if (!getSetting("BOT_HANDOFF_MESSAGE") && hRes && hRes.whatsapp_text) {
              handoffText = hRes.whatsapp_text;
            }
          } catch (e) {}
        }

        let sentMsgId = null;
        try {
          const sent = await sendTextMessage({
            to: cleanPhone,
            body: handoffText,
            customCredentials
          });
          sentMsgId = sent?.messageId || null;
        } catch (err) {
          console.warn("[Webhook Flow] Handoff send notice:", err.message);
        }

        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
        const botReplyId = `bot_handoff_${Date.now()}`;
        db.prepare(`
          INSERT INTO customer_replies (
            wa_message_id, from_phone, customer_name, message_type,
            message_body, reply_text, reply_sent_at, reply_status,
            link_id, source, is_read, user_id, received_at
          ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
        `).run(
          botReplyId,
          cleanPhone,
          replyRecord.customer_name || "Guest",
          handoffText,
          handoffText,
          nowIso,
          replyRecord.link_id || null,
          nowIso
        );

        db.prepare(`
          UPDATE customer_replies 
          SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
          WHERE id = ?
        `).run(handoffText, nowIso, replyRecord.id);

        const savedBotReply = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
        broadcastEngine.emit("webhook:reply", savedBotReply);
        broadcastEngine.emit("inbox:handoff", {
          phone: cleanPhone,
          customerName: replyRecord.customer_name,
          message: effectiveText
        });

        return { success: true, handoff: true, replyText: handoffText };
      }

      // 8. Dining & Food Menu Request Parity
      if (/\b(dining|food|restaurant|breakfast|dinner|lunch|menu|meals|cuisine|eat)\b/i.test(lower)) {
        let foodItems = [];
        try {
          foodItems = db.prepare("SELECT * FROM catalog_items WHERE item_type = 'FOOD' AND is_active = 1 LIMIT 8").all();
        } catch (e) {}

        if (foodItems && foodItems.length > 0) {
          let menuText = "🍽️ *Konkan Wave Cafe & Beach Bar Menu*\n\n";
          foodItems.forEach((f, idx) => {
            menuText += `*${idx + 1}. ${f.title}* - ₹${Number(f.base_price).toLocaleString("en-IN")}\n`;
            if (f.short_description || f.description) {
              menuText += `   _${f.short_description || f.description}_\n`;
            }
          });
          menuText += "\n_Reply with the dish name or table number to place an order, or tap below:_";

          const buttons = [
            { id: "btn_table_order", title: shortenButtonTitle("Order at Table") },
            { id: "btn_rooms", title: shortenButtonTitle(autoReplySettings.quoteRooms || "Resort Rooms") },
            { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
          ];

          let sentMsgId = null;
          try {
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: menuText,
              buttons,
              headerText: "Resort Dining Menu",
              footerText: "Konkan Wave Beach Bar",
              customCredentials
            });
            sentMsgId = btnRes.messageId;
          } catch (btnErr) {
            // Fallback to text
            try {
              const sent = await sendTextMessage({
                to: cleanPhone,
                body: menuText,
                customCredentials
              });
              sentMsgId = sent?.messageId || null;
            } catch (e) {}
          }

          const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
          const botReplyId = `bot_menu_${Date.now()}`;
          db.prepare(`
            INSERT INTO customer_replies (
              wa_message_id, from_phone, customer_name, message_type,
              message_body, reply_text, reply_sent_at, reply_status,
              link_id, source, is_read, user_id, received_at
            ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?)
          `).run(
            botReplyId,
            cleanPhone,
            replyRecord.customer_name || "Guest",
            menuText,
            menuText,
            nowIso,
            replyRecord.link_id || null,
            nowIso
          );

          db.prepare(`
            UPDATE customer_replies 
            SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
            WHERE id = ?
          `).run(menuText, nowIso, replyRecord.id);

          const savedBotReply = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
          broadcastEngine.emit("webhook:reply", savedBotReply);
          return { success: true, menu: true, replyText: menuText };
        }
      }

      // 9. Hospitality Engine Protection: Guard against duplicate generic welcome greetings
      const isBookingInquiryWithDates = Boolean(
        hospitalityFlowEngine?.parseNaturalDates ? hospitalityFlowEngine.parseNaturalDates(effectiveText) : null
      );
      const hasSpecificInquiry = isBookingInquiryWithDates ||
        /\b(rate|rates|price|prices|tariff|tariffs|room|rooms|cottage|villa|suite|stay|book|booking|reserve|reservation|available|availability|quote|cost|night|nights|weekend|tomorrow|package|packages)\b/i.test(effectiveText);

      // Only apply frequency deduplication to repeat generic inquiries without specific dates/rates/room intent
      if (!isInteractiveAction && !isResumeKeyword && !hasSpecificInquiry) {
        if (autoReplySettings.mode === "ONCE_PER_CONTACT") {
          const prior = db.prepare(`
            SELECT id FROM customer_replies 
            WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
            LIMIT 1
          `).get(cleanPhone, replyRecord.id);
          if (prior) {
            console.log(`[Webhook Flow] Universal Deduplication: contact ${cleanPhone} already received automated flow greeting. Skipping repeat generic greeting.`);
            return null;
          }
        } else if (autoReplySettings.mode === "ONCE_PER_24_HOURS") {
          const prior = db.prepare(`
            SELECT id FROM customer_replies 
            WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
              AND received_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            LIMIT 1
          `).get(cleanPhone, replyRecord.id);
          if (prior) {
            console.log(`[Webhook Flow] Universal Deduplication: contact ${cleanPhone} already received automated flow greeting in last 24h. Skipping repeat generic greeting.`);
            return null;
          }
        }

        // Rapid duplicate cooldown (30 seconds) for repeated identical generic greetings
        const recentBot = db.prepare(`
          SELECT id FROM customer_replies 
          WHERE from_phone = ? AND id != ? AND reply_status = 'AUTO_REPLIED'
            AND received_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)
          LIMIT 1
        `).get(cleanPhone, replyRecord.id);
        if (recentBot) {
          console.log(`[Webhook Flow] Rapid greeting cooldown active for ${cleanPhone}. Skipping repeat.`);
          return null;
        }
      }

      // 10. Execute Hospitality Conversational Flow Engine
      let flowRes = null;
      let matchedLink = null;
      if (replyRecord.link_id) {
        try {
          matchedLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(replyRecord.link_id);
        } catch (e) {}
      }

      // Legacy hospitalityFlowEngine is permanently disabled.
      // All inbound messages are routed through the visual Conversation Flow Engine (Flow 1).
      // The legacy engine was producing "KonkanTrip Beach Resort & Spa" messages conflicting
      // with the configured "Hotel Green Vally" branding and duplicating the modern flow engine's replies.

      if (flowRes && flowRes.text) {
        let sentMessageId = null;
        let deliveredInteractive = false;

        // Try interactive payload if options or confirmation buttons are present
        const rawPayload = flowRes.raw_payload;

        // 1. Availability / Room Selection step (rawPayload.step === "ROOM_SELECTION")
        if (rawPayload && rawPayload.interactive_type === "flow_step" && rawPayload.step === "ROOM_SELECTION") {
          // If a preferred room is selected and available
          if (rawPayload.selected_room) {
            try {
              const buttons = [
                { id: "btn_confirm", title: shortenButtonTitle(autoReplySettings.quoteConfirm || "Confirm Booking") },
                { id: "btn_rooms", title: shortenButtonTitle(autoReplySettings.quoteRooms || "Other Rooms") },
                { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
              ];
              const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
              const btnRes = await sendInteractiveButtons({
                to: cleanPhone,
                bodyText: btnBody,
                buttons,
                headerText: "Availability & Rates",
                footerText: "Hotel Green Vally",
                customCredentials
              });
              sentMessageId = btnRes.messageId;
              deliveredInteractive = true;
            } catch (e) {
              console.warn("[Webhook Flow] Buttons send fallback:", e.message);
            }
          } else if (Array.isArray(rawPayload.options)) {
            const availOpts = rawPayload.options.filter(o => o.available);
            if (availOpts.length >= 1 && availOpts.length <= 3) {
              try {
                const buttons = availOpts.map((opt) => ({
                  id: `select_room_${opt.id}`,
                  title: shortenButtonTitle(opt.name)
                }));
                const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
                const btnRes = await sendInteractiveButtons({
                  to: cleanPhone,
                  bodyText: btnBody,
                  buttons,
                  headerText: "Choose a Room",
                  footerText: "Hotel Green Vally",
                  customCredentials
                });
                sentMessageId = btnRes.messageId;
                deliveredInteractive = true;
              } catch (e) {
                console.warn("[Webhook Flow] Buttons send fallback:", e.message);
              }
            } else if (availOpts.length > 3) {
              try {
                const rows = availOpts.slice(0, 9).map(opt => ({
                  id: `select_room_${opt.id}`,
                  title: String(opt.name).substring(0, 24),
                  description: (opt.total_price ? `₹${Number(opt.total_price).toLocaleString("en-IN")} total` : `₹${opt.nightly_rate}/night`).substring(0, 72)
                }));
                rows.push({
                  id: "btn_staff",
                  title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Concierge"),
                  description: "Connect with front desk reservations team"
                });
                const listBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
                const listRes = await sendInteractiveList({
                  to: cleanPhone,
                  bodyText: listBody,
                  buttonText: "Choose Room",
                  sections: [{ title: "Available Rooms", rows }],
                  headerText: "Available Categories",
                  footerText: "Hotel Green Vally",
                  customCredentials
                });
                sentMessageId = listRes.messageId;
                deliveredInteractive = true;
              } catch (e) {
                console.warn("[Webhook Flow] List send fallback:", e.message);
              }
            }
          }
        } 
        // 2. Quote Summary (Itemized Quote presented)
        else if (rawPayload && rawPayload.interactive_type === "quote_summary") {
          try {
            const buttons = [
              { id: "btn_confirm", title: shortenButtonTitle(autoReplySettings.quoteConfirm || "Confirm Booking") },
              { id: "btn_change_dates", title: shortenButtonTitle(autoReplySettings.quoteModify || "Change Dates") },
              { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
            ];
            const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: btnBody,
              buttons,
              headerText: "Estimated Price Quote",
              footerText: "Hotel Green Vally",
              customCredentials
            });
            sentMessageId = btnRes.messageId;
            deliveredInteractive = true;
          } catch (e) {
            console.warn("[Webhook Flow] Quote buttons send fallback:", e.message);
          }
        }
        // 3. Enquiry Confirmed
        else if (rawPayload && rawPayload.interactive_type === "enquiry_confirmed") {
          try {
            const buttons = [
              { id: "btn_amenities", title: shortenButtonTitle(autoReplySettings.confirmedButton1 || "Facilities") },
              { id: "btn_menu", title: shortenButtonTitle(autoReplySettings.confirmedButton2 || "Dining Menu") },
              { id: "btn_location", title: shortenButtonTitle(autoReplySettings.confirmedButton3 || "Location / Map") }
            ];
            const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: btnBody,
              buttons,
              headerText: "Inquiry Submitted",
              footerText: "Hotel Green Vally",
              customCredentials
            });
            sentMessageId = btnRes.messageId;
            deliveredInteractive = true;
          } catch (e) {
            console.warn("[Webhook Flow] Confirmed buttons send fallback:", e.message);
          }
        }
        // 4. Room Sold Out
        else if (rawPayload && rawPayload.interactive_type === "room_sold_out") {
          try {
            const buttons = [
              { id: "btn_change_dates", title: shortenButtonTitle(autoReplySettings.quoteModify || "Change Dates") },
              { id: "btn_rooms", title: shortenButtonTitle(autoReplySettings.quoteRooms || "Other Rooms") },
              { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
            ];
            const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: btnBody,
              buttons,
              headerText: "Room Sold Out",
              footerText: "Hotel Green Vally",
              customCredentials
            });
            sentMessageId = btnRes.messageId;
            deliveredInteractive = true;
          } catch (e) {
            console.warn("[Webhook Flow] Sold out buttons send fallback:", e.message);
          }
        }
        // 5. In-Chat Flow / General Welcome / Dates & Values Intake
        else if (rawPayload && (rawPayload.interactive_type === "in_chat_flow" || (rawPayload.interactive_type === "flow_step" && rawPayload.step === "DATE_SELECTION"))) {
          let flowDispatched = false;
          const flowsEnabled = getSetting("WHATSAPP_FLOWS_ENABLED") === "true";

          if (flowsEnabled) {
            let effectiveFlow = null;
            if (matchedLink?.flow_id) {
              effectiveFlow = db.prepare("SELECT * FROM whatsapp_flows WHERE (id = ? OR meta_flow_id = ?) AND status = 'PUBLISHED'").get(matchedLink.flow_id, matchedLink.flow_id);
            }
            if (!effectiveFlow && autoReplySettings.selectedFlowId) {
              effectiveFlow = db.prepare("SELECT * FROM whatsapp_flows WHERE (id = ? OR meta_flow_id = ?) AND status = 'PUBLISHED'").get(autoReplySettings.selectedFlowId, autoReplySettings.selectedFlowId);
            }
            if (!effectiveFlow) {
              effectiveFlow = db.prepare("SELECT * FROM whatsapp_flows WHERE status = 'PUBLISHED' AND meta_flow_id IS NOT NULL ORDER BY (id = 'flow_hospitality_booking') DESC, updated_at DESC LIMIT 1").get();
            }
            if (!effectiveFlow) {
              effectiveFlow = db.prepare("SELECT * FROM whatsapp_flows WHERE status = 'PUBLISHED' ORDER BY updated_at DESC LIMIT 1").get();
            }

            if (effectiveFlow && (effectiveFlow.meta_flow_id || effectiveFlow.id)) {
              try {
                const metaFlowId = effectiveFlow.meta_flow_id || effectiveFlow.id;
                const flowService = require("./flowService");
                const flowToken = flowService.createFlowToken({
                  flowId: effectiveFlow.id,
                  metaFlowId,
                  recipientPhone: cleanPhone,
                  contextMessageId: replyRecord.wa_message_id,
                  campaignId: replyRecord.campaign_id,
                  userId: replyRecord.user_id || "bot"
                });

                let initialScreen = null;
                try {
                  const fJson = typeof effectiveFlow.flow_json === "string" ? JSON.parse(effectiveFlow.flow_json) : (effectiveFlow.flow_json || {});
                  initialScreen = fJson.screens?.[0]?.id || null;
                } catch (e) {}

                const flowCta = shortenButtonTitle("Select Dates & Guests");
                const flowHeader = shortenHeaderText(autoReplySettings.businessName || "Hotel Green Vally");
                const flowBody = flowRes.text || "Please select your stay dates and guest details using the form below to check live availability:";
                const flowFooter = "Instant Live Availability & Rates";

                const screenData = {};
                if (rawPayload.selected_room?.name) {
                  screenData.room_preference = rawPayload.selected_room.name;
                }

                const flowSendRes = await sendFlowMessage({
                  to: cleanPhone,
                  flowId: metaFlowId,
                  flowToken,
                  headerText: flowHeader,
                  bodyText: flowBody,
                  footerText: flowFooter,
                  ctaText: flowCta,
                  screen: initialScreen,
                  screenData,
                  customCredentials
                });

                if (flowSendRes && (flowSendRes.success || flowSendRes.messageId)) {
                  sentMessageId = flowSendRes.messageId;
                  deliveredInteractive = true;
                  flowDispatched = true;
                  console.log(`[Webhook Flow] ✓ Meta Flow (${metaFlowId}) delivered to ${cleanPhone}. ID: ${sentMessageId}`);
                } else {
                  console.warn(`[Webhook Flow] Meta Flow (${metaFlowId}) dispatch note: ${flowSendRes?.error || "Not published/blocked by Meta"}. Activating interactive concierge buttons fallback.`);
                }
              } catch (flowErr) {
                console.warn("[Webhook Flow] Flow send fallback to buttons:", flowErr.message);
              }
            }
          }

          // If no Flow was dispatched or if flow send failed, gracefully fallback to the 3 interactive quick buttons
          if (!flowDispatched) {
            try {
              const buttons = [
                { id: "btn_dates_weekend", title: shortenButtonTitle(autoReplySettings.button1 || "This Weekend") },
                { id: "btn_dates_tomorrow", title: shortenButtonTitle(autoReplySettings.button2 || "Tomorrow (2 N)") },
                { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
              ];
              const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
              const btnRes = await sendInteractiveButtons({
                to: cleanPhone,
                bodyText: btnBody,
                buttons,
                headerText: "Plan Your Stay",
                headerMediaUrl: autoReplySettings.welcomeMediaUrl || "",
                footerText: "Hotel Green Vally",
                customCredentials
              });
              sentMessageId = btnRes.messageId;
              deliveredInteractive = true;
            } catch (e) {
              console.warn("[Webhook Flow] Intake buttons send fallback:", e.message);
            }
          }
        }
        // 6. Amenities & Location inquiries (add buttons to continue the flow!)
        else if (
          /\b(amenities|facility|facilities|pool|beach|wifi|parking)\b/i.test(effectiveText) ||
          /\b(location|reach|address|direction|directions|where|map|route)\b/i.test(effectiveText)
        ) {
          try {
            const buttons = [
              { id: "btn_check_avail", title: "Check Rates" },
              { id: "btn_menu", title: shortenButtonTitle(autoReplySettings.confirmedButton2 || "Dining Menu") },
              { id: "btn_staff", title: shortenButtonTitle(autoReplySettings.button3 || "Talk to Staff") }
            ];
            const btnBody = flowRes.text.length > 1000 ? (flowRes.text.substring(0, 990) + "...") : flowRes.text;
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: btnBody,
              buttons,
              headerText: "Hotel Green Vally",
              footerText: "Hotel Green Vally",
              customCredentials
            });
            sentMessageId = btnRes.messageId;
            deliveredInteractive = true;
          } catch (e) {
            console.warn("[Webhook Flow] Info buttons fallback:", e.message);
          }
        }

        // Fallback to text if interactive was not sent or threw
        if (!deliveredInteractive) {
          try {
            const textRes = await sendTextMessage({
              to: cleanPhone,
              body: flowRes.text,
              customCredentials
            });
            sentMessageId = textRes?.messageId || null;
          } catch (sendErr) {
            console.warn("[Webhook Flow] Text dispatch note:", sendErr.message);
          }
        }

        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
        const botReplyId = `bot_flow_${Date.now()}`;
        db.prepare(`
          INSERT INTO customer_replies (
            wa_message_id, from_phone, customer_name, message_type,
            message_body, reply_text, reply_sent_at, reply_status,
            link_id, source, is_read, user_id, received_at, raw_payload
          ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, 'SENT', ?, 'WHATSAPP_FLOW', 1, 'bot', ?, ?)
        `).run(
          botReplyId,
          cleanPhone,
          replyRecord.customer_name || "Guest",
          flowRes.text,
          flowRes.text,
          nowIso,
          replyRecord.link_id || null,
          nowIso,
          rawPayload ? JSON.stringify(rawPayload) : null
        );

        // Mark incoming customer reply record as AUTO_REPLIED so webhooks/retries do not re-trigger
        db.prepare(`
          UPDATE customer_replies 
          SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
          WHERE id = ?
        `).run(flowRes.text, nowIso, replyRecord.id);

        const savedBotReply = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
        broadcastEngine.emit("webhook:reply", savedBotReply);

        console.log(`[Webhook Flow] ✓ Flow reply delivered to ${cleanPhone} (Interactive: ${deliveredInteractive})`);
        return {
          success: true,
          flow: true,
          interactive: deliveredInteractive,
          replyText: flowRes.text,
          messageId: sentMessageId
        };
      }

      // 10. Fallback: Standard Auto-Reply (if enabled in settings)
      const autoReplyEnabled = getSetting("AUTO_REPLY_ENABLED");
      if (autoReplyEnabled === "true" || autoReplyEnabled === true) {
        const templateMsg = getSetting("AUTO_REPLY_MESSAGE") ||
          "Hi {{name}}, thank you for reaching out! We have received your message. Our team will get back to you shortly.";
        const customerName = replyRecord.customer_name ? replyRecord.customer_name.trim() : "there";
        const finalMsg = templateMsg.replace(/\{\{name\}\}/gi, customerName);

        let sentRes = null;
        try {
          sentRes = await sendTextMessage({
            to: cleanPhone,
            body: finalMsg,
            customCredentials
          });
        } catch (e) {}

        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
        db.prepare(`
          UPDATE customer_replies 
          SET reply_text = ?, reply_sent_at = ?, reply_status = 'AUTO_REPLIED' 
          WHERE id = ?
        `).run(finalMsg, nowIso, replyRecord.id);

        const updatedRecord = {
          ...replyRecord,
          reply_text: finalMsg,
          reply_sent_at: nowIso,
          reply_status: 'AUTO_REPLIED'
        };

        broadcastEngine.emit("webhook:reply_updated", updatedRecord);
        return {
          success: true,
          messageId: sentRes?.messageId,
          replyText: finalMsg
        };
      }

      return null;
    } catch (err) {
      console.error(`[Webhook Flow] ✗ Error processing flow for ${cleanPhone}:`, err.message);
      return { success: false, error: err.message };
    } finally {
      this.activeDispatchKeys.delete(dispatchKey);
      this.inFlightAutoReplies.delete(cleanPhone);
    }
  }

  /**
   * Manually sends a custom reply from the dashboard to a customer (Staff Takeover)
   */
  async sendManualReply({ replyId, replyText, userId = null }) {
    if (!replyId) throw new Error("Reply ID is required.");
    if (!replyText || !String(replyText).trim()) throw new Error("Reply message cannot be empty.");

    const cleanText = String(replyText).trim();
    const record = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(replyId);
    if (!record) {
      throw new Error(`Customer reply #${replyId} not found.`);
    }

    const cleanPhone = String(record.from_phone).replace(/\D/g, "");
    console.log(`[Webhook Reply] Staff sending manual reply to ${cleanPhone}: "${cleanText}"`);

    // Staff Takeover: Automatically pause automated bot responses for configured duration for this contact
    const pauseMins = parseInt(getSetting("BOT_TAKEOVER_PAUSE_MINUTES") || "60", 10);
    this.pauseBotForPhone(cleanPhone, pauseMins * 60 * 1000);

    const sendResult = await sendTextMessage({
      to: cleanPhone,
      body: cleanText
    });

    const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
    const assignedUserId = userId || record.user_id || "staff";

    db.prepare(`
      UPDATE customer_replies 
      SET reply_text = ?, reply_sent_at = ?, reply_status = 'SENT', is_read = 1, user_id = ?
      WHERE id = ?
    `).run(cleanText, nowIso, assignedUserId, replyId);

    const updatedRecord = {
      ...record,
      reply_text: cleanText,
      reply_sent_at: nowIso,
      reply_status: 'SENT',
      is_read: 1,
      user_id: assignedUserId
    };

    broadcastEngine.emit("webhook:reply_updated", updatedRecord);
    console.log(`[Webhook Reply] ✓ Manual reply delivered to ${cleanPhone}. Message ID: ${sendResult.messageId || 'OK'}`);

    return updatedRecord;
  }

  /**
   * Gets current auto-reply settings
   */
  getAutoReplySettings() {
    const self = this;
    const getDefaultOpts = () => {
      try {
        if (self && typeof self.getDefaultDynamicOptions === "function") {
          return self.getDefaultDynamicOptions();
        }
      } catch (e) {}
      if (WebhookService && WebhookService.prototype && typeof WebhookService.prototype.getDefaultDynamicOptions === "function") {
        return WebhookService.prototype.getDefaultDynamicOptions();
      }
      return [];
    };

    const rawOptions = (() => {
      try {
        const raw = getSetting("BOT_DYNAMIC_OPTIONS");
        if (!raw) return getDefaultOpts();
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : getDefaultOpts();
      } catch (e) {
        return getDefaultOpts();
      }
    })();

    const normalizedOptions = rawOptions.map((opt, idx) => ({
      ...opt,
      id: opt.id || `dyn_${Date.now()}_${idx}`,
      title: opt.title || `Rule ${idx + 1}`,
      buttonLabel: opt.buttonLabel || opt.title || `Rule ${idx + 1}`,
      triggers: opt.triggers || opt.matchTerms || "",
      matchTerms: opt.matchTerms || opt.triggers || "",
      matcherType: opt.matcherType || opt.matchType || "CONTAINS",
      matchType: opt.matchType || opt.matcherType || "CONTAINS",
      stage: opt.stage || "ANY",
      actionType: opt.actionType || opt.action || "REPLY_TEXT",
      action: opt.action || opt.actionType || "REPLY_TEXT",
      responsePayload: opt.responsePayload || opt.responseText || "",
      responseText: opt.responseText || opt.responsePayload || "",
      url: opt.url || opt.link || "",
      link: opt.url || opt.link || "",
      followUpButtons: Array.isArray(opt.followUpButtons) ? opt.followUpButtons : [],
      isActive: opt.isActive !== false && opt.active !== false,
      active: opt.active !== false && opt.isActive !== false,
      showInGreeting: Boolean(opt.showInGreeting)
    }));

    const fallbackMsg = getSetting("AUTO_REPLY_MESSAGE") || "Hi {{name}}, thank you for reaching out! We have received your message and our team will get back to you shortly.";

    return {
      enabled: getSetting("AUTO_REPLY_ENABLED") !== "false",
      mode: getSetting("AUTO_REPLY_MODE") || "ONCE_PER_CONTACT",
      engineMode: getSetting("AUTO_REPLY_ENGINE_MODE") || "HOSPITALITY_FLOW",
      message: fallbackMsg,
      fallbackMessage: fallbackMsg,
      businessName: getSetting("BOT_BUSINESS_NAME") || "Hotel Green Vally",
      welcomeMessage: getSetting("BOT_WELCOME_MESSAGE") || "👋 Hello {{name}}! Welcome to *{{business_name}}*.\n\nHow can we help you today? Select an option below or reply with your travel dates to check real-time availability and live rates! 👇",
      welcomeMediaUrl: getSetting("BOT_WELCOME_MEDIA_URL") || "",
      button1: getSetting("BOT_WELCOME_BUTTON_1_LABEL") || "This Weekend",
      button2: getSetting("BOT_WELCOME_BUTTON_2_LABEL") || "Tomorrow (2 N)",
      button3: getSetting("BOT_WELCOME_BUTTON_3_LABEL") || "Talk to Staff",
      quoteConfirm: getSetting("BOT_QUOTE_CONFIRM_LABEL") || "Confirm Booking",
      quoteModify: getSetting("BOT_QUOTE_MODIFY_LABEL") || "Change Dates",
      quoteRooms: getSetting("BOT_QUOTE_ROOMS_LABEL") || "Other Rooms",
      confirmedButton1: getSetting("BOT_CONFIRMED_BUTTON_1_LABEL") || "Facilities",
      confirmedButton2: getSetting("BOT_CONFIRMED_BUTTON_2_LABEL") || "Dining Menu",
      confirmedButton3: getSetting("BOT_CONFIRMED_BUTTON_3_LABEL") || "Location / Map",
      handoffPhone: getSetting("BOT_HANDOFF_PHONE") || "+91 87665 90634",
      handoffMessage: getSetting("BOT_HANDOFF_MESSAGE") || "🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}.",
      selectedFlowId: getSetting("DEFAULT_WHATSAPP_FLOW_ID") || "flow_hospitality_booking",
      takeoverPauseMinutes: parseInt(getSetting("BOT_TAKEOVER_PAUSE_MINUTES") || "60", 10),
      sessionTimeoutMinutes: parseInt(getSetting("BOT_SESSION_TIMEOUT_MINUTES") || "30", 10),
      strictInboundOnly: getSetting("BOT_STRICT_INBOUND_ONLY") !== "false",
      dynamicOptions: normalizedOptions
    };
  }

  getDefaultDynamicOptions() {
    return [
      {
        id: "opt_spa",
        title: "Spa & Wellness",
        buttonLabel: "Spa & Wellness",
        triggers: "spa, massage, wellness, ayurveda, steam, relaxation, facial",
        matchType: "CONTAINS",
        stage: "ANY",
        actionType: "REPLY_TEXT",
        responseText: "🌿 *Ayurvedic Beachside Spa & Wellness*\n\nIndulge in our rejuvenating oceanfront therapies:\n• *Abhyanga Full Body Massage*: ₹2,400 (60 mins)\n• *Aromatherapy Deep Tissue*: ₹2,800 (60 mins)\n• *Herbal Steam & Shirodhara*: ₹1,800 (45 mins)\n\n🕒 Open daily from 08:00 AM to 08:00 PM.\nWould you like us to reserve a slot for you?",
        followUpButtons: [
          { id: "btn_staff", title: "Book Spa Slot" },
          { id: "btn_check_avail", title: "View Rooms" }
        ],
        active: true,
        showInGreeting: false
      },
      {
        id: "opt_sightseeing",
        title: "Local Tours",
        buttonLabel: "Sightseeing",
        triggers: "tour, sightseeing, beach, scuba, watersports, fort, travel, attractions, boat",
        matchType: "CONTAINS",
        stage: "ANY",
        actionType: "REPLY_TEXT",
        responseText: "⛵ *Must-Visit Attractions Nearby*\n\n1. *Sindhudurg Sea Fort* - 15 mins by ferry (Historical 17th Century Fort)\n2. *Tsunami Island Watersports* - Jet skiing, Parasailing & Banana Rides\n3. *Scuba Diving at Tarkali* - Clear coral reef diving with certified PADI divers\n4. *Devbagh Sangam Beach* - Pristine estuary where the Karli river meets the sea\n\nOur travel desk can arrange private cabs and boat tickets!",
        followUpButtons: [
          { id: "btn_check_avail", title: "Plan Stay" },
          { id: "btn_staff", title: "Book Cab / Tour" }
        ],
        active: true,
        showInGreeting: false
      },
      {
        id: "opt_ferry",
        title: "Ferry & Directions",
        buttonLabel: "Ferry & Route",
        triggers: "ferry, ro-ro, boat, jetty, reaching, route, distance, map, directions, reach",
        matchType: "CONTAINS",
        stage: "ANY",
        actionType: "REPLY_TEXT",
        responseText: "🚗 *How to Reach Us & Ferry Schedules*\n\n• *From Mumbai / Pune*: Take NH 66 or M2M Ferries Ro-Pax from Bhaucha Dhakka to Mandwa.\n• *Ferry Schedule*: Runs every hour from 06:30 AM to 07:30 PM daily.\n• *Nearest Airport*: Chipi Airport (Sindhudurg - 35 mins) or Mopa Airport (Goa - 90 mins).\n\n📍 Google Maps: https://maps.google.com/?q=Hotel+Green+Vally",
        followUpButtons: [
          { id: "btn_check_avail", title: "Check Rates" },
          { id: "btn_staff", title: "Need Pickup" }
        ],
        active: true,
        showInGreeting: false
      },
      {
        id: "opt_wifi",
        title: "WiFi & Timings",
        buttonLabel: "WiFi & Timings",
        triggers: "wifi, password, internet, pool, swimming pool, breakfast, dinner, timings",
        matchType: "CONTAINS",
        stage: "ANY",
        actionType: "REPLY_TEXT",
        responseText: "📶 *Resort Guest Essentials*\n\n• *Wi-Fi Network*: `GreenVally_Guest` (Password: `BeachVibes2026`)\n• *Infinity Pool*: 07:00 AM – 08:00 PM (Costume mandatory)\n• *Breakfast Buffet*: 07:30 AM – 10:30 AM\n• *Dinner Buffet*: 07:30 PM – 10:30 PM\n• *Room Service*: Dial `9` from your room phone anytime!",
        followUpButtons: [
          { id: "btn_menu", title: "Dining Menu" },
          { id: "btn_staff", title: "Call Front Desk" }
        ],
        active: true,
        showInGreeting: false
      }
    ];
  }

  /**
   * Updates auto-reply settings
   */
  saveAutoReplySettings(payload = {}) {
    if (payload.enabled !== undefined) {
      const isEnabled = payload.enabled === true || payload.enabled === "true";
      setSetting("AUTO_REPLY_ENABLED", isEnabled ? "true" : "false");
    }
    const mode = payload.mode || payload.auto_reply_mode;
    if (mode && (mode === "ONCE_PER_CONTACT" || mode === "ONCE_PER_24_HOURS" || mode === "ALWAYS")) {
      setSetting("AUTO_REPLY_MODE", mode);
    }
    const engineMode = payload.engineMode || payload.engine_mode;
    if (engineMode && (engineMode === "HOSPITALITY_FLOW" || engineMode === "SIMPLE_GREETING" || engineMode === "FLOW_STUDIO" || engineMode === "CONVERSATION_FLOW")) {
      setSetting("AUTO_REPLY_ENGINE_MODE", engineMode);
    }
    const msg = payload.fallbackMessage !== undefined ? payload.fallbackMessage : (payload.message !== undefined ? payload.message : payload.auto_reply_message);
    if (msg !== undefined && String(msg).trim()) {
      setSetting("AUTO_REPLY_MESSAGE", String(msg).trim());
    }
    const bName = payload.businessName || payload.business_name;
    if (bName !== undefined && String(bName).trim()) {
      const cleanBName = String(bName).trim().substring(0, 100);
      setSetting("BOT_BUSINESS_NAME", cleanBName);
      try {
        db.prepare("UPDATE properties SET name = ? WHERE id = 1").run(cleanBName);
      } catch (e) {}
    }
    const welcome = payload.welcomeMessage || payload.welcome_message;
    if (welcome !== undefined && String(welcome).trim()) {
      setSetting("BOT_WELCOME_MESSAGE", String(welcome).trim());
    }
    if (payload.welcomeMediaUrl !== undefined || payload.welcome_media_url !== undefined) {
      const media = payload.welcomeMediaUrl ?? payload.welcome_media_url;
      setSetting("BOT_WELCOME_MEDIA_URL", String(media || "").trim());
    }
    if (payload.button1 !== undefined || payload.button_1 !== undefined || payload.welcomeButton1 !== undefined) {
      const b1 = payload.button1 ?? payload.button_1 ?? payload.welcomeButton1;
      setSetting("BOT_WELCOME_BUTTON_1_LABEL", shortenButtonTitle(String(b1 || "").trim() || "This Weekend"));
    }
    if (payload.button2 !== undefined || payload.button_2 !== undefined || payload.welcomeButton2 !== undefined) {
      const b2 = payload.button2 ?? payload.button_2 ?? payload.welcomeButton2;
      setSetting("BOT_WELCOME_BUTTON_2_LABEL", shortenButtonTitle(String(b2 || "").trim() || "Tomorrow (2 N)"));
    }
    if (payload.button3 !== undefined || payload.button_3 !== undefined || payload.welcomeButton3 !== undefined) {
      const b3 = payload.button3 ?? payload.button_3 ?? payload.welcomeButton3;
      setSetting("BOT_WELCOME_BUTTON_3_LABEL", shortenButtonTitle(String(b3 || "").trim() || "Talk to Staff"));
    }
    if (payload.quoteConfirm !== undefined || payload.quote_confirm !== undefined) {
      const qc = payload.quoteConfirm ?? payload.quote_confirm;
      setSetting("BOT_QUOTE_CONFIRM_LABEL", shortenButtonTitle(String(qc || "").trim() || "Confirm Booking"));
    }
    if (payload.quoteModify !== undefined || payload.quote_modify !== undefined) {
      const qm = payload.quoteModify ?? payload.quote_modify;
      setSetting("BOT_QUOTE_MODIFY_LABEL", shortenButtonTitle(String(qm || "").trim() || "Change Dates"));
    }
    if (payload.quoteRooms !== undefined || payload.quote_rooms !== undefined) {
      const qr = payload.quoteRooms ?? payload.quote_rooms;
      setSetting("BOT_QUOTE_ROOMS_LABEL", shortenButtonTitle(String(qr || "").trim() || "Other Rooms"));
    }
    if (payload.confirmedButton1 !== undefined || payload.confirmed_button_1 !== undefined) {
      const cb1 = payload.confirmedButton1 ?? payload.confirmed_button_1;
      setSetting("BOT_CONFIRMED_BUTTON_1_LABEL", shortenButtonTitle(String(cb1 || "").trim() || "Facilities"));
    }
    if (payload.confirmedButton2 !== undefined || payload.confirmed_button_2 !== undefined) {
      const cb2 = payload.confirmedButton2 ?? payload.confirmed_button_2;
      setSetting("BOT_CONFIRMED_BUTTON_2_LABEL", shortenButtonTitle(String(cb2 || "").trim() || "Dining Menu"));
    }
    if (payload.confirmedButton3 !== undefined || payload.confirmed_button_3 !== undefined) {
      const cb3 = payload.confirmedButton3 ?? payload.confirmed_button_3;
      setSetting("BOT_CONFIRMED_BUTTON_3_LABEL", shortenButtonTitle(String(cb3 || "").trim() || "Location / Map"));
    }
    const phone = payload.handoffPhone || payload.handoff_phone;
    if (phone !== undefined && String(phone).trim()) {
      setSetting("BOT_HANDOFF_PHONE", String(phone).trim());
    }
    const handoffMsg = payload.handoffMessage || payload.handoff_message;
    if (handoffMsg !== undefined && String(handoffMsg).trim()) {
      setSetting("BOT_HANDOFF_MESSAGE", String(handoffMsg).trim());
    }
    const flowId = payload.selectedFlowId !== undefined ? payload.selectedFlowId : (payload.flowId !== undefined ? payload.flowId : payload.flow_id);
    if (flowId !== undefined) {
      setSetting("DEFAULT_WHATSAPP_FLOW_ID", flowId ? String(flowId).trim() : "");
    }
    const pauseMins = payload.takeoverPauseMinutes || payload.takeover_pause_minutes;
    if (pauseMins !== undefined) {
      const parsed = parseInt(pauseMins, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        setSetting("BOT_TAKEOVER_PAUSE_MINUTES", String(parsed));
      }
    }
    const sessionTimeout = payload.sessionTimeoutMinutes ?? payload.session_timeout_minutes;
    if (sessionTimeout !== undefined) {
      const parsedTimeout = parseInt(sessionTimeout, 10);
      if (!isNaN(parsedTimeout) && parsedTimeout >= 1) {
        setSetting("BOT_SESSION_TIMEOUT_MINUTES", String(parsedTimeout));
      }
    }
    if (payload.strictInboundOnly !== undefined || payload.strict_inbound_only !== undefined) {
      const strictVal = payload.strictInboundOnly ?? payload.strict_inbound_only;
      setSetting("BOT_STRICT_INBOUND_ONLY", strictVal ? "true" : "false");
    }
    if (payload.dynamicOptions !== undefined) {
      let opts = payload.dynamicOptions;
      if (typeof opts === "string") {
        try { opts = JSON.parse(opts); } catch (e) { opts = []; }
      }
      if (Array.isArray(opts)) {
        const normalized = opts.map((opt, idx) => ({
          ...opt,
          id: opt.id || `dyn_${Date.now()}_${idx}`,
          title: opt.title || `Custom Rule ${idx + 1}`,
          buttonLabel: opt.buttonLabel || opt.title || `Rule ${idx + 1}`,
          triggers: opt.triggers || opt.matchTerms || "",
          matchTerms: opt.matchTerms || opt.triggers || "",
          matchType: opt.matchType || opt.matcherType || "CONTAINS",
          matcherType: opt.matcherType || opt.matchType || "CONTAINS",
          stage: opt.stage || "ANY",
          actionType: opt.actionType || opt.action || "REPLY_TEXT",
          action: opt.action || opt.actionType || "REPLY_TEXT",
          responseText: opt.responseText || opt.responsePayload || "",
          responsePayload: opt.responsePayload || opt.responseText || "",
          url: opt.url || opt.link || "",
          link: opt.url || opt.link || "",
          followUpButtons: Array.isArray(opt.followUpButtons) ? opt.followUpButtons : [],
          active: opt.active !== false && opt.isActive !== false,
          isActive: opt.isActive !== false && opt.active !== false,
          showInGreeting: Boolean(opt.showInGreeting)
        }));
        setSetting("BOT_DYNAMIC_OPTIONS", JSON.stringify(normalized));
      }
    }
    return this.getAutoReplySettings();
  }
}

module.exports = new WebhookService();
