/**
 * AI Flow Architect & Direct WhatsApp Line Assignment Test Suite
 * Tests prompt-to-workflow generation, live capability introspection,
 * line-scoped trigger matching, line re-assignment, and prompt refinement.
 *
 * SAFETY CONSTRAINT: All dispatch assertions run strictly in simulation/mock mode (isSimulation: true).
 */

const { test, describe, before, after } = require('node:test');

// This legacy suite reads and mutates a configured database and may use a
// configured AI provider. It is deliberately opt-in so the default test run
// (and all agent verification) remains completely offline and mock-only.
if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
  test('database integration suite is opt-in', { skip: 'Run only in an explicitly approved isolated test environment.' }, () => {});
} else {
const assert = require('node:assert/strict');
const { db } = require('../src/config/database');
const { buildSystemCapabilitiesContext } = require('../src/services/workflow/aiFlowContextBuilder');
const aiFlowGenerator = require('../src/services/workflow/aiFlowGeneratorService');
const flowService = require('../src/services/conversationFlowService');
const flowApprovalService = require('../src/services/flowApprovalService');
const workflowTriggerService = require('../src/services/workflow/workflowTriggerService');
const flowEngine = require('../src/services/conversationFlowEngine');

describe('AI Flow Architect & WhatsApp Line Binding', () => {
  const TEST_USER = { id: 'test_admin_ai', name: 'AI Test Admin' };
  const LINE_A = '1510764325447375';
  const LINE_B = '999888777666555';
  let createdFlowIds = [];

  function approveAllFlowStages(flowId) {
    const flow = flowService.getFlowById(flowId, 1).flow;
    if (!Number(flow.approval_required)) return;
    for (const stage of flowApprovalService.APPROVAL_STAGES) {
      flowApprovalService.decideApproval({
        flowId,
        stage,
        decision: 'APPROVED',
        note: `Offline review completed for ${stage}.`,
        user: TEST_USER,
        tenantId: 1
      });
    }
  }

  before(() => {
    // Clean up any stale triggers/flows from prior test runs on test lines or test flow names
    try {
      db.prepare("DELETE FROM workflow_triggers WHERE phone_number_id IN (?, ?)").run(LINE_A, LINE_B);
      db.prepare("DELETE FROM conversation_flows WHERE name LIKE '%Line A Dedicated%' OR name LIKE '%Reassignable%' OR name LIKE '%Base Flow%' OR name LIKE '%AI Flow%' OR name LIKE '%Universal Room Booking%' OR name LIKE '%B2B Enterprise%' OR name LIKE '%Beach Cafe%' OR name LIKE '%Dining%'").run();
    } catch (e) {}

    // Ensure test lines exist in waba_phone_numbers for line binding validation
    db.prepare(`
      INSERT OR REPLACE INTO waba_phone_numbers (
        id, display_name, phone_number, phone_number_id, quality_rating, status, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'GREEN', 'VERIFIED', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run('waba_test_line_a', 'Sarvya Main Line', '+91 87665 90634', LINE_A);

    db.prepare(`
      INSERT OR REPLACE INTO waba_phone_numbers (
        id, display_name, phone_number, phone_number_id, quality_rating, status, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'GREEN', 'VERIFIED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run('waba_test_line_b', 'Sarvya Sales Line B', '+91 98765 43210', LINE_B);
  });

  after(() => {
    // Cleanup created test flows
    for (const id of createdFlowIds) {
      try {
        db.prepare('DELETE FROM conversation_flow_events WHERE flow_id = ?').run(id);
        db.prepare('DELETE FROM conversation_flow_sessions WHERE flow_id = ?').run(id);
        db.prepare('DELETE FROM flow_approval_requests WHERE flow_id = ?').run(id);
        db.prepare('DELETE FROM conversation_flow_versions WHERE flow_id = ?').run(id);
        db.prepare('DELETE FROM workflow_triggers WHERE flow_id = ?').run(id);
        db.prepare('DELETE FROM conversation_flows WHERE id = ?').run(id);
      } catch (e) {}
    }
  });

  test('1. Live system introspector fetches real DB resources', () => {
    const context = buildSystemCapabilitiesContext(1, 1);

    assert.ok(context, 'Context must be defined');
    assert.ok(Array.isArray(context.roomTypes), 'Room types must be an array');
    assert.ok(context.roomTypes.length > 0, 'Should find at least 1 seeded room type');
    assert.ok(Array.isArray(context.crmPipelines), 'CRM pipelines must be an array');
    assert.ok(context.crmPipelines.some(p => p.slug === 'b2b-sales-pipeline'), 'Must include b2b-sales-pipeline');
    assert.ok(context.crmPipelines.some(p => p.slug === 'universal-booking-pipeline'), 'Must include universal-booking-pipeline');
    assert.ok(Array.isArray(context.connectedPhoneNumbers), 'Connected phone numbers must be an array');
    assert.ok(context.connectedPhoneNumbers.some(p => p.phone_number_id === LINE_A), 'Line A must be present in connected numbers');
    assert.ok(Array.isArray(context.canonicalNodes), 'Canonical node types must be listed');
    assert.ok(context.canonicalNodes.length >= 12, 'Must define all canonical modern node types');
  });

  test('2. Prompt-to-Workflow Generator creates a reviewable draft and binds Booking Flow to Line A', async () => {
    const result = await aiFlowGenerator.generateFlowFromPrompt({
      prompt: 'Resort room booking flow with live tariff check and instant reservation hold',
      tenantId: 1,
      propertyId: 1,
      phoneNumberId: LINE_A,
      autoPublish: true,
      user: TEST_USER
    });

    assert.ok(result.success, 'Generation must succeed');
    assert.ok(result.flow, 'Flow record must be created');
    createdFlowIds.push(result.flow.id);

    // Verify line assignment
    assert.equal(result.flow.phone_number_id, LINE_A, 'Flow must be bound to Line A');
    assert.equal(result.flow.status, 'DRAFT', 'AI generation must always create a draft for review');
    assert.equal(result.publishedVersion, null, 'AI generation must never auto-publish a flow');
    assert.ok(result.validationReport.isValid, 'Generated flow must be valid');

    // Verify nodes & layout
    const nodes = result.draftVersion.nodes;
    const transitions = result.draftVersion.transitions;
    assert.ok(nodes.length >= 6, 'Flow must contain at least 6 nodes');
    assert.ok(nodes.some(n => n.type === 'TRIGGER_WHATSAPP'), 'Must have TRIGGER_WHATSAPP node');
    assert.ok(nodes.some(n => n.type === 'CATALOG_BOOKING'), 'Must have CATALOG_BOOKING node');
    assert.ok(nodes.some(n => n.type === 'CRM_UPSERT'), 'Must have CRM_UPSERT node');
    assert.ok(nodes.some(n => n.type === 'WAIT_DELAY'), 'Must have WAIT_DELAY node');
    assert.ok(nodes.every(n => n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'), 'All nodes must have layout coordinates');

    // Draft generation must not activate an inbound trigger.
    const triggerRow = db.prepare('SELECT * FROM workflow_triggers WHERE flow_id = ? AND phone_number_id = ?').get(result.flow.id, LINE_A);
    assert.equal(triggerRow, undefined, 'Draft flow must not register an inbound trigger');
  });

  test('3. B2B Sales Prompt creates valid CRM-wired qualification flow', async () => {
    const result = await aiFlowGenerator.generateFlowFromPrompt({
      prompt: 'B2B enterprise sales qualification flow with budget branch and AE routing',
      tenantId: 1,
      propertyId: 1,
      phoneNumberId: null, // Global
      user: TEST_USER
    });

    assert.ok(result.success, 'B2B Generation must succeed');
    assert.ok(result.flow, 'Flow record must be created');
    createdFlowIds.push(result.flow.id);

    const nodes = result.draftVersion.nodes;
    assert.ok(nodes.some(n => n.type === 'CONDITION'), 'Must contain CONDITION node for budget evaluation');
    assert.ok(nodes.some(n => n.type === 'CRM_UPSERT' && (n.config?.pipeline === 'b2b-sales-pipeline' || n.config?.stage === 'SQL')), 'Must contain CRM_UPSERT targeting B2B pipeline');
    assert.ok(result.validationReport.isValid, 'B2B flow graph must pass validation');
  });

  test('4. Line-scoped Inbound Routing: Line A triggers Line A flow, Line B is excluded', async () => {
    const vipKeyword = 'alpha_vip_' + Date.now();

    // Create Flow 1 on Line A
    const flowA = flowService.createFlow({
      name: 'Line A Dedicated Concierge',
      phone_number_id: LINE_A,
      initialNodes: [
        { id: 'trg_a', type: 'TRIGGER_WHATSAPP', title: 'Trigger A', config: { triggerType: 'KEYWORD', keywords: [vipKeyword], matchType: 'CONTAINS' }, position: { x: 100, y: 100 } },
        { id: 'msg_a', type: 'SEND_MESSAGE', title: 'Msg A', config: { text: 'Welcome to Line A dedicated concierge!' }, position: { x: 100, y: 200 } },
        { id: 'end_a', type: 'END', title: 'End A', config: { farewellMessage: 'Goodbye A' }, position: { x: 100, y: 300 } }
      ],
      initialTransitions: [
        { id: 'ta1', source: 'trg_a', target: 'msg_a', sourceHandle: 'default' },
        { id: 'ta2', source: 'msg_a', target: 'end_a', sourceHandle: 'default' }
      ]
    }, TEST_USER);
    createdFlowIds.push(flowA.flow.id);
    flowService.publishFlow(flowA.flow.id, TEST_USER);

    // 1. Inbound on Line A matching vipKeyword
    const matchLineA = workflowTriggerService.matchInboundTrigger(1, {
      text: `Hello ${vipKeyword} please`,
      phone: '919876543210',
      phoneNumberId: LINE_A
    });
    assert.ok(matchLineA, 'Inbound message on Line A must match Line A trigger');
    assert.equal(String(matchLineA.flowId), String(flowA.flow.id), 'Must match flowA ID');

    // 2. Inbound on Line B with same text
    const matchLineB = workflowTriggerService.matchInboundTrigger(1, {
      text: `Hello ${vipKeyword} please`,
      phone: '919876543210',
      phoneNumberId: LINE_B
    });
    assert.equal(matchLineB, null, 'Inbound message on Line B must NOT match Line A trigger');

    // 3. Inbound with unstated / null line (global fallback check)
    const matchGlobal = workflowTriggerService.matchInboundTrigger(1, {
      text: `Hello ${vipKeyword} please`,
      phone: '919876543210',
      phoneNumberId: null
    });
    assert.ok(matchGlobal, 'Global query can see all active triggers');
  });

  test('5. Reassign flow to another line via assignFlowToLine updates triggers immediately', () => {
    const flow = flowService.createFlow({
      name: 'Reassignable Flow',
      phone_number_id: LINE_A,
      initialNodes: [
        { id: 'trg_r', type: 'TRIGGER_WHATSAPP', title: 'Trigger R', config: { triggerType: 'KEYWORD', keywords: ['reassign_key'], matchType: 'CONTAINS' }, position: { x: 100, y: 100 } },
        { id: 'end_r', type: 'END', title: 'End R', config: { farewellMessage: 'Bye' }, position: { x: 100, y: 200 } }
      ],
      initialTransitions: [
        { id: 'tr1', source: 'trg_r', target: 'end_r', sourceHandle: 'default' }
      ]
    }, TEST_USER);
    createdFlowIds.push(flow.flow.id);
    flowService.publishFlow(flow.flow.id, TEST_USER);

    // Verify initial trigger is on Line A
    const initialTrg = db.prepare('SELECT phone_number_id FROM workflow_triggers WHERE flow_id = ?').get(flow.flow.id);
    assert.equal(initialTrg.phone_number_id, LINE_A, 'Initial trigger must be on Line A');

    // Reassign flow to Line B
    const updated = flowService.assignFlowToLine(flow.flow.id, LINE_B, TEST_USER);
    assert.equal(updated.flow.phone_number_id, LINE_B, 'Flow record must now be bound to Line B');

    // Verify triggers table updated immediately
    const updatedTrg = db.prepare('SELECT phone_number_id FROM workflow_triggers WHERE flow_id = ?').get(flow.flow.id);
    assert.equal(updatedTrg.phone_number_id, LINE_B, 'workflow_triggers must now reflect Line B');

    // Reassign flow to ALL lines (null)
    const unbound = flowService.assignFlowToLine(flow.flow.id, 'ALL', TEST_USER);
    assert.equal(unbound.flow.phone_number_id, null, 'Flow record must now have phone_number_id = null');

    const unboundTrg = db.prepare('SELECT phone_number_id FROM workflow_triggers WHERE flow_id = ?').get(flow.flow.id);
    assert.equal(unboundTrg.phone_number_id, null, 'workflow_triggers must have phone_number_id = null');
  });

  test('6. Prompt-based iterative refiner inserts delay and payment nodes', async () => {
    // Create base flow
    const base = flowService.createFlow({
      name: 'Refinable Base Flow',
      initialNodes: [
        { id: 'trg_b', type: 'TRIGGER_WHATSAPP', title: 'Trigger', config: { triggerType: 'KEYWORD', keywords: ['base_bot'], matchType: 'CONTAINS' }, position: { x: 100, y: 100 } },
        { id: 'msg_b', type: 'SEND_MESSAGE', title: 'Welcome', config: { text: 'Hello!' }, position: { x: 100, y: 200 } },
        { id: 'end_b', type: 'END', title: 'End', config: { farewellMessage: 'Bye' }, position: { x: 100, y: 300 } }
      ],
      initialTransitions: [
        { id: 'tb1', source: 'trg_b', target: 'msg_b', sourceHandle: 'default' },
        { id: 'tb2', source: 'msg_b', target: 'end_b', sourceHandle: 'default' }
      ]
    }, TEST_USER);
    createdFlowIds.push(base.flow.id);

    // Refine: Add a 15-minute follow-up delay
    const refinedDelay = await aiFlowGenerator.refineFlowWithAi({
      flowId: base.flow.id,
      prompt: 'Add a 15-minute follow-up delay before ending',
      user: TEST_USER
    });

    assert.ok(refinedDelay.success, 'Refinement must succeed');
    assert.ok(refinedDelay.draftVersion.nodes.some(n => n.type === 'WAIT_DELAY'), 'Must have added WAIT_DELAY node');

    // Refine: Add UPI payment step
    const refinedPay = await aiFlowGenerator.refineFlowWithAi({
      flowId: base.flow.id,
      prompt: 'Add a direct UPI payment link step',
      user: TEST_USER
    });

    assert.ok(refinedPay.success, 'Payment refinement must succeed');
    assert.ok(refinedPay.draftVersion.nodes.some(n => n.type === 'SEND_MESSAGE' && n.config?.text?.includes('UPI')), 'Must have added UPI payment step');
  });

  test('7. End-to-end simulated turn on Line A executes safely without live message dispatch', async () => {
    // Generate a dining order flow as a draft, then explicitly publish it for
    // this in-memory routing test only. No WhatsApp API call is made.
    const gen = await aiFlowGenerator.generateFlowFromPrompt({
      prompt: 'beach cafe dining table order with instant UPI payment link',
      phoneNumberId: LINE_A,
      autoPublish: true,
      user: TEST_USER
    });
    createdFlowIds.push(gen.flow.id);
    assert.equal(gen.flow.status, 'DRAFT', 'Generator must not auto-publish even when asked');
    approveAllFlowStages(gen.flow.id);
    flowService.publishFlow(gen.flow.id, TEST_USER);

    const senderPhone = '919876543299';

    // Step 1: Inbound Trigger match on Line A with 'menu please'
    const matched = workflowTriggerService.matchInboundTrigger(1, {
      text: 'please share the cafe menu',
      phone: senderPhone,
      phoneNumberId: LINE_A
    });

    assert.ok(matched, 'Must match the generated flow trigger on Line A');
    assert.equal(String(matched.flowId), String(gen.flow.id), 'Matched flowId must equal generated flow ID');

    // Step 2: Process conversation turn strictly in simulation mode
    const turnResult = await flowEngine.processTurn({
      senderPhone,
      userInput: 'please share the cafe menu',
      startFlowId: matched.flowId,
      startNodeId: matched.nodeId,
      phoneNumberId: LINE_A,
      context: {
        tenantId: 1,
        propertyId: 1,
        channel: 'WHATSAPP',
        isSimulation: true, // STRICT MOCK & SANDBOX SAFETY DIRECTIVE
        phoneNumberId: LINE_A
      }
    });

    assert.ok(turnResult.handled, 'Turn must be handled by flow engine');
    assert.ok(turnResult.replyText, 'Flow must generate conversational reply text');
    assert.ok(turnResult.replyText.toLowerCase().includes('welcome') || turnResult.replyText.toLowerCase().includes('cafe') || turnResult.replyText.toLowerCase().includes('table'), 'Reply must contain cafe greeting or table prompt');
  });
});
}
