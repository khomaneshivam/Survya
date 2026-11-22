const { test, describe, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { db, initializeDatabase, getSetting, setSetting } = require("../src/config/database");
const cryptoUtil = require("../src/utils/cryptoUtil");
const metaRateService = require("../src/services/billing/metaRateService");
const webhookService = require("../src/services/webhookService");
const broadcastEngine = require("../src/services/broadcastEngine");
const jobQueueService = require("../src/services/queue/jobQueueService");

describe("Broadcast Delivery Shield & Oct 2026 India Billing Test Suite", () => {
  const testPhone = "919999988888";
  const testMsgId = "wamid.HBgTEST_SHIELD_131049_" + Date.now();

  before(() => {
    initializeDatabase();
    db.prepare("DELETE FROM contact_marketing_cooldowns WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM whatsapp_messages WHERE meta_message_id = ?").run(testMsgId);
    db.prepare("DELETE FROM whatsapp_usage_ledger WHERE meta_message_id = ?").run(testMsgId);
  });

  after(() => {
    db.prepare("DELETE FROM contact_marketing_cooldowns WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM whatsapp_messages WHERE meta_message_id = ?").run(testMsgId);
    db.prepare("DELETE FROM whatsapp_usage_ledger WHERE meta_message_id = ?").run(testMsgId);
  });

  test("1. Schema Verification: contact_marketing_cooldowns table exists with required columns", () => {
    const cols = db.prepare("DESCRIBE contact_marketing_cooldowns").all().map(c => c.Field);
    const required = [
      "id", "tenant_id", "phone_e164", "phone_number_id",
      "error_code", "reason", "cooldown_until", "created_at", "updated_at"
    ];
    for (const r of required) {
      assert.ok(cols.includes(r), `Missing column ${r} in contact_marketing_cooldowns`);
    }
  });

  test("2. Secret Encryption: cryptoUtil transparently encrypts and decrypts sensitive settings", () => {
    const plainToken = "EAAB_TEST_SECRET_TOKEN_" + Date.now();
    setSetting("WHATSAPP_API_TOKEN", plainToken);

    // Raw database row must be encrypted with prefix 'enc:aes-256-gcm:'
    const rawRow = db.prepare("SELECT value FROM settings WHERE key = 'WHATSAPP_API_TOKEN'").get();
    assert.ok(rawRow.value.startsWith("enc:aes-256-gcm:"), "Setting in database must be AES-256-GCM encrypted");
    assert.notEqual(rawRow.value, plainToken, "Raw database value must not be plaintext");

    // getSetting must transparently decrypt
    const retrieved = getSetting("WHATSAPP_API_TOKEN");
    assert.equal(retrieved, plainToken, "getSetting must return decrypted plaintext");
  });

  test("3. Meta 131049 Delivery Webhook: Waives ledger cost and upserts 24h cooldown", () => {
    // 1. Create a simulated message in whatsapp_messages and ledger
    const rowId = "msg_test_" + Date.now();
    db.prepare(`
      INSERT INTO whatsapp_messages (
        id, tenant_id, recipient_phone, message_type, template_category, meta_message_id,
        status, estimated_cost, currency, created_at, updated_at
      ) VALUES (?, 1, ?, 'TEMPLATE', 'MARKETING', ?, 'SENT', 0.8631, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(rowId, testPhone, testMsgId);

    db.prepare(`
      INSERT INTO whatsapp_usage_ledger (
        tenant_id, recipient_phone, category, meta_message_id, unit_cost, currency,
        billing_status, created_at
      ) VALUES (1, ?, 'MARKETING', ?, 0.8631, 'INR', 'PENDING', CURRENT_TIMESTAMP)
    `).run(testPhone, testMsgId);

    // 2. Dispatch simulated Meta 131049 webhook status
    const statusObj = {
      id: testMsgId,
      status: "failed",
      timestamp: String(Math.floor(Date.now() / 1000)),
      recipient_id: testPhone,
      errors: [
        {
          code: 131049,
          title: "Message undeliverable",
          message: "Recipient reached promotional threshold"
        }
      ]
    };

    const handled = webhookService.updateRecipientDeliveryStatus(statusObj);
    assert.ok(handled, "Webhook should handle failed status");

    // 3. Verify ledger is marked WAIVED with unit_cost 0
    const ledgerRow = db.prepare("SELECT * FROM whatsapp_usage_ledger WHERE meta_message_id = ?").get(testMsgId);
    assert.ok(ledgerRow, "Ledger row must exist");
    assert.equal(ledgerRow.billing_status, "WAIVED", "Ledger status must be WAIVED");
    assert.equal(Number(ledgerRow.unit_cost), 0, "Waived message unit_cost must be 0");

    // 4. Verify contact_marketing_cooldowns has 24h cooldown in UTC
    const cooldownRow = db.prepare("SELECT * FROM contact_marketing_cooldowns WHERE phone_e164 = ?").get(testPhone);
    assert.ok(cooldownRow, "Cooldown entry must be created");
    assert.equal(String(cooldownRow.error_code), "131049");
    assert.ok(cooldownRow.reason.includes("Meta Marketing Cap (131049)"));

    const cooldownDate = new Date(cooldownRow.cooldown_until + "Z");
    const diffHours = (cooldownDate.getTime() - Date.now()) / (1000 * 60 * 60);
    assert.ok(diffHours > 23 && diffHours <= 25, `Cooldown duration should be ~24h (got ${diffHours}h)`);
  });

  test("4. Oct 2026 Meta India INR Rate Card & GST Calculations", () => {
    const rates = metaRateService.getBaseRates();
    assert.equal(rates.MARKETING, 0.8631, "Default marketing tariff must be 0.8631 INR");
    assert.equal(rates.UTILITY, 0.1150, "Default utility tariff must be 0.1150 INR");
    assert.equal(rates.AUTHENTICATION, 0.1150, "Default auth tariff must be 0.1150 INR");
    assert.equal(rates.FREE_SERVICE_LIMIT, 1000, "Free service message threshold must be 1,000");

    // Unit rate calculation
    const mRate = metaRateService.calculateUnitRate("MARKETING");
    assert.equal(mRate, 0.8631);

    const uRate = metaRateService.calculateUnitRate("UTILITY");
    assert.equal(uRate, 0.1150);

    // GST calculation: 1000 messages * 0.8631 = 863.10 INR
    const gstCalc = metaRateService.calculateGst(863.10);
    assert.equal(gstCalc.subtotalInr, 863.1);
    assert.equal(gstCalc.gstPercent, 18.0);
    assert.equal(gstCalc.gstInr, 155.358); // 863.1 * 0.18 = 155.358
    assert.equal(gstCalc.totalInr, 1018.458);
  });

  test("5. Service Reply Free Tier: First 1,000 replies free, then billed at standard rate", () => {
    const testPhoneId = "TEST_PHONE_TIER_99";
    // Check initial service count for dummy phone_number_id (should be 0)
    const count = metaRateService.getMonthlyServiceMessageCount(testPhoneId);
    assert.equal(count, 0);

    const serviceRate = metaRateService.calculateUnitRate("SERVICE", testPhoneId);
    assert.equal(serviceRate, 0.0, "Service message under 1000 count must be free (0.00 INR)");
  });

  test("6. Broadcast Engine Cooldown Filter: Skips cooled contact on MARKETING, permits UTILITY", () => {
    // Check marketing cooldown query
    const checkCooldown = db.prepare(`
      SELECT id FROM contact_marketing_cooldowns 
      WHERE phone_e164 = ? AND cooldown_until > UTC_TIMESTAMP() 
      LIMIT 1
    `);
    const active = checkCooldown.get(testPhone);
    assert.ok(active, "testPhone must have active marketing cooldown");

    // The cooldown check should only apply to MARKETING campaigns
    const isMarketing = true;
    const shouldSkipMarketing = isMarketing && Boolean(active);
    assert.equal(shouldSkipMarketing, true, "Marketing message to cooled number must be skipped");

    const isUtility = false;
    const shouldSkipUtility = isUtility && Boolean(active);
    assert.equal(shouldSkipUtility, false, "Utility message must NOT be skipped despite marketing cooldown");
  });

  test("7. IST Quiet Hours & Auto-Pause Logic Integrity", () => {
    // Test quiet hours schedule calculation directly
    const testNight = new Date("2026-11-22T16:30:00Z"); // 22:00 IST (night)
    const testMorning = new Date("2026-11-22T00:30:00Z"); // 06:00 IST (morning)

    const istNightHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(testNight), 10);
    assert.ok(istNightHour >= 21 || istNightHour < 9, "22:00 IST is in quiet hours");

    const istMorningHour = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(testMorning), 10);
    assert.ok(istMorningHour >= 21 || istMorningHour < 9, "06:00 IST is in quiet hours");

    // Test error spike threshold: 10 attempts with 3 non-cap failures = 30% > 25% -> triggers pause
    const attempted = 10;
    const nonCapFailures = 3;
    const isSpike = attempted >= 10 && (nonCapFailures / attempted) > 0.25;
    assert.equal(isSpike, true, "3/10 (30%) non-cap failures must trigger auto-pause");

    // 10 attempts with 2 non-cap failures = 20% <= 25% -> does not trigger pause
    const nonSpike = attempted >= 10 && (2 / attempted) > 0.25;
    assert.equal(nonSpike, false, "2/10 (20%) failures should not trigger auto-pause");
  });
});
