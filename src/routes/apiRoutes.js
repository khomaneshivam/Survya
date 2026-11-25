const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const uploadController = require("../controllers/uploadController");
const broadcastController = require("../controllers/broadcastController");
const campaignController = require("../controllers/campaignController");
const settingsController = require("../controllers/settingsController");
const authController = require("../controllers/authController");
const adminController = require("../controllers/adminController");
const workspaceTeamController = require("../controllers/workspaceTeamController");
const reportsController = require("../controllers/reportsController");
const resortController = require("../controllers/resortController");
const { authenticateToken, requireAdmin, requireWorkspaceAdmin, authenticateStreamToken, optionalAuth } = require("../middleware/authMiddleware");
const { authLimiter, broadcastLimiter, uploadLimiter, apiLimiter } = require("../middleware/rateLimiter");
const broadcastEngine = require("../services/broadcastEngine");
const metaWhatsAppService = require("../services/metaWhatsAppService");
const webhookService = require("../services/webhookService");

// Protect all API routes with general rate limiter (300 requests / min per client)
router.use(apiLimiter);

// =========================================================================
// 1. AUTHENTICATION & PROFILE
// =========================================================================
router.post("/auth/register", authLimiter, authController.register);
router.post("/auth/login", authLimiter, authController.login);
router.post("/auth/forgot-password", authLimiter, authController.forgotPassword);
router.post("/auth/verify-reset-token", authLimiter, authController.verifyResetToken);
router.post("/auth/reset-password", authLimiter, authController.resetPassword);
router.post("/auth/change-password", authenticateToken, authLimiter, authController.changePassword);
router.get("/auth/me", authenticateToken, authController.getMe);
router.post("/auth/profile", authenticateToken, authController.updateProfile);

// =========================================================================
// 2. MASTER ADMIN & USER/PHONE MANAGEMENT
// =========================================================================
router.use("/admin", require("./adminRoutes"));
router.use("/ai", require("./aiAssistantRoutes"));
router.use("/v1/ai", require("./aiAssistantRoutes"));

router.get("/admin/users", authenticateToken, requireAdmin, adminController.listUsers);
router.get("/admin/users/:userId", authenticateToken, requireAdmin, adminController.getUserDetails);
router.post("/admin/users/:userId/status", authenticateToken, requireAdmin, adminController.updateUserStatus);
router.post("/admin/users/:userId/role", authenticateToken, requireAdmin, adminController.updateUserRole);
router.post("/admin/users/:userId/reset-password", authenticateToken, requireAdmin, adminController.resetUserPassword);
router.post("/admin/users/:userId/assign-phone", authenticateToken, requireAdmin, adminController.assignPhoneNumber);
router.post("/admin/users/:userId/claim-history", authenticateToken, requireAdmin, adminController.claimLegacyHistory);
router.get("/admin/unassigned-summary", authenticateToken, requireAdmin, adminController.getUnassignedSummary);
router.post("/admin/impersonate/:userId", authenticateToken, requireAdmin, adminController.impersonateUser);
router.get("/admin/overview", authenticateToken, requireAdmin, adminController.getSystemOverview);
router.get("/admin/audit-logs", authenticateToken, requireAdmin, adminController.getAuditLogs);
router.post("/admin/backup", authenticateToken, requireAdmin, adminController.exportBackup);

// Workspace Team Management (Tenant-Scoped Owner/Admin Only)
router.get("/v1/workspace/users", authenticateToken, requireWorkspaceAdmin, workspaceTeamController.listWorkspaceUsers);
router.post("/v1/workspace/users", authenticateToken, requireWorkspaceAdmin, workspaceTeamController.createWorkspaceUser);
router.patch("/v1/workspace/users/:userId", authenticateToken, requireWorkspaceAdmin, workspaceTeamController.updateWorkspaceUser);
router.delete("/v1/workspace/users/:userId", authenticateToken, requireWorkspaceAdmin, workspaceTeamController.deleteWorkspaceUser);

// WhatsApp Phone Number Registry (Protected & Admin Only for mutations)
router.get("/admin/phone-numbers", authenticateToken, adminController.listPhoneNumbers);
router.post("/admin/phone-numbers", authenticateToken, requireAdmin, adminController.registerPhoneNumber);
router.post("/admin/phone-numbers/register-meta", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/admin/phone-numbers/:id/register-meta", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/admin/phone-numbers/:id/deregister-meta", authenticateToken, requireAdmin, settingsController.deregisterMetaPhone);
router.delete("/admin/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/admin/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);
router.post("/admin/phone-numbers/:id/token", authenticateToken, requireAdmin, adminController.updatePhoneNumberToken);
router.post("/admin/phone-numbers/:id/test", authenticateToken, requireAdmin, adminController.testPhoneNumber);

// Top-level aliases for phone numbers
router.get("/phone-numbers", authenticateToken, adminController.listPhoneNumbers);
router.post("/phone-numbers", authenticateToken, requireAdmin, adminController.registerPhoneNumber);
router.post("/phone-numbers/register-meta", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/phone-numbers/:id/register-meta", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/phone-numbers/:id/deregister-meta", authenticateToken, requireAdmin, settingsController.deregisterMetaPhone);
router.delete("/phone-numbers/:id", authenticateToken, requireAdmin, adminController.deletePhoneNumber);
router.post("/phone-numbers/:id/default", authenticateToken, requireAdmin, adminController.setDefaultPhoneNumber);
router.post("/phone-numbers/:id/token", authenticateToken, requireAdmin, adminController.updatePhoneNumberToken);
router.post("/phone-numbers/:id/test", authenticateToken, requireAdmin, adminController.testPhoneNumber);

// =========================================================================
// 3. REPORTS & ANALYTICS (Protected & Scoped)
// =========================================================================
router.get("/reports/campaigns", authenticateToken, reportsController.getCampaignReports);
router.get("/reports/campaigns/export", authenticateToken, reportsController.exportCampaignReport);
router.get("/reports/automation", authenticateToken, reportsController.getAutomationReports);
router.get("/reports/overview", authenticateToken, reportsController.getOverviewAnalytics);

// Configure Multer for in-memory file uploads (supports .xlsx, .xls, .csv up to 25MB)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv"
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed."));
    }
  }
});

