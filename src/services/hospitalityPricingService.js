const { db } = require("../config/database");
const availabilityService = require("./hospitalityAvailabilityService");

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
 * Safe round to 2 decimal places
 */
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * -------------------------------------------------------------------------
 * PRICING RESOLUTION ENGINE
 * Precedence Order:
 *   1. Daily Rate Override (hospitality_daily_rates)
 *   2. Matching Seasonal Rate (hospitality_seasonal_rates, highest priority)
 *   3. Base Rate (room_types.base_rate)
 * -------------------------------------------------------------------------
 */

/**
 * Calculate the resolved nightly price for a single date
 */
function getResolvedDailyPrice(propertyId, roomTypeId, ratePlanId, dateStr, tenantId = 1) {
  // 1. Get room type base specs
  const roomType = db.prepare(`
    SELECT id, name, room_code, base_rate, standard_occupancy, max_occupancy,
           extra_adult_price, extra_child_price, status
    FROM room_types
    WHERE id = ? AND property_id = ? AND tenant_id = ?
    LIMIT 1
  `).get(roomTypeId, propertyId, tenantId);

  if (!roomType) {
    throw new Error(`Room category ${roomTypeId} not found for property ${propertyId}.`);
  }

  // Rate plan details if provided
  let ratePlan = null;
  if (ratePlanId) {
    ratePlan = db.prepare(`
      SELECT * FROM hospitality_rate_plans
      WHERE id = ? AND property_id = ? AND tenant_id = ? AND is_active = 1
      LIMIT 1
    `).get(ratePlanId, propertyId, tenantId);
  }

  let finalPrice = Number(roomType.base_rate || 0);
  let extraAdultPrice = Number(roomType.extra_adult_price || 0);
  let extraChildPrice = Number(roomType.extra_child_price || 0);
  let resolutionSource = "BASE_RATE";
  let matchedRuleId = null;
  let ruleDetails = "Standard Base Rate";

  // Precedence 1: Check Daily Rate Override
  let dailyOverride = null;
  if (ratePlanId) {
    dailyOverride = db.prepare(`
      SELECT * FROM hospitality_daily_rates
      WHERE property_id = ? AND room_type_id = ? AND rate_date = ? AND rate_plan_id = ? AND tenant_id = ?
      LIMIT 1
    `).get(propertyId, roomTypeId, dateStr, ratePlanId, tenantId);
  }
  if (!dailyOverride) {
    dailyOverride = db.prepare(`
      SELECT * FROM hospitality_daily_rates
      WHERE property_id = ? AND room_type_id = ? AND rate_date = ? AND (rate_plan_id IS NULL OR rate_plan_id = 0) AND tenant_id = ?
      LIMIT 1
    `).get(propertyId, roomTypeId, dateStr, tenantId);
  }

  if (dailyOverride) {
    finalPrice = Number(dailyOverride.price);
    if (dailyOverride.extra_adult_price && Number(dailyOverride.extra_adult_price) > 0) {
      extraAdultPrice = Number(dailyOverride.extra_adult_price);
    }
    if (dailyOverride.extra_child_price && Number(dailyOverride.extra_child_price) > 0) {
      extraChildPrice = Number(dailyOverride.extra_child_price);
    }
    resolutionSource = "DAILY_OVERRIDE";
    matchedRuleId = dailyOverride.id;
    ruleDetails = dailyOverride.reason || "Daily Override Rate";
  } else {
    // Precedence 2: Check Seasonal Rates (Active, start_date <= dateStr <= end_date)
    let seasonalRate = null;
    if (ratePlanId) {
      seasonalRate = db.prepare(`
        SELECT * FROM hospitality_seasonal_rates
        WHERE property_id = ? AND room_type_id = ? AND rate_plan_id = ? AND tenant_id = ?
          AND active = 1 AND start_date <= ? AND end_date >= ?
        ORDER BY priority DESC, price DESC
        LIMIT 1
      `).get(propertyId, roomTypeId, ratePlanId, tenantId, dateStr, dateStr);
    }
    if (!seasonalRate) {
      seasonalRate = db.prepare(`
        SELECT * FROM hospitality_seasonal_rates
        WHERE property_id = ? AND room_type_id = ? AND (rate_plan_id IS NULL OR rate_plan_id = 0) AND tenant_id = ?
          AND active = 1 AND start_date <= ? AND end_date >= ?
        ORDER BY priority DESC, price DESC
        LIMIT 1
      `).get(propertyId, roomTypeId, tenantId, dateStr, dateStr);
    }

    if (seasonalRate) {
      finalPrice = Number(seasonalRate.price);
      if (seasonalRate.extra_adult_price && Number(seasonalRate.extra_adult_price) > 0) {
        extraAdultPrice = Number(seasonalRate.extra_adult_price);
      }
      if (seasonalRate.extra_child_price && Number(seasonalRate.extra_child_price) > 0) {
        extraChildPrice = Number(seasonalRate.extra_child_price);
      }
      resolutionSource = "SEASONAL_RATE";
      matchedRuleId = seasonalRate.id;
      ruleDetails = seasonalRate.season_name || "Seasonal Rate";
    }
  }

  // Rate plan multiplier / meal addition if not explicitly baked into override/seasonal plan
  let mealPlanAdjustment = 0;
  if (ratePlan && ratePlan.code !== "EP") {
    // If not standard room-only, apply standard meal plan differential if rule was generic
    if (resolutionSource === "BASE_RATE") {
      if (ratePlan.code === "CP") {
        mealPlanAdjustment = round2(finalPrice * 0.15); // +15% for breakfast
      } else if (ratePlan.code === "MAP") {
        mealPlanAdjustment = round2(finalPrice * 0.35); // +35% for breakfast + dinner
      } else if (ratePlan.code === "AP") {
        mealPlanAdjustment = round2(finalPrice * 0.50); // +50% for all meals
      }
    }
  }

  return {
    date: dateStr,
    room_type_id: roomTypeId,
    rate_plan_id: ratePlanId || null,
    rate_plan_code: ratePlan ? ratePlan.code : "EP",
    resolution_source: resolutionSource,
    matched_rule_id: matchedRuleId,
    rule_details: ruleDetails,
    base_nightly_price: round2(finalPrice),
    meal_plan_adjustment: mealPlanAdjustment,
    net_nightly_price: round2(finalPrice + mealPlanAdjustment),
    extra_adult_price: round2(extraAdultPrice),
    extra_child_price: round2(extraChildPrice),
    standard_occupancy: Number(roomType.standard_occupancy || 2),
    max_occupancy: Number(roomType.max_occupancy || 3)
  };
}

