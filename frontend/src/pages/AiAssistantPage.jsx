import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  KpiCard,
  Card,
  CardHeader,
  CardBody,
  Tabs,
  DataTable,
  Badge,
  Button,
  EmptyState
} from '../components/ui';
import {
  Bot,
  ShieldCheck,
  BookOpen,
  History,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Edit2,
  Send,
  Sparkles,
  Mic,
  Languages,
  UserCheck,
  Search,
  ExternalLink,
  HelpCircle,
  X
} from 'lucide-react';
import { formatIndianDateTime } from '../utils/indianTime';

export default function AiAssistantPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('configuration');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  // Agent Configuration State
  const [agentConfig, setAgentConfig] = useState({
    enabled: 0,
    business_persona: '',
    confidence_threshold: 0.65,
    max_ai_turns_before_handoff: 8,
    voice_transcription_enabled: 1,
    auto_sync_catalog: 1,
    allowedTasks: ['ROOM_ENQUIRY', 'TARIFF_DETAILS', 'CATALOG_BROWSING', 'AMENITIES_INFO', 'LOCATION_HOURS'],
    supportedLanguages: ['en', 'hi', 'mr', 'hinglish'],
    handoffKeywords: ['human', 'agent', 'manager', 'person', 'staff', 'complaint', 'refund']
  });

  // Knowledge Sources State
  const [knowledgeList, setKnowledgeList] = useState([]);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState(null);
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: '',
    source_type: 'TEXT_FAQ',
    content_text: '',
    tags: ''
  });

  // Sandbox State
  const [sandboxQuery, setSandboxQuery] = useState('');
  const [sandboxChat, setSandboxChat] = useState([
    {
      sender: 'bot',
      text: 'Namaste! I am your task-scoped assistant. Test any inquiry in English, Hindi, Marathi, or Hinglish to see my grounded response and confidence metrics.',
      time: new Date().toISOString()
    }
  ]);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  // Audit Logs State
  const [logs, setLogs] = useState([]);
  const [logFilterHandoff, setLogFilterHandoff] = useState(false);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [cfgRes, knowRes, logsRes] = await Promise.all([
        fetch('/api/v1/ai/config', { headers: authHeaders }).catch(() => null),
        fetch('/api/v1/ai/knowledge', { headers: authHeaders }).catch(() => null),
        fetch('/api/v1/ai/logs', { headers: authHeaders }).catch(() => null)
      ]);

      if (cfgRes?.ok) {
        const cJson = await cfgRes.json();
        if (cJson.success && cJson.data) {
          setAgentConfig(prev => ({ ...prev, ...cJson.data }));
        }
      }

      if (knowRes?.ok) {
        const kJson = await knowRes.json();
        if (kJson.success && Array.isArray(kJson.data)) {
          setKnowledgeList(kJson.data);
        }
      }

      if (logsRes?.ok) {
        const lJson = await logsRes.json();
        if (lJson.success && Array.isArray(lJson.data)) {
          setLogs(lJson.data);
        }
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Failed to load AI agent configuration.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save Agent Configuration
  const handleSaveConfig = async (e) => {
    e?.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/ai/config', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(agentConfig)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update AI Agent configuration.');
      setNotice({ type: 'success', text: 'Task-Scoped AI Agent configuration and policy guardrails saved!' });
      if (data.data) setAgentConfig(prev => ({ ...prev, ...data.data }));
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Add or Edit Knowledge Source
  const handleSaveKnowledge = async (e) => {
    e.preventDefault();
    if (!knowledgeForm.title.trim() || !knowledgeForm.content_text.trim()) {
      setNotice({ type: 'error', text: 'Please fill in both the title and knowledge content.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const tagsArray = knowledgeForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const payload = {
        title: knowledgeForm.title.trim(),
        source_type: knowledgeForm.source_type,
        content_text: knowledgeForm.content_text.trim(),
        tags: tagsArray
      };

      const url = editingKnowledge ? `/api/v1/ai/knowledge/${editingKnowledge.id}` : '/api/v1/ai/knowledge';
      const method = editingKnowledge ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to save knowledge item.');

      setNotice({ type: 'success', text: `Knowledge source "${payload.title}" saved successfully.` });
      setKnowledgeModalOpen(false);
      setEditingKnowledge(null);
      setKnowledgeForm({ title: '', source_type: 'TEXT_FAQ', content_text: '', tags: '' });
      loadData();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKnowledge = async (id, title) => {
    if (!window.confirm(`Move knowledge item "${title}" to Recycle Bin?`)) return;
    try {
      const res = await fetch(`/api/v1/ai/knowledge/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete knowledge item.');
      setNotice({ type: 'success', text: `Knowledge item moved to Recycle Bin.` });
      loadData();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  // Run Sandbox Query
  const handleRunSandbox = async (queryToRun) => {
    const q = (queryToRun || sandboxQuery).trim();
    if (!q) return;

    const userEntry = { sender: 'user', text: q, time: new Date().toISOString() };
    setSandboxChat(prev => [...prev, userEntry]);
    setSandboxQuery('');
    setSandboxLoading(true);

    try {
      const res = await fetch('/api/v1/ai/test-query', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ query: q, inputType: 'TEXT' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Simulation query failed');

      const botEntry = {
        sender: 'bot',
        text: data.data?.replyText || 'No reply generated.',
        confidence: data.data?.confidence,
        detectedLanguage: data.data?.detectedLanguage,
        handoff: data.data?.handoff,
        sources: data.data?.sources || [],
        time: new Date().toISOString()
      };
      setSandboxChat(prev => [...prev, botEntry]);
    } catch (err) {
      setSandboxChat(prev => [
        ...prev,
        {
          sender: 'bot',
          text: `⚠️ Error executing test query: ${err.message}`,
          isError: true,
          time: new Date().toISOString()
        }
      ]);
    } finally {
      setSandboxLoading(false);
    }
  };

  const tabs = [
    { id: 'configuration', label: 'Agent & Guardrails', icon: Sliders },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen, count: knowledgeList.length },
    { id: 'sandbox', label: 'Live Test Sandbox', icon: Bot },
    { id: 'logs', label: 'AI Audit Logs', icon: History, count: logs.length }
  ];

  const filteredKnowledge = knowledgeList.filter(k => {
    if (!knowledgeSearch) return true;
    const term = knowledgeSearch.toLowerCase();
    return (
      (k.title && k.title.toLowerCase().includes(term)) ||
      (k.content_text && k.content_text.toLowerCase().includes(term)) ||
      (k.source_type && k.source_type.toLowerCase().includes(term))
    );
  });

  const filteredLogs = logs.filter(l => {
    if (logFilterHandoff) return Boolean(l.triggered_handoff);
    return true;
  });

  const aiLogColumns = useMemo(() => [
    {
      key: 'created_at',
      header: 'Time (IST)',
      sortable: true,
      render: (v) => <span style={{ whiteSpace: 'nowrap', color: '#67676B' }}>{formatIndianDateTime(v)}</span>
    },
    {
      key: 'sender_phone',
      header: 'Phone',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>
    },
    {
      key: 'input_type',
      header: 'Type',
      sortable: true,
      render: (v) => <Badge variant="neutral">{v}</Badge>
    },
    {
      key: 'user_input',
      header: 'User Query',
      render: (v) => <div style={{ maxWidth: '220px', wordBreak: 'break-word' }}>{v}</div>
    },
    {
      key: 'detected_language',
      header: 'Lang',
      sortable: true,
      render: (v) => <Badge variant="neutral">{(v || 'en').toUpperCase()}</Badge>
    },
    {
      key: 'ai_reply',
      header: 'AI Reply',
      render: (v) => <div style={{ maxWidth: '260px', wordBreak: 'break-word' }}>{v}</div>
    },
    {
      key: 'confidence',
      header: 'Confidence',
      align: 'right',
      sortable: true,
      render: (v) => (
        <Badge variant={v >= 0.65 ? 'success' : 'warning'}>
          <span className="tabular-nums">{(v * 100).toFixed(0)}%</span>
        </Badge>
      )
    },
    {
      key: 'triggered_handoff',
      header: 'Handoff',
      align: 'center',
      render: (v) => (
        v ? <Badge variant="error">Escalated</Badge> : <Badge variant="success">Handled</Badge>
      )
    },
    {
      key: 'latency_ms',
      header: 'Latency',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums" style={{ color: '#67676B' }}>{v} ms</span>
    }
  ], []);

  return (
    <div className="app-content-container">
      <PageHeader
        title="Task-Scoped Knowledge AI Agent"
        description="Meta Jan 2026 AI Policy grounded responder, Hindi/Marathi regional voice note transcription, and verified inventory answers."
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-slow' : ''} />
              Refresh
            </Button>
          </div>
        }
      />

      {notice && (
        <div
          role="status"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            background: notice.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
            color: notice.type === 'success' ? 'var(--status-success-text)' : 'var(--status-error-text)',
            border: `1px solid ${notice.type === 'success' ? 'var(--status-success-border)' : 'var(--status-error-border)'}`
          }}
        >
          {notice.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Top Level KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <KpiCard
          label="AI Agent Status"
          value={agentConfig.enabled ? 'ACTIVE' : 'STANDBY'}
          icon={Bot}
          trend={agentConfig.enabled ? 'Live on WhatsApp' : 'Disabled'}
          trendDirection={agentConfig.enabled ? 'up' : 'neutral'}
        />
        <KpiCard
          label="Knowledge Base Items"
          value={knowledgeList.length}
          icon={BookOpen}
          trend="Curated FAQs & Docs"
          trendDirection="up"
        />
        <KpiCard
          label="Voice Note Transcriber"
          value={agentConfig.voice_transcription_enabled ? 'ON' : 'OFF'}
          icon={Mic}
          trend="Hindi / Marathi / Hinglish"
          trendDirection="up"
        />
        <KpiCard
          label="Catalog Auto-Sync"
          value={agentConfig.auto_sync_catalog ? 'SYNCED' : 'OFF'}
          icon={ShieldCheck}
          trend="Live Room & Pricing"
          trendDirection="up"
        />
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* TAB 1: Configuration & Guardrails */}
      {activeTab === 'configuration' && (
        <Card>
          <CardHeader title="Agent Persona, Guardrails & Handoff Policy" subtitle="Ensure 100% adherence to Meta Jan 2026 AI Policy and automatic escalation." />
          <CardBody>
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Agent Master Toggle */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                background: agentConfig.enabled ? '#EDF4E6' : '#F9F9FB',
                border: `1px solid ${agentConfig.enabled ? '#C3D1AC' : '#E5E5E8'}`,
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: agentConfig.enabled ? '#2F5219' : '#171719' }}>
                    Enable Task-Scoped AI Responder
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#67676B' }}>
                    When active, incoming WhatsApp messages and voice notes with no matched conversation flow are grounded and answered by this AI agent.
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(agentConfig.enabled)}
                    onChange={(e) => setAgentConfig({ ...agentConfig, enabled: e.target.checked ? 1 : 0 })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{agentConfig.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              {/* Persona Definition */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                  Business Persona & Identity Prompt
                </label>
                <textarea
                  className="saas-input"
                  rows={3}
                  value={agentConfig.business_persona || ''}
                  onChange={(e) => setAgentConfig({ ...agentConfig, business_persona: e.target.value })}
                  placeholder="Define the agent's hospitality persona and tone..."
                />
                <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '4px' }}>
                  Meta Jan 2026 Guardrail: Responses are strictly locked to retrieved knowledge. Off-topic questions will be politely refused.
                </div>
              </div>

              {/* Threshold & Turns in 2 columns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '12px', border: '1px solid #E5E5E8', borderRadius: '8px', background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Confidence Threshold</label>
                    <Badge variant="info">{(agentConfig.confidence_threshold * 100).toFixed(0)}%</Badge>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="0.95"
                    step="0.05"
                    value={agentConfig.confidence_threshold}
                    onChange={(e) => setAgentConfig({ ...agentConfig, confidence_threshold: parseFloat(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                  <div style={{ fontSize: '0.725rem', color: '#67676B', marginTop: '4px' }}>
                    Any inquiry scoring below this threshold will automatically escalate to a human manager.
                  </div>
                </div>

                <div style={{ padding: '12px', border: '1px solid #E5E5E8', borderRadius: '8px', background: '#FFFFFF' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                    Max AI Turns Before Escalation
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    className="saas-input"
                    value={agentConfig.max_ai_turns_before_handoff}
                    onChange={(e) => setAgentConfig({ ...agentConfig, max_ai_turns_before_handoff: parseInt(e.target.value, 10) || 8 })}
                  />
                  <div style={{ fontSize: '0.725rem', color: '#67676B', marginTop: '4px' }}>
                    Prevents circular loops by transferring to human staff after this many AI replies in a conversation.
                  </div>
                </div>
              </div>

              {/* Features Toggles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  border: '1px solid #E5E5E8',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: '#FFFFFF'
                }}>
                  <input
                    type="checkbox"
                    checked={Boolean(agentConfig.voice_transcription_enabled)}
                    onChange={(e) => setAgentConfig({ ...agentConfig, voice_transcription_enabled: e.target.checked ? 1 : 0 })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Auto-Transcribe Voice Notes</div>
                    <div style={{ fontSize: '0.725rem', color: '#67676B' }}>Transcribes Hindi, Marathi, Hinglish, & English voice notes directly in chat.</div>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px',
                  border: '1px solid #E5E5E8',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: '#FFFFFF'
                }}>
                  <input
                    type="checkbox"
                    checked={Boolean(agentConfig.auto_sync_catalog)}
                    onChange={(e) => setAgentConfig({ ...agentConfig, auto_sync_catalog: e.target.checked ? 1 : 0 })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Auto-Sync Catalog & Room Rates</div>
                    <div style={{ fontSize: '0.725rem', color: '#67676B' }}>Grounds answers in real-time pricing and room inventory directly from MySQL.</div>
                  </div>
                </label>
              </div>

              {/* Human Handoff Keywords */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                  Escalation & Handoff Keywords
                </label>
                <input
                  type="text"
                  className="saas-input"
                  value={Array.isArray(agentConfig.handoffKeywords) ? agentConfig.handoffKeywords.join(', ') : ''}
                  onChange={(e) => {
                    const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                    setAgentConfig({ ...agentConfig, handoffKeywords: list });
                  }}
                  placeholder="human, agent, manager, staff, complaint, refund..."
                />
                <div style={{ fontSize: '0.725rem', color: '#67676B', marginTop: '4px' }}>
                  Inbound messages containing any of these keywords immediately trigger handoff to human front desk staff.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <Button type="submit" variant="primary" disabled={saving}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Agent Configuration'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* TAB 2: Knowledge Base CRUD */}
      {activeTab === 'knowledge' && (
        <Card>
          <CardHeader
            title="Curated Knowledge Sources"
            subtitle="Verified FAQs, documents, and policies used to ground AI responses."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setEditingKnowledge(null);
                  setKnowledgeForm({ title: '', source_type: 'TEXT_FAQ', content_text: '', tags: '' });
                  setKnowledgeModalOpen(true);
                }}
              >
                <Plus size={14} />
                Add Knowledge Source
              </Button>
            }
          />
          <CardBody>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#96969C' }} />
                <input
                  type="text"
                  className="saas-input"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Search knowledge sources by title or content..."
                  value={knowledgeSearch}
                  onChange={(e) => setKnowledgeSearch(e.target.value)}
                />
              </div>
            </div>

            {filteredKnowledge.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No Knowledge Sources Found"
                description="Add verified FAQs or policy documents so the AI agent can answer customer inquiries accurately."
                action={
                  <Button variant="secondary" onClick={() => setKnowledgeModalOpen(true)}>
                    <Plus size={14} /> Add First Knowledge Source
                  </Button>
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredKnowledge.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '14px 16px',
                      border: '1px solid #E5E5E8',
                      borderRadius: '8px',
                      background: '#FFFFFF',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#171719' }}>{item.title}</span>
                        <Badge variant="info">{item.source_type}</Badge>
                        {item.active_status === 1 ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="neutral">Inactive</Badge>
                        )}
                      </div>
                      <div style={{ fontSize: '0.825rem', color: '#3A3A3E', lineHeight: 1.45, marginBottom: '8px' }}>
                        {item.content_text}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {item.tags?.map((t, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 6px',
                              background: '#F4F4F6',
                              borderRadius: '4px',
                              color: '#67676B'
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                        <span style={{ fontSize: '0.7rem', color: '#96969C', marginLeft: 'auto' }}>
                          Updated: {formatIndianDateTime(item.updated_at || item.created_at)}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingKnowledge(item);
                          setKnowledgeForm({
                            title: item.title,
                            source_type: item.source_type,
                            content_text: item.content_text,
                            tags: Array.isArray(item.tags) ? item.tags.join(', ') : ''
                          });
                          setKnowledgeModalOpen(true);
                        }}
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteKnowledge(item.id, item.title)}
                        style={{ color: '#DC2626' }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* TAB 3: Interactive Sandbox Simulator */}
      {activeTab === 'sandbox' && (
        <Card>
          <CardHeader
            title="Live Knowledge Agent Sandbox"
            subtitle="Test inquiries in English, Hindi, Marathi, or Hinglish to inspect grounded answer generation and confidence scores."
          />
          <CardBody>
            {/* Sample Prompts */}
            <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#67676B', alignSelf: 'center' }}>Quick Test:</span>
              <button
                type="button"
                className="saas-button-sm"
                onClick={() => handleRunSandbox('What are your room tariffs and amenities?')}
                style={{ fontSize: '0.725rem', padding: '4px 8px' }}
              >
                🏨 Room Tariffs (EN)
              </button>
              <button
                type="button"
                className="saas-button-sm"
                onClick={() => handleRunSandbox('होटल में कौन से कमरे उपलब्ध हैं और किराया कितना है?')}
                style={{ fontSize: '0.725rem', padding: '4px 8px' }}
              >
                🇮🇳 कमरा और किराया (HI)
              </button>
              <button
                type="button"
                className="saas-button-sm"
                onClick={() => handleRunSandbox('चेक-इन आणि चेक-आऊट वेळ काय आहे?')}
                style={{ fontSize: '0.725rem', padding: '4px 8px' }}
              >
                🚩 वेळ काय आहे? (MR)
              </button>
              <button
                type="button"
                className="saas-button-sm"
                onClick={() => handleRunSandbox('I want to talk with your manager right now regarding a refund')}
                style={{ fontSize: '0.725rem', padding: '4px 8px', color: '#DC2626' }}
              >
                ⚡ Handoff Trigger Test
              </button>
            </div>

            {/* Chat Box */}
            <div
              style={{
                height: '380px',
                border: '1px solid #E5E5E8',
                borderRadius: '8px',
                background: '#FAFAFB',
                padding: '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '12px'
              }}
            >
              {sandboxChat.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    background: msg.sender === 'user' ? '#EDF4E6' : '#FFFFFF',
                    border: `1px solid ${msg.sender === 'user' ? '#C3D1AC' : '#E5E5E8'}`,
                    borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '10px 14px',
                    boxShadow: 'var(--shadow-xs)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    {msg.sender === 'user' ? (
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2F5219' }}>You (Guest)</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, color: '#7C3AED' }}>
                        <Sparkles size={11} /> SARVYA AI Agent
                      </span>
                    )}

                    {msg.confidence !== undefined && (
                      <Badge variant={msg.confidence >= 0.65 ? 'success' : 'warning'}>
                        {(msg.confidence * 100).toFixed(0)}% match
                      </Badge>
                    )}

                    {msg.detectedLanguage && (
                      <Badge variant="neutral">{msg.detectedLanguage.toUpperCase()}</Badge>
                    )}

                    {msg.handoff && (
                      <Badge variant="error">Escalated to Staff</Badge>
                    )}
                  </div>

                  <div style={{ fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {msg.text}
                  </div>

                  {msg.sources?.length > 0 && (
                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #EEEEF0', fontSize: '0.7rem', color: '#67676B' }}>
                      <span style={{ fontWeight: 600 }}>Grounded Citations:</span>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {msg.sources.map((s, i) => (
                          <span key={i} style={{ background: '#F4F4F6', padding: '1px 5px', borderRadius: '4px' }}>
                            {s.reference || s.title || s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {sandboxLoading && (
                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', fontSize: '0.8rem', color: '#67676B' }}>
                  <RefreshCw size={12} className="spin-slow" style={{ display: 'inline', marginRight: '6px' }} />
                  Retrieving knowledge and formulating response...
                </div>
              )}
            </div>

            {/* Input Line */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunSandbox();
              }}
              style={{ display: 'flex', gap: '8px' }}
            >
              <input
                type="text"
                className="saas-input"
                placeholder="Type a guest query in English, Hindi, or Marathi..."
                value={sandboxQuery}
                onChange={(e) => setSandboxQuery(e.target.value)}
                disabled={sandboxLoading}
              />
              <Button type="submit" variant="primary" disabled={sandboxLoading || !sandboxQuery.trim()}>
                <Send size={14} /> Send
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {/* TAB 4: AI Audit Logs */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader
            title="Interaction Telemetry & Audit Logs"
            subtitle="Complete record of all inbound questions answered or escalated by the task-scoped AI agent."
            action={
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={logFilterHandoff}
                  onChange={(e) => setLogFilterHandoff(e.target.checked)}
                />
                <span>Handoff Escalations Only</span>
              </label>
            }
          />
          <CardBody>
            <DataTable
              columns={aiLogColumns}
              data={filteredLogs}
              density="compact"
              pageSize={10}
              emptyMessage="No AI logs recorded matching active filters."
            />
          </CardBody>
        </Card>
      )}

      {/* Modal: Add/Edit Knowledge Source */}
      {knowledgeModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '10px',
            width: '100%',
            maxWidth: '560px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E5E5E8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                {editingKnowledge ? 'Edit Knowledge Source' : 'Add Knowledge Source'}
              </h3>
              <button
                type="button"
                onClick={() => setKnowledgeModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#67676B' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveKnowledge} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  Title / Subject
                </label>
                <input
                  type="text"
                  className="saas-input"
                  value={knowledgeForm.title}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, title: e.target.value })}
                  placeholder="e.g. Swimming Pool Timings & Dress Code"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  Source Type
                </label>
                <select
                  className="saas-input"
                  value={knowledgeForm.source_type}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, source_type: e.target.value })}
                >
                  <option value="TEXT_FAQ">FAQ Question & Answer</option>
                  <option value="DOCUMENT_TEXT">Policy / Document Text</option>
                  <option value="URL_SNIPPET">Website / URL Reference</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  Knowledge Content
                </label>
                <textarea
                  className="saas-input"
                  rows={5}
                  value={knowledgeForm.content_text}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, content_text: e.target.value })}
                  placeholder="Provide detailed, verified facts. The AI will ground its answers exclusively in this text..."
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  Keywords / Tags (comma separated)
                </label>
                <input
                  type="text"
                  className="saas-input"
                  value={knowledgeForm.tags}
                  onChange={(e) => setKnowledgeForm({ ...knowledgeForm, tags: e.target.value })}
                  placeholder="pool, timings, towels, children, depth"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <Button variant="secondary" onClick={() => setKnowledgeModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Knowledge'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
