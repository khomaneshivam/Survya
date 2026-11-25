import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from './AddPhoneNumberModal';
import { Modal, Button } from './ui';
import {
  Menu,
  Search,
  Plus,
  Bell,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Smartphone,
  Settings,
  LogOut,
  ShieldCheck,
  Send,
  Users,
  FileSpreadsheet,
  MessageSquare,
  Briefcase,
  Check,
  Building
} from 'lucide-react';

const MODULE_SEARCH_INDEX = [
  { id: 'dashboard', label: 'Overview', group: 'SARVYA Insights', keywords: 'overview dashboard metrics kpi summary' },
  { id: 'enquiries', label: 'CRM & Booking Pipeline', group: 'SARVYA CRM', keywords: 'crm contacts leads pipeline enquiries quotes' },
  { id: 'flows', label: 'Flow Builder', group: 'SARVYA Flow', keywords: 'flow builder forms workflows interactive json publish studio' },
  { id: 'inbox', label: 'Shared Conversations', group: 'SARVYA Connect', keywords: 'inbox chat messages conversations whatsapp replies' },
  { id: 'autoreply', label: 'Automation Studio', group: 'Workspace Controls', keywords: 'auto reply bot concierge automated templates visual workflow', workspaceAdminOnly: true },
  { id: 'broadcast', label: 'Campaigns Studio', group: 'SARVYA Connect', keywords: 'campaigns broadcast bulk template send' },
  { id: 'ai', label: 'AI Assistant & Guardrails', group: 'SARVYA AI', keywords: 'ai assistant auto reply rules prompts safety' },
  { id: 'reports', label: 'Insights & Telemetry', group: 'SARVYA Insights', keywords: 'insights analytics reports export logs' },
  { id: 'catalog', label: 'Catalog, Menu & Inventory', group: 'Industry Module', keywords: 'catalog menu dishes rooms items 86 stock inventory' },
  { id: 'inventory', label: 'Hospitality Inventory', group: 'Industry Module', keywords: 'hospitality rooms inventory calendar rates' },
  { id: 'links', label: 'Chat Links & In-App Chat', group: 'SARVYA Connect', keywords: 'chat links qr codes customer landing conversations' },
  { id: 'connect', label: 'Connect & Integrations', group: 'Workspace Controls', keywords: 'connect waba templates webhooks sheets integrations', workspaceAdminOnly: true },
  { id: 'settings', label: 'Team & Settings', group: 'Account', keywords: 'profile settings password team users billing waba line auto-reply' },
  { id: 'payouts', label: 'Payouts & Bank Settlements', group: 'Platform Governance', keywords: 'payouts bank settlements imps utr balance penny drop', adminOnly: true, platformAdminOnly: true },
  { id: 'pricing', label: 'Enterprise Plans', group: 'SARVYA Core', keywords: 'plans pricing tiers billing' },
  { id: 'admin', label: 'System Admin Panel', group: 'Platform Governance', keywords: 'admin users roles tokens meta waba audit logs system', adminOnly: true, platformAdminOnly: true }
];

const TAB_META = {
  dashboard: { module: 'Insights', title: 'Overview' },
  enquiries: { module: 'CRM', title: 'Contacts & Pipeline' },
  flows: { module: 'Flow', title: 'Flow Builder' },
  automation: { module: 'Flow', title: 'Flow Builder' },
  inbox: { module: 'Connect', title: 'Conversations' },
  autoreply: { module: 'Connect', title: 'Automation Studio' },
  broadcast: { module: 'Connect', title: 'Campaigns' },
  ai: { module: 'AI', title: 'Assistant & Safety' },
  reports: { module: 'Insights', title: 'Analytics & Reports' },
  catalog: { module: 'Industry', title: 'Catalog, Menu & Inventory' },
  inventory: { module: 'Industry', title: 'Hospitality Inventory' },
  payouts: { module: 'Governance', title: 'Payouts & Settlements' },
  links: { module: 'Connect', title: 'Chat Links' },
  pricing: { module: 'Core', title: 'Plans & Modules' },
  admin: { module: 'Governance', title: 'System Admin Panel' },
  settings: { module: 'Account', title: 'Team & Settings' },
  connect: { module: 'Connect', title: 'Connect & Integrations' }
};

