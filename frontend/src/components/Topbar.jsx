import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from './AddPhoneNumberModal';
import { 
  Menu, 
  Smartphone, 
  RefreshCw,
  Plus,
  ChevronRight
} from 'lucide-react';

export default function Topbar({ activeTab, setActiveTab, setMobileOpen }) {
  const { token } = useAuth();
  const [metaStatus, setMetaStatus] = useState({ connected: false, loading: true });
  const [activeNumber, setActiveNumber] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);
  const [istTime, setIstTime] = useState('');

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setIstTime(new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(now));
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const checkMetaHealth = useCallback(async () => {
    setIsVerifying(true);
    try {
      const activeToken = token || localStorage.getItem('token');
      const headers = activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {};
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

  const fetchActiveNumber = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/phone-numbers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data?.length > 0) {
        const defaultNum = data.data.find(n => n.is_default) || data.data[0];
        setActiveNumber(defaultNum);
      }
    } catch (err) {
      console.warn('Could not fetch active line:', err.message);
    }
  }, [token]);

  useEffect(() => {
    checkMetaHealth();
    fetchActiveNumber();
  }, [checkMetaHealth, fetchActiveNumber]);

  const tabTitles = {
    dashboard: { title: 'Platform Dashboard', subtitle: 'Real-time broadcasting metrics, delivery telemetry, and active dispatches.' },
    broadcast: { title: 'Broadcast Campaign Studio', subtitle: 'Target verified audiences with official Meta templates and live handset preview.' },
    automation: { title: 'Booking Lifecycle Automation', subtitle: 'Scheduled 4-stage guest messaging triggers synced directly with Google Sheets.' },
    inbox: { title: '2-Way Guest Inbox', subtitle: 'Live webhook-driven customer conversations with instant agent replies.' },
    reports: { title: 'Analytics & Delivery Logs', subtitle: 'Audited message delivery records, Meta IDs, and 1-click Excel/CSV exports.' },
    admin: { title: 'Enterprise Admin Hub', subtitle: 'Platform user access, WhatsApp sender line registry, and system health controls.' },
    settings: { title: 'Line & API Settings', subtitle: 'Meta Graph API credentials, webhook verification, and account security.' }
  };

  const currentTab = tabTitles[activeTab] || tabTitles.dashboard;

  return (
    <header style={{
      background: '#FFFFFF',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 24px',
      height: '66px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 900,
      boxShadow: 'var(--shadow-xs)'
    }}>
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <button
          onClick={() => setMobileOpen(prev => !prev)}
          className="mobile-menu-btn"
          title="Open Menu"
          aria-label="Toggle navigation drawer"
          style={{
            background: '#F1F5F9',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: '#334155',
            cursor: 'pointer',
            padding: '7px',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Menu size={20} />
        </button>

        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#94A3B8', fontWeight: 500 }}>
            <span style={{ display: 'inline-block' }}>KonkanTrip</span>
            <ChevronRight size={11} />
            <span style={{ color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentTab.title}</span>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentTab.title}
          </div>
        </div>
      </div>

      {/* Right: Meta Status, Sender Line, & Quick Action */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Live Indian Standard Time (IST) Clock */}
        <div 
          className="topbar-ist-clock"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '6px',
            background: '#F8FAFC',
            border: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: '#334155',
            fontWeight: 600
          }}
          title="System operating on Indian Standard Time (Asia/Kolkata, UTC+05:30)"
        >
          <span style={{ fontSize: '0.85rem' }}>🇮🇳</span>
          <span>{istTime || 'IST Clock'}</span>
          <span style={{ fontSize: '0.62rem', background: '#E2E8F0', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
            IST
          </span>
        </div>

        {/* Meta Health Pill */}
        <div 
          onClick={checkMetaHealth}
          title={metaStatus.connected ? 'Meta Cloud API Connected & Ready' : (metaStatus.hint || metaStatus.message || 'Meta API Offline - Click to re-verify')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '999px',
            background: metaStatus.connected ? '#DCFCE7' : '#FEE2E2',
            border: `1px solid ${metaStatus.connected ? '#BBF7D0' : '#FECACA'}`,
            fontSize: '0.74rem',
            fontWeight: 600,
            color: metaStatus.connected ? '#15803D' : '#DC2626',
            cursor: 'pointer'
          }}
        >
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: metaStatus.connected ? '#16A34A' : '#DC2626',
            boxShadow: metaStatus.connected ? '0 0 6px rgba(22, 163, 74, 0.6)' : 'none'
          }} />
          <span>{metaStatus.loading ? 'Checking...' : (metaStatus.connected ? 'Meta Live' : 'Offline')}</span>
          <RefreshCw size={11} className={isVerifying ? 'pulse-glow' : ''} style={{ marginLeft: '1px', opacity: 0.7 }} />
        </div>

        {/* Sender Line Chip or Connect Number Prompt */}
        {activeNumber ? (
          <div className="topbar-sender-chip" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '6px',
              background: '#F8FAFC',
              border: '1px solid var(--border-color)',
              fontSize: '0.75rem',
              color: '#475569'
            }}>
              <Smartphone size={13} color="var(--brand-wa)" />
              <span style={{ color: '#0F172A', fontWeight: 600 }}>{activeNumber.display_name}</span>
              <span style={{ color: '#94A3B8' }}>({activeNumber.phone_number})</span>
            </div>
            <button
              onClick={() => setShowAddPhoneModal(true)}
              className="btn btn-secondary"
              style={{ padding: '5px 8px', fontSize: '0.75rem', gap: '4px' }}
              title="Add another WhatsApp phone line"
            >
              <Plus size={13} />
              <span className="topbar-action-text">Add Line</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddPhoneModal(true)}
            className="btn btn-action-green"
            style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '6px' }}
          >
            <Plus size={14} />
            <span className="topbar-action-text">Connect Line</span>
          </button>
        )}

        {/* Quick Action Button */}
        {activeTab !== 'broadcast' && (
          <button
            onClick={() => setActiveTab('broadcast')}
            className="btn btn-primary"
            style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '5px' }}
          >
            <Plus size={14} />
            <span className="topbar-action-text">Broadcast</span>
          </button>
        )}
      </div>

      {/* Add WhatsApp Number Modal */}
      <AddPhoneNumberModal
        isOpen={showAddPhoneModal}
        onClose={() => setShowAddPhoneModal(false)}
        onSuccess={(newPhone) => {
          setActiveNumber(newPhone);
          checkMetaHealth();
        }}
      />
    </header>
  );
}
