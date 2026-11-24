/**
 * Unified Conversation Flow Module Test Suite
 * Tests multi-step flow execution, CALL_SUBFLOW delegation & return,
 * global Back / Menu / Agent navigation, pre-publish graph validation,
 * and live session audit traces.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../src/config/database');
const flowEngine = require('../src/services/conversationFlowEngine');
const flowService = require('../src/services/conversationFlowService');
const flowGlobalSettingsService = require('../src/services/flowGlobalSettingsService');
const workflowTriggerService = require('../src/services/workflow/workflowTriggerService');

test('Unified Flow Module: Pre-Publish Graph Validator Enforcements', (t) => {
  // 1. Self-loop rejection
  const loopReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      { id: 'msg_1', type: 'SEND_MESSAGE', data: { text: 'Hello' } }
    ],
    [
      { source: 'start_1', target: 'msg_1' },
      { source: 'msg_1', target: 'msg_1' } // Self-loop
    ]
  );
  assert.equal(loopReport.isValid, false, 'Self-loop should invalidate graph');
  assert.ok(loopReport.errors.some(e => e.includes('Self-loop')), 'Error should mention self-loop');

  // 2. Meta limit: >3 quick-reply buttons rejected
  const btnCountReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      {
        id: 'btn_menu',
        type: 'BUTTON_MENU',
        data: {
          messageType: 'BUTTONS',
          options: [
            { id: 'b1', title: 'Option 1' },
            { id: 'b2', title: 'Option 2' },
            { id: 'b3', title: 'Option 3' },
            { id: 'b4', title: 'Option 4' } // 4th button exceeds WhatsApp limit of 3
          ]
        }
      }
    ],
    [{ source: 'start_1', target: 'btn_menu' }]
  );
  assert.equal(btnCountReport.isValid, false, '>3 buttons should invalidate graph');
  assert.ok(btnCountReport.errors.some(e => e.includes('limit of 3')), 'Error should mention limit of 3 buttons');

  // 3. Meta limit: button title >20 characters rejected
  const btnLenReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      {
        id: 'btn_menu',
        type: 'BUTTON_MENU',
        data: {
          messageType: 'BUTTONS',
          options: [{ id: 'b1', title: 'This title has way more than twenty characters' }]
        }
      }
    ],
    [{ source: 'start_1', target: 'btn_menu' }]
  );
  assert.equal(btnLenReport.isValid, false, 'Button title >20 chars should invalidate graph');
  assert.ok(btnLenReport.errors.some(e => e.includes('20-character limit')), 'Error should mention 20-character limit');

  // 4. Meta limit: >10 list rows rejected
  const listCountReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      {
        id: 'list_menu',
        type: 'BUTTON_MENU',
        data: {
          messageType: 'LIST',
          options: Array.from({ length: 11 }, (_, i) => ({ id: `row_${i}`, title: `Item ${i}` }))
        }
      }
    ],
    [{ source: 'start_1', target: 'list_menu' }]
  );
  assert.equal(listCountReport.isValid, false, '>10 list rows should invalidate graph');
  assert.ok(listCountReport.errors.some(e => e.includes('limit of 10')), 'Error should mention limit of 10 list rows');

  // 5. Meta limit: list row title >24 characters rejected
  const listLenReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      {
        id: 'list_menu',
        type: 'BUTTON_MENU',
        data: {
          messageType: 'LIST',
          options: [{ id: 'row_1', title: 'This is a list row title exceeding twenty-four chars' }]
        }
      }
    ],
    [{ source: 'start_1', target: 'list_menu' }]
  );
  assert.equal(listLenReport.isValid, false, 'List row title >24 chars should invalidate graph');
  assert.ok(listLenReport.errors.some(e => e.includes('24-character limit')), 'Error should mention 24-character limit');
});

test('Unified Flow Module: Global Settings Persistence & Retrieval', () => {
  const settings = flowGlobalSettingsService.getSettings(1, null);
  assert.ok(Array.isArray(settings.menu_keywords), 'menu_keywords should be array');
  assert.ok(Array.isArray(settings.back_keywords), 'back_keywords should be array');
  assert.ok(Array.isArray(settings.handoff_keywords), 'handoff_keywords should be array');
  assert.ok(settings.session_ttl_minutes > 0, 'session_ttl_minutes should be positive');

  const updated = flowGlobalSettingsService.updateSettings(1, null, {
    menu_keywords: ['menu', 'restart', 'home'],
    back_keywords: ['0', 'back', 'prev'],
    handoff_keywords: ['agent', 'human', 'support']
  });

  assert.ok(updated.menu_keywords.includes('home'), 'Updated menu keywords should persist');
  assert.ok(updated.back_keywords.includes('prev'), 'Updated back keywords should persist');
});

test('Unified Flow Module: Modular Sub-Flow Execution & Return', async () => {
  // 1. Create Child Sub-Flow
  const subRes = flowService.createFlow({
    name: 'Child Subflow Journey',
    trigger_type: 'TRIGGER_EVENT',
    tenant_id: 1,
    flow_role: 'SUBFLOW'
  }, { id: 'admin', name: 'Admin' });
  const subflowId = subRes.flow.id;

  flowService.saveFlowDraft(subflowId, {
    nodes: [
      { id: 'sub_start', type: 'START' },
      { id: 'sub_step', type: 'SEND_MESSAGE', data: { text: 'Child Subflow Executed' } },
      { id: 'sub_end', type: 'END' }
    ],
    transitions: [
      { source: 'sub_start', target: 'sub_step' },
      { source: 'sub_step', target: 'sub_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(subflowId, { id: 'admin', name: 'Admin' }, 1);

  // 2. Create Parent Flow invoking Child Sub-Flow
  const parentRes = flowService.createFlow({
    name: 'Parent Orchestrator Flow',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['subflowunit']),
    tenant_id: 1,
    flow_role: 'MAIN'
  }, { id: 'admin', name: 'Admin' });
  const parentFlowId = parentRes.flow.id;

  flowService.saveFlowDraft(parentFlowId, {
    nodes: [
      { id: 'p_start', type: 'START' },
      { id: 'p_call', type: 'CALL_SUBFLOW', data: { targetFlowId: subflowId, returnHandle: 'completed' } },
      { id: 'p_after', type: 'SEND_MESSAGE', data: { text: 'Parent Resumed After Subflow' } },
      { id: 'p_end', type: 'END' }
    ],
    transitions: [
      { source: 'p_start', target: 'p_call' },
      { source: 'p_call', target: 'p_after', sourceHandle: 'completed' },
      { source: 'p_after', target: 'p_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(parentFlowId, { id: 'admin', name: 'Admin' }, 1);

  // 3. Process Turn (Zero Live Dispatch, Mock State)
  const testPhone = '919999900010';
  db.prepare('DELETE FROM conversation_flow_sessions WHERE sender_phone = ?').run(testPhone);

  const turnRes = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'subflowunit',
    startFlowId: parentFlowId,
    context: { tenantId: 1, isSimulation: false }
  });

  assert.equal(turnRes.handled, true, 'Turn should be handled');
  assert.equal(turnRes.sessionStatus, 'COMPLETED', 'Session should complete after subflow returns and parent ends');
  assert.ok(turnRes.replyText.includes('Child Subflow Executed'), 'Output should contain subflow message');
  assert.ok(turnRes.replyText.includes('Parent Resumed After Subflow'), 'Output should contain parent resumed message');

  // Clean up
  db.prepare('DELETE FROM conversation_flow_events WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flow_sessions WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flow_versions WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flows WHERE id IN (?, ?)').run(subflowId, parentFlowId);
});

test('Unified Flow Module: Global Back, Menu, and Agent Navigation', async () => {
  const escapeRes = flowService.createFlow({
    name: 'Multi-Step Escape Test Flow',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['escapetestunit']),
    tenant_id: 1,
    flow_role: 'MAIN'
  }, { id: 'admin', name: 'Admin' });
  const flowId = escapeRes.flow.id;

  flowService.saveFlowDraft(flowId, {
    nodes: [
      { id: 'esc_start', type: 'START' },
      {
        id: 'esc_step1',
        type: 'BUTTON_MENU',
        data: {
          text: 'Step 1: Choose option',
          messageType: 'BUTTONS',
          options: [{ id: 'opt_1', title: 'Option 1' }, { id: 'opt_2', title: 'Option 2' }]
        }
      },
      {
        id: 'esc_step2',
        type: 'BUTTON_MENU',
        data: {
          text: 'Step 2: Confirm selection',
          messageType: 'BUTTONS',
          options: [{ id: 'opt_yes', title: 'Yes' }, { id: 'opt_no', title: 'No' }]
        }
      },
      { id: 'esc_end', type: 'END' }
    ],
    transitions: [
      { source: 'esc_start', target: 'esc_step1' },
      { source: 'esc_step1', target: 'esc_step2', sourceHandle: 'opt_1' },
      { source: 'esc_step1', target: 'esc_step2', sourceHandle: 'opt_2' },
      { source: 'esc_step2', target: 'esc_end', sourceHandle: 'opt_yes' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(flowId, { id: 'admin', name: 'Admin' }, 1);

  const testPhone = '919999900020';
  db.prepare('DELETE FROM conversation_flow_sessions WHERE sender_phone = ?').run(testPhone);

  // Turn 1: Trigger -> Pauses at esc_step1
  const t1 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'escapetestunit',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t1.currentNodeId, 'esc_step1', 'Should pause at step 1');
  assert.equal(t1.sessionStatus, 'ACTIVE', 'Status should be ACTIVE');

  // Turn 2: Select Option 1 -> Moves to esc_step2
  const t2 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'Option 1',
    userPayload: { id: 'opt_1' },
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t2.currentNodeId, 'esc_step2', 'Should pause at step 2');

  // Turn 3: User sends '0' (Back keyword) -> Returns to esc_step1
  const t3 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: '0',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t3.currentNodeId, 'esc_step1', 'Back keyword should restore step 1');
  assert.ok(t3.replyText.includes('Step 1: Choose option'), 'Should re-prompt step 1');

  // Turn 4: User sends 'agent' (Handoff keyword) -> Pauses with PAUSED_AGENT_HANDOFF
  const t4 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'agent',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t4.sessionStatus, 'PAUSED_AGENT_HANDOFF', 'Handoff keyword should pause session for agent');
  assert.ok(t4.replyText.includes('agent'), 'Should confirm agent connection');

  // Turn 5: Test Session Reset API
  const resetRes = flowService.resetSession(t1.sessionId, 1);
  assert.equal(resetRes.success, true, 'Session reset should succeed');
  assert.equal(resetRes.status, 'CANCELLED', 'Session status should become CANCELLED');

  // Clean up
  db.prepare('DELETE FROM conversation_flow_events WHERE flow_id = ?').run(flowId);
  db.prepare('DELETE FROM conversation_flow_sessions WHERE flow_id = ?').run(flowId);
  db.prepare('DELETE FROM conversation_flow_versions WHERE flow_id = ?').run(flowId);
  db.prepare('DELETE FROM conversation_flows WHERE id = ?').run(flowId);
});

test('Unified Flow Module: Trigger Conflict Detection Across Phone Lines', () => {
  const result = workflowTriggerService.detectTriggerConflicts(1);
  assert.ok(typeof result.totalConflicts === 'number', 'totalConflicts should be number');
  assert.ok(Array.isArray(result.conflicts), 'conflicts should be array');
});
