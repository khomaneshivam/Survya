const crypto = require("crypto");
const webhookService = require("../services/webhookService");
const { getSetting, db } = require("../config/database");
const config = require("../config/env");

// Legacy shared-bot settings and webhook secrets are not tenant-isolated.
// Deny access to other workspaces until these settings have their own data model.
function requireLegacyWorkspace(req, res) {
  if (Number(req.user?.tenant_id) === 1) return true;
  res.status(403).json({ success: false, message: "Legacy shared automation settings are unavailable for this workspace." });
  return false;
}

/**
 * Validates incoming Meta X-Hub-Signature-256 against raw request payload
 */
function verifyMetaSignature(req) {
  // Signature bypass is permitted only by an explicit local development flag.
  // A database setting must never turn off verification in production.
  if (process.env.NODE_ENV !== "production" && process.env.VERIFY_WEBHOOK_SIGNATURE === "false") {
    return true;
  }

  const signature = req.headers["x-hub-signature-256"];
  let appSecret = config.META_APP_SECRET || getSetting("META_APP_SECRET") || process.env.META_APP_SECRET || "";
  appSecret = String(appSecret).trim().replace(/^["']|["']$/g, "");

  // Fail closed for live traffic. Development fixtures may omit the secret.
  if (!appSecret || /placeholder|your_meta_app_secret|your_app_secret|dummy|optional/i.test(appSecret)) {
    return process.env.NODE_ENV !== "production";
  }

  // If App Secret is configured, enforce strict HMAC-SHA256 signature verification
  if (!signature || !signature.startsWith("sha256=")) {
    console.warn("[Webhook Security] Missing or malformed X-Hub-Signature-256 header on signed webhook.");
    return false;
  }

  const clientHash = signature.substring(7);
  const rawBody = req.rawBody || Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body || {}));
  const expectedHash = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const clientBuf = Buffer.from(clientHash, "hex");
    const expectedBuf = Buffer.from(expectedHash, "hex");
    if (clientBuf.length !== expectedBuf.length) {
      console.warn("[Webhook Security] Signature length mismatch. Verify META_APP_SECRET in .env matches your Meta App Secret.");
      return false;
    }
    const isMatch = crypto.timingSafeEqual(clientBuf, expectedBuf);
    if (!isMatch) {
      console.warn("[Webhook Security] HMAC-SHA256 signature mismatch! Check META_APP_SECRET in .env against App Secret in developers.facebook.com.");
    }
    return isMatch;
  } catch (err) {
    console.error("[Webhook Security] Signature check exception:", err);
    return false;
  }
}

/**
 * Handles Meta Webhook Verification Handshake (GET /webhook or GET /api/webhook)
 */
function handleVerification(req, res) {
  try {
    const { verified, challenge } = webhookService.verifyHandshake(req.query);

    if (verified) {
      console.log(`[Webhook Handshake] Meta verification challenge accepted.`);
      return res.status(200).send(challenge);
    } else {
      console.warn(`[Webhook Handshake] Meta verification FAILED for provided token.`);
      return res.status(403).send("Forbidden: Invalid verification token or hub.mode");
    }
  } catch (error) {
    console.error("[WebhookController] Handshake error:", error);
    return res.status(500).send("Internal Server Error");
  }
}

/**
 * Handles Meta Webhook Event Notification (POST /webhook or POST /api/webhook)
 */
function handleIncomingEvent(req, res) {
  if (!verifyMetaSignature(req)) {
    return res.status(403).json({ success: false, message: "Forbidden: Invalid webhook signature." });
  }

  // Acknowledge to Meta only after committing the payload to the durable queue.
  // The content digest makes retries idempotent, unlike Meta's static WABA entry ID.
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, message: "Invalid webhook payload." });
    }

    const rawBody = req.rawBody || Buffer.from(JSON.stringify(payload));
    const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
    const { enqueueJob } = require("../services/queue/jobQueueService");
    const queued = enqueueJob({
      tenantId: 0, // System-scoped ingress; individual messages resolve their tenant on processing.
      queueName: "webhook",
      jobType: "META_WEBHOOK_INGEST",
      idempotencyKey: `meta_ingest_${digest}`,
      payload,
      priority: 10,
      maxAttempts: 7
    });

    if (!queued?.success) throw new Error("Webhook event could not be durably queued");
    return res.status(200).send("EVENT_RECEIVED");
  } catch (error) {
    console.error("[Webhook] Durable enqueue failed:", error.message);
    // A 5xx instructs Meta to retry rather than losing a just-acknowledged event.
    return res.status(503).json({ success: false, message: "Temporary webhook ingestion failure." });
  }
}

