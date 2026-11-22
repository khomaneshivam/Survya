const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function moduleSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function backendFlowService() {
  const registry = { getNodeExecutor(type) {
    if (!['SCHEMA_INPUT', 'TRIGGER_WHATSAPP', 'END'].includes(type)) throw new Error('Unknown node type');
    return { execute() {} };
  }};
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', moduleSource('src/services/conversationFlowService.js'))(
    name => {
      if (name === 'crypto') return require('node:crypto');
      if (name === '../config/database') return { db: {} };
      if (name === './workflow/runtimeCache') return { invalidateFlow() {}, invalidateTriggers() {} };
      if (name === './workflow/nodeExecutors') return registry;
      throw new Error('Unknown dependency: ' + name);
    }, mod, mod.exports
  );
  return mod.exports;
}
function validate(config) {
  return backendFlowService().validateFlowGraph(
    [
      { id: 'start', type: 'TRIGGER_WHATSAPP', config: {} },
      { id: 'question', type: 'SCHEMA_INPUT', config },
      { id: 'end', type: 'END', config: {} }
    ],
    [
      { source: 'start', target: 'question' },
      { source: 'question', target: 'end', sourceHandle: 'valid' }
    ]
  );
}

test('configurable question passes backend validation for industry-neutral fields', () => {
  const ok = validate({
    prompt: 'What is your preferred appointment date?',
    saveAs: 'appointment.date',
    inputType: 'DATE',
    maxRetries: 3
  });
  assert.equal(ok.isValid, true, ok.errors.join(', '));
});

test('configurable question rejects unsafe paths and unrecognized answer types', () => {
  const invalid = validate({
    prompt: 'What is your name?',
    saveAs: '__proto__.admin',
    inputType: 'JAVASCRIPT',
    maxRetries: 50
  });
  assert.equal(invalid.isValid, false);
  assert.match(invalid.errors.join(' '), /safe variable name/);
  assert.match(invalid.errors.join(' '), /unsupported answer type/);
  assert.match(invalid.errors.join(' '), /between 1 and 10 retries/);
});

test('configurable question reuses tested intake executor and collects response', async () => {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', moduleSource('src/services/workflow/nodeExecutors/intakeExecutor.js'))(
    name => {
      if (name === '../expressionEvaluator') return { interpolateTemplate: x => x };
      throw new Error('Unexpected import ' + name);
    }, mod, mod.exports
  );
  const node = {
    id: 'ask_email',
    type: 'SCHEMA_INPUT',
    config: { prompt: 'Your email?', saveAs: 'contact_email', inputType: 'EMAIL', maxRetries: 3 }
  };
  const initial = await mod.exports.execute(node, { session: {}, userInput: '', isWaitingForThisNode: false });
  assert.equal(initial.action, 'WAIT_FOR_INPUT');
  const reply = await mod.exports.execute(node, { session: {}, userInput: 'CLIENT@EXAMPLE.COM', isWaitingForThisNode: true });
  assert.equal(reply.nextHandle, 'valid');
  assert.equal(reply.updatedData.contact_email, 'client@example.com');
});

test('configurable question descriptor exposes declarative fields and output branches', () => {
  const js = moduleSource('frontend/src/components/flow-studio/nodeDefinitions.js');
  assert.match(js, /type: 'SCHEMA_INPUT'/);
  assert.match(js, /configFields: \[/);
  assert.match(js, /key: 'saveAs'/);
  assert.match(js, /key: 'inputType'/);
  assert.match(js, /id: 'max_retries'/);
});

test('frontend uses schema-driven inspector and validates on the client too', () => {
  const inspector = moduleSource('frontend/src/components/flow-studio/NodeInspectorDrawer.jsx');
  const schemaComponent = moduleSource('frontend/src/components/flow-studio/SchemaDrivenConfigFields.jsx');
  const validator = moduleSource('frontend/src/components/flow-studio/flowGraphValidator.js');
  assert.match(inspector, /<SchemaDrivenConfigFields/);
  assert.match(inspector, /getNodeDefinition\(node\.type\)\?\.configFields/);
  assert.match(schemaComponent, /fields\.filter/);
  assert.match(schemaComponent, /field\.type === 'select'/);
  assert.match(validator, /type === 'SCHEMA_INPUT'/);
  assert.match(validator, /Choose a safe variable name/);
});
