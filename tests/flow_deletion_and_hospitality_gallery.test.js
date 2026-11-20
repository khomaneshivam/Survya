/**
 * Flow Deletion, Easy Flow Management & Hospitality Gallery Test Suite
 * Tests flow deletion, trigger/version cascade cleanup, flow renaming,
 * flow duplication, and hospitality media upload module data contracts.
 *
 * SAFETY CONSTRAINT: All operations use in-memory assertions or simulation mode.
 * Zero live Meta WhatsApp messages are dispatched.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../src/config/database');
const flowService = require('../src/services/conversationFlowService');
const hospitalityConfigService = require('../src/services/hospitalityConfigService');

describe('Flow Deletion, Management & Hospitality Media Suite', () => {
  const TEST_USER = { id: 'test_admin_mgmt', name: 'Management Admin' };
  let testFlowId = null;
  let duplicateFlowId = null;

  before(() => {
    // Clean up any test flows from prior runs
    try {
      db.prepare("DELETE FROM conversation_flows WHERE name LIKE '%Test Suite Flow%'").run();
    } catch (e) {}
  });

  after(() => {
    // Cleanup any lingering test flows
    if (testFlowId) {
      try { flowService.deleteFlow(testFlowId, TEST_USER, 1); } catch (e) {}
    }
    if (duplicateFlowId) {
      try { flowService.deleteFlow(duplicateFlowId, TEST_USER, 1); } catch (e) {}
    }
  });

  test('1. Create conversation flow and save draft with custom nodes', () => {
    const created = flowService.createFlow({
      name: 'Test Suite Flow Alpha',
      description: 'Temporary flow for deletion test',
      category: 'HOSPITALITY_ENQUIRY'
    }, TEST_USER);

    assert.ok(created && created.flow && created.flow.id, 'Flow should be created with an ID');
    testFlowId = created.flow.id;

    // Save draft version with nodes
    const draftNodes = [
      {
        id: 'trigger_1',
        type: 'TRIGGER_WHATSAPP',
        data: { label: 'Inbound WhatsApp', matchKeywords: ['testflow'] }
      },
      {
        id: 'msg_1',
        type: 'SEND_MESSAGE',
        data: { messageText: 'Hello from test suite!' }
      },
      {
        id: 'end_1',
        type: 'END',
        data: {}
      }
    ];

    const draftTransitions = [
      { id: 'e1', source: 'trigger_1', target: 'msg_1' },
      { id: 'e2', source: 'msg_1', target: 'end_1' }
    ];

    const draftResult = flowService.saveFlowDraft(testFlowId, {
      nodes: draftNodes,
      transitions: draftTransitions,
      variables: {},
      changelog: 'Initial test draft'
    }, TEST_USER, 1);

    assert.ok(draftResult.success, 'Draft should be saved successfully');
    assert.equal(draftResult.draftVersion.nodes.length, 3, 'Should have 3 nodes in draft');
  });

  test('2. Rename & Update Flow metadata (name, description, category)', () => {
    assert.ok(testFlowId, 'Flow must exist');

    const updated = flowService.updateFlow(testFlowId, {
      name: 'Test Suite Flow Renamed',
      description: 'Updated description for customer journey',
      category: 'B2B_SALES'
    }, TEST_USER, 1);

    assert.ok(updated && updated.flow, 'Flow should return updated object');
    assert.equal(updated.flow.name, 'Test Suite Flow Renamed');
    assert.equal(updated.flow.description, 'Updated description for customer journey');
    assert.equal(updated.flow.category, 'B2B_SALES');

    // Verify persisted directly in database
    const row = db.prepare('SELECT name, description, category FROM conversation_flows WHERE id = ?').get(testFlowId);
    assert.equal(row.name, 'Test Suite Flow Renamed');
    assert.equal(row.category, 'B2B_SALES');
  });

  test('3. Duplicate Flow creates a clone with draft version preserved', () => {
    assert.ok(testFlowId, 'Flow must exist to duplicate');

    const cloned = flowService.duplicateFlow(testFlowId, { name: 'Test Suite Flow Alpha (Copy)' }, TEST_USER, 1);
    assert.ok(cloned && cloned.flow && cloned.flow.id, 'Cloned flow should be created');
    assert.notEqual(cloned.flow.id, testFlowId, 'Cloned flow should have a new distinct ID');
    assert.equal(cloned.flow.name, 'Test Suite Flow Alpha (Copy)');
    duplicateFlowId = cloned.flow.id;

    // Check that cloned flow has the nodes
    const fetched = flowService.getFlowById(duplicateFlowId, 1);
    const nodes = fetched.draftVersion?.nodes || fetched.publishedVersion?.nodes;
    assert.ok(nodes && nodes.length === 3, 'Cloned flow should contain the 3 copied nodes');
  });

  test('4. Delete Flow permanently cleans up flow, versions, and triggers', () => {
    assert.ok(testFlowId, 'Flow must exist to delete');

    // Attach a mock workflow trigger
    try {
      db.prepare(`
        INSERT INTO workflow_triggers (id, tenant_id, trigger_type, flow_id, match_keywords, phone_number_id, is_active, priority)
        VALUES ('trig_test_del', 1, 'WHATSAPP_INBOUND', ?, '["testflow"]', '1510764325447375', 1, 100)
      `).run(String(testFlowId));
    } catch (e) {}

    // Attach a mock session and event
    try {
      db.prepare(`
        INSERT INTO conversation_flow_sessions (id, tenant_id, flow_id, contact_phone, current_node_id, status)
        VALUES ('sess_test_del', 1, ?, '919876543210', 'trigger_1', 'ACTIVE')
      `).run(testFlowId);

      db.prepare(`
        INSERT INTO conversation_flow_events (id, tenant_id, session_id, flow_id, event_type, node_id)
        VALUES ('evt_test_del', 1, 'sess_test_del', ?, 'NODE_ENTERED', 'trigger_1')
      `).run(testFlowId);
    } catch (e) {}

    // Execute deleteFlow
    const result = flowService.deleteFlow(testFlowId, TEST_USER, 1);
    assert.ok(result.success, 'deleteFlow should return success: true');
    assert.equal(result.deletedFlowId, testFlowId);

    // Verify flow is deleted from database
    const flowRow = db.prepare('SELECT id FROM conversation_flows WHERE id = ?').get(testFlowId);
    assert.equal(flowRow, undefined, 'conversation_flows row should no longer exist');

    // Verify triggers deleted
    const trigRow = db.prepare('SELECT id FROM workflow_triggers WHERE flow_id = ?').get(String(testFlowId));
    assert.equal(trigRow, undefined, 'associated workflow_triggers should be deleted');

    // Verify versions deleted
    const verRow = db.prepare('SELECT id FROM conversation_flow_versions WHERE flow_id = ?').get(testFlowId);
    assert.equal(verRow, undefined, 'associated conversation_flow_versions should be deleted');

    // Verify sessions deleted
    const sessRow = db.prepare('SELECT id FROM conversation_flow_sessions WHERE flow_id = ?').get(testFlowId);
    assert.equal(sessRow, undefined, 'associated conversation_flow_sessions should be deleted');

    // Verify events deleted
    const evtRow = db.prepare('SELECT id FROM conversation_flow_events WHERE flow_id = ?').get(testFlowId);
    assert.equal(evtRow, undefined, 'associated conversation_flow_events should be deleted');

    testFlowId = null; // Marked as deleted
  });

  test('5. Attempting to delete non-existent flow throws Error cleanly', () => {
    assert.throws(
      () => {
        flowService.deleteFlow(99999999, TEST_USER, 1);
      },
      /not found/i,
      'Should throw not found error'
    );
  });

  test('6. Hospitality room categories & property gallery data contracts exist', () => {
    // 1. Verify room categories list via hospitalityConfigService
    const categories = hospitalityConfigService.listRoomCategories(1, 1);
    assert.ok(Array.isArray(categories), 'Room categories should be an array');
    assert.ok(categories.length > 0, 'Should have at least 1 room category for property 1');
    assert.ok(categories[0].name, 'Room category should have a name');

    // 2. Verify property gallery service aggregates rooms and property gallery
    const gallery = hospitalityConfigService.getPropertyGallery(1, 1);
    assert.ok(gallery, 'Gallery object should be returned');
    assert.ok(Array.isArray(gallery.all_photos), 'all_photos should be an array');
    assert.ok(Array.isArray(gallery.room_galleries), 'room_galleries should be an array');

    // 3. Verify hospitality_room_images table is accessible
    const roomImages = hospitalityConfigService.listRoomImages(categories[0].id, 1, 1);
    assert.ok(Array.isArray(roomImages), 'Room images query should return an array');
  });
});
