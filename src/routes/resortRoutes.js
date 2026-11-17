const express = require("express");
const router = express.Router();
const automationController = require("../controllers/automationController");
const resortController = require("../controllers/resortController");
const { authenticateToken, requireAdmin } = require("../middleware/authMiddleware");
const { uploadLimiter } = require("../middleware/rateLimiter");
const { contactUpload } = require("../middleware/uploadMiddleware");

// Automated Booking Dispatches
router.get("/automation/dispatches", authenticateToken, automationController.getDispatches);
router.post("/automation/dispatches", authenticateToken, automationController.dispatchBookingMessage);
router.post("/automation/dispatches/trigger-scheduled", authenticateToken, requireAdmin, automationController.triggerScheduledAutomation);
router.get("/automation/contacts", authenticateToken, automationController.getContacts);
router.post("/automation/contacts/upload", authenticateToken, uploadLimiter, contactUpload.single("file"), automationController.uploadContacts);
router.delete("/automation/contacts", authenticateToken, requireAdmin, automationController.clearContacts);
router.post("/automation/contacts/opt-out", authenticateToken, automationController.addOptOut);
router.get("/automation/contacts/opt-outs", authenticateToken, automationController.getOptOuts);
router.delete("/automation/contacts/opt-out/:cleanPhone", authenticateToken, requireAdmin, automationController.removeOptOut);

// Resort PRD (Properties, Room Types & Daily Inventory)
router.get("/v1/properties", authenticateToken, resortController.listProperties);
router.get("/properties", authenticateToken, resortController.listProperties);
router.get("/v1/room-types", authenticateToken, resortController.listRoomTypes);
router.get("/room-types", authenticateToken, resortController.listRoomTypes);
router.get("/v1/inventory/daily", authenticateToken, resortController.getDailyInventory);
router.get("/inventory/daily", authenticateToken, resortController.getDailyInventory);
router.put("/v1/inventory/daily", authenticateToken, resortController.updateDailyInventory);
router.put("/inventory/daily", authenticateToken, resortController.updateDailyInventory);

// Booking Enquiries Pipeline & Quotations
router.get("/v1/enquiries", authenticateToken, resortController.listEnquiries);
router.get("/enquiries", authenticateToken, resortController.listEnquiries);
router.post("/v1/enquiries", authenticateToken, resortController.createEnquiry);
router.post("/enquiries", authenticateToken, resortController.createEnquiry);
router.get("/v1/enquiries/:id", authenticateToken, resortController.getEnquiry);
router.get("/enquiries/:id", authenticateToken, resortController.getEnquiry);
router.patch("/v1/enquiries/:id/status", authenticateToken, resortController.updateEnquiryStatus);
router.patch("/enquiries/:id/status", authenticateToken, resortController.updateEnquiryStatus);
router.post("/v1/enquiries/:id/quotes", authenticateToken, resortController.createQuoteForEnquiry);
router.post("/enquiries/:id/quotes", authenticateToken, resortController.createQuoteForEnquiry);
router.get("/v1/quotes/:id", authenticateToken, resortController.getQuote);
router.get("/quotes/:id", authenticateToken, resortController.getQuote);
router.post("/v1/quotes/:id/send", authenticateToken, resortController.sendQuote);
router.post("/quotes/:id/send", authenticateToken, resortController.sendQuote);
router.get("/v1/resort/summary", authenticateToken, resortController.getDashboardSummary);
router.get("/resort/summary", authenticateToken, resortController.getDashboardSummary);

module.exports = router;

