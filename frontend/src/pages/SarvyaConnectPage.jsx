import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Eye,
  FileSpreadsheet,
  GitBranch,
  IndianRupee,
  Layers,
  Link2,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  FilterBar,
  KpiCard,
  Modal,
  PageHeader,
  PastelBarChart,
  SearchInput,
  Tabs
} from '../components/ui';
import PhoneMockup from '../components/PhoneMockup';
import TemplateBuilderModal from '../components/TemplateBuilderModal';

const STATUS_TONE = {
  APPROVED: 'green',
  PENDING: 'blue',
  IN_REVIEW: 'blue',
  DRAFT: 'neutral',
  REJECTED: 'coral',
  PAUSED: 'purple'
};

export default function SarvyaConnectPage({ onNavigate, currentUser }) {
  const { token, user } = useAuth();
  const activeUser = currentUser || user;

  const apiCall = useCallback(async (method, path, body = null) => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || 'Request failed');
      err.response = { data };
      throw err;
    }
    return { data };
  }, [token]);

  const [activeSubTab, setActiveSubTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Accounts & Hero state
  const [accountsData, setAccountsData] = useState({
    connected: false,
    activeAccount: null,
    accounts: [],
    summary: { templates: { total: 0, approved: 0, pending: 0, other: 0 }, messagesSent: 0 }
  });

  // Templates state
  const [templates, setTemplates] = useState([]);
  const [tplSummary, setTplSummary] = useState({ total: 0, approved: 0, pending: 0, draft: 0, rejected: 0, other: 0 });
  const [tplSearch, setTplSearch] = useState('');
  const [tplStatusFilter, setTplStatusFilter] = useState('ALL');
  const [tplCategoryFilter, setTplCategoryFilter] = useState('ALL');

  // Template Builder Modal
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Connect Account Modal
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectForm, setConnectForm] = useState({
    displayName: '',
    phoneNumber: '',
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    isDefault: true
  });
  const [connectSaving, setConnectSaving] = useState(false);
  const [connectError, setConnectError] = useState('');

  // One-to-One Messaging State
  const [composePhone, setComposePhone] = useState('');
  const [eligibility, setEligibility] = useState(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [composeMode, setComposeMode] = useState('TEMPLATE'); // 'TEMPLATE' | 'TEXT'
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [composeVars, setComposeVars] = useState({});
  const [composeText, setComposeText] = useState('');
  const [composeMediaUrl, setComposeMediaUrl] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [composeFeedback, setComposeFeedback] = useState(null);

  // Usage & Billing Ledger State
  const [usageData, setUsageData] = useState({
    currency: 'INR',
    rates: { MARKETING: 0.8, UTILITY: 0.12, AUTHENTICATION: 0.12, SERVICE: 0 },
    totals: { messages: 0, estimatedSpend: 0 },
    byCategory: [],
    ledger: [],
    recentMessages: []
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, tplRes, usageRes] = await Promise.allSettled([
        apiCall('GET', '/v1/channels/whatsapp/accounts'),
        apiCall('GET', '/v1/whatsapp/templates'),
        apiCall('GET', '/v1/whatsapp/usage')
      ]);

      if (acctRes.status === 'fulfilled' && acctRes.value.data?.success) {
        setAccountsData(acctRes.value.data);
      }
      if (tplRes.status === 'fulfilled' && tplRes.value.data?.success) {
        const list = tplRes.value.data.templates || [];
        setTemplates(list);
        if (tplRes.value.data.summary) setTplSummary(tplRes.value.data.summary);
        if (!selectedTemplateId) {
          const firstApproved = list.find((t) => t.status === 'APPROVED');
          if (firstApproved) setSelectedTemplateId(firstApproved.id);
        }
      }
      if (usageRes.status === 'fulfilled' && usageRes.value.data?.success) {
        setUsageData(usageRes.value.data);
      }
    } finally {
      setLoading(false);
    }
  }, [apiCall, selectedTemplateId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSyncMetaTemplates = async () => {
    setSyncing(true);
    try {
      await apiCall('POST', '/templates/sync', {});
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to sync templates from Meta.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteTemplate = async (tpl) => {
    if (!window.confirm(`Remove template "${tpl.name}" from SARVYA Connect?`)) return;
    try {
      await apiCall('DELETE', `/templates/${tpl.id}`);
      await loadAll();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete template.');
    }
  };

  const handleCloneTemplate = async (tpl) => {
    try {
      const res = await apiCall('POST', `/v1/whatsapp/templates/${tpl.id}/clone`);
      const cloned = res.data?.template;
      await loadAll();
      if (cloned) {
        setEditingTemplate(cloned);
        setBuilderOpen(true);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to clone template.');
    }
  };

  const handleConnectSubmit = async (e) => {
    e.preventDefault();
    setConnectError('');
    setConnectSaving(true);
    try {
      await apiCall('POST', '/v1/channels/whatsapp/connect', connectForm);
      setConnectOpen(false);
      setConnectForm({
        displayName: '',
        phoneNumber: '',
        phoneNumberId: '',
        wabaId: '',
        accessToken: '',
        isDefault: true
      });
      await loadAll();
    } catch (err) {
      setConnectError(err.response?.data?.message || 'Failed to connect sender account.');
    } finally {
      setConnectSaving(false);
    }
  };

  const checkEligibility = async (phoneVal = composePhone) => {
    const cleaned = String(phoneVal || '').trim();
    if (!cleaned) return;
    setCheckingEligibility(true);
    setComposeFeedback(null);
    try {
      const res = await apiCall('GET', `/v1/whatsapp/contacts/eligibility?phone=${encodeURIComponent(cleaned)}`);
      setEligibility(res.data);
      if (res.data && !res.data.canSendFreeForm) {
        setComposeMode('TEMPLATE');
      }
    } catch (err) {
      setEligibility(null);
    } finally {
      setCheckingEligibility(false);
    }
  };

  const approvedTemplates = useMemo(
    () => templates.filter((t) => String(t.status || '').toUpperCase() === 'APPROVED'),
    [templates]
  );

  const selectedTemplateObj = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId || t.name === selectedTemplateId) || approvedTemplates[0] || null,
    [templates, approvedTemplates, selectedTemplateId]
  );

  const handleSendOneToOne = async (e) => {
    e.preventDefault();
    setComposeFeedback(null);
    setSendingMsg(true);
    try {
      const payload = composeMode === 'TEMPLATE'
        ? {
            to: composePhone,
            type: 'TEMPLATE',
            templateId: selectedTemplateObj?.id,
            templateName: selectedTemplateObj?.name,
            templateLanguage: selectedTemplateObj?.language,
            variables: composeVars
          }
        : {
            to: composePhone,
            type: composeMediaUrl ? 'MEDIA' : 'TEXT',
            text: composeText,
            mediaUrl: composeMediaUrl || undefined
          };

      const res = await apiCall('POST', '/v1/whatsapp/messages/send', payload);
      setComposeFeedback({
        type: 'success',
        text: `Dispatched (${res.data?.data?.status || 'SENT'}) • ID: ${res.data?.data?.metaMessageId || res.data?.data?.id}`
      });
      if (composeMode === 'TEXT') setComposeText('');
      await loadAll();
    } catch (err) {
      setComposeFeedback({
        type: 'error',
        text: err.response?.data?.message || 'Message dispatch failed.'
      });
    } finally {
      setSendingMsg(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      if (tplStatusFilter !== 'ALL' && String(t.status || '').toUpperCase() !== tplStatusFilter) return false;
      if (tplCategoryFilter !== 'ALL' && String(t.category || '').toUpperCase() !== tplCategoryFilter) return false;
      if (tplSearch.trim()) {
        const q = tplSearch.toLowerCase();
        const match = (t.name || '').toLowerCase().includes(q)
          || (t.bodyText || '').toLowerCase().includes(q)
          || (t.category || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [templates, tplStatusFilter, tplCategoryFilter, tplSearch]);

  const activeSender = accountsData.activeAccount;

  const usageChartData = useMemo(() => {
    const map = { MARKETING: 0, UTILITY: 0, AUTHENTICATION: 0, SERVICE: 0 };
    for (const row of usageData.byCategory || []) {
      map[String(row.category || 'MARKETING').toUpperCase()] = Number(row.count || 0);
    }
    return [
      { label: 'Marketing', value: map.MARKETING, tone: 'purple' },
      { label: 'Utility', value: map.UTILITY, tone: 'green' },
      { label: 'Auth', value: map.AUTHENTICATION, tone: 'blue' },
      { label: 'Service (24h)', value: map.SERVICE, tone: 'coral' }
    ];
  }, [usageData]);

  const subTabs = [
    { id: 'overview', label: 'Overview & Accounts' },
    { id: 'templates', label: 'Template Manager', count: tplSummary.total },
    { id: 'compose', label: 'One-to-One' },
    { id: 'usage', label: 'Usage & Billing' }
  ];

  const templateColumns = [
    {
      key: 'name',
      header: 'Template Name',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">{row.name}</span>
            {row.version > 1 && <Badge tone="neutral">v{row.version}</Badge>}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[260px]">
            {row.bodyText}
          </p>
          {row.status === 'REJECTED' && row.rejectionReason && (
            <p className="text-[11px] text-[#6B1F1E] mt-0.5">{row.rejectionReason}</p>
          )}
        </div>
      )
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <Badge tone={row.category === 'UTILITY' ? 'green' : row.category === 'AUTHENTICATION' ? 'blue' : 'purple'}>
          {row.category}
        </Badge>
      )
    },
    {
      key: 'language',
      header: 'Language',
      render: (row) => <span className="text-xs text-[var(--text-secondary)]">{row.language || 'en'}</span>
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{row.status}</Badge>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={row.status === 'APPROVED' || row.status === 'PENDING' ? Eye : Edit3}
            onClick={() => {
              setEditingTemplate(row);
              setBuilderOpen(true);
            }}
          >
            {row.status === 'APPROVED' || row.status === 'PENDING' ? 'View' : 'Edit'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={Copy}
            onClick={() => handleCloneTemplate(row)}
          >
            Clone
          </Button>
          {activeUser?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={() => handleDeleteTemplate(row)}
              aria-label={`Delete template ${row.name}`}
              className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[#FEEAE9] hover:text-[#6B1F1E]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )
    }
  ];

  const ledgerColumns = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (row) => <span className="text-xs text-[var(--text-muted)]">{row.created_at}</span>
    },
    {
      key: 'recipient_phone',
      header: 'Recipient / Scope',
      render: (row) => <span className="font-mono text-xs text-[var(--text-primary)]">{row.recipient_phone}</span>
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <Badge tone={row.category === 'UTILITY' ? 'green' : row.category === 'SERVICE' ? 'neutral' : 'purple'}>{row.category}</Badge>
    },
    {
      key: 'billing_status',
      header: 'State',
      render: (row) => <Badge tone={row.billing_status === 'RECORDED' ? 'green' : row.billing_status === 'WAIVED' ? 'coral' : 'blue'}>{row.billing_status}</Badge>
    },
    {
      key: 'unit_cost',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="font-semibold text-xs text-[var(--text-primary)]">₹{Number(row.unit_cost || 0).toFixed(2)}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SARVYA Connect — WhatsApp Messaging"
        subtitle="Connect your registered WhatsApp number once, design & submit custom Meta templates, enforce 24h rules, and dispatch campaigns directly inside SARVYA."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              loading={syncing}
              onClick={handleSyncMetaTemplates}
            >
              Sync Meta
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingTemplate(null);
                setBuilderOpen(true);
              }}
            >
              Create Template
            </Button>
          </>
        }
      />

      {/* Top Wireframe Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Connected Sender Account Card */}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">Connected sender account</span>
              <Badge tone={accountsData.connected ? 'green' : 'coral'}>
                {accountsData.connected ? 'Connected' : 'Setup Needed'}
              </Badge>
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--text-primary)]">
                {activeSender?.display_name || 'No Sender Connected'}
              </p>
              <p className="text-sm font-mono text-[var(--text-secondary)] mt-0.5">
                {activeSender?.phone_number || 'Add Phone Number ID'}
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-xs text-[var(--text-muted)]">
                {activeSender ? `${activeSender.status || 'Active'} · Quality ${activeSender.quality_rating || 'GREEN'}` : 'Connect WABA number'}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConnectOpen(true)}>
                {activeSender ? 'Add / Edit' : 'Connect'}
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Templates Summary Card */}
        <KpiCard
          label="Templates"
          value={tplSummary.total}
          hint={`${tplSummary.approved} approved · ${tplSummary.pending} pending · ${tplSummary.other} drafts or other statuses`}
          icon={Layers}
          tone="blue"
          loading={loading}
        />

        {/* Messages Sent Card */}
        <KpiCard
          label="Messages sent"
          value={accountsData.summary?.messagesSent ?? usageData.totals?.messages ?? 0}
          hint={`Est. usage ₹${Number(usageData.totals?.estimatedSpend || 0).toFixed(2)} INR across campaigns & 1-to-1`}
          icon={Send}
          tone="green"
          loading={loading}
        />
      </div>

      {/* Messaging Options Strip */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Messaging options
          </span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" icon={MessageSquare} onClick={() => setActiveSubTab('compose')}>
              One-to-one
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={Link2} onClick={() => onNavigate && onNavigate('links')}>
              Chat Links (wa.me)
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={Users} onClick={() => onNavigate && onNavigate('broadcast')}>
              Bulk campaigns
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={GitBranch} onClick={() => onNavigate && onNavigate('automation')}>
              Workflow triggers
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={FileSpreadsheet} onClick={() => onNavigate && onNavigate('flows')}>
              WhatsApp Flows
            </Button>
            <Button type="button" variant="secondary" size="sm" icon={Clock} onClick={() => onNavigate && onNavigate('broadcast')}>
              Scheduled messages
            </Button>
          </div>
        </CardBody>
      </Card>

      <Tabs tabs={subTabs} activeId={activeSubTab} onChange={setActiveSubTab} />

      {/* SUBTAB 1: OVERVIEW & ACCOUNTS */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Connected WhatsApp Sender Accounts"
              subtitle="One-time Meta Cloud API / WABA connection managed centrally across SARVYA modules"
              action={
                <Button type="button" variant="primary" size="sm" icon={Plus} onClick={() => setConnectOpen(true)}>
                  Connect Number
                </Button>
              }
            />
            <CardBody className="p-0">
              {accountsData.accounts?.length > 0 ? (
                <DataTable
                  columns={[
                    {
                      key: 'display_name',
                      header: 'Business Label',
                      render: (r) => (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">{r.display_name}</span>
                          {r.is_default === 1 && <Badge tone="blue">Default</Badge>}
                        </div>
                      )
                    },
                    { key: 'phone_number', header: 'Phone Number', render: (r) => <span className="font-mono text-xs">{r.phone_number}</span> },
                    { key: 'phone_number_id', header: 'Phone Number ID', render: (r) => <span className="font-mono text-xs text-[var(--text-muted)]">{r.phone_number_id}</span> },
                    { key: 'quality_rating', header: 'Quality', render: (r) => <Badge tone={r.quality_rating === 'GREEN' ? 'green' : 'coral'}>{r.quality_rating || 'GREEN'}</Badge> },
                    { key: 'status', header: 'Status', render: (r) => <Badge tone="green">{r.status || 'ACTIVE'}</Badge> }
                  ]}
                  rows={accountsData.accounts}
                  keyField="id"
                />
              ) : (
                <EmptyState
                  icon={Phone}
                  title="No WhatsApp sender connected yet"
                  description="Connect your registered Meta Phone Number ID and WABA ID once to start creating templates and sending directly from SARVYA."
                  action={
                    <Button type="button" variant="primary" icon={Plus} onClick={() => setConnectOpen(true)}>
                      Connect WhatsApp Account
                    </Button>
                  }
                />
              )}
            </CardBody>
          </Card>

          {/* Connected SARVYA Sub-modules */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardBody className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <MessageSquare className="h-4 w-4 text-[var(--brand-primary)]" />
                  Shared Inbox & CRM Audience
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Manage two-way replies inside the 24-hour window and review opted-in guest contacts.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate && onNavigate('inbox')}>Open Inbox</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate && onNavigate('enquiries')}>Open CRM</Button>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Send className="h-4 w-4 text-[var(--brand-primary)]" />
                  Bulk Campaigns & Scheduler
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Upload contacts, map custom template variables, preview cost, pause/resume live sends.
                </p>
                <div className="pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate && onNavigate('broadcast')}>Launch Campaign</Button>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <BarChart3 className="h-4 w-4 text-[var(--brand-primary)]" />
                  Delivery Analytics & Automation
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Track delivery/read funnels and automate check-in, arrival, and checkout triggers.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate && onNavigate('reports')}>Analytics</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onNavigate && onNavigate('automation')}>Workflows</Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* SUBTAB 2: TEMPLATE MANAGER */}
      {activeSubTab === 'templates' && (
        <div className="space-y-4">
          <FilterBar>
            <SearchInput
              value={tplSearch}
              onChange={setTplSearch}
              placeholder="Search template name or body text..."
              ariaLabel="Search WhatsApp templates"
            />
            <select
              aria-label="Filter by template status"
              className="sarvya-input w-auto min-w-[140px]"
              value={tplStatusFilter}
              onChange={(e) => setTplStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved ({tplSummary.approved})</option>
              <option value="PENDING">Pending ({tplSummary.pending})</option>
              <option value="DRAFT">Draft ({tplSummary.draft})</option>
              <option value="REJECTED">Rejected ({tplSummary.rejected})</option>
            </select>
            <select
              aria-label="Filter by template category"
              className="sarvya-input w-auto min-w-[150px]"
              value={tplCategoryFilter}
              onChange={(e) => setTplCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="secondary" size="sm" icon={RefreshCw} loading={syncing} onClick={handleSyncMetaTemplates}>
                Sync from Meta
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setEditingTemplate(null);
                  setBuilderOpen(true);
                }}
              >
                New Custom Template
              </Button>
            </div>
          </FilterBar>

          <Card>
            <CardBody className="p-0">
              {filteredTemplates.length > 0 ? (
                <DataTable columns={templateColumns} data={filteredTemplates} rows={filteredTemplates} keyField="id" />
              ) : (
                <EmptyState
                  icon={Layers}
                  title="No matching templates found"
                  description="Create a custom draft template with our visual builder or sync existing templates from your Meta WABA."
                  action={
                    <Button
                      type="button"
                      variant="primary"
                      icon={Plus}
                      onClick={() => {
                        setEditingTemplate(null);
                        setBuilderOpen(true);
                      }}
                    >
                      Create Custom Template
                    </Button>
                  }
                />
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* SUBTAB 3: ONE-TO-ONE COMPOSER (24h Window & Opt-Out Enforced) */}
      {activeSubTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <Card className="lg:col-span-7">
            <CardHeader
              title="One-to-One WhatsApp Composer"
              subtitle="Enforces opt-out suppression, approved template gates, and Meta 24-hour customer-service windows"
            />
            <CardBody>
              <form className="space-y-4" onSubmit={handleSendOneToOne}>
                <div>
                  <label htmlFor="compose-phone" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                    Recipient WhatsApp Number <span aria-hidden="true">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="compose-phone"
                      type="tel"
                      required
                      className="sarvya-input"
                      placeholder="+91 98765 43210"
                      value={composePhone}
                      onChange={(e) => setComposePhone(e.target.value)}
                      onBlur={() => composePhone.trim() && checkEligibility(composePhone)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      loading={checkingEligibility}
                      icon={UserCheck}
                      onClick={() => checkEligibility(composePhone)}
                    >
                      Check 24h Window
                    </Button>
                  </div>
                </div>

                {eligibility && (
                  <div
                    className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs flex items-start gap-2.5 ${
                      eligibility.optedOut
                        ? 'border-[#E59290] bg-[#FEEAE9] text-[#6B1F1E]'
                        : eligibility.canSendFreeForm
                          ? 'border-[#B4C49A] bg-[#EDF3E4] text-[#2B3D1A]'
                          : 'border-[#89C4EA] bg-[#E8F4FC] text-[#1A4D73]'
                    }`}
                  >
                    {eligibility.optedOut ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <div>
                      {eligibility.optedOut ? (
                        <p className="font-semibold">Opted Out ({eligibility.optOutReason}) — All outbound messages blocked.</p>
                      ) : eligibility.canSendFreeForm ? (
                        <p className="font-semibold">
                          24-Hour Window Open ({eligibility.window?.remainingMinutes} min left) — Free-form text/media and templates both permitted.
                        </p>
                      ) : (
                        <p className="font-semibold">
                          Outside 24-Hour Window — Send an APPROVED template message to start the conversation.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium text-[var(--text-primary)] mb-1">Message Mode</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setComposeMode('TEMPLATE')}
                      className={`px-3 py-2 rounded-[var(--radius-md)] border text-xs font-medium text-left ${
                        composeMode === 'TEMPLATE'
                          ? 'bg-[var(--brand-primary-tint)] border-[var(--brand-primary)] text-[var(--brand-primary-dark)]'
                          : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)]'
                      }`}
                    >
                      Approved Template (Always allowed)
                    </button>
                    <button
                      type="button"
                      disabled={eligibility ? !eligibility.canSendFreeForm : false}
                      onClick={() => setComposeMode('TEXT')}
                      className={`px-3 py-2 rounded-[var(--radius-md)] border text-xs font-medium text-left disabled:opacity-50 ${
                        composeMode === 'TEXT'
                          ? 'bg-[var(--brand-primary-tint)] border-[var(--brand-primary)] text-[var(--brand-primary-dark)]'
                          : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)]'
                      }`}
                    >
                      Free-Form Reply (24h Window Only)
                    </button>
                  </div>
                </fieldset>

                {composeMode === 'TEMPLATE' ? (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="compose-tpl" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                        Select Approved Template
                      </label>
                      <select
                        id="compose-tpl"
                        className="sarvya-input"
                        value={selectedTemplateObj?.id || ''}
                        onChange={(e) => {
                          setSelectedTemplateId(e.target.value);
                          setComposeVars({});
                        }}
                      >
                        {approvedTemplates.length === 0 && (
                          <option value="">No APPROVED templates available</option>
                        )}
                        {approvedTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.category} · {t.language})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTemplateObj?.variables?.length > 0 && (
                      <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 space-y-2">
                        <p className="text-xs font-medium text-[var(--text-primary)]">Template Variable Values</p>
                        {selectedTemplateObj.variables.map((v) => (
                          <div key={v.key} className="flex items-center gap-2">
                            <span className="text-xs font-mono px-2 py-1 rounded bg-white border border-[var(--border-default)]">
                              {v.label}
                            </span>
                            <input
                              type="text"
                              className="sarvya-input py-1.5 text-xs"
                              placeholder={v.example || `Value for ${v.key}`}
                              value={composeVars[v.key] || ''}
                              onChange={(e) => setComposeVars((prev) => ({ ...prev, [v.key]: e.target.value }))}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="compose-text" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                        Session Message Text
                      </label>
                      <textarea
                        id="compose-text"
                        rows={4}
                        className="sarvya-input"
                        value={composeText}
                        onChange={(e) => setComposeText(e.target.value)}
                        placeholder="Write your personalized customer reply..."
                      />
                    </div>
                    <div>
                      <label htmlFor="compose-media" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                        Optional Media URL
                      </label>
                      <input
                        id="compose-media"
                        type="url"
                        className="sarvya-input"
                        value={composeMediaUrl}
                        onChange={(e) => setComposeMediaUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                )}

                {composeFeedback && (
                  <div
                    role="status"
                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-xs ${
                      composeFeedback.type === 'success'
                        ? 'border-[#B4C49A] bg-[#EDF3E4] text-[#2B3D1A]'
                        : 'border-[#E59290] bg-[#FEEAE9] text-[#6B1F1E]'
                    }`}
                  >
                    {composeFeedback.text}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="primary"
                    icon={Send}
                    loading={sendingMsg}
                    disabled={eligibility?.optedOut}
                  >
                    Send WhatsApp Message
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <div className="lg:col-span-5 flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-5">
            <p className="text-xs font-semibold text-[var(--text-primary)] mb-3 self-start">Message Preview</p>
            <PhoneMockup
              template={composeMode === 'TEMPLATE' ? selectedTemplateObj : null}
              sampleData={composeVars}
              mediaUrl={composeMode === 'TEXT' ? composeMediaUrl : undefined}
              customBodyText={composeMode === 'TEXT' ? composeText : undefined}
            />
          </div>
        </div>
      )}

      {/* SUBTAB 4: USAGE & BILLING LEDGER */}
      {activeSubTab === 'usage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Total Recorded Messages"
              value={usageData.totals?.messages || 0}
              hint="Combined 1-to-1 & Campaign ledger"
              icon={Send}
              tone="blue"
            />
            <KpiCard
              label="Estimated Spend (INR)"
              value={`₹${Number(usageData.totals?.estimatedSpend || 0).toFixed(2)}`}
              hint="Calculated using configured Meta conversation tariffs"
              icon={IndianRupee}
              tone="green"
            />
            <Card>
              <CardBody className="space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-muted)]">Configured Unit Tariffs</span>
                <div className="grid grid-cols-2 gap-1.5 text-xs pt-1">
                  <span>Marketing: <strong>₹{usageData.rates?.MARKETING}</strong></span>
                  <span>Utility: <strong>₹{usageData.rates?.UTILITY}</strong></span>
                  <span>Auth: <strong>₹{usageData.rates?.AUTHENTICATION}</strong></span>
                  <span>Service (24h): <strong>₹0.00</strong></span>
                </div>
              </CardBody>
            </Card>
          </div>

          <PastelBarChart
            title="Messages Dispatched by Meta Category"
            subtitle="Category mix determines billing rate and approval compliance"
            data={usageChartData}
          />

          <Card>
            <CardHeader title="Recent Usage & Billing Ledger" subtitle="Tracks estimated vs. webhook-confirmed conversation costs" />
            <CardBody className="p-0">
              {usageData.ledger?.length > 0 ? (
                <DataTable columns={ledgerColumns} data={usageData.ledger} rows={usageData.ledger} keyField="id" />
              ) : (
                <EmptyState
                  icon={IndianRupee}
                  title="No usage events recorded yet"
                  description="Send a 1-to-1 template or launch a broadcast campaign to generate real-time usage accounting."
                />
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Template Builder Modal */}
      <TemplateBuilderModal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        template={editingTemplate}
        onSaved={() => loadAll()}
      />

      {/* Connect Sender Account Modal */}
      <Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        title="Connect WhatsApp Sender Account"
        subtitle="Connect your registered Meta WhatsApp Business number once for all SARVYA messaging"
        size="md"
      >
        <form className="space-y-4" onSubmit={handleConnectSubmit}>
          {connectError && (
            <div role="alert" className="rounded-[var(--radius-md)] border border-[#E59290] bg-[#FEEAE9] px-3 py-2 text-xs text-[#6B1F1E]">
              {connectError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="conn-display" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                Business Display Name
              </label>
              <input
                id="conn-display"
                type="text"
                required
                className="sarvya-input"
                placeholder="Resort Business"
                value={connectForm.displayName}
                onChange={(e) => setConnectForm((p) => ({ ...p, displayName: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="conn-phone" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                WhatsApp Number
              </label>
              <input
                id="conn-phone"
                type="tel"
                required
                className="sarvya-input"
                placeholder="+91 93073 82030"
                value={connectForm.phoneNumber}
                onChange={(e) => setConnectForm((p) => ({ ...p, phoneNumber: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="conn-phone-id" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                Meta Phone Number ID
              </label>
              <input
                id="conn-phone-id"
                type="text"
                required
                className="sarvya-input font-mono text-xs"
                placeholder="554829103..."
                value={connectForm.phoneNumberId}
                onChange={(e) => setConnectForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="conn-waba-id" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                WABA ID
              </label>
              <input
                id="conn-waba-id"
                type="text"
                className="sarvya-input font-mono text-xs"
                placeholder="109384712..."
                value={connectForm.wabaId}
                onChange={(e) => setConnectForm((p) => ({ ...p, wabaId: e.target.value }))}
              />
            </div>
          </div>
          {activeUser?.role === 'ADMIN' && (
            <div>
              <label htmlFor="conn-token" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                Meta System User Access Token (Optional)
              </label>
              <input
                id="conn-token"
                type="password"
                className="sarvya-input font-mono text-xs"
                placeholder="EAAG..."
                value={connectForm.accessToken}
                onChange={(e) => setConnectForm((p) => ({ ...p, accessToken: e.target.value }))}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              id="conn-default"
              type="checkbox"
              checked={connectForm.isDefault}
              onChange={(e) => setConnectForm((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            <label htmlFor="conn-default" className="text-xs text-[var(--text-secondary)]">
              Set as default active sender account
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-default)]">
            <Button type="button" variant="secondary" onClick={() => setConnectOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={connectSaving}>Save Sender Connection</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
