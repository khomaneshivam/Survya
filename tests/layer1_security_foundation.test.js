const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");
const webhookExecutor = require("../src/services/workflow/nodeExecutors/webhookExecutor");
const { ensureTestAdmin, closeTestResources } = require("./helpers/testFixtures");

describe("Layer 1: Security Foundation, RBAC, Tenant Isolation & SSRF Defense", () => {
  let server;
  let baseUrl;
  let platformAdminToken;
  let tenantAOwner = {};
  let tenantBOwner = {};
  let tenantAEmployee = {};
  const createdUserIds = [];
  const createdTenantIds = [];
  const createdEntityIds = [];
  const createdCampaignIds = [];
  const createdTxnRefs = [];
  const prevWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  before(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "layer1_test_rzp_secret_987654";
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Ensure at least one Platform Admin exists on Tenant 1 before testing self-serve registration
    const adminRow = ensureTestAdmin(1);
    assert.ok(adminRow, "Seeded Platform Admin on tenant 1 must exist");
    platformAdminToken = jwt.sign(
      { userId: adminRow.id, email: adminRow.email, role: "ADMIN", tenantId: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Self-register Tenant A Owner via HTTP API
    const regA = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Layer1 Alpha Biz",
        email: `l1_alpha_${Date.now()}@sarvya.test`,
        phone: "919900110011",
        password: "Password123!"
      })
    });
    assert.equal(regA.status, 201);
    const jsonA = await regA.json();
    tenantAOwner = { user: jsonA.user, token: jsonA.token, email: jsonA.user.email, password: "Password123!" };
    createdUserIds.push(tenantAOwner.user.id);
    createdTenantIds.push(Number(tenantAOwner.user.tenant_id));

    // Self-register Tenant B Owner via HTTP API
    const regB = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Layer1 Beta Biz",
        email: `l1_beta_${Date.now()}@sarvya.test`,
        phone: "919900220022",
        password: "Password123!"
      })
    });
    assert.equal(regB.status, 201);
    const jsonB = await regB.json();
    tenantBOwner = { user: jsonB.user, token: jsonB.token, email: jsonB.user.email, password: "Password123!" };
    createdUserIds.push(tenantBOwner.user.id);
    createdTenantIds.push(Number(tenantBOwner.user.tenant_id));
  });

  after(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = prevWebhookSecret;
    for (const ref of createdTxnRefs) {
      try { db.prepare("DELETE FROM universal_transactions WHERE reference_code = ?").run(ref); } catch (_) {}
    }
    for (const cid of createdCampaignIds) {
      try { db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(cid); } catch (_) {}
      try { db.prepare("DELETE FROM campaigns WHERE id = ?").run(cid); } catch (_) {}
    }
    for (const eid of createdEntityIds) {
      try { db.prepare("DELETE FROM merchant_payout_beneficiaries WHERE entity_id = ?").run(eid); } catch (_) {}
      try { db.prepare("DELETE FROM unified_orders WHERE entity_id = ?").run(eid); } catch (_) {}
      try { db.prepare("DELETE FROM business_entities WHERE id = ?").run(eid); } catch (_) {}
    }
    for (const uid of createdUserIds) {
      try { db.prepare("DELETE FROM tenant_user_memberships WHERE user_id = ?").run(uid); } catch (_) {}
      try { db.prepare("DELETE FROM users WHERE id = ?").run(uid); } catch (_) {}
    }
    for (const tid of createdTenantIds) {
      try { db.prepare("DELETE FROM crm_pipelines WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM tenant_installations WHERE tenant_id = ?").run(tid); } catch (_) {}
      try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch (_) {}
    }
    await closeTestResources(server);
  });

  test("1. Self-serve SaaS registration assigns USER platform role + workspace OWNER, never Platform ADMIN", async () => {
    assert.equal(tenantAOwner.user.role, "USER");
    assert.ok(Number(tenantAOwner.user.tenant_id) > 1);
    assert.notEqual(Number(tenantAOwner.user.tenant_id), Number(tenantBOwner.user.tenant_id));

    const memA = db.prepare("SELECT role FROM tenant_user_memberships WHERE user_id = ? AND tenant_id = ?")
      .get(tenantAOwner.user.id, tenantAOwner.user.tenant_id);
    assert.equal(memA?.role, "OWNER");

    // Verify login JWT encodes tenantId cleanly
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: tenantAOwner.email, password: tenantAOwner.password })
    });
    assert.equal(loginRes.status, 200);
    const loginJson = await loginRes.json();
    assert.equal(Number(loginJson.user.tenant_id), Number(tenantAOwner.user.tenant_id));
    assert.equal(loginJson.user.is_platform_admin, false);
    const decoded = jwt.verify(loginJson.token, config.JWT_SECRET);
    assert.equal(Number(decoded.tenantId), Number(tenantAOwner.user.tenant_id));
  });

  test("2. Cross-tenant escalation & x-workspace-id spoofing are blocked", async () => {
    // Cannot hit global Platform Admin routes
    const adminUsersRes = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${tenantAOwner.token}` }
    });
    assert.equal(adminUsersRes.status, 403);

    const adminTemplatesRes = await fetch(`${baseUrl}/api/v1/template-library/admin/all`, {
      headers: { Authorization: `Bearer ${tenantAOwner.token}` }
    });
    assert.equal(adminTemplatesRes.status, 403);

    // Spoofing x-workspace-id: 1 does not switch Tenant A Owner into Tenant 1
    const meSpoofRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${tenantAOwner.token}`,
        "x-workspace-id": "1"
      }
    });
    assert.equal(meSpoofRes.status, 200);
    const meSpoofJson = await meSpoofRes.json();
    assert.equal(Number(meSpoofJson.user.tenant_id), Number(tenantAOwner.user.tenant_id));
    assert.equal(meSpoofJson.user.is_switched_workspace, false);

    // Cannot switch via agency endpoint into Tenant 1
    const switchRes = await fetch(`${baseUrl}/api/v1/agency/switch-workspace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAOwner.token}`
      },
      body: JSON.stringify({ workspaceId: 1 })
    });
    assert.equal(switchRes.status, 403);
  });

  test("3. Workspace Team RBAC: Owner creates Employee strictly in own tenant; Employee blocked from admin routes", async () => {
    const empEmail = `l1_emp_${Date.now()}@sarvya.test`;
    const createEmpRes = await fetch(`${baseUrl}/api/v1/workspace/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAOwner.token}`
      },
      body: JSON.stringify({
        name: "Alpha Desk Agent",
        email: empEmail,
        phone: "919911223344",
        password: "EmpPassword123!",
        workspaceRole: "USER"
      })
    });
    assert.equal(createEmpRes.status, 201);
    const empJson = await createEmpRes.json();
    createdUserIds.push(empJson.data.id);
    assert.equal(Number(empJson.data.tenant_id), Number(tenantAOwner.user.tenant_id));
    assert.equal(empJson.data.role, "USER");

    // Log in as Employee
    const empLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: empEmail, password: "EmpPassword123!" })
    });
    const empLoginJson = await empLogin.json();
    tenantAEmployee = { user: empLoginJson.user, token: empLoginJson.token };

    // Employee blocked from managing workspace users or modifying payment config
    const listTeamAsEmp = await fetch(`${baseUrl}/api/v1/workspace/users`, {
      headers: { Authorization: `Bearer ${tenantAEmployee.token}` }
    });
    assert.equal(listTeamAsEmp.status, 403);

    // Tenant B Owner CANNOT list or mutate Tenant A's employee
    const crossList = await fetch(`${baseUrl}/api/v1/workspace/users`, {
      headers: { Authorization: `Bearer ${tenantBOwner.token}` }
    });
    assert.equal(crossList.status, 200);
    const crossListJson = await crossList.json();
    assert.equal(crossListJson.data.some(u => u.id === empJson.data.id), false);

    const crossPatch = await fetch(`${baseUrl}/api/v1/workspace/users/${empJson.data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantBOwner.token}`
      },
      body: JSON.stringify({ status: "SUSPENDED" })
    });
    assert.equal(crossPatch.status, 404);
  });

  test("4. Template Library & Reports honor strict tenant isolation", async () => {
    // Non-platform admin cannot publish PUBLIC templates
    const pubAttempt = await fetch(`${baseUrl}/api/v1/template-library`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAOwner.token}`
      },
      body: JSON.stringify({
        template_key: `spoof_pub_${Date.now()}`,
        title: "Spoof Public Template",
        visibility: "PUBLIC"
      })
    });
    assert.equal(pubAttempt.status, 403);

    // Seed campaign on Tenant 1 (admin) and verify Tenant B Owner cannot export or see it
    const campId = `camp_l1_${Date.now()}`;
    createdCampaignIds.push(campId);
    const t1Admin = ensureTestAdmin(1);
    db.prepare(`
      INSERT INTO campaigns (id, name, total_contacts, sent_count, status, user_id, tenant_id)
      VALUES (?, 'Tenant1 Confidential Campaign', 1, 1, 'COMPLETED', ?, 1)
    `).run(campId, t1Admin.id);
    db.prepare(`
      INSERT INTO campaign_recipients (campaign_id, phone_number, clean_phone, contact_name, status)
      VALUES (?, '919900009999', '919900009999', 'VIP Guest', 'DELIVERED')
    `).run(campId);

    const expCross = await fetch(`${baseUrl}/api/reports/campaigns/export?campaignId=${campId}`, {
      headers: { Authorization: `Bearer ${tenantBOwner.token}` }
    });
    assert.equal(expCross.status, 403);

    const repList = await fetch(`${baseUrl}/api/reports/campaigns?campaignId=${campId}`, {
      headers: { Authorization: `Bearer ${tenantBOwner.token}` }
    });
    assert.equal(repList.status, 200);
    const repJson = await repList.json();
    assert.equal(repJson.data.length, 0);

    // Tenant B cannot bind Tenant A's private property or WhatsApp line in Template Binding Service
    const templateBindingService = require("../src/modules/templateLibrary/templateBindingService");
    const propA = db.prepare(`
      INSERT INTO properties (tenant_id, name, city, status)
      VALUES (?, 'Tenant A Private Villa', 'Alibaug', 'ACTIVE')
    `).run(tenantAOwner.user.tenant_id);
    const phoneIdA = `waba_l1_priv_${Date.now()}`;
    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, is_default)
      VALUES (?, ?, 'Alpha Line', '919900110011', ?, 'waba_a', 0)
    `).run(phoneIdA, tenantAOwner.user.tenant_id, phoneIdA);
    try {
      const bindCheck = templateBindingService.validateBindings(
        [
          { key: "property_id", type: "PROPERTY", required: true },
          { key: "sender_line", type: "WHATSAPP_LINE", required: true }
        ],
        [
          { key: "property_id", type: "PROPERTY", target_resource_id: String(propA.lastInsertRowid) },
          { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: phoneIdA }
        ],
        tenantBOwner.user.tenant_id
      );
      assert.equal(bindCheck.isValid, false);
      assert.ok(bindCheck.errors.length >= 2);
    } finally {
      db.prepare("DELETE FROM waba_phone_numbers WHERE phone_number_id = ?").run(phoneIdA);
      db.prepare("DELETE FROM properties WHERE id = ?").run(propA.lastInsertRowid);
    }
  });

  test("5. Payment webhooks & manual capture fail closed, cross-tenant penny-drop blocked, XSS escaped", async () => {
    // Create entity in Tenant A
    const eRes = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, slug, name, phone_e164, city, status)
      VALUES (?, 'SERVICES', ?, 'Alpha Clinic L1', '919900110011', 'Mumbai', 'ACTIVE')
    `).run(tenantAOwner.user.tenant_id, `alpha-clinic-l1-${Date.now()}`);
    const entityIdA = Number(eRes.lastInsertRowid);
    createdEntityIds.push(entityIdA);

    const ordNum = `ORD-L1-${Date.now()}`;
    db.prepare(`
      INSERT INTO unified_orders (order_number, entity_id, tenant_id, domain, customer_name, customer_phone, grand_total, payment_status, order_status)
      VALUES (?, ?, ?, 'SERVICES', 'Customer A', '919988776655', 1500, 'UNPAID', 'PENDING')
    `).run(ordNum, entityIdA, tenantAOwner.user.tenant_id);

    // Unauthenticated capture -> 401
    const unauthCap = await fetch(`${baseUrl}/api/v1/orders/${ordNum}/capture-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: "UPI" })
    });
    assert.equal(unauthCap.status, 401);

    // Employee capture -> 403
    const empCap = await fetch(`${baseUrl}/api/v1/orders/${ordNum}/capture-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantAEmployee.token}`
      },
      body: JSON.stringify({ paymentMethod: "UPI" })
    });
    assert.equal(empCap.status, 403);

    // Cross-tenant capture -> 403
    const crossCap = await fetch(`${baseUrl}/api/v1/orders/${ordNum}/capture-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantBOwner.token}`
      },
      body: JSON.stringify({ paymentMethod: "UPI" })
    });
    assert.equal(crossCap.status, 403);

    // Cross-tenant beneficiary penny-drop check -> 403
    const bRes = db.prepare(`
      INSERT INTO merchant_payout_beneficiaries (entity_id, tenant_id, account_holder_name, bank_name, account_number, ifsc_code, verification_status)
      VALUES (?, ?, 'Alpha Clinic', 'HDFC BANK', '123456789012', 'HDFC0000001', 'PENDING')
    `).run(entityIdA, tenantAOwner.user.tenant_id);
    const pennyCross = await fetch(`${baseUrl}/api/v1/payouts/beneficiaries/${bRes.lastInsertRowid}/verify-penny-drop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tenantBOwner.token}` }
    });
    assert.equal(pennyCross.status, 403);

    // Unsigned or spoofed Razorpay webhooks fail closed -> 401
    const rzpPayoutNoSig = await fetch(`${baseUrl}/api/v1/webhooks/payments/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "payment.captured" })
    });
    assert.equal(rzpPayoutNoSig.status, 401);

    const rzpBillingMockSig = await fetch(`${baseUrl}/api/v1/billing/webhook/razorpay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "mock_signature"
      },
      body: JSON.stringify({ event: "payment.captured" })
    });
    assert.equal(rzpBillingMockSig.status, 401);

    const pubPayNoSig = await fetch(`${baseUrl}/api/v1/public/pay/webhook/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "payment_link.paid", reference_code: "REF-NONE" })
    });
    assert.equal(pubPayNoSig.status, 401);

    // Public receipt escapes HTML/XSS in missing referenceCode
    const xssRes = await fetch(`${baseUrl}/api/v1/public/receipt/${encodeURIComponent('<script>alert(1)</script>')}`);
    assert.equal(xssRes.status, 404);
    const xssBody = await xssRes.text();
    assert.ok(!xssBody.includes("<script>alert(1)</script>"));
    assert.ok(xssBody.includes("&lt;script&gt;"));

    // Public payment page does not render spoofable inline simulatePayment script
    const txnRef = `TXN-L1-${Date.now()}`;
    createdTxnRefs.push(txnRef);
    db.prepare(`
      INSERT INTO universal_transactions (tenant_id, reference_code, transaction_type, source_channel, customer_phone, customer_name, grand_total, deposit_due, payment_status)
      VALUES (?, ?, 'BOOKING', 'WHATSAPP', '919900001122', 'Jane Doe', 500, 500, 'UNPAID')
    `).run(tenantAOwner.user.tenant_id, txnRef);
    const payHtml = await (await fetch(`${baseUrl}/api/v1/public/pay/${txnRef}`)).text();
    assert.ok(!payHtml.includes("simulatePayment("));
  });

  test("6. SSRF blocks IPv6, CGNAT, integer IPs, DNS rebinding & HTTP redirects; /uploads traversal returns 403", async () => {
    for (const badUrl of [
      "http://[::1]:8080/admin",
      "http://[fe80::1]/meta",
      "http://[fc00::1]/internal",
      "http://2130706433/admin",
      "http://0x7f000001/admin",
      "http://0177.0.0.1/admin",
      "http://100.64.0.1/cgnat",
      "http://metadata.google.internal/computeMetadata/v1/",
      "file:///etc/passwd"
    ]) {
      assert.throws(() => webhookExecutor.validateUrlSecurity(badUrl), /blocked|prohibited|protocol/i);
    }

    // DNS rebinding guard rejects hostnames resolving to loopback/metadata/private IPs
    await assert.rejects(
      () => webhookExecutor.validateResolvedUrlSecurity(
        "https://rebind.attacker.example/hook",
        async () => [{ address: "169.254.169.254", family: 4 }]
      ),
      /DNS resolved to blocked/i
    );

    await assert.rejects(
      () => webhookExecutor.validateResolvedUrlSecurity(
        "https://v6rebind.attacker.example/hook",
        async () => [{ address: "::1", family: 6 }]
      ),
      /DNS resolved to blocked/i
    );

    // Fetch redirect: 'manual' prevents open-redirect SSRF
    const origFetch = global.fetch;
    global.fetch = async (url, init) => {
      assert.equal(init.redirect, "manual");
      return { status: 302, ok: false, headers: new Map([["location", "http://127.0.0.1:5000/"]]) };
    };
    try {
      const res = await webhookExecutor.execute(
        { id: "wh_redir", type: "HTTP_WEBHOOK", config: { url: "https://hook.example.test/cb", method: "POST" } },
        { session: {}, dryRun: false }
      );
      assert.equal(res.nextHandle, "failure");
      assert.match(res.traceNote, /redirects.*prohibited/i);
    } finally {
      global.fetch = origFetch;
    }

    // /uploads/inbound traversal returns 403 before auth 401
    const travRes = await fetch(`${baseUrl}/uploads/inbound/%2e%2e%2fpackage.json`);
    assert.equal(travRes.status, 403);
  });

  test("7. Billing checkout fail-closed without gateway secret & verifies genuine HMAC-SHA256 payment signature", async () => {
    const prevKeyId = process.env.RAZORPAY_KEY_ID;
    const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const tenantIdA = Number(tenantAOwner.user.tenant_id);
    const createdPaymentId = `pay_l1_${Date.now()}`;

    try {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      const noKeyCheckout = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "GROWTH", billingCycle: "MONTHLY", customerStateCode: "27" })
      });
      assert.equal(noKeyCheckout.status, 200);
      const noKeyData = await noKeyCheckout.json();
      assert.equal(noKeyData.gatewayConfigured, false);
      assert.equal(noKeyData.key, null);

      const failClosedVerify = await fetch(`${baseUrl}/api/v1/billing/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: "GROWTH",
          razorpay_order_id: noKeyData.orderId,
          razorpay_payment_id: createdPaymentId,
          razorpay_signature: "spoofed_sig"
        })
      });
      assert.equal(failClosedVerify.status, 503);

      // Now configure server gateway keys and validate strict HMAC verification
      process.env.RAZORPAY_KEY_ID = "rzp_test_l1_key_id";
      process.env.RAZORPAY_KEY_SECRET = "l1_gateway_secret_abcdef_987654";

      const configuredCheckout = await fetch(`${baseUrl}/api/v1/billing/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: "GROWTH", billingCycle: "MONTHLY", customerStateCode: "27" })
      });
      assert.equal(configuredCheckout.status, 200);
      const cfgData = await configuredCheckout.json();
      assert.equal(cfgData.gatewayConfigured, true);
      assert.equal(cfgData.key, "rzp_test_l1_key_id");

      const forgedRes = await fetch(`${baseUrl}/api/v1/billing/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: "GROWTH",
          billingCycle: "MONTHLY",
          customerStateCode: "27",
          razorpay_order_id: cfgData.orderId,
          razorpay_payment_id: createdPaymentId,
          razorpay_signature: "0000000000000000000000000000000000000000000000000000000000000000"
        })
      });
      assert.equal(forgedRes.status, 401);

      const validSig = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${cfgData.orderId}|${createdPaymentId}`)
        .digest("hex");

      const okRes = await fetch(`${baseUrl}/api/v1/billing/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: "GROWTH",
          billingCycle: "MONTHLY",
          customerStateCode: "27",
          razorpay_order_id: cfgData.orderId,
          razorpay_payment_id: createdPaymentId,
          razorpay_signature: validSig
        })
      });
      assert.equal(okRes.status, 200);
      const okData = await okRes.json();
      assert.equal(okData.success, true);
      assert.equal(okData.planCode, "GROWTH");
      assert.match(okData.invoiceNumber, /^INV-SARVYA-/);

      // Idempotent replay with same payment ID does not issue duplicate invoice
      const replayRes = await fetch(`${baseUrl}/api/v1/billing/verify-payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tenantAOwner.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: "GROWTH",
          billingCycle: "MONTHLY",
          customerStateCode: "27",
          razorpay_order_id: cfgData.orderId,
          razorpay_payment_id: createdPaymentId,
          razorpay_signature: validSig
        })
      });
      assert.equal(replayRes.status, 200);
      const replayData = await replayRes.json();
      assert.equal(replayData.alreadyProcessed, true);
      assert.equal(replayData.invoiceNumber, okData.invoiceNumber);
    } finally {
      if (prevKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
      else process.env.RAZORPAY_KEY_ID = prevKeyId;
      if (prevKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
      else process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
      try { db.prepare("DELETE FROM tenant_subscriptions WHERE tenant_id = ?").run(tenantIdA); } catch (_) {}
    }
  });
});