/**
 * Gets Webhook configuration and status for the UI
 */
function getConfig(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const user = req.user;
    let verifyToken = webhookService.getVerifyToken();
    
    // Mask verify token for non-administrators
    if (user && user.role !== "ADMIN" && verifyToken) {
      verifyToken = verifyToken.substring(0, 4) + "••••••••" + verifyToken.substring(verifyToken.length - 4);
    }

    const publicUrl = getSetting("PUBLIC_WEBHOOK_URL") || process.env.PUBLIC_WEBHOOK_URL || null;
    const host = req.get("host") || `localhost:${config.PORT}`;
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";

    const webhookUrl = publicUrl ? `${publicUrl}/webhook` : `${protocol}://${host}/webhook`;
    const altWebhookUrl = publicUrl ? `${publicUrl}/api/webhook` : `${protocol}://${host}/api/webhook`;

    const scopedUserId = user && user.role !== "ADMIN" ? user.id : null;
    const repliesStats = webhookService.getReplies({ limit: 1, userId: scopedUserId, tenantId: req.user?.tenant_id || 1 });

    return res.status(200).json({
      success: true,
      data: {
        verifyToken,
        webhookUrl,
        altWebhookUrl,
        publicTunnelUrl: publicUrl,
        tunnelConnected: Boolean(publicUrl),
        tunnelType: "direct",
        totalReplies: repliesStats.totalCount,
        unreadReplies: repliesStats.unreadCount,
        distinctContacts: repliesStats.distinctContacts,
        isConfigured: Boolean(verifyToken && verifyToken.length > 5)
      }
    });
  } catch (error) {
    console.error("[WebhookController] getConfig error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Tests the live webhook handshake from the server to verify Meta connectivity
 */
async function testHandshake(req, res) {
  try {
    const { token, challenge = "test_meta_challenge_123" } = req.body || req.query || {};
    const verifyToken = token || webhookService.getVerifyToken();
    const urls = webhookService.resolveWebhookUrls(req);
    const testUrl = `${urls.primaryUrl}?hub.mode=subscribe&hub.challenge=${encodeURIComponent(challenge)}&hub.verify_token=${encodeURIComponent(verifyToken)}`;

    let networkTested = false;
    let networkStatus = null;
    let networkResponse = null;

    try {
      const response = await fetch(testUrl, { method: "GET", signal: AbortSignal.timeout(3000) });
      networkTested = true;
      networkStatus = response.status;
      networkResponse = await response.text();
    } catch (netErr) {
      // In-process fallback if public URL is not reachable from local dev loopback
    }

    const internalTest = webhookService.testHandshake(verifyToken, challenge);

    if (networkTested && networkStatus === 200 && networkResponse === challenge) {
      return res.status(200).json({
        success: true,
        message: "Handshake verified successfully via public URL! Meta will be able to verify your webhook.",
        data: {
          status: 200,
          challengeResponse: networkResponse,
          testedUrl: testUrl,
          latencyMs: internalTest.latencyMs
        }
      });
    }

    if (internalTest.success && internalTest.challengeEchoed) {
      return res.status(200).json({
        success: true,
        message: "Handshake logic verified successfully in-system! Ready for Meta verification.",
        data: {
          status: 200,
          challengeResponse: challenge,
          testedUrl: testUrl,
          latencyMs: internalTest.latencyMs,
          note: networkTested ? `Public test returned HTTP ${networkStatus}` : "Loopback network fetch bypassed; token verification confirmed."
        }
      });
    }

    return res.status(400).json({
      success: false,
      message: `Handshake verification failed: Token mismatch or invalid mode.`,
      data: {
        status: 403,
        testedUrl: testUrl
      }
    });
  } catch (error) {
    console.error("[WebhookController] testHandshake error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Restarts the background tunnel (Admin Only - Legacy Compatibility)
 */
async function restartTunnel(req, res) {
  return res.status(200).json({
    success: true,
    message: "Tunnel service disabled in production mode. Configure PUBLIC_WEBHOOK_URL in environment or system settings.",
    data: { active: false, type: "direct" }
  });
}

/**
 * Generates a new secure random verify token (Admin Only)
 */
function generateNewToken(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const newToken = webhookService.generateVerifyToken();
    return res.status(200).json({
      success: true,
      message: "New webhook verify token generated successfully.",
      data: {
        verifyToken: newToken
      }
    });
  } catch (error) {
    console.error("[WebhookController] generateNewToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Saves a custom verify token (Admin Only)
 */
function saveToken(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const { verifyToken } = req.body || {};
    if (!verifyToken || !String(verifyToken).trim()) {
      return res.status(400).json({ success: false, message: "Verify token cannot be empty." });
    }

    const saved = webhookService.saveVerifyToken(verifyToken);
    return res.status(200).json({
      success: true,
      message: "Webhook verify token updated successfully.",
      data: {
        verifyToken: saved
      }
    });
  } catch (error) {
    console.error("[WebhookController] saveToken error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Lists customer replies with tenant scoping
 */
function listReplies(req, res) {
  try {
    const { limit, offset, search, campaignId, unreadOnly, userId, repliesOnly } = req.query;
    let targetUserId = null;
    if (req.user?.role !== "ADMIN") {
      targetUserId = req.user.id;
    } else if (userId && String(userId).trim() !== "ALL") {
      targetUserId = String(userId).trim();
    }

    const result = webhookService.getReplies({
      limit,
      offset,
      search,
      campaignId,
      unreadOnly,
      userId: targetUserId,
      tenantId: req.user.tenant_id,
      repliesOnly
    });

    return res.status(200).json({
      success: true,
      data: result.replies,
      replies: result.replies,
      pagination: {
        total: result.totalCount,
        limit: result.limit,
        offset: result.offset,
        unreadCount: result.unreadCount,
        distinctContacts: result.distinctContacts
      }
    });
  } catch (error) {
    console.error("[WebhookController] listReplies error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Marks a specific reply as read
 */
function markAsRead(req, res) {
  try {
    const { id } = req.params;
    webhookService.markAsRead(id, req.user.tenant_id);
    return res.status(200).json({ success: true, message: "Reply marked as read." });
  } catch (error) {
    console.error("[WebhookController] markAsRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Marks all unread replies as read
 */
function markAllAsRead(req, res) {
  try {
    webhookService.markAllAsRead(req.user.tenant_id);
    return res.status(200).json({ success: true, message: "All replies marked as read." });
  } catch (error) {
    console.error("[WebhookController] markAllAsRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Marks all messages in a specific conversation as read by phone number
 */
function markConversationAsRead(req, res) {
  try {
    const { phone } = req.params;
    const result = webhookService.markConversationAsRead(phone, req.user.tenant_id);
    return res.status(200).json({ success: true, message: "Conversation marked as read.", updated: result.updated });
  } catch (error) {
    console.error("[WebhookController] markConversationAsRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Retrieves full conversation messages for a specific phone number with pagination
 */
function getConversationMessages(req, res) {
  try {
    const { phone } = req.params;
    const { limit, before, offset } = req.query;
    const result = webhookService.getConversationMessages({ phone, limit, before, offset, tenantId: req.user.tenant_id });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[WebhookController] getConversationMessages error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes a specific customer reply
 */
function deleteReply(req, res) {
  try {
    const { id } = req.params;
    webhookService.deleteReply(id, req.user.tenant_id, req.user.id);
    return res.status(200).json({ success: true, message: "Reply deleted." });
  } catch (error) {
    console.error("[WebhookController] deleteReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Deletes all messages in a conversation for a specific phone number
 */
function deleteConversation(req, res) {
  try {
    const phone = req.params.phone || req.body?.phone || req.query?.phone;
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required to delete chat." });
    }
    const result = webhookService.deleteConversation(phone, req.user.tenant_id, req.user.id);
    return res.status(200).json({
      success: true,
      message: "Chat conversation deleted successfully.",
      deletedCount: result.deleted
    });
  } catch (error) {
    console.error("[WebhookController] deleteConversation error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Simulates an incoming customer reply (Restricted to authenticated testing)
 */
function simulateTestReply(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const { fromPhone, customerName, messageBody, campaignId, messageType, mediaUrl, mediaId } = req.body || {};

    const cleanBody = messageBody || (messageType === "image" ? "Here is the payment screenshot" : "Hello, I am interested! Please share the details.");
    const cleanPhone = fromPhone || "919876543210";
    const cleanName = customerName || "Demo Customer";

    const result = webhookService.simulateTestReply({
      fromPhone: cleanPhone,
      customerName: cleanName,
      messageBody: cleanBody,
      campaignId: campaignId || null,
      messageType: messageType || (mediaUrl ? "image" : "text"),
      mediaUrl: mediaUrl || null,
      mediaId: mediaId || null
    });

    return res.status(200).json({
      success: true,
      message: "Simulated customer reply processed successfully.",
      data: result
    });
  } catch (error) {
    console.error("[WebhookController] simulateTestReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Sends a manual WhatsApp reply to a customer from the dashboard
 */
async function sendManualReply(req, res) {
  try {
    const id = req.params.id || req.body?.replyId;
    const { replyText } = req.body || {};

    if (!replyText || !String(replyText).trim()) {
      return res.status(400).json({ success: false, message: "Reply message cannot be empty." });
    }

    const updated = await webhookService.sendManualReply({
      replyId: id,
      replyText: String(replyText).trim(),
      tenantId: req.user.tenant_id,
      userId: req.user.id
    });

    return res.status(200).json({
      success: true,
      message: "Reply sent successfully via WhatsApp.",
      data: updated
    });
  } catch (error) {
    console.error("[WebhookController] sendManualReply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Gets Auto-Reply settings
 */
function getAutoReplySettings(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const settings = webhookService.getAutoReplySettings();
    return res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error("[WebhookController] getAutoReplySettings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Updates Auto-Reply settings
 */
function updateAutoReplySettings(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const updated = webhookService.saveAutoReplySettings(req.body || {});
    return res.status(200).json({
      success: true,
      message: "Auto-reply settings updated successfully.",
      data: updated
    });
  } catch (error) {
    console.error("[WebhookController] updateAutoReplySettings error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/replies/dynamic-options - List all dynamic bot rules & options
 */
function getDynamicOptions(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const settings = webhookService.getAutoReplySettings();
    return res.status(200).json({ success: true, data: settings.dynamicOptions || [] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/replies/dynamic-options - Save dynamic bot rules
 */
function saveDynamicOptions(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const options = Array.isArray(req.body) ? req.body : (req.body?.dynamicOptions || []);
    const updated = webhookService.saveAutoReplySettings({ dynamicOptions: options });
    return res.status(200).json({
      success: true,
      message: "Dynamic bot options updated successfully.",
      data: updated.dynamicOptions || []
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Gets Bot Pause / Takeover status for a contact
 */
function getBotStatus(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const phone = req.params.phone || req.query.phone;
    const status = webhookService.getBotStatus(phone);
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * Sets Bot Pause / Resume status for a contact
 */
function setBotStatus(req, res) {
  if (!requireLegacyWorkspace(req, res)) return;
  try {
    const phone = req.params.phone || req.body?.phone;
    const { paused, durationMinutes } = req.body || {};
    if (paused === false || paused === "false") {
      webhookService.resumeBotForPhone(phone);
    } else {
      const durationMs = Math.max(1, parseInt(durationMinutes, 10) || 60) * 60 * 1000;
      webhookService.pauseBotForPhone(phone, durationMs);
    }
    const status = webhookService.getBotStatus(phone);
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  handleVerification,
  handleIncomingEvent,
  verifyMetaSignature,
  getConfig,
  generateNewToken,
  saveToken,
  listReplies,
  markAsRead,
  markAllAsRead,
  markConversationAsRead,
  getConversationMessages,
  deleteReply,
  deleteConversation,
  simulateTestReply,
  testHandshake,
  restartTunnel,
  sendManualReply,
  getAutoReplySettings,
  updateAutoReplySettings,
  getDynamicOptions,
  saveDynamicOptions,
  getBotStatus,
  setBotStatus
};
