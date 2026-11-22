const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { authenticateToken } = require("../middleware/authMiddleware");
const universalFulfillmentService = require("../services/universal/universalFulfillmentService");
const { db } = require("../config/database");

/**
 * Universal Fulfillment & Transactions API Routes
 * Mounts at /api/v1/transactions, /api/transactions, and public endpoints
 */

// Helper to get tenantId from req
function getTenantId(req) {
  return Number(req.user?.tenant_id || req.user?.tenantId || req.query.tenantId || req.headers["x-tenant-id"] || 1);
}

// -------------------------------------------------------------
// Authenticated Staff/Admin Endpoints
// -------------------------------------------------------------

/**
 * GET / - List transactions with filters and pagination
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const {
      transaction_type,
      transactionType,
      fulfillment_status,
      fulfillmentStatus,
      payment_status,
      paymentStatus,
      location_id,
      locationId,
      service_date,
      serviceDate,
      search,
      limit = 25,
      offset = 0
    } = req.query;

    const result = universalFulfillmentService.listTransactions(tenantId, {
      transactionType: transactionType || transaction_type,
      fulfillmentStatus: fulfillmentStatus || fulfillment_status,
      paymentStatus: paymentStatus || payment_status,
      locationId: locationId || location_id,
      serviceDate: serviceDate || service_date,
      search,
      limit: Number(limit) || 25,
      offset: Number(offset) || 0
    });

    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /drawer-context/:phone - Live Commerce Context for Inbox Drawer
 */
router.get("/drawer-context/:phone", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const phone = req.params.phone;
    const context = universalFulfillmentService.getCommerceDrawerContext(tenantId, phone);
    return res.json(context);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /:id - Retrieve single transaction with items
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = req.params.id;

    // Check if ID is numeric or referenceCode
    const txn = isNaN(Number(id))
      ? universalFulfillmentService.getTransactionByRef(tenantId, id)
      : universalFulfillmentService.getTransactionById(tenantId, Number(id));

    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    return res.json({
      success: true,
      data: txn
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /:id/status - Update fulfillment status
 */
router.patch("/:id/status", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { status, fulfillmentStatus } = req.body;
    const targetStatus = (fulfillmentStatus || status || "").toUpperCase();

    const allowed = ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"];
    if (!allowed.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid fulfillment status. Allowed: ${allowed.join(", ")}`
      });
    }

    const userId = req.user?.id ? `user-${req.user.id}` : "staff";
    const result = await universalFulfillmentService.updateFulfillmentStatus(tenantId, id, targetStatus, userId);

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /:id/record-offline-payment - Record offline cash/UPI/POS payment
 */
router.post("/:id/record-offline-payment", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const { amount, paymentMethod = "CASH", notes = "" } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Valid payment amount is required" });
    }

    const userId = req.user?.id ? `user-${req.user.id}` : "staff";
    const result = await universalFulfillmentService.recordOfflinePayment(tenantId, id, {
      amount: Number(amount),
      paymentMethod,
      notes,
      userId
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /:id/send-payment-link - Send/resend payment link to customer
 */
router.post("/:id/send-payment-link", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const id = Number(req.params.id);
    const txn = universalFulfillmentService.getTransactionById(tenantId, id);

    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    const paymentLinkUrl = txn.payment_link_url || `/api/v1/public/pay/${txn.reference_code}`;

    // Mock/Simulated WhatsApp message dispatch
    console.log(`[UniversalFulfillment] Dispatched payment link for ${txn.reference_code} to ${txn.customer_phone}: ${paymentLinkUrl} (Mock/Simulated safe)`);

    return res.json({
      success: true,
      message: `Payment link sent to +${txn.customer_phone}`,
      paymentLinkUrl
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /quick-link - Generate a payment link on the fly from Inbox drawer
 */
router.post("/quick-link", authenticateToken, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { customerPhone, customerName, itemId, quantity = 1, addOnIds = [], amount, title } = req.body;

    if (!customerPhone) {
      return res.status(400).json({ success: false, message: "Customer phone is required" });
    }

    let items = [];
    if (itemId) {
      items = [{ itemId: Number(itemId), quantity: Number(quantity) || 1 }];
    } else {
      // Direct custom amount
      const amt = Number(amount) || 100;
      items = [{
        title: title || "Custom Payment",
        unitPrice: amt,
        quantity: 1,
        inventory_mode: "UNIT_STOCK",
        lineTotal: amt
      }];
    }

    const addOns = (addOnIds || []).map(id => ({ addonId: Number(id), quantity: 1 }));

    const txnRes = await universalFulfillmentService.createTransactionFromQuote({
      tenantId,
      sourceChannel: "INBOX_AGENT",
      customer: { phone: customerPhone, name: customerName },
      cartItems: items,
      addOns,
      userId: req.user?.id ? `user-${req.user.id}` : "agent"
    });

    return res.status(201).json(txnRes);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
