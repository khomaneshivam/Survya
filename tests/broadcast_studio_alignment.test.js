const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../src/config/env');
const { db } = require('../src/config/database');
const apiRoutes = require('../src/routes/apiRoutes');

describe('WhatsApp Broadcast Studio End-to-End Alignment Test Suite', () => {
  let server = null;
  let baseUrl = '';
  let adminToken = '';
  const testCampaignIds = [];

  before(async () => {
    let admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (!admin) {
      const adminId = 'admin_studio_' + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status)
        VALUES (?, 'Studio Admin', 'studio_admin@test.internal', '919999999993', 'hash', 'ADMIN', 'ACTIVE')
      `).run(adminId);
      admin = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    }
    adminToken = jwt.sign({ userId: admin.id, email: admin.email, role: 'ADMIN' }, config.JWT_SECRET, { expiresIn: '1h' });

    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(() => {
    if (server) server.close();
    for (const cId of testCampaignIds) {
      try {
        db.prepare('DELETE FROM campaigns WHERE id = ?').run(cId);
        db.prepare('DELETE FROM campaign_recipients WHERE campaign_id = ?').run(cId);
      } catch (e) {}
    }
  });

  test('1. Loads approved templates via /api/broadcast/templates', async () => {
    const res = await fetch(`${baseUrl}/api/broadcast/templates`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const templates = data.templates || data.data || [];
    assert.ok(Array.isArray(templates));
    assert.ok(templates.length > 0);
  });

  test('2. Returns category breakdown via /api/broadcast/templates/categories', async () => {
    const res = await fetch(`${baseUrl}/api/broadcast/templates/categories`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.categories));
    const allCat = data.categories.find(c => c.key === 'ALL');
    assert.ok(allCat);
    assert.ok(allCat.count >= 0);
  });

  test('3. Returns registered sender lines via /api/phone-numbers', async () => {
    const res = await fetch(`${baseUrl}/api/phone-numbers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length > 0);
    const hasDefault = data.data.some(p => p.is_default);
    assert.ok(hasDefault);
  });

  test('4. Dispatches scheduled broadcast with contact parsing and sender resolution', async () => {
    const boundary = '----WebKitFormBoundaryTest' + Date.now();
    const csvContent = 'Phone,Name\n918766590634,Sarvya Guest';

    const parts = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="campaignName"',
      '',
      'Automated Studio Alignment Verification',
      `--${boundary}`,
      'Content-Disposition: form-data; name="templateName"',
      '',
      'kt_restaurant_invitation',
      `--${boundary}`,
      'Content-Disposition: form-data; name="templateLang"',
      '',
      'en',
      `--${boundary}`,
      'Content-Disposition: form-data; name="phoneColumn"',
      '',
      'Phone',
      `--${boundary}`,
      'Content-Disposition: form-data; name="nameColumn"',
      '',
      'Name',
      `--${boundary}`,
      'Content-Disposition: form-data; name="phoneId"',
      '',
      '1510764325447375',
      `--${boundary}`,
      'Content-Disposition: form-data; name="variableMappings"',
      '',
      JSON.stringify({ '1': 'Name' }),
      `--${boundary}`,
      'Content-Disposition: form-data; name="isScheduled"',
      '',
      'true',
      `--${boundary}`,
      'Content-Disposition: form-data; name="scheduledTime"',
      '',
      new Date(Date.now() + 86400000).toISOString(),
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="contacts.csv"',
      'Content-Type: text/csv',
      '',
      csvContent,
      `--${boundary}--`
    ];

    const bodyBuffer = Buffer.from(parts.join('\r\n'));

    const sendRes = await fetch(`${baseUrl}/api/broadcast/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body: bodyBuffer
    });

    assert.strictEqual(sendRes.status, 200);
    const sendData = await sendRes.json();
    assert.strictEqual(sendData.success, true);
    assert.ok(sendData.campaignId);
    testCampaignIds.push(sendData.campaignId);

    // Verify campaign in database
    const saved = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(sendData.campaignId);
    assert.ok(saved);
    assert.strictEqual(saved.status, 'SCHEDULED');
    assert.strictEqual(saved.phone_number_id, '1510764325447375');
    assert.strictEqual(saved.total_contacts, 1);
    assert.strictEqual(saved.valid_contacts, 1);
  });

  test('5. Issues SSE stream token via /api/broadcast/stream-token', async () => {
    const res = await fetch(`${baseUrl}/api/broadcast/stream-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.streamToken);
  });
});
