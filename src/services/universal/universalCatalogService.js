const { db } = require("../../config/database");
const crypto = require("crypto");
const metaWhatsAppService = require("../metaWhatsAppService");
const masterCacheService = require("../masters/masterCacheService");

/**
 * Universal Multi-Sector Catalog Service
 * Supports Retail/D2C, Hospitality, Clinics, Restaurants, Salons, Real Estate, Education, and B2B Wholesale.
 */

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// -------------------------------------------------------------
// 1. CATALOG ITEMS CRUD
// -------------------------------------------------------------

function listItems(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT i.*, e.name as entity_name, e.domain as entity_domain,
           mc.name as master_category_name, mc.category_code as master_category_code,
           mu.name as master_unit_name, mu.unit_symbol as master_unit_symbol,
           mt.title as master_tax_slab_title, mt.tax_rate as master_tax_rate,
           ml.name as master_location_name, ml.location_code as master_location_code,
           (SELECT media_url FROM catalog_item_media WHERE catalog_item_id = i.id AND delete_status = 0 ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) as primary_image_url
    FROM catalog_items i
    LEFT JOIN business_entities e ON e.id = i.entity_id
    LEFT JOIN master_categories mc ON mc.id = i.master_category_id AND mc.delete_status = 0
    LEFT JOIN master_units mu ON mu.id = i.master_unit_id AND mu.delete_status = 0
    LEFT JOIN master_tax_slabs mt ON mt.id = i.master_tax_slab_id AND mt.delete_status = 0
    LEFT JOIN master_locations ml ON ml.id = i.master_location_id AND ml.delete_status = 0
    WHERE i.tenant_id = ? AND i.delete_status = 0
  `;
  const params = [numericTenantId];

  if (options.entityId) {
    sql += " AND i.entity_id = ?";
    params.push(options.entityId);
  }

  if (options.masterLocationId || options.locationId) {
    sql += " AND i.master_location_id = ?";
    params.push(options.masterLocationId || options.locationId);
  }

  if (options.masterCategoryId) {
    sql += " AND i.master_category_id = ?";
    params.push(options.masterCategoryId);
  }

  if (options.categoryName) {
    sql += " AND (i.category_name = ? OR mc.name = ?)";
    params.push(options.categoryName, options.categoryName);
  }

  if (options.inventoryMode) {
    sql += " AND i.inventory_mode = ?";
    params.push(options.inventoryMode);
  }

  if (options.itemType) {
    sql += " AND i.item_type = ?";
    params.push(options.itemType);
  }

  if (options.activeOnly !== false) {
    sql += " AND i.is_active = 1";
  }

  if (options.search) {
    sql += " AND (i.title LIKE ? OR i.sku LIKE ? OR i.description LIKE ? OR mc.name LIKE ?)";
    const term = `%${options.search.trim()}%`;
    params.push(term, term, term, term);
  }

  sql += " ORDER BY i.sort_order ASC, i.id ASC";

  if (options.limit) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const offset = Math.max(0, Number(options.offset) || 0);
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);
  }

  const items = db.prepare(sql).all(...params);

  // Parse variants_json for each item
  return items.map(item => {
    let variants = [];
    try {
      variants = typeof item.variants_json === "string" ? JSON.parse(item.variants_json || "[]") : (item.variants_json || []);
    } catch (_) {
      variants = [];
    }
    return {
      ...item,
      variants
    };
  });
}

function getItemById(tenantId = 1, id) {
  const numericTenantId = Number(tenantId) || 1;
  const item = db.prepare(`
    SELECT i.*, e.name as entity_name, e.domain as entity_domain,
           mc.name as master_category_name, mc.category_code as master_category_code,
           mu.name as master_unit_name, mu.unit_symbol as master_unit_symbol,
           mt.title as master_tax_slab_title, mt.tax_rate as master_tax_rate,
           ml.name as master_location_name, ml.location_code as master_location_code
    FROM catalog_items i
    LEFT JOIN business_entities e ON e.id = i.entity_id
    LEFT JOIN master_categories mc ON mc.id = i.master_category_id AND mc.delete_status = 0
    LEFT JOIN master_units mu ON mu.id = i.master_unit_id AND mu.delete_status = 0
    LEFT JOIN master_tax_slabs mt ON mt.id = i.master_tax_slab_id AND mt.delete_status = 0
    LEFT JOIN master_locations ml ON ml.id = i.master_location_id AND ml.delete_status = 0
    WHERE i.tenant_id = ? AND i.id = ? AND i.delete_status = 0
  `).get(numericTenantId, id);

  if (!item) return null;

  // Fetch gallery media
  const media = db.prepare(`
    SELECT * FROM catalog_item_media
    WHERE tenant_id = ? AND catalog_item_id = ? AND delete_status = 0
    ORDER BY is_primary DESC, sort_order ASC, id ASC
  `).all(numericTenantId, id);

  // Fetch linked add-on groups
  const addonGroups = db.prepare(`
    SELECT g.* FROM catalog_addon_groups g
    WHERE g.tenant_id = ? AND g.delete_status = 0
      AND (g.catalog_item_id = ? OR (g.catalog_item_id IS NULL AND (g.master_category_id = ? OR (g.entity_id = ? OR g.entity_id IS NULL))))
    ORDER BY g.sort_order ASC, g.id ASC
  `).all(numericTenantId, id, item.master_category_id || null, item.entity_id || null);

  for (const group of addonGroups) {
    group.addons = db.prepare(`
      SELECT a.*, mt.tax_rate as master_tax_rate, mt.slab_code as master_slab_code
      FROM catalog_addons a
      LEFT JOIN master_tax_slabs mt ON mt.id = a.master_tax_slab_id AND mt.delete_status = 0
      WHERE a.group_id = ? AND a.delete_status = 0 AND a.active_status = 1
      ORDER BY a.sort_order ASC, a.id ASC
    `).all(group.id);
  }

  let variants = [];
  try {
    variants = typeof item.variants_json === "string" ? JSON.parse(item.variants_json || "[]") : (item.variants_json || []);
  } catch (_) {
    variants = [];
  }

  return {
    ...item,
    variants,
    media,
    addon_groups: addonGroups
  };
}

function createItem(tenantId = 1, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  if (!data.title || !String(data.title).trim()) {
    throw new Error("Item title is required.");
  }

  const baseSlug = slugify(data.slug || data.title);
  let finalSlug = baseSlug;
  let counter = 1;
  while (db.prepare("SELECT id FROM catalog_items WHERE tenant_id = ? AND slug = ?").get(numericTenantId, finalSlug)) {
    finalSlug = `${baseSlug}-${counter++}`;
  }

  const inventoryMode = data.inventory_mode || data.inventoryMode || "UNIT_STOCK"; // UNIT_STOCK | DATE_RANGE | TIME_SLOT | QUOTE_SERVICE
  const basePrice = data.base_price !== undefined ? Number(data.base_price) : (data.basePrice !== undefined ? Number(data.basePrice) : 0);
  const compareAtPrice = Number(data.compare_at_price || data.compareAtPrice) > 0 ? Number(data.compare_at_price || data.compareAtPrice) : null;
  const gstPercent = data.gst_percent !== undefined ? Number(data.gst_percent) : (data.gstPercent !== undefined ? Number(data.gstPercent) : 0);
  const stockQty = data.stock_qty !== undefined ? Number(data.stock_qty) : (data.stockQty !== undefined ? Number(data.stockQty) : 0);
  const trackInventory = data.track_inventory !== undefined ? (data.track_inventory ? 1 : 0) : (data.trackInventory !== undefined ? (data.trackInventory ? 1 : 0) : 1);
  const allowRateDiscussion = (data.allow_rate_discussion || data.allowRateDiscussion) ? 1 : 0;
  const autoApproveMinPrice = Number(data.auto_approve_min_price || data.autoApproveMinPrice) > 0 ? Number(data.auto_approve_min_price || data.autoApproveMinPrice) : null;
  const hardFloorPrice = Number(data.hard_floor_price || data.hardFloorPrice) > 0 ? Number(data.hard_floor_price || data.hardFloorPrice) : null;

  const variantsJson = JSON.stringify(data.variants || data.variants_json || []);

  // Resolve or create default business entity if not supplied
  let resolvedEntityId = data.entity_id;
  if (!resolvedEntityId) {
    const existing = db.prepare("SELECT id FROM business_entities WHERE tenant_id = ? AND delete_status = 0 ORDER BY id ASC LIMIT 1").get(numericTenantId);
    if (existing) {
      resolvedEntityId = existing.id;
    } else {
      const baseSlug = slugify(data.title || "Business");
      let finalSlug = baseSlug || "entity";
      let cnt = 1;
      while (db.prepare("SELECT id FROM business_entities WHERE slug = ?").get(finalSlug)) {
        finalSlug = `${baseSlug}-${cnt++}`;
      }
      const ins = db.prepare(`
        INSERT INTO business_entities (
          tenant_id, domain, name, slug, phone_e164, city, status, active_status, delete_status, created_at, updated_at
        ) VALUES (
          ?, 'GENERAL', 'Main Business', ?, '+910000000000', 'Mumbai', 'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
        )
      `).run(numericTenantId, finalSlug);
      resolvedEntityId = ins.lastInsertRowid;
    }
  }

  const stmt = db.prepare(`
    INSERT INTO catalog_items (
      tenant_id, entity_id, item_type, title, slug, sku, description,
      base_price, compare_at_price, gst_percent, currency,
      inventory_mode, category_name, stock_qty, reserved_qty, track_inventory, is_sold_out,
      allow_rate_discussion, auto_approve_min_price, hard_floor_price, variants_json,
      master_category_id, master_unit_id, master_tax_slab_id, master_location_id,
      is_active, active_status, delete_status, sort_order, created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, 0, ?, 0,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      1, 1, 0, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    resolvedEntityId,
    data.item_type || "PRODUCT",
    String(data.title).trim(),
    finalSlug,
    data.sku ? String(data.sku).trim() : null,
    data.description ? String(data.description).trim() : null,
    basePrice,
    compareAtPrice,
    gstPercent,
    data.currency || "INR",
    inventoryMode,
    data.category_name ? String(data.category_name).trim() : null,
    stockQty,
    trackInventory,
    allowRateDiscussion,
    autoApproveMinPrice,
    hardFloorPrice,
    variantsJson,
    data.master_category_id || data.masterCategoryId || null,
    data.master_unit_id || data.masterUnitId || null,
    data.master_tax_slab_id || data.masterTaxSlabId || null,
    data.master_location_id || data.masterLocationId || null,
    Number(data.sort_order) || 0,
    userId,
    userId
  );

  const itemId = info.lastInsertRowid;

  // Invalidate master cache for tenant
  masterCacheService.invalidateTenantMasters(numericTenantId);

  // If initial media items supplied
  if (Array.isArray(data.media) && data.media.length > 0) {
    for (let i = 0; i < data.media.length; i++) {
      const m = data.media[i];
      addMedia(numericTenantId, itemId, {
        media_url: m.media_url || m.url,
        media_type: m.media_type || "IMAGE",
        thumbnail_url: m.thumbnail_url || null,
        caption: m.caption || null,
        is_primary: i === 0 ? 1 : (m.is_primary ? 1 : 0),
        sort_order: i
      });
    }
  }

  return getItemById(numericTenantId, itemId);
}

