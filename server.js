// Enforce Indian Standard Time (IST) globally across all Node.js operations
process.env.TZ = "Asia/Kolkata";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const config = require("./src/config/env");
require("./src/config/database"); // Initializes local SQLite DB
const schedulerService = require("./src/services/schedulerService");
const apiRoutes = require("./src/routes/apiRoutes");
const webhookController = require("./src/controllers/webhookController");
const securityHeaders = require("./src/middleware/securityHeaders");

const app = express();

// Disable X-Powered-By header to prevent fingerprinting
app.disable("x-powered-by");

// Apply enterprise HTTP security headers (OWASP compliant)
app.use(securityHeaders);

// 1. CORS Configuration: In production, enforce trusted origin policy
const corsOptions = {
  origin: (origin, callback) => {
    // Non-browser or server-to-server requests
    if (!origin) return callback(null, true);
    if (config.NODE_ENV !== "production") {
      return callback(null, true);
    }
    const allowed = (config.CORS_ORIGIN || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (allowed.length === 0 || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS policy violation: origin not allowed"));
  },
  credentials: true
};
app.use(cors(corsOptions));

// 2. Request Parsers with Raw Body Preservation for Meta Webhook HMAC Verification
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const distPath = path.join(__dirname, "frontend", "dist");
const publicPath = path.join(__dirname, "public");

// Static files (Modern React SPA build or fallback)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}
app.use(express.static(publicPath));

const uploadsPath = path.join(__dirname, "public", "uploads");
const inboundUploadsPath = path.join(uploadsPath, "inbound");
if (!fs.existsSync(inboundUploadsPath)) {
  fs.mkdirSync(inboundUploadsPath, { recursive: true });
}

// 3. Uploads Path Traversal Guard & File Execution Defense
app.use("/uploads", (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  let decodedUrl = "";
  try {
    decodedUrl = decodeURIComponent(req.url || "");
  } catch (e) {
    return res.status(400).json({ success: false, message: "Malformed URI." });
  }
  if (req.url.includes("..") || decodedUrl.includes("..") || decodedUrl.includes("\\")) {
    return res.status(403).json({ success: false, message: "Forbidden: Path traversal detected." });
  }
  if (/\.(svg|html|htm|xhtml|xml|js|exe|bat|cmd|sh|php)$/i.test(decodedUrl)) {
    return res.status(403).json({ success: false, message: "Forbidden: Insecure file access prohibited." });
  }
  next();
});

// 4. Inbound Media On-Demand with Path Traversal Protection
app.get("/uploads/inbound/:filename", async (req, res, next) => {
  const safeFilename = path.basename(req.params.filename);
  const resolvedBase = path.resolve(inboundUploadsPath);
  const resolvedTarget = path.resolve(inboundUploadsPath, safeFilename);

  // Path traversal check
  if (!resolvedTarget.startsWith(resolvedBase)) {
    return res.status(403).json({ success: false, message: "Access denied." });
  }

  if (fs.existsSync(resolvedTarget)) {
    return next();
  }

  try {
    const rawId = safeFilename.replace(/\.[a-zA-Z0-9]+$/, "");
    if (/^[a-zA-Z0-9_.-]+$/.test(rawId)) {
      const { downloadAndSaveInboundMedia } = require("./src/services/metaWhatsAppService");
      const downloadRes = await downloadAndSaveInboundMedia(rawId);
      if (downloadRes?.localPath && fs.existsSync(downloadRes.localPath)) {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
        return res.sendFile(downloadRes.localPath);
      }
    }
  } catch (e) {
    console.warn("[Uploads Inbound On-Demand] Error:", e.message);
  }

  return res.status(404).json({ success: false, message: "Inbound media file not found." });
});

app.use("/uploads", express.static(uploadsPath));

// 4. Comprehensive Root & API Webhook endpoints for Meta
const flowController = require("./src/controllers/flowController");
const webhookAliases = [
  "/webhook",
  "/webhook/",
  "/api/webhook",
  "/api/webhook/",
  "/api/v1/webhook",
  "/api/v1/webhook/",
  "/v1/webhook",
  "/v1/webhook/",
  "/webhooks",
  "/webhooks/",
  "/webhooks/meta/whatsapp",
  "/webhooks/meta/whatsapp/",
  "/api/v1/webhooks/meta/whatsapp",
  "/api/v1/webhooks/meta/whatsapp/"
];
app.get(webhookAliases, webhookController.handleVerification);
app.post(webhookAliases, webhookController.handleIncomingEvent);
app.post(["/flows/exchange", "/webhooks/meta/flows", "/api/flows/exchange"], flowController.handleDataExchange);

// Public Workflow Webhook Trigger Endpoints
const workflowTriggerService = require("./src/services/workflow/workflowTriggerService");
app.post(["/workflows/hooks/:triggerKey", "/v1/workflows/hooks/:triggerKey", "/api/v1/workflows/hooks/:triggerKey"], async (req, res) => {
  try {
    const result = await workflowTriggerService.executeWebhookTrigger(
      req.params.triggerKey,
      req.body,
      req.headers
    );
    return res.status(result.statusCode || 200).json(result);
  } catch (err) {
    console.error("[Webhook Trigger Hook] Execution error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to execute webhook trigger" });
  }
});

// Direct WhatsApp Link Redirect Helper (/c/:slug?redirect=whatsapp, /chat/:slug)
app.get(["/c/:slug", "/chat/:slug"], (req, res, next) => {
  if (req.query.redirect === "whatsapp" || req.query.wa === "1") {
    try {
      const chatLinkService = require("./src/services/chatLinkService");
      const link = chatLinkService.getLinkByIdOrSlug(req.params.slug, {
        incrementClicks: true,
        queryParams: req.query
      });
      if (link && link.urls?.waMeUrl) {
        return res.redirect(link.urls.waMeUrl);
      }
    } catch (e) { }
  }
  next();
});

// 4b. Health Check Endpoint
app.get(["/api/health", "/health"], (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

// 5. API routes
app.use("/api", apiRoutes);

// 6. SPA fallback
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/webhook") && !req.path.startsWith("/webhooks") && !req.path.startsWith("/uploads") && !req.path.startsWith("/flows")) {
    if (fs.existsSync(path.join(distPath, "index.html"))) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      res.sendFile(path.join(publicPath, "index.html"));
    }
  } else {
    res.status(404).json({ success: false, message: "Resource not found" });
  }
});

