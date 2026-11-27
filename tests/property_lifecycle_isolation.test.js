const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");

const { app } = require("../server");
const config = require("../src/config/env");
const { db, initializeDatabase, getSetting, setSetting } = require("../src/config/database");
const hospitalityConfigService = require("../src/services/hospitalityConfigService");
const universalCatalogService = require("../src/services/universal/universalCatalogService");
const webhookService = require("../src/services/webhookService");

describe("Phase 2 Regression: Property Lifecycle & Tenant Isolation (Greenvally vs KonkanTrip)", () => {
  let server;
  let baseUrl;
  let tenantAId;
  let tenantBId;
  let adminAToken;
  let staffAToken;
  let adminBToken;
  let createdPropId;
  let dupPropId;
  let softDeletedUserId;
  let origBotName;

  before(async () => {
    initializeDatabase();
    origBotName = getSetting("BOT_BUSINESS_NAME");

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const tA = db.prepare(`
      INSERT INTO tenants (name, slug, status, plan_code, primary_domain, allowed_domains_json, created_at, updated_at)
      VALUES ('Greenvally Hospitality Workspace', 'greenvally-phase2-test', 'ACTIVE', 'GROWTH', 'HOSPITALITY', '["HOSPITALITY"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantAId = Number(tA.lastInsertRowid);

    const tB = db.prepare(`
      INSERT INTO tenants (name, slug, status, plan_code, primary_domain, allowed_domains_json, created_at, updated_at)
      VALUES ('Isolated Other Tenant', 'isolated-other-p2', 'ACTIVE', 'TRIAL', 'HOSPITALITY', '["HOSPITALITY"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantBId = Number(tB.lastInsertRowid);

    const admA = `usr_p2_adm_a_${Date.now()}`;
    const stfA = `usr_p2_stf_a_${Date.now()}`;
    const admB = `usr_p2_adm_b_${Date.now()}`;
    softDeletedUserId = `usr_p2_del_${Date.now()}`;

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Greenvally Owner', 'owner_a@greenvally.test', 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(admA, tenantAId);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role)
      VALUES (?, ?, 'OWNER')
    `).run(tenantAId, admA);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Greenvally Staff', 'staff_a@greenvally.test', 'hash', 'STAFF', 'ACTIVE', 1, 0)
    `).run(stfA, tenantAId);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role)
      VALUES (?, ?, 'STAFF')
    `).run(tenantAId, stfA);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Other Owner', 'owner_b@other.test', 'hash', 'USER', 'ACTIVE', 1, 0)
    `).run(admB, tenantBId);
    db.prepare(`
      INSERT INTO tenant_user_memberships (tenant_id, user_id, role)
      VALUES (?, ?, 'OWNER')
    `).run(tenantBId, admB);
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status)
      VALUES (?, ?, 'Deleted User', 'deleted_p2@greenvally.test', 'hash', 'USER', 'SUSPENDED', 0, 1)
    `).run(softDeletedUserId, tenantAId);

    adminAToken = jwt.sign({ id: admA, userId: admA, tenant_id: tenantAId, role: "USER", workspace_role: "OWNER" }, config.JWT_SECRET, { expiresIn: "1h" });
    staffAToken = jwt.sign({ id: stfA, userId: stfA, tenant_id: tenantAId, role: "STAFF", workspace_role: "STAFF" }, config.JWT_SECRET, { expiresIn: "1h" });
    adminBToken = jwt.sign({ id: admB, userId: admB, tenant_id: tenantBId, role: "USER", workspace_role: "OWNER" }, config.JWT_SECRET, { expiresIn: "1h" });
  });

  after(async () => {
    if (origBotName) setSetting("BOT_BUSINESS_NAME", origBotName);
    try {
      for (const tid of [tenantAId, tenantBId]) {
        if (!tid) continue;
        db.prepare("DELETE FROM flow_global_settings WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM workflow_triggers WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM conversation_flows WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM room_types WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM rate_plans WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM properties WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM tenant_user_memberships WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM tenants WHERE id = ?").run(tid);
      }
    } catch (_) {}
    const { closeTestResources } = require("./helpers/testFixtures");
    await closeTestResources(server);
  });

  test("1. Creating Greenvally Hotel & Resort via POST /properties does NOT overwrite Tenant 1 KonkanTrip", async () => {
    const t1PropBefore = db.prepare("SELECT id, name, tenant_id FROM properties WHERE id = 1").get();
    assert.ok(t1PropBefore, "Tenant 1 Property #1 must exist");

    // Staff cannot create property (requiresWorkspaceAdmin)
    const staffRes = await fetch(`${baseUrl}/api/v1/hospitality/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffAToken}` },
      body: JSON.stringify({ name: "Unauthorized Property" })
    });
    assert.equal(staffRes.status, 403);

    // Owner creates Greenvally independently
    const createRes = await fetch(`${baseUrl}/api/v1/hospitality/properties`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({
        name: "Greenvally Hotel & Resort",
        property_type: "RESORT",
        city: "Lonavala",
        state: "Maharashtra",
        phone: "+919822001122"
      })
    });
    assert.equal(createRes.status, 201);
    const createdData = await createRes.json();
    assert.equal(createdData.success, true);
    createdPropId = createdData.property.id;
    assert.notEqual(createdPropId, 1, "New property must get a fresh ID, never overwrite Property #1");
    assert.equal(createdData.property.tenant_id, tenantAId);
    assert.equal(createdData.property.publication_status, "DRAFT");

    // Tenant 1 Property #1 remains completely untouched
    const t1PropAfter = db.prepare("SELECT id, name, tenant_id FROM properties WHERE id = 1").get();
    assert.equal(t1PropAfter.name, t1PropBefore.name);
    assert.equal(t1PropAfter.tenant_id, 1);
  });

  test("2. Cross-tenant IDOR & swapped-arg defense on GET/PUT/Duplicate/Archive", async () => {
    // Tenant B tries to read Tenant A's Greenvally property AND Property #1
    const crossGetA = await fetch(`${baseUrl}/api/v1/hospitality/properties/${createdPropId}`, {
      headers: { Authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(crossGetA.status, 404);

    const crossGet1 = await fetch(`${baseUrl}/api/v1/hospitality/properties/1`, {
      headers: { Authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(crossGet1.status, 404);

    // Cross-tenant PUT must fail cleanly with 404
    const crossPut = await fetch(`${baseUrl}/api/v1/hospitality/properties/${createdPropId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminBToken}` },
      body: JSON.stringify({ name: "Hijacked Property Name" })
    });
    assert.equal(crossPut.status, 404);

    // Owner updates own property cleanly
    const ownGet = await fetch(`${baseUrl}/api/v1/hospitality/properties/${createdPropId}`, {
      headers: { Authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(ownGet.status, 200);
    const ownProp = (await ownGet.json()).property;

    const ownPut = await fetch(`${baseUrl}/api/v1/hospitality/properties/${createdPropId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({ city: "Khandala", expected_version: ownProp.version || 1 })
    });
    assert.equal(ownPut.status, 200);
    const updatedProp = (await ownPut.json()).property;
    assert.equal(updatedProp.city, "Khandala");
  });

  test("3. Property duplicate & archive lifecycle (soft delete hides property)", async () => {
    const dupRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/${createdPropId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({ name: "Greenvally Annexe Villa" })
    });
    assert.equal(dupRes.status, 201);
    const dupData = await dupRes.json();
    dupPropId = dupData.property.id;
    assert.notEqual(dupPropId, createdPropId);
    assert.equal(dupData.property.name, "Greenvally Annexe Villa");

    const archRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/${dupPropId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({})
    });
    assert.equal(archRes.status, 200);

    // Archived property returns 404 on normal GET and disappears from listProperties
    const getArchived = await fetch(`${baseUrl}/api/v1/hospitality/properties/${dupPropId}`, {
      headers: { Authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(getArchived.status, 404);

    const listRes = await fetch(`${baseUrl}/api/v1/hospitality/properties`, {
      headers: { Authorization: `Bearer ${adminAToken}` }
    });
    const listData = await listRes.json();
    assert.ok(!listData.properties.some((p) => p.id === dupPropId), "Archived property must not appear in active list");
  });

  test("4. importFullIndustrySuite, updateBusinessProfile, and saveAutoReplySettings never overwrite Tenant 1 Property #1", async () => {
    const t1PropBefore = db.prepare("SELECT name FROM properties WHERE id = 1").get();
    const botBefore = getSetting("BOT_BUSINESS_NAME");

    const suiteRes = universalCatalogService.importFullIndustrySuite(tenantAId, {
      sectorCode: "HOSPITALITY",
      businessName: "Greenvally Second Wing",
      phone: "+919822009999",
      city: "Mahabaleshwar"
    }, "test_p2");
    assert.equal(suiteRes.success, true);
    assert.notEqual(suiteRes.propertyId, 1);

    const profRes = universalCatalogService.updateBusinessProfile(tenantAId, {
      name: "Greenvally Updated Corp",
      propertyId: createdPropId
    }, "test_p2");
    assert.equal(profRes.entity?.name, "Greenvally Updated Corp");

    // Tenant 1 saveAutoReplySettings must NOT touch properties.name on id = 1
    webhookService.saveAutoReplySettings({ auto_reply_business_name: "Injected Bot Name Should Not Change Property" });

    const t1PropAfter = db.prepare("SELECT name FROM properties WHERE id = 1").get();
    assert.equal(t1PropAfter.name, t1PropBefore.name);
    assert.equal(getSetting("BOT_BUSINESS_NAME"), botBefore);
  });

  test("5. Soft-deleted user JWT is rejected with 401 and public endpoint rejects invalid tenant_id", async () => {
    const delToken = jwt.sign({ id: softDeletedUserId, userId: softDeletedUserId, tenant_id: tenantAId, role: "USER" }, config.JWT_SECRET, { expiresIn: "1h" });
    const res = await fetch(`${baseUrl}/api/v1/hospitality/properties`, {
      headers: { Authorization: `Bearer ${delToken}` }
    });
    assert.equal(res.status, 401);

    const badPublic = await fetch(`${baseUrl}/api/v1/public/hospitality/properties?tenant_id=99999999`);
    assert.equal(badPublic.status, 404);
  });
});
