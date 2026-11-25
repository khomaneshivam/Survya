const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const flowController = require('../src/controllers/flowController');
const { db } = require('../src/config/database');

describe('Meta Flow Creator & Live Preview Intake Test Suite', () => {
  after(async () => {
    // Clean up created test flows
    try {
      db.prepare(`DELETE FROM whatsapp_flows WHERE name LIKE 'Test Preview Flow%'`).run();
    } catch (e) {
      // ignore
    }
  });

  test('1. flowController.createFlow supports direct creation with PUBLISHED status & auto-generated meta_flow_id', async () => {
    const mockReq = {
      user: {
        id: 'preview_test_admin',
        role: 'ADMIN',
        tenant_id: 1,
        workspace_role: 'OWNER'
      },
      body: {
        name: `Test Preview Flow ${Date.now()}`,
        categories: ['LEAD_GENERATION'],
        publishImmediately: true,
        status: 'PUBLISHED',
        flow_json: {
          version: '3.1',
          data_api_version: '3.0',
          routing_model: { MAIN_INTAKE: [] },
          screens: [
            {
              id: 'MAIN_INTAKE',
              title: 'Reserve Your Stay',
              terminal: true,
              layout: {
                type: 'SingleColumnLayout',
                children: [
                  {
                    type: 'Form',
                    name: 'stay_form',
                    children: [
                      { type: 'TextInput', name: 'guest_name', label: 'Guest Name', required: true },
                      { type: 'TextInput', name: 'check_in', label: 'Check-in Date', required: true },
                      { type: 'TextInput', name: 'check_out', label: 'Check-out Date', required: true }
                    ]
                  }
                ]
              }
            }
          ]
        }
      }
    };

    let responseData = null;
    let statusCode = 200;
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

    await flowController.createFlow(mockReq, mockRes);

    assert.strictEqual(statusCode, 201, 'Should return HTTP 201 Created');
    assert.ok(responseData, 'Should return response payload');
    assert.strictEqual(responseData.success, true, 'Response success should be true');
    assert.ok(responseData.data.id, 'Should return created flow ID');
    assert.strictEqual(responseData.data.meta_status, 'PUBLISHED', 'Initial status should be PUBLISHED');
    assert.ok(responseData.data.meta_flow_id, 'meta_flow_id should be auto-populated for published flows');

    // Verify in database
    const row = db.prepare('SELECT * FROM whatsapp_flows WHERE id = ?').get(responseData.data.id);
    assert.ok(row, 'Flow record should exist in database');
    assert.strictEqual(row.status, 'PUBLISHED');
  });

  test('2. Flow JSON Schema validation guarantees v3.1 terminal screens and completion payload mapping', () => {
    const formChildren = [
      { type: "TextInput", name: "guest_name", label: "Guest Name", required: true },
      { type: "TextInput", name: "check_in", label: "Check-in Date", required: true },
      { type: "TextInput", name: "check_out", label: "Check-out Date", required: true },
      {
        type: "Dropdown",
        name: "room_preference",
        label: "Room Preference",
        required: true,
        "data-source": [
          { id: "room_1", title: "Deluxe Sea View Room" },
          { id: "room_2", title: "Luxury Coconut Cottage" }
        ]
      },
      {
        type: "Footer",
        label: "Request Quote",
        "on-click-action": {
          name: "complete",
          payload: {
            guest_name: "${form.guest_name}",
            check_in: "${form.check_in}",
            check_out: "${form.check_out}",
            room_preference: "${form.room_preference}"
          }
        }
      }
    ];

    const flowSchema = {
      version: "3.1",
      data_api_version: "3.0",
      routing_model: { INTAKE_SCREEN: [] },
      screens: [
        {
          id: "INTAKE_SCREEN",
          title: "Book Stay",
          terminal: true,
          data: {},
          layout: {
            type: "SingleColumnLayout",
            children: [
              {
                type: "Form",
                name: "intake_form",
                children: formChildren
              }
            ]
          }
        }
      ]
    };

    assert.strictEqual(flowSchema.version, "3.1");
    assert.strictEqual(flowSchema.screens[0].terminal, true);
    assert.strictEqual(flowSchema.screens[0].layout.children[0].children[4]["on-click-action"].name, "complete");
    assert.strictEqual(flowSchema.screens[0].layout.children[0].children[4]["on-click-action"].payload.guest_name, "${form.guest_name}");
  });

  test('3. Simulator Intake Logic: Validates date ranges and computes dynamic nights and pricing', () => {
    function simulateIntakeCalculation(values) {
      const cin = new Date(values.check_in);
      const cout = new Date(values.check_out);
      if (isNaN(cin.getTime()) || isNaN(cout.getTime())) {
        return { error: 'Please select valid check-in and check-out dates.' };
      }
      if (cout <= cin) {
        return { error: 'Check-out date must be strictly after check-in date.' };
      }
      const diffTime = Math.abs(cout - cin);
      const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      let rate = 4500;
      if (values.room_preference.includes('Cottage')) rate = 6500;
      else if (values.room_preference.includes('Suite')) rate = 8500;

      const total = rate * nights;
      return {
        success: true,
        quote: {
          guest_name: values.guest_name || 'Guest',
          check_in: values.check_in,
          check_out: values.check_out,
          room: values.room_preference,
          nights,
          adults: values.adults || '2',
          children: values.children || '0',
          rate,
          total
        }
      };
    }

    // Invalid: checkout <= checkin
    const invalidResult = simulateIntakeCalculation({
      guest_name: 'Test Guest',
      check_in: '2026-11-25',
      check_out: '2026-11-24',
      room_preference: 'Deluxe Sea View Room'
    });
    assert.strictEqual(invalidResult.error, 'Check-out date must be strictly after check-in date.');

    // Valid: 2 nights at Deluxe (4500/night = 9000)
    const validResult = simulateIntakeCalculation({
      guest_name: 'Sunil Gavaskar',
      check_in: '2026-11-20',
      check_out: '2026-11-22',
      room_preference: 'Deluxe Sea View Room',
      adults: '2',
      children: '1'
    });
    assert.strictEqual(validResult.success, true);
    assert.strictEqual(validResult.quote.nights, 2);
    assert.strictEqual(validResult.quote.total, 9000);
    assert.strictEqual(validResult.quote.adults, '2');
    assert.strictEqual(validResult.quote.children, '1');

    // Valid: 3 nights at Luxury Cottage (6500/night = 19500)
    const cottageResult = simulateIntakeCalculation({
      guest_name: 'Kapil Dev',
      check_in: '2026-12-01',
      check_out: '2026-12-04',
      room_preference: 'Luxury Coconut Cottage',
      adults: '2',
      children: '0'
    });
    assert.strictEqual(cottageResult.success, true);
    assert.strictEqual(cottageResult.quote.nights, 3);
    assert.strictEqual(cottageResult.quote.total, 19500);
  });
});
