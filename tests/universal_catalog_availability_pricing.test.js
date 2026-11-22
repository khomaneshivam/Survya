const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db } = require("../src/config/database");
const { app } = require("../server");

const universalCatalogService = require("../src/services/universal/universalCatalogService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalPricingService = require("../src/services/universal/universalPricingService");
const masterDataService = require("../src/services/masters/masterDataService");
const masterCacheService = require("../src/services/masters/masterCacheService");

describe("Universal Catalog, 4-Mode Availability, Dynamic Pricing & Atomic Holds Suite", { concurrency: 1 }, () => {
  let serverInstance = null;
  let baseUrl = null;
  let testUser = null;
  let authToken = null;
  const testTenantId = 987;
  const testUserId = "cat_test_admin";

  let testCategory = null;
  let testUnit = null;
  let testTaxSlab = null;
  let testLocation = null;
  let testResource = null;

  before(async () => {
    // 1. Ensure test tenant & user exist
    testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE status = 'ACTIVE' LIMIT 1").get();
    if (!testUser) {
      const uId = "test_user_catalog_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
        VALUES (?, 'Catalog Test Admin', 'catalogtest@example.com', 'dummy_hash', 'SUPERADMIN', 'ACTIVE', NOW(), NOW())
      `).run(uId);
      testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE id = ?").get(uId);
    }

    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: "SUPERADMIN", tenantId: testTenantId },
      config.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // 2. Clean test tenant data
    db.prepare("DELETE FROM catalog_inventory_holds WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_availability_slots WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_addons WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_addon_groups WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_pricing_rules WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_item_media WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM room_inventory_daily WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM room_types WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_categories WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_units WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_tax_slabs WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_locations WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_resources WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(testTenantId);

    masterCacheService.invalidateTenantMasters(testTenantId);

    // 2.1 Seed test business entity
    db.prepare(`
      INSERT INTO business_entities (
        tenant_id, domain, name, slug, phone_e164, city, status, active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, 'HOSPITALITY', 'Test Beachfront Resort', 'test-beachfront-resort', '+919999999999', 'Goa', 'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(testTenantId);

    // 3. Seed test masters
    testCategory = masterDataService.createMaster(testTenantId, "master_categories", {
      category_code: "CAT_SUITES",
      name: "Luxury Presidential Suites",
      domain_key: "HOSPITALITY",
      description: "Top floor luxury suites"
    }, testUserId);

    testUnit = masterDataService.createMaster(testTenantId, "master_units", {
      unit_code: "UNIT_NIGHT",
      name: "Per Night",
      unit_symbol: "night",
      unit_type: "TIME"
    }, testUserId);

    testTaxSlab = masterDataService.createMaster(testTenantId, "master_tax_slabs", {
      slab_code: "GST_18",
      title: "GST 18% Standard",
      tax_rate: 18.0,
      cgst_rate: 9.0,
      sgst_rate: 9.0,
      igst_rate: 18.0
    }, testUserId);

    testLocation = masterDataService.createMaster(testTenantId, "master_locations", {
      location_code: "LOC_GOA",
      name: "Goa Beachfront Resort",
      city: "Goa",
      state: "Goa"
    }, testUserId);

    testResource = masterDataService.createMaster(testTenantId, "master_resources", {
      resource_code: "DR_SHARMA",
      name: "Dr. Rahul Sharma",
      resource_type: "STAFF",
      capacity: 1
    }, testUserId);

    // 4. Start HTTP test server
    await new Promise((resolve) => {
      serverInstance = http.createServer(app);
      serverInstance.listen(0, "127.0.0.1", () => {
        const port = serverInstance.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  });

  // ---------------------------------------------------------------------------
  // 1. MASTER-BOUND UNIVERSAL CATALOG & SINGLE-QUERY SEARCH
  // ---------------------------------------------------------------------------
  test("1. Universal Catalog Item CRUD with Master Foreign Keys & Single-Query Search", async () => {
    // Create item bound to masters
    const createdItem = universalCatalogService.createItem(testTenantId, {
      title: "Oceanfront Royal Villa",
      description: "Private infinity pool villa overlooking the Arabian Sea",
      sku: "VILLA-OCN-01",
      item_type: "ROOM",
      inventory_mode: "DATE_RANGE",
      base_price: 15000,
      currency: "INR",
      stock_qty: 5,
      track_inventory: 1,
      master_category_id: testCategory.id,
      master_unit_id: testUnit.id,
      master_tax_slab_id: testTaxSlab.id,
      master_location_id: testLocation.id,
      variants_json: [
        { sku: "VILLA-OCN-01-KING", name: "King Bed + Breakfast", price: 17500 },
        { sku: "VILLA-OCN-01-STD", name: "Standard Villa Only", price: 15000 }
      ]
    }, testUserId);

    assert.ok(createdItem.id > 0, "Created item should have a valid ID");
    assert.equal(createdItem.master_category_id, testCategory.id);
    assert.equal(createdItem.master_unit_id, testUnit.id);
    assert.equal(createdItem.master_tax_slab_id, testTaxSlab.id);
    assert.equal(createdItem.master_location_id, testLocation.id);

    // Add multiple media items
    const media1 = universalCatalogService.addMedia(testTenantId, createdItem.id, {
      media_url: "https://cdn.example.com/images/villa-front.jpg",
      media_type: "IMAGE",
      caption: "Villa Front View",
      is_primary: 1,
      sort_order: 1
    }, testUserId);

    const media2 = universalCatalogService.addMedia(testTenantId, createdItem.id, {
      media_url: "https://cdn.example.com/images/villa-pool.jpg",
      media_type: "IMAGE",
      caption: "Private Infinity Pool",
      is_primary: 0,
      sort_order: 2
    }, testUserId);

    assert.ok(media1.id > 0);
    assert.ok(media2.id > 0);

    // Test Media Reordering - verify sort_order was updated
    const reordered = universalCatalogService.reorderMedia(testTenantId, createdItem.id, [media2.id, media1.id]);
    const m2InReordered = reordered.find(m => m.id === media2.id);
    assert.equal(m2InReordered.sort_order, 0);

    // Test Set Primary Media
    universalCatalogService.setPrimaryMedia(testTenantId, createdItem.id, media2.id);
    const mediaList = universalCatalogService.listMedia(testTenantId, createdItem.id);
    assert.equal(mediaList[0].id, media2.id);
    assert.equal(mediaList[0].is_primary, 1);

    // Test Single-Query Search without N+1
    const searchResult = universalCatalogService.searchCatalog(testTenantId, {
      search: "Oceanfront",
      masterCategoryId: testCategory.id,
      masterLocationId: testLocation.id
    });

    const items = Array.isArray(searchResult) ? searchResult : (searchResult.items || []);
    assert.ok(items.length >= 1, "Should find the created villa");
    const item = items[0];
    assert.equal(item.id, createdItem.id);
    assert.equal(item.master_category_name, "Luxury Presidential Suites");
    assert.equal(item.master_unit_symbol, "night");
    assert.equal(item.master_tax_slab_title, "GST 18% Standard");
    assert.equal(item.master_tax_rate, 18.0);
    assert.equal(item.master_location_name, "Goa Beachfront Resort");
    assert.equal(item.primary_image_url, "https://cdn.example.com/images/villa-pool.jpg");
    assert.equal(items.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 2. 4-MODE AVAILABILITY VERIFICATION
  // ---------------------------------------------------------------------------
  test("2. 4-Mode Availability Verification (UNIT_STOCK, DATE_RANGE, TIME_SLOT, QUOTE_SERVICE)", async () => {
    // Mode 1: UNIT_STOCK (Retail/D2C)
    const stockItem = universalCatalogService.createItem(testTenantId, {
      title: "Ayurvedic Herbal Tea Pack",
      sku: "TEA-AYUR-100G",
      item_type: "PRODUCT",
      inventory_mode: "UNIT_STOCK",
      base_price: 350,
      stock_qty: 10,
      track_inventory: 1
    }, testUserId);

    db.prepare("UPDATE catalog_items SET reserved_qty = 2 WHERE id = ?").run(stockItem.id);

    const stockAvail = universalAvailabilityService.checkAvailability(testTenantId, {
      itemId: stockItem.id,
      quantity: 5
    });
    assert.equal(stockAvail.available, true);
    assert.equal(stockAvail.availableQty, 8); // 10 - 2

    const stockOver = universalAvailabilityService.checkAvailability(testTenantId, {
      itemId: stockItem.id,
      quantity: 9
    });
    assert.equal(stockOver.available, false);
    assert.ok(stockOver.reason.includes("Only 8 available"));

    // Mode 2: DATE_RANGE (Hospitality with room_inventory_daily)
    const dateItem = universalCatalogService.createItem(testTenantId, {
      title: "Deluxe Sea View Room",
      sku: "ROOM-DLX-01",
      item_type: "ROOM",
      inventory_mode: "DATE_RANGE",
      base_price: 6000
    }, testUserId);

    // Create matching room_type and 3 days inventory
    const roomType = db.prepare(`
      INSERT INTO room_types (tenant_id, name, base_rate, active)
      VALUES (?, 'Deluxe Sea View Room', 6000, 1)
    `).run(testTenantId);

    const roomTypeId = roomType.lastInsertRowid;
    db.prepare(`
      INSERT INTO room_inventory_daily (tenant_id, room_type_id, inventory_date, available_qty, is_closed)
      VALUES (?, ?, '2026-12-01', 3, 0),
             (?, ?, '2026-12-02', 0, 0),
             (?, ?, '2026-12-03', 3, 0)
    `).run(testTenantId, roomTypeId, testTenantId, roomTypeId, testTenantId, roomTypeId);

    const dateRangeAvail = universalAvailabilityService.checkAvailability(testTenantId, {
      itemId: dateItem.id,
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
      quantity: 1
    });
    assert.equal(dateRangeAvail.available, false);
    assert.equal(dateRangeAvail.soldOutDate, "2026-12-02");

    // Mode 3: TIME_SLOT (Clinics / Salons)
    const serviceItem = universalCatalogService.createItem(testTenantId, {
      title: "Cardiology Specialist Consultation",
      sku: "SRV-CARDIO-01",
      item_type: "SERVICE",
      inventory_mode: "TIME_SLOT",
      base_price: 1200
    }, testUserId);

    const slot = universalAvailabilityService.createAvailabilitySlot(testTenantId, {
      catalog_item_id: serviceItem.id,
      master_resource_id: testResource.id,
      slot_date: "2026-12-10",
      start_time: "10:00:00",
      end_time: "10:30:00",
      total_capacity: 2,
      booked_capacity: 1,
      held_capacity: 0
    });

    const slotAvail = universalAvailabilityService.checkAvailability(testTenantId, {
      itemId: serviceItem.id,
      slotId: slot.id,
      quantity: 1
    });
    assert.equal(slotAvail.available, true);
    assert.equal(slotAvail.remainingCapacity, 1);
    assert.equal(slotAvail.masterResourceId, testResource.id);

    // Mode 4: QUOTE_SERVICE (Real Estate / B2B)
    const quoteItem = universalCatalogService.createItem(testTenantId, {
      title: "3BHK Sea Facing Penthouse",
      sku: "PROP-PENT-03",
      item_type: "PROPERTY",
      inventory_mode: "QUOTE_SERVICE",
      base_price: 45000000
    }, testUserId);

    const quoteAvail = universalAvailabilityService.checkAvailability(testTenantId, {
      itemId: quoteItem.id
    });
    assert.equal(quoteAvail.available, true);
    assert.equal(quoteAvail.mode, "QUOTE_SERVICE");
    assert.equal(quoteAvail.instantQuote, true);
  });

  // ---------------------------------------------------------------------------
  // 3. ATOMIC CONCURRENCY HOLD & RACE CONDITION
  // ---------------------------------------------------------------------------
  test("3. Atomic Concurrency Hold: Race Condition & Confirmation", async () => {
    const limitedItem = universalCatalogService.createItem(testTenantId, {
      title: "Limited Edition Handcrafted Rug",
      sku: "RUG-LIMITED-01",
      item_type: "PRODUCT",
      inventory_mode: "UNIT_STOCK",
      base_price: 8000,
      stock_qty: 3,
      reserved_qty: 0,
      track_inventory: 1
    }, testUserId);

    // Hold 1: 2 units (Remaining = 1) -> Must succeed
    const hold1 = universalAvailabilityService.createInventoryHold(testTenantId, {
      itemId: limitedItem.id,
      quantity: 2,
      holdMinutes: 15,
      customerPhone: "+919876543210"
    });
    assert.equal(hold1.success, true);
    assert.ok(hold1.holdToken.startsWith("hld_"));

    // Check item reserved_qty
    const itemAfterHold1 = universalCatalogService.getItemById(testTenantId, limitedItem.id);
    assert.equal(itemAfterHold1.reserved_qty, 2);

    // Hold 2: Request 2 units when only 1 is free (3 - 2 = 1) -> Must fail deterministically
    assert.throws(() => {
      universalAvailabilityService.createInventoryHold(testTenantId, {
        itemId: limitedItem.id,
        quantity: 2,
        holdMinutes: 15
      });
    }, /insufficient stock to hold/i);

    // Confirm Hold 1 -> Turns reserved into purchased (stock: 3 -> 1, reserved: 2 -> 0)
    const confirmRes = universalAvailabilityService.confirmHold(testTenantId, hold1.holdToken);
    assert.equal(confirmRes.success, true);
    assert.equal(confirmRes.status, "CONFIRMED");

    const itemAfterConfirm = universalCatalogService.getItemById(testTenantId, limitedItem.id);
    assert.equal(itemAfterConfirm.stock_qty, 1);
    assert.equal(itemAfterConfirm.reserved_qty, 0);

    // Test explicit release on a new hold
    const hold3 = universalAvailabilityService.createInventoryHold(testTenantId, {
      itemId: limitedItem.id,
      quantity: 1,
      holdMinutes: 15
    });
    assert.equal(hold3.success, true);

    const releaseRes = universalAvailabilityService.releaseHold(testTenantId, hold3.holdToken);
    assert.equal(releaseRes.success, true);
    assert.equal(releaseRes.status, "RELEASED");

    const itemAfterRelease = universalCatalogService.getItemById(testTenantId, limitedItem.id);
    assert.equal(itemAfterRelease.stock_qty, 1);
    assert.equal(itemAfterRelease.reserved_qty, 0);
  });

  // ---------------------------------------------------------------------------
  // 4. HOLD EXPIRATION SWEEP (releaseExpiredHolds)
  // ---------------------------------------------------------------------------
  test("4. Hold Expiration Sweep Releases Past Holds & Restores Reserved Inventory", async () => {
    const sweepItem = universalCatalogService.createItem(testTenantId, {
      title: "Artisan Coffee Beans 1kg",
      sku: "COFFEE-1KG",
      item_type: "PRODUCT",
      inventory_mode: "UNIT_STOCK",
      base_price: 900,
      stock_qty: 10,
      reserved_qty: 3,
      track_inventory: 1
    }, testUserId);

    // 1. Insert an expired hold (5 minutes ago)
    const expiredToken = "hld_test_expired_" + Date.now();
    db.prepare(`
      INSERT INTO catalog_inventory_holds (
        tenant_id, catalog_item_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'ITEM_STOCK',
        3, 'HELD', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(testTenantId, sweepItem.id, expiredToken, expiredToken);

    // 2. Insert an active hold (15 minutes in future)
    const activeToken = "hld_test_active_" + Date.now();
    db.prepare(`
      INSERT INTO catalog_inventory_holds (
        tenant_id, catalog_item_id, hold_token, session_ref, hold_type,
        quantity, status, expires_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'ITEM_STOCK',
        1, 'HELD', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE), UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(testTenantId, sweepItem.id, activeToken, activeToken);

    // Run hold expiration sweep
    const sweepResult = universalAvailabilityService.releaseExpiredHolds(testTenantId);
    assert.ok(sweepResult.releasedCount >= 1, "Should have swept at least 1 expired hold");

    // Verify expired hold status
    const expRow = db.prepare("SELECT status FROM catalog_inventory_holds WHERE hold_token = ?").get(expiredToken);
    assert.equal(expRow.status, "EXPIRED");

    // Verify active hold remains HELD
    const actRow = db.prepare("SELECT status FROM catalog_inventory_holds WHERE hold_token = ?").get(activeToken);
    assert.equal(actRow.status, "HELD");

    // Verify reserved inventory restored (3 units decremented from reserved_qty)
    const itemAfterSweep = universalCatalogService.getItemById(testTenantId, sweepItem.id);
    assert.equal(itemAfterSweep.reserved_qty, 0); // 3 - 3 = 0
  });

  // ---------------------------------------------------------------------------
  // 5. UNIVERSAL DYNAMIC PRICING, ADD-ONS & WHATSAPP RECEIPT
  // ---------------------------------------------------------------------------
  test("5. Dynamic Pricing Engine: Bulk Tiers, Weekend Surge, Seasonal, Add-Ons & GST Breakdown", async () => {
    // 1. Create Base Item
    const pricedItem = universalCatalogService.createItem(testTenantId, {
      title: "Executive Conference Hall",
      sku: "CONF-HALL-01",
      item_type: "SERVICE",
      inventory_mode: "UNIT_STOCK",
      base_price: 10000,
      master_category_id: testCategory.id,
      master_tax_slab_id: testTaxSlab.id
    }, testUserId);

    // 2. Create Add-on Group & Add-ons
    const addonGroup = universalCatalogService.createAddonGroup(testTenantId, {
      title: "Conference Extras & Catering",
      selection_type: "MULTIPLE",
      master_category_id: testCategory.id
    }, testUserId);

    const addonFixed = universalCatalogService.createAddon(testTenantId, {
      group_id: addonGroup.id,
      name: "High-Definition Projector & Sound Setup",
      price: 2500,
      price_mode: "FIXED",
      master_tax_slab_id: testTaxSlab.id
    }, testUserId);

    const addonPerUnit = universalCatalogService.createAddon(testTenantId, {
      group_id: addonGroup.id,
      name: "Executive Lunch Buffet",
      price: 600,
      price_mode: "PER_UNIT",
      master_tax_slab_id: testTaxSlab.id
    }, testUserId);

    const addonPercent = universalCatalogService.createAddon(testTenantId, {
      group_id: addonGroup.id,
      name: "VIP Concierge & Event Management",
      price: 10, // 10%
      price_mode: "PERCENTAGE",
      master_tax_slab_id: testTaxSlab.id
    }, testUserId);

    // 3. Create Pricing Rules
    // Bulk tier: 15% discount for quantity >= 3
    universalCatalogService.createPricingRule(testTenantId, {
      title: "Multi-Day Conference 15% Off",
      rule_type: "BULK_TIER",
      catalog_item_id: pricedItem.id,
      discount_mode: "PERCENTAGE",
      discount_value: 15,
      criteria_json: { minQuantity: 3 }
    }, testUserId);

    // Promo code: WELCOME500 flat ₹500 off for orders over ₹10,000
    universalCatalogService.createPricingRule(testTenantId, {
      title: "Welcome Flat 500 Promo",
      rule_type: "PROMO_CODE",
      promo_code: "WELCOME500",
      discount_mode: "FIXED_AMOUNT",
      discount_value: 500,
      criteria_json: { minTotal: 10000 }
    }, testUserId);

    // Test Quote Calculation:
    // 3 quantities of pricedItem (10,000 * 3 = 30,000. 15% bulk off = 4,500. Items Subtotal = 25,500)
    // Add-on 1 (Fixed): ₹2,500
    // Add-on 2 (Per Unit): ₹600 * 3 items = ₹1,800
    // Add-on 3 (Percentage): 10% of itemsSubtotal (25,500) = ₹2,550
    // Total Addons Subtotal = 2,500 + 1,800 + 2,550 = 6,850
    // Promo: WELCOME500 (-₹500)
    // Net Subtotal = 25,500 + 6,850 - 500 = 31,850
    // GST (18%): 18% of 25,500 (4,590) + 18% of 6,850 (1,233) = 5,823
    // Grand Total = 31,850 + 5,823 = 37,673
    // Deposit: 50% = 18,837, Balance = 18,836

    const quote = universalPricingService.calculateCartQuote(testTenantId, {
      items: [{ itemId: pricedItem.id, quantity: 3 }],
      addOns: [
        { addonId: addonFixed.id, quantity: 1 },
        { addonId: addonPerUnit.id, quantity: 1 },
        { addonId: addonPercent.id, quantity: 1 }
      ],
      promoCode: "WELCOME500",
      depositPercent: 50
    });

    assert.equal(quote.items.length, 1);
    assert.equal(quote.items[0].ruleDiscountAmount, 4500); // 15% of 30,000
    assert.equal(quote.itemsSubtotal, 25500);
    assert.equal(quote.addonsSubtotal, 6850);
    assert.equal(quote.promoDiscount, 500);
    assert.equal(quote.netSubtotal, 31850);
    assert.equal(quote.totalGst, 5823);
    assert.equal(quote.grandTotal, 37673);
    assert.equal(quote.depositDueNow, 18837);
    assert.equal(quote.balanceDueLater, 18836);

    // Verify WhatsApp Receipt String
    assert.ok(quote.receiptText.includes("Executive Conference Hall"));
    assert.ok(quote.receiptText.includes("Projector"));
    assert.ok(quote.receiptText.includes("WELCOME500"));
    assert.ok(quote.receiptText.includes("₹37,673"));
    assert.ok(quote.receiptText.includes("Deposit Due Now: ₹18,837"));
    assert.ok(quote.receiptText.includes("Remaining Balance"));

    // Verify getApplicableAddons resolves addons by item and category
    const applicableAddons = universalCatalogService.getApplicableAddons(testTenantId, pricedItem.id, testCategory.id);
    assert.ok(applicableAddons.length >= 1);
    assert.equal(applicableAddons[0].title, "Conference Extras & Catering");
    assert.equal(applicableAddons[0].addons.length, 3);
  });

  // ---------------------------------------------------------------------------
  // 6. BULK AVAILABILITY SLOT GENERATOR
  // ---------------------------------------------------------------------------
  test("6. Bulk Availability Slot Generator Creates Structured Time Slots", async () => {
    const slotGenResult = universalAvailabilityService.generateAvailabilitySlots(testTenantId, {
      catalog_item_id: null,
      master_resource_id: testResource.id,
      startDate: "2026-12-15",
      endDate: "2026-12-16", // 2 days
      timeIntervals: [
        { startTime: "09:00:00", endTime: "10:00:00" },
        { startTime: "10:00:00", endTime: "11:00:00" },
        { startTime: "14:00:00", endTime: "15:00:00" }
      ],
      totalCapacity: 4,
      overridePrice: 1500
    });

    assert.equal(slotGenResult.success, true);
    assert.equal(slotGenResult.totalDates, 2);
    assert.equal(slotGenResult.slotsPerDay, 3);
    assert.equal(slotGenResult.slotsGenerated, 6);

    // Query generated slots
    const generatedSlots = universalAvailabilityService.listAvailabilitySlots(testTenantId, {
      date: "2026-12-15",
      resourceId: testResource.id
    });
    assert.equal(generatedSlots.length, 3);
    assert.equal(generatedSlots[0].total_capacity, 4);
    assert.equal(generatedSlots[0].override_price, 1500);
  });

  // ---------------------------------------------------------------------------
  // 7. HTTP API ENDPOINTS TEST
  // ---------------------------------------------------------------------------
  test("7. Universal Catalog REST API Endpoints (Admin & Public Endpoints)", async () => {
    // 1. GET /api/v1/universal-catalog/items (Admin Authenticated)
    const itemsRes = await fetch(`${baseUrl}/api/v1/universal-catalog/items`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    assert.equal(itemsRes.status, 200);
    const itemsBody = await itemsRes.json();
    assert.ok(itemsBody.success);
    assert.ok(Array.isArray(itemsBody.items));
    assert.ok(itemsBody.items.length >= 1);

    const sampleItem = itemsBody.items[0];

    // 2. POST /api/v1/universal-catalog/quote (Calculate Quote)
    const quoteRes = await fetch(`${baseUrl}/api/v1/universal-catalog/quote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        items: [{ itemId: sampleItem.id, quantity: 1 }]
      })
    });
    assert.equal(quoteRes.status, 200);
    const quoteBody = await quoteRes.json();
    assert.ok(quoteBody.success);
    assert.ok(quoteBody.quote.grandTotal > 0);

    // 3. POST /api/v1/universal-catalog/availability/check
    const checkRes = await fetch(`${baseUrl}/api/v1/universal-catalog/availability/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        itemId: sampleItem.id,
        quantity: 1
      })
    });
    assert.equal(checkRes.status, 200);
    const checkBody = await checkRes.json();
    assert.ok(checkBody.success);
    assert.equal(typeof checkBody.availability.available, "boolean");

    // 4. Public Commerce Search: GET /api/commerce/catalog/search
    const searchRes = await fetch(`${baseUrl}/api/commerce/catalog/search?search=Oceanfront`);
    assert.equal(searchRes.status, 200);
    const searchBody = await searchRes.json();
    assert.ok(searchBody.success);
    assert.ok(Array.isArray(searchBody.items));

    // 5. Public Commerce Quote: POST /api/commerce/quote
    const pubQuoteRes = await fetch(`${baseUrl}/api/commerce/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ itemId: sampleItem.id, quantity: 1 }]
      })
    });
    assert.equal(pubQuoteRes.status, 200);
    const pubQuoteBody = await pubQuoteRes.json();
    assert.ok(pubQuoteBody.success);
    assert.ok(pubQuoteBody.quote.receiptText);
  });
});
