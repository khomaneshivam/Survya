const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db } = require("../src/config/database");
const flowService = require("../src/services/conversationFlowService");
const flowEngine = require("../src/services/conversationFlowEngine");
const { getPath, interpolateTemplate } = require("../src/services/workflow/expressionEvaluator");
const workflowTriggerService = require("../src/services/workflow/workflowTriggerService");
const runtimeCache = require("../src/services/workflow/runtimeCache");

describe("Layer 3: Unified Configurable Workflow Engine, Version Pinning & Multi-Domain Execution", { concurrency: 1 }, () => {
  const createdFlowIds = [];
  const createdTenantIds = [];

  before(() => {
    db.prepare(`
      INSERT IGNORE INTO tenants (id, name, slug, status)
      VALUES (931, 'Smile Dental Clinic', 'smile-dental-931', 'ACTIVE'),
             (932, 'CloudScale B2B SaaS', 'cloudscale-b2b-932', 'ACTIVE')
    `).run();
    createdTenantIds.push(931, 932);
  });

  after(() => {
    for (const tid of createdTenantIds) {
      try {
        db.prepare("DELETE FROM conversation_flow_sessions WHERE tenant_id = ?").run(tid);
        db.prepare("DELETE FROM workflow_triggers WHERE tenant_id = ?").run(tid);
        runtimeCache.invalidateTriggers(tid);
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
    try {
      db.prepare("DELETE FROM tenants WHERE id IN (931, 932)").run();
    } catch (_) {}
  });

  test("1. Live session stays pinned to published v1 when v2 is published; new sessions run v2; rollback restores v1", async () => {
    const v1Nodes = [
      { id: "s1", type: "TRIGGER_WHATSAPP", config: { keywords: ["vpin_start"], matchType: "CONTAINS" } },
      { id: "m1", type: "COLLECT_INPUT", config: { prompt: "Version 1 Prompt: What is your name?", saveAs: "guest_name", inputType: "TEXT" } },
      { id: "e1", type: "SEND_MESSAGE", config: { text: "V1 Finished for {{guest_name}}" } },
      { id: "end1", type: "END", config: {} }
    ];
    const v1Transitions = [
      { source: "s1", target: "m1" },
      { source: "m1", target: "e1", sourceHandle: "valid" },
      { source: "e1", target: "end1" }
    ];

    const created = flowService.createFlow({
      tenant_id: 931,
      name: "Version Pinning Test Flow",
      nodes: v1Nodes,
      transitions: v1Transitions
    }, { id: "owner-931" });
    const flowId = created.flow.id;
    createdFlowIds.push(flowId);

    const pubV1 = flowService.publishFlow(flowId, { id: "owner-931" }, 931);
    const v1Id = pubV1.publishedVersion.id;

    // Customer A starts on v1
    const custAPhone = "919931000101";
    const tA1 = await flowEngine.processTurn({
      senderPhone: custAPhone,
      userInput: "vpin_start",
      startFlowId: flowId,
      context: { tenantId: 931, isSimulation: false }
    });
    assert.equal(tA1.handled, true);
    assert.match(tA1.replyText, /Version 1 Prompt/);

    // Publish v2 with modified messages
    const v2Nodes = [
      { id: "s1", type: "TRIGGER_WHATSAPP", config: { keywords: ["vpin_start"], matchType: "CONTAINS" } },
      { id: "m1", type: "COLLECT_INPUT", config: { prompt: "Version 2 Prompt: Tell us your name?", saveAs: "guest_name", inputType: "TEXT" } },
      { id: "e1", type: "SEND_MESSAGE", config: { text: "V2 Finished for {{guest_name}}" } },
      { id: "end1", type: "END", config: {} }
    ];
    flowService.saveFlowDraft(flowId, { nodes: v2Nodes, transitions: v1Transitions }, { id: "owner-931" }, 931);
    const pubV2 = flowService.publishFlow(flowId, { id: "owner-931" }, 931);
    const v2Id = pubV2.publishedVersion.id;
    assert.notEqual(v2Id, v1Id);

    // New Customer B starts on v2
    const custBPhone = "919931000102";
    const tB1 = await flowEngine.processTurn({
      senderPhone: custBPhone,
      userInput: "vpin_start",
      startFlowId: flowId,
      context: { tenantId: 931, isSimulation: false }
    });
    assert.match(tB1.replyText, /Version 2 Prompt/);

    // Customer A resumes -> MUST remain pinned on v1 ("V1 Finished for ...")
    const sessA = flowEngine.getActiveSession(931, custAPhone);
    assert.equal(sessA.flow_version_id, v1Id);
    const tA2 = await flowEngine.processTurn({
      senderPhone: custAPhone,
      userInput: "Aarav",
      context: { tenantId: 931, isSimulation: false }
    });
    assert.match(tA2.replyText, /V1 Finished for Aarav/);

    // Rollback to v1 -> Customer C starts on rolled-back v1
    flowService.rollbackFlow(flowId, pubV1.publishedVersion.version_number, { id: "owner-931" }, 931);
    flowService.publishFlow(flowId, { id: "owner-931" }, 931);
    const custCPhone = "919931000103";
    const tC1 = await flowEngine.processTurn({
      senderPhone: custCPhone,
      userInput: "vpin_start",
      startFlowId: flowId,
      context: { tenantId: 931, isSimulation: false }
    });
    assert.match(tC1.replyText, /Version 1 Prompt/);
  });

  test("2. Multi-domain tenant isolation: Clinic Appointment vs B2B SaaS execute zero hospitality defaults", async () => {
    const clinicNodes = [
      { id: "c_start", type: "TRIGGER_WHATSAPP", config: { keywords: ["dental_appt"], matchType: "CONTAINS" } },
      { id: "c_msg", type: "SEND_MESSAGE", config: { text: "Welcome to {{property.name}} Dental Care. Reply with preferred slot." } },
      { id: "c_end", type: "END", config: {} }
    ];
    const clinicCreated = flowService.createFlow({
      tenant_id: 931,
      name: "Dental Appointment Flow",
      nodes: clinicNodes,
      transitions: [{ source: "c_start", target: "c_msg" }, { source: "c_msg", target: "c_end" }]
    }, { id: "owner-931" });
    createdFlowIds.push(clinicCreated.flow.id);
    flowService.publishFlow(clinicCreated.flow.id, { id: "owner-931" }, 931);
    workflowTriggerService.syncFlowTriggers(931, clinicCreated.flow.id, clinicNodes);

    const clinicTurn = await flowEngine.processTurn({
      senderPhone: "919931000201",
      userInput: "dental_appt",
      startFlowId: clinicCreated.flow.id,
      context: { tenantId: 931, isSimulation: false }
    });
    assert.equal(clinicTurn.handled, true);
    assert.equal(clinicTurn.replyText.includes("Hotel Green Vally"), false);
    assert.equal(clinicTurn.replyText.includes("KonkanTrip"), false);

    // B2B tenant 932
    const b2bNodes = [
      { id: "b_start", type: "TRIGGER_WHATSAPP", config: { keywords: ["saas_demo"], matchType: "CONTAINS" } },
      { id: "b_msg", type: "SEND_MESSAGE", config: { text: "CloudScale SaaS Enterprise Desk ready." } },
      { id: "b_end", type: "END", config: {} }
    ];
    const b2bCreated = flowService.createFlow({
      tenant_id: 932,
      name: "B2B Demo Flow",
      nodes: b2bNodes,
      transitions: [{ source: "b_start", target: "b_msg" }, { source: "b_msg", target: "b_end" }]
    }, { id: "owner-932" });
    createdFlowIds.push(b2bCreated.flow.id);
    flowService.publishFlow(b2bCreated.flow.id, { id: "owner-932" }, 932);

    const b2bTurn = await flowEngine.processTurn({
      senderPhone: "919932000202",
      userInput: "saas_demo",
      startFlowId: b2bCreated.flow.id,
      context: { tenantId: 932, isSimulation: false }
    });
    assert.match(b2bTurn.replyText, /CloudScale SaaS/);
    assert.equal(b2bTurn.replyText.includes("Hotel Green Vally"), false);
  });

  test("3. Security & Stability: Blocks prototype-chain expressions and stops cyclic graph via maxHops", async () => {
    const obj = { guest_name: "Meera" };
    assert.equal(getPath(obj, "constructor"), undefined);
    assert.equal(getPath(obj, "__proto__"), undefined);
    assert.equal(getPath(obj, "toString"), undefined);
    assert.equal(interpolateTemplate("Hi {{guest_name}} {{constructor}} {{__proto__.polluted}}", obj), "Hi Meera  ");

    const loopResult = await flowEngine.processTurn({
      senderPhone: "919931000301",
      userInput: "go",
      context: {
        isSimulation: true,
        flowOverride: {
          nodes: [
            { id: "n1", type: "START", config: {} },
            { id: "n2", type: "SET_VARIABLE", config: { targetVar: "x", value: "1" } },
            { id: "n3", type: "SET_VARIABLE", config: { targetVar: "y", value: "2" } }
          ],
          transitions: [
            { source: "n1", target: "n2" },
            { source: "n2", target: "n3" },
            { source: "n3", target: "n2" }
          ]
        }
      }
    });
    assert.equal(loopResult.handled, true);
    assert.ok(loopResult.executionLogs.some(l => l.includes("[Hop 25]")));
  });
});
