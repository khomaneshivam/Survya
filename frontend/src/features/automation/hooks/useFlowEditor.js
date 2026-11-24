import { useState, useEffect, useCallback, useRef } from 'react';
import { automationApi } from '../api/automationApi';

export function useFlowEditor(flowId) {
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState(null);

  // Undo / Redo history
  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const pushState = useCallback((newNodes, newEdges) => {
    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push({ nodes: newNodes, edges: newEdges });
    // Cap history at 20 steps
    if (nextHistory.length > 20) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setIsDirty(true);
  }, []);

  const loadFlow = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await automationApi.getFlow(flowId);
      if (res && res.success) {
        const loadedFlow = res.flow;
        setFlow(loadedFlow);

        // Normalize graph structure
        let graphNodes = [];
        let graphEdges = [];

        if (loadedFlow.draft_graph_json) {
          const draft = typeof loadedFlow.draft_graph_json === 'string'
            ? JSON.parse(loadedFlow.draft_graph_json)
            : loadedFlow.draft_graph_json;
          graphNodes = draft.nodes || [];
          graphEdges = draft.edges || [];
        } else if (loadedFlow.graph_json) {
          const published = typeof loadedFlow.graph_json === 'string'
            ? JSON.parse(loadedFlow.graph_json)
            : loadedFlow.graph_json;
          graphNodes = published.nodes || [];
          graphEdges = published.edges || [];
        }

        setNodes(graphNodes);
        setEdges(graphEdges);
        historyRef.current = [{ nodes: graphNodes, edges: graphEdges }];
        historyIndexRef.current = 0;
        setIsDirty(false);
      } else {
        setError(res?.error || 'Failed to load flow data');
      }
    } catch (err) {
      setError(err.message || 'Error loading flow graph');
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    loadFlow();
  }, [loadFlow]);

  const updateNodeData = useCallback((nodeId, dataUpdate) => {
    setNodes(prev => {
      const updated = prev.map(node => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...dataUpdate,
              config: {
                ...(node.data?.config || {}),
                ...(dataUpdate.config || {})
              }
            }
          };
        }
        return node;
      });
      pushState(updated, edges);
      return updated;
    });
  }, [edges, pushState]);

  const addNode = useCallback((type, position, initialConfig = {}) => {
    const id = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newNode = {
      id,
      type,
      position: position || { x: 250, y: (nodes.length + 1) * 120 },
      data: {
        label: initialConfig.label || type,
        type,
        config: initialConfig
      }
    };
    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    pushState(nextNodes, edges);
    setSelectedNodeId(id);
    return newNode;
  }, [nodes, edges, pushState]);

  const deleteNode = useCallback((nodeId) => {
    const nextNodes = nodes.filter(n => n.id !== nodeId);
    const nextEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    setNodes(nextNodes);
    setEdges(nextEdges);
    pushState(nextNodes, nextEdges);
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [nodes, edges, selectedNodeId, pushState]);

  const saveDraft = useCallback(async () => {
    if (!flowId) return;
    setSaving(true);
    try {
      const payload = {
        name: flow?.name,
        trigger_keyword: flow?.trigger_keyword,
        trigger_type: flow?.trigger_type,
        nodes,
        edges
      };
      const res = await automationApi.saveFlowDraft(flowId, payload);
      if (res && res.success) {
        setIsDirty(false);
        return { success: true };
      }
      return { success: false, error: res?.error || 'Save failed' };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [flowId, flow, nodes, edges]);

  const publish = useCallback(async () => {
    if (!flowId) return;
    setPublishing(true);
    try {
      // First save draft if dirty
      if (isDirty) {
        await saveDraft();
      }
      const res = await automationApi.publishFlow(flowId);
      if (res && res.success) {
        setIsDirty(false);
        await loadFlow();
        return { success: true };
      }
      return { success: false, error: res?.error || 'Publish failed' };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      setPublishing(false);
    }
  }, [flowId, isDirty, saveDraft, loadFlow]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const prev = historyRef.current[historyIndexRef.current];
      setNodes(prev.nodes);
      setEdges(prev.edges);
      setIsDirty(true);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      const next = historyRef.current[historyIndexRef.current];
      setNodes(next.nodes);
      setEdges(next.edges);
      setIsDirty(true);
    }
  }, []);

  return {
    flow,
    nodes,
    edges,
    setNodes,
    setEdges,
    selectedNodeId,
    setSelectedNodeId,
    selectedNode: nodes.find(n => n.id === selectedNodeId) || null,
    updateNodeData,
    addNode,
    deleteNode,
    isDirty,
    loading,
    saving,
    publishing,
    error,
    saveDraft,
    publish,
    undo,
    redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    refetch: loadFlow
  };
}

