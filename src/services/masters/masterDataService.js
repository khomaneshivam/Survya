const { db } = require("../../config/database");
const masterCacheService = require("./masterCacheService");

/**
 * Universal Multi-Domain Master Data Service
 * Provides ERP-grade metadata-driven CRUD, dynamic option resolution,
 * and 8-sector idempotent seeders across all business domains.
 */

const MASTER_DEFINITIONS = {
  master_domain_profiles: {
    table: "master_domain_profiles",
    singular: "domain_profile",
    codeColumn: "domain_key",
    labelColumn: "display_name",
    sortColumn: "id ASC",
    jsonColumns: ["settings_json"],
    allowedFields: ["domain_key", "display_name", "description", "icon", "is_primary", "settings_json", "active_status"]
  },
  master_locations: {
    table: "master_locations",
    singular: "location",
    codeColumn: "location_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: [],
    allowedFields: [
      "location_code", "name", "branch_type", "address_line1", "address_line2",
      "city", "state", "pincode", "country", "phone_e164", "email",
      "google_maps_url", "latitude", "longitude", "sort_order", "is_active", "active_status"
    ]
  },
  master_categories: {
    table: "master_categories",
    singular: "category",
    codeColumn: "category_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: [],
    allowedFields: [
      "category_code", "name", "domain_key", "parent_id", "description",
      "icon", "image_url", "sort_order", "active_status"
    ]
  },
  master_units: {
    table: "master_units",
    singular: "unit",
    codeColumn: "unit_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: [],
    allowedFields: ["unit_code", "name", "unit_symbol", "is_fractional", "sort_order", "active_status"]
  },
  master_tax_slabs: {
    table: "master_tax_slabs",
    singular: "tax_slab",
    codeColumn: "slab_code",
    labelColumn: "title",
    sortColumn: "tax_rate ASC, id ASC",
    jsonColumns: [],
    allowedFields: [
      "slab_code", "title", "tax_rate", "cgst_rate", "sgst_rate", "igst_rate",
      "cess_rate", "hsn_sac_default", "is_default", "active_status"
    ]
  },
  master_attributes: {
    table: "master_attributes",
    singular: "attribute",
    codeColumn: "attribute_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: ["options_json"],
    allowedFields: ["attribute_code", "name", "attribute_type", "options_json", "domain_key", "sort_order", "active_status"]
  },
  master_resources: {
    table: "master_resources",
    singular: "resource",
    codeColumn: "resource_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: ["working_hours_json"],
    allowedFields: [
      "location_id", "resource_code", "name", "resource_type", "capacity",
      "specialization", "contact_phone", "slot_duration_minutes",
      "working_hours_json", "sort_order", "active_status"
    ]
  },
  master_payment_modes: {
    table: "master_payment_modes",
    singular: "payment_mode",
    codeColumn: "mode_code",
    labelColumn: "name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: [],
    allowedFields: ["mode_code", "name", "description", "icon", "is_online", "instructions_text", "sort_order", "active_status"]
  },
  master_status_tags: {
    table: "master_status_tags",
    singular: "status_tag",
    codeColumn: "tag_code",
    labelColumn: "tag_name",
    sortColumn: "sort_order ASC, id ASC",
    jsonColumns: [],
    allowedFields: ["tag_code", "tag_name", "scope", "color_hex", "sort_order", "active_status"]
  }
};

const MASTER_ALIASES = {
  domain_profiles: "master_domain_profiles",
  domain_profile: "master_domain_profiles",
  locations: "master_locations",
  location: "master_locations",
  branches: "master_locations",
  branch: "master_locations",
  categories: "master_categories",
  category: "master_categories",
  units: "master_units",
  unit: "master_units",
  uom: "master_units",
  tax_slabs: "master_tax_slabs",
  tax_slab: "master_tax_slabs",
  taxes: "master_tax_slabs",
  tax: "master_tax_slabs",
  gst: "master_tax_slabs",
  attributes: "master_attributes",
  attribute: "master_attributes",
  resources: "master_resources",
  resource: "master_resources",
  staff: "master_resources",
  payment_modes: "master_payment_modes",
  payment_mode: "master_payment_modes",
  payments: "master_payment_modes",
  status_tags: "master_status_tags",
  status_tag: "master_status_tags",
  tags: "master_status_tags",
  tag: "master_status_tags"
};

