import dagre from 'dagre';
import { getNodeDefinition } from './nodeDefinitions.js';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;

/**
 * Applies Dagre hierarchical layout to React Flow nodes and edges.
 * Arranges nodes without overlaps, oriented either Top-to-Bottom ('TB') or Left-to-Right ('LR').
 */
export function applyDagreLayout(nodes = [], edges = [], direction = 'TB') {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { nodes: [], edges: edges || [] };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 90,
    marginx: 40,
    marginy: 40
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: node.measured?.width || NODE_WIDTH,
      height: node.measured?.height || NODE_HEIGHT
    });
  });

  (edges || []).forEach((edge) => {
    if (edge.source && edge.target) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPos = dagreGraph.node(node.id);
    if (!nodeWithPos) return node;

    const x = Math.round(nodeWithPos.x - (node.measured?.width || NODE_WIDTH) / 2);
    const y = Math.round(nodeWithPos.y - (node.measured?.height || NODE_HEIGHT) / 2);

    return {
      ...node,
      position: { x: Math.max(20, x), y: Math.max(20, y) }
    };
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Checks if nodes require automatic layout calculation.
 * True if any node lacks position, or all nodes overlap on the same coordinate.
 */
function needsAutoLayout(nodes = []) {
  if (nodes.length <= 1) return false;

  let missingPositions = 0;
  const coordsSet = new Set();

  for (const n of nodes) {
    if (!n.position || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') {
      missingPositions++;
    } else {
      coordsSet.add(`${n.position.x},${n.position.y}`);
    }
  }

  // If more than 20% lack positions, or all existing nodes have the identical coordinate
  return missingPositions > 0 || (coordsSet.size === 1 && nodes.length > 1);
}

/**
 * Inbound Converter: Bridges SARVYA's persisted { nodes, transitions } to React Flow's { nodes, edges }
 * Preserves 100% of node properties, configurations, and handles.
 */
export function toReactFlowGraph(sarvyaNodes = [], sarvyaTransitions = [], options = {}) {
  const safeNodes = Array.isArray(sarvyaNodes) ? sarvyaNodes : [];
  const safeTransitions = Array.isArray(sarvyaTransitions) ? sarvyaTransitions : [];

  const nodeDefMap = new Map();
  safeNodes.forEach((node) => {
    nodeDefMap.set(String(node.id), getNodeDefinition(node.type));
  });

  let rfNodes = safeNodes.map((node, index) => {
    const nodeDef = nodeDefMap.get(String(node.id)) || getNodeDefinition(node.type);
    const rawClone = JSON.parse(JSON.stringify(node));

    const pos = (node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number')
      ? { x: node.position.x, y: node.position.y }
      : { x: 100, y: 100 + index * 150 };

    return {
      id: String(node.id),
      type: 'customFlowNode',
      position: pos,
      data: {
        ...node,
        id: String(node.id),
        type: node.type,
        resolvedType: nodeDef.canonicalType || nodeDef.type,
        title: node.title || nodeDef.label || node.type,
        config: node.config || {},
        category: node.category || nodeDef.category || 'MESSAGING',
        raw: rawClone
      }
    };
  });

  const rfEdges = safeTransitions.map((t, idx) => {
    const edgeId = t.id || `e_${t.source}_${t.target}_${idx}`;
    let sourceHandle = t.sourceHandle || (t.optionId ? String(t.optionId) : null) || (t.condition !== undefined ? String(t.condition) : null);

    // If sourceHandle is missing or 'default', check if the source node has output handles defined
    const srcDef = nodeDefMap.get(String(t.source));
    if ((!sourceHandle || sourceHandle === 'default') && srcDef?.getOutputHandles) {
      const srcNode = safeNodes.find((n) => String(n.id) === String(t.source));
      const handles = srcDef.getOutputHandles(srcNode);
      if (handles && handles.length === 1) {
        sourceHandle = handles[0].id;
      }
    }
    if (!sourceHandle) sourceHandle = 'default';

    let label = t.label || t.conditionLabel || '';
    if (!label) {
      if (sourceHandle === 'true') label = 'True';
      else if (sourceHandle === 'false') label = 'False';
      else if (sourceHandle === 'valid') label = 'Valid';
      else if (sourceHandle === 'max_retries') label = 'Retry Max';
      else if (sourceHandle === 'available') label = 'Available';
      else if (sourceHandle === 'unavailable') label = 'Unavailable';
      else if (sourceHandle === 'after_delay') label = 'Delay Expired';
      else if (sourceHandle === 'early_reply' || sourceHandle === 'replied_early') label = 'Replied Early';
      else if (sourceHandle === 'success') label = 'Success';
      else if (sourceHandle === 'failure' || sourceHandle === 'error') label = 'Error';
    }

    return {
      id: edgeId,
      source: String(t.source),
      target: String(t.target),
      sourceHandle,
      targetHandle: t.targetHandle || 'target',
      type: 'customFlowEdge',
      label,
      animated: Boolean(t.animated),
      data: {
        ...t,
        condition: t.condition,
        optionId: t.optionId,
        sourceHandle
      }
    };
  });

  // Automatically apply clean Dagre layout if nodes lack coordinates or overlap
  if (options.forceLayout || needsAutoLayout(safeNodes)) {
    const layoutResult = applyDagreLayout(rfNodes, rfEdges, options.direction || 'TB');
    rfNodes = layoutResult.nodes;
  }

  return { nodes: rfNodes, edges: rfEdges };
}

/**
 * Outbound Converter: Serializes React Flow nodes & edges back to SARVYA's { nodes, transitions }
 * Preserves user-assigned positions, handle bindings, variables, and conditions while stripping internal UI props.
 */
export function toSarvyaGraph(rfNodes = [], rfEdges = []) {
  const safeRfNodes = Array.isArray(rfNodes) ? rfNodes : [];
  const safeRfEdges = Array.isArray(rfEdges) ? rfEdges : [];

  const STANDARD_HANDLES = new Set([
    'default',
    'true',
    'false',
    'valid',
    'max_retries',
    'invalid_fallback',
    'available',
    'unavailable',
    'success',
    'failure',
    'error',
    'after_delay',
    'early_reply',
    'replied_early',
    'delivered',
    'submitted',
    'fallback'
  ]);

  const sarvyaNodes = safeRfNodes.map((rfNode) => {
    const raw = rfNode.data?.raw || {};
    const merged = { ...raw, ...(rfNode.data || {}) };

    // Clean up internal React Flow and Studio UI properties
    const keysToRemove = [
      'raw',
      'selected',
      'dragging',
      'resolvedType',
      'validationIssues',
      'activeSimulatedNodeId',
      'showAnalyticsOverlay',
      'metrics',
      'onDuplicateNode',
      'onDeleteNode'
    ];
    keysToRemove.forEach((k) => delete merged[k]);

    return {
      ...merged,
      id: String(rfNode.id),
      type: rfNode.data?.type || raw.type || 'SEND_MESSAGE',
      title: rfNode.data?.title || raw.title || '',
      config: rfNode.data?.config || raw.config || {},
      position: {
        x: Math.round(rfNode.position?.x ?? 0),
        y: Math.round(rfNode.position?.y ?? 0)
      }
    };
  });

  const sarvyaTransitions = safeRfEdges.map((rfEdge, idx) => {
    const rawData = rfEdge.data || {};
    const transition = {
      id: rfEdge.id || `t_${rfEdge.source}_${rfEdge.target}_${idx}`,
      source: String(rfEdge.source),
      target: String(rfEdge.target)
    };

    if (rfEdge.sourceHandle && rfEdge.sourceHandle !== 'default') {
      transition.sourceHandle = rfEdge.sourceHandle;
    } else if (rawData.sourceHandle && rawData.sourceHandle !== 'default') {
      transition.sourceHandle = rawData.sourceHandle;
    }

    if (rfEdge.targetHandle && rfEdge.targetHandle !== 'target') {
      transition.targetHandle = rfEdge.targetHandle;
    }

    if (rfEdge.label) {
      transition.label = rfEdge.label;
    }

    if (rawData.condition !== undefined) {
      transition.condition = rawData.condition;
    } else if (rfEdge.sourceHandle === 'true') {
      transition.condition = true;
    } else if (rfEdge.sourceHandle === 'false') {
      transition.condition = false;
    }

    if (rawData.optionId) {
      transition.optionId = rawData.optionId;
    } else if (rfEdge.sourceHandle && !STANDARD_HANDLES.has(rfEdge.sourceHandle)) {
      transition.optionId = rfEdge.sourceHandle;
    }

    return transition;
  });

  return { nodes: sarvyaNodes, transitions: sarvyaTransitions };
}
