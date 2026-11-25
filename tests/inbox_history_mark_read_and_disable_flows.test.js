const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db, getSetting, setSetting } = require('../src/config/database');
const webhookService = require('../src/services/webhookService');
const metaWhatsAppService = require('../src/services/metaWhatsAppService');
const whatsappFlowExecutor = require('../src/services/workflow/nodeExecutors/whatsappFlowExecutor');

describe('Inbox History, Mark-as-Read & Disabled WhatsApp Flows Verification', () => {
  const testPhone = '919999000111';
  const insertedIds = [];
  let prevFlowsEnabled = null;

  before(() => {
    prevFlowsEnabled = getSetting('WHATSAPP_FLOWS_ENABLED');
    setSetting('WHATSAPP_FLOWS_ENABLED', 'false');
    // Ensure test environment is clean
    db.prepare('DELETE FROM customer_replies WHERE from_phone = ?').run(testPhone);

    // Insert 5 test messages with distinct timestamps
    const baseTime = new Date('2026-11-21T01:00:00.000Z').getTime();
    for (let i = 1; i <= 5; i++) {
      const msgTime = new Date(baseTime + i * 60000).toISOString();
      const info = db.prepare(`
        INSERT INTO customer_replies (
          wa_message_id, from_phone, customer_name, message_type,
          message_body, is_read, received_at, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `test_msg_${i}_${Date.now()}`,
        testPhone,
        'Test Customer',
        i % 2 === 0 ? 'outbound' : 'text',
        `Test message content ${i}`,
        0, // unread
        msgTime,
        i % 2 === 0 ? 'agent' : 'customer'
      );
      insertedIds.push(info.lastInsertRowid);
    }
  });

  after(() => {
    db.prepare('DELETE FROM customer_replies WHERE from_phone = ?').run(testPhone);
    if (prevFlowsEnabled !== null && prevFlowsEnabled !== undefined) {
      setSetting('WHATSAPP_FLOWS_ENABLED', prevFlowsEnabled);
    } else {
      setSetting('WHATSAPP_FLOWS_ENABLED', 'false');
    }
  });

  test('1. getConversationMessages retrieves paginated history with total count', () => {
    const res = webhookService.getConversationMessages({
      phone: testPhone,
      limit: 2
    });

    assert.equal(res.phone, testPhone);
    assert.equal(res.total, 5, 'Total message count should be 5');
    assert.equal(res.messages.length, 2, 'Limit 2 should return 2 messages');
    assert.equal(res.hasMore, true, 'hasMore should be true when older messages exist');
    assert.ok(res.oldestTime, 'Should return oldestTime for cursor-based pagination');
  });

  test('2. getConversationMessages paginates backwards using before timestamp', () => {
    // First page
    const page1 = webhookService.getConversationMessages({
      phone: testPhone,
      limit: 2
    });

    assert.equal(page1.messages.length, 2);
    const beforeCursor = page1.oldestTime;

    // Second page (older messages)
    const page2 = webhookService.getConversationMessages({
      phone: testPhone,
      limit: 2,
      before: beforeCursor
    });

    assert.equal(page2.messages.length, 2);
    assert.equal(page2.hasMore, true);

    // Ensure page 2 messages are strictly older than page 1
    const p1Oldest = new Date(page1.messages[0].received_at).getTime();
    const p2Newest = new Date(page2.messages[page2.messages.length - 1].received_at).getTime();
    assert.ok(p2Newest < p1Oldest, 'Page 2 messages must be strictly older than Page 1 messages');
  });

  test('3. markConversationAsRead atomically marks all unread messages for this contact', () => {
    // Verify initial unread count is 5
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM customer_replies WHERE from_phone = ? AND is_read = 0').get(testPhone).count;
    assert.equal(countBefore, 5);

    // Execute atomic markConversationAsRead
    const result = webhookService.markConversationAsRead(testPhone);
    assert.ok(result.updated >= 5, 'Should update at least 5 messages');

    // Verify unread count is now 0
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM customer_replies WHERE from_phone = ? AND is_read = 0').get(testPhone).count;
    assert.equal(countAfter, 0, 'Unread count should be 0 after markConversationAsRead');
  });

  test('4. WHATSAPP_FLOWS_ENABLED setting is false and prevents flow message dispatch', async () => {
    const settingVal = getSetting('WHATSAPP_FLOWS_ENABLED');
    assert.equal(settingVal, 'false', 'WHATSAPP_FLOWS_ENABLED must be "false"');

    // Attempt to call sendFlowMessage
    const res = await metaWhatsAppService.sendFlowMessage({
      to: testPhone,
      flowId: '1234567890',
      flowToken: 'test_token',
      bodyText: 'Please fill out form',
      customCredentials: { isSimulation: true }
    });

    assert.equal(res.success, false);
    assert.match(res.error, /disabled/i, 'Should reject with disabled message');
  });

  test('5. whatsappFlowExecutor falls back to standard in-chat conversational input when flows are disabled', async () => {
    const node = {
      id: 'node_intake_flow',
      type: 'SEND_WHATSAPP_FLOW',
      config: {
        flowTitle: 'Resort Booking Registration',
        flowCta: 'Reserve Room'
      }
    };

    const context = {
      session: { flow_id: 'test_flow' },
      userPayload: null,
      isWaitingForThisNode: false
    };

    const result = await whatsappFlowExecutor.execute(node, context);

    assert.equal(result.action, 'WAIT_FOR_INPUT');
    assert.ok(Array.isArray(result.replyMessages), 'Should provide replyMessages array');
    assert.match(result.replyMessages[0], /Resort Booking Registration/);
    assert.match(result.replyMessages[0], /Please reply with your details directly in this chat:/);
    assert.match(result.traceNote, /WhatsApp Flows disabled/);
  });
});
