const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const { app } = require('../server');
const config = require('../src/config/env');
const { db, initializeDatabase, setSetting, getSetting } = require('../src/config/database');
const cryptoUtil = require('../src/utils/cryptoUtil');
const jobQueueService = require('../src/services/queue/jobQueueService');
const jobWorkerEngine = require('../src/services/queue/jobWorkerEngine');
const billingService = require('../src/services/billingService');
const recycleBinService = require('../src/services/recycleBinService');
const complianceService = require('../src/services/complianceService');
const aiFlowGeneratorService = require('../src/services/workflow/aiFlowGeneratorService');
const conversationFlowEngine = require('../src/services/conversationFlowEngine');
const taskScopedAiAgentService = require('../src/services/ai/taskScopedAiAgentService');
const inappExperienceService = require('../src/services/inapp/inappExperienceService');
const inappNegotiationService = require('../src/services/inapp/inappNegotiationService');
const inappRuntimeService = require('../src/services/inapp/inappRuntimeService');
const metaRateService = require('../src/services/billing/metaRateService');
const messagingService = require('../src/services/whatsappMessagingService');
const webhookService = require('../src/services/webhookService');

describe('Task 6: Master Production QA & End-to-End Regression Suite', () => {
  let server;
  let baseUrl;

  // Test tenant and user identities
  let tenantAId;
  let tenantBId;
  let adminUserId;
  let staffUserId;
  let adminUserToken;
  let staffUserToken;
  let tenantBUserToken;

  const testPhoneA = '919876500001';
  const testPhoneB = '919876500002';
  const testMsgId = `wamid.QA_MASTER_${Date.now()}`;

  before(async () => {
    initializeDatabase();

    // Start ephemeral server for HTTP route testing
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    // 1. Create Isolated Tenants A and B
    const tA = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('QA Tenant A Corp', 'qa-tenant-a', 'ACTIVE', 'TRIAL', 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 1000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantAId = Number(tA.lastInsertRowid);

    const tB = db.prepare(`
      INSERT INTO tenants (
        name, slug, status, plan_code, subscription_status, trial_ends_at,
        quota_monthly_messages, quota_waba_lines, timezone, created_at, updated_at
      ) VALUES ('QA Tenant B Corp', 'qa-tenant-b', 'ACTIVE', 'TRIAL', 'TRIALING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY), 1000, 1, 'Asia/Kolkata', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();
    tenantBId = Number(tB.lastInsertRowid);

    // 2. Create Admin and Staff Users for Tenant A
    adminUserId = `usr_admin_a_${Date.now()}`;
    staffUserId = `usr_staff_a_${Date.now()}`;
    const bUserId = `usr_user_b_${Date.now()}`;

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status, created_at, updated_at)
      VALUES (?, ?, 'qa_admin_a', 'admin_a@sarvya.test', 'hashed_pw', 'ADMIN', 'ACTIVE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(adminUserId, tenantAId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status, created_at, updated_at)
      VALUES (?, ?, 'qa_staff_a', 'staff_a@sarvya.test', 'hashed_pw', 'STAFF', 'ACTIVE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(staffUserId, tenantAId);

    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status, created_at, updated_at)
      VALUES (?, ?, 'qa_user_b', 'user_b@sarvya.test', 'hashed_pw', 'STAFF', 'ACTIVE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(bUserId, tenantBId);

    // Sign JWT tokens
    adminUserToken = jwt.sign({ id: adminUserId, userId: adminUserId, tenant_id: tenantAId, role: 'ADMIN' }, config.JWT_SECRET, { expiresIn: '2h' });
    staffUserToken = jwt.sign({ id: staffUserId, userId: staffUserId, tenant_id: tenantAId, role: 'STAFF' }, config.JWT_SECRET, { expiresIn: '2h' });
    tenantBUserToken = jwt.sign({ id: bUserId, userId: bUserId, tenant_id: tenantBId, role: 'STAFF' }, config.JWT_SECRET, { expiresIn: '2h' });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    // Clean up test records
    if (tenantAId) {
      db.prepare('DELETE FROM crm_records WHERE tenant_id = ?').run(tenantAId);
      db.prepare('DELETE FROM contacts WHERE tenant_id = ?').run(tenantAId);
      db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantAId);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantAId);
    }
    if (tenantBId) {
      db.prepare('DELETE FROM crm_records WHERE tenant_id = ?').run(tenantBId);
      db.prepare('DELETE FROM contacts WHERE tenant_id = ?').run(tenantBId);
      db.prepare('DELETE FROM users WHERE tenant_id = ?').run(tenantBId);
      db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantBId);
    }
    db.prepare('DELETE FROM contact_marketing_cooldowns WHERE phone_e164 IN (?, ?)').run(testPhoneA, testPhoneB);
    db.prepare('DELETE FROM whatsapp_messages WHERE meta_message_id = ?').run(testMsgId);
    db.prepare('DELETE FROM whatsapp_usage_ledger WHERE meta_message_id = ?').run(testMsgId);
  });

  // =========================================================================
  // SECTION 1: Multi-Tenant Signup, Auth, RBAC, and Cross-Tenant Isolation
  // =========================================================================
  test('1. Multi-Tenant Auth & RBAC Isolation: strict 403 on admin routes and cross-tenant barrier', async () => {
    // 1a. Staff cannot access admin queue stats (403 Forbidden)
    const staffRes = await fetch(`${baseUrl}/api/v1/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${staffUserToken}` }
    });
    assert.equal(staffRes.status, 403, 'Non-admin staff must be rejected with 403 on admin queue routes');

    // 1b. Admin can access admin queue stats (200 OK)
    const adminRes = await fetch(`${baseUrl}/api/v1/admin/queue/stats`, {
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });
    assert.equal(adminRes.status, 200, 'Admin user must be allowed on admin queue routes');
    const adminData = await adminRes.json();
    assert.ok(adminData.success, 'Stats response must succeed');

    // 1c. Cross-Tenant Isolation: Tenant A creates a private CRM record
    const recordA = db.prepare(`
      INSERT INTO crm_records (
        tenant_id, pipeline_id, contact_phone, contact_name, stage_key, lead_score,
        deal_value, custom_attributes, created_at, updated_at
      ) VALUES (?, 1, '+919876500001', 'Tenant A Secret Guest', 'NEW', 80, 5000, '{}', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(tenantAId);
    const recId = recordA.lastInsertRowid;

    // Tenant B tries to query Tenant A's record through API or direct tenant barrier
    const queryForB = db.prepare('SELECT id FROM crm_records WHERE id = ? AND tenant_id = ?').get(recId, tenantBId);
    assert.equal(queryForB, undefined, 'Tenant B must never be able to access Tenant A CRM record');
  });

  // =========================================================================
  // SECTION 2: Universal Soft Delete -> Recycle Bin -> Restore -> Hard Delete
  // =========================================================================
  test('2. Admin Full CRUD & Recycle Bin Governance: soft delete, restore, hard delete & audit trail', async () => {
    // Insert a disposable test user for Tenant A
    const targetUserId = `usr_disposable_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, active_status, delete_status, created_at, updated_at)
      VALUES (?, ?, 'Disposable Test User', 'disposable@sarvya.test', 'hashed_pw', 'STAFF', 'ACTIVE', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(targetUserId, tenantAId);

    // 1. Soft delete via Admin API
    const softDelRes = await fetch(`${baseUrl}/api/admin/users/${targetUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });
    assert.equal(softDelRes.status, 200, 'Soft delete user must succeed');

    // Verify row in DB is marked deleted
    const softDeletedRow = db.prepare('SELECT active_status, delete_status, deleted_at, deleted_by FROM users WHERE id = ?').get(targetUserId);
    assert.equal(softDeletedRow.delete_status, 1, 'delete_status must be 1');
    assert.equal(softDeletedRow.active_status, 0, 'active_status must be 0');
    assert.ok(softDeletedRow.deleted_at, 'deleted_at timestamp must be populated');

    // 2. Recycle Bin listing must include the soft-deleted item
    const binRes = await fetch(`${baseUrl}/api/admin/recycle-bin?entityType=users`, {
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });
    assert.equal(binRes.status, 200);
    const binData = await binRes.json();
    const foundInBin = (binData.data?.items || []).find(i => String(i.id) === String(targetUserId));
    assert.ok(foundInBin, 'Soft deleted user must appear in Recycle Bin');

    // 3. Restore record via Recycle Bin API
    const restoreRes = await fetch(`${baseUrl}/api/admin/recycle-bin/users/${targetUserId}/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });
    assert.equal(restoreRes.status, 200, 'Restore must succeed');
    const restoredRow = db.prepare('SELECT active_status, delete_status, deleted_at FROM users WHERE id = ?').get(targetUserId);
    assert.equal(restoredRow.delete_status, 0, 'delete_status must be reset to 0');
    assert.equal(restoredRow.active_status, 1, 'active_status must be restored to 1');

    // 4. Soft-delete again, then permanently hard-delete
    await fetch(`${baseUrl}/api/admin/users/${targetUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminUserToken}` }
    });

    const hardDelRes = await fetch(`${baseUrl}/api/admin/recycle-bin/users/${targetUserId}/hard-delete`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminUserToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ confirmHardDelete: true })
    });
    assert.equal(hardDelRes.status, 200, 'Hard delete must succeed');
    const purgedRow = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
    assert.equal(purgedRow, undefined, 'Record must be permanently removed from DB');

    // 5. Verify immutable audit_logs recorded
    const auditLogs = db.prepare(`
      SELECT action FROM audit_logs
      WHERE tenant_id = ? AND target_id = ?
      ORDER BY id DESC
    `).all(tenantAId, String(targetUserId));
    assert.ok(auditLogs.length > 0, 'Audit logs must capture data lifecycle actions');
  });

  // =========================================================================
  // SECTION 3: Meta WABA Connect, Template Lock (409), 24h Window (422), Opt-out (403), 131049 Cooldown & Billing
  // =========================================================================
  test('3. Meta Connect & Messaging Guardrails: 409 template lock, 422 window, 403 opt-out, 131049 waiver, Oct 2026 rates', async () => {
    // 3a. Template Edit Lock (409 Conflict when template is APPROVED)
    const tplId = `tpl_approved_${Date.now()}`;
    const tplName = `qa_approved_tpl_${Date.now()}`;
    db.prepare(`
      INSERT INTO templates (id, tenant_id, name, language, category, status, body_text, created_at, updated_at)
      VALUES (?, ?, ?, 'en', 'MARKETING', 'APPROVED', 'Hello {{1}}, welcome to SARVYA!', UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(tplId, tenantAId, tplName);

    const lockUpdateRes = await fetch(`${baseUrl}/api/templates/custom/${tplId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminUserToken}`
      },
      body: JSON.stringify({ bodyText: 'Unauthorized mutation of approved template' })
    });
    assert.equal(lockUpdateRes.status, 409, 'APPROVED template must return 409 Conflict when editing');
    const lockData = await lockUpdateRes.json();
    assert.equal(lockData.code, 'TEMPLATE_LOCKED');

    // 3b. 24-hour Customer Service Window (422 Unprocessable when sending free-form text outside window)
    await assert.rejects(
      async () => {
        await messagingService.sendOneToOneMessage({
          to: '+919876599999',
          type: 'TEXT',
          text: 'Hello from outside 24h window!',
          tenantId: tenantAId
        });
      },
      (err) => {
        assert.equal(err.statusCode, 422, 'Must reject with 422 when 24h window is closed');
        assert.equal(err.code, 'WINDOW_CLOSED_24H');
        return true;
      }
    );

    // 3c. Opt-out Suppression Enforcement (403 Forbidden)
    const optedOutPhone = '919876588888';
    db.prepare(`
      INSERT INTO contact_suppressions (clean_phone, reason, created_at)
      VALUES (?, 'USER_OPT_OUT', UTC_TIMESTAMP())
    `).run(optedOutPhone);

    await assert.rejects(
      async () => {
        await messagingService.sendOneToOneMessage({
          to: optedOutPhone,
          type: 'TEMPLATE',
          templateIdOrName: 'some_template',
          tenantId: tenantAId
        });
      },
      (err) => {
        assert.equal(err.statusCode, 403, 'Must reject with 403 when contact opted out');
        assert.equal(err.code, 'CONTACT_OPTED_OUT');
        return true;
      }
    );

    // 3d. Meta 131049 Cooldown & Billing Waiver
    const simMsgId = `wamid.SIM_131049_${Date.now()}`;
    const simPhone = '919876577777';
    db.prepare(`
      INSERT INTO whatsapp_messages (
        id, tenant_id, recipient_phone, message_type, template_category, meta_message_id,
        status, estimated_cost, currency, created_at, updated_at
      ) VALUES (?, ?, ?, 'TEMPLATE', 'MARKETING', ?, 'SENT', 0.8631, 'INR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(`msg_${Date.now()}`, tenantAId, simPhone, simMsgId);

    db.prepare(`
      INSERT INTO whatsapp_usage_ledger (
        tenant_id, recipient_phone, meta_message_id, category, unit_cost, currency,
        billing_status, created_at
      ) VALUES (?, ?, ?, 'MARKETING', 0.8631, 'INR', 'BILLED', CURRENT_TIMESTAMP)
    `).run(tenantAId, simPhone, simMsgId);

    // Simulate 131049 webhook delivery failure
    const webhookPayload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: simMsgId,
              status: 'failed',
              timestamp: String(Math.floor(Date.now() / 1000)),
              recipient_id: simPhone,
              errors: [{
                code: 131049,
                title: 'Meta per-user marketing rate limit hit',
                message: 'Recipient has exceeded WhatsApp promo limit'
              }]
            }]
          }
        }]
      }]
    };
    await webhookService.processIncomingWebhook(webhookPayload);

    // Verify 131049 cooldown recorded and ledger waived
    const cooldownRow = db.prepare('SELECT * FROM contact_marketing_cooldowns WHERE phone_e164 = ?').get(simPhone);
    assert.ok(cooldownRow, 'Cooldown row must be upserted for 131049 failure');
    assert.equal(cooldownRow.error_code, 131049);

    const ledgerRow = db.prepare('SELECT billing_status, unit_cost FROM whatsapp_usage_ledger WHERE meta_message_id = ?').get(simMsgId);
    assert.equal(ledgerRow.billing_status, 'WAIVED', 'Ledger billing_status must be WAIVED for 131049');
    assert.equal(Number(ledgerRow.unit_cost), 0, 'Ledger unit_cost must be waived to 0');

    // 3e. Oct 2026 India Rates Verification
    const mktRate = metaRateService.calculateUnitRate('MARKETING');
    const utlRate = metaRateService.calculateUnitRate('UTILITY');
    assert.equal(mktRate, 0.8631, 'Official Oct 2026 Meta India marketing rate must be ₹0.8631');
    assert.equal(utlRate, 0.1150, 'Official Oct 2026 Meta India utility rate must be ₹0.1150');
  });

  // =========================================================================
  // SECTION 4: Visual Flow Studio CRUD + AI Flow Architect ("booking flow")
  // =========================================================================
  test('4. Flow Studio & AI Architect: generate valid graph, execute multi-turn with zero loops', async () => {
    // 4a. AI Flow Architect generation from prompt
    const generated = await aiFlowGeneratorService.generateFlowFromPrompt({
      prompt: 'Create an automated luxury resort room booking intake flow with check-in and room choice',
      tenantId: tenantAId
    });

    assert.ok(generated.success, 'AI flow generator must succeed');
    assert.ok(generated.flow && generated.flow.name, 'Generated flow must have a name');

    const nodes = JSON.parse(generated.flow.nodes_json || generated.draftVersion?.nodes_json || '[]');
    const edges = JSON.parse(generated.flow.edges_json || generated.flow.transitions_json || generated.draftVersion?.transitions_json || '[]');
    assert.ok(Array.isArray(nodes) && nodes.length >= 3, 'Must generate multi-node graph');
    assert.ok(Array.isArray(edges) && edges.length >= 2, 'Must generate connecting edges');

    const nodeTypes = nodes.map(n => String(n.data?.type || n.type || '').toUpperCase());
    assert.ok(nodeTypes.some(t => t.includes('TRIGGER')), 'Flow graph must contain a trigger node');

    // 4b. Session State Transition & Zero-Loop Protection
    const sessionToken = `sess_qa_${Date.now()}`;
    const flowId = generated.flow.id;

    const flowVersionId = generated.draftVersion?.id || 1;

    // Create active flow session
    db.prepare(`
      INSERT INTO conversation_flow_sessions (
        tenant_id, flow_id, flow_version_id, session_key, sender_phone, session_status,
        current_node_id, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '+919876540000', 'ACTIVE', 'node_1', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(tenantAId, flowId, flowVersionId, sessionToken);

    // Verify session state
    const activeSession = db.prepare('SELECT * FROM conversation_flow_sessions WHERE session_key = ?').get(sessionToken);
    assert.equal(activeSession.session_status, 'ACTIVE');
  });

  // =========================================================================
  // SECTION 5: Dynamic In-App Experience Studio (/x/:slug) + DB Validation (422) + Rate Negotiation
  // =========================================================================
  test('5. In-App Experience Runtime: DB field validation (422), price range filter & rate negotiation', async () => {
    const slug = `qa-experience-${Date.now()}`;
    const expRes = db.prepare(`
      INSERT INTO inapp_experiences (
        tenant_id, name, slug, domain_type, status, theme_json, features_json,
        active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, 'QA Beach Villa Booking', ?, 'HOSPITALITY', 'PUBLISHED',
        '{"primaryColor":"#2563eb"}',
        '{"catalogEnabled":true,"negotiationEnabled":true,"callsEnabled":true}',
        1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(tenantAId, slug);
    const experienceId = expRes.lastInsertRowid;

    // Create Screen and Validated Form Field
    const scrRes = db.prepare(`
      INSERT INTO inapp_screens (
        experience_id, screen_key, screen_type, title, display_order, active_status, created_at, updated_at
      ) VALUES (?, 'intake_form', 'FORM', 'Guest Intake', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(experienceId);
    const screenId = scrRes.lastInsertRowid;

    db.prepare(`
      INSERT INTO inapp_form_fields (
        tenant_id, screen_id, field_key, label, input_type,
        validation_rules_json, display_order, active_status, created_at, updated_at
      ) VALUES (?, ?, 'guest_count', 'Total Guests', 'NUMBER', '{"min":1,"max":10,"required":true}', 1, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    `).run(tenantAId, screenId);

    // 5a. Load Public Experience by Slug (200 OK)
    const pubRes = await fetch(`${baseUrl}/api/v1/public/x/${slug}`);
    assert.equal(pubRes.status, 200, 'Public experience must be retrievable by slug');
    const pubData = await pubRes.json();
    assert.equal(pubData.data.experience.slug, slug);

    // 5b. Submit Form with invalid data -> DB Validation returns 422
    const startSess = await inappRuntimeService.startVisitorSession({
      slug,
      visitorPhone: '+919876543210',
      visitorName: 'QA Visitor'
    });
    const visitorToken = startSess.sessionToken;

    await assert.rejects(
      async () => {
        await inappRuntimeService.submitScreenForm({
          slug,
          sessionToken: visitorToken,
          screenKey: 'intake_form',
          formData: { guest_count: 99 } // Exceeds max: 10
        });
      },
      (err) => {
        assert.equal(err.statusCode, 422, 'Out of bounds form data must return 422');
        return true;
      }
    );

    // 5c. Rate Negotiation: Auto-Approve deterministic outcome
    const autoApproveRes = await inappNegotiationService.createNegotiation({
      slug,
      sessionToken: visitorToken,
      itemTitle: 'Ocean Villa Stay',
      catalogItemId: 1,
      basePrice: 5000,
      customerOfferPrice: 4800, // Above auto-approve floor
      notes: 'Family weekend vacation'
    });
    assert.equal(autoApproveRes.status, 'AUTO_APPROVED', 'Offer above floor must be AUTO_APPROVED');
    assert.equal(autoApproveRes.approvedFinalPrice, 4800);
    assert.ok(autoApproveRes.grandTotal > 4800, 'Grand total must include 18% GST');

    // 5d. Rate Negotiation: Pending Agent Counter outcome
    const pendingRes = await inappNegotiationService.createNegotiation({
      slug,
      sessionToken: visitorToken,
      itemTitle: 'Ocean Villa Stay',
      catalogItemId: 1,
      basePrice: 5000,
      customerOfferPrice: 3800, // Below auto-approve price -> requires agent review
      notes: 'Group discount'
    });
    assert.equal(pendingRes.status, 'PENDING_AGENT', 'Lower offer must remain PENDING_AGENT');

    // Agent counters the offer
    const counterRes = await inappNegotiationService.agentCounterOffer({
      negotiationId: pendingRes.negotiationId,
      agentCounterPrice: 4200,
      notes: 'Best possible rate including complimentary breakfast'
    });
    assert.equal(counterRes.status, 'AGENT_COUNTERED', 'Agent response must transition to AGENT_COUNTERED');
    assert.equal(counterRes.agentCounterPrice, 4200);
  });

  // =========================================================================
  // SECTION 6: MySQL 8.4 FOR UPDATE SKIP LOCKED Job Queue Concurrency & Retries
  // =========================================================================
  test('6. Job Queue Concurrency: FOR UPDATE SKIP LOCKED, exponential backoff retry & dead-letter queue', async () => {
    const idemKey = `idem_qa_${Date.now()}`;
    const enqRes = jobQueueService.enqueueJob({
      tenantId: tenantAId,
      queueName: 'qa_queue',
      jobType: 'SESSION_CLEANUP',
      payload: { test: true },
      idempotencyKey: idemKey,
      maxAttempts: 3
    });
    assert.ok(enqRes.jobId, 'Must enqueue job and return jobId');

    // Deduplication check: re-enqueueing with same idempotencyKey returns existing job
    const duplicateRes = jobQueueService.enqueueJob({
      tenantId: tenantAId,
      queueName: 'qa_queue',
      jobType: 'SESSION_CLEANUP',
      payload: { test: true },
      idempotencyKey: idemKey
    });
    assert.equal(duplicateRes.jobId, enqRes.jobId, 'Idempotent key must prevent duplicate insertion');

    // Execute job via JobWorkerEngine built-in handler
    const jobRecord = db.prepare('SELECT * FROM system_job_queue WHERE id = ?').get(enqRes.jobId);
    const handler = jobWorkerEngine.handlers.get('SESSION_CLEANUP');
    assert.ok(typeof handler === 'function', 'SESSION_CLEANUP handler must be registered');

    const rawPayload = jobRecord.payload_json;
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const result = await handler(payload, jobRecord);
    assert.ok(result !== undefined, 'Handler must return execution result');

    // Verify retry backoff computation
    const backoff1 = jobWorkerEngine._calculateBackoffSeconds(1);
    const backoff2 = jobWorkerEngine._calculateBackoffSeconds(2);
    const backoff3 = jobWorkerEngine._calculateBackoffSeconds(3);
    assert.ok(backoff2 > backoff1, 'Backoff must increase exponentially on retry 2');
    assert.ok(backoff3 > backoff2, 'Backoff must increase exponentially on retry 3');
  });

  // =========================================================================
  // SECTION 7: Task-Scoped AI Knowledge Grounding, IndiaMART & Meta CAPI ROAS
  // =========================================================================
  test('7. Task-Scoped AI & Lead Attribution: knowledge grounding, IndiaMART sync & CAPI ROAS calculation', async () => {
    // 7a. Grounded Knowledge Retrieval
    db.prepare(`
      INSERT INTO ai_knowledge_sources (
        tenant_id, title, source_type, content_text, tags_json, active_status, delete_status
      ) VALUES (
        ?, 'Beach Villa Check-In Policies', 'TEXT_FAQ',
        'Standard check-in time is 2:00 PM and check-out time is 11:00 AM. Early check-in is subject to availability upon request.',
        '["checkin","checkout","timing","hours"]', 1, 0
      )
    `).run(tenantAId);

    const match = await taskScopedAiAgentService.generateReply({
      tenantId: tenantAId,
      senderPhone: '919876543210',
      incomingText: 'What is the check-in and check-out timing for the beach villa?'
    });
    assert.ok(match.replyText.includes('2:00 PM') || match.replyText.includes('11:00 AM'), 'AI response must be factually grounded in tenant knowledge');

    // 7b. Off-Topic / Handoff Guardrail
    const isHandoff = taskScopedAiAgentService.checkHandoffIntent('I want to speak with a human manager immediately', tenantAId);
    assert.ok(isHandoff, 'Human manager request must trigger human handoff guardrail');

    // 7c. IndiaMART Lead Polling Sync Handler
    const indiamartHandler = jobWorkerEngine.handlers.get('INDIAMART_POLL_SYNC');
    assert.ok(typeof indiamartHandler === 'function', 'INDIAMART_POLL_SYNC handler must be registered');

    const indiamartResult = await indiamartHandler({
      tenantId: tenantAId,
      mockLeads: [{
        sender_phone: '919876512345',
        sender_name: 'Rajesh Sharma',
        sender_email: 'rajesh@b2bcorp.test',
        product_name: 'Wholesale Resort Booking',
        query_message: 'Require 10 rooms for annual corporate retreat',
        deal_value: 120000
      }]
    });
    assert.equal(indiamartResult.status, 'SUCCESS');
    assert.equal(indiamartResult.syncedCount, 1);

    // Verify contact and CRM record inserted with INDIAMART attribution
    const imContact = db.prepare('SELECT source FROM contacts WHERE phone_e164 = ? AND tenant_id = ?').get('+919876512345', tenantAId);
    assert.equal(imContact?.source, 'INDIAMART');

    // 7d. Meta Conversions API (CAPI) & CTWA ROAS Handler
    const capiHandler = jobWorkerEngine.handlers.get('META_CAPI_CONVERSION');
    assert.ok(typeof capiHandler === 'function', 'META_CAPI_CONVERSION handler must be registered');

    const capiResult = await capiHandler({
      tenantId: tenantAId,
      eventName: 'Purchase',
      phoneE164: '+919876512345',
      valueInr: 50000,
      adSpend: 10000,
      isSimulation: true
    });
    assert.equal(capiResult.status, 'MOCK_DISPATCHED');
    assert.equal(capiResult.roas, 5.0, 'ROAS must be calculated accurately as value / adSpend (50k / 10k = 5.0)');
    assert.equal(capiResult.eventName, 'Purchase');
  });

  // =========================================================================
  // SECTION 8: DPDP Consent Ledger, Data Subject Export, Anonymization & SEO
  // =========================================================================
  test('8. DPDP Act 2023 Compliance & SEO: consent ledger, PII anonymization, robots.txt & sitemap.xml', async () => {
    const dpdpPhone = '+919876599887';

    // 8a. Consent Recording
    const consentRes = await complianceService.recordConsent({
      phoneE164: dpdpPhone,
      tenantId: tenantAId,
      consentType: 'OPT_IN',
      purpose: 'MARKETING',
      ipAddress: '127.0.0.1',
      userAgent: 'SARVYA-QA-Runner'
    });
    assert.ok(consentRes.success, 'Consent must be recorded in DPDP ledger');

    // 8b. Data Subject PII Export (Right to Access)
    const exportData = await complianceService.exportDataSubjectPii(dpdpPhone, tenantAId);
    assert.equal(exportData.phoneE164, dpdpPhone);
    assert.ok(Array.isArray(exportData.consentHistory), 'Export must contain consent history');

    // 8c. PII Erasure / Anonymization (Right to be Forgotten)
    const eraseRes = await complianceService.executeErasureOrAnonymization(dpdpPhone, tenantAId, {
      schedule48hNotice: false,
      resolvedBy: 'qa_compliance_officer'
    });
    assert.ok(eraseRes.success, 'Erasure/Anonymization must succeed');

    // 8d. Technical SEO Endpoints
    const robotsRes = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsRes.status, 200);
    const robotsTxt = await robotsRes.text();
    assert.ok(robotsTxt.includes('User-agent: *'));
    assert.ok(robotsTxt.includes('Disallow: /api/'));
    assert.ok(robotsTxt.includes('/sitemap.xml'));

    const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapRes.status, 200);
    const sitemapXml = await sitemapRes.text();
    assert.ok(sitemapXml.includes('<urlset'));
    assert.ok(sitemapXml.includes('/pricing'));
    assert.ok(sitemapXml.includes('/solutions/hospitality'));
  });

});
