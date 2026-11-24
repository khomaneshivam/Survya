const express = require("express");
const router = express.Router();
const universalCatalogController = require("../controllers/universalCatalogController");
const { authenticateToken, optionalAuth } = require("../middleware/authMiddleware");

// Items & Gallery
router.get("/items", authenticateToken, universalCatalogController.listItems);
router.post("/items", authenticateToken, universalCatalogController.createItem);
router.get("/items/:id", authenticateToken, universalCatalogController.getItem);
router.put("/items/:id", authenticateToken, universalCatalogController.updateItem);
router.delete("/items/:id", authenticateToken, universalCatalogController.deleteItem);
router.get("/search", authenticateToken, universalCatalogController.searchCatalog);

// Media Gallery
router.post("/items/:id/media", authenticateToken, universalCatalogController.addMedia);
router.delete("/media/:mediaId", authenticateToken, universalCatalogController.deleteMedia);
router.put("/items/:id/media/reorder", authenticateToken, universalCatalogController.reorderMedia);
router.put("/items/:id/media/:mediaId/primary", authenticateToken, universalCatalogController.setPrimaryMedia);
router.post("/media/:mediaId/meta-cache", authenticateToken, universalCatalogController.getOrCacheMetaMediaId);

// Add-On Groups & Add-Ons
router.get("/addon-groups", authenticateToken, universalCatalogController.listAddonGroups);
router.post("/addon-groups", authenticateToken, universalCatalogController.createAddonGroup);
router.put("/addon-groups/:id", authenticateToken, universalCatalogController.updateAddonGroup);
router.delete("/addon-groups/:id", authenticateToken, universalCatalogController.deleteAddonGroup);
router.get("/applicable-addons", authenticateToken, universalCatalogController.getApplicableAddons);

router.post("/addon-groups/:groupId/addons", authenticateToken, universalCatalogController.createAddon);
router.put("/addons/:id", authenticateToken, universalCatalogController.updateAddon);
router.delete("/addons/:id", authenticateToken, universalCatalogController.deleteAddon);

// Dynamic Pricing Rules & Promos
router.get("/pricing-rules", authenticateToken, universalCatalogController.listPricingRules);
router.post("/pricing-rules", authenticateToken, universalCatalogController.createPricingRule);
router.put("/pricing-rules/:id", authenticateToken, universalCatalogController.updatePricingRule);
router.delete("/pricing-rules/:id", authenticateToken, universalCatalogController.deletePricingRule);

// Availability, Slots & Atomic Inventory Holds
router.get("/availability", authenticateToken, universalCatalogController.checkAvailability);
router.get("/availability/check", authenticateToken, universalCatalogController.checkAvailability);
router.post("/availability/check", authenticateToken, universalCatalogController.checkAvailability);
router.get("/slots", authenticateToken, universalCatalogController.listAvailabilitySlots);
router.get("/availability/slots", authenticateToken, universalCatalogController.listAvailabilitySlots);
router.post("/slots", authenticateToken, universalCatalogController.createAvailabilitySlot);
router.post("/availability/slots", authenticateToken, universalCatalogController.createAvailabilitySlot);
router.post("/slots/generate", authenticateToken, universalCatalogController.generateAvailabilitySlots);
router.post("/availability/slots/generate", authenticateToken, universalCatalogController.generateAvailabilitySlots);

router.post("/holds", authenticateToken, universalCatalogController.createHold);
router.post("/availability/hold", authenticateToken, universalCatalogController.createHold);
router.post("/holds/:token/confirm", authenticateToken, universalCatalogController.confirmHold);
router.post("/holds/:token/release", authenticateToken, universalCatalogController.releaseHold);

// Pricing Quote Preview
router.post("/quote-preview", authenticateToken, universalCatalogController.calculateQuote);
router.post("/quote", authenticateToken, universalCatalogController.calculateQuote);

// 8 Industry Blueprints & Full Suite Seeder
router.get("/blueprints", authenticateToken, universalCatalogController.listBlueprints);
router.post("/blueprints/seed", authenticateToken, universalCatalogController.seedBlueprint);
router.post("/blueprints/import-full-suite", authenticateToken, universalCatalogController.importFullSuite);

// Business Profile & Masters Setup
router.get(["/business-profile", "/profile"], authenticateToken, universalCatalogController.getBusinessProfile);
router.put(["/business-profile", "/profile"], authenticateToken, universalCatalogController.updateBusinessProfile);

module.exports = router;
