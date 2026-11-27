const { db } = require("../config/database");

/**
 * Audit log helper
 */
function logAudit(tenantId, userId, action, targetId, details) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (tenant_id, user_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId || 1, userId || null, action, String(targetId || ""), details ? JSON.stringify(details) : null);
  } catch (e) {}
}

/**
 * -------------------------------------------------------------------------
 * PROPERTY SETUP & PUBLICATION LIFECYCLE
 * -------------------------------------------------------------------------
 */

function assertPropertyOwnedByTenant(propertyId, tenantId) {
  const pid = Number(propertyId);
  const tid = Number(tenantId);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(tid) || tid <= 0) {
    const err = new Error("Invalid property or workspace scope.");
    err.statusCode = 400;
    throw err;
  }
  const prop = db.prepare(`
    SELECT id, tenant_id, publication_status FROM properties
    WHERE id = ? AND COALESCE(delete_status, 0) = 0
    LIMIT 1
  `).get(pid);
  if (!prop || Number(prop.tenant_id) !== tid) {
    const err = new Error("Property not found in your workspace.");
    err.statusCode = prop ? 403 : 404;
    throw err;
  }
  return prop;
}

/**
 * Retrieve property configuration by ID
 */
function getPropertyById(propertyId, tenantId, userId = null, isAdmin = false) {
  if (!propertyId || !tenantId) return null;
  const prop = db.prepare(`
    SELECT p.*, t.name as tenant_name, t.slug as tenant_slug
    FROM properties p
    JOIN tenants t ON p.tenant_id = t.id
    WHERE p.id = ? AND p.tenant_id = ? AND COALESCE(p.delete_status, 0) = 0
    LIMIT 1
  `).get(Number(propertyId), Number(tenantId));

  if (!prop) return null;

  // Account ownership check
  if (!isAdmin && userId && prop.user_id && prop.user_id !== userId) {
    const err = new Error("Forbidden: You do not have permission to access this property.");
    err.statusCode = 403;
    throw err;
  }

  try {
    prop.social_links = JSON.parse(prop.social_links_json || "{}");
  } catch {
    prop.social_links = {};
  }
  try {
    prop.languages = JSON.parse(prop.languages_json || '["en", "hi", "mr"]');
  } catch {
    prop.languages = ["en"];
  }
  try {
    prop.gallery = JSON.parse(prop.gallery_json || "[]");
  } catch {
    prop.gallery = [];
  }

  return prop;
}

/**
 * Retrieve published property for public customer chat/portal
 */
function getPublishedProperty(propertyId = 1, tenantId = 1) {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop) return null;
  if (prop.publication_status !== "PUBLISHED") {
    const err = new Error("This property is currently not published or unavailable.");
    err.statusCode = 404;
    throw err;
  }
  return prop;
}

/**
 * List all properties for a tenant
 */
function listProperties(tenantId, userId = null, isAdmin = false, options = {}) {
  if (!tenantId) return [];
  const includeArchived = Boolean(options?.includeArchived);
  let sql = `
    SELECT p.*, 
      (SELECT COUNT(*) FROM room_types WHERE property_id = p.id AND active = 1) as room_types_count,
      (SELECT COUNT(*) FROM hospitality_facilities WHERE property_id = p.id AND is_active = 1) as facilities_count
    FROM properties p
    WHERE p.tenant_id = ?
      ${includeArchived ? "" : "AND COALESCE(p.delete_status, 0) = 0"}
  `;
  const params = [Number(tenantId)];
  if (!isAdmin && userId) {
    sql += ` AND (p.user_id = ? OR p.user_id IS NULL)`;
    params.push(userId);
  }
  sql += " ORDER BY p.id ASC";
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => {
    try {
      r.gallery = JSON.parse(r.gallery_json || "[]");
    } catch {
      r.gallery = [];
    }
    return r;
  });
}

/**
 * Create a brand-new independent property within a tenant workspace (defaults to DRAFT).
 */
function createProperty(data = {}, tenantId, userId = null) {
  if (!tenantId) {
    const err = new Error("Tenant context required to create property.");
    err.statusCode = 403;
    throw err;
  }
  const cleanName = String(data.name || "").trim();
  if (!cleanName) {
    const err = new Error("Property name is required.");
    err.statusCode = 400;
    throw err;
  }

  const pubStatus = String(data.publication_status || "DRAFT").toUpperCase() === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const socialJson = data.social_links ? JSON.stringify(data.social_links) : "{}";
  const langJson = data.languages ? JSON.stringify(data.languages) : '["en", "hi", "mr"]';
  const galleryJson = data.gallery ? JSON.stringify(data.gallery) : "[]";

  const res = db.prepare(`
    INSERT INTO properties (
      tenant_id, name, description, property_type, user_id, email, phone, website,
      social_links_json, address, district, city, state, country, postal_code,
      latitude, longitude, check_in_time, check_out_time, timezone, languages_json,
      currency, logo_url, cover_image_url, primary_image_url, gallery_json,
      publication_status, status, version, active_status, delete_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, 'ACTIVE', 1, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `).run(
    Number(tenantId),
    cleanName,
    data.description || null,
    data.property_type || "RESORT",
    userId ? String(userId) : null,
    data.email || null,
    data.phone || null,
    data.website || null,
    socialJson,
    data.address || null,
    data.district || null,
    data.city || null,
    data.state || null,
    data.country || "India",
    data.postal_code || null,
    data.latitude !== undefined ? data.latitude : null,
    data.longitude !== undefined ? data.longitude : null,
    data.check_in_time || "14:00",
    data.check_out_time || "11:00",
    data.timezone || "Asia/Kolkata",
    langJson,
    data.currency || "INR",
    data.logo_url || null,
    data.cover_image_url || null,
    data.primary_image_url || null,
    galleryJson,
    pubStatus
  );

  const createdId = Number(res.lastInsertRowid);
  logAudit(tenantId, userId, "PROPERTY_CREATED", createdId, { name: cleanName, property_type: data.property_type || "RESORT", publication_status: pubStatus });
  return getPropertyById(createdId, tenantId, userId, true);
}

/**
 * Update property configuration (with optional optimistic lock & before/after audit diff)
 */
