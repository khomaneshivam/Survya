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
        remainingCapacity: Math.max(0, remainingCapacity),
        reason: isAvailable ? "Slot available" : "Time slot fully booked"
      };
    }

    // If slotDate provided, list available slots for that date
    if (slotDate) {
      const slots = db.prepare(`
        SELECT id, slot_date, start_time, end_time, (total_capacity - booked_capacity - held_capacity) as remaining_capacity
        FROM catalog_availability_slots
        WHERE tenant_id = ? AND (catalog_item_id = ? OR catalog_item_id IS NULL)
          AND slot_date = ? AND is_active = 1
          AND (total_capacity - booked_capacity - held_capacity) >= ?
        ORDER BY start_time ASC
      `).all(numericTenantId, itemId, slotDate, quantity);

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

    db.prepare(`
      INSERT INTO catalog_inventory_holds (
        tenant_id, catalog_item_id, slot_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, customer_phone, customer_name,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'SLOT',
        ?, 'HELD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?,
        UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(numericTenantId, itemId || null, slotId, holdToken, holdToken, qty, holdMinutes, cleanPhone, cleanName);

    return {
      success: true,
      holdToken,
      holdType: "SLOT",
      slotId,
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
        tenant_id, catalog_item_id, slot_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, customer_phone, customer_name,
        created_at, updated_at
      ) VALUES (
        ?, ?, NULL, ?, ?, 'ITEM_STOCK',
        ?, 'HELD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), ?, ?,
        UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(numericTenantId, itemId, holdToken, holdToken, qty, holdMinutes, cleanPhone, cleanName);

    return {
      success: true,
      holdToken,
      holdType: "ITEM_STOCK",
      itemId,
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
 * Creates / seeds availability slots for date/time
 */
function createAvailabilitySlot(tenantId = 1, data = {}) {
  const numericTenantId = Number(tenantId) || 1;
  const startTime = data.start_time || data.slot_start || "09:00:00";
  const endTime = data.end_time || data.slot_end || "10:00:00";
  const stmt = db.prepare(`
    INSERT INTO catalog_availability_slots (
      tenant_id, entity_id, catalog_item_id, slot_date, start_time, end_time, slot_start, slot_end,
      total_capacity, booked_capacity, held_capacity, is_active, active_status,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, 0, 0, 1, 1,
      UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
  `);

  const info = stmt.run(
    numericTenantId,
    data.entity_id || null,
    data.catalog_item_id || null,
    data.slot_date,
    startTime,
    endTime,
    startTime,
    endTime,
    Number(data.total_capacity) || 10
  );

  return db.prepare("SELECT * FROM catalog_availability_slots WHERE id = ?").get(info.lastInsertRowid);
}

module.exports = {
  checkAvailability,
  createInventoryHold,
  confirmHold,
  releaseHold,
  releaseExpiredHolds,
  createAvailabilitySlot
};