function normalizeMasterType(typeStr) {
  if (!typeStr) return null;
  const lower = String(typeStr).toLowerCase().trim();
  if (MASTER_DEFINITIONS[lower]) return lower;
  if (MASTER_ALIASES[lower]) return MASTER_ALIASES[lower];
  if (MASTER_DEFINITIONS[`master_${lower}`]) return `master_${lower}`;
  return null;
}

function parseJsonColumns(row, jsonCols = []) {
  if (!row) return row;
  const res = { ...row };
  for (const col of jsonCols) {
    if (res[col] !== undefined && res[col] !== null) {
      if (typeof res[col] === "string") {
        try {
          res[col] = JSON.parse(res[col]);
        } catch (e) {
          // Keep as string or default
        }
      }
    }
  }
  return res;
}

class MasterDataService {
  getDefinition(masterType) {
    const norm = normalizeMasterType(masterType);
    if (!norm || !MASTER_DEFINITIONS[norm]) {
      throw new Error(`Unsupported master type: '${masterType}'`);
    }
    return MASTER_DEFINITIONS[norm];
  }

  getAllMasterTypes() {
    return Object.keys(MASTER_DEFINITIONS);
  }

  /**
   * Compiles the full master collection (list, byId, byCode) with O(1) cache.
   */
  getMasterCollection(tenantId, masterType, { forceRefresh = false, includeInactive = false } = {}) {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    if (!forceRefresh && !includeInactive) {
      const cached = masterCacheService.get(tId, norm);
      if (cached) return cached;
    }

    const whereClause = includeInactive
      ? "tenant_id = ? AND delete_status = 0"
      : "tenant_id = ? AND delete_status = 0 AND active_status = 1";

    const rows = db.prepare(`
      SELECT * FROM ${def.table}
      WHERE ${whereClause}
      ORDER BY ${def.sortColumn}
    `).all(tId);

    const list = rows.map(r => parseJsonColumns(r, def.jsonColumns));
    const byId = {};
    const byCode = {};

    for (const item of list) {
      byId[item.id] = item;
      const codeVal = item[def.codeColumn];
      if (codeVal) {
        byCode[codeVal] = item;
      }
    }

    const collection = {
      masterType: norm,
      tenantId: tId,
      count: list.length,
      list,
      byId,
      byCode
    };

    if (!includeInactive) {
      masterCacheService.set(tId, norm, collection);
    }

    return collection;
  }

  /**
   * Returns a master dictionary bundle containing all 9 master types for a tenant.
   */
  getMasterBundle(tenantId) {
    const tId = Number(tenantId) || 1;
    const bundle = {};
    for (const mType of Object.keys(MASTER_DEFINITIONS)) {
      bundle[mType] = this.getMasterCollection(tId, mType);
    }
    return bundle;
  }

