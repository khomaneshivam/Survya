/**
 * Unified Conversation Flow Module Test Suite
 * Tests multi-step flow execution (Start -> Menu -> Ask Input -> Condition -> Sub-Flow -> Return to Parent -> End),
 * CALL_SUBFLOW delegation & return, global Back / Menu / Agent navigation, pre-publish graph validation,
 * and live session audit traces under TZ=Asia/Kolkata.
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

  // 6. Sub-flow node missing targetFlowId rejected
  const subflowMissingReport = flowService.validateFlowGraph(
    [
      { id: 'start_1', type: 'START' },
      { id: 'sub_1', type: 'CALL_SUBFLOW', data: {} }
    ],
    [{ source: 'start_1', target: 'sub_1' }]
  );
  assert.equal(subflowMissingReport.isValid, false, 'Missing targetFlowId should invalidate graph');
  assert.ok(subflowMissingReport.errors.some(e => e.includes('target flow')), 'Error should mention target flow');
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
    handoff_keywords: ['agent', 'human', 'support'],
    fallback_message: 'Custom fallback: please type menu.'
  });

  assert.ok(updated.menu_keywords.includes('home'), 'Updated menu keywords should persist');
  assert.ok(updated.back_keywords.includes('prev'), 'Updated back keywords should persist');
  assert.equal(updated.fallback_message, 'Custom fallback: please type menu.');
});

test('Unified Flow Module: Full Multi-Step Flow Execution (Start -> Menu -> Ask Input -> Condition -> Sub-Flow -> Return -> End)', async () => {
  // 1. Create Child Sub-Flow
  const subRes = flowService.createFlow({
    name: 'Order Confirmation Sub-Flow',
    trigger_type: 'TRIGGER_EVENT',
    tenant_id: 1,
    flow_role: 'SUBFLOW'
  }, { id: 'admin', name: 'Admin' });
  const subflowId = subRes.flow.id;

  flowService.saveFlowDraft(subflowId, {
    nodes: [
      { id: 'sub_start', type: 'START' },
      { id: 'sub_step', type: 'SEND_MESSAGE', data: { text: 'Sub-Flow: Order confirmed for {{customer_name}}.' } },
      { id: 'sub_end', type: 'END' }
    ],
    transitions: [
      { source: 'sub_start', target: 'sub_step' },
      { source: 'sub_step', target: 'sub_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(subflowId, { id: 'admin', name: 'Admin' }, 1);

  // 2. Create Parent Multi-Step Flow: Start -> Menu -> Ask Input -> Condition -> Sub-Flow -> Return -> End
  const parentRes = flowService.createFlow({
    name: 'Multi-Step Parent Journey',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['multistepunit']),
    tenant_id: 1,
    flow_role: 'MAIN'
  }, { id: 'admin', name: 'Admin' });
  const parentFlowId = parentRes.flow.id;

  flowService.saveFlowDraft(parentFlowId, {
    nodes: [
      { id: 'n_start', type: 'START' },
      {
        id: 'n_menu',
        type: 'BUTTON_MENU',
        data: {
          text: 'Welcome! Choose a service:',
          messageType: 'BUTTONS',
          options: [
            { id: 'svc_order', title: 'Place Order' },
            { id: 'svc_info', title: 'Get Info' }
          ]
        }
      },
      {
        id: 'n_ask_name',
        type: 'ASK_INPUT',
        data: {
          questionText: 'Please enter your full name:',
          variableName: 'customer_name'
        }
      },
      {
        id: 'n_condition',
        type: 'CONDITION',
        data: {
          variable: 'customer_name',
          operator: 'not_empty'
        }
      },
      {
        id: 'n_call_sub',
        type: 'CALL_SUBFLOW',
        data: {
          targetFlowId: subflowId,
          returnHandle: 'completed'
        }
      },
      {
        id: 'n_parent_final',
        type: 'SEND_MESSAGE',
        data: {
          text: 'Parent Final: Thank you {{customer_name}}, process complete!'
        }
      },
      { id: 'n_end', type: 'END' }
    ],
    transitions: [
      { source: 'n_start', target: 'n_menu' },
      { source: 'n_menu', target: 'n_ask_name', sourceHandle: 'svc_order' },
      { source: 'n_ask_name', target: 'n_condition' },
      { source: 'n_condition', target: 'n_call_sub', sourceHandle: 'matched' },
      { source: 'n_call_sub', target: 'n_parent_final', sourceHandle: 'completed' },
      { source: 'n_parent_final', target: 'n_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(parentFlowId, { id: 'admin', name: 'Admin' }, 1);

  const testPhone = '919999900030';
  db.prepare('DELETE FROM conversation_flow_sessions WHERE sender_phone = ?').run(testPhone);

  // Turn 1: Inbound Trigger -> Pauses at Menu (n_menu)
  const t1 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'multistepunit',
    startFlowId: parentFlowId,
    context: { tenantId: 1, isSimulation: false }
  });
  assert.equal(t1.handled, true, 'Turn 1 should be handled');
  assert.equal(t1.currentNodeId, 'n_menu', 'Turn 1 should pause at n_menu');
  assert.ok(t1.replyInteractive.options.some(o => o.id === 'svc_order'), 'Menu should present svc_order');

  // Turn 2: User clicks 'Place Order' -> Transitions to Ask Input (n_ask_name)
  const t2 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'Place Order',
    userPayload: { id: 'svc_order' },
    startFlowId: parentFlowId,
    context: { tenantId: 1, isSimulation: false }
  });
  assert.equal(t2.handled, true, 'Turn 2 should be handled');
  assert.equal(t2.currentNodeId, 'n_ask_name', 'Turn 2 should pause at n_ask_name');
  assert.ok(t2.replyText.includes('enter your full name'), 'Prompt should ask for full name');

  // Turn 3: User enters name 'Shivam Khomane' -> Evaluates Condition -> Calls Sub-Flow -> Returns to Parent -> Reaches End!
  const t3 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'Shivam Khomane',
    startFlowId: parentFlowId,
    context: { tenantId: 1, isSimulation: false }
  });
  assert.equal(t3.handled, true, 'Turn 3 should be handled');
  assert.equal(t3.sessionStatus, 'COMPLETED', 'Session should complete cleanly after subflow returns and parent finishes');
  assert.equal(t3.collectedData.customer_name, 'Shivam Khomane', 'customer_name variable should be preserved');
  assert.ok(t3.replyText.includes('Sub-Flow: Order confirmed for Shivam Khomane'), 'Subflow message should be executed and rendered');
  assert.ok(t3.replyText.includes('Parent Final: Thank you Shivam Khomane, process complete!'), 'Parent final message should be rendered');

  // Clean up
  db.prepare('DELETE FROM conversation_flow_events WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flow_sessions WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flow_versions WHERE flow_id IN (?, ?)').run(subflowId, parentFlowId);
  db.prepare('DELETE FROM conversation_flows WHERE id IN (?, ?)').run(subflowId, parentFlowId);
});

test('Unified Flow Module: Global Back, Menu, and Agent Navigation', async () => {
  // 1. Create Root Menu Flow
  const rootRes = flowService.createFlow({
    name: 'Root Menu Flow',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['rootmenuunit']),
    tenant_id: 1,
    flow_role: 'ROOT_MENU',
    is_root_menu: 1
  }, { id: 'admin', name: 'Admin' });
  const rootFlowId = rootRes.flow.id;

  flowService.saveFlowDraft(rootFlowId, {
    nodes: [
      { id: 'r_start', type: 'START' },
      { id: 'r_menu', type: 'SEND_MESSAGE', data: { text: 'Main Menu: Select an option.' } },
      { id: 'r_end', type: 'END' }
    ],
    transitions: [
      { source: 'r_start', target: 'r_menu' },
      { source: 'r_menu', target: 'r_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(rootFlowId, { id: 'admin', name: 'Admin' }, 1);

  // Set root flow in global settings
  flowGlobalSettingsService.updateSettings(1, null, {
    root_flow_id: rootFlowId,
    menu_keywords: ['menu', 'restart', 'main menu'],
    back_keywords: ['0', 'back', 'previous'],
    handoff_keywords: ['agent', 'human', 'help']
  });

  // 2. Create Multi-Step Interactive Flow for Escape Testing
  const escRes = flowService.createFlow({
    name: 'Escape Nav Flow',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['escapenavunit']),
    tenant_id: 1,
    flow_role: 'MAIN'
  }, { id: 'admin', name: 'Admin' });
  const flowId = escRes.flow.id;

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

  const testPhone = '919999900040';
  db.prepare('DELETE FROM conversation_flow_sessions WHERE sender_phone = ?').run(testPhone);

  // Turn 1: Trigger -> Pauses at esc_step1
  const t1 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'escapenavunit',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t1.currentNodeId, 'esc_step1', 'Should pause at step 1');

  // Turn 2: Select Option 1 -> Moves to esc_step2
  const t2 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'Option 1',
    userPayload: { id: 'opt_1' },
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t2.currentNodeId, 'esc_step2', 'Should pause at step 2');

  // Turn 3: User sends '0' (Back keyword) -> Returns to esc_step1 cleanly
  const t3 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: '0',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t3.currentNodeId, 'esc_step1', 'Back keyword should restore step 1');
  assert.ok(t3.replyText.includes('Step 1: Choose option'), 'Should re-prompt step 1');

  // Turn 4: User sends 'menu' (Restart keyword) -> Resets stacks and routes to Root Menu Flow!
  const t4 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'menu',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.ok(t4.replyText.includes('Main Menu: Select an option'), 'Menu keyword should route to Root Menu flow');

  // Turn 5: User triggers flow again and sends 'agent' (Handoff keyword) -> Transitions to PAUSED_AGENT_HANDOFF
  const t5a = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'escapenavunit',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  const t5b = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'agent',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });
  assert.equal(t5b.sessionStatus, 'PAUSED_AGENT_HANDOFF', 'Handoff keyword should pause session for agent');

  // Clean up
  db.prepare('DELETE FROM conversation_flow_events WHERE flow_id IN (?, ?)').run(rootFlowId, flowId);
  db.prepare('DELETE FROM conversation_flow_sessions WHERE flow_id IN (?, ?)').run(rootFlowId, flowId);
  db.prepare('DELETE FROM conversation_flow_versions WHERE flow_id IN (?, ?)').run(rootFlowId, flowId);
  db.prepare('DELETE FROM conversation_flows WHERE id IN (?, ?)').run(rootFlowId, flowId);
});

test('Unified Flow Module: Live Sessions API & Audit Trace', async () => {
  // 1. Create a quick test flow
  const flowRes = flowService.createFlow({
    name: 'Live Session Test Flow',
    trigger_type: 'KEYWORD_MATCH',
    trigger_keywords_json: JSON.stringify(['livesessionunit']),
    tenant_id: 1,
    flow_role: 'MAIN'
  }, { id: 'admin', name: 'Admin' });
  const flowId = flowRes.flow.id;

  flowService.saveFlowDraft(flowId, {
    nodes: [
      { id: 'ls_start', type: 'START' },
      { id: 'ls_ask', type: 'ASK_INPUT', data: { questionText: 'What is your room number?', variableName: 'room_no' } },
      { id: 'ls_end', type: 'END' }
    ],
    transitions: [
      { source: 'ls_start', target: 'ls_ask' },
      { source: 'ls_ask', target: 'ls_end' }
    ]
  }, { id: 'admin', name: 'Admin' }, 1);
  flowService.publishFlow(flowId, { id: 'admin', name: 'Admin' }, 1);

  const testPhone = '919999900050';
  db.prepare('DELETE FROM conversation_flow_sessions WHERE sender_phone = ?').run(testPhone);

  const t1 = await flowEngine.processTurn({
    senderPhone: testPhone,
    userInput: 'livesessionunit',
    startFlowId: flowId,
    context: { tenantId: 1 }
  });

  assert.ok(t1.sessionId, 'Session ID should be created');

  // 2. Test listSessions API
  const sessionRes = flowService.listSessions(null, { limit: 10 }, 1);
  const sessionList = sessionRes?.executions || sessionRes?.data || (Array.isArray(sessionRes) ? sessionRes : []);
  assert.ok(Array.isArray(sessionList), 'listSessions should return array of executions');
  const foundSession = sessionList.find(s => s.id === t1.sessionId);
  assert.ok(foundSession, 'Created session should appear in session list');
  assert.equal(foundSession.sender_phone, testPhone, 'Sender phone should match');

  // 3. Test getSessionEvents API
  const trace = flowService.getSessionEvents(t1.sessionId, 1);
  assert.ok(trace.session, 'Trace should contain session details');
  assert.ok(Array.isArray(trace.events), 'Trace should contain event array');
  assert.ok(trace.events.length > 0, 'Trace events should be logged');

  // 4. Test resetSession API
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