export default function Topbar({ activeTab, setActiveTab, setMobileOpen }) {
  const { token, user, isPlatformAdmin, isWorkspaceAdmin, logout, switchWorkspace } = useAuth();
  const [metaStatus, setMetaStatus] = useState({ connected: false, loading: true });
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeNumber, setActiveNumber] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);
  const [showAddWsModal, setShowAddWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsSlug, setNewWsSlug] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsError, setWsError] = useState(null);

  const [globalQuery, setGlobalQuery] = useState('');
  const [openMenu, setOpenMenu] = useState(null); // 'workspace' | 'create' | 'notifications' | 'help' | 'profile' | null
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingEnquiries, setPendingEnquiries] = useState(0);

  const headerRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const checkMetaHealth = useCallback(async () => {
    setIsVerifying(true);
    try {
      const activeToken = token || localStorage.getItem('token');
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await fetch('/api/settings/verify-meta', { headers });
      const data = await res.json();
      setMetaStatus({
        connected: Boolean(data.success),
        loading: false,
        message: data.message,
        hint: data.hint
      });
    } catch (err) {
      setMetaStatus({ connected: false, loading: false, message: err.message });
    } finally {
      setIsVerifying(false);
    }
  }, [token]);

  const fetchWorkspaceContext = useCallback(async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const wsId = localStorage.getItem('workspace_id');
    if (wsId) headers['x-workspace-id'] = wsId;

    try {
      const [numRes, sumRes, wsRes] = await Promise.all([
        fetch('/api/admin/phone-numbers', { headers }),
        fetch('/api/v1/dashboard/summary', { headers }).catch(() => null),
        fetch('/api/v1/agency/workspaces', { headers }).catch(() => null)
      ]);
      const numData = await numRes.json();
      if (numData.success && Array.isArray(numData.data)) {
        setPhoneNumbers(numData.data);
        const def = numData.data.find((n) => n.is_default) || numData.data[0] || null;
        setActiveNumber(def);
      }
      if (sumRes) {
        const sumData = await sumRes.json().catch(() => null);
        if (sumData?.success && sumData.data) {
          setPendingEnquiries(sumData.data.pendingEnquiries || sumData.data.openEnquiries || 0);
          setUnreadCount(sumData.data.unreadMessages || 0);
        }
      }
      if (wsRes) {
        const wsData = await wsRes.json().catch(() => null);
        if (wsData?.success && Array.isArray(wsData.data)) {
          setWorkspaces(wsData.data);
        }
      }
    } catch {
      // Non-blocking topbar telemetry
    }
  }, [token]);

  useEffect(() => {
    checkMetaHealth();
    fetchWorkspaceContext();
  }, [checkMetaHealth, fetchWorkspaceContext]);

  async function handleCreateWorkspace(e) {
    e.preventDefault();
    if (!newWsName.trim()) {
      setWsError('Workspace name is required.');
      return;
    }
    setCreatingWs(true);
    setWsError(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      };
      const res = await fetch('/api/v1/agency/workspaces', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newWsName.trim(),
          slug: newWsSlug.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create workspace.');
      }
      setShowAddWsModal(false);
      setNewWsName('');
      setNewWsSlug('');
      // Switch into newly created workspace immediately
      if (data.workspace?.id && switchWorkspace) {
        await switchWorkspace(data.workspace.id);
      }
      await fetchWorkspaceContext();
    } catch (err) {
      setWsError(err.message);
    } finally {
      setCreatingWs(false);
    }
  }

  async function switchDefaultLine(lineId) {
    try {
      const endpoint = isPlatformAdmin
        ? `/api/admin/phone-numbers/${lineId}/default`
        : `/api/phone-numbers/${lineId}/default`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchWorkspaceContext();
      }
    } catch {
      // Ignore transient switch failures
    } finally {
      setOpenMenu(null);
    }
  }

  const currentMeta = TAB_META[activeTab] || TAB_META.dashboard;
  const searchMatches = globalQuery.trim()
    ? MODULE_SEARCH_INDEX.filter((m) => {
        if ((m.platformAdminOnly || m.adminOnly) && !isPlatformAdmin) return false;
        if (m.workspaceAdminOnly && !isWorkspaceAdmin) return false;
        const q = globalQuery.toLowerCase();
        return m.label.toLowerCase().includes(q) || m.keywords.includes(q);
      })
    : [];

  return (
    <header ref={headerRef} className="app-topbar">
      {/* Left: Mobile toggle, Workspace Switcher, Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm mobile-menu-btn"
          aria-label="Open navigation menu"
          style={{ padding: '6px' }}
        >
          <Menu size={18} />
        </button>

        {/* Workspace & Agency Switcher: Clean Popover for All Authenticated Users */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
            onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
            aria-expanded={openMenu === 'workspace'}
            style={{ maxWidth: '240px', justifyContent: 'space-between', gap: '8px' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <Building size={14} color="var(--sarvya-blue)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {user?.tenant?.name || 'SARVYA Workspace'}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: user?.tenant?.plan_code === 'ENTERPRISE' ? '#ede9fe' : '#dbeafe',
                  color: user?.tenant?.plan_code === 'ENTERPRISE' ? '#6d28d9' : '#1d4ed8'
                }}
              >
                {user?.tenant?.plan_code || 'TRIAL'}
              </span>
              <ChevronDown size={13} color="var(--text-muted)" />
            </div>
          </button>

          {openMenu === 'workspace' && (
            <div className="sarvya-popover" style={{ insetInlineStart: 0, insetInlineEnd: 'auto', minWidth: '290px', maxHeight: '450px', overflowY: 'auto' }}>
              {/* Workspaces Section */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Workspaces &amp; Accounts
              </div>
              {workspaces.length === 0 ? (
                <div style={{ padding: '10px 14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {user?.tenant?.name || 'Primary Workspace'}
                </div>
              ) : (
                workspaces.map((ws) => {
                  const isCurrent = ws.isCurrent || ws.id === user?.tenant_id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      className="sarvya-menu-item"
                      onClick={async () => {
                        setOpenMenu(null);
                        if (!isCurrent && switchWorkspace) {
                          await switchWorkspace(ws.id);
                          await fetchWorkspaceContext();
                        }
                      }}
                      style={{
                        justifyContent: 'space-between',
                        background: isCurrent ? 'var(--surface-hover)' : 'transparent',
                        fontWeight: isCurrent ? 600 : 400
                      }}
                    >
                      <div style={{ minWidth: 0, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</span>
                          <span style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '3px', background: '#f1f5f9', color: '#475569' }}>
                            {ws.planCode}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {ws.connectedLinesCount} WhatsApp {ws.connectedLinesCount === 1 ? 'Line' : 'Lines'}
                        </div>
                      </div>
                      {isCurrent && <Check size={14} color="#2F5219" style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}

              {/* Add Client Workspace button (Enterprise or Platform Admin) */}
              {(isPlatformAdmin || user?.tenant?.plan_code === 'ENTERPRISE') && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px' }}>
                  <button
                    type="button"
                    className="sarvya-menu-item"
                    onClick={() => {
                      setOpenMenu(null);
                      setShowAddWsModal(true);
                    }}
                    style={{ color: 'var(--sarvya-blue)', fontWeight: 600 }}
                  >
                    <Plus size={14} />
                    <span>Create Client Workspace</span>
                  </button>
                </div>
              )}

              {/* WhatsApp Channels Section */}
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Active WhatsApp Channels
              </div>
              {phoneNumbers.length === 0 ? (
                <div style={{ padding: '10px 14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  No channels connected to this workspace.
                </div>
              ) : (
                phoneNumbers.map((line, idx) => (
                  <button
                    key={line.id ? `${line.id}_${idx}` : `line_${idx}`}
                    type="button"
                    className="sarvya-menu-item"
                    onClick={() => switchDefaultLine(line.id)}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <div style={{ minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>{line.display_name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{line.phone_number}</div>
                    </div>
                    {line.is_default ? (
                      <span className="sarvya-badge sarvya-badge-blue">Primary</span>
                    ) : null}
                  </button>
                ))
              )}

              {isWorkspaceAdmin && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px' }}>
                  <button
                    type="button"
                    className="sarvya-menu-item"
                    onClick={() => {
                      setOpenMenu(null);
                      setShowAddPhoneModal(true);
                    }}
                    style={{ color: '#2F5219', fontWeight: 600 }}
                  >
                    <Plus size={14} />
                    <span>Connect WhatsApp Line</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="topbar-sender-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', minWidth: 0 }}>
          <span>{currentMeta.module}</span>
          <ChevronRight size={13} color="var(--text-muted)" />
          <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentMeta.title}
          </span>
        </div>
      </div>

      {/* Right: Global Search, Quick Create, Meta Pill, Notifications, Help, Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Global Search */}
        <div className="topbar-ist-clock" style={{ position: 'relative', width: '210px' }}>
          <Search size={14} className="sarvya-search-icon" />
          <input
            type="search"
            className="sarvya-input"
            placeholder="Jump to module..."
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            aria-label="Global navigation search"
            style={{ padding: '6px 10px 6px 30px', fontSize: '12.5px' }}
          />
          {searchMatches.length > 0 && (
            <div className="sarvya-popover" style={{ width: '260px', insetInlineStart: 0 }}>
              {searchMatches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="sarvya-menu-item"
                  onClick={() => {
                    setActiveTab(m.id);
                    setGlobalQuery('');
                  }}
                  style={{ justifyContent: 'space-between' }}
                >
                  <span>{m.label}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.group}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Meta API Health: Interactive Check for Workspace/Platform Admins, Subtle Indicator for Agents */}
        {isWorkspaceAdmin ? (
          <button
            type="button"
            onClick={checkMetaHealth}
            className={`sarvya-badge ${metaStatus.connected ? 'sarvya-badge-green' : 'sarvya-badge-coral'}`}
            title={metaStatus.connected ? 'Meta Cloud API connected' : (metaStatus.message || 'Check Meta connection')}
            style={{ cursor: 'pointer', padding: '4px 10px' }}
          >
            <span
              className="sarvya-status-dot"
              style={{ background: metaStatus.connected ? '#4C7A2B' : '#C9403D' }}
            />
            <span>{metaStatus.loading ? 'Checking' : (metaStatus.connected ? 'Meta Live' : 'Offline')}</span>
            <RefreshCw size={11} className={isVerifying ? 'spin-slow' : ''} />
          </button>
        ) : (
          <div
            className={`sarvya-badge ${metaStatus.connected ? 'sarvya-badge-green' : 'sarvya-badge-neutral'}`}
            style={{ padding: '4px 9px', fontSize: '11.5px' }}
            title={metaStatus.connected ? 'WhatsApp service ready' : 'WhatsApp service connecting'}
          >
            <span
              className="sarvya-status-dot"
              style={{ background: metaStatus.connected ? '#4C7A2B' : '#8C8C8C' }}
            />
            <span>{metaStatus.connected ? 'WhatsApp Ready' : 'Standby'}</span>
          </div>
        )}

        {/* Dedicated Admin Panel Quick Access Button strictly for Platform Super-Admins */}
        {isPlatformAdmin && (
          <button
            type="button"
            className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
            onClick={() => setActiveTab('admin')}
            title="Open System Admin Panel"
            style={{
              color: 'var(--sarvya-blue)',
              borderColor: 'var(--sarvya-blue-border)',
              background: 'var(--sarvya-blue-soft)',
              fontWeight: 600
            }}
          >
            <ShieldCheck size={14} />
            <span className="topbar-action-text">Admin Panel</span>
          </button>
        )}

        {/* Quick Create */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-primary sarvya-btn-sm"
            onClick={() => setOpenMenu(openMenu === 'create' ? null : 'create')}
            aria-expanded={openMenu === 'create'}
          >
            <Plus size={14} />
            <span className="topbar-action-text">Create</span>
          </button>

          {openMenu === 'create' && (
            <div className="sarvya-popover">
              <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Quick Create
              </div>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('enquiries'); }}
              >
                <Users size={14} color="var(--sarvya-blue)" />
                <span>CRM Enquiry / Contact</span>
              </button>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('broadcast'); }}
              >
                <Send size={14} color="var(--sarvya-blue)" />
                <span>Broadcast Campaign</span>
              </button>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('flows'); }}
              >
                <FileSpreadsheet size={14} color="var(--sarvya-blue)" />
                <span>Interactive Form / Flow</span>
              </button>
              {isWorkspaceAdmin && (
                <button
                  type="button"
                  className="sarvya-menu-item"
                  onClick={() => { setOpenMenu(null); setShowAddPhoneModal(true); }}
                >
                  <Smartphone size={14} color="var(--sarvya-blue)" />
                  <span>Connect WhatsApp Line</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
            onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}
            aria-label="Notifications"
            style={{ position: 'relative', padding: '6px' }}
          >
            <Bell size={16} />
            {(unreadCount > 0 || pendingEnquiries > 0) && (
              <span
                style={{
                  position: 'absolute',
                  top: '4px',
                  insetInlineEnd: '4px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#C9403D'
                }}
              />
            )}
          </button>

          {openMenu === 'notifications' && (
            <div className="sarvya-popover" style={{ minWidth: '270px' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, fontSize: '13px' }}>
                Workspace Notifications
              </div>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('inbox'); }}
                style={{ justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={14} /> Unread Conversations
                </span>
                <span className="sarvya-badge sarvya-badge-blue">{unreadCount}</span>
              </button>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('enquiries'); }}
                style={{ justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={14} /> Active CRM Enquiries
                </span>
                <span className="sarvya-badge sarvya-badge-green">{pendingEnquiries}</span>
              </button>
            </div>
          )}
        </div>

        {/* Help */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
            onClick={() => setOpenMenu(openMenu === 'help' ? null : 'help')}
            aria-label="Platform Help"
            style={{ padding: '6px' }}
          >
            <HelpCircle size={16} />
          </button>

          {openMenu === 'help' && (
            <div className="sarvya-popover" style={{ minWidth: '260px', padding: '14px' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>SARVYA Quick Guide</div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Manage conversations in <strong>Inbox</strong>, collect structured data in <strong>Forms</strong>, and track leads in <strong>CRM</strong>.
              </p>
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
                style={{ width: '100%' }}
                onClick={() => { setOpenMenu(null); setActiveTab('settings'); }}
              >
                View Account Settings
              </button>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
            onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
            aria-expanded={openMenu === 'profile'}
            style={{ padding: '4px 8px 4px 5px', borderRadius: '999px' }}
          >
            <span style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: 'var(--sarvya-blue-soft)',
              color: 'var(--sarvya-blue)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700
            }}>
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </span>
            <ChevronDown size={13} color="var(--text-muted)" />
          </button>

          {openMenu === 'profile' && (
            <div className="sarvya-popover">
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{user?.name || 'Authorized User'}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{user?.email || ''}</div>
                <div style={{ marginTop: '4px' }}>
                  <span className={`sarvya-badge ${isPlatformAdmin ? 'sarvya-badge-blue' : 'sarvya-badge-neutral'}`} style={{ fontSize: '10.5px' }}>
                    {isPlatformAdmin ? 'Platform Super-Admin' : isWorkspaceAdmin ? 'Workspace Owner' : 'Operator'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('settings'); }}
              >
                <Settings size={14} />
                <span>{isWorkspaceAdmin ? 'Team & Settings' : 'My Account & Preferences'}</span>
              </button>
              {isPlatformAdmin && (
                <button
                  type="button"
                  className="sarvya-menu-item"
                  onClick={() => { setOpenMenu(null); setActiveTab('admin'); }}
                  style={{ color: 'var(--sarvya-blue)', fontWeight: 600 }}
                >
                  <ShieldCheck size={14} />
                  <span>System Admin Panel</span>
                </button>
              )}
              <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="sarvya-menu-item"
                  onClick={logout}
                  style={{ color: 'var(--status-error-text)' }}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddPhoneNumberModal
        isOpen={showAddPhoneModal}
        onClose={() => setShowAddPhoneModal(false)}
        onSuccess={(newPhone) => {
          setActiveNumber(newPhone);
          fetchWorkspaceContext();
          checkMetaHealth();
        }}
      />

      {/* Modal: Create Client Workspace (Agency White-Label Mode) */}
      <Modal
        isOpen={showAddWsModal}
        onClose={() => setShowAddWsModal(false)}
        title="Create New Client Workspace"
        size="md"
      >
        <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Create an isolated sub-workspace for your agency client. Client accounts have their own CRM pipelines, WhatsApp lines, and in-app experiences.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Client / Workspace Name <span style={{ color: 'var(--accent-coral)' }}>*</span>
            </label>
            <input
              type="text"
              className="sarvya-input"
              placeholder="e.g. Acme Resorts &amp; Tours"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              required
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              URL Slug (Optional)
            </label>
            <input
              type="text"
              className="sarvya-input"
              placeholder="e.g. acme-resorts"
              value={newWsSlug}
              onChange={(e) => setNewWsSlug(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Leave blank to automatically generate from name.
            </div>
          </div>

          {wsError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'var(--accent-coral)',
                fontSize: '12px'
              }}
            >
              {wsError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
            <Button variant="secondary" onClick={() => setShowAddWsModal(false)} disabled={creatingWs}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={creatingWs}>
              {creatingWs ? 'Creating...' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </Modal>
    </header>
  );
}
