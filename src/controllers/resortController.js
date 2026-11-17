const inventoryService = require("../services/inventoryService");
const enquiryService = require("../services/enquiryService");
const quotationService = require("../services/quotationService");
const { db } = require("../config/database");

/**
 * GET /api/v1/dashboard/summary
 * Or GET /api/resort-dashboard/summary
 */
async function getDashboardSummary(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const summary = enquiryService.getDashboardSummary(tenantId, req.user);
    return res.json({ success: true, data: summary });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/room-types
 * Or GET /api/room-types
 */
async function listRoomTypes(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const includeInactive = req.query?.include_inactive === "true";
    const roomTypes = inventoryService.listRoomTypes(tenantId, 1, includeInactive);
    return res.json({ success: true, data: roomTypes });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/room-types
 * Or POST /api/room-types
 */
async function createRoomType(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const roomType = inventoryService.createRoomType(tenantId, req.body, userId);
    return res.status(201).json({ success: true, data: roomType });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /api/v1/room-types/:id
 */
async function updateRoomType(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const roomType = inventoryService.updateRoomType(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, data: roomType });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/inventory/availability
 * Or GET /api/inventory/availability
 */
async function getInventoryAvailability(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const { start_date, end_date, room_type_id } = req.query || {};
    const availability = inventoryService.getAvailability(tenantId, start_date, end_date, room_type_id);
    return res.json({ success: true, data: availability });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PUT /api/v1/inventory/daily
 * Or PUT /api/inventory/daily
 */
async function updateDailyInventory(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const updates = Array.isArray(req.body) ? req.body : (req.body?.updates || []);
    const result = inventoryService.bulkUpdateInventory(tenantId, updates, userId);
    return res.json({ success: true, message: "Inventory successfully updated.", data: result });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/enquiries
 * Or GET /api/enquiries
 */
async function listEnquiries(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const filters = {
      status: req.query?.status,
      search: req.query?.search,
      assigned_to: req.query?.assigned_to,
      date_from: req.query?.date_from,
      date_to: req.query?.date_to,
      limit: req.query?.limit,
      offset: req.query?.offset,
      scopedUserId: req.user?.role === "ADMIN" ? null : req.user?.id,
      scopedUserName: req.user?.role === "ADMIN" ? null : req.user?.name,
      isAdmin: req.user?.role === "ADMIN"
    };
    const result = enquiryService.listEnquiries(tenantId, filters);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/enquiries
 * Or POST /api/enquiries
 */
async function createEnquiry(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const enquiry = enquiryService.createEnquiry(tenantId, req.body, userId);
    return res.status(201).json({ success: true, data: enquiry });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/enquiries/:id
 * Or GET /api/enquiries/:id
 */
async function getEnquiry(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const enquiry = enquiryService.getEnquiryById(tenantId, req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }
    if (req.user?.role !== "ADMIN" && enquiry.assigned_to !== req.user.id && enquiry.assigned_to !== req.user.name) {
      return res.status(403).json({ success: false, message: "Access denied. You are not assigned to this enquiry." });
    }
    return res.json({ success: true, data: enquiry });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * PATCH /api/v1/enquiries/:id
 * Or PATCH /api/enquiries/:id
 */
async function updateEnquiry(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const existing = enquiryService.getEnquiryById(tenantId, req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }
    if (req.user?.role !== "ADMIN" && existing.assigned_to !== req.user.id && existing.assigned_to !== req.user.name) {
      return res.status(403).json({ success: false, message: "Access denied. You cannot modify enquiries assigned to another user." });
    }
    const updated = enquiryService.updateEnquiry(tenantId, req.params.id, req.body, userId);
    return res.json({ success: true, data: updated });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/enquiries/:id/quotes
 * Or POST /api/enquiries/:id/quotes
 */
async function createQuote(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const enquiry = enquiryService.getEnquiryById(tenantId, req.params.id);
    if (!enquiry) {
      return res.status(404).json({ success: false, message: "Enquiry not found." });
    }
    if (req.user?.role !== "ADMIN" && enquiry.assigned_to !== req.user.id && enquiry.assigned_to !== req.user.name) {
      return res.status(403).json({ success: false, message: "Access denied. You cannot quote enquiries assigned to another user." });
    }
    const quote = quotationService.createQuote(tenantId, req.params.id, req.body, userId);
    return res.status(201).json({ success: true, data: quote });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/quotes/:id
 * Or GET /api/quotes/:id
 */
async function getQuote(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const quote = quotationService.getQuoteById(tenantId, req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quotation not found." });
    }
    const enquiry = enquiryService.getEnquiryById(tenantId, quote.enquiry_id);
    if (req.user?.role !== "ADMIN" && enquiry && enquiry.assigned_to !== req.user.id && enquiry.assigned_to !== req.user.name) {
      return res.status(403).json({ success: false, message: "Access denied to this quotation." });
    }
    return res.json({ success: true, data: quote });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * POST /api/v1/quotes/:id/send
 * Or POST /api/quotes/:id/send
 */
async function sendQuote(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const userId = req.user?.id || "system";
    const quote = quotationService.getQuoteById(tenantId, req.params.id);
    if (!quote) {
      return res.status(404).json({ success: false, message: "Quotation not found." });
    }
    const enquiry = enquiryService.getEnquiryById(tenantId, quote.enquiry_id);
    if (req.user?.role !== "ADMIN" && enquiry && enquiry.assigned_to !== req.user.id && enquiry.assigned_to !== req.user.name) {
      return res.status(403).json({ success: false, message: "Access denied to send this quotation." });
    }
    const result = await quotationService.sendQuoteViaWhatsApp(tenantId, req.params.id, userId);
    return res.json({ success: true, message: "Quotation sent successfully via WhatsApp.", data: result });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/v1/contacts (PRD Section 8)
 */
async function searchContacts(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
    const search = req.query?.search;
    let sql = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM booking_enquiries e WHERE e.contact_id = c.id) as enquiry_count
      FROM contacts c
      WHERE c.tenant_id = ?
    `;
    const params = [tenantId];

    // Non-admin users strictly see only contacts associated with their assigned enquiries or conversations
    if (req.user?.role !== "ADMIN") {
      sql += ` AND (
        EXISTS (SELECT 1 FROM booking_enquiries e WHERE e.contact_id = c.id AND (e.assigned_to = ? OR e.assigned_to = ?))
        OR EXISTS (SELECT 1 FROM customer_replies cr WHERE cr.from_phone = c.phone_e164 AND (cr.user_id = ? OR cr.campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)))
      )`;
      params.push(req.user.id, req.user.name || req.user.id, req.user.id, req.user.id);
    }

    if (search && String(search).trim()) {
      sql += " AND (c.name LIKE ? OR c.phone_e164 LIKE ? OR c.email LIKE ?)";
      const term = `%${String(search).trim()}%`;
      params.push(term, term, term);
    }
    sql += " ORDER BY c.updated_at DESC LIMIT 50";
    const contacts = db.prepare(sql).all(...params);
    return res.json({ success: true, data: contacts });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  getDashboardSummary,
  listRoomTypes,
  createRoomType,
  updateRoomType,
  getInventoryAvailability,
  updateDailyInventory,
  listEnquiries,
  createEnquiry,
  getEnquiry,
  updateEnquiry,
  createQuote,
  getQuote,
  sendQuote,
  searchContacts
};

