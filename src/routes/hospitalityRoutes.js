const express = require("express");
const router = express.Router();
const controller = require("../controllers/hospitalityController");
const { authenticateToken, requireWorkspaceAdmin } = require("../middleware/authMiddleware");
const { mediaUpload } = require("../middleware/uploadMiddleware");
const { publicLimiter } = require("../middleware/rateLimiter");

/**
 * -------------------------------------------------------------------------
 * PUBLIC / CONVERSATIONAL CHAT ROUTES (Unauthenticated source of truth, rate-limited)
 * -------------------------------------------------------------------------
 */
router.get("/v1/public/hospitality/properties", publicLimiter, controller.publicSearchProperties);
router.get("/public/hospitality/properties", publicLimiter, controller.publicSearchProperties);
router.get("/v1/public/hospitality/properties/:id", publicLimiter, controller.publicGetProperty);
router.get("/public/hospitality/properties/:id", publicLimiter, controller.publicGetProperty);
router.get("/v1/public/hospitality/properties/:id/gallery", publicLimiter, controller.publicGetPropertyGallery);
router.get("/public/hospitality/properties/:id/gallery", publicLimiter, controller.publicGetPropertyGallery);
router.get("/v1/public/hospitality/properties/:id/rooms", publicLimiter, controller.publicGetRoomCategories);
router.get("/public/hospitality/properties/:id/rooms", publicLimiter, controller.publicGetRoomCategories);
router.get("/v1/public/hospitality/properties/:id/rooms/:roomId", publicLimiter, controller.publicGetRoomDetails);
router.get("/public/hospitality/properties/:id/rooms/:roomId", publicLimiter, controller.publicGetRoomDetails);
router.get("/v1/public/hospitality/properties/:id/availability", publicLimiter, controller.publicCheckAvailability);
router.get("/public/hospitality/properties/:id/availability", publicLimiter, controller.publicCheckAvailability);
router.post("/v1/public/hospitality/properties/:id/quote", publicLimiter, controller.publicCalculateQuote);
router.post("/public/hospitality/properties/:id/quote", publicLimiter, controller.publicCalculateQuote);
router.post("/v1/public/hospitality/chat-action", publicLimiter, controller.publicChatAction);
router.post("/public/hospitality/chat-action", publicLimiter, controller.publicChatAction);

// Public aliases under /hospitality/public/...
router.get("/v1/hospitality/public/properties", publicLimiter, controller.publicSearchProperties);
router.get("/hospitality/public/properties", publicLimiter, controller.publicSearchProperties);
router.get("/v1/hospitality/public/properties/:id", publicLimiter, controller.publicGetProperty);
router.get("/hospitality/public/properties/:id", publicLimiter, controller.publicGetProperty);
router.post("/v1/hospitality/public/chat-action", publicLimiter, controller.publicChatAction);
router.post("/hospitality/public/chat-action", publicLimiter, controller.publicChatAction);

/**
 * -------------------------------------------------------------------------
 * ADMINISTRATIVE PORTAL ROUTES (Secured with authenticateToken)
 * -------------------------------------------------------------------------
 */

