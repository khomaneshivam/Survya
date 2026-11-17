const unifiedOrderService = require("../services/unifiedOrderService");

async function createOrder(req, res) {
  try {
    const tenantId = req.user?.tenant_id || 1;
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
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function updateStatus(req, res) {
  try {
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

