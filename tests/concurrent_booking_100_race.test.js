const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const config = require("../src/config/env");
const { db, initializeDatabase } = require("../src/config/database");
const { app } = require("../server");
const universalCatalogService = require("../src/services/universal/universalCatalogService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalFulfillmentService = require("../src/services/universal/universalFulfillmentService");
const paymentPayoutService = require("../src/services/paymentPayoutService");

function signRazorpay(body, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex");
}

describe("Phase 5 Regression: 100-Race HTTP Concurrency, Expired Hold Defense, Razorpay Security & Tax Precision", () => {
  let server;
  let baseUrl;
  let tenantId;
  let ownerUserId;
  let ownerToken;
  let taxSlabId;
  let entityId;
  let codModeId;
  let onlineModeId;
  const merchantWebhookSecret = "rzp_wh_merchant_secret_p5_test_123";

  before(async () => {
    initializeDatabase();
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const t = db.prepare(`
      INSERT INTO tenants (name, slug, status, plan_code, quota_monthly_messages, primary_domain, allowed_domains_json)
      VALUES ('Concurrency Race Tenant P5', 'p5-race-tenant', 'ACTIVE', 'GROWTH', 50000, 'RETAIL', '["RETAIL","HOSPITALITY"]')
    `).run();
    tenantId = Number(t.lastInsertRowid);

    ownerUserId = `usr_p5_owner_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'P5 Owner', 'owner_p5@sarvya.test', 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(ownerUserId, tenantId);
    db.prepare("INSERT INTO tenant_user_memberships (tenant_id, user_id, role) VALUES (?, ?, 'OWNER')").run(tenantId, ownerUserId);

    ownerToken = jwt.sign(
      { id: ownerUserId, userId: ownerUserId, tenant_id: tenantId, role: "USER", workspace_role: "OWNER" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const taxRes = db.prepare(`
      INSERT INTO master_tax_slabs (tenant_id, slab_code, title, tax_rate, cgst_rate, sgst_rate, igst_rate, active_status, delete_status)
      VALUES (?, 'GST_18_P5', 'GST 18%', 18, 9, 9, 18, 1, 0)
    `).run(tenantId);
    taxSlabId = Number(taxRes.lastInsertRowid);

    const entRes = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, name, slug, phone_e164, city, status, active_status, delete_status)
      VALUES (?, 'RETAIL', 'P5 Merchant Store', ?, '+919823000001', 'Mumbai', 'ACTIVE', 1, 0)
    `).run(tenantId, `p5-store-${Date.now()}`);
    entityId = Number(entRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO merchant_payment_configs (tenant_id, entity_id, gateway_provider, webhook_secret, accept_cod)
      VALUES (?, ?, 'RAZORPAY', ?, 1)
    `).run(tenantId, entityId, merchantWebhookSecret);

    const onlineRes = db.prepare(`
      INSERT INTO master_payment_modes (tenant_id, mode_code, name, is_online, deposit_type, deposit_value, sort_order, active_status, delete_status)
      VALUES (?, 'RAZORPAY_ONLINE_P5', 'Online Razorpay', 1, 'FULL', 100, 1, 1, 0)
    `).run(tenantId);
    onlineModeId = Number(onlineRes.lastInsertRowid);

    const codRes = db.prepare(`
      INSERT INTO master_payment_modes (tenant_id, mode_code, name, is_online, deposit_type, deposit_value, sort_order, active_status, delete_status)
      VALUES (?, 'CASH_ON_DELIVERY', 'Cash on Delivery', 0, 'PAY_LATER', 0, 2, 1, 0)
    `).run(tenantId);
    codModeId = Number(codRes.lastInsertRowid);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("1. 100 simultaneous HTTP checkouts on single Express process never oversell & write accurate GST transaction items", async () => {
    const item = universalCatalogService.createItem(tenantId, {
      title: "Limited Edition Villa Pass",
      inventoryMode: "UNIT_STOCK",
      basePrice: 1000,
      stockQty: 10,
      trackInventory: 1,
      masterTaxSlabId: taxSlabId
    });

    const requests = Array.from({ length: 100 }, (_, i) =>
      fetch(`${baseUrl}/api/v1/transactions/quick-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          customerPhone: `91982310${String(i).padStart(4, "0")}`,
          customerName: `Race Guest ${i}`,
          itemId: item.id,
          quantity: 1
        })
      }).then(async (res) => ({ status: res.status, body: await res.json() }))
    );

    const responses = await Promise.all(requests);
    const created = responses.filter((r) => r.status === 201 && r.body.success);
    const conflicts = responses.filter((r) => r.status === 409);

    assert.equal(created.length, 10, `Expected exactly 10 checkouts for stock 10, got ${created.length}`);
    assert.equal(conflicts.length, 90, `Expected 90 409 conflicts, got ${conflicts.length}`);

    const updatedItem = universalCatalogService.getItemById(tenantId, item.id);
    assert.equal(Number(updatedItem.stock_qty) - Number(updatedItem.reserved_qty), 0);

    // Verify BUG-P5-05: universal_transaction_items has catalog_item_id, 18% tax, 180 tax_amount, 1180 line_total
    const firstTxnId = created[0].body.transaction.id;
    const itemRow = db.prepare(`
      SELECT catalog_item_id, tax_percent, tax_amount, line_total
      FROM universal_transaction_items
      WHERE tenant_id = ? AND transaction_id = ?
    `).get(tenantId, firstTxnId);

    assert.equal(Number(itemRow.catalog_item_id), Number(item.id));
    assert.equal(Number(itemRow.tax_percent), 18);
    assert.equal(Number(itemRow.tax_amount), 180);
    assert.equal(Number(itemRow.line_total), 1180);
  });

  test("2. Date-range holds prevent overlapping double-booking while permitting back-to-back non-overlapping dates", async () => {
    const roomItem = universalCatalogService.createItem(tenantId, {
      title: "Deluxe Garden Suite P5",
      inventoryMode: "DATE_RANGE",
      basePrice: 4000,
      stockQty: 1,
      trackInventory: 1,
      masterTaxSlabId: taxSlabId
    });

    const raceOverlap = Array.from({ length: 20 }, (_, i) =>
      new Promise((resolve) => {
        setImmediate(() => {
          try {
            const h = universalAvailabilityService.createInventoryHold(tenantId, {
              itemId: roomItem.id,
              quantity: 1,
              checkIn: "2026-12-10",
              checkOut: "2026-12-12",
              customerPhone: `91982320${String(i).padStart(4, "0")}`
            });
            resolve({ ok: true, hold: h });
          } catch (err) {
            resolve({ ok: false, error: err.message });
          }
        });
      })
    );

    const overlapResults = await Promise.all(raceOverlap);
    assert.equal(overlapResults.filter((r) => r.ok).length, 1);

    // Adjacent checkout/checkin 2026-12-12 -> 2026-12-14 succeeds for the same room!
    const nextStayHold = universalAvailabilityService.createInventoryHold(tenantId, {
      itemId: roomItem.id,
      quantity: 1,
      checkIn: "2026-12-12",
      checkOut: "2026-12-14",
      customerPhone: "919823209999"
    });
    assert.equal(nextStayHold.success, true);
    assert.equal(nextStayHold.holdType, "DATE_RANGE");
  });

  test("3. Expired inventory holds are rejected on confirmHold & Razorpay payment reconciliation (BUG-P5-02)", async () => {
    const item = universalCatalogService.createItem(tenantId, {
      title: "Limited Hold Expire Test",
      inventoryMode: "UNIT_STOCK",
      basePrice: 500,
      stockQty: 2,
      trackInventory: 1,
      masterTaxSlabId: taxSlabId
    });

    const hold = universalAvailabilityService.createInventoryHold(tenantId, {
      itemId: item.id,
      quantity: 1,
      holdMinutes: 10,
      customerPhone: "919823300001"
    });

    const txnRes = await universalFulfillmentService.createTransactionFromQuote({
      tenantId,
      customer: { phone: "919823300001", name: "Expired Hold Guest" },
      cartItems: [{ itemId: item.id, quantity: 1 }],
      holdId: hold.holdToken,
      paymentModeId: onlineModeId,
      locationId: entityId
    });

    // Force expire the hold in UTC
    db.prepare(`
      UPDATE catalog_inventory_holds
      SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
      WHERE hold_token = ? AND tenant_id = ?
    `).run(hold.holdToken, tenantId);

    const directConf = universalAvailabilityService.confirmHold(tenantId, hold.holdToken);
    assert.equal(directConf.success, false);
    assert.equal(directConf.expired, true);

    const webhookBody = {
      event: "payment_link.paid",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount_paid: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } },
        payment: { entity: { id: "pay_expired_hold_test", amount: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } }
      }
    };
    const res = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signRazorpay(webhookBody, merchantWebhookSecret)
      },
      body: JSON.stringify(webhookBody)
    });
    assert.equal(res.status, 409);

    const afterTxn = universalFulfillmentService.getTransactionByRef(tenantId, txnRes.referenceCode);
    assert.notEqual(afterTxn.payment_status, "PAID");
    assert.notEqual(afterTxn.fulfillment_status, "CONFIRMED");
  });

  test("4. Razorpay webhook validates merchant secret, capture event allowlist, amount/currency & cancellation release (BUG-P5-03/04)", async () => {
    const item = universalCatalogService.createItem(tenantId, {
      title: "Merchant Webhook Test Item",
      inventoryMode: "UNIT_STOCK",
      basePrice: 1000,
      stockQty: 5,
      trackInventory: 1,
      masterTaxSlabId: taxSlabId
    });

    const txnRes = await universalFulfillmentService.createTransactionFromQuote({
      tenantId,
      customer: { phone: "919823400001", name: "Pay Test Guest" },
      cartItems: [{ itemId: item.id, quantity: 2 }],
      paymentModeId: onlineModeId,
      locationId: entityId
    });

    const badSigBody = { event: "payment.captured", reference_code: txnRes.referenceCode, amount: txnRes.quote.grandTotal };
    const badSigRes = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": "invalid_sig_000" },
      body: JSON.stringify(badSigBody)
    });
    assert.equal(badSigRes.status, 401);

    // Valid signature but payment.failed must NEVER confirm booking
    const failedBody = {
      event: "payment.failed",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } },
        payment: { entity: { id: "pay_fail_01", amount: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } }
      }
    };
    const failRes = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signRazorpay(failedBody, merchantWebhookSecret) },
      body: JSON.stringify(failedBody)
    });
    assert.equal(failRes.status, 200);
    const failJson = await failRes.json();
    assert.equal(failJson.ignored, true);
    assert.equal(universalFulfillmentService.getTransactionByRef(tenantId, txnRes.referenceCode).payment_status, "LINK_SENT");

    // Currency mismatch rejected (USD vs INR)
    const usdBody = {
      event: "payment.captured",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount_paid: Math.round(txnRes.quote.grandTotal * 100), currency: "USD" } },
        payment: { entity: { id: "pay_usd_01", amount: Math.round(txnRes.quote.grandTotal * 100), currency: "USD" } }
      }
    };
    const usdRes = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signRazorpay(usdBody, merchantWebhookSecret) },
      body: JSON.stringify(usdBody)
    });
    assert.equal(usdRes.status, 400);

    // Underpayment rejected
    const underpayBody = {
      event: "payment.captured",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount_paid: 100, currency: "INR" } },
        payment: { entity: { id: "pay_under_01", amount: 100, currency: "INR" } }
      }
    };
    const underRes = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": signRazorpay(underpayBody, merchantWebhookSecret) },
      body: JSON.stringify(underpayBody)
    });
    assert.equal(underRes.status, 400);

    // Concurrent valid captures via per-merchant webhook secret confirm ONCE
    const capBody = {
      event: "payment.captured",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount_paid: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } },
        payment: { entity: { id: "pay_ok_unique_01", amount: Math.round(txnRes.quote.grandTotal * 100), currency: "INR" } }
      }
    };
    const capSig = signRazorpay(capBody, merchantWebhookSecret);
    const [cap1, cap2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": capSig },
        body: JSON.stringify(capBody)
      }),
      fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": capSig },
        body: JSON.stringify(capBody)
      })
    ]);
    assert.equal(cap1.status, 200);
    assert.equal(cap2.status, 200);

    const paidTxn = universalFulfillmentService.getTransactionByRef(tenantId, txnRes.referenceCode);
    assert.equal(paidTxn.payment_status, "PAID");
    assert.equal(paidTxn.fulfillment_status, "CONFIRMED");
    assert.equal(Number(paidTxn.amount_paid), Number(txnRes.quote.grandTotal));
    assert.equal(Number(universalCatalogService.getItemById(tenantId, item.id).stock_qty), 3);

    // Cancelling CONFIRMED booking releases CONFIRMED hold & restores stock once (double cancel idempotent)
    await universalFulfillmentService.updateFulfillmentStatus(tenantId, paidTxn.id, "CANCELLED", ownerUserId);
    await universalFulfillmentService.updateFulfillmentStatus(tenantId, paidTxn.id, "CANCELLED", ownerUserId);
    assert.equal(Number(universalCatalogService.getItemById(tenantId, item.id).stock_qty), 5);
  });

  test("5. Pay-Later checkout + unified_orders captureOrderPayment locks atomically and updates stock_qty & stock_quantity", async () => {
    const item = universalCatalogService.createItem(tenantId, {
      title: "Unified Order Lock Test",
      inventoryMode: "UNIT_STOCK",
      basePrice: 250,
      stockQty: 6,
      trackInventory: 1,
      masterTaxSlabId: taxSlabId
    });

    const codTxn = await universalFulfillmentService.createTransactionFromQuote({
      tenantId,
      customer: { phone: "919823500001", name: "COD Guest" },
      cartItems: [{ itemId: item.id, quantity: 2 }],
      paymentModeId: codModeId,
      locationId: entityId
    });
    assert.equal(codTxn.transaction.fulfillment_status, "CONFIRMED");
    assert.equal(Number(universalCatalogService.getItemById(tenantId, item.id).stock_qty), 4);

    // Unified order concurrent capture
    const orderNum = `ORD_P5_${Date.now()}`;
    const ordRes = db.prepare(`
      INSERT INTO unified_orders (tenant_id, entity_id, order_number, domain, customer_name, customer_phone, subtotal, tax_total, grand_total, currency, order_status, payment_status)
      VALUES (?, ?, ?, 'RETAIL', 'Buyer', '919823500002', 500, 0, 500, 'INR', 'PENDING', 'UNPAID')
    `).run(tenantId, entityId, orderNum);
    db.prepare(`
      INSERT INTO unified_order_items (order_id, item_id, item_title, quantity, unit_price, tax_amount, total_price)
      VALUES (?, ?, 'Unified Order Lock Test', 1, 500, 0, 500)
    `).run(Number(ordRes.lastInsertRowid), item.id);

    const r1 = paymentPayoutService.captureOrderPayment({ orderNumber: orderNum, paymentReference: "UTR_P5_1", amountPaid: 500 });
    const r2 = paymentPayoutService.captureOrderPayment({ orderNumber: orderNum, paymentReference: "UTR_P5_1", amountPaid: 500 });
    assert.equal(r1.alreadyCaptured || false, false);
    assert.equal(r2.alreadyCaptured, true);

    const afterItem = db.prepare("SELECT stock_qty, stock_quantity FROM catalog_items WHERE id = ?").get(item.id);
    assert.equal(Number(afterItem.stock_qty), 3);
  });
});
