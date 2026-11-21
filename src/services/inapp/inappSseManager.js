const EventEmitter = require("events");
const broadcastEngine = require("../broadcastEngine");

/**
 * Real-time Server-Sent Events (SSE) Manager for In-App Experiences & Staff Inbox
 */
class InAppSseManager extends EventEmitter {
  constructor() {
    super();
    // Map of sessionToken -> Set of Express response objects
    this.visitorClients = new Map();
  }

  /**
   * Register a public visitor SSE stream connection
   */
  addVisitorClient(sessionToken, res) {
    if (!sessionToken || !res) return;

    if (!this.visitorClients.has(sessionToken)) {
      this.visitorClients.set(sessionToken, new Set());
    }

    const clientSet = this.visitorClients.get(sessionToken);
    clientSet.add(res);

    // Initial handshake ping
    this._safeWrite(res, `data: ${JSON.stringify({ type: "init", message: "In-App SSE Connected", sessionToken })}\n\n`);

    // Setup 20-second heartbeat ping
    const keepAlive = setInterval(() => {
      this._safeWrite(res, ": ping\n\n");
    }, 20000);
    if (keepAlive.unref) keepAlive.unref();

    const cleanup = () => {
      clearInterval(keepAlive);
      clientSet.delete(res);
      if (clientSet.size === 0) {
        this.visitorClients.delete(sessionToken);
      }
    };

    res.on("close", cleanup);
    res.on("finish", cleanup);
    res.on("error", cleanup);
  }

  /**
   * Push real-time event to a specific visitor session
   */
  sendToVisitor(sessionToken, eventType, payload) {
    if (!sessionToken || !this.visitorClients.has(sessionToken)) return;

    const clients = this.visitorClients.get(sessionToken);
    const message = `data: ${JSON.stringify({ type: eventType, data: payload, timestamp: new Date().toISOString() })}\n\n`;

    for (const res of clients) {
      this._safeWrite(res, message);
    }
  }

  /**
   * Broadcast in-app event to connected agents in InboxPage.jsx via broadcastEngine
   */
  notifyStaff(eventType, data = {}) {
    try {
      // 1. Emit typed in-app event
      this.emit(eventType, data);

      // 2. Also forward to broadcastEngine so active Inbox SSE streams receive it immediately
      if (broadcastEngine && typeof broadcastEngine.emit === "function") {
        broadcastEngine.emit("webhook:reply", {
          source: "INAPP_COMMERCE",
          eventType,
          ...data
        });
      }
    } catch (err) {
      console.warn("[inappSseManager] notifyStaff warning:", err.message);
    }
  }

  _safeWrite(res, content) {
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(content);
      }
    } catch (_) {}
  }
}

const inappSseManager = new InAppSseManager();
module.exports = inappSseManager;

