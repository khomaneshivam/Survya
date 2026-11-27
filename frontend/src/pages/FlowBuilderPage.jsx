import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitBranch,
  Play,
  Pause,
  Trash2,
  Copy,
  Settings,
  History,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Phone,
  Layers,
  Sparkles,
  ExternalLink,
  RotateCcw,
  X,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  Eye,
  Smartphone,
  Save,
  ArrowLeft
} from 'lucide-react';
import DataTable from '../components/ui/DataTable';
import FlowCanvas from '../components/flow-studio/FlowCanvas';
import NodeInspectorDrawer from '../components/flow-studio/NodeInspectorDrawer';
import { validateFlowGraph } from '../components/flow-studio/flowGraphValidator';
import FlowSimulatorPanel from '../components/flow-studio/FlowSimulatorPanel';
import IndustryBlueprintsModal from '../components/catalog/IndustryBlueprintsModal';
import BusinessProfileSetupDrawer from '../components/flow-studio/BusinessProfileSetupDrawer';
import { automationApi } from '../features/automation/api/automationApi';
import { useAuth } from '../context/AuthContext';

export function formatIstTimestamp(utcStr) {
  if (!utcStr) return '—';
  let s = String(utcStr).trim();
  if (!s.includes('Z') && !s.includes('+')) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(utcStr);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

export default function FlowBuilderPage({ initialTab = 'flows', initialFlowId = null }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab); // 'flows' | 'canvas' | 'sessions'
  const [flows, setFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [selectedFlowId, setSelectedFlowId] = useState(initialFlowId);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [canvasNodes, setCanvasNodes] = useState([]);
  const [canvasTransitions, setCanvasTransitions] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | PUBLISHED | DRAFT | PAUSED
  const [selectedLineFilter, setSelectedLineFilter] = useState('ALL');
  const [conflicts, setConflicts] = useState([]);

  // Sessions Tab
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionStatusFilter, setSessionStatusFilter] = useState('ALL');
  const [inspectSessionId, setInspectSessionId] = useState(null);
  const [inspectSessionData, setInspectSessionData] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  // Drawers & Modals
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [blueprintsModalOpen, setBlueprintsModalOpen] = useState(false);
  const [businessProfileDrawerOpen, setBusinessProfileDrawerOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowRole, setNewFlowRole] = useState('MAIN');
  const [newFlowKeywords, setNewFlowKeywords] = useState('hi, enquiry');
  const [bannerNotice, setBannerNotice] = useState(null);

  // 1. Load Flows
  const loadFlows = useCallback(async () => {
    setLoadingFlows(true);
    try {
      const res = await automationApi.getFlows();
      if (res && res.success) {
        setFlows(res.flows || []);
      }
    } catch (err) {
      console.warn('Failed to load flows:', err);
    } finally {
      setLoadingFlows(false);
    }
  }, []);

  // 2. Load Conflicts
  const loadConflicts = useCallback(async () => {
    try {
      const res = await automationApi.getTriggerConflicts();
      if (res && res.conflicts) {
        setConflicts(res.conflicts || []);
      }
    } catch (_) {}
  }, []);

  // 3. Load Sessions
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await automationApi.getExecutions({ limit: 100 });
      const list = res?.executions || res?.data || [];
      setSessions(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  // 4. Load Global Settings
  const loadGlobalSettings = useCallback(async () => {
    try {
      const res = await automationApi.getGlobalSettings();
      if (res && res.settings) {
        setGlobalSettings(res.settings);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadFlows();
    loadConflicts();
    loadGlobalSettings();
  }, [loadFlows, loadConflicts, loadGlobalSettings]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    }
  }, [activeTab, loadSessions]);

  useEffect(() => {
    if (activeTab === 'canvas' && !selectedFlowId && flows.length > 0) {
      const preferred = flows.find((f) => f.status === 'PUBLISHED') || flows[0];
      if (preferred?.id) {
        setSelectedFlowId(preferred.id);
      }
    }
  }, [activeTab, selectedFlowId, flows]);

  // Load single flow for Canvas
  useEffect(() => {
    async function loadCanvasFlow() {
      if (!selectedFlowId || activeTab !== 'canvas') return;
      try {
        const res = await automationApi.getFlow(selectedFlowId);
        if (res && res.success) {
          const f = res.flow;
          setSelectedFlow(f);
          const ver = (res.draftVersion?.nodes || res.draftVersion?.nodes_json)
            ? res.draftVersion
            : (res.publishedVersion || {});
          const rawN = ver.nodes || (ver.nodes_json ? JSON.parse(ver.nodes_json) : []);
          const rawT = ver.transitions || (ver.transitions_json ? JSON.parse(ver.transitions_json) : []);
          setCanvasNodes(Array.isArray(rawN) ? rawN : []);
          setCanvasTransitions(Array.isArray(rawT) ? rawT : []);
        } else {
          setBannerNotice({ type: 'error', text: res?.error || `Failed to load flow #${selectedFlowId} for canvas.` });
        }
      } catch (err) {
        console.warn('Failed to load flow for canvas:', err);
        setBannerNotice({ type: 'error', text: err.message || 'Unable to load flow into canvas.' });
      }
    }
    loadCanvasFlow();
  }, [selectedFlowId, activeTab]);

  // Handle open Canvas for a flow
  const handleOpenFlowInCanvas = useCallback((flowId) => {
    setSelectedFlowId(flowId);
    setSelectedNodeId(null);
    setActiveTab('canvas');
  }, []);

  // Handle Blueprint Applied
  const handleBlueprintApplied = useCallback(async (result) => {
    await loadFlows();
    setBannerNotice({
      type: 'success',
      text: `Blueprint "${result.sectorName}" deployed! Flow #${result.flowId} created for ${result.businessName || 'your business'}.`
    });
    if (result.flowId) {
      handleOpenFlowInCanvas(result.flowId);
    }
  }, [loadFlows, handleOpenFlowInCanvas]);

  // Handle Create Flow
  const handleCreateFlow = async (e) => {
    e.preventDefault();
    if (!newFlowName.trim()) return;
    try {
      const kwList = newFlowKeywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const res = await automationApi.createFlow({
        name: newFlowName.trim(),
        flow_role: newFlowRole,
        trigger_type: kwList.length > 0 ? 'KEYWORD_MATCH' : 'INBOUND_ANY',
        trigger_keywords_json: JSON.stringify(kwList)
      });
      if (res && res.flow) {
        setCreateModalOpen(false);
        setNewFlowName('');
        await loadFlows();
        handleOpenFlowInCanvas(res.flow.id);
      }
    } catch (err) {
      alert('Failed to create flow: ' + err.message);
    }
  };

  // Handle Save Draft in Canvas
  const handleSaveDraft = async () => {
    if (!selectedFlowId) return;
    setSavingDraft(true);
    try {
      const res = await automationApi.saveFlowDraft(selectedFlowId, {
        name: selectedFlow?.name,
        nodes: canvasNodes,
        transitions: canvasTransitions
      });
      if (res && res.success) {
        setBannerNotice({ type: 'success', text: 'Flow draft saved successfully.' });
        setTimeout(() => setBannerNotice(null), 3000);
      } else {
        alert(res?.error || 'Failed to save draft');
      }
    } catch (err) {
      alert('Save draft error: ' + err.message);
    } finally {
      setSavingDraft(false);
    }
  };

  // Handle Publish in Canvas
  const handlePublish = async () => {
    if (!selectedFlowId) return;
    // Pre-publish validation check
    const valReport = validateFlowGraph(canvasNodes, canvasTransitions);
    if (!valReport.isValid && valReport.errors?.length > 0) {
      alert(`Cannot publish. Fix validation errors:\n• ${valReport.errors.map(e => e.message || e).join('\n• ')}`);
      return;
    }

    setPublishing(true);
    try {
      // Save draft first
      await automationApi.saveFlowDraft(selectedFlowId, {
        name: selectedFlow?.name,
        nodes: canvasNodes,
        transitions: canvasTransitions
      });
      // Then publish
      const res = await automationApi.publishFlow(selectedFlowId);
      if (res && res.success) {
        setBannerNotice({ type: 'success', text: 'Flow published and live on WhatsApp!' });
        setTimeout(() => setBannerNotice(null), 3500);
        await loadFlows();
        const fRes = await automationApi.getFlow(selectedFlowId);
        if (fRes?.flow) setSelectedFlow(fRes.flow);
      } else {
        alert(res?.error || 'Publish failed');
      }
    } catch (err) {
      alert('Publish error: ' + err.message);
    } finally {
      setPublishing(false);
    }
  };

  // Handle Save Global Settings
  const handleSaveGlobalSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await automationApi.updateGlobalSettings(globalSettings);
      if (res && res.success) {
        setGlobalSettings(res.settings);
        setGlobalSettingsOpen(false);
        setBannerNotice({ type: 'success', text: 'Global navigation & fallback settings saved.' });
        setTimeout(() => setBannerNotice(null), 3000);
      }
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle Inspect Session Trace
  const handleInspectSession = async (sessionId) => {
    setInspectSessionId(sessionId);
    setLoadingTrace(true);
    try {
      const res = await automationApi.getExecutionDetails(sessionId);
      if (res && res.success) {
        setInspectSessionData(res);
      }
    } catch (err) {
      alert('Failed to load session trace: ' + err.message);
    } finally {
      setLoadingTrace(false);
    }
  };

  // Handle Reset Session
  const handleResetSession = async (sessionId) => {
    if (!window.confirm(`Reset and terminate session #${sessionId}? Contact will start fresh on their next message.`)) return;
    try {
      await automationApi.resetSession(sessionId);
      setInspectSessionData(prev => prev ? { ...prev, session: { ...prev.session, session_status: 'CANCELLED' } } : null);
      await loadSessions();
      setBannerNotice({ type: 'success', text: `Session #${sessionId} reset to CANCELLED.` });
      setTimeout(() => setBannerNotice(null), 3000);
    } catch (err) {
      alert('Reset session error: ' + err.message);
    }
  };

  // Filtered Flows
  const filteredFlows = useMemo(() => {
    return flows.filter(f => {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = !q || (f.name || '').toLowerCase().includes(q) || String(f.id).includes(q);
      const statusMatch =
        statusFilter === 'ALL' ||
        (statusFilter === 'PUBLISHED' && f.status === 'PUBLISHED') ||
        (statusFilter === 'DRAFT' && f.status === 'DRAFT') ||
        (statusFilter === 'PAUSED' && f.status === 'PAUSED');
      const lineMatch =
        selectedLineFilter === 'ALL' ||
        (selectedLineFilter === 'GLOBAL' && !f.phone_number_id) ||
        String(f.phone_number_id) === String(selectedLineFilter);
      return nameMatch && statusMatch && lineMatch;
    });
  }, [flows, searchQuery, statusFilter, selectedLineFilter]);

  // Unique WhatsApp Lines across flows
  const availableLines = useMemo(() => {
    const set = new Set();
    flows.forEach(f => {
      if (f.phone_number_id) set.add(f.phone_number_id);
    });
    return Array.from(set);
  }, [flows]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      const q = sessionSearch.toLowerCase().trim();
      const phoneMatch = !q || (s.sender_phone || '').includes(q) || (s.flow_name || '').toLowerCase().includes(q) || String(s.id).includes(q);
      const statusMatch = sessionStatusFilter === 'ALL' || s.session_status === sessionStatusFilter;
      return phoneMatch && statusMatch;
    });
  }, [sessions, sessionSearch, sessionStatusFilter]);

  // Flows Table Columns
  const flowColumns = [
    {
      key: 'name',
      header: 'Flow Name',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const flowName = (typeof val === 'string' && val) ? val : (r.name || 'Untitled Flow');
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleOpenFlowInCanvas(r.id)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  fontWeight: 600,
                  color: '#0F172A',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                title="Open flow in Visual Canvas"
              >
                {flowName}
              </button>
              {r.is_root_menu === 1 && (
                <span style={{ fontSize: '0.66rem', background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                  ROOT MENU
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748B', fontFamily: 'monospace' }}>
              ID: {r.id} · {r.category || 'GENERAL'}
            </div>
          </div>
        );
      }
    },
    {
      key: 'flow_role',
      header: 'Role',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const role = (typeof val === 'string' && val) ? val : (r.flow_role || 'MAIN');
        const styles = {
          MAIN: { bg: '#EFF6FF', color: '#1D4ED8' },
          SUBFLOW: { bg: '#F3E8FF', color: '#6B21A8' },
          ROOT_MENU: { bg: '#FEF3C7', color: '#92400E' }
        }[role] || { bg: '#F1F5F9', color: '#475569' };
        return (
          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', background: styles.bg, color: styles.color }}>
            {role}
          </span>
        );
      }
    },
    {
      key: 'phone_number_id',
      header: 'WhatsApp Line',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const phoneId = (val && typeof val === 'string') ? val : r.phone_number_id;
        return (
          <span style={{ fontSize: '0.74rem', color: '#334155' }}>
            {phoneId ? (
              <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{r.assigned_phone_number || phoneId}</span>
            ) : (
              <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Global / Default</span>
            )}
          </span>
        );
      }
    },
    {
      key: 'triggers',
      header: 'Triggers',
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const kws = Array.isArray(r.trigger_keywords)
          ? r.trigger_keywords
          : (r.trigger_keywords_json ? (typeof r.trigger_keywords_json === 'string' ? JSON.parse(r.trigger_keywords_json || '[]') : r.trigger_keywords_json) : []);
        if (kws.length === 0) {
          return <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.trigger_type || 'Inbound'}</span>;
        }
        return (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {kws.slice(0, 3).map((kw, i) => (
              <span key={i} style={{ fontSize: '0.68rem', background: '#F1F5F9', color: '#334155', padding: '1px 5px', borderRadius: '3px', fontFamily: 'monospace' }}>
                {kw}
              </span>
            ))}
            {kws.length > 3 && (
              <span style={{ fontSize: '0.66rem', color: '#94A3B8' }}>+{kws.length - 3}</span>
            )}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const status = (typeof val === 'string' && val) ? val : (r.status || 'DRAFT');
        const isLive = status === 'PUBLISHED';
        const isDraft = status === 'DRAFT';
        return (
          <span style={{
            fontSize: '0.70rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '999px',
            background: isLive ? '#DCFCE7' : isDraft ? '#FEF3C7' : '#F1F5F9',
            color: isLive ? '#15803D' : isDraft ? '#B45309' : '#64748B'
          }}>
            {status}
          </span>
        );
      }
    },
    {
      key: 'active_sessions',
      header: 'Active',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        return (
          <span style={{ fontSize: '0.76rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155' }}>
            {r.active_session_count || (typeof val === 'number' ? val : 0)}
          </span>
        );
      }
    },
    {
      key: 'updated_at',
      header: 'Updated (IST)',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const ts = (typeof val === 'string' && val) ? val : (r.updated_at || r.created_at);
        return (
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            {formatIstTimestamp(ts)}
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleOpenFlowInCanvas(r.id)}
              style={{
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: '#2563EB',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedFlowId(r.id);
                setSimulatorOpen(true);
              }}
              title="Test in Simulator"
              style={{
                padding: '3px 6px',
                fontSize: '0.72rem',
                background: '#F1F5F9',
                color: '#334155',
                border: '1px solid #CBD5E1',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Test
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Duplicate "${r.name}"?`)) return;
                await automationApi.duplicateFlow(r.id);
                await loadFlows();
              }}
              title="Duplicate Flow"
              style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', padding: '3px' }}
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Delete flow "${r.name}"?`)) return;
                await automationApi.deleteFlow(r.id);
                await loadFlows();
              }}
              title="Delete Flow"
              style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer', padding: '3px' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      }
    }
  ];

  // Sessions Table Columns
  const sessionColumns = [
    {
      key: 'sender_phone',
      header: 'Phone Number',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const phone = (typeof val === 'string' && val) ? val : (r.sender_phone || '');
        return (
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', fontSize: '0.78rem' }}>
            +{phone}
          </span>
        );
      }
    },
    {
      key: 'flow_name',
      header: 'Flow Name',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        return (
          <div>
            <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.76rem' }}>{r.flow_name || `Flow #${r.flow_id}`}</span>
            <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontFamily: 'monospace' }}>Session #{r.id}</div>
          </div>
        );
      }
    },
    {
      key: 'current_node_id',
      header: 'Current Step',
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        return (
          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', background: '#F8FAFC', padding: '2px 5px', borderRadius: '3px', border: '1px solid #E2E8F0' }}>
            {r.current_node_id || (typeof val === 'string' ? val : 'node_start')}
          </span>
        );
      }
    },
    {
      key: 'session_status',
      header: 'Status',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const s = (typeof val === 'string' && val) ? val : (r.session_status || 'ACTIVE');
        const styles = {
          ACTIVE: { bg: '#DCFCE7', color: '#15803D' },
          PAUSED_AGENT_HANDOFF: { bg: '#F3E8FF', color: '#6B21A8' },
          COMPLETED: { bg: '#F1F5F9', color: '#475569' },
          CANCELLED: { bg: '#FEE2E2', color: '#991B1B' },
          EXPIRED: { bg: '#FEF3C7', color: '#92400E' }
        }[s] || { bg: '#F1F5F9', color: '#475569' };
        return (
          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: '999px', background: styles.bg, color: styles.color }}>
            {s}
          </span>
        );
      }
    },
    {
      key: 'last_interaction_at',
      header: 'Last Active (IST)',
      sortable: true,
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        const ts = (typeof val === 'string' && val) ? val : (r.last_interaction_at || r.created_at);
        return (
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            {formatIstTimestamp(ts)}
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (val, row) => {
        const r = (row && typeof row === 'object') ? row : ((val && typeof val === 'object') ? val : {});
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleInspectSession(r.id)}
              style={{
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Trace
            </button>
            <button
              type="button"
              onClick={() => handleResetSession(r.id)}
              style={{
                padding: '3px 6px',
                fontSize: '0.70rem',
                background: '#FFF1F2',
                color: '#BE123C',
                border: '1px solid #FECDD3',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
          </div>
        );
      }
    }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Top Banner Notice */}
      {bannerNotice && (
        <div style={{
          background: bannerNotice.type === 'success' ? '#2F5219' : '#991B1B',
          color: '#FFFFFF',
          padding: '8px 24px',
          fontSize: '0.80rem',
          fontWeight: 500,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{bannerNotice.text}</span>
          <button type="button" onClick={() => setBannerNotice(null)} style={{ background: 'transparent', border: 'none', color: '#FFF', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Sub-Navigation Bar */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E2E8F0',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '52px'
      }}>
        {/* Left: Branding & Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={18} color="#0F172A" />
            <span style={{ fontWeight: 700, fontSize: '0.94rem', color: '#0F172A', letterSpacing: '-0.02em' }}>
              Flow Builder
            </span>
          </div>

          <div style={{ display: 'flex', gap: '4px', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('flows')}
              style={{
                border: 'none',
                background: activeTab === 'flows' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'flows' ? '#0F172A' : '#64748B',
                fontWeight: activeTab === 'flows' ? 600 : 500,
                fontSize: '0.78rem',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: activeTab === 'flows' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Flows Directory
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedFlowId && flows.length > 0) setSelectedFlowId(flows[0].id);
                setActiveTab('canvas');
              }}
              style={{
                border: 'none',
                background: activeTab === 'canvas' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'canvas' ? '#0F172A' : '#64748B',
                fontWeight: activeTab === 'canvas' ? 600 : 500,
                fontSize: '0.78rem',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: activeTab === 'canvas' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Visual Canvas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              style={{
                border: 'none',
                background: activeTab === 'sessions' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'sessions' ? '#0F172A' : '#64748B',
                fontWeight: activeTab === 'sessions' ? 600 : 500,
                fontSize: '0.78rem',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: activeTab === 'sessions' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Live Sessions
            </button>
          </div>
        </div>

        {/* Right: Quick Global Settings & Create */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setBlueprintsModalOpen(true)}
            title="Import industry master data, catalog products and ready conversation flow"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #BBF7D0',
              background: '#F0FDF4',
              color: '#166534',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Sparkles size={14} color="#16A34A" />
            <span>Import Blueprint</span>
          </button>
          <button
            type="button"
            onClick={() => setBusinessProfileDrawerOpen(true)}
            title="Setup business name, contact line, operating hours & bot defaults"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Sliders size={14} />
            <span>Business Profile</span>
          </button>
          <button
            type="button"
            onClick={() => setGlobalSettingsOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#334155',
              padding: '5px 10px',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Settings size={14} />
            <span>Global Escapes &amp; Routing</span>
          </button>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              background: '#2F5219',
              color: '#FFFFFF',
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>New Flow</span>
          </button>
        </div>
      </div>

      {/* Trigger Conflict Alert Banner */}
      {conflicts.length > 0 && activeTab === 'flows' && (
        <div style={{
          background: '#FFFBEB',
          borderBottom: '1px solid #FCD34D',
          padding: '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.76rem',
          color: '#92400E'
        }}>
          <AlertTriangle size={15} color="#D97706" />
          <span style={{ fontWeight: 600 }}>{conflicts.length} Trigger Keyword Conflict(s) Detected:</span>
          <span>Multiple flows share overlapping trigger phrases on the same line.</span>
        </div>
      )}

      {/* TAB 1: FLOWS DIRECTORY */}
      {activeTab === 'flows' && (
        <div style={{ padding: '20px 24px', flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {/* Action & Filter Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}>
            {/* Search and Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search flow name, trigger, ID..."
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: '0.78rem',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Status Select */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  background: '#FFF'
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="PUBLISHED">Published (Live)</option>
                <option value="DRAFT">Draft</option>
                <option value="PAUSED">Paused</option>
              </select>

              {/* WhatsApp Line Select */}
              <select
                value={selectedLineFilter}
                onChange={(e) => setSelectedLineFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  background: '#FFF'
                }}
              >
                <option value="ALL">All WhatsApp Lines</option>
                <option value="GLOBAL">Global / Default Only</option>
                {availableLines.map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={loadFlows}
              title="Refresh Flows"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                border: '1px solid #CBD5E1',
                background: '#FFF',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={loadingFlows ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Compact Flows Table */}
          <DataTable
            columns={flowColumns}
            data={filteredFlows}
            density="compact"
            loading={loadingFlows}
            emptyTitle="No conversation flows found"
            emptyDescription="Create your first flow or adjust filters."
            pageSize={15}
          />
        </div>
      )}

      {/* TAB 2: VISUAL CANVAS */}
      {activeTab === 'canvas' && (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', minHeight: '620px', overflow: 'hidden' }}>
          {/* Canvas Header */}
          <div style={{
            background: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            padding: '8px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveTab('flows')}
                title="Back to Flows Directory"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}
              >
                <ArrowLeft size={16} />
              </button>
              {flows.length > 0 && (
                <select
                  aria-label="Select conversation flow"
                  value={selectedFlowId || ''}
                  onChange={(e) => {
                    const nextId = Number(e.target.value) || e.target.value;
                    if (nextId) handleOpenFlowInCanvas(nextId);
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    background: '#F8FAFC',
                    color: '#0F172A',
                    maxWidth: '240px'
                  }}
                >
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      #{f.id} · {f.name} ({f.status})
                    </option>
                  ))}
                </select>
              )}
              <div>
                <input
                  type="text"
                  value={selectedFlow?.name || ''}
                  onChange={(e) => setSelectedFlow(prev => ({ ...prev, name: e.target.value }))}
                  style={{
                    fontWeight: 700,
                    fontSize: '0.90rem',
                    color: '#0F172A',
                    border: '1px solid transparent',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#94A3B8'}
                  onBlur={(e) => e.target.style.borderColor = 'transparent'}
                />
                <span style={{ fontSize: '0.70rem', color: '#64748B', marginLeft: '6px' }}>
                  ID: {selectedFlow?.id || '—'} · Status: <strong>{selectedFlow?.status || 'DRAFT'}</strong>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSimulatorOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  padding: '5px 10px',
                  borderRadius: '5px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Play size={12} color="#16A34A" />
                <span>Test Simulator</span>
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: '1px solid #2563EB',
                  background: '#FFFFFF',
                  color: '#2563EB',
                  padding: '5px 12px',
                  borderRadius: '5px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Save size={12} />
                <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: 'none',
                  background: '#2F5219',
                  color: '#FFFFFF',
                  padding: '5px 14px',
                  borderRadius: '5px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <CheckCircle2 size={13} />
                <span>{publishing ? 'Publishing...' : 'Publish Flow'}</span>
              </button>
            </div>
          </div>

          {/* Canvas Working Area with Palette and Inspector */}
          <div style={{ flex: 1, minHeight: '560px', display: 'flex', alignItems: 'stretch', position: 'relative', overflow: 'hidden' }}>
            <div style={{ flex: 1, minWidth: 0, minHeight: '560px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <FlowCanvas
                nodes={canvasNodes}
                transitions={canvasTransitions}
                onUpdateNodes={setCanvasNodes}
                onUpdateTransitions={setCanvasTransitions}
                onSelectNode={(nodeId) => setSelectedNodeId(typeof nodeId === 'object' ? (nodeId?.id || null) : (nodeId || null))}
                selectedNodeId={selectedNodeId}
              />
            </div>

            {selectedNodeId && (
              <NodeInspectorDrawer
                node={canvasNodes.find(n => n.id === selectedNodeId)}
                nodes={canvasNodes}
                onUpdateNode={(updated) => {
                  setCanvasNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
                }}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LIVE SESSIONS */}
      {activeTab === 'sessions' && (
        <div style={{ padding: '20px 24px', flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {/* Sessions Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                <input
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Filter by phone, flow, or session ID..."
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    fontSize: '0.78rem',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <select
                value={sessionStatusFilter}
                onChange={(e) => setSessionStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.78rem',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  background: '#FFF'
                }}
              >
                <option value="ALL">All Session States</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED_AGENT_HANDOFF">PAUSED_AGENT_HANDOFF</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="EXPIRED">EXPIRED</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadSessions}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                border: '1px solid #CBD5E1',
                background: '#FFF',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={loadingSessions ? 'spin' : ''} />
              <span>Refresh Sessions</span>
            </button>
          </div>

          {/* Compact Sessions Table */}
          <DataTable
            columns={sessionColumns}
            data={filteredSessions}
            density="compact"
            loading={loadingSessions}
            emptyTitle="No active or logged conversation sessions"
            emptyDescription="Inbound WhatsApp conversations will appear here in real-time."
            pageSize={15}
          />
        </div>
      )}

      {/* Trace Slide-Over Drawer */}
      {inspectSessionId && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '520px',
          height: '100vh',
          background: '#FFFFFF',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.90rem', color: '#0F172A' }}>
                Session Audit Trace #{inspectSessionId}
              </span>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Contact: +{inspectSessionData?.session?.sender_phone || '—'} · Status: {inspectSessionData?.session?.session_status}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setInspectSessionId(null);
                setInspectSessionData(null);
              }}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {loadingTrace ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.80rem' }}>
                Loading turn-by-turn trace events...
              </div>
            ) : (
              <>
                {/* Session Variables Snapshot */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Collected Variables Snapshot
                  </label>
                  <pre style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '0.70rem',
                    fontFamily: 'monospace',
                    overflowX: 'auto',
                    marginTop: '6px'
                  }}>
                    {JSON.stringify(inspectSessionData?.session?.collected_data || {}, null, 2)}
                  </pre>
                </div>

                {/* Event Trace Timeline */}
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Chronological Turn Events ({inspectSessionData?.events?.length || 0})
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {(inspectSessionData?.events || []).map((ev, i) => (
                      <div
                        key={ev.id || i}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          background: '#FFFFFF',
                          fontSize: '0.74rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B', fontSize: '0.68rem', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#0F172A' }}>[{ev.node_type}] {ev.node_id}</span>
                          <span>{formatIstTimestamp(ev.created_at)}</span>
                        </div>
                        <div style={{ color: '#334155' }}>
                          Event: <strong>{ev.event_type}</strong>
                        </div>
                        {ev.payload?.accumulatedReplies?.length > 0 && (
                          <div style={{ marginTop: '4px', background: '#F1F5F9', padding: '6px 8px', borderRadius: '4px', fontSize: '0.70rem' }}>
                            {ev.payload.accumulatedReplies.join('\n')}
                          </div>
                        )}
                      </div>
                    ))}
                    {(!inspectSessionData?.events || inspectSessionData.events.length === 0) && (
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontStyle: 'italic' }}>
                        No audit events recorded for this session.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Drawer Footer Actions */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', background: '#F8FAFC' }}>
            <button
              type="button"
              onClick={() => handleResetSession(inspectSessionId)}
              style={{
                border: '1px solid #FECDD3',
                background: '#FFF1F2',
                color: '#BE123C',
                padding: '5px 12px',
                borderRadius: '5px',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reset Session
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectSessionId(null);
                setInspectSessionData(null);
              }}
              style={{
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#475569',
                padding: '5px 12px',
                borderRadius: '5px',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Global Settings Drawer */}
      {globalSettingsOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '460px',
          height: '100vh',
          background: '#FFFFFF',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.90rem', color: '#0F172A' }}>
                Global Escapes &amp; Navigation
              </span>
              <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                Tenant-wide Back, Menu, and Agent routing keywords
              </div>
            </div>
            <button
              type="button"
              onClick={() => setGlobalSettingsOpen(false)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSaveGlobalSettings} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Root Menu Flow
              </label>
              <select
                value={globalSettings?.root_flow_id || ''}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, root_flow_id: e.target.value ? Number(e.target.value) : null }))}
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px' }}
              >
                <option value="">None (Restart current active flow)</option>
                {flows.filter(f => f.status === 'PUBLISHED').map(f => (
                  <option key={f.id} value={f.id}>{f.name} (ID: {f.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Main Menu Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={(globalSettings?.menu_keywords || []).join(', ')}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, menu_keywords: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }))}
                placeholder="menu, restart, main menu"
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Back Navigation Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={(globalSettings?.back_keywords || []).join(', ')}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, back_keywords: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }))}
                placeholder="0, back, previous"
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Human Agent Handoff Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={(globalSettings?.handoff_keywords || []).join(', ')}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, handoff_keywords: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) }))}
                placeholder="agent, human, help, support"
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Session Inactivity TTL (Minutes)
              </label>
              <input
                type="number"
                value={globalSettings?.session_ttl_minutes || 1440}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, session_ttl_minutes: parseInt(e.target.value, 10) || 1440 }))}
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                Global Fallback Message
              </label>
              <textarea
                rows={3}
                value={globalSettings?.fallback_message || ''}
                onChange={(e) => setGlobalSettings(prev => ({ ...prev, fallback_message: e.target.value }))}
                style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setGlobalSettingsOpen(false)}
                style={{ padding: '6px 12px', fontSize: '0.76rem', border: '1px solid #CBD5E1', borderRadius: '5px', background: '#FFF' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                style={{ padding: '6px 14px', fontSize: '0.76rem', fontWeight: 600, border: 'none', borderRadius: '5px', background: '#2F5219', color: '#FFF', cursor: 'pointer' }}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Flow Modal */}
      {createModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15,23,42,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 150
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '8px',
            width: '420px',
            padding: '20px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.94rem', fontWeight: 700, color: '#0F172A' }}>
              Create New Flow
            </h3>
            <form onSubmit={handleCreateFlow} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Flow Name
                </label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  placeholder="e.g. Lead Qualification Journey"
                  required
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Flow Role
                </label>
                <select
                  value={newFlowRole}
                  onChange={(e) => setNewFlowRole(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', background: '#FFF' }}
                >
                  <option value="MAIN">MAIN (Primary Customer Flow)</option>
                  <option value="SUBFLOW">SUBFLOW (Modular Callable Sub-Journey)</option>
                  <option value="ROOT_MENU">ROOT_MENU (Main Menu Navigation Hub)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '4px' }}>
                  Trigger Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={newFlowKeywords}
                  onChange={(e) => setNewFlowKeywords(e.target.value)}
                  placeholder="hi, hello, quote, booking"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{ padding: '6px 12px', fontSize: '0.76rem', border: '1px solid #CBD5E1', borderRadius: '5px', background: '#FFF' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '6px 14px', fontSize: '0.76rem', fontWeight: 600, border: 'none', borderRadius: '5px', background: '#2F5219', color: '#FFF', cursor: 'pointer' }}
                >
                  Create &amp; Open Canvas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-Memory Test Simulator Modal */}
      {simulatorOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(15,23,42,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            width: '440px',
            height: '700px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F8FAFC'
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0F172A' }}>
                  WhatsApp In-Memory Test Sandbox
                </span>
                <div style={{ fontSize: '0.68rem', color: '#16A34A', fontWeight: 600 }}>
                  Zero live dispatch · Pure simulation
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimulatorOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <FlowSimulatorPanel
                flow={selectedFlow || flows.find(f => f.id === selectedFlowId)}
                currentNodes={canvasNodes}
                currentTransitions={canvasTransitions}
                token={token}
              />
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Industry Blueprints Modal */}
      <IndustryBlueprintsModal
        isOpen={blueprintsModalOpen}
        onClose={() => setBlueprintsModalOpen(false)}
        onBlueprintApplied={handleBlueprintApplied}
        onOpenFlow={(flowId) => {
          setBlueprintsModalOpen(false);
          handleOpenFlowInCanvas(flowId);
        }}
        onOpenProfile={() => {
          setBlueprintsModalOpen(false);
          setBusinessProfileDrawerOpen(true);
        }}
      />

      {/* Business Profile Setup Drawer */}
      <BusinessProfileSetupDrawer
        isOpen={businessProfileDrawerOpen}
        onClose={() => setBusinessProfileDrawerOpen(false)}
        onProfileUpdated={async () => {
          await loadFlows();
          await loadGlobalSettings();
        }}
        flows={flows}
      />
    </div>
  );
}
