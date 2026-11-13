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
  } catch (e) {
    // Audit logging shouldn't crash caller
  }
}

/**
 * List all room types for a property/tenant
 */
function listRoomTypes(tenantId = 1, propertyId = 1, includeInactive = false) {
  let sql = `
    SELECT id, tenant_id, property_id, name, max_adults, max_children, base_rate, description, active, created_at, updated_at
    FROM room_types
    WHERE tenant_id = ? AND property_id = ?
  `;
  const params = [tenantId, propertyId];
  if (!includeInactive) {
    sql += " AND active = 1";
  }
  sql += " ORDER BY id ASC";
  return db.prepare(sql).all(...params);
}

/**
 * Get single room type by ID
 */
function getRoomTypeById(tenantId = 1, id) {
  return db.prepare(`
    SELECT * FROM room_types WHERE tenant_id = ? AND id = ?
  `).get(tenantId, id);
}

/**
 * Create a new room type and seed 30 days of inventory
 */
function createRoomType(tenantId = 1, data = {}, userId = "system") {
  const { name, property_id = 1, max_adults = 2, max_children = 2, base_rate = 3500, description = "" } = data;
  if (!name || !String(name).trim()) {
    throw new Error("Room type name is required.");
  }
  const cleanRate = Number(base_rate) > 0 ? Number(base_rate) : 3500;

  const result = db.prepare(`
    INSERT INTO room_types (tenant_id, property_id, name, max_adults, max_children, base_rate, description, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(tenantId, property_id, String(name).trim(), Number(max_adults) || 2, Number(max_children) || 0, cleanRate, description || "");

  const roomTypeId = result.lastInsertRowid;

  // Auto-seed next 30 days of inventory
  const insertInv = db.prepare(`
    INSERT OR IGNORE INTO room_inventory_daily (tenant_id, room_type_id, inventory_date, available_qty, base_rate, is_closed, updated_by)
    VALUES (?, ?, ?, 5, ?, 0, ?)
  `);
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    insertInv.run(tenantId, roomTypeId, dateStr, cleanRate, userId);
  }

  logAudit(tenantId, userId, "ROOM_TYPE_CREATED", roomTypeId, { name, base_rate: cleanRate });
  return getRoomTypeById(tenantId, roomTypeId);
}

/**
 * Update room type
 */
function updateRoomType(tenantId = 1, id, data = {}, userId = "system") {
  const existing = getRoomTypeById(tenantId, id);
  if (!existing) {
    throw new Error("Room type not found.");
  }

  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  const max_adults = data.max_adults !== undefined ? Number(data.max_adults) : existing.max_adults;
  const max_children = data.max_children !== undefined ? Number(data.max_children) : existing.max_children;
  const base_rate = data.base_rate !== undefined ? Number(data.base_rate) : existing.base_rate;
  const description = data.description !== undefined ? String(data.description) : existing.description;
  const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

  db.prepare(`
    UPDATE room_types 
    SET name = ?, max_adults = ?, max_children = ?, base_rate = ?, description = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = ? AND id = ?
  `).run(name, max_adults, max_children, base_rate, description, active, tenantId, id);

  logAudit(tenantId, userId, "ROOM_TYPE_UPDATED", id, { name, base_rate, active });
  return getRoomTypeById(tenantId, id);
}

/**
 * Read manual inventory availability for date range (PRD Section 8: GET /api/v1/inventory/availability)
 */
function getAvailability(tenantId = 1, startDate, endDate, roomTypeId = null) {
  // Default range: today to today + 14 days
  const now = new Date();
  const defStart = now.toISOString().split("T")[0];
  const later = new Date(now);
  later.setDate(later.getDate() + 14);
  const defEnd = later.toISOString().split("T")[0];

  const start = startDate || defStart;
  const end = endDate || defEnd;

  let sql = `
    SELECT i.id, i.tenant_id, i.room_type_id, r.name as room_type_name,
           i.inventory_date, i.available_qty, i.base_rate, i.is_closed, i.updated_at
    FROM room_inventory_daily i
    JOIN room_types r ON i.room_type_id = r.id
    WHERE i.tenant_id = ? AND i.inventory_date >= ? AND i.inventory_date <= ?
  `;
  const params = [tenantId, start, end];
  if (roomTypeId) {
    sql += " AND i.room_type_id = ?";
    params.push(roomTypeId);
  }
  sql += " ORDER BY i.inventory_date ASC, i.room_type_id ASC";

  const rows = db.prepare(sql).all(...params);

  // Group by room type for structured frontend presentation
  const roomTypes = listRoomTypes(tenantId, 1, false);
  const grouped = {};

  for (const rt of roomTypes) {
    grouped[rt.id] = {
      room_type_id: rt.id,
      name: rt.name,
      base_rate: rt.base_rate,
      max_adults: rt.max_adults,
      max_children: rt.max_children,
      dates: {},
      min_available: Infinity,
      is_any_closed: false
    };
  }

  for (const row of rows) {
    if (!grouped[row.room_type_id]) {
      grouped[row.room_type_id] = {
        room_type_id: row.room_type_id,
        name: row.room_type_name,
        base_rate: row.base_rate,
        dates: {},
        min_available: Infinity,
        is_any_closed: false
      };
    }
    grouped[row.room_type_id].dates[row.inventory_date] = {
      available_qty: row.available_qty,
      base_rate: row.base_rate,
      is_closed: Boolean(row.is_closed)
    };
    if (row.available_qty < grouped[row.room_type_id].min_available) {
      grouped[row.room_type_id].min_available = row.available_qty;
    }
    if (row.is_closed) {
      grouped[row.room_type_id].is_any_closed = true;
    }
  }

  // Sanitize Infinity if no records for that room
  for (const k of Object.keys(grouped)) {
    if (grouped[k].min_available === Infinity) {
      grouped[k].min_available = 0;
    }
  }

  return {
    start_date: start,
    end_date: end,
    items: rows,
    by_room_type: Object.values(grouped)
  };
}

/**
 * Bulk upsert manual date-wise inventory (PRD Section 8: PUT /api/v1/inventory/daily)
 */
function bulkUpdateInventory(tenantId = 1, updates = [], userId = "system") {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { success: true, updated_count: 0 };
  }

  const upsert = db.prepare(`
    INSERT INTO room_inventory_daily (tenant_id, room_type_id, inventory_date, available_qty, base_rate, is_closed, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(room_type_id, inventory_date) DO UPDATE SET
      available_qty = excluded.available_qty,
      base_rate = excluded.base_rate,
      is_closed = excluded.is_closed,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const item of updates) {
      const roomTypeId = Number(item.room_type_id);
      const date = String(item.inventory_date).trim();
      const qty = item.available_qty !== undefined ? Math.max(0, Number(item.available_qty)) : 5;
      const rate = item.base_rate !== undefined ? Math.max(0, Number(item.base_rate)) : 3500;
      const closed = item.is_closed ? 1 : 0;

      upsert.run(tenantId, roomTypeId, date, qty, rate, closed, userId);
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  logAudit(tenantId, userId, "INVENTORY_BULK_UPDATE", null, {
    count: updates.length,
    sample: updates.slice(0, 3)
  });

  return { success: true, updated_count: updates.length };
}

/**
 * Check stay availability for enquiry dates
 * Checks each night from check_in to day before check_out
 */
function checkStayAvailability(tenantId = 1, checkIn, checkOut, roomTypeId = null, roomsRequested = 1) {
  if (!checkIn || !checkOut) {
    return { available: false, reason: "Missing dates" };
  }
  const cin = new Date(checkIn);
  const cout = new Date(checkOut);
  if (isNaN(cin.getTime()) || isNaN(cout.getTime()) || cout <= cin) {
    return { available: false, reason: "Check-out must be after check-in" };
  }

  // Iterate each night
  const nights = Math.round((cout - cin) / (1000 * 60 * 60 * 24));
  const nightDates = [];
  const cur = new Date(cin);
  while (cur < cout) {
    nightDates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }

  let sql = `
    SELECT inventory_date, available_qty, is_closed, base_rate, room_type_id
    FROM room_inventory_daily
    WHERE tenant_id = ? AND inventory_date IN (${nightDates.map(() => "?").join(",")})
  `;
  const params = [tenantId, ...nightDates];
  if (roomTypeId) {
    sql += " AND room_type_id = ?";
    params.push(roomTypeId);
  }

  const rows = db.prepare(sql).all(...params);

  // Map by date
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.inventory_date]) byDate[r.inventory_date] = [];
    byDate[r.inventory_date].push(r);
  }

  let allAvailable = true;
  let minQtyFound = Infinity;

  for (const d of nightDates) {
    const list = byDate[d] || [];
    if (list.length === 0) {
      // No record entered for this date
      allAvailable = false;
      minQtyFound = 0;
      break;
    }
    const totalAvailForDate = list.reduce((sum, item) => {
      if (item.is_closed) return sum;
      return sum + item.available_qty;
    }, 0);

    if (totalAvailForDate < roomsRequested) {
      allAvailable = false;
    }
    if (totalAvailForDate < minQtyFound) {
      minQtyFound = totalAvailForDate;
    }
  }

  return {
    available: allAvailable && minQtyFound >= roomsRequested,
    nights,
    night_dates: nightDates,
    min_available_qty: minQtyFound === Infinity ? 0 : minQtyFound,
    rooms_requested: roomsRequested
  };
}

module.exports = {
  listRoomTypes,
  getRoomTypeById,
  createRoomType,
  updateRoomType,
  getAvailability,
  bulkUpdateInventory,
  checkStayAvailability
};

