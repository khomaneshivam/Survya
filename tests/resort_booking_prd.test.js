const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { db } = require("../src/config/database");
const inventoryService = require("../src/services/inventoryService");
const enquiryService = require("../src/services/enquiryService");
const quotationService = require("../src/services/quotationService");
const webhookService = require("../src/services/webhookService");
const flowStarterTemplates = require("../src/services/flowStarterTemplates");
const metaWhatsAppService = require("../src/services/metaWhatsAppService");

describe("WhatsApp Resort Booking & Guest Management Platform (PRD v1.0 MVP)", () => {
  let testTenantId = 1;
  let testAdminUserId = "test_resort_admin";
  let testAgentUserId = "test_resort_agent";
  let testRoomTypeId = null;

  before(() => {
    // Ensure test users exist in DB
    const admin = db.prepare("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1").get();
    if (admin) {
      testAdminUserId = admin.id;
    } else {
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
        VALUES (?, 'Resort Admin', ?, '919876543210', 'hash', 'ADMIN', 'ACTIVE', 1)
      `).run(testAdminUserId, `admin_${Date.now()}@konkantrip.com`);
    }

    const agent = db.prepare("SELECT * FROM users WHERE role = 'USER' LIMIT 1").get();
    if (agent) {
      testAgentUserId = agent.id;
    } else {
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
        VALUES (?, 'Reservation Agent', ?, '919876543211', 'hash', 'USER', 'ACTIVE', 1)
      `).run(testAgentUserId, `agent_${Date.now()}@konkantrip.com`);
    }

    const existingLine = db.prepare("SELECT id FROM waba_phone_numbers WHERE phone_number_id = ?").get("test_phone_id");
    if (!existingLine) {
      db.prepare(`
        INSERT INTO waba_phone_numbers (id, phone_number_id, phone_number, display_name, quality_rating, status, tenant_id)
        VALUES ('waba_line_test_phone_id', 'test_phone_id', '15550234567', 'Test Resort Line', 'GREEN', 'CONNECTED', ?)
      `).run(testTenantId);
    }

    // Ensure a room type exists
    const rt = db.prepare("SELECT id FROM room_types WHERE tenant_id = ? LIMIT 1").get(testTenantId);
    if (rt) {
      testRoomTypeId = rt.id;
    } else {
      const created = inventoryService.createRoomType(testTenantId, {
        name: "Deluxe Sea View Room",
        base_rate: 4500,
        max_adults: 2
      }, testAdminUserId);
      testRoomTypeId = created.id;
    }
  });

  describe("1. Foundation, Tenant Isolation & Contacts (PR-001, PR-004)", () => {
    test("Tenant and Property models exist and are seeded", () => {
      const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(testTenantId);
      assert.ok(tenant, "Default tenant should exist");
      assert.strictEqual(tenant.slug, "konkantrip");

      const property = db.prepare("SELECT * FROM properties WHERE tenant_id = ?").get(testTenantId);
      assert.ok(property, "Default property should exist");
      assert.strictEqual(property.status, "ACTIVE");
    });

    test("upsertContact creates a new contact and records consent", () => {
      const testPhone = "919988776655";
      const contact = enquiryService.upsertContact(testTenantId, testPhone, "Rohan Sharma", "rohan@example.com", "WHATSAPP");
      assert.ok(contact.id);
      assert.strictEqual(contact.phone_e164, testPhone);
      assert.strictEqual(contact.name, "Rohan Sharma");

      // Verify consent record
      const consent = db.prepare("SELECT * FROM contact_consents WHERE contact_id = ?").get(contact.id);
      assert.ok(consent);
      assert.strictEqual(consent.status, "GRANTED");

      // Re-upserting updates the name without duplicate row
      const updated = enquiryService.upsertContact(testTenantId, testPhone, "Rohan S. Sharma", "rohan.new@example.com");
      assert.strictEqual(updated.id, contact.id);
      assert.strictEqual(updated.name, "Rohan S. Sharma");
    });
  });

  describe("2. Room Types & Manual Inventory Calendar (PR-011, PR-012)", () => {
    test("Can list room types and read daily availability", () => {
      const roomTypes = inventoryService.listRoomTypes(testTenantId, 1, false);
      assert.ok(Array.isArray(roomTypes));
      assert.ok(roomTypes.length >= 1);

      const avail = inventoryService.getAvailability(testTenantId);
      assert.ok(avail.start_date);
      assert.ok(avail.end_date);
      assert.ok(Array.isArray(avail.by_room_type));
      assert.ok(avail.by_room_type.length >= 1);
    });

    test("bulkUpdateInventory updates daily rates and quantities with audit logging", () => {
      const targetDate = "2026-12-25";
      const updates = [
        {
          room_type_id: testRoomTypeId,
          inventory_date: targetDate,
          available_qty: 8,
          base_rate: 6500,
          is_closed: 0
        }
      ];

      const res = inventoryService.bulkUpdateInventory(testTenantId, updates, testAdminUserId);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.updated_count, 1);

      const updatedRow = db.prepare(`
        SELECT * FROM room_inventory_daily WHERE room_type_id = ? AND inventory_date = ?
      `).get(testRoomTypeId, targetDate);

      assert.ok(updatedRow);
      assert.strictEqual(updatedRow.available_qty, 8);
      assert.strictEqual(updatedRow.base_rate, 6500);
      assert.strictEqual(updatedRow.is_closed, 0);

      // Verify audit log
      const audit = db.prepare(`
        SELECT * FROM audit_logs WHERE action = 'INVENTORY_BULK_UPDATE' ORDER BY id DESC LIMIT 1
      `).get();
      assert.ok(audit);
      assert.strictEqual(audit.user_id, testAdminUserId);
    });

    test("checkStayAvailability accurately verifies consecutive nights", () => {
      // Set 3 consecutive dates: 2026-12-01, 2026-12-02, 2026-12-03
      inventoryService.bulkUpdateInventory(testTenantId, [
        { room_type_id: testRoomTypeId, inventory_date: "2026-12-01", available_qty: 4, is_closed: 0 },
        { room_type_id: testRoomTypeId, inventory_date: "2026-12-02", available_qty: 4, is_closed: 0 },
        { room_type_id: testRoomTypeId, inventory_date: "2026-12-03", available_qty: 0, is_closed: 1 } // Sold out / closed
      ]);

      // Check-in Dec 1, Check-out Dec 3 (2 nights: Dec 1, Dec 2) -> Should be AVAILABLE
      const stay1 = inventoryService.checkStayAvailability(testTenantId, "2026-12-01", "2026-12-03", testRoomTypeId, 2);
      assert.strictEqual(stay1.available, true);
      assert.strictEqual(stay1.nights, 2);

      // Check-in Dec 2, Check-out Dec 4 (2 nights: Dec 2, Dec 3) -> Should NOT be available (Dec 3 closed)
      const stay2 = inventoryService.checkStayAvailability(testTenantId, "2026-12-02", "2026-12-04", testRoomTypeId, 1);
      assert.strictEqual(stay2.available, false);
    });
  });

  describe("3. Booking Enquiries Pipeline & Date Validation (PR-007, PR-008, PR-014)", () => {
    test("Date validation rejects check-out on or before check-in", () => {
      assert.throws(() => {
        enquiryService.createEnquiry(testTenantId, {
          phone: "919123456780",
          guest_name: "Invalid Dates Guest",
          check_in: "2026-12-10",
          check_out: "2026-12-09"
        });
      }, /Check-out date must be strictly after check-in date/);

      assert.throws(() => {
        enquiryService.createEnquiry(testTenantId, {
          phone: "919123456780",
          guest_name: "Same Day Guest",
          check_in: "2026-12-10",
          check_out: "2026-12-10"
        });
      }, /Check-out date must be strictly after check-in date/);
    });

    test("createEnquiry creates booking enquiry with status NEW", () => {
      const enquiry = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500001",
        guest_name: "Pooja Desai",
        check_in: "2026-12-20",
        check_out: "2026-12-23",
        adults: 2,
        children: 1,
        rooms_requested: 1,
        room_type_id: testRoomTypeId,
        room_preference: "Deluxe Sea View Room",
        flow_session_id: "test_flow_session_101"
      }, testAdminUserId);

      assert.ok(enquiry.id);
      assert.strictEqual(enquiry.status, "NEW");
      assert.strictEqual(enquiry.guest_name, "Pooja Desai");
      assert.strictEqual(enquiry.check_in, "2026-12-20");
      assert.strictEqual(enquiry.check_out, "2026-12-23");
      assert.strictEqual(enquiry.adults, 2);
      assert.strictEqual(enquiry.children, 1);
      assert.ok(enquiry.availability_check);
    });

    test("Idempotency: Repeated Flow submission does NOT create duplicate enquiry (PR-007)", () => {
      const sessionKey = `flow_idem_${Date.now()}`;
      const first = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500002",
        guest_name: "Amit Patil",
        check_in: "2026-12-15",
        check_out: "2026-12-17",
        flow_session_id: sessionKey
      });

      const second = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500002",
        guest_name: "Amit Patil",
        check_in: "2026-12-15",
        check_out: "2026-12-17",
        flow_session_id: sessionKey
      });

      assert.strictEqual(first.id, second.id, "Second submission must return identical enquiry ID");
    });

    test("Enquiry status progression: NEW -> QUALIFIED -> WON", () => {
      const enquiry = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500003",
        guest_name: "Vikram Mehta",
        check_in: "2026-12-18",
        check_out: "2026-12-20"
      });

      // Update to QUALIFIED
      const qualified = enquiryService.updateEnquiry(testTenantId, enquiry.id, {
        status: "QUALIFIED",
        assigned_to: testAgentUserId,
        notes: "Guest confirmed interested in Sea View room"
      }, testAdminUserId);

      assert.strictEqual(qualified.status, "QUALIFIED");
      assert.strictEqual(qualified.assigned_to, testAgentUserId);

      // Section 9.1: Marking Won
      const won = enquiryService.updateEnquiry(testTenantId, enquiry.id, {
        status: "WON",
        notes: "Advance paid offline, room confirmed"
      }, testAdminUserId);

      assert.strictEqual(won.status, "WON");
    });

    test("Section 9.1: Transitioning to LOST requires reason or note", () => {
      const enquiry = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500004",
        guest_name: "Lost Lead Guest",
        check_in: "2026-12-19",
        check_out: "2026-12-21"
      });

      // Should fail without reason or note
      assert.throws(() => {
        enquiryService.updateEnquiry(testTenantId, enquiry.id, {
          status: "LOST"
        });
      }, /A reason or note is required when marking an enquiry as LOST/);

      // Should succeed with lost_reason
      const lost = enquiryService.updateEnquiry(testTenantId, enquiry.id, {
        status: "LOST",
        lost_reason: "Found alternative resort in Mandwa"
      });
      assert.strictEqual(lost.status, "LOST");
      assert.strictEqual(lost.lost_reason, "Found alternative resort in Mandwa");
    });
  });

  describe("4. Quotation Builder & WhatsApp Dispatch (PR-013, PR-014, PR-018)", () => {
    let testEnquiry = null;

    before(() => {
      testEnquiry = enquiryService.createEnquiry(testTenantId, {
        phone: "919876500005",
        guest_name: "Dr. Ananya Joshi",
        check_in: "2026-12-22",
        check_out: "2026-12-24", // 2 nights
        room_type_id: testRoomTypeId
      });
    });

    test("createQuote calculates item totals, taxes, and sequential quote_number", () => {
      const quote = quotationService.createQuote(testTenantId, testEnquiry.id, {
        items: [
          {
            description: "Deluxe Sea View Room",
            quantity: 1,
            nights: 2,
            unit_rate: 4500,
            room_type_id: testRoomTypeId
          },
          {
            description: "Barbeque Beach Dinner Experience",
            quantity: 2,
            nights: 1,
            unit_rate: 1200
          }
        ],
        tax_rate: 0.12,
        notes: "Includes sunset cocktail vouchers & breakfast buffet."
      }, testAdminUserId);

      assert.ok(quote.id);
      assert.ok(quote.quote_number.startsWith("Q-2026-"));
      assert.strictEqual(quote.status, "DRAFT");
      // Subtotal: (1 * 2 * 4500) + (2 * 1 * 1200) = 9000 + 2400 = 11400
      assert.strictEqual(quote.subtotal, 11400);
      // Tax: 11400 * 0.12 = 1368
      assert.strictEqual(quote.tax_total, 1368);
      // Total: 11400 + 1368 = 12768
      assert.strictEqual(quote.total, 12768);
      assert.strictEqual(quote.items.length, 2);
    });

    test("formatWhatsAppQuotationMessage generates structured customer message", () => {
      const quote = quotationService.createQuote(testTenantId, testEnquiry.id, {
        items: [
          { description: "Deluxe Sea View Room", quantity: 1, nights: 2, unit_rate: 4500 }
        ]
      });

      const messageText = quotationService.formatWhatsAppQuotationMessage(quote);
      assert.ok(messageText.includes("KonkanTrip Beach Resort & Spa"));
      assert.ok(messageText.includes(quote.quote_number));
      assert.ok(messageText.includes("Dr. Ananya Joshi"));
      assert.ok(messageText.includes("₹4,500"));
      assert.ok(messageText.includes("Room availability is indicative"));
    });

    test("sendQuoteViaWhatsApp marks quote SENT, advances enquiry to QUOTED, and logs audit", async () => {
      const originalSend = metaWhatsAppService.sendTextMessage;
      metaWhatsAppService.sendTextMessage = async () => ({
        messages: [{ id: "wamid.mock_quote_123" }]
      });

      try {
        const quote = quotationService.createQuote(testTenantId, testEnquiry.id, {
          items: [
            { description: "Deluxe Sea View Room", quantity: 1, nights: 2, unit_rate: 4500 }
          ]
        });

        const sendRes = await quotationService.sendQuoteViaWhatsApp(testTenantId, quote.id, testAdminUserId);
        assert.strictEqual(sendRes.success, true);
        assert.strictEqual(sendRes.quote.status, "SENT");
        assert.ok(sendRes.quote.sent_at);

        // Verify enquiry advanced to QUOTED
        const updatedEnquiry = enquiryService.getEnquiryById(testTenantId, testEnquiry.id);
        assert.strictEqual(updatedEnquiry.status, "QUOTED");

        // Verify audit log
        const audit = db.prepare(`
          SELECT * FROM audit_logs WHERE action = 'QUOTE_SENT_WHATSAPP' AND target_id = ?
        `).get(String(quote.id));
        assert.ok(audit);
      } finally {
        metaWhatsAppService.sendTextMessage = originalSend;
      }
    });
  });

  describe("5. Tenant Dashboard Summary & Analytics (PR-019)", () => {
    test("getDashboardSummary returns counts, pipeline metrics, and upcoming stays", () => {
      const summary = enquiryService.getDashboardSummary(testTenantId);
      assert.ok(summary);
      assert.ok(summary.counts);
      assert.ok(typeof summary.counts.TOTAL === "number");
      assert.ok(typeof summary.counts.NEW === "number");
      assert.ok(typeof summary.counts.QUOTED === "number");
      assert.ok(typeof summary.counts.WON === "number");

      assert.ok(summary.financial);
      assert.ok(typeof summary.financial.pipeline_value === "number");
      assert.ok(typeof summary.financial.won_revenue === "number");

      assert.ok(Array.isArray(summary.upcoming_checkins));
      assert.ok(Array.isArray(summary.recent_enquiries));
      assert.ok(Array.isArray(summary.room_types));
    });
  });

  describe("6. Webhook Flow Ingestion & Auto-Enquiry (PR-007, PR-003)", () => {
    test("Inbound nfm_reply Flow completion automatically creates a booking enquiry", async () => {
      const uniqueMsgId = `wamid.flow_prd_test_${Date.now()}`;
      const guestPhone = "919988112233";

      const flowPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_TEST_ENTRY",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "15550234567",
                    phone_number_id: "test_phone_id"
                  },
                  contacts: [
                    {
                      profile: { name: "Sunita Gokhale" },
                      wa_id: guestPhone
                    }
                  ],
                  messages: [
                    {
                      from: guestPhone,
                      id: uniqueMsgId,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "interactive",
                      interactive: {
                        type: "nfm_reply",
                        nfm_reply: {
                          name: "flow",
                          body: "Stay Enquiry Submission",
                          response_json: JSON.stringify({
                            flow_token: `token_${Date.now()}`,
                            guest_name: "Sunita Gokhale",
                            check_in: "2026-12-28",
                            check_out: "2026-12-30",
                            adults: "2",
                            children: "1",
                            room_preference: "Deluxe Sea View Room"
                          })
                        }
                      }
                    }
                  ]
                },
                field: "messages"
              }
            ]
          }
        ]
      };

      await webhookService.processIncomingPayload(flowPayload);

      // Verify enquiry was created
      const enquiry = db.prepare(`
        SELECT * FROM booking_enquiries WHERE flow_session_id = ?
      `).get(uniqueMsgId);

      assert.ok(enquiry, "Booking enquiry must be created automatically from Flow submission");
      assert.strictEqual(enquiry.guest_name, "Sunita Gokhale");
      assert.strictEqual(enquiry.check_in, "2026-12-28");
      assert.strictEqual(enquiry.check_out, "2026-12-30");
      assert.strictEqual(enquiry.status, "NEW");
    });
  });
});