  /**
   * List items with optional filtering.
   */
  listMasters(tenantId, masterType, filters = {}) {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    let query = `SELECT * FROM ${def.table} WHERE tenant_id = ? AND delete_status = 0`;
    const params = [tId];

    if (!filters.includeInactive) {
      query += ` AND active_status = 1`;
    }

    if (filters.domain_key && def.allowedFields.includes("domain_key")) {
      query += ` AND domain_key = ?`;
      params.push(filters.domain_key);
    }

    if (filters.scope && def.allowedFields.includes("scope")) {
      query += ` AND scope = ?`;
      params.push(filters.scope);
    }

    if (filters.resource_type && def.allowedFields.includes("resource_type")) {
      query += ` AND resource_type = ?`;
      params.push(filters.resource_type);
    }

    if (filters.location_id && def.allowedFields.includes("location_id")) {
      query += ` AND location_id = ?`;
      params.push(Number(filters.location_id));
    }

    if (filters.search) {
      query += ` AND (${def.labelColumn} LIKE ? OR ${def.codeColumn} LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ` ORDER BY ${def.sortColumn}`;

    const rows = db.prepare(query).all(...params);
    return rows.map(r => parseJsonColumns(r, def.jsonColumns));
  }

  getMasterById(tenantId, masterType, id) {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const row = db.prepare(`
      SELECT * FROM ${def.table}
      WHERE id = ? AND tenant_id = ? AND delete_status = 0
    `).get(id, tId);

    return parseJsonColumns(row, def.jsonColumns);
  }

  getMasterByCode(tenantId, masterType, code) {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const row = db.prepare(`
      SELECT * FROM ${def.table}
      WHERE ${def.codeColumn} = ? AND tenant_id = ? AND delete_status = 0
    `).get(code, tId);

    return parseJsonColumns(row, def.jsonColumns);
  }

  createMaster(tenantId, masterType, data, userId = "admin") {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const fields = ["tenant_id", "created_by", "updated_by"];
    const values = [tId, userId, userId];

    for (const key of def.allowedFields) {
      if (data[key] !== undefined) {
        fields.push(key);
        let val = data[key];
        if (def.jsonColumns.includes(key) && typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        values.push(val);
      }
    }

    const placeholders = fields.map(() => "?").join(", ");
    const sql = `INSERT INTO ${def.table} (${fields.join(", ")}) VALUES (${placeholders})`;

    const result = db.prepare(sql).run(...values);
    masterCacheService.invalidateTenantMasters(tId, norm);

    return this.getMasterById(tId, norm, result.lastInsertRowid || result.insertId);
  }

  updateMaster(tenantId, masterType, id, data, userId = "admin") {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const existing = this.getMasterById(tId, norm, id);
    if (!existing) {
      throw new Error(`${def.singular} not found with id ${id}`);
    }

    const updates = ["updated_by = ?", "updated_at = UTC_TIMESTAMP()"];
    const values = [userId];

    for (const key of def.allowedFields) {
      if (data[key] !== undefined) {
        updates.push(`${key} = ?`);
        let val = data[key];
        if (def.jsonColumns.includes(key) && typeof val === "object" && val !== null) {
          val = JSON.stringify(val);
        }
        values.push(val);
      }
    }

    values.push(id, tId);
    const sql = `UPDATE ${def.table} SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`;

    db.prepare(sql).run(...values);
    masterCacheService.invalidateTenantMasters(tId, norm);

    return this.getMasterById(tId, norm, id);
  }

  softDeleteMaster(tenantId, masterType, id, userId = "admin") {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const existing = this.getMasterById(tId, norm, id);
    if (!existing) {
      throw new Error(`${def.singular} not found with id ${id}`);
    }

    db.prepare(`
      UPDATE ${def.table}
      SET delete_status = 1, active_status = 0, deleted_at = UTC_TIMESTAMP(), deleted_by = ?
      WHERE id = ? AND tenant_id = ?
    `).run(userId, id, tId);

    masterCacheService.invalidateTenantMasters(tId, norm);
    return { success: true, id, masterType: norm, message: `Soft deleted ${def.singular}` };
  }

  toggleActiveStatus(tenantId, masterType, id, userId = "admin") {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const existing = this.getMasterById(tId, norm, id);
    if (!existing) {
      throw new Error(`${def.singular} not found with id ${id}`);
    }

    const newStatus = existing.active_status ? 0 : 1;
    db.prepare(`
      UPDATE ${def.table}
      SET active_status = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ?
    `).run(newStatus, userId, id, tId);

    masterCacheService.invalidateTenantMasters(tId, norm);
    return this.getMasterById(tId, norm, id);
  }

  reorderMasters(tenantId, masterType, orderedIds = [], userId = "admin") {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return { success: true, count: 0 };
    }

    const stmt = db.prepare(`
      UPDATE ${def.table}
      SET sort_order = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
      WHERE id = ? AND tenant_id = ?
    `);

    for (let i = 0; i < orderedIds.length; i++) {
      stmt.run(i, userId, orderedIds[i], tId);
    }

    masterCacheService.invalidateTenantMasters(tId, norm);
    return { success: true, count: orderedIds.length };
  }

  /**
   * Resolves dynamic options for WhatsApp interactive elements (Buttons/List)
   * or In-App Form Field dropdowns.
   */
  resolveDynamicMasterOptions(tenantId, masterType, criteria = {}) {
    const norm = normalizeMasterType(masterType);
    const def = this.getDefinition(norm);
    const tId = Number(tenantId) || 1;

    const items = this.listMasters(tId, norm, criteria);

    const options = items.map(item => ({
      value: String(item[def.codeColumn] || item.id),
      label: String(item[def.labelColumn] || item[def.codeColumn]),
      id: item.id,
      code: item[def.codeColumn],
      metadata: item
    }));

    return {
      masterType: norm,
      total: options.length,
      options
    };
  }

  /**
   * 8-Sector Idempotent Seeder
   * Scaffolds core master records for any business domain.
   */
  seedMastersForSector(tenantId, sector, userId = "system") {
    const tId = Number(tenantId) || 1;
    const secKey = String(sector || "HOSPITALITY").toUpperCase().trim();

    const results = {
      tenantId: tId,
      sector: secKey,
      seeded: {}
    };

    const helper = (type, code, itemData) => {
      const def = this.getDefinition(type);
      const existing = db.prepare(`
        SELECT id FROM ${def.table}
        WHERE tenant_id = ? AND ${def.codeColumn} = ? AND delete_status = 0
      `).get(tId, code);

      if (!existing) {
        this.createMaster(tId, type, itemData, userId);
        results.seeded[type] = (results.seeded[type] || 0) + 1;
      }
    };

    // Standard baseline tax slabs (common to India GST across sectors)
    const baselineTaxes = [
      { slab_code: "GST_0", title: "GST 0% (Exempt)", tax_rate: 0, cgst_rate: 0, sgst_rate: 0, igst_rate: 0, is_default: 0 },
      { slab_code: "GST_5", title: "GST 5% (Reduced)", tax_rate: 5, cgst_rate: 2.5, sgst_rate: 2.5, igst_rate: 5, is_default: 0 },
      { slab_code: "GST_12", title: "GST 12% (Standard Low)", tax_rate: 12, cgst_rate: 6, sgst_rate: 6, igst_rate: 12, is_default: 0 },
      { slab_code: "GST_18", title: "GST 18% (Standard)", tax_rate: 18, cgst_rate: 9, sgst_rate: 9, igst_rate: 18, is_default: 1 },
      { slab_code: "GST_28", title: "GST 28% (Luxury/Cess)", tax_rate: 28, cgst_rate: 14, sgst_rate: 14, igst_rate: 28, is_default: 0 }
    ];
    for (const tax of baselineTaxes) {
      helper("master_tax_slabs", tax.slab_code, tax);
    }

    // Standard baseline payment modes
    const baselinePayments = [
      { mode_code: "UPI_INTENT", name: "UPI (GooglePay / PhonePe / Paytm)", is_online: 1, sort_order: 1 },
      { mode_code: "RAZORPAY_GATEWAY", name: "Cards / Netbanking / Wallet (Razorpay)", is_online: 1, sort_order: 2 },
      { mode_code: "CASH_ON_DELIVERY", name: "Pay on Arrival / Cash on Delivery", is_online: 0, sort_order: 3 },
      { mode_code: "BANK_NEFT_RTGS", name: "Direct Bank Transfer (NEFT/RTGS/IMPS)", is_online: 0, sort_order: 4 }
    ];
    for (const pm of baselinePayments) {
      helper("master_payment_modes", pm.mode_code, pm);
    }

    // Sector-specific configuration
    switch (secKey) {
      case "HOSPITALITY":
        helper("master_domain_profiles", "HOSPITALITY", {
          domain_key: "HOSPITALITY",
          display_name: "Hotels, Resorts & Homestays",
          description: "Night-based lodging, room types, meal plans, and check-in/out experiences.",
          icon: "BedDouble",
          is_primary: 1
        });
        helper("master_locations", "RESORT_MAIN", {
          location_code: "RESORT_MAIN",
          name: "Main Resort & Waterfront Villas",
          branch_type: "MAIN_BRANCH",
          city: "Goa",
          state: "Goa",
          country: "India"
        });
        helper("master_categories", "DELUXE_ROOMS", {
          category_code: "DELUXE_ROOMS",
          name: "Deluxe Rooms",
          domain_key: "HOSPITALITY",
          sort_order: 1
        });
        helper("master_categories", "PREMIUM_VILLAS", {
          category_code: "PREMIUM_VILLAS",
          name: "Waterfront Private Pool Villas",
          domain_key: "HOSPITALITY",
          sort_order: 2
        });
        helper("master_categories", "FAMILY_SUITES", {
          category_code: "FAMILY_SUITES",
          name: "Family Presidential Suites",
          domain_key: "HOSPITALITY",
          sort_order: 3
        });
        helper("master_units", "NIGHT", {
          unit_code: "NIGHT",
          name: "Night",
          unit_symbol: "night",
          is_fractional: 0
        });
        helper("master_attributes", "MEAL_PLAN", {
          attribute_code: "MEAL_PLAN",
          name: "Meal Plan",
          attribute_type: "SELECT",
          options_json: ["Room Only (EP)", "Bed & Breakfast (CP)", "Breakfast + Dinner (MAP)", "All Meals (AP)"],
          domain_key: "HOSPITALITY"
        });
        helper("master_attributes", "ROOM_VIEW", {
          attribute_code: "ROOM_VIEW",
          name: "Room View",
          attribute_type: "SELECT",
          options_json: ["Sea Facing", "Garden View", "Pool View", "Mountain View"],
          domain_key: "HOSPITALITY"
        });
        helper("master_resources", "FRONT_DESK", {
          resource_code: "FRONT_DESK",
          name: "Front Desk Concierge",
          resource_type: "STAFF"
        });
        helper("master_status_tags", "BOOKING_CONFIRMED", {
          tag_code: "BOOKING_CONFIRMED",
          tag_name: "Booking Confirmed",
          scope: "BOOKING",
          color_hex: "#10B981"
        });
        helper("master_status_tags", "GUEST_CHECKED_IN", {
          tag_code: "GUEST_CHECKED_IN",
          tag_name: "Checked In",
          scope: "BOOKING",
          color_hex: "#3B82F6"
        });
        break;

      case "RETAIL_D2C":
        helper("master_domain_profiles", "RETAIL_D2C", {
          domain_key: "RETAIL_D2C",
          display_name: "Retail, D2C & Fashion eCommerce",
          description: "Inventory stock units, product sizes, colors, and parcel delivery tracking.",
          icon: "ShoppingBag",
          is_primary: 1
        });
        helper("master_locations", "CENTRAL_WAREHOUSE", {
          location_code: "CENTRAL_WAREHOUSE",
          name: "Central Fulfillment Hub",
          branch_type: "WAREHOUSE",
          city: "Mumbai",
          state: "Maharashtra"
        });
        helper("master_categories", "APPAREL_MEN", {
          category_code: "APPAREL_MEN",
          name: "Men's Apparel",
          domain_key: "RETAIL_D2C",
          sort_order: 1
        });
        helper("master_categories", "APPAREL_WOMEN", {
          category_code: "APPAREL_WOMEN",
          name: "Women's Collection",
          domain_key: "RETAIL_D2C",
          sort_order: 2
        });
        helper("master_categories", "ACCESSORIES", {
          category_code: "ACCESSORIES",
          name: "Fashion Accessories",
          domain_key: "RETAIL_D2C",
          sort_order: 3
        });
        helper("master_units", "PCS", {
          unit_code: "PCS",
          name: "Pieces",
          unit_symbol: "pcs",
          is_fractional: 0
        });
        helper("master_units", "KG", {
          unit_code: "KG",
          name: "Kilogram",
          unit_symbol: "kg",
          is_fractional: 1
        });
        helper("master_attributes", "CLOTHING_SIZE", {
          attribute_code: "CLOTHING_SIZE",
          name: "Size",
          attribute_type: "SELECT",
          options_json: ["XS", "S", "M", "L", "XL", "XXL"],
          domain_key: "RETAIL_D2C"
        });
        helper("master_attributes", "COLOR", {
          attribute_code: "COLOR",
          name: "Color",
          attribute_type: "SELECT",
          options_json: ["Black", "White", "Navy Blue", "Olive Green", "Beige", "Maroon"],
          domain_key: "RETAIL_D2C"
        });
        helper("master_status_tags", "ORDER_SHIPPED", {
          tag_code: "ORDER_SHIPPED",
          tag_name: "Dispatched / In-Transit",
          scope: "ORDER",
          color_hex: "#6366F1"
        });
        helper("master_status_tags", "ORDER_DELIVERED", {
          tag_code: "ORDER_DELIVERED",
          tag_name: "Delivered",
          scope: "ORDER",
          color_hex: "#10B981"
        });
        break;

      case "CLINIC_HEALTH":
        helper("master_domain_profiles", "CLINIC_HEALTH", {
          domain_key: "CLINIC_HEALTH",
          display_name: "Clinics, Hospitals & Healthcare",
          description: "Doctor OPD appointments, patient intake, slot duration, and test consultations.",
          icon: "Activity",
          is_primary: 1
        });
        helper("master_locations", "CITY_CLINIC", {
          location_code: "CITY_CLINIC",
          name: "Downtown Polyclinic Center",
          branch_type: "CLINIC_CENTER",
          city: "Pune",
          state: "Maharashtra"
        });
        helper("master_categories", "GENERAL_OPD", {
          category_code: "GENERAL_OPD",
          name: "General Physician OPD",
          domain_key: "CLINIC_HEALTH",
          sort_order: 1
        });
        helper("master_categories", "DENTAL_CARE", {
          category_code: "DENTAL_CARE",
          name: "Dentistry & Oral Care",
          domain_key: "CLINIC_HEALTH",
          sort_order: 2
        });
        helper("master_categories", "DERMATOLOGY", {
          category_code: "DERMATOLOGY",
          name: "Skin & Dermatology",
          domain_key: "CLINIC_HEALTH",
          sort_order: 3
        });
        helper("master_units", "CONSULTATION", {
          unit_code: "CONSULTATION",
          name: "Consultation Session",
          unit_symbol: "session",
          is_fractional: 0
        });
        helper("master_resources", "DR_SHARMA", {
          resource_code: "DR_SHARMA",
          name: "Dr. Rajesh Sharma, MD",
          resource_type: "DOCTOR",
          specialization: "Internal Medicine & Diabetology",
          slot_duration_minutes: 20
        });
        helper("master_resources", "DR_KAPOOR", {
          resource_code: "DR_KAPOOR",
          name: "Dr. Ananya Kapoor, BDS",
          resource_type: "DOCTOR",
          specialization: "Dental Surgeon",
          slot_duration_minutes: 30
        });
        helper("master_status_tags", "PATIENT_SCHEDULED", {
          tag_code: "PATIENT_SCHEDULED",
          tag_name: "Appointment Confirmed",
          scope: "CRM",
          color_hex: "#3B82F6"
        });
        break;

      case "RESTAURANT":
        helper("master_domain_profiles", "RESTAURANT", {
          domain_key: "RESTAURANT",
          display_name: "Restaurants, Cafes & Cloud Kitchens",
          description: "Dine-in table booking, digital food menu, spice levels, and takeaway orders.",
          icon: "Utensils",
          is_primary: 1
        });
        helper("master_categories", "STARTERS", {
          category_code: "STARTERS",
          name: "Appetizers & Starters",
          domain_key: "RESTAURANT",
          sort_order: 1
        });
        helper("master_categories", "MAIN_COURSE", {
          category_code: "MAIN_COURSE",
          name: "Main Course Specialties",
          domain_key: "RESTAURANT",
          sort_order: 2
        });
        helper("master_categories", "BEVERAGES", {
          category_code: "BEVERAGES",
          name: "Mocktails & Beverages",
          domain_key: "RESTAURANT",
          sort_order: 3
        });
        helper("master_units", "PORTION", {
          unit_code: "PORTION",
          name: "Portion / Plate",
          unit_symbol: "portion",
          is_fractional: 0
        });
        helper("master_attributes", "SPICE_LEVEL", {
          attribute_code: "SPICE_LEVEL",
          name: "Spice Level",
          attribute_type: "SELECT",
          options_json: ["Mild", "Medium", "Spicy", "Chef Special Hot"],
          domain_key: "RESTAURANT"
        });
        helper("master_resources", "TABLE_T1", {
          resource_code: "TABLE_T1",
          name: "Table 1 (Window Garden View, 4 Pax)",
          resource_type: "TABLE",
          capacity: 4
        });
        helper("master_resources", "TABLE_T2", {
          resource_code: "TABLE_T2",
          name: "Table 2 (Indoor Family Booth, 6 Pax)",
          resource_type: "TABLE",
          capacity: 6
        });
        helper("master_status_tags", "TABLE_RESERVED", {
          tag_code: "TABLE_RESERVED",
          tag_name: "Table Reserved",
          scope: "BOOKING",
          color_hex: "#10B981"
        });
        break;

      case "SALON_SPA":
        helper("master_domain_profiles", "SALON_SPA", {
          domain_key: "SALON_SPA",
          display_name: "Salons, Spas & Wellness Centers",
          description: "Stylist chairs, spa therapies, appointment durations, and beauty packages.",
          icon: "Sparkles",
          is_primary: 1
        });
        helper("master_categories", "HAIR_STYLING", {
          category_code: "HAIR_STYLING",
          name: "Haircuts, Spa & Color",
          domain_key: "SALON_SPA",
          sort_order: 1
        });
        helper("master_categories", "FACIAL_SKIN", {
          category_code: "FACIAL_SKIN",
          name: "Facials & Skin Rituals",
          domain_key: "SALON_SPA",
          sort_order: 2
        });
        helper("master_categories", "BODY_SPA", {
          category_code: "BODY_SPA",
          name: "Swedish & Aromatherapy Spa",
          domain_key: "SALON_SPA",
          sort_order: 3
        });
        helper("master_units", "SERVICE", {
          unit_code: "SERVICE",
          name: "Service Session",
          unit_symbol: "svc",
          is_fractional: 0
        });
        helper("master_resources", "STYLIST_ROHIT", {
          resource_code: "STYLIST_ROHIT",
          name: "Rohit (Senior Hair Artisan)",
          resource_type: "STYLIST",
          slot_duration_minutes: 45
        });
        helper("master_resources", "THERAPIST_PRIYA", {
          resource_code: "THERAPIST_PRIYA",
          name: "Priya (Senior Spa Therapist)",
          resource_type: "THERAPIST",
          slot_duration_minutes: 60
        });
        helper("master_status_tags", "SPA_SLOT_BOOKED", {
          tag_code: "SPA_SLOT_BOOKED",
          tag_name: "Session Booked",
          scope: "CRM",
          color_hex: "#8B5CF6"
        });
        break;

      case "REAL_ESTATE":
        helper("master_domain_profiles", "REAL_ESTATE", {
          domain_key: "REAL_ESTATE",
          display_name: "Real Estate & Builders",
          description: "Apartment configurations, site visits, carpet areas, and property brochures.",
          icon: "Building",
          is_primary: 1
        });
        helper("master_categories", "2BHK_LUXURY", {
          category_code: "2BHK_LUXURY",
          name: "2 BHK Luxury Residences",
          domain_key: "REAL_ESTATE",
          sort_order: 1
        });
        helper("master_categories", "3BHK_PREMIUM", {
          category_code: "3BHK_PREMIUM",
          name: "3 BHK Premium Deck Homes",
          domain_key: "REAL_ESTATE",
          sort_order: 2
        });
        helper("master_categories", "PENTHOUSES", {
          category_code: "PENTHOUSES",
          name: "Duplex Penthouse & Sky Villas",
          domain_key: "REAL_ESTATE",
          sort_order: 3
        });
        helper("master_units", "SQFT", {
          unit_code: "SQFT",
          name: "Square Feet",
          unit_symbol: "sq.ft",
          is_fractional: 1
        });
        helper("master_attributes", "FURNISHING_STATUS", {
          attribute_code: "FURNISHING_STATUS",
          name: "Furnishing Status",
          attribute_type: "SELECT",
          options_json: ["Bare Shell", "Semi-Furnished", "Fully Furnished Designer"],
          domain_key: "REAL_ESTATE"
        });
        helper("master_resources", "SITE_AGENT_AMIT", {
          resource_code: "SITE_AGENT_AMIT",
          name: "Amit Deshmukh (Relationship Manager)",
          resource_type: "AGENT",
          contact_phone: "+919876543210"
        });
        helper("master_status_tags", "SITE_VISIT_BOOKED", {
          tag_code: "SITE_VISIT_BOOKED",
          tag_name: "Site Visit Scheduled",
          scope: "CRM",
          color_hex: "#F59E0B"
        });
        break;

      case "EDUCATION":
        helper("master_domain_profiles", "EDUCATION", {
          domain_key: "EDUCATION",
          display_name: "Education, EdTech & Coaching",
          description: "Batches, course admissions, demo class booking, and test series.",
          icon: "GraduationCap",
          is_primary: 1
        });
        helper("master_categories", "FOUNDATION_BATCH", {
          category_code: "FOUNDATION_BATCH",
          name: "Comprehensive 1-Year Foundation",
          domain_key: "EDUCATION",
          sort_order: 1
        });
        helper("master_categories", "CRASH_COURSE", {
          category_code: "CRASH_COURSE",
          name: "Fast-Track Exam Crash Course",
          domain_key: "EDUCATION",
          sort_order: 2
        });
        helper("master_units", "COURSE", {
          unit_code: "COURSE",
          name: "Course Enrollment",
          unit_symbol: "course",
          is_fractional: 0
        });
        helper("master_attributes", "MEDIUM_OF_STUDY", {
          attribute_code: "MEDIUM_OF_STUDY",
          name: "Language Medium",
          attribute_type: "SELECT",
          options_json: ["English", "Hindi", "Bilingual Hinglish"],
          domain_key: "EDUCATION"
        });
        helper("master_resources", "PROF_KULKARNI", {
          resource_code: "PROF_KULKARNI",
          name: "Prof. S. Kulkarni (Head of Mathematics)",
          resource_type: "STAFF"
        });
        helper("master_status_tags", "DEMO_REGISTERED", {
          tag_code: "DEMO_REGISTERED",
          tag_name: "Free Demo Attending",
          scope: "CRM",
          color_hex: "#10B981"
        });
        break;

      case "B2B_SERVICES":
      default:
        helper("master_domain_profiles", "B2B_SERVICES", {
          domain_key: "B2B_SERVICES",
          display_name: "B2B Services, Agencies & Consulting",
          description: "Hourly consulting, retainer contracts, milestone proposals, and client onboarding.",
          icon: "Briefcase",
          is_primary: 1
        });
        helper("master_categories", "MONTHLY_RETAINER", {
          category_code: "MONTHLY_RETAINER",
          name: "Monthly Strategic Retainer",
          domain_key: "B2B_SERVICES",
          sort_order: 1
        });
        helper("master_categories", "AUDIT_SPRINT", {
          category_code: "AUDIT_SPRINT",
          name: "Architecture & Security Audit Sprint",
          domain_key: "B2B_SERVICES",
          sort_order: 2
        });
        helper("master_units", "MONTH", {
          unit_code: "MONTH",
          name: "Month",
          unit_symbol: "mo",
          is_fractional: 0
        });
        helper("master_units", "HOUR", {
          unit_code: "HOUR",
          name: "Consulting Hour",
          unit_symbol: "hr",
          is_fractional: 1
        });
        helper("master_attributes", "SLA_TIER", {
          attribute_code: "SLA_TIER",
          name: "Support SLA Tier",
          attribute_type: "SELECT",
          options_json: ["Standard 24h", "Priority 4h", "Mission-Critical 15m (24x7)"],
          domain_key: "B2B_SERVICES"
        });
        helper("master_resources", "LEAD_ARCHITECT", {
          resource_code: "LEAD_ARCHITECT",
          name: "Principal Solutions Architect",
          resource_type: "STAFF"
        });
        helper("master_status_tags", "PROPOSAL_SHARED", {
          tag_code: "PROPOSAL_SHARED",
          tag_name: "Commercial Proposal Sent",
          scope: "CRM",
          color_hex: "#EC4899"
        });
        break;
    }

    masterCacheService.invalidateTenantMasters(tId);
    return results;
  }
}

module.exports = new MasterDataService();
