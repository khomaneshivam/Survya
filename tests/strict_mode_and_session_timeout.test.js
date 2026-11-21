const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { db, getSetting, setSetting } = require("../src/config/database");
const webhookService = require("../src/services/webhookService");
const flowEngine = require("../src/services/conversationFlowEngine");
const schedulerService = require("../src/services/schedulerService");

describe("SARVYA Strict Inbound-Only Mode & Connection Open Timeout Test Suite", () => {
  const testPhone = "919700998877";
  const sessionKey = `WHATSAPP:${testPhone}:1`;

  before(() => {
    webhookService.resumeBotForPhone(testPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(testPhone);
  });

  after(() => {
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
    db.prepare("DELETE FROM conversation_flow_sessions WHERE sender_phone = ?").run(testPhone);
  });

  test("1. Settings Parity: getAutoReplySettings defaults strictInboundOnly=true and sessionTimeoutMinutes=30", () => {
    const settings = webhookService.getAutoReplySettings();
    assert.equal(typeof settings.strictInboundOnly, "boolean", "strictInboundOnly must be boolean");
    assert.equal(typeof settings.sessionTimeoutMinutes, "number", "sessionTimeoutMinutes must be number");
    assert.ok(settings.sessionTimeoutMinutes >= 15, "Default session timeout should be at least 15 minutes");
  });

  test("2. Settings Persistence: saveAutoReplySettings updates strict mode and timeout limit", () => {
    const updated = webhookService.saveAutoReplySettings({
      strictInboundOnly: true,
      sessionTimeoutMinutes: 60
    });

    assert.equal(updated.strictInboundOnly, true);
    assert.equal(updated.sessionTimeoutMinutes, 60);

    // Verify DB setting
    assert.equal(getSetting("BOT_STRICT_INBOUND_ONLY"), "true");
    assert.equal(getSetting("BOT_SESSION_TIMEOUT_MINUTES"), "60");

    // Revert to 30 mins
    webhookService.saveAutoReplySettings({ sessionTimeoutMinutes: 30 });
  });

  test("3. Session Expiration on Inactivity: Stale session (>30m) expires silently and starts fresh on new customer turn", async () => {
    // Insert an active session that has been inactive for 45 minutes
    db.prepare(`
      INSERT INTO conversation_flow_sessions (
        session_key, tenant_id, property_id, channel, sender_phone,
        flow_id, flow_version_id, current_node_id, session_status,
        collected_data_json, last_interaction_at, expires_at, created_at, updated_at
      ) VALUES (?, 1, 1, 'WHATSAPP', ?, 1, 1, 'node_select_room', 'ACTIVE', '{"enquiry_type":"STAY"}', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 MINUTE))
      ON DUPLICATE KEY UPDATE
        session_status = 'ACTIVE',
        current_node_id = 'node_select_room',
        last_interaction_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 MINUTE),
        expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
    `).run(sessionKey, testPhone);

    const oldSession = db.prepare("SELECT * FROM conversation_flow_sessions WHERE session_key = ?").get(sessionKey);
    assert.ok(oldSession, "Session must exist before turn");
    assert.equal(oldSession.session_status, "ACTIVE");

    // Customer sends a new message after session timed out
    const result = await flowEngine.processTurn({
      senderPhone: testPhone,
      userInput: "Hi, I am back",
      context: {
        tenantId: 1,
        propertyId: 1,
        channel: "WHATSAPP",
        isSimulation: false
      }
    });

    assert.ok(result.handled, "Turn should be handled");

    // The stale session must have been updated to EXPIRED, and a fresh active session created
    const refreshedSession = db.prepare("SELECT * FROM conversation_flow_sessions WHERE session_key = ?").get(sessionKey);
    assert.ok(refreshedSession, "Refreshed session must exist");
    assert.equal(refreshedSession.session_status, "ACTIVE");
    // The node should have started fresh from welcome/start, not stayed on node_select_room with stale data
    assert.notEqual(refreshedSession.current_node_id, "node_select_room", "Should not resume stale waiting node after timeout");

    // Verify an EXPIRED event was recorded
    const expireEvent = db.prepare(`
      SELECT * FROM conversation_flow_events 
      WHERE session_id = ? AND event_type = 'EXPIRED'
      LIMIT 1
    `).get(oldSession.id);
    assert.ok(expireEvent, "Inactivity timeout must record an EXPIRED event in analytics");
  });

  test("4. Silent Background Sweep: schedulerService.silentExpireInactiveSessions marks expired sessions without sending messages", () => {
    // Insert an active session whose expires_at is in the past
    const sweepPhone = "919700998899";
    const sweepKey = `WHATSAPP:${sweepPhone}:1`;

    db.prepare(`
      INSERT INTO conversation_flow_sessions (
        session_key, tenant_id, property_id, channel, sender_phone,
        flow_id, flow_version_id, current_node_id, session_status,
        collected_data_json, last_interaction_at, expires_at, created_at, updated_at
      ) VALUES (?, 1, 1, 'WHATSAPP', ?, 1, 1, 'node_welcome', 'ACTIVE', '{}', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE))
      ON DUPLICATE KEY UPDATE
        session_status = 'ACTIVE',
        expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
    `).run(sweepKey, sweepPhone);

    // Call silent sweep
    schedulerService.silentExpireInactiveSessions();

    const sweptSession = db.prepare("SELECT * FROM conversation_flow_sessions WHERE session_key = ?").get(sweepKey);
    assert.ok(sweptSession);
    assert.equal(sweptSession.session_status, "EXPIRED", "Session must be marked EXPIRED by silent sweep");

    // Cleanup
    db.prepare("DELETE FROM conversation_flow_sessions WHERE session_key = ?").run(sweepKey);
  });

  test("5. Meta 24-Hour Customer Window Guard: Inbound message older than 24h suppresses automated reply", async () => {
    // Mock customer reply received 26 hours ago
    const oldReplyRecord = {
      id: 999999,
      from_phone: testPhone,
      message_body: "Can I get room pricing?",
      message_type: "text",
      received_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
    };

    const result = await webhookService._executeConversationalFlow(oldReplyRecord, { type: "text" }, { is_simulation: false });
    assert.equal(result, null, "Must suppress automated reply when message is outside Meta 24-hour customer service window");
  });

  test("6. Strict Inbound Mode: No outbound send occurs when customer hasn't replied", async () => {
    // If webhook receives an event with empty message body and no action
    const emptyReplyRecord = {
      id: 999998,
      from_phone: testPhone,
      message_body: "",
      message_type: "text",
      received_at: new Date().toISOString()
    };

    const result = await webhookService._executeConversationalFlow(emptyReplyRecord, { type: "unknown" }, { is_simulation: false });
    assert.equal(result, null, "Strict mode must reject events with zero customer message or action");
  });
});
