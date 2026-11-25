const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");

describe("Multi-Tenant Data Ownership & Account Isolation Test Suite", () => {
  let server;
  let baseUrl;

  let adminUser;
  let adminToken;

  let freshUserA;
  let tokenA;

  let freshUserB;
  let tokenB;

  const testTimestamp = Date.now();
  let createdEnquiryId;
  let createdEntityId;
  let prevFlowsEnabled = null;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const { getSetting, setSetting } = require("../src/config/database");
    prevFlowsEnabled = getSetting("WHATSAPP_FLOWS_ENABLED");
    setSetting("WHATSAPP_FLOWS_ENABLED", "true");

    const hash = bcrypt.hashSync("SecurePass123!", 8);

    // 1. Setup Admin
    const adminId = `admin_iso_${testTimestamp}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Platform Admin', ?, '919100000001', ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_iso_${testTimestamp}@test.local`, hash);
    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    adminToken = jwt.sign(
      { id: adminUser.id, userId: adminUser.id, email: adminUser.email, role: "ADMIN", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Setup Fresh User A
    const userAId = `user_a_${testTimestamp}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Alice Owner', ?, '919100000002', ?, 'USER', 'ACTIVE', 1)
    `).run(userAId, `alice_${testTimestamp}@test.local`, hash);
    freshUserA = db.prepare("SELECT * FROM users WHERE id = ?").get(userAId);
    tokenA = jwt.sign(
      { id: freshUserA.id, userId: freshUserA.id, email: freshUserA.email, role: "USER", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Setup Fresh User B
    const userBId = `user_b_${testTimestamp}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Bob Isolated', ?, '919100000003', ?, 'USER', 'ACTIVE', 1)
    `).run(userBId, `bob_${testTimestamp}@test.local`, hash);
    freshUserB = db.prepare("SELECT * FROM users WHERE id = ?").get(userBId);
    tokenB = jwt.sign(
      { id: freshUserB.id, userId: freshUserB.id, email: freshUserB.email, role: "USER", tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    try {
      const { setSetting } = require("../src/config/database");
      if (prevFlowsEnabled !== null && prevFlowsEnabled !== undefined) {
        setSetting("WHATSAPP_FLOWS_ENABLED", prevFlowsEnabled);
      } else {
        setSetting("WHATSAPP_FLOWS_ENABLED", "false");
      }
    } catch (_) {}
    if (server) server.close();
  });

  test("1. Brand new User A starts with 0 enquiries and 0 pipeline value", async () => {
    const res = await fetch(`${baseUrl}/api/v1/enquiries`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.total, 0, "New account should have 0 total enquiries");
    assert.deepEqual(body.enquiries, [], "New account enquiries array must be empty");

    // Dashboard summary
    const dashRes = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(dashRes.status, 200);
    const dash = await dashRes.json();
    assert.equal(dash.data.counts.TOTAL, 0, "Dashboard TOTAL enquiries must be 0");
    assert.equal(dash.data.financial.pipeline_value, 0, "Pipeline value must be 0");
    assert.equal(dash.data.recent_enquiries.length, 0, "Recent enquiries must be empty");
  });

  test("2. Brand new User A starts with 0 contacts", async () => {
    const res = await fetch(`${baseUrl}/api/v1/contacts`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.data, [], "New account contacts must be empty");
  });

  test("3. Brand new User A starts with 0 campaigns and 0 reports", async () => {
    const campRes = await fetch(`${baseUrl}/api/campaigns`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(campRes.status, 200);
    const campBody = await campRes.json();
    assert.equal(campBody.success, true);
    assert.deepEqual(campBody.data, [], "New account campaigns must be empty");

    const repRes = await fetch(`${baseUrl}/api/reports/overview`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(repRes.status, 200);
    const repBody = await repRes.json();
    assert.equal(repBody.data.totalBroadcasts, 0, "Reports overview broadcasts must be 0");
    assert.equal(repBody.data.totalRecipients, 0, "Reports overview recipients must be 0");
  });

  test("4. Brand new User A starts with 0 inbox replies and 0 chat links", async () => {
    const inboxRes = await fetch(`${baseUrl}/api/inbox/replies`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(inboxRes.status, 200);
    const inboxBody = await inboxRes.json();
    assert.deepEqual(inboxBody.replies, [], "Inbox replies must be empty");

    const linkRes = await fetch(`${baseUrl}/api/v1/chat-links`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(linkRes.status, 200);
    const linkBody = await linkRes.json();
    assert.equal(linkBody.data.length, 0, "Chat links must be empty");
  });

  test("5. Brand new User A starts with 0 flows and 0 flow responses", async () => {
    const flowRes = await fetch(`${baseUrl}/api/flows`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(flowRes.status, 200);
    const flowBody = await flowRes.json();
    assert.deepEqual(flowBody.data, [], "New user must not inherit foreign flows");

    const respRes = await fetch(`${baseUrl}/api/flows/responses`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(respRes.status, 200);
    const respBody = await respRes.json();
    assert.deepEqual(respBody.data, [], "Flow responses must be empty");
  });

  test("6. Brand new User A starts with 0 business entities and 0 usage", async () => {
    const entRes = await fetch(`${baseUrl}/api/v1/entities`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(entRes.status, 200);
    const entBody = await entRes.json();
    assert.deepEqual(entBody.entities, [], "Business entities must be isolated to user");

    const usageRes = await fetch(`${baseUrl}/api/v1/whatsapp/usage`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(usageRes.status, 200);
    const usageBody = await usageRes.json();
    assert.equal(usageBody.totals.messages, 0, "Usage messages must be 0");
  });

  test("7. User A creates an enquiry and business entity; User A sees 1, while User B STILL sees 0", async () => {
    // User A creates an enquiry
    const enqRes = await fetch(`${baseUrl}/api/v1/enquiries`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        guest_name: "Alice Guest",
        phone: "919999888811",
        check_in: "2026-12-01",
        check_out: "2026-12-03",
        adults: 2
      })
    });
    assert.equal(enqRes.status, 201);
    const enqBody = await enqRes.json();
    createdEnquiryId = enqBody.data.id;
    assert.ok(createdEnquiryId);

    // User A creates an entity
    const entRes = await fetch(`${baseUrl}/api/v1/entities`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Alice Boutique Stay",
        domain: "HOSPITALITY",
        phone_e164: "+919999888811",
        city: "Goa"
      })
    });
    assert.equal(entRes.status, 201);
    const entBody = await entRes.json();
    createdEntityId = entBody.entity.id;
    assert.ok(createdEntityId);

    // Verify User A now sees 1 enquiry
    const listARes = await fetch(`${baseUrl}/api/v1/enquiries`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const listA = await listARes.json();
    assert.equal(listA.total, 1);
    assert.equal(listA.enquiries[0].guest_name, "Alice Guest");

    // Verify User A now sees 1 entity
    const entARes = await fetch(`${baseUrl}/api/v1/entities`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const entA = await entARes.json();
    assert.equal(entA.entities.length, 1);
    assert.equal(entA.entities[0].name, "Alice Boutique Stay");

    // CRITICAL ISOLATION CHECK: Verify User B STILL sees 0 enquiries and 0 entities!
    const listBRes = await fetch(`${baseUrl}/api/v1/enquiries`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const listB = await listBRes.json();
    assert.equal(listB.total, 0, "User B must NOT see User A's enquiry");
    assert.deepEqual(listB.enquiries, [], "User B enquiries must be empty");

    const entBRes = await fetch(`${baseUrl}/api/v1/entities`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const entB = await entBRes.json();
    assert.deepEqual(entB.entities, [], "User B must NOT see User A's entity");
  });

  test("8. Cross-account unauthorized access attempts are blocked with 403 Forbidden", async () => {
    // User B attempts to read User A's enquiry
    const getEnqRes = await fetch(`${baseUrl}/api/v1/enquiries/${createdEnquiryId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(getEnqRes.status, 403, "User B should be blocked from reading User A's enquiry");

    // User B attempts to update User A's enquiry
    const patchEnqRes = await fetch(`${baseUrl}/api/v1/enquiries/${createdEnquiryId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: "QUALIFIED" })
    });
    assert.equal(patchEnqRes.status, 403, "User B should be blocked from updating User A's enquiry");

    // User B attempts to read User A's business entity
    const getEntRes = await fetch(`${baseUrl}/api/v1/entities/${createdEntityId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(getEntRes.status, 403, "User B should be blocked from reading User A's entity");
  });

  test("9. Platform Admin retains full cross-workspace oversight", async () => {
    // Admin can see User A's enquiry
    const adminEnqRes = await fetch(`${baseUrl}/api/v1/enquiries/${createdEnquiryId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminEnqRes.status, 200);
    const adminEnq = await adminEnqRes.json();
    assert.equal(adminEnq.data.id, createdEnquiryId);

    // Admin can see User A's entity in entities list
    const adminEntRes = await fetch(`${baseUrl}/api/v1/entities`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(adminEntRes.status, 200);
    const adminEnt = await adminEntRes.json();
    assert.ok(adminEnt.entities.length >= 2, "Admin sees all entities across workspace");
  });

  test("10. Multi-Tenant Workspace Owner Authority vs Cross-Tenant Isolation across Resort, Catalog & Connect", async () => {
    const tTs = Date.now();
    const tAInfo = db.prepare(`INSERT INTO tenants (name, slug, status) VALUES (?, ?, 'ACTIVE')`).run(`Owner Tenant A ${tTs}`, `owner-a-${tTs}`);
    const tBInfo = db.prepare(`INSERT INTO tenants (name, slug, status) VALUES (?, ?, 'ACTIVE')`).run(`Owner Tenant B ${tTs}`, `owner-b-${tTs}`);
    const tidA = Number(tAInfo.lastInsertRowid);
    const tidB = Number(tBInfo.lastInsertRowid);

    const ownerAId = `own_a_${tTs}`;
    const empAId = `emp_a_${tTs}`;
    const ownerBId = `own_b_${tTs}`;
    const wabaIdA = `waba_iso_a_${tTs}`;
    const msgIdA = `msg_iso_a_${tTs}`;
    let entIdA = null;
    let itemIdA = null;

    try {
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'Clinic Owner A', ?, '9191110001', 'h', 'USER', 'ACTIVE')`).run(ownerAId, tidA, `own_a_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')`).run(ownerAId, tidA);
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'Clinic Emp A', ?, '9191110002', 'h', 'USER', 'ACTIVE')`).run(empAId, tidA, `emp_a_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'USER')`).run(empAId, tidA);
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'Retail Owner B', ?, '9191110003', 'h', 'USER', 'ACTIVE')`).run(ownerBId, tidB, `own_b_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')`).run(ownerBId, tidB);

      db.prepare(`
        INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, is_default, status)
        VALUES (?, ?, 'Tenant A Desk Line', '9191110001', ?, ?, 1, 'CONNECTED')
      `).run(wabaIdA, tidA, `pn_${tTs}`, `waba_${tTs}`);
      db.prepare(`
        INSERT INTO whatsapp_messages (id, tenant_id, user_id, phone_number_id, recipient_phone, direction, message_type, message_body, status)
        VALUES (?, ?, ?, ?, '919900001122', 'OUTBOUND', 'TEXT', 'Confidential Patient Info', 'SENT')
      `).run(msgIdA, tidA, empAId, `pn_${tTs}`);

      const tokOwnerA = jwt.sign({ userId: ownerAId, role: "USER", tenantId: tidA }, config.JWT_SECRET, { expiresIn: "1h" });
      const tokEmpA = jwt.sign({ userId: empAId, role: "USER", tenantId: tidA }, config.JWT_SECRET, { expiresIn: "1h" });
      const tokOwnerB = jwt.sign({ userId: ownerBId, role: "USER", tenantId: tidB }, config.JWT_SECRET, { expiresIn: "1h" });

      // Employee creates an enquiry & entity in Tenant A -> Workspace Owner A sees both despite role === 'USER'
      const empEnqRes = await fetch(`${baseUrl}/api/v1/enquiries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ guest_name: "Patient Via Emp", phone: "919988112200", check_in: "2026-12-10", check_out: "2026-12-11", adults: 1 })
      });
      assert.equal(empEnqRes.status, 201);
      const empEnqId = (await empEnqRes.json()).data.id;

      const ownerGetEnq = await fetch(`${baseUrl}/api/v1/enquiries/${empEnqId}`, { headers: { Authorization: `Bearer ${tokOwnerA}` } });
      assert.equal(ownerGetEnq.status, 200, "Workspace Owner must read team enquiries inside own tenant");

      const empEntRes = await fetch(`${baseUrl}/api/v1/entities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Emp Created Branch", domain: "CLINIC", phone_e164: "+9191110002", city: "Mumbai" })
      });
      assert.equal(empEntRes.status, 201);
      entIdA = (await empEntRes.json()).entity.id;

      const empItemRes = await fetch(`${baseUrl}/api/v1/entities/${entIdA}/items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Consultation", base_price: 500, item_type: "SERVICE" })
      });
      assert.equal(empItemRes.status, 201);
      itemIdA = (await empItemRes.json()).item.id;

      const ownerEntRes = await fetch(`${baseUrl}/api/v1/entities`, { headers: { Authorization: `Bearer ${tokOwnerA}` } });
      assert.ok((await ownerEntRes.json()).entities.some(e => e.id === entIdA), "Workspace Owner sees employee-created workspace entities");

      // Cross-tenant isolation on Catalog items/entities
      const crossItems = await fetch(`${baseUrl}/api/v1/entities/${entIdA}/items`, { headers: { Authorization: `Bearer ${tokOwnerB}` } });
      assert.equal(crossItems.status, 403, "Tenant B blocked from Tenant A entity items");
      const crossSingleItem = await fetch(`${baseUrl}/api/v1/items/${itemIdA}`, { headers: { Authorization: `Bearer ${tokOwnerB}` } });
      assert.equal(crossSingleItem.status, 403, "Tenant B blocked from Tenant A catalog item");

      // Tenant-scoped WABA accounts & message status in sarvyaConnectController
      const accARes = await (await fetch(`${baseUrl}/api/v1/channels/whatsapp/accounts`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.equal(accARes.accounts.length, 1);
      assert.equal(accARes.summary.oneToOneSent, 1, "Workspace Owner A sees team direct message count");

      const accBRes = await (await fetch(`${baseUrl}/api/v1/channels/whatsapp/accounts`, { headers: { Authorization: `Bearer ${tokOwnerB}` } })).json();
      assert.equal(accBRes.accounts.length, 0, "Tenant B must never see Tenant A WABA accounts");
      assert.equal(accBRes.connected, false, "Tenant B must never inherit Tenant 1 global token connected flag");
      assert.equal(accBRes.summary.oneToOneSent, 0);

      const crossMsg = await fetch(`${baseUrl}/api/v1/whatsapp/messages/${msgIdA}`, { headers: { Authorization: `Bearer ${tokOwnerB}` } });
      assert.equal(crossMsg.status, 404, "Tenant B must never access Tenant A message status");

      const usageARes = await (await fetch(`${baseUrl}/api/v1/whatsapp/usage`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.equal(usageARes.recentMessages.length, 1, "Workspace Owner A sees workspace recent messages");
      const usageBRes = await (await fetch(`${baseUrl}/api/v1/whatsapp/usage`, { headers: { Authorization: `Bearer ${tokOwnerB}` } })).json();
      assert.equal(usageBRes.recentMessages.length, 0, "Tenant B must see 0 messages from Tenant A");
    } finally {
      try { if (itemIdA) db.prepare("DELETE FROM catalog_items WHERE id = ?").run(itemIdA); } catch {}
      try { if (entIdA) db.prepare("DELETE FROM business_entities WHERE id = ?").run(entIdA); } catch {}
      for (const tid of [tidA, tidB]) {
        try { db.prepare("DELETE FROM booking_enquiries WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM whatsapp_messages WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM waba_phone_numbers WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch {}
      }
    }
  });

  test("11. Workspace Owner Inbox, WABA Lines, Tenant Auto-Reply & WhatsApp Flows Isolation", async () => {
    const { getSetting, setSetting } = require("../src/config/database");
    const flowController = require("../src/controllers/flowController");

    const tTs = Date.now() + 77;
    const tAInfo = db.prepare(`INSERT INTO tenants (name, slug, status, quota_waba_lines) VALUES (?, ?, 'ACTIVE', 3)`).run(`Suite11 A ${tTs}`, `s11-a-${tTs}`);
    const tBInfo = db.prepare(`INSERT INTO tenants (name, slug, status, quota_waba_lines) VALUES (?, ?, 'ACTIVE', 3)`).run(`Suite11 B ${tTs}`, `s11-b-${tTs}`);
    const tidA = Number(tAInfo.lastInsertRowid);
    const tidB = Number(tBInfo.lastInsertRowid);

    const ownerAId = `s11_own_a_${tTs}`;
    const empAId = `s11_emp_a_${tTs}`;
    const ownerBId = `s11_own_b_${tTs}`;
    const lineA1Id = `waba_s11_a1_${tTs}`;
    const lineA1PhoneId = `pn_s11_a1_${tTs}`;
    const lineA2PhoneId = `pn_s11_a2_${tTs}`;
    let replyIdA = null;
    const prevGlobalPhoneId = getSetting("WHATSAPP_PHONE_NUMBER_ID");
    const prevGlobalAutoMsg = getSetting("AUTO_REPLY_MESSAGE");
    const prevFlowsFlag = getSetting("WHATSAPP_FLOWS_ENABLED");
    let createdFlowId = null;

    try {
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'S11 Owner A', ?, '9192220001', 'h', 'USER', 'ACTIVE')`).run(ownerAId, tidA, `s11_own_a_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')`).run(ownerAId, tidA);
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'S11 Emp A', ?, '9192220002', 'h', 'USER', 'ACTIVE')`).run(empAId, tidA, `s11_emp_a_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'USER')`).run(empAId, tidA);
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, phone, password_hash, role, status) VALUES (?, ?, 'S11 Owner B', ?, '9192220003', 'h', 'USER', 'ACTIVE')`).run(ownerBId, tidB, `s11_own_b_${tTs}@test.local`);
      db.prepare(`INSERT INTO tenant_user_memberships (user_id, tenant_id, role) VALUES (?, ?, 'OWNER')`).run(ownerBId, tidB);

      db.prepare(`
        INSERT INTO waba_phone_numbers (id, tenant_id, display_name, phone_number, phone_number_id, waba_id, is_default, status)
        VALUES (?, ?, 'Tenant A Primary Line', '+91 92220 00001', ?, ?, 1, 'CONNECTED')
      `).run(lineA1Id, tidA, lineA1PhoneId, `waba_s11_${tTs}`);

      const repRes = db.prepare(`
        INSERT INTO customer_replies (tenant_id, user_id, wa_message_id, from_phone, customer_name, message_body, message_type, received_at, is_read)
        VALUES (?, ?, ?, '+919900011223', 'Patient via EmpA', 'Need invoice copy', 'text', CURRENT_TIMESTAMP, 0)
      `).run(tidA, empAId, `wamid_${tTs}`);
      replyIdA = Number(repRes.lastInsertRowid);

      const tokOwnerA = jwt.sign({ userId: ownerAId, role: "USER", tenantId: tidA }, config.JWT_SECRET, { expiresIn: "1h" });
      const tokEmpA = jwt.sign({ userId: empAId, role: "USER", tenantId: tidA }, config.JWT_SECRET, { expiresIn: "1h" });
      const tokOwnerB = jwt.sign({ userId: ownerBId, role: "USER", tenantId: tidB }, config.JWT_SECRET, { expiresIn: "1h" });

      // 1. Inbox: Workspace Owner A sees Emp A's customer reply; Tenant B sees 0
      const inboxA = await (await fetch(`${baseUrl}/api/inbox/replies`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.ok(inboxA.replies.some(r => String(r.id) === String(replyIdA)), "Workspace Owner A must see team customer replies");
      const inboxB = await (await fetch(`${baseUrl}/api/inbox/replies`, { headers: { Authorization: `Bearer ${tokOwnerB}` } })).json();
      assert.equal(inboxB.replies.some(r => String(r.id) === String(replyIdA)), false, "Tenant B must never see Tenant A replies");

      // 2. WABA Lines: Tenant-scoped listing, spoof protection, Workspace Owner default toggle, Employee 403
      const linesA = await (await fetch(`${baseUrl}/api/phone-numbers`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.equal(linesA.data.length, 1);
      assert.equal(linesA.data[0].phone_number_id, lineA1PhoneId);

      const empAddLine = await fetch(`${baseUrl}/api/phone-numbers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Emp Unauthorized Line", phoneNumberId: lineA2PhoneId })
      });
      assert.equal(empAddLine.status, 403);

      const ownerAddLine = await fetch(`${baseUrl}/api/phone-numbers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokOwnerA}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: 1, // attempted spoof must be ignored
          displayName: "Tenant A Secondary Line",
          phoneNumber: "+91 92220 00002",
          phoneNumberId: lineA2PhoneId
        })
      });
      assert.equal(ownerAddLine.status, 201);
      const lineA2 = (await ownerAddLine.json()).data;
      assert.equal(Number(lineA2.tenant_id), tidA, "Client tenantId spoof must never assign line to Tenant 1");

      const setDefRes = await fetch(`${baseUrl}/api/phone-numbers/${lineA2.id}/default`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokOwnerA}` }
      });
      assert.equal(setDefRes.status, 200);
      assert.equal(getSetting("WHATSAPP_PHONE_NUMBER_ID"), prevGlobalPhoneId, "Tenant A default change must not alter Tenant 1 global sender");

      const crossDef = await fetch(`${baseUrl}/api/phone-numbers/${lineA1Id}/default`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokOwnerB}` }
      });
      assert.equal(crossDef.status, 403, "Tenant B blocked from toggling Tenant A default line");

      const crossDel = await fetch(`${baseUrl}/api/phone-numbers/${lineA1Id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokOwnerB}` }
      });
      assert.equal(crossDel.status, 403, "Tenant B blocked from deleting Tenant A line");

      // 3. Auto-Reply Settings: Tenant-scoped save & isolation
      const empSaveAr = await fetch(`${baseUrl}/api/settings/auto-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, mode: "ALWAYS", message: "Emp Override" })
      });
      assert.equal(empSaveAr.status, 403);

      const ownerSaveAr = await fetch(`${baseUrl}/api/settings/auto-reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokOwnerA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, mode: "ALWAYS", message: "Tenant A Custom Auto-Reply" })
      });
      assert.equal(ownerSaveAr.status, 200);
      const ownerGetAr = await (await fetch(`${baseUrl}/api/settings/auto-reply`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.equal(ownerGetAr.data.enabled, false);
      assert.equal(ownerGetAr.data.mode, "ALWAYS");
      assert.equal(ownerGetAr.data.autoReplyMessage, "Tenant A Custom Auto-Reply");
      assert.equal(getSetting("AUTO_REPLY_MESSAGE"), prevGlobalAutoMsg, "Tenant A auto-reply must not overwrite Tenant 1 global setting");

      const tenantBGetAr = await (await fetch(`${baseUrl}/api/settings/auto-reply`, { headers: { Authorization: `Bearer ${tokOwnerB}` } })).json();
      assert.notEqual(tenantBGetAr.data.autoReplyMessage, "Tenant A Custom Auto-Reply");

      // 4. WhatsApp Flows: No !req.user fail-open bypass & strict tenant isolation
      let directStatus = 200;
      const directRes = { status: (c) => { directStatus = c; return directRes; }, json: () => directRes };
      await flowController.getFlow({ user: null, params: { flowId: "nonexistent" } }, directRes);
      assert.equal(directStatus, 401, "flowController must fail closed (401) when req.user is missing");

      setSetting("WHATSAPP_FLOWS_ENABLED", "true");
      const validFlowJson = {
        version: "3.1",
        screens: [{ id: "WELCOME", title: "Intake", terminal: true, layout: { type: "SingleColumnLayout", children: [{ type: "TextHeading", text: "Hi" }] } }]
      };
      const empCreateFlow = await fetch(`${baseUrl}/api/flows`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokEmpA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Tenant A Flow ${tTs}`, flow_json: validFlowJson })
      });
      assert.equal(empCreateFlow.status, 201);
      createdFlowId = (await empCreateFlow.json()).data.id;

      const ownerFlows = await (await fetch(`${baseUrl}/api/flows`, { headers: { Authorization: `Bearer ${tokOwnerA}` } })).json();
      assert.ok(ownerFlows.data.some(f => f.id === createdFlowId), "Workspace Owner A sees team-created flows");

      const tenantBFlows = await (await fetch(`${baseUrl}/api/flows`, { headers: { Authorization: `Bearer ${tokOwnerB}` } })).json();
      assert.equal(tenantBFlows.data.some(f => f.id === createdFlowId), false, "Tenant B never sees Tenant A flows");

      const crossFlowGet = await fetch(`${baseUrl}/api/flows/${createdFlowId}`, { headers: { Authorization: `Bearer ${tokOwnerB}` } });
      assert.equal(crossFlowGet.status, 403);
      const crossFlowPub = await fetch(`${baseUrl}/api/flows/${createdFlowId}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokOwnerB}`, "Content-Type": "application/json" },
        body: JSON.stringify({ forceLocal: true })
      });
      assert.equal(crossFlowPub.status, 403);
      const crossFlowDel = await fetch(`${baseUrl}/api/flows/${createdFlowId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokOwnerB}` }
      });
      assert.equal(crossFlowDel.status, 403);
    } finally {
      if (prevFlowsFlag !== null && prevFlowsFlag !== undefined) setSetting("WHATSAPP_FLOWS_ENABLED", prevFlowsFlag);
      try { if (createdFlowId) db.prepare("DELETE FROM whatsapp_flows WHERE id = ?").run(createdFlowId); } catch {}
      try { db.prepare("DELETE FROM customer_replies WHERE id = ?").run(replyIdA); } catch {}
      for (const tid of [tidA, tidB]) {
        try { db.prepare("DELETE FROM tenant_settings WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM whatsapp_flows WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM waba_phone_numbers WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tid); } catch {}
        try { db.prepare("DELETE FROM tenants WHERE id = ?").run(tid); } catch {}
      }
    }
  });
});
