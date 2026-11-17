const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { db, getSetting, setSetting } = require("../config/database");
const config = require("../config/env");
const broadcastEngine = require("./broadcastEngine");
const {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  downloadAndSaveInboundMedia
} = require("./metaWhatsAppService");

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

class WebhookService {
  constructor() {
    this.inFlightAutoReplies = new Set();
    this.botPausedUntil = new Map(); // cleanPhone -> expiryTimestamp (ms)
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
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      remainingMinutes: expiresAt ? Math.max(0, Math.round((expiresAt - Date.now()) / 60000)) : 0
    };
  }

  /**
   * Automatically detects and attributes Click-to-Chat Link or Table QR from incoming WhatsApp message
   */
  detectChatLinkAttribution(messageBody = "", cleanPhone = "") {
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

    if (mode === "subscribe" && token === expectedToken) {
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
    if (!payload || !Array.isArray(payload.entry)) {
      return { processed: 0, messages: 0, statuses: 0 };
    }

    let processedMessages = 0;
    let processedStatuses = 0;

    for (const entry of payload.entry) {
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
      return { saved: false, id: existing.id };
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
          customerName,
          jsonString,
          jsonString,
          JSON.stringify(parsedResponse),
          replyUserId,
          matchedCampaignId
        );
        flowResponseId = respResult.lastInsertRowid || null;

        // Broadcast real-time SSE event
        broadcastEngine.emit("webhook:flow_response", {
          responseId: flowResponseId,
          flowId,
          customerName,
          fromPhone,
          cleanPhone,
          answers: parsedResponse
        });

        // PRD PR-007: Automatic Booking Enquiry Creation from Flow Submission
        try {
          const enquiryService = require("./enquiryService");
          const checkIn = parsedResponse.check_in || parsedResponse.checkin || parsedResponse.preferred_date || parsedResponse.arrival_date;
          let checkOut = parsedResponse.check_out || parsedResponse.checkout || parsedResponse.departure_date;
          if (checkIn && !checkOut) {
            const d = new Date(checkIn);
            d.setDate(d.getDate() + 1);
            checkOut = d.toISOString().split("T")[0];
          }
          if (checkIn && checkOut) {
            const cin = new Date(checkIn);
            const cout = new Date(checkOut);
            if (!isNaN(cin.getTime()) && !isNaN(cout.getTime()) && cout > cin) {
              enquiryService.createEnquiry(1, {
                phone: cleanPhone,
                guest_name: parsedResponse.guest_name || parsedResponse.full_name || customerName,
                check_in: checkIn,
                check_out: checkOut,
                adults: Number(parsedResponse.adults || parsedResponse.party_size || 2),
                children: Number(parsedResponse.children || 0),
                room_preference: parsedResponse.room_preference || parsedResponse.experience_type || parsedResponse.room_type,
                flow_session_id: waMessageId || clientToken || `flow_${Date.now()}`,
                preferences: parsedResponse
              });
            }
          }
        } catch (enquiryErr) {
          console.warn("[WebhookService] Auto-enquiry creation notice:", enquiryErr.message);
        }
      } catch (respErr) {
        console.warn("[Webhook FlowResponse] Insert notice:", respErr.message);
      }
    }

    // PRD Attribution: Automatically detect and associate Click-to-Chat Link or Table QR
    let matchedLinkId = null;
    let matchedLink = null;
    try {
      matchedLink = this.detectChatLinkAttribution(messageBody, cleanPhone);
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
        link_id, source, is_read, user_id, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
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
        waErrMsg = firstErr.message || firstErr.title || `Meta delivery error (${waErrCode})`;
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
      errorMsg = err.message || err.title || `Meta delivery error (${errorCode})`;
      if (err.error_data?.details) {
        errorMsg += ` - ${err.error_data.details}`;
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
          ('cr_' || cr.id) as id,
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
      type: msgType
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
      object: "whatsapp_business_account",
      entry: [
        {
          id: "SIMULATED_ACCOUNT",
          changes: [
            {
              value: {
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

    // 1. Concurrency Lock: Prevent rapid burst incoming messages from the same phone from racing
    if (this.inFlightAutoReplies.has(cleanPhone)) {
      console.log(`[Webhook Flow] Concurrency: Flow already in-flight for ${cleanPhone}. Skipping race condition.`);
      return null;
    }
    this.inFlightAutoReplies.add(cleanPhone);

    try {
      // 2. Check Staff Takeover / Bot Pause
      if (this.isBotPausedForPhone(cleanPhone)) {
        console.log(`[Webhook Flow] Bot is currently paused for ${cleanPhone} (Staff Takeover active). Skipping automated response.`);
        return null;
      }

      // 3. Auto-opt-out suppression check
      const rawText = String(replyRecord.message_body || "").trim();
      const upper = rawText.toUpperCase();
      if (["STOP", "UNSUBSCRIBE", "OPT OUT", "OPTOUT", "CANCEL"].includes(upper)) {
        return null;
      }

      // 4. Resolve multi-line sender phone ID (from incoming webhook metadata or link configuration)
      const incomingPhoneId = rawValue?.metadata?.phone_number_id || null;
      const customCredentials = incomingPhoneId ? { phoneNumberId: incomingPhoneId } : null;

      // 5. Extract interactive action or button selection
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

      const lower = effectiveText.toLowerCase();

      // 6. Action ID Normalization
      if (interactiveActionId === "btn_confirm" || lower === "confirm booking" || lower === "confirm") {
        effectiveText = "CONFIRM";
      } else if (interactiveActionId === "btn_rooms" || lower === "other rooms" || lower === "view other rooms" || lower === "room options") {
        effectiveText = "Show room options";
      } else if (interactiveActionId === "btn_amenities" || lower === "resort facilities") {
        effectiveText = "resort facilities and amenities";
      } else if (interactiveActionId === "btn_menu" || lower === "dining menu") {
        effectiveText = "restaurant dining menu";
      } else if (interactiveActionId === "btn_location" || lower === "location / map") {
        effectiveText = "how to reach location directions";
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
        /\b(call|phone|speak|talk|agent|human|manager|executive|desk|staff|someone|person|call back|help me|reception)\b/i.test(lower)
      ) {
        // Pause bot for 60 minutes for this contact
        this.pauseBotForPhone(cleanPhone, 60 * 60 * 1000);

        let handoffText = "🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at +91 87665 90634.";
        if (hospitalityChatService) {
          try {
            const hRes = hospitalityChatService.requestHumanHandoff({
              propertyId: 1,
              customerName: replyRecord.customer_name || "Guest",
              customerPhone: cleanPhone,
              inquiryDetails: effectiveText,
              tenantId: 1
            });
            if (hRes && hRes.whatsapp_text) {
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
            { id: "btn_table_order", title: "Order at Table" },
            { id: "btn_rooms", title: "Resort Rooms" },
            { id: "btn_staff", title: "Talk to Staff" }
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

          const savedBotReply = db.prepare("SELECT * FROM customer_replies WHERE wa_message_id = ?").get(botReplyId);
          broadcastEngine.emit("webhook:reply", savedBotReply);
          return { success: true, menu: true, replyText: menuText };
        }
      }

      // 9. Execute Hospitality Conversational Flow Engine
      let flowRes = null;
      let matchedLink = null;
      if (replyRecord.link_id) {
        try {
          matchedLink = db.prepare("SELECT * FROM chat_links WHERE id = ?").get(replyRecord.link_id);
        } catch (e) {}
      }

      if (hospitalityFlowEngine) {
        try {
          flowRes = hospitalityFlowEngine.handleCustomerInquiry({
            channel: "WHATSAPP",
            phone: cleanPhone,
            guestName: replyRecord.customer_name || "Guest",
            text: effectiveText,
            link: matchedLink,
            tenantId: 1
          });
        } catch (flowErr) {
          console.warn("[Webhook Flow] Engine execution warning:", flowErr.message);
        }
      }

      if (flowRes && flowRes.text) {
        let sentMessageId = null;
        let deliveredInteractive = false;

        // Try interactive payload if options or confirmation buttons are present
        const rawPayload = flowRes.raw_payload;
        if (rawPayload && rawPayload.interactive_type === "flow_step" && rawPayload.step === "ROOM_SELECTION") {
          // If a preferred room is selected and available
          if (rawPayload.selected_room) {
            try {
              const buttons = [
                { id: "btn_confirm", title: "Confirm Booking" },
                { id: "btn_rooms", title: "View Other Rooms" },
                { id: "btn_staff", title: "Talk to Staff" }
              ];
              const btnRes = await sendInteractiveButtons({
                to: cleanPhone,
                bodyText: flowRes.text,
                buttons,
                headerText: "Availability & Rates",
                footerText: "KonkanTrip Concierge",
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
                const buttons = availOpts.map((opt, i) => ({
                  id: `select_room_${opt.id}`,
                  title: opt.name.substring(0, 20)
                }));
                const btnRes = await sendInteractiveButtons({
                  to: cleanPhone,
                  bodyText: flowRes.text,
                  buttons,
                  headerText: "Choose a Room Category",
                  footerText: "KonkanTrip Concierge",
                  customCredentials
                });
                sentMessageId = btnRes.messageId;
                deliveredInteractive = true;
              } catch (e) {}
            } else if (availOpts.length > 3) {
              try {
                const rows = availOpts.slice(0, 10).map(opt => ({
                  id: `select_room_${opt.id}`,
                  title: opt.name.substring(0, 24),
                  description: (opt.total_price ? `₹${Number(opt.total_price).toLocaleString("en-IN")} total` : `₹${opt.nightly_rate}/night`).substring(0, 72)
                }));
                const listRes = await sendInteractiveList({
                  to: cleanPhone,
                  bodyText: flowRes.text,
                  buttonText: "Select Room",
                  sections: [{ title: "Available Rooms", rows }],
                  headerText: "Available Categories",
                  footerText: "KonkanTrip Concierge",
                  customCredentials
                });
                sentMessageId = listRes.messageId;
                deliveredInteractive = true;
              } catch (e) {}
            }
          }
        } else if (rawPayload && rawPayload.interactive_type === "enquiry_confirmed") {
          try {
            const buttons = [
              { id: "btn_amenities", title: "Resort Facilities" },
              { id: "btn_menu", title: "Dining Menu" },
              { id: "btn_location", title: "Location / Map" }
            ];
            const btnRes = await sendInteractiveButtons({
              to: cleanPhone,
              bodyText: flowRes.text,
              buttons,
              headerText: "Inquiry Submitted",
              footerText: "KonkanTrip Front Desk",
              customCredentials
            });
            sentMessageId = btnRes.messageId;
            deliveredInteractive = true;
          } catch (e) {}
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
          "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message. Our team will get back to you shortly.";
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

    // Staff Takeover: Automatically pause automated bot responses for 60 minutes for this contact
    this.pauseBotForPhone(cleanPhone, 60 * 60 * 1000);

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
    return {
      enabled: getSetting("AUTO_REPLY_ENABLED") === "true",
      mode: getSetting("AUTO_REPLY_MODE") || "ONCE_PER_CONTACT",
      message: getSetting("AUTO_REPLY_MESSAGE") || "Hi {{name}}, thank you for reaching out to KonkanTrip! We have received your message and our team will get back to you shortly."
    };
  }

  /**
   * Updates auto-reply settings
   */
  saveAutoReplySettings({ enabled, mode, message }) {
    if (enabled !== undefined) {
      const isEnabled = enabled === true || enabled === "true";
      setSetting("AUTO_REPLY_ENABLED", isEnabled ? "true" : "false");
    }
    if (mode && (mode === "ONCE_PER_CONTACT" || mode === "ONCE_PER_24_HOURS")) {
      setSetting("AUTO_REPLY_MODE", mode);
    }
    if (message && String(message).trim()) {
      setSetting("AUTO_REPLY_MESSAGE", String(message).trim());
    }
    return this.getAutoReplySettings();
  }
}

module.exports = new WebhookService();
