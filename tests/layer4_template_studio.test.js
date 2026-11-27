/**
 * Layer 4: Template Studio, Marketplace Governance, Level-A Schema Validation,
 * Level-B Customization & Controlled Upgrade Diff Preservation Tests.
 */

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db, getSetting } = require("../src/config/database");
const config = require("../src/config/env");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");
const templateCatalogService = require("../src/modules/templateLibrary/templateCatalogService");

describe("Layer 4: Template Studio Governance, Level-A/B Customization & Safe Upgrades", { concurrency: 1 }, () => {
  let server;
  let baseUrl;
  let ownerAToken;
  let employeeAToken;
  let ownerBToken;
  let platformAdminToken;
  const createdTemplateIds = [];
  const createdInstallationIds = [];
  const createdFlowIds = [];
  const createdUserIds = [];

  before(() => {
    db.prepare(`
      INSERT IGNORE INTO tenants (id, name, slug, status)
      VALUES (9401, 'Horizon Clinic Group', 'horizon-clinic-9401', 'ACTIVE'),
             (9402, 'Apex Logistics Group', 'apex-logistics-9402', 'ACTIVE')
    `).run();

    const hash = bcrypt.hashSync("Layer4Pass!", 8);
    const ts = Date.now();
    const users = [
      { id: `l4_plat_${ts}`, email: `l4_plat_${ts}@survya.local`, role: "SUPER_ADMIN", tenant_id: 1, wsRole: "OWNER" },
      { id: `l4_own_a_${ts}`, email: `l4_own_a_${ts}@survya.local`, role: "ADMIN", tenant_id: 9401, wsRole: "OWNER" },
      { id: `l4_emp_a_${ts}`, email: `l4_emp_a_${ts}@survya.local`, role: "USER", tenant_id: 9401, wsRole: "USER" },
      { id: `l4_own_b_${ts}`, email: `l4_own_b_${ts}@survya.local`, role: "ADMIN", tenant_id: 9402, wsRole: "OWNER" }
    ];

    for (const u of users) {
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
      `).run(u.id, u.id, u.email, `91940${String(Math.floor(1000000 + Math.random() * 8999999))}`, hash, u.role, u.tenant_id);
      db.prepare(`
        INSERT INTO tenant_user_memberships (tenant_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(u.tenant_id, u.id, u.wsRole);
      createdUserIds.push(u.id);
    }

    platformAdminToken = jwt.sign({ id: users[0].id, email: users[0].email, role: "SUPER_ADMIN", tenant_id: 1 }, config.JWT_SECRET);
    ownerAToken = jwt.sign({ id: users[1].id, email: users[1].email, role: "ADMIN", tenant_id: 9401 }, config.JWT_SECRET);
    employeeAToken = jwt.sign({ id: users[2].id, email: users[2].email, role: "USER", tenant_id: 9401 }, config.JWT_SECRET);
    ownerBToken = jwt.sign({ id: users[3].id, email: users[3].email, role: "ADMIN", tenant_id: 9402 }, config.JWT_SECRET);

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const id of createdInstallationIds) {
      try {
        db.prepare("DELETE FROM template_bindings WHERE installation_id = ?").run(id);
        db.prepare("DELETE FROM template_installations WHERE id = ?").run(id);
      } catch (_) {}
    }
    for (const fid of createdFlowIds) {
      try {
        db.prepare("DELETE FROM workflow_triggers WHERE flow_id = ?").run(String(fid));
        db.prepare("DELETE FROM conversation_flow_sessions WHERE flow_id = ?").run(fid);
        db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id = ?").run(fid);
        db.prepare("DELETE FROM conversation_flows WHERE id = ?").run(fid);
      } catch (_) {}
    }
    for (const tid of createdTemplateIds) {
      try {
        db.prepare("DELETE FROM template_versions WHERE template_id = ?").run(tid);
        db.prepare("DELETE FROM template_catalog WHERE id = ?").run(tid);
      } catch (_) {}
    }
    for (const uid of createdUserIds) {
      try {
        db.prepare("DELETE FROM tenant_user_memberships WHERE user_id = ?").run(uid);
        db.prepare("DELETE FROM users WHERE id = ?").run(uid);
      } catch (_) {}
    }
    try {
      db.prepare("DELETE FROM tenants WHERE id IN (9401, 9402)").run();
    } catch (_) {}
    const { closeTestResources } = require("./helpers/testFixtures");
    await closeTestResources(server);
  });

  test("1. Master Template RBAC: Platform Admin creates PUBLIC master; Workspace Owner only creates PRIVATE; Employee blocked", async () => {
    // Workspace Owner tries to publish PUBLIC -> 403
    const badPubRes = await fetch(`${baseUrl}/api/v1/template-library`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        template_key: `l4.illegal_public.${Date.now()}`,
        title: "Unauthorized Master",
        visibility: "PUBLIC"
      })
    });
    assert.equal(badPubRes.status, 403);

    // Workspace Owner creates PRIVATE template -> 201 and isolated from Tenant B
    const privRes = await fetch(`${baseUrl}/api/v1/template-library`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        template_key: `l4.priv.${Date.now()}`,
        title: "Tenant A Private Flow",
        industry: "CLINIC",
        category: "APPOINTMENT"
      })
    });
    assert.equal(privRes.status, 201);
    const privBody = await privRes.json();
    assert.equal(privBody.template.visibility, "PRIVATE");
    createdTemplateIds.push(privBody.template.id);

    const bView = await fetch(`${baseUrl}/api/v1/template-library/${privBody.template.id}`, {
      headers: { Authorization: `Bearer ${ownerBToken}` }
    });
    assert.equal(bView.status, 404);

    // Platform Admin creates PUBLIC master template v1.0.0
    const masterKey = `l4.master.clinic.${Date.now()}`;
    const pubRes = await fetch(`${baseUrl}/api/v1/template-library`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformAdminToken}` },
      body: JSON.stringify({
        template_key: masterKey,
        title: "Clinic Intake Master",
        visibility: "PUBLIC",
        industry: "CLINIC",
        category: "APPOINTMENT",
        current_version: "1.0.0",
        config_schema: {
          "business.name": { type: "string", label: "Clinic Name", required: true },
          "business.phone": { type: "phone", label: "Desk Phone", required: true }
        },
        required_bindings: [
          { key: "sender_line", type: "WHATSAPP_LINE", required: true }
        ],
        graph_json: {
          nodes: [
            { id: "n_start", type: "START", title: "Start", config: { keywords: ["clinic_go"], matchType: "CONTAINS" } },
            { id: "n_msg", type: "MESSAGE", title: "Master Welcome", config: { text: "Welcome to {{config.business.name}} ({{config.business.phone}})." } },
            { id: "n_end", type: "END", title: "Done", config: {} }
          ],
          transitions: [
            { id: "e1", source: "n_start", target: "n_msg", sourceHandle: "default" },
            { id: "e2", source: "n_msg", target: "n_end", sourceHandle: "default" }
          ],
          variables: {}
        }
      })
    });
    assert.equal(pubRes.status, 201);
    const pubBody = await pubRes.json();
    createdTemplateIds.push(pubBody.template.id);

    // Employee blocked from installing template
    const empInstall = await fetch(`${baseUrl}/api/v1/template-library/${pubBody.template.id}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${employeeAToken}` },
      body: JSON.stringify({
        configValues: { "business.name": "Horizon Clinic", "business.phone": "919822001122" },
        bindings: [{ key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919822001122" }]
      })
    });
    assert.equal(empInstall.status, 403);
  });

  test("2. Level-A Validation & Level-B Customizations Preserved Across Controlled Template Upgrade (v1.0.0 -> v1.1.0)", async () => {
    const masterId = createdTemplateIds[1];

    // Owner A installs v1.0.0
    const instRes = await fetch(`${baseUrl}/api/v1/template-library/${masterId}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        customFlowName: "Horizon Intake Flow",
        configValues: { "business.name": "Horizon Dental Studio", "business.phone": "+91 98220 01122" },
        bindings: [{ key: "sender_line", type: "WHATSAPP_LINE", target_resource_id: "919822001122" }],
        activateImmediately: true
      })
    });
    assert.equal(instRes.status, 201);
    const instBody = await instRes.json();
    const installationId = instBody.installation.id;
    const flowId = instBody.flow.id;
    createdInstallationIds.push(installationId);
    createdFlowIds.push(flowId);

    // Level-A Config PATCH rejects invalid phone with 400
    const badPatch = await fetch(`${baseUrl}/api/v1/template-installations/${installationId}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({
        configValues: { "business.phone": "123" }
      })
    });
    assert.equal(badPatch.status, 400);

    // Employee blocked from PATCH config -> 403
    const empPatch = await fetch(`${baseUrl}/api/v1/template-installations/${installationId}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${employeeAToken}` },
      body: JSON.stringify({
        configValues: { "business.name": "Hijacked Name" }
      })
    });
    assert.equal(empPatch.status, 403);

    // Level-B Customization: Tenant Owner customizes n_msg AND inserts custom node n_custom_hours
    const customNodes = [
      { id: "n_start", type: "START", title: "Start", config: { keywords: ["clinic_go"], matchType: "CONTAINS" } },
      { id: "n_msg", type: "MESSAGE", title: "Tenant Custom Greeting", config: { text: "Hello from {{config.business.name}} customized studio!" } },
      { id: "n_custom_hours", type: "MESSAGE", title: "Custom Timing Note", config: { text: "Open Mon-Sat 9am-8pm." } },
      { id: "n_end", type: "END", title: "Done", config: {} }
    ];
    const customTransitions = [
      { id: "e1", source: "n_start", target: "n_msg", sourceHandle: "default" },
      { id: "e_cust_1", source: "n_msg", target: "n_custom_hours", sourceHandle: "default" },
      { id: "e_cust_2", source: "n_custom_hours", target: "n_end", sourceHandle: "default" }
    ];
    flowService.saveFlowDraft(flowId, { nodes: customNodes, transitions: customTransitions }, { id: "ownerA" }, 9401);
    flowService.publishFlow(flowId, { id: "ownerA" }, 9401);

    // Platform Admin releases v1.1.0 with an additional upstream footer note node & updated n_msg
    const v11Res = await fetch(`${baseUrl}/api/v1/template-library/${masterId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${platformAdminToken}` },
      body: JSON.stringify({
        version_number: "1.1.0",
        changelog: "Added compliance footer node",
        graph_json: {
          nodes: [
            { id: "n_start", type: "START", title: "Start", config: { keywords: ["clinic_go"], matchType: "CONTAINS" } },
            { id: "n_msg", type: "MESSAGE", title: "Master Welcome v1.1", config: { text: "Upstream v1.1 default message" } },
            { id: "n_v11_badge", type: "MESSAGE", title: "Upstream Compliance Note", config: { text: "ISO-9001 Verified Clinic" } },
            { id: "n_end", type: "END", title: "Done", config: {} }
          ],
          transitions: [
            { id: "e1", source: "n_start", target: "n_msg", sourceHandle: "default" },
            { id: "e_v11_1", source: "n_msg", target: "n_v11_badge", sourceHandle: "default" },
            { id: "e_v11_2", source: "n_v11_badge", target: "n_end", sourceHandle: "default" }
          ],
          variables: {}
        }
      })
    });
    assert.equal(v11Res.status, 201);

    // Inspect upgrade availability & diffPreview
    const chkRes = await fetch(`${baseUrl}/api/v1/template-installations/${installationId}/upgrade`, {
      headers: { Authorization: `Bearer ${ownerAToken}` }
    });
    assert.equal(chkRes.status, 200);
    const chkBody = await chkRes.json();
    assert.equal(chkBody.upgradeAvailable, true);
    assert.ok(chkBody.diffPreview);
    assert.equal(chkBody.diffPreview.preservedCustomNodes, 1);
    assert.equal(chkBody.diffPreview.preservedCustomEdits, 1);

    // Execute controlled upgrade
    const upgRes = await fetch(`${baseUrl}/api/v1/template-installations/${installationId}/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerAToken}` },
      body: JSON.stringify({ targetVersionNumber: "1.1.0", preserveCustomizations: true })
    });
    assert.equal(upgRes.status, 200);
    const upgBody = await upgRes.json();
    assert.equal(upgBody.installedVersion, "1.1.0");
    assert.equal(upgBody.upgradeSummary.preservedCustomNodes, 1);
    assert.equal(upgBody.upgradeSummary.preservedCustomEdits, 1);

    // Execute live turn against upgraded flow: verify Level-A config + Level-B overrides & custom node are preserved!
    const turn = await flowEngine.processTurn({
      tenantId: 9401,
      senderPhone: "919822990011",
      userInput: "clinic_go",
      startFlowId: flowId
    });
    assert.equal(turn.handled, true);
    assert.ok(turn.replyText.includes("Horizon Dental Studio"));
    assert.ok(turn.replyText.includes("customized studio"));
    assert.ok(turn.replyText.includes("ISO-9001 Verified Clinic"));
    assert.ok(turn.replyText.includes("Open Mon-Sat 9am-8pm."));
    // Ensure Tenant 1's BOT_BUSINESS_NAME stayed untouched by Tenant 9401 operations
    assert.notEqual(getSetting("BOT_BUSINESS_NAME"), "Horizon Dental Studio");
  });
});
