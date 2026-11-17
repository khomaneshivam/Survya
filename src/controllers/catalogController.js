const catalogService = require("../services/catalogService");

async function listEntities(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { domain } = req.query;
    const userId = req.user?.id || null;
    const isAdmin = req.user?.role === "ADMIN";
    const entities = catalogService.listEntities(tenantId, domain, userId, isAdmin);
    res.json({ success: true, entities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getEntity(req, res) {
  try {
    const entity = catalogService.getEntityById(req.params.id);
    if (!entity) return res.status(404).json({ success: false, message: "Entity not found" });
    if (req.user?.role !== "ADMIN" && entity.user_id && entity.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, message: "Access denied to this business entity." });
    }
    res.json({ success: true, entity });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createEntity(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || null;
    const entity = catalogService.createEntity(req.body, tenantId, userId);
    res.status(201).json({ success: true, entity });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateEntity(req, res) {
  try {
    const existing = catalogService.getEntityById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Entity not found" });
    if (req.user?.role !== "ADMIN" && existing.user_id && existing.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, message: "Access denied to update this business entity." });
    }
    const entity = catalogService.updateEntity(req.params.id, req.body);
    res.json({ success: true, entity });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteEntity(req, res) {
  try {
    const existing = catalogService.getEntityById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Entity not found" });
    if (req.user?.role !== "ADMIN" && existing.user_id && existing.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, message: "Access denied to delete this business entity." });
    }
    const result = catalogService.deleteEntity(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listCategories(req, res) {
  try {
    const categories = catalogService.getCategories(req.params.id);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createCategory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const category = catalogService.createCategory(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateCategory(req, res) {
  try {
    const category = catalogService.updateCategory(req.params.id, req.body);
    res.json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCategory(req, res) {
  try {
    const result = catalogService.deleteCategory(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listItems(req, res) {
  try {
    const { categoryId, itemType, activeOnly, search } = req.query;
    const items = catalogService.getItems(req.params.id, {
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      itemType,
      activeOnly: activeOnly === '1' || activeOnly === 'true',
      search
    });
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getItem(req, res) {
  try {
    const item = catalogService.getItemById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createItem(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const item = catalogService.createItem(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateItem(req, res) {
  try {
    const item = catalogService.updateItem(req.params.id, req.body);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteItem(req, res) {
  try {
    const result = catalogService.deleteItem(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function toggle86(req, res) {
  try {
    const { isSoldOutToday } = req.body;
    const result = catalogService.toggleSoldOut(req.params.id, isSoldOutToday !== undefined ? !!isSoldOutToday : null);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function createVariant(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const variant = catalogService.createVariant(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, variant });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteVariant(req, res) {
  try {
    const result = catalogService.deleteVariant(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getInventoryMatrix(req, res) {
  try {
    const { id: entityId, itemId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate || new Date().toISOString().slice(0, 10);
    const end = endDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    const matrix = catalogService.getInventoryMatrix(entityId, itemId, start, end);
    res.json({ success: true, matrix });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateInventoryMatrix(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { id: entityId, itemId } = req.params;
    const { date, startDate, endDate, updates } = req.body;

    if (date) {
      const entry = catalogService.updateDailyInventory(entityId, itemId, date, updates || req.body, tenantId);
      return res.json({ success: true, entry });
    }

    if (startDate && endDate) {
      const entries = catalogService.bulkUpdateInventory(entityId, itemId, startDate, endDate, updates || req.body, tenantId);
      return res.json({ success: true, count: entries.length, entries });
    }

    res.status(400).json({ success: false, message: "Provide either 'date' or ('startDate' and 'endDate')" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function seedStarterKit(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { starterKit } = req.body;
    const result = catalogService.seedStarterKit(req.params.id, starterKit, tenantId);
    res.json({ success: true, message: `Successfully seeded starter kit ${starterKit}`, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function importCatalogCsv(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const csvContent = req.body.csv || (req.file ? req.file.buffer.toString("utf8") : null);
    if (!csvContent) {
      return res.status(400).json({ success: false, message: "No CSV content provided in body.csv or file upload" });
    }

    const result = catalogService.importCatalogCsv(req.params.id, csvContent, tenantId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  listEntities,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  toggle86,
  createVariant,
  deleteVariant,
  getInventoryMatrix,
  updateInventoryMatrix,
  seedStarterKit,
  importCatalogCsv
};

