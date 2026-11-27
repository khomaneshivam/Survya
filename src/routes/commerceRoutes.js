const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");
const universalCatalogController = require("../controllers/universalCatalogController");
const unifiedOrderController = require("../controllers/unifiedOrderController");
const { authenticateToken, optionalAuth } = require("../middleware/authMiddleware");

// =========================================================================
// UNIVERSAL MULTI-SECTOR COMMERCE & PRICING API
// =========================================================================

// Universal Catalog Items & Gallery
router.get("/v1/universal/items", authenticateToken, universalCatalogController.listItems);
router.post("/v1/universal/items", authenticateToken, universalCatalogController.createItem);
router.get("/v1/universal/items/:id", authenticateToken, universalCatalogController.getItem);
router.put("/v1/universal/items/:id", authenticateToken, universalCatalogController.updateItem);
router.delete("/v1/universal/items/:id", authenticateToken, universalCatalogController.deleteItem);
router.post("/v1/universal/items/:id/media", authenticateToken, universalCatalogController.addMedia);
router.put("/v1/universal/items/:id/media/reorder", authenticateToken, universalCatalogController.reorderMedia);
router.put("/v1/universal/items/:id/media/:mediaId/primary", authenticateToken, universalCatalogController.setPrimaryMedia);
router.post("/v1/universal/media/:mediaId/meta-cache", authenticateToken, universalCatalogController.getOrCacheMetaMediaId);
router.delete("/v1/universal/media/:mediaId", authenticateToken, universalCatalogController.deleteMedia);
router.get("/v1/universal/search", authenticateToken, universalCatalogController.searchCatalog);

// Add-On Groups & Add-Ons
router.get("/v1/universal/addon-groups", authenticateToken, universalCatalogController.listAddonGroups);
router.get("/v1/universal/applicable-addons", authenticateToken, universalCatalogController.getApplicableAddons);
router.post("/v1/universal/addon-groups", authenticateToken, universalCatalogController.createAddonGroup);
router.put("/v1/universal/addon-groups/:id", authenticateToken, universalCatalogController.updateAddonGroup);
router.delete("/v1/universal/addon-groups/:id", authenticateToken, universalCatalogController.deleteAddonGroup);
router.post("/v1/universal/addon-groups/:groupId/addons", authenticateToken, universalCatalogController.createAddon);
router.put("/v1/universal/addons/:id", authenticateToken, universalCatalogController.updateAddon);
router.delete("/v1/universal/addons/:id", authenticateToken, universalCatalogController.deleteAddon);

// Dynamic Pricing Rules & Promos
router.get("/v1/universal/pricing-rules", authenticateToken, universalCatalogController.listPricingRules);
router.post("/v1/universal/pricing-rules", authenticateToken, universalCatalogController.createPricingRule);
router.put("/v1/universal/pricing-rules/:id", authenticateToken, universalCatalogController.updatePricingRule);
router.delete("/v1/universal/pricing-rules/:id", authenticateToken, universalCatalogController.deletePricingRule);

// Availability, Slots & Atomic Inventory Holds
router.get("/v1/universal/availability/check", authenticateToken, universalCatalogController.checkAvailability);
router.get("/v1/universal/availability/slots", authenticateToken, universalCatalogController.listAvailabilitySlots);
router.post("/v1/universal/availability/slots", authenticateToken, universalCatalogController.createAvailabilitySlot);
router.post("/v1/universal/availability/slots/generate", authenticateToken, universalCatalogController.generateAvailabilitySlots);
router.post("/v1/universal/holds", authenticateToken, universalCatalogController.createHold);
router.post("/v1/universal/holds/:token/confirm", authenticateToken, universalCatalogController.confirmHold);
router.post("/v1/universal/holds/:token/release", authenticateToken, universalCatalogController.releaseHold);

// Dynamic Quotation Engine
router.post("/v1/universal/pricing/quote", authenticateToken, universalCatalogController.calculateQuote);
router.post("/quote", authenticateToken, universalCatalogController.calculateQuote);
router.get("/catalog/search", authenticateToken, universalCatalogController.searchCatalog);

// 8 Industry Blueprints 1-Click Seeder
router.get(["/v1/universal/blueprints", "/v1/universal-catalog/blueprints", "/universal/blueprints"], authenticateToken, universalCatalogController.listBlueprints);
router.post(["/v1/universal/blueprints/seed", "/v1/universal-catalog/blueprints/seed", "/universal/blueprints/seed"], authenticateToken, universalCatalogController.seedBlueprint);
router.post(["/v1/universal/blueprints/import-full-suite", "/v1/universal-catalog/blueprints/import-full-suite", "/universal-catalog/blueprints/import-full-suite"], authenticateToken, universalCatalogController.importFullSuite);

