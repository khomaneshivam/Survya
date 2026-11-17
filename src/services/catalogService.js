const { db } = require("../config/database");

/**
 * Normalizes title into URL-safe slug
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * ENTITY MANAGEMENT
 */
function listEntities(tenantId = 1, domain = null, userId = null, isAdmin = true) {
  let query = "SELECT * FROM business_entities WHERE tenant_id = ?";
  const params = [tenantId];
  if (!isAdmin && userId) {
    query += " AND user_id = ?";
    params.push(userId);
  }
  if (domain) {
    query += " AND domain = ?";
    params.push(domain.toUpperCase());
  }
  query += " ORDER BY id ASC";
  return db.prepare(query).all(...params);
}

function getEntityById(id) {
  return db.prepare("SELECT * FROM business_entities WHERE id = ?").get(id);
}

function getEntityBySlug(slug) {
  return db.prepare("SELECT * FROM business_entities WHERE slug = ?").get(slug);
}

function createEntity(data, tenantId = 1, userId = null) {
  if (!data.name || !data.domain || !data.phone_e164 || !data.city) {
    throw new Error("Missing required entity fields: name, domain, phone_e164, city");
  }

  const baseSlug = slugify(data.slug || data.name);
  let finalSlug = baseSlug;
  let counter = 1;
  while (db.prepare("SELECT id FROM business_entities WHERE slug = ?").get(finalSlug)) {
    finalSlug = `${baseSlug}-${counter++}`;
  }

  const stmt = db.prepare(`
    INSERT INTO business_entities (
      tenant_id, user_id, domain, name, legal_name, slug, tagline, description,
      logo_url, banner_url, phone_e164, email, city, state, country_code,
      currency, timezone, tax_identifier, opening_time, closing_time,
      checkin_time, checkout_time, status, settings_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `);

  const info = stmt.run(
    tenantId,
    userId || null,
    data.domain.toUpperCase(),
    data.name.trim(),
    data.legal_name || null,
    finalSlug,
    data.tagline || null,
    data.description || null,
    data.logo_url || null,
    data.banner_url || null,
    data.phone_e164.trim(),
    data.email || null,
    data.city.trim(),
    data.state || null,
    data.country_code || 'IN',
    data.currency || 'INR',
    data.timezone || 'Asia/Kolkata',
    data.tax_identifier || null,
    data.opening_time || null,
    data.closing_time || null,
    data.checkin_time || (data.domain === 'HOSPITALITY' ? '14:00' : null),
    data.checkout_time || (data.domain === 'HOSPITALITY' ? '11:00' : null),
    data.status || 'ACTIVE',
    JSON.stringify(data.settings || {})
  );

  return getEntityById(info.lastInsertRowid);
}

