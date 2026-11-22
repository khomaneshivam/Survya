const { db } = require("../../config/database");
const crypto = require("crypto");

/**
 * Universal Availability & Atomic Inventory Hold Service
 * Supports 4 modes: UNIT_STOCK, DATE_RANGE, TIME_SLOT, QUOTE_SERVICE
 */

/**
 * Checks real-time availability across all 4 modes
 */
function checkAvailability(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const itemId = options.itemId;
  const quantity = Math.max(1, Number(options.quantity) || 1);

  if (!itemId) {
    throw new Error("itemId is required for availability check.");
  }

  const item = db.prepare(`
    SELECT * FROM catalog_items
    WHERE tenant_id = ? AND id = ? AND delete_status = 0
  `).get(numericTenantId, itemId);

  if (!item) {
    return { available: false, reason: "Item not found" };
  }

  const mode = options.inventoryMode || item.inventory_mode || "UNIT_STOCK";

  // 1. UNIT_STOCK (Retail, D2C, F&B, Wholesale)
  if (mode === "UNIT_STOCK") {
    if (item.is_sold_out || item.is_active === 0) {
      return { available: false, reason: "Item is sold out or unavailable" };
    }
    if (!item.track_inventory) {
      return { available: true, inStock: true, remainingQty: 9999 };
    }
    const availableQty = (item.stock_qty || 0) - (item.reserved_qty || 0);
    const isAvailable = availableQty >= quantity;
    return {
      available: isAvailable,
      inStock: isAvailable,
      requestedQty: quantity,
      availableQty: Math.max(0, availableQty),
      reason: isAvailable ? "In stock" : `Only ${Math.max(0, availableQty)} available`
    };
  }

  // 2. DATE_RANGE (Hospitality, Villas, Resorts)
  if (mode === "DATE_RANGE") {
    const checkIn = options.checkIn || options.dateRange?.checkIn;
    const checkOut = options.checkOut || options.dateRange?.checkOut;

    if (!checkIn || !checkOut) {
      return { available: true, mode: "DATE_RANGE", note: "Dates required for exact reservation check" };
    }

    // If item links to room_types or has room code
    const roomType = db.prepare(`
      SELECT * FROM room_types WHERE tenant_id = ? AND name = ? AND active = 1 LIMIT 1
    `).get(numericTenantId, item.title);

    if (roomType) {
      // Check room_inventory_daily
      const rows = db.prepare(`
        SELECT inventory_date, available_qty, is_closed
        FROM room_inventory_daily
        WHERE tenant_id = ? AND room_type_id = ? AND inventory_date >= ? AND inventory_date < ?
      `).all(numericTenantId, roomType.id, checkIn, checkOut);

      for (const r of rows) {
        if (r.is_closed || r.available_qty < quantity) {
          return {
            available: false,
            reason: `Sold out on ${r.inventory_date}`,
            soldOutDate: r.inventory_date
          };
        }
      }
      return { available: true, mode: "DATE_RANGE", nights: rows.length };
    }

    // Default item check
    const availableQty = (item.stock_qty || 0) - (item.reserved_qty || 0);
    return {
      available: availableQty >= quantity,
      availableQty: Math.max(0, availableQty),
      mode: "DATE_RANGE"
    };
  }

  // 3. TIME_SLOT (Clinics, Salons, Wellness, Services)
  if (mode === "TIME_SLOT") {
    const slotId = options.slotId;
    const slotDate = options.slotDate || options.date;
    const resourceId = options.masterResourceId || options.master_resource_id || options.resourceId;

    if (slotId) {
      const slot = db.prepare(`
        SELECT * FROM catalog_availability_slots
        WHERE tenant_id = ? AND id = ? AND is_active = 1
      `).get(numericTenantId, slotId);

      if (!slot) return { available: false, reason: "Time slot not found" };

      const remainingCapacity = slot.total_capacity - slot.booked_capacity - slot.held_capacity;
      const isAvailable = remainingCapacity >= quantity;

      return {
        available: isAvailable,
        slotId: slot.id,
        slotDate: slot.slot_date,
        startTime: slot.start_time,
        endTime: slot.end_time,
        masterResourceId: slot.master_resource_id,
        remainingCapacity: Math.max(0, remainingCapacity),
        reason: isAvailable ? "Slot available" : "Time slot fully booked"
      };
    }

    // If slotDate provided, list available slots for that date
    if (slotDate) {
      let sql = `
        SELECT id, slot_date, start_time, end_time, slot_start, slot_end,
               master_resource_id, override_price,
               (total_capacity - booked_capacity - held_capacity) as remaining_capacity
        FROM catalog_availability_slots
        WHERE tenant_id = ? AND is_active = 1 AND is_blocked = 0
          AND slot_date = ?
          AND (total_capacity - booked_capacity - held_capacity) >= ?
      `;
      const params = [numericTenantId, slotDate, quantity];

      if (itemId) {
        sql += " AND (catalog_item_id = ? OR catalog_item_id IS NULL)";
        params.push(itemId);
      }
      if (resourceId) {
        sql += " AND master_resource_id = ?";
        params.push(resourceId);
      }

      sql += " ORDER BY start_time ASC";
      const slots = db.prepare(sql).all(...params);

      return {
        available: slots.length > 0,
        availableSlots: slots,
        date: slotDate
      };
    }

    return { available: true, mode: "TIME_SLOT", note: "Please specify slotId or slotDate" };
  }

  // 4. QUOTE_SERVICE (Real Estate, B2B High-Value, Custom Services)
  if (mode === "QUOTE_SERVICE") {
    return {
      available: true,
      mode: "QUOTE_SERVICE",
      instantQuote: true,
      reason: "Available for instant inquiry and quotation"
    };
  }

  return { available: true };
}