// Upload & Parsing (Protected)
router.post("/upload", authenticateToken, uploadLimiter, upload.single("file"), uploadController.handleFileUpload);

// Dedicated Header Media Uploader with Safe Filename Handling (Images, Documents, Videos up to 30MB)
const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "..", "public", "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `media_${Date.now()}_${base}${safeExt}`);
  }
});

const mediaUpload = multer({
  storage: mediaStorage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter: (req, file, cb) => {
    // Strictly prohibit SVG, HTML, and executable extensions to prevent Stored XSS
    if (
      file.mimetype === "image/svg+xml" ||
      file.originalname.match(/\.(svg|html|htm|xhtml|xml|js|exe|bat|cmd|sh|php)$/i)
    ) {
      return cb(new Error("File type not allowed for security reasons. SVGs and executable files are prohibited."));
    }

    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "video/mp4",
      "video/3gpp"
    ];
    const allowedExts = /\.(jpg|jpeg|png|webp|pdf|mp4|3gp)$/i;

    if (
      (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) &&
      file.originalname.match(allowedExts)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only standard image files (JPG, PNG, WEBP), PDF documents, or MP4 videos are allowed."));
    }
  }
});

const { uploadMedia } = require("../services/metaWhatsAppService");

router.post("/upload/media", authenticateToken, uploadLimiter, mediaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No media file provided." });
    }

    const relativeUrl = `/uploads/${req.file.filename}`;
    const host = req.get("host");
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    let mediaId = null;
    let metaUploadError = null;

    try {
      const fileBuffer = fs.readFileSync(req.file.path);
      const metaRes = await uploadMedia({
        fileBuffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype
      });
      if (metaRes && metaRes.mediaId) {
        mediaId = metaRes.mediaId;
      }
    } catch (err) {
      metaUploadError = err.message;
      console.warn("[UploadMedia] Meta direct upload note:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Media uploaded successfully.",
      url: fullUrl,
      relativeUrl,
      mediaId,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      metaUploadError
    });
  } catch (error) {
    console.error("Media upload error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================================
// 4. CAMPAIGNS & BROADCAST (Protected & Scoped)
// =========================================================================
router.post("/campaigns", authenticateToken, broadcastLimiter, broadcastController.createCampaign);
router.get("/campaigns", authenticateToken, campaignController.listCampaigns);
router.get("/campaigns/:campaignId", authenticateToken, campaignController.getCampaignDetails);
router.delete("/campaigns/:campaignId", authenticateToken, campaignController.deleteCampaign);
router.get("/campaigns/:campaignId/export", authenticateToken, campaignController.exportCampaignReport);

// Direct single-endpoint Broadcast launch helper
const { parseExcelBuffer } = require("../services/excelService");
const { getSetting, db } = require("../config/database");
const { cleanPhone } = require("../services/metaWhatsAppService");

router.post("/broadcast/send", authenticateToken, broadcastLimiter, upload.single("file"), async (req, res) => {
  try {
    const { campaignName, templateName, templateLang, phoneColumn, nameColumn, variableMappings, headerMediaUrl, headerMediaId, scheduledTime, phoneId, delayMs, throttleDelay } = req.body || {};
    let contacts = [];
    let detectedPhone = phoneColumn;
    let fileName = "contacts.csv";

    if (req.file) {
      fileName = req.file.originalname;
      const defaultCountry = getSetting("DEFAULT_COUNTRY_CODE") || "91";
      const parsed = parseExcelBuffer(req.file.buffer, req.file.originalname, defaultCountry);
      detectedPhone = phoneColumn || parsed.detectedPhoneCol;
      contacts = parsed.allRows.map(r => r.data);
    } else if (req.body.contacts) {
      contacts = typeof req.body.contacts === "string" ? JSON.parse(req.body.contacts) : req.body.contacts;
    }

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ success: false, message: "No contacts found in file or payload." });
    }

    let parsedMappings = {};
    if (variableMappings) {
      parsedMappings = typeof variableMappings === "string" ? JSON.parse(variableMappings) : variableMappings;
    }

    const bodyParams = Object.keys(parsedMappings).map(k => ({ key: k, col: parsedMappings[k] }));

    const rawDelay = delayMs !== undefined ? delayMs : throttleDelay;
    const parsedDelay = (rawDelay !== undefined && rawDelay !== null && String(rawDelay).trim() !== "")
      ? Math.min(Math.max(parseInt(rawDelay, 10), 50), 10000)
      : undefined;

    const resolvedType = req.body.messageType || req.body.type || "TEMPLATE";
    req.body = {
      name: campaignName || `Broadcast_${Date.now()}`,
      fileName,
      messageType: resolvedType,
      templateName: templateName || req.body.flowId || "kt_restaurant_invitation",
      templateLanguage: templateLang || "en",
      phoneColumn: detectedPhone,
      nameColumn: nameColumn || null,
      phoneId: phoneId || null,
      mappingConfig: { bodyParams, headerMediaUrl, headerMediaId, flowId: req.body.flowId },
      scheduleMode: scheduledTime ? "SCHEDULE" : "NOW",
      scheduledAt: scheduledTime || null,
      delayMs: parsedDelay,
      contacts
    };

    await broadcastController.createCampaign(req, {
      statusCode: 201,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        if (!data.success) {
          return res.status(this.statusCode || 400).json(data);
        }
        const campaign = data.data;
        if (!scheduledTime) {
          broadcastEngine.startCampaign(campaign.id, parsedDelay).catch(err => {
            console.error("Auto-start campaign error:", err);
          });
        }
        return res.status(200).json({
          success: true,
          message: data.message,
          campaignId: campaign.id,
          totalRecipients: campaign.valid_contacts,
          campaign,
          costEstimate: data.costEstimate
        });
      }
    });
  } catch (error) {
    console.error("Direct broadcast send error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Broadcast & Schedule Controls (Protected & Ownership-Checked)
router.post("/campaigns/:campaignId/start", authenticateToken, broadcastController.startCampaign);
router.post("/campaigns/:campaignId/pause", authenticateToken, broadcastController.pauseCampaign);
router.post("/campaigns/:campaignId/resume", authenticateToken, broadcastController.resumeCampaign);
router.post("/campaigns/:campaignId/cancel", authenticateToken, broadcastController.cancelCampaign);
router.post("/campaigns/:campaignId/throttle", authenticateToken, broadcastController.updateThrottleDelay);
router.patch("/campaigns/:campaignId/throttle", authenticateToken, broadcastController.updateThrottleDelay);
router.post("/campaigns/:campaignId/reschedule", authenticateToken, broadcastController.rescheduleCampaign);
router.post("/campaigns/:campaignId/run-now", authenticateToken, broadcastController.runScheduledNow);
router.post("/broadcast/start", authenticateToken, (req, res) => {
  req.params.campaignId = req.body?.campaignId || req.query?.campaignId;
  return broadcastController.startCampaign(req, res);
});
router.post("/broadcast/test-send", authenticateToken, broadcastController.sendTestMessage);

// Short-Lived Stream Token Issuer for SSE
router.post("/broadcast/stream-token", authenticateToken, broadcastController.getStreamToken);

// =========================================================================
// 5. SETTINGS & CONNECTION (Protected & Admin Only for mutations)
// =========================================================================
router.get("/settings", authenticateToken, settingsController.getSettings);
router.post("/settings", authenticateToken, requireAdmin, settingsController.updateSettings);
router.post("/settings/test-connection", authenticateToken, requireAdmin, settingsController.handleTestConnection);
router.get("/settings/verify-meta", authenticateToken, requireAdmin, settingsController.handleTestConnection);
router.post("/settings/verify-meta", authenticateToken, requireAdmin, settingsController.handleTestConnection);
router.post("/settings/register-phone", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/settings/register-meta-phone", authenticateToken, requireAdmin, settingsController.registerMetaPhone);
router.post("/settings/deregister-phone", authenticateToken, requireAdmin, settingsController.deregisterMetaPhone);

// Direct Meta Graph Phone Registration endpoints (accepts { id, pin, token })
router.post("/meta/register-phone", optionalAuth, settingsController.registerMetaPhone);
router.post("/meta/phone-registration", optionalAuth, settingsController.registerMetaPhone);
router.post("/meta/deregister-phone", optionalAuth, settingsController.deregisterMetaPhone);

// System Time & Timezone & Health Telemetry (Deployments + Local)
const systemController = require("../controllers/systemController");
router.get("/system/time", systemController.getSystemTime);
router.post("/system/time", authenticateToken, requireAdmin, systemController.updateTimezone);
router.get("/system/health", systemController.getSystemHealth);

// =========================================================================
// 6. SYSTEM TEMPLATES MANAGEMENT (Protected)
// =========================================================================
const templateController = require("../controllers/templateController");
router.get("/templates", authenticateToken, templateController.listTemplates);
router.get("/templates/categories", authenticateToken, templateController.getCategoriesSummary);
router.post("/templates/sync", authenticateToken, templateController.syncTemplatesFromMeta);
router.get("/broadcast/templates", authenticateToken, templateController.listTemplates);
router.get("/broadcast/templates/categories", authenticateToken, templateController.getCategoriesSummary);
router.post("/broadcast/templates/sync", authenticateToken, templateController.syncTemplatesFromMeta);
router.post("/templates", authenticateToken, templateController.addTemplate);
router.get("/templates/:templateId", authenticateToken, templateController.getTemplate);
router.delete("/templates/:templateId", authenticateToken, requireAdmin, templateController.deleteTemplate);

// =========================================================================
// 6.4. CONVERSATION FLOW & AUTOMATION STUDIO MODULE
// =========================================================================
// Browser-only, expiring preview links must be registered before the generic
// `/flows/:id` handlers in the conversation flow router.
router.use(require("./flowPreviewRoutes"));
router.use(require("./conversationFlowRoutes"));

// Dynamic CRM Pipelines & Records Module
router.use("/crm", require("./crmPipelineRoutes"));
router.use("/v1/crm", require("./crmPipelineRoutes"));

// Public Webhook Trigger Inbound Endpoint
const workflowTriggerService = require("../services/workflow/workflowTriggerService");
router.post(["/workflows/hooks/:triggerKey", "/v1/workflows/hooks/:triggerKey"], async (req, res) => {
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

// =========================================================================
// 6.5. WHATSAPP FLOWS MANAGEMENT (Protected & Scoped)
// =========================================================================
const flowController = require("../controllers/flowController");

// Public Meta Dynamic Flow Data-Exchange Endpoint
router.post("/flows/exchange", flowController.handleDataExchange);

// Flows Management & Operations
router.get("/flows", authenticateToken, flowController.listFlows);
router.get("/flows/starter-templates", authenticateToken, flowController.getStarterTemplates);
router.get("/flows/responses", authenticateToken, flowController.listResponses);
router.get("/flows/crypto/config", authenticateToken, flowController.getCryptoConfig);
router.post("/flows/crypto/generate-keypair", authenticateToken, requireAdmin, flowController.generateKeyPair);
router.post("/flows/crypto/save-private-key", authenticateToken, requireAdmin, flowController.savePrivateKey);
router.post("/flows/sync", authenticateToken, requireAdmin, flowController.syncMeta);
router.post("/flows", authenticateToken, flowController.createFlow);
router.get("/flows/:flowId", authenticateToken, flowController.getFlow);
router.put("/flows/:flowId", authenticateToken, flowController.updateFlow);
router.post("/flows/:flowId/push", authenticateToken, requireAdmin, flowController.pushFlowToMeta);
router.post("/flows/:flowId/publish", authenticateToken, requireAdmin, flowController.publishFlow);
router.post("/flows/:flowId/deprecate", authenticateToken, requireAdmin, flowController.deprecateFlow);
router.delete("/flows/:flowId", authenticateToken, flowController.deleteFlow);
router.post("/flows/:flowId/send-test", authenticateToken, flowController.sendTestFlow);

// =========================================================================
// 7. META WEBHOOKS & CUSTOMER REPLIES MANAGEMENT
// =========================================================================
const webhookController = require("../controllers/webhookController");

// Public Meta Webhook endpoints (Handshake GET + HMAC-verified POST)
router.get(["/webhook", "/v1/webhook", "/webhooks", "/v1/webhooks/meta/whatsapp"], webhookController.handleVerification);
router.post(["/webhook", "/v1/webhook", "/webhooks", "/v1/webhooks/meta/whatsapp"], webhookController.handleIncomingEvent);

// Protected Webhook configuration & controls (Admin Only)
router.get("/webhook/config", authenticateToken, requireAdmin, webhookController.getConfig);
router.post("/webhook/generate-token", authenticateToken, requireAdmin, webhookController.generateNewToken);
router.post("/webhook/token", authenticateToken, requireAdmin, webhookController.saveToken);
router.post("/webhook/test-simulate", authenticateToken, requireAdmin, webhookController.simulateTestReply);
router.get("/webhook/test-handshake", authenticateToken, requireAdmin, webhookController.testHandshake);
router.post("/webhook/test-handshake", authenticateToken, requireAdmin, webhookController.testHandshake);
router.post("/webhook/tunnel/restart", authenticateToken, requireAdmin, webhookController.restartTunnel);

// Customer Replies & Inbox (Protected & Scoped)
router.get("/replies", authenticateToken, webhookController.listReplies);
router.get("/inbox/replies", authenticateToken, webhookController.listReplies);
router.get("/replies/auto-reply-settings", authenticateToken, requireAdmin, webhookController.getAutoReplySettings);
router.post("/replies/auto-reply-settings", authenticateToken, requireAdmin, webhookController.updateAutoReplySettings);
router.get("/replies/dynamic-options", authenticateToken, requireAdmin, webhookController.getDynamicOptions);
router.post("/replies/dynamic-options", authenticateToken, requireAdmin, webhookController.saveDynamicOptions);
router.post("/replies/:id/reply", authenticateToken, webhookController.sendManualReply);
router.post("/replies/:id/mark-read", authenticateToken, webhookController.markAsRead);
router.post("/replies/mark-all-read", authenticateToken, webhookController.markAllAsRead);
router.get("/inbox/conversation/:phone", authenticateToken, webhookController.getConversationMessages);
router.post("/inbox/conversation/:phone/mark-read", authenticateToken, webhookController.markConversationAsRead);
router.post("/replies/conversation/:phone/mark-read", authenticateToken, webhookController.markConversationAsRead);
router.delete("/replies/:id", authenticateToken, webhookController.deleteReply);
router.delete("/inbox/conversation/:phone", authenticateToken, webhookController.deleteConversation);
router.delete("/inbox/conversation", authenticateToken, webhookController.deleteConversation);
router.delete("/replies/conversation/:phone", authenticateToken, webhookController.deleteConversation);

// Inbound Customer Media Streaming & Download Proxy with Path Traversal Protection
router.get("/media/inbound/:mediaId", authenticateToken, async (req, res) => {
  try {
    const { mediaId } = req.params;
    if (!mediaId || !/^[a-zA-Z0-9_.-]+$/.test(mediaId)) {
      return res.status(400).json({ success: false, message: "Invalid media ID." });
    }

    const cleanMediaId = path.basename(mediaId).replace(/\.[a-zA-Z0-9]+$/, "");
    // Prove this tenant owns the media record before reading cached files.
    const mediaOwner = db.prepare(`
      SELECT id FROM customer_replies
      WHERE tenant_id = ? AND deleted_at IS NULL
        AND (media_url LIKE ? OR raw_payload LIKE ?)
      LIMIT 1
    `).get(req.user.tenant_id, `%/${cleanMediaId}%`, `%"id":"${cleanMediaId}"%`);
    if (!mediaOwner) return res.status(404).json({ success: false, message: "Media not found." });
    const inboundDir = path.resolve(__dirname, "../../public/uploads/inbound");
    if (!fs.existsSync(inboundDir)) {
      fs.mkdirSync(inboundDir, { recursive: true });
    }

    // 1. Check if already cached on disk
    try {
      const files = fs.readdirSync(inboundDir).filter(f => f.startsWith(`${cleanMediaId}.`) || f === mediaId);
      if (files.length > 0) {
        const filePath = path.resolve(inboundDir, files[0]);
        if (filePath.startsWith(inboundDir) && fs.existsSync(filePath)) {
          res.setHeader("Cache-Control", "private, no-store");
          return res.sendFile(filePath);
        }
      }
    } catch (e) {}

    // 2. Download from Meta Cloud API on the fly
    const { downloadAndSaveInboundMedia } = require("../services/metaWhatsAppService");
    const downloadRes = await downloadAndSaveInboundMedia(cleanMediaId);
    if (downloadRes?.localPath) {
      const resolvedPath = path.resolve(downloadRes.localPath);
      if (resolvedPath.startsWith(inboundDir) && fs.existsSync(resolvedPath)) {
        res.setHeader("Cache-Control", "private, no-store");
        return res.sendFile(resolvedPath);
      }
    }

    return res.status(404).json({ success: false, message: "Inbound media not found or could not be downloaded." });
  } catch (err) {
    console.error("[Inbound Media Proxy] Error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to download media: " + err.message });
  }
});

// Direct inbox reply by phone/contact (Tenant-Scoped Channel Dispatch)
router.post("/inbox/reply", authenticateToken, mediaUpload.single("file"), async (req, res) => {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const { to, message, replyId, mediaUrl, mediaId, mediaType: clientMediaType, phoneNumberId: requestedPhoneId } = req.body || {};
    const text = message !== undefined ? String(message) : (req.body?.replyText !== undefined ? String(req.body.replyText) : "");

    const targetPhone = metaWhatsAppService.cleanPhone(to || "", getSetting("DEFAULT_COUNTRY_CODE") || "91");
    if (!targetPhone) {
      return res.status(400).json({ success: false, message: "Recipient phone number is required." });
    }

    if (!req.file && !mediaUrl && !mediaId && !text.trim()) {
      return res.status(400).json({ success: false, message: "Reply message or media attachment is required." });
    }

    let sendRes;
    let finalMediaUrl = mediaUrl || null;
    let finalMediaType = clientMediaType || null;
    let metaMessageId = null;

    // Check if recipient conversation is an in-app Web Chat guest (virtual number 919000... or prior reply with source 'CHAT_LINK')
    const recentWebMessage = db.prepare(`
      SELECT id, source, link_id FROM customer_replies 
      WHERE tenant_id = ? AND deleted_at IS NULL AND from_phone = ? AND (source = 'CHAT_LINK' OR from_phone LIKE '919000%')
      ORDER BY id DESC LIMIT 1
    `).get(tenantId, targetPhone);

    const isWebChat = Boolean(recentWebMessage || targetPhone.startsWith("919000"));

    // Resolve tenant-owned WhatsApp channel for outbound dispatch
    let resolvedChannelPhoneId = null;
    if (!isWebChat) {
      if (requestedPhoneId) {
        const line = db.prepare(`
          SELECT phone_number_id FROM waba_phone_numbers
          WHERE (phone_number_id = ? OR id = ?) AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
          LIMIT 1
        `).get(String(requestedPhoneId).trim(), String(requestedPhoneId).trim(), tenantId);
        if (!line) {
          return res.status(403).json({ success: false, message: "Selected WhatsApp channel does not belong to your workspace." });
        }
        resolvedChannelPhoneId = line.phone_number_id;
      } else if (tenantId > 1) {
        const tenantLine = db.prepare(`
          SELECT phone_number_id FROM waba_phone_numbers
          WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0
          ORDER BY is_default DESC, id ASC LIMIT 1
        `).get(tenantId);
        if (!tenantLine?.phone_number_id) {
          return res.status(400).json({ success: false, message: "No WhatsApp Business channel is connected for your workspace." });
        }
        resolvedChannelPhoneId = tenantLine.phone_number_id;
      }
    }

    const customCredentials = {
      tenantId,
      ...(resolvedChannelPhoneId ? { phoneNumberId: resolvedChannelPhoneId } : {})
    };

    if (isWebChat) {
      metaMessageId = `out_web_${Date.now()}`;
    } else if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");
      const isImage = req.file.mimetype.startsWith("image/");
      finalMediaType = isVideo ? "video" : (isImage ? "image" : (clientMediaType || "document"));
      finalMediaUrl = `/uploads/${req.file.filename}`;

      const host = req.get("host");
      const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const fullUrl = `${protocol}://${host}${finalMediaUrl}`;

      let metaMediaId = null;
      try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const metaUp = await metaWhatsAppService.uploadMedia({
          fileBuffer,
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          customCredentials
        });
        if (metaUp?.mediaId) {
          metaMediaId = metaUp.mediaId;
        }
      } catch (uErr) {
        console.warn("[Inbox Reply] Direct Meta upload note:", uErr.message);
      }

      sendRes = await metaWhatsAppService.sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: metaMediaId || null,
        mediaUrl: !metaMediaId ? fullUrl : null,
        caption: text.trim() ? text : "",
        customCredentials
      });
      metaMessageId = sendRes.messageId;
    } else if (finalMediaUrl || mediaId) {
      const isVideo = (finalMediaUrl && finalMediaUrl.match(/\.(mp4|3gp|mov|webm)(\?.*)?$/i)) || clientMediaType === "video";
      finalMediaType = isVideo ? "video" : (clientMediaType || "image");

      sendRes = await metaWhatsAppService.sendMediaMessage({
        to: targetPhone,
        type: finalMediaType,
        mediaId: mediaId || null,
        mediaUrl: finalMediaUrl || null,
        caption: text.trim() ? text : "",
        customCredentials
      });
      metaMessageId = sendRes.messageId;
    } else {
      sendRes = await metaWhatsAppService.sendTextMessage({ to: targetPhone, body: text, customCredentials });
      metaMessageId = sendRes.messageId;
    }

    const assignedId = metaMessageId || `out_${Date.now()}`;
    const displayText = text || (finalMediaType ? `[${finalMediaType.toUpperCase()}]` : "");
    const replyUserId = req.user?.id || null;
    let existingGuestName = "Customer";
    try {
      const prior = db.prepare("SELECT customer_name FROM customer_replies WHERE tenant_id = ? AND deleted_at IS NULL AND from_phone = ? AND customer_name NOT IN ('Customer', 'Demo Customer') AND customer_name IS NOT NULL ORDER BY id DESC LIMIT 1").get(tenantId, targetPhone);
      if (prior?.customer_name) {
        existingGuestName = prior.customer_name;
      } else {
        const recip = db.prepare(`
          SELECT cr.contact_name FROM campaign_recipients cr
          JOIN campaigns c ON c.id = cr.campaign_id
          WHERE c.tenant_id = ? AND cr.clean_phone = ? AND cr.contact_name IS NOT NULL LIMIT 1
        `).get(tenantId, targetPhone);
        if (recip?.contact_name) {
          existingGuestName = recip.contact_name;
        }
      }
    } catch (e) {}

    const replySource = isWebChat ? "CHAT_LINK" : "WHATSAPP";
    const replyLinkId = recentWebMessage?.link_id || null;

    // Staff Takeover: Automatically pause bot for 60 minutes in DB for this tenant + contact
    try {
      webhookService.pauseBotForPhone(targetPhone, 60 * 60 * 1000, {
        tenantId,
        phoneNumberId: resolvedChannelPhoneId || "",
        pausedBy: replyUserId || "agent",
        reason: "MANUAL_INBOX_REPLY"
      });
    } catch (e) {}

    db.prepare(`
      INSERT INTO customer_replies (
        wa_message_id, from_phone, customer_name, message_type,
        message_body, reply_text, media_url, media_type, media_caption,
        reply_sent_at, reply_status, is_read, user_id, received_at,
        source, link_id, tenant_id
      ) VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'SENT', 1, ?, CURRENT_TIMESTAMP, ?, ?, ?)
    `).run(
      assignedId,
      targetPhone,
      existingGuestName,
      displayText,
      displayText,
      finalMediaUrl,
      finalMediaType,
      text || null,
      replyUserId,
      replySource,
      replyLinkId,
      tenantId
    );

    try {
      broadcastEngine.emit("webhook:reply_updated", {
        tenant_id: tenantId,
        wa_message_id: assignedId,
        from_phone: targetPhone,
        message_type: "outbound",
        message_body: displayText,
        reply_text: displayText,
        media_url: finalMediaUrl,
        media_type: finalMediaType,
        reply_status: "SENT"
      });
    } catch (e) {}

    return res.status(200).json({
      success: true,
      channel: isWebChat ? "WEB" : "WHATSAPP",
      message: isWebChat ? "Reply delivered to customer web chat." : "Reply dispatched successfully via WhatsApp.",
      messageId: assignedId,
      mediaUrl: finalMediaUrl,
      mediaType: finalMediaType
    });
  } catch (error) {
    console.error("Direct inbox reply error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get Bot Pause / Takeover status for a contact (Tenant-Scoped)
router.get(["/inbox/bot-status/:phone", "/replies/bot-status/:phone"], authenticateToken, (req, res) => {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const phone = req.params.phone;
    const status = webhookService.getBotStatus(phone, { tenantId });
    return res.status(200).json({ success: true, data: status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Set Bot Pause / Resume status for a contact (Tenant-Scoped)
router.post(["/inbox/bot-status/:phone", "/replies/bot-status/:phone", "/replies/bot-status"], authenticateToken, (req, res) => {
  try {
    const tenantId = Number(req.user?.tenant_id || 1);
    const phone = req.params.phone || req.body?.phone;
    const { paused, durationMinutes } = req.body || {};
    if (paused === false || paused === "false") {
      webhookService.resumeBotForPhone(phone, { tenantId });
    } else {
      const durationMs = Math.max(1, parseInt(durationMinutes, 10) || 60) * 60 * 1000;
      webhookService.pauseBotForPhone(phone, durationMs, {
        tenantId,
        pausedBy: req.user?.id || "agent",
        reason: "MANUAL_AGENT_PAUSE"
      });
    }
    const status = webhookService.getBotStatus(phone, { tenantId });
    return res.status(200).json({ success: true, data: status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =========================================================================
// 8. GOOGLE SHEETS & BOOKING AUTOMATION (Protected & Scoped)
// =========================================================================
const automationController = require("../controllers/automationController");
router.get("/automation/config", authenticateToken, automationController.getConfig);
router.post("/automation/config", authenticateToken, automationController.updateConfig);
router.get("/automation/preview", authenticateToken, automationController.previewSheet);
router.post("/automation/preview", authenticateToken, automationController.previewSheet);
router.post("/automation/run-now", authenticateToken, automationController.runNow);
router.post("/automation/evaluate", authenticateToken, automationController.runNow);
router.get("/automation/history", authenticateToken, automationController.getHistory);
router.get("/automation/status", authenticateToken, automationController.getStatus);
router.post("/automation/contacts", authenticateToken, automationController.saveContacts);
router.get("/automation/contacts", authenticateToken, automationController.getContacts);
router.delete("/automation/contacts", authenticateToken, automationController.clearContacts);

// =========================================================================
// 9. SERVER-SENT EVENTS (SSE) STREAM (Dedicated Stream Token Auth)
// =========================================================================
router.get("/broadcast/stream", authenticateStreamToken, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const safeWrite = (data) => {
    try {
      if (!res.writableEnded && !res.destroyed) {
        res.write(data);
      }
    } catch (e) {
      // client disconnected
    }
  };

  // Initial connection heartbeat
  safeWrite(`data: ${JSON.stringify({ type: "init", message: "SSE stream connected", userId: req.user.id })}\n\n`);

  const onProgress = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "progress", TYPE: "PROGRESS", ...data })}\n\n`);
  };

  const onStatus = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "status", TYPE: "STATUS", ...data })}\n\n`);
    const statusUpper = String(data?.status || "").toUpperCase();
    if (req.query?.campaignId && data?.campaignId === req.query.campaignId && ["COMPLETED", "FAILED", "CANCELLED"].includes(statusUpper)) {
      setTimeout(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.end();
          }
        } catch (e) {}
      }, 1500);
    }
  };

  const onReply = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "reply", TYPE: "REPLY", data })}\n\n`);
  };

  const onWebhookStatus = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "webhook_status", TYPE: "WEBHOOK_STATUS", data })}\n\n`);
  };

  const onReplyUpdated = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "reply_updated", TYPE: "REPLY_UPDATED", data })}\n\n`);
  };

  const onThrottle = (data) => {
    safeWrite(`data: ${JSON.stringify({ type: "throttle", TYPE: "THROTTLE", ...data })}\n\n`);
  };

  broadcastEngine.on("broadcast:progress", onProgress);
  broadcastEngine.on("campaign:status", onStatus);
  broadcastEngine.on("campaign:throttle", onThrottle);
  broadcastEngine.on("webhook:reply", onReply);
  broadcastEngine.on("webhook:reply_updated", onReplyUpdated);
  broadcastEngine.on("webhook:status", onWebhookStatus);

  const keepAliveTimer = setInterval(() => {
    safeWrite(": ping\n\n");
  }, 25000);

  const cleanup = () => {
    clearInterval(keepAliveTimer);
    broadcastEngine.removeListener("broadcast:progress", onProgress);
    broadcastEngine.removeListener("campaign:status", onStatus);
    broadcastEngine.removeListener("campaign:throttle", onThrottle);
    broadcastEngine.removeListener("webhook:reply", onReply);
    broadcastEngine.removeListener("webhook:reply_updated", onReplyUpdated);
    broadcastEngine.removeListener("webhook:status", onWebhookStatus);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("finish", cleanup);
  res.on("close", cleanup);
});

// =========================================================================
// 10. WHATSAPP RESORT BOOKING & GUEST MANAGEMENT PLATFORM (PRD PHASE 1)
// =========================================================================

// Tenant Dashboard Summary (PRD Section 8)
router.get("/dashboard/summary", authenticateToken, resortController.getDashboardSummary);
router.get("/v1/dashboard/summary", authenticateToken, resortController.getDashboardSummary);
router.get("/resort-dashboard/summary", authenticateToken, resortController.getDashboardSummary);

// Guest Contacts & Search (PRD Section 8, PR-004)
router.get("/contacts", authenticateToken, resortController.searchContacts);
router.get("/v1/contacts", authenticateToken, resortController.searchContacts);

// Room Types Management (PRD Section 8, E5)
router.get("/room-types", authenticateToken, resortController.listRoomTypes);
router.get("/v1/room-types", authenticateToken, resortController.listRoomTypes);
router.post("/room-types", authenticateToken, resortController.createRoomType);
router.post("/v1/room-types", authenticateToken, resortController.createRoomType);
router.patch("/room-types/:id", authenticateToken, resortController.updateRoomType);
router.patch("/v1/room-types/:id", authenticateToken, resortController.updateRoomType);

// Manual Room Availability & Daily Inventory (PRD Section 8, PR-011, PR-012)
router.get("/inventory/availability", authenticateToken, resortController.getInventoryAvailability);
router.get("/v1/inventory/availability", authenticateToken, resortController.getInventoryAvailability);
router.put("/inventory/daily", authenticateToken, resortController.updateDailyInventory);
router.put("/v1/inventory/daily", authenticateToken, resortController.updateDailyInventory);

// Booking Enquiries Pipeline (PRD Section 8, PR-007, PR-008, PR-014)
router.get("/enquiries", authenticateToken, resortController.listEnquiries);
router.get("/v1/enquiries", authenticateToken, resortController.listEnquiries);
router.post("/enquiries", authenticateToken, resortController.createEnquiry);
router.post("/v1/enquiries", authenticateToken, resortController.createEnquiry);
router.get("/enquiries/:id", authenticateToken, resortController.getEnquiry);
router.get("/v1/enquiries/:id", authenticateToken, resortController.getEnquiry);
router.patch("/enquiries/:id", authenticateToken, resortController.updateEnquiry);
router.patch("/v1/enquiries/:id", authenticateToken, resortController.updateEnquiry);

// Quotation Builder & WhatsApp Dispatch (PRD Section 8, PR-013, PR-014)
router.post("/enquiries/:id/quotes", authenticateToken, resortController.createQuote);
router.post("/v1/enquiries/:id/quotes", authenticateToken, resortController.createQuote);
router.get("/quotes/:id", authenticateToken, resortController.getQuote);
router.get("/v1/quotes/:id", authenticateToken, resortController.getQuote);
router.post("/quotes/:id/send", authenticateToken, resortController.sendQuote);
router.post("/v1/quotes/:id/send", authenticateToken, resortController.sendQuote);

// Auth v1 alias (PRD Section 8)
router.post("/v1/auth/login", authLimiter, authController.login);

// =========================================================================
// 11. SARVYA CONNECT — WHATSAPP CAMPAIGN & CUSTOM TEMPLATE MANAGEMENT (/api/v1/*)
// =========================================================================
const sarvyaConnectController = require("../controllers/sarvyaConnectController");

// Channel & Connected Sender Accounts
router.post("/v1/channels/whatsapp/connect", authenticateToken, sarvyaConnectController.connectWhatsAppAccount);
router.get("/v1/channels/whatsapp/accounts", authenticateToken, sarvyaConnectController.listWhatsAppAccounts);

// Custom Visual Template Builder Lifecycle
router.get("/v1/whatsapp/templates", authenticateToken, sarvyaConnectController.listCustomTemplates);
router.post("/v1/whatsapp/templates", authenticateToken, sarvyaConnectController.createCustomTemplate);
router.put("/v1/whatsapp/templates/:id", authenticateToken, sarvyaConnectController.updateCustomTemplate);
router.post("/v1/whatsapp/templates/:id/clone", authenticateToken, sarvyaConnectController.cloneCustomTemplate);
router.post("/v1/whatsapp/templates/:id/submit", authenticateToken, sarvyaConnectController.submitTemplateToMeta);

// Messaging Governance, 1-to-1 Dispatch & Message Status Tracking
router.get("/v1/whatsapp/contacts/eligibility", authenticateToken, sarvyaConnectController.checkContactEligibility);
router.post("/v1/whatsapp/messages/send", authenticateToken, sarvyaConnectController.sendOneToOneMessage);
router.get("/v1/whatsapp/messages/:id", authenticateToken, sarvyaConnectController.getMessageStatusById);

// Validated Campaigns & Cost/Usage Accounting
router.post("/v1/whatsapp/campaigns", authenticateToken, broadcastLimiter, sarvyaConnectController.createCampaignV1);
router.post("/v1/whatsapp/campaigns/:id/launch", authenticateToken, broadcastLimiter, sarvyaConnectController.launchCampaignV1);
router.get("/v1/whatsapp/usage", authenticateToken, sarvyaConnectController.getUsageAndBilling);

// Public Meta Webhook v1 Alias
router.get("/v1/webhooks/meta/whatsapp", webhookController.handleVerification);
router.post("/v1/webhooks/meta/whatsapp", webhookController.handleIncomingEvent);

// Meta Template Registry & Custom Builder
router.use(require("./templateRoutes"));

// Click-to-Chat Links & In-App Customer Messaging
router.use(require("./chatLinkRoutes"));

// Multi-Industry Polymorphic Commerce & Catalog
router.use(require("./commerceRoutes"));
router.use(["/commerce", "/v1/commerce"], require("./commerceRoutes"));

// Pay-In Checkout, Merchant Payouts & Settlements
router.use(require("./payoutRoutes"));

// Hospitality Inventory, Room & Rate Configuration Module
router.use(require("./hospitalityRoutes"));

// Dynamic In-App Experience Studio Module
router.use("/v1/inapp", require("./inappExperienceRoutes"));

// Public Dynamic In-App Experience Runtime
router.use(["/v1/public/x", "/public/x"], require("./publicInappRoutes"));

// Meta Embedded Signup v4 with Coexistence Mode
router.use(["/v1/channels/whatsapp/embedded-signup", "/channels/whatsapp/embedded-signup"], require("./embeddedSignupRoutes"));

// Self-Serve Subscriptions, Razorpay Billing & GST Tax Invoices
router.use(["/v1/billing", "/billing"], require("./billingRoutes"));

// Agency White-Label & Multi-Workspace Switcher
router.use(["/v1/agency", "/agency"], require("./agencyRoutes"));

// Universal Fulfillment, Transactions, Invoices & Payment Reconciliation
router.use(["/v1/transactions", "/transactions"], require("./universalFulfillmentRoutes"));
router.use(["/v1/public", "/public"], require("./publicUniversalFulfillmentRoutes"));

// Universal Flow Template Library & Client Configuration Engine
router.use(["/v1/template-library", "/template-library"], require("../modules/templateLibrary/templateRoutes"));
router.use(["/v1/template-installations", "/template-installations"], require("../modules/templateLibrary/templateInstallationRoutes"));

module.exports = router;