// Property Setup & Publishing Lifecycle
router.get("/v1/hospitality/properties", authenticateToken, controller.listProperties);
router.get("/hospitality/properties", authenticateToken, controller.listProperties);
router.post("/v1/hospitality/properties", authenticateToken, requireWorkspaceAdmin, controller.createProperty);
router.post("/hospitality/properties", authenticateToken, requireWorkspaceAdmin, controller.createProperty);
router.get("/v1/hospitality/properties/:id", authenticateToken, controller.getProperty);
router.get("/hospitality/properties/:id", authenticateToken, controller.getProperty);
router.put("/v1/hospitality/properties/:id", authenticateToken, requireWorkspaceAdmin, controller.updateProperty);
router.put("/hospitality/properties/:id", authenticateToken, requireWorkspaceAdmin, controller.updateProperty);
router.post("/v1/hospitality/properties/:id/archive", authenticateToken, requireWorkspaceAdmin, controller.archiveProperty);
router.post("/hospitality/properties/:id/archive", authenticateToken, requireWorkspaceAdmin, controller.archiveProperty);
router.post("/v1/hospitality/properties/:id/duplicate", authenticateToken, requireWorkspaceAdmin, controller.duplicateProperty);
router.post("/hospitality/properties/:id/duplicate", authenticateToken, requireWorkspaceAdmin, controller.duplicateProperty);
router.post("/v1/hospitality/properties/:id/publish", authenticateToken, requireWorkspaceAdmin, controller.publishProperty);
router.post("/hospitality/properties/:id/publish", authenticateToken, requireWorkspaceAdmin, controller.publishProperty);
router.post("/v1/hospitality/properties/:id/unpublish", authenticateToken, requireWorkspaceAdmin, controller.unpublishProperty);
router.post("/hospitality/properties/:id/unpublish", authenticateToken, requireWorkspaceAdmin, controller.unpublishProperty);
router.get("/v1/hospitality/properties/:id/overview", authenticateToken, controller.getSetupOverview);
router.get("/hospitality/properties/:id/overview", authenticateToken, controller.getSetupOverview);

// Room Categories
router.get("/v1/hospitality/properties/:id/room-categories", authenticateToken, controller.listRoomCategories);
router.get("/hospitality/properties/:id/room-categories", authenticateToken, controller.listRoomCategories);
router.get("/v1/hospitality/properties/:id/room-categories/:roomId", authenticateToken, controller.getRoomCategory);
router.get("/hospitality/properties/:id/room-categories/:roomId", authenticateToken, controller.getRoomCategory);
router.post("/v1/hospitality/properties/:id/room-categories", authenticateToken, requireWorkspaceAdmin, controller.createRoomCategory);
router.post("/hospitality/properties/:id/room-categories", authenticateToken, requireWorkspaceAdmin, controller.createRoomCategory);
router.put("/v1/hospitality/properties/:id/room-categories/:roomId", authenticateToken, requireWorkspaceAdmin, controller.updateRoomCategory);
router.put("/hospitality/properties/:id/room-categories/:roomId", authenticateToken, requireWorkspaceAdmin, controller.updateRoomCategory);
router.delete("/v1/hospitality/properties/:id/room-categories/:roomId", authenticateToken, requireWorkspaceAdmin, controller.archiveRoomCategory);
router.delete("/hospitality/properties/:id/room-categories/:roomId", authenticateToken, requireWorkspaceAdmin, controller.archiveRoomCategory);

// Room Photographs & Gallery
router.get("/v1/hospitality/properties/:id/room-categories/:roomId/images", authenticateToken, controller.listRoomImages);
router.get("/hospitality/properties/:id/room-categories/:roomId/images", authenticateToken, controller.listRoomImages);
router.post("/v1/hospitality/properties/:id/room-categories/:roomId/images", authenticateToken, requireWorkspaceAdmin, mediaUpload.single("image"), controller.uploadRoomImage);
router.post("/hospitality/properties/:id/room-categories/:roomId/images", authenticateToken, requireWorkspaceAdmin, mediaUpload.single("image"), controller.uploadRoomImage);
router.put("/v1/hospitality/properties/:id/room-categories/:roomId/images/:imageId/primary", authenticateToken, requireWorkspaceAdmin, controller.setPrimaryRoomImage);
router.put("/hospitality/properties/:id/room-categories/:roomId/images/:imageId/primary", authenticateToken, requireWorkspaceAdmin, controller.setPrimaryRoomImage);
router.post("/v1/hospitality/properties/:id/room-categories/:roomId/images/reorder", authenticateToken, requireWorkspaceAdmin, controller.reorderRoomImages);
router.post("/hospitality/properties/:id/room-categories/:roomId/images/reorder", authenticateToken, requireWorkspaceAdmin, controller.reorderRoomImages);
router.delete("/v1/hospitality/properties/:id/room-categories/:roomId/images/:imageId", authenticateToken, requireWorkspaceAdmin, controller.deleteRoomImage);
router.delete("/hospitality/properties/:id/room-categories/:roomId/images/:imageId", authenticateToken, requireWorkspaceAdmin, controller.deleteRoomImage);

