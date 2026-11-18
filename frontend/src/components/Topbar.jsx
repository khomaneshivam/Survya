import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from './AddPhoneNumberModal';
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
  MessageSquare
} from 'lucide-react';

const MODULE_SEARCH_INDEX = [
  { id: 'dashboard', label: 'Overview', group: 'SARVYA Insights', keywords: 'overview dashboard metrics kpi summary' },
  { id: 'enquiries', label: 'CRM & Booking Pipeline', group: 'SARVYA CRM', keywords: 'crm contacts leads pipeline enquiries quotes' },
  { id: 'flows', label: 'Forms Builder', group: 'SARVYA Forms', keywords: 'forms flows builder interactive json publish' },
  { id: 'automation', label: 'Workflows & Lifecycle', group: 'SARVYA Flow', keywords: 'workflows automation sheets triggers lifecycle' },
  { id: 'inbox', label: 'Shared Conversations', group: 'SARVYA Connect', keywords: 'inbox chat messages conversations whatsapp replies' },
  { id: 'autoreply', label: 'Conversational Concierge & Auto-Reply Bot', group: 'SARVYA Connect', keywords: 'auto reply bot concierge automated replies interactive flows handoff rules dynamic cost safety' },
  { id: 'broadcast', label: 'Campaigns Studio', group: 'SARVYA Connect', keywords: 'campaigns broadcast bulk template send' },
  { id: 'ai', label: 'AI Assistant & Guardrails', group: 'SARVYA AI', keywords: 'ai assistant auto reply rules prompts safety' },
  { id: 'reports', label: 'Insights & Telemetry', group: 'SARVYA Insights', keywords: 'insights analytics reports export logs' },
  { id: 'catalog', label: 'Catalog, Menu & Inventory', group: 'Industry Module', keywords: 'catalog menu dishes rooms items 86 stock inventory' },
  { id: 'inventory', label: 'Hospitality Inventory', group: 'Industry Module', keywords: 'hospitality rooms inventory calendar rates' },
  { id: 'links', label: 'Chat Links & In-App Chat', group: 'SARVYA Connect', keywords: 'chat links qr codes customer landing conversations' },
  { id: 'settings', label: 'My Account & Preferences', group: 'Account', keywords: 'profile settings password waba line greeting auto-reply' },
  { id: 'payouts', label: 'Payouts & Bank Settlements', group: 'System Governance', keywords: 'payouts bank settlements imps utr balance penny drop', adminOnly: true },
  { id: 'pricing', label: 'Enterprise Plans', group: 'SARVYA Core', keywords: 'plans pricing tiers billing' },
  { id: 'admin', label: 'System Admin Panel', group: 'System Governance', keywords: 'admin users roles tokens meta waba audit logs system', adminOnly: true }
];

const TAB_META = {
  dashboard: { module: 'Insights', title: 'Overview' },
  enquiries: { module: 'CRM', title: 'Contacts & Pipeline' },
  flows: { module: 'Forms', title: 'Form Builder' },
  automation: { module: 'Flow', title: 'Workflows' },
  inbox: { module: 'Connect', title: 'Conversations' },
  autoreply: { module: 'Connect', title: 'Auto-Reply Bot & Concierge' },
  broadcast: { module: 'Connect', title: 'Campaigns' },
  ai: { module: 'AI', title: 'Assistant & Safety' },
  reports: { module: 'Insights', title: 'Analytics & Reports' },
  catalog: { module: 'Industry', title: 'Catalog, Menu & Inventory' },
  inventory: { module: 'Industry', title: 'Hospitality Inventory' },
  payouts: { module: 'Governance', title: 'Payouts & Settlements' },
  links: { module: 'Connect', title: 'Chat Links' },
  pricing: { module: 'Core', title: 'Plans & Modules' },
  admin: { module: 'Governance', title: 'System Admin Panel' },
  settings: { module: 'Account', title: 'My Account & Preferences' },
  connect: { module: 'Connect', title: 'Integrations & Settings' }
};

export default function Topbar({ activeTab, setActiveTab, setMobileOpen }) {
  const { token, user, isAdmin, logout } = useAuth();
  const [metaStatus, setMetaStatus] = useState({ connected: false, loading: true });
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [activeNumber, setActiveNumber] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);

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
    try {
      const [numRes, sumRes] = await Promise.all([
        fetch('/api/admin/phone-numbers', { headers }),
        fetch('/api/v1/dashboard/summary', { headers }).catch(() => null)
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
    } catch {
      // Non-blocking topbar telemetry
    }
  }, [token]);

  useEffect(() => {
    checkMetaHealth();
    fetchWorkspaceContext();
  }, [checkMetaHealth, fetchWorkspaceContext]);

  async function switchDefaultLine(lineId) {
    try {
      const endpoint = isAdmin
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
        if (m.adminOnly && !isAdmin) return false;
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

        {/* Workspace / Channel Switcher: Interactive for Admin, Clean Read-Only Badge for Users */}
        {isAdmin ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
              onClick={() => setOpenMenu(openMenu === 'workspace' ? null : 'workspace')}
              aria-expanded={openMenu === 'workspace'}
              style={{ maxWidth: '210px', justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <Smartphone size={14} color="var(--sarvya-blue)" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeNumber ? activeNumber.display_name : 'SARVYA Workspace'}
                </span>
              </span>
              <ChevronDown size={13} color="var(--text-muted)" />
            </button>

            {openMenu === 'workspace' && (
              <div className="sarvya-popover" style={{ insetInlineStart: 0, insetInlineEnd: 'auto', minWidth: '260px' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Connected Channels
                </div>
                {phoneNumbers.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    No WhatsApp channels configured yet.
                  </div>
                ) : (
                  phoneNumbers.map((line) => (
                    <button
                      key={line.id}
                      type="button"
                      className="sarvya-menu-item"
                      onClick={() => switchDefaultLine(line.id)}
                      style={{ justifyContent: 'space-between' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{line.display_name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{line.phone_number}</div>
                      </div>
                      {line.is_default && <span className="sarvya-badge sarvya-badge-blue">Primary</span>}
                    </button>
                  ))
                )}
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px' }}>
                  <button
                    type="button"
                    className="sarvya-menu-item"
                    onClick={() => {
                      setOpenMenu(null);
                      setShowAddPhoneModal(true);
                    }}
                    style={{ color: 'var(--sarvya-blue)' }}
                  >
                    <Plus size={14} />
                    <span>Connect WhatsApp Line</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="sarvya-badge sarvya-badge-neutral"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 500,
              maxWidth: '220px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)'
            }}
            title={activeNumber ? `Assigned Line: ${activeNumber.phone_number}` : 'Default Platform WhatsApp Line'}
          >
            <Smartphone size={13} color="var(--sarvya-blue)" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeNumber ? activeNumber.display_name : 'SARVYA Line'}
            </span>
          </div>
        )}

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

        {/* Meta API Health: Full Controls for Admin, Subtle Indicator for Non-Admin */}
        {isAdmin ? (
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

        {/* Dedicated Admin Panel Quick Access Button for Admins */}
        {isAdmin && (
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
              {isAdmin && (
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
                  <span className={`sarvya-badge ${isAdmin ? 'sarvya-badge-blue' : 'sarvya-badge-neutral'}`} style={{ fontSize: '10.5px' }}>
                    {isAdmin ? 'System Administrator' : 'Operator'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="sarvya-menu-item"
                onClick={() => { setOpenMenu(null); setActiveTab('settings'); }}
              >
                <Settings size={14} />
                <span>My Account &amp; Preferences</span>
              </button>
              {isAdmin && (
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
    </header>
  );
}