// Business Profile & Masters Setup
router.get(["/v1/business-profile", "/business-profile", "/v1/universal-catalog/business-profile", "/universal-catalog/business-profile"], authenticateToken, universalCatalogController.getBusinessProfile);
router.put(["/v1/business-profile", "/business-profile", "/v1/universal-catalog/business-profile", "/universal-catalog/business-profile"], authenticateToken, universalCatalogController.updateBusinessProfile);

// =========================================================================
// ENTITIES & LEGACY COMMERCE ENDPOINTS
// =========================================================================

// Business Entities Management
router.get("/v1/entities", authenticateToken, catalogController.listEntities);
router.get("/entities", authenticateToken, catalogController.listEntities);
router.post("/v1/entities", authenticateToken, catalogController.createEntity);
router.post("/entities", authenticateToken, catalogController.createEntity);
router.get("/v1/entities/:id", authenticateToken, catalogController.getEntity);
router.get("/entities/:id", authenticateToken, catalogController.getEntity);
router.put("/v1/entities/:id", authenticateToken, catalogController.updateEntity);
router.put("/entities/:id", authenticateToken, catalogController.updateEntity);
router.delete("/v1/entities/:id", authenticateToken, catalogController.deleteEntity);
router.delete("/entities/:id", authenticateToken, catalogController.deleteEntity);
router.post("/v1/entities/:id/seed-starter", authenticateToken, catalogController.seedStarterKit);
router.post("/entities/:id/seed-starter", authenticateToken, catalogController.seedStarterKit);

// Categories
router.get("/v1/entities/:id/categories", authenticateToken, catalogController.listCategories);
router.get("/entities/:id/categories", authenticateToken, catalogController.listCategories);
router.post("/v1/entities/:id/categories", authenticateToken, catalogController.createCategory);
router.post("/entities/:id/categories", authenticateToken, catalogController.createCategory);
router.put("/v1/entities/:id/categories/:catId", authenticateToken, catalogController.updateCategory);
router.delete("/v1/entities/:id/categories/:catId", authenticateToken, catalogController.deleteCategory);

// Catalog Items & 86 Sold-Out Controls
router.get("/v1/entities/:id/items", authenticateToken, catalogController.listItems);
router.get("/entities/:id/items", authenticateToken, catalogController.listItems);
router.post("/v1/entities/:id/items", authenticateToken, catalogController.createItem);
router.post("/entities/:id/items", authenticateToken, catalogController.createItem);
router.get("/v1/items/:id", authenticateToken, catalogController.getItem);
router.put("/v1/items/:id", authenticateToken, catalogController.updateItem);
router.delete("/v1/items/:id", authenticateToken, catalogController.deleteItem);
router.patch("/v1/items/:id/86-toggle", authenticateToken, catalogController.toggle86);
router.patch("/items/:id/86-toggle", authenticateToken, catalogController.toggle86);

// Item Variants
router.post("/v1/items/:id/variants", authenticateToken, catalogController.createVariant);
router.post("/items/:id/variants", authenticateToken, catalogController.createVariant);
router.delete("/v1/variants/:id", authenticateToken, catalogController.deleteVariant);
router.delete("/variants/:id", authenticateToken, catalogController.deleteVariant);

// CSV Import
router.post("/v1/entities/:id/catalog/import", authenticateToken, catalogController.importCatalogCsv);
router.post("/entities/:id/catalog/import", authenticateToken, catalogController.importCatalogCsv);

// Daily Inventory Matrix
router.get("/v1/entities/:id/inventory-matrix", authenticateToken, catalogController.getInventoryMatrix);
router.get("/entities/:id/inventory-matrix", authenticateToken, catalogController.getInventoryMatrix);
router.post("/v1/entities/:id/items/:itemId/inventory-matrix", authenticateToken, catalogController.updateInventoryMatrix);
router.post("/entities/:id/items/:itemId/inventory-matrix", authenticateToken, catalogController.updateInventoryMatrix);

// Orders & Unified Checkout
router.post("/v1/entities/:id/orders", optionalAuth, unifiedOrderController.createOrder);
router.post("/entities/:id/orders", optionalAuth, unifiedOrderController.createOrder);
router.get("/v1/entities/:id/orders", authenticateToken, unifiedOrderController.listOrders);
router.get("/entities/:id/orders", authenticateToken, unifiedOrderController.listOrders);
router.get("/v1/orders/:id", authenticateToken, unifiedOrderController.getOrder);
router.get("/orders/:id", authenticateToken, unifiedOrderController.getOrder);
router.patch("/v1/orders/:id/status", authenticateToken, unifiedOrderController.updateStatus);
router.patch("/orders/:id/status", authenticateToken, unifiedOrderController.updateStatus);

module.exports = router;
