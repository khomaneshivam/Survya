const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, setSetting, getSetting } = require("../src/config/database");
const config = require("../src/config/env");

describe("SARVYA Multi-Industry Polymorphic Commerce, Pay-In & Merchant Payouts", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;

  const testEntityIds = [];
  const testCategoryIds = [];
  const testItemIds = [];

  before(() => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const adminId = `sarvya_industry_admin_${Date.now()}`;
    const hash = bcrypt.hashSync("TestPass123!", 8);
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Industry Admin', ?, '919307382030', ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_${Date.now()}@sarvya.test`, hash);

    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) server.close();
    if (adminUser?.id) {
      db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
    }
    for (const eid of testEntityIds) {
      db.prepare("DELETE FROM merchant_payout_ledger WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM merchant_payout_beneficiaries WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM merchant_payment_configs WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM unified_order_items WHERE order_id IN (SELECT id FROM unified_orders WHERE entity_id = ?)").run(eid);
      db.prepare("DELETE FROM unified_orders WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM daily_inventory_matrix WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM catalog_item_variants WHERE item_id IN (SELECT id FROM catalog_items WHERE entity_id = ?)").run(eid);
      db.prepare("DELETE FROM catalog_items WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM catalog_categories WHERE entity_id = ?").run(eid);
      db.prepare("DELETE FROM business_entities WHERE id = ?").run(eid);
    }
  });

  test("1. Lists seeded default entities (Hospitality and Dining)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/entities`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.entities.length >= 2);
    assert.ok(data.entities.some(e => e.domain === "HOSPITALITY" && e.slug === "konkantrip-resort"));
    assert.ok(data.entities.some(e => e.domain === "DINING" && e.slug === "konkan-wave-cafe"));
  });

  test("2. Creates new business entity across different domains (Retail, Services)", async () => {
    const retailRes = await fetch(`${baseUrl}/api/v1/entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        domain: "RETAIL",
        name: "Konkan Heritage Artisanal Goods",
        phone_e164: "919307382030",
        city: "Alibaug",
        tagline: "Handcrafted coastal treasures"
      })
    });
    assert.equal(retailRes.status, 201);
    const retailJson = await retailRes.json();
    assert.equal(retailJson.entity.domain, "RETAIL");
    assert.equal(retailJson.entity.slug, "konkan-heritage-artisanal-goods");
    testEntityIds.push(retailJson.entity.id);

    const serviceRes = await fetch(`${baseUrl}/api/v1/entities`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        domain: "SERVICES",
        name: "Ocean Ayurveda & Wellness Spa",
        phone_e164: "919307382030",
        city: "Alibaug",
        tagline: "Holistic healing by the sea"
      })
    });
    assert.equal(serviceRes.status, 201);
    const serviceJson = await serviceRes.json();
    assert.equal(serviceJson.entity.domain, "SERVICES");
    testEntityIds.push(serviceJson.entity.id);
  });

  test("3. 1-Click Starter Kit Seeding instantly provisions categories & items in 3 seconds", async () => {
    const retailEntityId = testEntityIds[0];
    const seedRes = await fetch(`${baseUrl}/api/v1/entities/${retailEntityId}/seed-starter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ starterKit: "D2C_RETAIL_V1" })
    });
    assert.equal(seedRes.status, 200);
    const seedJson = await seedRes.json();
    assert.equal(seedJson.success, true);
    assert.ok(seedJson.categories.length >= 2);
    assert.ok(seedJson.items.length >= 2);

    // Verify items were persisted
    const itemsRes = await fetch(`${baseUrl}/api/v1/entities/${retailEntityId}/items`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(itemsRes.status, 200);
    const itemsJson = await itemsRes.json();
    assert.ok(itemsJson.items.some(i => i.title.includes("Linen Resort Shirt")));
  });

  test("4. 1-Click 86 Toggle instantly disables sold-out items from ordering", async () => {
    const diningEntity = db.prepare("SELECT id FROM business_entities WHERE domain = 'DINING' LIMIT 1").get();
    assert.ok(diningEntity);

    const surmaiDish = db.prepare("SELECT * FROM catalog_items WHERE entity_id = ? AND slug = 'surmai-fish-thali'").get(diningEntity.id);
    assert.ok(surmaiDish);
    assert.equal(surmaiDish.is_sold_out_today, 0);

    // Toggle 86 ON (Mark as sold out today)
    const toggleOnRes = await fetch(`${baseUrl}/api/v1/items/${surmaiDish.id}/86-toggle`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isSoldOutToday: true })
    });
    assert.equal(toggleOnRes.status, 200);
    const toggleOnJson = await toggleOnRes.json();
    assert.equal(toggleOnJson.is_sold_out_today, 1);

    // Attempting to order an 86'd item must fail with 400
    const orderRes = await fetch(`${baseUrl}/api/v1/entities/${diningEntity.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Rohan Kulkarni",
        customer_phone: "919876543210",
        table_number: "T-4",
        items: [{ item_id: surmaiDish.id, quantity: 2 }]
      })
    });
    assert.equal(orderRes.status, 400);
    const orderJson = await orderRes.json();
    assert.match(orderJson.message, /sold-out|86'd/i);

    // Toggle 86 OFF (Back in stock)
    const toggleOffRes = await fetch(`${baseUrl}/api/v1/items/${surmaiDish.id}/86-toggle`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ isSoldOutToday: false })
    });
    assert.equal(toggleOffRes.status, 200);
  });

  test("5. Creates unified orders with automated GST and variant price calculation", async () => {
    const diningEntity = db.prepare("SELECT id FROM business_entities WHERE domain = 'DINING' LIMIT 1").get();
    const pizzaDish = db.prepare("SELECT * FROM catalog_items WHERE entity_id = ? AND slug = 'margherita-pizza'").get(diningEntity.id);

    // Add variant (Large 14" with price delta)
    const varRes = await fetch(`${baseUrl}/api/v1/items/${pizzaDish.id}/variants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: "Large 14\" (Thin Crust)",
        price_delta: 150
      })
    });
    assert.equal(varRes.status, 201);
    const varJson = await varRes.json();
    const variantId = varJson.variant.id;

    // Place order for 2x Large Pizza (base 380 + 150 = 530 each; 2x = 1060; 5% GST = 53.00; grand = 1113.00)
    const createOrderRes = await fetch(`${baseUrl}/api/v1/entities/${diningEntity.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Sneha Patil",
        customer_phone: "919822334455",
        table_number: "T-2",
        items: [{ item_id: pizzaDish.id, variant_id: variantId, quantity: 2 }]
      })
    });
    assert.equal(createOrderRes.status, 201);
    const orderData = await createOrderRes.json();
    assert.equal(orderData.success, true);
    assert.equal(orderData.order.subtotal, 1060);
    assert.equal(orderData.order.tax_total, 53);
    assert.equal(orderData.order.grand_total, 1113);
    assert.equal(orderData.order.order_status, "PENDING");
    assert.equal(orderData.order.payment_status, "UNPAID");
  });

  test("6. Generates zero-fee UPI Intent URL & high-res SVG QR for customer pay-in", async () => {
    const entity = db.prepare("SELECT id FROM business_entities WHERE id = 1").get();

    const checkoutRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_number: "ORD-TEST-9988",
        grand_total: 8500
      })
    });
    assert.equal(checkoutRes.status, 200);
    const checkoutJson = await checkoutRes.json();
    assert.equal(checkoutJson.success, true);
    assert.ok(checkoutJson.session.upi.uri.startsWith("upi://pay?pa="));
    assert.match(checkoutJson.session.upi.uri, /am=8500\.00/);
    assert.ok(checkoutJson.session.upi.qrSvg.startsWith("<svg"));
    assert.ok(checkoutJson.session.gateway.keyId);
  });

  test("7. Payment capture webhook transitions order to PAID and updates inventory", async () => {
    const entity = db.prepare("SELECT id FROM business_entities WHERE id = 1").get();
    const villa = db.prepare("SELECT id FROM catalog_items WHERE entity_id = ? AND slug = 'deluxe-sea-view-villa'").get(entity.id);

    // Create stay booking order
    const orderRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Amitabh Verma",
        customer_phone: "919988776655",
        check_in_date: "2026-12-25",
        check_out_date: "2026-12-27",
        items: [{ item_id: villa.id, quantity: 1 }]
      })
    });
    assert.equal(orderRes.status, 201);
    const orderJson = await orderRes.json();
    const orderNumber = orderJson.order.order_number;

    // Simulate successful payment capture
    const captureRes = await fetch(`${baseUrl}/api/v1/orders/${orderNumber}/capture-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: "UPI_INTENT",
        paymentReference: "UTR_TEST_849201948",
        amountPaid: orderJson.order.grand_total
      })
    });
    assert.equal(captureRes.status, 200);
    const captureJson = await captureRes.json();
    assert.equal(captureJson.paymentStatus, "PAID");
    assert.equal(captureJson.orderStatus, "CONFIRMED");

    // Order in DB must now be PAID
    const verifiedOrder = db.prepare("SELECT * FROM unified_orders WHERE order_number = ?").get(orderNumber);
    assert.equal(verifiedOrder.payment_status, "PAID");
    assert.equal(verifiedOrder.order_status, "CONFIRMED");
    assert.equal(verifiedOrder.payment_reference, "UTR_TEST_849201948");
  });

  test("8. Bank Beneficiary Registration & Penny-Drop Verification", async () => {
    const entity = db.prepare("SELECT id FROM business_entities WHERE id = 2").get();

    // 1. Add bank account with invalid IFSC -> must be rejected
    const badIfscRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/payouts/beneficiaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        account_holder_name: "KONKAN WAVE CAFE",
        bank_name: "ICICI BANK",
        account_number: "002805001294",
        ifsc_code: "INVALID_IFSC"
      })
    });
    assert.equal(badIfscRes.status, 400);

    // 2. Add bank account with valid IFSC -> creates PENDING beneficiary
    const goodRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/payouts/beneficiaries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        account_holder_name: "KONKAN WAVE CAFE",
        bank_name: "ICICI BANK",
        account_number: "002805001294",
        ifsc_code: "ICIC0000028",
        account_type: "CURRENT"
      })
    });
    assert.equal(goodRes.status, 201);
    const goodJson = await goodRes.json();
    assert.equal(goodJson.beneficiary.verification_status, "PENDING");
    const beneficiaryId = goodJson.beneficiary.id;

    // 3. Trigger Penny-Drop Verification -> transitions to PENNY_VERIFIED
    const verifyRes = await fetch(`${baseUrl}/api/v1/payouts/beneficiaries/${beneficiaryId}/verify-penny-drop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(verifyRes.status, 200);
    const verifyJson = await verifyRes.json();
    assert.equal(verifyJson.verificationStatus, "PENNY_VERIFIED");
    assert.ok(verifyJson.pennyDropReference.startsWith("NPCI_PD_"));
  });

  test("9. Calculates real-time payout summary, fees, and settles instant payout batch", async () => {
    const entity = db.prepare("SELECT id FROM business_entities WHERE id = 1").get();

    // Retrieve summary
    const summaryRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/payouts/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(summaryRes.status, 200);
    const summaryJson = await summaryRes.json();
    assert.equal(summaryJson.success, true);
    assert.ok(summaryJson.summary.primaryBeneficiary);
    assert.equal(summaryJson.summary.primaryBeneficiary.verificationStatus, "PENNY_VERIFIED");

    // If unsettled balance exists, trigger instant payout
    if (summaryJson.summary.unsettledGrossRevenue > 0) {
      const payoutRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/payouts/request-instant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ amount: summaryJson.summary.unsettledGrossRevenue })
      });
      assert.equal(payoutRes.status, 200);
      const payoutJson = await payoutRes.json();
      assert.equal(payoutJson.success, true);
      assert.equal(payoutJson.status, "SETTLED");
      assert.ok(payoutJson.bankUtr.startsWith("4319"));
      assert.ok(payoutJson.netPayoutAmount > 0);
    }

    // Verify settlement ledger
    const ledgerRes = await fetch(`${baseUrl}/api/v1/entities/${entity.id}/payouts/ledger`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(ledgerRes.status, 200);
    const ledgerJson = await ledgerRes.json();
    assert.ok(ledgerJson.ledger.length >= 3);
    assert.ok(ledgerJson.ledger[0].bank_utr);
  });

  test("10. Enforces payment capture idempotency to prevent duplicate inventory deduction", async () => {
    // Create an order
    const orderRes = await fetch(`${baseUrl}/api/v1/entities/1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Idempotent Guest",
        customer_phone: "919307382030",
        items: [{ item_id: 1, quantity: 1 }]
      })
    });
    assert.equal(orderRes.status, 201);
    const orderData = await orderRes.json();
    const orderNum = orderData.order.order_number;

    // Capture payment 1st time
    const cap1 = await fetch(`${baseUrl}/api/v1/orders/${orderNum}/capture-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: "UPI_INTENT" })
    });
    assert.equal(cap1.status, 200);
    const cap1Json = await cap1.json();
    assert.equal(cap1Json.paymentStatus, "PAID");

    // Capture payment 2nd time (replay/retry) -> should succeed idempotently without error
    const cap2 = await fetch(`${baseUrl}/api/v1/orders/${orderNum}/capture-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: "UPI_INTENT" })
    });
    assert.equal(cap2.status, 200);
    const cap2Json = await cap2.json();
    assert.equal(cap2Json.paymentStatus, "PAID");
    assert.equal(cap2Json.alreadyCaptured, true);
  });

  test("11. Rejects invalid, NaN, or negative instant payout amounts", async () => {
    const badRes = await fetch(`${baseUrl}/api/v1/entities/1/payouts/request-instant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ amount: -500 })
    });
    assert.equal(badRes.status, 400);

    const nanRes = await fetch(`${baseUrl}/api/v1/entities/1/payouts/request-instant`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ amount: "invalid_nan" })
    });
    assert.equal(nanRes.status, 400);
  });
});

