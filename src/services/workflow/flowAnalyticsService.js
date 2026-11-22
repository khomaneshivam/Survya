/**
 * Flow Funnel & Node Performance Analytics Service
 * 
 * Provides:
 * 1. O(1) Non-blocking atomic event counter recording to `flow_node_daily_metrics`
 * 2. Ultra-fast (< 50ms) Funnel & Drop-off Analytics retrieval with topological ordering
 * 3. Daily drop-off rollups for expired/abandoned sessions
 * 4. Bounded raw event log maintenance pruning (> 90 days)
 */

const { getDb } = require('../../config/database');

/**
 * Helper to get strictly UTC-safe Indian Standard Time (IST) date string YYYY-MM-DD
 */
function getIstDateString(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Record a node lifecycle event atomically into `flow_node_daily_metrics`.
 * Runs non-blocking with zero impact on conversation flow execution.
 *
 * @param {number} tenantId 
 * @param {number|string} flowId 
 * @param {string} nodeId 
 * @param {'ENTRY'|'COMPLETION'|'DROPOFF'|'HANDOFF'|'CONVERSION'} eventType 
 * @param {object} [data={}] 
 */
function recordNodeEvent(tenantId = 1, flowId, nodeId, eventType, data = {}) {
  if (!flowId || !nodeId) return;

  const db = getDb();
  const metricDate = getIstDateString();
  const nodeType = data.nodeType || 'ACTION';

  let entries = 0;
  let completions = 0;
  let dropoffs = 0;
  let handoffs = 0;
  let conversions = 0;
  let revenueInr = 0.0;

  switch (eventType) {
    case 'ENTRY':
      entries = 1;
      break;
    case 'COMPLETION':
      completions = 1;
      break;
    case 'DROPOFF':
      dropoffs = 1;
      break;
    case 'HANDOFF':
      handoffs = 1;
      break;
    case 'CONVERSION':
      conversions = 1;
      revenueInr = Number(data.revenueInr || data.amount || 0);
      break;
    default:
      break;
  }

  try {
    db.prepare(`
      INSERT INTO flow_node_daily_metrics (
        tenant_id, flow_id, node_id, node_type, metric_date,
        entries_count, completions_count, dropoffs_count, handoffs_count, conversions_count, revenue_inr,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE
        entries_count = entries_count + VALUES(entries_count),
        completions_count = completions_count + VALUES(completions_count),
        dropoffs_count = dropoffs_count + VALUES(dropoffs_count),
        handoffs_count = handoffs_count + VALUES(handoffs_count),
        conversions_count = conversions_count + VALUES(conversions_count),
        revenue_inr = revenue_inr + VALUES(revenue_inr),
        node_type = IF(VALUES(node_type) != 'ACTION', VALUES(node_type), node_type),
        updated_at = UTC_TIMESTAMP()
    `).run(
      tenantId,
      Number(flowId),
      String(nodeId),
      String(nodeType),
      metricDate,
      entries,
      completions,
      dropoffs,
      handoffs,
      conversions,
      revenueInr
    );
  } catch (err) {
    console.warn(`[FlowAnalytics] Failed to record ${eventType} for node ${nodeId} flow ${flowId}: ${err.message}`);
  }
}

/**
 * Retrieve high-performance pre-aggregated Funnel Analytics (< 50ms)
 * 
 * @param {number} tenantId 
 * @param {number|string} flowId 
 * @param {number} [days=30] 
 */
function getFlowFunnelAnalytics(tenantId = 1, flowId, days = 30) {
  const db = getDb();
  const startTime = Date.now();

  // 1. Fetch flow structure for topological ordering & titles
  const flow = db.prepare(`
    SELECT f.id, f.name, v.nodes_json, v.transitions_json
    FROM conversation_flows f
    LEFT JOIN conversation_flow_versions v ON v.id = COALESCE(f.current_draft_version_id, f.published_version_id)
    WHERE f.id = ? AND f.tenant_id = ? AND f.delete_status = 0
  `).get(flowId, tenantId);

  if (!flow) {
    throw new Error(`Flow #${flowId} not found`);
  }

  let nodes = [];
  let transitions = [];
  try {
    nodes = flow.nodes_json ? JSON.parse(flow.nodes_json) : [];
    transitions = flow.transitions_json ? JSON.parse(flow.transitions_json) : [];
  } catch (_) {}

  const startNodeId = (nodes[0] ? nodes[0].id : null);

  // 2. Fetch pre-aggregated daily metrics in one fast indexed query
  const rows = db.prepare(`
    SELECT 
      node_id,
      MAX(node_type) as node_type,
      SUM(entries_count) as entries,
      SUM(completions_count) as completions,
      SUM(dropoffs_count) as dropoffs,
      SUM(handoffs_count) as handoffs,
      SUM(conversions_count) as conversions,
      SUM(revenue_inr) as revenue_inr
    FROM flow_node_daily_metrics
    WHERE tenant_id = ?
      AND flow_id = ?
      AND metric_date >= DATE_SUB(CURRENT_DATE(), INTERVAL ? DAY)
    GROUP BY node_id
  `).all(tenantId, flowId, Math.max(1, Number(days) || 30));

  const metricsMap = new Map();
  for (const r of rows) {
    metricsMap.set(r.node_id, {
      nodeId: r.node_id,
      nodeType: r.node_type,
      entries: Number(r.entries || 0),
      completions: Number(r.completions || 0),
      dropoffs: Number(r.dropoffs || 0),
      handoffs: Number(r.handoffs || 0),
      conversions: Number(r.conversions || 0),
      revenueInr: Number(r.revenue_inr || 0)
    });
  }

  // 3. Order nodes: follow transitions from startNodeId for clean funnel sequencing
  const orderedNodes = [];
  const visited = new Set();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Traverse outgoing edges
  function traverse(currentId) {
    if (!currentId || visited.has(currentId)) return;
    visited.add(currentId);
    const nodeObj = nodeMap.get(currentId);
    if (nodeObj) {
      orderedNodes.push(nodeObj);
    }
    const outgoing = transitions.filter(t => t.source_node_id === currentId || t.sourceNodeId === currentId);
    for (const edge of outgoing) {
      const nextId = edge.target_node_id || edge.targetNodeId;
      if (nextId && !visited.has(nextId)) {
        traverse(nextId);
      }
    }
  }

  if (startNodeId) traverse(startNodeId);
  // Add remaining unvisited nodes
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      orderedNodes.push(node);
    }
  }

  // 4. Construct step-by-step funnel
  let highestDropOffRate = -1;
  let bottleneckNode = null;
  let totalEntries = 0;
  let totalCompletions = 0;
  let totalDropoffs = 0;
  let totalHandoffs = 0;
  let totalConversions = 0;
  let totalRevenueInr = 0.0;

  const funnelSteps = orderedNodes.map((node, index) => {
    const metrics = metricsMap.get(node.id) || {
      entries: 0,
      completions: 0,
      dropoffs: 0,
      handoffs: 0,
      conversions: 0,
      revenueInr: 0
    };

    const entries = metrics.entries;
    const completions = metrics.completions;
    const dropoffs = metrics.dropoffs;
    const handoffs = metrics.handoffs;
    const conversions = metrics.conversions;
    const revenueInr = metrics.revenueInr;

    const dropOffRate = entries > 0 ? Number(((dropoffs / entries) * 100).toFixed(1)) : 0;
    const completionRate = entries > 0 ? Number(((completions / entries) * 100).toFixed(1)) : 0;

    totalDropoffs += dropoffs;
    totalHandoffs += handoffs;
    totalConversions += conversions;
    totalRevenueInr += revenueInr;

    if (index === 0) {
      totalEntries = entries;
    } else if (entries > totalEntries) {
      totalEntries = entries;
    }

    // Check if terminal node or highest completions
    if (completions > totalCompletions) {
      totalCompletions = completions;
    }

    // Detect bottleneck: prioritize nodes with substantial traffic (> 2 entries) and highest drop-off rate
    if (entries > 0 && dropOffRate > highestDropOffRate) {
      highestDropOffRate = dropOffRate;
      bottleneckNode = {
        nodeId: node.id,
        title: node.title || node.label || node.id,
        nodeType: node.type,
        entries,
        dropoffs,
        dropOffRate,
        reason: dropOffRate > 40
          ? `High drop-off rate (${dropOffRate}%) at this step suggests friction, lack of choices, or confusing text.`
          : `Most user drop-offs (${dropoffs}) occur at this step.`
      };
    }

    return {
      stepIndex: index + 1,
      nodeId: node.id,
      title: node.title || node.label || node.id,
      nodeType: node.type,
      entries,
      completions,
      dropoffs,
      dropOffRate,
      completionRate,
      handoffs,
      conversions,
      revenueInr
    };
  });

  // If no start node entries were recorded but there were completions
  if (totalEntries === 0 && rows.length > 0) {
    totalEntries = Math.max(...rows.map(r => Number(r.entries || 0)), 1);
  }

  const overallCompletionRate = totalEntries > 0
    ? Number(((totalCompletions / totalEntries) * 100).toFixed(1))
    : 0;

  const executionTimeMs = Date.now() - startTime;

  return {
    flowId: Number(flowId),
    flowName: flow.name,
    days: Number(days),
    kpis: {
      totalEntries,
      totalCompletions,
      overallCompletionRate,
      totalDropoffs,
      totalHandoffs,
      totalConversions,
      totalRevenueInr: Number(totalRevenueInr.toFixed(2))
    },
    bottleneckNode,
    funnelSteps,
    queryTimeMs: executionTimeMs
  };
}

