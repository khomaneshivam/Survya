import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MiniMap,
  Background,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Play,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Undo2,
  Redo2,
  Grid,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Plus,
  BarChart3
} from 'lucide-react';

import CustomFlowNode from './CustomFlowNode';
import CustomFlowEdge from './CustomFlowEdge';
import NodePaletteSidebar from './NodePaletteSidebar';
import { toReactFlowGraph, toSarvyaGraph, applyDagreLayout } from './flowGraphAdapter';
import { validateFlowGraph } from './flowGraphValidator';
import { getNodeDefinition } from './nodeDefinitions';

// Memoize node & edge types outside component to prevent re-mounting nodes on render
const nodeTypes = {
  customFlowNode: CustomFlowNode
};

const edgeTypes = {
  customFlowEdge: CustomFlowEdge
};

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

function FlowCanvasInner({
  nodes: sarvyaNodes = EMPTY_ARRAY,
  transitions: sarvyaTransitions = EMPTY_ARRAY,
  selectedNodeId,
  activeSimulatedNodeId,
  nodeMetrics = EMPTY_OBJECT,
  onSelectNode,
  onUpdateNodes,
  onUpdateTransitions
}) {
  const reactFlow = useReactFlow();
  const reactFlowWrapper = useRef(null);

  // React Flow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);

  // Canvas Settings & State
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showMiniMap] = useState(true);
  const [showAnalyticsOverlay, setShowAnalyticsOverlay] = useState(false);
  const [showValidationPopover, setShowValidationPopover] = useState(false);

  // Undo / Redo history stack (up to 30 snapshots)
  const historyRef = useRef({
    past: [],
    future: []
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isSyncingRef = useRef(false);

  // Compute validation report deterministically
  const validationReport = useMemo(() => {
    return validateFlowGraph(sarvyaNodes, sarvyaTransitions);
  }, [sarvyaNodes, sarvyaTransitions]);

  // Push snapshot to undo stack
  const recordHistory = useCallback((nodes, transitions) => {
    const past = historyRef.current.past;
    past.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      transitions: JSON.parse(JSON.stringify(transitions))
    });
    if (past.length > 30) past.shift();
    historyRef.current.future = [];
    setCanUndo(past.length > 0);
    setCanRedo(false);
  }, []);

  const handleUndo = useCallback(() => {
    if (historyRef.current.past.length === 0) return;
    const currentSnapshot = {
      nodes: JSON.parse(JSON.stringify(sarvyaNodes)),
      transitions: JSON.parse(JSON.stringify(sarvyaTransitions))
    };
    historyRef.current.future.push(currentSnapshot);

    const previousSnapshot = historyRef.current.past.pop();
    setCanUndo(historyRef.current.past.length > 0);
    setCanRedo(true);

    if (previousSnapshot) {
      isSyncingRef.current = true;
      onUpdateNodes(previousSnapshot.nodes);
      onUpdateTransitions(previousSnapshot.transitions);
      setTimeout(() => { isSyncingRef.current = false; }, 50);
    }
  }, [sarvyaNodes, sarvyaTransitions, onUpdateNodes, onUpdateTransitions]);

  const handleRedo = useCallback(() => {
    if (historyRef.current.future.length === 0) return;
    const currentSnapshot = {
      nodes: JSON.parse(JSON.stringify(sarvyaNodes)),
      transitions: JSON.parse(JSON.stringify(sarvyaTransitions))
    };
    historyRef.current.past.push(currentSnapshot);

    const nextSnapshot = historyRef.current.future.pop();
    setCanUndo(true);
    setCanRedo(historyRef.current.future.length > 0);

    if (nextSnapshot) {
      isSyncingRef.current = true;
      onUpdateNodes(nextSnapshot.nodes);
      onUpdateTransitions(nextSnapshot.transitions);
      setTimeout(() => { isSyncingRef.current = false; }, 50);
    }
  }, [sarvyaNodes, sarvyaTransitions, onUpdateNodes, onUpdateTransitions]);

  // Node Duplication
  const handleDuplicateNode = useCallback(
    (nodeId) => {
      const original = sarvyaNodes.find((n) => n.id === nodeId);
      if (!original) return;

      recordHistory(sarvyaNodes, sarvyaTransitions);

      const newId = `node_${original.type.toLowerCase()}_${Date.now().toString(36)}`;
      const duplicated = {
        ...JSON.parse(JSON.stringify(original)),
        id: newId,
        title: `${original.title || original.type} (Copy)`,
        position: {
          x: (original.position?.x || 200) + 40,
          y: (original.position?.y || 200) + 40
        }
      };

      onUpdateNodes([...sarvyaNodes, duplicated]);
      onSelectNode(newId);
    },
    [sarvyaNodes, sarvyaTransitions, onUpdateNodes, onSelectNode, recordHistory]
  );

  // Node Deletion
  const handleDeleteNode = useCallback(
    (nodeId) => {
      recordHistory(sarvyaNodes, sarvyaTransitions);

      const nextNodes = sarvyaNodes.filter((n) => n.id !== nodeId);
      const nextTransitions = sarvyaTransitions.filter(
        (t) => t.source !== nodeId && t.target !== nodeId
      );

      onUpdateNodes(nextNodes);
      onUpdateTransitions(nextTransitions);

      if (selectedNodeId === nodeId) {
        onSelectNode(nextNodes[0]?.id || null);
      }
    },
    [sarvyaNodes, sarvyaTransitions, selectedNodeId, onUpdateNodes, onUpdateTransitions, onSelectNode, recordHistory]
  );

  // Edge Deletion
  const handleDeleteEdge = useCallback(
    (edgeId) => {
      recordHistory(sarvyaNodes, sarvyaTransitions);

      const nextTransitions = sarvyaTransitions.filter((t) => t.id !== edgeId);
      onUpdateTransitions(nextTransitions);
    },
    [sarvyaNodes, sarvyaTransitions, onUpdateTransitions, recordHistory]
  );

  const handleDuplicateNodeRef = useRef(handleDuplicateNode);
  handleDuplicateNodeRef.current = handleDuplicateNode;
  const handleDeleteNodeRef = useRef(handleDeleteNode);
  handleDeleteNodeRef.current = handleDeleteNode;
  const handleDeleteEdgeRef = useRef(handleDeleteEdge);
  handleDeleteEdgeRef.current = handleDeleteEdge;
  const nodeMetricsRef = useRef(nodeMetrics);
  nodeMetricsRef.current = nodeMetrics;

  const metricsHash = useMemo(() => {
    if (!nodeMetrics || Object.keys(nodeMetrics).length === 0) return '';
    try {
      return JSON.stringify(nodeMetrics);
    } catch {
      return '';
    }
  }, [nodeMetrics]);

  // Synchronize Inbound: Convert SARVYA { nodes, transitions } to React Flow
  useEffect(() => {
    if (isSyncingRef.current) return;

    const { nodes: convertedNodes, edges: convertedEdges } = toReactFlowGraph(
      sarvyaNodes,
      sarvyaTransitions
    );

    const issues = validationReport?.allIssues || [];
    const metrics = nodeMetricsRef.current || EMPTY_OBJECT;

    // Attach callbacks, simulation highlights, and validation issues to node data
    const enrichedNodes = convertedNodes.map((n) => {
      const nodeIssues = issues.filter((i) => i.nodeId === n.id);
      return {
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          activeSimulatedNodeId,
          validationIssues: nodeIssues,
          showAnalyticsOverlay,
          metrics: metrics[n.id] || null,
          onDuplicateNode: (nodeId) => handleDuplicateNodeRef.current?.(nodeId),
          onDeleteNode: (nodeId) => handleDeleteNodeRef.current?.(nodeId)
        }
      };
    });

    const enrichedEdges = convertedEdges.map((e) => ({
      ...e,
      data: {
        ...e.data,
        onDeleteEdge: (edgeId) => handleDeleteEdgeRef.current?.(edgeId)
      }
    }));

    setRfNodes(enrichedNodes);
    setRfEdges(enrichedEdges);
  }, [sarvyaNodes, sarvyaTransitions, selectedNodeId, activeSimulatedNodeId, showAnalyticsOverlay, metricsHash, validationReport]);

  // Auto-pan / center on simulated active node
  useEffect(() => {
    if (activeSimulatedNodeId && reactFlow) {
      const activeNode = rfNodes.find((n) => n.id === activeSimulatedNodeId);
      if (activeNode && activeNode.position) {
        reactFlow.setCenter(
          activeNode.position.x + 135,
          activeNode.position.y + 80,
          { duration: 400, zoom: 1 }
        );
      }
    }
  }, [activeSimulatedNodeId, rfNodes, reactFlow]);

  // Keyboard shortcut listener: Undo/Redo & Delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is currently typing inside an input or textarea
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
      // Delete selected node or edge
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          const selectedNode = sarvyaNodes.find((n) => n.id === selectedNodeId);
          if (selectedNode && !['START', 'TRIGGER_WHATSAPP'].includes(selectedNode.type)) {
            e.preventDefault();
            handleDeleteNode(selectedNodeId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, sarvyaNodes, handleUndo, handleRedo, handleDeleteNode]);

  // Internal node creation helper
  const createAndAddNode = useCallback((type, position) => {
    recordHistory(sarvyaNodes, sarvyaTransitions);

    const nodeDef = getNodeDefinition(type);
    const newId = `node_${type.toLowerCase()}_${Date.now().toString(36)}`;

    const newNode = {
      id: newId,
      type,
      title: nodeDef.label,
      config: JSON.parse(JSON.stringify(nodeDef.defaultConfig || {})),
      position: {
        x: Math.round(position.x),
        y: Math.round(position.y)
      }
    };

    const nextNodes = [...sarvyaNodes, newNode];
    let nextTransitions = [...sarvyaTransitions];

    // If a non-terminal node was currently selected, auto-connect to this new node
    if (selectedNodeId) {
      const prevNode = sarvyaNodes.find((n) => n.id === selectedNodeId);
      if (prevNode && !['END', 'HUMAN_HANDOFF', 'HANDOFF'].includes(prevNode.type)) {
        const handles = getNodeDefinition(prevNode.type).getOutputHandles(prevNode);
        const sourceHandle = handles[0]?.id || 'default';
        nextTransitions.push({
          id: `t_${prevNode.id}_${newId}_${Date.now()}`,
          source: prevNode.id,
          target: newId,
          sourceHandle
        });
      }
    }

    onUpdateNodes(nextNodes);
    onUpdateTransitions(nextTransitions);
    onSelectNode(newId);
  }, [sarvyaNodes, sarvyaTransitions, selectedNodeId, onUpdateNodes, onUpdateTransitions, onSelectNode, recordHistory]);

  // Handle Drag & Drop from left palette onto Canvas
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const position = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      createAndAddNode(nodeType, position);
    },
    [reactFlow, createAndAddNode]
  );

  // Click-to-add from palette
  const handleAddNodeFromPalette = useCallback(
    (type) => {
      // Calculate position near viewport center or offset below selected node
      let pos = { x: 300, y: 150 };
      if (selectedNodeId) {
        const sel = sarvyaNodes.find((n) => n.id === selectedNodeId);
        if (sel && sel.position) {
          pos = { x: sel.position.x + 30, y: sel.position.y + 190 };
        }
      } else if (sarvyaNodes.length > 0) {
        const maxY = Math.max(...sarvyaNodes.map((n) => n.position?.y || 100));
        pos = { x: 300, y: maxY + 180 };
      }

      createAndAddNode(type, pos);
    },
    [selectedNodeId, sarvyaNodes, createAndAddNode]
  );

  // Node selection from React Flow click
  const onNodeClick = useCallback(
    (_event, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Node drag stop (persists position in SARVYA model)
  const onNodeDragStop = useCallback(
    (_event, _node, allNodes) => {
      const positionMap = new Map();
      allNodes.forEach((n) => {
        positionMap.set(n.id, {
          x: Math.round(n.position.x),
          y: Math.round(n.position.y)
        });
      });

      const updated = sarvyaNodes.map((n) => {
        const newPos = positionMap.get(n.id);
        return newPos ? { ...n, position: newPos } : n;
      });

      onUpdateNodes(updated);
    },
    [sarvyaNodes, onUpdateNodes]
  );

  const connectingNodeRef = useRef(null);

  // Edge Reconnection handler
  const onReconnect = useCallback(
    (oldEdge, newConnection) => {
      if (!newConnection.source || !newConnection.target) return;
      if (newConnection.source === newConnection.target) return;

      recordHistory(sarvyaNodes, sarvyaTransitions);

      const nextTransitions = sarvyaTransitions.map((t) => {
        if (t.id === oldEdge.id || (t.source === oldEdge.source && t.target === oldEdge.target && (t.sourceHandle || 'default') === (oldEdge.sourceHandle || 'default'))) {
          return {
            ...t,
            source: newConnection.source,
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle || 'default',
            targetHandle: newConnection.targetHandle || 'target'
          };
        }
        return t;
      });

      onUpdateTransitions(nextTransitions);
    },
    [sarvyaNodes, sarvyaTransitions, onUpdateTransitions, recordHistory]
  );

  // Edge Connection drawn by user
  const onConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      // Prevent self-loops
      if (connection.source === connection.target) return;

      recordHistory(sarvyaNodes, sarvyaTransitions);

      const srcHandle = connection.sourceHandle || 'default';

      let label = '';
      if (srcHandle === 'true') label = 'True';
      else if (srcHandle === 'false') label = 'False';
      else if (srcHandle === 'valid') label = 'Valid';
      else if (srcHandle === 'max_retries') label = 'Retry Max';
      else if (srcHandle === 'available') label = 'Available';
      else if (srcHandle === 'unavailable') label = 'Unavailable';
      else if (srcHandle === 'after_delay') label = 'After Delay';
      else if (srcHandle === 'early_reply' || srcHandle === 'replied_early') label = 'Early Reply';
      else if (srcHandle === 'success') label = 'Success';
      else if (srcHandle === 'failure' || srcHandle === 'error') label = 'Error';
      else {
        // Check if handle matches button option
        const srcNode = sarvyaNodes.find((n) => n.id === connection.source);
        const opt = (srcNode?.config?.options || []).find((o) => o.id === srcHandle);
        if (opt) label = opt.title || '';
      }

      const newTransition = {
        id: `t_${connection.source}_${connection.target}_${Date.now()}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: srcHandle,
        targetHandle: connection.targetHandle || 'target',
        label
      };

      // Replace existing edge on the same source and sourceHandle if it's a single-branch handle
      const singleBranchHandles = new Set([
        'default', 'true', 'false', 'valid', 'max_retries', 'available',
        'unavailable', 'after_delay', 'early_reply', 'replied_early', 'success', 'failure', 'error', 'delivered'
      ]);
      const isSingleBranch = singleBranchHandles.has(srcHandle);

      let nextTransitions;
      if (isSingleBranch) {
        nextTransitions = sarvyaTransitions.filter(
          (t) => !(t.source === connection.source && (t.sourceHandle || 'default') === srcHandle)
        );
        nextTransitions.push(newTransition);
      } else {
        nextTransitions = [...sarvyaTransitions, newTransition];
      }

      onUpdateTransitions(nextTransitions);
    },
    [sarvyaNodes, sarvyaTransitions, onUpdateTransitions, recordHistory]
  );

  const onConnectStart = useCallback((_, { nodeId, handleId, handleType }) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectingNodeRef.current) return;
      const { nodeId, handleId, handleType } = connectingNodeRef.current;
      connectingNodeRef.current = null;

      if (handleType !== 'source') return;

      const targetIsPane = event.target?.classList?.contains('react-flow__pane');
      if (targetIsPane && reactFlow) {
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY
        });

        recordHistory(sarvyaNodes, sarvyaTransitions);

        const newId = `node_send_message_${Date.now().toString(36)}`;
        const newNode = {
          id: newId,
          type: 'SEND_MESSAGE',
          title: 'Next Message',
          config: { text: 'Hello! How can we help you next?' },
          position: {
            x: Math.round(position.x),
            y: Math.round(position.y)
          }
        };

        const newTransition = {
          id: `t_${nodeId}_${newId}_${Date.now()}`,
          source: nodeId,
          target: newId,
          sourceHandle: handleId || 'default'
        };

        onUpdateNodes([...sarvyaNodes, newNode]);
        onUpdateTransitions([...sarvyaTransitions, newTransition]);
        onSelectNode(newId);
      }
    },
    [reactFlow, sarvyaNodes, sarvyaTransitions, onUpdateNodes, onUpdateTransitions, onSelectNode, recordHistory]
  );

  // Auto-Layout with Dagre
  const handleAutoLayout = useCallback(
    (direction = 'TB') => {
      recordHistory(sarvyaNodes, sarvyaTransitions);

      const { nodes: convertedNodes, edges: convertedEdges } = toReactFlowGraph(
        sarvyaNodes,
        sarvyaTransitions
      );

      const layouted = applyDagreLayout(convertedNodes, convertedEdges, direction);
      const { nodes: updatedSarvyaNodes } = toSarvyaGraph(layouted.nodes, layouted.edges);

      onUpdateNodes(updatedSarvyaNodes);

      setTimeout(() => {
        reactFlow.fitView({ padding: 0.2, duration: 400 });
      }, 50);
    },
    [sarvyaNodes, sarvyaTransitions, onUpdateNodes, reactFlow, recordHistory]
  );

  // Focus node from validation popover
  const handleFocusIssueNode = (nodeId) => {
    if (!nodeId) return;
    onSelectNode(nodeId);
    setShowValidationPopover(false);

    const targetNode = rfNodes.find((n) => n.id === nodeId);
    if (targetNode && targetNode.position && reactFlow) {
      reactFlow.setCenter(
        targetNode.position.x + 135,
        targetNode.position.y + 80,
        { duration: 400, zoom: 1.1 }
      );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Draggable Step Palette (Collapsible left sidebar) */}
      <NodePaletteSidebar onAddNode={handleAddNodeFromPalette} />

      {/* Main Canvas Viewport */}
      <div
        ref={reactFlowWrapper}
        style={{
          flex: 1,
          height: '100%',
          position: 'relative',
          background: '#F8FAFC'
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          edgesReconnectable={true}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          snapToGrid={snapToGrid}
          snapGrid={[16, 16]}
          minZoom={0.3}
          maxZoom={1.8}
          defaultViewport={{ x: 50, y: 50, zoom: 0.9 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant="dots" gap={16} size={1.5} color="#CBD5E1" />

          {/* MiniMap */}
          {showMiniMap && (
            <MiniMap
              nodeStrokeColor="#94A3B8"
              nodeColor={(n) => {
                const def = getNodeDefinition(n.data?.type);
                return def.color || '#CBD5E1';
              }}
              nodeBorderRadius={4}
              maskColor="rgba(241, 245, 249, 0.75)"
              style={{
                width: 140,
                height: 95,
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
              }}
            />
          )}

          {/* Top Canvas Toolbar */}
          <Panel position="top-right">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#FFFFFF',
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid #E5E5E8',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              {/* Auto Layout Button */}
              <button
                type="button"
                onClick={() => handleAutoLayout('TB')}
                title="Auto-organize graph (Dagre hierarchical layout)"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#1E293B',
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={13} color="#2F5219" />
                <span>Auto-Layout</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#E5E5E8', margin: '0 2px' }} />

              {/* Undo / Redo */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: canUndo ? 'pointer' : 'not-allowed',
                  opacity: canUndo ? 1 : 0.45,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Undo2 size={13} />
              </button>

              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: canRedo ? 'pointer' : 'not-allowed',
                  opacity: canRedo ? 1 : 0.45,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Redo2 size={13} />
              </button>

              <div style={{ width: '1px', height: '18px', background: '#E5E5E8', margin: '0 2px' }} />

              {/* Analytics Overlay Toggle */}
              <button
                type="button"
                onClick={() => setShowAnalyticsOverlay(!showAnalyticsOverlay)}
                title="Toggle Live Visual Analytics Overlay"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 9px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: showAnalyticsOverlay ? '#DCFCE7' : '#FFFFFF',
                  color: showAnalyticsOverlay ? '#166534' : '#64748B',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <BarChart3 size={13} color={showAnalyticsOverlay ? '#166534' : '#64748B'} />
                <span>Analytics</span>
              </button>

              <div style={{ width: '1px', height: '18px', background: '#E5E5E8', margin: '0 2px' }} />

              {/* Snap to Grid */}
              <button
                type="button"
                onClick={() => setSnapToGrid(!snapToGrid)}
                title="Snap to 16x16 Grid"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: snapToGrid ? '#E8F5E9' : '#FFFFFF',
                  color: snapToGrid ? '#2F5219' : '#64748B',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Grid size={13} />
              </button>

              {/* Fit View */}
              <button
                type="button"
                onClick={() => reactFlow.fitView({ padding: 0.2, duration: 300 })}
                title="Fit View"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Maximize2 size={13} />
              </button>

              {/* Zoom Controls */}
              <button
                type="button"
                onClick={() => reactFlow.zoomIn({ duration: 200 })}
                title="Zoom In"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ZoomIn size={13} />
              </button>

              <button
                type="button"
                onClick={() => reactFlow.zoomOut({ duration: 200 })}
                title="Zoom Out"
                style={{
                  padding: '5px 7px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <ZoomOut size={13} />
              </button>
            </div>
          </Panel>

          {/* Validation Issues Status Pill */}
          <Panel position="bottom-left">
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowValidationPopover(!showValidationPopover)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: '#FFFFFF',
                  border: `1.5px solid ${validationReport.errors.length > 0 ? '#EF4444' : validationReport.warnings.length > 0 ? '#F59E0B' : '#16A34A'}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  cursor: 'pointer',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: validationReport.errors.length > 0 ? '#DC2626' : validationReport.warnings.length > 0 ? '#D97706' : '#16A34A'
                }}
              >
                {validationReport.errors.length > 0 ? (
                  <AlertCircle size={14} />
                ) : validationReport.warnings.length > 0 ? (
                  <AlertTriangle size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>
                  {validationReport.errors.length > 0
                    ? `${validationReport.errors.length} Error${validationReport.errors.length > 1 ? 's' : ''}`
                    : validationReport.warnings.length > 0
                    ? `${validationReport.warnings.length} Warning${validationReport.warnings.length > 1 ? 's' : ''}`
                    : 'Valid Graph'}
                </span>
              </button>

              {/* Validation Issues Popover */}
              {showValidationPopover && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '36px',
                    left: '0',
                    width: '320px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    zIndex: 100
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Validation Diagnostics</span>
                    <span style={{ fontSize: '0.70rem', color: '#64748B' }}>
                      {validationReport.allIssues.length} total
                    </span>
                  </div>

                  {validationReport.allIssues.length === 0 ? (
                    <div style={{ fontSize: '0.74rem', color: '#16A34A', padding: '10px 0' }}>
                      ✓ Graph is complete and ready for execution simulation.
                    </div>
                  ) : (
                    validationReport.allIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleFocusIssueNode(issue.nodeId)}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: issue.severity === 'error' ? '#FEF2F2' : '#FFFBEB',
                          border: `1px solid ${issue.severity === 'error' ? '#FCA5A5' : '#FDE68A'}`,
                          fontSize: '0.72rem',
                          cursor: issue.nodeId ? 'pointer' : 'default'
                        }}
                      >
                        {issue.severity === 'error' ? (
                          <AlertCircle size={13} color="#EF4444" style={{ marginTop: '2px', flexShrink: 0 }} />
                        ) : (
                          <AlertTriangle size={13} color="#F59E0B" style={{ marginTop: '2px', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <span style={{ color: issue.severity === 'error' ? '#991B1B' : '#92400E' }}>
                            {issue.message}
                          </span>
                          {issue.nodeId && (
                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px', textDecoration: 'underline' }}>
                              Focus step #{issue.nodeId}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </Panel>
        </ReactFlow>

        {/* Zero-Crash Empty State */}
        {sarvyaNodes.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#FFFFFF',
              border: '1.5px dashed #CBD5E1',
              borderRadius: '12px',
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: '380px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
              zIndex: 20
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: '#DCFCE7',
                color: '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}
            >
              <Play size={20} />
            </div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: '0 0 6px 0', color: '#1C1C1E' }}>
              Your Journey Canvas is Ready
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#67676B', margin: '0 0 16px 0', lineHeight: 1.4 }}>
              Drag any step from the left palette onto this canvas, or click below to start with a WhatsApp trigger.
            </p>
            <button
              type="button"
              onClick={() => handleAddNodeFromPalette('TRIGGER_WHATSAPP')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                background: '#2F5219',
                color: '#FFFFFF',
                fontSize: '0.80rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(47,82,25,0.2)'
              }}
            >
              <Plus size={14} />
              <span>Add WhatsApp Trigger</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FlowCanvas({
  nodes = EMPTY_ARRAY,
  transitions = EMPTY_ARRAY,
  nodeMetrics = EMPTY_OBJECT,
  ...props
}) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner
        nodes={nodes}
        transitions={transitions}
        nodeMetrics={nodeMetrics}
        {...props}
      />
    </ReactFlowProvider>
  );
}
