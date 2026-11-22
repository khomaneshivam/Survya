import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { DataTable, HelpTip } from '../components/ui';
import { 
  Download, 
  FileSpreadsheet, 
  Clock, 
  Search, 
  FolderOpen, 
  Users, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Pause, 
  StopCircle, 
  Trash2, 
  AlertTriangle, 
  CheckCheck, 
  MessageSquare, 
  Copy, 
  Check, 
  X, 
  TrendingUp, 
  ShieldCheck, 
  Send, 
  Info 
} from 'lucide-react';
import { formatIndianDateTime, formatIndianTime, formatIndianDate } from '../utils/indianTime';

// Known Meta Cloud API error codes and human-readable diagnostic guidance
const META_ERROR_GUIDE = {
  131049: {
    title: 'Meta Marketing Cap Reached',
    desc: 'The recipient has reached WhatsApp\'s per-user marketing limit for this window. Meta waives the conversation charge for this message.',
    action: 'Auto-paused for 24 hours. Message can be retried once the recipient\'s promotional limit resets, or send a UTILITY template instead.'
  },
  '131049_COOLDOWN': {
    title: 'Marketing Cooldown Active (24h)',
    desc: 'Skipped locally to protect your delivery budget because this recipient reached Meta\'s marketing threshold within the last 24 hours.',
    action: 'No charge incurred. Retry after 24h or send an approved UTILITY / AUTHENTICATION template instead.'
  },
  131026: {
    title: 'Phone Number Not on WhatsApp',
    desc: 'The recipient phone number is not registered on WhatsApp. Verify the number and country code.',
    action: 'Verify country code or ask customer for active WhatsApp number.'
  },
  132000: {
    title: 'Template Parameter Mismatch',
    desc: 'The parameters provided in your contact list do not match the variables defined in this template on Meta.',
    action: 'Check variable mapping {{1}}, {{2}} in Broadcast Studio.'
  },
  131047: {
    title: '24-Hour Messaging Window Expired',
    desc: 'More than 24 hours have passed since the customer last messaged. You must use an approved Meta template.',
    action: 'Send an approved Meta template to re-open the 24h conversation session.'
  },
  131051: {
    title: 'Unsupported Media Type',
    desc: 'The media format or header attachment is not supported or was unreachable.',
    action: 'Ensure images are JPG/PNG under 5MB, or videos are MP4.'
  },
  131045: {
    title: 'Customer Opted Out / Blocked',
    desc: 'The user has opted out of receiving messages or blocked this business phone number.',
    action: 'Do not re-attempt messaging this recipient without explicit re-consent.'
  },
  131005: {
    title: 'Meta Access Token Expired',
    desc: 'The System User Access Token is invalid or expired.',
    action: 'Generate a new permanent System User Access Token in Meta Business Manager.'
  },
  131000: {
    title: 'Meta Internal Handshake Error',
    desc: 'Temporary server issue on Meta Cloud API infrastructure.',
    action: 'Meta automatically retries delivery; you can also re-trigger dispatch.'
  }
};

