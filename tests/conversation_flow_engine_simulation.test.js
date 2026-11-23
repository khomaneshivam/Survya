/**
 * Offline regression tests for the engine's fail-closed simulation boundary.
 * Every dependency is replaced before the engine is loaded; no database,
 * network, AI, webhook, CRM, or WhatsApp code is available to the test.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const enginePath = require.resolve("../src/services/conversationFlowEngine");
const dependencies = {
  database: require.resolve("../src/config/database"),
  availability: require.resolve("../src/services/hospitalityAvailabilityService"),
  pricing: require.resolve("../src/services/hospitalityPricingService"),
  enquiry: require.resolve("../src/services/enquiryService"),
  executors: require.resolve("../src/services/workflow/nodeExecutors"),
  expressions: require.resolve("../src/services/workflow/expressionEvaluator"),
  time: require.resolve("../src/utils/timeUtil"),
  analytics: require.resolve("../src/services/workflow/flowAnalyticsService")
};

function loadEngineWithOfflineStubs() {
  const saved = new Map();
  const paths = [enginePath, ...Object.values(dependencies)];
  for (const path of paths) {
    saved.set(path, require.cache[path]);
    delete require.cache[path];
  }

  let databaseTouched = false;
  let executorRequested = false;
  const failIfUsed = () => {
    databaseTouched = true;
    throw new Error("Simulation must not access the production database");
  };

  const stubs = {
    database: { db: { prepare: failIfUsed } },
    availability: {},
    pricing: {},
    enquiry: {},
    executors: {
      getNodeExecutor() {
        executorRequested = true;
        throw new Error("Simulation must not resolve a production node executor");
      }
    },
    expressions: {
      evaluateRules: () => true,
      evaluateSingleRule: () => false,
      getPath: (object, path) => String(path || "").split(".").reduce((value, key) => value?.[key], object),
      computeVariable: (_operation, _current, value) => value,
      interpolateTemplate: (value, context = {}) => String(value || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key) => String(context[key.trim()] ?? ""))
    },
    time: { parseMysqlUtcTimestamp: () => null },
    analytics: { recordNodeEvent: () => { throw new Error("Simulation must not write analytics"); } }
  };

  for (const [key, path] of Object.entries(dependencies)) {
    require.cache[path] = { id: path, filename: path, loaded: true, exports: stubs[key] };
  }

  return {
    engine: require(enginePath),
    didTouchDatabase: () => databaseTouched,
    didRequestExecutor: () => executorRequested,
    restore() {
      for (const path of paths) {
        delete require.cache[path];
        const original = saved.get(path);
        if (original) require.cache[path] = original;
      }
    }
  };
}

test("simulated engine turns use only the pure interpreter", async () => {
  const loaded = loadEngineWithOfflineStubs();
  try {
    const result = await loaded.engine.processTurn({
      senderPhone: "919999999999",
      userInput: "start",
      context: {
        isSimulation: true,
        flowOverride: {
          nodes: [
            { id: "start", type: "TRIGGER_WHATSAPP", config: {} },
            { id: "external", type: "HTTP_WEBHOOK", title: "External API", config: { url: "https://example.test" } },
            { id: "end", type: "END", config: { farewellMessage: "Done" } }
          ],
          transitions: [
            { source: "start", target: "external", sourceHandle: "default" },
            { source: "external", target: "end", sourceHandle: "success" }
          ]
        }
      }
    });

    assert.equal(result.handled, true);
    assert.equal(result.sessionStatus, "COMPLETED");
    assert.match(result.replyText, /mocked/i);
    assert.match(result.replyText, /Done/);
    assert.equal(loaded.didTouchDatabase(), false);
    assert.equal(loaded.didRequestExecutor(), false);
  } finally {
    loaded.restore();
  }
});

test("simulated engine turns reject missing in-memory graph without database fallback", async () => {
  const loaded = loadEngineWithOfflineStubs();
  try {
    const result = await loaded.engine.processTurn({
      senderPhone: "919999999999",
      context: { isSimulation: true }
    });

    assert.equal(result.handled, false);
    assert.match(result.reason, /explicit in-memory flow graph/i);
    assert.equal(loaded.didTouchDatabase(), false);
    assert.equal(loaded.didRequestExecutor(), false);
  } finally {
    loaded.restore();
  }
});