/**
 * -------------------------------------------------------------------------
 * ESTIMATED PRICE QUOTE GENERATOR
 * Generates itemized quote with strict disclaimer:
 * "Estimated Price Quote (Subject to Staff Confirmation)"
 * -------------------------------------------------------------------------
 */
function calculateQuote({
  propertyId,
  roomTypeId,
  ratePlanId = null,
  checkInDate,
  checkOutDate,
  adults = 2,
  children = 0,
  rooms = 1,
  tenantId = 1
}) {
  if (!propertyId || !roomTypeId || !checkInDate || !checkOutDate) {
    throw new Error("Missing required parameters: propertyId, roomTypeId, checkInDate, checkOutDate.");
  }
  if (checkInDate >= checkOutDate) {
    throw new Error("checkOutDate must be after checkInDate.");
  }

  // 1. Fetch Property info
  const prop = db.prepare(`
    SELECT id, name, currency, publication_status
    FROM properties
    WHERE id = ? AND tenant_id = ?
    LIMIT 1
  `).get(propertyId, tenantId);

  if (!prop) {
    throw new Error("Property not found.");
  }

  // 2. Fetch Room Category
  const roomType = db.prepare(`
    SELECT * FROM room_types
    WHERE id = ? AND property_id = ? AND tenant_id = ?
    LIMIT 1
  `).get(roomTypeId, propertyId, tenantId);

  if (!roomType) {
    throw new Error("Room category not found.");
  }

  // 3. Fetch Rate Plan (default to EP if omitted)
  let ratePlan = null;
  if (ratePlanId) {
    ratePlan = db.prepare(`
      SELECT * FROM hospitality_rate_plans
      WHERE id = ? AND property_id = ? AND tenant_id = ? AND is_active = 1
      LIMIT 1
    `).get(ratePlanId, propertyId, tenantId);
  }
  if (!ratePlan) {
    ratePlan = db.prepare(`
      SELECT * FROM hospitality_rate_plans
      WHERE property_id = ? AND tenant_id = ? AND is_active = 1
      ORDER BY id ASC
      LIMIT 1
    `).get(propertyId, tenantId);
  }

  const numRooms = Math.max(1, Number(rooms || 1));
  const numAdults = Math.max(1, Number(adults || 1));
  const numChildren = Math.max(0, Number(children || 0));

  // Validate occupancy limit
  const totalGuests = numAdults + numChildren;
  const maxTotalAllowed = Number(roomType.max_occupancy || 3) * numRooms;
  let occupancyWarning = null;
  if (totalGuests > maxTotalAllowed) {
    occupancyWarning = `The requested ${totalGuests} guests exceeds maximum room capacity of ${maxTotalAllowed} across ${numRooms} room(s). Additional rooms recommended.`;
  }

  // 4. Check real-time availability
  const availability = availabilityService.checkRoomAvailability(
    propertyId,
    roomTypeId,
    checkInDate,
    checkOutDate,
    numRooms,
    tenantId
  );

  // 5. Nightly rate breakdown
  const dailyBreakdown = [];
  let totalBaseRoomCharge = 0;
  let totalExtraGuestCharge = 0;

  // Extra occupants per room
  const standardOccupancyPerRoom = Number(roomType.standard_occupancy || 2);
  const adultsPerRoom = Math.ceil(numAdults / numRooms);
  const childrenPerRoom = Math.ceil(numChildren / numRooms);
  const extraAdultsPerRoom = Math.max(0, adultsPerRoom - standardOccupancyPerRoom);
  const totalExtraAdults = extraAdultsPerRoom * numRooms;
  const totalExtraChildren = numChildren;

  for (const nightAvail of availability.daily_breakdown) {
    const resolvedPrice = getResolvedDailyPrice(propertyId, roomTypeId, ratePlan?.id, nightAvail.date, tenantId);

    const roomRateForNight = resolvedPrice.net_nightly_price * numRooms;
    const extraAdultRateForNight = (totalExtraAdults * resolvedPrice.extra_adult_price);
    const extraChildRateForNight = (totalExtraChildren * resolvedPrice.extra_child_price);
    const totalExtraGuestForNight = extraAdultRateForNight + extraChildRateForNight;
    const nightlyTotal = roomRateForNight + totalExtraGuestForNight;

    totalBaseRoomCharge += roomRateForNight;
    totalExtraGuestCharge += totalExtraGuestForNight;

    dailyBreakdown.push({
      date: nightAvail.date,
      resolution_source: resolvedPrice.resolution_source,
      rule_details: resolvedPrice.rule_details,
      base_rate: resolvedPrice.base_nightly_price,
      meal_plan_adjustment: resolvedPrice.meal_plan_adjustment,
      net_nightly_rate: resolvedPrice.net_nightly_price,
      rooms: numRooms,
      room_charge: round2(roomRateForNight),
      extra_adults: totalExtraAdults,
      extra_adult_charge: round2(extraAdultRateForNight),
      extra_children: totalExtraChildren,
      extra_child_charge: round2(extraChildRateForNight),
      nightly_subtotal: round2(nightlyTotal),
      sellable_units: nightAvail.sellable
    });
  }

  const subtotalBeforeTax = round2(totalBaseRoomCharge + totalExtraGuestCharge);

  // 6. Tax calculation based on average nightly rate per room
  const avgNightlyRatePerRoom = dailyBreakdown.length > 0 ? (totalBaseRoomCharge / (dailyBreakdown.length * numRooms)) : 0;
  
  // Lookup matching tax slab
  const taxRule = db.prepare(`
    SELECT * FROM hospitality_tax_rules
    WHERE property_id = ? AND tenant_id = ? AND is_active = 1
      AND min_slab_rate <= ? AND max_slab_rate >= ?
    ORDER BY percentage ASC
    LIMIT 1
  `).get(propertyId, tenantId, avgNightlyRatePerRoom, avgNightlyRatePerRoom);

  let taxPercent = 12; // Standard fallback
  let taxName = "GST (12%)";
  if (taxRule) {
    taxPercent = Number(taxRule.percentage);
    taxName = taxRule.tax_name;
  } else if (avgNightlyRatePerRoom > 7500) {
    taxPercent = 18;
    taxName = "GST (18%)";
  }

  const cgstPercent = round2(taxPercent / 2);
  const sgstPercent = round2(taxPercent / 2);
  const cgstAmount = round2(subtotalBeforeTax * (cgstPercent / 100));
  const sgstAmount = round2(subtotalBeforeTax * (sgstPercent / 100));
  const totalTax = round2(cgstAmount + sgstAmount);
  const grandTotal = round2(subtotalBeforeTax + totalTax);

  // Return authoritative, non-binding quote
  return {
    quote_id: `Q-${propertyId}-${Date.now().toString(36).toUpperCase()}`,
    quote_generated_at: new Date().toISOString(),
    property: {
      id: prop.id,
      name: prop.name,
      currency: prop.currency || "INR"
    },
    room_category: {
      id: roomType.id,
      name: roomType.name,
      room_code: roomType.room_code,
      view_type: roomType.view_type,
      bed_type: roomType.bed_type
    },
    rate_plan: {
      id: ratePlan ? ratePlan.id : null,
      name: ratePlan ? ratePlan.name : "Standard Room Only",
      code: ratePlan ? ratePlan.code : "EP",
      meal_plan: ratePlan ? ratePlan.meal_plan : "EP",
      cancellation_policy: ratePlan ? ratePlan.cancellation_policy : "Standard property policy applies"
    },
    reservation_specs: {
      check_in: checkInDate,
      check_out: checkOutDate,
      nights: dailyBreakdown.length,
      rooms: numRooms,
      adults: numAdults,
      children: numChildren,
      extra_adults: totalExtraAdults,
      extra_children: totalExtraChildren
    },
    availability: {
      is_available: availability.is_available,
      status: availability.status,
      min_sellable_rooms: availability.min_sellable
    },
    pricing_summary: {
      currency: prop.currency || "INR",
      base_room_charges: round2(totalBaseRoomCharge),
      extra_guest_charges: round2(totalExtraGuestCharge),
      subtotal_before_tax: subtotalBeforeTax,
      taxes: {
        tax_name: taxName,
        tax_percentage: taxPercent,
        cgst_rate: cgstPercent,
        cgst_amount: cgstAmount,
        sgst_rate: sgstPercent,
        sgst_amount: sgstAmount,
        total_tax: totalTax
      },
      estimated_grand_total: grandTotal
    },
    occupancy_warning: occupancyWarning,
    daily_breakdown: dailyBreakdown,
    // CRITICAL DOMAIN RESTRICTIONS:
    disclaimer: "Estimated Price Quote (Subject to Staff Confirmation). This is an informational quotation only. Rates and availability are subject to re-verification upon direct confirmation with property reservations.",
    is_binding: false,
    can_confirm_directly: false
  };
}

