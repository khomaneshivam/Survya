/**
 * Regression tests for the tenant/channel-scoped workflow foundation.
 * Pure tests: no Meta credentials or production database required.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function evaluate(relPath, fakeRequire) {
  const source = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', source)(fakeRequire, mod, mod.exports);
  return mod.exports;
}

function createRegistry() {
  return evaluate('src/services/workflow/nodeExecutors/index.js', name => ({
    execute: () => name
  }));
}

function fakeDb(accounts, flow = null, property = null) {
  return { prepare(sql) {
    return {
      all(id) { return accounts.filter(r => r.phone_number_id === id).slice(0, 2); },
      get() { return /conversation_flows/.test(sql) ? flow : property; }
    };
  } };
}

test('inbound unknown and ambiguous channel IDs fail closed', () => {
  const { resolveWhatsAppContext } = require('../src/services/workflow/conversationContextResolver');
  assert.equal(resolveWhatsAppContext(null), null);
  assert.equal(resolveWhatsAppContext('missing', { database: fakeDb([]) }), null);
  assert.equal(resolveWhatsAppContext('phone', {
    database: fakeDb([
      { phone_number_id: 'phone', tenant_id: 3 },
      { phone_number_id: 'phone', tenant_id: 4 }
    ])
  }), null);
  assert.equal(resolveWhatsAppContext('phone', {
    database: fakeDb([{ phone_number_id: 'phone', tenant_id: 0 }])
  }), null);
});

test('simulation fallback is explicit', () => {
  const { resolveWhatsAppContext } = require('../src/services/workflow/conversationContextResolver');
  assert.deepEqual(resolveWhatsAppContext(null, { simulation: true }), {
    tenantId: 1, propertyId: 1, channelAccountId: null
  });
});

test('business line selects the correct tenant and bound property', () => {
  const { resolveWhatsAppContext } = require('../src/services/workflow/conversationContextResolver');
  assert.deepEqual(resolveWhatsAppContext('line-42', {
    database: fakeDb([{ phone_number_id: 'line-42', tenant_id: 42 }], { property_id: 18 })
  }), { tenantId: 42, propertyId: 18, channelAccountId: 'line-42' });
  assert.equal(resolveWhatsAppContext('line-42', {
    database: fakeDb([{ phone_number_id: 'line-42', tenant_id: 42 }], null, { id: 99 })
  }).propertyId, 99);
});

test('node registry rejects invalid nodes and accepts trusted extensions', () => {
  const registry = createRegistry();
  assert.equal(typeof registry.getNodeExecutor('SEND_MESSAGE').execute, 'function');
  assert.equal(typeof registry.getNodeExecutor('AGENT_HANDOFF').execute, 'function');
  assert.throws(() => registry.getNodeExecutor('UNRECOGNIZED_NODE'), { code: 'UNSUPPORTED_WORKFLOW_NODE' });
  assert.throws(() => registry.getNodeExecutor(null), { code: 'UNSUPPORTED_WORKFLOW_NODE' });
  assert.throws(() => registry.registerNodeExecutor('SEND_MESSAGE', { execute() {} }), /Already registered/);
  registry.registerNodeExecutor('CUSTOM_ACTION', { execute: () => 42 });
  assert.equal(registry.getNodeExecutor('CUSTOM_ACTION').execute(), 42);
});

test('publish validation rejects unsupported node types', () => {
  const registry = createRegistry();
  const service = evaluate('src/services/conversationFlowService.js', name => {
    if (name === 'crypto') return require('node:crypto');
    if (name === '../config/database') return { db: {} };
    if (name === './workflow/runtimeCache') return { invalidateFlow() {}, invalidateTriggers() {} };
    if (name === './workflow/nodeExecutors') return registry;
    throw new Error('Unexpected dependency: ' + name);
  });
  const nodes = [
    { id: 'start', type: 'START', config: {} },
    { id: 'finish', type: 'END', config: {} }
  ];
  const transitions = [{ source: 'start', target: 'finish' }];
  assert.equal(service.validateFlowGraph(nodes, transitions).isValid, true);
  const broken = [
    ...nodes,
    { id: 'bad', type: 'UNRECOGNIZED_NODE', config: {} }
  ];
  const result = service.validateFlowGraph(broken, [
    ...transitions,
    { source: 'start', target: 'bad' }
  ]);
  assert.equal(result.isValid, false);
  assert.match(result.errors.join(' '), /unsupported type/i);
});

test('active session lookup uses channel-account-scoped key', () => {
  const calls = [];
  const db = {
    prepare(sql) {
      return { get(...args) {
        calls.push({ sql, args });
        return { last_interaction_at: null, expires_at: null, created_at: null, session_status: 'ACTIVE' };
      } };
    }
  };
  const engine = evaluate('src/services/conversationFlowEngine.js', name => {
    if (name === '../config/database') return { db, getSetting: () => '30' };
    if (name === '../utils/timeUtil') return { parseMysqlUtcTimestamp: v => v ? new Date(v) : null };
    return {};
  });
  engine.getActiveSession(42, '+91 90000 12345', 'line-a');
  engine.getActiveSession(42, '+91 90000 12345', 'line-b');
  assert.deepEqual(calls[0].args, [42, 'WHATSAPP:919000012345:42:line-a']);
  assert.deepEqual(calls[1].args, [42, 'WHATSAPP:919000012345:42:line-b']);
  assert.match(calls[0].sql, /s\.tenant_id = \? AND s\.session_key = \?/);
});

test('legacy hospital fallback is explicitly excluded for non-legacy tenants', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/webhookService.js'), 'utf8');
  assert.match(source, /matchInboundTrigger\(tenantId,/);
  assert.match(source, /tenantId !== 1\) return null/);
  assert.match(source, /resolveWhatsAppContext\(incomingPhoneId,/);
});
