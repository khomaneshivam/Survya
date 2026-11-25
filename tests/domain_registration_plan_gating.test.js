const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { db, initializeDatabase } = require("../src/config/database");
const { app } = require("../server");

initializeDatabase();

function requestJson(server, method, path, { body = null, token = null } = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (_) {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe("Pre-Built Domain Registration & Plan-Scoped App Visibility", { concurrency: 1 }, () => {
  let server = null;
  let clinicToken = null;
  let clinicUserId = null;
  let clinicTenantId = null;
  let bootstrapSeedUserId = null;
  const uniqueSuffix = Date.now();
  const clinicEmail = `clinic_owner_${uniqueSuffix}@example.test`;

  before(async () => {
    // Ensure at least one user exists so self-serve SaaS registration creates a fresh dedicated tenant on TRIAL.
    const countRow = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
    if (Number(countRow?.cnt || 0) === 0) {
      bootstrapSeedUserId = `seed_admin_${uniqueSuffix}`;
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, status, tenant_id, created_at, updated_at)
        VALUES (?, 'Seed Admin', ?, 'dummy_hash', 'ADMIN', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(bootstrapSeedUserId, `seed_admin_${uniqueSuffix}@example.test`);
    }

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, resolve);
    });
  });

  after(() => {
    if (server) server.close();
    if (clinicTenantId && clinicTenantId > 1) {
      const cleanupTables = [
        "customer_replies",
        "business_goal_outcomes",
        "experience_continuation_tokens",
        "inapp_sessions",
        "inapp_form_fields",
        "inapp_screens",
        "inapp_experiences",
        "conversation_flow_events",
        "conversation_flow_sessions",
        "workflow_triggers",
        "conversation_flow_versions",
        "conversation_flows",
        "flow_global_settings",
        "properties",
        "pricing_rules",
        "catalog_addons",
        "catalog_addon_groups",
        "catalog_items",
        "catalog_categories",
        "business_entities",
        "master_categories",
        "master_locations",
        "master_units",
        "master_tax_slabs",
        "master_payment_modes",
        "crm_pipelines",
        "tenant_user_memberships"
      ];
      for (const tbl of cleanupTables) {
        try {
          db.prepare(`DELETE FROM ${tbl} WHERE tenant_id = ?`).run(clinicTenantId);
        } catch (_) {}
      }
      try {
        db.prepare("DELETE FROM users WHERE id = ? OR tenant_id = ?").run(clinicUserId || "", clinicTenantId);
        db.prepare("DELETE FROM tenants WHERE id = ?").run(clinicTenantId);
      } catch (_) {}
    }
    if (bootstrapSeedUserId) {
      try {
        db.prepare("DELETE FROM users WHERE id = ?").run(bootstrapSeedUserId);
      } catch (_) {}
    }
  });

  test("1. GET /api/auth/domains exposes all 8 pre-built domains & plan domain quotas", async () => {
    const res = await requestJson(server, "GET", "/api/auth/domains");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.domains.length, 8);

    const codes = res.body.domains.map((d) => d.code);
    for (const expected of [
      "HOSPITALITY",
      "RESTAURANT_FOOD",
      "RETAIL_ECOM",
      "CLINIC_HEALTH",
      "SALON_WELLNESS",
      "REAL_ESTATE",
      "EDUCATION_COACHING",
      "B2B_WHOLESALE"
    ]) {
      assert.ok(codes.includes(expected), `Missing domain ${expected}`);
    }
    assert.equal(res.body.planPolicy.TRIAL.maxDomains, 1);
    assert.equal(res.body.planPolicy.STARTER.maxDomains, 1);
    assert.equal(res.body.planPolicy.GROWTH.maxDomains, 3);
    assert.equal(res.body.planPolicy.ENTERPRISE.maxDomains, 8);
  });

  test("2. Registration rejects unsupported domain code cleanly with 400", async () => {
    const res = await requestJson(server, "POST", "/api/auth/register", {
      body: {
        name: "Bad Domain User",
        email: `bad_domain_${uniqueSuffix}@example.test`,
        phone: "+919876500001",
        password: "Password@123",
        domain: "NON_EXISTENT_SECTOR"
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test("3. Self-serve CLINIC_HEALTH registration provisions clinic stack & hides Hospitality on TRIAL", async () => {
    const regRes = await requestJson(server, "POST", "/api/auth/register", {
      body: {
        name: "Dr. Meera Joshi",
        businessName: "Sunrise PolyClinic",
        domain: "CLINIC_HEALTH",
        email: clinicEmail,
        phone: "+919820011223",
        password: "ClinicUser@2026"
      }
    });

    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.success, true);
    assert.ok(regRes.body.token);

    clinicToken = regRes.body.token;
    clinicUserId = regRes.body.user.id;
    clinicTenantId = regRes.body.user.tenant_id;

    assert.ok(clinicTenantId > 1, "Expected isolated self-serve tenant_id > 1");
    assert.equal(regRes.body.user.primary_domain, "CLINIC_HEALTH");
    assert.deepEqual(regRes.body.user.allowed_domains, ["CLINIC_HEALTH"]);
    assert.equal(regRes.body.user.domain_access.maxDomains, 1);
    assert.equal(regRes.body.user.domain_access.multiDomainEnabled, false);

    // /api/v1/entities must only return Clinic entity (not Hospitality)
    const entRes = await requestJson(server, "GET", "/api/v1/entities", { token: clinicToken });
    assert.equal(entRes.status, 200);
    assert.ok(entRes.body.entities.length >= 1);
    assert.ok(entRes.body.entities.every((e) => e.domain === "CLINIC_HEALTH"));
    assert.equal(entRes.body.entities.some((e) => e.domain === "HOSPITALITY"), false);

    // Pre-seeded catalog items must exist for this tenant
    const itemRes = await requestJson(server, "GET", "/api/v1/universal/items", { token: clinicToken });
    assert.equal(itemRes.status, 200);
    assert.ok(itemRes.body.items.length >= 1, "Expected pre-seeded clinic catalog items on registration");

    // Pre-built Studio conversational experience must exist & be PUBLISHED
    const expRes = await requestJson(server, "GET", "/api/v1/studio/experiences", { token: clinicToken });
    assert.equal(expRes.status, 200);
    assert.ok(expRes.body.data.length >= 1, "Expected pre-built Studio chat experience on registration");
    assert.equal(expRes.body.data[0].status, "PUBLISHED");

    // Pre-built WhatsApp conversation flow must exist for the tenant
    const flowCount = db.prepare("SELECT COUNT(*) as cnt FROM conversation_flows WHERE tenant_id = ? AND delete_status = 0").get(clinicTenantId);
    assert.ok(Number(flowCount?.cnt || 0) >= 1, "Expected pre-seeded clinic flow");
  });

  test("4. TRIAL plan blocks activating second domain with 403 DOMAIN_PLAN_LIMIT_REACHED", async () => {
    const accessRes = await requestJson(server, "GET", "/api/v1/studio/domain-access", { token: clinicToken });
    assert.equal(accessRes.status, 200);
    assert.deepEqual(accessRes.body.data.allowedDomains, ["CLINIC_HEALTH"]);
    const hospitalityMeta = accessRes.body.data.availableProfiles.find((p) => p.code === "HOSPITALITY");
    assert.equal(hospitalityMeta.unlocked, false);

    const blockRes = await requestJson(server, "POST", "/api/v1/studio/domain-access/activate", {
      token: clinicToken,
      body: { domain: "HOSPITALITY", makePrimary: false }
    });
    assert.equal(blockRes.status, 403);
    assert.equal(blockRes.body.code, "DOMAIN_PLAN_LIMIT_REACHED");
  });

  test("5. Upgrading to GROWTH unlocks up to 3 domains; ENTERPRISE unlocks all 8 domains", async () => {
    db.prepare("UPDATE tenants SET plan_code = 'GROWTH', subscription_status = 'ACTIVE' WHERE id = ?").run(clinicTenantId);

    const addSecond = await requestJson(server, "POST", "/api/v1/studio/domain-access/activate", {
      token: clinicToken,
      body: { domain: "HOSPITALITY", makePrimary: false }
    });
    assert.equal(addSecond.status, 200);
    assert.deepEqual(addSecond.body.data.domainAccess.allowedDomains, ["CLINIC_HEALTH", "HOSPITALITY"]);

    const entAfterGrowth = await requestJson(server, "GET", "/api/v1/entities", { token: clinicToken });
    assert.equal(entAfterGrowth.status, 200);
    const entityDomains = new Set(entAfterGrowth.body.entities.map((e) => e.domain));
    assert.ok(entityDomains.has("CLINIC_HEALTH"));
    assert.ok(entityDomains.has("HOSPITALITY"));

    const addThird = await requestJson(server, "POST", "/api/v1/studio/domain-access/activate", {
      token: clinicToken,
      body: { domain: "SALON_WELLNESS", makePrimary: false }
    });
    assert.equal(addThird.status, 200);
    assert.equal(addThird.body.data.domainAccess.allowedDomains.length, 3);

    const blockFourth = await requestJson(server, "POST", "/api/v1/studio/domain-access/activate", {
      token: clinicToken,
      body: { domain: "RETAIL_ECOM", makePrimary: false }
    });
    assert.equal(blockFourth.status, 403);
    assert.equal(blockFourth.body.code, "DOMAIN_PLAN_LIMIT_REACHED");

    // Upgrade to ENTERPRISE -> all 8 unlocked automatically
    db.prepare("UPDATE tenants SET plan_code = 'ENTERPRISE' WHERE id = ?").run(clinicTenantId);
    const entAccessRes = await requestJson(server, "GET", "/api/v1/studio/domain-access", { token: clinicToken });
    assert.equal(entAccessRes.status, 200);
    assert.equal(entAccessRes.body.data.maxDomains, 8);
    assert.equal(entAccessRes.body.data.allowedDomains.length, 8);
    assert.ok(entAccessRes.body.data.availableProfiles.every((p) => p.unlocked === true));
  });

  test("6. Hybrid WhatsApp -> Options -> Survya Web Chat -> WhatsApp Confirmation works end-to-end", async () => {
    const flowEngine = require("../src/services/conversationFlowEngine");
    const flowService = require("../src/services/conversationFlowService");

    const clinicExpRes = await requestJson(server, "GET", "/api/v1/studio/experiences", { token: clinicToken });
    assert.equal(clinicExpRes.status, 200);
    const clinicExp = clinicExpRes.body.data.find((e) => e.slug.includes("clinic") || e.domain_type === "HEALTHCARE") || clinicExpRes.body.data[0];
    assert.ok(clinicExp?.slug, "Expected published clinic Studio experience");

    const flowList = flowService.listFlows(clinicTenantId, { limit: 10 });
    const clinicFlow = flowList.flows.find((f) => String(f.category || "").toUpperCase().includes("CLINIC")) || flowList.flows[0];
    assert.ok(clinicFlow?.id, "Expected auto-provisioned clinic flow");

    const flowDetails = flowService.getFlowById(clinicFlow.id, clinicTenantId);
    const nodes = flowDetails.publishedVersion?.nodes || flowDetails.draftVersion?.nodes || [];
    const survyaNode = nodes.find((n) => n.type === "OPEN_INAPP_EXPERIENCE");
    assert.ok(survyaNode, "Seeded flow must include OPEN_INAPP_EXPERIENCE node for Visual Canvas");
    assert.equal(survyaNode.config?.experienceSlug, clinicExp.slug);

    const customerPhone = `919876${String(uniqueSuffix).slice(-6)}`;

    // Turn 1: Customer sends first greeting on WhatsApp -> receives business welcome + options
    const turn1 = await flowEngine.processTurn({
      senderPhone: customerPhone,
      userInput: "Hi",
      startFlowId: clinicFlow.id,
      context: {
        tenantId: clinicTenantId,
        channel: "WHATSAPP",
        isSimulation: false,
        transportSimulation: true
      }
    });
    assert.equal(turn1.handled, true);
    assert.ok(turn1.replyText.includes("Sunrise PolyClinic"), "Welcome reply must include business name");
    assert.ok(turn1.replyInteractive?.options?.some((o) => o.id === "opt_survya"), "Welcome options must expose Survya entry option");

    // Turn 2: Customer taps Survya option -> receives /x/<slug>?ct=<token> link
    const turn2 = await flowEngine.processTurn({
      senderPhone: customerPhone,
      userInput: "Book Slot (Survya)",
      userPayload: { id: "opt_survya", title: "Book Slot (Survya)" },
      startFlowId: clinicFlow.id,
      context: {
        tenantId: clinicTenantId,
        channel: "WHATSAPP",
        isSimulation: false,
        transportSimulation: true
      }
    });
    assert.equal(turn2.handled, true);
    assert.ok(turn2.replyText.includes(`/x/${clinicExp.slug}?ct=`), "Turn 2 must return personalized Survya continuation URL");

    const ctMatch = turn2.replyText.match(/\?ct=([A-Za-z0-9_.-]+)/);
    assert.ok(ctMatch && ctMatch[1], "Expected opaque continuation token ?ct=");
    const ct = ctMatch[1];

    // Turn 3: Customer opens Survya URL -> redeems opaque token
    const redeemRes = await requestJson(server, "POST", `/api/v1/public/x/${clinicExp.slug}/continuation/redeem`, {
      body: { ct }
    });
    assert.equal(redeemRes.status, 200);
    const { sessionToken } = redeemRes.body.data;
    let lockVer = redeemRes.body.data.optimisticLockVersion;

    // Turn 4+: Customer completes full appointment journey inside Survya web chat
    const step1 = await requestJson(server, "POST", `/api/v1/public/x/${clinicExp.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { consultation_type: "In-Clinic Visit" },
        expectedLockVersion: lockVer,
        isSimulation: true
      }
    });
    assert.equal(step1.status, 200);
    lockVer = step1.body.data.optimisticLockVersion;

    const step2 = await requestJson(server, "POST", `/api/v1/public/x/${clinicExp.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { selected_date: "2026-12-28" },
        expectedLockVersion: lockVer,
        isSimulation: true
      }
    });
    assert.equal(step2.status, 200);
    lockVer = step2.body.data.optimisticLockVersion;

    const step3 = await requestJson(server, "POST", `/api/v1/public/x/${clinicExp.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { selected_slot: "10:00 AM" },
        expectedLockVersion: lockVer,
        isSimulation: true
      }
    });
    assert.equal(step3.status, 200);
    lockVer = step3.body.data.optimisticLockVersion;

    const finalStep = await requestJson(server, "POST", `/api/v1/public/x/${clinicExp.slug}/navigate`, {
      body: {
        sessionToken,
        action: "NEXT",
        formValues: { phone: customerPhone },
        expectedLockVersion: lockVer,
        isSimulation: true
      }
    });
    assert.equal(finalStep.status, 200);
    assert.equal(finalStep.body.data.currentScreenKey, "confirmation");
    assert.equal(finalStep.body.data.goalStatus, "COMPLETED");
    assert.equal(finalStep.body.data.channelOwner, "WHATSAPP");
    assert.equal(finalStep.body.data.stateData.whatsapp_confirmation_sent, true);
    assert.ok(finalStep.body.data.whatsappConfirmation?.body, "Expected WhatsApp confirmation message payload");

    // Verify WhatsApp flow session advanced to node_confirm & confirmation was persisted cleanly
    const updatedFlowSess = db.prepare(`
      SELECT current_node_id, session_status
      FROM conversation_flow_sessions
      WHERE tenant_id = ? AND sender_phone = ?
      ORDER BY id DESC LIMIT 1
    `).get(clinicTenantId, customerPhone);
    assert.equal(updatedFlowSess?.current_node_id, "node_confirm");
    assert.equal(updatedFlowSess?.session_status, "COMPLETED");

    const waConfirmRow = db.prepare(`
      SELECT source, message_body FROM customer_replies
      WHERE tenant_id = ? AND from_phone = ? AND source = 'SURVYA_INAPP_CONFIRMATION'
      ORDER BY id DESC LIMIT 1
    `).get(clinicTenantId, customerPhone);
    assert.ok(waConfirmRow && waConfirmRow.message_body.length > 10, "Expected recorded WhatsApp confirmation message");
  });
});
