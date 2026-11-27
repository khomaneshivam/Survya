const unifiedOrderService = require("../services/unifiedOrderService");
const catalogService = require("../services/catalogService");
const { isPlatformAdmin } = require("../middleware/authMiddleware");

function assertEntityTenantAccess(entityId, user) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  const entity = catalogService.getEntityById(entityId);
  if (!entity) return false;
  return Number(entity.tenant_id || 1) === Number(user.tenant_id || 1);
}

async function createOrder(req, res) {
  try {
    if (req.user && !assertEntityTenantAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden: entity does not belong to your workspace." });
    }
    const entity = catalogService.getEntityById(req.params.id);
    if (!entity) {
      return res.status(404).json({ success: false, message: "Business entity not found" });
    }
    const tenantId = req.user?.tenant_id || entity.tenant_id || 1;
    const orderData = {
      ...req.body,
      entity_id: parseInt(req.params.id, 10)
    };
    const order = unifiedOrderService.createOrder(orderData, tenantId);
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

async function listOrders(req, res) {
  try {
    if (!assertEntityTenantAccess(req.params.id, req.user)) {
      return res.status(403).json({ success: false, message: "Forbidden: unauthorized workspace access." });
    }
    const orders = unifiedOrderService.listOrders(req.params.id, req.query);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function getOrder(req, res) {
  try {
    const order = isNaN(req.params.id)
      ? unifiedOrderService.getOrderByNumber(req.params.id)
      : unifiedOrderService.getOrderById(req.params.id);

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!isPlatformAdmin(req.user) && Number(order.tenant_id || 1) !== Number(req.user?.tenant_id || 1)) {
      return res.status(403).json({ success: false, message: "Forbidden: order belongs to another workspace." });
    }
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateStatus(req, res) {
  try {
    const existing = isNaN(req.params.id)
      ? unifiedOrderService.getOrderByNumber(req.params.id)
      : unifiedOrderService.getOrderById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Order not found" });
    if (!isPlatformAdmin(req.user) && Number(existing.tenant_id || 1) !== Number(req.user?.tenant_id || 1)) {
      return res.status(403).json({ success: false, message: "Forbidden: order belongs to another workspace." });
    }

    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, message: "Status is required" });

    const order = unifiedOrderService.updateOrderStatus(req.params.id, status, notes);
    res.json({ success: true, order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  updateStatus
};