function updateItem(tenantId = 1, id, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const existing = getItemById(numericTenantId, id);
  if (!existing) {
    throw new Error("Catalog item not found.");
  }

  const updates = [];
  const params = [];

  const allowedFields = [
    "entity_id", "item_type", "title", "sku", "description",
    "base_price", "compare_at_price", "gst_percent", "currency",
    "inventory_mode", "category_name", "stock_qty", "track_inventory",
    "is_sold_out", "allow_rate_discussion", "auto_approve_min_price",
    "hard_floor_price", "is_active", "sort_order",
    "master_category_id", "master_unit_id", "master_tax_slab_id", "master_location_id"
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (data.variants !== undefined || data.variants_json !== undefined) {
    updates.push("variants_json = ?");
    params.push(JSON.stringify(data.variants || data.variants_json || []));
  }

  if (updates.length === 0) return existing;

  updates.push("updated_by = ?", "updated_at = UTC_TIMESTAMP()");
  params.push(userId, numericTenantId, id);

  db.prepare(`
    UPDATE catalog_items
    SET ${updates.join(", ")}
    WHERE tenant_id = ? AND id = ?
  `).run(...params);

  // Invalidate master cache for tenant
  masterCacheService.invalidateTenantMasters(numericTenantId);

  return getItemById(numericTenantId, id);
}

function deleteItem(tenantId = 1, id, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const existing = getItemById(numericTenantId, id);
  if (!existing) {
    throw new Error("Catalog item not found.");
  }

  db.prepare(`
    UPDATE catalog_items
    SET delete_status = 1, active_status = 0, is_active = 0, deleted_at = UTC_TIMESTAMP(), deleted_by = ?
    WHERE tenant_id = ? AND id = ?
  `).run(userId, numericTenantId, id);

  // Invalidate master cache for tenant
  masterCacheService.invalidateTenantMasters(numericTenantId);

  return { success: true, id };
}

/**
 * Fast indexed search for flow studio / customer inquiry
 * Zero N+1 queries: resolves primary image, master category, unit symbol, and tax rate in ONE single query.
 */
function searchCatalog(tenantId = 1, params = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT i.id, i.tenant_id, i.entity_id, i.master_location_id, i.master_category_id,
           i.master_unit_id, i.master_tax_slab_id, i.item_type, i.title, i.slug, i.sku,
           i.short_description, i.description, i.base_price, i.compare_at_price,
           i.gst_percent, i.currency, i.inventory_mode, i.stock_qty, i.reserved_qty,
           i.track_inventory, i.is_sold_out, i.allow_rate_discussion,
           i.auto_approve_min_price, i.hard_floor_price, i.variants_json,
           COALESCE(mc.name, i.category_name) as category_name,
           mc.name as master_category_name,
           mc.category_code,
           mu.name as unit_name,
           mu.name as master_unit_name,
           mu.unit_symbol,
           mu.unit_symbol as master_unit_symbol,
           COALESCE(mt.tax_rate, i.gst_percent) as tax_rate,
           mt.tax_rate as master_tax_rate,
           mt.title as master_tax_slab_title,
           mt.slab_code as tax_slab_code,
           ml.name as location_name,
           ml.name as master_location_name,
           ml.location_code,
           (SELECT media_url FROM catalog_item_media WHERE catalog_item_id = i.id AND delete_status = 0 ORDER BY is_primary DESC, sort_order ASC, id ASC LIMIT 1) as primary_image_url
    FROM catalog_items i
    LEFT JOIN master_categories mc ON mc.id = i.master_category_id AND mc.delete_status = 0
    LEFT JOIN master_units mu ON mu.id = i.master_unit_id AND mu.delete_status = 0
    LEFT JOIN master_tax_slabs mt ON mt.id = i.master_tax_slab_id AND mt.delete_status = 0
    LEFT JOIN master_locations ml ON ml.id = i.master_location_id AND ml.delete_status = 0
    WHERE i.tenant_id = ? AND i.delete_status = 0 AND i.active_status = 1 AND i.is_active = 1
  `;
  const sqlParams = [numericTenantId];

  if (params.masterLocationId || params.locationId) {
    sql += " AND i.master_location_id = ?";
    sqlParams.push(params.masterLocationId || params.locationId);
  }

  if (params.masterCategoryId) {
    sql += " AND i.master_category_id = ?";
    sqlParams.push(params.masterCategoryId);
  }

  const searchQuery = params.search || params.query;
  if (searchQuery && String(searchQuery).trim()) {
    const rawQ = String(searchQuery).trim();
    const q = `%${rawQ}%`;
    const words = rawQ.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length >= 4 && !["have", "want", "need", "like", "tell", "what", "where", "when", "does", "about", "show", "give", "available"].includes(w));
    if (words.length > 0) {
      const wordClauses = words.map(() => "(i.title LIKE ? OR i.sku LIKE ? OR i.description LIKE ?)");
      sql += ` AND ((i.title LIKE ? OR i.sku LIKE ? OR i.description LIKE ? OR i.category_name LIKE ? OR mc.name LIKE ?) OR (${wordClauses.join(" OR ")}))`;
      sqlParams.push(q, q, q, q, q);
      for (const w of words) {
        const wQ = `%${w}%`;
        sqlParams.push(wQ, wQ, wQ);
      }
    } else {
      sql += " AND (i.title LIKE ? OR i.sku LIKE ? OR i.description LIKE ? OR i.category_name LIKE ? OR mc.name LIKE ?)";
      sqlParams.push(q, q, q, q, q);
    }
  }

  if (params.category && String(params.category).trim()) {
    sql += " AND (i.category_name = ? OR mc.name = ? OR mc.category_code = ?)";
    const cat = String(params.category).trim();
    sqlParams.push(cat, cat, cat);
  }

  if (params.inventoryMode) {
    sql += " AND i.inventory_mode = ?";
    sqlParams.push(params.inventoryMode);
  }

  if (params.inStockOnly) {
    sql += " AND (i.track_inventory = 0 OR (i.stock_qty - i.reserved_qty) > 0) AND i.is_sold_out = 0";
  }

  if (params.minPrice !== undefined && params.minPrice !== null && Number(params.minPrice) >= 0) {
    sql += " AND i.base_price >= ?";
    sqlParams.push(Number(params.minPrice));
  }

  if (params.maxPrice !== undefined && params.maxPrice !== null && Number(params.maxPrice) > 0) {
    sql += " AND i.base_price <= ?";
    sqlParams.push(Number(params.maxPrice));
  }

  sql += " ORDER BY i.sort_order ASC, i.id ASC";

  const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
  const offset = Math.max(0, Number(params.offset) || 0);
  sql += " LIMIT ? OFFSET ?";
  sqlParams.push(limit, offset);

  const items = db.prepare(sql).all(...sqlParams);
  return items.map(item => {
    let variants = [];
    try {
      variants = typeof item.variants_json === "string" ? JSON.parse(item.variants_json || "[]") : (item.variants_json || []);
    } catch (_) {
      variants = [];
    }
    return {
      ...item,
      variants
    };
  });
}

// -------------------------------------------------------------
// 2. MEDIA GALLERY & META MEDIA CACHE
// -------------------------------------------------------------

function listMedia(tenantId = 1, itemId) {
  const numericTenantId = Number(tenantId) || 1;
  return db.prepare(`
    SELECT * FROM catalog_item_media
    WHERE tenant_id = ? AND catalog_item_id = ? AND delete_status = 0
    ORDER BY is_primary DESC, sort_order ASC, id ASC
  `).all(numericTenantId, itemId);
}

function addMedia(tenantId = 1, itemId, mediaData = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const mediaUrl = mediaData.media_url || mediaData.image_url;
  if (!mediaUrl) {
    throw new Error("media_url is required.");
  }

  // Reject raw base64 data blobs to prevent DB bloat
  if (mediaUrl.startsWith("data:") || mediaUrl.includes(";base64,")) {
    throw new Error("Base64 image blobs are not permitted in database. Please upload media to storage and supply a URL.");
  }

  // Validate upload size <= 2MB (2048 KB)
  if (mediaData.file_size_kb && Number(mediaData.file_size_kb) > 2048) {
    throw new Error("Media file size exceeds maximum permitted limit of 2MB (2048 KB).");
  }

  const isPrimary = mediaData.is_primary ? 1 : 0;
  if (isPrimary) {
    // unset other primaries
    db.prepare(`
      UPDATE catalog_item_media SET is_primary = 0 WHERE tenant_id = ? AND catalog_item_id = ?
    `).run(numericTenantId, itemId);
  }

  const sortOrder = Number(mediaData.sort_order ?? mediaData.display_order ?? 0) || 0;
  const fileSizeKb = mediaData.file_size_kb ? Number(mediaData.file_size_kb) : null;

  const stmt = db.prepare(`
    INSERT INTO catalog_item_media (
      tenant_id, catalog_item_id, media_type, media_url, image_url, thumbnail_url,
      caption, is_primary, sort_order, display_order, meta_media_id, meta_media_expires_at,
      file_size_kb, active_status, delete_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    itemId,
    mediaData.media_type || "IMAGE",
    mediaUrl.trim(),
    mediaUrl.trim(),
    mediaData.thumbnail_url || null,
    mediaData.caption || null,
    isPrimary,
    sortOrder,
    sortOrder,
    mediaData.meta_media_id || null,
    mediaData.meta_media_expires_at || null,
    fileSizeKb
  );

  return db.prepare("SELECT * FROM catalog_item_media WHERE id = ?").get(info.lastInsertRowid);
}

function reorderMedia(tenantId = 1, itemId, mediaIds = []) {
  const numericTenantId = Number(tenantId) || 1;
  if (!Array.isArray(mediaIds)) return listMedia(numericTenantId, itemId);

  for (let idx = 0; idx < mediaIds.length; idx++) {
    db.prepare(`
      UPDATE catalog_item_media
      SET sort_order = ?, display_order = ?, updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND catalog_item_id = ? AND id = ?
    `).run(idx, idx, numericTenantId, itemId, mediaIds[idx]);
  }
  return listMedia(numericTenantId, itemId);
}

function setPrimaryMedia(tenantId = 1, itemId, mediaId) {
  const numericTenantId = Number(tenantId) || 1;
  db.prepare(`
    UPDATE catalog_item_media
    SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END, updated_at = UTC_TIMESTAMP()
    WHERE tenant_id = ? AND catalog_item_id = ?
  `).run(mediaId, numericTenantId, itemId);
  return listMedia(numericTenantId, itemId);
}

function deleteMedia(tenantId = 1, mediaId) {
  const numericTenantId = Number(tenantId) || 1;
  db.prepare(`
    UPDATE catalog_item_media
    SET delete_status = 1, active_status = 0, deleted_at = UTC_TIMESTAMP()
    WHERE tenant_id = ? AND id = ?
  `).run(numericTenantId, mediaId);
  return { success: true, id: mediaId };
}

/**
 * Checks cached Meta Media ID; if missing or expired (> 30 days), uploads to Meta (or sandbox stub) and caches.
 */
async function getOrUploadMetaMediaId(tenantId = 1, mediaId, phoneNumberId = null) {
  const numericTenantId = Number(tenantId) || 1;
  const media = db.prepare(`
    SELECT * FROM catalog_item_media
    WHERE tenant_id = ? AND id = ? AND delete_status = 0
  `).get(numericTenantId, mediaId);

  if (!media) return null;

  // Check valid cache: meta_media_expires_at > UTC_TIMESTAMP()
  const validCache = db.prepare(`
    SELECT meta_media_id FROM catalog_item_media
    WHERE id = ? AND meta_media_id IS NOT NULL AND (meta_media_expires_at IS NULL OR meta_media_expires_at > UTC_TIMESTAMP())
  `).get(mediaId);

  if (validCache?.meta_media_id) {
    return validCache.meta_media_id;
  }

  // Upload or sandbox stub
  let metaMediaId = null;
  try {
    if (metaWhatsAppService && typeof metaWhatsAppService.uploadMedia === "function") {
      const uploadRes = await metaWhatsAppService.uploadMedia({
        mediaUrl: media.media_url,
        mediaType: media.media_type || "image/jpeg",
        phoneNumberId
      });
      metaMediaId = uploadRes?.mediaId || uploadRes?.id;
    }
  } catch (err) {
    console.warn(`[UniversalCatalog] Meta media upload failed for media #${mediaId}, using sandbox stub:`, err.message);
  }

  if (!metaMediaId) {
    metaMediaId = `meta_media_mock_${crypto.randomBytes(8).toString("hex")}`;
  }

  // Cache for 30 days
  db.prepare(`
    UPDATE catalog_item_media
    SET meta_media_id = ?,
        meta_media_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY),
        updated_at = UTC_TIMESTAMP()
    WHERE id = ?
  `).run(metaMediaId, mediaId);

  return metaMediaId;
}

// -------------------------------------------------------------
// 3. ADD-ON GROUPS & ADD-ONS CRUD
// -------------------------------------------------------------

function listAddonGroups(tenantId = 1, filter = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT g.*, mc.name as master_category_name
    FROM catalog_addon_groups g
    LEFT JOIN master_categories mc ON mc.id = g.master_category_id AND mc.delete_status = 0
    WHERE g.tenant_id = ? AND g.delete_status = 0
  `;
  const params = [numericTenantId];

  if (filter.itemId) {
    sql += " AND (g.catalog_item_id = ? OR g.catalog_item_id IS NULL)";
    params.push(filter.itemId);
  }
  if (filter.masterCategoryId) {
    sql += " AND (g.master_category_id = ? OR g.master_category_id IS NULL)";
    params.push(filter.masterCategoryId);
  }
  if (filter.entityId) {
    sql += " AND (g.entity_id = ? OR g.entity_id IS NULL)";
    params.push(filter.entityId);
  }

  sql += " ORDER BY g.sort_order ASC, g.id ASC";
  const groups = db.prepare(sql).all(...params);

  for (const g of groups) {
    g.addons = db.prepare(`
      SELECT a.*, mt.tax_rate as master_tax_rate, mt.slab_code as master_slab_code
      FROM catalog_addons a
      LEFT JOIN master_tax_slabs mt ON mt.id = a.master_tax_slab_id AND mt.delete_status = 0
      WHERE a.group_id = ? AND a.delete_status = 0 AND a.active_status = 1
      ORDER BY a.sort_order ASC, a.id ASC
    `).all(g.id);
  }

  return groups;
}

function getApplicableAddons(tenantId = 1, itemId = null, masterCategoryId = null) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT g.*, mc.name as master_category_name
    FROM catalog_addon_groups g
    LEFT JOIN master_categories mc ON mc.id = g.master_category_id AND mc.delete_status = 0
    WHERE g.tenant_id = ? AND g.delete_status = 0 AND g.active_status = 1
  `;
  const params = [numericTenantId];

  const orConditions = [];
  if (itemId) {
    orConditions.push("g.catalog_item_id = ?");
    params.push(itemId);
  }
  if (masterCategoryId) {
    orConditions.push("g.master_category_id = ?");
    params.push(masterCategoryId);
  }
  orConditions.push("(g.catalog_item_id IS NULL AND g.master_category_id IS NULL)");

  sql += ` AND (${orConditions.join(" OR ")}) ORDER BY g.sort_order ASC, g.id ASC`;

  const groups = db.prepare(sql).all(...params);
  for (const group of groups) {
    group.addons = db.prepare(`
      SELECT a.*, mt.tax_rate as master_tax_rate, mt.slab_code as master_slab_code
      FROM catalog_addons a
      LEFT JOIN master_tax_slabs mt ON mt.id = a.master_tax_slab_id AND mt.delete_status = 0
      WHERE a.group_id = ? AND a.delete_status = 0 AND a.active_status = 1 AND a.is_available = 1
      ORDER BY a.sort_order ASC, a.id ASC
    `).all(group.id);
  }
  return groups;
}

function createAddonGroup(tenantId = 1, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const groupTitle = String(data.title || data.name || "").trim();
  if (!groupTitle) throw new Error("Add-on group title is required.");

  const code = data.code || slugify(groupTitle).toUpperCase();
  const sortOrder = Number(data.sort_order ?? data.display_order ?? 0) || 0;
  const stmt = db.prepare(`
    INSERT INTO catalog_addon_groups (
      tenant_id, entity_id, catalog_item_id, master_category_id, name, title, code, description,
      selection_type, min_select, max_select, is_required, sort_order, display_order,
      active_status, delete_status, created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      1, 0, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    data.entity_id || null,
    data.catalog_item_id || null,
    data.master_category_id || null,
    groupTitle,
    groupTitle,
    code,
    data.description || null,
    data.selection_type || "MULTIPLE", // SINGLE | MULTIPLE
    Number(data.min_select) || 0,
    Number(data.max_select) || 10,
    data.is_required ? 1 : 0,
    sortOrder,
    sortOrder,
    userId,
    userId
  );

  const groupId = info.lastInsertRowid;

  if (Array.isArray(data.addons)) {
    for (let i = 0; i < data.addons.length; i++) {
      createAddon(numericTenantId, groupId, { ...data.addons[i], sort_order: i }, userId);
    }
  }

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return listAddonGroups(numericTenantId).find(g => g.id === groupId);
}

function updateAddonGroup(tenantId = 1, id, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const updates = [];
  const params = [];

  const allowed = ["title", "name", "code", "description", "selection_type", "min_select", "max_select", "is_required", "sort_order", "active_status", "master_category_id", "catalog_item_id"];
  for (const f of allowed) {
    if (data[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(data[f]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_by = ?", "updated_at = UTC_TIMESTAMP()");
    params.push(userId, numericTenantId, id);
    db.prepare(`UPDATE catalog_addon_groups SET ${updates.join(", ")} WHERE tenant_id = ? AND id = ?`).run(...params);
  }

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return listAddonGroups(numericTenantId).find(g => g.id === Number(id));
}

function deleteAddonGroup(tenantId = 1, id, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  db.prepare(`
    UPDATE catalog_addon_groups
    SET delete_status = 1, active_status = 0, deleted_at = UTC_TIMESTAMP(), deleted_by = ?
    WHERE tenant_id = ? AND id = ?
  `).run(userId, numericTenantId, id);

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return { success: true, id };
}

function createAddon(tenantId = 1, groupIdOrData, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  let groupId = groupIdOrData;
  let payload = data;
  let author = userId;
  if (typeof groupIdOrData === "object" && groupIdOrData !== null) {
    payload = groupIdOrData;
    groupId = payload.group_id || payload.groupId;
    author = typeof data === "string" ? data : "system";
  }
  if (!payload.name) throw new Error("Add-on name is required.");

  const sortOrder = Number(payload.sort_order ?? payload.display_order ?? 0) || 0;
  const stmt = db.prepare(`
    INSERT INTO catalog_addons (
      tenant_id, group_id, master_tax_slab_id, name, description, price_mode, price,
      is_default, max_quantity, gst_percent, sort_order, display_order, active_status, delete_status,
      created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 1, 0,
      ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    groupId,
    payload.master_tax_slab_id || null,
    String(payload.name).trim(),
    payload.description || null,
    payload.price_mode || "FIXED", // FIXED | PER_UNIT | PER_NIGHT_OR_SLOT | PERCENTAGE
    Number(payload.price) >= 0 ? Number(payload.price) : 0,
    payload.is_default ? 1 : 0,
    Number(payload.max_quantity) || 1,
    Number(payload.gst_percent) >= 0 ? Number(payload.gst_percent) : 0,
    sortOrder,
    sortOrder,
    author,
    author
  );

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return db.prepare("SELECT * FROM catalog_addons WHERE id = ?").get(info.lastInsertRowid);
}

function updateAddon(tenantId = 1, id, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const updates = [];
  const params = [];

  const allowed = ["name", "description", "price_mode", "price", "is_default", "max_quantity", "gst_percent", "sort_order", "active_status", "master_tax_slab_id"];
  for (const f of allowed) {
    if (data[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(data[f]);
    }
  }

  if (updates.length > 0) {
    updates.push("updated_by = ?", "updated_at = UTC_TIMESTAMP()");
    params.push(userId, numericTenantId, id);
    db.prepare(`UPDATE catalog_addons SET ${updates.join(", ")} WHERE tenant_id = ? AND id = ?`).run(...params);
  }

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return db.prepare("SELECT * FROM catalog_addons WHERE id = ?").get(id);
}

function deleteAddon(tenantId = 1, id, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  db.prepare(`
    UPDATE catalog_addons
    SET delete_status = 1, active_status = 0, deleted_at = UTC_TIMESTAMP(), deleted_by = ?
    WHERE tenant_id = ? AND id = ?
  `).run(userId, numericTenantId, id);

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return { success: true, id };
}

// -------------------------------------------------------------
// 4. DYNAMIC PRICING RULES CRUD
// -------------------------------------------------------------

function listPricingRules(tenantId = 1, filter = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT r.*, mc.name as master_category_name
    FROM catalog_pricing_rules r
    LEFT JOIN master_categories mc ON mc.id = r.master_category_id AND mc.delete_status = 0
    WHERE r.tenant_id = ? AND r.delete_status = 0
  `;
  const params = [numericTenantId];

  if (filter.itemId) {
    sql += " AND (r.catalog_item_id = ? OR r.catalog_item_id IS NULL)";
    params.push(filter.itemId);
  }

  if (filter.masterCategoryId) {
    sql += " AND (r.master_category_id = ? OR r.master_category_id IS NULL)";
    params.push(filter.masterCategoryId);
  }

  if (filter.ruleType) {
    sql += " AND r.rule_type = ?";
    params.push(filter.ruleType);
  }

  if (filter.activeOnly !== false) {
    sql += " AND r.is_active = 1";
  }

  sql += " ORDER BY r.priority DESC, r.id ASC";
  const rules = db.prepare(sql).all(...params);

  return rules.map(r => {
    let criteria = {};
    try {
      criteria = typeof r.criteria_json === "string" ? JSON.parse(r.criteria_json || "{}") : (r.criteria_json || {});
    } catch (_) {}
    return { ...r, criteria };
  });
}

function createPricingRule(tenantId = 1, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const ruleTitle = String(data.title || data.name || "").trim();
  if (!ruleTitle) throw new Error("Pricing rule title is required.");

  const discountMode = data.discount_mode || data.adjustment_type || "PERCENTAGE";
  const discountVal = Number(data.discount_value ?? data.adjustment_value ?? 0) >= 0 ? Number(data.discount_value ?? data.adjustment_value ?? 0) : 0;
  const startDate = data.start_date || data.date_from || null;
  const endDate = data.end_date || data.date_to || null;
  const itemId = data.catalog_item_id || data.applies_to_item_id || null;

  const stmt = db.prepare(`
    INSERT INTO catalog_pricing_rules (
      tenant_id, entity_id, catalog_item_id, master_category_id, applies_to_item_id, rule_type, name, title,
      discount_mode, adjustment_type, discount_value, adjustment_value, criteria_json,
      start_date, date_from, end_date, date_to, promo_code, priority, is_active,
      active_status, delete_status, created_by, updated_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, 1,
      1, 0, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    data.entity_id || null,
    itemId,
    data.master_category_id || null,
    itemId,
    data.rule_type || "PROMO_CODE", // BULK_TIER | WEEKEND_SURGE | SEASONAL | PROMO_CODE
    ruleTitle,
    ruleTitle,
    discountMode,
    discountMode,
    discountVal,
    discountVal,
    JSON.stringify(data.criteria || data.criteria_json || {}),
    startDate,
    startDate,
    endDate,
    endDate,
    data.promo_code ? String(data.promo_code).trim().toUpperCase() : null,
    Number(data.priority) || 10,
    userId,
    userId
  );

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return listPricingRules(numericTenantId).find(r => r.id === info.lastInsertRowid);
}

function updatePricingRule(tenantId = 1, id, data = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const updates = [];
  const params = [];

  const allowed = [
    "title", "name", "rule_type", "discount_mode", "discount_value",
    "start_date", "end_date", "promo_code", "priority", "is_active",
    "catalog_item_id", "master_category_id"
  ];
  for (const f of allowed) {
    if (data[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(data[f]);
    }
  }

  if (data.criteria !== undefined || data.criteria_json !== undefined) {
    updates.push("criteria_json = ?");
    params.push(JSON.stringify(data.criteria || data.criteria_json || {}));
  }

  if (updates.length > 0) {
    updates.push("updated_by = ?", "updated_at = UTC_TIMESTAMP()");
    params.push(userId, numericTenantId, id);
    db.prepare(`UPDATE catalog_pricing_rules SET ${updates.join(", ")} WHERE tenant_id = ? AND id = ?`).run(...params);
  }

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return listPricingRules(numericTenantId).find(r => r.id === Number(id));
}

function deletePricingRule(tenantId = 1, id, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  db.prepare(`
    UPDATE catalog_pricing_rules
    SET delete_status = 1, active_status = 0, is_active = 0, deleted_at = UTC_TIMESTAMP(), deleted_by = ?
    WHERE tenant_id = ? AND id = ?
  `).run(userId, numericTenantId, id);

  masterCacheService.invalidateTenantMasters(numericTenantId);
  return { success: true, id };
}

// -------------------------------------------------------------
// 5. INDUSTRY BLUEPRINT SEEDER (8 SECTORS)
// -------------------------------------------------------------

const SECTOR_BLUEPRINTS = {
  HOSPITALITY: {
    sectorName: "Hospitality & Resorts",
    domain: "HOSPITALITY",
    entity: {
      name: "Azure Bay Luxury Villa & Resort",
      tagline: "Ultra-luxury oceanfront cottages and beach villas",
      description: "Private beach resort in Alibaug featuring infinity pool, candlelight dining, and curated wellness.",
      phone_e164: "+919820011223",
      city: "Alibaug",
      state: "Maharashtra",
      currency: "INR"
    },
    items: [
      {
        title: "Oceanfront Private Pool Villa",
        item_type: "ROOM",
        inventory_mode: "DATE_RANGE",
        category_name: "Villas",
        base_price: 14500,
        compare_at_price: 18000,
        gst_percent: 18,
        description: "1,200 sq ft private villa with plunge pool, King bed, sea-view deck, and private butler service.",
        stock_qty: 4,
        allow_rate_discussion: 1,
        auto_approve_min_price: 13000,
        hard_floor_price: 11500,
        media: [
          { media_url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Garden Jacuzzi Cottage",
        item_type: "ROOM",
        inventory_mode: "DATE_RANGE",
        category_name: "Cottages",
        base_price: 8500,
        compare_at_price: 11000,
        gst_percent: 12,
        description: "Cozy cottage amidst coconut groves with private open-air jacuzzi, rain shower, and veranda.",
        stock_qty: 8,
        allow_rate_discussion: 1,
        auto_approve_min_price: 7800,
        hard_floor_price: 7000,
        media: [
          { media_url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Deluxe Sea-Breeze Suite",
        item_type: "ROOM",
        inventory_mode: "DATE_RANGE",
        category_name: "Suites",
        base_price: 6200,
        compare_at_price: 7500,
        gst_percent: 12,
        description: "Contemporary suite with panoramic balcony views, bathtub, and breakfast buffet included.",
        stock_qty: 12,
        allow_rate_discussion: 0,
        media: [
          { media_url: "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Resort Experiences & Add-Ons",
        code: "HOSP_EXPERIENCE",
        selection_type: "MULTIPLE",
        addons: [
          { name: "Candlelight Beach Dinner Setup", price_mode: "FIXED", price: 3500, gst_percent: 18, is_default: 0 },
          { name: "Chauffeured Airport Transfer (Sedan)", price_mode: "FIXED", price: 2800, gst_percent: 18, is_default: 0 },
          { name: "Extra Luxury Rollaway Bed with Linen", price_mode: "PER_NIGHT_OR_SLOT", price: 1500, gst_percent: 12, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Weekend Demand Surge (Fri-Sat)",
        rule_type: "WEEKEND_SURGE",
        discount_mode: "PERCENTAGE",
        discount_value: -15, // surge +15%
        criteria: { days: ["FRIDAY", "SATURDAY"] },
        priority: 20
      },
      {
        title: "Early Bird 10% Off",
        rule_type: "PROMO_CODE",
        discount_mode: "PERCENTAGE",
        discount_value: 10,
        promo_code: "EARLYBIRD10",
        priority: 50
      }
    ],
    flow: {
      name: "Azure Bay Villa & Resort Instant WhatsApp Booking",
      triggerKeywords: ["hi", "resort", "stay", "book", "villa", "rates", "cottage"]
    }
  },

  RETAIL_ECOM: {
    sectorName: "Retail & D2C E-Commerce",
    domain: "RETAIL_ECOM",
    entity: {
      name: "Urban Threads Apparel & Streetwear",
      tagline: "Premium heavyweight organic cotton streetwear",
      description: "Direct-to-consumer apparel brand crafted with 380 GSM French Terry cotton.",
      phone_e164: "+919811122233",
      city: "Bengaluru",
      state: "Karnataka",
      currency: "INR"
    },
    items: [
      {
        title: "Vintage Heavyweight Boxy Hoodie",
        item_type: "PRODUCT",
        inventory_mode: "UNIT_STOCK",
        category_name: "Hoodies",
        base_price: 2499,
        compare_at_price: 3499,
        gst_percent: 12,
        description: "420 GSM pre-shrunk French terry with double-needle drop shoulder cut and distressed cuffs.",
        stock_qty: 85,
        variants: [
          { sku: "HOD-OVS-BLK-S", name: "S / Washed Black", price: 2499, stock: 25 },
          { sku: "HOD-OVS-BLK-M", name: "M / Washed Black", price: 2499, stock: 35 },
          { sku: "HOD-OVS-BLK-L", name: "L / Washed Black", price: 2499, stock: 25 }
        ],
        media: [
          { media_url: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Raw Selvedge Denim Jacket",
        item_type: "PRODUCT",
        inventory_mode: "UNIT_STOCK",
        category_name: "Jackets",
        base_price: 3999,
        compare_at_price: 4999,
        gst_percent: 12,
        description: "14oz Japanese shuttle loom selvedge denim with antique brass buttons.",
        stock_qty: 40,
        media: [
          { media_url: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Relaxed Linen Cuban Shirt",
        item_type: "PRODUCT",
        inventory_mode: "UNIT_STOCK",
        category_name: "Shirts",
        base_price: 1899,
        compare_at_price: 2299,
        gst_percent: 12,
        description: "100% pure European linen, garment-washed for ultra-soft handfeel.",
        stock_qty: 60,
        media: [
          { media_url: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Packaging & Delivery Upgrades",
        code: "ECOM_PACKAGING",
        selection_type: "MULTIPLE",
        addons: [
          { name: "Premium Gift Box & Handwritten Card", price_mode: "FIXED", price: 199, gst_percent: 18, is_default: 0 },
          { name: "Express Air Shipping (Next-Day Delivery)", price_mode: "FIXED", price: 250, gst_percent: 18, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Buy 2 Get 15% Off (Bulk Tier)",
        rule_type: "BULK_TIER",
        discount_mode: "PERCENTAGE",
        discount_value: 15,
        criteria: { minQuantity: 2 },
        priority: 20
      },
      {
        title: "First Order Promo",
        rule_type: "PROMO_CODE",
        discount_mode: "PERCENTAGE",
        discount_value: 10,
        promo_code: "STREET10",
        priority: 50
      }
    ],
    flow: {
      name: "Urban Threads WhatsApp Catalog & Instant Order Flow",
      triggerKeywords: ["shop", "catalog", "hoodie", "order", "clothes", "store", "buy"]
    }
  },

  CLINIC_HEALTH: {
    sectorName: "Clinics & Healthcare",
    domain: "CLINIC_HEALTH",
    entity: {
      name: "Apex Smile Dental & Implant Clinic",
      tagline: "Painless laser dentistry and advanced smile makeovers",
      description: "ISO-certified dental clinic with digital smile design, 3D CBCT imaging, and pain-free treatments.",
      phone_e164: "+919833445566",
      city: "Mumbai",
      state: "Maharashtra",
      currency: "INR"
    },
    items: [
      {
        title: "Comprehensive Dental Checkup & Digital Scan",
        item_type: "SERVICE",
        inventory_mode: "TIME_SLOT",
        category_name: "Consultations",
        base_price: 500,
        compare_at_price: 1000,
        gst_percent: 0,
        description: "Full oral evaluation with intraoral camera scan, teeth mapping, and customized treatment plan.",
        stock_qty: 24,
        media: [
          { media_url: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Laser Teeth Whitening (1-Hour In-Clinic)",
        item_type: "SERVICE",
        inventory_mode: "TIME_SLOT",
        category_name: "Cosmetic",
        base_price: 6500,
        compare_at_price: 8500,
        gst_percent: 18,
        description: "Philips Zoom laser teeth whitening that brightens teeth up to 8 shades in a single 60-minute session.",
        stock_qty: 8,
        media: [
          { media_url: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Deep Scaling & Ultrasonic Polishing",
        item_type: "SERVICE",
        inventory_mode: "TIME_SLOT",
        category_name: "Preventive",
        base_price: 1800,
        compare_at_price: 2400,
        gst_percent: 0,
        description: "Complete calculus removal, stain lifting, and fluoride application for healthy gums and fresh breath.",
        stock_qty: 16,
        media: [
          { media_url: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Preventive Dental Upgrades",
        code: "DENTAL_UPGRADE",
        selection_type: "MULTIPLE",
        addons: [
          { name: "Full-Mouth Digital OPG X-Ray", price_mode: "FIXED", price: 800, gst_percent: 0, is_default: 0 },
          { name: "Enamel Fluoride Shield Treatment", price_mode: "FIXED", price: 600, gst_percent: 0, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Senior Citizen Wellness 15% Off",
        rule_type: "PROMO_CODE",
        discount_mode: "PERCENTAGE",
        discount_value: 15,
        promo_code: "SENIOR15",
        priority: 50
      }
    ],
    flow: {
      name: "Apex Dental Appointment & Slot Booking Flow",
      triggerKeywords: ["doctor", "dental", "appointment", "clinic", "teeth", "consult", "smile"]
    }
  },

  RESTAURANT_FOOD: {
    sectorName: "Restaurants & Cloud Kitchens",
    domain: "RESTAURANT_FOOD",
    entity: {
      name: "Rustico Artisanal Woodfired Pizza & Cafe",
      tagline: "Authentic sourdough Neapolitan pizzas and Italian small plates",
      description: "Naturally fermented sourdough pizzas baked at 450°C in a woodfired stone oven.",
      phone_e164: "+919844556677",
      city: "Pune",
      state: "Maharashtra",
      currency: "INR"
    },
    items: [
      {
        title: "Truffle Burrata Margherita Pizza (11-inch)",
        item_type: "FOOD",
        inventory_mode: "UNIT_STOCK",
        category_name: "Pizzas",
        base_price: 685,
        compare_at_price: 750,
        gst_percent: 5,
        description: "San Marzano tomato sauce, fresh creamy burrata, black truffle oil, and basil on 48h sourdough crust.",
        stock_qty: 50,
        media: [
          { media_url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Smoked Chicken & Hot Honey Pizza (11-inch)",
        item_type: "FOOD",
        inventory_mode: "UNIT_STOCK",
        category_name: "Pizzas",
        base_price: 625,
        compare_at_price: 695,
        gst_percent: 5,
        description: "Oak-smoked chicken, spicy calabrian chilli flakes, fior di latte mozzarella, and artisanal hot honey drizzle.",
        stock_qty: 40,
        media: [
          { media_url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Cold Brew Tiramisu with Mascarpone",
        item_type: "FOOD",
        inventory_mode: "UNIT_STOCK",
        category_name: "Desserts",
        base_price: 340,
        compare_at_price: 380,
        gst_percent: 5,
        description: "Espresso savoiardi biscuits dipped in house cold brew, layered with Italian mascarpone and dark cocoa.",
        stock_qty: 30,
        media: [
          { media_url: "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Crust & Topping Add-Ons",
        code: "PIZZA_ADDONS",
        selection_type: "MULTIPLE",
        addons: [
          { name: "Extra Fior di Latte Mozzarella", price_mode: "FIXED", price: 90, gst_percent: 5, is_default: 0 },
          { name: "Spicy Garlic Herb Dip (2 oz)", price_mode: "FIXED", price: 60, gst_percent: 5, is_default: 0 },
          { name: "Gluten-Free Almond Crust Upgrade", price_mode: "FIXED", price: 120, gst_percent: 5, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Flat ₹100 Off on Orders Above ₹1000",
        rule_type: "PROMO_CODE",
        discount_mode: "FIXED_AMOUNT",
        discount_value: 100,
        promo_code: "RUSTICO100",
        criteria: { minTotal: 1000 },
        priority: 40
      }
    ],
    flow: {
      name: "Rustico WhatsApp Food Ordering & Delivery Flow",
      triggerKeywords: ["menu", "food", "order", "pizza", "hungry", "eat", "cafe"]
    }
  },

  SALON_WELLNESS: {
    sectorName: "Salons & Wellness Spas",
    domain: "SALON_WELLNESS",
    entity: {
      name: "Serenity Luxe Spa & Salon Studio",
      tagline: "Holistic organic spa therapies and signature hair styling",
      description: "Premier beauty and wellness sanctuary offering rejuvenating balinese massages and skincare.",
      phone_e164: "+919877889900",
      city: "Goa",
      state: "Goa",
      currency: "INR"
    },
    items: [
      {
        title: "Traditional Balinese Deep Tissue Massage (60 Min)",
        item_type: "SERVICE",
        inventory_mode: "TIME_SLOT",
        category_name: "Body Therapies",
        base_price: 2800,
        compare_at_price: 3500,
        gst_percent: 18,
        description: "A blend of acupressure, gentle stretching, and pure coconut essential oils to release deep muscle knots.",
        stock_qty: 12,
        media: [
          { media_url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800", is_primary: 1 }
        ]
      },
      {
        title: "HydraFacial Skin Rejuvenation Glow (45 Min)",
        item_type: "SERVICE",
        inventory_mode: "TIME_SLOT",
        category_name: "Facials",
        base_price: 3400,
        compare_at_price: 4200,
        gst_percent: 18,
        description: "3-step vortex exfoliation, deep pore suction, and antioxidant peptide serum infusion for instant radiant glow.",
        stock_qty: 10,
        media: [
          { media_url: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Spa Enhancement Add-Ons",
        code: "SPA_ADDONS",
        selection_type: "MULTIPLE",
        addons: [
          { name: "Warm Lavender Foot Reflexology (15 Min)", price_mode: "FIXED", price: 600, gst_percent: 18, is_default: 0 },
          { name: "Organic Moroccan Argan Hair Spa Mask", price_mode: "FIXED", price: 950, gst_percent: 18, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Weekday Relaxation 20% Off (Mon-Thu)",
        rule_type: "PROMO_CODE",
        discount_mode: "PERCENTAGE",
        discount_value: 20,
        promo_code: "WEEKDAY20",
        priority: 50
      }
    ],
    flow: {
      name: "Serenity Spa WhatsApp Appointment Booking Flow",
      triggerKeywords: ["spa", "massage", "salon", "facial", "relax", "hair", "treatment"]
    }
  },

  REAL_ESTATE: {
    sectorName: "Real Estate & Living",
    domain: "REAL_ESTATE",
    entity: {
      name: "Skyline Horizon Realty & Estates",
      tagline: "Exclusive high-rise penthouses and gated golf villas",
      description: "Premier real estate development showcasing smart homes with panoramic skyline and golf course views.",
      phone_e164: "+919866554433",
      city: "Gurugram",
      state: "Haryana",
      currency: "INR"
    },
    items: [
      {
        title: "4 BHK Luxury Golf Vista Penthouse",
        item_type: "REALTY",
        inventory_mode: "QUOTE_SERVICE",
        category_name: "Penthouses",
        base_price: 38500000,
        compare_at_price: 42000000,
        gst_percent: 5,
        description: "4,600 sq ft duplex penthouse with private sky deck, home automation, Italian marble, and 3 reserved parking bays.",
        stock_qty: 2,
        allow_rate_discussion: 1,
        auto_approve_min_price: 36000000,
        hard_floor_price: 34000000,
        media: [
          { media_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800", is_primary: 1 }
        ]
      },
      {
        title: "3 BHK Premium Smart Residence",
        item_type: "REALTY",
        inventory_mode: "QUOTE_SERVICE",
        category_name: "Apartments",
        base_price: 19500000,
        compare_at_price: 21500000,
        gst_percent: 5,
        description: "2,350 sq ft 3 BHK with wraparound balcony, modular kitchen, EV charger, and clubhouse membership.",
        stock_qty: 6,
        allow_rate_discussion: 1,
        media: [
          { media_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [],
    pricingRules: [],
    flow: {
      name: "Skyline Horizon WhatsApp Property Tour & Brochure Flow",
      triggerKeywords: ["property", "flat", "apartment", "penthouse", "real estate", "visit", "brochure", "site visit"]
    }
  },

  EDUCATION_COACHING: {
    sectorName: "Education & Coaching Academies",
    domain: "EDUCATION_COACHING",
    entity: {
      name: "NextGen Tech Institute & Code Academy",
      tagline: "Industry-led full stack, AI engineering and cloud bootcamps",
      description: "Mentored bootcamps with 100% live projects, code reviews, and placement assistance.",
      phone_e164: "+919855443322",
      city: "Hyderabad",
      state: "Telangana",
      currency: "INR"
    },
    items: [
      {
        title: "Generative AI & Agentic Systems Bootcamp (16 Weeks)",
        item_type: "COURSE",
        inventory_mode: "UNIT_STOCK",
        category_name: "Bootcamps",
        base_price: 34999,
        compare_at_price: 49999,
        gst_percent: 18,
        description: "Hands-on mastery of LangChain, LlamaIndex, MCP servers, multi-agent swarms, and fine-tuning with GPU access.",
        stock_qty: 30,
        allow_rate_discussion: 1,
        auto_approve_min_price: 29999,
        hard_floor_price: 26000,
        media: [
          { media_url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Full-Stack Node.js & React Architect Program (12 Weeks)",
        item_type: "COURSE",
        inventory_mode: "UNIT_STOCK",
        category_name: "Web Development",
        base_price: 24999,
        compare_at_price: 34999,
        gst_percent: 18,
        description: "Production-grade MERN architecture, microservices, Docker, Redis queues, and CI/CD pipelines.",
        stock_qty: 40,
        media: [
          { media_url: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Career & Mentorship Add-Ons",
        code: "EDU_ADDONS",
        selection_type: "MULTIPLE",
        addons: [
          { name: "1-on-1 Senior Staff Engineer Mentorship (4 Sessions)", price_mode: "FIXED", price: 4999, gst_percent: 18, is_default: 0 },
          { name: "Resume Overhaul & Mock FAANG Interview", price_mode: "FIXED", price: 2999, gst_percent: 18, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Early Enrollment ₹3000 Off",
        rule_type: "PROMO_CODE",
        discount_mode: "FIXED_AMOUNT",
        discount_value: 3000,
        promo_code: "TECHBOOST3000",
        priority: 50
      }
    ],
    flow: {
      name: "NextGen Academy Course Syllabus & Enrollment WhatsApp Flow",
      triggerKeywords: ["course", "bootcamp", "coding", "learn", "syllabus", "fees", "enroll", "admission"]
    }
  },

  B2B_WHOLESALE: {
    sectorName: "B2B Wholesale & Manufacturing",
    domain: "B2B_WHOLESALE",
    entity: {
      name: "Apex Eco Packaging & Corrugated Works",
      tagline: "Eco-friendly 5-ply corrugated master cartons and biodegradable mailers",
      description: "ISO 9001 certified manufacturing plant delivering high-bursting strength packaging across India.",
      phone_e164: "+919844332211",
      city: "Ahmedabad",
      state: "Gujarat",
      currency: "INR"
    },
    items: [
      {
        title: "Heavy-Duty 5-Ply Corrugated Cartons (14x10x8 inch)",
        item_type: "WHOLESALE",
        inventory_mode: "UNIT_STOCK",
        category_name: "Corrugated Boxes",
        base_price: 28,
        compare_at_price: 35,
        gst_percent: 18,
        description: "180 GSM Kraft paper with 24 BF bursting factor, ideal for export shipments and e-commerce heavy parcels.",
        stock_qty: 25000,
        allow_rate_discussion: 1,
        auto_approve_min_price: 24,
        hard_floor_price: 21,
        media: [
          { media_url: "https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800", is_primary: 1 }
        ]
      },
      {
        title: "Biodegradable Honeycomb Padded Mailers (Size #2)",
        item_type: "WHOLESALE",
        inventory_mode: "UNIT_STOCK",
        category_name: "Protective Mailers",
        base_price: 14,
        compare_at_price: 18,
        gst_percent: 18,
        description: "Plastic-free FSC certified paper mailer with self-adhesive tamper-proof strip.",
        stock_qty: 50000,
        allow_rate_discussion: 1,
        auto_approve_min_price: 12,
        hard_floor_price: 10,
        media: [
          { media_url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800", is_primary: 1 }
        ]
      }
    ],
    addonGroups: [
      {
        title: "Custom Printing & Palletization",
        code: "B2B_ADDONS",
        selection_type: "MULTIPLE",
        addons: [
          { name: "2-Color Custom Brand Flexo Logo Printing", price_mode: "PER_UNIT", price: 2.5, gst_percent: 18, is_default: 0 },
          { name: "Export Fumigated Wooden Pallet Packing", price_mode: "FIXED", price: 1200, gst_percent: 18, is_default: 0 }
        ]
      }
    ],
    pricingRules: [
      {
        title: "Tier 1: 1,000+ Units (8% Off)",
        rule_type: "BULK_TIER",
        discount_mode: "PERCENTAGE",
        discount_value: 8,
        criteria: { minQuantity: 1000 },
        priority: 10
      },
      {
        title: "Tier 2: 5,000+ Units (15% Off)",
        rule_type: "BULK_TIER",
        discount_mode: "PERCENTAGE",
        discount_value: 15,
        criteria: { minQuantity: 5000 },
        priority: 20
      }
    ],
    flow: {
      name: "Apex Packaging B2B Bulk Quotation & MOQ Flow",
      triggerKeywords: ["wholesale", "bulk", "quote", "boxes", "packaging", "carton", "moq", "rfq"]
    }
  }
};

const DOMAIN_SURVYA_CTA = Object.freeze({
  HOSPITALITY: "Book Stay (Survya)",
  RESTAURANT_FOOD: "Order Menu (Survya)",
  RETAIL_ECOM: "Shop Now (Survya)",
  CLINIC_HEALTH: "Book Slot (Survya)",
  SALON_WELLNESS: "Book Visit (Survya)",
  REAL_ESTATE: "Visit Site (Survya)",
  EDUCATION_COACHING: "Enroll Now (Survya)",
  B2B_WHOLESALE: "Get Quote (Survya)"
});

/**
 * Seeds a full industry blueprint in a clean transaction
 */
function seedIndustryBlueprint(tenantId = 1, sectorCode = "HOSPITALITY", userId = "system", flowOptions = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const upperSector = String(sectorCode || "").trim().toUpperCase();
  const blueprint = SECTOR_BLUEPRINTS[upperSector];

  if (!blueprint) {
    throw new Error(`Unsupported sector code: '${sectorCode}'. Available: ${Object.keys(SECTOR_BLUEPRINTS).join(", ")}`);
  }

  const displayBusinessName = String(flowOptions.businessName || blueprint.entity.name || blueprint.sectorName).trim();
  const targetExperienceSlug = String(flowOptions.experienceSlug || "").trim();

  // 1. Create or reuse matching Business Entity (never silently overwrite a differently-named entity)
  const targetEntityId = flowOptions.targetEntityId ? Number(flowOptions.targetEntityId) : null;
  let existingEntity = null;
  if (targetEntityId) {
    existingEntity = db.prepare(`
      SELECT * FROM business_entities
      WHERE id = ? AND tenant_id = ? AND delete_status = 0
      LIMIT 1
    `).get(targetEntityId, numericTenantId);
  } else if (!flowOptions.createNewEntity) {
    existingEntity = db.prepare(`
      SELECT * FROM business_entities
      WHERE tenant_id = ? AND domain = ? AND LOWER(name) = LOWER(?) AND delete_status = 0
      ORDER BY id ASC LIMIT 1
    `).get(numericTenantId, blueprint.domain, displayBusinessName);
  }

  let entityId = existingEntity?.id;
  if (!entityId) {
    const baseSlug = slugify(displayBusinessName || blueprint.entity.name);
    let finalSlug = baseSlug;
    let cnt = 1;
    while (db.prepare("SELECT id FROM business_entities WHERE slug = ?").get(finalSlug)) {
      finalSlug = `${baseSlug}-${cnt++}`;
    }

    const entStmt = db.prepare(`
      INSERT INTO business_entities (
        tenant_id, domain, name, slug, tagline, description,
        phone_e164, city, state, country_code, currency, timezone,
        status, active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'IN', ?, 'Asia/Kolkata',
        'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `);

    const entRes = entStmt.run(
      numericTenantId,
      blueprint.domain,
      displayBusinessName || blueprint.entity.name,
      finalSlug,
      blueprint.entity.tagline,
      blueprint.entity.description,
      blueprint.entity.phone_e164,
      blueprint.entity.city,
      blueprint.entity.state,
      blueprint.entity.currency || "INR"
    );
    entityId = entRes.lastInsertRowid;
  }

  // 2. Create Items & Gallery Media
  const createdItems = [];
  for (const itemDef of blueprint.items) {
    const item = createItem(numericTenantId, {
      ...itemDef,
      entity_id: entityId
    }, userId);
    createdItems.push(item);
  }

  // 3. Create Add-On Groups & Add-Ons
  const createdAddonGroups = [];
  if (Array.isArray(blueprint.addonGroups)) {
    for (const groupDef of blueprint.addonGroups) {
      const g = createAddonGroup(numericTenantId, {
        ...groupDef,
        entity_id: entityId
      }, userId);
      createdAddonGroups.push(g);
    }
  }

  // 4. Create Pricing Rules
  const createdRules = [];
  if (Array.isArray(blueprint.pricingRules)) {
    for (const ruleDef of blueprint.pricingRules) {
      const r = createPricingRule(numericTenantId, {
        ...ruleDef,
        entity_id: entityId
      }, userId);
      createdRules.push(r);
    }
  }

  // 5. Create Ready-to-Publish Hybrid WhatsApp <-> Survya Conversation Workflow
  const flowService = require("../conversationFlowService");
  const survyaCtaTitle = DOMAIN_SURVYA_CTA[upperSector] || "Explore in Survya";
  const mergedTriggerKeywords = [...new Set([
    "hi",
    "hello",
    "hey",
    "start",
    "menu",
    ...(Array.isArray(blueprint.flow?.triggerKeywords) ? blueprint.flow.triggerKeywords : [])
  ])];

  const nodes = [
    {
      id: "node_trigger",
      type: "TRIGGER_WHATSAPP",
      title: "Inbound WhatsApp Message",
      position: { x: 320, y: 40 },
      config: {
        triggerType: "KEYWORD_MATCH",
        keywords: mergedTriggerKeywords,
        matchType: "CONTAINS",
        label: "Inbound Trigger"
      }
    },
    {
      id: "node_welcome",
      type: "SEND_MESSAGE",
      title: "Welcome & Options",
      position: { x: 320, y: 190 },
      config: {
        messageType: "BUTTONS",
        text: `👋 Welcome to *${displayBusinessName}*!\n\n${blueprint.entity.tagline}.\n\nTap below to explore everything inside Survya & receive confirmation on WhatsApp:`,
        options: [
          { id: "opt_survya", title: survyaCtaTitle, value: "SURVYA" },
          { id: "opt_browse", title: "Browse on WhatsApp", value: "WHATSAPP" },
          { id: "opt_human", title: "Talk to Team", value: "HUMAN" }
        ]
      }
    },
    {
      id: "node_open_survya",
      type: "OPEN_INAPP_EXPERIENCE",
      title: "Open in Survya Studio",
      position: { x: 40, y: 400 },
      config: {
        experienceSlug: targetExperienceSlug,
        messageText: `✨ Tap below to browse *${displayBusinessName}*, choose options & complete your request inside Survya:\n\nOnce submitted, we will send your confirmation right back here on WhatsApp!`,
        buttonLabel: "Open Survya Experience",
        waitForCompletion: true,
        carrySessionVars: ["selected_location_id", "selected_category_id", "guest_name", "phone", "selected_option"]
      }
    },
    {
      id: "node_catalog",
      type: "CATALOG_BROWSER",
      title: "Browse Offerings",
      position: { x: 340, y: 400 },
      config: {
        title: "Our Featured Offerings",
        entityId: entityId,
        inventoryMode: blueprint.items[0]?.inventory_mode || "UNIT_STOCK",
        pageSize: 5
      }
    },
    {
      id: "node_addon_quote",
      type: "ADDON_UPSELL_AND_QUOTE",
      title: "Add-Ons & Quote",
      position: { x: 340, y: 590 },
      config: {
        title: "Customize & Summary",
        entityId: entityId,
        allowAddons: true,
        allowPromoCode: true
      }
    },
    {
      id: "node_confirm",
      type: "SEND_MESSAGE",
      title: "WhatsApp Confirmation",
      position: { x: 180, y: 780 },
      config: {
        messageType: "TEXT",
        text: `🎉 Confirmed with *${displayBusinessName}*!\nRef: *{{transaction_ref}}*\n\nThank you! All details are saved and shared with you right here on WhatsApp.`
      }
    },
    {
      id: "node_handoff",
      type: "HUMAN_HANDOFF",
      title: "Talk to Support Team",
      position: { x: 640, y: 400 },
      config: {
        team: "FRONT_DESK",
        handoffMessage: `🔔 Connecting you with the *${displayBusinessName}* team right here on WhatsApp.`,
        teamNote: `Customer requested live support for ${displayBusinessName}.`
      }
    }
  ];

  const transitions = [
    { id: "t_bp_1", source: "node_trigger", target: "node_welcome", sourceHandle: "default" },
    { id: "t_bp_2", source: "node_welcome", target: "node_open_survya", sourceHandle: "opt_survya", optionId: "opt_survya" },
    { id: "t_bp_3", source: "node_welcome", target: "node_catalog", sourceHandle: "opt_browse", optionId: "opt_browse" },
    { id: "t_bp_4", source: "node_welcome", target: "node_handoff", sourceHandle: "opt_human", optionId: "opt_human" },
    { id: "t_bp_5", source: "node_open_survya", target: "node_confirm", sourceHandle: "completed" },
    { id: "t_bp_6", source: "node_open_survya", target: "node_confirm", sourceHandle: "default" },
    { id: "t_bp_7", source: "node_catalog", target: "node_addon_quote", sourceHandle: "item_selected" },
    { id: "t_bp_8", source: "node_catalog", target: "node_addon_quote", sourceHandle: "default" },
    { id: "t_bp_9", source: "node_addon_quote", target: "node_confirm", sourceHandle: "confirmed" },
    { id: "t_bp_10", source: "node_addon_quote", target: "node_confirm", sourceHandle: "default" }
  ];

  const existingDefault = db.prepare(`
    SELECT id FROM conversation_flows WHERE tenant_id = ? AND is_default = 1 LIMIT 1
  `).get(numericTenantId);

  const createdFlow = flowService.createFlow({
    tenant_id: numericTenantId,
    name: `${displayBusinessName} - ${blueprint.sectorName} Flow`,
    description: `Auto-generated hybrid WhatsApp <-> Survya flow for ${blueprint.sectorName}`,
    category: blueprint.domain,
    trigger_keywords: mergedTriggerKeywords,
    initialNodes: nodes,
    initialTransitions: transitions,
    is_default: existingDefault ? 0 : 1,
    priority: 80
  }, { id: userId, name: userId });

  const createdFlowId = createdFlow?.flow?.id || createdFlow?.id;

  let published = null;
  try {
    if (createdFlowId) {
      published = flowService.publishFlow(createdFlowId, { id: userId, name: userId }, numericTenantId);
    }
  } catch (pubErr) {
    console.warn(`[UniversalCatalog] Blueprint flow auto-publish note:`, pubErr.message);
  }

  return {
    success: true,
    sector: upperSector,
    sectorName: blueprint.sectorName,
    entityId,
    itemCount: createdItems.length,
    addonGroupCount: createdAddonGroups.length,
    pricingRuleCount: createdRules.length,
    flowId: createdFlowId
  };
}

/**
 * 1-Click Complete Industry Suite Importer
 * Atomically provisions:
 * 1. ERP Masters (Taxes, Payment Modes, Units, Status Tags)
 * 2. Business Profile Entity (with optional custom name, phone, city)
 * 3. Catalog Items & Add-ons
 * 4. Pricing Rules & Promos
 * 5. Pre-wired Conversation Flow
 * 6. Global Settings & Fallbacks
 */
function importFullIndustrySuite(tenantId = 1, options = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const sectorCode = String(options.sectorCode || options.sector || "HOSPITALITY").trim().toUpperCase();
  const customBusinessName = options.businessName || options.customBusinessName || options.name || null;
  const customPhone = options.phone || options.phone_e164 || options.customPhone || null;
  const city = options.city || null;
  const state = options.state || null;
  const phoneLineId = options.phoneLineId || options.phoneNumberId || null;

  // 1. Seed ERP Master Tables (Tax Slabs, Payment Modes, Units, Status Tags, Categories)
  const masterDataService = require("../masters/masterDataService");
  const masterResult = masterDataService.seedMastersForSector(numericTenantId, sectorCode, userId);

  // 2. Seed Universal Catalog Blueprint (Entity, Items, Addons, Pricing Rules, Ready Workflow)
  const catalogResult = seedIndustryBlueprint(numericTenantId, sectorCode, userId, {
    businessName: customBusinessName,
    experienceSlug: options.experienceSlug || ""
  });

  // 3. If custom business details were provided, update the newly created business_entity
  const finalBizName = customBusinessName || catalogResult.entity?.name || (SECTOR_BLUEPRINTS[sectorCode]?.entity?.name || "Business Workspace");
  const finalPhone = customPhone || catalogResult.entity?.phone_e164 || (SECTOR_BLUEPRINTS[sectorCode]?.entity?.phone_e164 || "+919999900000");

  if (catalogResult.entityId) {
    const updates = ["name = ?", "phone_e164 = ?"];
    const updateParams = [finalBizName, finalPhone];
    if (city) {
      updates.push("city = ?");
      updateParams.push(city);
    }
    if (state) {
      updates.push("state = ?");
      updateParams.push(state);
    }
    updates.push("updated_at = UTC_TIMESTAMP()");
    updateParams.push(catalogResult.entityId, numericTenantId);

    db.prepare(`
      UPDATE business_entities
      SET ${updates.join(", ")}
      WHERE id = ? AND tenant_id = ?
    `).run(...updateParams);
  }

  // 4. Create or explicitly update target property (NEVER silently overwrite an existing named property like KonkanTrip)
  const targetPropId = options.targetPropertyId ? Number(options.targetPropertyId) : null;
  let propId = null;

  if (targetPropId) {
    const targetProp = db.prepare("SELECT id FROM properties WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0").get(targetPropId, numericTenantId);
    if (targetProp) {
      db.prepare(`
        UPDATE properties
        SET name = ?, phone = COALESCE(?, phone), city = COALESCE(?, city), state = COALESCE(?, state), updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND tenant_id = ?
      `).run(finalBizName, finalPhone, city, state, targetProp.id, numericTenantId);
      propId = targetProp.id;
    }
  }

  if (!propId) {
    const sameNameProp = db.prepare(`
      SELECT id FROM properties
      WHERE tenant_id = ? AND LOWER(name) = LOWER(?) AND COALESCE(delete_status, 0) = 0
      ORDER BY id ASC LIMIT 1
    `).get(numericTenantId, finalBizName);

    if (sameNameProp) {
      db.prepare(`
        UPDATE properties
        SET phone = COALESCE(?, phone), city = COALESCE(?, city), state = COALESCE(?, state), updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND tenant_id = ?
      `).run(finalPhone, city, state, sameNameProp.id, numericTenantId);
      propId = sameNameProp.id;
    } else {
      const existingPropCount = Number(db.prepare("SELECT COUNT(*) as cnt FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0").get(numericTenantId)?.cnt || 0);
      const initialPubStatus = (existingPropCount === 0 && (sectorCode === "HOSPITALITY" || options.publishProperty)) ? "PUBLISHED" : "DRAFT";
      const insProp = db.prepare(`
        INSERT INTO properties (
          tenant_id, name, phone, city, state, publication_status, status, active_status, delete_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
      `).run(numericTenantId, finalBizName, finalPhone, city || "Mumbai", state || "Maharashtra", initialPubStatus);
      propId = Number(insProp.lastInsertRowid);
    }
  }

  // 5. Update the newly created flow with the custom business name & bound line
  if (catalogResult.flowId) {
    const flowName = `${finalBizName} - ${SECTOR_BLUEPRINTS[sectorCode]?.sectorName || 'WhatsApp'} Flow`;
    db.prepare(`
      UPDATE conversation_flows
      SET name = ?,
          phone_number_id = COALESCE(?, phone_number_id),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ?
    `).run(flowName, phoneLineId, catalogResult.flowId, numericTenantId);
  }

  // 6. Sync flow_global_settings
  const flowGlobalSettingsService = require("../flowGlobalSettingsService");
  flowGlobalSettingsService.updateSettings(numericTenantId, phoneLineId, {
    root_flow_id: catalogResult.flowId,
    fallback_message: `👋 Thank you for contacting *${finalBizName}*! Please type *menu* to view our options.`,
    menu_keywords: ["menu", "restart", "start", "main menu"],
    back_keywords: ["0", "back", "prev"],
    handoff_keywords: ["agent", "human", "help", "support"]
  });

  // 7. Update legacy Tenant-1 global settings table ONLY when modifying Tenant 1 (prevent cross-tenant pollution)
  if (numericTenantId === 1) {
    try {
      const { setSetting } = require("../../config/database");
      setSetting("BOT_BUSINESS_NAME", finalBizName);
      if (finalPhone) setSetting("BOT_HANDOFF_PHONE", finalPhone);
    } catch (_) {}
  }

  // propId was resolved earlier in this function (let propId = null; ... set during property create/update)
  // No second resolution needed — just use the already-set propId.

  return {
    success: true,
    message: `Industry blueprint for '${catalogResult.sectorName}' successfully imported!`,
    sector: sectorCode,
    sectorName: catalogResult.sectorName,
    entityId: catalogResult.entityId,
    propertyId: propId,
    businessName: finalBizName,
    flowId: catalogResult.flowId,
    itemCount: catalogResult.itemCount || 0,
    addonGroupCount: catalogResult.addonGroupCount || 0,
    pricingRuleCount: catalogResult.pricingRuleCount || 0,
    mastersSeeded: masterResult.seeded || {}
  };
}

/**
 * Retrieve aggregated Business Profile and operational setup
 */
function getBusinessProfile(tenantId = 1) {
  const numericTenantId = Number(tenantId) || 1;
  const entity = db.prepare(`
    SELECT * FROM business_entities
    WHERE tenant_id = ? AND delete_status = 0
    ORDER BY id ASC LIMIT 1
  `).get(numericTenantId);

  const property = db.prepare(`
    SELECT * FROM properties
    WHERE tenant_id = ?
    ORDER BY id ASC LIMIT 1
  `).get(numericTenantId);

  const globalSettings = require("../flowGlobalSettingsService").getSettings(numericTenantId, null);

  // Summary counts
  const itemCount = db.prepare("SELECT COUNT(*) as cnt FROM catalog_items WHERE tenant_id = ? AND delete_status = 0").get(numericTenantId)?.cnt || 0;
  const flowCount = db.prepare("SELECT COUNT(*) as cnt FROM conversation_flows WHERE tenant_id = ?").get(numericTenantId)?.cnt || 0;
  const taxCount = db.prepare("SELECT COUNT(*) as cnt FROM master_tax_slabs WHERE tenant_id = ? AND delete_status = 0").get(numericTenantId)?.cnt || 0;

  const profile = {
    businessName: entity?.name || property?.name || "My Business",
    sector: entity?.domain || "GENERAL",
    phone: entity?.phone_e164 || property?.phone || "",
    email: entity?.email || "",
    currency: entity?.currency || "INR",
    city: entity?.city || property?.city || "",
    state: entity?.state || property?.state || "",
    operatingHours: entity?.checkin_time ? `Check-in: ${entity.checkin_time}, Check-out: ${entity.checkout_time || "11:00"}` : (entity?.opening_time ? `${entity.opening_time} - ${entity.closing_time || "21:00"}` : "09:00 - 21:00"),
    fallbackMessage: globalSettings?.fallback_message || "Sorry, I did not understand that. Type *menu* to see available options.",
    rootFlowId: globalSettings?.root_flow_id || null,
    menuKeywords: globalSettings?.menu_keywords || ["menu", "restart"]
  };

  return {
    success: true,
    tenantId: numericTenantId,
    profile,
    entity: entity || {
      name: property?.name || "My Business",
      domain: "GENERAL",
      phone_e164: property?.phone || "",
      city: property?.city || "",
      state: property?.state || "",
      currency: "INR",
      timezone: "Asia/Kolkata",
      tagline: "",
      description: "",
      checkin_time: "14:00",
      checkout_time: "11:00",
      opening_time: "09:00",
      closing_time: "21:00"
    },
    property: property || null,
    globalSettings,
    stats: {
      items: itemCount,
      flows: flowCount,
      taxSlabs: taxCount
    }
  };
}

/**
 * Update Business Profile & sync across entities, properties, and flow settings
 */
function updateBusinessProfile(tenantId = 1, payload = {}, userId = "system") {
  const numericTenantId = Number(tenantId) || 1;
  const {
    name, businessName,
    sector, domain,
    legal_name, legalName,
    tagline, description,
    phone_e164, phone,
    email, city, state, currency, timezone,
    checkin_time, checkinTime,
    checkout_time, checkoutTime,
    opening_time, openingTime,
    closing_time, closingTime,
    operatingHours,
    fallback_message, fallbackMessage,
    root_flow_id, rootFlowId,
    phone_number_id, phoneNumberId,
    menuKeywords, menu_keywords
  } = payload;

  const finalName = name || businessName;
  const finalSector = sector || domain;
  const finalLegalName = legal_name || legalName;
  const finalPhone = phone_e164 || phone;
  const finalFallback = fallback_message || fallbackMessage;
  const finalRootFlow = root_flow_id !== undefined ? root_flow_id : rootFlowId;
  const finalMenuKeywords = menuKeywords || menu_keywords;
  const finalLine = phone_number_id || phoneNumberId || null;

  const targetEntityId = payload.entityId || payload.entity_id || null;
  let existing = null;
  if (targetEntityId) {
    existing = db.prepare(`
      SELECT * FROM business_entities
      WHERE id = ? AND tenant_id = ? AND delete_status = 0
      LIMIT 1
    `).get(Number(targetEntityId), numericTenantId);
  } else {
    existing = db.prepare(`
      SELECT * FROM business_entities
      WHERE tenant_id = ? AND delete_status = 0
      ORDER BY id ASC LIMIT 1
    `).get(numericTenantId);
  }

  if (existing) {
    db.prepare(`
      UPDATE business_entities
      SET name = COALESCE(?, name),
          domain = COALESCE(?, domain),
          legal_name = COALESCE(?, legal_name),
          tagline = COALESCE(?, tagline),
          description = COALESCE(?, description),
          phone_e164 = COALESCE(?, phone_e164),
          email = COALESCE(?, email),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          currency = COALESCE(?, currency),
          timezone = COALESCE(?, timezone),
          checkin_time = COALESCE(?, checkin_time),
          checkout_time = COALESCE(?, checkout_time),
          opening_time = COALESCE(?, opening_time),
          closing_time = COALESCE(?, closing_time),
          updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ?
    `).run(
      finalName, finalSector, finalLegalName, tagline, description,
      finalPhone, email, city, state, currency, timezone,
      checkin_time || checkinTime, checkout_time || checkoutTime, opening_time || openingTime, closing_time || closingTime,
      existing.id, numericTenantId
    );
  } else {
    const slug = slugify(finalName || "business") + "-" + Date.now().toString().slice(-4);
    db.prepare(`
      INSERT INTO business_entities (
        tenant_id, domain, name, legal_name, slug, tagline, description,
        phone_e164, email, city, state, currency, timezone,
        checkin_time, checkout_time, opening_time, closing_time,
        status, active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, COALESCE(?, 'GENERAL'), ?, ?, ?, ?, ?,
        ?, ?, ?, ?, COALESCE(?, 'INR'), COALESCE(?, 'Asia/Kolkata'),
        ?, ?, ?, ?,
        'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(
      numericTenantId, finalSector, finalName || "My Business", finalLegalName, slug, tagline, description,
      finalPhone || "", email, city || "", state || "", currency, timezone,
      checkin_time || checkinTime, checkout_time || checkoutTime, opening_time || openingTime, closing_time || closingTime
    );
  }

  // Update explicit target property (or a single matching property only if tenant has <= 1 property matching old entity name)
  const explicitPropId = payload.propertyId || payload.property_id || null;
  if (explicitPropId && finalName) {
    db.prepare(`
      UPDATE properties SET name = ?, phone = COALESCE(?, phone), city = COALESCE(?, city), state = COALESCE(?, state), updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
    `).run(finalName, finalPhone, city, state, Number(explicitPropId), numericTenantId);
  } else if (finalName && existing) {
    const propCount = Number(db.prepare("SELECT COUNT(*) as cnt FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0").get(numericTenantId)?.cnt || 0);
    if (propCount === 1) {
      const onlyProp = db.prepare("SELECT id, name FROM properties WHERE tenant_id = ? AND COALESCE(delete_status, 0) = 0 LIMIT 1").get(numericTenantId);
      if (onlyProp && (onlyProp.name === existing.name || payload.syncLinkedProperty)) {
        db.prepare("UPDATE properties SET name = ?, phone = COALESCE(?, phone), city = COALESCE(?, city), state = COALESCE(?, state), updated_at = UTC_TIMESTAMP() WHERE id = ? AND tenant_id = ?")
          .run(finalName, finalPhone, city, state, onlyProp.id, numericTenantId);
      }
    }
  }

  // Update flow_global_settings if fallback_message, root_flow_id, or menu_keywords provided
  if (finalFallback || finalRootFlow !== undefined || finalMenuKeywords || finalName) {
    const flowGlobalSettingsService = require("../flowGlobalSettingsService");
    const currentSettings = flowGlobalSettingsService.getSettings(numericTenantId, finalLine);
    const updates = {};
    if (finalFallback) updates.fallback_message = finalFallback;
    else if (finalName && !currentSettings.fallback_message) {
      updates.fallback_message = `Thank you for contacting *${finalName}*! Please type *menu* to view our options.`;
    }
    if (finalRootFlow !== undefined) updates.root_flow_id = finalRootFlow;
    if (finalMenuKeywords) updates.menu_keywords = finalMenuKeywords;

    flowGlobalSettingsService.updateSettings(numericTenantId, finalLine, updates);
  }

  // Sync legacy Tenant-1 global settings ONLY when updating Tenant 1 (prevent cross-tenant pollution)
  if (finalName && numericTenantId === 1) {
    try {
      const { setSetting } = require("../../config/database");
      setSetting("BOT_BUSINESS_NAME", finalName);
      if (finalPhone) setSetting("BOT_HANDOFF_PHONE", finalPhone);
    } catch (_) {}
  }

  return getBusinessProfile(numericTenantId);
}

module.exports = {
  slugify,
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  searchCatalog,
  listMedia,
  addMedia,
  reorderMedia,
  setPrimaryMedia,
  deleteMedia,
  getOrUploadMetaMediaId,
  getOrCacheMetaMediaId: getOrUploadMetaMediaId,
  listAddonGroups,
  getApplicableAddons,
  createAddonGroup,
  updateAddonGroup,
  deleteAddonGroup,
  listAddons: (tenantId, groupId) => {
    return db.prepare("SELECT * FROM catalog_addons WHERE tenant_id = ? AND group_id = ? AND delete_status = 0 ORDER BY sort_order ASC, id ASC").all(Number(tenantId) || 1, groupId);
  },
  createAddon,
  updateAddon,
  deleteAddon,
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  seedIndustryBlueprint,
  importFullIndustrySuite,
  getBusinessProfile,
  updateBusinessProfile,
  SECTOR_BLUEPRINTS
};
