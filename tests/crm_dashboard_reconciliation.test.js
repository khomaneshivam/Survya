const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");

const { app } = require("../server");
const config = require("../src/config/env");
const { db, initializeDatabase } = require("../src/config/database");

describe("Phase 4 Regression: CRM Stages, Bookings/Dashboard Revenue & Campaign/Subscription Reconciliation", () => {
  let server;
  let baseUrl;
  let tenantId;
  let ownerUserId;
  let ownerToken;
  let propId;
  let roomTypeId;
  let contactId;

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
      VALUES ('CRM Reconcile Tenant', 'crm-rec-p4', 'ACTIVE', 'GROWTH', 50000, 'HOSPITALITY', '["HOSPITALITY"]')
    `).run();
    tenantId = Number(t.lastInsertRowid);

    ownerUserId = `usr_p4_owner_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Workspace Owner P4', 'owner_p4@sarvya.test', 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(ownerUserId, tenantId);
    db.prepare("INSERT INTO tenant_user_memberships (tenant_id, user_id, role) VALUES (?, ?, 'OWNER')").run(tenantId, ownerUserId);

    ownerToken = jwt.sign(
      { id: ownerUserId, userId: ownerUserId, tenant_id: tenantId, role: "USER", workspace_role: "OWNER" },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const pRes = db.prepare(`
      INSERT INTO properties (tenant_id, name, city, state, publication_status, status, active_status, delete_status)
      VALUES (?, 'P4 Resort', 'Goa', 'Goa', 'PUBLISHED', 'ACTIVE', 1, 0)
    `).run(tenantId);
    propId = Number(pRes.lastInsertRowid);

    const rtRes = db.prepare(`
      INSERT INTO room_types (tenant_id, property_id, name, max_adults, base_rate, active)
      VALUES (?, ?, 'Sea View Villa P4', 2, 10000, 1)
    `).run(tenantId, propId);
    roomTypeId = Number(rtRes.lastInsertRowid);

    const cRes = db.prepare(`
      INSERT INTO contacts (tenant_id, phone_e164, name, created_at, updated_at)
      VALUES (?, '+919822445566', 'Aarav Guest', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(tenantId);
    contactId = Number(cRes.lastInsertRowid);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    try {
      db.prepare("DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id = ?)").run(tenantId);
      db.prepare("DELETE FROM campaigns WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM whatsapp_messages WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM universal_transactions WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM quotes WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM booking_enquiries WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM crm_records WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM crm_pipelines WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM room_types WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM properties WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM contacts WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tenantId);
      db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);
    } catch (_) {}
  });

  test("1. CRM Pipeline stages, stage_key transitions, and canonical stage labels reconcile", async () => {
    const pipRes = await fetch(`${baseUrl}/api/v1/crm/pipelines`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(pipRes.status, 200);
    const pipelines = (await pipRes.json()).data;
    assert.ok(pipelines.length >= 1);
    const targetPipeline = pipelines[0];

    const createRecRes = await fetch(`${baseUrl}/api/v1/crm/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({
        pipelineId: targetPipeline.id,
        contactPhone: "919822445566",
        contactName: "Aarav Corp",
        stageKey: "PROSPECT",
        dealValue: 25000
      })
    });
    assert.equal(createRecRes.status, 201);
    const createdRec = (await createRecRes.json()).record;
    assert.ok(createdRec.stage_key);
    assert.ok(createdRec.stage_name);

    // Move stage using canonical stage_key via POST /records/:id/stage
    const stageMoveRes = await fetch(`${baseUrl}/api/v1/crm/records/${createdRec.id}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ stage_key: "WON" })
    });
    assert.equal(stageMoveRes.status, 200);
    const moved = (await stageMoveRes.json()).record;
    assert.equal(moved.stage_key, "WON");
    assert.equal(moved.status, "WON");
  });

  test("2. OWNER sees upcoming IST check-ins from both booking_enquiries and universal_transactions; multi-quote inflation prevented", async () => {
    const istDate = new Date(Date.now() + 330 * 60000 + 86400000).toISOString().split("T")[0];
    const istCheckout = new Date(Date.now() + 330 * 60000 + 2 * 86400000).toISOString().split("T")[0];

    const enqRes = db.prepare(`
      INSERT INTO booking_enquiries (tenant_id, property_id, contact_id, guest_name, phone_e164, check_in, check_out, status, room_type_id)
      VALUES (?, ?, ?, 'Aarav Checkin', '+919822445566', ?, ?, 'WON', ?)
    `).run(tenantId, propId, contactId, istDate, istCheckout, roomTypeId);
    const enquiryId = Number(enqRes.lastInsertRowid);

    // Insert 2 quotes for the same enquiry (older ₹10,000 + revised ₹12,500) -> ONLY latest ₹12,500 should count!
    db.prepare(`
      INSERT INTO quotes (tenant_id, enquiry_id, quote_number, currency, subtotal, tax_total, total, valid_until, status, created_by)
      VALUES (?, ?, 'Q-OLD-1', 'INR', 8928, 1072, 10000, '2026-12-31', 'SENT', 'admin')
    `).run(tenantId, enquiryId);
    db.prepare(`
      INSERT INTO quotes (tenant_id, enquiry_id, quote_number, currency, subtotal, tax_total, total, valid_until, status, created_by)
      VALUES (?, ?, 'Q-NEW-2', 'INR', 11160, 1340, 12500, '2026-12-31', 'SENT', 'admin')
    `).run(tenantId, enquiryId);

    // Also add 1 paid confirmed universal transaction (₹5,000) with future service_date
    db.prepare(`
      INSERT INTO universal_transactions (tenant_id, reference_code, transaction_type, source_channel, customer_phone, customer_name, service_date, subtotal_amount, tax_amount, grand_total, amount_paid, balance_due, payment_status, fulfillment_status, delete_status)
      VALUES (?, ?, 'BOOKING', 'INAPP_STUDIO', '+919822445566', 'Universal Studio Guest', ?, 4464, 536, 5000, 5000, 0, 'PAID', 'CONFIRMED', 0)
    `).run(tenantId, `UTX-P4-${Date.now()}`, istDate);

    // Verify OWNER dashboard summary (previously filtered out because role='USER' even with OWNER membership!)
    const dashRes = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(dashRes.status, 200);
    const dash = (await dashRes.json()).data;
    assert.equal(dash.upcoming_checkins.length, 2, "OWNER must see check-ins from both booking_enquiries and universal_transactions");
    assert.equal(dash.financial.quotes_won_revenue, 12500, "Must use latest quote per WON enquiry, not sum duplicates");
    assert.equal(dash.financial.universal_paid_revenue, 5000);
    assert.equal(dash.financial.won_revenue, 17500);

    // Verify Reports Overview Analytics reconciles exact same revenue numbers!
    const repRes = await fetch(`${baseUrl}/api/reports/overview`, {
      headers: { Authorization: `Bearer ${ownerToken}` }
    });
    assert.equal(repRes.status, 200);
    const rep = (await repRes.json()).data;
    assert.equal(rep.revenue.quotesWonInr, 12500);
    assert.equal(rep.revenue.universalTransactionsInr, 5000);
    assert.equal(rep.revenue.totalRevenueInr, 17500);
  });

  test("3. Campaign analytics delivery rate and subscription usage reconcile accurately", async () => {
    const campId = `cmp_p4_${Date.now()}`;
    db.prepare(`
      INSERT INTO campaigns (id, tenant_id, user_id, name, template_name, template_language, total_contacts, sent_count, failed_count, status, created_at)
      VALUES (?, ?, ?, 'Reconciliation Campaign', 'hello_world', 'en', 3, 2, 1, 'COMPLETED', UTC_TIMESTAMP())
    `).run(campId, tenantId, ownerUserId);

    db.prepare(`
      INSERT INTO campaign_recipients (campaign_id, phone_number, clean_phone, status, sent_at)
      VALUES (?, '+919822000001', '919822000001', 'DELIVERED', UTC_TIMESTAMP()),
             (?, '+919822000002', '919822000002', 'SENT', UTC_TIMESTAMP()),
             (?, '+919822000003', '919822000003', 'FAILED', UTC_TIMESTAMP())
    `).run(campId, campId, campId);

    const [repRes, subRes] = await Promise.all([
      fetch(`${baseUrl}/api/reports/overview`, { headers: { Authorization: `Bearer ${ownerToken}` } }),
      fetch(`${baseUrl}/api/v1/billing/subscription`, { headers: { Authorization: `Bearer ${ownerToken}` } })
    ]);
    assert.equal(repRes.status, 200);
    assert.equal(subRes.status, 200);
    const rep = (await repRes.json()).data;
    const sub = (await subRes.json()).data;

    // Tracked delivered is 1 out of 2 sent (50.0%), NOT falsely 100%
    assert.equal(rep.actualDelivered, 1);
    assert.equal(rep.totalSent, 2);
    assert.equal(rep.deliveryRate, "50.0%");

    // Subscription usage includes campaign dispatched messages (2 SENT/DELIVERED) & matches report snapshot
    assert.equal(sub.usage.campaignMessagesUsed, 2);
    assert.equal(sub.usage.messagesUsed, rep.subscriptionUsage.messagesUsed);
  });
});
