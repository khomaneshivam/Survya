const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");
const masterDataService = require("../services/masters/masterDataService");

router.use(authenticateToken);

// 1. Get entire bundle of all 9 master collections for tenant
router.get("/bundle", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const bundle = masterDataService.getMasterBundle(tenantId);
    return res.json({ success: true, tenantId, bundle });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. 1-Click Sector Setup Seeder
router.post("/seed-sector", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const sector = req.body?.sector || "HOSPITALITY";
    const result = masterDataService.seedMastersForSector(tenantId, sector, userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Dynamic options preview (for Flow Studio & In-App Field configuration)
router.get("/preview-options", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { masterType, ...criteria } = req.query;
    if (!masterType) {
      return res.status(400).json({ success: false, error: "masterType query parameter is required" });
    }
    const resolved = masterDataService.resolveDynamicMasterOptions(tenantId, masterType, criteria);
    return res.json({ success: true, ...resolved });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. List items for a specific master type
router.get("/:masterType", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { masterType } = req.params;
    const includeInactive = req.query.includeInactive === "true" || req.query.includeInactive === "1";
    const items = masterDataService.listMasters(tenantId, masterType, {
      ...req.query,
      includeInactive
    });
    return res.json({ success: true, masterType, count: items.length, items });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 5. Get single item by ID
router.get("/:masterType/:id", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { masterType, id } = req.params;
    const item = masterDataService.getMasterById(tenantId, masterType, id);
    if (!item) {
      return res.status(404).json({ success: false, error: "Master item not found" });
    }
    return res.json({ success: true, masterType, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Create new master item
router.post("/:masterType", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const { masterType } = req.params;
    const item = masterDataService.createMaster(tenantId, masterType, req.body, userId);
    return res.status(201).json({ success: true, masterType, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 7. Update master item
router.put("/:masterType/:id", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const { masterType, id } = req.params;
    const item = masterDataService.updateMaster(tenantId, masterType, id, req.body, userId);
    return res.json({ success: true, masterType, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Soft-delete master item
router.delete("/:masterType/:id", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const { masterType, id } = req.params;
    const result = masterDataService.softDeleteMaster(tenantId, masterType, id, userId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 9. Toggle active status
router.patch("/:masterType/:id/toggle-active", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const { masterType, id } = req.params;
    const item = masterDataService.toggleActiveStatus(tenantId, masterType, id, userId);
    return res.json({ success: true, masterType, item });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// 10. Reorder master items
router.post("/:masterType/reorder", (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || req.user?.email || "admin";
    const { masterType } = req.params;
    const { orderedIds } = req.body;
    const result = masterDataService.reorderMasters(tenantId, masterType, orderedIds, userId);
    return res.json({ success: true, masterType, ...result });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