// Property Photo Gallery & Imagery
router.get("/v1/hospitality/properties/:id/gallery", authenticateToken, controller.getPropertyGallery);
router.get("/hospitality/properties/:id/gallery", authenticateToken, controller.getPropertyGallery);
router.post("/v1/hospitality/properties/:id/gallery", authenticateToken, requireWorkspaceAdmin, mediaUpload.single("image"), controller.addPropertyGalleryImage);
router.post("/hospitality/properties/:id/gallery", authenticateToken, requireWorkspaceAdmin, mediaUpload.single("image"), controller.addPropertyGalleryImage);
router.put("/v1/hospitality/properties/:id/gallery/:imageId/primary", authenticateToken, requireWorkspaceAdmin, controller.setPropertyGalleryPrimary);
router.put("/hospitality/properties/:id/gallery/:imageId/primary", authenticateToken, requireWorkspaceAdmin, controller.setPropertyGalleryPrimary);
router.delete("/v1/hospitality/properties/:id/gallery/:imageId", authenticateToken, requireWorkspaceAdmin, controller.deletePropertyGalleryImage);
router.delete("/hospitality/properties/:id/gallery/:imageId", authenticateToken, requireWorkspaceAdmin, controller.deletePropertyGalleryImage);

// Physical Room Numbers (Keys)
router.get("/v1/hospitality/properties/:id/physical-rooms", authenticateToken, controller.listPhysicalRooms);
router.get("/hospitality/properties/:id/physical-rooms", authenticateToken, controller.listPhysicalRooms);
router.post("/v1/hospitality/properties/:id/physical-rooms", authenticateToken, requireWorkspaceAdmin, controller.createPhysicalRoom);
router.post("/hospitality/properties/:id/physical-rooms", authenticateToken, requireWorkspaceAdmin, controller.createPhysicalRoom);
router.put("/v1/hospitality/properties/:id/physical-rooms/:roomId", authenticateToken, requireWorkspaceAdmin, controller.updatePhysicalRoom);
router.put("/hospitality/properties/:id/physical-rooms/:roomId", authenticateToken, requireWorkspaceAdmin, controller.updatePhysicalRoom);
router.delete("/v1/hospitality/properties/:id/physical-rooms/:roomId", authenticateToken, requireWorkspaceAdmin, controller.deletePhysicalRoom);
router.delete("/hospitality/properties/:id/physical-rooms/:roomId", authenticateToken, requireWorkspaceAdmin, controller.deletePhysicalRoom);

// Facilities
router.get("/v1/hospitality/properties/:id/facilities", authenticateToken, controller.listFacilities);
router.get("/hospitality/properties/:id/facilities", authenticateToken, controller.listFacilities);
router.post("/v1/hospitality/properties/:id/facilities", authenticateToken, requireWorkspaceAdmin, controller.addFacility);
router.post("/hospitality/properties/:id/facilities", authenticateToken, requireWorkspaceAdmin, controller.addFacility);
router.put("/v1/hospitality/properties/:id/facilities/:facilityId", authenticateToken, requireWorkspaceAdmin, controller.updateFacility);
router.put("/hospitality/properties/:id/facilities/:facilityId", authenticateToken, requireWorkspaceAdmin, controller.updateFacility);
router.delete("/v1/hospitality/properties/:id/facilities/:facilityId", authenticateToken, requireWorkspaceAdmin, controller.deleteFacility);
router.delete("/hospitality/properties/:id/facilities/:facilityId", authenticateToken, requireWorkspaceAdmin, controller.deleteFacility);