/**
 * Creates an atomic inventory hold (e.g. 15 minutes cart reservation)
 */
function createInventoryHold(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const { itemId, slotId, quantity = 1, holdMinutes = 15, customerPhone, customerName } = options;
  const masterResourceId = options.masterResourceId || options.master_resource_id || options.resourceId || null;

  if (!itemId && !slotId) {
    throw new Error("itemId or slotId is required to create hold.");
  }

  const holdToken = `hld_${crypto.randomUUID().replace(/-/g, "")}`;
  const cleanPhone = customerPhone ? String(customerPhone).trim() : null;
  const cleanName = customerName ? String(customerName).trim() : null;
  const qty = Math.max(1, Number(quantity) || 1);

  // 1. Time Slot Hold
  if (slotId) {
    const updateRes = db.prepare(`
      UPDATE catalog_availability_slots
      SET held_capacity = held_capacity + ?, updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
        AND (total_capacity - booked_capacity - held_capacity) >= ?
    `).run(qty, numericTenantId, slotId, qty);

    if (updateRes.changes === 0) {
      throw new Error("Requested time slot no longer has sufficient capacity.");
    }

    const slot = db.prepare("SELECT master_resource_id FROM catalog_availability_slots WHERE id = ?").get(slotId);
    const resolvedResId = masterResourceId || slot?.master_resource_id || null;

    db.prepare(`
      INSERT INTO catalog_inventory_holds (
        tenant_id, catalog_item_id, slot_id, master_resource_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, customer_phone, customer_name,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, 'SLOT',
        ?, 'HELD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?,
        UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(numericTenantId, itemId || null, slotId, resolvedResId, holdToken, holdToken, qty, holdMinutes, cleanPhone, cleanName);

    return {
      success: true,
      holdToken,
      holdType: "SLOT",
      slotId,
      masterResourceId: resolvedResId,
      quantity: qty,
      expiresInMinutes: holdMinutes
    };
  }

  // 2. Unit Stock Hold
  if (itemId) {
    const item = db.prepare("SELECT * FROM catalog_items WHERE tenant_id = ? AND id = ?").get(numericTenantId, itemId);
    if (!item) throw new Error("Catalog item not found.");

    if (item.track_inventory) {
      const updateRes = db.prepare(`
        UPDATE catalog_items
        SET reserved_qty = reserved_qty + ?, updated_at = UTC_TIMESTAMP()
        WHERE tenant_id = ? AND id = ?
          AND (stock_qty - reserved_qty) >= ?
      `).run(qty, numericTenantId, itemId, qty);

      if (updateRes.changes === 0) {
        throw new Error("Item has insufficient stock to hold.");
      }
    }

    db.prepare(`
      INSERT INTO catalog_inventory_holds (
        tenant_id, catalog_item_id, slot_id, master_resource_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, customer_phone, customer_name,
        created_at, updated_at
      ) VALUES (
        ?, ?, NULL, ?, ?, ?, 'ITEM_STOCK',
        ?, 'HELD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?,
        UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(numericTenantId, itemId, masterResourceId, holdToken, holdToken, qty, holdMinutes, cleanPhone, cleanName);

    return {
      success: true,
      holdToken,
      holdType: "ITEM_STOCK",
      itemId,
      masterResourceId,
      quantity: qty,
      expiresInMinutes: holdMinutes
    };
  }

  throw new Error("Invalid hold parameters.");
}

/**
 * Confirms hold upon payment or booking completion
 */
function confirmHold(tenantId = 1, holdToken) {
  const numericTenantId = Number(tenantId) || 1;
  const hold = db.prepare(`
    SELECT * FROM catalog_inventory_holds
    WHERE tenant_id = ? AND hold_token = ? AND status = 'HELD'
  `).get(numericTenantId, holdToken);

  if (!hold) {
    return { success: false, reason: "Hold not found or already processed" };
  }

  // Transition to CONFIRMED
  db.prepare(`
    UPDATE catalog_inventory_holds
    SET status = 'CONFIRMED', updated_at = UTC_TIMESTAMP()
    WHERE id = ?
  `).run(hold.id);

  if (hold.hold_type === "ITEM_STOCK" && hold.catalog_item_id) {
    db.prepare(`
      UPDATE catalog_items
      SET reserved_qty = GREATEST(0, reserved_qty - ?),
          stock_qty = GREATEST(0, stock_qty - ?),
          is_sold_out = CASE WHEN stock_qty - ? <= 0 THEN 1 ELSE is_sold_out END,
          updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
    `).run(hold.quantity, hold.quantity, hold.quantity, numericTenantId, hold.catalog_item_id);
  } else if (hold.hold_type === "SLOT" && hold.slot_id) {
    db.prepare(`
      UPDATE catalog_availability_slots
      SET held_capacity = GREATEST(0, held_capacity - ?),
          booked_capacity = booked_capacity + ?,
          updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
    `).run(hold.quantity, hold.quantity, numericTenantId, hold.slot_id);
  }

  return { success: true, holdToken, status: "CONFIRMED" };
}

/**
 * Explicitly releases a hold before expiry
 */
function releaseHold(tenantId = 1, holdToken) {
  const numericTenantId = Number(tenantId) || 1;
  const hold = db.prepare(`
    SELECT * FROM catalog_inventory_holds
    WHERE tenant_id = ? AND hold_token = ? AND status = 'HELD'
  `).get(numericTenantId, holdToken);

  if (!hold) {
    return { success: false, reason: "Hold not active" };
  }

  db.prepare(`
    UPDATE catalog_inventory_holds
    SET status = 'RELEASED', updated_at = UTC_TIMESTAMP()
    WHERE id = ?
  `).run(hold.id);

  if (hold.hold_type === "ITEM_STOCK" && hold.catalog_item_id) {
    db.prepare(`
      UPDATE catalog_items
      SET reserved_qty = GREATEST(0, reserved_qty - ?),
          updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
    `).run(hold.quantity, numericTenantId, hold.catalog_item_id);
  } else if (hold.hold_type === "SLOT" && hold.slot_id) {
    db.prepare(`
      UPDATE catalog_availability_slots
      SET held_capacity = GREATEST(0, held_capacity - ?),
          updated_at = UTC_TIMESTAMP()
      WHERE tenant_id = ? AND id = ?
    `).run(hold.quantity, numericTenantId, hold.slot_id);
  }

  return { success: true, holdToken, status: "RELEASED" };
}

/**
 * Automatically releases all expired holds (Called by worker / cron)
 */
function releaseExpiredHolds(tenantId = null) {
  let sql = `
    SELECT * FROM catalog_inventory_holds
    WHERE status = 'HELD' AND expires_at <= UTC_TIMESTAMP()
  `;
  const params = [];
  if (tenantId) {
    sql += " AND tenant_id = ?";
    params.push(Number(tenantId));
  }

  const expired = db.prepare(sql).all(...params);
  let count = 0;

  for (const hold of expired) {
    try {
      db.prepare(`
        UPDATE catalog_inventory_holds
        SET status = 'EXPIRED', updated_at = UTC_TIMESTAMP()
        WHERE id = ?
      `).run(hold.id);

      if (hold.hold_type === "ITEM_STOCK" && hold.catalog_item_id) {
        db.prepare(`
          UPDATE catalog_items
          SET reserved_qty = GREATEST(0, reserved_qty - ?),
              updated_at = UTC_TIMESTAMP()
          WHERE id = ?
        `).run(hold.quantity, hold.catalog_item_id);
      } else if (hold.hold_type === "SLOT" && hold.slot_id) {
        db.prepare(`
          UPDATE catalog_availability_slots
          SET held_capacity = GREATEST(0, held_capacity - ?),
              updated_at = UTC_TIMESTAMP()
          WHERE id = ?
        `).run(hold.quantity, hold.slot_id);
      }
      count++;
    } catch (err) {
      console.warn(`[UniversalAvailability] Failed to release hold #${hold.id}:`, err.message);
    }
  }

  return { releasedCount: count };
}

/**
 * Creates / seeds a single availability slot
 */
function createAvailabilitySlot(tenantId = 1, data = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const startTime = data.start_time || data.slot_start || "09:00:00";
  const endTime = data.end_time || data.slot_end || "10:00:00";
  const masterResourceId = data.master_resource_id || data.masterResourceId || null;
  const stmt = db.prepare(`
    INSERT INTO catalog_availability_slots (
      tenant_id, entity_id, catalog_item_id, master_resource_id, slot_date, start_time, end_time, slot_start, slot_end,
      total_capacity, booked_capacity, held_capacity, override_price, is_active, active_status,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 1, 1,
      UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    data.entity_id || null,
    data.catalog_item_id || null,
    masterResourceId,
    data.slot_date,
    startTime,
    endTime,
    startTime,
    endTime,
    Number(data.total_capacity) || 10,
    Number(data.booked_capacity) || 0,
    Number(data.held_capacity) || 0,
    data.override_price ? Number(data.override_price) : null
  );

  return db.prepare("SELECT * FROM catalog_availability_slots WHERE id = ?").get(info.lastInsertRowid);
}

/**
 * List availability slots with filters (date, resource, item)
 */
function listAvailabilitySlots(tenantId = 1, filter = {}) {
  const numericTenantId = Number(tenantId) || 1;
  let sql = `
    SELECT s.*,
           r.name as master_resource_name, r.resource_code, r.resource_type,
           i.title as catalog_item_title,
           (s.total_capacity - s.booked_capacity - s.held_capacity) as remaining_capacity
    FROM catalog_availability_slots s
    LEFT JOIN master_resources r ON r.id = s.master_resource_id AND r.delete_status = 0
    LEFT JOIN catalog_items i ON i.id = s.catalog_item_id AND i.delete_status = 0
    WHERE s.tenant_id = ? AND s.delete_status = 0 AND s.is_active = 1
  `;
  const params = [numericTenantId];

  if (filter.catalogItemId || filter.itemId) {
    sql += " AND (s.catalog_item_id = ? OR s.catalog_item_id IS NULL)";
    params.push(filter.catalogItemId || filter.itemId);
  }

  if (filter.masterResourceId || filter.resourceId) {
    sql += " AND s.master_resource_id = ?";
    params.push(filter.masterResourceId || filter.resourceId);
  }

  if (filter.slotDate || filter.date) {
    sql += " AND s.slot_date = ?";
    params.push(filter.slotDate || filter.date);
  }

  if (filter.startDate) {
    sql += " AND s.slot_date >= ?";
    params.push(filter.startDate);
  }

  if (filter.endDate) {
    sql += " AND s.slot_date <= ?";
    params.push(filter.endDate);
  }

  sql += " ORDER BY s.slot_date ASC, s.start_time ASC, s.id ASC";

  if (filter.limit) {
    const limit = Math.max(1, Math.min(200, Number(filter.limit) || 50));
    const offset = Math.max(0, Number(filter.offset) || 0);
    sql += " LIMIT ? OFFSET ?";
    params.push(limit, offset);
  }

  return db.prepare(sql).all(...params);
}

/**
 * Bulk availability slot generator for a date range and daily time blocks
 */
function generateAvailabilitySlots(tenantId = 1, options = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const catalogItemId = options.catalogItemId || options.catalog_item_id || null;
  const masterResourceId = options.masterResourceId || options.master_resource_id || null;
  const {
    startDate,
    endDate,
    startTime = "09:00:00",
    endTime = "18:00:00",
    slotDurationMinutes = 30,
    totalCapacity = 1,
    overridePrice = null
  } = options;

  if (!startDate || !endDate) {
    throw new Error("startDate and endDate are required for bulk slot generation.");
  }

  const durationMin = Math.max(5, Math.min(480, Number(slotDurationMinutes) || 30));
  const capacity = Math.max(1, Number(totalCapacity) || 1);
  const price = overridePrice !== null && overridePrice !== undefined ? Number(overridePrice) : null;

  // Generate date strings between startDate and endDate
  const dates = [];
  let curr = new Date(startDate);
  const end = new Date(endDate);
  while (curr <= end) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, "0");
    const dd = String(curr.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    curr.setDate(curr.getDate() + 1);
  }

  const timeIntervals = [];
  if (Array.isArray(options.timeIntervals) && options.timeIntervals.length > 0) {
    for (const t of options.timeIntervals) {
      const s = t.startTime || t.start;
      const e = t.endTime || t.end;
      if (s && e) {
        timeIntervals.push({
          start: s.length === 5 ? `${s}:00` : s,
          end: e.length === 5 ? `${e}:00` : e
        });
      }
    }
  } else {
    // Parse start and end time into minutes from midnight
    const [sH, sM] = String(startTime).split(":").map(Number);
    const [eH, eM] = String(endTime).split(":").map(Number);
    const startMin = (sH || 0) * 60 + (sM || 0);
    const endMin = (eH || 0) * 60 + (eM || 0);

    for (let m = startMin; m + durationMin <= endMin; m += durationMin) {
      const slotStartH = String(Math.floor(m / 60)).padStart(2, "0");
      const slotStartM = String(m % 60).padStart(2, "0");
      const slotEndH = String(Math.floor((m + durationMin) / 60)).padStart(2, "0");
      const slotEndM = String((m + durationMin) % 60).padStart(2, "0");
      timeIntervals.push({
        start: `${slotStartH}:${slotStartM}:00`,
        end: `${slotEndH}:${slotEndM}:00`
      });
    }
  }

  let createdCount = 0;
  const insertStmt = db.prepare(`
    INSERT INTO catalog_availability_slots (
      tenant_id, catalog_item_id, master_resource_id, slot_date, slot_start, slot_end,
      start_time, end_time, total_capacity, booked_capacity, held_capacity,
      override_price, is_blocked, is_active, active_status, delete_status,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, 0, 0,
      ?, 0, 1, 1, 0,
      UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
    ON DUPLICATE KEY UPDATE total_capacity = VALUES(total_capacity), override_price = VALUES(override_price)
  `);

  for (const d of dates) {
    for (const t of timeIntervals) {
      try {
        insertStmt.run(
          numericTenantId,
          catalogItemId || null,
          masterResourceId || null,
          d,
          t.start,
          t.end,
          t.start,
          t.end,
          capacity,
          price
        );
        createdCount++;
      } catch (err) {
        // ignore duplicate
      }
    }
  }

  return {
    success: true,
    totalDates: dates.length,
    slotsPerDay: timeIntervals.length,
    slotsGenerated: createdCount
  };
}

module.exports = {
  checkAvailability,
  createInventoryHold,
  createHold: createInventoryHold,
  confirmHold,
  releaseHold,
  releaseExpiredHolds,
  createAvailabilitySlot,
  listAvailabilitySlots,
  generateAvailabilitySlots
};
