/**
 * Workflow & Flow Runtime LRU Cache
 * Bounded O(1) in-memory cache for compiled flow graphs, trigger indices, and queries.
 * Prevents redundant JSON parsing, graph traversal, and SQL queries during high-concurrency turn processing.
 * Enforces zero dependencies, JavaScript Map eviction ordering, and a 5-minute TTL.
 */

class RuntimeLRUCache {
  constructor(maxSize = 100, defaultTtlMs = 5 * 60 * 1000) {
    this.maxSize = Math.max(1, maxSize);
    this.defaultTtlMs = defaultTtlMs;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);

    // TTL expiration check
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  has(key) {
    if (!this.cache.has(key)) return false;
    const entry = this.cache.get(key);
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  set(key, value, customTtlMs = null) {
    const ttl = customTtlMs !== null ? customTtlMs : this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first key in insertion-ordered Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, expiresAt });
    return value;
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

// Dedicated LRU caches (maxFlows = 200, maxTriggerIndices = 100, 5-minute TTL)
const flowGraphCache = new RuntimeLRUCache(200, 5 * 60 * 1000);
const triggerIndexCache = new RuntimeLRUCache(100, 5 * 60 * 1000);
const catalogQueryCache = new RuntimeLRUCache(200, 3 * 60 * 1000);

/**
 * Compiles a raw flow graph into O(1) lookup structures:
 * - nodeMap: Map<nodeId, node>
 * - outgoingMap: Map<sourceId, Array<{ target, handle, optionId, condition }>>
 * - adjacencyMap: alias of outgoingMap
 * - startNodeId: ID of initial trigger / start node
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
  const outgoingMap = new Map();
  let startNode = null;

  for (const n of nodes) {
    nodeMap.set(n.id, n);
    outgoingMap.set(n.id, []);
    if (!startNode && (n.type.startsWith("TRIGGER_") || n.type === "START")) {
      startNode = n;
    }
  }

  for (const t of transitions) {
    const src = t.source || t.from;
    const tgt = t.target || t.to;
    if (src && outgoingMap.has(src)) {
      outgoingMap.get(src).push({
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
    outgoingMap,
    adjacencyMap: outgoingMap, // Backward compatibility alias
    startNode,
    startNodeId: startNode ? startNode.id : (nodes[0]?.id || null),
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
 * Compiles a list of raw DB triggers into an O(1) indexed lookup structure
 */
function compileTriggerIndex(rawTriggers = []) {
  const exactMap = new Map(); // tokenLower -> TriggerRef[]
  const containsList = [];    // { keywordLower, triggerRef, ignoreCase }
  const compiledRegexList = []; // { regex, triggerRef }
  let catchAll = null;
  let ctwa = null;

  for (const trg of rawTriggers) {
    let config = {};
    try {
      config = typeof trg.match_config_json === "string" ? JSON.parse(trg.match_config_json || "{}") : (trg.match_config_json || {});
    } catch (_) {
      continue;
    }

    const rawKeywords = config.keywords || trg.trigger_keywords || trg.keywords || [];
    const keywords = Array.isArray(rawKeywords) ? rawKeywords : (typeof rawKeywords === "string" ? rawKeywords.split(",").map(k => k.trim()).filter(Boolean) : []);
    const matchType = String(config.matchType || trg.match_type || trg.matchType || "CONTAINS").toUpperCase();
    const ignoreCase = config.ignoreCase !== false && trg.ignoreCase !== false;

    const triggerRef = {
      id: trg.id,
      flowId: trg.flow_id || trg.flowId,
      phoneNumberId: trg.phone_number_id || trg.phoneNumberId,
      nodeId: config.nodeId || trg.nodeId || trg.node_id,
      triggerKey: trg.trigger_key || trg.triggerKey,
      triggerType: trg.trigger_type || trg.triggerType,
      priority: trg.priority || 100,
      isCatchAll: Boolean(config.isCatchAll || trg.trigger_type === "CATCH_ALL" || trg.trigger_type === "INBOUND_ANY"),
      isCtwa: Boolean(config.isCtwa || trg.trigger_type === "CTWA_AD"),
      keywords,
      matchType,
      ignoreCase
    };

    if (triggerRef.isCtwa && !ctwa) {
      ctwa = triggerRef;
    }

    if (triggerRef.isCatchAll && !catchAll) {
      catchAll = triggerRef;
    }

    for (const kw of keywords) {
      const cleanKw = String(kw || "").trim();
      if (!cleanKw) continue;
      const kwKey = ignoreCase ? cleanKw.toLowerCase() : cleanKw;

      if (matchType === "EXACT") {
        if (!exactMap.has(kwKey)) {
          exactMap.set(kwKey, []);
        }
        exactMap.get(kwKey).push(triggerRef);
      } else if (matchType === "REGEX") {
        try {
          const regex = new RegExp(cleanKw, ignoreCase ? "i" : "");
          compiledRegexList.push({ regex, triggerRef, keyword: cleanKw });
        } catch (_) {}
      } else {
        // CONTAINS
        containsList.push({
          keywordLower: kwKey,
          rawKeyword: cleanKw,
          ignoreCase,
          triggerRef
        });
      }
    }
  }

  return {
    exactMap,
    containsList,
    compiledRegexList,
    catchAll,
    ctwa,
    totalTriggers: rawTriggers.length,
    compiledAt: Date.now()
  };
}

/**
 * Gets compiled trigger index from cache or loads via loaderFn
 */
function getCompiledTriggerIndex(tenantId = 1, phoneNumberId = null, loaderFn = null) {
  const lineKey = phoneNumberId ? String(phoneNumberId).trim() : "GLOBAL";
  const cacheKey = `trg_${Number(tenantId) || 1}_${lineKey}`;
  let index = triggerIndexCache.get(cacheKey);

  if (!index && typeof loaderFn === "function") {
    const rawTriggers = loaderFn();
    index = compileTriggerIndex(rawTriggers || []);
    triggerIndexCache.set(cacheKey, index);
  }

  return index;
}

/**
 * Invalidate flow cache when flow is updated, published, or deleted
 */
function invalidateFlow(flowId) {
  if (!flowId) return;
  for (const key of flowGraphCache.cache.keys()) {
    if (key.startsWith(`flow_${flowId}_`)) {
      flowGraphCache.delete(key);
    }
  }
}

/**
 * Invalidate trigger index cache when triggers change
 */
function invalidateTriggers(tenantId = null, phoneNumberId = null) {
  if (tenantId) {
    const prefix = `trg_${Number(tenantId) || 1}_`;
    for (const key of triggerIndexCache.cache.keys()) {
      if (key.startsWith(prefix)) {
        triggerIndexCache.delete(key);
      }
    }
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
  compileTriggerIndex,
  getCompiledTriggerIndex,
  invalidateFlow,
  invalidateTriggers,
  clearAll
};
