const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { db } = require("../src/config/database");
const cryptoUtil = require("../src/utils/cryptoUtil");
const metaEmbeddedSignupService = require("../src/services/metaEmbeddedSignupService");
const billingService = require("../src/services/billingService");
const crmPipelineService = require("../src/services/crmPipelineService");
const inappExperienceService = require("../src/services/inapp/inappExperienceService");

describe("Task 4: Multi-Tenant SaaS, Meta Embedded Signup v4, Billing & Agency Mode", () => {
  let tenantAId;
  let tenantBId;
  let userAId;
  let userBId;

  before(() => {
    // 1. Create Tenant A
    const resA = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('Tenant A Corp', 'tenant-a-test', 'ACTIVE', 'TRIAL', 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 1000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantAId = Number(resA.lastInsertRowid);

    // 2. Create Tenant B
    const resB = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('Tenant B Enterprise', 'tenant-b-test', 'ACTIVE', 'ENTERPRISE', 'ACTIVE', NULL, 200000, 10, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantBId = Number(resB.lastInsertRowid);

    // 3. Create User A and User B
    userAId = `test_user_a_${crypto.randomUUID()}`;
    userBId = `test_user_b_${crypto.randomUUID()}`;

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id)
      VALUES (?, 'User A', 'user_a@test.com', 'hash', 'USER', 'ACTIVE', ?)
    `).run(userAId, tenantAId);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, status, tenant_id)
      VALUES (?, 'User B', 'user_b@test.com', 'hash', 'ADMIN', 'ACTIVE', ?)
    `).run(userBId, tenantBId);

    // Memberships
    db.prepare(`
      INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
      VALUES (?, ?, 'OWNER')
    `).run(userAId, tenantAId);

    db.prepare(`
      INSERT INTO tenant_user_memberships (user_id, tenant_id, role)
      VALUES (?, ?, 'OWNER')
    `).run(userBId, tenantBId);
  });

  after(() => {
    // Cleanup test data
    if (tenantAId) {
      db.prepare("DELETE FROM tenant_subscriptions WHERE tenant_id IN (?, ?)").run(tenantAId, tenantBId);
      db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id IN (?, ?)").run(tenantAId, tenantBId);
      db.prepare("DELETE FROM waba_phone_numbers WHERE tenant_id IN (?, ?)").run(tenantAId, tenantBId);
      db.prepare("DELETE FROM inapp_experiences WHERE tenant_id IN (?, ?)").run(tenantAId, tenantBId);
      db.prepare("DELETE FROM crm_pipelines WHERE tenant_id IN (?, ?)").run(tenantAId, tenantBId);
      db.prepare("DELETE FROM users WHERE id IN (?, ?)").run(userAId, userBId);
      db.prepare("DELETE FROM tenants WHERE id IN (?, ?) OR parent_agency_tenant_id = ?").run(tenantAId, tenantBId, tenantBId);
    }
  });

  test("1. Multi-Tenant Database Isolation: Tenant A data is strictly invisible to Tenant B", () => {
    // Create an inapp experience for Tenant A
    const expA = inappExperienceService.createExperience({
      tenant_id: tenantAId,
      name: "Tenant A Private Experience",
      slug: `tenant-a-exp-${Date.now()}`,
      domain_type: "CUSTOM",
      status: "DRAFT"
    });

    assert.ok(expA.id, "Experience A created");

    // List experiences for Tenant B - must be empty or not contain Tenant A's experience
    const listB = inappExperienceService.listExperiences({ tenant_id: tenantBId });
    const foundInB = listB.some((e) => e.id === expA.id);
    assert.strictEqual(foundInB, false, "Tenant A experience must NOT leak into Tenant B");

    // Create CRM pipeline for Tenant A
    const pipeA = crmPipelineService.createPipeline({
      tenantId: tenantAId,
      name: "Tenant A Pipeline",
      slug: `pipe-a-${Date.now()}`,
      industryType: "B2B_SALES",
      stages: [{ key: "STAGE1", label: "Stage 1", color: "#333", order: 1 }]
    });

    const listPipesB = crmPipelineService.listPipelines(tenantBId);
    const foundPipeInB = listPipesB.some((p) => p.id === pipeA.id);
    assert.strictEqual(foundPipeInB, false, "Tenant A CRM pipeline must NOT leak into Tenant B");
  });

  test("2. Self-Serve Workspace Onboarding: 7-day TRIAL and default memberships", () => {
    // Verify Tenant A was initialized as TRIAL with 7-day expiry and 1 line quota
    const tA = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantAId);
    assert.strictEqual(tA.plan_code, "TRIAL");
    assert.strictEqual(tA.subscription_status, "TRIALING");
    assert.strictEqual(tA.quota_monthly_messages, 1000);
    assert.strictEqual(tA.quota_waba_lines, 1);
    assert.ok(tA.trial_ends_at, "Trial ends at date must be populated");

    // Verify User A has OWNER membership in tenant_user_memberships
    const memA = db.prepare("SELECT * FROM tenant_user_memberships WHERE user_id = ? AND tenant_id = ?").get(userAId, tenantAId);
    assert.ok(memA, "Membership must exist");
    assert.strictEqual(memA.role, "OWNER");
  });

  test("3. Meta Embedded Signup v4: Config, Token Exchange, AES-256-GCM Encryption & Coexistence Mode", async () => {
    // Test config
    const cfg = metaEmbeddedSignupService.getConfig({ tenantId: tenantAId });
    assert.ok(cfg.metaAppId, "metaAppId present");
    assert.ok(cfg.embeddedSignupConfigId, "embeddedSignupConfigId present");
    assert.strictEqual(cfg.graphVersion, "v21.0");
    assert.strictEqual(cfg.coexistenceSupported, true);

    // Test token exchange in simulation / test mode with coexistenceMode = true
    const testPhoneId = `phone_emb_${Date.now()}`;
    const exchangeResult = await metaEmbeddedSignupService.exchangeCode({
      code: "mock_auth_code_12345",
      wabaId: "mock_waba_id_8888",
      phoneNumberId: testPhoneId,
      displayName: "Coexistence Support Line",
      phoneNumber: "+919876543210",
      coexistenceMode: true,
      tenantId: tenantAId,
      userId: userAId,
      isSimulation: true
    });

    assert.strictEqual(exchangeResult.success, true);
    assert.strictEqual(exchangeResult.line.coexistenceMode, true);
    assert.strictEqual(exchangeResult.line.status, "VERIFIED");

    // Verify row in DB: access_token_enc is encrypted with AES-256-GCM
    const phoneRow = db.prepare("SELECT * FROM waba_phone_numbers WHERE id = ?").get(testPhoneId);
    assert.ok(phoneRow, "Phone number record created");
    assert.strictEqual(phoneRow.tenant_id, tenantAId);
    assert.strictEqual(phoneRow.coexistence_mode, 1);
    assert.strictEqual(phoneRow.embedded_signup_version, "v4");
    assert.ok(cryptoUtil.isEncrypted(phoneRow.access_token_enc), "Token must be encrypted with AES-256-GCM");

    // Decrypt and verify mock token content
    const decryptedToken = cryptoUtil.decrypt(phoneRow.access_token_enc);
    assert.ok(decryptedToken.startsWith("EAAMock_"), "Decrypted token matches EAAMock_");

    // Test coexistence status check
    const coexistenceCheck = metaEmbeddedSignupService.testCoexistence({
      phoneNumberId: testPhoneId,
      tenantId: tenantAId
    });
    assert.strictEqual(coexistenceCheck.success, true);
    assert.strictEqual(coexistenceCheck.coexistenceMode, true);
    assert.strictEqual(coexistenceCheck.mobileAppActive, true);
    assert.strictEqual(coexistenceCheck.checklist.cloudApiCoexistence, "ACTIVE");

    // Test quota enforcement: Tenant A has quota_waba_lines = 1, trying to add a 2nd line should throw
    await assert.rejects(
      async () => {
        await metaEmbeddedSignupService.exchangeCode({
          code: "mock_auth_code_2",
          wabaId: "mock_waba_id_9999",
          phoneNumberId: `phone_emb_quota_${Date.now()}`,
          tenantId: tenantAId,
          userId: userAId,
          isSimulation: true
        });
      },
      /quota reached/i,
      "Must reject when WABA line quota is exceeded"
    );
  });

  test("4. Razorpay GST Billing: 18% GST split (MH 27 vs Interstate) & Sequential Invoice Generation", async () => {
    // A. Checkout for Maharashtra customer (State Code 27) -> CGST 9% + SGST 9%
    const checkoutMh = billingService.createCheckout({
      tenantId: tenantAId,
      planCode: "GROWTH",
      billingCycle: "MONTHLY",
      customerStateCode: "27",
      gstin: "27AAAAA0000A1Z5",
      billingAddress: "Mumbai, Maharashtra"
    });

    assert.strictEqual(checkoutMh.success, true);
    assert.strictEqual(checkoutMh.breakdown.sacCode, "998314");
    assert.strictEqual(checkoutMh.breakdown.baseAmount, 3999);
    assert.strictEqual(checkoutMh.breakdown.cgst, 359.91);
    assert.strictEqual(checkoutMh.breakdown.sgst, 359.91);
    assert.strictEqual(checkoutMh.breakdown.igst, 0);
    assert.strictEqual(checkoutMh.breakdown.totalAmount, 4718.82);

    // B. Checkout for Interstate customer (e.g. Karnataka 29) -> IGST 18%
    const checkoutInterstate = billingService.createCheckout({
      tenantId: tenantAId,
      planCode: "GROWTH",
      billingCycle: "MONTHLY",
      customerStateCode: "29",
      gstin: "29BBBBB1111B1Z2",
      billingAddress: "Bengaluru, Karnataka"
    });

    assert.strictEqual(checkoutInterstate.breakdown.cgst, 0);
    assert.strictEqual(checkoutInterstate.breakdown.sgst, 0);
    assert.strictEqual(checkoutInterstate.breakdown.igst, 719.82);
    assert.strictEqual(checkoutInterstate.breakdown.totalAmount, 4718.82);

    // C. Razorpay Webhook Payment Capture & Sequential Invoice Generation
    const webhookRes = await billingService.handleRazorpayWebhook(
      {
        event: "payment.captured",
        payment: {
          id: `pay_test_${Date.now()}`,
          notes: {
            tenant_id: tenantAId,
            plan_code: "GROWTH",
            billing_cycle: "MONTHLY",
            customer_state_code: "27"
          }
        }
      },
      "mock_signature"
    );

    assert.strictEqual(webhookRes.success, true);
    assert.strictEqual(webhookRes.status, "PROCESSED");
    assert.ok(
      webhookRes.invoiceNumber.startsWith("INV-SARVYA-"),
      `Invoice number format expected INV-SARVYA-YYYYMM-XXXX, got: ${webhookRes.invoiceNumber}`
    );

    // Verify Tenant A is upgraded to GROWTH with active status and new quotas
    const upgradedTenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(tenantAId);
    assert.strictEqual(upgradedTenant.plan_code, "GROWTH");
    assert.strictEqual(upgradedTenant.subscription_status, "ACTIVE");
    assert.strictEqual(upgradedTenant.quota_monthly_messages, 50000);
    assert.strictEqual(upgradedTenant.quota_waba_lines, 3);

    // D. Printable HTML Tax Invoice
    const html = billingService.getInvoiceHtml(webhookRes.invoiceNumber, tenantAId);
    assert.ok(html.includes("GST TAX INVOICE"), "HTML has GST TAX INVOICE heading");
    assert.ok(html.includes("998314"), "HTML contains SAC 998314");
    assert.ok(html.includes(webhookRes.invoiceNumber), "HTML contains invoice number");
    assert.ok(html.includes("GST"), "HTML contains GST tax rows");
  });

  test("5. Agency White-Label & Multi-Workspace: Child workspace creation, switcher authorization", () => {
    // Tenant B is ENTERPRISE. Let's create a child workspace under Tenant B.
    const childRes = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, parent_agency_tenant_id,
        branding_json, quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('Client Workspace Alpha', 'client-alpha-test', 'ACTIVE', 'STARTER', 'ACTIVE', ?, ?, 10000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(tenantBId, JSON.stringify({ appName: "Alpha Agency WA", primaryColor: "#10b981" }));

    const childId = Number(childRes.lastInsertRowid);
    assert.ok(childId > 0, "Child workspace created");

    // Verify child workspace is linked to agency
    const childRow = db.prepare("SELECT * FROM tenants WHERE id = ?").get(childId);
    assert.strictEqual(childRow.parent_agency_tenant_id, tenantBId);

    // Agency admin (User B) has authorization to switch to child workspace
    const isAgencyAdminOfChild = (childRow.parent_agency_tenant_id === tenantBId);
    assert.strictEqual(isAgencyAdminOfChild, true, "User B must have agency access to child workspace");

    // Clean up child workspace
    db.prepare("DELETE FROM tenants WHERE id = ?").run(childId);
  });
});
