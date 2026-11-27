import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  BotMessageSquare,
  Bot,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Save,
  RotateCcw,
  Sparkles,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  ExternalLink,
  ChevronRight,
  Info,
  Clock,
  Send,
  Sliders,
  Check,
  Smartphone,
  Eye,
  Settings,
  Zap,
  ArrowRight,
  GitBranch,
  Library,
  BarChart3,
  History,
  CheckSquare,
  Tag,
  Copy,
  ChevronDown,
  Layers,
  Phone,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  ShoppingBag,
  Stethoscope,
  Scissors,
  UtensilsCrossed,
  Home,
  GraduationCap,
  Briefcase,
  TrendingUp
} from 'lucide-react';

import FlowCanvas from '../components/flow-studio/FlowCanvas';
import NodeInspectorDrawer from '../components/flow-studio/NodeInspectorDrawer';
import StepJourneyDesigner from '../components/flow-studio/StepJourneyDesigner';
import FlowTemplatesModal from '../components/flow-studio/FlowTemplatesModal';
import FlowVersionsModal from '../components/flow-studio/FlowVersionsModal';
import FlowSimulatorPanel from '../components/flow-studio/FlowSimulatorPanel';
import FlowAnalyticsPanel from '../components/flow-studio/FlowAnalyticsPanel';
import FlowExecutionsModal from '../components/flow-studio/FlowExecutionsModal';
import AiFlowGeneratorModal from '../components/flow-studio/AiFlowGeneratorModal';
import IndustryBlueprintsModal from '../components/catalog/IndustryBlueprintsModal';
import { DataTable, HelpTip, Badge } from '../components/ui';

