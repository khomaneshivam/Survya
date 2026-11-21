const express = require("express");
const router = express.Router();
const runtimeController = require("../controllers/inappRuntimeController");
const inappNegotiationService = require("../services/inapp/inappNegotiationService");
const inappCallService = require("../services/inapp/inappCallService");
const inappSseManager = require("../services/inapp/inappSseManager");
const { db } = require("../config/database");
const { apiLimiter } = require("../middleware/rateLimiter");

// Rate limit public runtime endpoints
router.use(apiLimiter);

// Experience Discovery & Meta
router.get("/:slug", runtimeController.getExperience);

// Session Lifecycle
router.post("/:slug/session", runtimeController.handleSession);

// Live Dynamic Catalog Query & Price Range Filter
router.get("/:slug/catalog", runtimeController.getCatalog);

// Multi-Screen Navigation & Validated Actions
router.post("/:slug/navigate", runtimeController.handleNavigate);

// =========================================================================
// Real-Time Visitor SSE Stream
// =========================================================================
router.get("/:slug/stream", (req, res) => {
  const { sessionToken } = req.query;
  if (!sessionToken) {
    return res.status(400).json({ success: false, message: "sessionToken is required for SSE stream" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  inappSseManager.addVisitorClient(sessionToken, res);
});

// =========================================================================
// Interactive Rate Negotiation Engine
// =========================================================================
router.post("/:slug/negotiations", (req, res) => {
  try {
    const { slug } = req.params;
    const result = inappNegotiationService.submitOffer(slug, req.body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.get("/:slug/negotiations/:id", (req, res) => {
  try {
    const { slug, id } = req.params;
    const { sessionToken } = req.query;
    const result = inappNegotiationService.getNegotiation(slug, id, sessionToken);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post("/:slug/negotiations/:id/respond", (req, res) => {
  try {
    const { slug, id } = req.params;
    const result = inappNegotiationService.respondToNegotiation(slug, id, req.body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// Calls, Direct Dial & Callbacks Engine
// =========================================================================
router.get("/:slug/call-availability", (req, res) => {
  try {
    const { slug } = req.params;
    const result = inappCallService.getCallAvailability(slug);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

router.post("/:slug/calls", (req, res) => {
  try {
    const { slug } = req.params;
    const result = inappCallService.requestCall(slug, req.body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// Live Customer ↔ Agent Chat
// =========================================================================
router.get("/:slug/messages", (req, res) => {
  try {
    const { sessionToken } = req.query;
    if (!sessionToken) {
      return res.status(400).json({ success: false, message: "sessionToken is required" });
    }

    const session = db.prepare("SELECT * FROM inapp_sessions WHERE session_token = ? AND delete_status = 0").get(sessionToken);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const phone = session.visitor_phone || session.session_token;
    const messages = db.prepare(`
      SELECT id, wa_message_id, from_phone, customer_name, message_type,
             message_body, reply_text, reply_sent_at, received_at, media_url, source
      FROM customer_replies
      WHERE (from_phone = ? OR link_id = ?)
      ORDER BY id ASC LIMIT 100
    `).all(phone, String(session.id));

    return res.status(200).json({ success: true, data: messages });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:slug/messages", (req, res) => {
  try {
    const { slug } = req.params;
    const { sessionToken, message, mediaUrl } = req.body || {};

    if (!sessionToken || !message?.trim()) {
      return res.status(400).json({ success: false, message: "sessionToken and message are required" });
    }

    const session = db.prepare("SELECT * FROM inapp_sessions WHERE session_token = ? AND delete_status = 0").get(sessionToken);
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }

    const phone = session.visitor_phone || `guest_${session.id}`;
    const name = session.visitor_name || "In-App Visitor";
    const waMsgId = `inapp_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const insertRes = db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type, message_body,
        media_url, is_read, received_at, link_id, source
      ) VALUES (
        ?, ?, ?, 'text', ?,
        ?, 0, CURRENT_TIMESTAMP, ?, 'INAPP_CHAT'
      )
    `).run(
      waMsgId,
      phone,
      name,
      message.trim(),
      mediaUrl || null,
      String(session.id)
    );

    const saved = db.prepare("SELECT * FROM customer_replies WHERE id = ?").get(insertRes.lastInsertRowid);

    // Notify agents via SSE
    inappSseManager.notifyStaff("inapp:chat_message", {
      messageId: saved.id,
      phone,
      name,
      message: message.trim(),
      experienceSlug: slug,
      sessionId: session.id
    });

    // Also push to visitor's own stream for multi-device sync
    inappSseManager.sendToVisitor(sessionToken, "chat_message", saved);

    return res.status(200).json({ success: true, data: saved });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
