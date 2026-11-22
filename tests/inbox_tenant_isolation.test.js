const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function capturedDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        get(...args) {
          calls.push({ method: 'get', sql, args });
          if (/as total\b/i.test(sql)) return { total: 0 };
          if (/as unread\b/i.test(sql)) return { unread: 0 };
          if (/as count\b/i.test(sql)) return { count: 0 };
          return null;
        },
        all(...args) {
          calls.push({ method: 'all', sql, args });
          return [];
        },
        run(...args) {
          calls.push({ method: 'run', sql, args });
          return { changes: 1, lastInsertRowid: 10 };
        }
      };
    }
  };
}

function loadModule(relativePath, moduleRequire, globals = {}) {
  const file = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', source);
  fn(moduleRequire, mod, mod.exports, globals.process || process, path.dirname(file));
  return mod.exports;
}

function makeWebhookService(db, spies = {}) {
  return loadModule('src/services/webhookService.js', name => {
    if (name === '../config/database') return { db, getSetting: () => null, setSetting() {} };
    if (name === '../config/env') return {};
    if (name === '../utils/timeUtil') return { parseMysqlUtcTimestamp: () => null };
    if (name === './broadcastEngine') return { emit() {} };
    if (name === './workflow/conversationContextResolver') return { resolveWhatsAppContext: () => null };
    if (name === './metaWhatsAppService') return {
      sendTextMessage: async args => {
        spies.sent = args;
        return { messageId: 'wamid.test' };
      }
    };
    if (['fs', 'path', 'crypto'].includes(name)) return require(name);
    return {};
  });
}

test('inbox list and analytics are always filtered to caller tenant', () => {
  const db = capturedDb();
  const service = makeWebhookService(db);
  const result = service.getReplies({ tenantId: 71, limit: 20, repliesOnly: true });
  assert.equal(result.totalCount, 0);
  const count = db.calls.find(c => /COUNT\(\*\) as total/i.test(c.sql));
  const unread = db.calls.find(c => /as unread/i.test(c.sql));
  const distinct = db.calls.find(c => /COUNT\(DISTINCT/i.test(c.sql));
  assert.match(count.sql, /m\.tenant_id = \?/);
  assert.match(count.sql, /m\.deleted_at IS NULL/);
  assert.match(count.sql, /c\.tenant_id as tenant_id/);
  assert.match(count.sql, /r\.tenant_id as tenant_id/);
  assert.deepEqual(count.args, [71]);
  assert.deepEqual(unread.args, [71]);
  assert.deepEqual(distinct.args, [71]);
  const rows = db.calls.find(c => c.method === 'all' && /SELECT \* FROM combined_messages m/i.test(c.sql));
  assert.equal(rows.args[0], 71);
  const templates = db.calls.find(c => /FROM templates/i.test(c.sql));
  assert.deepEqual(templates.args, [71]);
});

test('conversation history applies tenant constraints to both union branches', () => {
  const db = capturedDb();
  const service = makeWebhookService(db);
  const history = service.getConversationMessages({ phone: '+91 98765 43210', tenantId: 19, limit: 30 });
  assert.equal(history.total, 0);
  assert.deepEqual(history.messages, []);
  const count = db.calls.find(c => /COUNT\(\*\) as total FROM combined_messages m/i.test(c.sql));
  assert.match(count.sql, /r\.tenant_id = \?/);
  assert.match(count.sql, /c\.tenant_id = \?/);
  assert.match(count.sql, /r\.deleted_at IS NULL/);
  assert.equal(count.args[0], 19);
  assert.equal(count.args[4], 19);
  const rows = db.calls.find(c => c.method === 'all' && /SELECT \* FROM combined_messages m/i.test(c.sql));
  assert.equal(rows.args[0], 19);
  assert.equal(rows.args[4], 19);
  assert.equal(rows.args[7], 19);
});

test('read operations and archive are scoped; archive never deletes message rows', () => {
  const db = capturedDb();
  const service = makeWebhookService(db);
  service.markAsRead(3, 25);
  service.markAllAsRead(25);
  service.markConversationAsRead('+91 87654 32109', 25);
  service.deleteReply(3, 25, 'staff-3');
  service.deleteConversation('+91 87654 32109', 25, 'staff-3');
  const writes = db.calls.filter(c => c.method === 'run');
  assert.equal(writes.length, 5);
  assert.deepEqual(writes[0].args, [3, 25]);
  assert.deepEqual(writes[1].args, [25]);
  assert.equal(writes[2].args[0], 25);
  assert.deepEqual(writes[3].args, ['staff-3', 3, 25]);
  assert.equal(writes[4].args[1], 25);
  writes.forEach(c => {
    assert.match(c.sql, /tenant_id = \?/);
    assert.doesNotMatch(c.sql, /DELETE FROM customer_replies/i);
  });
});

test('unauthorized tenant cannot send manual reply to another tenant message', async () => {
  const db = capturedDb();
  const spies = {};
  const service = makeWebhookService(db, spies);
  await assert.rejects(() => service.sendManualReply({
    replyId: 500, replyText: 'Hello', userId: 'agent42', tenantId: 42
  }), /not found/);
  const lookup = db.calls.find(c => /SELECT \* FROM customer_replies/i.test(c.sql));
  assert.match(lookup.sql, /tenant_id = \?/);
  assert.deepEqual(lookup.args, [500, 42]);
  assert.equal(spies.sent, undefined);
});

test('metadata-based unknown live WhatsApp sender is rejected before DB insert', () => {
  const db = capturedDb();
  const service = makeWebhookService(db);
  const result = service.saveCustomerReply(
    { id: 'wamid.untrusted', from: '919999999999', type: 'text', text: { body: 'hi' } },
    [], { metadata: { phone_number_id: 'unknown-line-id' } }
  );
  assert.equal(result, null);
  assert.equal(db.calls.length, 0);
});

test('schema defines additive tenant ownership and soft-hide migrations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/config/schema.js'), 'utf8');
  for (const key of ['tenant_id', 'channel_account_id', 'deleted_at', 'deleted_by']) {
    assert.match(source, new RegExp('customer_replies ADD COLUMN ' + key));
  }
  assert.match(source, /ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 1/);
});

test('production webhook requires a valid HMAC even with bypass env flag', () => {
  const controller = loadModule('src/controllers/webhookController.js', name => {
    if (name === 'crypto') return crypto;
    if (name === '../services/webhookService') return {};
    if (name === '../config/database') return { getSetting: () => null, db: {} };
    if (name === '../config/env') return { META_APP_SECRET: 'test-real-secret' };
    throw new Error('Unexpected import ' + name);
  }, { process: { env: { NODE_ENV: 'production', VERIFY_WEBHOOK_SIGNATURE: 'false' } } });
  const body = Buffer.from('{"entry":[]}');
  const mac = crypto.createHmac('sha256', 'test-real-secret').update(body).digest('hex');
  const req = { rawBody: body, body: { entry: [] }, headers: { 'x-hub-signature-256': 'sha256=' + mac } };
  assert.equal(controller.verifyMetaSignature(req), true);
  assert.equal(controller.verifyMetaSignature({ ...req, headers: {} }), false);
  assert.equal(controller.verifyMetaSignature({ ...req, headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } }), false);
});
