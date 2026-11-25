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
});