function updateEntity(id, data) {
  const current = getEntityById(id);
  if (!current) throw new Error("Entity not found");

  const updates = [];
  const params = [];

  const allowed = [
    'name', 'legal_name', 'tagline', 'description', 'logo_url', 'banner_url',
    'phone_e164', 'email', 'city', 'state', 'tax_identifier', 'opening_time',
    'closing_time', 'checkin_time', 'checkout_time', 'status'
  ];

  for (const field of allowed) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(data[field]);
    }
  }

  if (data.settings !== undefined) {
    updates.push("settings_json = ?");
    params.push(JSON.stringify(data.settings));
  }

  if (updates.length === 0) return current;

  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  db.prepare(`UPDATE business_entities SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  return getEntityById(id);
}

function deleteEntity(id) {
  const current = getEntityById(id);
  if (!current) throw new Error("Entity not found");
  db.prepare("DELETE FROM business_entities WHERE id = ?").run(id);
  return { success: true, id };
}

/**
 * CATEGORY MANAGEMENT
 */
function getCategories(entityId) {
  return db.prepare("SELECT * FROM catalog_categories WHERE entity_id = ? ORDER BY sort_order ASC, id ASC").all(entityId);
}

function createCategory(entityId, data, tenantId = 1) {
  if (!data.name) throw new Error("Category name is required");
  const slug = slugify(data.slug || data.name);
  const stmt = db.prepare(`
    INSERT INTO catalog_categories (tenant_id, entity_id, name, slug, description, icon, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(tenantId, entityId, data.name.trim(), slug, data.description || null, data.icon || null, data.sort_order || 0);
  return db.prepare("SELECT * FROM catalog_categories WHERE id = ?").get(info.lastInsertRowid);
}

function updateCategory(id, data) {
  const current = db.prepare("SELECT * FROM catalog_categories WHERE id = ?").get(id);
  if (!current) throw new Error("Category not found");

  const updates = [];
  const params = [];
  if (data.name) {
    updates.push("name = ?", "slug = ?");
    params.push(data.name.trim(), slugify(data.slug || data.name));
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    params.push(data.description);
  }
  if (data.icon !== undefined) {
    updates.push("icon = ?");
    params.push(data.icon);
  }
  if (data.sort_order !== undefined) {
    updates.push("sort_order = ?");
    params.push(data.sort_order);
  }
  if (data.is_active !== undefined) {
    updates.push("is_active = ?");
    params.push(data.is_active ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE catalog_categories SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }
  return db.prepare("SELECT * FROM catalog_categories WHERE id = ?").get(id);
}

function deleteCategory(id) {
  db.prepare("DELETE FROM catalog_categories WHERE id = ?").run(id);
  return { success: true, id };
}

/**
 * ITEM MANAGEMENT
 */
function getItems(entityId, options = {}) {
  let query = "SELECT i.*, c.name as category_name FROM catalog_items i LEFT JOIN catalog_categories c ON i.category_id = c.id WHERE i.entity_id = ?";
  const params = [entityId];

  if (options.categoryId) {
    query += " AND i.category_id = ?";
    params.push(options.categoryId);
  }
  if (options.itemType) {
    query += " AND i.item_type = ?";
    params.push(options.itemType.toUpperCase());
  }
  if (options.activeOnly) {
    query += " AND i.is_active = 1";
  }
  if (options.search) {
    query += " AND (i.title LIKE ? OR i.sku LIKE ? OR i.short_description LIKE ?)";
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY i.sort_order ASC, i.id ASC";
  const items = db.prepare(query).all(...params);

  // Attach variants
  const getVariantsStmt = db.prepare("SELECT * FROM catalog_item_variants WHERE item_id = ? AND is_active = 1");
  return items.map(item => {
    return {
      ...item,
      variants: getVariantsStmt.all(item.id)
    };
  });
}

function getItemById(id) {
  const item = db.prepare(`
    SELECT i.*, c.name as category_name
    FROM catalog_items i
    LEFT JOIN catalog_categories c ON i.category_id = c.id
    WHERE i.id = ?
  `).get(id);

  if (!item) return null;
  item.variants = db.prepare("SELECT * FROM catalog_item_variants WHERE item_id = ?").all(id);
  return item;
}

function createItem(entityId, data, tenantId = 1) {
  if (!data.title || !data.item_type) {
    throw new Error("Missing required item fields: title, item_type");
  }

  const baseSlug = slugify(data.slug || data.title);
  let finalSlug = baseSlug;
  let counter = 1;
  while (db.prepare("SELECT id FROM catalog_items WHERE entity_id = ? AND slug = ?").get(entityId, finalSlug)) {
    finalSlug = `${baseSlug}-${counter++}`;
  }

  const stmt = db.prepare(`
    INSERT INTO catalog_items (
      tenant_id, entity_id, category_id, item_type, title, slug, sku,
      short_description, description, image_url, gallery_json, base_price,
      tax_rate, hsn_sac_code, max_adults, max_children, bed_type, carpet_area_sqft,
      dietary_flag, spice_level, prep_time_minutes, is_sold_out_today,
      inventory_tracking, stock_quantity, low_stock_threshold, weight_grams,
      duration_minutes, buffer_minutes, is_active, sort_order, attributes_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const info = stmt.run(
    tenantId,
    entityId,
    data.category_id || null,
    data.item_type.toUpperCase(),
    data.title.trim(),
    finalSlug,
    data.sku || null,
    data.short_description || null,
    data.description || null,
    data.image_url || null,
    JSON.stringify(data.gallery || []),
    parseFloat(data.base_price || 0),
    parseFloat(data.tax_rate || 0),
    data.hsn_sac_code || null,
    parseInt(data.max_adults || 2, 10),
    parseInt(data.max_children || 0, 10),
    data.bed_type || null,
    data.carpet_area_sqft || null,
    (data.dietary_flag || 'NONE').toUpperCase(),
    parseInt(data.spice_level || 0, 10),
    parseInt(data.prep_time_minutes || 15, 10),
    data.is_sold_out_today ? 1 : 0,
    data.inventory_tracking !== undefined ? (data.inventory_tracking ? 1 : 0) : 1,
    parseInt(data.stock_quantity || 0, 10),
    parseInt(data.low_stock_threshold || 5, 10),
    parseFloat(data.weight_grams || 0),
    parseInt(data.duration_minutes || 30, 10),
    parseInt(data.buffer_minutes || 10, 10),
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
    parseInt(data.sort_order || 0, 10),
    JSON.stringify(data.attributes || {})
  );

  const itemId = info.lastInsertRowid;

  // Insert variants if provided
  if (Array.isArray(data.variants) && data.variants.length > 0) {
    const varStmt = db.prepare(`
      INSERT INTO catalog_item_variants (tenant_id, item_id, title, sku, price_delta, override_base_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const v of data.variants) {
      if (v.title) {
        varStmt.run(tenantId, itemId, v.title, v.sku || null, parseFloat(v.price_delta || 0), v.override_base_price || null, parseInt(v.stock_quantity || 0, 10));
      }
    }
  }

  return getItemById(itemId);
}

function updateItem(id, data) {
  const current = getItemById(id);
  if (!current) throw new Error("Item not found");

  const fields = [
    'category_id', 'title', 'sku', 'short_description', 'description', 'image_url',
    'base_price', 'tax_rate', 'hsn_sac_code', 'max_adults', 'max_children',
    'bed_type', 'carpet_area_sqft', 'dietary_flag', 'spice_level', 'prep_time_minutes',
    'is_sold_out_today', 'inventory_tracking', 'stock_quantity', 'low_stock_threshold',
    'weight_grams', 'duration_minutes', 'buffer_minutes', 'is_active', 'sort_order'
  ];

  const updates = [];
  const params = [];

  for (const f of fields) {
    if (data[f] !== undefined) {
      updates.push(`${f} = ?`);
      if (typeof data[f] === "boolean") {
        params.push(data[f] ? 1 : 0);
      } else {
        params.push(data[f]);
      }
    }
  }

  if (data.gallery !== undefined) {
    updates.push("gallery_json = ?");
    params.push(JSON.stringify(data.gallery));
  }
  if (data.attributes !== undefined) {
    updates.push("attributes_json = ?");
    params.push(JSON.stringify(data.attributes));
  }

  if (updates.length > 0) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    db.prepare(`UPDATE catalog_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }

  return getItemById(id);
}

function deleteItem(id) {
  db.prepare("DELETE FROM catalog_items WHERE id = ?").run(id);
  return { success: true, id };
}

/**
 * 1-CLICK 86 TOGGLE (Instant Dish / Room Out-Of-Stock switch)
 */
function toggleSoldOut(itemId, isSoldOutToday = null) {
  const item = getItemById(itemId);
  if (!item) throw new Error("Item not found");

  const newVal = isSoldOutToday !== null ? (isSoldOutToday ? 1 : 0) : (item.is_sold_out_today ? 0 : 1);
  db.prepare("UPDATE catalog_items SET is_sold_out_today = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newVal, itemId);
  return { id: itemId, is_sold_out_today: newVal, title: item.title };
}

/**
 * ITEM VARIANTS
 */
function createVariant(itemId, data, tenantId = 1) {
  if (!data.title) throw new Error("Variant title is required");
  const stmt = db.prepare(`
    INSERT INTO catalog_item_variants (tenant_id, item_id, title, sku, price_delta, override_base_price, stock_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    tenantId, itemId, data.title.trim(), data.sku || null,
    parseFloat(data.price_delta || 0), data.override_base_price || null, parseInt(data.stock_quantity || 0, 10)
  );
  return db.prepare("SELECT * FROM catalog_item_variants WHERE id = ?").get(info.lastInsertRowid);
}

function deleteVariant(id) {
  db.prepare("DELETE FROM catalog_item_variants WHERE id = ?").run(id);
  return { success: true, id };
}

/**
 * DYNAMIC DAILY INVENTORY & CALENDAR MATRIX
 */
function getInventoryMatrix(entityId, itemId, startDate, endDate) {
  return db.prepare(`
    SELECT * FROM daily_inventory_matrix
    WHERE entity_id = ? AND item_id = ? AND inventory_date BETWEEN ? AND ?
    ORDER BY inventory_date ASC
  `).all(entityId, itemId, startDate, endDate);
}

function updateDailyInventory(entityId, itemId, date, updates = {}, tenantId = 1) {
  const existing = db.prepare(`
    SELECT * FROM daily_inventory_matrix WHERE entity_id = ? AND item_id = ? AND inventory_date = ?
  `).get(entityId, itemId, date);

  if (existing) {
    db.prepare(`
      UPDATE daily_inventory_matrix
      SET available_qty = COALESCE(?, available_qty),
          rate_override = COALESCE(?, rate_override),
          is_closed = COALESCE(?, is_closed),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updates.availableQty !== undefined ? updates.availableQty : null,
      updates.rateOverride !== undefined ? updates.rateOverride : null,
      updates.isClosed !== undefined ? (updates.isClosed ? 1 : 0) : null,
      updates.notes !== undefined ? updates.notes : null,
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO daily_inventory_matrix (
        tenant_id, entity_id, item_id, inventory_date, available_qty, rate_override, is_closed, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tenantId,
      entityId,
      itemId,
      date,
      updates.availableQty !== undefined ? updates.availableQty : 1,
      updates.rateOverride || null,
      updates.isClosed ? 1 : 0,
      updates.notes || null
    );
  }

  return db.prepare(`SELECT * FROM daily_inventory_matrix WHERE entity_id = ? AND item_id = ? AND inventory_date = ?`).get(entityId, itemId, date);
}

function bulkUpdateInventory(entityId, itemId, startDate, endDate, updates = {}, tenantId = 1) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const results = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    results.push(updateDailyInventory(entityId, itemId, dateStr, updates, tenantId));
  }
  return results;
}

/**
 * 1-CLICK STARTER PACK SEEDING (3-Minute Setup Engine)
 */
function seedStarterKit(entityId, kitType = "RESORT_LUXURY_V1", tenantId = 1) {
  const entity = getEntityById(entityId);
  if (!entity) throw new Error("Entity not found");

  const seeded = { categories: [], items: [] };

  if (kitType === "RESORT_LUXURY_V1") {
    const c1 = createCategory(entityId, { name: "Sea View Villas", sort_order: 1 }, tenantId);
    const c2 = createCategory(entityId, { name: "Garden Cottages", sort_order: 2 }, tenantId);
    seeded.categories.push(c1, c2);

    const i1 = createItem(entityId, {
      category_id: c1.id,
      item_type: "ROOM",
      title: "Executive Ocean Villa",
      base_price: 9500,
      tax_rate: 18,
      max_adults: 2,
      max_children: 1,
      bed_type: "King Size Bed",
      carpet_area_sqft: 520,
      short_description: "Private sea balcony, walk-in closet, plunge pool & breakfast."
    }, tenantId);

    const i2 = createItem(entityId, {
      category_id: c2.id,
      item_type: "ROOM",
      title: "Eco Heritage Cottage",
      base_price: 4800,
      tax_rate: 12,
      max_adults: 3,
      max_children: 1,
      bed_type: "Queen Bed",
      carpet_area_sqft: 340,
      short_description: "Surrounded by betel-nut palms with outdoor hammock."
    }, tenantId);
    seeded.items.push(i1, i2);

  } else if (kitType === "CAFE_DINING_V1") {
    const c1 = createCategory(entityId, { name: "Specialty Pizzas", sort_order: 1 }, tenantId);
    const c2 = createCategory(entityId, { name: "Fresh Catch Seafood", sort_order: 2 }, tenantId);
    const c3 = createCategory(entityId, { name: "Beverages & Solkadhi", sort_order: 3 }, tenantId);
    seeded.categories.push(c1, c2, c3);

    const i1 = createItem(entityId, {
      category_id: c1.id,
      item_type: "FOOD",
      title: "Wood-Fired Truffle Funghi Pizza",
      base_price: 520,
      tax_rate: 5,
      dietary_flag: "VEG",
      prep_time_minutes: 15,
      short_description: "Shiitake mushrooms, truffle oil, mozzarella, parmesan."
    }, tenantId);

    const i2 = createItem(entityId, {
      category_id: c2.id,
      item_type: "FOOD",
      title: "Malvani Crab Masala",
      base_price: 650,
      tax_rate: 5,
      dietary_flag: "NON_VEG",
      spice_level: 3,
      prep_time_minutes: 25,
      short_description: "Fresh mud crabs simmered in roasted coconut and Malvani masala."
    }, tenantId);

    const i3 = createItem(entityId, {
      category_id: c3.id,
      item_type: "FOOD",
      title: "Classic Solkadhi",
      base_price: 90,
      tax_rate: 5,
      dietary_flag: "VEGAN",
      spice_level: 1,
      prep_time_minutes: 5,
      short_description: "Cooling coconut milk aperitif with kokum & garlic."
    }, tenantId);
    seeded.items.push(i1, i2, i3);

  } else if (kitType === "D2C_RETAIL_V1") {
    const c1 = createCategory(entityId, { name: "Apparel", sort_order: 1 }, tenantId);
    const c2 = createCategory(entityId, { name: "Coastal Spices", sort_order: 2 }, tenantId);
    seeded.categories.push(c1, c2);

    const i1 = createItem(entityId, {
      category_id: c1.id,
      item_type: "PRODUCT",
      title: "Organic Linen Resort Shirt",
      base_price: 2499,
      tax_rate: 12,
      inventory_tracking: 1,
      stock_quantity: 45,
      short_description: "Breathable 100% pure linen shirt designed for coastal heat."
    }, tenantId);

    const i2 = createItem(entityId, {
      category_id: c2.id,
      item_type: "PRODUCT",
      title: "Konkan Artisanal Spice Blend (250g)",
      base_price: 350,
      tax_rate: 5,
      inventory_tracking: 1,
      stock_quantity: 120,
      short_description: "Sun-dried whole spices roasted on stone chulhas."
    }, tenantId);
    seeded.items.push(i1, i2);

  } else if (kitType === "SALON_CLINIC_V1") {
    const c1 = createCategory(entityId, { name: "Therapies & Massages", sort_order: 1 }, tenantId);
    const c2 = createCategory(entityId, { name: "Doctor Consultations", sort_order: 2 }, tenantId);
    seeded.categories.push(c1, c2);

    const i1 = createItem(entityId, {
      category_id: c1.id,
      item_type: "SERVICE",
      title: "Abhyanga Ayurvedic Full Body Massage",
      base_price: 2200,
      tax_rate: 18,
      duration_minutes: 60,
      buffer_minutes: 15,
      short_description: "Traditional warm herbal oil rhythmic therapy for muscle rejuvenation."
    }, tenantId);

    const i2 = createItem(entityId, {
      category_id: c2.id,
      item_type: "SERVICE",
      title: "Specialist Consultation (In-Person)",
      base_price: 800,
      tax_rate: 0,
      duration_minutes: 30,
      buffer_minutes: 10,
      short_description: "30-minute private clinical consultation and diagnosis."
    }, tenantId);
    seeded.items.push(i1, i2);
  }

  return seeded;
}

/**
 * CSV CATALOG IMPORT
 */
function importCatalogCsv(entityId, csvString, tenantId = 1) {
  if (!csvString || typeof csvString !== "string") {
    throw new Error("Invalid CSV content");
  }

  const lines = csvString.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("CSV must contain at least a header row and one item row");
  }

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const titleIdx = headers.indexOf("title");
  const priceIdx = headers.indexOf("price");
  const catIdx = headers.indexOf("category");
  const typeIdx = headers.indexOf("item_type") !== -1 ? headers.indexOf("item_type") : headers.indexOf("type");
  const descIdx = headers.indexOf("description");

  if (titleIdx === -1 || priceIdx === -1) {
    throw new Error("CSV must contain at least 'Title' and 'Price' columns");
  }

  const catMap = new Map();
  const existingCats = getCategories(entityId);
  for (const c of existingCats) {
    catMap.set(c.name.toLowerCase(), c.id);
  }

  const imported = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    const title = row[titleIdx];
    const price = parseFloat(row[priceIdx] || 0);
    if (!title || isNaN(price)) continue;

    let catId = null;
    if (catIdx !== -1 && row[catIdx]) {
      const catName = row[catIdx];
      if (catMap.has(catName.toLowerCase())) {
        catId = catMap.get(catName.toLowerCase());
      } else {
        const newCat = createCategory(entityId, { name: catName }, tenantId);
        catMap.set(catName.toLowerCase(), newCat.id);
        catId = newCat.id;
      }
    }

    const itemType = (typeIdx !== -1 && row[typeIdx]) ? row[typeIdx].toUpperCase() : "FOOD";
    const desc = descIdx !== -1 ? row[descIdx] : null;

    const item = createItem(entityId, {
      category_id: catId,
      item_type: itemType,
      title,
      base_price: price,
      short_description: desc
    }, tenantId);

    imported.push(item);
  }

  return { importedCount: imported.length, items: imported };
}

module.exports = {
  listEntities,
  getEntityById,
  getEntityBySlug,
  createEntity,
  updateEntity,
  deleteEntity,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  toggleSoldOut,
  createVariant,
  deleteVariant,
  getInventoryMatrix,
  updateDailyInventory,
  bulkUpdateInventory,
  seedStarterKit,
  importCatalogCsv
};

