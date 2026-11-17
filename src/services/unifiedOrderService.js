const { db } = require("../config/database");

/**
 * Generates human-friendly unique order number: ORD-2026-9281
 */
function generateOrderNumber() {
  const yyyy = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const time = Date.now().toString().slice(-3);
  return `ORD-${yyyy}-${rand}${time}`.slice(0, 20);
}

function createOrder(data, tenantId = 1) {
  if (!data.entity_id || !data.customer_name || !data.customer_phone || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("Missing required order parameters: entity_id, customer_name, customer_phone, items");
  }

  const entity = db.prepare("SELECT * FROM business_entities WHERE id = ?").get(data.entity_id);
  if (!entity) throw new Error("Entity not found");

  const orderNumber = data.order_number || generateOrderNumber();

  let subtotal = 0;
  let taxTotal = 0;

  // Validate and compute items
  const preparedItems = [];
  for (const it of data.items) {
    const catalogItem = db.prepare("SELECT * FROM catalog_items WHERE id = ?").get(it.item_id);
    if (!catalogItem) throw new Error(`Catalog item #${it.item_id} not found`);

    if (catalogItem.is_sold_out_today) {
      throw new Error(`Item '${catalogItem.title}' is currently marked sold-out/86'd today`);
    }

    let unitPrice = catalogItem.base_price;
    let variantTitle = null;

    if (it.variant_id) {
      const variant = db.prepare("SELECT * FROM catalog_item_variants WHERE id = ? AND item_id = ?").get(it.variant_id, it.item_id);
      if (variant) {
        variantTitle = variant.title;
        unitPrice = variant.override_base_price !== null ? variant.override_base_price : (catalogItem.base_price + (variant.price_delta || 0));
      }
    }

    const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
    const itemSubtotal = unitPrice * qty;
    const taxRate = catalogItem.tax_rate || 0;
    const itemTax = Math.round((itemSubtotal * (taxRate / 100)) * 100) / 100;
    const itemTotal = itemSubtotal + itemTax;

    subtotal += itemSubtotal;
    taxTotal += itemTax;

    preparedItems.push({
      item_id: catalogItem.id,
      variant_id: it.variant_id || null,
      item_title: catalogItem.title,
      variant_title: variantTitle,
      quantity: qty,
      unit_price: unitPrice,
      tax_amount: itemTax,
      total_price: itemTotal,
      special_instructions: it.special_instructions || null
    });
  }

  const rawDiscount = parseFloat(data.discount_total || 0);
  const discountTotal = Number.isFinite(rawDiscount) && rawDiscount > 0 ? Math.round(rawDiscount * 100) / 100 : 0;
  const grandTotal = Math.max(0, Math.round((subtotal + taxTotal - discountTotal) * 100) / 100);

  const orderStmt = db.prepare(`
    INSERT INTO unified_orders (
      tenant_id, entity_id, order_number, domain, customer_name, customer_phone,
      customer_email, source, link_id, check_in_date, check_out_date,
      table_number, appointment_slot, shipping_address_json,
      subtotal, tax_total, discount_total, grand_total, currency,
      order_status, payment_status, payment_method, notes, metadata_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, 'INR',
      'PENDING', 'UNPAID', ?, ?, ?
    )
  `);

  const info = orderStmt.run(
    tenantId,
    entity.id,
    orderNumber,
    entity.domain,
    data.customer_name.trim(),
    data.customer_phone.trim(),
    data.customer_email || null,
    data.source || 'CHAT_LINK',
    data.link_id || null,
    data.check_in_date || null,
    data.check_out_date || null,
    data.table_number || null,
    data.appointment_slot || null,
    data.shipping_address ? JSON.stringify(data.shipping_address) : null,
    subtotal,
    taxTotal,
    discountTotal,
    grandTotal,
    data.payment_method || 'UPI_INTENT',
    data.notes || null,
    JSON.stringify(data.metadata || {})
  );

  const orderId = info.lastInsertRowid;

  const itemStmt = db.prepare(`
    INSERT INTO unified_order_items (
      order_id, item_id, variant_id, item_title, variant_title,
      quantity, unit_price, tax_amount, total_price, special_instructions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const pit of preparedItems) {
    itemStmt.run(
      orderId, pit.item_id, pit.variant_id, pit.item_title, pit.variant_title,
      pit.quantity, pit.unit_price, pit.tax_amount, pit.total_price, pit.special_instructions
    );
  }

  return getOrderById(orderId);
}

function getOrderById(id) {
  const order = db.prepare(`
    SELECT o.*, e.name as entity_name, e.city as entity_city
    FROM unified_orders o
    LEFT JOIN business_entities e ON o.entity_id = e.id
    WHERE o.id = ?
  `).get(id);

  if (!order) return null;
  order.items = db.prepare("SELECT * FROM unified_order_items WHERE order_id = ?").all(id);
  return order;
}

function getOrderByNumber(orderNumber) {
  const order = db.prepare(`
    SELECT o.*, e.name as entity_name, e.city as entity_city
    FROM unified_orders o
    LEFT JOIN business_entities e ON o.entity_id = e.id
    WHERE o.order_number = ?
  `).get(orderNumber);

  if (!order) return null;
  order.items = db.prepare("SELECT * FROM unified_order_items WHERE order_id = ?").all(order.id);
  return order;
}

function listOrders(entityId, options = {}) {
  let query = "SELECT * FROM unified_orders WHERE entity_id = ?";
  const params = [entityId];

  if (options.status) {
    query += " AND order_status = ?";
    params.push(options.status.toUpperCase());
  }
  if (options.paymentStatus) {
    query += " AND payment_status = ?";
    params.push(options.paymentStatus.toUpperCase());
  }
  if (options.search) {
    query += " AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)";
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY created_at DESC, id DESC";

  const limit = parseInt(options.limit || 50, 10);
  const offset = parseInt(options.offset || 0, 10);
  query += " LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const orders = db.prepare(query).all(...params);
  const getItemsStmt = db.prepare("SELECT * FROM unified_order_items WHERE order_id = ?");

  return orders.map(o => ({
    ...o,
    items: getItemsStmt.all(o.id)
  }));
}

function updateOrderStatus(id, newStatus, notes = null) {
  const order = getOrderById(id);
  if (!order) throw new Error("Order not found");

  const validStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
  const cleanStatus = newStatus.toUpperCase();
  if (!validStatuses.includes(cleanStatus)) {
    throw new Error(`Invalid order status '${cleanStatus}'`);
  }

  db.prepare(`
    UPDATE unified_orders
    SET order_status = ?,
        notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(cleanStatus, notes, notes, id);

  return getOrderById(id);
}

module.exports = {
  createOrder,
  getOrderById,
  getOrderByNumber,
  listOrders,
  updateOrderStatus
};