/**
 * -------------------------------------------------------------------------
 * ADMINISTRATIVE RATE CONFIGURATION CRUD
 * -------------------------------------------------------------------------
 */

// Rate Plans
function listRatePlans(propertyId, tenantId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_rate_plans
    WHERE property_id = ? AND tenant_id = ?
    ORDER BY id ASC
  `).all(propertyId, tenantId);
}

function getRatePlanById(planId, propertyId, tenantId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_rate_plans
    WHERE id = ? AND property_id = ? AND tenant_id = ?
    LIMIT 1
  `).get(planId, propertyId, tenantId);
}

function createRatePlan(propertyId, data = {}, tenantId = 1, userId = null) {
  if (!data.name || !data.code) {
    throw new Error("Plan name and code are required.");
  }
  const res = db.prepare(`
    INSERT INTO hospitality_rate_plans
      (tenant_id, property_id, name, code, meal_plan, description, cancellation_policy, is_refundable, included_services_json, is_active, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    tenantId,
    propertyId,
    data.name,
    data.code.toUpperCase(),
    data.meal_plan || "EP",
    data.description || null,
    data.cancellation_policy || null,
    data.is_refundable !== undefined ? (data.is_refundable ? 1 : 0) : 1,
    data.included_services ? JSON.stringify(data.included_services) : null,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
  );

  logAudit(tenantId, userId, "HOSPITALITY_RATE_PLAN_CREATE", res.lastInsertRowid, {
    property_id: propertyId,
    code: data.code,
    name: data.name
  });

  return getRatePlanById(res.lastInsertRowid, propertyId, tenantId);
}

function updateRatePlan(planId, propertyId, data = {}, tenantId = 1, userId = null) {
  const existing = getRatePlanById(planId, propertyId, tenantId);
  if (!existing) {
    throw new Error("Rate plan not found.");
  }

  db.prepare(`
    UPDATE hospitality_rate_plans
    SET name = ?, code = ?, meal_plan = ?, description = ?, cancellation_policy = ?,
        is_refundable = ?, included_services_json = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(
    data.name !== undefined ? data.name : existing.name,
    data.code !== undefined ? data.code.toUpperCase() : existing.code,
    data.meal_plan !== undefined ? data.meal_plan : existing.meal_plan,
    data.description !== undefined ? data.description : existing.description,
    data.cancellation_policy !== undefined ? data.cancellation_policy : existing.cancellation_policy,
    data.is_refundable !== undefined ? (data.is_refundable ? 1 : 0) : existing.is_refundable,
    data.included_services !== undefined ? JSON.stringify(data.included_services) : existing.included_services_json,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
    planId,
    propertyId,
    tenantId
  );

  logAudit(tenantId, userId, "HOSPITALITY_RATE_PLAN_UPDATE", planId, data);
  return getRatePlanById(planId, propertyId, tenantId);
}

function deleteRatePlan(planId, propertyId, tenantId = 1, userId = null) {
  db.prepare(`
    UPDATE hospitality_rate_plans
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(planId, propertyId, tenantId);

  logAudit(tenantId, userId, "HOSPITALITY_RATE_PLAN_DELETE", planId, { property_id: propertyId });
  return { success: true };
}

// Seasonal Rates
function listSeasonalRates(propertyId, tenantId = 1) {
  return db.prepare(`
    SELECT sr.*, rt.name as room_type_name, rp.name as rate_plan_name
    FROM hospitality_seasonal_rates sr
    LEFT JOIN room_types rt ON sr.room_type_id = rt.id
    LEFT JOIN hospitality_rate_plans rp ON sr.rate_plan_id = rp.id
    WHERE sr.property_id = ? AND sr.tenant_id = ?
    ORDER BY sr.priority DESC, sr.start_date ASC
  `).all(propertyId, tenantId);
}

function createSeasonalRate(propertyId, data = {}, tenantId = 1, userId = null) {
  if (!data.season_name || !data.room_type_id || !data.start_date || !data.end_date || data.price === undefined) {
    throw new Error("Missing required seasonal rate fields: season_name, room_type_id, start_date, end_date, price.");
  }
  if (data.start_date > data.end_date) {
    throw new Error("end_date must be greater than or equal to start_date.");
  }

  const res = db.prepare(`
    INSERT INTO hospitality_seasonal_rates
      (tenant_id, property_id, room_type_id, rate_plan_id, season_name, start_date, end_date, price, extra_adult_price, extra_child_price, priority, active, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    tenantId,
    propertyId,
    data.room_type_id,
    data.rate_plan_id || null,
    data.season_name,
    data.start_date,
    data.end_date,
    round2(data.price),
    round2(data.extra_adult_price || 0),
    round2(data.extra_child_price || 0),
    data.priority ? Number(data.priority) : 1,
    data.active !== undefined ? (data.active ? 1 : 0) : 1
  );

  logAudit(tenantId, userId, "HOSPITALITY_SEASONAL_RATE_CREATE", res.lastInsertRowid, {
    property_id: propertyId,
    season_name: data.season_name,
    price: data.price
  });

  return { id: res.lastInsertRowid, success: true };
}

function updateSeasonalRate(seasonId, propertyId, data = {}, tenantId = 1, userId = null) {
  const existing = db.prepare(`
    SELECT * FROM hospitality_seasonal_rates
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).get(seasonId, propertyId, tenantId);

  if (!existing) {
    throw new Error("Seasonal rate not found.");
  }

  db.prepare(`
    UPDATE hospitality_seasonal_rates
    SET season_name = ?, room_type_id = ?, rate_plan_id = ?, start_date = ?, end_date = ?,
        price = ?, extra_adult_price = ?, extra_child_price = ?, priority = ?, active = ?
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(
    data.season_name !== undefined ? data.season_name : existing.season_name,
    data.room_type_id !== undefined ? data.room_type_id : existing.room_type_id,
    data.rate_plan_id !== undefined ? data.rate_plan_id : existing.rate_plan_id,
    data.start_date !== undefined ? data.start_date : existing.start_date,
    data.end_date !== undefined ? data.end_date : existing.end_date,
    data.price !== undefined ? round2(data.price) : existing.price,
    data.extra_adult_price !== undefined ? round2(data.extra_adult_price) : existing.extra_adult_price,
    data.extra_child_price !== undefined ? round2(data.extra_child_price) : existing.extra_child_price,
    data.priority !== undefined ? Number(data.priority) : existing.priority,
    data.active !== undefined ? (data.active ? 1 : 0) : existing.active,
    seasonId,
    propertyId,
    tenantId
  );

  logAudit(tenantId, userId, "HOSPITALITY_SEASONAL_RATE_UPDATE", seasonId, data);
  return { success: true };
}

function deleteSeasonalRate(seasonId, propertyId, tenantId = 1, userId = null) {
  db.prepare(`
    DELETE FROM hospitality_seasonal_rates
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(seasonId, propertyId, tenantId);

  logAudit(tenantId, userId, "HOSPITALITY_SEASONAL_RATE_DELETE", seasonId, { property_id: propertyId });
  return { success: true };
}

// Daily Rates
function listDailyRates(propertyId, roomTypeId = null, startDate = null, endDate = null, tenantId = 1) {
  let sql = `
    SELECT dr.*, rt.name as room_type_name, rp.name as rate_plan_name
    FROM hospitality_daily_rates dr
    LEFT JOIN room_types rt ON dr.room_type_id = rt.id
    LEFT JOIN hospitality_rate_plans rp ON dr.rate_plan_id = rp.id
    WHERE dr.property_id = ? AND dr.tenant_id = ?
  `;
  const params = [propertyId, tenantId];

  if (roomTypeId) {
    sql += ` AND dr.room_type_id = ?`;
    params.push(roomTypeId);
  }
  if (startDate) {
    sql += ` AND dr.rate_date >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND dr.rate_date <= ?`;
    params.push(endDate);
  }

  sql += ` ORDER BY dr.rate_date ASC`;
  return db.prepare(sql).all(...params);
}

function upsertDailyRate(propertyId, data = {}, tenantId = 1, userId = null) {
  if (!data.room_type_id || !data.rate_date || data.price === undefined) {
    throw new Error("Missing required daily rate fields: room_type_id, rate_date, price.");
  }

  const existing = db.prepare(`
    SELECT id FROM hospitality_daily_rates
    WHERE property_id = ? AND room_type_id = ? AND rate_date = ? AND tenant_id = ?
      AND (rate_plan_id = ? OR (rate_plan_id IS NULL AND ? IS NULL))
    LIMIT 1
  `).get(propertyId, data.room_type_id, data.rate_date, tenantId, data.rate_plan_id || null, data.rate_plan_id || null);

  if (existing) {
    db.prepare(`
      UPDATE hospitality_daily_rates
      SET price = ?, extra_adult_price = ?, extra_child_price = ?, reason = ?, created_by = ?
      WHERE id = ?
    `).run(
      round2(data.price),
      round2(data.extra_adult_price || 0),
      round2(data.extra_child_price || 0),
      data.reason || null,
      userId ? String(userId) : "staff",
      existing.id
    );
  } else {
    db.prepare(`
      INSERT INTO hospitality_daily_rates
        (tenant_id, property_id, room_type_id, rate_plan_id, rate_date, price, extra_adult_price, extra_child_price, reason, created_by, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      propertyId,
      data.room_type_id,
      data.rate_plan_id || null,
      data.rate_date,
      round2(data.price),
      round2(data.extra_adult_price || 0),
      round2(data.extra_child_price || 0),
      data.reason || null,
      userId ? String(userId) : "staff"
    );
  }

  logAudit(tenantId, userId, "HOSPITALITY_DAILY_RATE_UPSERT", data.room_type_id, {
    property_id: propertyId,
    rate_date: data.rate_date,
    price: data.price
  });

  return { success: true };
}

function bulkUpsertDailyRates(propertyId, { room_type_id, rate_plan_id, start_date, end_date, price, extra_adult_price, extra_child_price, reason }, tenantId = 1, userId = null) {
  const dates = availabilityService.getDatesInRange ? availabilityService.getDatesInRange(start_date, end_date, true) : [];
  
  // Simple date generator if needed
  let cur = new Date(start_date + "T00:00:00Z");
  const end = new Date(end_date + "T00:00:00Z");
  let count = 0;

  while (cur <= end) {
    const dStr = cur.toISOString().split("T")[0];
    upsertDailyRate(propertyId, {
      room_type_id,
      rate_plan_id,
      rate_date: dStr,
      price,
      extra_adult_price,
      extra_child_price,
      reason
    }, tenantId, userId);
    count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return { success: true, count };
}

function deleteDailyRate(dailyRateId, propertyId, tenantId = 1, userId = null) {
  db.prepare(`
    DELETE FROM hospitality_daily_rates
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(dailyRateId, propertyId, tenantId);

  logAudit(tenantId, userId, "HOSPITALITY_DAILY_RATE_DELETE", dailyRateId, { property_id: propertyId });
  return { success: true };
}

// Tax Rules
function listTaxRules(propertyId, tenantId = 1) {
  return db.prepare(`
    SELECT * FROM hospitality_tax_rules
    WHERE property_id = ? AND tenant_id = ?
    ORDER BY min_slab_rate ASC
  `).all(propertyId, tenantId);
}

function upsertTaxRule(propertyId, data = {}, tenantId = 1, userId = null) {
  if (!data.tax_name || data.percentage === undefined) {
    throw new Error("tax_name and percentage are required.");
  }

  if (data.id) {
    db.prepare(`
      UPDATE hospitality_tax_rules
      SET tax_name = ?, percentage = ?, min_slab_rate = ?, max_slab_rate = ?, is_active = ?
      WHERE id = ? AND property_id = ? AND tenant_id = ?
    `).run(
      data.tax_name,
      round2(data.percentage),
      round2(data.min_slab_rate || 0),
      round2(data.max_slab_rate || 999999),
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
      data.id,
      propertyId,
      tenantId
    );
  } else {
    db.prepare(`
      INSERT INTO hospitality_tax_rules
        (tenant_id, property_id, tax_name, percentage, min_slab_rate, max_slab_rate, is_active, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      tenantId,
      propertyId,
      data.tax_name,
      round2(data.percentage),
      round2(data.min_slab_rate || 0),
      round2(data.max_slab_rate || 999999),
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    );
  }

  logAudit(tenantId, userId, "HOSPITALITY_TAX_RULE_UPSERT", data.id || "NEW", {
    property_id: propertyId,
    tax_name: data.tax_name,
    percentage: data.percentage
  });

  return { success: true };
}

function deleteTaxRule(ruleId, propertyId, tenantId = 1, userId = null) {
  db.prepare(`
    DELETE FROM hospitality_tax_rules
    WHERE id = ? AND property_id = ? AND tenant_id = ?
  `).run(ruleId, propertyId, tenantId);

  logAudit(tenantId, userId, "HOSPITALITY_TAX_RULE_DELETE", ruleId, { property_id: propertyId });
  return { success: true };
}

module.exports = {
  getResolvedDailyPrice,
  calculateQuote,
  listRatePlans,
  getRatePlanById,
  createRatePlan,
  updateRatePlan,
  deleteRatePlan,
  listSeasonalRates,
  createSeasonalRate,
  updateSeasonalRate,
  deleteSeasonalRate,
  listDailyRates,
  upsertDailyRate,
  bulkUpsertDailyRates,
  deleteDailyRate,
  listTaxRules,
  upsertTaxRule,
  deleteTaxRule
};

