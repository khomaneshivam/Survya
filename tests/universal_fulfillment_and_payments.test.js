const test = require("node:test");
const assert = require("node:assert/strict");
const { db, initializeDatabase } = require("../src/config/database");
const universalCatalogService = require("../src/services/universal/universalCatalogService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalFulfillmentService = require("../src/services/universal/universalFulfillmentService");
const jobWorkerEngine = require("../src/services/queue/jobWorkerEngine");

// Ensure DB is ready
initializeDatabase();

const TEST_TENANT = 9991;

function setupTestEnvironment() {
  // Clean up previous test artifacts for TEST_TENANT
  db.prepare(`DELETE FROM universal_transaction_items WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM universal_transactions WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM catalog_inventory_holds WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM catalog_pricing_rules WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM catalog_addons WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM catalog_addon_groups WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM catalog_items WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM master_payment_modes WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM master_locations WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM master_tax_slabs WHERE tenant_id = ?`).run(TEST_TENANT);
  db.prepare(`DELETE FROM system_job_queue WHERE tenant_id = ?`).run(TEST_TENANT);

  // 1. Create Tax Slab (18% GST)
  const taxRes = db.prepare(`
    INSERT INTO master_tax_slabs (
      tenant_id, slab_code, title, tax_rate, cgst_rate, sgst_rate, igst_rate,
      active_status, delete_status, created_at, updated_at
    ) VALUES (?, 'GST_18', 'GST 18%', 18, 9, 9, 18, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
  `).run(TEST_TENANT);

  // 2. Create Location
  const locRes = db.prepare(`
    INSERT INTO master_locations (
      tenant_id, location_code, name, city, address_line1,
      active_status, delete_status, created_at, updated_at
    ) VALUES (?, 'MUM-01', 'SARVYA Flagship Mumbai', 'Mumbai', 'Nariman Point, Mumbai', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
  `).run(TEST_TENANT);

  // 3. Create Payment Modes: Online (Full Deposit) and Cash on Delivery (Pay Later)
  const onlineModeRes = db.prepare(`
    INSERT INTO master_payment_modes (
      tenant_id, mode_code, name, is_online, deposit_type, deposit_value,
      active_status, delete_status, created_at, updated_at
    ) VALUES (?, 'RAZORPAY_GATEWAY', 'Cards / UPI (Razorpay)', 1, 'FULL', 100, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
  `).run(TEST_TENANT);

  const codModeRes = db.prepare(`
    INSERT INTO master_payment_modes (
      tenant_id, mode_code, name, is_online, deposit_type, deposit_value,
      active_status, delete_status, created_at, updated_at
    ) VALUES (?, 'CASH_ON_DELIVERY', 'Cash on Delivery / Arrival', 0, 'PAY_LATER', 0, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
  `).run(TEST_TENANT);

  return {
    taxSlabId: taxRes.lastInsertRowid,
    locationId: locRes.lastInsertRowid,
    onlineModeId: onlineModeRes.lastInsertRowid,
    codModeId: codModeRes.lastInsertRowid
  };
}

test("1. UNIT_STOCK checkout -> Razorpay webhook payment reconciliation -> hold committed & worker jobs cancelled", async () => {
  const env = setupTestEnvironment();

  // Create a trackable inventory item with stock_qty = 10
  const item = universalCatalogService.createItem(TEST_TENANT, {
    title: "Artisanal Silk Scarf",
    inventoryMode: "UNIT_STOCK",
    basePrice: 2000,
    stockQty: 10,
    trackInventory: 1,
    masterTaxSlabId: env.taxSlabId,
    masterLocationId: env.locationId
  });

  // Step A: Acquire 15-minute hold for 2 units
  const holdRes = universalAvailabilityService.createInventoryHold(TEST_TENANT, {
    itemId: item.id,
    quantity: 2,
    holdMinutes: 15,
    customerPhone: "919876543210"
  });
  assert.equal(holdRes.success, true);
  assert.ok(holdRes.holdToken);

  // Verify stock reserved
  const itemAfterHold = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(itemAfterHold.stock_qty, 10);
  assert.equal(itemAfterHold.reserved_qty, 2);

  // Step B: Create Transaction from Quote
  const txnRes = await universalFulfillmentService.createTransactionFromQuote({
    tenantId: TEST_TENANT,
    sourceChannel: "WHATSAPP_FLOW",
    customer: { phone: "919876543210", name: "Ananya Sharma" },
    cartItems: [{ itemId: item.id, quantity: 2 }],
    holdId: holdRes.holdToken,
    paymentModeId: env.onlineModeId,
    locationId: env.locationId
  });

  assert.equal(txnRes.success, true);
  assert.ok(txnRes.referenceCode.startsWith("SRV-"));
  assert.equal(txnRes.transaction.payment_status, "LINK_SENT");
  assert.equal(txnRes.transaction.fulfillment_status, "PENDING");
  assert.equal(txnRes.isPayLater, false);

  // Verify system_job_queue has PENDING nudge and hold expire jobs
  const pendingJobs = db.prepare(`
    SELECT job_type, status, idempotency_key FROM system_job_queue
    WHERE tenant_id = ? AND status = 'PENDING'
  `).all(TEST_TENANT);

  const jobTypes = pendingJobs.map(j => j.job_type);
  assert.ok(jobTypes.includes("PAYMENT_LINK_NUDGE"), "Should enqueue PAYMENT_LINK_NUDGE");
  assert.ok(jobTypes.includes("PAYMENT_HOLD_EXPIRE"), "Should enqueue PAYMENT_HOLD_EXPIRE");

  // Step C: Simulate Razorpay Webhook Confirmation
  const reconcileRes = await universalFulfillmentService.reconcilePaymentSuccess({
    tenantId: TEST_TENANT,
    referenceCode: txnRes.referenceCode,
    gatewayRef: "rzp_pay_99887766",
    paidAmount: txnRes.quote.grandTotal,
    source: "RAZORPAY_WEBHOOK"
  });

  assert.equal(reconcileRes.success, true);
  assert.equal(reconcileRes.transaction.payment_status, "PAID");
  assert.equal(reconcileRes.transaction.fulfillment_status, "CONFIRMED");
  assert.equal(reconcileRes.transaction.balance_due, 0);

  // Step D: Verify permanent stock decrement (10 - 2 = 8, reserved = 0)
  const itemAfterReconcile = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(itemAfterReconcile.stock_qty, 8, "Stock must permanently decrement by 2");
  assert.equal(itemAfterReconcile.reserved_qty, 0, "Reserved quantity must return to 0");

  // Step E: Verify pending reminder/expire jobs were cancelled
  const cancelledJobs = db.prepare(`
    SELECT job_type, status FROM system_job_queue
    WHERE tenant_id = ? AND (idempotency_key = ? OR idempotency_key = ?)
  `).all(TEST_TENANT, `pln-${txnRes.referenceCode}`, `phe-${txnRes.referenceCode}`);

  assert.ok(cancelledJobs.every(j => j.status === "CANCELLED"), "Payment jobs must be CANCELLED");

  // Step F: Verify printable receipt HTML generation
  const receiptHtml = universalFulfillmentService.generatePrintableReceiptHtml(
    reconcileRes.transaction,
    reconcileRes.transaction.items,
    { name: "SARVYA Boutique", gstin: "27AABCU9603R1ZM" }
  );
  assert.ok(receiptHtml.includes(txnRes.referenceCode));
  assert.ok(receiptHtml.includes("Ananya Sharma"));
  assert.ok(receiptHtml.includes("PAID"));
});

test("2. Unpaid transaction after 30m triggers PAYMENT_HOLD_EXPIRE -> hold released cleanly", async () => {
  const env = setupTestEnvironment();

  // Create item with stock_qty = 5
  const item = universalCatalogService.createItem(TEST_TENANT, {
    title: "Organic Robusta Coffee 500g",
    inventoryMode: "UNIT_STOCK",
    basePrice: 650,
    stockQty: 5,
    trackInventory: 1
  });

  // Acquire hold for 1 unit
  const holdRes = universalAvailabilityService.createInventoryHold(TEST_TENANT, {
    itemId: item.id,
    quantity: 1,
    holdMinutes: 30,
    customerPhone: "919876543222"
  });
  assert.equal(holdRes.success, true);

  // Item reserved_qty = 1
  let itemState = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(itemState.reserved_qty, 1);

  // Create transaction
  const txnRes = await universalFulfillmentService.createTransactionFromQuote({
    tenantId: TEST_TENANT,
    customer: { phone: "919876543222", name: "Devansh Mehta" },
    cartItems: [{ itemId: item.id, quantity: 1 }],
    holdId: holdRes.holdToken,
    paymentModeId: env.onlineModeId
  });

  assert.equal(txnRes.transaction.payment_status, "LINK_SENT");
  assert.equal(txnRes.transaction.fulfillment_status, "PENDING");

  // Trigger PAYMENT_HOLD_EXPIRE worker job handler
  const expireHandler = jobWorkerEngine.handlers.get("PAYMENT_HOLD_EXPIRE");
  assert.ok(typeof expireHandler === "function", "PAYMENT_HOLD_EXPIRE handler must be registered");

  const handlerRes = await expireHandler({
    tenantId: TEST_TENANT,
    referenceCode: txnRes.referenceCode,
    holdId: holdRes.holdToken
  });

  assert.equal(handlerRes.success, true);
  assert.equal(handlerRes.status, "HOLD_EXPIRED");

  // Verify item reserved_qty returned to 0 (stock intact at 5)
  itemState = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(itemState.stock_qty, 5);
  assert.equal(itemState.reserved_qty, 0, "Reserved quantity must be restored to pool");

  // Verify transaction marked CANCELLED
  const expiredTxn = universalFulfillmentService.getTransactionById(TEST_TENANT, txnRes.transactionId);
  assert.equal(expiredTxn.fulfillment_status, "CANCELLED");
  assert.equal(expiredTxn.payment_status, "CANCELLED");
});

test("3. PAY_AT_DESK / COD confirms immediately without waiting for gateway webhook", async () => {
  const env = setupTestEnvironment();

  // Create item with stock_qty = 12
  const item = universalCatalogService.createItem(TEST_TENANT, {
    title: "Sea-Facing Deluxe Villa",
    inventoryMode: "UNIT_STOCK",
    basePrice: 5000,
    stockQty: 12,
    trackInventory: 1
  });

  // Hold 2 units
  const holdRes = universalAvailabilityService.createInventoryHold(TEST_TENANT, {
    itemId: item.id,
    quantity: 2,
    holdMinutes: 15,
    customerPhone: "919876543233"
  });

  // Create transaction with CASH_ON_DELIVERY (PAY_LATER)
  const txnRes = await universalFulfillmentService.createTransactionFromQuote({
    tenantId: TEST_TENANT,
    customer: { phone: "919876543233", name: "Pooja Patil" },
    cartItems: [{ itemId: item.id, quantity: 2 }],
    holdId: holdRes.holdToken,
    paymentModeId: env.codModeId,
    locationId: env.locationId
  });

  assert.equal(txnRes.success, true);
  assert.equal(txnRes.isPayLater, true);
  assert.equal(txnRes.transaction.payment_status, "COD_PENDING");
  assert.equal(txnRes.transaction.fulfillment_status, "CONFIRMED", "COD must immediately confirm");
  assert.equal(txnRes.transaction.deposit_due, 0);

  // Stock must be immediately committed (12 - 2 = 10, reserved = 0)
  const itemState = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(itemState.stock_qty, 10, "Stock committed immediately upon COD checkout");
  assert.equal(itemState.reserved_qty, 0);
});

test("4. Duplicate Razorpay webhook delivery is strictly idempotent (zero double-counting)", async () => {
  const env = setupTestEnvironment();

  const item = universalCatalogService.createItem(TEST_TENANT, {
    title: "Handcrafted Ceramic Vase",
    inventoryMode: "UNIT_STOCK",
    basePrice: 1500,
    stockQty: 8,
    trackInventory: 1
  });

  const holdRes = universalAvailabilityService.createInventoryHold(TEST_TENANT, {
    itemId: item.id,
    quantity: 1,
    holdMinutes: 15,
    customerPhone: "919876543244"
  });

  const txnRes = await universalFulfillmentService.createTransactionFromQuote({
    tenantId: TEST_TENANT,
    customer: { phone: "919876543244", name: "Kunal Ghosh" },
    cartItems: [{ itemId: item.id, quantity: 1 }],
    holdId: holdRes.holdToken,
    paymentModeId: env.onlineModeId
  });

  const grandTotal = txnRes.quote.grandTotal;

  // First Webhook Delivery
  const firstDelivery = await universalFulfillmentService.reconcilePaymentSuccess({
    tenantId: TEST_TENANT,
    referenceCode: txnRes.referenceCode,
    gatewayRef: "pay_duplicate_check_123",
    paidAmount: grandTotal,
    source: "RAZORPAY_WEBHOOK"
  });

  assert.equal(firstDelivery.success, true);
  assert.equal(firstDelivery.alreadyProcessed, false);
  assert.equal(firstDelivery.transaction.amount_paid, grandTotal);

  // Second (Duplicate / Retry) Webhook Delivery with exact same gatewayRef
  const secondDelivery = await universalFulfillmentService.reconcilePaymentSuccess({
    tenantId: TEST_TENANT,
    referenceCode: txnRes.referenceCode,
    gatewayRef: "pay_duplicate_check_123",
    paidAmount: grandTotal,
    source: "RAZORPAY_WEBHOOK"
  });

  assert.equal(secondDelivery.success, true);
  assert.equal(secondDelivery.alreadyProcessed, true, "Must flag duplicate webhook replay");
  assert.equal(
    secondDelivery.transaction.amount_paid,
    grandTotal,
    "amount_paid must NOT be double-counted"
  );

  // Verify stock was decremented exactly once (8 - 1 = 7)
  const finalItem = universalCatalogService.getItemById(TEST_TENANT, item.id);
  assert.equal(finalItem.stock_qty, 7, "Stock must decrement exactly once across retries");
  assert.equal(finalItem.reserved_qty, 0);
});
