const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const EventEmitter = require('node:events');

function load(relativePath, overrides = {}, fakeProcess = process) {
  const file = path.join(__dirname, '..', relativePath);
  const src = fs.readFileSync(file, 'utf8');
  const mod = { exports: {} };
  const resolver = name => {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) return overrides[name];
    if (['crypto', 'events'].includes(name)) return require(name);
    throw new Error('Unmocked module import: ' + name);
  };
  new Function('require', 'module', 'exports', 'process', '__dirname', src)(
    resolver, mod, mod.exports, fakeProcess, path.dirname(file)
  );
  return mod.exports;
}
function response() {
  return {
    statusCode: 200, payload: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
    send(value) { this.payload = value; return this; }
  };
}
function handler(enqueueJob, fakeProcess = { env: { NODE_ENV: 'development', VERIFY_WEBHOOK_SIGNATURE: 'false' } }) {
  return load('src/controllers/webhookController.js', {
    '../services/webhookService': {},
    '../config/database': { db: {}, getSetting: () => null },
    '../config/env': { META_APP_SECRET: 'local-secret' },
    '../services/queue/jobQueueService': { enqueueJob }
  }, fakeProcess);
}

test('Meta returns 200 only after durable queue confirms persistence', () => {
  const queued = [];
  const ctl = handler(job => {
    queued.push(job);
    return { success: true, jobId: 9 };
  });
  const rawBody = Buffer.from(JSON.stringify({ entry: [{ id: 'waba-stable-id' }] }));
  const req = { body: { entry: [{ id: 'waba-stable-id' }] }, rawBody, headers: {} };
  const first = response();
  const second = response();
  ctl.handleIncomingEvent(req, first);
  ctl.handleIncomingEvent(req, second);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload, 'EVENT_RECEIVED');
  assert.equal(second.statusCode, 200);
  assert.equal(queued.length, 2);
  assert.equal(queued[0].jobType, 'META_WEBHOOK_INGEST');
  assert.equal(queued[0].queueName, 'webhook');
  assert.equal(queued[0].tenantId, 0);
  assert.equal(queued[0].idempotencyKey, queued[1].idempotencyKey);
  assert.match(queued[0].idempotencyKey, /^meta_ingest_[a-f0-9]{64}$/);
});

test('failed enqueue returns 503 so Meta can retry', () => {
  const ctl = handler(() => { throw new Error('DB unavailable'); });
  const res = response();
  ctl.handleIncomingEvent({ body: { entry: [] }, headers: {} }, res);
  assert.equal(res.statusCode, 503);
  assert.match(res.payload.message, /Temporary webhook ingestion failure/);
});

test('missing live signature is rejected before touching durable queue', () => {
  let enqueues = 0;
  const ctl = handler(() => { enqueues++; return { success: true }; }, {
    env: { NODE_ENV: 'production', VERIFY_WEBHOOK_SIGNATURE: 'false' }
  });
  const res = response();
  ctl.handleIncomingEvent({ body: { entry: [] }, rawBody: Buffer.from('{}'), headers: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(enqueues, 0);
});

test('webhook worker dispatches the persisted payload through the existing parser', async () => {
  const events = [];
  const workerModule = load('src/services/queue/jobWorkerEngine.js', {
    '../../config/asyncDb': { getAsyncPool() { throw Error('Not used'); } },
    '../../config/database': { db: {} },
    '../inapp/inappSseManager': {},
    '../webhookService': {
      async processIncomingPayload(payload) { events.push(payload); return { processed: 1 }; }
    }
  });
  const worker = new workerModule.JobWorkerEngine({ queueName: 'webhook' });
  const data = { entry: [{ id: 'test' }] };
  const result = await worker.handlers.get('META_WEBHOOK_INGEST')(data, { id: 4 });
  assert.deepEqual(events, [data]);
  assert.equal(result.processed, 1);
});

test('worker is started on boot and stopped before DB close', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(code, /webhookWorker\.start\(\)/);
  assert.match(code, /await webhookWorker\.stop\(\)/);
});

test('private inbound media is guarded before public static files', () => {
  const code = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const authGate = code.indexOf('app.use("/uploads/inbound", authenticateToken');
  const staticRoot = code.indexOf('express.static(publicPath');
  assert.ok(authGate > 0 && staticRoot > authGate);
  assert.match(code, /WHERE tenant_id = \? AND deleted_at IS NULL/);
  assert.match(code, /Cache-Control", "private, no-store"/);
});