// Policies & FAQs
router.get("/v1/hospitality/properties/:id/policies", authenticateToken, controller.listPolicies);
router.get("/hospitality/properties/:id/policies", authenticateToken, controller.listPolicies);
router.post("/v1/hospitality/properties/:id/policies", authenticateToken, requireWorkspaceAdmin, controller.upsertPolicy);
router.post("/hospitality/properties/:id/policies", authenticateToken, requireWorkspaceAdmin, controller.upsertPolicy);
router.get("/v1/hospitality/properties/:id/faqs", authenticateToken, controller.listFaqs);
router.get("/hospitality/properties/:id/faqs", authenticateToken, controller.listFaqs);
router.post("/v1/hospitality/properties/:id/faqs", authenticateToken, requireWorkspaceAdmin, controller.createFaq);
router.post("/hospitality/properties/:id/faqs", authenticateToken, requireWorkspaceAdmin, controller.createFaq);
router.put("/v1/hospitality/properties/:id/faqs/:faqId", authenticateToken, requireWorkspaceAdmin, controller.updateFaq);
router.put("/hospitality/properties/:id/faqs/:faqId", authenticateToken, requireWorkspaceAdmin, controller.updateFaq);
router.delete("/v1/hospitality/properties/:id/faqs/:faqId", authenticateToken, requireWorkspaceAdmin, controller.deleteFaq);
router.delete("/hospitality/properties/:id/faqs/:faqId", authenticateToken, requireWorkspaceAdmin, controller.deleteFaq);

// Availability & Inventory
router.get("/v1/hospitality/properties/:id/inventory/grid", authenticateToken, controller.getInventoryGrid);
router.get("/hospitality/properties/:id/inventory/grid", authenticateToken, controller.getInventoryGrid);
router.post("/v1/hospitality/properties/:id/inventory/bulk-update", authenticateToken, requireWorkspaceAdmin, controller.bulkUpdateInventory);
router.post("/hospitality/properties/:id/inventory/bulk-update", authenticateToken, requireWorkspaceAdmin, controller.bulkUpdateInventory);
router.get("/v1/hospitality/properties/:id/inventory/blocks", authenticateToken, controller.listInventoryBlocks);
router.get("/hospitality/properties/:id/inventory/blocks", authenticateToken, controller.listInventoryBlocks);
router.post("/v1/hospitality/properties/:id/inventory/blocks", authenticateToken, requireWorkspaceAdmin, controller.createInventoryBlock);
router.post("/hospitality/properties/:id/inventory/blocks", authenticateToken, requireWorkspaceAdmin, controller.createInventoryBlock);
router.post("/v1/hospitality/properties/:id/inventory/blocks/:blockId/release", authenticateToken, requireWorkspaceAdmin, controller.releaseInventoryBlock);
router.post("/hospitality/properties/:id/inventory/blocks/:blockId/release", authenticateToken, requireWorkspaceAdmin, controller.releaseInventoryBlock);
router.get("/v1/hospitality/properties/:id/inventory/check", authenticateToken, controller.checkAvailability);
router.get("/hospitality/properties/:id/inventory/check", authenticateToken, controller.checkAvailability);

// Rates & Pricing
router.get("/v1/hospitality/properties/:id/rate-plans", authenticateToken, controller.listRatePlans);
router.get("/hospitality/properties/:id/rate-plans", authenticateToken, controller.listRatePlans);
router.post("/v1/hospitality/properties/:id/rate-plans", authenticateToken, requireWorkspaceAdmin, controller.createRatePlan);
router.post("/hospitality/properties/:id/rate-plans", authenticateToken, requireWorkspaceAdmin, controller.createRatePlan);
router.put("/v1/hospitality/properties/:id/rate-plans/:planId", authenticateToken, requireWorkspaceAdmin, controller.updateRatePlan);
router.put("/hospitality/properties/:id/rate-plans/:planId", authenticateToken, requireWorkspaceAdmin, controller.updateRatePlan);
router.delete("/v1/hospitality/properties/:id/rate-plans/:planId", authenticateToken, requireWorkspaceAdmin, controller.deleteRatePlan);
router.delete("/hospitality/properties/:id/rate-plans/:planId", authenticateToken, requireWorkspaceAdmin, controller.deleteRatePlan);

