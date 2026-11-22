const assert = require("assert");
const { db } = require("../src/config/database");
const masterCacheService = require("../src/services/masters/masterCacheService");
const masterDataService = require("../src/services/masters/masterDataService");
const masterPickerExecutor = require("../src/services/workflow/nodeExecutors/masterPickerExecutor");
const recycleBinService = require("../src/services/recycleBinService");
const inappRuntimeService = require("../src/services/inapp/inappRuntimeService");

async function runMasterTest() {
  console.log("================================================================================");
  console.log("SARVYA MASTER TEST: UNIVERSAL MULTI-DOMAIN MASTER DATA LAYER & NODES");
  console.log("================================================================================\n");

  const testTenantId = 999;
  const testUserId = "master_test_runner";

  // Clean test tenant data before run
  const masterTables = [
    "master_domain_profiles", "master_locations", "master_categories",
    "master_units", "master_tax_slabs", "master_attributes",
    "master_resources", "master_payment_modes", "master_status_tags"
  ];
  for (const tbl of masterTables) {
    db.prepare(`DELETE FROM ${tbl} WHERE tenant_id = ?`).run(testTenantId);
  }
  masterCacheService.invalidateTenantMasters(testTenantId);

  // ---------------------------------------------------------------------------
  // TEST 1: Schema & Database Integrity
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing Master Tables & Schema Columns ---");
  const dbTables = db.prepare("SHOW TABLES").all().map(r => Object.values(r)[0]);
  for (const tbl of masterTables) {
    assert(dbTables.includes(tbl), `Expected database table '${tbl}' to exist`);
    const cols = db.prepare(`DESCRIBE ${tbl}`).all().map(c => c.Field);
    assert(cols.includes("id"), `Table ${tbl} must have 'id'`);
    assert(cols.includes("tenant_id"), `Table ${tbl} must have 'tenant_id'`);
    assert(cols.includes("active_status"), `Table ${tbl} must have 'active_status'`);
    assert(cols.includes("delete_status"), `Table ${tbl} must have 'delete_status'`);
    assert(cols.includes("created_by"), `Table ${tbl} must have 'created_by'`);
    assert(cols.includes("updated_by"), `Table ${tbl} must have 'updated_by'`);
    assert(cols.includes("created_at"), `Table ${tbl} must have 'created_at'`);
    assert(cols.includes("updated_at"), `Table ${tbl} must have 'updated_at'`);
  }

  // Verify catalog_items master FK columns
  const catCols = db.prepare("DESCRIBE catalog_items").all().map(c => c.Field);
  assert(catCols.includes("master_category_id"), "catalog_items missing master_category_id");
  assert(catCols.includes("master_unit_id"), "catalog_items missing master_unit_id");
  assert(catCols.includes("master_tax_slab_id"), "catalog_items missing master_tax_slab_id");
  assert(catCols.includes("master_location_id"), "catalog_items missing master_location_id");
  console.log("✓ All 9 master tables, audit columns, and catalog foreign keys verified.");

  // ---------------------------------------------------------------------------
  // TEST 2: Master Cache Service (O(1) LRU Cache)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing O(1) Master Cache Service ---");
  masterCacheService.set(testTenantId, "master_categories", { test: 123 }, 5000);
  const cachedVal = masterCacheService.get(testTenantId, "master_categories");
  assert.deepStrictEqual(cachedVal, { test: 123 }, "Cache get mismatch");

  // Invalidate single type
  masterCacheService.invalidateTenantMasters(testTenantId, "master_categories");
  assert.strictEqual(masterCacheService.get(testTenantId, "master_categories"), null, "Expected cache to be invalidated");

  // Invalidate all tenant types
  masterCacheService.set(testTenantId, "master_categories", { val: 1 });
  masterCacheService.set(testTenantId, "master_locations", { val: 2 });
  masterCacheService.invalidateTenantMasters(testTenantId);
  assert.strictEqual(masterCacheService.get(testTenantId, "master_categories"), null);
  assert.strictEqual(masterCacheService.get(testTenantId, "master_locations"), null);
  console.log("✓ Master Cache Service get/set/invalidation verified.");

  // ---------------------------------------------------------------------------
  // TEST 3: Master Data Service Generic CRUD & Recycle Bin Integration
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Master Data Service CRUD & Recycle Bin ---");
  const createdCategory = masterDataService.createMaster(testTenantId, "master_categories", {
    category_code: "TEST_CAT_1",
    name: "Luxury Garden Suites",
    domain_key: "HOSPITALITY",
    description: "Premium suites with lawn access",
    icon: "BedDouble"
  }, testUserId);

  assert(createdCategory.id > 0, "Expected valid created category ID");
  assert.strictEqual(createdCategory.category_code, "TEST_CAT_1");
  assert.strictEqual(createdCategory.name, "Luxury Garden Suites");

  // Read by ID and by Code
  const byId = masterDataService.getMasterById(testTenantId, "master_categories", createdCategory.id);
  assert.strictEqual(byId.name, "Luxury Garden Suites");
  const byCode = masterDataService.getMasterByCode(testTenantId, "master_categories", "TEST_CAT_1");
  assert.strictEqual(byCode.id, createdCategory.id);

  // Update
  const updatedCategory = masterDataService.updateMaster(testTenantId, "master_categories", createdCategory.id, {
    name: "Ultra Luxury Garden Suites"
  }, testUserId);
  assert.strictEqual(updatedCategory.name, "Ultra Luxury Garden Suites");

  // Toggle active
  const toggledOff = masterDataService.toggleActiveStatus(testTenantId, "master_categories", createdCategory.id, testUserId);
  assert.strictEqual(toggledOff.active_status, 0);
  const toggledOn = masterDataService.toggleActiveStatus(testTenantId, "master_categories", createdCategory.id, testUserId);
  assert.strictEqual(toggledOn.active_status, 1);

  // Soft delete
  masterDataService.softDeleteMaster(testTenantId, "master_categories", createdCategory.id, testUserId);
  const deletedCheck = masterDataService.getMasterById(testTenantId, "master_categories", createdCategory.id);
  assert.strictEqual(deletedCheck, undefined, "Soft-deleted item should not be returned by standard get");

  // Recycle Bin check & restore
  const binResult = await recycleBinService.listDeletedItems({ tenantId: testTenantId, entityType: "master_categories" });
  const binItems = Array.isArray(binResult) ? binResult : (binResult.items || []);
  const inBin = binItems.find(i => i.id === createdCategory.id);
  assert(inBin, "Expected soft-deleted category to appear in Recycle Bin");

  await recycleBinService.restoreItem({ tenantId: testTenantId, entityType: "master_categories", id: createdCategory.id, restoredBy: testUserId });
  const restoredCheck = masterDataService.getMasterById(testTenantId, "master_categories", createdCategory.id);
  assert.strictEqual(restoredCheck.name, "Ultra Luxury Garden Suites");
  assert.strictEqual(restoredCheck.delete_status, 0);
  console.log("✓ CRUD, Toggle, Soft-Delete and Recycle Bin restoration verified.");

  // ---------------------------------------------------------------------------
  // TEST 4: 8-Sector Idempotent Seeder
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing 8-Sector Idempotent Seeder ---");
  const sectors = [
    "HOSPITALITY", "RETAIL_D2C", "CLINIC_HEALTH", "RESTAURANT",
    "SALON_SPA", "REAL_ESTATE", "EDUCATION", "B2B_SERVICES"
  ];

  for (const sec of sectors) {
    const seedRes1 = masterDataService.seedMastersForSector(testTenantId, sec, testUserId);
    assert.strictEqual(seedRes1.sector, sec);
    // Second call must be idempotent
    const seedRes2 = masterDataService.seedMastersForSector(testTenantId, sec, testUserId);
    assert.strictEqual(Object.keys(seedRes2.seeded).length, 0, `Expected 0 new seeds on second run for ${sec}`);
  }

  const bundle = masterDataService.getMasterBundle(testTenantId);
  assert(bundle.master_categories.count >= 8, "Expected categories seeded across sectors");
  assert(bundle.master_tax_slabs.count >= 5, "Expected GST slabs seeded");
  assert(bundle.master_payment_modes.count >= 4, "Expected payment modes seeded");
  assert(bundle.master_domain_profiles.count >= 8, "Expected all 8 domain profiles seeded");
  console.log(`✓ 8-Sector Idempotent Seeder verified: ${bundle.master_categories.count} categories, ${bundle.master_resources.count} resources, ${bundle.master_tax_slabs.count} tax slabs.`);

  // ---------------------------------------------------------------------------
  // TEST 5: Dynamic Option Resolution & Scoped Filtering
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing Dynamic Option Resolution & Filtering ---");
  const clinicCategories = masterDataService.resolveDynamicMasterOptions(testTenantId, "master_categories", {
    domain_key: "CLINIC_HEALTH"
  });
  assert(clinicCategories.total >= 3, "Expected at least 3 clinic categories");
  assert(clinicCategories.options.some(o => o.label.includes("General Physician") || o.code === "GENERAL_OPD"));

  const doctors = masterDataService.resolveDynamicMasterOptions(testTenantId, "master_resources", {
    resource_type: "DOCTOR"
  });
  assert(doctors.total >= 2, "Expected at least 2 doctors seeded");
  assert(doctors.options.some(d => d.label.includes("Dr. Rajesh Sharma")));

  const paymentModes = masterDataService.resolveDynamicMasterOptions(testTenantId, "master_payment_modes");
  assert(paymentModes.total >= 4, "Expected at least 4 payment modes");
  console.log("✓ Dynamic option resolution with domain and type filtering verified.");

  // ---------------------------------------------------------------------------
  // TEST 6: Master-Bound Flow Node Executor (MASTER_PICKER)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing MASTER_PICKER Flow Node Executor ---");

  // Case A: Empty options branch
  const emptyNode = {
    id: "node_pick_empty",
    type: "MASTER_PICKER",
    config: {
      masterType: "master_categories",
      filterCriteria: { domain_key: "NON_EXISTENT_DOMAIN_XYZ" }
    }
  };
  const emptyExec = await masterPickerExecutor.execute(emptyNode, { tenantId: testTenantId });
  assert.strictEqual(emptyExec.action, "CONTINUE");
  assert.strictEqual(emptyExec.nextHandle, "empty");

  // Case B: Auto-advance on single option
  const singleOptNode = {
    id: "node_pick_single",
    type: "MASTER_PICKER",
    config: {
      masterType: "master_units",
      filterCriteria: { search: "Night" },
      autoAdvanceOnSingle: true,
      outputVariable: "booking_uom"
    }
  };
  const singleExec = await masterPickerExecutor.execute(singleOptNode, { tenantId: testTenantId });
  assert.strictEqual(singleExec.action, "CONTINUE");
  assert.strictEqual(singleExec.updatedData.booking_uom, "NIGHT");
  assert.strictEqual(singleExec.updatedData.booking_uom_label, "Night");

  // Case C: Render 2-3 options as WhatsApp buttons (REAL_ESTATE has exactly 3 categories)
  const buttonNode = {
    id: "node_pick_buttons",
    type: "MASTER_PICKER",
    config: {
      masterType: "master_categories",
      filterCriteria: { domain_key: "REAL_ESTATE" },
      promptText: "Please choose your desired residence:",
      outputVariable: "chosen_residence",
      maxButtons: 3
    }
  };
  const buttonExec = await masterPickerExecutor.execute(buttonNode, { tenantId: testTenantId });
  assert.strictEqual(buttonExec.action, "WAIT_FOR_INPUT");
  assert.strictEqual(buttonExec.message.type, "interactive");
  assert.strictEqual(buttonExec.message.interactive.type, "button");
  assert.strictEqual(buttonExec.message.interactive.action.buttons.length, 3);

  // Case D: User selects button option
  const buttonReplyExec = await masterPickerExecutor.execute(buttonNode, {
    tenantId: testTenantId,
    isWaitingForThisNode: true,
    userPayload: { id: "mst_2BHK_LUXURY" }
  });
  assert.strictEqual(buttonReplyExec.action, "CONTINUE");
  assert.strictEqual(buttonReplyExec.updatedData.chosen_residence, "2BHK_LUXURY");
  assert.strictEqual(buttonReplyExec.nextHandle, "opt_2BHK_LUXURY");

  // Case E: User enters numeric index 1
  const numericReplyExec = await masterPickerExecutor.execute(buttonNode, {
    tenantId: testTenantId,
    isWaitingForThisNode: true,
    userInput: "1"
  });
  assert.strictEqual(numericReplyExec.action, "CONTINUE");
  assert(numericReplyExec.updatedData.chosen_residence);

  // Case F: Render 4-10 options as WhatsApp interactive list menu
  const listNode = {
    id: "node_pick_list",
    type: "MASTER_PICKER",
    config: {
      masterType: "master_tax_slabs",
      promptText: "Select applicable GST slab:",
      outputVariable: "applied_gst_slab",
      maxButtons: 3
    }
  };
  const listExec = await masterPickerExecutor.execute(listNode, { tenantId: testTenantId });
  assert.strictEqual(listExec.action, "WAIT_FOR_INPUT");
  assert.strictEqual(listExec.message.interactive.type, "list");
  assert(listExec.message.interactive.action.sections[0].rows.length >= 4);

  // Case G: Invalid answer re-prompt
  const invalidExec = await masterPickerExecutor.execute(listNode, {
    tenantId: testTenantId,
    isWaitingForThisNode: true,
    userInput: "completely random invalid answer 12345"
  });
  assert.strictEqual(invalidExec.action, "WAIT_FOR_INPUT");
  assert(invalidExec.message.interactive.body.text.includes("Sorry, please select"));
  console.log("✓ MASTER_PICKER node executor verified across empty, auto-advance, buttons, list, and invalid answers.");

  // ---------------------------------------------------------------------------
  // TEST 7: In-App Dynamic Form Field Resolution
  // ---------------------------------------------------------------------------
  console.log("\n--- 7. Testing In-App Experience Master Options Resolution ---");
  const testExpSlug = `test-master-exp-${Date.now()}`;
  db.prepare(`
    INSERT INTO inapp_experiences (tenant_id, slug, name, domain_type, status, active_status)
    VALUES (?, ?, 'Master Integration Test Experience', 'HOSPITALITY', 'PUBLISHED', 1)
  `).run(testTenantId, testExpSlug);

  const expRow = db.prepare("SELECT id FROM inapp_experiences WHERE slug = ?").get(testExpSlug);
  const screenId = `scr_${Date.now()}`;
  db.prepare(`
    INSERT INTO inapp_screens (tenant_id, experience_id, screen_key, title, screen_type, display_order)
    VALUES (?, ?, 'booking_intake', 'Select Branch & Category', 'FORM', 1)
  `).run(testTenantId, expRow.id);

  const scrRow = db.prepare("SELECT id FROM inapp_screens WHERE screen_key = 'booking_intake' AND experience_id = ?").get(expRow.id);

  // Add field with master source
  db.prepare(`
    INSERT INTO inapp_form_fields (tenant_id, screen_id, field_key, label, input_type, options_json, display_order)
    VALUES (?, ?, 'resort_category', 'Choose Category', 'SELECT', ?, 1)
  `).run(
    testTenantId,
    scrRow.id,
    JSON.stringify({ source: "MASTER_CATEGORIES", criteria: { domain_key: "HOSPITALITY" } })
  );

  const publicExp = inappRuntimeService.getPublicExperience(testExpSlug);
  assert(publicExp, "Public experience should resolve");
  const fields = publicExp.formFieldsByScreen[scrRow.id] || [];
  assert.strictEqual(fields.length, 1);
  assert(fields[0].options.length >= 3, "Expected dynamically resolved category options");
  assert(fields[0].options.some(o => o.value === "DELUXE_ROOMS"));
  console.log(`✓ In-App Form Field dynamic master options resolution verified (${fields[0].options.length} options loaded).`);

  // Cleanup test experience
  db.prepare("DELETE FROM inapp_form_fields WHERE screen_id = ?").run(scrRow.id);
  db.prepare("DELETE FROM inapp_screens WHERE id = ?").run(scrRow.id);
  db.prepare("DELETE FROM inapp_experiences WHERE id = ?").run(expRow.id);

  // ---------------------------------------------------------------------------
  // TEST 8: Full Master Dictionary Bundle
  // ---------------------------------------------------------------------------
  console.log("\n--- 8. Testing Full Master Dictionary Bundle ---");
  const finalBundle = masterDataService.getMasterBundle(testTenantId);
  const bundleKeys = Object.keys(finalBundle);
  for (const tbl of masterTables) {
    assert(bundleKeys.includes(tbl), `Bundle missing ${tbl}`);
    assert(finalBundle[tbl].count >= 0, `Bundle ${tbl} must have valid count`);
    assert(Array.isArray(finalBundle[tbl].list), `Bundle ${tbl} must have list array`);
    assert(typeof finalBundle[tbl].byId === "object", `Bundle ${tbl} must have byId map`);
    assert(typeof finalBundle[tbl].byCode === "object", `Bundle ${tbl} must have byCode map`);
  }
  console.log(`✓ Full Master Bundle verified across all ${bundleKeys.length} master tables.`);

  console.log("\n================================================================================");
  console.log("ALL UNIVERSAL MASTER DATA & FLOW NODE TESTS PASSED SUCCESSFULLY! (100%)");
  console.log("================================================================================\n");
}

runMasterTest().catch(err => {
  console.error("\n❌ Master Test Failed:", err);
  process.exit(1);
});
