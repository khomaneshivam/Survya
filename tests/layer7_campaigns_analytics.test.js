const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");

const config = require("../src/config/env");
const { db, initializeDatabase } = require("../src/config/database");
const apiRoutes = require("../src/routes/apiRoutes");
const broadcastEngine = require("../src/services/broadcastEngine");
const schedulerService = require("../src/services/schedulerService");
const flowService = require("../src/services/conversationFlowService");

describe("Layer 7: Campaigns, Delivery Shield, Retention Jobs & Verified Analytics", () => {
  const TENANT_A = 9701;
  const TENANT_B = 9702;
  const USER_A_ADMIN = "usr_l7_admin_a";
  const USER_A_EMP = "usr_l7_emp_a";
  const USER_B_ADMIN = "usr_l7_admin_b";
  const PHONE_LINE_A = "9701000001";
  const PHONE_LINE_B = "9702000001";

  const PHONE_ACTIVE = "919701000011";
  const PHONE_SUPPRESSED = "919701000012";
  const PHONE_REVOKED = "919701000013";
  const PHONE_COOLED = "919701000014";
  const TEST_PHONES = [PHONE_ACTIVE, PHONE_SUPPRESSED, PHONE_REVOKED, PHONE_COOLED];

  let apiServer = null;
  let apiBaseUrl = "";
  let mockMetaServer = null;
  let origMetaUrl = config.META_API_URL;
  const mockMetaRequests = [];

  let tokenAdminA = "";
  let tokenEmpA = "";
  let tokenAdminB = "";

  const createdCampaignIds = [];

  function cleanup() {
    for (const cId of createdCampaignIds) {
      try { db.prepare("DELETE FROM campaign_recipients WHERE campaign_id = ?").run(cId); } catch {}
      try { db.prepare("DELETE FROM campaigns WHERE id = ?").run(cId); } catch {}
    }
    try { db.prepare("DELETE FROM campaign_recipients WHERE campaign_id IN (SELECT id FROM campaigns WHERE tenant_id IN (?, ?))").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM campaigns WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM workflow_scheduled_jobs WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM conversation_flow_events WHERE session_id IN (SELECT id FROM conversation_flow_sessions WHERE tenant_id IN (?, ?))").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM conversation_flow_sessions WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id IN (SELECT id FROM conversation_flows WHERE tenant_id IN (?, ?))").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM conversation_flows WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM contact_consents WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM contacts WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM universal_transactions WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM unified_orders WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM quotes WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM whatsapp_usage_ledger WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM ai_interaction_logs WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM business_entities WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    try { db.prepare("DELETE FROM waba_phone_numbers WHERE tenant_id IN (?, ?)").run(TENANT_A, TENANT_B); } catch {}
    for (const p of TEST_PHONES) {
      try { db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(p); } catch {}
      try { db.prepare("DELETE FROM contact_marketing_cooldowns WHERE phone_e164 = ?").run(p); } catch {}
    }
    try { db.prepare("DELETE FROM users WHERE id IN (?, ?, ?)").run(USER_A_ADMIN, USER_A_EMP, USER_B_ADMIN); } catch {}
    try { db.prepare("DELETE FROM templates WHERE name IN ('l7_mkt_promo', 'l7_util_receipt')").run(); } catch {}
  }

  before(async () => {
    initializeDatabase();
    cleanup();

    // Seed users
    const upsertUser = db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, 'hash', ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE tenant_id = VALUES(tenant_id), role = VALUES(role), status = 'ACTIVE'
    `);
    upsertUser.run(USER_A_ADMIN, TENANT_A, "Admin A", "l7_admin_a@test.internal", "919701000001", "ADMIN");
    upsertUser.run(USER_A_EMP, TENANT_A, "Employee A", "l7_emp_a@test.internal", "919701000002", "USER");
    upsertUser.run(USER_B_ADMIN, TENANT_B, "Admin B", "l7_admin_b@test.internal", "919702000001", "ADMIN");

    tokenAdminA = jwt.sign({ userId: USER_A_ADMIN, tenantId: TENANT_A, role: "ADMIN" }, config.JWT_SECRET, { expiresIn: "1h" });
    tokenEmpA = jwt.sign({ userId: USER_A_EMP, tenantId: TENANT_A, role: "USER" }, config.JWT_SECRET, { expiresIn: "1h" });
    tokenAdminB = jwt.sign({ userId: USER_B_ADMIN, tenantId: TENANT_B, role: "ADMIN" }, config.JWT_SECRET, { expiresIn: "1h" });

    // Seed WABA lines per tenant with dummy tokens (never real numbers/tokens)
    db.prepare(`
      INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, status, is_default, access_token)
      VALUES
        ('waba_l7_a', ?, 'Tenant A Line', '+919701000001', ?, 'waba_9701', 'CONNECTED', 1, 'dummy_token_a'),
        ('waba_l7_b', ?, 'Tenant B Line', '+919702000001', ?, 'waba_9702', 'CONNECTED', 1, 'dummy_token_b')
    `).run(TENANT_A, PHONE_LINE_A, TENANT_B, PHONE_LINE_B);

    // Seed templates (one MARKETING, one UTILITY)
    db.prepare(`
      INSERT INTO templates (id, name, category, language, status, components, updated_at)
      VALUES
        ('tpl_l7_mkt', 'l7_mkt_promo', 'MARKETING', 'en', 'APPROVED', '[{"type":"BODY","text":"Hello {{1}}"}]', UTC_TIMESTAMP()),
        ('tpl_l7_util', 'l7_util_receipt', 'UTILITY', 'en', 'APPROVED', '[{"type":"BODY","text":"Receipt for {{1}}"}]', UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE category = VALUES(category), status = 'APPROVED'
    `).run();

    // Start isolated local loopback mock Meta server (strict zero external calls)
    mockMetaServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          mockMetaRequests.push({ url: req.url, body: JSON.parse(body || "{}") });
        } catch {
          mockMetaRequests.push({ url: req.url, body });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: `wamid.MOCK_L7_${Date.now()}_${mockMetaRequests.length}` }]
        }));
      });
    });
    await new Promise(resolve => mockMetaServer.listen(0, "127.0.0.1", resolve));
    const mockPort = mockMetaServer.address().port;
    config.META_API_URL = `http://127.0.0.1:${mockPort}`;

    // Start API server
    const app = express();
    app.use(express.json());
    app.use("/api", apiRoutes);
    apiServer = http.createServer(app);
    await new Promise(resolve => apiServer.listen(0, "127.0.0.1", resolve));
    apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}`;
  });

  after(() => {
    config.META_API_URL = origMetaUrl;
    if (apiServer) apiServer.close();
    if (mockMetaServer) mockMetaServer.close();
    cleanup();
  });

  test("1. Strict cross-tenant campaign isolation & workspace RBAC enforcement", async () => {
    // Admin A creates campaign in Tenant A
    const createRes = await fetch(`${apiBaseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdminA}` },
      body: JSON.stringify({
        name: "Tenant A Secret Launch",
        messageType: "TEMPLATE",
        templateName: "l7_mkt_promo",
        templateLanguage: "en",
        phoneId: PHONE_LINE_A,
        contacts: [
          { phone: PHONE_ACTIVE, name: "Active Lead" }
        ]
      })
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    const campId = createData.data.id;
    createdCampaignIds.push(campId);
    assert.equal(Number(createData.data.tenant_id), TENANT_A);

    // Employee A creates own campaign in Tenant A
    const empCreate = await fetch(`${apiBaseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenEmpA}` },
      body: JSON.stringify({
        name: "Employee A Followup",
        messageType: "TEXT",
        messageBody: "Hello {{name}}",
        phoneId: PHONE_LINE_A,
        contacts: [{ phone: PHONE_ACTIVE, name: "Active Lead" }]
      })
    });
    assert.equal(empCreate.status, 201);
    const empCampId = (await empCreate.json()).data.id;
    createdCampaignIds.push(empCampId);

    // Tenant A Admin sees both Tenant A campaigns; Employee A sees only Employee A's campaign
    const listAdminA = await (await fetch(`${apiBaseUrl}/api/campaigns`, { headers: { Authorization: `Bearer ${tokenAdminA}` } })).json();
    assert.equal(listAdminA.data.length, 2);

    const listEmpA = await (await fetch(`${apiBaseUrl}/api/campaigns`, { headers: { Authorization: `Bearer ${tokenEmpA}` } })).json();
    assert.equal(listEmpA.data.length, 1);
    assert.equal(listEmpA.data[0].id, empCampId);

    // Employee A cannot view/delete Admin A's campaign
    const empReadAdminCamp = await fetch(`${apiBaseUrl}/api/campaigns/${campId}`, { headers: { Authorization: `Bearer ${tokenEmpA}` } });
    assert.equal(empReadAdminCamp.status, 403);

    // Tenant B Admin cannot list, inspect, modify, export, or delete Tenant A's campaign
    const listAdminB = await (await fetch(`${apiBaseUrl}/api/campaigns`, { headers: { Authorization: `Bearer ${tokenAdminB}` } })).json();
    assert.equal(listAdminB.data.length, 0);

    for (const [method, path, body] of [
      ["GET", `/api/campaigns/${campId}`],
      ["GET", `/api/campaigns/${campId}/export`],
      ["POST", `/api/campaigns/${campId}/start`, { delayMs: 50 }],
      ["POST", `/api/campaigns/${campId}/pause`, {}],
      ["POST", `/api/campaigns/${campId}/reschedule`, { scheduledAt: new Date(Date.now() + 3600_000).toISOString() }],
      ["DELETE", `/api/campaigns/${campId}`]
    ]) {
      const r = await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdminB}` },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      assert.equal(r.status, 403, `Expected 403 for cross-tenant ${method} ${path}, got ${r.status}`);
    }

    // Tenant B Admin cannot create campaign using Tenant A's WABA phone line
    const hijackRes = await fetch(`${apiBaseUrl}/api/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdminB}` },
      body: JSON.stringify({
        name: "Cross Tenant Line Spoof",
        messageType: "TEXT",
        messageBody: "Test",
        phoneId: PHONE_LINE_A,
        contacts: [{ phone: PHONE_ACTIVE, name: "Active Lead" }]
      })
    });
    assert.equal(hijackRes.status, 403);
  });

  test("2. Delivery Shield skips suppressed, DPDP-revoked consent, and 131049 cooled leads on MARKETING, while permitting UTILITY", async () => {
    mockMetaRequests.length = 0;

    // 1. Seed suppression, revoked consent (DPDP), and 131049 cooldown
    db.prepare("INSERT INTO contact_suppressions (clean_phone, reason, created_at) VALUES (?, 'STOP', UTC_TIMESTAMP())").run(PHONE_SUPPRESSED);

    const revContact = db.prepare(`
      INSERT INTO contacts (tenant_id, phone_e164, name, source, created_at, updated_at)
      VALUES (?, ?, 'Revoked User', 'test', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, `+${PHONE_REVOKED}`);
    db.prepare(`
      INSERT INTO contact_consents (tenant_id, contact_id, purpose, status, source, captured_at, revoked_at)
      VALUES (?, ?, 'MARKETING', 'REVOKED', 'WHATSAPP_STOP', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, revContact.lastInsertRowid);

    db.prepare(`
      INSERT INTO contact_marketing_cooldowns (tenant_id, phone_e164, phone_number_id, error_code, reason, cooldown_until, created_at, updated_at)
      VALUES (?, ?, ?, '131049', 'Meta Marketing Cap (131049)', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, PHONE_COOLED, PHONE_LINE_A);

    // 2. Insert MARKETING campaign directly with all 4 recipients (simulating list present at dispatch time)
    const mktCampId = "camp_l7_mkt_" + Date.now();
    createdCampaignIds.push(mktCampId);
    db.prepare(`
      INSERT INTO campaigns (
        id, tenant_id, name, total_contacts, valid_contacts, invalid_contacts,
        sent_count, failed_count, status, message_type, template_name, template_language,
        mapping_config, delay_ms, user_id, phone_number_id, created_at
      ) VALUES (?, ?, 'L7 Shield MKT', 4, 4, 0, 0, 0, 'DRAFT', 'TEMPLATE', 'l7_mkt_promo', 'en', '{}', 50, ?, ?, UTC_TIMESTAMP())
    `).run(mktCampId, TENANT_A, USER_A_ADMIN, PHONE_LINE_A);

    const insRec = db.prepare(`
      INSERT INTO campaign_recipients (campaign_id, phone_number, clean_phone, contact_name, raw_data, status)
      VALUES (?, ?, ?, ?, ?, 'PENDING')
    `);
    for (const [phone, label] of [
      [PHONE_ACTIVE, "Active"],
      [PHONE_SUPPRESSED, "Suppressed"],
      [PHONE_REVOKED, "Revoked"],
      [PHONE_COOLED, "Cooled"]
    ]) {
      insRec.run(mktCampId, phone, phone, label, JSON.stringify({ name: label }));
    }

    await broadcastEngine.startCampaign(mktCampId, 50, { overrideQuietHours: true });

    // Wait briefly until runQueue completes (<= 3s)
    for (let i = 0; i < 40; i++) {
      const c = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(mktCampId);
      if (c && c.status === "COMPLETED") break;
      await new Promise(r => setTimeout(r, 75));
    }

    const mktCamp = db.prepare("SELECT status, sent_count, failed_count FROM campaigns WHERE id = ?").get(mktCampId);
    assert.equal(mktCamp.status, "COMPLETED");
    assert.equal(Number(mktCamp.sent_count), 1, "Only the active contact should be dispatched");
    assert.equal(Number(mktCamp.failed_count), 3, "Suppressed, revoked, and 131049 cooled contacts must be skipped");

    const recStatuses = db.prepare("SELECT clean_phone, status, error_code FROM campaign_recipients WHERE campaign_id = ?").all(mktCampId);
    const byPhone = Object.fromEntries(recStatuses.map(r => [r.clean_phone, r]));
    assert.equal(byPhone[PHONE_ACTIVE].status, "SENT");
    assert.equal(byPhone[PHONE_SUPPRESSED].error_code, "SUPPRESSED_OPT_OUT");
    assert.equal(byPhone[PHONE_REVOKED].error_code, "CONSENT_REVOKED");
    assert.equal(byPhone[PHONE_COOLED].error_code, "131049_COOLDOWN");
    assert.equal(mockMetaRequests.length, 1);
    assert.equal(mockMetaRequests[0].body.to, PHONE_ACTIVE);

    // 3. UTILITY template permits delivery to 131049 cooled & marketing-only-revoked contacts
    mockMetaRequests.length = 0;
    const utilCampId = "camp_l7_util_" + Date.now();
    createdCampaignIds.push(utilCampId);
    db.prepare(`
      INSERT INTO campaigns (
        id, tenant_id, name, total_contacts, valid_contacts, invalid_contacts,
        sent_count, failed_count, status, message_type, template_name, template_language,
        mapping_config, delay_ms, user_id, phone_number_id, created_at
      ) VALUES (?, ?, 'L7 Shield UTIL', 2, 2, 0, 0, 0, 'DRAFT', 'TEMPLATE', 'l7_util_receipt', 'en', '{}', 50, ?, ?, UTC_TIMESTAMP())
    `).run(utilCampId, TENANT_A, USER_A_ADMIN, PHONE_LINE_A);
    insRec.run(utilCampId, PHONE_COOLED, PHONE_COOLED, "Cooled Utility", JSON.stringify({ name: "Cooled Utility" }));
    insRec.run(utilCampId, PHONE_REVOKED, PHONE_REVOKED, "Revoked Utility", JSON.stringify({ name: "Revoked Utility" }));

    await broadcastEngine.startCampaign(utilCampId, 50, { overrideQuietHours: true });
    for (let i = 0; i < 40; i++) {
      const c = db.prepare("SELECT status FROM campaigns WHERE id = ?").get(utilCampId);
      if (c && c.status === "COMPLETED") break;
      await new Promise(r => setTimeout(r, 75));
    }
    const utilCamp = db.prepare("SELECT sent_count, failed_count FROM campaigns WHERE id = ?").get(utilCampId);
    assert.equal(Number(utilCamp.sent_count), 2, "UTILITY receipt permits delivery despite marketing cooldown & marketing-only consent revocation");
    assert.equal(mockMetaRequests.length, 2);
  });

  test("3. UTC retention scheduler processes due WAIT_DELAY jobs, respects revoked consent, and blocks >24h free-form messages", async () => {
    const flowCreate = flowService.createFlow({
      tenant_id: TENANT_A,
      name: "L7 Retention Flow",
      description: "Scheduler resume verification",
      category: "GENERAL",
      nodes: [
        { id: "n_trig", type: "TRIGGER_WHATSAPP", title: "Start", config: {} },
        { id: "n_wait", type: "WAIT_DELAY", title: "Delay Step", config: { delayMinutes: 5 } },
        { id: "n_resume", type: "SEND_MESSAGE", title: "Retention Ping", config: { text: "Welcome back!" } }
      ],
      transitions: [
        { id: "t1", source: "n_trig", target: "n_wait", handle: "default" },
        { id: "t2", source: "n_wait", target: "n_resume", handle: "default" }
      ],
      variables: {}
    }, { id: USER_A_ADMIN, name: "Admin A" });
    flowService.publishFlow(flowCreate.flow.id, { id: USER_A_ADMIN, name: "Admin A" }, TENANT_A);

    const published = db.prepare("SELECT published_version_id FROM conversation_flows WHERE id = ?").get(flowCreate.flow.id);

    // 3 sessions: fresh active, revoked consent, expired 24h window
    const insSess = db.prepare(`
      INSERT INTO conversation_flow_sessions (
        tenant_id, flow_id, flow_version_id, session_key, sender_phone, current_node_id,
        session_status, collected_data_json, last_interaction_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'n_trig', 'ACTIVE', '{}', ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `);
    const freshTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
    const staleTs = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

    const sOk = insSess.run(TENANT_A, flowCreate.flow.id, published.published_version_id, "l7_ok_" + Date.now(), PHONE_ACTIVE, freshTs).lastInsertRowid;
    const sRev = insSess.run(TENANT_A, flowCreate.flow.id, published.published_version_id, "l7_rev_" + Date.now(), PHONE_REVOKED, freshTs).lastInsertRowid;
    const s24h = insSess.run(TENANT_A, flowCreate.flow.id, published.published_version_id, "l7_24h_" + Date.now(), PHONE_COOLED, staleTs).lastInsertRowid;

    const insJob = db.prepare(`
      INSERT INTO workflow_scheduled_jobs (tenant_id, session_id, flow_id, resume_node_id, resume_handle, job_type, run_at, status, attempts, created_at, updated_at)
      VALUES (?, ?, ?, 'n_wait', 'default', 'WAIT_DELAY', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE), 'PENDING', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `);
    const jOk = insJob.run(TENANT_A, sOk, flowCreate.flow.id).lastInsertRowid;
    const jRev = insJob.run(TENANT_A, sRev, flowCreate.flow.id).lastInsertRowid;
    const j24h = insJob.run(TENANT_A, s24h, flowCreate.flow.id).lastInsertRowid;

    await schedulerService.checkWorkflowScheduledJobs();

    const rOk = db.prepare("SELECT status FROM workflow_scheduled_jobs WHERE id = ?").get(jOk);
    const rRev = db.prepare("SELECT status, last_error FROM workflow_scheduled_jobs WHERE id = ?").get(jRev);
    const r24h = db.prepare("SELECT status, last_error FROM workflow_scheduled_jobs WHERE id = ?").get(j24h);

    assert.equal(rOk.status, "COMPLETED");
    assert.equal(rRev.status, "CANCELLED");
    assert.ok(rRev.last_error.includes("revoked consent"));
    assert.equal(r24h.status, "FAILED");
    assert.ok(r24h.last_error.includes("WINDOW_CLOSED_24H"));
  });

  test("4. Overview analytics computes real DB-derived tenant-isolated revenue, costs, net contribution & funnel", async () => {
    // Seed Tenant A financial records
    db.prepare(`
      INSERT INTO universal_transactions (tenant_id, reference_code, transaction_type, source_channel, customer_phone, grand_total, amount_paid, currency, payment_status, created_at, updated_at)
      VALUES (?, 'REF_L7_A1', 'BOOKING', 'WHATSAPP', ?, 2500, 2500, 'INR', 'PAID', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, PHONE_ACTIVE);

    const entityRes = db.prepare(`
      INSERT INTO business_entities (tenant_id, domain, name, slug, phone_e164, city, status, currency, timezone, created_at, updated_at)
      VALUES (?, 'RETAIL', 'L7 Analytics Entity', ?, '+919701000001', 'Mumbai', 'ACTIVE', 'INR', 'Asia/Kolkata', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, 'l7-analytics-' + Date.now());

    db.prepare(`
      INSERT INTO unified_orders (tenant_id, entity_id, order_number, domain, customer_name, customer_phone, subtotal, tax_total, grand_total, currency, order_status, payment_status, created_at, updated_at)
      VALUES (?, ?, 'ORD_L7_A1', 'RETAIL', 'Active Lead', ?, 1500, 0, 1500, 'INR', 'CONFIRMED', 'PAID', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, entityRes.lastInsertRowid, PHONE_ACTIVE);

    db.prepare(`
      INSERT INTO quotes (tenant_id, enquiry_id, quote_number, currency, subtotal, tax_total, total, valid_until, status, created_by, created_at, updated_at)
      VALUES (?, 999888, 'QT_L7_A1', 'INR', 800, 0, 800, '2026-12-31', 'WON', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_A, USER_A_ADMIN);

    db.prepare(`
      INSERT INTO whatsapp_usage_ledger (tenant_id, recipient_phone, category, unit_cost, currency, billing_status, created_at)
      VALUES
        (?, ?, 'MARKETING', 0.8631, 'INR', 'RECORDED', UTC_TIMESTAMP()),
        (?, ?, 'MARKETING', 0, 'INR', 'WAIVED', UTC_TIMESTAMP())
    `).run(TENANT_A, PHONE_ACTIVE, TENANT_A, PHONE_COOLED);

    db.prepare(`
      INSERT INTO ai_interaction_logs (tenant_id, sender_phone, input_type, user_input, ai_reply, tokens_prompt, tokens_completion, tokens_total, estimated_cost_inr, created_at)
      VALUES (?, ?, 'TEXT', 'Hi', 'Hello! How can I help?', 300, 120, 420, 0.125, UTC_TIMESTAMP())
    `).run(TENANT_A, PHONE_ACTIVE);

    // Foreign Tenant B record that must NOT leak into Tenant A analytics
    db.prepare(`
      INSERT INTO universal_transactions (tenant_id, reference_code, transaction_type, source_channel, customer_phone, grand_total, amount_paid, currency, payment_status, created_at, updated_at)
      VALUES (?, 'REF_L7_B1', 'ORDER', 'WHATSAPP', '919702000099', 10000, 10000, 'INR', 'PAID', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(TENANT_B);

    const ovResA = await fetch(`${apiBaseUrl}/api/reports/overview`, {
      headers: { Authorization: `Bearer ${tokenAdminA}` }
    });
    assert.equal(ovResA.status, 200);
    const bodyA = await ovResA.json();
    assert.equal(bodyA.success, true);

    assert.equal(bodyA.data.revenue.universalTransactionsInr, 2500);
    assert.equal(bodyA.data.revenue.unifiedOrdersInr, 1500);
    assert.equal(bodyA.data.revenue.quotesWonInr, 800);
    assert.equal(bodyA.data.revenue.totalRevenueInr, 4800);
    assert.equal(bodyA.data.revenue.paidConversions, 3);

    assert.equal(bodyA.data.costs.whatsappCostInr, 0.8631);
    assert.equal(bodyA.data.costs.aiCostInr, 0.125);
    assert.equal(bodyA.data.costs.totalCostInr, 0.9881);
    assert.equal(bodyA.data.costs.billedMessages, 1);
    assert.equal(bodyA.data.costs.waivedMessages, 1);
    assert.equal(bodyA.data.costs.aiTokensTotal, 420);
    assert.equal(bodyA.data.financials.netContributionInr, 4799.01);

    // Tenant B sees ONLY Tenant B's 10000 INR revenue and 0 WhatsApp/AI cost
    const ovResB = await fetch(`${apiBaseUrl}/api/reports/overview`, {
      headers: { Authorization: `Bearer ${tokenAdminB}` }
    });
    assert.equal(ovResB.status, 200);
    const bodyB = await ovResB.json();
    assert.equal(bodyB.data.revenue.totalRevenueInr, 10000);
    assert.equal(bodyB.data.costs.totalCostInr, 0);
  });
});
