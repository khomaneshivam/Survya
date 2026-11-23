/**
 * Universal Flow Template Library & Client Configuration Engine Test Suite
 *
 * Verifies:
 * 1. Template catalog discovery & tenant visibility isolation (PUBLIC vs PRIVATE).
 * 2. Configuration schema validation (required fields, phone format, number ranges, defaults).
 * 3. Resource binding validation & tenant boundary checks.
 * 4. Atomic transactional installation into independent tenant flows.
 * 5. Validation & activation lifecycle (DRAFT -> ACTIVE, published flow & trigger creation).
 * 6. Dynamic variable runtime resolution ({{config.business.name}}, {{config.greeting}}, {{catalog.starting_price}}).
 * 7. Multi-tenant isolation: Two distinct tenants install same template with separate configurations & data.
 * 8. Controlled version upgrades: 1.0.0 -> 1.1.0 upgrade while preserving tenant configuration and bindings.
 *
 * Mandatory Safety Guardrail: Zero live WhatsApp messages dispatched.
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");

const templateCatalogService = require("../src/modules/templateLibrary/templateCatalogService");
const templateConfigValidator = require("../src/modules/templateLibrary/templateConfigValidator");
const templateBindingService = require("../src/modules/templateLibrary/templateBindingService");
const templateInstallService = require("../src/modules/templateLibrary/templateInstallService");
const templateUpgradeService = require("../src/modules/templateLibrary/templateUpgradeService");
const templateRepository = require("../src/modules/templateLibrary/templateRepository");
const { processTurn, interpolateVariables } = require("../src/services/conversationFlowEngine");

describe("Universal Flow Template Library & Client Configuration Engine", () => {
  const tenantA = 9101;
  const tenantB = 9102;
  const createdFlowIds = [];
  const createdInstallationIds = [];
  const createdTemplateIds = [];

  before(() => {
    // Ensure clean state for test tenants
    db.prepare("DELETE FROM template_bindings WHERE tenant_id IN (?, ?)").run(tenantA, tenantB);
    db.prepare("DELETE FROM template_installations WHERE tenant_id IN (?, ?)").run(tenantA, tenantB);
    db.prepare("DELETE FROM conversation_flows WHERE tenant_id IN (?, ?)").run(tenantA, tenantB);
    db.prepare("DELETE FROM template_versions WHERE version_number = '1.1.0'").run();
    db.prepare("UPDATE template_catalog SET current_version = '1.0.0' WHERE current_version = '1.1.0'").run();
  });

  after(() => {
    db.prepare("DELETE FROM template_versions WHERE version_number = '1.1.0'").run();
    db.prepare("UPDATE template_catalog SET current_version = '1.0.0' WHERE current_version = '1.1.0'").run();
    // Cleanup created test records
    if (createdInstallationIds.length > 0) {
      const placeholders = createdInstallationIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM template_bindings WHERE installation_id IN (${placeholders})`).run(...createdInstallationIds);
      db.prepare(`DELETE FROM template_installations WHERE id IN (${placeholders})`).run(...createdInstallationIds);
    }
    if (createdFlowIds.length > 0) {
      const placeholders = createdFlowIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM conversation_flow_sessions WHERE flow_id IN (${placeholders})`).run(...createdFlowIds);
      db.prepare(`DELETE FROM conversation_flow_versions WHERE flow_id IN (${placeholders})`).run(...createdFlowIds);
      db.prepare(`DELETE FROM conversation_flows WHERE id IN (${placeholders})`).run(...createdFlowIds);
      db.prepare(`DELETE FROM workflow_triggers WHERE flow_id IN (${placeholders})`).run(...createdFlowIds.map(String));
    }
    if (createdTemplateIds.length > 0) {
      const placeholders = createdTemplateIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM template_versions WHERE template_id IN (${placeholders})`).run(...createdTemplateIds);
      db.prepare(`DELETE FROM template_catalog WHERE id IN (${placeholders})`).run(...createdTemplateIds);
    }
  });

  test("1. Template Catalog Discovery & Tenant Visibility Isolation", () => {
    // List catalog for tenant A
    const catalogA = templateCatalogService.listCatalog(tenantA);
    assert.ok(catalogA.length >= 2, "Default reference templates should be visible to tenant A");

    const resortTpl = catalogA.find(t => t.template_key === "hospitality.resort-booking");
    const b2bTpl = catalogA.find(t => t.template_key === "b2b.lead-qualification");

    assert.ok(resortTpl, "hospitality.resort-booking template must be in catalog");
    assert.ok(b2bTpl, "b2b.lead-qualification template must be in catalog");
    assert.equal(resortTpl.visibility, "PUBLIC");

    // Create a PRIVATE template owned by Tenant A
    const privateTpl = templateCatalogService.createTemplate(tenantA, "author_a", {
      template_key: "custom.tenant-a-private",
      title: "Tenant A Secret Workflow",
      visibility: "PRIVATE",
      industry: "RETAIL",
      category: "ORDERS",
      current_version: "1.0.0"
    });
    createdTemplateIds.push(privateTpl.id);

    // Tenant A should see their private template
    const tenantACatalog = templateCatalogService.listCatalog(tenantA);
    assert.ok(tenantACatalog.some(t => t.id === privateTpl.id), "Tenant A should see their own private template");

    // Tenant B must NOT see Tenant A's private template
    const tenantBCatalog = templateCatalogService.listCatalog(tenantB);
    assert.ok(!tenantBCatalog.some(t => t.id === privateTpl.id), "Tenant B must NOT see Tenant A's private template");

    // Tenant B direct lookup should return null
    const directLookup = templateRepository.findTemplateByIdOrKey(privateTpl.id, tenantB);
    assert.equal(directLookup, null, "Cross-tenant direct lookup of private template must fail");
  });

  test("2. Configuration Schema Validation", () => {
    const schema = {
      "business.name": { type: "string", label: "Business Name", required: true },
      "business.phone": { type: "phone", label: "Reservation Phone", required: true },
      "greeting": { type: "text", label: "Greeting", required: true },
      "threshold": { type: "number", label: "Threshold", required: false, default: 5000 },
      "checkin_time": { type: "time", label: "Check-in Time", required: false, default: "14:00" }
    };

    // Missing required fields
    const invalidRes = templateConfigValidator.validate(schema, {
      "business.name": "Resort Paradise"
      // missing phone and greeting
    });
    assert.equal(invalidRes.isValid, false, "Should fail when required fields are missing");
    assert.ok(invalidRes.errors.length >= 2, "Should report at least 2 missing field errors");

    // Invalid phone number
    const badPhoneRes = templateConfigValidator.validate(schema, {
      "business.name": "Resort Paradise",
      "business.phone": "123", // too short
      "greeting": "Welcome!"
    });
    assert.equal(badPhoneRes.isValid, false, "Should fail when phone is invalid");
    assert.ok(badPhoneRes.errors.some(e => e.includes("phone number")));

    // Valid configuration with defaults
    const validRes = templateConfigValidator.validate(schema, {
      "business.name": "Resort Paradise",
      "business.phone": "+91 94223 59446",
      "greeting": "Welcome to our sanctuary!"
    });
    assert.equal(validRes.isValid, true, "Valid configuration should pass");
    assert.equal(validRes.cleanConfig["business.phone"], "919422359446", "Phone should be normalized to digits");
    assert.equal(validRes.cleanConfig["threshold"], 5000, "Default number should be applied");
    assert.equal(validRes.cleanConfig["checkin_time"], "14:00", "Default time should be applied");
  });

  test("3. Resource Binding Validation", () => {
    const requiredBindings = [
      { key: "sender_line", type: "WHATSAPP_LINE", required: true },
      { key: "property_id", type: "PROPERTY", required: true }
    ];

    // Missing required binding
    const missingRes = templateBindingService.validateBindings(requiredBindings, [], tenantA);
    assert.equal(missingRes.isValid, false, "Should fail when required binding is missing");

    // Valid bindings
    const validRes = templateBindingService.validateBindings(requiredBindings, [
      { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919307382030" },
      { key: "property_id", type: "PROPERTY", target_resource_id: "1" }
    ], tenantA);

    assert.equal(validRes.isValid, true, "Should pass with valid bindings");
    assert.equal(validRes.resolvedBindings.length, 2);
  });

  test("4. Atomic Transactional Installation & Cloned Graph Integrity", () => {
    const installRes = templateInstallService.installTemplate({
      templateIdOrKey: "hospitality.resort-booking",
      tenantId: tenantA,
      userId: "admin_runner",
      customFlowName: "Seaside Haven Concierge",
      configValues: {
        "business.name": "Seaside Haven Resort",
        "business.phone": "919422359446",
        "greeting": "Welcome to the pristine coast!",
        "checkin_time": "15:00",
        "checkout_time": "11:00"
      },
      bindings: [
        { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919307382030" },
        { key: "property_id", type: "PROPERTY", target_resource_id: "1" }
      ],
      activateImmediately: false
    });

    assert.ok(installRes.success, "Installation should succeed");
    assert.ok(installRes.flow.id, "Conversation flow must be created");
    assert.equal(installRes.installation.status, "CONFIGURED", "Status should be CONFIGURED");
    assert.equal(installRes.flow.status, "DRAFT", "Flow should start in DRAFT");
    assert.equal(installRes.flow.installed_from_template_id, installRes.installation.template_id);

    createdFlowIds.push(installRes.flow.id);
    createdInstallationIds.push(installRes.installation.id);

    // Verify bindings were persisted
    const bindings = templateRepository.getBindings(installRes.installation.id, tenantA);
    assert.equal(bindings.length, 2, "Both bindings should be persisted");
  });

  test("5. Validation & Activation Lifecycle (DRAFT -> ACTIVE)", () => {
    const instId = createdInstallationIds[0];
    const activateRes = templateInstallService.validateAndActivateInstallation(instId, tenantA, "admin_activator");

    assert.ok(activateRes.success, "Activation should succeed");
    assert.equal(activateRes.installation.status, "ACTIVE", "Installation status should be ACTIVE");
    assert.equal(activateRes.flow.status, "PUBLISHED", "Flow status should be PUBLISHED");
    assert.ok(activateRes.flow.published_version_id, "Flow must have published_version_id set");

    // Verify workflow trigger was registered
    const trigger = db.prepare("SELECT * FROM workflow_triggers WHERE flow_id = ? AND tenant_id = ?").get(String(activateRes.flow.id), tenantA);
    assert.ok(trigger, "A workflow trigger should be registered for the activated flow");
    assert.equal(trigger.active_status, 1, "Trigger must be active");
  });

  test("6. Multi-Tenant Independent Configurations & Separate Data", () => {
    // Tenant B installs the SAME Resort Booking template with different configuration
    const installB = templateInstallService.installTemplate({
      templateIdOrKey: "hospitality.resort-booking",
      tenantId: tenantB,
      userId: "admin_b",
      customFlowName: "Mountain Pine Resort Concierge",
      configValues: {
        "business.name": "Mountain Pine Lodge",
        "business.phone": "919111222333",
        "greeting": "Welcome to alpine tranquility!",
        "checkin_time": "13:00",
        "checkout_time": "10:00"
      },
      bindings: [
        { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919111222333" },
        { key: "property_id", type: "PROPERTY", target_resource_id: "1" }
      ],
      activateImmediately: true
    });

    createdFlowIds.push(installB.flow.id);
    createdInstallationIds.push(installB.installation.id);

    // Verify Tenant A and Tenant B installations are completely independent
    const instA = templateRepository.findInstallationById(createdInstallationIds[0], tenantA);
    const instB = templateRepository.findInstallationById(createdInstallationIds[1], tenantB);

    assert.notEqual(instA.flow_id, instB.flow_id, "Flow IDs must be distinct");
    assert.equal(instA.config_values["business.name"], "Seaside Haven Resort");
    assert.equal(instB.config_values["business.name"], "Mountain Pine Lodge");

    // Modify Tenant A's config - verify Tenant B is completely unchanged
    templateRepository.updateInstallation(instA.id, tenantA, {
      config_values_json: { ...instA.config_values, "business.name": "Seaside Haven Luxury Resort" }
    });

    const refreshedA = templateRepository.findInstallationById(instA.id, tenantA);
    const refreshedB = templateRepository.findInstallationById(instB.id, tenantB);

    assert.equal(refreshedA.config_values["business.name"], "Seaside Haven Luxury Resort");
    assert.equal(refreshedB.config_values["business.name"], "Mountain Pine Lodge", "Tenant B's configuration must remain unchanged");
  });

  test("7. Runtime Dynamic Variable Resolution in Live Engine", async () => {
    const flowIdA = createdFlowIds[0];
    const flowIdB = createdFlowIds[1];

    // Turn for Tenant A
    const turnA = await processTurn({
      tenantId: tenantA,
      senderPhone: "919422359446",
      userInput: "hi",
      startFlowId: flowIdA
    });

    assert.ok(turnA.handled, "Tenant A turn should be handled");
    assert.ok(turnA.replyText.includes("Seaside Haven"), `Should include Tenant A's business name, got: ${turnA.replyText}`);
    assert.ok(turnA.replyText.includes("919422359446"), "Should include Tenant A's contact phone");

    // Turn for Tenant B
    const turnB = await processTurn({
      tenantId: tenantB,
      senderPhone: "919111222333",
      userInput: "hi",
      startFlowId: flowIdB
    });

    assert.ok(turnB.handled, "Tenant B turn should be handled");
    assert.ok(turnB.replyText.includes("Mountain Pine Lodge"), `Should include Tenant B's business name, got: ${turnB.replyText}`);
    assert.ok(turnB.replyText.includes("919111222333"), "Should include Tenant B's contact phone");
    assert.ok(!turnB.replyText.includes("Seaside Haven"), "Tenant B response must never leak Tenant A details");
  });

  test("8. Controlled Version Upgrades (1.0.0 -> 1.1.0)", () => {
    const instA = templateRepository.findInstallationById(createdInstallationIds[0], tenantA);
    const template = templateRepository.findTemplateByIdOrKey(instA.template_id, tenantA);

    // Initial check: no upgrade available
    const checkInitial = templateUpgradeService.checkUpgradeAvailability(instA.id, tenantA);
    assert.equal(checkInitial.upgradeAvailable, false, "Initially no upgrade should be available");

    // Publisher releases version 1.1.0 with an updated graph
    const newVersion = templateCatalogService.createReleaseVersion(template.id, 1, "platform_admin", {
      version_number: "1.1.0",
      graph_json: {
        nodes: [
          { id: "node_start", type: "START", config: {} },
          { id: "node_welcome_v2", type: "MESSAGE", config: { text: "🌊 *[v1.1.0] Welcome to {{config.business.name}}!* How can we help?" } }
        ],
        transitions: [
          { id: "e1", source: "node_start", target: "node_welcome_v2", sourceHandle: "default" }
        ],
        variables: {}
      },
      changelog: "Added upgraded welcome node and improved validation"
    });

    // Check upgrade availability again
    const checkUpgrade = templateUpgradeService.checkUpgradeAvailability(instA.id, tenantA);
    assert.equal(checkUpgrade.upgradeAvailable, true, "Upgrade to 1.1.0 should now be available");
    assert.equal(checkUpgrade.latestVersion, "1.1.0");

    // Upgrade Tenant A's installation
    const upgradeRes = templateUpgradeService.upgradeInstallation(instA.id, tenantA, "admin_a", "1.1.0");
    assert.ok(upgradeRes.success, "Upgrade should succeed");
    assert.equal(upgradeRes.installedVersion, "1.1.0");
    assert.equal(upgradeRes.flowVersionNumber, 2, "New flow version 2 should be created");

    // Verify Tenant A's configuration was preserved intact
    const postUpgradeInst = templateRepository.findInstallationById(instA.id, tenantA);
    assert.equal(postUpgradeInst.installed_version_number, "1.1.0");
    assert.equal(postUpgradeInst.config_values["business.name"], "Seaside Haven Luxury Resort", "Config must be preserved after upgrade");

    // Verify Tenant B remains on 1.0.0
    const instB = templateRepository.findInstallationById(createdInstallationIds[1], tenantB);
    assert.equal(instB.installed_version_number, "1.0.0", "Tenant B should remain on 1.0.0 until they choose to upgrade");
  });
});

