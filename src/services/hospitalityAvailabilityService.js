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
 * Helper to generate list of dates between start (inclusive) and end (exclusive or inclusive)
 */
function getDatesInRange(startDateStr, endDateStr, inclusiveEnd = false) {
  const dates = [];
  const curr = new Date(startDateStr + "T00:00:00Z");
  const end = new Date(endDateStr + "T00:00:00Z");

  if (isNaN(curr.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  while (inclusiveEnd ? curr <= end : curr < end) {
    dates.push(curr.toISOString().split("T")[0]);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
  return dates;
}

/**
 * -------------------------------------------------------------------------
 * AUTHORITATIVE SELLABLE INVENTORY CALCULATION
 * Formula: Sellable = max(0, Total - Blocks - Out_Of_Service - Allocations)
 * Status:
 *   - UNAVAILABLE: Sellable === 0 or is_closed === 1
 *   - LIMITED_AVAILABILITY: Sellable > 0 && Sellable <= 2
 *   - AVAILABLE: Sellable > 2
 * -------------------------------------------------------------------------
 */

/**
 * Calculate availability for a specific room category on a specific date
 */
function getDailyRoomAvailability(propertyId, roomTypeId, dateStr, tenantId = 1) {
  // 1. Fetch room category default total
  const roomType = db.prepare(`
    SELECT id, name, base_rate, status
    FROM room_types
    WHERE id = ? AND property_id = ? AND tenant_id = ?
    LIMIT 1
  `).get(roomTypeId, propertyId, tenantId);

  if (!roomType) {
    return {
      date: dateStr,
      room_type_id: roomTypeId,
      status: "AVAILABILITY_UNKNOWN",
      sellable: 0,
      total: 0,
      blocked: 0,
      out_of_service: 0,
      allocated: 0,
      is_closed: 1,
      reason: "Room category not found"
    };
  }

  // Count physical rooms and operational status if defined
  const physRoomsCount = db.prepare(`
    SELECT 
      COUNT(*) as total_phys,
      SUM(CASE WHEN operational_status = 'MAINTENANCE' OR operational_status = 'OUT_OF_SERVICE' THEN 1 ELSE 0 END) as oos_phys
    FROM hospitality_physical_rooms
    WHERE property_id = ? AND room_type_id = ? AND tenant_id = ?
  `).get(propertyId, roomTypeId, tenantId);

  const physicalTotal = Number(physRoomsCount?.total_phys || 0);
  const physicalOos = Number(physRoomsCount?.oos_phys || 0);
  const defaultTotal = physicalTotal > 0 ? physicalTotal : 5;

  // 2. Fetch daily override from room_inventory_daily
  const dailyRecord = db.prepare(`
    SELECT *
    FROM room_inventory_daily
    WHERE room_type_id = ? AND inventory_date = ? AND tenant_id = ?
    LIMIT 1
  `).get(roomTypeId, dateStr, tenantId);

  let totalRooms = dailyRecord && dailyRecord.total_rooms != null ? Number(dailyRecord.total_rooms) : defaultTotal;
  let blockedQty = dailyRecord ? Number(dailyRecord.blocked_qty || 0) : 0;
  let oosQty = (dailyRecord ? Number(dailyRecord.out_of_service_qty || 0) : 0) + physicalOos;
  let allocatedQty = dailyRecord ? Number(dailyRecord.allocated_qty || 0) : 0;
  let isClosed = dailyRecord && Number(dailyRecord.is_closed || 0) === 1 ? 1 : 0;
  let rate = dailyRecord && dailyRecord.base_rate != null ? Number(dailyRecord.base_rate) : Number(roomType.base_rate || 0);

  // 3. Fetch active dynamic blocks for this date
  const dynamicBlocks = db.prepare(`
    SELECT COALESCE(SUM(blocked_qty), 0) as total_dynamic_blocked
    FROM hospitality_inventory_blocks
    WHERE property_id = ? AND room_type_id = ? AND tenant_id = ?
      AND status = 'ACTIVE'
      AND start_date <= ? AND end_date >= ?
  `).get(propertyId, roomTypeId, tenantId, dateStr, dateStr);

  const extraBlocked = Number(dynamicBlocks?.total_dynamic_blocked || 0);
  const totalBlocked = blockedQty + extraBlocked;

  // 4. Query active confirmed bookings in booking_enquiries for this date
  const activeBookings = db.prepare(`
    SELECT COALESCE(SUM(rooms_requested), 0) as booked_count
    FROM booking_enquiries
    WHERE tenant_id = ? AND property_id = ? AND room_type_id = ?
      AND check_in <= ? AND check_out > ?
      AND status IN ('CONFIRMED', 'WON')
  `).get(tenantId, propertyId, roomTypeId, dateStr, dateStr);

  const realBookedCount = Number(activeBookings?.booked_count || 0);
  allocatedQty += realBookedCount;

  // Calculate sellable rooms
  let sellable = 0;
  let status = "UNAVAILABLE";

  if (isClosed || roomType.status !== "ACTIVE") {
    sellable = 0;
    status = "UNAVAILABLE";
  } else if (dailyRecord && dailyRecord.available_qty != null && Number(dailyRecord.available_qty) === 0) {
    sellable = 0;
    status = "UNAVAILABLE";
  } else if (dailyRecord && dailyRecord.available_qty != null) {
    const baseAvail = Number(dailyRecord.available_qty);
    sellable = Math.max(0, baseAvail - extraBlocked - realBookedCount);
    if (sellable === 0) {
      status = "UNAVAILABLE";
    } else if (sellable <= 2) {
      status = "LIMITED_AVAILABILITY";
    } else {
      status = "AVAILABLE";
    }
  } else {
    sellable = Math.max(0, totalRooms - totalBlocked - oosQty - allocatedQty);
    if (sellable === 0) {
      status = "UNAVAILABLE";
    } else if (sellable <= 2) {
      status = "LIMITED_AVAILABILITY";
    } else {
      status = "AVAILABLE";
    }
  }

  return {
    date: dateStr,
    room_type_id: roomTypeId,
    room_type_name: roomType.name,
    total: totalRooms,
    blocked: totalBlocked,
    out_of_service: oosQty,
    allocated: allocatedQty,
    sellable,
    is_closed: isClosed,
    status,
    base_rate: rate
  };
}

/**
 * Check availability across a date range (checkIn to checkOut)
 */
function checkRoomAvailability(propertyId, roomTypeId, checkInDate, checkOutDate, quantity = 1, tenantId = 1) {
  if (!checkInDate || !checkOutDate) {
    throw new Error("Both checkInDate and checkOutDate are required.");
  }
  if (checkInDate >= checkOutDate) {
    throw new Error("checkOutDate must be after checkInDate.");
  }

  const nightsList = getDatesInRange(checkInDate, checkOutDate, false);
  if (nightsList.length === 0) {
    throw new Error("Stay duration must be at least 1 night.");
  }

  const dailyBreakdown = [];
  let minSellable = 9999;
  let anyClosed = false;

  for (const night of nightsList) {
    const daily = getDailyRoomAvailability(propertyId, roomTypeId, night, tenantId);
    dailyBreakdown.push(daily);

    if (daily.is_closed || daily.sellable === 0) {
      anyClosed = true;
    }
    if (daily.sellable < minSellable) {
      minSellable = daily.sellable;
    }
  }

  if (minSellable === 9999) minSellable = 0;

  let overallStatus = "UNAVAILABLE";
  let isAvailable = false;

  if (!anyClosed && minSellable >= quantity) {
    isAvailable = true;
    overallStatus = minSellable <= 2 ? "LIMITED_AVAILABILITY" : "AVAILABLE";
  } else {
    overallStatus = "UNAVAILABLE";
    isAvailable = false;
  }

  return {
    property_id: Number(propertyId),
    room_type_id: Number(roomTypeId),
    check_in: checkInDate,
    check_out: checkOutDate,
    nights: nightsList.length,
    requested_quantity: Number(quantity),
    is_available: isAvailable,
    available: isAvailable,
    status: overallStatus,
    min_sellable: minSellable,
    available_rooms_count: minSellable,
    daily_breakdown: dailyBreakdown
  };
}

/**
 * Check availability across ALL active room categories of a property
 */
function checkPropertyAvailability(propertyId, checkInDate, checkOutDate, quantity = 1, tenantId = 1) {
  const roomTypes = db.prepare(`
    SELECT id, name, room_code, base_rate, max_occupancy, standard_occupancy, primary_image_url
    FROM room_types
    WHERE property_id = ? AND tenant_id = ? AND active = 1 AND status = 'ACTIVE'
    ORDER BY id ASC
  `).all(propertyId, tenantId);

  const results = [];
  for (const rt of roomTypes) {
    const avail = checkRoomAvailability(propertyId, rt.id, checkInDate, checkOutDate, quantity, tenantId);
    results.push({
      ...rt,
      availability: avail
    });
  }

  return {
    property_id: Number(propertyId),
    check_in: checkInDate,
    check_out: checkOutDate,
    nights: getDatesInRange(checkInDate, checkOutDate, false).length,
    requested_quantity: Number(quantity),
    room_categories: results
  };
}

/**
 * -------------------------------------------------------------------------
 * INVENTORY CALENDAR & GRID MANAGEMENT
 * -------------------------------------------------------------------------
 */

/**
 * Get inventory matrix/grid for a property across a date range
 */
function getInventoryGrid(propertyId, startDate, endDate, tenantId = 1) {
  const dates = getDatesInRange(startDate, endDate, true);

  const roomTypes = db.prepare(`
    SELECT id, name, room_code, base_rate
    FROM room_types
    WHERE property_id = ? AND tenant_id = ? AND active = 1
    ORDER BY id ASC
  `).all(propertyId, tenantId);

  const grid = [];

  for (const rt of roomTypes) {
    const row = {
      room_type_id: rt.id,
      room_type_name: rt.name,
      room_code: rt.room_code,
      base_rate: rt.base_rate,
      dates: {}
    };

    for (const d of dates) {
      const daily = getDailyRoomAvailability(propertyId, rt.id, d, tenantId);
      row.dates[d] = daily;
    }

    grid.push(row);
  }

  return {
    property_id: Number(propertyId),
    start_date: startDate,
    end_date: endDate,
    dates,
    grid
  };
}

/**
 * Bulk update daily inventory records atomically
 */
function bulkUpdateInventory(propertyId, roomTypeId, startDate, endDate, updates = {}, tenantId = 1, userId = null) {
  const dates = getDatesInRange(startDate, endDate, true);

  const checkRt = db.prepare(`
    SELECT id FROM room_types WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).get(roomTypeId, propertyId, tenantId);

  if (!checkRt) {
    throw new Error("Room category not found for this property.");
  }

  db.prepare("START TRANSACTION").run();
  try {
    db.prepare("SELECT id FROM room_types WHERE id = ? AND tenant_id = ? FOR UPDATE").get(roomTypeId, tenantId);
    for (const dateStr of dates) {
      const existing = db.prepare(`
        SELECT id, total_rooms, blocked_qty, out_of_service_qty, allocated_qty, is_closed, base_rate, notes
        FROM room_inventory_daily
        WHERE room_type_id = ? AND inventory_date = ? AND tenant_id = ?
        LIMIT 1
        FOR UPDATE
      `).get(roomTypeId, dateStr, tenantId);

      const totalRooms = updates.total_rooms !== undefined ? Number(updates.total_rooms) : (existing ? existing.total_rooms : 5);
      const blockedQty = updates.blocked_qty !== undefined ? Number(updates.blocked_qty) : (existing ? existing.blocked_qty : 0);
      const oosQty = updates.out_of_service_qty !== undefined ? Number(updates.out_of_service_qty) : (existing ? existing.out_of_service_qty : 0);
      const allocatedQty = updates.allocated_qty !== undefined ? Number(updates.allocated_qty) : (existing ? existing.allocated_qty : 0);
      const isClosed = updates.is_closed !== undefined ? (updates.is_closed ? 1 : 0) : (existing ? existing.is_closed : 0);
      const baseRate = updates.base_rate !== undefined ? Number(updates.base_rate) : (existing ? existing.base_rate : null);
      const notes = updates.notes !== undefined ? updates.notes : (existing ? existing.notes : null);

      const sellable = Math.max(0, totalRooms - blockedQty - oosQty - allocatedQty);

      if (existing) {
        db.prepare(`
          UPDATE room_inventory_daily
          SET total_rooms = ?, blocked_qty = ?, out_of_service_qty = ?, allocated_qty = ?,
              available_qty = ?, is_closed = ?, base_rate = ?, notes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          totalRooms, blockedQty, oosQty, allocatedQty,
          sellable, isClosed, baseRate, notes, userId ? String(userId) : "staff",
          existing.id
        );
      } else {
        db.prepare(`
          INSERT INTO room_inventory_daily
            (tenant_id, room_type_id, inventory_date, total_rooms, blocked_qty, out_of_service_qty, allocated_qty, available_qty, is_closed, base_rate, notes, updated_by, updated_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          tenantId, roomTypeId, dateStr,
          totalRooms, blockedQty, oosQty, allocatedQty,
          sellable, isClosed, baseRate, notes, userId ? String(userId) : "staff"
        );
      }
    }
    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }

  logAudit(tenantId, userId, "HOSPITALITY_BULK_INVENTORY_UPDATE", roomTypeId, {
    property_id: propertyId,
    start_date: startDate,
    end_date: endDate,
    days_updated: dates.length,
    updates
  });

  return {
    success: true,
    days_updated: dates.length,
    start_date: startDate,
    end_date: endDate
  };
}

/**
 * Atomically reserves room inventory under an InnoDB row lock to prevent concurrent double-booking.
 */
function reserveConfirmedBookingAtomically({
  tenantId = 1,
  propertyId = 1,
  roomTypeId,
  checkInDate,
  checkOutDate,
  quantity = 1,
  phoneE164,
  guestName = "Guest",
  notes = null,
  flowSessionId = null,
  createdBy = "system"
}) {
  const numericTenantId = Number(tenantId) || 1;
  const numericPropId = Number(propertyId) || 1;
  const numericRoomId = Number(roomTypeId);
  const roomsReq = Math.max(1, Number(quantity) || 1);

  if (!numericRoomId || !checkInDate || !checkOutDate || !phoneE164) {
    throw new Error("roomTypeId, checkInDate, checkOutDate, and phoneE164 are required.");
  }

  const cleanPhone = String(phoneE164).replace(/\D/g, "");
  const contact = require("./enquiryService").upsertContact(numericTenantId, cleanPhone, guestName);

  db.prepare("START TRANSACTION").run();
  try {
    const lockedRoom = db.prepare(`
      SELECT id, name FROM room_types WHERE id = ? AND property_id = ? AND tenant_id = ? FOR UPDATE
    `).get(numericRoomId, numericPropId, numericTenantId);
    if (!lockedRoom) {
      const err = new Error("Room category not found for this property.");
      err.statusCode = 404;
      throw err;
    }

    const avail = checkRoomAvailability(numericPropId, numericRoomId, checkInDate, checkOutDate, roomsReq, numericTenantId);
    if (!avail.available) {
      const err = new Error(`Overbooking prevented: ${lockedRoom.name} has insufficient availability for ${checkInDate} to ${checkOutDate} (available: ${avail.available_rooms_count}).`);
      err.statusCode = 409;
      err.code = "OVERBOOKING_PREVENTED";
      throw err;
    }

    const insertRes = db.prepare(`
      INSERT INTO booking_enquiries (
        tenant_id, property_id, contact_id, guest_name, phone_e164, check_in, check_out,
        rooms_requested, room_type_id, room_preference, status, flow_session_id,
        notes, assigned_to, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(
      numericTenantId, numericPropId, contact.id, guestName, cleanPhone,
      checkInDate, checkOutDate, roomsReq, numericRoomId, lockedRoom.name,
      flowSessionId, notes, createdBy
    );

    db.prepare("COMMIT").run();
    return {
      success: true,
      enquiryId: insertRes.lastInsertRowid,
      roomTypeId: numericRoomId,
      remainingAfterBooking: Math.max(0, avail.available_rooms_count - roomsReq)
    };
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }
}

/**
 * -------------------------------------------------------------------------
 * INVENTORY BLOCKS MANAGEMENT (Maintenance, VIP hold, closures)
 * -------------------------------------------------------------------------
 */

/**
 * List inventory blocks
 */
function listInventoryBlocks(propertyId, tenantId = 1, status = "ACTIVE") {
  let sql = `
    SELECT b.*, rt.name as room_type_name
    FROM hospitality_inventory_blocks b
    LEFT JOIN room_types rt ON b.room_type_id = rt.id
    WHERE b.property_id = ? AND b.tenant_id = ?
  `;
  const params = [propertyId, tenantId];
  if (status && status !== "ALL") {
    sql += ` AND b.status = ?`;
    params.push(status);
  }
  sql += " ORDER BY b.start_date DESC";
  return db.prepare(sql).all(...params);
}

/**
 * Create inventory block
 */
function createInventoryBlock({ propertyId, roomTypeId, startDate, endDate, blockedQty = 1, reason = "", createdBy = "staff", tenantId = 1, userId = null }) {
  if (!startDate || !endDate) {
    throw new Error("Start date and end date are required.");
  }
  if (startDate > endDate) {
    throw new Error("End date must be greater than or equal to start date.");
  }

  const res = db.prepare(`
    INSERT INTO hospitality_inventory_blocks
      (tenant_id, property_id, room_type_id, start_date, end_date, blocked_qty, reason, created_by, status, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `).run(tenantId, propertyId, roomTypeId, startDate, endDate, Number(blockedQty || 1), reason, createdBy);

  logAudit(tenantId, userId, "HOSPITALITY_INVENTORY_BLOCK_CREATE", res.lastInsertRowid, {
    property_id: propertyId,
    room_type_id: roomTypeId,
    start_date: startDate,
    end_date: endDate,
    blocked_qty: blockedQty,
    reason
  });

  return {
    id: res.lastInsertRowid,
    success: true,
    message: "Inventory block created successfully."
  };
}

/**
 * Release/cancel inventory block
 */
function releaseInventoryBlock(blockId, tenantId = 1, userId = null) {
  const block = db.prepare(`
    SELECT * FROM hospitality_inventory_blocks
    WHERE id = ? AND tenant_id = ?
  `).get(blockId, tenantId);

  if (!block) {
    throw new Error("Inventory block not found.");
  }

  db.prepare(`
    UPDATE hospitality_inventory_blocks
    SET status = 'RELEASED'
    WHERE id = ?
  `).run(blockId);

  logAudit(tenantId, userId, "HOSPITALITY_INVENTORY_BLOCK_RELEASE", blockId, {
    property_id: block.property_id,
    room_type_id: block.room_type_id
  });

  return {
    success: true,
    message: "Inventory block released."
  };
}

module.exports = {
  getDailyRoomAvailability,
  checkRoomAvailability,
  checkPropertyAvailability,
  getInventoryGrid,
  bulkUpdateInventory,
  listInventoryBlocks,
  createInventoryBlock,
  releaseInventoryBlock,
  reserveConfirmedBookingAtomically
};

