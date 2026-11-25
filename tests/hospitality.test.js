const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { app } = require("../server");
const { db } = require("../src/config/database");
const config = require("../src/config/env");

const configService = require("../src/services/hospitalityConfigService");
const availabilityService = require("../src/services/hospitalityAvailabilityService");
const pricingService = require("../src/services/hospitalityPricingService");
const chatService = require("../src/services/hospitalityChatService");

describe("SARVYA Hospitality Inventory, Room & Rate Configuration Module Test Suite", () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;
  let staffUserA;
  let staffTokenA;
  let staffUserB;
  let staffTokenB;

  const testRoomCategoryIds = [];
  const testSeasonalRateIds = [];
  const testDailyRateIds = [];
  const testBlockIds = [];
  const testRatePlanIds = [];

  before(() => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const hash = bcrypt.hashSync("TestPass123!", 8);

    // 1. Admin User
    const adminId = `hosp_admin_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Hospitality Admin', ?, '919800000001', ?, 'ADMIN', 'ACTIVE', 1)
    `).run(adminId, `admin_${Date.now()}@hospitality.test`, hash);

    adminUser = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Staff User A
    const staffIdA = `staff_a_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Staff Member A', ?, '919800000002', ?, 'USER', 'ACTIVE', 1)
    `).run(staffIdA, `staff_a_${Date.now()}@hospitality.test`, hash);

    staffUserA = db.prepare("SELECT * FROM users WHERE id = ?").get(staffIdA);
    staffTokenA = jwt.sign(
      { id: staffUserA.id, email: staffUserA.email, role: staffUserA.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Staff User B
    const staffIdB = `staff_b_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status, tenant_id)
      VALUES (?, 'Staff Member B', ?, '919800000003', ?, 'USER', 'ACTIVE', 1)
    `).run(staffIdB, `staff_b_${Date.now()}@hospitality.test`, hash);

    staffUserB = db.prepare("SELECT * FROM users WHERE id = ?").get(staffIdB);
    staffTokenB = jwt.sign(
      { id: staffUserB.id, email: staffUserB.email, role: staffUserB.role, tenant_id: 1 },
      config.JWT_SECRET,
      { expiresIn: "1h" }
    );
  });

  after(() => {
    if (server) server.close();

    // Clean up test data
    for (const id of testRoomCategoryIds) {
      db.prepare("DELETE FROM hospitality_room_images WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM hospitality_physical_rooms WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM hospitality_inventory_blocks WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM hospitality_seasonal_rates WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM hospitality_daily_rates WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM room_inventory_daily WHERE room_type_id = ?").run(id);
      db.prepare("DELETE FROM room_types WHERE id = ?").run(id);
    }
    for (const id of testRatePlanIds) {
      db.prepare("DELETE FROM hospitality_rate_plans WHERE id = ?").run(id);
    }
    if (adminUser?.id) db.prepare("DELETE FROM users WHERE id = ?").run(adminUser.id);
    if (staffUserA?.id) db.prepare("DELETE FROM users WHERE id = ?").run(staffUserA.id);
    if (staffUserB?.id) db.prepare("DELETE FROM users WHERE id = ?").run(staffUserB.id);
  });

  // -------------------------------------------------------------------------
  // 1. Seeded property and setup completeness overview
  // -------------------------------------------------------------------------
  test("1. Seeded Property 1 exists and setup overview returns completeness score", async () => {
    const prop = configService.getPropertyById(1, 1, adminUser.id, true);
    assert.ok(prop, "Property 1 must exist");
    assert.equal(prop.publication_status, "PUBLISHED");
    assert.equal(prop.currency, "INR");

    const overview = configService.getSetupOverview(1, 1);
    assert.ok(overview, "Setup overview must return");
    assert.ok(overview.completeness_score >= 60, "Seeded property should have high completeness score");
    assert.equal(overview.ready_for_publication, true);
    assert.ok(overview.checks.basic_info.passed);
    assert.ok(overview.checks.rate_plans.passed);
    assert.ok(overview.checks.tax_rules.passed);
  });

  // -------------------------------------------------------------------------
  // 2. Room Category CRUD & Deep Specifications
  // -------------------------------------------------------------------------
  test("2. Creates a custom room category with full architectural specifications", async () => {
    const newRoom = configService.createRoomCategory(1, {
      name: "Oceanfront Presidential Penthouse",
      room_code: "OPP-01",
      description: "Top-floor ultra-luxury penthouse with panoramic Arabian Sea views and jacuzzi.",
      room_size: 850,
      size_unit: "sq_ft",
      bed_type: "1 Emperor Bed",
      bed_count: 1,
      standard_occupancy: 2,
      max_occupancy: 4,
      extra_adult_capacity: 2,
      extra_child_capacity: 2,
      extra_adult_price: 2500,
      extra_child_price: 1200,
      bathroom_count: 2,
      view_type: "Panoramic Ocean View",
      smoking_policy: "NON_SMOKING",
      accessibility_info: "Elevator access, step-free shower",
      amenities: ["Private Jacuzzi", "Balcony Sun Deck", "High-Speed Wi-Fi", "Espresso Machine", "Mini-bar"],
      base_rate: 14500,
      status: "ACTIVE"
    }, 1, adminUser.id);

    assert.ok(newRoom.id);
    testRoomCategoryIds.push(newRoom.id);

    assert.equal(newRoom.name, "Oceanfront Presidential Penthouse");
    assert.equal(newRoom.room_code, "OPP-01");
    assert.equal(newRoom.room_size, 850);
    assert.equal(newRoom.standard_occupancy, 2);
    assert.equal(newRoom.max_occupancy, 4);
    assert.equal(newRoom.base_rate, 14500);
    assert.equal(newRoom.extra_adult_price, 2500);
    assert.ok(Array.isArray(newRoom.amenities));
    assert.ok(newRoom.amenities.includes("Private Jacuzzi"));
  });

  // -------------------------------------------------------------------------
  // 3. Room Photographs & Gallery Management
  // -------------------------------------------------------------------------
  test("3. Uploads photographs, sets primary image, and reorders photos", async () => {
    const roomId = testRoomCategoryIds[0];

    // Add Image 1
    const img1 = configService.addRoomImage(1, roomId, {
      image_url: "/uploads/penthouse_living.jpg",
      caption: "Panoramic living salon",
      alt_text: "Spacious salon overlooking Arabian Sea",
      is_primary: false
    }, 1, adminUser.id);

    // Add Image 2 (Primary)
    const img2 = configService.addRoomImage(1, roomId, {
      image_url: "/uploads/penthouse_bedroom.jpg",
      caption: "Master Bedroom Suite",
      alt_text: "Emperor bed with ocean sunrise view",
      is_primary: true
    }, 1, adminUser.id);

    const images = configService.listRoomImages(roomId, 1);
    assert.equal(images.length, 2);

    // Verify img2 is primary and room_types.primary_image_url was updated
    const room = configService.getRoomCategoryById(roomId, 1, 1);
    assert.equal(room.primary_image_url, "/uploads/penthouse_bedroom.jpg");

    // Set img1 as primary
    configService.setPrimaryImage(img1.id, roomId, 1, adminUser.id);
    const updatedImages = configService.listRoomImages(roomId, 1);
    const p1 = updatedImages.find(i => i.id === img1.id);
    const p2 = updatedImages.find(i => i.id === img2.id);
    assert.equal(p1.is_primary, 1);
    assert.equal(p2.is_primary, 0);

    // Reorder images
    configService.reorderImages(roomId, [img2.id, img1.id], 1);
    const reordered = configService.listRoomImages(roomId, 1);
    const img2InReordered = reordered.find(i => i.id === img2.id);
    const img1InReordered = reordered.find(i => i.id === img1.id);
    assert.equal(img2InReordered.display_order, 0);
    assert.equal(img1InReordered.display_order, 1);
  });

  // -------------------------------------------------------------------------
  // 4. Physical Rooms (Key Tracking)
  // -------------------------------------------------------------------------
  test("4. Registers physical rooms and tracks operational maintenance status", async () => {
    const roomId = testRoomCategoryIds[0];

    const phys1 = configService.createPhysicalRoom(1, {
      room_type_id: roomId,
      room_number: "PH-401",
      floor: "4th Floor",
      operational_status: "OPERATIONAL",
      notes: "Penthouse Wing A"
    }, 1);

    const phys2 = configService.createPhysicalRoom(1, {
      room_type_id: roomId,
      room_number: "PH-402",
      floor: "4th Floor",
      operational_status: "MAINTENANCE",
      notes: "Jacuzzi servicing"
    }, 1);

    const list = configService.listPhysicalRooms(1, roomId, 1);
    assert.equal(list.length, 2);
    assert.ok(list.some(r => r.room_number === "PH-401"));
    assert.ok(list.some(r => r.operational_status === "MAINTENANCE"));
  });

  // -------------------------------------------------------------------------
  // 5. Authoritative Sellable Inventory Calculation & Hold Blocks
  // -------------------------------------------------------------------------
  test("5. Authoritatively computes sellable inventory: Total - Blocks - OOS - Allocations", async () => {
    const roomId = testRoomCategoryIds[0];
    const targetDate = "2026-12-15";

    // Set base daily inventory: 5 total rooms
    availabilityService.bulkUpdateInventory(1, roomId, targetDate, targetDate, {
      total_rooms: 5,
      blocked_qty: 0,
      out_of_service_qty: 0,
      allocated_qty: 0,
      is_closed: false
    }, 1, adminUser.id);

    // Step A: Initially 5 sellable
    let avail = availabilityService.getDailyRoomAvailability(1, roomId, targetDate, 1);
    assert.equal(avail.sellable, 5);
    assert.equal(avail.status, "AVAILABLE");

    // Step B: Place an active inventory block of 3 rooms for a VIP hold
    const block = availabilityService.createInventoryBlock({
      propertyId: 1,
      roomTypeId: roomId,
      startDate: targetDate,
      endDate: targetDate,
      blockedQty: 3,
      reason: "Government Delegation Hold",
      createdBy: "Concierge Admin",
      tenantId: 1,
      userId: adminUser.id
    });
    testBlockIds.push(block.id);

    // Now sellable should be 5 - 3 = 2 -> LIMITED_AVAILABILITY
    avail = availabilityService.getDailyRoomAvailability(1, roomId, targetDate, 1);
    assert.equal(avail.sellable, 2);
    assert.equal(avail.status, "LIMITED_AVAILABILITY");

    // Step C: Release the block
    availabilityService.releaseInventoryBlock(block.id, 1, adminUser.id);
    avail = availabilityService.getDailyRoomAvailability(1, roomId, targetDate, 1);
    assert.equal(avail.sellable, 5);
    assert.equal(avail.status, "AVAILABLE");

    // Step D: Room closed for selling
    availabilityService.bulkUpdateInventory(1, roomId, targetDate, targetDate, {
      is_closed: true
    }, 1, adminUser.id);
    avail = availabilityService.getDailyRoomAvailability(1, roomId, targetDate, 1);
    assert.equal(avail.sellable, 0);
    assert.equal(avail.status, "UNAVAILABLE");

    // Re-open for subsequent pricing tests
    availabilityService.bulkUpdateInventory(1, roomId, targetDate, "2026-12-20", {
      is_closed: false,
      total_rooms: 5,
      blocked_qty: 0,
      out_of_service_qty: 0
    }, 1, adminUser.id);
  });

  // -------------------------------------------------------------------------
  // 6. Strict Rate Precedence Engine
  // Daily Override > Matching Seasonal Rate (Priority) > Base Rate
  // -------------------------------------------------------------------------
  test("6. Enforces strict pricing precedence: Daily Override > Seasonal Rate > Base Rate", async () => {
    const roomId = testRoomCategoryIds[0];
    const testDate = "2026-12-18";

    // Level 3 Fallback: Base Rate = ₹14,500
    let price = pricingService.getResolvedDailyPrice(1, roomId, null, testDate, 1);
    assert.equal(price.resolution_source, "BASE_RATE");
    assert.equal(price.base_nightly_price, 14500);

    // Level 2: Seasonal Rate = ₹18,000 for December Peak
    const seasonRes = pricingService.createSeasonalRate(1, {
      season_name: "December Year-End Peak",
      room_type_id: roomId,
      start_date: "2026-12-01",
      end_date: "2026-12-31",
      price: 18000,
      extra_adult_price: 3000,
      priority: 2,
      active: true
    }, 1, adminUser.id);
    testSeasonalRateIds.push(seasonRes.id);

    price = pricingService.getResolvedDailyPrice(1, roomId, null, testDate, 1);
    assert.equal(price.resolution_source, "SEASONAL_RATE");
    assert.equal(price.base_nightly_price, 18000);
    assert.equal(price.extra_adult_price, 3000);

    // Level 1: Daily Override = ₹22,000 for Saturday Gala
    pricingService.upsertDailyRate(1, {
      room_type_id: roomId,
      rate_date: testDate,
      price: 22000,
      extra_adult_price: 3500,
      reason: "Saturday Gala Night Override"
    }, 1, adminUser.id);

    price = pricingService.getResolvedDailyPrice(1, roomId, null, testDate, 1);
    assert.equal(price.resolution_source, "DAILY_OVERRIDE");
    assert.equal(price.base_nightly_price, 22000);
    assert.equal(price.extra_adult_price, 3500);
  });

  // -------------------------------------------------------------------------
  // 7. Authoritative Informational Quote Generator
  // -------------------------------------------------------------------------
  test("7. Calculates itemized price quote with tax slabs and mandatory disclaimer", async () => {
    const roomId = testRoomCategoryIds[0];

    const quote = pricingService.calculateQuote({
      propertyId: 1,
      roomTypeId: roomId,
      checkInDate: "2026-12-17",
      checkOutDate: "2026-12-19", // 2 nights (17th seasonal ₹18,000, 18th daily override ₹22,000)
      adults: 3, // 1 extra adult (standard occupancy 2)
      rooms: 1,
      tenantId: 1
    });

    assert.ok(quote.quote_id);
    assert.equal(quote.reservation_specs.nights, 2);
    assert.equal(quote.reservation_specs.rooms, 1);
    assert.equal(quote.reservation_specs.extra_adults, 1);

    // Verify night 1 (seasonal): Room ₹18,000 + Extra adult ₹3,000 = ₹21,000
    assert.equal(quote.daily_breakdown[0].date, "2026-12-17");
    assert.equal(quote.daily_breakdown[0].resolution_source, "SEASONAL_RATE");
    assert.equal(quote.daily_breakdown[0].nightly_subtotal, 21000);

    // Verify night 2 (daily override): Room ₹22,000 + Extra adult ₹3,500 = ₹25,500
    assert.equal(quote.daily_breakdown[1].date, "2026-12-18");
    assert.equal(quote.daily_breakdown[1].resolution_source, "DAILY_OVERRIDE");
    assert.equal(quote.daily_breakdown[1].nightly_subtotal, 25500);

    // Total subtotal = ₹21,000 + ₹25,500 = ₹46,500
    assert.equal(quote.pricing_summary.subtotal_before_tax, 46500);

    // Average nightly rate per room is > ₹7,500 -> GST 18% slab
    assert.equal(quote.pricing_summary.taxes.tax_percentage, 18);
    assert.equal(quote.pricing_summary.taxes.cgst_rate, 9);
    assert.equal(quote.pricing_summary.taxes.sgst_rate, 9);
    const expectedTax = Math.round(46500 * 0.18 * 100) / 100;
    assert.equal(quote.pricing_summary.taxes.total_tax, expectedTax);
    assert.equal(quote.pricing_summary.estimated_grand_total, 46500 + expectedTax);

    // MANDATORY DOMAIN INTEGRITY RESTRICTIONS:
    assert.equal(quote.is_binding, false, "Quote must never be legally binding");
    assert.equal(quote.can_confirm_directly, false, "System must not confirm bookings automatically");
    assert.ok(quote.disclaimer.includes("Estimated Price Quote (Subject to Staff Confirmation)"));
  });

  // -------------------------------------------------------------------------
  // 8. The 12 Deterministic Conversational Actions
  // -------------------------------------------------------------------------
  test("8. Executes the 12 deterministic chat actions for messaging channels", async () => {
    const roomId = testRoomCategoryIds[0];

    // Action 1: search_properties
    const a1 = chatService.handleHospitalityChatAction("search_properties", { query: "Konkan" });
    assert.equal(a1.action, "search_properties");
    assert.ok(a1.properties.length >= 1);
    assert.ok(a1.whatsapp_text.includes("KonkanTrip"));

    // Action 2: get_property_details
    const a2 = chatService.handleHospitalityChatAction("get_property_details", { propertyId: 1 });
    assert.equal(a2.action, "get_property_details");
    assert.ok(a2.whatsapp_text.includes("KonkanTrip"));
    assert.ok(a2.whatsapp_text.includes("Check-In"));

    // Action 3: get_room_categories
    const a3 = chatService.handleHospitalityChatAction("get_room_categories", { propertyId: 1 });
    assert.equal(a3.action, "get_room_categories");
    assert.ok(a3.whatsapp_text.includes("Oceanfront Presidential Penthouse"));

    // Action 4: get_room_details
    const a4 = chatService.handleHospitalityChatAction("get_room_details", { propertyId: 1, roomTypeId: roomId });
    assert.equal(a4.action, "get_room_details");
    assert.ok(a4.whatsapp_text.includes("850 sq_ft"));
    assert.ok(a4.whatsapp_text.includes("Private Jacuzzi"));

    // Action 5: get_room_images
    const a5 = chatService.handleHospitalityChatAction("get_room_images", { propertyId: 1, roomTypeId: roomId });
    assert.equal(a5.action, "get_room_images");
    assert.ok(a5.images.length >= 2);

    // Action 6: check_room_availability
    const a6 = chatService.handleHospitalityChatAction("check_room_availability", {
      propertyId: 1,
      roomTypeId: roomId,
      checkInDate: "2026-12-17",
      checkOutDate: "2026-12-19",
      quantity: 1
    });
    assert.equal(a6.action, "check_room_availability");
    assert.equal(a6.result.is_available, true);

    // Action 7: calculate_property_quote
    const a7 = chatService.handleHospitalityChatAction("calculate_property_quote", {
      propertyId: 1,
      roomTypeId: roomId,
      checkInDate: "2026-12-17",
      checkOutDate: "2026-12-19",
      adults: 2
    });
    assert.equal(a7.action, "calculate_property_quote");
    assert.ok(a7.whatsapp_text.includes("Estimated Price Quote"));
    assert.ok(a7.whatsapp_text.includes("Estimated Price Quote (Subject to Staff Confirmation)"));

    // Action 8: get_rate_plan_details
    const a8 = chatService.handleHospitalityChatAction("get_rate_plan_details", { propertyId: 1 });
    assert.equal(a8.action, "get_rate_plan_details");
    assert.ok(a8.whatsapp_text.includes("EP"));

    // Action 9: get_property_facilities
    const a9 = chatService.handleHospitalityChatAction("get_property_facilities", { propertyId: 1 });
    assert.equal(a9.action, "get_property_facilities");
    assert.ok(a9.whatsapp_text.includes("Resort Facilities"));

    // Action 10: get_property_policy
    const a10 = chatService.handleHospitalityChatAction("get_property_policy", { propertyId: 1, policyType: "cancellation" });
    assert.equal(a10.action, "get_property_policy");
    assert.ok(a10.whatsapp_text.includes("Cancellation"));

    // Action 11: get_property_faq
    const a11 = chatService.handleHospitalityChatAction("get_property_faq", { propertyId: 1, question: "airport" });
    assert.equal(a11.action, "get_property_faq");
    assert.ok(a11.whatsapp_text.includes("Q:"));

    // Action 12: request_human_handoff
    const a12 = chatService.handleHospitalityChatAction("request_human_handoff", {
      propertyId: 1,
      customerName: "Pooja Hegde",
      customerPhone: "919876543210",
      inquiryDetails: "Requested villa booking for 4 nights"
    });
    assert.equal(a12.action, "request_human_handoff");
    assert.ok(a12.whatsapp_text.includes("Connecting You with Our Reservations Desk"));
  });

  // -------------------------------------------------------------------------
  // 9. REST API Endpoints (Admin & Public)
  // -------------------------------------------------------------------------
  test("9. Validates REST API endpoints under /api/v1/hospitality and /api/v1/public/hospitality", async () => {
    // A: Admin Overview
    const ovRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(ovRes.status, 200);
    const ovData = await ovRes.json();
    assert.equal(ovData.success, true);
    assert.ok(ovData.overview.completeness_score);

    // B: Admin Inventory Grid
    const gridRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/inventory/grid?start_date=2026-12-15&end_date=2026-12-20`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(gridRes.status, 200);
    const gridData = await gridRes.json();
    assert.equal(gridData.success, true);
    assert.ok(Array.isArray(gridData.grid));

    // C: Public Unauthenticated Property Search
    const pubPropRes = await fetch(`${baseUrl}/api/v1/public/hospitality/properties`);
    assert.equal(pubPropRes.status, 200);
    const pubPropData = await pubPropRes.json();
    assert.equal(pubPropData.success, true);
    assert.ok(pubPropData.properties.length >= 1);

    // D: Public Unauthenticated Conversational Chat Action API
    const chatActionRes = await fetch(`${baseUrl}/api/v1/public/hospitality/chat-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get_property_facilities",
        payload: { propertyId: 1 }
      })
    });
    assert.equal(chatActionRes.status, 200);
    const chatActionData = await chatActionRes.json();
    assert.equal(chatActionData.success, true);
    assert.ok(chatActionData.whatsapp_text.includes("Resort Facilities"));
  });

  // -------------------------------------------------------------------------
  // 10. Multi-Tenant Isolation & Unauthenticated Protection
  // -------------------------------------------------------------------------
  test("10. Enforces strict multi-tenant isolation and draft protection", async () => {
    // Create an isolated property owned by Staff A
    const propRes = db.prepare(`
      INSERT INTO properties (tenant_id, user_id, name, property_type, publication_status, created_at, updated_at)
      VALUES (1, ?, 'Staff A Private Villa', 'VILLA', 'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(staffUserA.id);
    const privatePropId = propRes.lastInsertRowid;

    // Staff A can access their private property
    const propA = configService.getPropertyById(1, privatePropId, staffUserA.id, false);
    assert.ok(propA);
    assert.equal(propA.name, "Staff A Private Villa");

    // Staff B attempting to access Staff A's private property gets 403 Forbidden
    assert.throws(() => {
      configService.getPropertyById(1, privatePropId, staffUserB.id, false);
    }, (err) => err.statusCode === 403);

    // Public visitor attempting to view draft property gets 404 Not Found
    assert.throws(() => {
      configService.getPublishedProperty(1, privatePropId);
    }, (err) => err.statusCode === 404);

    // Clean up private property
    db.prepare("DELETE FROM properties WHERE id = ?").run(privatePropId);
  });

  // -------------------------------------------------------------------------
  // 11. Property & Resort Photo Gallery Management and Public Chat Integration
  // -------------------------------------------------------------------------
  test("11. Property photo gallery CRUD, public link attachment, and conversational gallery action", async () => {
    const origGalleryRow = db.prepare("SELECT gallery_json FROM properties WHERE id = 1").get();
    try {
      const existingGallery = (() => {
        try { return JSON.parse(origGalleryRow?.gallery_json || "[]"); } catch { return []; }
      })();
      if (existingGallery.length < 5) {
        const seedPhotos = [1, 2, 3, 4, 5].map((n) => ({
          id: `seed_gallery_${n}`,
          image_url: `https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&idx=${n}`,
          caption: `Resort View ${n}`,
          category: "Resort & Amenities",
          alt_text: `Property Photo ${n}`,
          is_primary: n === 1,
          display_order: n - 1
        }));
        db.prepare("UPDATE properties SET gallery_json = ? WHERE id = 1").run(JSON.stringify(seedPhotos));
      }

      // A: Admin retrieves property gallery
      const galleryRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/gallery`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(galleryRes.status, 200);
      const galleryData = await galleryRes.json();
      assert.equal(galleryData.success, true);
      assert.ok(Array.isArray(galleryData.all_photos));
      assert.ok(galleryData.all_photos.length >= 5);

      // B: Admin adds a new property gallery photo
      const addPhotoRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/gallery`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          image_url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80",
          caption: "Ayurvedic Beach Spa & Wellness Sanctuary",
          category: "Resort & Amenities",
          alt_text: "Spa pavilion surrounded by coastal palm gardens"
        })
      });
      assert.equal(addPhotoRes.status, 201);
      const addPhotoData = await addPhotoRes.json();
      assert.equal(addPhotoData.success, true);
      const newImageId = addPhotoData.image.id;
      assert.ok(newImageId);

      // C: Admin sets photo as primary
      const setPrimaryRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/gallery/${newImageId}/primary`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(setPrimaryRes.status, 200);

      // D: Admin deletes the newly added photo to clean up
      const deletePhotoRes = await fetch(`${baseUrl}/api/v1/hospitality/properties/1/gallery/${newImageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(deletePhotoRes.status, 200);

      // E: Public visitor retrieves property gallery without authentication
      const pubGalleryRes = await fetch(`${baseUrl}/api/v1/public/hospitality/properties/1/gallery`);
      assert.equal(pubGalleryRes.status, 200);
      const pubGalleryData = await pubGalleryRes.json();
      assert.equal(pubGalleryData.success, true);
      assert.ok(pubGalleryData.photos.length >= 5);

      // F: Public chat action get_property_gallery
      const chatActionRes = await fetch(`${baseUrl}/api/v1/public/hospitality/chat-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_property_gallery",
          payload: { propertyId: 1 }
        })
      });
      assert.equal(chatActionRes.status, 200);
      const chatActionData = await chatActionRes.json();
      assert.equal(chatActionData.success, true);
      assert.equal(chatActionData.interactive_type, "property_gallery");
      assert.ok(chatActionData.whatsapp_text.includes("Photo Gallery"));

      // G: Public chat link gallery endpoint (/api/v1/public/chat-links/:slug/gallery)
      const linkRow = db.prepare("SELECT slug FROM chat_links WHERE tenant_id = 1 AND status = 'ACTIVE' LIMIT 1").get();
      const linkSlug = linkRow?.slug || "resort-inquiry";
      const linkGalleryRes = await fetch(`${baseUrl}/api/v1/public/chat-links/${linkSlug}/gallery`);
      assert.equal(linkGalleryRes.status, 200);
      const linkGalleryData = await linkGalleryRes.json();
      assert.equal(linkGalleryData.success, true);
      assert.ok(Array.isArray(linkGalleryData.photos));
      assert.ok(linkGalleryData.photos.length >= 5);
    } finally {
      db.prepare("UPDATE properties SET gallery_json = ? WHERE id = 1").run(origGalleryRow?.gallery_json ?? null);
    }
  });
});