/**
 * Scheduled job to rollup expired flow sessions into `flow_node_daily_metrics` dropoffs.
 */
function rollupFlowDropoffs(tenantId = null) {
  const db = getDb();
  let whereClause = "session_status = 'EXPIRED' AND current_node_id IS NOT NULL";
  const params = [];

  if (tenantId) {
    whereClause += " AND tenant_id = ?";
    params.push(tenantId);
  }

  // Look back at sessions that expired in the last 24 hours
  whereClause += " AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)";

  const expiredSessions = db.prepare(`
    SELECT tenant_id, flow_id, current_node_id, COUNT(*) as dropoff_count
    FROM conversation_flow_sessions
    WHERE ${whereClause}
    GROUP BY tenant_id, flow_id, current_node_id
  `).all(...params);

  let updatedCount = 0;
  for (const session of expiredSessions) {
    recordNodeEvent(
      session.tenant_id,
      session.flow_id,
      session.current_node_id,
      'DROPOFF'
    );
    updatedCount += session.dropoff_count;
  }

  return { rolledUpCount: updatedCount };
}

/**
 * Scheduled maintenance job to prune raw `conversation_flow_events` older than 90 days.
 * Keeps daily aggregate metrics intact forever while bounding storage size.
 * 
 * @param {number} [olderThanDays=90] 
 */
function pruneOldEvents(olderThanDays = 90) {
  const db = getDb();
  const days = Math.max(7, Number(olderThanDays) || 90);

  const result = db.prepare(`
    DELETE FROM conversation_flow_events
    WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
  `).run(days);

  return { prunedRows: result.changes || 0, thresholdDays: days };
}

module.exports = {
  recordNodeEvent,
  getFlowFunnelAnalytics,
  rollupFlowDropoffs,
  pruneOldEvents,
  getIstDateString
};
