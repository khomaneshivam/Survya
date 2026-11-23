/**
 * Offline guards for live-routing shortcuts on governed flows.
 * No database, network, AI, Meta, or WhatsApp service is loaded by this test.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const servicePath = require.resolve("../src/services/conversationFlowService");
const dependencyPaths = {
  database: require.resolve("../src/config/database"),
  runtimeCache: require.resolve("../src/services/workflow/runtimeCache"),
  approvals: require.resolve("../src/services/flowApprovalService"),
  nodeExecutors: require.resolve("../src/services/workflow/nodeExecutors")
};

function loadServiceWithStubs({ target, governedPublishedDefault = null }) {
  const saved = new Map();
  const paths = [servicePath, ...Object.values(dependencyPaths)];
  for (const modulePath of paths) {
    saved.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  }

  const db = {
    prepare(sql) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
      return {
        get(...params) {
          if (query.startsWith("select * from conversation_flows where id = ?")) {
            return String(params[0]) === String(target.id) ? { ...target } : undefined;
          }
          if (query.startsWith("select id from conversation_flows") && query.includes("approval_required = 1")) {
            return governedPublishedDefault ? { id: governedPublishedDefault.id } : undefined;
          }
          return undefined;
        },
        run() {
          return { changes: 1 };
        }
      };
    }
  };

  const stubs = {
    database: { db },
    runtimeCache: { invalidateFlow() {}, invalidateTriggers() {} },
    approvals: {},
    nodeExecutors: { getNodeExecutor() { return { execute() {} }; } }
  };
  for (const [name, modulePath] of Object.entries(dependencyPaths)) {
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: stubs[name] };
  }

  return {
    service: require(servicePath),
    restore() {
      for (const modulePath of paths) {
        delete require.cache[modulePath];
        const original = saved.get(modulePath);
        if (original) require.cache[modulePath] = original;
      }
    }
  };
}

test("set-default shortcut cannot change routing for a governed published flow", () => {
  const { service, restore } = loadServiceWithStubs({
    target: { id: 17, tenant_id: 3, approval_required: 1, status: "PUBLISHED", is_default: 0 }
  });

  try {
    assert.throws(
      () => service.setDefaultFlow(17, { id: "admin-1" }, 3),
      error => error.code === "FLOW_REVIEW_REQUIRED"
    );
  } finally {
    restore();
  }
});

test("set-default shortcut cannot unset a different governed published default", () => {
  const { service, restore } = loadServiceWithStubs({
    target: { id: 18, tenant_id: 3, approval_required: 0, status: "PUBLISHED", is_default: 0 },
    governedPublishedDefault: { id: 17 }
  });

  try {
    assert.throws(
      () => service.setDefaultFlow(18, { id: "admin-1" }, 3),
      error => error.code === "FLOW_REVIEW_REQUIRED"
    );
  } finally {
    restore();
  }
});