function updateProperty(propertyId, data = {}, tenantId, userId = null, isAdmin = false) {
  const existing = getPropertyById(propertyId, tenantId, userId, isAdmin);
  if (!existing) {
    const err = new Error("Property not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  const expectedVer = data.expected_version !== undefined ? data.expected_version : data.expectedVersion;
  if (expectedVer !== undefined && expectedVer !== null && Number(expectedVer) !== Number(existing.version || 1)) {
    const err = new Error("Conflict: Property was modified by another user. Refresh before saving.");
    err.statusCode = 409;
    err.code = "OPTIMISTIC_LOCK_CONFLICT";
    throw err;
  }

  const {
    name,
    description,
    property_type,
    email,
    phone,
    website,
    social_links,
    address,
    district,
    city,
    state,
    country,
    postal_code,
    latitude,
    longitude,
    check_in_time,
    check_out_time,
    timezone,
    languages,
    currency,
    logo_url,
    cover_image_url,
    primary_image_url,
    gallery
  } = data;

  const social_links_json = social_links ? JSON.stringify(social_links) : existing.social_links_json;
  const languages_json = languages ? JSON.stringify(languages) : existing.languages_json;
  const gallery_json = gallery ? JSON.stringify(gallery) : existing.gallery_json;

  db.prepare(`
    UPDATE properties
    SET name = ?, description = ?, property_type = ?, email = ?, phone = ?,
        website = ?, social_links_json = ?, address = ?, city = ?, district = ?, state = ?,
        country = ?, postal_code = ?, latitude = ?, longitude = ?,
        check_in_time = ?, check_out_time = ?, timezone = ?, languages_json = ?,
        currency = ?, logo_url = ?, cover_image_url = ?, primary_image_url = ?,
        gallery_json = ?, version = COALESCE(version, 1) + 1, updated_at = UTC_TIMESTAMP()
    WHERE id = ? AND tenant_id = ? AND COALESCE(delete_status, 0) = 0
  `).run(
    name !== undefined ? name : existing.name,
    description !== undefined ? description : existing.description,
    property_type !== undefined ? property_type : existing.property_type,
    email !== undefined ? email : existing.email,
    phone !== undefined ? phone : existing.phone,
    website !== undefined ? website : existing.website,
    social_links_json,
    address !== undefined ? address : existing.address,
    city !== undefined ? city : existing.city,
    district !== undefined ? district : existing.district,
    state !== undefined ? state : existing.state,
    country !== undefined ? country : existing.country,
    postal_code !== undefined ? postal_code : existing.postal_code,
    latitude !== undefined ? latitude : existing.latitude,
    longitude !== undefined ? longitude : existing.longitude,
    check_in_time !== undefined ? check_in_time : existing.check_in_time,
    check_out_time !== undefined ? check_out_time : existing.check_out_time,
    timezone !== undefined ? timezone : existing.timezone,
    languages_json,
    currency !== undefined ? currency : existing.currency,
    logo_url !== undefined ? logo_url : existing.logo_url,
    cover_image_url !== undefined ? cover_image_url : existing.cover_image_url,
    primary_image_url !== undefined ? primary_image_url : existing.primary_image_url,
    gallery_json,
    propertyId,
    tenantId
  );

  logAudit(tenantId, userId, "PROPERTY_CONFIG_UPDATED", propertyId, {
    fields: Object.keys(data),
    before: { name: existing.name, city: existing.city, state: existing.state, publication_status: existing.publication_status },
    after: { name: name !== undefined ? name : existing.name, city: city !== undefined ? city : existing.city, state: state !== undefined ? state : existing.state }
  });
  return getPropertyById(propertyId, tenantId, userId, isAdmin);
}

/**
 * Archive (soft-delete) a property cleanly
 */
function archiveProperty(propertyId, tenantId, userId = null, isAdmin = false, options = {}) {
  const existing = getPropertyById(propertyId, tenantId, userId, isAdmin);
  if (!existing) {
    const err = new Error("Property not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  if (!options.force) {
    const activeConfirmed = db.prepare(`
      SELECT COUNT(*) as cnt FROM booking_enquiries
      WHERE tenant_id = ? AND property_id = ? AND status IN ('CONFIRMED', 'WON')
        AND COALESCE(delete_status, 0) = 0
    `).get(tenantId, propertyId)?.cnt || 0;
    if (activeConfirmed > 0) {
      const err = new Error(`Cannot archive property with ${activeConfirmed} active confirmed/won bookings.`);
      err.statusCode = 409;
      throw err;
    }
  }

  db.prepare(`
    UPDATE properties
    SET active_status = 0, delete_status = 1, deleted_at = UTC_TIMESTAMP(),
        deleted_by = ?, publication_status = 'ARCHIVED', status = 'ARCHIVED', updated_at = UTC_TIMESTAMP()
    WHERE id = ? AND tenant_id = ?
  `).run(userId ? String(userId) : "staff", propertyId, tenantId);

  logAudit(tenantId, userId, "PROPERTY_ARCHIVED", propertyId, { name: existing.name });
  return { success: true, message: `Property '${existing.name}' archived cleanly.` };
}

/**
 * Duplicate a property and its configuration as an independent DRAFT property
 */
function duplicateProperty(propertyId, data = {}, tenantId, userId = null, isAdmin = false) {
  const source = getPropertyById(propertyId, tenantId, userId, isAdmin);
  if (!source) {
    const err = new Error("Source property not found or access denied.");
    err.statusCode = 404;
    throw err;
  }

  const newName = String(data.name || `${source.name} (Draft Copy)`).trim();
  const created = createProperty({
    ...source,
    social_links: source.social_links,
    languages: source.languages,
    gallery: source.gallery,
    name: newName,
    publication_status: "DRAFT"
  }, tenantId, userId);

  const targetPropId = created.id;

  // Duplicate active room categories, rate plans, facilities, policies, and FAQs
  const roomMap = new Map();
  const srcRooms = db.prepare("SELECT * FROM room_types WHERE property_id = ? AND tenant_id = ? AND active = 1").all(propertyId, tenantId);
  for (const rt of srcRooms) {
    const rRes = db.prepare(`
      INSERT INTO room_types (
        tenant_id, property_id, name, max_adults, max_children, base_rate, description,
        active, room_code, room_size, size_unit, bed_type, bed_count, max_occupancy,
        standard_occupancy, extra_adult_capacity, extra_child_capacity, extra_adult_price,
        extra_child_price, bathroom_count, view_type, smoking_policy, accessibility_info,
        amenities_json, primary_image_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(
      tenantId, targetPropId, rt.name, rt.max_adults, rt.max_children, rt.base_rate, rt.description,
      rt.room_code, rt.room_size, rt.size_unit, rt.bed_type, rt.bed_count, rt.max_occupancy,
      rt.standard_occupancy, rt.extra_adult_capacity, rt.extra_child_capacity, rt.extra_adult_price,
      rt.extra_child_price, rt.bathroom_count, rt.view_type, rt.smoking_policy, rt.accessibility_info,
      rt.amenities_json, rt.primary_image_url
    );
    roomMap.set(rt.id, rRes.lastInsertRowid);
  }

  const srcPlans = db.prepare("SELECT * FROM hospitality_rate_plans WHERE property_id = ? AND tenant_id = ? AND is_active = 1").all(propertyId, tenantId);
  for (const pl of srcPlans) {
    db.prepare(`
      INSERT INTO hospitality_rate_plans (
        tenant_id, property_id, name, code, meal_plan, description, cancellation_policy,
        is_refundable, included_services_json, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(
      tenantId, targetPropId, pl.name, pl.code, pl.meal_plan || 'EP', pl.description || null,
      pl.cancellation_policy || null, pl.is_refundable ?? 1, pl.included_services_json || null
    );
  }

  const srcFacilities = db.prepare("SELECT * FROM hospitality_facilities WHERE property_id = ? AND tenant_id = ? AND is_active = 1").all(propertyId, tenantId);
  for (const fac of srcFacilities) {
    db.prepare(`
      INSERT INTO hospitality_facilities (tenant_id, property_id, category, name, description, icon, is_featured, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(tenantId, targetPropId, fac.category || 'General', fac.name, fac.description || '', fac.icon || '', fac.is_featured || 0);
  }

  const srcPolicies = db.prepare("SELECT * FROM hospitality_policies WHERE property_id = ? AND tenant_id = ?").all(propertyId, tenantId);
  for (const pol of srcPolicies) {
    db.prepare(`
      INSERT INTO hospitality_policies (tenant_id, property_id, policy_type, title, content, rules_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tenantId, targetPropId, pol.policy_type, pol.title, pol.content || '', pol.rules_json || null);
  }

  logAudit(tenantId, userId, "PROPERTY_DUPLICATED", targetPropId, { sourcePropertyId: propertyId, copiedRooms: roomMap.size });
  return created;
}

/**
 * Publish property
 */
function publishProperty(propertyId, tenantId = 1, userId = null, isAdmin = false) {
  const prop = getPropertyById(propertyId, tenantId, userId, isAdmin);
  if (!prop) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  // Validation checks before publishing
  const roomCount = db.prepare("SELECT COUNT(*) as cnt FROM room_types WHERE property_id = ? AND tenant_id = ? AND active = 1").get(propertyId, tenantId);
  if (!roomCount || roomCount.cnt === 0) {
    const err = new Error("Cannot publish property without at least 1 active room category.");
    err.statusCode = 400;
    throw err;
  }

  db.prepare(`
    UPDATE properties
    SET publication_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, published_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(userId ? String(userId) : "staff", propertyId, tenantId);

  logAudit(tenantId, userId, "PROPERTY_PUBLISHED", propertyId, { status: "PUBLISHED" });
  return { success: true, message: "Property published successfully and is now active for customer chat.", status: "PUBLISHED" };
}

/**
 * Unpublish property (returns to DRAFT)
 */
function unpublishProperty(propertyId, tenantId = 1, userId = null, isAdmin = false) {
  const prop = getPropertyById(propertyId, tenantId, userId, isAdmin);
  if (!prop) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  db.prepare(`
    UPDATE properties
    SET publication_status = 'DRAFT', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `).run(propertyId, tenantId);

  logAudit(tenantId, userId, "PROPERTY_UNPUBLISHED", propertyId, { status: "DRAFT" });
  return { success: true, message: "Property unpublished and returned to draft mode.", status: "DRAFT" };
}

/**
 * -------------------------------------------------------------------------
 * ROOM CATEGORY MANAGEMENT
 * -------------------------------------------------------------------------
 */

function listRoomCategories(propertyId = 1, tenantId = 1) {
  const rows = db.prepare(`
    SELECT rt.*,
      (SELECT COUNT(*) FROM hospitality_room_images WHERE room_type_id = rt.id) as images_count,
      (SELECT COUNT(*) FROM hospitality_physical_rooms WHERE room_type_id = rt.id) as physical_rooms_count
    FROM room_types rt
    WHERE rt.property_id = ? AND rt.tenant_id = ?
    ORDER BY rt.id ASC
  `).all(propertyId, tenantId);

  return rows.map(r => {
    try {
      r.amenities = JSON.parse(r.amenities_json || "[]");
    } catch {
      r.amenities = [];
    }
    return r;
  });
}

function getRoomCategoryById(roomTypeId, propertyId = 1, tenantId = 1) {
  const r = db.prepare(`
    SELECT * FROM room_types
    WHERE id = ? AND property_id = ? AND tenant_id = ?
    LIMIT 1
  `).get(roomTypeId, propertyId, tenantId);

  if (!r) return null;
  try {
    r.amenities = JSON.parse(r.amenities_json || "[]");
  } catch {
    r.amenities = [];
  }
  return r;
}

function createRoomCategory(arg1 = 1, arg2 = {}, arg3 = 1, arg4 = "system") {
  let propertyId = 1;
  let data = {};
  let tenantId = 1;
  let userId = "system";

  if (typeof arg2 === "object" && arg2 !== null && !Array.isArray(arg2)) {
    propertyId = Number(arg1 || 1);
    data = arg2;
    tenantId = Number(arg3 || 1);
    userId = arg4 || "system";
  } else if (typeof arg3 === "object" && arg3 !== null && !Array.isArray(arg3)) {
    tenantId = Number(arg1 || 1);
    propertyId = Number(arg2 || 1);
    data = arg3;
    userId = arg4 || "system";
  }

  const {
    name,
    room_code,
    room_size = 350,
    size_unit = "sq_ft",
    bed_type = "1 King Bed",
    bed_count = 1,
    max_adults = 2,
    max_children = 1,
    max_occupancy = 3,
    standard_occupancy = 2,
    extra_adult_capacity = 1,
    extra_child_capacity = 1,
    extra_adult_price = 1200,
    extra_child_price = 600,
    bathroom_count = 1,
    view_type = "Garden View",
    smoking_policy = "NON_SMOKING",
    accessibility_info = "",
    amenities = [],
    primary_image_url = "",
    base_rate = 3500,
    description = ""
  } = data;

  if (!name || !String(name).trim()) {
    const err = new Error("Room category name is required.");
    err.statusCode = 400;
    throw err;
  }

  assertPropertyOwnedByTenant(propertyId, tenantId);

  const amenities_json = Array.isArray(amenities) ? JSON.stringify(amenities) : (typeof amenities === "string" ? amenities : "[]");
  const cleanRate = Math.max(0, Number(base_rate) || 3500);

  const result = db.prepare(`
    INSERT INTO room_types (
      tenant_id, property_id, name, room_code, room_size, size_unit,
      bed_type, bed_count, max_adults, max_children, max_occupancy,
      standard_occupancy, extra_adult_capacity, extra_child_capacity,
      extra_adult_price, extra_child_price, bathroom_count, view_type,
      smoking_policy, accessibility_info, amenities_json, primary_image_url,
      base_rate, description, active, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, 1, 'ACTIVE'
    )
  `).run(
    tenantId, propertyId, String(name).trim(), room_code || null, Number(room_size) || 350, size_unit,
    bed_type, Number(bed_count) || 1, Number(max_adults) || 2, Number(max_children) || 1, Number(max_occupancy) || 3,
    Number(standard_occupancy) || 2, Number(extra_adult_capacity) || 1, Number(extra_child_capacity) || 1,
    Number(extra_adult_price) || 0, Number(extra_child_price) || 0, Number(bathroom_count) || 1, view_type,
    smoking_policy, accessibility_info, amenities_json, primary_image_url,
    cleanRate, description || ""
  );

  const newId = result.lastInsertRowid;
  logAudit(tenantId, userId, "ROOM_CATEGORY_CREATED", newId, { name, propertyId });
  return getRoomCategoryById(newId, propertyId, tenantId);
}

function updateRoomCategory(roomTypeId, propertyId = 1, data = {}, tenantId = 1, userId = "system") {
  const existing = getRoomCategoryById(roomTypeId, propertyId, tenantId);
  if (!existing) {
    const err = new Error("Room category not found.");
    err.statusCode = 404;
    throw err;
  }

  const amenities_json = data.amenities !== undefined
    ? (Array.isArray(data.amenities) ? JSON.stringify(data.amenities) : String(data.amenities))
    : existing.amenities_json;

  db.prepare(`
    UPDATE room_types
    SET name = ?, room_code = ?, room_size = ?, size_unit = ?,
        bed_type = ?, bed_count = ?, max_adults = ?, max_children = ?, max_occupancy = ?,
        standard_occupancy = ?, extra_adult_capacity = ?, extra_child_capacity = ?,
        extra_adult_price = ?, extra_child_price = ?, bathroom_count = ?, view_type = ?,
        smoking_policy = ?, accessibility_info = ?, amenities_json = ?, primary_image_url = ?,
        base_rate = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(
    data.name !== undefined ? data.name : existing.name,
    data.room_code !== undefined ? data.room_code : existing.room_code,
    data.room_size !== undefined ? Number(data.room_size) : existing.room_size,
    data.size_unit !== undefined ? data.size_unit : existing.size_unit,
    data.bed_type !== undefined ? data.bed_type : existing.bed_type,
    data.bed_count !== undefined ? Number(data.bed_count) : existing.bed_count,
    data.max_adults !== undefined ? Number(data.max_adults) : existing.max_adults,
    data.max_children !== undefined ? Number(data.max_children) : existing.max_children,
    data.max_occupancy !== undefined ? Number(data.max_occupancy) : existing.max_occupancy,
    data.standard_occupancy !== undefined ? Number(data.standard_occupancy) : existing.standard_occupancy,
    data.extra_adult_capacity !== undefined ? Number(data.extra_adult_capacity) : existing.extra_adult_capacity,
    data.extra_child_capacity !== undefined ? Number(data.extra_child_capacity) : existing.extra_child_capacity,
    data.extra_adult_price !== undefined ? Number(data.extra_adult_price) : existing.extra_adult_price,
    data.extra_child_price !== undefined ? Number(data.extra_child_price) : existing.extra_child_price,
    data.bathroom_count !== undefined ? Number(data.bathroom_count) : existing.bathroom_count,
    data.view_type !== undefined ? data.view_type : existing.view_type,
    data.smoking_policy !== undefined ? data.smoking_policy : existing.smoking_policy,
    data.accessibility_info !== undefined ? data.accessibility_info : existing.accessibility_info,
    amenities_json,
    data.primary_image_url !== undefined ? data.primary_image_url : existing.primary_image_url,
    data.base_rate !== undefined ? Number(data.base_rate) : existing.base_rate,
    data.description !== undefined ? data.description : existing.description,
    data.status !== undefined ? data.status : existing.status,
    roomTypeId,
    propertyId,
    tenantId
  );

  logAudit(tenantId, userId, "ROOM_CATEGORY_UPDATED", roomTypeId, { fields: Object.keys(data) });
  return getRoomCategoryById(roomTypeId, propertyId, tenantId);
}

function archiveRoomCategory(roomTypeId, propertyId = 1, tenantId = 1, userId = "system") {
  db.prepare(`
    UPDATE room_types
    SET active = 0, status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(roomTypeId, propertyId, tenantId);

  logAudit(tenantId, userId, "ROOM_CATEGORY_ARCHIVED", roomTypeId, { status: "ARCHIVED" });
  return { success: true, message: "Room category archived." };
}

/**
 * -------------------------------------------------------------------------
 * ROOM PHOTOGRAPHS & GALLERY
 * -------------------------------------------------------------------------
 */

function listRoomImages(roomTypeId, tenantId = 1, propertyId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_room_images
    WHERE room_type_id = ? AND tenant_id = ?
    ORDER BY is_primary DESC, display_order ASC, id ASC
  `).all(roomTypeId, tenantId);
}

function addRoomImage(arg1 = 1, arg2 = 1, arg3 = {}, arg4 = 1, arg5 = "system") {
  let propertyId = 1;
  let roomTypeId = 1;
  let data = {};
  let tenantId = 1;
  let userId = "system";

  if (typeof arg3 === "object" && arg3 !== null) {
    propertyId = Number(arg1 || 1);
    roomTypeId = Number(arg2 || 1);
    data = arg3;
    tenantId = Number(arg4 || 1);
    userId = arg5 || "system";
  } else if (typeof arg4 === "object" && arg4 !== null) {
    tenantId = Number(arg1 || 1);
    propertyId = Number(arg2 || 1);
    roomTypeId = Number(arg3 || 1);
    data = arg4;
    userId = arg5 || "system";
  }

  const { image_url, caption = "", alt_text = "", is_primary = false, display_order = 0 } = data;
  if (!image_url || !String(image_url).trim()) {
    const err = new Error("Image URL is required.");
    err.statusCode = 400;
    throw err;
  }

  const existingCount = Number(db.prepare("SELECT COUNT(*) as cnt FROM hospitality_room_images WHERE room_type_id = ? AND tenant_id = ?").get(roomTypeId, tenantId)?.cnt || 0);
  const shouldBePrimary = Boolean(is_primary) || existingCount === 0;

  if (shouldBePrimary) {
    db.prepare(`
      UPDATE hospitality_room_images SET is_primary = 0 WHERE room_type_id = ? AND tenant_id = ?
    `).run(roomTypeId, tenantId);
  }

  const result = db.prepare(`
    INSERT INTO hospitality_room_images (
      tenant_id, property_id, room_type_id, image_url, caption, alt_text, is_primary, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenantId, propertyId, roomTypeId, String(image_url).trim(), caption || "", alt_text || "", shouldBePrimary ? 1 : 0, Number(display_order) || 0
  );

  if (shouldBePrimary) {
    db.prepare("UPDATE room_types SET primary_image_url = ? WHERE id = ?").run(String(image_url).trim(), roomTypeId);
  }

  logAudit(tenantId, userId, "ROOM_IMAGE_ADDED", result.lastInsertRowid, { roomTypeId, image_url });
  return db.prepare("SELECT * FROM hospitality_room_images WHERE id = ?").get(result.lastInsertRowid);
}

function setPrimaryImage(imageId, roomTypeId, tenantId = 1, userId = "system") {
  db.prepare(`
    UPDATE hospitality_room_images SET is_primary = 0 WHERE room_type_id = ? AND tenant_id = ?
  `).run(roomTypeId, tenantId);

  db.prepare(`
    UPDATE hospitality_room_images SET is_primary = 1 WHERE id = ? AND room_type_id = ? AND tenant_id = ?
  `).run(imageId, roomTypeId, tenantId);

  const img = db.prepare("SELECT image_url FROM hospitality_room_images WHERE id = ? AND tenant_id = ?").get(imageId, tenantId);
  if (img?.image_url) {
    db.prepare("UPDATE room_types SET primary_image_url = ? WHERE id = ? AND tenant_id = ?").run(img.image_url, roomTypeId, tenantId);
  }

  logAudit(tenantId, userId, "ROOM_PRIMARY_IMAGE_SET", imageId, { roomTypeId });
  return { success: true, message: "Primary image updated." };
}

function reorderImages(roomTypeId, imageIds = [], tenantId = 1) {
  if (!Array.isArray(imageIds)) return { success: false };
  imageIds.forEach((id, index) => {
    db.prepare(`
      UPDATE hospitality_room_images
      SET display_order = ?
      WHERE id = ? AND room_type_id = ? AND tenant_id = ?
    `).run(index, id, roomTypeId, tenantId);
  });
  return { success: true, message: "Images reordered." };
}

function deleteRoomImage(imageId, roomTypeId, tenantId = 1, userId = "system") {
  const existing = db.prepare("SELECT * FROM hospitality_room_images WHERE id = ? AND room_type_id = ? AND tenant_id = ?").get(imageId, roomTypeId, tenantId);

  db.prepare(`
    DELETE FROM hospitality_room_images
    WHERE id = ? AND room_type_id = ? AND tenant_id = ?
  `).run(imageId, roomTypeId, tenantId);

  if (existing && Number(existing.is_primary) === 1) {
    const nextImg = db.prepare("SELECT * FROM hospitality_room_images WHERE room_type_id = ? AND tenant_id = ? ORDER BY display_order ASC, id ASC LIMIT 1").get(roomTypeId, tenantId);
    if (nextImg) {
      db.prepare("UPDATE hospitality_room_images SET is_primary = 1 WHERE id = ? AND tenant_id = ?").run(nextImg.id, tenantId);
      db.prepare("UPDATE room_types SET primary_image_url = ? WHERE id = ? AND tenant_id = ?").run(nextImg.image_url, roomTypeId, tenantId);
    } else {
      db.prepare("UPDATE room_types SET primary_image_url = NULL WHERE id = ? AND tenant_id = ?").run(roomTypeId, tenantId);
    }
  }

  logAudit(tenantId, userId, "ROOM_IMAGE_DELETED", imageId, { roomTypeId });
  return { success: true, message: "Image removed." };
}

/**
 * -------------------------------------------------------------------------
 * PROPERTY PHOTO GALLERY MANAGEMENT
 * -------------------------------------------------------------------------
 */

function getPropertyGallery(propertyId = 1, tenantId = 1, publishedOnly = false) {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop || (publishedOnly && prop.publication_status !== "PUBLISHED")) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  const propertyGallery = Array.isArray(prop.gallery) ? prop.gallery : [];
  const roomCategories = listRoomCategories(propertyId, tenantId).filter(r => r.active && r.status === "ACTIVE");

  const roomGalleries = roomCategories.map(rc => {
    const images = listRoomImages(rc.id, tenantId, propertyId);
    return {
      room_type_id: rc.id,
      room_name: rc.name,
      base_rate: rc.base_rate,
      primary_image_url: rc.primary_image_url,
      images
    };
  });

  // Flat all_photos list tagged with clean categories for the frontend gallery lightbox
  const allPhotos = [];

  // 1. Property-level photos
  propertyGallery.forEach((img, idx) => {
    allPhotos.push({
      id: img.id || `prop_img_${idx}`,
      type: "PROPERTY",
      category: img.category || "Resort & Amenities",
      image_url: img.image_url,
      caption: img.caption || prop.name,
      alt_text: img.alt_text || "Property Photo",
      is_primary: Boolean(img.is_primary),
      display_order: img.display_order !== undefined ? img.display_order : idx
    });
  });

  // 2. Room category photos
  roomGalleries.forEach(rg => {
    rg.images.forEach(img => {
      allPhotos.push({
        id: `room_img_${img.id}`,
        type: "ROOM",
        room_type_id: rg.room_type_id,
        room_name: rg.room_name,
        category: rg.room_name,
        image_url: img.image_url,
        caption: img.caption || `${rg.room_name} View`,
        alt_text: img.alt_text || rg.room_name,
        is_primary: Boolean(img.is_primary),
        display_order: img.display_order || 0
      });
    });
  });

  return {
    property: {
      id: prop.id,
      name: prop.name,
      city: prop.city,
      address: prop.address,
      cover_image_url: prop.cover_image_url,
      logo_url: prop.logo_url
    },
    property_gallery: propertyGallery,
    room_galleries: roomGalleries,
    all_photos: allPhotos,
    total_photos: allPhotos.length
  };
}

function addPropertyGalleryImage(propertyId = 1, imageData = {}, tenantId = 1, userId = "system") {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  const { image_url, caption = "", category = "Resort & Amenities", alt_text = "", is_primary = false } = imageData;
  if (!image_url || !String(image_url).trim()) {
    const err = new Error("Image URL is required.");
    err.statusCode = 400;
    throw err;
  }

  const currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  const newImageId = `prop_img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const shouldBePrimary = Boolean(is_primary) || currentGallery.length === 0;

  if (shouldBePrimary) {
    currentGallery.forEach(img => { img.is_primary = false; });
  }

  const newImage = {
    id: newImageId,
    image_url: String(image_url).trim(),
    caption: caption || prop.name,
    category: category || "Resort & Amenities",
    alt_text: alt_text || caption || "Property view",
    is_primary: shouldBePrimary,
    display_order: currentGallery.length + 1
  };

  currentGallery.push(newImage);

  const updates = [JSON.stringify(currentGallery)];
  let sql = "UPDATE properties SET gallery_json = ?, updated_at = CURRENT_TIMESTAMP";

  if (shouldBePrimary) {
    sql += ", cover_image_url = ?";
    updates.push(newImage.image_url);
  }

  sql += " WHERE id = ? AND tenant_id = ?";
  updates.push(propertyId, tenantId);

  db.prepare(sql).run(...updates);
  logAudit(tenantId, userId, "PROPERTY_GALLERY_IMAGE_ADDED", newImageId, { propertyId, image_url });

  return newImage;
}

function deletePropertyGalleryImage(propertyId = 1, imageId, tenantId = 1, userId = "system") {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  let currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  const removed = currentGallery.find(img => String(img.id) === String(imageId));
  currentGallery = currentGallery.filter(img => String(img.id) !== String(imageId));

  if (removed && removed.is_primary && currentGallery.length > 0) {
    currentGallery[0].is_primary = true;
    db.prepare(`
      UPDATE properties SET gallery_json = ?, cover_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?
    `).run(JSON.stringify(currentGallery), currentGallery[0].image_url, propertyId, tenantId);
  } else {
    db.prepare(`
      UPDATE properties SET gallery_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?
    `).run(JSON.stringify(currentGallery), propertyId, tenantId);
  }

  logAudit(tenantId, userId, "PROPERTY_GALLERY_IMAGE_DELETED", imageId, { propertyId });
  return { success: true, message: "Gallery image deleted." };
}

function setPropertyGalleryPrimary(propertyId = 1, imageId, tenantId = 1, userId = "system") {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop) {
    const err = new Error("Property not found.");
    err.statusCode = 404;
    throw err;
  }

  const currentGallery = Array.isArray(prop.gallery) ? [...prop.gallery] : [];
  let targetUrl = null;

  currentGallery.forEach(img => {
    if (String(img.id) === String(imageId)) {
      img.is_primary = true;
      targetUrl = img.image_url;
    } else {
      img.is_primary = false;
    }
  });

  if (!targetUrl) {
    const err = new Error("Gallery image not found.");
    err.statusCode = 404;
    throw err;
  }

  db.prepare(`
    UPDATE properties SET gallery_json = ?, cover_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?
  `).run(JSON.stringify(currentGallery), targetUrl, propertyId, tenantId);

  logAudit(tenantId, userId, "PROPERTY_GALLERY_PRIMARY_SET", imageId, { propertyId });
  return { success: true, message: "Primary property cover image updated." };
}

/**
 * -------------------------------------------------------------------------
 * PHYSICAL ROOMS (KEY TRACKING)
 * -------------------------------------------------------------------------
 */

function listPhysicalRooms(propertyId = 1, roomTypeId = null, tenantId = 1) {
  let sql = `
    SELECT pr.*, rt.name as room_type_name
    FROM hospitality_physical_rooms pr
    LEFT JOIN room_types rt ON pr.room_type_id = rt.id
    WHERE pr.property_id = ? AND pr.tenant_id = ?
  `;
  const params = [propertyId, tenantId];
  if (roomTypeId) {
    sql += ` AND pr.room_type_id = ?`;
    params.push(roomTypeId);
  }
  sql += " ORDER BY pr.room_number ASC";
  return db.prepare(sql).all(...params);
}

function createPhysicalRoom(arg1 = 1, arg2 = {}, arg3 = 1, arg4 = "system") {
  let propertyId = 1;
  let data = {};
  let tenantId = 1;
  let userId = "system";

  if (typeof arg2 === "object" && arg2 !== null) {
    propertyId = Number(arg1 || 1);
    data = arg2;
    tenantId = Number(arg3 || 1);
    userId = arg4 || "system";
  } else if (typeof arg3 === "object" && arg3 !== null) {
    tenantId = Number(arg1 || 1);
    propertyId = Number(arg2 || 1);
    data = arg3;
    userId = arg4 || "system";
  }

  const { room_type_id, room_number, floor = "", floor_or_building = "", operational_status = "OPERATIONAL", notes = "" } = data;
  if (!room_type_id || !room_number) {
    const err = new Error("Room category and room number are required.");
    err.statusCode = 400;
    throw err;
  }

  const resolvedFloor = floor_or_building || floor || "";

  const result = db.prepare(`
    INSERT INTO hospitality_physical_rooms (
      tenant_id, property_id, room_type_id, room_number, floor_or_building, operational_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenantId, propertyId, room_type_id, String(room_number).trim(), resolvedFloor, operational_status, notes || ""
  );

  logAudit(tenantId, userId, "PHYSICAL_ROOM_CREATED", result.lastInsertRowid, { room_number, room_type_id });
  return db.prepare("SELECT * FROM hospitality_physical_rooms WHERE id = ?").get(result.lastInsertRowid);
}

function updatePhysicalRoom(roomId, propertyId = 1, data = {}, tenantId = 1) {
  const existing = db.prepare("SELECT * FROM hospitality_physical_rooms WHERE id = ? AND property_id = ? AND tenant_id = ?").get(roomId, propertyId, tenantId);
  if (!existing) {
    const err = new Error("Physical room not found.");
    err.statusCode = 404;
    throw err;
  }

  const resolvedFloor = data.floor_or_building !== undefined ? data.floor_or_building : (data.floor !== undefined ? data.floor : existing.floor_or_building);

  db.prepare(`
    UPDATE hospitality_physical_rooms
    SET room_number = ?, floor_or_building = ?, operational_status = ?, notes = ?
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(
    data.room_number !== undefined ? data.room_number : existing.room_number,
    resolvedFloor,
    data.operational_status !== undefined ? data.operational_status : existing.operational_status,
    data.notes !== undefined ? data.notes : existing.notes,
    roomId,
    propertyId,
    tenantId
  );

  return db.prepare("SELECT * FROM hospitality_physical_rooms WHERE id = ?").get(roomId);
}

function deletePhysicalRoom(roomId, propertyId = 1, tenantId = 1) {
  db.prepare(`
    DELETE FROM hospitality_physical_rooms
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(roomId, propertyId, tenantId);

  return { success: true, message: "Physical room removed." };
}

/**
 * -------------------------------------------------------------------------
 * FACILITIES, POLICIES & FAQS
 * -------------------------------------------------------------------------
 */

function listFacilities(propertyId = 1, tenantId = 1, category = null) {
  let sql = `
    SELECT * FROM hospitality_facilities
    WHERE property_id = ? AND tenant_id = ?
  `;
  const params = [propertyId, tenantId];
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  sql += " ORDER BY category ASC, name ASC";
  return db.prepare(sql).all(...params);
}

function addFacility(propertyId = 1, data = {}, tenantId = 1) {
  assertPropertyOwnedByTenant(propertyId, tenantId);
  const { name, category = "General", description = "", icon = "", is_featured = 0, is_active = 1 } = data;
  if (!name) throw new Error("Facility name is required.");

  const result = db.prepare(`
    INSERT INTO hospitality_facilities (
      tenant_id, property_id, category, name, description, icon, is_featured, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tenantId, propertyId, category, name, description, icon, is_featured ? 1 : 0, is_active ? 1 : 0);

  return db.prepare("SELECT * FROM hospitality_facilities WHERE id = ? AND tenant_id = ?").get(result.lastInsertRowid, tenantId);
}

function updateFacility(facilityId, propertyId = 1, data = {}, tenantId = 1) {
  assertPropertyOwnedByTenant(propertyId, tenantId);
  db.prepare(`
    UPDATE hospitality_facilities
    SET name = COALESCE(?, name), category = COALESCE(?, category), description = COALESCE(?, description),
        icon = COALESCE(?, icon), is_featured = COALESCE(?, is_featured), is_active = COALESCE(?, is_active)
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(data.name ?? null, data.category ?? null, data.description ?? null, data.icon ?? null, data.is_featured ?? null, data.is_active ?? null, facilityId, propertyId, tenantId);

  return db.prepare("SELECT * FROM hospitality_facilities WHERE id = ? AND tenant_id = ?").get(facilityId, tenantId);
}

function deleteFacility(facilityId, propertyId = 1, tenantId = 1) {
  db.prepare("DELETE FROM hospitality_facilities WHERE id = ? AND property_id = ? AND tenant_id = ?").run(facilityId, propertyId, tenantId);
  return { success: true };
}

function listPolicies(propertyId = 1, tenantId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_policies
    WHERE property_id = ? AND tenant_id = ?
    ORDER BY policy_type ASC
  `).all(propertyId, tenantId);
}

function upsertPolicy(propertyId = 1, data = {}, tenantId = 1) {
  const { policy_type, title, content } = data;
  if (!policy_type || !content) throw new Error("policy_type and content are required.");

  const existing = db.prepare(`
    SELECT id FROM hospitality_policies
    WHERE property_id = ? AND tenant_id = ? AND policy_type = ?
  `).get(propertyId, tenantId, policy_type);

  if (existing) {
    db.prepare(`
      UPDATE hospitality_policies
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title || policy_type, content, existing.id);
  } else {
    db.prepare(`
      INSERT INTO hospitality_policies (tenant_id, property_id, policy_type, title, content, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(tenantId, propertyId, policy_type, title || policy_type, content);
  }

  return db.prepare("SELECT * FROM hospitality_policies WHERE property_id = ? AND tenant_id = ? AND policy_type = ?").get(propertyId, tenantId, policy_type);
}

function listFaqs(propertyId = 1, tenantId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_faqs
    WHERE property_id = ? AND tenant_id = ? AND is_active = 1
    ORDER BY id ASC
  `).all(propertyId, tenantId);
}

function createFaq(propertyId = 1, data = {}, tenantId = 1) {
  assertPropertyOwnedByTenant(propertyId, tenantId);
  const { question, answer, category = "General", display_order = 0 } = data;
  if (!question || !answer) throw new Error("question and answer are required.");

  const res = db.prepare(`
    INSERT INTO hospitality_faqs (tenant_id, property_id, category, question, answer, display_order, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(tenantId, propertyId, category, question, answer, Number(display_order) || 0);

  return db.prepare("SELECT * FROM hospitality_faqs WHERE id = ? AND tenant_id = ?").get(res.lastInsertRowid, tenantId);
}

function updateFaq(faqId, propertyId = 1, data = {}, tenantId = 1) {
  assertPropertyOwnedByTenant(propertyId, tenantId);
  db.prepare(`
    UPDATE hospitality_faqs
    SET question = COALESCE(?, question), answer = COALESCE(?, answer), category = COALESCE(?, category),
        display_order = COALESCE(?, display_order)
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(data.question ?? null, data.answer ?? null, data.category ?? null, data.display_order ?? null, faqId, propertyId, tenantId);

  return db.prepare("SELECT * FROM hospitality_faqs WHERE id = ? AND tenant_id = ?").get(faqId, tenantId);
}

function deleteFaq(faqId, propertyId = 1, tenantId = 1) {
  db.prepare("UPDATE hospitality_faqs SET is_active = 0 WHERE id = ? AND property_id = ? AND tenant_id = ?").run(faqId, propertyId, tenantId);
  return { success: true };
}

/**
 * -------------------------------------------------------------------------
 * OVERVIEW & COMPLETENESS DASHBOARD
 * -------------------------------------------------------------------------
 */
function getSetupOverview(propertyId, tenantId) {
  const prop = getPropertyById(propertyId, tenantId, null, true);
  if (!prop) return null;

  const resolvedPropId = prop.id;
  const resolvedTenantId = prop.tenant_id;

  const roomCount = Number(db.prepare("SELECT COUNT(*) as c FROM room_types WHERE property_id = ? AND tenant_id = ? AND active = 1").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const imagesCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_room_images WHERE property_id = ? AND tenant_id = ?").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const ratePlansCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_rate_plans WHERE property_id = ? AND tenant_id = ? AND is_active = 1").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const facilitiesCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_facilities WHERE property_id = ? AND tenant_id = ? AND is_active = 1").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const policiesCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_policies WHERE property_id = ? AND tenant_id = ?").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const faqsCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_faqs WHERE property_id = ? AND tenant_id = ? AND is_active = 1").get(resolvedPropId, resolvedTenantId)?.c || 0);
  const seasonalRatesCount = Number(db.prepare("SELECT COUNT(*) as c FROM hospitality_seasonal_rates WHERE property_id = ? AND tenant_id = ? AND active = 1").get(resolvedPropId, resolvedTenantId)?.c || 0);

  let score = 0;
  if (prop.name) score += 10;
  if (prop.address) score += 10;
  if (prop.cover_image_url || prop.logo_url) score += 10;
  if (roomCount > 0) score += 25;
  if (imagesCount > 0) score += 10;
  if (ratePlansCount > 0) score += 15;
  if (policiesCount >= 2) score += 10;
  if (facilitiesCount >= 3) score += 10;

  const isPublishReady = roomCount > 0 && ratePlansCount > 0 && Boolean(prop.name);

  const recentAudits = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE tenant_id = ? AND (action LIKE '%ROOM%' OR action LIKE '%PROPERTY%' OR action LIKE '%RATE%' OR action LIKE '%INVENTORY%')
    ORDER BY id DESC LIMIT 10
  `).all(resolvedTenantId);

  return {
    property: prop,
    completeness_score: Math.min(100, score),
    completionPercentage: Math.min(100, score),
    ready_for_publication: isPublishReady,
    isPublishReady,
    publication_status: prop.publication_status,
    publicationStatus: prop.publication_status,
    metrics: {
      activeRooms: roomCount,
      totalImages: imagesCount,
      ratePlans: ratePlansCount,
      seasonalPeriods: seasonalRatesCount,
      facilities: facilitiesCount,
      policies: policiesCount,
      faqs: faqsCount
    },
    checks: {
      basic_info: { label: "Property Info & Address", passed: Boolean(prop.name) },
      branding: { label: "Logo & Cover Imagery", passed: Boolean(prop.cover_image_url || prop.logo_url) },
      room_categories: { label: "Room Categories Setup", passed: roomCount > 0 },
      photographs: { label: "Room Photographs", passed: imagesCount > 0 },
      rate_plans: { label: "Meal & Rate Plans", passed: ratePlansCount > 0 },
      policies: { label: "Property Policies", passed: policiesCount >= 2 },
      facilities: { label: "Resort Facilities", passed: facilitiesCount >= 3 },
      tax_rules: { label: "GST Tax Rules", passed: true }
    },
    recentAudits
  };
}

module.exports = {
  assertPropertyOwnedByTenant,
  getPropertyById,
  getPublishedProperty,
  listProperties,
  createProperty,
  updateProperty,
  archiveProperty,
  duplicateProperty,
  publishProperty,
  unpublishProperty,
  listRoomCategories,
  getRoomCategoryById,
  createRoomCategory,
  updateRoomCategory,
  archiveRoomCategory,
  listRoomImages,
  addRoomImage,
  setPrimaryImage,
  reorderImages,
  deleteRoomImage,
  listPhysicalRooms,
  createPhysicalRoom,
  updatePhysicalRoom,
  deletePhysicalRoom,
  listFacilities,
  addFacility,
  updateFacility,
  deleteFacility,
  listPolicies,
  upsertPolicy,
  listFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  getSetupOverview,
  getPropertyGallery,
  addPropertyGalleryImage,
  deletePropertyGalleryImage,
  setPropertyGalleryPrimary
};
