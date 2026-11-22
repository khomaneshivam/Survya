const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { db, initializeDatabase } = require("../src/config/database");
const cryptoUtil = require("../src/utils/cryptoUtil");
const recycleBinService = require("../src/services/recycleBinService");
const complianceService = require("../src/services/complianceService");
const paymentPayoutService = require("../src/services/paymentPayoutService");
const systemController = require("../src/controllers/systemController");

describe("Security, Governance, DPDP Act 2023 & Soft/Hard Delete Test Suite", () => {
  const testPhone = "919811122233";
  const testEmail = "test_gov_" + Date.now() + "@example.com";
  let testUserId = null;
  let testContactId = null;

  before(() => {
    initializeDatabase();
    // Clean up test data if any
    db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(testPhone);
    db.prepare("DELETE FROM dpdp_consent_ledger WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM dpdp_data_requests WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM contacts WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
  });

  after(() => {
    db.prepare("DELETE FROM contact_suppressions WHERE clean_phone = ?").run(testPhone);
    db.prepare("DELETE FROM dpdp_consent_ledger WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM dpdp_data_requests WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM contacts WHERE phone_e164 = ?").run(testPhone);
    db.prepare("DELETE FROM customer_replies WHERE from_phone = ?").run(testPhone);
    if (testUserId) {
      db.prepare("DELETE FROM users WHERE id = ?").run(testUserId);
    }
  });

  test("1. Schema Governance: Soft-delete and DPDP columns exist across operational tables", () => {
    // Check soft delete columns on key tables
    const checkTables = ["users", "campaigns", "contacts", "templates", "business_entities", "inapp_experiences"];
    for (const tbl of checkTables) {
      const cols = db.prepare(`DESCRIBE ${tbl}`).all().map(c => c.Field);
      assert.ok(cols.includes("active_status"), `Missing active_status in ${tbl}`);
      assert.ok(cols.includes("delete_status"), `Missing delete_status in ${tbl}`);
      assert.ok(cols.includes("deleted_at"), `Missing deleted_at in ${tbl}`);
      assert.ok(cols.includes("deleted_by"), `Missing deleted_by in ${tbl}`);
    }

    // Check Meta BSUID columns
    const contactCols = db.prepare("DESCRIBE contacts").all().map(c => c.Field);
    assert.ok(contactCols.includes("wa_bsuid"), "Missing wa_bsuid in contacts");
    assert.ok(contactCols.includes("wa_username"), "Missing wa_username in contacts");

    // Check DPDP tables exist
    const consentCols = db.prepare("DESCRIBE dpdp_consent_ledger").all().map(c => c.Field);
    assert.ok(consentCols.includes("phone_e164"), "Missing phone_e164 in dpdp_consent_ledger");
    assert.ok(consentCols.includes("purpose"), "Missing purpose in dpdp_consent_ledger");
    assert.ok(consentCols.includes("status"), "Missing status in dpdp_consent_ledger");

    const reqCols = db.prepare("DESCRIBE dpdp_data_requests").all().map(c => c.Field);
    assert.ok(reqCols.includes("request_type"), "Missing request_type in dpdp_data_requests");
  });

  test("2. Recycle Bin: Soft-delete -> listed in Recycle Bin -> Restore -> Guarded Hard Delete", async () => {
    // 1. Create a test contact
    const insertRes = db.prepare(`
      INSERT INTO contacts (
        tenant_id, name, phone_e164, active_status, delete_status, created_at, updated_at
      ) VALUES (1, 'Test Delete Contact', ?, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(testPhone);
    testContactId = insertRes.lastInsertRowid;
    assert.ok(testContactId, "Contact should be created");

    // 2. Soft-delete the contact
    db.prepare(`
      UPDATE contacts
      SET active_status = 0,
          delete_status = 1,
          deleted_at = UTC_TIMESTAMP(),
          deleted_by = 'admin_test'
      WHERE id = ?
    `).run(testContactId);

    // 3. Verify it appears in recycle bin
    const deletedItems = await recycleBinService.listDeletedItems({ entityType: "contacts", tenantId: 1 });
    const found = deletedItems.find(i => String(i.id) === String(testContactId));
    assert.ok(found, "Soft-deleted contact must appear in recycle bin listing");
    assert.equal(found.label, "Test Delete Contact");

    // 4. Restore the contact
    const restoreResult = await recycleBinService.restoreItem({
      entityType: "contacts",
      id: testContactId,
      tenantId: 1,
      restoredBy: "admin_test"
    });
    assert.ok(restoreResult.success, "Restore should succeed");

    const restoredContact = db.prepare("SELECT * FROM contacts WHERE id = ?").get(testContactId);
    assert.equal(restoredContact.delete_status, 0, "delete_status must be 0 after restore");
    assert.equal(restoredContact.active_status, 1, "active_status must be 1 after restore");
    assert.equal(restoredContact.deleted_at, null, "deleted_at must be null after restore");

    // 5. Soft-delete again for hard delete test
    db.prepare("UPDATE contacts SET delete_status = 1, active_status = 0, deleted_at = UTC_TIMESTAMP() WHERE id = ?").run(testContactId);

    // 6. Hard delete without confirmation must throw error
    await assert.rejects(
      async () => {
        await recycleBinService.hardDeleteItem({
          entityType: "contacts",
          id: testContactId,
          tenantId: 1,
          confirmHardDelete: false
        });
      },
      /explicit confirmation/
    );

    // 7. Guarded hard delete with confirmation succeeds
    const hardDeleteResult = await recycleBinService.hardDeleteItem({
      entityType: "contacts",
      id: testContactId,
      tenantId: 1,
      confirmHardDelete: true
    });
    assert.ok(hardDeleteResult.success, "Hard delete must succeed when confirmed");

    const purged = db.prepare("SELECT * FROM contacts WHERE id = ?").get(testContactId);
    assert.equal(purged, undefined, "Record must be completely purged from database");
  });

  test("3. Immutable Ledger Shield: Hard delete is blocked on financial and audit ledgers", async () => {
    const immutableEntities = ["audit_logs", "whatsapp_usage_ledger", "merchant_payout_ledger", "dpdp_consent_ledger", "whatsapp_messages"];
    for (const ent of immutableEntities) {
      await assert.rejects(
        async () => {
          await recycleBinService.hardDeleteItem({
            entityType: ent,
            id: 999999,
            tenantId: 1,
            confirmHardDelete: true
          });
        },
        /Unsupported entity type/
      );
    }
  });

  test("4. DPDP Act 2023: Consent Recording & Instant Suppression Sync on Withdrawal", async () => {
    // 1. Grant consent
    const granted = await complianceService.recordConsent({
      tenantId: 1,
      phoneE164: testPhone,
      purpose: "MARKETING",
      status: "GRANTED",
      source: "WHATSAPP_CHAT"
    });
    assert.equal(granted.status, "GRANTED");

    const consentRow = db.prepare("SELECT * FROM dpdp_consent_ledger WHERE id = ?").get(granted.id);
    assert.equal(consentRow.status, "GRANTED");
    assert.ok(consentRow.granted_at, "granted_at should be recorded");

    // 2. Withdraw consent (opt-out)
    const withdrawn = await complianceService.recordConsent({
      tenantId: 1,
      phoneE164: testPhone,
      purpose: "MARKETING",
      status: "WITHDRAWN",
      source: "WHATSAPP_CHAT"
    });
    assert.equal(withdrawn.status, "WITHDRAWN");

    // 3. Verify sync with contact_suppressions
    const suppression = db.prepare("SELECT * FROM contact_suppressions WHERE clean_phone = ?").get(testPhone);
    assert.ok(suppression, "Withdrawn consent must immediately sync to contact_suppressions");
    assert.equal(suppression.reason, "DPDP_CONSENT_WITHDRAWN");

    // 4. Re-grant consent clears suppression
    await complianceService.recordConsent({
      tenantId: 1,
      phoneE164: testPhone,
      purpose: "MARKETING",
      status: "GRANTED",
      source: "WEB_FORM"
    });
    const clearedSuppression = db.prepare("SELECT * FROM contact_suppressions WHERE clean_phone = ? AND reason = 'DPDP_CONSENT_WITHDRAWN'").get(testPhone);
    assert.equal(clearedSuppression, undefined, "Re-granting consent must clear DPDP suppression");
  });

  test("5. DPDP Right to Access: Full PII Export across platform", async () => {
    // Seed contact and reply
    db.prepare(`
      INSERT INTO contacts (tenant_id, name, phone_e164, email, active_status, delete_status, created_at, updated_at)
      VALUES (1, 'Rahul Verma', ?, 'rahul.verma@example.com', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(testPhone);

    db.prepare(`
      INSERT INTO customer_replies (from_phone, customer_name, message_body, received_at)
      VALUES (?, 'Rahul Verma', 'Hello, please send booking details', CURRENT_TIMESTAMP)
    `).run(testPhone);

    const exported = await complianceService.exportDataSubjectPii(testPhone, 1);
    assert.ok(exported.success, "PII export should succeed");
    assert.equal(exported.dataSubject, testPhone);
    assert.ok(exported.summary.contactsCount >= 1, "Should count contacts");
    assert.ok(exported.summary.messagesCount >= 1, "Should count messages");
    assert.ok(exported.data.contacts.length >= 1, "Export must contain contacts array");
    assert.ok(exported.data.messages.length >= 1, "Export must contain messages array");
  });

  test("6. DPDP Right to Erasure: Cryptographic PII Anonymization & Salted SHA-256 Hash Retention", async () => {
    const result = await complianceService.executeErasureOrAnonymization({
      phoneE164: testPhone,
      tenantId: 1,
      immediate: true,
      reason: "User requested account erasure under Section 12"
    });

    assert.equal(result.status, "IMMEDIATELY_ANONYMIZED");

    // Verify contact name & email scrubbed
    const scrubbedContact = db.prepare("SELECT * FROM contacts WHERE phone_e164 = ?").get(testPhone);
    assert.ok(scrubbedContact.name.includes("Anonymized"), "Contact name must be anonymized");
    assert.equal(scrubbedContact.email, null, "Contact email must be set to null");

    // Verify customer reply message text scrubbed
    const scrubbedReply = db.prepare("SELECT * FROM customer_replies WHERE from_phone = ?").get(testPhone);
    assert.ok(scrubbedReply.message_body.includes("Redacted"), "Message body must be redacted");

    // Verify salted SHA-256 phone hash is placed in contact_suppressions
    const phoneHash = cryptoUtil.hashPhone(testPhone);
    const hashSuppression = db.prepare("SELECT * FROM contact_suppressions WHERE clean_phone = ?").get(phoneHash);
    assert.ok(hashSuppression, "Salted SHA-256 phone hash must be perpetually stored in contact_suppressions");
    assert.equal(hashSuppression.reason, "DPDP_ERASURE_PERPETUAL_SUPPRESSION");
  });

  test("7. RBI Payment Mode & Bank Account Encryption & Masking", async () => {
    // 1. Get or create a test entity
    let entity = db.prepare("SELECT id FROM business_entities LIMIT 1").get();
    if (!entity) {
      const entRes = db.prepare("INSERT INTO business_entities (name, slug, domain_type) VALUES ('Test Hotel', 'test-hotel', 'HOSPITALITY')").run();
      entity = { id: entRes.lastInsertRowid };
    }

    // 2. Add beneficiary with plaintext account number
    const plainAccount = "50200084920194";
    const beneficiary = paymentPayoutService.addBeneficiary(entity.id, {
      account_holder_name: "TEST RESORT LLP",
      bank_name: "HDFC Bank",
      account_number: plainAccount,
      ifsc_code: "HDFC0000240",
      account_type: "CURRENT"
    });

    assert.ok(beneficiary.id, "Beneficiary should be created");

    // 3. Raw database row must be AES-256-GCM encrypted
    const rawBen = db.prepare("SELECT account_number FROM merchant_payout_beneficiaries WHERE id = ?").get(beneficiary.id);
    assert.ok(rawBen.account_number.startsWith("enc:aes-256-gcm:"), "Account number in database must be encrypted");

    // 4. Returned beneficiary must have masked account number
    const benList = paymentPayoutService.getBeneficiaries(entity.id);
    const addedBen = benList.find(b => b.id === beneficiary.id);
    assert.ok(addedBen.accountNumberMasked.includes("****"), "Masked account number must contain asterisks");
    assert.equal(addedBen.accountNumberMasked, "5020****0194", "Masking should preserve first 4 and last 4 digits");

    // 5. Payment mode config
    const configDirect = paymentPayoutService.savePaymentConfig(entity.id, { payment_mode: "MERCHANT_DIRECT_GATEWAY" }, 1);
    assert.equal(configDirect.payment_mode, "MERCHANT_DIRECT_GATEWAY");

    const configSplit = paymentPayoutService.savePaymentConfig(entity.id, { payment_mode: "LICENSED_SPLIT_PARTNER" }, 1);
    assert.equal(configSplit.payment_mode, "LICENSED_SPLIT_PARTNER");

    // Reset back
    paymentPayoutService.savePaymentConfig(entity.id, { payment_mode: "MERCHANT_DIRECT_GATEWAY" }, 1);
  });

  test("8. Live System Telemetry: /api/system/health returns real runtime metrics", async () => {
    let responseData = null;
    let statusCode = null;

    const mockRes = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await systemController.getSystemHealth({}, mockRes);

    assert.equal(statusCode, 200);
    assert.ok(responseData.success);
    assert.ok(responseData.data.nodeVersion.startsWith("v"), "Node version should start with v");
    assert.ok(responseData.data.platform, "Platform should be present");
    assert.ok(responseData.data.arch, "Arch should be present");
    assert.ok(typeof responseData.data.uptimeSeconds === "number", "Uptime should be numeric");
    assert.ok(responseData.data.memoryUsageMb.rss > 0, "RSS memory should be > 0");
    assert.equal(responseData.data.dbEngine, "MySQL 8.4");
    assert.ok(responseData.data.dbHost, "DB host should be present");
    assert.ok(responseData.data.dbName, "DB name should be present");
  });
});
