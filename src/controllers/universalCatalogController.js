const universalCatalogService = require("../services/universal/universalCatalogService");
const universalAvailabilityService = require("../services/universal/universalAvailabilityService");
const universalPricingService = require("../services/universal/universalPricingService");

// 1. ITEMS & GALLERY
async function listItems(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const items = universalCatalogService.listItems(tenantId, req.query);
    return res.json({ success: true, items, count: items.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function getItem(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const item = universalCatalogService.getItemById(tenantId, req.params.id);
    if (!item) return res.status(404).json({ success: false, error: "Item not found" });
    return res.json({ success: true, item });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createItem(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const item = universalCatalogService.createItem(tenantId, req.body, userId);
    return res.status(201).json({ success: true, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateItem(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const item = universalCatalogService.updateItem(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteItem(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const result = universalCatalogService.deleteItem(tenantId, req.params.id, userId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function addMedia(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const media = universalCatalogService.addMedia(tenantId, req.params.id, req.body);
    return res.status(201).json({ success: true, media });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteMedia(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = universalCatalogService.deleteMedia(tenantId, req.params.mediaId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function searchCatalog(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const items = universalCatalogService.searchCatalog(tenantId, req.query);
    return res.json({ success: true, items, count: items.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

// 2. ADD-ON GROUPS & ADD-ONS
async function listAddonGroups(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const groups = universalCatalogService.listAddonGroups(tenantId, req.query);
    return res.json({ success: true, addonGroups: groups });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createAddonGroup(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const group = universalCatalogService.createAddonGroup(tenantId, req.body, userId);
    return res.status(201).json({ success: true, addonGroup: group });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateAddonGroup(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const group = universalCatalogService.updateAddonGroup(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, addonGroup: group });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteAddonGroup(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const result = universalCatalogService.deleteAddonGroup(tenantId, req.params.id, userId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function createAddon(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const addon = universalCatalogService.createAddon(tenantId, req.params.groupId, req.body, userId);
    return res.status(201).json({ success: true, addon });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updateAddon(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const addon = universalCatalogService.updateAddon(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, addon });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deleteAddon(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const result = universalCatalogService.deleteAddon(tenantId, req.params.id, userId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// 3. DYNAMIC PRICING RULES
async function listPricingRules(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const rules = universalCatalogService.listPricingRules(tenantId, req.query);
    return res.json({ success: true, pricingRules: rules });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function createPricingRule(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const rule = universalCatalogService.createPricingRule(tenantId, req.body, userId);
    return res.status(201).json({ success: true, pricingRule: rule });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function updatePricingRule(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const rule = universalCatalogService.updatePricingRule(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, pricingRule: rule });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function deletePricingRule(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const result = universalCatalogService.deletePricingRule(tenantId, req.params.id, userId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// 4. AVAILABILITY, SLOTS & HOLDS
async function checkAvailability(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = universalAvailabilityService.checkAvailability(tenantId, req.query);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function createAvailabilitySlot(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const slot = universalAvailabilityService.createAvailabilitySlot(tenantId, req.body);
    return res.status(201).json({ success: true, slot });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function createHold(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const hold = universalAvailabilityService.createInventoryHold(tenantId, req.body);
    return res.status(201).json(hold);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function confirmHold(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = universalAvailabilityService.confirmHold(tenantId, req.params.token);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

async function releaseHold(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const result = universalAvailabilityService.releaseHold(tenantId, req.params.token);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// 5. QUOTATION PREVIEW
async function calculateQuote(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const quote = universalPricingService.calculateCartQuote(tenantId, req.body);
    return res.json({ success: true, quote });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

// 6. BLUEPRINTS (8 SECTORS)
async function listBlueprints(req, res) {
  try {
    const blueprints = Object.entries(universalCatalogService.SECTOR_BLUEPRINTS).map(([code, bp]) => ({
      code,
      name: bp.sectorName,
      domain: bp.domain,
      entityName: bp.entity.name,
      tagline: bp.entity.tagline,
      itemCount: bp.items.length,
      addonCount: bp.addonGroups.length,
      pricingRuleCount: bp.pricingRules.length,
      itemsPreview: bp.items.map(i => ({ title: i.title, base_price: i.base_price, inventory_mode: i.inventory_mode }))
    }));
    return res.json({ success: true, blueprints });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function seedBlueprint(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "admin";
    const { sectorCode } = req.body;
    const result = universalCatalogService.seedIndustryBlueprint(tenantId, sectorCode, userId);
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  addMedia,
  deleteMedia,
  searchCatalog,
  listAddonGroups,
  createAddonGroup,
  updateAddonGroup,
  deleteAddonGroup,
  createAddon,
  updateAddon,
  deleteAddon,
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  checkAvailability,
  createAvailabilitySlot,
  createHold,
  confirmHold,
  releaseHold,
  calculateQuote,
  listBlueprints,
  seedBlueprint
};