// 7. Sanitized Error Handling (No stack traces in production)
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.message);
  const isProd = config.NODE_ENV === "production";
  return res.status(err.statusCode || 500).json({
    success: false,
    message: isProd ? "Internal server error" : (err.message || "Internal server error")
  });
});

let server = null;

if (require.main === module) {
  const PORT = config.PORT || 5000;
  const HOST = process.env.HOST || "0.0.0.0";
  server = app.listen(PORT, HOST, () => {
    // Start background campaign scheduler
    schedulerService.initScheduler();

    // Auto-subscribe Meta Webhooks for WABA if credentials are valid
    try {
      const metaService = require("./src/services/metaWhatsAppService");
      metaService.ensureWabaSubscribedApp().catch(() => {});
    } catch (e) {}

    const dbTarget = config.DB_CLIENT === "mysql"
      ? `MySQL (${config.DB_NAME} on ${config.DB_HOST}:${config.DB_PORT})`
      : `SQLite (${path.join(config.DATA_DIR, "whatsapp_bulk.db")})`;

    console.log(`
========================================================================
🚀 WhatsApp Bulk Broadcast System
📡 Server running on: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}
💾 Database: ${dbTarget}
📱 Meta Phone ID: ${config.WHATSAPP_PHONE_NUMBER_ID || "Not Configured"}
⏰ Scheduler: Active (Auto-Dispatches Scheduled Campaigns)
========================================================================
    `);
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down WhatsApp Bulk Messenger gracefully...");
    schedulerService.stopScheduler();
    if (server) {
      server.close(() => {
        console.log("Server stopped.");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

module.exports = { app };
