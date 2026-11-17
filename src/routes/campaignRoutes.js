const express = require("express");
const router = express.Router();
const broadcastController = require("../controllers/broadcastController");
const campaignController = require("../controllers/campaignController");
const uploadController = require("../controllers/uploadController");
const reportsController = require("../controllers/reportsController");
const { authenticateToken, authenticateStreamToken } = require("../middleware/authMiddleware");
const { uploadLimiter, broadcastLimiter } = require("../middleware/rateLimiter");
const { contactUpload, mediaUpload } = require("../middleware/uploadMiddleware");
const { uploadMedia } = require("../services/metaWhatsAppService");

// Live SSE Stream & Status
router.get("/broadcast/stream", authenticateStreamToken, broadcastController.handleSseStream);
router.post("/broadcast/stream-token", authenticateToken, broadcastController.generateStreamToken);
router.get("/broadcast/status", authenticateToken, broadcastController.getBroadcastStatus);
router.post("/broadcast/cancel", authenticateToken, broadcastController.cancelBroadcast);
router.post("/broadcast/pause", authenticateToken, broadcastController.pauseBroadcast);
router.post("/broadcast/resume", authenticateToken, broadcastController.resumeBroadcast);

// Ingestion & File Upload
router.post("/upload", authenticateToken, uploadLimiter, contactUpload.single("file"), uploadController.handleFileUpload);
router.post("/upload/media", authenticateToken, uploadLimiter, mediaUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No media file provided." });
    }

    const relativeUrl = `/uploads/${req.file.filename}`;
    const host = req.get("host");
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    let metaMediaId = null;
    let metaUploaded = false;
    let metaError = null;

    try {
      const uploadRes = await uploadMedia(req.file.path, req.file.mimetype);
      if (uploadRes && uploadRes.mediaId) {
        metaMediaId = uploadRes.mediaId;
        metaUploaded = true;
      }
    } catch (err) {
      console.warn("[MediaUpload] Direct Meta upload notice:", err.message);
      metaError = err.message;
    }

    return res.status(200).json({
      success: true,
      message: "Media uploaded successfully.",
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      url: fullUrl,
      relativeUrl,
      metaMediaId,
      metaUploaded,
      metaError
    });
  } catch (error) {
    console.error("[MediaUpload] Upload error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Campaign Lifecycle
router.post("/campaigns", authenticateToken, broadcastLimiter, broadcastController.startBroadcast);
router.get("/campaigns", authenticateToken, campaignController.listCampaigns);
router.get("/campaigns/:id", authenticateToken, campaignController.getCampaignDetails);
router.post("/campaigns/:id/run-now", authenticateToken, broadcastLimiter, broadcastController.runScheduledCampaignNow);
router.post("/campaigns/:id/reschedule", authenticateToken, broadcastController.rescheduleCampaign);
router.delete("/campaigns/:id", authenticateToken, campaignController.deleteCampaign);
router.get("/campaigns/:id/recipients", authenticateToken, campaignController.getCampaignRecipients);
router.get("/campaigns/:id/export", authenticateToken, reportsController.exportCampaignReport);

// Reports & Analytics
router.get("/reports/campaigns/export", authenticateToken, reportsController.exportCampaignReport);
router.get("/reports/automation", authenticateToken, reportsController.getAutomationReports);
router.get("/reports/overview", authenticateToken, reportsController.getOverviewAnalytics);

module.exports = router;

