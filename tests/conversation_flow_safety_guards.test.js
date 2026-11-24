/**
 * Offline safety regression tests for the AI flow controller.
 *
 * These tests replace the controller's dependencies with in-memory stubs before
 * loading it. They do not connect to a database, call an LLM, or dispatch a
 * WhatsApp message.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const controllerPath = require.resolve("../src/controllers/conversationFlowController");
const dependencyPaths = {
  database: require.resolve("../src/config/database"),
  flowService: require.resolve("../src/services/conversationFlowService"),
  flowEngine: require.resolve("../src/services/conversationFlowEngine"),
  aiFlowGenerator: require.resolve("../src/services/workflow/aiFlowGeneratorService"),
  analytics: require.resolve("../src/services/workflow/flowAnalyticsService")
};

function loadControllerWithStubs(stubs) {
  const saved = new Map();
  const paths = [controllerPath, ...Object.values(dependencyPaths)];

  for (const modulePath of paths) {
    saved.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  }

  for (const [name, modulePath] of Object.entries(dependencyPaths)) {
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports: stubs[name] || {}
    };
  }

  const controller = require(controllerPath);

  return {
    controller,
    restore() {
      for (const modulePath of paths) {
        delete require.cache[modulePath];
        const original = saved.get(modulePath);
        if (original) require.cache[modulePath] = original;
      }
    }
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test("AI flow generation always starts as a draft even when a client asks to auto-publish", async () => {
  let requestToGenerator = null;
  const { controller, restore } = loadControllerWithStubs({
    database: {
      getSetting: (key) => key === "AI_FLOW_BUILDER_ENABLED" ? "true" : null
    },
    aiFlowGenerator: {
      generateFlowFromPrompt: async (request) => {
        requestToGenerator = request;
        return { success: true, flow: { id: 42, status: "DRAFT" } };
      }
    }
  });

  try {
    const response = createResponse();
    await controller.generateFlowWithAi({
      user: { id: "admin-1", tenant_id: 7, role: "ADMIN" },
      body: {
        prompt: "Create a booking journey",
        propertyId: 3,
        phoneNumberId: "sandbox-line",
        autoPublish: true
      }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(requestToGenerator.autoPublish, false);
    assert.equal(requestToGenerator.tenantId, 7);
    assert.equal(requestToGenerator.propertyId, 3);
  } finally {
    restore();
  }
});

test("disabled AI Flow Builder rejects generation before invoking the generator", async () => {
  let generatorWasCalled = false;
  const { controller, restore } = loadControllerWithStubs({
    database: {
      getSetting: () => "false"
    },
    aiFlowGenerator: {
      isAiFlowBuilderEnabled: () => false,
      generateFlowFromPrompt: async () => {
        generatorWasCalled = true;
        throw new Error("Generator must not run while disabled");
      }
    }
  });

  try {
    const response = createResponse();
    await controller.generateFlowWithAi({
      user: { id: "admin-1", tenant_id: 7, role: "ADMIN" },
      body: { prompt: "Create a booking journey" }
    }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(generatorWasCalled, false);
    assert.match(response.body.error, /AI Flow Builder is disabled/i);
  } finally {
    restore();
  }
});

test("flow simulator always forces an in-memory dry run", async () => {
  let engineRequest = null;
  const { controller, restore } = loadControllerWithStubs({
    database: {
      getSetting: () => "true"
    },
    flowEngine: {
      processTurn: async (request) => {
        engineRequest = request;
        return { handled: true, replyText: "Simulated reply" };
      }
    }
  });

  try {
    const simulationState = { current_node_id: "start", collectedData: {} };
    const flowOverride = { nodes: [], transitions: [] };
    const response = createResponse();

    await controller.simulateTurn({
      user: { id: "admin-1", tenant_id: 9 },
      body: {
        senderPhone: "919999999999",
        userInput: "hello",
        simulationState,
        flowOverride
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(engineRequest.context.isSimulation, true);
    assert.equal(engineRequest.context.dryRun, true);
    assert.equal(engineRequest.context.tenantId, 9);
    assert.equal(engineRequest.context.simulationState, simulationState);
    assert.equal(engineRequest.context.flowOverride, flowOverride);
  } finally {
    restore();
  }
});
