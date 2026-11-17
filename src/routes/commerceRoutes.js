const express = require("express");
const router = express.Router();
const catalogController = require("../controllers/catalogController");
const unifiedOrderController = require("../controllers/unifiedOrderController");
const { authenticateToken, optionalAuth } = require("../middleware/authMiddleware");

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
router.get("/v1/orders/:id", optionalAuth, unifiedOrderController.getOrder);
router.get("/orders/:id", optionalAuth, unifiedOrderController.getOrder);
router.patch("/v1/orders/:id/status", authenticateToken, unifiedOrderController.updateStatus);
router.patch("/orders/:id/status", authenticateToken, unifiedOrderController.updateStatus);

module.exports = router;