router.get("/v1/hospitality/properties/:id/seasonal-rates", authenticateToken, controller.listSeasonalRates);
router.get("/hospitality/properties/:id/seasonal-rates", authenticateToken, controller.listSeasonalRates);
router.post("/v1/hospitality/properties/:id/seasonal-rates", authenticateToken, requireWorkspaceAdmin, controller.createSeasonalRate);
router.post("/hospitality/properties/:id/seasonal-rates", authenticateToken, requireWorkspaceAdmin, controller.createSeasonalRate);
router.put("/v1/hospitality/properties/:id/seasonal-rates/:seasonId", authenticateToken, requireWorkspaceAdmin, controller.updateSeasonalRate);
router.put("/hospitality/properties/:id/seasonal-rates/:seasonId", authenticateToken, requireWorkspaceAdmin, controller.updateSeasonalRate);
router.delete("/v1/hospitality/properties/:id/seasonal-rates/:seasonId", authenticateToken, requireWorkspaceAdmin, controller.deleteSeasonalRate);
router.delete("/hospitality/properties/:id/seasonal-rates/:seasonId", authenticateToken, requireWorkspaceAdmin, controller.deleteSeasonalRate);

router.get("/v1/hospitality/properties/:id/daily-rates", authenticateToken, controller.listDailyRates);
router.get("/hospitality/properties/:id/daily-rates", authenticateToken, controller.listDailyRates);
router.post("/v1/hospitality/properties/:id/daily-rates", authenticateToken, requireWorkspaceAdmin, controller.upsertDailyRate);
router.post("/hospitality/properties/:id/daily-rates", authenticateToken, requireWorkspaceAdmin, controller.upsertDailyRate);
router.post("/v1/hospitality/properties/:id/daily-rates/bulk", authenticateToken, requireWorkspaceAdmin, controller.bulkUpsertDailyRates);
router.post("/hospitality/properties/:id/daily-rates/bulk", authenticateToken, requireWorkspaceAdmin, controller.bulkUpsertDailyRates);
router.delete("/v1/hospitality/properties/:id/daily-rates/:dailyRateId", authenticateToken, requireWorkspaceAdmin, controller.deleteDailyRate);
router.delete("/hospitality/properties/:id/daily-rates/:dailyRateId", authenticateToken, requireWorkspaceAdmin, controller.deleteDailyRate);

router.get("/v1/hospitality/properties/:id/tax-rules", authenticateToken, controller.listTaxRules);
router.get("/hospitality/properties/:id/tax-rules", authenticateToken, controller.listTaxRules);
router.post("/v1/hospitality/properties/:id/tax-rules", authenticateToken, requireWorkspaceAdmin, controller.upsertTaxRule);
router.post("/hospitality/properties/:id/tax-rules", authenticateToken, requireWorkspaceAdmin, controller.upsertTaxRule);
router.delete("/v1/hospitality/properties/:id/tax-rules/:ruleId", authenticateToken, requireWorkspaceAdmin, controller.deleteTaxRule);
router.delete("/hospitality/properties/:id/tax-rules/:ruleId", authenticateToken, requireWorkspaceAdmin, controller.deleteTaxRule);

router.post("/v1/hospitality/properties/:id/quote", authenticateToken, controller.calculateQuote);
router.post("/hospitality/properties/:id/quote", authenticateToken, controller.calculateQuote);

module.exports = router;