export default function ReportsPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'recipients' | 'automation'
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [pastCampaigns, setPastCampaigns] = useState([]);
  const [campaignReports, setCampaignReports] = useState([]);
  const [automationReports, setAutomationReports] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedCampaignId, setSelectedCampaignId] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL'); // 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'
  const [exportingFormat, setExportingFormat] = useState(null); // 'csv' | 'xlsx' | null

  // Detailed Message Dossier (Drawer) State
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [copiedWamid, setCopiedWamid] = useState(false);

  // Accessible Action Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    confirmType: 'primary', // 'primary' | 'danger'
    onConfirm: null
  });

  const loadReportsData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      // 1. Overview stats
      try {
        const overRes = await fetch('/api/reports/overview', { headers });
        const overData = await overRes.json();
        if (overData.success) setOverview(overData.data);
      } catch (e) {
        console.warn('Overview stats fetch note:', e.message);
      }

      // 2. Past Broadcast Campaigns list
      try {
        const campListRes = await fetch('/api/campaigns', { headers });
        const campListData = await campListRes.json();
        if (campListData.success && Array.isArray(campListData.data)) {
          setPastCampaigns(campListData.data);
        }
      } catch (e) {
        console.warn('Campaigns list fetch note:', e.message);
      }

      // 3. Campaign recipient logs
      try {
        const params = new URLSearchParams();
        if (selectedStatus !== 'ALL') params.append('status', selectedStatus);
        if (selectedCampaignId !== 'ALL') params.append('campaignId', selectedCampaignId);
        
        const url = `/api/reports/campaigns${params.toString() ? `?${params.toString()}` : ''}`;
        const campRes = await fetch(url, { headers });
        const campData = await campRes.json();
        if (campData.success) setCampaignReports(campData.data || []);
      } catch (e) {
        console.warn('Recipient logs fetch note:', e.message);
      }

      // 4. Automation dispatches
      try {
        const autoRes = await fetch('/api/reports/automation', { headers });
        const autoData = await autoRes.json();
        if (autoData.success) setAutomationReports(autoData.data || []);
      } catch (e) {
        console.warn('Automation logs fetch note:', e.message);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [token, selectedStatus, selectedCampaignId]);

  useEffect(() => {
    loadReportsData();
  }, [loadReportsData]);

  function handleExport(format, campaignId = null) {
    setExportingFormat(format);
    const params = new URLSearchParams();
    params.append('format', format);
    if (campaignId && campaignId !== 'ALL') params.append('campaignId', campaignId);
    else if (selectedCampaignId !== 'ALL') params.append('campaignId', selectedCampaignId);

    const exportUrl = `/api/reports/campaigns/export?${params.toString()}`;
    fetch(exportUrl, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error('Export download failed');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `whatsapp_delivery_audit_${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(err => alert('Export failed: ' + err.message))
      .finally(() => setExportingFormat(null));
  }

  function handleViewCampaignRecipients(campId) {
    setSelectedCampaignId(campId);
    setActiveTab('recipients');
  }

  // Copy Meta WAMID with visual feedback
  function handleCopyWamid(wamid) {
    if (!wamid) return;
    navigator.clipboard.writeText(wamid);
    setCopiedWamid(true);
    setTimeout(() => setCopiedWamid(false), 2000);
  }

  // Modal confirmation helper
  function triggerConfirmation({ title, message, confirmLabel = 'Confirm', confirmType = 'primary', onConfirm }) {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      confirmLabel,
      confirmType,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        if (onConfirm) await onConfirm();
      }
    });
  }

  // Cancel scheduled or running campaign
  function handleCancelCampaign(campId, campName) {
    triggerConfirmation({
      title: 'Cancel Broadcast Campaign',
      message: `Are you sure you want to stop and cancel the campaign "${campName}"? This will stop further dispatches immediately.`,
      confirmLabel: 'Cancel Campaign',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          const res = await fetch(`/api/campaigns/${campId}/cancel`, {
            method: 'POST',
            headers
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to cancel campaign');
          }
          loadReportsData();
        } catch (err) {
          alert(`Error cancelling campaign: ${err.message}`);
        }
      }
    });
  }

  // Trigger scheduled campaign immediately
  function handleRunNow(campId, campName) {
    triggerConfirmation({
      title: 'Launch Scheduled Broadcast Now',
      message: `Launch scheduled campaign "${campName}" immediately right now to all targeted recipients?`,
      confirmLabel: 'Launch Immediately',
      confirmType: 'primary',
      onConfirm: async () => {
        try {
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          const res = await fetch(`/api/campaigns/${campId}/run-now`, {
            method: 'POST',
            headers
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to trigger campaign');
          }
          loadReportsData();
        } catch (err) {
          alert(`Error starting campaign: ${err.message}`);
        }
      }
    });
  }

  // Pause running broadcast
  async function handlePauseCampaign(campId) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/pause`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to pause campaign');
      loadReportsData();
    } catch (err) {
      alert(`Error pausing campaign: ${err.message}`);
    }
  }

  // Resume paused broadcast
  async function handleResumeCampaign(campId) {
    try {
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/campaigns/${campId}/resume`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to resume campaign');
      loadReportsData();
    } catch (err) {
      alert(`Error resuming campaign: ${err.message}`);
    }
  }

  // Delete campaign and its recipient audit rows
  function handleDeleteCampaign(campId, campName) {
    triggerConfirmation({
      title: 'Delete Campaign Audit Records',
      message: `Are you sure you want to permanently delete campaign "${campName}" and all associated recipient delivery logs? This action cannot be undone.`,
      confirmLabel: 'Permanently Delete',
      confirmType: 'danger',
      onConfirm: async () => {
        try {
          const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
          const res = await fetch(`/api/campaigns/${campId}`, {
            method: 'DELETE',
            headers
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Failed to delete campaign');
          }
          setPastCampaigns(prev => prev.filter(c => c.id !== campId));
          if (selectedCampaignId === campId) setSelectedCampaignId('ALL');
          loadReportsData();
        } catch (err) {
          alert(`Error deleting campaign: ${err.message}`);
        }
      }
    });
  }

  // Date filtering logic
  function filterByDate(dateStr) {
    if (!dateStr || dateFilter === 'ALL') return true;
    const itemDate = new Date(dateStr);
    const now = new Date();
    if (isNaN(itemDate.getTime())) return true;

    if (dateFilter === 'TODAY') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (dateFilter === 'WEEK') {
      const diffTime = Math.abs(now - itemDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    }
    if (dateFilter === 'MONTH') {
      const diffTime = Math.abs(now - itemDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 30;
    }
    return true;
  }

  const filteredCampaignReports = campaignReports.filter(r => {
    // 1. Date filter
    const dateField = r.sent_at || r.dispatched_at || r.created_at;
    if (!filterByDate(dateField)) return false;

    // 2. Search query filter
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (r.contact_name || r.recipient_name || '').toLowerCase();
    const phone = (r.phone_number || r.clean_phone || '');
    const cName = (r.campaign_name || '').toLowerCase();
    const metaId = (r.meta_message_id || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || cName.includes(q) || metaId.includes(q);
  });

  const filteredPastCampaigns = pastCampaigns.filter(c => {
    // 1. Date filter
    const dateField = c.scheduled_at || c.created_at;
    if (!filterByDate(dateField)) return false;

    // 2. Search query filter
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const tpl = (c.template_name || '').toLowerCase();
    const file = (c.file_name || '').toLowerCase();
    const status = (c.status || '').toLowerCase();
    return name.includes(q) || tpl.includes(q) || file.includes(q) || status.includes(q);
  });

  const filteredAutomationReports = automationReports.filter(a => {
    const dateField = a.dispatched_at || a.created_at;
    if (!filterByDate(dateField)) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (a.guest_name || a.customer_name || '').toLowerCase();
    const phone = (a.clean_phone || a.phone_number || '');
    const booking = (a.booking_id || '').toLowerCase();
    return name.includes(q) || phone.includes(q) || booking.includes(q);
  });

  // Calculate deep reporting statistics
  const totalTargeted = overview?.totalRecipients || 0;
  const totalSent = overview?.totalSent || 0;
  const totalDelivered = overview?.totalDelivered || 0;
  const totalRead = overview?.totalRead || 0;
  const totalReplies = overview?.totalReplies || 0;
  const totalFailed = overview?.totalFailed || 0;

  // Percentage calculations
  const sentPercent = totalTargeted > 0 ? Math.min(100, ((totalSent / totalTargeted) * 100).toFixed(1)) : (totalSent > 0 ? 100 : 0);
  const deliveryPercent = totalSent > 0 ? Math.min(100, ((totalDelivered / totalSent) * 100).toFixed(1)) : 0;
  const readPercent = totalDelivered > 0 ? Math.min(100, ((totalRead / totalDelivered) * 100).toFixed(1)) : 0;
  const replyPercent = totalDelivered > 0 ? Math.min(100, ((totalReplies / totalDelivered) * 100).toFixed(1)) : 0;

  // Counts for status filters
  const countDelivered = campaignReports.filter(r => (r.status || '').toUpperCase() === 'DELIVERED').length;
  const countRead = campaignReports.filter(r => (r.status || '').toUpperCase() === 'READ').length;
  const countDispatched = campaignReports.filter(r => (r.status || '').toUpperCase() === 'SENT').length;
  const countFailed = campaignReports.filter(r => (r.status || '').toUpperCase() === 'FAILED').length;

  const campaignColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Campaign Name',
      sortable: true,
      render: (v, camp) => (
        <div>
          <div style={{ fontWeight: 700, color: '#171719' }}>{camp.name}</div>
          <div style={{ fontSize: '0.7rem', color: '#96969C', fontFamily: 'var(--font-mono)' }}>
            ID: #{camp.id}
          </div>
        </div>
      )
    },
    {
      key: 'file_name',
      header: 'Source File',
      sortable: true,
      render: (v) => <span style={{ fontSize: '0.78rem', color: '#67676B' }}>{v || 'contacts.xlsx'}</span>
    },
    {
      key: 'template_name',
      header: 'Template Name',
      sortable: true,
      render: (v) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', background: '#EEEEF0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
          {v || 'Template'}
        </span>
      )
    },
    {
      key: 'total_contacts',
      header: 'Total Targets',
      align: 'right',
      sortable: true,
      accessor: (camp) => camp.valid_contacts || camp.total_contacts || 0,
      render: (v) => <span className="tabular-nums" style={{ fontWeight: 700 }}>{v.toLocaleString()}</span>
    },
    {
      key: 'delivery_progress',
      header: 'Delivery Progress',
      align: 'right',
      render: (_, camp) => {
        const targets = camp.valid_contacts || camp.total_contacts || 0;
        const sent = camp.sent_count || 0;
        const progressPct = targets > 0 ? Math.min(100, Math.round((sent / targets) * 100)) : 0;
        return (
          <div style={{ minWidth: '100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontWeight: 600, color: '#2F5219', marginBottom: '3px' }}>
              <span className="tabular-nums">{sent} sent</span>
              <span className="tabular-nums">{progressPct}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: '#E5E5E8', overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: '#2876B8', borderRadius: '999px' }} />
            </div>
          </div>
        );
      }
    },
    {
      key: 'failed_count',
      header: 'Failed',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums" style={{ fontWeight: 700, color: v > 0 ? '#9B2C2C' : '#96969C' }}>{v || 0}</span>
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      sortable: true,
      render: (v, camp) => {
        if (v === 'SCHEDULED') {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span className="badge" style={{ background: '#EDE9FE', color: '#7A2E83', border: '1px solid #EFB0F6', fontWeight: 800, fontSize: '0.72rem' }}>
                ⏰ SCHEDULED
              </span>
              {camp.scheduled_at && (
                <span style={{ fontSize: '0.68rem', color: '#7A2E83', fontWeight: 600 }}>
                  {formatIndianDateTime(camp.scheduled_at)}
                </span>
              )}
            </div>
          );
        }
        if (v === 'RUNNING') {
          return (
            <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span className="pulse-glow" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#2563EB' }} />
              RUNNING
            </span>
          );
        }
        if (v === 'PAUSED') {
          return (
            <span className="badge" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', fontWeight: 700 }}>
              ⏸ PAUSED
            </span>
          );
        }
        if (v === 'CANCELLED') {
          return (
            <span className="badge" style={{ background: '#EEEEF0', color: '#67676B', border: '1px solid #D4D4D9', fontWeight: 700 }}>
              🛑 CANCELLED
            </span>
          );
        }
        if (v === 'FAILED') {
          return <span className="badge badge-danger">✕ FAILED</span>;
        }
        return <span className="badge badge-success">✓ {v || 'COMPLETED'}</span>;
      }
    },
    {
      key: 'created_at',
      header: 'Schedule / Date',
      sortable: true,
      render: (_, camp) => (
        <span style={{ fontSize: '0.75rem', color: '#67676B' }}>
          {camp.scheduled_at ? (
            <div>
              <div style={{ fontWeight: 600, color: '#171719' }}>{formatIndianDateTime(camp.scheduled_at)}</div>
              <div style={{ fontSize: '0.68rem', color: '#96969C' }}>Created: {formatIndianDate(camp.created_at)}</div>
            </div>
          ) : (
            camp.created_at ? formatIndianDateTime(camp.created_at) : 'N/A'
          )}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (_, camp) => (
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {camp.status === 'SCHEDULED' && (
            <>
              <button
                onClick={() => handleRunNow(camp.id, camp.name)}
                className="btn"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px', background: '#EDF4E6', color: '#2F5219', border: '1px solid #C3D1AC', fontWeight: 700 }}
                title="Run this scheduled campaign immediately"
              >
                <Play size={12} />
                <span>Run Now</span>
              </button>
              <button
                onClick={() => handleCancelCampaign(camp.id, camp.name)}
                className="btn"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px', background: '#FDF0F0', color: '#9B2C2C', border: '1px solid #FCA5A5', fontWeight: 700 }}
                title="Cancel this scheduled broadcast"
              >
                <StopCircle size={12} />
                <span>Cancel</span>
              </button>
            </>
          )}
          {camp.status === 'RUNNING' && (
            <>
              <button
                onClick={() => handlePauseCampaign(camp.id, camp.name)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                title="Pause broadcast"
              >
                <Pause size={12} color="#D97706" />
                <span>Pause</span>
              </button>
              <button
                onClick={() => handleCancelCampaign(camp.id, camp.name)}
                className="btn btn-danger"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                title="Stop and cancel ongoing broadcast"
              >
                <StopCircle size={12} />
                <span>Stop</span>
              </button>
            </>
          )}
          {camp.status === 'PAUSED' && (
            <>
              <button
                onClick={() => handleResumeCampaign(camp.id, camp.name)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                title="Resume broadcast"
              >
                <Play size={12} color="#2876B8" />
                <span>Resume</span>
              </button>
              <button
                onClick={() => handleCancelCampaign(camp.id, camp.name)}
                className="btn btn-danger"
                style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                title="Cancel paused broadcast"
              >
                <StopCircle size={12} />
                <span>Cancel</span>
              </button>
            </>
          )}

          {/* RECIPIENTS AUDIT */}
          <button
            onClick={() => handleViewCampaignRecipients(camp.id)}
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
            title="View individual recipient logs"
          >
            <Users size={12} />
            <span>Recipients</span>
          </button>

          {/* EXPORT DATA */}
          <button
            onClick={() => handleExport('xlsx', camp.id)}
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
            title="Export campaign to Excel"
          >
            <Download size={12} />
            <span>Export</span>
          </button>

          {/* DELETE CAMPAIGN */}
          {camp.id !== 'campaign_booking_lifecycle' && (
            <button
              onClick={() => handleDeleteCampaign(camp.id, camp.name)}
              className="btn btn-secondary"
              style={{ padding: '4px 6px', fontSize: '0.72rem', color: '#96969C' }}
              title="Delete campaign record"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )
    }
  ], [handleRunNow, handleCancelCampaign, handlePauseCampaign, handleResumeCampaign, handleViewCampaignRecipients, handleExport, handleDeleteCampaign]);

  const recipientColumns = useMemo(() => [
    {
      key: 'contact_name',
      header: 'Recipient Contact',
      sortable: true,
      render: (v, item) => (
        <span style={{ fontWeight: 700, color: '#171719' }}>
          {item.contact_name || item.recipient_name || 'Guest'}
        </span>
      )
    },
    {
      key: 'phone',
      header: 'Phone Number',
      sortable: true,
      render: (_, item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
          +{item.clean_phone || item.phone_number}
        </span>
      )
    },
    {
      key: 'campaign_name',
      header: 'Campaign & Template',
      sortable: true,
      render: (v, item) => (
        <div>
          <div style={{ color: '#171719', fontWeight: 600, fontSize: '0.825rem' }}>
            {v || 'Campaign'}
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: '#EEEEF0', padding: '1px 6px', borderRadius: '4px', color: '#67676B' }}>
            {item.template_name || 'Template'}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      header: 'Delivery Status',
      sortable: true,
      align: 'center',
      render: (_, item) => {
        const rawStatus = (item.status || item.delivery_status || 'SENT').toUpperCase();
        if (rawStatus === 'READ') {
          return (
            <span className="badge" style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
              <CheckCheck size={13} color="#2563EB" /> READ
            </span>
          );
        }
        if (rawStatus === 'DELIVERED') {
          return (
            <span className="badge" style={{ background: '#F3F6EE', color: '#2F5219', border: '1px solid #C3D1AC', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
              <CheckCheck size={13} color="#2F5219" /> DELIVERED
            </span>
          );
        }
        if (rawStatus === 'SENT') {
          return <span className="badge badge-warning" style={{ fontWeight: 700 }}>DISPATCHED</span>;
        }
        if (rawStatus === 'PENDING') {
          return <span className="badge" style={{ background: '#EEEEF0', color: '#67676B', border: '1px solid #E5E5E8', fontWeight: 700 }}>PENDING</span>;
        }
        return <span className="badge badge-danger" style={{ fontWeight: 700 }}>✕ FAILED</span>;
      }
    },
    {
      key: 'delivered_at',
      header: 'Delivered At',
      sortable: true,
      render: (v) => (
        <span style={{ fontSize: '0.75rem', color: v ? '#2F5219' : '#96969C', fontWeight: v ? 600 : 400 }}>
          {v ? formatIndianTime(v, true) : '—'}
        </span>
      )
    },
    {
      key: 'read_at',
      header: 'Read At',
      sortable: true,
      render: (v) => (
        <span style={{ fontSize: '0.75rem', color: v ? '#2563EB' : '#96969C', fontWeight: v ? 700 : 400 }}>
          {v ? formatIndianTime(v, true) : '—'}
        </span>
      )
    },
    {
      key: 'sent_at',
      header: 'Dispatched At',
      sortable: true,
      render: (v, item) => {
        const sentTime = v || item.dispatched_at;
        return <span style={{ fontSize: '0.75rem', color: '#67676B' }}>{sentTime ? formatIndianDateTime(sentTime) : 'N/A'}</span>;
      }
    },
    {
      key: 'meta_message_id',
      header: 'Meta Message ID',
      render: (v) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#67676B', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }} title={v || ''}>
          {v || '—'}
        </span>
      )
    },
    {
      key: 'error_message',
      header: 'Error Diagnostic',
      render: (_, item) => {
        if (!item.error_message && !item.error_code) return <span style={{ color: '#96969C', fontSize: '0.75rem' }}>—</span>;
        return (
          <div style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(String(item.error_code) === '131049' || String(item.error_code) === '131049_COOLDOWN') ? (
              <span className="badge" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', fontSize: '0.68rem', padding: '2px 6px', fontWeight: 700 }}>
                Meta Marketing Cap (Not Charged — Retry in 24h)
              </span>
            ) : (
              <>
                {item.error_code && (
                  <span className="badge" style={{ background: '#FDF0F0', color: '#9B2C2C', fontSize: '0.65rem', padding: '1px 5px', marginRight: '4px' }}>
                    #{item.error_code}
                  </span>
                )}
                <span style={{ color: '#9B2C2C', fontSize: '0.75rem' }}>
                  {item.error_message || item.error_reason}
                </span>
              </>
            )}
          </div>
        );
      }
    },
    {
      key: 'inspect',
      header: 'Inspect',
      align: 'right',
      render: (_, item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedRecipient(item);
          }}
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
          title="Inspect complete delivery timeline and Meta telemetry"
        >
          <Info size={12} />
          <span>Inspect</span>
        </button>
      )
    }
  ], []);

  const automationColumns = useMemo(() => [
    {
      key: 'guest_name',
      header: 'Guest / Booking',
      sortable: true,
      render: (v, item) => (
        <div>
          <div style={{ fontWeight: 700, color: '#171719' }}>{v || item.customer_name || 'Guest'}</div>
          <div style={{ fontSize: '0.7rem', color: '#96969C', fontFamily: 'var(--font-mono)' }}>
            {item.booking_id || `KT-AUTO`}
          </div>
        </div>
      )
    },
    {
      key: 'clean_phone',
      header: 'Customer Contact',
      sortable: true,
      render: (v, item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem' }}>
          {v || item.phone_number}
        </span>
      )
    },
    {
      key: 'property_name',
      header: 'Property Name',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 600, color: '#3A3A3E' }}>{v || 'Default Branch'}</span>
    },
    {
      key: 'dates',
      header: 'Check-in / Check-out',
      render: (_, item) => (
        <span style={{ fontSize: '0.75rem', color: '#67676B' }}>
          {item.checkin_date || '—'} → {item.checkout_date || '—'}
        </span>
      )
    },
    {
      key: 'stage',
      header: 'Lifecycle Stage',
      render: (_, item) => (
        <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
          {item.stage_key || item.stage || 'Check-in Lifecycle'}
        </span>
      )
    },
    {
      key: 'template_name',
      header: 'Template Dispatched',
      render: (v) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
          {v || 'booking_notice'}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (v) => (
        <span className={`badge ${
          v === 'READ' ? 'badge-info' :
          v === 'DELIVERED' || v === 'SENT' ? 'badge-success' : 'badge-danger'
        }`}>
          {v || 'SENT'}
        </span>
      )
    },
    {
      key: 'created_at',
      header: 'Execution Timestamp',
      sortable: true,
      render: (v, item) => (
        <span style={{ fontSize: '0.75rem', color: '#67676B' }}>
          {item.dispatched_at || v ? formatIndianDateTime(item.dispatched_at || v) : 'Just now'}
        </span>
      )
    }
  ], []);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: 'clamp(16px, 3vw, 28px) clamp(14px, 3vw, 24px)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="sarvya-page-title">
              SARVYA Insights — Analytics &amp; Delivery Reports
            </h1>
            <span className="badge" style={{ background: '#EDF4E6', color: '#2F5219', border: '1px solid #C3D1AC', fontSize: '0.72rem', fontWeight: 700 }}>
              Meta Cloud Telemetry
            </span>
            <HelpTip text="Complete message audit trail, real-time handset delivery acknowledgements, blue read receipts, and 1-click exports." />
          </div>
        </div>

        {/* Global Export Options */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleExport('csv')}
            disabled={exportingFormat === 'csv'}
            className="btn btn-secondary"
            style={{ gap: '8px', fontSize: '0.825rem' }}
            title="Download full delivery logs as CSV file"
          >
            <Download size={14} className={exportingFormat === 'csv' ? 'pulse-glow' : ''} />
            <span>{exportingFormat === 'csv' ? 'Exporting...' : 'Export CSV'}</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            disabled={exportingFormat === 'xlsx'}
            className="btn btn-primary"
            style={{ gap: '8px', fontSize: '0.825rem' }}
            title="Download audited logs formatted for Microsoft Excel"
          >
            <FileSpreadsheet size={14} className={exportingFormat === 'xlsx' ? 'pulse-glow' : ''} />
            <span>{exportingFormat === 'xlsx' ? 'Exporting...' : 'Export Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          INTERACTIVE DELIVERY CONVERSION FUNNEL
          ========================================================================= */}
      <div className="saas-card" style={{ padding: 'clamp(16px, 3vw, 22px)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="var(--brand-wa)" />
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#171719', margin: 0 }}>
              End-to-End WhatsApp Delivery & Engagement Funnel
            </h2>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#67676B', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2876B8', display: 'inline-block' }} />
            <span>Live Meta Webhook Handshake Synchronization</span>
          </div>
        </div>

        <div className="funnel-container">
          {/* Step 1: Audience Targeted */}
          <div className="funnel-step-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#67676B' }}>1. Targeted Audience</span>
              <Users size={14} color="#67676B" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#171719', marginTop: '6px' }}>
              {totalTargeted.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#67676B', marginTop: '2px' }}>
              100% Verified Contacts
            </div>
            <div className="funnel-progress-track">
              <div className="funnel-progress-fill" style={{ width: '100%', background: '#67676B' }} />
            </div>
          </div>

          {/* Step 2: Dispatched */}
          <div className="funnel-step-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563EB' }}>2. Dispatched (Sent)</span>
              <Send size={14} color="#2563EB" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
              {totalSent.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#2563EB', marginTop: '2px', fontWeight: 600 }}>
              {sentPercent}% of target
            </div>
            <div className="funnel-progress-track">
              <div className="funnel-progress-fill" style={{ width: `${Math.min(sentPercent, 100)}%`, background: '#2563EB' }} />
            </div>
          </div>

          {/* Step 3: Handset Delivered */}
          <div className="funnel-step-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2F5219' }}>3. Delivered to Device</span>
              <CheckCircle2 size={14} color="#2F5219" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2F5219', marginTop: '6px' }}>
              {totalDelivered.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#2F5219', marginTop: '2px', fontWeight: 600 }}>
              {overview?.deliveryRate || `${deliveryPercent}%`} delivery rate
            </div>
            <div className="funnel-progress-track">
              <div className="funnel-progress-fill" style={{ width: `${Math.min(deliveryPercent, 100)}%`, background: '#2876B8' }} />
            </div>
          </div>

          {/* Step 4: Blue Ticks Read */}
          <div className="funnel-step-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0284C7' }}>4. Read Receipts</span>
              <CheckCheck size={14} color="#0284C7" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0284C7', marginTop: '6px' }}>
              {totalRead.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#0284C7', marginTop: '2px', fontWeight: 600 }}>
              {overview?.readRate || `${readPercent}%`} read rate
            </div>
            <div className="funnel-progress-track">
              <div className="funnel-progress-fill" style={{ width: `${Math.min(readPercent, 100)}%`, background: '#0284C7' }} />
            </div>
          </div>

          {/* Step 5: Direct Replies */}
          <div className="funnel-step-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#7A2E83' }}>5. Inbound Replies</span>
              <MessageSquare size={14} color="#7A2E83" />
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#7A2E83', marginTop: '6px' }}>
              {totalReplies.toLocaleString()}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#7A2E83', marginTop: '2px', fontWeight: 600 }}>
              {overview?.replyRate || `${replyPercent}%`} response rate
            </div>
            <div className="funnel-progress-track">
              <div className="funnel-progress-fill" style={{ width: `${Math.min(replyPercent * 5, 100)}%`, background: '#7A2E83' }} />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          KEY TELEMETRY METRIC CARDS
          ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '24px' }}>
        {/* Deliverability Quality Tier */}
        <div className="saas-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Meta Quality Tier</span>
            <ShieldCheck size={16} color="#2F5219" />
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#2F5219', marginTop: '6px' }}>
            Tier 1 • High
          </div>
          <div style={{ fontSize: '0.72rem', color: '#2F5219', marginTop: '4px', fontWeight: 600 }}>
            {overview?.deliveryRate || '100%'} Deliverability Health
          </div>
        </div>

        {/* Total Broadcasts */}
        <div className="saas-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Broadcasts</span>
            <FolderOpen size={16} color="#2563EB" />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#171719', marginTop: '6px' }}>
            {overview?.totalBroadcasts || pastCampaigns.length || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#67676B', marginTop: '4px' }}>
            {overview?.activeScheduled || 0} in scheduled queue
          </div>
        </div>

        {/* Total Recipients */}
        <div className="saas-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Contacts</span>
            <Users size={16} color="#67676B" />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#171719', marginTop: '6px' }}>
            {totalTargeted.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#67676B', marginTop: '4px' }}>
            {totalSent.toLocaleString()} dispatched msgs
          </div>
        </div>

        {/* Read Receipts */}
        <div className="saas-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Read Receipts</span>
            <CheckCheck size={16} color="#2563EB" />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#2563EB', marginTop: '6px' }}>
            {totalRead.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#2563EB', marginTop: '4px', fontWeight: 600 }}>
            {overview?.readRate || '0%'} Read rate
          </div>
        </div>

        {/* Failed / Suppressed */}
        <div className="saas-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Delivery Failures</span>
            <AlertCircle size={16} color={totalFailed > 0 ? '#9B2C2C' : '#96969C'} />
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: totalFailed > 0 ? '#9B2C2C' : '#67676B', marginTop: '6px' }}>
            {totalFailed.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: totalFailed > 0 ? '#9B2C2C' : '#67676B', marginTop: '4px' }}>
            {overview?.failureRate || '0%'} rejection rate
          </div>
        </div>
      </div>

      {/* =========================================================================
          NAVIGATION TABS & ADVANCED FILTER CONTROLS
          ========================================================================= */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        padding: '12px 16px',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxShadow: 'var(--shadow-xs)'
      }}>
        {/* Main Tab Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '12px'
        }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`filter-chip ${activeTab === 'campaigns' ? 'active' : ''}`}
            >
              <FolderOpen size={14} />
              <span>Broadcast Campaigns ({pastCampaigns.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('recipients')}
              className={`filter-chip ${activeTab === 'recipients' ? 'active' : ''}`}
            >
              <Users size={14} />
              <span>Recipient Delivery Logs ({filteredCampaignReports.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('automation')}
              className={`filter-chip ${activeTab === 'automation' ? 'active' : ''}`}
            >
              <Clock size={14} />
              <span>Booking Automations ({filteredAutomationReports.length})</span>
            </button>
          </div>

          {/* Quick Date Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: '#96969C', fontWeight: 600 }}>Period:</span>
            {[
              { id: 'ALL', label: 'All Time' },
              { id: 'TODAY', label: 'Today' },
              { id: 'WEEK', label: '7 Days' },
              { id: 'MONTH', label: '30 Days' }
            ].map(period => (
              <button
                key={period.id}
                onClick={() => setDateFilter(period.id)}
                style={{
                  background: dateFilter === period.id ? '#2876B8' : '#EEEEF0',
                  color: dateFilter === period.id ? '#FFFFFF' : '#67676B',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 9px',
                  fontSize: '0.74rem',
                  fontWeight: dateFilter === period.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {period.label}
              </button>
            ))}

            <button
              onClick={loadReportsData}
              className="btn btn-secondary"
              title="Refresh reports data"
              style={{ padding: '6px 9px', borderRadius: '6px' }}
            >
              <RefreshCw size={13} className={loading ? 'pulse-glow' : ''} />
            </button>
          </div>
        </div>

        {/* Search & Fine-grained Status Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
            {/* Live Search Input with Clear Button */}
            <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '400px' }}>
              <input
                type="text"
                placeholder={
                  activeTab === 'campaigns'
                    ? 'Search campaign name, template, or file...'
                    : activeTab === 'recipients'
                    ? 'Search recipient name, phone (+91), or wamid...'
                    : 'Search guest name, room ID, or booking...'
                }
                className="saas-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: '34px',
                  paddingRight: searchQuery ? '30px' : '10px',
                  fontSize: '0.825rem',
                  paddingTop: '7px',
                  paddingBottom: '7px'
                }}
              />
              <Search size={14} color="#96969C" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#96969C',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Campaign Selector Filter (When in Recipients Tab) */}
            {activeTab === 'recipients' && pastCampaigns.length > 0 && (
              <select
                value={selectedCampaignId}
                onChange={e => setSelectedCampaignId(e.target.value)}
                className="saas-input"
                style={{ width: 'auto', maxWidth: '220px', fontSize: '0.8rem', padding: '6px 12px' }}
              >
                <option value="ALL">All Broadcast Campaigns</option>
                {pastCampaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Status Quick Pills (When in Recipients Tab) */}
          {activeTab === 'recipients' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedStatus('ALL')}
                style={{
                  background: selectedStatus === 'ALL' ? '#171719' : '#EEEEF0',
                  color: selectedStatus === 'ALL' ? '#FFFFFF' : '#67676B',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                All ({campaignReports.length})
              </button>
              <button
                onClick={() => setSelectedStatus('DELIVERED')}
                style={{
                  background: selectedStatus === 'DELIVERED' ? '#2F5219' : '#EDF4E6',
                  color: selectedStatus === 'DELIVERED' ? '#FFFFFF' : '#2F5219',
                  border: '1px solid #C3D1AC',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Delivered ({countDelivered})
              </button>
              <button
                onClick={() => setSelectedStatus('READ')}
                style={{
                  background: selectedStatus === 'READ' ? '#1D4ED8' : '#EFF6FF',
                  color: selectedStatus === 'READ' ? '#FFFFFF' : '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Read ({countRead})
              </button>
              <button
                onClick={() => setSelectedStatus('SENT')}
                style={{
                  background: selectedStatus === 'SENT' ? '#D97706' : '#FEF3C7',
                  color: selectedStatus === 'SENT' ? '#FFFFFF' : '#B45309',
                  border: '1px solid #FDE68A',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Dispatched ({countDispatched})
              </button>
              <button
                onClick={() => setSelectedStatus('FAILED')}
                style={{
                  background: selectedStatus === 'FAILED' ? '#9B2C2C' : '#FDF0F0',
                  color: selectedStatus === 'FAILED' ? '#FFFFFF' : '#9B2C2C',
                  border: '1px solid #FDB1AF',
                  borderRadius: '999px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Failed ({countFailed})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          TAB 1: PAST BROADCAST CAMPAIGNS
          ========================================================================= */}
      {activeTab === 'campaigns' && (
        <div>
          {pastCampaigns.filter(c => c.status === 'SCHEDULED').length > 0 && (
            <div style={{
              background: '#FCF2FE',
              border: '1px solid #EFB0F6',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} color="#7A2E83" />
                <div>
                  <div style={{ fontWeight: 800, color: '#7A2E83', fontSize: '0.875rem' }}>
                    {pastCampaigns.filter(c => c.status === 'SCHEDULED').length} Broadcast Campaign(s) Scheduled in Queue
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#7A2E83', marginTop: '2px' }}>
                    Waiting for scheduled dispatch time. You can dispatch immediately with "Run Now" or cancel them before launch.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSearchQuery('scheduled')}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '6px 14px', background: '#FFFFFF', borderColor: '#EFB0F6', color: '#7A2E83', fontWeight: 700 }}
              >
                View Scheduled Only
              </button>
            </div>
          )}

          <div className="saas-card" style={{ overflow: 'hidden' }}>
            <DataTable
              columns={campaignColumns}
              data={filteredPastCampaigns}
              density="compact"
              pageSize={10}
              loading={loading && pastCampaigns.length === 0}
              emptyMessage="No broadcast campaigns found matching the current period or search filter."
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: RECIPIENT AUDIT LOGS (WITH DOSSIER DRAWER INSPECTION)
          ========================================================================= */}
      {activeTab === 'recipients' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          {selectedCampaignId !== 'ALL' && (
            <div style={{ padding: '12px 16px', background: '#F3F6EE', borderBottom: '1px solid #C3D1AC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#2F5219', fontWeight: 600 }}>
                Filtering recipient logs for campaign: <strong>{pastCampaigns.find(c => c.id === selectedCampaignId)?.name || selectedCampaignId}</strong>
              </div>
              <button
                onClick={() => setSelectedCampaignId('ALL')}
                style={{ border: 'none', background: 'transparent', color: '#2F5219', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                ✕ Clear Campaign Filter (Show All)
              </button>
            </div>
          )}

          <DataTable
            columns={recipientColumns}
            data={filteredCampaignReports}
            density="compact"
            pageSize={10}
            onRowClick={(item) => setSelectedRecipient(item)}
            emptyMessage="No recipient delivery logs matching current filter."
          />
        </div>
      )}

      {/* =========================================================================
          TAB 3: AUTOMATION LIFECYCLE AUDIT TABLE
          ========================================================================= */}
      {activeTab === 'automation' && (
        <div className="saas-card" style={{ overflow: 'hidden' }}>
          <DataTable
            columns={automationColumns}
            data={filteredAutomationReports}
            density="compact"
            pageSize={10}
            emptyMessage="No automated lifecycle dispatches recorded matching current filter."
          />
        </div>
      )}

      {/* =========================================================================
          SLIDE-OVER AUDIT DOSSIER DRAWER (MESSAGE INSPECTION)
          ========================================================================= */}
      {selectedRecipient && (
        <>
          <div 
            className="drawer-backdrop"
            onClick={() => setSelectedRecipient(null)}
            aria-hidden="true"
          />

          <aside className="drawer-panel" aria-label="Message Delivery Dossier">
            {/* Header */}
            <div style={{
              padding: '18px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#F5F5F6'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#67676B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Audited Message Delivery Dossier
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#171719', marginTop: '2px' }}>
                  {selectedRecipient.contact_name || selectedRecipient.recipient_name || 'Guest Contact'}
                </div>
              </div>
              <button
                onClick={() => setSelectedRecipient(null)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#67676B'
                }}
                aria-label="Close dossier"
              >
                <X size={16} />
              </button>
            </div>

            {/* Dossier Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Recipient Quick Card with Direct WhatsApp Link */}
              <div style={{
                background: '#F5F5F6',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#67676B', fontWeight: 600 }}>VERIFIED PHONE NUMBER</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#171719', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    +{selectedRecipient.clean_phone || selectedRecipient.phone_number}
                  </div>
                </div>

                <a
                  href={`https://wa.me/${selectedRecipient.clean_phone || selectedRecipient.phone_number}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-whatsapp"
                  style={{ fontSize: '0.78rem', padding: '6px 12px', gap: '6px' }}
                >
                  <MessageSquare size={13} />
                  <span>Chat on WhatsApp</span>
                  <ExternalLink size={12} />
                </a>
              </div>

              {/* Meta WAMID with Copy Button */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#67676B', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Meta Cloud Message Identifier (WAMID)
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#EEEEF0',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 12px'
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    color: '#171719',
                    wordBreak: 'break-all'
                  }}>
                    {selectedRecipient.meta_message_id || 'Pending Meta Handshake ACK'}
                  </span>
                  {selectedRecipient.meta_message_id && (
                    <button
                      onClick={() => handleCopyWamid(selectedRecipient.meta_message_id)}
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px', flexShrink: 0, marginLeft: '8px' }}
                      title="Copy wamid to clipboard"
                    >
                      {copiedWamid ? <Check size={12} color="#2F5219" /> : <Copy size={12} />}
                      <span>{copiedWamid ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Delivery Timeline Breakdown */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#67676B', marginBottom: '12px', textTransform: 'uppercase' }}>
                  Audited Delivery Handshake Timeline
                </label>

                <div className="audit-timeline">
                  {/* Step 1: Dispatched */}
                  <div className="audit-timeline-item">
                    <div className="audit-timeline-node completed">
                      <Send size={11} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.825rem', color: '#171719' }}>
                        Dispatched to Meta Cloud API
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#67676B' }}>
                        {selectedRecipient.sent_at || selectedRecipient.dispatched_at ? formatIndianDateTime(selectedRecipient.sent_at || selectedRecipient.dispatched_at) : 'Dispatched'}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Handset Delivered */}
                  <div className="audit-timeline-item">
                    <div className={`audit-timeline-node ${selectedRecipient.delivered_at ? 'completed' : ''}`}>
                      <CheckCircle2 size={11} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.825rem', color: selectedRecipient.delivered_at ? '#2F5219' : '#67676B' }}>
                        {selectedRecipient.delivered_at ? 'Delivered to Recipient Device' : 'Awaiting Device Handshake'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#67676B' }}>
                        {selectedRecipient.delivered_at ? formatIndianDateTime(selectedRecipient.delivered_at) : 'Device may be offline or out of cell reception'}
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Read Receipts (Blue ticks) */}
                  <div className="audit-timeline-item">
                    <div className={`audit-timeline-node ${selectedRecipient.read_at ? 'read' : ''}`}>
                      <CheckCheck size={11} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.825rem', color: selectedRecipient.read_at ? '#2563EB' : '#67676B' }}>
                        {selectedRecipient.read_at ? 'Read by Recipient (Blue Ticks)' : 'Unread'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#67676B' }}>
                        {selectedRecipient.read_at ? formatIndianDateTime(selectedRecipient.read_at) : 'Customer has not yet opened this WhatsApp message'}
                      </div>
                    </div>
                  </div>

                  {/* Step 4: Failed / Rejection Diagnostics */}
                  {selectedRecipient.status === 'FAILED' && (
                    <div className="audit-timeline-item">
                      <div className="audit-timeline-node failed">
                        <AlertCircle size={11} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.825rem', color: '#9B2C2C' }}>
                          Delivery Failed / Bounced
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9B2C2C' }}>
                          {selectedRecipient.failed_at ? formatIndianDateTime(selectedRecipient.failed_at) : 'Meta Cloud API rejected transmission'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnostic Error Box (if failed) */}
              {(selectedRecipient.error_code || selectedRecipient.error_message || selectedRecipient.error_reason) && (
                <div style={{
                  background: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '#FFFBEB' : '#FDF0F0',
                  border: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '1px solid #FCD34D' : '1px solid #FDB1AF',
                  borderRadius: '10px',
                  padding: '14px 16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '#92400E' : '#9B2C2C', fontWeight: 800, fontSize: '0.85rem' }}>
                    <AlertTriangle size={16} />
                    <span>Meta Cloud Diagnostic: {META_ERROR_GUIDE[selectedRecipient.error_code]?.title || `Error #${selectedRecipient.error_code || 'General'}`}</span>
                  </div>
                  {(String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') && (
                    <div style={{ marginTop: '8px' }}>
                      <span className="badge" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', fontSize: '0.72rem', padding: '3px 8px', fontWeight: 800 }}>
                        Meta Marketing Cap (Not Charged — Retry in 24h)
                      </span>
                    </div>
                  )}
                  <p style={{ fontSize: '0.8rem', color: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '#78350F' : '#9B2C2C', marginTop: '6px', lineHeight: 1.45 }}>
                    {META_ERROR_GUIDE[selectedRecipient.error_code]?.desc || selectedRecipient.error_message || selectedRecipient.error_reason}
                  </p>
                  {META_ERROR_GUIDE[selectedRecipient.error_code]?.action && (
                    <div style={{ marginTop: '8px', padding: '8px 10px', background: '#FFFFFF', borderRadius: '6px', border: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '1px solid #FDE68A' : '1px solid #FCA5A5', fontSize: '0.75rem', color: (String(selectedRecipient.error_code) === '131049' || String(selectedRecipient.error_code) === '131049_COOLDOWN') ? '#92400E' : '#7F1D1D' }}>
                      <strong>Remediation:</strong> {META_ERROR_GUIDE[selectedRecipient.error_code].action}
                    </div>
                  )}
                </div>
              )}

              {/* Campaign Context Info */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '0.8rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#67676B' }}>Campaign:</span>
                  <span style={{ fontWeight: 700, color: '#171719' }}>{selectedRecipient.campaign_name || 'Broadcasting Campaign'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#67676B' }}>Template Used:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#171719' }}>{selectedRecipient.template_name || 'Template'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#67676B' }}>Audit Log ID:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#96969C' }}>#{selectedRecipient.id}</span>
                </div>
              </div>
            </div>

            {/* Dossier Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-color)',
              background: '#F5F5F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button
                onClick={() => setSelectedRecipient(null)}
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem' }}
              >
                Close Dossier
              </button>
            </div>
          </aside>
        </>
      )}

      {/* =========================================================================
          ACCESSIBLE MODAL CONFIRMATION DIALOG (Modern Web Guidance)
          ========================================================================= */}
      {confirmDialog.isOpen && (
        <div 
          className="drawer-backdrop"
          onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              animation: 'fadeIn 0.18s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: confirmDialog.confirmType === 'danger' ? '#FDF0F0' : '#EDF4E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: confirmDialog.confirmType === 'danger' ? '#9B2C2C' : '#2F5219'
              }}>
                {confirmDialog.confirmType === 'danger' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#171719', margin: 0 }}>
                {confirmDialog.title}
              </h3>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#67676B', lineHeight: 1.5, marginBottom: '20px' }}>
              {confirmDialog.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className={`btn ${confirmDialog.confirmType === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                style={{ fontSize: '0.85rem' }}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
