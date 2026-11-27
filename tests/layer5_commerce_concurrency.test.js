/**
 * Layer 5: Atomic Inventory Locking, Double-Booking Prevention & Financial Integrity Tests.
 * Spawns genuine parallel OS worker_threads synchronized via SharedArrayBuffer barrier
 * against real InnoDB row locks (`START TRANSACTION` / `SELECT ... FOR UPDATE`).
 */

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { Worker } = require("worker_threads");
const { db } = require("../src/config/database");
const inventoryService = require("../src/services/inventoryService");
const hospitalityAvailabilityService = require("../src/services/hospitalityAvailabilityService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalFulfillmentService = require("../src/services/universal/universalFulfillmentService");
const paymentPayoutService = require("../src/services/paymentPayoutService");

function runBarrierWorkers(workerCount, mode, payload) {
  const sab = new SharedArrayBuffer(8);
  const ctrl = new Int32Array(sab); // ctrl[0]=ready count, ctrl[1]=go signal

  const workerScript = `
    const { parentPort, workerData } = require("worker_threads");
    const ctrl = new Int32Array(workerData.sab);
    const hospitalityAvailabilityService = require(${JSON.stringify(path.resolve(__dirname, "../src/services/hospitalityAvailabilityService.js"))});
    const universalAvailabilityService = require(${JSON.stringify(path.resolve(__dirname, "../src/services/universal/universalAvailabilityService.js"))});
    const universalFulfillmentService = require(${JSON.stringify(path.resolve(__dirname, "../src/services/universal/universalFulfillmentService.js"))});
    const paymentPayoutService = require(${JSON.stringify(path.resolve(__dirname, "../src/services/paymentPayoutService.js"))});

    (async () => {
      try {
        Atomics.add(ctrl, 0, 1);
        Atomics.notify(ctrl, 0, 1);
        while (Atomics.load(ctrl, 1) === 0) {
          Atomics.wait(ctrl, 1, 0, 100);
        }

        const idx = workerData.idx;
        const p = workerData.payload;
        if (workerData.mode === "BOOK_LAST_ROOM") {
          const res = hospitalityAvailabilityService.reserveConfirmedBookingAtomically({
            ...p,
            phoneE164: "91955500010" + idx,
            guestName: "Concurrent Guest " + idx
          });
          parentPort.postMessage({ ok: true, res });
        } else if (workerData.mode === "HOLD_LAST_UNIT") {
          const res = universalAvailabilityService.createInventoryHold(p.tenantId, {
            itemId: p.itemId,
            quantity: 1,
            customerPhone: "91955500020" + idx,
            customerName: "Stock Guest " + idx
          });
          parentPort.postMessage({ ok: true, res });
        } else if (workerData.mode === "CONFIRM_HOLD") {
          const res = universalAvailabilityService.confirmHold(p.tenantId, p.holdToken);
          parentPort.postMessage({ ok: res.success, res });
        } else if (workerData.mode === "RECONCILE_PAYMENT") {
          const res = await universalFulfillmentService.reconcilePaymentSuccess({
            tenantId: p.tenantId,
            referenceCode: p.referenceCode,
            gatewayRef: p.gatewayRef,
            paidAmount: p.paidAmount
          });
          parentPort.postMessage({ ok: true, res });
        } else if (workerData.mode === "TRIGGER_PAYOUT") {
          const res = paymentPayoutService.triggerInstantPayout(p.entityId, p.amount, p.tenantId);
          parentPort.postMessage({ ok: true, res });
        }
      } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message, code: err.code, statusCode: err.statusCode });
      }
    })();
  `;

  return new Promise((resolve, reject) => {
    const results = new Array(workerCount);
    let completed = 0;
    const workers = [];

    for (let i = 0; i < workerCount; i++) {
      const w = new Worker(workerScript, {
        eval: true,
        workerData: { sab, idx: i, mode, payload }
      });
      w.on("message", (msg) => {
        results[i] = msg;
        completed++;
        w.terminate();
        if (completed === workerCount) resolve(results);
      });
      w.on("error", reject);
      workers.push(w);
    }

    const waitReady = setInterval(() => {
      if (Atomics.load(ctrl, 0) >= workerCount) {
        clearInterval(waitReady);
        Atomics.store(ctrl, 1, 1);
        Atomics.notify(ctrl, 1, Infinity);
      }
    }, 5);
  });
}

describe("Layer 5: Atomic Inventory Locking, Double-Booking Prevention & Financial Integrity", { concurrency: 1 }, () => {
  const testTenantId = 9501;
  let propertyId;
  let roomTypeId;
  let entityId;
  let catalogItemId;
  let refCode;
  const createdPhones = [];

  before(() => {
    db.prepare(`
      INSERT IGNORE INTO tenants (id, name, slug, status)
      VALUES (?, 'Layer 5 Commerce Resort', 'layer5-commerce-9501', 'ACTIVE')
    `).run(testTenantId);

    const pRes = db.prepare(`
      INSERT INTO properties (tenant_id, name, city, status, publication_status)
      VALUES (?, 'Layer 5 Cliffside Resort', 'Alibaug', 'ACTIVE', 'PUBLISHED')
    `).run(testTenantId);
    propertyId = pRes.lastInsertRowid;

    const rtRes = db.prepare(`
      INSERT INTO room_types (tenant_id, property_id, name, room_code, max_adults, max_children, max_occupancy, base_rate, active, status)
      VALUES (?, ?, 'Layer 5 Ocean Penthouse', 'L5-PENT', 2, 0, 2, 9000, 1, 'ACTIVE')
    `).run(testTenantId, propertyId);
    roomTypeId = rtRes.lastInsertRowid;

    // Seed single available room for 2027-01-10 .. 2027-01-12
    hospitalityAvailabilityService.bulkUpdateInventory(propertyId, roomTypeId, "2027-01-10", "2027-01-11", {
      total_rooms: 1,
      blocked_qty: 0,
      out_of_service_qty: 0,
      allocated_qty: 0,
      is_closed: false,
      base_rate: 9000
    }, testTenantId, "l5_setup");

    const entRes = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, name, slug, phone_e164, city, state, status, active_status, delete_status)
      VALUES (?, 'RETAIL', 'Layer 5 Merch', ?, '919501000000', 'Alibaug', 'Maharashtra', 'ACTIVE', 1, 0)
    `).run(testTenantId, `l5-merch-${Date.now()}`);
    entityId = entRes.lastInsertRowid;

    const itemRes = db.prepare(`
      INSERT INTO catalog_items (
        tenant_id, entity_id, item_type, title, slug, base_price, tax_rate,
        inventory_mode, track_inventory, stock_qty, reserved_qty, is_sold_out, is_active, delete_status
      ) VALUES (?, ?, 'PRODUCT', 'Limited Villa Pass', ?, 2000, 18, 'UNIT_STOCK', 1, 2, 0, 0, 1, 0)
    `).run(testTenantId, entityId, `limited-pass-${Date.now()}`);
    catalogItemId = itemRes.lastInsertRowid;

    // Setup bank beneficiary for payout race test
    paymentPayoutService.addBeneficiary(entityId, {
      account_holder_name: "Layer 5 Resort Pvt Ltd",
      account_number: "112233445566",
      ifsc_code: "ICIC0001234",
      bank_name: "ICICI Bank",
      is_primary: true
    }, testTenantId);
    const ben = db.prepare("SELECT id FROM merchant_payout_beneficiaries WHERE entity_id = ?").get(entityId);
    db.prepare("UPDATE merchant_payout_beneficiaries SET verification_status = 'PENNY_VERIFIED' WHERE id = ?").run(ben.id);
    db.prepare(`
      INSERT INTO unified_orders (tenant_id, entity_id, order_number, domain, customer_name, customer_phone, subtotal, grand_total, payment_status, order_status)
      VALUES (?, ?, ?, 'RETAIL', 'Paid Guest', '919501000001', 5000, 5000, 'PAID', 'CONFIRMED')
    `).run(testTenantId, entityId, `ORD-L5-${Date.now()}`);
  });

  after(async () => {
    try {
      db.prepare("DELETE FROM merchant_payout_ledger WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM merchant_payout_beneficiaries WHERE entity_id = ?").run(entityId);
      db.prepare("DELETE FROM unified_orders WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM system_job_queue WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM universal_transaction_items WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM universal_transactions WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM catalog_inventory_holds WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM booking_enquiries WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM contact_consents WHERE contact_id IN (SELECT id FROM contacts WHERE tenant_id = ?)").run(testTenantId);
      db.prepare("DELETE FROM contacts WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM room_inventory_daily WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM room_types WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM properties WHERE tenant_id = ?").run(testTenantId);
      db.prepare("DELETE FROM tenants WHERE id = ?").run(testTenantId);
    } catch (_) {}
    const { closeAsyncPool } = require("../src/config/asyncDb");
    await closeAsyncPool();
  });

  test("1. room_inventory_daily enforces UNIQUE(room_type_id, inventory_date) across repeated bulk upserts", () => {
    const idx = db.prepare("SHOW INDEX FROM room_inventory_daily WHERE Key_name = 'idx_room_inventory_daily'").all();
    assert.ok(idx.length >= 1);
    assert.equal(Number(idx[0].Non_unique), 0, "idx_room_inventory_daily must be UNIQUE");

    inventoryService.bulkUpdateInventory(testTenantId, [
      { room_type_id: roomTypeId, inventory_date: "2027-02-01", available_qty: 4, base_rate: 8500, is_closed: false },
      { room_type_id: roomTypeId, inventory_date: "2027-02-02", available_qty: 0, base_rate: 8500, is_closed: true }
    ], "l5_tester");
    inventoryService.bulkUpdateInventory(testTenantId, [
      { room_type_id: roomTypeId, inventory_date: "2027-02-01", available_qty: 3, base_rate: 8800, is_closed: false }
    ], "l5_tester");

    const rows = db.prepare("SELECT * FROM room_inventory_daily WHERE room_type_id = ? AND inventory_date = '2027-02-01'").all(roomTypeId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].available_qty, 3);
    assert.equal(rows[0].base_rate, 8800);
  });

  test("2. 8-way true parallel last-room booking race allows strictly 1 CONFIRMED booking and rejects 7 with 409", async () => {
    const results = await runBarrierWorkers(8, "BOOK_LAST_ROOM", {
      tenantId: testTenantId,
      propertyId,
      roomTypeId,
      checkInDate: "2027-01-10",
      checkOutDate: "2027-01-12",
      quantity: 1
    });

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    assert.equal(successes.length, 1, `Expected exactly 1 winning booking, got ${successes.length}: ${JSON.stringify(results)}`);
    assert.equal(failures.length, 7);
    assert.ok(failures.every((f) => f.statusCode === 409 || f.code === "OVERBOOKING_PREVENTED"));

    const postAvail = hospitalityAvailabilityService.checkRoomAvailability(propertyId, roomTypeId, "2027-01-10", "2027-01-12", 1, testTenantId);
    assert.equal(postAvail.available, false);
    assert.equal(postAvail.available_rooms_count, 0);
  });

  test("3. Concurrent UNIT_STOCK holds & concurrent hold confirmations strictly honor stock limits", async () => {
    // Stock is 2; spawn 6 parallel workers trying to hold 1 each -> strictly 2 succeed
    const holdResults = await runBarrierWorkers(6, "HOLD_LAST_UNIT", { tenantId: testTenantId, itemId: catalogItemId });
    const winners = holdResults.filter((r) => r.ok);
    const losers = holdResults.filter((r) => !r.ok);
    assert.equal(winners.length, 2, `Expected 2 winning holds for stock=2, got ${winners.length}`);
    assert.equal(losers.length, 4);

    // Concurrent confirmation of the same hold token must succeed strictly once
    const firstHoldToken = winners[0].res.holdToken;
    const confirmResults = await runBarrierWorkers(5, "CONFIRM_HOLD", { tenantId: testTenantId, holdToken: firstHoldToken });
    assert.equal(confirmResults.filter((r) => r.ok).length, 1, "Same hold token must only confirm once under concurrency");

    const itemAfter = db.prepare("SELECT stock_qty, reserved_qty FROM catalog_items WHERE id = ?").get(catalogItemId);
    assert.equal(itemAfter.stock_qty, 1);
    assert.equal(itemAfter.reserved_qty, 1);

    // Clean release of second hold
    universalAvailabilityService.releaseHold(testTenantId, winners[1].res.holdToken);
  });

  test("4. 6-way parallel payment webhook reconciliation credits amount strictly once", async () => {
    const txnRes = await universalFulfillmentService.createTransactionFromQuote({
      tenantId: testTenantId,
      customer: { phone: "919501000099", name: "Pay Race Guest" },
      cartItems: [{ itemId: catalogItemId, quantity: 1 }],
      notes: "Concurrency webhook test"
    });
    refCode = txnRes.referenceCode;
    const expectedTotal = txnRes.quote.grandTotal;

    const results = await runBarrierWorkers(6, "RECONCILE_PAYMENT", {
      tenantId: testTenantId,
      referenceCode: refCode,
      gatewayRef: `pay_rzp_race_${Date.now()}`,
      paidAmount: expectedTotal
    });

    assert.equal(results.filter((r) => r.ok && !r.res.alreadyProcessed).length, 1);
    assert.equal(results.filter((r) => r.ok && r.res.alreadyProcessed).length, 5);

    const txnRow = db.prepare("SELECT amount_paid, balance_due, payment_status FROM universal_transactions WHERE reference_code = ?").get(refCode);
    assert.equal(txnRow.payment_status, "PAID");
    assert.equal(txnRow.amount_paid, expectedTotal);
    assert.equal(txnRow.balance_due, 0);
  });

  test("5. 6-way parallel triggerInstantPayout rejects all calls with 410 MERCHANT_DIRECT_MODE and leaves zero pooled ledger rows", async () => {
    const results = await runBarrierWorkers(6, "TRIGGER_PAYOUT", {
      tenantId: testTenantId,
      entityId,
      amount: 5000
    });

    const settled = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);
    assert.equal(settled.length, 0, `Expected 0 pooled payouts in Merchant-Direct Mode, got ${settled.length}: ${JSON.stringify(results)}`);
    assert.equal(rejected.length, 6);
    assert.ok(rejected.every((r) => r.statusCode === 410 && r.code === "MERCHANT_DIRECT_MODE"));

    const ledgerTotal = db.prepare("SELECT COALESCE(SUM(gross_amount), 0) as total FROM merchant_payout_ledger WHERE entity_id = ?").get(entityId);
    assert.equal(ledgerTotal.total, 0);
  });
});
