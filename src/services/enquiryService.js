const { db } = require("../config/database");
const inventoryService = require("./inventoryService");

/**
 * Format phone number to clean E.164 without leading '+'
 */
function cleanPhoneNumber(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    digits = "91" + digits; // Default India prefix
  }
  return digits;
}

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
    // Non-blocking
  }
}

/**
 * Upsert Contact (PRD PR-004)
 */
function upsertContact(tenantId = 1, phone, name = null, email = null, source = "WHATSAPP") {
  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone) {
    throw new Error("Valid phone number required for contact upsert.");
  }

  const existing = db.prepare(`
    SELECT * FROM contacts WHERE tenant_id = ? AND phone_e164 = ?
  `).get(tenantId, cleanPhone);

  if (existing) {
    const updatedName = (name && String(name).trim()) || existing.name;
    const updatedEmail = (email && String(email).trim()) || existing.email;
    db.prepare(`
      UPDATE contacts 
      SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(updatedName, updatedEmail, existing.id);

    return db.prepare("SELECT * FROM contacts WHERE id = ?").get(existing.id);
  }

  const res = db.prepare(`
    INSERT INTO contacts (tenant_id, phone_e164, name, email, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(tenantId, cleanPhone, name || "WhatsApp Guest", email || null, source);

  const contactId = res.lastInsertRowid;

  // Record consent history
  try {
    db.prepare(`
      INSERT INTO contact_consents (tenant_id, contact_id, purpose, status, source, captured_at)
      VALUES (?, ?, 'BOOKING', 'GRANTED', 'WHATSAPP_INBOUND', CURRENT_TIMESTAMP)
    `).run(tenantId, contactId);
  } catch (e) {}

  return db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
}

/**
 * Create Enquiry (PRD PR-007, PR-008)
 */
function createEnquiry(tenantId = 1, data = {}, userId = "system") {
  const {
    property_id = 1,
    phone,
    guest_name,
    email,
    check_in,
    check_out,
    adults = 2,
    children = 0,
    rooms_requested = 1,
    room_type_id = null,
    room_preference = null,
    preferences = {},
    flow_session_id = null,
    conversation_id = null,
    notes = null
  } = data;

  const cleanPhone = cleanPhoneNumber(phone);
  if (!cleanPhone) {
    throw new Error("Guest phone number is required.");
  }
  if (!check_in || !check_out) {
    throw new Error("Check-in and Check-out dates are required.");
  }

  // PR-008: Date validation - check_out must be later than check_in
  const cin = new Date(check_in);
  const cout = new Date(check_out);
  if (isNaN(cin.getTime()) || isNaN(cout.getTime())) {
    throw new Error("Invalid date format provided for check-in or check-out.");
  }
  if (cout <= cin) {
    throw new Error("Check-out date must be strictly after check-in date.");
  }

  // Idempotency check by flow_session_id (PRD PR-007)
  if (flow_session_id) {
    const existingEnquiry = db.prepare(`
      SELECT * FROM booking_enquiries WHERE tenant_id = ? AND flow_session_id = ?
    `).get(tenantId, flow_session_id);
    if (existingEnquiry) {
      return getEnquiryById(tenantId, existingEnquiry.id); // Return existing enriched enquiry without duplicate creation
    }
  }

  // Upsert Contact
  const contact = upsertContact(tenantId, cleanPhone, guest_name, email, "BOOKING_ENQUIRY");

  const numAdults = Math.max(1, Number(adults) || 1);
  const numChildren = Math.max(0, Number(children) || 0);
  const numRooms = Math.max(1, Number(rooms_requested) || 1);

  // Validate room_type_id if provided
  let validRoomTypeId = null;
  let resolvedPref = room_preference;
  if (room_type_id) {
    const rt = db.prepare("SELECT id, name FROM room_types WHERE tenant_id = ? AND id = ?").get(tenantId, room_type_id);
    if (rt) {
      validRoomTypeId = rt.id;
      if (!resolvedPref) resolvedPref = rt.name;
    }
  }

  const assignedTo = data.assigned_to || (userId && userId !== "system" ? userId : null);

  const res = db.prepare(`
    INSERT INTO booking_enquiries (
      tenant_id, property_id, contact_id, conversation_id, flow_session_id,
      guest_name, phone_e164, check_in, check_out, adults, children,
      rooms_requested, room_type_id, room_preference, preferences_json,
      status, assigned_to, follow_up_at, notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      'NEW', ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `).run(
    tenantId,
    property_id,
    contact.id,
    conversation_id || null,
    flow_session_id || null,
    guest_name || contact.name || "Guest",
    cleanPhone,
    check_in,
    check_out,
    numAdults,
    numChildren,
    numRooms,
    validRoomTypeId,
    resolvedPref || null,
    preferences ? JSON.stringify(preferences) : null,
    assignedTo,
    notes || null
  );

  const enquiryId = res.lastInsertRowid;
  logAudit(tenantId, userId, "ENQUIRY_CREATED", enquiryId, {
    guest_name,
    phone: cleanPhone,
    check_in,
    check_out,
    flow_session_id
  });

  return getEnquiryById(tenantId, enquiryId);
}

/**
 * List booking enquiries with filtering (PRD Section 8: GET /api/v1/enquiries)
 */
function listEnquiries(tenantId = 1, filters = {}) {
  const { status, search, assigned_to, date_from, date_to, limit = 50, offset = 0, scopedUserId, scopedUserName, isAdmin } = filters;

  let sql = `
    SELECT e.*, 
           c.email as guest_email,
           r.name as room_type_name,
           r.base_rate as room_base_rate,
           u.name as assigned_to_name,
           (SELECT COUNT(*) FROM quotes q WHERE q.enquiry_id = e.id) as quote_count,
           (SELECT q.total FROM quotes q WHERE q.enquiry_id = e.id ORDER BY q.id DESC LIMIT 1) as latest_quote_total,
           (SELECT q.status FROM quotes q WHERE q.enquiry_id = e.id ORDER BY q.id DESC LIMIT 1) as latest_quote_status
    FROM booking_enquiries e
    JOIN contacts c ON e.contact_id = c.id
    LEFT JOIN room_types r ON e.room_type_id = r.id
    LEFT JOIN users u ON e.assigned_to = u.id
    WHERE e.tenant_id = ?
  `;
  const params = [tenantId];
  let countSql = "SELECT COUNT(*) as total FROM booking_enquiries e WHERE e.tenant_id = ?";
  const countParams = [tenantId];

  // Enforce account isolation: non-admins strictly see only enquiries assigned to them
  if (isAdmin === false || (scopedUserId && !isAdmin)) {
    sql += " AND (e.assigned_to = ? OR e.assigned_to = ?)";
    params.push(scopedUserId, scopedUserName || scopedUserId);
    countSql += " AND (e.assigned_to = ? OR e.assigned_to = ?)";
    countParams.push(scopedUserId, scopedUserName || scopedUserId);
  } else if (assigned_to) {
    if (assigned_to === "UNASSIGNED") {
      sql += " AND (e.assigned_to IS NULL OR e.assigned_to = '')";
      countSql += " AND (e.assigned_to IS NULL OR e.assigned_to = '')";
    } else {
      sql += " AND e.assigned_to = ?";
      params.push(assigned_to);
      countSql += " AND e.assigned_to = ?";
      countParams.push(assigned_to);
    }
  }

  if (status && String(status).toUpperCase() !== "ALL") {
    sql += " AND e.status = ?";
    params.push(String(status).toUpperCase());
    countSql += " AND e.status = ?";
    countParams.push(String(status).toUpperCase());
  }

  if (date_from) {
    sql += " AND e.check_in >= ?";
    params.push(date_from);
    countSql += " AND e.check_in >= ?";
    countParams.push(date_from);
  }

  if (date_to) {
    sql += " AND e.check_in <= ?";
    params.push(date_to);
    countSql += " AND e.check_in <= ?";
    countParams.push(date_to);
  }

  if (search && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    sql += " AND (e.guest_name LIKE ? OR e.phone_e164 LIKE ? OR e.room_preference LIKE ?)";
    params.push(term, term, term);
    countSql += " AND (e.guest_name LIKE ? OR e.phone_e164 LIKE ? OR e.room_preference LIKE ?)";
    countParams.push(term, term, term);
  }

  sql += " ORDER BY e.id DESC LIMIT ? OFFSET ?";
  params.push(Number(limit) || 50, Number(offset) || 0);

  const enquiries = db.prepare(sql).all(...params);
  const total = db.prepare(countSql).get(...countParams)?.total || 0;

  return { total, enquiries };
}

/**
 * Get Enquiry by ID with quotes, contact, and live availability check (PRD Section 8: GET /api/v1/enquiries/{id})
 */
function getEnquiryById(tenantId = 1, id) {
  const enquiry = db.prepare(`
    SELECT e.*, 
           c.email as guest_email,
           r.name as room_type_name,
           r.base_rate as room_base_rate,
           u.name as assigned_to_name
    FROM booking_enquiries e
    JOIN contacts c ON e.contact_id = c.id
    LEFT JOIN room_types r ON e.room_type_id = r.id
    LEFT JOIN users u ON e.assigned_to = u.id
    WHERE e.tenant_id = ? AND e.id = ?
  `).get(tenantId, id);

  if (!enquiry) return null;

  // Fetch all quotes for this enquiry
  const quotes = db.prepare(`
    SELECT q.*, u.name as created_by_name
    FROM quotes q
    LEFT JOIN users u ON q.created_by = u.id
    WHERE q.tenant_id = ? AND q.enquiry_id = ?
    ORDER BY q.id DESC
  `).all(tenantId, id);

  for (const q of quotes) {
    q.items = db.prepare(`
      SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id ASC
    `).all(q.id);
  }

  // Check stay availability against manual room inventory
  const availabilityCheck = inventoryService.checkStayAvailability(
    tenantId,
    enquiry.check_in,
    enquiry.check_out,
    enquiry.room_type_id,
    enquiry.rooms_requested
  );

  // Fetch related customer replies / conversation if available
  const messages = db.prepare(`
    SELECT id, from_phone, customer_name, message_type, message_body, received_at, reply_text, reply_sent_at, reply_status
    FROM customer_replies
    WHERE from_phone = ? OR from_phone = ?
    ORDER BY id ASC
  `).all(enquiry.phone_e164, `+${enquiry.phone_e164}`);

  return {
    ...enquiry,
    quotes,
    availability_check: availabilityCheck,
    conversation_history: messages
  };
}

/**
 * Update Enquiry (PRD PR-014, Section 9.1: Status, assignment, notes, follow-up)
 */
function updateEnquiry(tenantId = 1, id, data = {}, userId = "system") {
  const existing = getEnquiryById(tenantId, id);
  if (!existing) {
    throw new Error("Enquiry not found.");
  }

  const ALLOWED_STATUSES = ["NEW", "QUALIFIED", "QUOTED", "WON", "LOST", "CANCELLED"];
  let newStatus = existing.status;

  if (data.status) {
    const s = String(data.status).toUpperCase();
    if (!ALLOWED_STATUSES.includes(s)) {
      throw new Error(`Invalid status '${data.status}'. Allowed: ${ALLOWED_STATUSES.join(", ")}`);
    }
    // Section 9.1: "Only staff can mark an enquiry Won in Phase 1; require a note or reason if marked Lost."
    if (s === "LOST" && !data.lost_reason && !data.notes && !existing.lost_reason && !existing.notes) {
      throw new Error("A reason or note is required when marking an enquiry as LOST.");
    }
    newStatus = s;
  }

  const assigned_to = data.assigned_to !== undefined ? (data.assigned_to || null) : existing.assigned_to;
  const follow_up_at = data.follow_up_at !== undefined ? (data.follow_up_at || null) : existing.follow_up_at;
  const notes = data.notes !== undefined ? String(data.notes) : existing.notes;
  const lost_reason = data.lost_reason !== undefined ? String(data.lost_reason) : existing.lost_reason;
  const room_type_id = data.room_type_id !== undefined ? Number(data.room_type_id) : existing.room_type_id;

  const isConfirmingNewRoomBooking =
    (newStatus === "WON" || newStatus === "CONFIRMED") &&
    existing.status !== "WON" &&
    existing.status !== "CONFIRMED" &&
    room_type_id &&
    existing.check_in &&
    existing.check_out;

  db.prepare("START TRANSACTION").run();
  try {
    if (isConfirmingNewRoomBooking) {
      db.prepare("SELECT id FROM room_types WHERE id = ? AND tenant_id = ? FOR UPDATE").get(room_type_id, tenantId);
      const hospAvail = require("./hospitalityAvailabilityService");
      const avail = hospAvail.checkRoomAvailability(
        existing.property_id || 1,
        room_type_id,
        existing.check_in,
        existing.check_out,
        existing.rooms_requested || 1,
        tenantId
      );
      if (!avail.available) {
        const err = new Error("Overbooking prevented: Insufficient room availability for selected dates.");
        err.statusCode = 409;
        err.code = "OVERBOOKING_PREVENTED";
        throw err;
      }
    }

    db.prepare(`
      UPDATE booking_enquiries
      SET status = ?, assigned_to = ?, follow_up_at = ?, notes = ?, lost_reason = ?, room_type_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = ? AND id = ?
    `).run(newStatus, assigned_to, follow_up_at, notes, lost_reason, room_type_id, tenantId, id);

    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch (_) {}
    throw err;
  }

  logAudit(tenantId, userId, "ENQUIRY_UPDATED", id, {
    old_status: existing.status,
    new_status: newStatus,
    assigned_to,
    follow_up_at,
    lost_reason
  });

  return getEnquiryById(tenantId, id);
}

/**
 * Tenant Dashboard Summary (PRD Section 8: GET /api/v1/dashboard/summary)
 */
function getDashboardSummary(tenantId = 1, user = null) {
  const isNonAdmin = user && user.role !== "ADMIN";
  const userFilterSql = isNonAdmin ? " AND (assigned_to = ? OR assigned_to = ?)" : "";
  const userFilterParams = isNonAdmin ? [user.id, user.name || user.id] : [];

  // Counts by status
  const statuses = ["NEW", "QUALIFIED", "QUOTED", "WON", "LOST", "CANCELLED"];
  const counts = { TOTAL: 0 };
  for (const s of statuses) {
    counts[s] = 0;
  }

  const rows = db.prepare(`
    SELECT status, COUNT(*) as c 
    FROM booking_enquiries 
    WHERE tenant_id = ? ${userFilterSql}
    GROUP BY status
  `).all(tenantId, ...userFilterParams);

  let total = 0;
  for (const r of rows) {
    counts[r.status] = r.c;
    total += r.c;
  }
  counts.TOTAL = total;

  // Financial quotation metrics
  const financialUserFilterSql = isNonAdmin ? " AND (e.assigned_to = ? OR e.assigned_to = ?)" : "";
  const financialUserFilterParams = isNonAdmin ? [user.id, user.name || user.id] : [];
  const financial = db.prepare(`
    SELECT 
      COUNT(*) as total_quotes,
      COALESCE(SUM(CASE WHEN q.status = 'SENT' THEN q.total ELSE 0 END), 0) as quoted_pipeline_value,
      COALESCE(SUM(CASE WHEN e.status = 'WON' THEN q.total ELSE 0 END), 0) as won_revenue,
      COALESCE(AVG(q.total), 0) as avg_quote_value
    FROM quotes q
    JOIN booking_enquiries e ON q.enquiry_id = e.id
    WHERE q.tenant_id = ? ${financialUserFilterSql}
  `).get(tenantId, ...financialUserFilterParams);

  // Conversion rate: Won / (Total - Cancelled) or 0
  const activeEnquiryBase = (counts.TOTAL - (counts.CANCELLED || 0));
  const conversionRate = activeEnquiryBase > 0 
    ? Number(((counts.WON / activeEnquiryBase) * 100).toFixed(1))
    : 0;

  // Upcoming check-ins (from today onwards)
  const todayStr = new Date().toISOString().split("T")[0];
  const upcomingCheckins = db.prepare(`
    SELECT e.id, e.guest_name, e.phone_e164, e.check_in, e.check_out, e.adults, e.children, e.status,
           r.name as room_type_name
    FROM booking_enquiries e
    LEFT JOIN room_types r ON e.room_type_id = r.id
    WHERE e.tenant_id = ? AND e.check_in >= ? AND e.status != 'CANCELLED' ${financialUserFilterSql}
    ORDER BY e.check_in ASC
    LIMIT 6
  `).all(tenantId, todayStr, ...financialUserFilterParams);

  // Recent 6 enquiries
  const recentEnquiries = db.prepare(`
    SELECT e.id, e.guest_name, e.phone_e164, e.check_in, e.check_out, e.adults, e.status, e.created_at,
           r.name as room_type_name,
           (SELECT q.total FROM quotes q WHERE q.enquiry_id = e.id ORDER BY q.id DESC LIMIT 1) as quote_amount
    FROM booking_enquiries e
    LEFT JOIN room_types r ON e.room_type_id = r.id
    WHERE e.tenant_id = ? ${financialUserFilterSql}
    ORDER BY e.id DESC
    LIMIT 6
  `).all(tenantId, ...financialUserFilterParams);

  // Today's room availability snapshot
  const roomTypes = db.prepare(`
    SELECT r.id, r.name, r.base_rate,
           COALESCE(i.available_qty, 5) as today_available_qty,
           COALESCE(i.is_closed, 0) as today_is_closed
    FROM room_types r
    LEFT JOIN room_inventory_daily i ON r.id = i.room_type_id AND i.inventory_date = ?
    WHERE r.tenant_id = ? AND r.active = 1
  `).all(todayStr, tenantId);

  return {
    counts,
    financial: {
      total_quotes: financial?.total_quotes || 0,
      pipeline_value: financial?.quoted_pipeline_value || 0,
      won_revenue: financial?.won_revenue || 0,
      avg_quote_value: Math.round(financial?.avg_quote_value || 0)
    },
    conversion_rate: conversionRate,
    upcoming_checkins: upcomingCheckins,
    recent_enquiries: recentEnquiries,
    room_types: roomTypes
  };
}

module.exports = {
  cleanPhoneNumber,
  upsertContact,
  createEnquiry,
  listEnquiries,
  getEnquiryById,
  updateEnquiry,
  getDashboardSummary
};
