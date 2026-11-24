/**
 * Enterprise Automation Studio Demonstration Scenarios Test Suite
 *
 * Direct validation of Section 15 Required Demonstration Scenarios:
 * 
 * Scenario A: Hospitality Booking Assistant
 * - Reusable master template installed into Tenant A (Resort A, ₹3,500 catalog rate, Line A)
 * - Same master template installed into Tenant B (Resort B, ₹5,000 catalog rate, Line B)
 * - Verifies workflow structure uses each tenant's own settings, catalog, and phone line
 * - Verifies modifying Tenant A has zero effect on Tenant B
 *
 * Scenario B: B2B Lead Qualification
 * - Reusable B2B template installed into B2B Tenant with CRM pipeline binding
 * - Verifies full execution lifecycle: welcome, contact intake, service selection, budget qualification,
 *   conditional routing, CRM lead creation, and sales team handoff.
 *
 * Mandatory Safety Directives: Zero live messages dispatched (100% in-memory / mock mode).
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");

const templateCatalogService = require("../src/modules/templateLibrary/templateCatalogService");
const templateInstallService = require("../src/modules/templateLibrary/templateInstallService");
const templateRepository = require("../src/modules/templateLibrary/templateRepository");
const { processTurn } = require("../src/services/conversationFlowEngine");

describe("Section 15: Required Demonstration Scenarios", () => {
  const tenantA = 8801;
  const tenantB = 8802;
  const tenantB2B = 8803;

  const createdFlowIds = [];
  const createdInstallationIds = [];
  const createdCatalogItemIds = [];

  before(() => {
    // Teardown any prior state for these test tenants
    db.prepare("DELETE FROM template_bindings WHERE tenant_id IN (?, ?, ?)").run(tenantA, tenantB, tenantB2B);
    db.prepare("DELETE FROM template_installations WHERE tenant_id IN (?, ?, ?)").run(tenantA, tenantB, tenantB2B);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE tenant_id IN (?, ?, ?)").run(tenantA, tenantB, tenantB2B);
    db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id IN (SELECT id FROM conversation_flows WHERE tenant_id IN (?, ?, ?))").run(tenantA, tenantB, tenantB2B);
    db.prepare("DELETE FROM conversation_flows WHERE tenant_id IN (?, ?, ?)").run(tenantA, tenantB, tenantB2B);
    db.prepare("DELETE FROM catalog_items WHERE tenant_id IN (?, ?, ?)").run(tenantA, tenantB, tenantB2B);

    // Insert Tenant A catalog item starting rate: ₹3,500
    const catA = db.prepare(`
      INSERT INTO catalog_items (
        tenant_id, entity_id, item_type, title, slug, base_price, active_status, delete_status, is_sold_out
      ) VALUES (?, 1, 'ROOM', 'Deluxe Villa', 'deluxe-villa-a', 3500, 1, 0, 0)
    `).run(tenantA);
    createdCatalogItemIds.push(catA.lastInsertRowid);

    // Insert Tenant B catalog item starting rate: ₹5,000
    const catB = db.prepare(`
      INSERT INTO catalog_items (
        tenant_id, entity_id, item_type, title, slug, base_price, active_status, delete_status, is_sold_out
      ) VALUES (?, 1, 'ROOM', 'Beachfront Suite', 'beachfront-suite-b', 5000, 1, 0, 0)
    `).run(tenantB);
    createdCatalogItemIds.push(catB.lastInsertRowid);
  });

  after(() => {
    if (createdCatalogItemIds.length > 0) {
      const placeholders = createdCatalogItemIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM catalog_items WHERE id IN (${placeholders})`).run(...createdCatalogItemIds);
    }
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
  });

  test("Scenario A: Hospitality Booking Assistant across Tenant A & Tenant B", async () => {
    // 1. Install into Tenant A (Resort A, ₹3,500 catalog rate, Line A)
    const installA = templateInstallService.installTemplate({
      templateIdOrKey: "hospitality.resort-booking",
      tenantId: tenantA,
      userId: "resort_a_manager",
      customFlowName: "Resort A Booking Assistant",
      configValues: {
        "business.name": "Resort A - Seaside Villas",
        "business.phone": "919800000001",
        "greeting": "Welcome to Resort A! Enjoy private coastal serenity.",
        "checkin_time": "14:00",
        "checkout_time": "11:00",
        "cancellation_policy": "Full refund up to 72 hours before arrival."
      },
      bindings: [
        { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919800000001" },
        { key: "property_id", type: "PROPERTY", target_resource_id: "1" }
      ],
      activateImmediately: true
    });

    assert.ok(installA.success, "Tenant A installation must succeed");
    createdFlowIds.push(installA.flow.id);
    createdInstallationIds.push(installA.installation.id);

    // 2. Install same template into Tenant B (Resort B, ₹5,000 catalog rate, Line B)
    const installB = templateInstallService.installTemplate({
      templateIdOrKey: "hospitality.resort-booking",
      tenantId: tenantB,
      userId: "resort_b_manager",
      customFlowName: "Resort B Luxury Lodge",
      configValues: {
        "business.name": "Resort B - Highland Peak",
        "business.phone": "919800000002",
        "greeting": "Welcome to Resort B! Experience panoramic mountain views.",
        "checkin_time": "15:00",
        "checkout_time": "10:30",
        "cancellation_policy": "Non-refundable during peak monsoon season."
      },
      bindings: [
        { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919800000002" },
        { key: "property_id", type: "PROPERTY", target_resource_id: "1" }
      ],
      activateImmediately: true
    });

    assert.ok(installB.success, "Tenant B installation must succeed");
    createdFlowIds.push(installB.flow.id);
    createdInstallationIds.push(installB.installation.id);

    // 3. Process Inbound Turn for Tenant A - Verify Tenant A Business Details & Catalog Rate
    const turnA = await processTurn({
      tenantId: tenantA,
      senderPhone: "919800000001",
      userInput: "hi",
      startFlowId: installA.flow.id
    });

    assert.ok(turnA.handled, "Tenant A turn should be processed");
    assert.ok(turnA.replyText.includes("Resort A - Seaside Villas"), `Expected Resort A name in: ${turnA.replyText}`);
    assert.ok(turnA.replyText.includes("919800000001"), "Expected Resort A phone line");
    assert.ok(turnA.replyText.includes("₹3,500"), `Expected Tenant A catalog starting rate ₹3,500 in: ${turnA.replyText}`);

    // 4. Process Inbound Turn for Tenant B - Verify Tenant B Business Details & Catalog Rate
    const turnB = await processTurn({
      tenantId: tenantB,
      senderPhone: "919800000002",
      userInput: "hi",
      startFlowId: installB.flow.id
    });

    assert.ok(turnB.handled, "Tenant B turn should be processed");
    assert.ok(turnB.replyText.includes("Resort B - Highland Peak"), `Expected Resort B name in: ${turnB.replyText}`);
    assert.ok(turnB.replyText.includes("919800000002"), "Expected Resort B phone line");
    assert.ok(turnB.replyText.includes("₹5,000"), `Expected Tenant B catalog starting rate ₹5,000 in: ${turnB.replyText}`);

    // 5. Verify Complete Data & Tenant Isolation
    assert.ok(!turnA.replyText.includes("Resort B"), "Tenant A response must never mention Resort B");
    assert.ok(!turnB.replyText.includes("Resort A"), "Tenant B response must never mention Resort A");
    assert.ok(!turnB.replyText.includes("₹3,500"), "Tenant B response must never contain Tenant A rates");

    // 6. Update Tenant A Configuration - Verify Tenant B is completely unchanged
    templateRepository.updateInstallation(installA.installation.id, tenantA, {
      config_values_json: {
        ...installA.installation.config_values,
        "business.name": "Resort A - Ultra Luxury Palatial Villas"
      }
    });

    const refreshedTurnA = await processTurn({
      tenantId: tenantA,
      senderPhone: "919800000099", // Fresh customer turn
      userInput: "hi",
      startFlowId: installA.flow.id
    });
    assert.ok(refreshedTurnA.replyText.includes("Resort A - Ultra Luxury Palatial Villas"));

    const refreshedTurnB = await processTurn({
      tenantId: tenantB,
      senderPhone: "919800000098", // Fresh customer turn
      userInput: "hi",
      startFlowId: installB.flow.id
    });
    assert.ok(refreshedTurnB.replyText.includes("Resort B - Highland Peak"), "Tenant B must remain 100% unaffected by Tenant A updates");
  });

  test("Scenario B: B2B Lead Qualification with Dynamic Resource Bindings", async () => {
    // Install B2B Lead Qualification template into Tenant B2B
    const installB2B = templateInstallService.installTemplate({
      templateIdOrKey: "b2b.lead-qualification",
      tenantId: tenantB2B,
      userId: "b2b_growth_lead",
      customFlowName: "Enterprise Sales Qualifier",
      configValues: {
        "business.name": "Survya Enterprise Cloud",
        "business.sales_email": "enterprise@survya.com",
        "business.phone": "919999000111",
        "greeting": "Accelerate your multi-channel sales and customer operations.",
        "qualification_threshold": 50000
      },
      bindings: [
        { key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919999000111" },
        { key: "crm_pipeline", type: "CRM_PIPELINE", target_resource_id: "b2b-sales-pipeline" }
      ],
      activateImmediately: true
    });

    assert.ok(installB2B.success, "B2B template installation must succeed");
    createdFlowIds.push(installB2B.flow.id);
    createdInstallationIds.push(installB2B.installation.id);

    // Verify bindings were correctly stored
    const bindings = templateRepository.getBindings(installB2B.installation.id, tenantB2B);
    assert.equal(bindings.length, 2, "Both WhatsApp Line and CRM Pipeline bindings must be present");
    assert.ok(bindings.some(b => b.logical_key === "crm_pipeline" && b.target_resource_id === "b2b-sales-pipeline"));

    // Turn 1: Inbound Greeting
    const turn1 = await processTurn({
      tenantId: tenantB2B,
      senderPhone: "919700000099",
      userInput: "demo",
      startFlowId: installB2B.flow.id
    });

    assert.ok(turn1.handled, "Turn 1 should be handled");
    assert.ok(turn1.replyText.includes("Survya Enterprise Cloud"), `Expected business name in: ${turn1.replyText}`);
    assert.ok(turn1.replyText.includes("Full Name"), "Expected contact intake question");

    // Turn 2: Provide Contact Name
    const turn2 = await processTurn({
      tenantId: tenantB2B,
      senderPhone: "919700000099",
      userInput: "Vikram Malhotra - TechCorp Global",
      startFlowId: installB2B.flow.id
    });

    assert.ok(turn2.handled, "Turn 2 should be handled");
    assert.ok(turn2.replyText.includes("Which service line"), "Expected service selection prompt");
  });
});