export default function FlowStudioPage() {
  const { token, isAdmin } = useAuth();

  // Navigation & Control Plane View
  // 'LIST' (Multi-Flow Command List) | 'EDITOR' (Dual-Mode Flow Editor)
  const [viewState, setViewState] = useState('LIST');
  const [editorMode, setEditorMode] = useState('STEPS'); // 'STEPS' | 'CANVAS'

  // Data states
  const [flows, setFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [conflicts, setConflicts] = useState([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [activeFlowId, setActiveFlowId] = useState(null);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [currentNodes, setCurrentNodes] = useState([]);
  const [currentTransitions, setCurrentTransitions] = useState([]);
  const [currentVariables, setCurrentVariables] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'DRAFT' | 'PAUSED'
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // AI Refine Bar State
  const [aiRefinePrompt, setAiRefinePrompt] = useState('');
  const [aiRefining, setAiRefining] = useState(false);
  const [aiRefineDiffSummary, setAiRefineDiffSummary] = useState(null);

  // Modals
  const [aiGeneratorOpen, setAiGeneratorOpen] = useState(false);
  const [blueprintsOpen, setBlueprintsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [executionsOpen, setExecutionsOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  // Status banners / toasts
  const [toastMessage, setToastMessage] = useState(null);
  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Auth headers
  const getHeaders = useCallback(() => {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  // Load flows & conflicts
  const loadFlows = useCallback(async () => {
    setLoadingFlows(true);
    try {
      const res = await fetch('/api/v1/flows', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setFlows(Array.isArray(data) ? data : data.flows || []);
      }
    } catch (err) {
      console.error('Failed to load flows:', err);
    } finally {
      setLoadingFlows(false);
    }
  }, [getHeaders]);

  const loadConflicts = useCallback(async () => {
    setLoadingConflicts(true);
    try {
      const res = await fetch('/api/v1/flows/conflicts', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConflicts(data.conflicts || []);
      }
    } catch (err) {
      console.error('Failed to load conflicts:', err);
    } finally {
      setLoadingConflicts(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadFlows();
    loadConflicts();
  }, [loadFlows, loadConflicts]);

  // Open a flow into the Dual-Mode Editor
  const openFlowEditor = async (flowId) => {
    setActiveFlowId(flowId);
    setLoadingFlows(true);
    try {
      const res = await fetch(`/api/v1/flows/${flowId}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const flow = data?.flow || data;
        setCurrentFlow(flow);
        const draft = flow.draftVersion || flow.publishedVersion || flow;
        const nodes = Array.isArray(draft.nodes) ? draft.nodes : JSON.parse(draft.nodes_json || '[]');
        const transitions = Array.isArray(draft.transitions) ? draft.transitions : JSON.parse(draft.transitions_json || '[]');
        const variables = typeof draft.variables === 'object' && draft.variables !== null ? draft.variables : JSON.parse(draft.variables_json || '{}');
        setCurrentNodes(nodes);
        setCurrentTransitions(transitions);
        setCurrentVariables(variables);
        setHasUnsavedChanges(false);
        setViewState('EDITOR');
      } else {
        showToast('Failed to load flow details', 'error');
      }
    } catch (err) {
      showToast('Error connecting to flow service', 'error');
    } finally {
      setLoadingFlows(false);
    }
  };

  // Toggle Flow Active/Paused status
  const handleToggleFlowStatus = async (flow) => {
    const isCurrentlyPublished = flow.status === 'PUBLISHED';
    const action = isCurrentlyPublished ? 'pause' : 'publish';
    try {
      const res = await fetch(`/api/v1/flows/${flow.id}/${action}`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast(`Flow ${isCurrentlyPublished ? 'paused' : 'published live'} successfully!`);
        loadFlows();
        loadConflicts();
      } else {
        const err = await res.json();
        showToast(err.error || `Failed to ${action} flow`, 'error');
      }
    } catch (err) {
      showToast(`Network error when trying to ${action} flow`, 'error');
    }
  };

  // Save Flow Draft
  const handleSaveDraft = async () => {
    if (!activeFlowId) return;
    setSavingDraft(true);
    try {
      const res = await fetch(`/api/v1/flows/${activeFlowId}/draft`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          nodes: currentNodes,
          transitions: currentTransitions,
          variables: currentVariables,
          changelog: 'Saved via Universal Flow Studio'
        })
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        showToast('Draft saved successfully');
        loadFlows();
      } else {
        showToast('Failed to save draft', 'error');
      }
    } catch (err) {
      showToast('Error saving draft', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  // Publish Flow
  const handlePublishFlow = async () => {
    if (!activeFlowId) return;
    setPublishing(true);
    try {
      // Save draft first if changes exist
      if (hasUnsavedChanges) {
        await fetch(`/api/v1/flows/${activeFlowId}/draft`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            nodes: currentNodes,
            transitions: currentTransitions,
            variables: currentVariables,
            changelog: 'Pre-publish save'
          })
        });
      }

      const res = await fetch(`/api/v1/flows/${activeFlowId}/publish`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        showToast('🎉 Flow published live to WhatsApp lines!');
        loadFlows();
        loadConflicts();
        openFlowEditor(activeFlowId);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to publish flow', 'error');
      }
    } catch (err) {
      showToast('Error publishing flow', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // AI Refine Execution
  const handleAiRefine = async () => {
    if (!activeFlowId || !aiRefinePrompt.trim()) return;
    setAiRefining(true);
    try {
      const res = await fetch(`/api/v1/flows/${activeFlowId}/ai-refine`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ prompt: aiRefinePrompt.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAiRefineDiffSummary(data.diffSummary || 'Flow refined by AI');
        showToast('✨ Flow refined successfully!');
        if (data.draftVersion) {
          const n = Array.isArray(data.draftVersion.nodes) ? data.draftVersion.nodes : JSON.parse(data.draftVersion.nodes_json || '[]');
          const t = Array.isArray(data.draftVersion.transitions) ? data.draftVersion.transitions : JSON.parse(data.draftVersion.transitions_json || '[]');
          setCurrentNodes(n);
          setCurrentTransitions(t);
        }
        setAiRefinePrompt('');
      } else {
        showToast(data.error || 'AI refinement failed', 'error');
      }
    } catch (err) {
      showToast('Error communicating with AI refiner', 'error');
    } finally {
      setAiRefining(false);
    }
  };

  // Quick Add from Masters
  const handleQuickAddMasterNode = (masterType, title, defaultNode) => {
    const newNodeId = `node_${masterType.toLowerCase()}_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      ...defaultNode,
      title: title || defaultNode.title,
      position: { x: 350, y: (currentNodes.length + 1) * 140 }
    };
    setCurrentNodes(prev => [...prev, newNode]);
    setHasUnsavedChanges(true);
    showToast(`Added ${title} node`);
  };

  // Filtered flows for the command list
  const filteredFlows = useMemo(() => {
    return flows.filter(f => {
      const matchesSearch = !searchQuery || (
        (f.name && f.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (f.description && f.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (f.trigger_keywords && String(f.trigger_keywords).toLowerCase().includes(searchQuery.toLowerCase()))
      );
      const matchesStatus = statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && f.status === 'PUBLISHED') ||
        (statusFilter === 'DRAFT' && f.status === 'DRAFT') ||
        (statusFilter === 'PAUSED' && f.status === 'PAUSED');
      const matchesCategory = categoryFilter === 'ALL' || f.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [flows, searchQuery, statusFilter, categoryFilter]);

  // Overall KPI stats
  const stats = useMemo(() => {
    const total = flows.length;
    const active = flows.filter(f => f.status === 'PUBLISHED').length;
    const lines = new Set(flows.map(f => f.phone_number_id).filter(Boolean)).size;
    const conflictCount = conflicts.length;
    return { total, active, lines, conflictCount };
  }, [flows, conflicts]);

  const flowColumns = useMemo(() => [
    {
      header: 'Flow Name',
      accessor: 'name',
      cell: (flow) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '180px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{ fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}
              onClick={() => openFlowEditor(flow.id)}
            >
              {flow.name}
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '4px',
              background: '#F1F5F9',
              color: '#475569',
              textTransform: 'uppercase'
            }}>
              {flow.category || 'GENERAL'}
            </span>
          </div>
          {flow.description && (
            <span style={{ fontSize: '0.75rem', color: '#64748B', maxWidth: '320px' }} className="truncate" title={flow.description}>
              {flow.description}
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Line',
      accessor: 'phone_number_id',
      cell: (flow) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: '#475569', whiteSpace: 'nowrap' }}>
          <Phone size={12} color="#3B82F6" />
          <span>{flow.phone_number_id ? `${flow.phone_number_id}` : 'All Lines'}</span>
        </div>
      )
    },
    {
      header: 'Triggers',
      cell: (flow) => {
        const keywords = Array.isArray(flow.trigger_keywords) ? flow.trigger_keywords
          : (typeof flow.trigger_keywords === 'string' ? JSON.parse(flow.trigger_keywords || '[]') : []);
        if (!keywords.length) return <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>None</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', maxWidth: '240px' }}>
            {keywords.slice(0, 3).map((kw, idx) => (
              <span key={idx} style={{
                fontSize: '0.7rem',
                background: '#EFF6FF',
                color: '#1D4ED8',
                padding: '1px 6px',
                borderRadius: '4px',
                fontWeight: 500
              }}>
                {kw}
              </span>
            ))}
            {keywords.length > 3 && (
              <span style={{ fontSize: '0.7rem', color: '#64748B', cursor: 'help' }} title={keywords.slice(3).join(', ')}>
                +{keywords.length - 3}
              </span>
            )}
          </div>
        );
      }
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (flow) => {
        const isPublished = flow.status === 'PUBLISHED';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleToggleFlowStatus(flow)}
              style={{
                width: '32px',
                height: '18px',
                borderRadius: '9px',
                background: isPublished ? '#10B981' : '#CBD5E1',
                border: 'none',
                position: 'relative',
                cursor: 'pointer',
                padding: 0
              }}
              title={isPublished ? 'Click to Pause' : 'Click to Publish Live'}
            >
              <span style={{
                position: 'absolute',
                top: '2px',
                left: isPublished ? '16px' : '2px',
                width: '14px',
                height: '14px',
                borderRadius: '7px',
                background: '#FFFFFF',
                transition: 'all 0.15s ease'
              }} />
            </button>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isPublished ? '#16A34A' : '#94A3B8' }}>
              {isPublished ? 'LIVE' : 'PAUSED'}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Sessions',
      accessor: 'total_sessions',
      numeric: true,
      align: 'right',
      cell: (flow) => <span className="tabular-nums" style={{ fontSize: '0.82rem' }}>{flow.total_sessions != null ? Number(flow.total_sessions).toLocaleString('en-IN') : '—'}</span>
    },
    {
      header: 'Updated',
      accessor: 'updated_at',
      cell: (flow) => (
        <span style={{ fontSize: '0.75rem', color: '#64748B', whiteSpace: 'nowrap' }}>
          {flow.updated_at ? new Date(flow.updated_at).toLocaleDateString() : 'Recently'}
        </span>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (flow) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
          <button
            type="button"
            onClick={() => openFlowEditor(flow.id)}
            style={{
              padding: '4px 10px',
              fontSize: '0.78rem',
              borderRadius: '6px',
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600
            }}
          >
            <Edit2 size={12} />
            <span>Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setSimulatorOpen(true)}
            style={{
              padding: '4px 8px',
              fontSize: '0.78rem',
              borderRadius: '6px',
              background: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              cursor: 'pointer'
            }}
            title="Simulate Flow"
          >
            <Smartphone size={12} />
          </button>
        </div>
      )
    }
  ], [handleToggleFlowStatus, openFlowEditor]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 9999,
          background: toastMessage.type === 'error' ? '#EF4444' : '#10B981',
          color: '#FFFFFF',
          padding: '10px 18px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.86rem',
          fontWeight: 600
        }}>
          {toastMessage.type === 'error' ? <XCircle size={18} /> : <CheckCircle size={18} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* VIEW 1: MULTI-FLOW COMMAND LIST */}
      {viewState === 'LIST' && (
        <div>
          {/* Action Hero Header Strip */}
          <div style={{
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            color: '#FFFFFF',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '16px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ background: '#3B82F6', borderRadius: '8px', padding: '6px', display: 'flex' }}>
                    <BotMessageSquare size={18} color="#FFFFFF" />
                  </div>
                  <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#FFFFFF' }}>Flow Automation Studio</h1>
                  <HelpTip text="Multi-sector WhatsApp auto-reply engine with linear O(ΣK) trigger routing and master catalog integration." />
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAiGeneratorOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Sparkles size={14} />
                  <span>AI Flow Architect</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBlueprintsOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#1E293B',
                    color: '#E2E8F0',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <ShoppingBag size={14} color="#38BDF8" />
                  <span>Seed Industry Catalog</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimulatorOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid #F59E0B',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#FBBF24',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Smartphone size={14} />
                  <span>In-Memory Simulator</span>
                </button>

                <button
                  type="button"
                  onClick={() => { loadFlows(); loadConflicts(); }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    background: '#1E293B',
                    color: '#E2E8F0',
                    cursor: 'pointer'
                  }}
                  title="Refresh flows"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Quick KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '14px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Total Flows</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '2px', color: '#FFFFFF' }} className="tabular-nums">{stats.total}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Active Live</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34D399', marginTop: '2px' }} className="tabular-nums">{stats.active}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Connected Lines</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60A5FA', marginTop: '2px' }} className="tabular-nums">{stats.lines || 1}</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '8px 12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Trigger Conflicts</span>
                  <HelpTip text="Conflict-free router ensures keyword & regex rules route deterministically without overlapping triggers." />
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: stats.conflictCount > 0 ? '#F87171' : '#34D399', marginTop: '2px' }} className="tabular-nums">
                  {stats.conflictCount === 0 ? '0 (Clean)' : stats.conflictCount}
                </div>
              </div>
            </div>
          </div>

          {/* Live Conflict Alert Bar */}
          {conflicts.length > 0 ? (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              color: '#991B1B'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.84rem' }}>
                <AlertTriangle size={16} color="#DC2626" />
                <span>⚠️ {conflicts.length} Trigger Conflict{conflicts.length > 1 ? 's' : ''} Detected Across Active Flows</span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {conflicts.map((c, i) => (
                  <div key={i} style={{ background: '#FFFFFF', padding: '6px 10px', borderRadius: '4px', border: '1px solid #FEE2E2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{c.type}:</strong> {c.message || c.description || `Keyword overlap '${c.keyword}' across flows`}
                    </div>
                    <span style={{ fontSize: '0.68rem', background: '#FEE2E2', color: '#991B1B', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                      {c.severity || 'HIGH'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              padding: '8px 14px',
              marginBottom: '16px',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem'
            }}>
              <ShieldCheck size={16} color="#16A34A" />
              <span style={{ fontWeight: 600 }}>Trigger Router Clean:</span>
              <span style={{ color: '#15803D' }}>Zero keyword or regex collisions across active lines.</span>
            </div>
          )}

          {/* Standardized Compact DataTable */}
          <DataTable
            density="compact"
            columns={flowColumns}
            data={filteredFlows}
            rows={filteredFlows}
            loading={loadingFlows}
            toolbar={
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                  <input
                    type="text"
                    placeholder="Search flows by name, description, or keyword..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px 6px 30px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', background: '#FFFFFF' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active (Live)</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PAUSED">Paused</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem', background: '#FFFFFF' }}
                >
                  <option value="ALL">All Categories</option>
                  <option value="RETAIL_ECOM">Retail &amp; D2C</option>
                  <option value="CLINIC_HEALTH">Clinic &amp; Dental</option>
                  <option value="SALON_SPA">Salon &amp; Spa</option>
                  <option value="RESTAURANT_CAFE">Restaurant &amp; Cafe</option>
                  <option value="HOSPITALITY_ENQUIRY">Hospitality &amp; Resorts</option>
                  <option value="REAL_ESTATE">Real Estate</option>
                  <option value="EDUCATION">Education &amp; EdTech</option>
                  <option value="B2B_SALES">B2B Wholesale</option>
                </select>
              </div>
            }
            emptyTitle="No Flows Found"
            emptyMessage="Create your first automated WhatsApp flow or use AI Architect to generate one in seconds."
          />
        </div>
      )}

      {/* VIEW 2: DUAL-MODE FLOW EDITOR */}
      {viewState === 'EDITOR' && (
        <div>
          {/* Editor Header Bar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 20px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                type="button"
                onClick={() => setViewState('LIST')}
                style={{
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ← Back to Flows
              </button>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                    {currentFlow?.name || 'Flow Editor'}
                  </h2>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: currentFlow?.status === 'PUBLISHED' ? '#DCFCE7' : '#FEF3C7',
                    color: currentFlow?.status === 'PUBLISHED' ? '#15803D' : '#B45309'
                  }}>
                    {currentFlow?.status || 'DRAFT'}
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                  {currentNodes.length} nodes • {currentTransitions.length} transitions
                </div>
              </div>
            </div>

            {/* Mode Switcher & Save / Publish Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Dual Mode Switcher */}
              <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditorMode('STEPS')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: editorMode === 'STEPS' ? '#FFFFFF' : 'transparent',
                    color: editorMode === 'STEPS' ? '#1E293B' : '#64748B',
                    boxShadow: editorMode === 'STEPS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  Simple Step Mode
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('CANVAS')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: editorMode === 'CANVAS' ? '#FFFFFF' : 'transparent',
                    color: editorMode === 'CANVAS' ? '#1E293B' : '#64748B',
                    boxShadow: editorMode === 'CANVAS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  Visual Canvas Pro
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSimulatorOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Smartphone size={14} />
                <span>Simulator</span>
              </button>

              <button
                type="button"
                onClick={() => setAnalyticsOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 12px',
                  borderRadius: '6px',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#166534',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <TrendingUp size={14} />
                <span>Funnel &amp; AI Optimizer</span>
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: hasUnsavedChanges ? '#FEF3C7' : '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  color: '#1E293B',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Save size={14} />
                <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
              </button>

              <button
                type="button"
                onClick={handlePublishFlow}
                disabled={publishing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 16px',
                  borderRadius: '6px',
                  background: '#16A34A',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                }}
              >
                <Zap size={14} />
                <span>{publishing ? 'Publishing...' : 'Publish Live'}</span>
              </button>
            </div>
          </div>

          {/* Inline AI Refine Bar */}
          <div style={{
            background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
            border: '1px solid #DDD6FE',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sparkles size={16} color="#7C3AED" />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#5B21B6' }}>Inline AI Flow Refiner:</span>
              <span style={{ fontSize: '0.78rem', color: '#6D28D9' }}>Type natural language changes to auto-insert nodes or adjust copy</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="e.g. Add an add-on upsell step before payment, or change welcome greeting to Hinglish..."
                value={aiRefinePrompt}
                onChange={e => setAiRefinePrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAiRefine(); }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #C4B5FD',
                  fontSize: '0.82rem',
                  background: '#FFFFFF'
                }}
              />
              <button
                type="button"
                onClick={handleAiRefine}
                disabled={aiRefining || !aiRefinePrompt.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {aiRefining ? 'Refining...' : 'Refine Flow'}
              </button>
            </div>

            {/* Quick Suggestion Chips */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: '#6D28D9', fontWeight: 600 }}>Quick Prompts:</span>
              {[
                'Add add-on upsell step before payment',
                'Add master category picker at start',
                'Add branch location picker',
                'Change welcome message to Hinglish',
                'Add 1-hour follow-up delay'
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAiRefinePrompt(chip)}
                  style={{
                    fontSize: '0.72rem',
                    background: '#FFFFFF',
                    border: '1px solid #DDD6FE',
                    color: '#6D28D9',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    cursor: 'pointer'
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {aiRefineDiffSummary && (
              <div style={{ marginTop: '8px', fontSize: '0.76rem', color: '#15803D', background: '#DCFCE7', padding: '6px 10px', borderRadius: '4px' }}>
                ✅ {aiRefineDiffSummary}
              </div>
            )}
          </div>

          {/* Quick Add from Masters Toolbar (Available in both modes) */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '10px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
              + Quick Add from Masters:
            </span>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('MASTER_PICKER_CAT', 'Category Selector', {
                type: 'MASTER_PICKER',
                title: 'Select Category',
                config: { masterType: 'master_categories', promptText: 'Please select a category:', outputVariable: 'selected_category_id', autoAdvanceOnSingle: true }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              🏷️ Category Picker
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('MASTER_PICKER_LOC', 'Branch / Location Selector', {
                type: 'MASTER_PICKER',
                title: 'Select Branch',
                config: { masterType: 'master_locations', promptText: 'Please select our nearest branch:', outputVariable: 'selected_location_id', autoAdvanceOnSingle: true }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              📍 Branch / Location
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('MASTER_PICKER_RES', 'Doctor / Staff Selector', {
                type: 'MASTER_PICKER',
                title: 'Select Specialist',
                config: { masterType: 'master_resources', promptText: 'Please choose your preferred specialist:', outputVariable: 'selected_resource_id', autoAdvanceOnSingle: true }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              👨‍⚕️ Doctor / Staff
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('CATALOG_BROWSER', 'Catalog Browser', {
                type: 'CATALOG_BROWSER',
                title: 'Browse Catalog',
                config: { title: '🛍️ Featured Catalog', pageSize: 6 }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              🛍️ Catalog Browser
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('ADDON_UPSELL', 'Add-On & Quote', {
                type: 'ADDON_UPSELL_AND_QUOTE',
                title: 'Add-Ons & Dynamic Quote',
                config: { title: '✨ Add-Ons & Upsells', allowAddons: true, allowPromoCode: true }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              ➕ Add-On &amp; Quote
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('AI_HYBRID', 'AI Grounded Copilot', {
                type: 'AI_HYBRID_ASSIST',
                title: 'AI Grounded Copilot',
                config: { resumePrompt: '👉 Please continue with your selection:' }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
            >
              🤖 AI Copilot
            </button>
            <button
              type="button"
              onClick={() => handleQuickAddMasterNode('OPEN_INAPP', 'Interactive Web App (/x/)', {
                type: 'OPEN_INAPP_EXPERIENCE',
                title: 'Interactive Web App (/x/)',
                config: {
                  messageText: 'Tap below to view all photos, customize add-ons & checkout in 1 tap:',
                  buttonLabel: 'Open Interactive App 📱',
                  waitForCompletion: true
                }
              })}
              style={{ fontSize: '0.75rem', padding: '4px 9px', borderRadius: '4px', border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1', fontWeight: 600, cursor: 'pointer' }}
            >
              🌐 Interactive App (/x/)
            </button>
          </div>

          {/* MAIN EDITOR: Step Mode OR Visual Canvas Pro */}
          {editorMode === 'STEPS' ? (
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
              <StepJourneyDesigner
                nodes={currentNodes}
                transitions={currentTransitions}
                onUpdateNodes={nodes => { setCurrentNodes(nodes); setHasUnsavedChanges(true); }}
                onUpdateTransitions={transitions => { setCurrentTransitions(transitions); setHasUnsavedChanges(true); }}
                onSelectNode={setSelectedNodeId}
                selectedNodeId={selectedNodeId}
                onOpenSimulator={() => setSimulatorOpen(true)}
              />
            </div>
          ) : (
            <div style={{
              display: 'flex',
              height: '760px',
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{ flex: 1, height: '100%', position: 'relative' }}>
                <FlowCanvas
                  nodes={currentNodes}
                  transitions={currentTransitions}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onUpdateNodes={nodes => { setCurrentNodes(nodes); setHasUnsavedChanges(true); }}
                  onUpdateTransitions={transitions => { setCurrentTransitions(transitions); setHasUnsavedChanges(true); }}
                />
              </div>

              {selectedNodeId && currentNodes.find(n => n.id === selectedNodeId) && (
                <NodeInspectorDrawer
                  node={currentNodes.find(n => n.id === selectedNodeId)}
                  nodes={currentNodes}
                  variables={currentVariables}
                  onUpdateNode={updated => {
                    setCurrentNodes(nodes => nodes.map(n => n.id === updated.id ? updated : n));
                    setHasUnsavedChanges(true);
                  }}
                  onClose={() => setSelectedNodeId(null)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {aiGeneratorOpen && (
        <AiFlowGeneratorModal
          isOpen={aiGeneratorOpen}
          onClose={() => setAiGeneratorOpen(false)}
          onFlowGenerated={result => {
            setAiGeneratorOpen(false);
            loadFlows();
            loadConflicts();
            if (result?.flow?.id) {
              openFlowEditor(result.flow.id);
            }
          }}
          token={token}
        />
      )}

      {blueprintsOpen && (
        <IndustryBlueprintsModal
          isOpen={blueprintsOpen}
          onClose={() => setBlueprintsOpen(false)}
          onImportComplete={() => {
            setBlueprintsOpen(false);
            loadFlows();
            showToast('Catalog seeded successfully!');
          }}
        />
      )}

      {simulatorOpen && (
        <FlowSimulatorPanel
          isOpen={simulatorOpen}
          onClose={() => setSimulatorOpen(false)}
          flowId={activeFlowId}
          flowOverride={{
            id: activeFlowId || 'sim_flow',
            nodes: currentNodes,
            transitions: currentTransitions,
            variables: currentVariables
          }}
        />
      )}

      {analyticsOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1000
        }}>
          <div style={{
            width: '880px',
            maxWidth: '100%',
            height: '100%',
            background: '#F8FAFC',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={20} color="#16A34A" /> Flow Funnel &amp; AI Optimizer
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                  Pre-aggregated O(1) drop-off telemetry &amp; 1-click conversion optimization
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAnalyticsOpen(false)}
                style={{
                  background: '#EDF2F7',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                ✕ Close
              </button>
            </div>
            <FlowAnalyticsPanel
              flowId={activeFlowId}
              token={token}
              onFlowUpdated={() => {
                if (activeFlowId) loadFlowDetails(activeFlowId);
                showToast('AI Optimization applied to flow draft!');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

