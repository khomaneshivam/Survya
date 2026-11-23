const { after, test } = require("node:test");
const assert = require("node:assert/strict");

const databaseModulePath = require.resolve("../src/config/database");
const controllerModulePath = require.resolve("../src/controllers/aiFlowBuilderConfigController");
const originalDatabaseModule = require.cache[databaseModulePath];
const originalControllerModule = require.cache[controllerModulePath];
const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;
const storedSettings = new Map();
const auditRows = [];

delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;

require.cache[databaseModulePath] = {
  id: databaseModulePath,
  filename: databaseModulePath,
  loaded: true,
  exports: {
    getSetting: (key) => storedSettings.get(key) || null,
    setSetting: (key, value) => storedSettings.set(key, String(value)),
    db: {
      prepare: () => ({ run: (...args) => auditRows.push(args) })
    }
  }
};
delete require.cache[controllerModulePath];
const controller = require("../src/controllers/aiFlowBuilderConfigController");

function response() {
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

after(() => {
  if (originalDatabaseModule) require.cache[databaseModulePath] = originalDatabaseModule;
  else delete require.cache[databaseModulePath];
  if (originalControllerModule) require.cache[controllerModulePath] = originalControllerModule;
  else delete require.cache[controllerModulePath];
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
});

test("AI flow builder config masks credentials and defaults to disabled", () => {
  storedSettings.clear();
  storedSettings.set("GEMINI_API_KEY", "a-sensitive-key-that-must-never-be-returned");
  const res = response();

  controller.getAiFlowBuilderConfig({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.enabled, false);
  assert.equal(res.body.data.credential.configured, true);
  assert.equal(JSON.stringify(res.body), JSON.stringify(res.body).replace("a-sensitive-key-that-must-never-be-returned", ""));
  assert.equal(res.body.data.rules.allowAutoPublish, false);
  assert.equal(res.body.data.rules.allowRuntimeCodeChanges, false);
});

test("AI flow builder setup persists approved rules but cannot enable unsafe flags", () => {
  storedSettings.clear();
  auditRows.length = 0;
  const res = response();

  controller.updateAiFlowBuilderConfig({
    user: { id: "admin-1", tenant_id: 12 },
    ip: "127.0.0.1",
    body: {
      enabled: true,
      provider: "OPENAI",
      model: "gpt-4o-mini",
      apiKey: "new-secret-key",
      rules: {
        requireStepApproval: true,
        requireApiReview: true,
        requireMockTests: true,
        requireSandboxPreview: true,
        allowAutoPublish: true,
        allowRuntimeCodeChanges: true,
        instructions: "Collect dates before creating a booking lead."
      }
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(storedSettings.get("AI_PROVIDER"), "OPENAI");
  assert.equal(storedSettings.get("OPENAI_MODEL"), "gpt-4o-mini");
  assert.equal(storedSettings.get("OPENAI_API_KEY"), "new-secret-key");
  assert.equal(res.body.data.rules.allowAutoPublish, false);
  assert.equal(res.body.data.rules.allowRuntimeCodeChanges, false);
  assert.equal(JSON.stringify(res.body).includes("new-secret-key"), false);
  assert.equal(auditRows.length, 1);
});

test("AI flow builder setup rejects unknown providers", () => {
  const res = response();

  controller.updateAiFlowBuilderConfig({ body: { provider: "UNTRUSTED_PROVIDER" } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});
