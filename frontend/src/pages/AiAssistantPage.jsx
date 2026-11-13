import React, { useState, useEffect, useCallback } from 'react';
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
  Save
} from 'lucide-react';
import { formatIndianDateTime } from '../utils/indianTime';

/**
 * SARVYA AI Module — Assistant Configuration, Knowledge Templates, Usage Analytics & Safety Controls
 * Backed by live /api/replies/auto-reply-settings, /api/broadcast/templates, and /api/automation/history.
 */
export default function AiAssistantPage() {
  const { token } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState('configuration');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const [config, setConfig] = useState({
    autoReplyEnabled: false,
    autoReplyMode: 'ONCE_PER_CONTACT',
    autoReplyMessage: ''
  });
  const [templates, setTemplates] = useState([]);
  const [executions, setExecutions] = useState([]);

  const loadAiWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [cfgRes, tmplRes, histRes] = await Promise.all([
        fetch('/api/replies/auto-reply-settings', { headers }),
        fetch('/api/broadcast/templates', { headers }).catch(() => null),
        fetch('/api/automation/history', { headers }).catch(() => null)
      ]);
      const cfgData = await cfgRes.json();
      if (cfgData.success && cfgData.data) {
        setConfig({
          autoReplyEnabled: Boolean(cfgData.data.autoReplyEnabled),
          autoReplyMode: cfgData.data.autoReplyMode || 'ONCE_PER_CONTACT',
          autoReplyMessage: cfgData.data.autoReplyMessage || ''
        });
      }
      if (tmplRes) {
        const tmplData = await tmplRes.json().catch(() => null);
        if (tmplData?.success && Array.isArray(tmplData.data)) {
          setTemplates(tmplData.data);
        }
      }
      if (histRes) {
        const histData = await histRes.json().catch(() => null);
        if (histData?.success && Array.isArray(histData.data)) {
          setExecutions(histData.data);
        }
      }
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAiWorkspace();
  }, [loadAiWorkspace]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/replies/auto-reply-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update AI Assistant rules');
      }
      setNotice({ type: 'success', text: 'SARVYA AI responder rules and safety guardrails saved.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'configuration', label: 'Assistant & Safety', icon: Sliders },
    { id: 'knowledge', label: 'Approved Knowledge', icon: BookOpen, count: templates.length },
    { id: 'history', label: 'Execution Logs', icon: History, count: executions.length }
  ];

  const successfulRuns = executions.filter((x) => (x.status || '').toUpperCase() === 'SENT' || (x.status || '').toUpperCase() === 'SUCCESS').length;

  return (
    <div className="app-content-container">
      <PageHeader
        title="SARVYA AI Assistants"
        description="Automated conversational responders, approved Meta template knowledge sources, and loop-prevention safety controls."
        actions={
          <Button variant="secondary" onClick={loadAiWorkspace} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-slow' : ''} />
            Refresh
          </Button>
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

      {/* Usage & Safety KPIs */}
      <div className="sarvya-kpi-grid" style={{ marginBottom: '20px' }}>
        <KpiCard
          label="Responder Status"
          value={config.autoReplyEnabled ? 'Active' : 'Paused'}
          meta={config.autoReplyEnabled ? 'Listening on inbound webhooks' : 'Manual operator mode'}
          icon={Bot}
          accentTone={config.autoReplyEnabled ? 'green' : 'taupe'}
        />
        <KpiCard
          label="Safety Guardrail"
          value={config.autoReplyMode === 'ONCE_PER_CONTACT' ? 'Once / Contact' : 'Every Inbound'}
          meta="Loop protection active"
          icon={ShieldCheck}
          accentTone="blue"
        />
        <KpiCard
          label="Approved Templates"
          value={templates.length}
          meta="Verified Meta knowledge payloads"
          icon={BookOpen}
          accentTone="purple"
        />
        <KpiCard
          label="Automated Dispatches"
          value={executions.length}
          meta={`${successfulRuns} completed without error`}
          icon={History}
          accentTone="green"
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <Tabs tabs={tabs} activeTab={activeSubTab} onChange={setActiveSubTab} ariaLabel="SARVYA AI sections" />
      </div>

      {activeSubTab === 'configuration' && (
        <form onSubmit={handleSaveConfig} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          <Card>
            <CardHeader
              title="Agent Response Configuration"
              subtitle="Define the automated welcome and triage response dispatched to inbound leads"
            />
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer'
              }}>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600 }}>Enable Automated Assistant</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Dispatch instant acknowledgements within the 24-hour customer service window
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoReplyEnabled}
                  onChange={(e) => setConfig((prev) => ({ ...prev, autoReplyEnabled: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--sarvya-blue)' }}
                />
              </label>

              <div>
                <label className="sarvya-field-label" htmlFor="aiResponsePrompt">
                  Default Assistant Message
                </label>
                <textarea
                  id="aiResponsePrompt"
                  rows={5}
                  className="sarvya-textarea"
                  placeholder="Hello! Thank you for contacting us. Share your check-in date and room preference and our desk will share an instant quotation."
                  value={config.autoReplyMessage}
                  onChange={(e) => setConfig((prev) => ({ ...prev, autoReplyMessage: e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" disabled={saving}>
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Approval & Safety Controls"
              subtitle="Prevent duplicate automated triggers and enforce human handoff rules"
            />
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="sarvya-field-label" htmlFor="safetyFrequency">
                  Trigger Suppression Policy
                </label>
                <select
                  id="safetyFrequency"
                  className="sarvya-select"
                  value={config.autoReplyMode}
                  onChange={(e) => setConfig((prev) => ({ ...prev, autoReplyMode: e.target.value }))}
                >
                  <option value="ONCE_PER_CONTACT">Once per contact conversation (Recommended)</option>
                  <option value="EVERY_MESSAGE">Every inbound message</option>
                </select>
                <p className="sarvya-field-hint">
                  Once per contact ensures customers already assisted by a human agent do not receive repetitive automated greetings.
                </p>
              </div>

              <div style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-subtle)',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Active Platform Guardrails</div>
                <div>• Opt-out suppression blocks automated dispatches to unsubscribed numbers</div>
                <div>• Inbound-only triggering prevents bot-to-bot reply loops</div>
                <div>• Full webhook payload auditing logged per workspace tenant</div>
              </div>
            </CardBody>
          </Card>
        </form>
      )}

      {activeSubTab === 'knowledge' && (
        <DataTable
          loading={loading}
          data={templates}
          ariaLabel="Approved Meta Templates"
          emptyTitle="No synced templates available"
          emptyDescription="Sync your Meta templates inside Campaigns or Connect to make them available as verified structured responses."
          columns={[
            {
              key: 'name',
              label: 'Template Name',
              sortable: true,
              render: (row) => <span style={{ fontWeight: 600 }}>{row.name}</span>
            },
            {
              key: 'category',
              label: 'Category',
              sortable: true,
              render: (row) => <Badge tone="blue">{row.category || 'UTILITY'}</Badge>
            },
            {
              key: 'language',
              label: 'Language',
              render: (row) => row.language || 'en'
            },
            {
              key: 'status',
              label: 'Approval Status',
              sortable: true,
              render: (row) => (
                <Badge tone={(row.status || '').toUpperCase() === 'APPROVED' ? 'green' : 'taupe'} dot>
                  {row.status || 'UNKNOWN'}
                </Badge>
              )
            }
          ]}
        />
      )}

      {activeSubTab === 'history' && (
        executions.length === 0 && !loading ? (
          <Card>
            <EmptyState
              icon={History}
              title="No execution logs yet"
              description="Automated workflow and assistant dispatches will appear here once evaluated."
            />
          </Card>
        ) : (
          <DataTable
            loading={loading}
            data={executions}
            ariaLabel="Automated Execution History"
            columns={[
              {
                key: 'stage',
                label: 'Trigger Stage',
                sortable: true,
                render: (row) => <Badge tone="purple">{row.stage || row.trigger_type || 'WORKFLOW'}</Badge>
              },
              {
                key: 'phone',
                label: 'Recipient',
                render: (row) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.guest_name || row.contact_name || 'Guest'}</div>
                    <div className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{row.phone || row.to_phone}</div>
                  </div>
                )
              },
              {
                key: 'status',
                label: 'Status',
                sortable: true,
                render: (row) => {
                  const ok = ['SENT', 'DELIVERED', 'SUCCESS'].includes((row.status || '').toUpperCase());
                  return <Badge tone={ok ? 'green' : 'coral'} dot>{row.status || 'PENDING'}</Badge>;
                }
              },
              {
                key: 'created_at',
                label: 'Executed At',
                sortable: true,
                render: (row) => (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {row.sent_at || row.created_at ? formatIndianDateTime(row.sent_at || row.created_at) : '—'}
                  </span>
                )
              }
            ]}
          />
        )
      )}
    </div>
  );
}

