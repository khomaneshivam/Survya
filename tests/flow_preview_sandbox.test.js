/**
 * Browser preview safety tests.
 *
 * These tests load only the pure preview sandbox, then replace the database
 * dependency with an in-memory read-only stub. They never start the server,
 * connect to MySQL, call an LLM, or contact Meta/WhatsApp.
 */

const { after, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizePreviewGraph,
  simulateBrowserPreview
} = require("../src/services/flowPreviewSandbox");

test("public preview snapshots redact credentials and omit executable integration configuration", () => {
  const graph = sanitizePreviewGraph({
    name: "Booking helper",
    nodes: [
      { id: "start", type: "TRIGGER_WHATSAPP", config: {} },
      {
        id: "call-api",
        type: "HTTP_WEBHOOK",
        title: "Availability endpoint",
        config: {
          url: "https://user:secret@example.test/private",
          headers: { Authorization: "Bearer private-token" },
          text: "Authorization: Bearer private-token",
          action: "check_availability"
        }
      }
    ],
    transitions: [{ source: "start", target: "call-api", sourceHandle: "default" }]
  });

  const externalNode = graph.nodes.find(node => node.id === "call-api");
  assert.equal(externalNode.config.url, undefined);
  assert.equal(externalNode.config.headers, undefined);
  assert.equal(externalNode.config.text, undefined);
  assert.equal(externalNode.config.action, undefined);
});

test("browser sandbox renders external nodes as local placeholders without using fetch", () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Network calls are forbidden in preview tests");
  };

  try {
    const graph = {
      name: "Safe demo",
      nodes: [
        { id: "start", type: "TRIGGER_WHATSAPP" },
        {
          id: "menu",
          type: "SEND_MESSAGE",
          config: { text: "Choose an option", options: [{ id: "book", title: "Book" }] }
        },
        { id: "webhook", type: "HTTP_WEBHOOK", title: "Booking API", config: { url: "https://example.test" } },
        { id: "complete", type: "END", config: { farewellMessage: "Preview complete" } }
      ],
      transitions: [
        { source: "start", target: "menu", sourceHandle: "default" },
        { source: "menu", target: "webhook", sourceHandle: "book" },
        { source: "webhook", target: "complete", sourceHandle: "success" }
      ]
    };

    const opening = simulateBrowserPreview(graph);
    assert.equal(opening.interactive.type, "BUTTONS");
    assert.equal(opening.currentNodeId, "menu");

    const result = simulateBrowserPreview(graph, {
      selectedOptionId: "book",
      state: opening.state
    });
    assert.equal(result.terminal, true);
    assert.match(result.replyText, /simulated locally/i);
    assert.match(result.replyText, /Preview complete/i);
    assert.equal(result.safety.outboundMessaging, false);
    assert.equal(result.safety.externalRequests, false);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

const databaseModulePath = require.resolve("../src/config/database");
const previewServicePath = require.resolve("../src/services/flowPreviewService");
const originalDatabaseModule = require.cache[databaseModulePath];
const originalPreviewService = require.cache[previewServicePath];

function loadReadOnlyPreviewService() {
  const graph = {
    name: "Frozen preview",
    nodes: [
      { id: "start", type: "TRIGGER_WHATSAPP" },
      { id: "end", type: "END", config: { farewellMessage: "Done" } }
    ],
    transitions: [{ source: "start", target: "end", sourceHandle: "default" }]
  };
  let writes = 0;
  delete require.cache[databaseModulePath];
  delete require.cache[previewServicePath];
  require.cache[databaseModulePath] = {
    id: databaseModulePath,
    filename: databaseModulePath,
    loaded: true,
    exports: {
      db: {
        prepare(sql) {
          return {
            get() {
              if (/from flow_preview_links p/i.test(sql)) {
                return {
                  id: "preview_1234567890abcdef12345678",
                  flow_id: 99,
                  flow_version_id: 17,
                  title: "Frozen preview",
                  graph_json: JSON.stringify(graph),
                  expires_at: "2030-01-01 00:00:00"
                };
              }
              return undefined;
            },
            all() { return []; },
            run() {
              writes += 1;
              throw new Error("Public preview lookup must not write to the database");
            }
          };
        }
      }
    }
  };
  const service = require("../src/services/flowPreviewService");
  return { service, getWrites: () => writes };
}

test("public preview reads and simulates a frozen snapshot without database writes", () => {
  const { service, getWrites } = loadReadOnlyPreviewService();
  const token = "a".repeat(43);

  const preview = service.getPublicPreview(token);
  assert.equal(preview.safety.persistence, false);
  assert.equal(preview.safety.outboundMessaging, false);

  const simulation = service.simulatePublicPreview({ token });
  assert.equal(simulation.simulation.safety.persistence, false);
  assert.equal(getWrites(), 0);
});

after(() => {
  delete require.cache[databaseModulePath];
  delete require.cache[previewServicePath];
  if (originalDatabaseModule) require.cache[databaseModulePath] = originalDatabaseModule;
  if (originalPreviewService) require.cache[previewServicePath] = originalPreviewService;
});
