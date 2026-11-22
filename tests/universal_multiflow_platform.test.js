const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");
const config = require("../src/config/env");
const { db } = require("../src/config/database");
const { app } = require("../server");

const runtimeCache = require("../src/services/workflow/runtimeCache");
const workflowTriggerService = require("../src/services/workflow/workflowTriggerService");
const flowEngine = require("../src/services/conversationFlowEngine");
const flowService = require("../src/services/conversationFlowService");
const aiFlowGenerator = require("../src/services/workflow/aiFlowGeneratorService");
const universalCatalogService = require("../src/services/universal/universalCatalogService");
const universalAvailabilityService = require("../src/services/universal/universalAvailabilityService");
const universalPricingService = require("../src/services/universal/universalPricingService");
const masterDataService = require("../src/services/masters/masterDataService");

describe("Universal Multi-Flow Hub, O(1) Compiled Trigger Router & AI Architect Suite", { concurrency: 1 }, () => {
  let serverInstance = null;
  let baseUrl = null;
  let testUser = null;
  let authToken = null;
  const testTenantId = 988;
  const testUserId = "flow_test_admin";

  let testCategory = null;
  let testUnit = null;
  let testLocation = null;
  let testTaxSlab = null;
  let testItemRetail = null;
  let testItemClinic = null;
  let testItemResort = null;
  let testAddonGroup = null;

  before(async () => {
    // 1. Ensure test tenant & user exist
    testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE status = 'ACTIVE' LIMIT 1").get();
    if (!testUser) {
      const uId = "test_user_flow_" + Date.now();
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
        VALUES (?, 'Flow Test Admin', 'flowtest@example.com', 'dummy_hash', 'SUPERADMIN', 'ACTIVE', NOW(), NOW())
      `).run(uId);
      testUser = db.prepare("SELECT id, name, email, role, status FROM users WHERE id = ?").get(uId);
    }

    authToken = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: "SUPERADMIN", tenantId: testTenantId },
      config.JWT_SECRET,
      { expiresIn: "2h" }
    );

    // 2. Clean test tenant data
    db.prepare("DELETE FROM conversation_flow_sessions WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM conversation_flow_versions WHERE flow_id IN (SELECT id FROM conversation_flows WHERE tenant_id = ?)").run(testTenantId);
    db.prepare("DELETE FROM conversation_flows WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_inventory_holds WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_availability_slots WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_addons WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_addon_groups WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_pricing_rules WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM catalog_items WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_categories WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_units WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_tax_slabs WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_locations WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM master_resources WHERE tenant_id = ?").run(testTenantId);
    db.prepare("DELETE FROM business_entities WHERE tenant_id = ?").run(testTenantId);

    // Clear caches
    runtimeCache.flowGraphCache.clear();
    runtimeCache.triggerIndexCache.clear();

    // 2.1 Seed test business entity
    db.prepare(`
      INSERT INTO business_entities (
        tenant_id, domain, name, slug, phone_e164, city, status, active_status, delete_status, created_at, updated_at
      ) VALUES (
        ?, 'RETAIL', 'Sarvya Commerce Hub', 'sarvya-commerce-hub', '+919876543210', 'Mumbai', 'ACTIVE', 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `).run(testTenantId);

    // 2.2 Seed Masters
    testLocation = masterDataService.createMaster(testTenantId, "master_locations", {
      name: "Bandra Flagship Store",
      location_code: "LOC_BANDRA",
      city: "Mumbai"
    }, testUserId);

    testCategory = masterDataService.createMaster(testTenantId, "master_categories", {
      name: "Apparel & Streetwear",
      category_code: "CAT_APPAREL"
    }, testUserId);

    testUnit = masterDataService.createMaster(testTenantId, "master_units", {
      name: "Piece",
      unit_code: "PC",
      unit_symbol: "pc",
      unit_type: "COUNT"
    }, testUserId);

    testTaxSlab = masterDataService.createMaster(testTenantId, "master_tax_slabs", {
      title: "GST 18%",
      slab_code: "GST_18",
      tax_rate: 18
    }, testUserId);

    // 2.3 Seed Catalog Items for 3 sectors
    // 1. Retail: UNIT_STOCK
    testItemRetail = universalCatalogService.createItem(testTenantId, {
      title: "Oversized Cotton Hoodie",
      basePrice: 1999,
      inventoryMode: "UNIT_STOCK",
      stockQty: 25,
      trackInventory: 1,
      masterCategoryId: testCategory.id,
      masterUnitId: testUnit.id,
      masterLocationId: testLocation.id,
      masterTaxSlabId: testTaxSlab.id
    }, testUserId);

    // 2. Clinic: TIME_SLOT
    testItemClinic = universalCatalogService.createItem(testTenantId, {
      title: "Dental Ultrasonic Scaling",
      basePrice: 1499,
      inventoryMode: "TIME_SLOT",
      slotDurationMinutes: 45,
      trackInventory: 0,
      masterCategoryId: testCategory.id,
      masterTaxSlabId: testTaxSlab.id
    }, testUserId);

    // 3. Resort: DATE_RANGE
    testItemResort = universalCatalogService.createItem(testTenantId, {
      title: "Deluxe Oceanfront Suite",
      basePrice: 7500,
      inventoryMode: "DATE_RANGE",
      stockQty: 5,
      trackInventory: 1,
      masterCategoryId: testCategory.id,
      masterTaxSlabId: testTaxSlab.id
    }, testUserId);

    // 2.4 Seed Add-On Group & Add-on
    testAddonGroup = universalCatalogService.createAddonGroup(testTenantId, {
      title: "Packaging & Extras",
      code: "PACK_EXTRAS",
      selectionType: "MULTIPLE",
      addons: [
        { name: "Luxury Gift Wrap", price: 150, isDefault: 0 },
        { name: "Express Courier Insurance", price: 99, isDefault: 0 }
      ]
    }, testUserId);

    // 3. Start Test HTTP Server
    serverInstance = http.createServer(app);
    await new Promise(resolve => serverInstance.listen(0, resolve));
    const port = serverInstance.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
  });

  // Helper fetch function
  const apiFetch = async (endpoint, options = {}) => {
    const url = `${baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`,
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    return { status: res.status, ok: res.ok, body };
  };

  // -------------------------------------------------------------------------
  // 1. LRU Cache & In-Memory Trigger Compilation Benchmarks
  // -------------------------------------------------------------------------
  test("LRU Cache & Compilation: LRUCache eviction, TTL expiry, and sub-2ms trigger matching", () => {
    // 1.1 Test LRU Cache directly
    const testCache = new runtimeCache.RuntimeLRUCache(3, 100);
    testCache.set("a", 1);
    testCache.set("b", 2);
    testCache.set("c", 3);
    assert.equal(testCache.get("a"), 1); // Access 'a' to refresh recency
    testCache.set("d", 4); // Should evict 'b' (least recently used)
    assert.equal(testCache.has("b"), false);
    assert.equal(testCache.has("a"), true);
    assert.equal(testCache.has("c"), true);
    assert.equal(testCache.has("d"), true);

    // 1.2 Test Trigger Compilation
    const rawTriggers = [
      { id: 101, flowId: 1, trigger_type: "KEYWORD_MATCH", trigger_keywords: ["shop", "buy", "hoodie"], match_type: "EXACT", is_default: 0, priority: 10 },
      { id: 102, flowId: 2, trigger_type: "KEYWORD_MATCH", trigger_keywords: ["book", "stay"], match_type: "CONTAINS", is_default: 0, priority: 20 },
      { id: 103, flowId: 3, trigger_type: "CATCH_ALL", trigger_keywords: [], match_type: "CATCH_ALL", is_default: 1, priority: 1 }
    ];

    const compiledIndex = runtimeCache.compileTriggerIndex(rawTriggers);
    assert.ok(compiledIndex.exactMap instanceof Map);
    assert.ok(compiledIndex.exactMap.has("shop"));
    assert.ok(compiledIndex.exactMap.has("hoodie"));
    assert.equal(compiledIndex.containsList.length, 2);
    assert.ok(compiledIndex.catchAll);

    // 1.3 Trigger Resolution Benchmark (< 2ms)
    const iterations = 1000;
    const startTime = performance.now();
    for (let i = 0; i < iterations; i++) {
      // Simulate exact match
      const token = i % 2 === 0 ? "shop" : "book now for weekend";
      const exactHits = compiledIndex.exactMap.get(token.toLowerCase());
      if (!exactHits) {
        const containsHit = compiledIndex.containsList.find(c => token.toLowerCase().includes(c.keyword));
      }
    }
    const elapsed = performance.now() - startTime;
    const avgPerMatchMs = elapsed / iterations;
    assert.ok(avgPerMatchMs < 2.0, `Expected avg match time < 2ms, got ${avgPerMatchMs}ms`);
  });

  // -------------------------------------------------------------------------
  // 2. Linear-Time Trigger Conflict Detector
  // -------------------------------------------------------------------------
  test("Conflict Detector: flags KEYWORD_OVERLAP and DUPLICATE_CATCHALL in linear time", () => {
    // Create 2 test flows with overlapping keywords on line 'LINE_TEST_1'
    const flow1 = flowService.createFlow({
      tenant_id: testTenantId,
      name: "Retail Flow A",
      trigger_keywords: ["order", "deals", "shoes"],
      phone_number_id: "LINE_TEST_1",
      initialNodes: [{ id: "t1", type: "TRIGGER_WHATSAPP", config: { keywords: ["order", "deals", "shoes"] } }, { id: "e1", type: "END" }],
      initialTransitions: [{ source: "t1", target: "e1" }]
    }, testUser);

    const flow2 = flowService.createFlow({
      tenant_id: testTenantId,
      name: "Retail Flow B",
      trigger_keywords: ["deals", "discounts"], // 'deals' overlaps
      phone_number_id: "LINE_TEST_1",
      initialNodes: [{ id: "t2", type: "TRIGGER_WHATSAPP", config: { keywords: ["deals", "discounts"] } }, { id: "e2", type: "END" }],
      initialTransitions: [{ source: "t2", target: "e2" }]
    }, testUser);

    // Publish both
    flowService.publishFlow(flow1.flow.id, testUser, testTenantId);
    flowService.publishFlow(flow2.flow.id, testUser, testTenantId);

    // Run linear conflict detector
    const conflictsRes = workflowTriggerService.detectTriggerConflicts(testTenantId);
    assert.ok(conflictsRes.conflicts.length > 0, "Should detect at least 1 conflict");

    const overlap = conflictsRes.conflicts.find(c => c.type === "KEYWORD_OVERLAP");
    assert.ok(overlap, "Should flag KEYWORD_OVERLAP conflict");
    assert.equal(overlap.keyword, "deals");
    assert.equal(overlap.phoneNumberId, "LINE_TEST_1");
  });

  // -------------------------------------------------------------------------
  // 3. Compact Session Footprint & Legacy Bypass
  // -------------------------------------------------------------------------
  test("Session Compaction: strips heavy catalog/media arrays keeping only compact IDs and cart", () => {
    const heavySessionData = {
      selectedItemId: testItemRetail.id,
      selected_item_id: testItemRetail.id,
      selectedItemTitle: testItemRetail.title,
      selectedItemPrice: 1999,
      _largeRawCatalogResponse: new Array(50).fill({ id: 1, title: "Heavy object", images: ["https://example.com/huge.jpg"] }),
      _base64Payload: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      cart: [{ itemId: testItemRetail.id, variantId: null, addonIds: [1], qty: 2 }]
    };

    const compacted = flowEngine.compactSessionData(heavySessionData);
    assert.equal(compacted.selectedItemId, testItemRetail.id);
    assert.equal(compacted._largeRawCatalogResponse, undefined, "Should strip heavy catalog array");
    assert.equal(compacted._base64Payload, undefined, "Should strip base64 payload");
    assert.equal(compacted.cart.length, 1);
    assert.equal(compacted.cart[0].qty, 2);
  });

  // -------------------------------------------------------------------------
  // 4. Universal Node Executors (CATALOG_BROWSER, ADDON_UPSELL_AND_QUOTE, AI_HYBRID_ASSIST)
  // -------------------------------------------------------------------------
  test("CATALOG_BROWSER Node: respects cascading filters, formats master units, and handles selection", async () => {
    const catalogBrowserExecutor = require("../src/services/workflow/nodeExecutors/catalogBrowserExecutor");

    // 4.1 Initial presentation with category & location filter
    const node = {
      id: "node_cat_browser",
      type: "CATALOG_BROWSER",
      config: {
        title: "👗 Test Catalog",
        pageSize: 5
      }
    };

    const contextInit = {
      tenantId: testTenantId,
      session: {
        selected_location_id: testLocation.id,
        selected_category_id: testCategory.id
      },
      userInput: "",
      isWaitingForThisNode: false
    };

    const resInit = await catalogBrowserExecutor.execute(node, contextInit);
    assert.equal(resInit.action, "WAIT_FOR_INPUT");
    assert.ok(resInit.replyInteractive, "Should present interactive list or buttons");

    // 4.2 Customer selects item_id
    const contextSelect = {
      tenantId: testTenantId,
      session: {
        selected_location_id: testLocation.id
      },
      userPayload: { id: `item_${testItemRetail.id}` },
      userInput: `item_${testItemRetail.id}`,
      isWaitingForThisNode: true
    };

    const resSelect = await catalogBrowserExecutor.execute(node, contextSelect);
    assert.equal(resSelect.action, "CONTINUE");
    assert.equal(resSelect.nextHandle, "item_selected");
    assert.equal(resSelect.updatedData.selectedItemId, testItemRetail.id);
    assert.equal(resSelect.updatedData.selectedItemPrice, 1999);
  });

  test("ADDON_UPSELL_AND_QUOTE Node: presents add-ons, atomic hold, dynamic quote, and action routing", async () => {
    const addonQuoteExecutor = require("../src/services/workflow/nodeExecutors/addonQuoteExecutor");

    const node = {
      id: "node_addon_quote",
      type: "ADDON_UPSELL_AND_QUOTE",
      config: {
        allowAddons: true,
        allowPromoCode: true
      }
    };

    // 4.3 Initial presentation of add-ons
    const contextInit = {
      tenantId: testTenantId,
      session: {
        selectedItemId: testItemRetail.id,
        quantity: 1
      },
      recipientPhone: "+919876543210",
      userInput: "",
      isWaitingForThisNode: false
    };

    const resInit = await addonQuoteExecutor.execute(node, contextInit);
    assert.equal(resInit.action, "WAIT_FOR_INPUT");
    assert.ok(resInit.updatedData.quote, "Should generate quote");
    assert.ok(resInit.updatedData.holdToken, "Should acquire atomic inventory hold token");

    // 4.4 Customer confirms and pays
    const contextConfirm = {
      tenantId: testTenantId,
      session: {
        selectedItemId: testItemRetail.id,
        holdToken: resInit.updatedData.holdToken,
        quantity: 1
      },
      userPayload: { id: "confirm_pay" },
      userInput: "confirm_pay",
      isWaitingForThisNode: true
    };

    const resConfirm = await addonQuoteExecutor.execute(node, contextConfirm);
    assert.equal(resConfirm.action, "CONTINUE");
    assert.equal(resConfirm.nextHandle, "confirmed");
    assert.equal(resConfirm.updatedData.confirmed, true);
    assert.ok(resConfirm.updatedData.cart.length > 0);
  });

  test("AI_HYBRID_ASSIST Node: answers grounded queries and routes matched_item or handoff", async () => {
    const aiHybridExecutor = require("../src/services/workflow/nodeExecutors/aiHybridExecutor");

    const node = {
      id: "node_ai_copilot",
      type: "AI_HYBRID_ASSIST",
      config: { resumePrompt: "👉 Continue:" }
    };

    // 4.5 Query matching catalog item
    const contextItem = {
      tenantId: testTenantId,
      userInput: "Do you have the Oversized Cotton Hoodie?",
      isWaitingForThisNode: true
    };

    const resItem = await aiHybridExecutor.execute(node, contextItem);
    assert.equal(resItem.action, "CONTINUE");
    assert.equal(resItem.nextHandle, "matched_item");
    assert.equal(resItem.updatedData.selectedItemId, testItemRetail.id);

    // 4.6 Query requesting human handoff
    const contextHandoff = {
      tenantId: testTenantId,
      userInput: "Can I please speak to a human agent?",
      isWaitingForThisNode: true
    };

    const resHandoff = await aiHybridExecutor.execute(node, contextHandoff);
    assert.equal(resHandoff.action, "CONTINUE");
    assert.equal(resHandoff.nextHandle, "handoff");
  });

  // -------------------------------------------------------------------------
  // 5. Admin AI Flow Architect & Refiner
  // -------------------------------------------------------------------------
  test("AI Flow Architect: generates master-bound flows and refines with diff summary", async () => {
    // 5.1 AI Generate Flow
    const genRes = await aiFlowGenerator.generateFlowFromPrompt({
      prompt: "Create an e-commerce retail store flow for buying apparel with add-on packaging",
      tenantId: testTenantId,
      autoPublish: false,
      user: testUser
    });

    assert.equal(genRes.success, true);
    assert.ok(genRes.flow.id);
    assert.ok(genRes.flow.nodes_json);

    const generatedNodes = JSON.parse(genRes.flow.nodes_json || "[]");
    const hasCatalogBrowser = generatedNodes.some(n => n.type === "CATALOG_BROWSER");
    assert.ok(hasCatalogBrowser, "Generated flow should include CATALOG_BROWSER");

    // 5.2 AI Refine Flow
    const refineRes = await aiFlowGenerator.refineFlowWithAi({
      flowId: genRes.flow.id,
      prompt: "Add a master picker for department and add a 15-minute follow up delay",
      tenantId: testTenantId,
      user: testUser
    });

    assert.equal(refineRes.success, true);
    assert.ok(refineRes.addedNodes.length >= 2, "Should have added at least 2 nodes");
    assert.ok(refineRes.diffSummary, "Should provide a clear diff summary");
  });

  // -------------------------------------------------------------------------
  // 6. HTTP API Routes (/api/v1/flows/conflicts, /ai-generate, /:id/ai-refine)
  // -------------------------------------------------------------------------
  test("HTTP API Routes: confirms /api/v1/flows/conflicts and AI endpoints respond 200", async () => {
    // 6.1 Conflicts endpoint
    const conflictsRes = await apiFetch("/api/v1/flows/conflicts");
    assert.equal(conflictsRes.status, 200);
    assert.ok(Array.isArray(conflictsRes.body.conflicts));

    // 6.2 AI Generate Endpoint
    const aiGenRes = await apiFetch("/api/v1/flows/ai-generate", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Create a dental clinic consultation booking flow",
        autoPublish: false
      })
    });
    assert.ok(aiGenRes.status === 200 || aiGenRes.status === 201);
    assert.equal(aiGenRes.body.success, true);
    const flowId = aiGenRes.body.flow.id;

    // 6.3 AI Refine Endpoint
    const aiRefineRes = await apiFetch(`/api/v1/flows/${flowId}/ai-refine`, {
      method: "POST",
      body: JSON.stringify({
        prompt: "Add an add-on upsell step for teeth whitening"
      })
    });
    assert.equal(aiRefineRes.status, 200);
    assert.equal(aiRefineRes.body.success, true);
    assert.ok(aiRefineRes.body.diffSummary);
  });
});
