import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Play, 
  Undo2, 
  Redo2, 
  Sparkles, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  Settings,
  ChevronRight
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui/Primitives';
import FlowCanvas from '../../../components/flow-studio/FlowCanvas';
import NodeInspectorDrawer from '../../../components/flow-studio/NodeInspectorDrawer';
import { SimulationPanel } from '../components/SimulationPanel';
import { automationApi } from '../api/automationApi';

export function WorkflowBuilderPage({ flowId, onBack, onSaved }) {
  const [flow, setFlow] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [transitions, setTransitions] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [flowName, setFlowName] = useState('');
  const [triggerKeyword, setTriggerKeyword] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function loadFlowData() {
      if (!flowId) return;
      setLoading(true);
      try {
        const res = await automationApi.getFlow(flowId);
        if (res && res.success) {
          const loadedFlow = res.flow;
          setFlow(loadedFlow);
          setFlowName(loadedFlow.name || 'Untitled Automation');
          setTriggerKeyword(loadedFlow.trigger_keyword || '');

          // Parse graph (support canonical draftVersion/publishedVersion nodes + legacy draft_graph_json)
          let graphNodes = [];
          let graphTransitions = [];

          const ver = (res.draftVersion?.nodes || res.draftVersion?.nodes_json)
            ? res.draftVersion
            : (res.publishedVersion || null);
          if (ver) {
            graphNodes = ver.nodes || (ver.nodes_json ? JSON.parse(ver.nodes_json) : []);
            graphTransitions = ver.transitions || (ver.transitions_json ? JSON.parse(ver.transitions_json) : []);
          } else {
            const graphData = loadedFlow.draft_graph_json || loadedFlow.graph_json;
            if (graphData) {
              const parsed = typeof graphData === 'string' ? JSON.parse(graphData) : graphData;
              graphNodes = parsed.nodes || [];
              graphTransitions = parsed.transitions || parsed.edges || [];
            }
          }

          setNodes(Array.isArray(graphNodes) ? graphNodes : []);
          setTransitions(Array.isArray(graphTransitions) ? graphTransitions : []);
        } else {
          setErrorMsg(res?.error || 'Failed to load flow data');
        }
      } catch (err) {
        setErrorMsg(err.message || 'Error loading flow');
      } finally {
        setLoading(false);
      }
    }
    loadFlowData();
  }, [flowId]);

  const handleSaveDraft = async () => {
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const payload = {
        name: flowName,
        trigger_keyword: triggerKeyword,
        nodes,
        transitions
      };
      const res = await automationApi.saveFlowDraft(flowId, payload);
      if (res && res.success) {
        setStatusMsg('Draft saved successfully.');
        if (onSaved) onSaved();
      } else {
        setErrorMsg(res?.error || 'Failed to save draft');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error saving draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      // First save draft
      await automationApi.saveFlowDraft(flowId, {
        name: flowName,
        trigger_keyword: triggerKeyword,
        nodes,
        transitions
      });

      const res = await automationApi.publishFlow(flowId);
      if (res && res.success) {
        setStatusMsg('Workflow published live! Inbound WhatsApp messages will now follow this graph.');
        setFlow((prev) => ({ ...prev, status: 'ACTIVE' }));
      } else {
        setErrorMsg(res?.error || 'Failed to publish workflow');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error publishing workflow');
    } finally {
      setPublishing(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleUpdateNode = (updatedNode) => {
    setNodes((prev) => prev.map((n) => (n.id === updatedNode.id ? updatedNode : n)));
  };

  const handleDeleteNode = (nodeId) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setTransitions((prev) => prev.filter((t) => t.source !== nodeId && t.target !== nodeId && t.from !== nodeId && t.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-xs text-slate-500">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Loading workflow canvas...</span>
      </div>
    );
  }

  const isFlowActive = (flow?.status || '').toUpperCase() === 'ACTIVE' || (flow?.status || '').toUpperCase() === 'PUBLISHED';

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[640px] bg-slate-50">
      {/* Top Builder Action Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={16} />
          </button>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="text-sm font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none px-1 py-0.5"
            />
            <Badge tone={isFlowActive ? 'green' : 'taupe'} dot>
              {isFlowActive ? 'Active' : 'Draft'}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-[11px] uppercase tracking-wider text-slate-400">Trigger:</span>
            <input
              type="text"
              value={triggerKeyword}
              onChange={(e) => setTriggerKeyword(e.target.value.toUpperCase())}
              placeholder="KEYWORD"
              className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 border border-slate-200 rounded w-28 uppercase"
            />
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {statusMsg && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 mr-2">
              <CheckCircle2 size={13} />
              {statusMsg}
            </span>
          )}

          {errorMsg && (
            <span className="text-xs text-rose-600 font-medium flex items-center gap-1 mr-2">
              <AlertCircle size={13} />
              {errorMsg}
            </span>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowSimulator(!showSimulator)}
            className="text-xs py-1.5"
          >
            <Smartphone size={13} className="mr-1 text-slate-500" />
            <span>{showSimulator ? 'Close Preview' : 'Test Sandbox'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            loading={saving}
            onClick={handleSaveDraft}
            className="text-xs py-1.5"
          >
            <Save size={13} className="mr-1 text-slate-500" />
            <span>Save Draft</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            loading={publishing}
            onClick={handlePublish}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5"
          >
            <Play size={13} className="mr-1" />
            <span>Publish Live</span>
          </Button>
        </div>
      </div>

      {/* Main Canvas + Panels Container */}
      <div className="flex-1 min-h-[560px] flex overflow-hidden relative">
        {/* Center Visual Graph Canvas (includes integrated Step Palette) */}
        <div className="flex-1 min-w-0 min-h-[560px] flex flex-col relative overflow-hidden bg-slate-100">
          <FlowCanvas
            nodes={nodes}
            transitions={transitions}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onUpdateNodes={setNodes}
            onUpdateTransitions={setTransitions}
          />
        </div>

        {/* Right Node Inspector Drawer */}
        {selectedNode && (
          <NodeInspectorDrawer
            node={selectedNode}
            nodes={nodes}
            transitions={transitions}
            variables={{}}
            onClose={() => setSelectedNodeId(null)}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
          />
        )}

        {/* Slide-Over In-Memory Simulation Sandbox */}
        {showSimulator && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-white shadow-2xl border-l border-slate-200 z-30 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={14} className="text-emerald-600" />
                <span>Simulation Sandbox</span>
              </h3>
              <button
                onClick={() => setShowSimulator(false)}
                className="text-xs text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>
            <SimulationPanel flowId={flowId} />
          </div>
        )}
      </div>
    </div>
  );
}

