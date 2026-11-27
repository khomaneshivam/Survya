const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const config = require("../src/config/env");
const { db, getSetting, setSetting, initializeDatabase } = require("../src/config/database");
const { closeAsyncPool } = require("../src/config/asyncDb");
const { app } = require("../server");
const { JobWorkerEngine } = require("../src/services/queue/jobWorkerEngine");
const whatsappMessagingService = require("../src/services/whatsappMessagingService");
const universalCatalogService = require("../src/services/universal/universalCatalogService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalFulfillmentService = require("../src/services/universal/universalFulfillmentService");

describe("Phase 7 Regression: Workspace Sandbox Mode & Greenvally E2E Booking Lifecycle (Zero External Dispatch)", () => {
  let server;
  let baseUrl;
  let tenantId;
  let ownerUserId;
  let ownerToken;
  let propId;
  let wabaPhoneId;
  let originalFetch;
  let origVerifyToken;
  let origAppSecret;
  const externalFetchCalls = [];
  const webhookVerifyToken = "wb_live_greenvally_sandbox_verify_123";
  const metaSecret = "1234567890abcdef1234567890abcdef";
  const rzpSecret = "rzp_greenvally_sandbox_wh_123";

  before(async () => {
    initializeDatabase();
    origVerifyToken = getSetting("WEBHOOK_VERIFY_TOKEN");
    origAppSecret = getSetting("META_APP_SECRET");

    // Intercept global.fetch to guarantee ZERO outbound Meta/Razorpay network calls during Sandbox E2E
    originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
      const urlStr = String(url || "");
      if (!urlStr.startsWith("http://127.0.0.1:") && !urlStr.startsWith("http://localhost:")) {
        externalFetchCalls.push({ url: urlStr, method: options.method || "GET" });
        throw new Error(`SANDBOX_EXTERNAL_CALL_BLOCKED: Attempted live HTTP request to ${urlStr}`);
      }
      return originalFetch(url, options);
    };

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    setSetting("WEBHOOK_VERIFY_TOKEN", webhookVerifyToken);
    setSetting("META_APP_SECRET", metaSecret);
    db.prepare("UPDATE system_job_queue SET status = 'CANCELLED' WHERE queue_name = 'webhook' AND status = 'PENDING'").run();

    const t = db.prepare(`
      INSERT INTO tenants (name, slug, status, plan_code, quota_monthly_messages, primary_domain, allowed_domains_json, is_sandbox)
      VALUES ('Greenvally Hotel & Resort', ?, 'ACTIVE', 'GROWTH', 50000, 'HOSPITALITY', '["HOSPITALITY"]', 0)
    `).run(`greenvally-e2e-${Date.now()}`);
    tenantId = Number(t.lastInsertRowid);

    ownerUserId = `usr_gv_owner_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Greenvally Owner', ?, 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(ownerUserId, tenantId, `gv_owner_${Date.now()}@greenvally.test`);
    db.prepare("INSERT INTO tenant_user_memberships (tenant_id, user_id, role) VALUES (?, ?, 'OWNER')").run(tenantId, ownerUserId);

    ownerToken = jwt.sign(
      { id: ownerUserId, userId: ownerUserId, tenant_id: tenantId, role: "USER", workspace_role: "OWNER" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(async () => {
    if (origVerifyToken !== undefined && origVerifyToken !== null) setSetting("WEBHOOK_VERIFY_TOKEN", origVerifyToken);
    if (origAppSecret !== undefined && origAppSecret !== null) setSetting("META_APP_SECRET", origAppSecret);
    if (originalFetch) {
      global.fetch = originalFetch;
    }
    if (server) {
      if (typeof server.closeAllConnections === "function") server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await closeAsyncPool();
  });

  test("1. Workspace toggles SANDBOX mode on via API & blocks live Meta calls while waiving sandbox ledger cost", async () => {
    const getRes0 = await fetch(`${baseUrl}/api/v1/workspace/sandbox`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(getRes0.status, 200);
    assert.equal((await getRes0.json()).isSandbox, false);

    const putRes = await fetch(`${baseUrl}/api/v1/workspace/sandbox`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({ isSandbox: true })
    });
    assert.equal(putRes.status, 200);
    const putJson = await putRes.json();
    assert.equal(putJson.isSandbox, true);
    assert.equal(putJson.mode, "SANDBOX");

    // Register Greenvally WABA line with NO Meta token — Sandbox must short-circuit cleanly
    wabaPhoneId = `gv_line_${Date.now()}`;
    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, phone_number_id, display_name, phone_number, status, is_default, delete_status)
      VALUES (?, ?, ?, 'Greenvally Reception', '+919300008888', 'VERIFIED', 1, 0)
    `).run(`waba_pk_${Date.now()}`, tenantId, wabaPhoneId);

    // Send outbound text message in Sandbox mode (without live token or live 24h Meta call)
    const msgRes = await whatsappMessagingService.sendOneToOneMessage({
      tenantId,
      userId: ownerUserId,
      to: "919811112222",
      type: "TEXT",
      text: "Welcome to Greenvally Hotel & Resort Sandbox!",
      phoneNumberId: wabaPhoneId,
      bypassWindowCheck: true
    });

    assert.equal(msgRes.status, "SENT");
    assert.ok(String(msgRes.metaMessageId).startsWith("mock_txt_"));
    assert.equal(externalFetchCalls.length, 0);

    const ledgerRow = db.prepare(`
      SELECT tenant_id, unit_cost, billing_status
      FROM whatsapp_usage_ledger
      WHERE tenant_id = ? AND message_id = ?
    `).get(tenantId, msgRes.id);
    assert.equal(Number(ledgerRow.tenant_id), tenantId);
    assert.equal(Number(ledgerRow.unit_cost), 0);
    assert.equal(ledgerRow.billing_status, "WAIVED_SANDBOX");
  });

  test("2. Greenvally Hotel & Resort completes end-to-end property setup, inbound webhook auto-reply, checkout & Razorpay reconciliation in Sandbox", async () => {
    const t1Before = db.prepare("SELECT name FROM properties WHERE id = 1").get();

    // 1. Create Greenvally property via Hospitality API
    const propRes = await fetch(`${baseUrl}/api/v1/hospitality/properties`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        name: "Greenvally Hotel & Resort",
        city: "Munnar",
        state: "Kerala",
        publication_status: "PUBLISHED"
      })
    });
    assert.equal(propRes.status, 201);
    const propData = await propRes.json();
    propId = Number(propData.property?.id || propData.data?.id);
    assert.ok(propId > 1);

    // 2. Configure Greenvally Tax, Payment Mode & Catalog Room Item
    const taxRes = db.prepare(`
      INSERT INTO master_tax_slabs (tenant_id, slab_code, title, tax_rate, cgst_rate, sgst_rate, igst_rate, active_status, delete_status)
      VALUES (?, 'GST_12_GV', 'GST 12% Hospitality', 12, 6, 6, 12, 1, 0)
    `).run(tenantId);
    const modeRes = db.prepare(`
      INSERT INTO master_payment_modes (tenant_id, mode_code, name, is_online, deposit_type, deposit_value, sort_order, active_status, delete_status)
      VALUES (?, 'RAZORPAY_GV', 'Razorpay UPI/Card', 1, 'FULL', 100, 1, 1, 0)
    `).run(tenantId);
    const entRes = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, name, slug, phone_e164, city, status, active_status, delete_status)
      VALUES (?, 'HOSPITALITY', 'Greenvally Hotel & Resort', ?, '+919300008888', 'Munnar', 'ACTIVE', 1, 0)
    `).run(tenantId, `gv-ent-${Date.now()}`);
    const entityId = Number(entRes.lastInsertRowid);
    db.prepare(`
      INSERT INTO merchant_payment_configs (tenant_id, entity_id, gateway_provider, webhook_secret)
      VALUES (?, ?, 'RAZORPAY', ?)
    `).run(tenantId, entityId, rzpSecret);

    const roomItem = universalCatalogService.createItem(tenantId, {
      title: "Greenvally Misty Valley Villa",
      inventoryMode: "DATE_RANGE",
      basePrice: 5000,
      stockQty: 3,
      trackInventory: 1,
      masterTaxSlabId: Number(taxRes.lastInsertRowid),
      masterLocationId: entityId
    });

    // 3. Inbound customer WhatsApp webhook arrives for Greenvally line -> queued & processed with ZERO external fetch
    const waMsgId = `wamid.gv.e2e.${Date.now()}`;
    const inboundBody = {
      object: "whatsapp_business_account",
      entry: [{
        id: "waba_gv_e2e",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "+919300008888", phone_number_id: wabaPhoneId },
            contacts: [{ profile: { name: "Rohan Menon" }, wa_id: "919800001122" }],
            messages: [{ from: "919800001122", id: waMsgId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Hi, looking for rooms in Munnar" } }]
          }
        }]
      }]
    };
    const rawJson = JSON.stringify(inboundBody);
    const whSig = "sha256=" + crypto.createHmac("sha256", metaSecret).update(rawJson).digest("hex");

    const whRes = await fetch(`${baseUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": whSig },
      body: rawJson
    });
    assert.equal(whRes.status, 200);

    const worker = new JobWorkerEngine({ queueName: "webhook", pollIntervalMs: 50 });
    await worker.claimAndProcessNextJob("webhook");

    const storedReply = db.prepare(`
      SELECT tenant_id, channel_account_id, customer_name
      FROM customer_replies
      WHERE wa_message_id = ?
    `).get(waMsgId);
    assert.ok(storedReply);
    assert.equal(Number(storedReply.tenant_id), tenantId);
    assert.equal(storedReply.channel_account_id, wabaPhoneId);

    // 4. Customer holds Villa for 2 nights, checks out, & confirms via merchant Razorpay webhook
    const checkIn = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const checkOut = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const hold = universalAvailabilityService.createInventoryHold(tenantId, {
      itemId: roomItem.id,
      quantity: 1,
      checkIn,
      checkOut,
      customerPhone: "919800001122",
      customerName: "Rohan Menon"
    });
    assert.equal(hold.success, true);

    const txnRes = await universalFulfillmentService.createTransactionFromQuote({
      tenantId,
      sourceChannel: "WHATSAPP_FLOW",
      customer: { phone: "919800001122", name: "Rohan Menon" },
      cartItems: [{ itemId: roomItem.id, quantity: 1 }],
      holdId: hold.holdToken,
      paymentModeId: Number(modeRes.lastInsertRowid),
      locationId: entityId,
      serviceDate: checkIn,
      serviceEndDate: checkOut
    });
    assert.equal(txnRes.quote.netSubtotal, 10000);
    assert.equal(txnRes.quote.totalGst, 1200);
    assert.equal(txnRes.quote.grandTotal, 11200);

    const payPayload = {
      event: "payment_link.paid",
      payload: {
        payment_link: { entity: { reference_id: txnRes.referenceCode, amount_paid: 1120000, currency: "INR" } },
        payment: { entity: { id: `pay_gv_${Date.now()}`, amount: 1120000, currency: "INR" } }
      }
    };
    const rzpSig = crypto.createHmac("sha256", rzpSecret).update(JSON.stringify(payPayload)).digest("hex");
    const payRes = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-razorpay-signature": rzpSig },
      body: JSON.stringify(payPayload)
    });
    assert.equal(payRes.status, 200);
    const payJson = await payRes.json();
    assert.equal(payJson.transaction.payment_status, "PAID");
    assert.equal(payJson.transaction.fulfillment_status, "CONFIRMED");

    // 5. Public receipt & analytics reconcile + ZERO external HTTP calls + Tenant 1 Property #1 untouched
    const recRes = await fetch(`${baseUrl}/api/v1/public/receipt/${txnRes.referenceCode}`);
    assert.equal(recRes.status, 200);
    const recHtml = await recRes.text();
    assert.ok(recHtml.includes(txnRes.referenceCode));
    assert.ok(recHtml.includes("Rohan Menon"));

    const ovRes = await fetch(`${baseUrl}/api/reports/overview`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(ovRes.status, 200);
    const ov = (await ovRes.json()).data;
    assert.equal(ov.revenue.universalTransactionsInr, 11200);

    assert.equal(externalFetchCalls.length, 0, `Expected 0 external network calls in Sandbox, got: ${JSON.stringify(externalFetchCalls)}`);
    if (t1Before) {
      assert.equal(db.prepare("SELECT name FROM properties WHERE id = 1").get().name, t1Before.name);
    }
  });

  test("3. Greenvally 4-category 25-unit inventory reservation, overbooking block, cancellation restoration & AI/Email sandbox quarantine", async () => {
    const emailNotificationService = require("../src/services/studio/emailNotificationService");
    const taskScopedAiAgentService = require("../src/services/ai/taskScopedAiAgentService");

    // 4 exact Greenvally room types totaling 25 units
    const gvCatalogSpecs = [
      { title: "Deluxe Room", stockQty: 10, basePrice: 3500 },
      { title: "Executive Suite", stockQty: 8, basePrice: 5500 },
      { title: "Family Suite", stockQty: 5, basePrice: 7500 },
      { title: "Private Pool Villa", stockQty: 2, basePrice: 12000 }
    ];

    const createdRooms = gvCatalogSpecs.map(spec => universalCatalogService.createItem(tenantId, {
      title: spec.title,
      inventoryMode: "DATE_RANGE",
      basePrice: spec.basePrice,
      stockQty: spec.stockQty,
      trackInventory: 1
    }));

    const totalUnits = createdRooms.reduce((sum, r) => sum + Number(r.stock_qty || 0), 0);
    assert.equal(createdRooms.length, 4);
    assert.equal(totalUnits, 25);

    const poolVilla = createdRooms.find(r => r.title === "Private Pool Villa");
    const checkIn = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const checkOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    // Reserve both available Private Pool Villas
    const hold2 = universalAvailabilityService.createInventoryHold(tenantId, {
      itemId: poolVilla.id,
      quantity: 2,
      checkIn,
      checkOut,
      customerPhone: "919822223333",
      customerName: "Ananya Nair"
    });
    assert.equal(hold2.success, true);

    // Attempting to hold a 3rd Private Pool Villa for overlapping dates must fail cleanly
    assert.throws(() => {
      universalAvailabilityService.createInventoryHold(tenantId, {
        itemId: poolVilla.id,
        quantity: 1,
        checkIn,
        checkOut,
        customerPhone: "919822224444",
        customerName: "Overbook Attempt"
      });
    }, /insufficient|available|stock|inventory/i);

    // Release hold -> availability must restore to 2 units
    const rel = universalAvailabilityService.releaseHold(tenantId, hold2.holdToken);
    assert.equal(rel.success, true);

    const holdAfterCancel = universalAvailabilityService.createInventoryHold(tenantId, {
      itemId: poolVilla.id,
      quantity: 2,
      checkIn,
      checkOut,
      customerPhone: "919822225555",
      customerName: "Restored Booking Guest"
    });
    assert.equal(holdAfterCancel.success, true);

    // Email notifications and AI LLM calls are strictly quarantined in Sandbox
    const emailRes = emailNotificationService.enqueueGoalEmailNotification({
      tenantId,
      eventName: "BOOKING_CONFIRMED",
      idempotencyKey: `gv_sandbox_email_${Date.now()}`,
      payload: { customerName: "Ananya Nair", monetaryValue: 24000 },
      explicitRecipients: ["owner@greenvally.test"]
    });
    assert.equal(emailRes.queued, false);
    assert.equal(emailRes.suppressed, true);
    assert.equal(emailRes.status, "SANDBOX_SUPPRESSED");

    const aiRes = await taskScopedAiAgentService.generateReply({
      tenantId,
      senderPhone: "919822225555",
      userInput: "What is the price of Private Pool Villa?",
      isSimulation: true
    });
    assert.equal(aiRes.handled, true);
    assert.ok(aiRes.replyText && aiRes.replyText.length > 0);
    assert.equal(externalFetchCalls.length, 0);
  });
});
