const catalogService = require("../services/catalogService");
const domainProfileService = require("../services/domainProfileService");
const { db } = require("../config/database");
const { isPlatformAdmin, isWorkspaceAdmin } = require("../middleware/authMiddleware");

/**
 * Shared entity access & tenant isolation guard for catalog endpoints.
 */
function authorizeEntityAccess(req, res, entityId, fallbackTenantId = null) {
  const entity = entityId ? catalogService.getEntityById(entityId) : null;
  if (!entity && fallbackTenantId === null) {
    res.status(404).json({ success: false, message: "Entity not found" });
    return null;
  }
  const ownerTenantId = Number((entity ? entity.tenant_id : fallbackTenantId) || 1);
  const callerTenantId = Number(req.user?.tenant_id || 1);
  if (!isPlatformAdmin(req.user) && ownerTenantId !== callerTenantId) {
    res.status(403).json({ success: false, message: "Cross-tenant access denied." });
    return null;
  }
  if (entity && !isWorkspaceAdmin(req.user) && entity.user_id && entity.user_id !== req.user?.id) {
    res.status(403).json({ success: false, message: "Access denied to this business entity." });
    return null;
  }
  return entity || { tenant_id: ownerTenantId };
}

async function listEntities(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { domain } = req.query;
    const userId = req.user?.id || null;
    const isAdmin = isWorkspaceAdmin(req.user);
    let entities = catalogService.listEntities(tenantId, domain, userId, isAdmin);

    if (!isPlatformAdmin(req.user)) {
      const access = domainProfileService.getTenantDomainAccess(tenantId);
      if (access.hasExplicitDomainConfig) {
        const allowedSet = new Set(access.allowedDomains || []);
        entities = entities.filter((e) => {
          const norm = domainProfileService.normalizeDomainCode(e.domain, e.domain);
          return allowedSet.has(norm) || allowedSet.has(String(e.domain || "").toUpperCase());
        });
      }
    }

    res.json({ success: true, entities });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getEntity(req, res) {
  try {
    const entity = authorizeEntityAccess(req, res, req.params.id);
    if (!entity) return;
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
    if (!authorizeEntityAccess(req, res, req.params.id)) return;
    const entity = catalogService.updateEntity(req.params.id, req.body);
    res.json({ success: true, entity });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteEntity(req, res) {
  try {
    if (!authorizeEntityAccess(req, res, req.params.id)) return;
    const result = catalogService.deleteEntity(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listCategories(req, res) {
  try {
    if (!authorizeEntityAccess(req, res, req.params.id)) return;
    const categories = catalogService.getCategories(req.params.id);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createCategory(req, res) {
  try {
    const entity = authorizeEntityAccess(req, res, req.params.id);
    if (!entity) return;
    const tenantId = Number(entity.tenant_id || req.user?.tenant_id || 1);
    const category = catalogService.createCategory(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateCategory(req, res) {
  try {
    const cat = db.prepare("SELECT id, entity_id, tenant_id FROM catalog_categories WHERE id = ?").get(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
    if (!authorizeEntityAccess(req, res, cat.entity_id, cat.tenant_id)) return;
    const category = catalogService.updateCategory(req.params.id, req.body);
    res.json({ success: true, category });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteCategory(req, res) {
  try {
    const cat = db.prepare("SELECT id, entity_id, tenant_id FROM catalog_categories WHERE id = ?").get(req.params.id);
    if (!cat) return res.status(404).json({ success: false, message: "Category not found" });
    if (!authorizeEntityAccess(req, res, cat.entity_id, cat.tenant_id)) return;
    const result = catalogService.deleteCategory(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listItems(req, res) {
  try {
    if (!authorizeEntityAccess(req, res, req.params.id)) return;
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
    if (!authorizeEntityAccess(req, res, item.entity_id, item.tenant_id)) return;
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function createItem(req, res) {
  try {
    const entity = authorizeEntityAccess(req, res, req.params.id);
    if (!entity) return;
    const tenantId = Number(entity.tenant_id || req.user?.tenant_id || 1);
    const item = catalogService.createItem(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function updateItem(req, res) {
  try {
    const existing = catalogService.getItemById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Item not found" });
    if (!authorizeEntityAccess(req, res, existing.entity_id, existing.tenant_id)) return;
    const item = catalogService.updateItem(req.params.id, req.body);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteItem(req, res) {
  try {
    const existing = catalogService.getItemById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Item not found" });
    if (!authorizeEntityAccess(req, res, existing.entity_id, existing.tenant_id)) return;
    const result = catalogService.deleteItem(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function toggle86(req, res) {
  try {
    const existing = catalogService.getItemById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Item not found" });
    if (!authorizeEntityAccess(req, res, existing.entity_id, existing.tenant_id)) return;
    const { isSoldOutToday } = req.body;
    const result = catalogService.toggleSoldOut(req.params.id, isSoldOutToday !== undefined ? !!isSoldOutToday : null);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function createVariant(req, res) {
  try {
    const existing = catalogService.getItemById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Item not found" });
    if (!authorizeEntityAccess(req, res, existing.entity_id, existing.tenant_id)) return;
    const tenantId = Number(existing.tenant_id || req.user?.tenant_id || 1);
    const variant = catalogService.createVariant(req.params.id, req.body, tenantId);
    res.status(201).json({ success: true, variant });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function deleteVariant(req, res) {
  try {
    const vRow = db.prepare(`
      SELECT ci.entity_id, ci.tenant_id
      FROM catalog_item_variants v
      JOIN catalog_items ci ON ci.id = v.item_id
      WHERE v.id = ?
    `).get(req.params.id);
    if (!vRow) return res.status(404).json({ success: false, message: "Variant not found" });
    if (!authorizeEntityAccess(req, res, vRow.entity_id, vRow.tenant_id)) return;
    const result = catalogService.deleteVariant(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function getInventoryMatrix(req, res) {
  try {
    const { id: entityId, itemId } = req.params;
    if (!authorizeEntityAccess(req, res, entityId)) return;
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
    const { id: entityId, itemId } = req.params;
    const entity = authorizeEntityAccess(req, res, entityId);
    if (!entity) return;
    const tenantId = Number(entity.tenant_id || req.user?.tenant_id || 1);
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
    const entity = authorizeEntityAccess(req, res, req.params.id);
    if (!entity) return;
    const tenantId = Number(entity.tenant_id || req.user?.tenant_id || 1);
    const { starterKit } = req.body;
    const result = catalogService.seedStarterKit(req.params.id, starterKit, tenantId);
    res.json({ success: true, message: `Successfully seeded starter kit ${starterKit}`, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function importCatalogCsv(req, res) {
  try {
    const entity = authorizeEntityAccess(req, res, req.params.id);
    if (!entity) return;
    const tenantId = Number(entity.tenant_id || req.user?.tenant_id || 1);
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

