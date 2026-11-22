/**
 * Workflow & Flow Runtime LRU Cache
 * Bounded O(1) in-memory cache for compiled flow graphs, trigger indices, and queries.
 * Prevents redundant JSON parsing, graph traversal, and SQL queries during high-concurrency turn processing.
 */

class RuntimeLRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first key in map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

// Dedicated LRU caches
const flowGraphCache = new RuntimeLRUCache(150);
const triggerIndexCache = new RuntimeLRUCache(50);
const catalogQueryCache = new RuntimeLRUCache(200);

/**
 * Compiles a raw flow graph into O(1) lookup structures:
 * - nodeMap: Map<nodeId, node>
 * - adjacencyMap: Map<nodeId, Array<{ target, handle, optionId, condition }>>
 * - startNode: initial root trigger or start node
 */
function compileFlowGraph(flow) {
  if (!flow) return null;

  let nodes = [];
  let transitions = [];

  try {
    nodes = typeof flow.nodes_json === "string" ? JSON.parse(flow.nodes_json || "[]") : (flow.nodes_json || []);
  } catch (_) {
    nodes = [];
  }

  try {
    transitions = typeof flow.transitions_json === "string" ? JSON.parse(flow.transitions_json || "[]") : (flow.transitions_json || []);
  } catch (_) {
    transitions = [];
  }

  const nodeMap = new Map();
  const adjacencyMap = new Map();
  let startNode = null;

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    adjacencyMap.set(n.id, []);
    if (!startNode && (n.type.startsWith("TRIGGER_") || n.type === "START")) {
      startNode = n;
    }
  }

  for (const t of transitions) {
    const src = t.source || t.from;
    const tgt = t.target || t.to;
    if (src && adjacencyMap.has(src)) {
      adjacencyMap.get(src).push({
        id: t.id,
        target: tgt,
        sourceHandle: t.sourceHandle || (t.optionId ? String(t.optionId) : null) || (t.condition !== undefined ? String(t.condition) : "default"),
        label: t.label || null
      });
    }
  }

  // Fallback startNode if none identified by type
  if (!startNode && nodes.length > 0) {
    startNode = nodes[0];
  }

  return {
    flowId: flow.id,
    flowName: flow.name,
    version: flow.version || 1,
    nodes,
    transitions,
    nodeMap,
    adjacencyMap,
    startNode,
    compiledAt: Date.now()
  };
}

/**
 * Gets compiled flow graph from cache or compiles and caches it
 */
function getCompiledFlow(flow) {
  if (!flow || !flow.id) return null;
  const cacheKey = `flow_${flow.id}_${flow.updated_at || flow.version || 1}`;
  let compiled = flowGraphCache.get(cacheKey);
  if (!compiled) {
    compiled = compileFlowGraph(flow);
    if (compiled) {
      flowGraphCache.set(cacheKey, compiled);
    }
  }
  return compiled;
}

/**
 * Invalidate flow cache when flow is updated, published, or deleted
 */
function invalidateFlow(flowId) {
  if (!flowId) return;
  // Delete all keys matching this flowId
  for (const key of flowGraphCache.cache.keys()) {
    if (key.startsWith(`flow_${flowId}_`)) {
      flowGraphCache.delete(key);
    }
  }
}

/**
 * Invalidate trigger index cache when triggers change
 */
function invalidateTriggers(tenantId = null) {
  if (tenantId) {
    triggerIndexCache.delete(`trg_tenant_${tenantId}`);
  } else {
    triggerIndexCache.clear();
  }
}

/**
 * Clears all runtime caches
 */
function clearAll() {
  flowGraphCache.clear();
  triggerIndexCache.clear();
  catalogQueryCache.clear();
}

module.exports = {
  RuntimeLRUCache,
  flowGraphCache,
  triggerIndexCache,
  catalogQueryCache,
  compileFlowGraph,
  getCompiledFlow,
  invalidateFlow,
  invalidateTriggers,
  clearAll
};
