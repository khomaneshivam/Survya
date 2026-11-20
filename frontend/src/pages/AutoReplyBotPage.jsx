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
  FileSpreadsheet,
  PhoneCall,
  DollarSign,
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
  Hotel,
  HelpCircle,
  X,
  Tag,
  Copy,
  ChevronDown,
  Layers
} from 'lucide-react';

import FlowCanvas from '../components/flow-studio/FlowCanvas';
import NodeInspectorDrawer from '../components/flow-studio/NodeInspectorDrawer';
import StepJourneyDesigner from '../components/flow-studio/StepJourneyDesigner';
import FlowTemplatesModal from '../components/flow-studio/FlowTemplatesModal';
import FlowVersionsModal from '../components/flow-studio/FlowVersionsModal';
import FlowSimulatorPanel from '../components/flow-studio/FlowSimulatorPanel';
import MessageTemplatesStudio from '../components/flow-studio/MessageTemplatesStudio';
import FlowAnalyticsPanel from '../components/flow-studio/FlowAnalyticsPanel';
import FlowExecutionsModal from '../components/flow-studio/FlowExecutionsModal';

function TabSaveFooter({ hasUnsavedChanges, saving, onSave }) {
  return (
    <div style={{
      marginTop: '28px',
      paddingTop: '16px',
      borderTop: '1px solid #E5E5E8',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      <div style={{ fontSize: '0.82rem', color: hasUnsavedChanges ? '#D97706' : '#67676B', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {hasUnsavedChanges ? (
          <>
            <AlertTriangle size={15} color="#D97706" />
            <span style={{ fontWeight: 600 }}>Unsaved changes in this section</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={15} color="#2F5219" />
            <span>All settings saved to database</span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => onSave()}
        disabled={saving}
        className="btn btn-primary"
        style={{
          gap: '7px',
          fontSize: '0.84rem',
          fontWeight: 600,
          background: '#2F5219',
          borderColor: '#2F5219',
          padding: '8px 18px',
          boxShadow: '0 2px 6px rgba(47,82,25,0.2)'
        }}
      >
        {saving ? <RotateCcw size={15} className="spin" /> : <Save size={15} />}
        <span>{saving ? 'Saving Changes...' : 'Save Configuration'}</span>
      </button>
    </div>
  );
}

export default function AutoReplyBotPage({ onNavigate }) {
  const { token, isAdmin } = useAuth();

  // Primary Configuration State
  const [settings, setSettings] = useState({
    enabled: true,
    mode: 'ONCE_PER_CONTACT',
    engineMode: 'HOSPITALITY_FLOW',
    strictInboundOnly: true,
    sessionTimeoutMinutes: 30,
    businessName: 'KonkanTrip Beach Resort & Spa',
    welcomeMessage: '👋 Hello {{name}}! Welcome to *{{business_name}}*.\n\nHow can we help you today? Select an option below or reply with your travel dates to check real-time availability and live rates! 👇',
    fallbackMessage: 'Hi {{name}}, thank you for reaching out to {{business_name}}! We have received your message and our team will get back to you shortly.',
    button1: 'This Weekend',
    button2: 'Tomorrow (2 N)',
    button3: 'Talk to Staff',
    quoteConfirm: 'Confirm Booking',
    quoteModify: 'Change Dates',
    quoteRooms: 'Other Rooms',
    confirmedButton1: 'Facilities',
    confirmedButton2: 'Dining Menu',
    confirmedButton3: 'Location / Map',
    handoffPhone: '+91 87665 90634',
    handoffMessage: '🤝 *Connecting You with Our Front Desk*\n\nOur reservations staff has been alerted and will message you directly on this chat shortly.\n\n📞 For urgent queries, call us directly at {{phone}}.',
    selectedFlowId: 'flow_hospitality_booking',
    takeoverPauseMinutes: 60,
    dynamicOptions: []
  });

  const [originalSettings, setOriginalSettings] = useState(null);
  const [publishedFlows, setPublishedFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Compute dirty unsaved state
  const hasUnsavedChanges = useMemo(() => {
    if (!originalSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(originalSettings);
  }, [settings, originalSettings]);

  // Active Tab: 'engine' | 'greeting' | 'flow' | 'quote' | 'handoff' | 'dynamic'
  const [activeTab, setActiveTab] = useState('engine');

  // Preview Stage for Phone Mockup: 'welcome' | 'flow' | 'quote' | 'confirmed' | 'handoff' | 'dynamic'
  const [previewStage, setPreviewStage] = useState('welcome');

  // Contact Bot Status Tester (Pause/Resume tool)
  const [testPhone, setTestPhone] = useState('919876543210');
  const [botStatusData, setBotStatusData] = useState(null);
  const [checkingBotStatus, setCheckingBotStatus] = useState(false);
  const [statusActionMessage, setStatusActionMessage] = useState(null);

  // Dynamic Rule Modal / Inline Form State
  const [editingRule, setEditingRule] = useState(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  // In-Memory Test Console (Zero-API sandbox)
  const [simInput, setSimInput] = useState('');
  const [simLog, setSimLog] = useState([
    { sender: 'bot', text: '👋 Hello Sunil! Welcome to *KonkanTrip Beach Resort & Spa*. How can we assist you today?', time: '10:00 AM' }
  ]);

  // Conversation Flow & Automation Studio State
  const [studioMode, setStudioMode] = useState('BUILDER'); // 'BUILDER' | 'LIBRARY' | 'MESSAGES' | 'SIMULATOR' | 'ANALYTICS' | 'LEGACY'
  const [flowsList, setFlowsList] = useState([]);
  const [activeFlowId, setActiveFlowId] = useState(null);
  const [activeFlow, setActiveFlow] = useState(null);
  const [currentNodes, setCurrentNodes] = useState([]);
  const [currentTransitions, setCurrentTransitions] = useState([]);
  const [currentVariables, setCurrentVariables] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [activeSimulatedNodeId, setActiveSimulatedNodeId] = useState(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [executionsModalOpen, setExecutionsModalOpen] = useState(false);
  const [templatesList, setTemplatesList] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validationReport, setValidationReport] = useState(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [builderDesignerView, setBuilderDesignerView] = useState('STEPS'); // 'STEPS' | 'CANVAS'

  // Auth Headers helper
  const getAuthHeaders = useCallback(() => {
    const activeToken = token || localStorage.getItem('token');
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  }, [token]);

  // Load flow details & canvas nodes
  const loadFlowDetails = useCallback(async (flowId) => {
    if (!flowId) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/flows/conversation-flows/${flowId}`, { headers });
      const data = await res.json();
      if (data.success && data.flow) {
        setActiveFlow(data.flow);
        setActiveFlowId(data.flow.id);
        const version = data.draftVersion || data.publishedVersion;
        if (version) {
          setCurrentNodes(version.nodes || []);
          setCurrentTransitions(version.transitions || []);
          setCurrentVariables(version.variables || {});
          setSelectedNodeId((version.nodes || [])[0]?.id || null);
        }
      }
    } catch (err) {
      console.error('Failed to load flow details:', err);
    }
  }, [getAuthHeaders]);

  // Load Auto-Reply Settings, Published Flows & Conversation Flows
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers = getAuthHeaders();
      const [settingsRes, flowsRes, convFlowsRes, tplsRes] = await Promise.all([
        fetch('/api/replies/auto-reply-settings', { headers }),
        fetch('/api/flows?status=PUBLISHED', { headers }).catch(() => null),
        fetch('/api/flows/conversation-flows', { headers }).catch(() => null),
        fetch('/api/flows/conversation-templates', { headers }).catch(() => null)
      ]);

      if (settingsRes.ok) {
        const resData = await settingsRes.json();
        if (resData.success && resData.data) {
          const loadedOptions = (Array.isArray(resData.data.dynamicOptions) ? resData.data.dynamicOptions : []).map(r => ({
            ...r,
            matchTerms: r.matchTerms || r.triggers || '',
            triggers: r.triggers || r.matchTerms || '',
            matcherType: r.matcherType || r.matchType || 'CONTAINS',
            matchType: r.matchType || r.matcherType || 'CONTAINS',
            responsePayload: r.responsePayload || r.responseText || '',
            responseText: r.responseText || r.responsePayload || '',
            actionType: r.actionType || r.action || 'REPLY_TEXT',
            isActive: r.isActive !== false && r.active !== false,
            active: r.active !== false && r.isActive !== false
          }));
          const loaded = {
            ...resData.data,
            fallbackMessage: resData.data.fallbackMessage || resData.data.message || '',
            message: resData.data.fallbackMessage || resData.data.message || '',
            dynamicOptions: loadedOptions
          };
          setSettings(loaded);
          setOriginalSettings(loaded);
        }
      } else {
        throw new Error(`Failed to load settings (status: ${settingsRes.status})`);
      }

      if (flowsRes && flowsRes.ok) {
        const flowsData = await flowsRes.json();
        if (flowsData.success && Array.isArray(flowsData.data)) {
          setPublishedFlows(flowsData.data);
        }
      }

      if (convFlowsRes && convFlowsRes.ok) {
        const convData = await convFlowsRes.json();
        if (convData.success && Array.isArray(convData.flows)) {
          setFlowsList(convData.flows);
          if (convData.flows.length > 0) {
            const firstId = convData.flows[0].id;
            loadFlowDetails(firstId);
          }
        }
      }

      if (tplsRes && tplsRes.ok) {
        const tplsData = await tplsRes.json();
        if (tplsData.success && Array.isArray(tplsData.templates)) {
          setTemplatesList(tplsData.templates);
        }
      }
    } catch (err) {
      console.error('[AutoReplyBotPage] loadData error:', err);
      setErrorMsg(err.message || 'Failed to load bot settings.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, loadFlowDetails]);

  // Flow Studio Actions
  const handleSaveFlowDraft = async () => {
    if (!activeFlowId) return;
    setSavingDraft(true);
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/flows/conversation-flows/${activeFlowId}/draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nodes: currentNodes,
          transitions: currentTransitions,
          variables: currentVariables,
          changelog: 'Saved via Visual Studio Builder'
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        loadFlowDetails(activeFlowId);
      } else {
        alert(data.error || 'Failed to save draft');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingDraft(false);
    }
  };

  const handlePublishFlow = async () => {
    if (!activeFlowId) return;
    setPublishing(true);
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      // Save draft first
      await fetch(`/api/flows/conversation-flows/${activeFlowId}/draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          nodes: currentNodes,
          transitions: currentTransitions,
          variables: currentVariables,
          changelog: 'Pre-publish auto snapshot'
        })
      });

      const res = await fetch(`/api/flows/conversation-flows/${activeFlowId}/publish`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
        loadFlowDetails(activeFlowId);
        loadData();
      } else {
        alert(data.error || 'Failed to publish flow');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleValidateFlow = async () => {
    if (!activeFlowId) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/flows/conversation-flows/${activeFlowId}/validate`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setValidationReport(data.report);
        setValidationModalOpen(true);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCreateNewFlow = async () => {
    const name = window.prompt('Enter name for the new Conversation Flow:', 'Custom Customer Journey');
    if (!name || !name.trim()) return;
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch('/api/flows/conversation-flows', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          description: 'Custom conversation flow created from studio',
          category: 'CUSTOM',
          nodes: [
            {
              id: 'node_trigger',
              type: 'TRIGGER_WHATSAPP',
              title: 'WhatsApp Trigger',
              position: { x: 100, y: 150 },
              config: {
                triggerType: 'KEYWORD',
                keywords: ['hi', 'hello'],
                matchType: 'CONTAINS'
              }
            },
            {
              id: 'node_welcome',
              type: 'SEND_MESSAGE',
              title: 'Welcome Message',
              position: { x: 380, y: 150 },
              config: { text: 'Hello! Welcome to our automated service. How can we assist you today?' }
            },
            {
              id: 'node_end',
              type: 'END',
              title: 'End Conversation',
              position: { x: 660, y: 150 },
              config: { farewellMessage: 'Thank you for reaching out!' }
            }
          ],
          transitions: [
            {
              id: 't_trg_welcome',
              source: 'node_trigger',
              target: 'node_welcome',
              sourceHandle: 'default'
            },
            {
              id: 't_welcome_end',
              source: 'node_welcome',
              target: 'node_end',
              sourceHandle: 'default'
            }
          ],
          variables: {}
        })
      });
      const data = await res.json();
      if (data.success && data.flow) {
        setFlowsList(prev => [data.flow, ...prev]);
        setActiveFlowId(data.flow.id);
        loadFlowDetails(data.flow.id);
        setStudioMode('BUILDER');
      } else {
        alert(data.error || 'Failed to create new flow');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleArchiveFlow = async (flowId, flowName) => {
    if (!window.confirm(`Are you sure you want to archive flow "${flowName}"?`)) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/flows/conversation-flows/${flowId}/archive`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setFlowsList(prev => prev.filter(f => f.id !== flowId));
        if (activeFlowId === flowId) {
          const remaining = flowsList.filter(f => f.id !== flowId);
          if (remaining.length > 0) {
            setActiveFlowId(remaining[0].id);
            loadFlowDetails(remaining[0].id);
          } else {
            setActiveFlowId(null);
            setActiveFlow(null);
            setCurrentNodes([]);
            setCurrentTransitions([]);
          }
        }
      } else {
        alert(data.error || 'Failed to archive flow');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleRollback = async (verNumber) => {
    if (!activeFlowId) return;
    const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/flows/conversation-flows/${activeFlowId}/rollback`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ targetVersionNumber: verNumber })
    });
    const data = await res.json();
    if (data.success) {
      loadFlowDetails(activeFlowId);
    }
  };

  const handleCloneTemplate = async (templateSlug, customName) => {
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/flows/conversation-templates/${templateSlug}/clone`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: customName })
      });
      const data = await res.json();
      if (data.success && data.flow) {
        setTemplatesModalOpen(false);
        setStudioMode('BUILDER');
        loadData();
        loadFlowDetails(data.flow.id);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDuplicateFlow = async () => {
    if (!activeFlowId) return;
    try {
      const headers = { ...getAuthHeaders(), 'Content-Type': 'application/json' };
      const res = await fetch(`/api/flows/conversation-flows/${activeFlowId}/duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: `${activeFlow?.name || 'Flow'} (Copy)` })
      });
      const data = await res.json();
      if (data.success && data.flow) {
        setFlowsList(prev => [data.flow, ...prev]);
        loadFlowDetails(data.flow.id);
      }
    } catch (e) {
      alert(e.message);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save Settings to Backend
  const handleSave = async (customPayload = null) => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);
    const payloadToSave = customPayload || settings;
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      };

      const res = await fetch('/api/replies/auto-reply-settings', {
        method: 'POST',
        headers,
        body: JSON.stringify(payloadToSave)
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.message || 'Failed to save settings');
      }

      if (resData.data) {
        const loadedOptions = (Array.isArray(resData.data.dynamicOptions) ? resData.data.dynamicOptions : []).map(r => ({
          ...r,
          matchTerms: r.matchTerms || r.triggers || '',
          triggers: r.triggers || r.matchTerms || '',
          matcherType: r.matcherType || r.matchType || 'CONTAINS',
          matchType: r.matchType || r.matcherType || 'CONTAINS',
          responsePayload: r.responsePayload || r.responseText || '',
          responseText: r.responseText || r.responsePayload || '',
          actionType: r.actionType || r.action || 'REPLY_TEXT',
          isActive: r.isActive !== false && r.active !== false,
          active: r.active !== false && r.isActive !== false
        }));
        const updated = {
          ...resData.data,
          fallbackMessage: resData.data.fallbackMessage || resData.data.message || '',
          message: resData.data.fallbackMessage || resData.data.message || '',
          dynamicOptions: loadedOptions
        };
        setSettings(updated);
        setOriginalSettings(updated);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
      return true;
    } catch (err) {
      console.error('[AutoReplyBotPage] Save error:', err);
      setErrorMsg(err.message || 'Failed to save settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMasterBot = async () => {
    const nextEnabled = !settings.enabled;
    const nextSettings = { ...settings, enabled: nextEnabled };
    setSettings(nextSettings);
    await handleSave(nextSettings);
  };

  // Check / Manage Live Contact Bot Status
  const handleCheckContactStatus = async () => {
    if (!testPhone.trim()) return;
    setCheckingBotStatus(true);
    setStatusActionMessage(null);
    try {
      const clean = testPhone.replace(/\D/g, '');
      const res = await fetch(`/api/inbox/bot-status/${clean}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setBotStatusData(data.data);
      } else {
        setStatusActionMessage({ type: 'error', text: data.message || 'Error checking bot status' });
      }
    } catch (err) {
      setStatusActionMessage({ type: 'error', text: err.message });
    } finally {
      setCheckingBotStatus(false);
    }
  };

  const handleToggleContactBot = async (shouldPause) => {
    if (!testPhone.trim()) return;
    setCheckingBotStatus(true);
    try {
      const clean = testPhone.replace(/\D/g, '');
      const res = await fetch(`/api/inbox/bot-status/${clean}`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          paused: shouldPause,
          durationMinutes: settings.takeoverPauseMinutes || 60,
          reason: shouldPause ? 'Staff manual pause from Bot Manager' : 'Resumed from Bot Manager'
        })
      });
      const data = await res.json();
      if (data.success) {
        setBotStatusData(data.data);
        setStatusActionMessage({
          type: 'success',
          text: shouldPause
            ? `Bot successfully paused for ${clean} for ${settings.takeoverPauseMinutes} minutes.`
            : `Bot successfully resumed for ${clean}.`
        });
      } else {
        setStatusActionMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setStatusActionMessage({ type: 'error', text: err.message });
    } finally {
      setCheckingBotStatus(false);
    }
  };

  // Rule Save / Edit / Delete Helpers
  const handleOpenAddRule = () => {
    setEditingRule({
      id: `dyn_${Date.now()}`,
      title: '',
      description: '',
      matcherType: 'CONTAINS',
      matchTerms: '',
      actionType: 'REPLY_TEXT',
      responsePayload: '',
      priority: (settings.dynamicOptions?.length || 0) + 1,
      isActive: true
    });
    setRuleModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!editingRule || !editingRule.title?.trim() || !(editingRule.matchTerms?.trim() || editingRule.triggers?.trim())) {
      alert('Please provide a Title and at least one Match Term.');
      return;
    }
    const cleanTerms = (editingRule.matchTerms || editingRule.triggers || '').trim();
    const cleanText = (editingRule.responsePayload || editingRule.responseText || '').trim();
    const cleanMatcher = editingRule.matcherType || editingRule.matchType || 'CONTAINS';
    const cleanAction = editingRule.actionType || 'REPLY_TEXT';

    const sanitizedRule = {
      ...editingRule,
      title: editingRule.title.trim(),
      matchTerms: cleanTerms,
      triggers: cleanTerms,
      matcherType: cleanMatcher,
      matchType: cleanMatcher,
      responsePayload: cleanText,
      responseText: cleanText,
      actionType: cleanAction,
      isActive: editingRule.isActive !== false && editingRule.active !== false,
      active: editingRule.isActive !== false && editingRule.active !== false
    };

    const current = Array.isArray(settings.dynamicOptions) ? [...settings.dynamicOptions] : [];
    const idx = current.findIndex(r => r.id === editingRule.id);
    if (idx >= 0) {
      current[idx] = sanitizedRule;
    } else {
      current.push(sanitizedRule);
    }
    const nextSettings = { ...settings, dynamicOptions: current };
    setSettings(nextSettings);
    setRuleModalOpen(false);
    setEditingRule(null);
    await handleSave(nextSettings);
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this custom dynamic rule?')) return;
    const nextOptions = (settings.dynamicOptions || []).filter(r => r.id !== ruleId);
    const nextSettings = { ...settings, dynamicOptions: nextOptions };
    setSettings(nextSettings);
    await handleSave(nextSettings);
  };

  const handleToggleRuleActive = async (ruleId) => {
    const nextOptions = (settings.dynamicOptions || []).map(r =>
      r.id === ruleId ? { ...r, isActive: !r.isActive, active: !r.isActive } : r
    );
    const nextSettings = { ...settings, dynamicOptions: nextOptions };
    setSettings(nextSettings);
    await handleSave(nextSettings);
  };

  // Interactive In-Memory Simulation Dispatcher
  const handleSimSend = (textToSend) => {
    const query = (textToSend || simInput).trim();
    if (!query) return;

    const userMsg = { sender: 'user', text: query, time: 'Just now' };
    const newLog = [...simLog, userMsg];

    // Determine Simulated Response
    const lower = query.toLowerCase();
    let botReply = '';

    // Check custom dynamic rules first
    const activeRules = (settings.dynamicOptions || []).filter(r => r.isActive !== false);
    const matchedRule = activeRules.find(r => {
      const terms = (r.matchTerms || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      if (r.matcherType === 'EXACT') {
        return terms.includes(lower);
      }
      if (r.matcherType === 'STARTS_WITH') {
        return terms.some(t => lower.startsWith(t));
      }
      return terms.some(t => lower.includes(t));
    });

    if (matchedRule) {
      botReply = `⚡ [Dynamic Rule: ${matchedRule.title}]\n\n${matchedRule.responsePayload || 'Action executed successfully.'}`;
    } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
      botReply = settings.welcomeMessage
        .replace(/\{\{name\}\}/g, 'Sunil')
        .replace(/\{\{business_name\}\}/g, settings.businessName || 'KonkanTrip Beach Resort & Spa');
    } else if (lower.includes('staff') || lower.includes('talk') || lower.includes('front desk') || lower.includes('help')) {
      botReply = settings.handoffMessage.replace(/\{\{phone\}\}/g, settings.handoffPhone);
    } else if (lower.includes('book') || lower.includes('weekend') || lower.includes('tomorrow') || lower.includes('rate') || lower.includes('quote')) {
      botReply = `💰 *Instant Quote & Availability for KonkanTrip*\n\n📅 *Dates:* Sat, 22 Nov – Sun, 23 Nov (1 Night)\n🏨 *Room Category:* Deluxe AC Sea View Cottage\n👥 *Guests:* 2 Adults\n\n💵 *Total Tariff:* ₹4,800 (Taxes included)\n\nTap below to confirm this quote instantly:`;
    } else if (lower.includes('confirm') || lower.includes('facilities') || lower.includes('menu')) {
      botReply = `🎉 *Reservation Pre-Confirmed!*\n\nBooking ID: #KT-98305\nOur front desk will send your digital voucher shortly.`;
    } else {
      botReply = settings.fallbackMessage
        .replace(/\{\{name\}\}/g, 'Sunil')
        .replace(/\{\{business_name\}\}/g, settings.businessName || 'KonkanTrip Beach Resort & Spa');
    }

    newLog.push({ sender: 'bot', text: botReply, time: 'Just now' });
    setSimLog(newLog);
    setSimInput('');
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1600px', margin: '0 auto', color: '#171719' }}>
      {/* Page Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #2F5219 0%, #4B7828 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(47,82,25,0.22)'
          }}>
            <BotMessageSquare size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: '#171719' }}>
                Conversational Concierge &amp; Auto-Reply Bot
              </h1>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                background: settings.enabled ? '#EDF4E6' : '#F4F4F5',
                color: settings.enabled ? '#2F5219' : '#71717A',
                border: settings.enabled ? '1px solid #C3D1AC' : '1px solid #E4E4E7',
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                {settings.enabled ? 'Bot Active' : 'Bot Disabled'}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                background: '#EEF5FB',
                color: '#2876B8',
                border: '1px solid #C4DCF0',
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                Zero Cost Leakage Gateway
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.86rem', color: '#67676B' }}>
              Configure inbound conversational automation, Meta Flow intake forms, WhatsApp interactive buttons, instant quotes, and admin-programmable triggers.
            </p>
          </div>
        </div>

        {/* Global Control Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleToggleMasterBot}
            disabled={saving}
            className="btn btn-secondary"
            style={{
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 600,
              background: settings.enabled ? '#FEF2F2' : '#F3F6EE',
              color: settings.enabled ? '#992F2D' : '#2F5219',
              borderColor: settings.enabled ? '#FDB1AF' : '#C3D1AC'
            }}
          >
            {settings.enabled ? <Pause size={15} /> : <Play size={15} />}
            <span>{settings.enabled ? 'Pause Master Bot' : 'Enable Master Bot'}</span>
          </button>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary"
            style={{ gap: '6px', fontSize: '0.84rem' }}
            title="Reload from database"
          >
            <RotateCcw size={15} className={loading ? 'spin' : ''} />
            <span>Reload</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{
              gap: '8px',
              fontSize: '0.84rem',
              fontWeight: 600,
              background: '#2F5219',
              borderColor: '#2F5219',
              boxShadow: '0 2px 8px rgba(47,82,25,0.25)'
            }}
          >
            {saving ? <RotateCcw size={16} className="spin" /> : <Save size={16} />}
            <span>{saving ? 'Saving Changes...' : 'Save Configuration'}</span>
          </button>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('inbox')}
              className="btn btn-secondary"
              style={{ gap: '6px', fontSize: '0.84rem' }}
            >
              <MessageSquare size={15} />
              <span>Go to Inbox</span>
            </button>
          )}
        </div>
      </div>

      {/* Save Success Alert Banner */}
      {saveSuccess && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#EDF4E6',
          border: '1px solid #C3D1AC',
          color: '#2F5219',
          borderRadius: '10px',
          padding: '12px 18px',
          marginBottom: '20px',
          fontSize: '0.88rem',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} />
          <span>Bot configuration saved successfully! Live webhook router and phone queue updated.</span>
        </div>
      )}

      {/* Error Alert Banner */}
      {errorMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#FEF2F2',
          border: '1px solid #FDB1AF',
          color: '#992F2D',
          borderRadius: '10px',
          padding: '12px 18px',
          marginBottom: '20px',
          fontSize: '0.88rem'
        }}>
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Safety & Cost Protection Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E5E5E8',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#EDF4E6', color: '#2F5219', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#67676B', fontWeight: 600 }}>DEDUPLICATION POLICY</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#171719' }}>
              {settings.mode === 'ONCE_PER_CONTACT' ? 'Safe: Once Per Contact' : settings.mode === 'ONCE_PER_24_HOURS' ? 'Daily: Once Every 24h' : 'Always Respond'}
            </div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E5E5E8',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#EEF5FB', color: '#2876B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#67676B', fontWeight: 600 }}>ENGINE MODE</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#171719' }}>
              {settings.engineMode === 'FLOW_STUDIO' ? 'Flow Studio Engine' : settings.engineMode === 'HOSPITALITY_FLOW' ? 'Hospitality Guided Flow' : 'Simple Greeting & FAQ'}
            </div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E5E5E8',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: settings.strictInboundOnly ? '#EDF4E6' : '#FEF3C7', color: settings.strictInboundOnly ? '#2F5219' : '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#67676B', fontWeight: 600 }}>STRICT RESPONSE MODE</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#171719' }}>
              {settings.strictInboundOnly ? 'Strict: Inbound Reaction Only' : 'Standard Auto-Reply'}
            </div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          borderRadius: '10px',
          border: '1px solid #E5E5E8',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: '#F3F6EE', color: '#3F5724', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#67676B', fontWeight: 600 }}>SESSION OPEN LIMIT</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#171719' }}>
              {settings.sessionTimeoutMinutes || 30} Min Inactivity Window
            </div>
          </div>
        </div>
      </div>

      {/* Master Studio Mode Switcher */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E5E5E8',
        padding: '10px 14px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'BUILDER', label: 'Visual Flow Builder', icon: GitBranch, color: '#2F5219' },
            { id: 'LIBRARY', label: 'Flows & Blueprints', icon: Library, color: '#2563EB' },
            { id: 'MESSAGES', label: 'Message Templates', icon: MessageSquare, color: '#7C3AED' },
            { id: 'SIMULATOR', label: 'Test Simulator', icon: Smartphone, color: '#D97706' },
            { id: 'ANALYTICS', label: 'Analytics & Reports', icon: BarChart3, color: '#059669' },
            { id: 'LEGACY', label: 'Channel Settings & Rules', icon: Sliders, color: '#475569' }
          ].map(m => {
            const Icon = m.icon;
            const isSelected = studioMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setStudioMode(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: isSelected ? `1.5px solid ${m.color}` : '1px solid transparent',
                  background: isSelected ? `${m.color}15` : 'transparent',
                  color: isSelected ? m.color : '#475569',
                  fontSize: '0.86rem',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} color={isSelected ? m.color : '#64748B'} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {activeFlow && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.8rem',
            color: '#475569',
            background: '#F1F5F9',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #E2E8F0'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: activeFlow.status === 'PUBLISHED' ? '#16A34A' : '#F59E0B'
            }} />
            <span>Active Flow: <strong>{activeFlow.name}</strong></span>
          </div>
        )}
      </div>

      {/* MODE 1: VISUAL FLOW BUILDER */}
      {studioMode === 'BUILDER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Builder Action Toolbar */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E5E5E8',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#67676B' }}>Flow:</span>
                <select
                  value={activeFlowId || ''}
                  onChange={e => {
                    const val = e.target.value;
                    setActiveFlowId(val);
                    loadFlowDetails(val);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#1E293B',
                    cursor: 'pointer'
                  }}
                >
                  {flowsList.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.status === 'PUBLISHED' ? 'Published' : 'Draft'})
                    </option>
                  ))}
                </select>
              </div>

              {activeFlow && (
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '12px',
                  textTransform: 'uppercase',
                  background: activeFlow.status === 'PUBLISHED' ? '#DCFCE7' : '#FEF3C7',
                  color: activeFlow.status === 'PUBLISHED' ? '#166534' : '#92400E',
                  border: activeFlow.status === 'PUBLISHED' ? '1px solid #BBF7D0' : '1px solid #FDE68A'
                }}>
                  {activeFlow.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </span>
              )}

              <button
                type="button"
                onClick={() => setTemplatesModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={14} color="#6366F1" />
                <span>Blueprints</span>
              </button>

              <button
                type="button"
                onClick={() => setVersionsModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <History size={14} color="#64748B" />
                <span>Version History</span>
              </button>

              <button
                type="button"
                onClick={() => setExecutionsModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <Clock size={14} color="#0D9488" />
                <span>Execution Logs</span>
              </button>

              <button
                type="button"
                onClick={handleDuplicateFlow}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <Copy size={14} color="#2563EB" />
                <span>Duplicate</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Dual View Toggle: Step-by-Step Guided Journey vs Visual Node Canvas */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#F1F5F9',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1'
              }}>
                <button
                  type="button"
                  onClick={() => setBuilderDesignerView('STEPS')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    fontSize: '0.8rem',
                    fontWeight: builderDesignerView === 'STEPS' ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    background: builderDesignerView === 'STEPS' ? '#FFFFFF' : 'transparent',
                    color: builderDesignerView === 'STEPS' ? '#2F5219' : '#64748B',
                    cursor: 'pointer',
                    boxShadow: builderDesignerView === 'STEPS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <Layers size={14} />
                  <span>Step-by-Step Flow List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderDesignerView('CANVAS')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    fontSize: '0.8rem',
                    fontWeight: builderDesignerView === 'CANVAS' ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    background: builderDesignerView === 'CANVAS' ? '#FFFFFF' : 'transparent',
                    color: builderDesignerView === 'CANVAS' ? '#2F5219' : '#64748B',
                    cursor: 'pointer',
                    boxShadow: builderDesignerView === 'CANVAS' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <GitBranch size={14} />
                  <span>Visual Graph Canvas</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleValidateFlow}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <CheckSquare size={14} color="#059669" />
                <span>Validate Graph</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (builderDesignerView === 'CANVAS') {
                    setSimulatorOpen(prev => !prev);
                  } else {
                    setStudioMode('SIMULATOR');
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: simulatorOpen && builderDesignerView === 'CANVAS' ? '1px solid #2F5219' : '1px solid #FDE68A',
                  background: simulatorOpen && builderDesignerView === 'CANVAS' ? '#E8F5E9' : '#FEF3C7',
                  color: simulatorOpen && builderDesignerView === 'CANVAS' ? '#2F5219' : '#92400E',
                  cursor: 'pointer'
                }}
              >
                <Smartphone size={14} />
                <span>{simulatorOpen && builderDesignerView === 'CANVAS' ? 'Close Simulator' : 'Zero-Cost Simulator'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveFlowDraft}
                disabled={savingDraft}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#1E293B',
                  cursor: 'pointer'
                }}
              >
                {savingDraft ? <RotateCcw size={14} className="spin" /> : <Save size={14} />}
                <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
              </button>

              <button
                type="button"
                onClick={handlePublishFlow}
                disabled={publishing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2F5219',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
                }}
              >
                {publishing ? <RotateCcw size={14} className="spin" /> : <Play size={14} />}
                <span>{publishing ? 'Publishing...' : 'Publish to Live'}</span>
              </button>
            </div>
          </div>

          {/* Main Flow Editor Area: Step-by-Step Journey View or Visual Node Canvas */}
          {builderDesignerView === 'STEPS' ? (
            <StepJourneyDesigner
              nodes={currentNodes}
              transitions={currentTransitions}
              onUpdateNodes={setCurrentNodes}
              onUpdateTransitions={setCurrentTransitions}
              onSelectNode={setSelectedNodeId}
              selectedNodeId={selectedNodeId}
              onOpenSimulator={() => setStudioMode('SIMULATOR')}
            />
          ) : (
            <div style={{
              display: 'flex',
              height: '760px',
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E5E5E8',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{ flex: 1, height: '100%', position: 'relative' }}>
                <FlowCanvas
                  nodes={currentNodes}
                  transitions={currentTransitions}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onUpdateNodes={setCurrentNodes}
                  onUpdateTransitions={setCurrentTransitions}
                  activeSimulatedNodeId={activeSimulatedNodeId}
                />
              </div>

              {selectedNodeId && currentNodes.find(n => n.id === selectedNodeId) && (
                <NodeInspectorDrawer
                  node={currentNodes.find(n => n.id === selectedNodeId)}
                  nodes={currentNodes}
                  variables={currentVariables}
                  onUpdateNode={updated => {
                    setCurrentNodes(nodes => nodes.map(n => n.id === updated.id ? updated : n));
                  }}
                  onClose={() => setSelectedNodeId(null)}
                />
              )}

              {simulatorOpen && (
                <div style={{ width: '380px', height: '100%', borderLeft: '1px solid #E5E5E8', position: 'relative', zIndex: 10 }}>
                  <FlowSimulatorPanel
                    flow={activeFlow}
                    currentNodes={currentNodes}
                    currentTransitions={currentTransitions}
                    token={token}
                    onActiveNodeChange={setActiveSimulatedNodeId}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODE 2: FLOWS & STARTER BLUEPRINTS */}
      {studioMode === 'LIBRARY' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E5E5E8',
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', color: '#171719' }}>
                Conversation Flows &amp; Customer Journeys
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#67676B', margin: 0 }}>
                Manage multi-turn conversation workflows, customer onboarding funnels, and automated quotation journeys.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setTemplatesModalOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#1E293B',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Sparkles size={16} color="#6366F1" />
                <span>Browse Blueprints</span>
              </button>

              <button
                type="button"
                onClick={handleCreateNewFlow}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2F5219',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
                }}
              >
                <Plus size={16} />
                <span>Create New Flow</span>
              </button>
            </div>
          </div>

          {/* Flows Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px'
          }}>
            {flowsList.map(flow => {
              const isCurrent = activeFlowId === flow.id;
              return (
                <div
                  key={flow.id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: isCurrent ? '2px solid #2F5219' : '1px solid #E5E5E8',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: isCurrent ? '0 4px 12px rgba(47,82,25,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        textTransform: 'uppercase',
                        background: flow.status === 'PUBLISHED' ? '#DCFCE7' : '#FEF3C7',
                        color: flow.status === 'PUBLISHED' ? '#166534' : '#92400E',
                        border: flow.status === 'PUBLISHED' ? '1px solid #BBF7D0' : '1px solid #FDE68A'
                      }}>
                        {flow.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </span>

                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '10px',
                        background: '#F1F5F9',
                        color: '#475569',
                        border: '1px solid #E2E8F0'
                      }}>
                        {flow.category || 'HOSPITALITY'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#171719', margin: '0 0 6px 0' }}>
                      {flow.name}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0, lineHeight: 1.45, minHeight: '38px' }}>
                      {flow.description || 'Custom multi-turn automated customer conversation journey.'}
                    </p>
                  </div>

                  <div style={{
                    paddingTop: '14px',
                    borderTop: '1px solid #F1F5F9',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748B' }}>
                      <span>Flow ID: <code>{flow.uuid ? `${String(flow.uuid).substring(0, 14)}...` : `#${flow.id}`}</code></span>
                      <span>Active v{flow.published_version_number || flow.publishedVersionNumber || 1}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFlowId(flow.id);
                          loadFlowDetails(flow.id);
                          setStudioMode('BUILDER');
                        }}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '7px 12px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          background: '#F8FAFC',
                          color: '#1E293B',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={13} />
                        <span>Edit in Builder</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveFlow(flow);
                          setActiveFlowId(flow.id);
                          setVersionsModalOpen(true);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #E2E8F0',
                          background: '#FFFFFF',
                          color: '#475569',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title="Version History & Rollback"
                      >
                        <History size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveFlowId(flow.id);
                          loadFlowDetails(flow.id);
                          setStudioMode('SIMULATOR');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #FDE68A',
                          background: '#FEF3C7',
                          color: '#92400E',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title="Simulate in Zero-Cost Sandbox"
                      >
                        <Smartphone size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleArchiveFlow(flow.id, flow.name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #FEE2E2',
                          background: '#FEF2F2',
                          color: '#DC2626',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title="Archive Flow"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Starter Templates Highlight Section */}
          <div style={{
            marginTop: '12px',
            background: '#F8FAFC',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '24px'
          }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 4px 0', color: '#1E293B' }}>
                  ⚡ Pre-Engineered Starter Journeys
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748B', margin: 0 }}>
                  Clone industry-tested conversation blueprints with 1-click and customize them on the visual canvas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplatesModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2F5219',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>View All Blueprints</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {templatesList.map(tpl => (
                <div
                  key={tpl.slug}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: '#EDF4E6',
                        color: '#2F5219',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Hotel size={16} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1E293B' }}>{tpl.title}</div>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#64748B', margin: 0, lineHeight: 1.45 }}>
                      {tpl.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCloneTemplate(tpl.slug, `${tpl.title} (Clone)`)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '7px 12px',
                      borderRadius: '6px',
                      border: '1px solid #C3D1AC',
                      background: '#EDF4E6',
                      color: '#2F5219',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Copy size={13} />
                    <span>Clone Blueprint</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODE 3: MESSAGE TEMPLATES STUDIO */}
      {studioMode === 'MESSAGES' && (
        <MessageTemplatesStudio token={token} />
      )}

      {/* MODE 4: TEST SIMULATOR SANDBOX */}
      {studioMode === 'SIMULATOR' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#171719' }}>
                  Interactive Flow Simulator &amp; Sandbox
                </h2>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: '#EDF4E6',
                  color: '#2F5219',
                  border: '1px solid #C3D1AC',
                  padding: '2px 8px',
                  borderRadius: '10px'
                }}>
                  Zero Meta API Costs
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#67676B' }}>
                Simulate multi-turn journeys, button clicks, quotes, and state transitions in memory. No live WhatsApp messages are dispatched.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#67676B' }}>Simulating Flow:</span>
              <select
                value={activeFlowId || ''}
                onChange={e => {
                  const val = e.target.value;
                  setActiveFlowId(val);
                  loadFlowDetails(val);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF'
                }}
              >
                {flowsList.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <FlowSimulatorPanel
            flow={activeFlow}
            currentNodes={currentNodes}
            currentTransitions={currentTransitions}
            token={token}
            onActiveNodeChange={setActiveSimulatedNodeId}
          />
        </div>
      )}

      {/* MODE 5: ANALYTICS & REPORTS */}
      {studioMode === 'ANALYTICS' && (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', color: '#171719' }}>
                Conversation Funnel &amp; Dropoff Analytics
              </h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#67676B' }}>
                Real-time conversation metrics, completion conversion rates, and staff handoff escalations.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#67676B' }}>Flow:</span>
              <select
                value={activeFlowId || ''}
                onChange={e => {
                  const val = e.target.value;
                  setActiveFlowId(val);
                  loadFlowDetails(val);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF'
                }}
              >
                {flowsList.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <FlowAnalyticsPanel flowId={activeFlowId} token={token} />
        </div>
      )}

      {/* MODE 6: LEGACY CHANNEL SETTINGS & DIRECT RULES */}
      {studioMode === 'LEGACY' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{
          background: '#F3F6EE',
          border: '1.5px solid #2F5219',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 2px 6px rgba(47,82,25,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#2F5219', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#171719' }}>
                Looking to customize your conversation journey, questions &amp; buttons?
              </div>
              <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '2px' }}>
                You no longer need to use static button fields! Use the modern <strong>Step-by-Step Flow Designer</strong> to configure any questions, data validations, and dynamic buttons.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStudioMode('BUILDER')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              background: '#2F5219',
              color: '#FFFFFF',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 5px rgba(47,82,25,0.2)'
            }}
          >
            <span>Open Step-by-Step Flow Designer</span>
            <span>➔</span>
          </button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(380px, 1fr)',
          gap: '24px',
          alignItems: 'start'
        }}>
        {/* Left Column: Configuration Workspace */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          boxShadow: 'var(--shadow-xs)',
          overflow: 'hidden'
        }}>
          {/* Sub-Navigation Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #E5E5E8',
            background: '#FAFAFB',
            overflowX: 'auto'
          }}>
            {[
              { id: 'engine', label: 'Engine & Dispatch', icon: Sliders },
              { id: 'greeting', label: 'Greeting & Buttons', icon: MessageSquare },
              { id: 'flow', label: 'Meta Form Intake', icon: FileSpreadsheet },
              { id: 'quote', label: 'Quotes & Actions', icon: DollarSign },
              { id: 'handoff', label: 'Front Desk Handoff', icon: PhoneCall },
              { id: 'dynamic', label: '⚡ Dynamic Rules', icon: Zap }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'greeting') setPreviewStage('welcome');
                    if (tab.id === 'flow') setPreviewStage('flow');
                    if (tab.id === 'quote') setPreviewStage('quote');
                    if (tab.id === 'handoff') setPreviewStage('handoff');
                    if (tab.id === 'dynamic') setPreviewStage('dynamic');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '14px 18px',
                    fontSize: '0.84rem',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#2F5219' : '#67676B',
                    borderBottom: isActive ? '2px solid #2F5219' : '2px solid transparent',
                    background: isActive ? '#FFFFFF' : 'transparent',
                    borderTop: 'none',
                    borderLeft: 'none',
                    borderRight: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Body */}
          <div style={{ padding: '24px' }}>
            {/* TAB 1: Engine & Dispatch Mode */}
            {activeTab === 'engine' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>Automation Engine &amp; Dispatch Guardrails</h3>
                  <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                    Control how the bot behaves when receiving inbound customer messages and prevent unnecessary outbound charges.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Business Name for Messages</label>
                  <input
                    type="text"
                    value={settings.businessName}
                    onChange={e => setSettings(prev => ({ ...prev, businessName: e.target.value }))}
                    className="input-field"
                    placeholder="e.g. KonkanTrip Beach Resort & Spa"
                    style={{ padding: '9px 12px', fontSize: '0.88rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#96969C' }}>
                    Replaces the <code>{'{{business_name}}'}</code> placeholder in welcome and handoff messages.
                  </span>
                </div>

                {/* Engine Mode Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Automation Engine Mode</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div
                      onClick={() => setSettings(prev => ({ ...prev, engineMode: 'FLOW_STUDIO' }))}
                      style={{
                        border: settings.engineMode === 'FLOW_STUDIO' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                        background: settings.engineMode === 'FLOW_STUDIO' ? '#F3F6EE' : '#FFFFFF',
                        borderRadius: '10px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2F5219' }}>✨ Flow Studio Engine</span>
                        {settings.engineMode === 'FLOW_STUDIO' && <CheckCircle2 size={18} color="#2F5219" />}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#67676B', margin: 0, lineHeight: 1.45 }}>
                        Visual conversation flows with custom branching, input collection, server-side quotes &amp; CRM actions.
                      </p>
                    </div>

                    <div
                      onClick={() => setSettings(prev => ({ ...prev, engineMode: 'HOSPITALITY_FLOW' }))}
                      style={{
                        border: settings.engineMode === 'HOSPITALITY_FLOW' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                        background: settings.engineMode === 'HOSPITALITY_FLOW' ? '#F3F6EE' : '#FFFFFF',
                        borderRadius: '10px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2F5219' }}>🏨 Hospitality Guided Flow</span>
                        {settings.engineMode === 'HOSPITALITY_FLOW' && <CheckCircle2 size={18} color="#2F5219" />}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#67676B', margin: 0, lineHeight: 1.45 }}>
                        Interactive conversation with real-time room pricing, quick date selection, booking confirmation, and front desk handoff.
                      </p>
                    </div>

                    <div
                      onClick={() => setSettings(prev => ({ ...prev, engineMode: 'SIMPLE_GREETING' }))}
                      style={{
                        border: settings.engineMode === 'SIMPLE_GREETING' ? '2px solid #2F5219' : '1px solid #E5E5E8',
                        background: settings.engineMode === 'SIMPLE_GREETING' ? '#F3F6EE' : '#FFFFFF',
                        borderRadius: '10px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#171719' }}>💬 Simple Greeting &amp; FAQ</span>
                        {settings.engineMode === 'SIMPLE_GREETING' && <CheckCircle2 size={18} color="#2F5219" />}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#67676B', margin: 0, lineHeight: 1.45 }}>
                        Sends a single welcome reply and 3 quick buttons to new visitors without guided hospitality quoting.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dispatch Frequency Policy */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    Dispatch Frequency &amp; Cost Protection Policy
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      {
                        value: 'ONCE_PER_CONTACT',
                        title: 'Once Per Contact (Recommended — Maximum Cost Safety)',
                        desc: 'The bot replies only on the first contact from each customer. It will never send repeat automated replies to existing chats unless an interactive button is tapped.'
                      },
                      {
                        value: 'ONCE_PER_24_HOURS',
                        title: 'Once Every 24 Hours',
                        desc: 'Resets daily. If a guest returns after 24 hours of inactivity, the bot sends a fresh greeting.'
                      },
                      {
                        value: 'ALWAYS',
                        title: 'Always (Active Responder)',
                        desc: 'Replies to every inbound conversation turn that does not match an acknowledgment keyword.'
                      }
                    ].map(opt => (
                      <label
                        key={opt.value}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '12px 14px',
                          border: settings.mode === opt.value ? '1px solid #C3D1AC' : '1px solid #E5E5E8',
                          background: settings.mode === opt.value ? '#F3F6EE' : '#FFFFFF',
                          borderRadius: '8px',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="radio"
                          name="bot_mode"
                          checked={settings.mode === opt.value}
                          onChange={() => setSettings(prev => ({ ...prev, mode: opt.value }))}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#171719' }}>{opt.title}</div>
                          <div style={{ fontSize: '0.76rem', color: '#67676B', marginTop: '2px' }}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Strict Inbound-Reactive Mode Control */}
                <div style={{
                  background: settings.strictInboundOnly ? '#F0FDF4' : '#FFFBEB',
                  border: settings.strictInboundOnly ? '1.5px solid #86EFAC' : '1px solid #FDE68A',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ShieldCheck size={20} color={settings.strictInboundOnly ? '#16A34A' : '#D97706'} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B' }}>
                        Strict Inbound-Only Mode (Zero Unsolicited Messages)
                      </span>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={settings.strictInboundOnly}
                        onChange={e => setSettings(prev => ({ ...prev, strictInboundOnly: e.target.checked }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2F5219' }}
                      />
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: settings.strictInboundOnly ? '#166534' : '#92400E' }}>
                        {settings.strictInboundOnly ? 'STRICT MODE ACTIVE' : 'STANDARD MODE'}
                      </span>
                    </label>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>
                    When enabled, the bot replies <strong>strictly</strong> in immediate reaction to a customer's inbound message. If a customer does not reply or goes inactive, <strong>NO automated follow-ups, reminder nudges, or unprovoked timer messages will ever be dispatched</strong>.
                  </p>
                </div>

                {/* Connection Session Open Limit (Inactivity Timeout) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                      Connection Session Open Limit (Inactivity Timeout)
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      Auto-closes waiting sessions with zero messages sent
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    {[
                      { minutes: 15, label: '15 Minutes', badge: 'Quick' },
                      { minutes: 30, label: '30 Minutes', badge: 'Recommended' },
                      { minutes: 60, label: '1 Hour', badge: 'Standard' },
                      { minutes: 120, label: '2 Hours', badge: 'Extended' },
                      { minutes: 1440, label: '24 Hours', badge: 'Meta Max' }
                    ].map(t => {
                      const isSelected = (settings.sessionTimeoutMinutes || 30) === t.minutes;
                      return (
                        <div
                          key={t.minutes}
                          onClick={() => setSettings(prev => ({ ...prev, sessionTimeoutMinutes: t.minutes }))}
                          style={{
                            border: isSelected ? '2px solid #2F5219' : '1px solid #E5E5E8',
                            background: isSelected ? '#F3F6EE' : '#FFFFFF',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isSelected ? '#2F5219' : '#171719' }}>
                            {t.label}
                          </div>
                          <div style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            marginTop: '4px',
                            color: isSelected ? '#2F5219' : '#64748B'
                          }}>
                            {t.badge}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '0.76rem', color: '#64748B', lineHeight: 1.4 }}>
                    If a guest stops replying midway through a conversation flow, the session stays open for this duration. Once timed out, it transitions to <code>EXPIRED</code> silently. If they reply later, a fresh conversation begins without stale state.
                  </span>
                </div>

                {/* 5-Layer Send Gateway Notice */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '16px',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <ShieldCheck size={24} color="#0284C7" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                    <strong style={{ color: '#0F172A' }}>SARVYA Active Send Protection Active:</strong>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '18px' }}>
                      <li><strong>WABA Echo Shield:</strong> Discards self-sent messages and echoes.</li>
                      <li><strong>Closure Filter:</strong> Messages like "ok", "thanks", "bye" are acknowledged silently without sending paid messages.</li>
                      <li><strong>Non-Conversational Filter:</strong> Reactions, stickers, and status updates trigger zero API sends.</li>
                      <li><strong>Single Payload Rule:</strong> Outbound responses are sent as 1 consolidated message instead of multiple pieces.</li>
                    </ul>
                  </div>
                </div>

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}

            {/* TAB 2: Welcome Greeting & Quick Buttons */}
            {activeTab === 'greeting' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>Welcome Greeting &amp; Quick Reply Buttons</h3>
                  <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                    Customize the message visitors see when they message your WhatsApp number, and configure 3 interactive quick reply buttons.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Welcome Message (Interactive / Hospitality)</label>
                    <span style={{ fontSize: '0.75rem', color: '#96969C' }}>Supports WhatsApp formatting (*bold*, _italic_)</span>
                  </div>
                  <textarea
                    rows={4}
                    value={settings.welcomeMessage}
                    onChange={e => setSettings(prev => ({ ...prev, welcomeMessage: e.target.value }))}
                    className="input-field"
                    style={{ padding: '10px 12px', fontSize: '0.86rem', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['{{name}}', '{{business_name}}', '{{phone}}'].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setSettings(prev => ({ ...prev, welcomeMessage: prev.welcomeMessage + ` ${tag}` }))}
                        style={{
                          fontSize: '0.72rem',
                          background: '#F4F4F5',
                          border: '1px solid #E4E4E7',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          cursor: 'pointer'
                        }}
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Simple Greeting Fallback</label>
                  <textarea
                    rows={2}
                    value={settings.fallbackMessage}
                    onChange={e => setSettings(prev => ({ ...prev, fallbackMessage: e.target.value }))}
                    className="input-field"
                    style={{ padding: '8px 12px', fontSize: '0.86rem', resize: 'vertical' }}
                  />
                </div>

                {/* 3 Interactive Buttons with strict 20-char validation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Interactive Quick Buttons (Max 3)</label>
                    <span style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600 }}>
                      ⚠ Meta WhatsApp API strictly enforces max 20 characters per button title
                    </span>
                  </div>

                  {[
                    { key: 'button1', label: 'Button 1' },
                    { key: 'button2', label: 'Button 2' },
                    { key: 'button3', label: 'Button 3' }
                  ].map(b => {
                    const text = settings[b.key] || '';
                    const len = text.length;
                    const isOver = len > 20;
                    return (
                      <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '70px', color: '#67676B' }}>{b.label}:</span>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input
                            type="text"
                            maxLength={20}
                            value={text}
                            onChange={e => setSettings(prev => ({ ...prev, [b.key]: e.target.value }))}
                            className="input-field"
                            placeholder="Max 20 chars"
                            style={{
                              padding: '8px 48px 8px 12px',
                              fontSize: '0.86rem',
                              borderColor: isOver ? '#DC2626' : undefined
                            }}
                          />
                          <span style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: isOver ? '#DC2626' : len >= 18 ? '#D97706' : '#96969C'
                          }}>
                            {len}/20
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}

            {/* TAB 3: Meta Flow & Form Intake */}
            {activeTab === 'flow' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>WhatsApp Flow &amp; In-Chat Form Intake</h3>
                  <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                    Select which published WhatsApp Flow is triggered when a customer taps your booking CTA.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Active Published Meta Flow</label>
                  <select
                    value={settings.selectedFlowId || 'flow_hospitality_booking'}
                    onChange={e => setSettings(prev => ({ ...prev, selectedFlowId: e.target.value }))}
                    className="input-field"
                    style={{ padding: '9px 12px', fontSize: '0.88rem' }}
                  >
                    <option value="flow_hospitality_booking">🏨 Resort Booking &amp; Quote Intake (flow_hospitality_booking)</option>
                    {publishedFlows.map(f => (
                      <option key={f.id} value={f.meta_flow_id || f.id}>
                        {f.name} ({f.meta_flow_id || f.id}) — {f.status}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', color: '#67676B' }}>
                    Guests on supported WhatsApp versions receive a native bottom-sheet intake screen. If unsupported, the bot falls back gracefully to in-chat conversational questions.
                  </span>
                </div>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '16px'
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#0F172A', marginBottom: '8px' }}>
                    Intake Fields Collected by Selected Flow:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#059669" />
                      <span>Check-In Date (Calendar picker)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#059669" />
                      <span>Check-Out Date / Nights count</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#059669" />
                      <span>Room Category (Deluxe Sea View, etc.)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#059669" />
                      <span>Guests (Adults &amp; Children)</span>
                    </div>
                  </div>
                </div>

                {onNavigate && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => onNavigate('flows')}
                      className="btn btn-secondary"
                      style={{ gap: '6px', fontSize: '0.82rem' }}
                    >
                      <ExternalLink size={14} />
                      <span>Open Forms &amp; Flow Builder</span>
                    </button>
                  </div>
                )}

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}

            {/* TAB 4: Quotation & Post-Enquiry Buttons */}
            {activeTab === 'quote' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>Quotation &amp; Post-Enquiry Buttons</h3>
                  <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                    Configure the quick action buttons presented to the guest immediately after receiving a live quote.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Post-Quote Action Buttons (Max 20 chars each)</label>

                  {[
                    { key: 'quoteConfirm', label: 'Confirm Action', default: 'Confirm Booking' },
                    { key: 'quoteModify', label: 'Modify Dates', default: 'Change Dates' },
                    { key: 'quoteRooms', label: 'Room Types', default: 'Other Rooms' }
                  ].map(b => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '110px', color: '#67676B' }}>{b.label}:</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type="text"
                          maxLength={20}
                          value={settings[b.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [b.key]: e.target.value }))}
                          className="input-field"
                          placeholder={b.default}
                          style={{ padding: '8px 48px 8px 12px', fontSize: '0.86rem' }}
                        />
                        <span style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#96969C'
                        }}>
                          {(settings[b.key] || '').length}/20
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Post-Confirmation Action Buttons</label>

                  {[
                    { key: 'confirmedButton1', label: 'Info Button 1', default: 'Facilities' },
                    { key: 'confirmedButton2', label: 'Info Button 2', default: 'Dining Menu' },
                    { key: 'confirmedButton3', label: 'Info Button 3', default: 'Location / Map' }
                  ].map(b => (
                    <div key={b.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, width: '110px', color: '#67676B' }}>{b.label}:</span>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type="text"
                          maxLength={20}
                          value={settings[b.key] || ''}
                          onChange={e => setSettings(prev => ({ ...prev, [b.key]: e.target.value }))}
                          className="input-field"
                          placeholder={b.default}
                          style={{ padding: '8px 48px 8px 12px', fontSize: '0.86rem' }}
                        />
                        <span style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#96969C'
                        }}>
                          {(settings[b.key] || '').length}/20
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}

            {/* TAB 5: Front Desk Handoff & Bot Pausing */}
            {activeTab === 'handoff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>Front Desk Handoff &amp; Bot Takeover</h3>
                  <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                    When a guest asks for a human agent or staff sends a manual reply, the bot pauses automatically.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Front Desk Escalation Phone</label>
                    <input
                      type="text"
                      value={settings.handoffPhone}
                      onChange={e => setSettings(prev => ({ ...prev, handoffPhone: e.target.value }))}
                      className="input-field"
                      placeholder="+91 87665 90634"
                      style={{ padding: '8px 12px', fontSize: '0.86rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Takeover Pause Duration (Minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={settings.takeoverPauseMinutes}
                      onChange={e => setSettings(prev => ({ ...prev, takeoverPauseMinutes: parseInt(e.target.value, 10) || 60 }))}
                      className="input-field"
                      style={{ padding: '8px 12px', fontSize: '0.86rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 600 }}>Handoff Confirmation Message</label>
                  <textarea
                    rows={3}
                    value={settings.handoffMessage}
                    onChange={e => setSettings(prev => ({ ...prev, handoffMessage: e.target.value }))}
                    className="input-field"
                    style={{ padding: '8px 12px', fontSize: '0.86rem', resize: 'vertical' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#96969C' }}>
                    Use <code>{'{{phone}}'}</code> to display your front desk telephone number.
                  </span>
                </div>

                {/* Live Contact Pause/Resume Management Console */}
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <PhoneCall size={16} color="#0284C7" />
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A' }}>
                      Live Contact Bot Status &amp; Takeover Tool
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '0 0 12px 0' }}>
                    Enter any customer phone number to verify whether the bot is currently paused for them, or manually pause/resume the bot for that guest.
                  </p>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                    <input
                      type="text"
                      value={testPhone}
                      onChange={e => setTestPhone(e.target.value)}
                      placeholder="e.g. 919876543210"
                      className="input-field"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '0.86rem' }}
                    />
                    <button
                      type="button"
                      onClick={handleCheckContactStatus}
                      disabled={checkingBotStatus}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                    >
                      {checkingBotStatus ? 'Checking...' : 'Check Status'}
                    </button>
                  </div>

                  {botStatusData && (
                    <div style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                          Phone: {botStatusData.phone}
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: botStatusData.paused ? '#FEF2F2' : '#EDF4E6',
                          color: botStatusData.paused ? '#992F2D' : '#2F5219'
                        }}>
                          {botStatusData.paused ? `Paused (${botStatusData.remainingMinutes} min left)` : 'Bot Active for Guest'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {botStatusData.paused ? (
                          <button
                            type="button"
                            onClick={() => handleToggleContactBot(false)}
                            disabled={checkingBotStatus}
                            className="btn btn-primary"
                            style={{ fontSize: '0.78rem', padding: '6px 12px', background: '#2F5219' }}
                          >
                            Resume Bot for Contact
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleContactBot(true)}
                            disabled={checkingBotStatus}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.78rem', padding: '6px 12px', color: '#DC2626' }}
                          >
                            Pause Bot for Contact
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {statusActionMessage && (
                    <div style={{
                      fontSize: '0.8rem',
                      color: statusActionMessage.type === 'error' ? '#DC2626' : '#16A34A',
                      fontWeight: 600
                    }}>
                      {statusActionMessage.text}
                    </div>
                  )}
                </div>

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}

            {/* TAB 6: ⚡ Dynamic Rules Engine (Admin Programmable) */}
            {activeTab === 'dynamic' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                      Admin-Programmable Dynamic Rules Engine
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#67676B', margin: 0 }}>
                      Define custom keywords, trigger patterns, and actions without writing or altering backend code.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenAddRule}
                    className="btn btn-primary"
                    style={{ gap: '6px', fontSize: '0.82rem', background: '#2F5219' }}
                  >
                    <Plus size={15} />
                    <span>Create Dynamic Rule</span>
                  </button>
                </div>

                {/* Rules List / Table */}
                {(settings.dynamicOptions || []).length === 0 ? (
                  <div style={{
                    padding: '36px 20px',
                    textAlign: 'center',
                    background: '#FAFAFB',
                    border: '1px dashed #D4D4D9',
                    borderRadius: '10px'
                  }}>
                    <Zap size={32} color="#96969C" style={{ margin: '0 auto 10px auto' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#171719' }}>No Custom Rules Defined</div>
                    <p style={{ fontSize: '0.8rem', color: '#67676B', maxWidth: '420px', margin: '6px auto 16px auto' }}>
                      Add programmable rules to reply automatically when guests ask for menus, pool hours, taxi tariffs, or custom amenities.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenAddRule}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem' }}
                    >
                      + Add First Rule
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(settings.dynamicOptions || []).map((rule, idx) => (
                      <div
                        key={rule.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 16px',
                          border: '1px solid #E5E5E8',
                          borderRadius: '8px',
                          background: rule.isActive !== false ? '#FFFFFF' : '#FAFAFB',
                          opacity: rule.isActive !== false ? 1 : 0.7
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleToggleRuleActive(rule.id)}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: rule.isActive !== false ? '#EDF4E6' : '#F4F4F5',
                              color: rule.isActive !== false ? '#2F5219' : '#96969C',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title={rule.isActive !== false ? 'Click to deactivate rule' : 'Click to activate rule'}
                          >
                            {rule.isActive !== false ? <Check size={16} /> : <Pause size={14} />}
                          </button>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#171719' }}>
                                {rule.title}
                              </span>
                              <span style={{
                                fontSize: '0.7rem',
                                background: '#EEF5FB',
                                color: '#2876B8',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontWeight: 600
                              }}>
                                {rule.matcherType || 'CONTAINS'}
                              </span>
                              <span style={{
                                fontSize: '0.7rem',
                                background: '#F3F6EE',
                                color: '#3F5724',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontWeight: 600
                              }}>
                                {rule.actionType || 'REPLY_TEXT'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.78rem', color: '#67676B', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              Keywords: <code style={{ background: '#F4F4F5', padding: '1px 4px', borderRadius: '3px' }}>{rule.matchTerms}</code> • Response: {rule.responsePayload?.slice(0, 50)}...
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRule({ ...rule });
                              setRuleModalOpen(true);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                            title="Edit Rule"
                          >
                            <Edit2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.76rem', color: '#DC2626' }}
                            title="Delete Rule"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <TabSaveFooter
                  hasUnsavedChanges={hasUnsavedChanges}
                  saving={saving}
                  onSave={handleSave}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live WhatsApp Phone Simulator & Interactive Sandbox */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Phone Shell */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '24px',
            border: '8px solid #1E293B',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '620px'
          }}>
            {/* WhatsApp App Bar */}
            <div style={{
              background: '#075E54',
              color: '#FFFFFF',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  color: '#075E54',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem'
                }}>
                  KT
                </div>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>{settings.businessName || 'KonkanTrip Resort'}</span>
                    <CheckCircle2 size={13} color="#25D366" />
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.85 }}>WhatsApp Verified Business</div>
                </div>
              </div>
            </div>

            {/* Stage Selector Pills */}
            <div style={{
              display: 'flex',
              background: '#ECE5DD',
              borderBottom: '1px solid #D8D2CA',
              padding: '6px 8px',
              gap: '4px',
              overflowX: 'auto'
            }}>
              {[
                { id: 'welcome', label: '👋 Welcome' },
                { id: 'flow', label: '📋 Flow Screen' },
                { id: 'quote', label: '💰 Quote' },
                { id: 'confirmed', label: '🎉 Confirmed' },
                { id: 'handoff', label: '📞 Handoff' },
                { id: 'dynamic', label: '⚡ Rule' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setPreviewStage(st.id)}
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: previewStage === st.id ? 700 : 500,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: previewStage === st.id ? '#075E54' : 'rgba(255,255,255,0.7)',
                    color: previewStage === st.id ? '#FFFFFF' : '#334155',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* WhatsApp Chat Canvas */}
            <div style={{
              flex: 1,
              background: '#E5DDD5',
              padding: '14px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {/* STAGE: WELCOME GREETING */}
              {previewStage === 'welcome' && (
                <>
                  <div style={{
                    alignSelf: 'flex-end',
                    background: '#E7FFDB',
                    color: '#111827',
                    padding: '8px 12px',
                    borderRadius: '8px 8px 0 8px',
                    fontSize: '0.82rem',
                    maxWidth: '80%',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                  }}>
                    Hi, can you share room details and tariff for this weekend?
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '2px' }}>10:14 AM</div>
                  </div>

                  <div style={{
                    alignSelf: 'flex-start',
                    background: '#FFFFFF',
                    color: '#111827',
                    padding: '10px 12px',
                    borderRadius: '8px 8px 8px 0',
                    fontSize: '0.82rem',
                    maxWidth: '88%',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                    whiteSpace: 'pre-line'
                  }}>
                    {settings.welcomeMessage
                      .replace(/\{\{name\}\}/g, 'Guest')
                      .replace(/\{\{business_name\}\}/g, settings.businessName || 'KonkanTrip Beach Resort & Spa')}
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '4px' }}>10:14 AM</div>
                  </div>

                  {/* 3 WhatsApp Quick Reply Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '88%' }}>
                    {[settings.button1, settings.button2, settings.button3].filter(Boolean).map((btn, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          if (i === 0) setPreviewStage('quote');
                          if (i === 1) setPreviewStage('flow');
                          if (i === 2) setPreviewStage('handoff');
                        }}
                        style={{
                          background: '#FFFFFF',
                          color: '#075E54',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          textAlign: 'center',
                          padding: '8px',
                          borderRadius: '6px',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                          cursor: 'pointer'
                        }}
                      >
                        {btn}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* STAGE: FLOW SCREEN */}
              {previewStage === 'flow' && (
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  padding: '14px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ fontSize: '0.72rem', color: '#075E54', fontWeight: 700, textTransform: 'uppercase' }}>
                    WhatsApp Native Flow Screen
                  </div>
                  <h4 style={{ fontSize: '0.92rem', margin: '4px 0 10px 0' }}>Plan Your Stay at {settings.businessName}</h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#64748B' }}>Check-In:</span> <strong>Sat, 22 Nov 2026</strong>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#64748B' }}>Check-Out:</span> <strong>Sun, 23 Nov 2026 (1 Night)</strong>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#64748B' }}>Category:</span> <strong>Deluxe Sea View Villa</strong>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.78rem' }}>
                      <span style={{ color: '#64748B' }}>Occupancy:</span> <strong>2 Adults</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewStage('quote')}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      background: '#075E54',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    Submit Details &amp; Get Quote →
                  </button>
                </div>
              )}

              {/* STAGE: QUOTE */}
              {previewStage === 'quote' && (
                <>
                  <div style={{
                    alignSelf: 'flex-start',
                    background: '#FFFFFF',
                    color: '#111827',
                    padding: '10px 12px',
                    borderRadius: '8px 8px 8px 0',
                    fontSize: '0.82rem',
                    maxWidth: '88%',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                  }}>
                    💰 <strong>Instant Quote for {settings.businessName}</strong>
                    <br /><br />
                    📅 <strong>Dates:</strong> Sat, 22 Nov – Sun, 23 Nov (1 Night)
                    <br />
                    🏨 <strong>Room:</strong> Deluxe AC Sea View Cottage
                    <br />
                    👥 <strong>Guests:</strong> 2 Adults
                    <br /><br />
                    💵 <strong>Total:</strong> ₹4,800 (Incl. Taxes &amp; Breakfast)
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '4px' }}>10:15 AM</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '88%' }}>
                    <div
                      onClick={() => setPreviewStage('confirmed')}
                      style={{
                        background: '#FFFFFF',
                        color: '#075E54',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '6px',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}
                    >
                      🎉 {settings.quoteConfirm || 'Confirm Booking'}
                    </div>
                    <div
                      onClick={() => setPreviewStage('flow')}
                      style={{
                        background: '#FFFFFF',
                        color: '#075E54',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '6px',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 {settings.quoteModify || 'Change Dates'}
                    </div>
                    <div
                      onClick={() => setPreviewStage('handoff')}
                      style={{
                        background: '#FFFFFF',
                        color: '#075E54',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        padding: '8px',
                        borderRadius: '6px',
                        boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                        cursor: 'pointer'
                      }}
                    >
                      📞 Call Front Desk
                    </div>
                  </div>
                </>
              )}

              {/* STAGE: CONFIRMED */}
              {previewStage === 'confirmed' && (
                <>
                  <div style={{
                    alignSelf: 'flex-start',
                    background: '#FFFFFF',
                    color: '#111827',
                    padding: '10px 12px',
                    borderRadius: '8px 8px 8px 0',
                    fontSize: '0.82rem',
                    maxWidth: '88%',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                  }}>
                    🎉 <strong>Booking Confirmed!</strong>
                    <br /><br />
                    Reference: <strong>#KT-98305</strong>
                    <br />
                    We look forward to hosting you at {settings.businessName}. Our front desk has been notified.
                    <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '4px' }}>10:16 AM</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '88%' }}>
                    {[settings.confirmedButton1, settings.confirmedButton2, settings.confirmedButton3].filter(Boolean).map((btn, i) => (
                      <div
                        key={i}
                        style={{
                          background: '#FFFFFF',
                          color: '#075E54',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                          textAlign: 'center',
                          padding: '8px',
                          borderRadius: '6px',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                        }}
                      >
                        {btn}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* STAGE: HANDOFF */}
              {previewStage === 'handoff' && (
                <div style={{
                  alignSelf: 'flex-start',
                  background: '#FFFFFF',
                  color: '#111827',
                  padding: '10px 12px',
                  borderRadius: '8px 8px 8px 0',
                  fontSize: '0.82rem',
                  maxWidth: '88%',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                  whiteSpace: 'pre-line'
                }}>
                  {settings.handoffMessage.replace(/\{\{phone\}\}/g, settings.handoffPhone)}
                  <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '4px' }}>10:17 AM</div>
                </div>
              )}

              {/* STAGE: DYNAMIC RULE PREVIEW */}
              {previewStage === 'dynamic' && (
                <div style={{
                  alignSelf: 'flex-start',
                  background: '#FFFFFF',
                  color: '#111827',
                  padding: '10px 12px',
                  borderRadius: '8px 8px 8px 0',
                  fontSize: '0.82rem',
                  maxWidth: '88%',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.1)'
                }}>
                  ⚡ <strong>Dynamic Rule Response</strong>
                  <br /><br />
                  {(settings.dynamicOptions && settings.dynamicOptions[0]) ? (
                    <div>
                      <em>Matched: {settings.dynamicOptions[0].title}</em>
                      <br /><br />
                      {settings.dynamicOptions[0].responsePayload}
                    </div>
                  ) : (
                    <div>No dynamic rule created yet. Add one in the Dynamic Rules tab.</div>
                  )}
                  <div style={{ fontSize: '0.65rem', color: '#6B7280', textAlign: 'right', marginTop: '4px' }}>10:18 AM</div>
                </div>
              )}
            </div>
          </div>

          {/* In-Memory Zero-API Sandbox Console */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E5E5E8',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} color="#2F5219" />
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Zero-Cost Inbound Sandbox Simulator</span>
              </div>
              <button
                type="button"
                onClick={() => setSimLog([])}
                style={{ fontSize: '0.72rem', color: '#96969C', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Clear Log
              </button>
            </div>

            <p style={{ fontSize: '0.76rem', color: '#67676B', margin: 0 }}>
              Test how the bot replies to custom phrases ("hi", "quote", "facilities", or your custom rule terms) without triggering Meta API charges.
            </p>

            <div style={{
              background: '#F8FAFC',
              borderRadius: '8px',
              padding: '10px',
              maxHeight: '140px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.78rem'
            }}>
              {simLog.map((log, i) => (
                <div key={i} style={{ color: log.sender === 'user' ? '#0369A1' : '#15803D' }}>
                  <strong>{log.sender === 'user' ? 'Customer:' : 'Bot:'}</strong> {log.text}
                </div>
              ))}
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSimSend();
              }}
              style={{ display: 'flex', gap: '8px' }}
            >
              <input
                type="text"
                value={simInput}
                onChange={e => setSimInput(e.target.value)}
                placeholder="Type a test phrase (e.g. hi, quote, menu)..."
                className="input-field"
                style={{ flex: 1, padding: '7px 10px', fontSize: '0.82rem' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '0.82rem', background: '#2F5219' }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Graph Validation Report Modal */}
      {validationModalOpen && validationReport && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid #E5E5E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: validationReport.isValid ? '#F0FDF4' : '#FEF2F2'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {validationReport.isValid ? (
                  <CheckCircle2 size={22} color="#16A34A" />
                ) : (
                  <AlertTriangle size={22} color="#DC2626" />
                )}
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: validationReport.isValid ? '#166534' : '#991B1B' }}>
                  {validationReport.isValid ? 'Graph Validation Passed' : 'Graph Validation Issues Detected'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setValidationModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#67676B' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '65vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>TOTAL CANVAS NODES</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1E293B' }}>{currentNodes.length}</div>
                </div>
                <div style={{ padding: '12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>TOTAL TRANSITIONS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1E293B' }}>{currentTransitions.length}</div>
                </div>
              </div>

              {validationReport.errors && validationReport.errors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} />
                    <span>Errors (Must be resolved before publishing):</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {validationReport.errors.map((err, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '0.82rem', color: '#991B1B' }}>
                        • {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationReport.warnings && validationReport.warnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} />
                    <span>Warnings &amp; Recommendations:</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {validationReport.warnings.map((warn, i) => (
                      <div key={i} style={{ padding: '8px 12px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '6px', fontSize: '0.82rem', color: '#92400E' }}>
                        • {warn}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {validationReport.isValid && (!validationReport.warnings || validationReport.warnings.length === 0) && (
                <p style={{ margin: 0, fontSize: '0.88rem', color: '#166534', lineHeight: 1.5 }}>
                  ✓ All start nodes, message prompts, transitions, and business action bindings are fully reachable and compliant with WhatsApp Cloud API constraints. You can safely publish this flow to live WhatsApp chats.
                </p>
              )}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E5E8', background: '#FAFAFB', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setValidationModalOpen(false)}
                className="btn btn-secondary"
                style={{ fontSize: '0.84rem' }}
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Starter Blueprints Modal */}
      <FlowTemplatesModal
        isOpen={templatesModalOpen}
        onClose={() => setTemplatesModalOpen(false)}
        templates={templatesList}
        onCloneTemplate={handleCloneTemplate}
      />

      {/* Version History & Rollback Modal */}
      <FlowVersionsModal
        isOpen={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        flow={activeFlow}
        token={token}
        onRollback={handleRollback}
      />

      {/* Execution History & Event Traces Modal */}
      {executionsModalOpen && (
        <FlowExecutionsModal
          flowId={activeFlowId}
          flowName={activeFlow?.name}
          token={token}
          onClose={() => setExecutionsModalOpen(false)}
        />
      )}

      {/* Admin Dynamic Rule Edit / Create Modal */}
      {ruleModalOpen && editingRule && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E5E5E8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                {String(editingRule?.id || '').startsWith('dyn_') && !editingRule?.title ? 'Create Dynamic Bot Rule' : 'Edit Dynamic Bot Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#67676B' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Rule Title</label>
                <input
                  type="text"
                  value={editingRule.title}
                  onChange={e => setEditingRule(r => ({ ...r, title: e.target.value }))}
                  placeholder="e.g. Swimming Pool &amp; Spa Timings"
                  className="input-field"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', marginTop: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Matcher Type</label>
                  <select
                    value={editingRule.matcherType || 'CONTAINS'}
                    onChange={e => setEditingRule(r => ({ ...r, matcherType: e.target.value }))}
                    className="input-field"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', marginTop: '4px' }}
                  >
                    <option value="CONTAINS">Contains Keyword</option>
                    <option value="EXACT">Exact Match</option>
                    <option value="STARTS_WITH">Starts With</option>
                    <option value="REGEX">Regular Expression</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Action Type</label>
                  <select
                    value={editingRule.actionType || 'REPLY_TEXT'}
                    onChange={e => setEditingRule(r => ({ ...r, actionType: e.target.value }))}
                    className="input-field"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', marginTop: '4px' }}
                  >
                    <option value="REPLY_TEXT">Reply with Text</option>
                    <option value="DISPATCH_FLOW">Dispatch Meta Flow</option>
                    <option value="STAFF_TAKEOVER">Handoff to Staff</option>
                    <option value="OPEN_URL">Send Link / URL</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  Trigger Keywords (Comma separated)
                </label>
                <input
                  type="text"
                  value={editingRule.matchTerms}
                  onChange={e => setEditingRule(r => ({ ...r, matchTerms: e.target.value }))}
                  placeholder="e.g. pool, swimming, swim, spa"
                  className="input-field"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', marginTop: '4px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                  Response Message / Payload
                </label>
                <textarea
                  rows={4}
                  value={editingRule.responsePayload}
                  onChange={e => setEditingRule(r => ({ ...r, responsePayload: e.target.value }))}
                  placeholder="The message sent when this rule triggers..."
                  className="input-field"
                  style={{ width: '100%', padding: '8px 12px', fontSize: '0.86rem', marginTop: '4px', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid #E5E5E8',
              background: '#FAFAFB',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                type="button"
                onClick={() => setRuleModalOpen(false)}
                className="btn btn-secondary"
                style={{ fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                disabled={saving}
                className="btn btn-primary"
                style={{ fontSize: '0.84rem', background: '#2F5219', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? <RotateCcw size={14} className="spin" /> : <Save size={14} />}
                <span>{saving ? 'Saving Rule...' : 'Save Rule to Database'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Unsaved Changes Warning & Quick-Save Bar */}
      {hasUnsavedChanges && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '18px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#F59E0B',
              boxShadow: '0 0 8px #F59E0B'
            }} />
            <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>
              You have unsaved bot configuration changes
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => originalSettings && setSettings({ ...originalSettings })}
              style={{
                background: 'transparent',
                color: '#94A3B8',
                border: '1px solid #475569',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              style={{
                background: '#2F5219',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 16px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(47,82,25,0.4)'
              }}
            >
              {saving ? <RotateCcw size={14} className="spin" /> : <Save size={14} />}
              <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
