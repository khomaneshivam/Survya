import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';
import MetaEmbeddedSignupButton from '../components/MetaEmbeddedSignupButton';
import JobQueueMonitor from '../components/admin/JobQueueMonitor';
import AdminOverviewTab from '../components/admin/AdminOverviewTab';
import AdminUsersCrudTab from '../components/admin/AdminUsersCrudTab';
import AdminRecycleBinTab from '../components/admin/AdminRecycleBinTab';
import AdminComplianceTab from '../components/admin/AdminComplianceTab';
import AiFlowBuilderSetupCard from '../components/admin/AiFlowBuilderSetupCard';
import {
  PageHeader,
  Tabs,
  KpiCard,
  DataTable,
  Modal,
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody
} from '../components/ui';
import {
  ShieldCheck,
  Users,
  Smartphone,
  Key,
  KeyRound,
  Activity,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Star,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Database,
  Server,
  Lock,
  Landmark,
  Sliders,
  Clock,
  Webhook,
  ExternalLink,
  Zap,
  Globe,
  Radio,
  HelpCircle
} from 'lucide-react';
import { formatIndianDate } from '../utils/indianTime';

export default function SystemAdminPanel({ onNavigate }) {
  const { token, user: currentUser, impersonateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('overview'); // overview | users | whatsapp | payouts | audit

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Overview & Users
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);

  // Meta WABA Settings
  const [metaSettings, setMetaSettings] = useState({
    WHATSAPP_API_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '',
    WHATSAPP_WABA_ID: '',
    META_APP_SECRET: '',
    WEBHOOK_VERIFY_TOKEN: '',
    META_GRAPH_VERSION: 'v21.0',
    BROADCAST_DELAY_MS: '250',
    DEFAULT_COUNTRY_CODE: '91',
    APP_TIMEZONE: 'Asia/Kolkata'
  });
  const [showToken, setShowToken] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [metaConnectionResult, setMetaConnectionResult] = useState(null);
  const [copiedVerifyToken, setCopiedVerifyToken] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  // Webhook Management State (Admin Only)
  const [webhookConfig, setWebhookConfig] = useState({
    verifyToken: '',
    primaryUrl: '',
    altUrl: '',
    baseUrl: '',
    isCustomOverride: false,
    isHttps: false,
    metaAppSecretConfigured: false,
    subscriptionFields: ['messages', 'message_deliveries', 'messaging_postbacks', 'message_reactions'],
    stats: { totalReplies: 0, lastEventAt: null }
  });
  const [showWebhookToken, setShowWebhookToken] = useState(false);
  const [copiedWebhookToken, setCopiedWebhookToken] = useState(false);
  const [copiedPrimaryUrl, setCopiedPrimaryUrl] = useState(false);
  const [copiedAltUrl, setCopiedAltUrl] = useState(false);
  const [urlOverrideInput, setUrlOverrideInput] = useState('');
  const [savingUrlOverride, setSavingUrlOverride] = useState(false);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [showRotateConfirmModal, setShowRotateConfirmModal] = useState(false);
  const [testingHandshake, setTestingHandshake] = useState(false);
  const [handshakeResult, setHandshakeResult] = useState(null);

  // Payout & Settlement Rules State
  const [settlementConfig, setSettlementConfig] = useState({
    platformFeePercent: '1.5',
    instantPayoutsEnabled: true,
    minPayoutThreshold: '500',
    pennyDropEnabled: true
  });
  const [savingSettlement, setSavingSettlement] = useState(false);

  // Modals
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneModalData, setPhoneModalData] = useState(null);
  const [testingPhoneId, setTestingPhoneId] = useState(null);

  function flashSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function flashError(msg) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  }

  // Load All Admin Data
  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [overviewRes, usersRes, phonesRes, settingsRes, auditRes, webhookRes] = await Promise.all([
        fetch('/api/admin/overview', { headers }).catch(() => null),
        fetch('/api/admin/users', { headers }).catch(() => null),
        fetch('/api/admin/phone-numbers', { headers }).catch(() => null),
        fetch('/api/settings', { headers }).catch(() => null),
        fetch('/api/admin/audit-logs?limit=30', { headers }).catch(() => null),
        fetch('/api/admin/webhooks/config', { headers }).catch(() => null)
      ]);

      if (overviewRes?.ok) {
        const d = await overviewRes.json();
        if (d.success) setOverview(d.data);
      }
      if (usersRes?.ok) {
        const d = await usersRes.json();
        if (d.success) setUsers(d.data || []);
      }
      if (phonesRes?.ok) {
        const d = await phonesRes.json();
        if (d.success) setPhoneNumbers(d.data || []);
      }
      if (settingsRes?.ok) {
        const d = await settingsRes.json();
        const s = d.settings || d.data || {};
        setMetaSettings((prev) => ({
          ...prev,
          WHATSAPP_API_TOKEN: s.WHATSAPP_API_TOKEN || '',
          WHATSAPP_PHONE_NUMBER_ID: s.WHATSAPP_PHONE_NUMBER_ID || '',
          WHATSAPP_BUSINESS_ACCOUNT_ID: s.WHATSAPP_BUSINESS_ACCOUNT_ID || s.WHATSAPP_WABA_ID || '',
          WHATSAPP_WABA_ID: s.WHATSAPP_WABA_ID || s.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
          META_APP_SECRET: s.META_APP_SECRET || '',
          WEBHOOK_VERIFY_TOKEN: s.WEBHOOK_VERIFY_TOKEN || '',
          META_GRAPH_VERSION: s.META_GRAPH_VERSION || 'v21.0',
          BROADCAST_DELAY_MS: s.BROADCAST_DELAY_MS !== undefined ? String(s.BROADCAST_DELAY_MS) : '250',
          DEFAULT_COUNTRY_CODE: s.DEFAULT_COUNTRY_CODE || '91',
          APP_TIMEZONE: s.APP_TIMEZONE || 'Asia/Kolkata'
        }));
        setSettlementConfig({
          platformFeePercent: s.SETTLEMENT_COMMISSION_PERCENT || '1.5',
          minPayoutThreshold: s.SETTLEMENT_MIN_THRESHOLD || '500',
          pennyDropEnabled: s.SETTLEMENT_PENNY_DROP !== 'false',
          instantPayoutsEnabled: s.SETTLEMENT_INSTANT_PAYOUTS !== 'false'
        });
      }
      if (auditRes?.ok) {
        const d = await auditRes.json();
        if (d.success) {
          setAuditLogs(d.data || []);
          setAuditTotal(d.total || 0);
        }
      }
      if (webhookRes?.ok) {
        const d = await webhookRes.json();
        if (d.success && d.data) {
          setWebhookConfig(d.data);
          setUrlOverrideInput(d.data.isCustomOverride ? d.data.baseUrl : '');
          if (d.data.verifyToken) {
            setMetaSettings((prev) => ({ ...prev, WEBHOOK_VERIFY_TOKEN: d.data.verifyToken }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      flashError(err.message || 'Failed to load system admin data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Handle Meta Test Connection
  async function handleTestMetaConnection() {
    setTestingConnection(true);
    setMetaConnectionResult(null);
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          token: metaSettings.WHATSAPP_API_TOKEN,
          phoneNumberId: metaSettings.WHATSAPP_PHONE_NUMBER_ID
        })
      });
      const data = await res.json();
      setMetaConnectionResult(data);
      if (data.success) {
        flashSuccess('Meta WhatsApp Cloud API is connected and authenticated!');
      } else {
        flashError(data.message || 'Connection test failed.');
      }
    } catch (err) {
      setMetaConnectionResult({ success: false, message: err.message });
      flashError(err.message);
    } finally {
      setTestingConnection(false);
    }
  }

  // Handle Save Meta Settings
  async function handleSaveMetaSettings(e) {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(metaSettings)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update settings');
      flashSuccess('System platform settings saved successfully.');
      loadAdminData();
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // Handle Toggle User Status
  async function handleToggleUserStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAdminData();
      } else {
        flashError(data.message);
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Handle Toggle Role
  async function handleToggleRole(userId, currentRole) {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAdminData();
      } else {
        flashError(data.message);
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Handle Assign Phone
  async function handleAssignPhone(userId, phoneId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/assign-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phoneId: phoneId || null })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAdminData();
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Handle Set Default Phone
  async function handleSetDefaultPhone(id) {
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess('Default workspace WABA line updated.');
        loadAdminData();
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Handle Delete Phone
  async function handleDeletePhone(id, displayName) {
    if (!confirm(`Remove '${displayName}' from registered WABA senders?`)) return;
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAdminData();
      } else {
        flashError(data.message);
      }
    } catch (err) {
      flashError(err.message);
    }
  }

  // Handle Live Test / Verification of specific phone line
  async function handleTestPhoneLine(id) {
    setTestingPhoneId(id);
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message || 'Line verified with Meta Graph API!');
        loadAdminData();
      } else {
        flashError(data.message || 'Meta line verification failed.');
      }
    } catch (err) {
      flashError(err.message);
    } finally {
      setTestingPhoneId(null);
    }
  }

  // Open Meta PIN Registration modal for existing line
  function handleOpenRegisterPinModal(phone) {
    setPhoneModalData({
      phone_number_id: phone.phone_number_id,
      display_name: phone.display_name,
      phone_number: phone.phone_number,
      waba_id: phone.waba_id,
      is_default: phone.is_default,
      mode: 'meta_pin'
    });
    setShowPhoneModal(true);
  }

  // Webhook Management Handlers (Admin Only)
  async function handleGenerateNewToken() {
    setGeneratingToken(true);
    try {
      const res = await fetch('/api/admin/webhooks/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate new verify token.');
      }
      setWebhookConfig((prev) => ({ ...prev, verifyToken: data.data.verifyToken }));
      setMetaSettings((prev) => ({ ...prev, WEBHOOK_VERIFY_TOKEN: data.data.verifyToken }));
      setShowRotateConfirmModal(false);
      flashSuccess('New system verify token generated successfully! Remember to update it in Meta App Dashboard.');
    } catch (err) {
      flashError(err.message);
    } finally {
      setGeneratingToken(false);
    }
  }

  async function handleSaveUrlOverride() {
    setSavingUrlOverride(true);
    try {
      const res = await fetch('/api/admin/webhooks/url-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ publicUrl: urlOverrideInput })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update public URL override.');
      }
      setWebhookConfig((prev) => ({
        ...prev,
        primaryUrl: data.data.primaryUrl,
        altUrl: data.data.altUrl,
        baseUrl: data.data.baseUrl,
        isCustomOverride: data.data.isCustomOverride,
        isHttps: data.data.isHttps
      }));
      flashSuccess(data.message || 'Public Webhook URL updated.');
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingUrlOverride(false);
    }
  }

  async function handleResetUrlOverride() {
    setUrlOverrideInput('');
    setSavingUrlOverride(true);
    try {
      const res = await fetch('/api/admin/webhooks/url-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ publicUrl: '' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to reset public URL.');
      }
      setWebhookConfig((prev) => ({
        ...prev,
        primaryUrl: data.data.primaryUrl,
        altUrl: data.data.altUrl,
        baseUrl: data.data.baseUrl,
        isCustomOverride: data.data.isCustomOverride,
        isHttps: data.data.isHttps
      }));
      flashSuccess('Public Webhook URL reset to default host.');
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingUrlOverride(false);
    }
  }

  async function handleTestHandshake() {
    setTestingHandshake(true);
    setHandshakeResult(null);
    try {
      const res = await fetch('/api/admin/webhooks/test-handshake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: webhookConfig.verifyToken })
      });
      const data = await res.json();
      setHandshakeResult({
        success: data.success,
        message: data.message || (data.success ? 'Handshake verified!' : 'Handshake failed'),
        data: data.data
      });
      if (data.success) {
        flashSuccess('Meta Webhook handshake verified successfully!');
      } else {
        flashError(data.message || 'Handshake test failed.');
      }
    } catch (err) {
      setHandshakeResult({
        success: false,
        message: err.message,
        data: null
      });
      flashError(err.message);
    } finally {
      setTestingHandshake(false);
    }
  }

  const publicWebhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/webhook`;

  const tabs = [
    { id: 'overview', label: 'System Overview', icon: Activity },
    { id: 'users', label: 'Users & Roles', icon: Users, badge: users.length },
    { id: 'recycle', label: 'Recycle Bin', icon: Trash2 },
    { id: 'compliance', label: 'DPDP Privacy Desk', icon: ShieldCheck },
    { id: 'whatsapp', label: 'WhatsApp & WABA Manager', icon: Smartphone, badge: phoneNumbers.length },
    { id: 'webhooks', label: 'Meta Webhooks & Security', icon: Webhook },
    { id: 'queue', label: 'Job Queue & Workers', icon: Server },
    { id: 'payouts', label: 'Payouts & Settlement Rules', icon: Landmark },
    { id: 'audit', label: 'Security Audit Logs', icon: ShieldCheck, badge: auditTotal }
  ];

  const phoneColumns = useMemo(() => [
    {
      key: 'display_name',
      header: 'Sender Label',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>
    },
    {
      key: 'phone_number',
      header: 'Phone Number',
      sortable: true,
      render: (v) => <span style={{ fontFamily: 'monospace' }}>{v}</span>
    },
    {
      key: 'phone_number_id',
      header: 'Phone Number ID',
      sortable: true,
      render: (v) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{v}</span>
    },
    {
      key: 'status',
      header: 'Meta Status',
      sortable: true,
      render: (v) => {
        const st = (v || 'VERIFIED').toUpperCase();
        const isConnected = ['CONNECTED', 'VERIFIED', 'REGISTERED'].includes(st);
        return <Badge variant={isConnected ? 'success' : 'warning'}>{st}</Badge>;
      }
    },
    {
      key: 'quality_rating',
      header: 'Quality Rating',
      sortable: true,
      render: (v) => (
        <Badge variant={v === 'GREEN' ? 'success' : 'warning'}>
          {v || 'GREEN'}
        </Badge>
      )
    },
    {
      key: 'is_default',
      header: 'Priority',
      align: 'center',
      render: (v, phoneRow) => {
        const phone = phoneRow || v || {};
        const isDef = Boolean(phone.is_default ?? v);
        return isDef ? (
          <Badge variant="primary">★ DEFAULT LINE</Badge>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => handleSetDefaultPhone(phone.id)}>
            Set Default
          </Button>
        );
      }
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, phoneRow) => {
        const phone = phoneRow || _ || {};
        const isDefault = Boolean(phone.is_default);
        return (
          <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleTestPhoneLine(phone.id)}
              disabled={testingPhoneId === phone.id}
              title="Verify line connection directly with Meta Graph API"
            >
              <RefreshCw size={13} className={testingPhoneId === phone.id ? 'spin-slow' : ''} />
              <span>{testingPhoneId === phone.id ? 'Verifying...' : 'Verify'}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenRegisterPinModal(phone)}
              title="Register 2-step verification PIN to Meta Graph API"
            >
              <KeyRound size={13} />
              <span>Register PIN</span>
            </Button>
            {!isDefault && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeletePhone(phone.id, phone.display_name)}
                title="Remove line from platform"
              >
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        );
      }
    }
  ], [testingPhoneId, handleSetDefaultPhone, handleTestPhoneLine, handleOpenRegisterPinModal, handleDeletePhone]);

  const auditLogColumns = useMemo(() => [
    {
      key: 'created_at',
      header: 'Timestamp',
      sortable: true,
      render: (v) => <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{formatIndianDate(v)}</span>
    },
    {
      key: 'actor',
      header: 'Actor',
      sortable: true,
      render: (_, logRow) => {
        const log = logRow || _ || {};
        return <span style={{ fontWeight: 600 }}>{log.user_name || log.user_id || 'System'}</span>;
      }
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      render: (v) => <Badge variant="primary">{v}</Badge>
    },
    {
      key: 'details',
      header: 'Details',
      render: (v) => <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>
    },
    {
      key: 'ip_address',
      header: 'IP Address',
      render: (v) => <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{v || 'Internal'}</span>
    }
  ], []);

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Executive Header */}
      <PageHeader
        title="SARVYA System Administration Panel"
        description="Centralized platform control plane: tenant identity governance, WABA Cloud API infrastructure, RBAC privileges, and system telemetry."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button variant="secondary" onClick={loadAdminData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-slow' : ''} /> Refresh
            </Button>
            <Button variant="primary" onClick={() => setShowPhoneModal(true)}>
              <Plus size={14} /> Add WABA Line
            </Button>
          </div>
        }
      />

      {/* Global Alerts */}
      {successMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--color-success-subtle, #ecfdf5)',
          color: 'var(--color-success, #2F5219)',
          border: '1px solid var(--color-success-border, #a7f3d0)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 600
        }}>
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--color-danger-subtle, #fef2f2)',
          color: 'var(--color-danger, #dc2626)',
          border: '1px solid var(--color-danger-border, #fecaca)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 600
        }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      {/* Navigation Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* =========================================================================
          TAB 1: SYSTEM OVERVIEW & TELEMETRY
          ========================================================================= */}
      {activeTab === 'overview' && (
        <AdminOverviewTab
          overview={overview}
          users={users}
          phoneNumbers={phoneNumbers}
          metaSettings={metaSettings}
          token={token}
          onRefresh={loadAdminData}
          flashSuccess={flashSuccess}
          flashError={flashError}
        />
      )}

      {/* =========================================================================
          TAB 2: USERS & ROLE MANAGEMENT
          ========================================================================= */}
      {activeTab === 'users' && (
        <AdminUsersCrudTab
          users={users}
          phoneNumbers={phoneNumbers}
          currentUser={currentUser}
          token={token}
          onRefresh={loadAdminData}
          flashSuccess={flashSuccess}
          flashError={flashError}
        />
      )}

      {/* =========================================================================
          TAB 2b: RECYCLE BIN & UNIVERSAL RESTORE
          ========================================================================= */}
      {activeTab === 'recycle' && (
        <AdminRecycleBinTab
          token={token}
          flashSuccess={flashSuccess}
          flashError={flashError}
        />
      )}

      {/* =========================================================================
          TAB 2c: DPDP ACT 2023 PRIVACY & COMPLIANCE DESK
          ========================================================================= */}
      {activeTab === 'compliance' && (
        <AdminComplianceTab
          token={token}
          flashSuccess={flashSuccess}
          flashError={flashError}
        />
      )}

      {/* =========================================================================
          TAB 3: META WHATSAPP & WABA INFRASTRUCTURE MANAGER
          ========================================================================= */}
      {activeTab === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Registered WABA Lines Table */}
          <Card>
            <CardHeader
              title="Registered WhatsApp Business Accounts & Phone Numbers"
              icon={Smartphone}
              action={
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <MetaEmbeddedSignupButton onSuccess={() => loadAdminData()} />
                  <Button variant="secondary" onClick={() => { setPhoneModalData(null); setShowPhoneModal(true); }}>
                    <Plus size={14} /> Manual Register
                  </Button>
                </div>
              }
            />
            <CardBody>
              <DataTable
                columns={phoneColumns}
                data={phoneNumbers}
                density="compact"
                pageSize={10}
                emptyMessage="No WhatsApp sender lines registered yet."
              />
            </CardBody>
          </Card>

          {/* Meta Cloud API Token & Credentials Form */}
          <Card>
            <CardHeader title="Meta WhatsApp Cloud API Configuration" icon={Key} />
            <CardBody>
              <form onSubmit={handleSaveMetaSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Meta System User Access Token (Permanent / Long-Lived)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showToken ? 'text' : 'password'}
                        className="sarvya-input"
                        style={{ width: '100%', paddingRight: '40px', fontFamily: 'monospace', fontSize: '12.5px' }}
                        value={metaSettings.WHATSAPP_API_TOKEN}
                        onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_API_TOKEN: e.target.value })}
                        placeholder="EAAWnJ..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Default WhatsApp Phone Number ID
                    </label>
                    <input
                      type="text"
                      className="sarvya-input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                      value={metaSettings.WHATSAPP_PHONE_NUMBER_ID}
                      onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_PHONE_NUMBER_ID: e.target.value })}
                      placeholder="e.g. 1292128907326342"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      WhatsApp Business Account (WABA) ID
                    </label>
                    <input
                      type="text"
                      className="sarvya-input"
                      style={{ width: '100%', fontFamily: 'monospace' }}
                      value={metaSettings.WHATSAPP_BUSINESS_ACCOUNT_ID}
                      onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_BUSINESS_ACCOUNT_ID: e.target.value, WHATSAPP_WABA_ID: e.target.value })}
                      placeholder="e.g. 1771802364060265"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Meta Graph API Version
                    </label>
                    <select
                      className="sarvya-input"
                      style={{ width: '100%' }}
                      value={metaSettings.META_GRAPH_VERSION}
                      onChange={(e) => setMetaSettings({ ...metaSettings, META_GRAPH_VERSION: e.target.value })}
                    >
                      <option value="v21.0">v21.0 (Recommended)</option>
                      <option value="v22.0">v22.0 (Latest)</option>
                      <option value="v20.0">v20.0 (Legacy)</option>
                    </select>
                  </div>
                </div>

                {/* Webhook Configuration Sub-Section */}
                <div style={{ marginTop: '10px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Public Webhook Callback URL (Copy to Meta App Dashboard)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        className="sarvya-input"
                        style={{ width: '100%', background: 'var(--bg-app)', fontFamily: 'monospace', fontSize: '12px' }}
                        value={publicWebhookUrl}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(publicWebhookUrl);
                          setCopiedWebhookUrl(true);
                          setTimeout(() => setCopiedWebhookUrl(false), 2000);
                        }}
                      >
                        {copiedWebhookUrl ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Webhook Verification Token (hub.verify_token)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="sarvya-input"
                        style={{ width: '100%', fontFamily: 'monospace', fontSize: '12.5px' }}
                        value={metaSettings.WEBHOOK_VERIFY_TOKEN}
                        onChange={(e) => setMetaSettings({ ...metaSettings, WEBHOOK_VERIFY_TOKEN: e.target.value })}
                        placeholder="wb_verify_..."
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(metaSettings.WEBHOOK_VERIFY_TOKEN);
                          setCopiedVerifyToken(true);
                          setTimeout(() => setCopiedVerifyToken(false), 2000);
                        }}
                      >
                        {copiedVerifyToken ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Meta App Secret (HMAC-SHA256 Signature Verification)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showAppSecret ? 'text' : 'password'}
                        className="sarvya-input"
                        style={{ width: '100%', paddingRight: '40px', fontFamily: 'monospace', fontSize: '12.5px' }}
                        value={metaSettings.META_APP_SECRET}
                        onChange={(e) => setMetaSettings({ ...metaSettings, META_APP_SECRET: e.target.value })}
                        placeholder="App Secret from Meta Developer Dashboard"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAppSecret(!showAppSecret)}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        {showAppSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                      Broadcast Concurrency Delay (ms)
                    </label>
                    <input
                      type="number"
                      className="sarvya-input"
                      style={{ width: '100%' }}
                      value={metaSettings.BROADCAST_DELAY_MS}
                      onChange={(e) => setMetaSettings({ ...metaSettings, BROADCAST_DELAY_MS: e.target.value })}
                      placeholder="250"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                  <Button type="button" variant="secondary" onClick={handleTestMetaConnection} disabled={testingConnection}>
                    <RefreshCw size={14} className={testingConnection ? 'spin-slow' : ''} /> Test Live Connection
                  </Button>
                  <Button type="submit" variant="primary" disabled={savingSettings}>
                    {savingSettings ? 'Saving Settings...' : 'Save Meta Settings'}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <AiFlowBuilderSetupCard token={token} onSuccess={flashSuccess} onError={flashError} />
        </div>
      )}

      {/* =========================================================================
          TAB: META WEBHOOKS & SECURITY ENGINE (ADMIN ONLY)
          ========================================================================= */}
      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Status & Telemetry Strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '16px'
          }}>
            <KpiCard
              title="Webhook Ingestion State"
              value="ACTIVE & READY"
              subValue="Accepting GET handshakes & POST event delivery"
              icon={Activity}
            />
            <KpiCard
              title="Protocol Security"
              value={webhookConfig.isHttps ? "HTTPS ACTIVE" : "HTTP (DEV)"}
              subValue={webhookConfig.isHttps ? "Compliant with Meta SSL requirements" : "Notice: Meta requires HTTPS in production"}
              icon={Globe}
            />
            <KpiCard
              title="Payload HMAC-SHA256"
              value={webhookConfig.metaAppSecretConfigured ? "VERIFIED (SECURE)" : "UNCONFIGURED"}
              subValue={webhookConfig.metaAppSecretConfigured ? "X-Hub-Signature-256 cryptographically enforced" : "Configure META_APP_SECRET for production"}
              icon={Lock}
            />
            <KpiCard
              title="Inbound Events Recorded"
              value={String(webhookConfig.stats?.totalReplies || 0)}
              subValue={webhookConfig.stats?.lastEventAt ? `Last received: ${formatIndianDate(webhookConfig.stats.lastEventAt)}` : "No inbound events received yet"}
              icon={Radio}
            />
          </div>

          {/* Section 1: Webhook Callback URL & Host Override */}
          <Card>
            <CardHeader
              title="Meta Webhook Callback URL"
              description="Provide this exact URL in the Meta Developer Portal under WhatsApp > Configuration > Webhook."
              icon={Globe}
            />
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Primary URL */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600 }}>
                        Primary Callback URL (Standard)
                      </label>
                      <Badge variant={webhookConfig.isHttps ? "success" : "warning"}>
                        {webhookConfig.isHttps ? "SSL Secure" : "Insecure (HTTP)"}
                      </Badge>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        className="sarvya-input"
                        style={{ width: '100%', background: 'var(--bg-app)', fontFamily: 'monospace', fontSize: '12.5px' }}
                        value={webhookConfig.primaryUrl || publicWebhookUrl}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookConfig.primaryUrl || publicWebhookUrl);
                          setCopiedPrimaryUrl(true);
                          setTimeout(() => setCopiedPrimaryUrl(false), 2000);
                        }}
                      >
                        {copiedPrimaryUrl ? <Check size={14} color="#2F5219" /> : <Copy size={14} />}
                      </Button>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Recommended: Paste this into Meta App Dashboard &gt; Webhook Callback URL.
                    </span>
                  </div>

                  {/* Secondary / API URL */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600 }}>
                        Alternative API Callback URL
                      </label>
                      <Badge variant="neutral">Direct API Path</Badge>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        className="sarvya-input"
                        style={{ width: '100%', background: 'var(--bg-app)', fontFamily: 'monospace', fontSize: '12.5px' }}
                        value={webhookConfig.altUrl || `${publicWebhookUrl.replace(/\/webhook$/, '')}/api/webhook`}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookConfig.altUrl);
                          setCopiedAltUrl(true);
                          setTimeout(() => setCopiedAltUrl(false), 2000);
                        }}
                      >
                        {copiedAltUrl ? <Check size={14} color="#2F5219" /> : <Copy size={14} />}
                      </Button>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      Use if your reverse proxy / load balancer prefixes routes with <code>/api</code>.
                    </span>
                  </div>
                </div>

                {/* Public Base URL Override */}
                <div style={{
                  padding: '16px',
                  borderRadius: '8px',
                  background: 'var(--bg-card-subtle, #f8fafc)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>Public Domain / Proxy Host Override</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        If SARVYA is hosted behind Nginx, Cloudflare Tunnel, or a public domain, specify the external root URL (e.g. <code>https://api.sarvya.com</code>).
                      </p>
                    </div>
                    {webhookConfig.isCustomOverride && (
                      <Badge variant="primary">Custom Host Override Active</Badge>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', maxWidth: '600px' }}>
                    <input
                      type="url"
                      className="sarvya-input"
                      style={{ width: '100%', fontFamily: 'monospace', fontSize: '12.5px' }}
                      placeholder="https://api.yourdomain.com"
                      value={urlOverrideInput}
                      onChange={(e) => setUrlOverrideInput(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleSaveUrlOverride}
                      disabled={savingUrlOverride}
                    >
                      {savingUrlOverride ? 'Saving...' : 'Save Host'}
                    </Button>
                    {webhookConfig.isCustomOverride && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleResetUrlOverride}
                        disabled={savingUrlOverride}
                      >
                        Reset Default
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Section 2: Verification Token Management */}
          <Card>
            <CardHeader
              title="System-Generated Webhook Verification Token"
              description="Meta sends this token via hub.verify_token to authenticate that SARVYA owns and operates the receiving endpoint."
              icon={KeyRound}
            />
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Active Verification Token</span>
                      <Badge variant="success">System Generated & Active</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowWebhookToken(!showWebhookToken)}
                      >
                        {showWebhookToken ? <EyeOff size={14} /> : <Eye size={14} />} {showWebhookToken ? 'Hide' : 'Reveal'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookConfig.verifyToken);
                          setCopiedWebhookToken(true);
                          setTimeout(() => setCopiedWebhookToken(false), 2000);
                        }}
                      >
                        {copiedWebhookToken ? <Check size={14} color="#2F5219" /> : <Copy size={14} />}
                        {copiedWebhookToken ? 'Copied' : 'Copy Token'}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => setShowRotateConfirmModal(true)}
                        style={{ background: 'var(--sarvya-blue)', borderColor: 'var(--sarvya-blue)' }}
                      >
                        <Zap size={14} /> Generate New Token
                      </Button>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    wordBreak: 'break-all',
                    letterSpacing: '0.5px'
                  }}>
                    {showWebhookToken
                      ? webhookConfig.verifyToken
                      : webhookConfig.verifyToken
                        ? `${webhookConfig.verifyToken.substring(0, 8)}••••••••••••••••••••••••${webhookConfig.verifyToken.substring(webhookConfig.verifyToken.length - 4)}`
                        : 'No token configured'}
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    🔐 This token is protected under <strong>Administrator Only</strong> access. Standard operators and guests cannot view or modify it. Copy this string and paste it into the <strong>Verify token</strong> field in your Meta App Dashboard.
                  </p>
                </div>

                {/* Handshake Verification Simulator */}
                <div style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: '#FFFFFF',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '13.5px', fontWeight: 600 }}>Test Verification Handshake Simulator</span>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Executes a simulated Meta <code>GET /webhook?hub.mode=subscribe&amp;hub.challenge=...</code> request against the server to verify verification handshake readiness.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTestHandshake}
                      disabled={testingHandshake}
                    >
                      <RefreshCw size={14} className={testingHandshake ? 'spin-slow' : ''} />
                      {testingHandshake ? 'Testing Handshake...' : 'Run Handshake Test'}
                    </Button>
                  </div>

                  {handshakeResult && (
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: handshakeResult.success ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${handshakeResult.success ? '#a7f3d0' : '#fecaca'}`,
                      color: handshakeResult.success ? '#065f46' : '#991b1b',
                      fontSize: '13px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                        {handshakeResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {handshakeResult.message}
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                        Latency: <strong>{handshakeResult.data?.latencyMs || 1}ms</strong> | Challenge Echoed: <strong>{handshakeResult.data?.challengeEchoed ? 'YES' : 'NO'}</strong> | Timestamp: {formatIndianDate(new Date().toISOString())}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Section 3: Meta App Dashboard Setup Walkthrough */}
          <Card>
            <CardHeader
              title="Meta App Dashboard Setup Instructions"
              description="Step-by-step guidance to connect your WhatsApp Business Account to SARVYA."
              icon={HelpCircle}
            />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px', color: 'var(--sarvya-blue)' }}>
                    Step 1: Open Meta Dashboard
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sarvya-blue)', fontWeight: 600 }}>Meta Developer Dashboard</a>, select your Business App, and navigate to <strong>WhatsApp &gt; Configuration</strong> in the left sidebar.
                  </p>
                </div>

                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px', color: 'var(--sarvya-blue)' }}>
                    Step 2: Edit Webhook
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Under the <strong>Webhook</strong> card, click <strong>Edit</strong>. Paste the <strong>Callback URL</strong> and the <strong>Verify Token</strong> from above, then click <strong>Verify and save</strong>.
                  </p>
                </div>

                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', marginBottom: '8px', color: 'var(--sarvya-blue)' }}>
                    Step 3: Webhook Subscriptions
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Click <strong>Manage</strong> next to Webhook fields, and subscribe to:
                    <br />
                    <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', marginRight: '4px' }}>messages</code>
                    <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px', fontSize: '11px', marginRight: '4px' }}>message_deliveries</code>
                    <code style={{ background: '#e2e8f0', padding: '2px 4px', borderRadius: '4px', fontSize: '11px' }}>messaging_postbacks</code>
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 5: TRANSACTIONAL JOB QUEUE & WORKERS
          ========================================================================= */}
      {activeTab === 'queue' && (
        <JobQueueMonitor token={token} toast={(msg) => setSuccessMsg(msg)} />
      )}

      {/* =========================================================================
          TAB 4: MERCHANT PAYOUTS & SETTLEMENT RULES
          ========================================================================= */}
      {activeTab === 'payouts' && (
        <Card>
          <CardHeader title="Merchant Commission & Payout Settlement Rules" icon={Landmark} />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Configure global merchant settlement policies, automated platform fees, and instant IMPS/NEFT bank payout thresholds for your multi-industry sub-merchants.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Default Platform Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    className="sarvya-input"
                    style={{ width: '100%' }}
                    value={settlementConfig.platformFeePercent}
                    onChange={(e) => setSettlementConfig({ ...settlementConfig, platformFeePercent: e.target.value })}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Deducted automatically from gross merchant orders</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Minimum Payout Settlement Threshold (₹)
                  </label>
                  <input
                    type="number"
                    className="sarvya-input"
                    style={{ width: '100%' }}
                    value={settlementConfig.minPayoutThreshold}
                    onChange={(e) => setSettlementConfig({ ...settlementConfig, minPayoutThreshold: e.target.value })}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Minimum balance before automated settlement batch executes</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Automated Penny-Drop Bank KYC
                  </label>
                  <select
                    className="sarvya-input"
                    style={{ width: '100%' }}
                    value={settlementConfig.pennyDropEnabled ? 'true' : 'false'}
                    onChange={(e) => setSettlementConfig({ ...settlementConfig, pennyDropEnabled: e.target.value === 'true' })}
                  >
                    <option value="true">Enabled (₹1.00 Verification Required)</option>
                    <option value="false">Manual Admin Review Only</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Instant Payout Dispatches
                  </label>
                  <select
                    className="sarvya-input"
                    style={{ width: '100%' }}
                    value={settlementConfig.instantPayoutsEnabled ? 'true' : 'false'}
                    onChange={(e) => setSettlementConfig({ ...settlementConfig, instantPayoutsEnabled: e.target.value === 'true' })}
                  >
                    <option value="true">Active (Immediate IMPS Dispatch)</option>
                    <option value="false">Paused (Scheduled T+1 Batch Only)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button
                  variant="primary"
                  disabled={savingSettlement}
                  onClick={async () => {
                    setSavingSettlement(true);
                    try {
                      const res = await fetch('/api/settings', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                          SETTLEMENT_COMMISSION_PERCENT: settlementConfig.platformFeePercent,
                          SETTLEMENT_MIN_THRESHOLD: settlementConfig.minPayoutThreshold,
                          SETTLEMENT_PENNY_DROP: String(settlementConfig.pennyDropEnabled),
                          SETTLEMENT_INSTANT_PAYOUTS: String(settlementConfig.instantPayoutsEnabled)
                        })
                      });
                      const d = await res.json();
                      if (!res.ok || !d.success) throw new Error(d.message || 'Failed to update settlement rules');
                      flashSuccess('Platform settlement policies updated successfully.');
                      loadAdminData();
                    } catch (err) {
                      flashError(err.message);
                    } finally {
                      setSavingSettlement(false);
                    }
                  }}
                >
                  {savingSettlement ? 'Saving Rules...' : 'Save Settlement Rules'}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* =========================================================================
          TAB 5: SECURITY AUDIT LOGS & DIAGNOSTICS
          ========================================================================= */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader
            title="System Security & Platform Audit Trail"
            icon={ShieldCheck}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(auditLogs, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `sarvya_audit_logs_${Date.now()}.json`;
                  a.click();
                }}
              >
                Export Audit Logs
              </Button>
            }
          />
          <CardBody>
            <DataTable
              columns={auditLogColumns}
              data={auditLogs}
              density="compact"
              pageSize={10}
              emptyMessage="No audit events recorded yet. Platform actions are automatically logged here."
            />
          </CardBody>
        </Card>
      )}

      {/* Add WABA Phone Modal */}
      <AddPhoneNumberModal
        isOpen={showPhoneModal}
        onClose={() => { setShowPhoneModal(false); setPhoneModalData(null); }}
        onSuccess={() => {
          setShowPhoneModal(false);
          setPhoneModalData(null);
          flashSuccess('WhatsApp sender line updated and synced successfully.');
          loadAdminData();
        }}
        onAdded={() => {
          setShowPhoneModal(false);
          setPhoneModalData(null);
          flashSuccess('New WhatsApp Phone Number registered successfully.');
          loadAdminData();
        }}
        initialData={phoneModalData}
      />

      {/* Webhook Verify Token Rotation Modal (Admin Only) */}
      <Modal
        isOpen={showRotateConfirmModal}
        onClose={() => setShowRotateConfirmModal(false)}
        title="Rotate Meta Webhook Verification Token"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: '#fffbeb',
            color: '#b45309',
            border: '1px solid #fde68a',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Notice: Meta Developer Console Handshake Requirement</strong>
              <p style={{ margin: '4px 0 0 0', lineHeight: 1.45 }}>
                Generating a new verify token will immediately replace the active token. Meta will not be able to verify changes to your Webhook configuration until you update the <strong>Verify token</strong> in your Meta App Dashboard.
              </p>
            </div>
          </div>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: 0 }}>
            Are you sure you want to generate a new high-entropy system verification token?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <Button variant="secondary" onClick={() => setShowRotateConfirmModal(false)} disabled={generatingToken}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGenerateNewToken} disabled={generatingToken}>
              {generatingToken ? 'Generating...' : 'Confirm & Generate Token'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

