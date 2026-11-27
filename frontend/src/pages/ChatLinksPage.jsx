import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Link2,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  Sliders,
  Sparkles,
  Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Drawer,
  EmptyState,
  FilterBar,
  KpiCard,
  Modal,
  PageHeader,
  SearchInput
} from '../components/ui';
import PhoneMockup from '../components/PhoneMockup';

const CATEGORIES = ['HOSPITALITY', 'SUPPORT', 'SALES', 'MARKETING', 'GENERAL'];

const DEFAULT_INTAKE_FIELDS = [
  { id: 'check_in', label: 'Check-in Date', type: 'date', required: true, enabled: true, placeholder: 'Select check-in date' },
  { id: 'check_out', label: 'Check-out Date', type: 'date', required: true, enabled: true, placeholder: 'Select check-out date' },
  { id: 'total_guests', label: 'Total Guests', type: 'number', min: 1, max: 20, defaultValue: 2, required: true, enabled: true, placeholder: 'Number of guests' },
  { id: 'room_preference', label: 'Preferred Room Category', type: 'select', options: ['Any Available Room', 'Deluxe Sea View Room', 'Luxury Coconut Cottage', 'Family Ocean Suite'], required: false, enabled: false, placeholder: 'Select preferred room' },
  { id: 'special_requests', label: 'Special Requests / Occasion', type: 'text', required: false, enabled: false, placeholder: 'e.g. Anniversary, Ground floor preference' }
];

export default function ChatLinksPage({ onNavigate }) {
  const { token, user, isWorkspaceAdmin, primaryDomain } = useAuth();
  const isHospitality = !primaryDomain || primaryDomain === 'HOSPITALITY';
  const tenantDisplayName = user?.tenant?.name || 'our team';
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState([]);
  const [summary, setSummary] = useState({
    totalLinks: 0,
    activeLinks: 0,
    totalClicks: 0,
    totalConversations: 0,
    conversionRate: 0
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Sender phone numbers
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [customPhoneMode, setCustomPhoneMode] = useState(false);

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  const [form, setForm] = useState({
    title: '',
    slug: '',
    phoneNumber: '',
    phoneNumberId: '',
    defaultMessage: '',
    welcomeTitle: '',
    welcomeDescription: '',
    autoReplyEnabled: true,
    autoReplyMessage: '',
    category: isHospitality ? 'HOSPITALITY' : 'GENERAL',
    customFields: isHospitality ? DEFAULT_INTAKE_FIELDS : DEFAULT_INTAKE_FIELDS.filter(f => f.id === 'special_requests').map(f => ({ ...f, label: 'Requirements / Details', placeholder: 'Share your inquiry details', enabled: true }))
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Bulk Generator Drawer
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState(isHospitality ? 'resort' : 'offer');
  const [bulkItemsText, setBulkItemsText] = useState(
    isHospitality
      ? 'Deluxe Sea View Villa\nLuxury Coconut Cottage\nFamily Ocean Suite\nBeachside Candlelight Dinner\nWater Sports Package'
      : 'Consultation & Demo\nProduct Catalogue Inquiry\nOrder Support Desk'
  );
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // QR Code & Share Modal State
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [activeShareLink, setActiveShareLink] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  const apiCall = useCallback(async (method, path, body = null) => {
    const activeToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      const err = new Error(data.message || 'Request failed');
      err.response = { data };
      throw err;
    }
    return data;
  }, [token]);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, acctRes] = await Promise.allSettled([
        apiCall('GET', '/v1/chat-links'),
        apiCall('GET', '/v1/channels/whatsapp/accounts')
      ]);

      if (linksRes.status === 'fulfilled' && linksRes.value?.success) {
        setLinks(linksRes.value.links || []);
        if (linksRes.value.summary) setSummary(linksRes.value.summary);
      }
      if (acctRes.status === 'fulfilled' && acctRes.value?.accounts) {
        setPhoneNumbers(acctRes.value.accounts);
      }
    } catch (err) {
      console.error('[ChatLinksPage] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Open Create Modal
  const openCreateModal = () => {
    setEditingLink(null);
    setFormError('');
    const defaultPhone = phoneNumbers.find((p) => p.is_default === 1) || phoneNumbers[0] || null;
    setCustomPhoneMode(!defaultPhone);
    setForm({
      title: '',
      slug: '',
      phoneNumber: defaultPhone?.phone_number || '',
      phoneNumberId: defaultPhone?.phone_number_id || '',
      defaultMessage: isHospitality
        ? `Hi ${tenantDisplayName}, I would like to inquire about availability.`
        : `Hi ${tenantDisplayName}, I would like more information.`,
      welcomeTitle: tenantDisplayName,
      welcomeDescription: isHospitality ? 'Direct WhatsApp Concierge & Reservations Desk' : 'Direct WhatsApp Business Concierge',
      autoReplyEnabled: true,
      autoReplyMessage: isHospitality
        ? 'Hello! Thank you for connecting with us. We have received your inquiry and a concierge is reviewing availability now.'
        : 'Hello! Thank you for connecting with us. We have received your inquiry and our team will respond shortly.',
      category: isHospitality ? 'HOSPITALITY' : 'GENERAL',
      customFields: isHospitality ? DEFAULT_INTAKE_FIELDS : [{ id: 'special_requests', label: 'Inquiry Details', type: 'text', required: false, enabled: true, placeholder: 'How can we help?' }]
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (link) => {
    setEditingLink(link);
    setFormError('');
    const matchedAccount = phoneNumbers.find((p) => p.phone_number === link.phone_number);
    setCustomPhoneMode(!matchedAccount);
    let initialFields = DEFAULT_INTAKE_FIELDS;
    if (link.custom_fields) {
      if (Array.isArray(link.custom_fields)) {
        initialFields = link.custom_fields;
      } else {
        try {
          const parsed = JSON.parse(link.custom_fields);
          if (Array.isArray(parsed) && parsed.length > 0) initialFields = parsed;
        } catch (e) {}
      }
    }
    setForm({
      title: link.title || '',
      slug: link.slug || '',
      phoneNumber: link.phone_number || '',
      phoneNumberId: link.phone_number_id || '',
      defaultMessage: link.default_message || '',
      welcomeTitle: link.welcome_title || '',
      welcomeDescription: link.welcome_description || '',
      autoReplyEnabled: Boolean(link.auto_reply_enabled),
      autoReplyMessage: link.auto_reply_message || '',
      category: link.category || 'HOSPITALITY',
      customFields: initialFields
    });
    setModalOpen(true);
  };

  // Custom Fields Builder Handlers
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldState, setNewFieldState] = useState({
    label: '',
    type: 'text',
    placeholder: '',
    required: false,
    options: ''
  });

  const handleToggleField = (fieldId) => {
    setForm((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).map((f) =>
        f.id === fieldId ? { ...f, enabled: !f.enabled } : f
      )
    }));
  };

  const handleToggleRequired = (fieldId) => {
    setForm((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).map((f) =>
        f.id === fieldId ? { ...f, required: !f.required } : f
      )
    }));
  };

  const handleDeleteField = (fieldId) => {
    setForm((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).filter((f) => f.id !== fieldId)
    }));
  };

  const handleAddCustomField = () => {
    if (!newFieldState.label.trim()) return;
    const fieldId = 'custom_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);
    const newField = {
      id: fieldId,
      label: newFieldState.label.trim(),
      type: newFieldState.type || 'text',
      placeholder: newFieldState.placeholder.trim() || `Enter ${newFieldState.label.trim()}`,
      required: Boolean(newFieldState.required),
      enabled: true,
      ...(newFieldState.type === 'select'
        ? { options: newFieldState.options.split(',').map((s) => s.trim()).filter(Boolean) }
        : {})
    };
    setForm((prev) => ({
      ...prev,
      customFields: [...(prev.customFields || []), newField]
    }));
    setNewFieldState({
      label: '',
      type: 'text',
      placeholder: '',
      required: false,
      options: ''
    });
    setShowAddField(false);
  };

  // Auto-slugify on title input during creation
  const handleTitleChange = (val) => {
    setForm((prev) => {
      const isAutoSlug = !editingLink && (!prev.slug || prev.slug === prev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40));
      const autoSlug = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      return {
        ...prev,
        title: val,
        slug: isAutoSlug ? autoSlug : prev.slug
      };
    });
  };

  const handleSaveLink = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('Link Title is required.');
      return;
    }
    const cleanNum = form.phoneNumber ? form.phoneNumber.replace(/[^\d+]/g, '') : '';
    const defaultAccount = phoneNumbers.find((p) => p.is_default === 1) || phoneNumbers[0] || null;
    const finalPhone = cleanNum || (defaultAccount?.phone_number ? defaultAccount.phone_number.replace(/[^\d+]/g, '') : '');
    if (!finalPhone) {
      setFormError('A valid WhatsApp destination phone number is required.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        ...form,
        phoneNumber: finalPhone,
        customFields: form.customFields,
        custom_fields: form.customFields
      };
      let resData;
      if (editingLink) {
        resData = await apiCall('PUT', `/v1/chat-links/${editingLink.id}`, payload);
      } else {
        resData = await apiCall('POST', '/v1/chat-links', payload);
      }
      setModalOpen(false);
      await loadLinks();

      const created = resData?.link || resData?.data;
      if (created && !editingLink) {
        setActiveShareLink(created);
        setShareModalOpen(true);
      }
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to save chat link.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (link) => {
    try {
      await apiCall('PATCH', `/v1/chat-links/${link.id}/status`);
      await loadLinks();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle link status.');
    }
  };

  const handleDelete = async (link) => {
    if (!window.confirm(`Permanently delete chat link "${link.title}"?`)) return;
    try {
      await apiCall('DELETE', `/v1/chat-links/${link.id}`);
      await loadLinks();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete chat link.');
    }
  };

  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    const items = bulkItemsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (items.length === 0) {
      alert('Enter at least one item title.');
      return;
    }

    setBulkGenerating(true);
    try {
      const defaultPhone = phoneNumbers.find((p) => p.is_default === 1) || phoneNumbers[0] || null;
      const defaultPhoneNum = defaultPhone?.phone_number ? defaultPhone.phone_number.replace(/[^\d+]/g, '') : '';
      if (!defaultPhoneNum) {
        alert('No connected WhatsApp sender account found. Please connect your WhatsApp Business line first in Settings.');
        setBulkGenerating(false);
        return;
      }
      const linksPayload = items.map((title) => {
        const slugPart = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        return {
          title,
          slug: `${bulkPrefix}-${slugPart}`,
          phoneNumber: defaultPhoneNum,
          phoneNumberId: defaultPhone?.phone_number_id || null,
          defaultMessage: `Hi, I would like to inquire about availability and pricing for ${title}.`,
          welcomeTitle: title,
          welcomeDescription: `Direct inquiry desk for ${title}`,
          autoReplyEnabled: 1,
          autoReplyMessage: `Hello! Thank you for inquiring about ${title}. Our reservation concierge is reviewing availability and will assist you shortly!`,
          category: 'HOSPITALITY'
        };
      });

      await apiCall('POST', '/v1/chat-links/bulk-generate', { links: linksPayload });
      setBulkDrawerOpen(false);
      await loadLinks();
    } catch (err) {
      alert(err.response?.data?.message || 'Bulk generation failed.');
    } finally {
      setBulkGenerating(false);
    }
  };

  const getShareUrl = (link) => {
    if (!link) return '';
    if (typeof window !== 'undefined' && window.location?.origin && link.slug) {
      return `${window.location.origin}/c/${link.slug}`;
    }
    return link.shortUrl || link.urls?.shortUrl || `/c/${link.slug || ''}`;
  };

  const getEmbedHtml = (link) => {
    if (!link) return '';
    const shareUrl = getShareUrl(link);
    const title = link.title || 'Chat on WhatsApp';
    return `<a href="${shareUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;background:#25D366;color:#ffffff;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;font-family:sans-serif;">\n  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/></svg>\n  <span>${title}</span>\n</a>`;
  };

  const copyToClipboard = (text, key) => {
    if (!text) return;
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2200);
    } catch (e) {
      console.warn('Clipboard write fallback error:', e);
    }
  };

  const filteredLinks = useMemo(() => {
    return links.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const match = (l.title || '').toLowerCase().includes(q)
          || (l.slug || '').toLowerCase().includes(q)
          || (l.default_message || '').toLowerCase().includes(q)
          || (l.phone_number || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [links, statusFilter, categoryFilter, search]);

  const previewTemplate = useMemo(() => ({
    name: form.slug || 'chat_link',
    category: form.category,
    language: 'en_US',
    bodyText: form.defaultMessage || 'Hi, I want to inquire about availability.',
    components: [{ type: 'BODY', text: form.defaultMessage || 'Hi, I want to inquire about availability.' }]
  }), [form.slug, form.category, form.defaultMessage]);

  const columns = [
    {
      key: 'title',
      label: 'Title & Short Link',
      header: 'Title & Short Link',
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{r.title}</span>
            <Badge tone={r.status === 'ACTIVE' ? 'green' : 'coral'}>{r.status}</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--sarvya-blue)',
              background: 'var(--sarvya-blue-soft)',
              border: '1px solid var(--sarvya-blue-border)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)'
            }}>
              /c/{r.slug}
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(getShareUrl(r), `short_${r.id}`)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '11px',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
              title="Copy Short Link"
            >
              {copiedKey === `short_${r.id}` ? (
                <span style={{ color: 'var(--status-success-text)', fontWeight: 600 }}>Copied!</span>
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>
          <p style={{
            fontSize: '11.5px',
            color: 'var(--text-secondary)',
            margin: '4px 0 0 0',
            maxWidth: '300px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            "{r.default_message}"
          </p>
        </div>
      )
    },
    {
      key: 'phone_number',
      label: 'Target Phone',
      header: 'Target Phone',
      render: (_, r) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          +{r.phone_number}
        </span>
      )
    },
    {
      key: 'category',
      label: 'Category',
      header: 'Category',
      render: (_, r) => <Badge tone="neutral">{r.category || 'GENERAL'}</Badge>
    },
    ...(isWorkspaceAdmin ? [{
      key: 'creator',
      label: 'Created By',
      header: 'Created By',
      render: (_, r) => (
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          {r.creator_name || (r.user_id === 'system' ? 'System Default' : 'Staff Account')}
        </span>
      )
    }] : []),
    {
      key: 'auto_reply',
      label: 'Interactive Bot',
      header: 'Interactive Bot',
      render: (_, r) => (
        <Badge tone={r.auto_reply_enabled ? 'blue' : 'neutral'}>
          {r.auto_reply_enabled ? 'Enabled' : 'Off'}
        </Badge>
      )
    },
    {
      key: 'performance',
      label: 'Performance',
      header: 'Performance',
      render: (_, r) => (
        <div style={{ fontSize: '12px' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.clicks_count || 0}</span>
          <span style={{ color: 'var(--text-muted)' }}> clicks · </span>
          <span style={{ fontWeight: 600, color: 'var(--sarvya-blue)' }}>{r.conversations_count || 0}</span>
          <span style={{ color: 'var(--text-muted)' }}> chats</span>
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      header: 'Actions',
      align: 'right',
      render: (_, r) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={Copy}
            onClick={() => copyToClipboard(getShareUrl(r), `action_${r.id}`)}
            title="Copy Public Chat Link to share with customers"
          >
            {copiedKey === `action_${r.id}` ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={QrCode}
            onClick={() => {
              setActiveShareLink(r);
              setShareModalOpen(true);
            }}
            title="QR Code & Embed"
          >
            QR
          </Button>
          <a
            href={getShareUrl(r)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none'
            }}
            title="Test In-App Customer View"
          >
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={() => handleToggleStatus(r)}
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
            title={r.status === 'ACTIVE' ? 'Pause Link' : 'Activate Link'}
          >
            {r.status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} color="var(--status-success-text)" />}
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(r)}
          >
            Edit
          </Button>
          <button
            type="button"
            onClick={() => handleDelete(r)}
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--status-error-text)';
              e.currentTarget.style.background = 'var(--status-error-bg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
            title="Delete Link"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="SARVYA Links — Click-to-Chat"
        subtitle="Branded wa.me & in-app links with pre-filled messages and QR codes."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Layers}
              onClick={() => setBulkDrawerOpen(true)}
            >
              Bulk Generate
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={openCreateModal}
            >
              New Chat Link
            </Button>
          </>
        }
      />

      {/* KPI Summary Cards */}
      <div className="sarvya-kpi-grid">
        <KpiCard
          label="Total Chat Links"
          value={summary.totalLinks}
          hint={`${summary.activeLinks} active links accepting chats`}
          icon={Link2}
          tone="blue"
          loading={loading}
        />
        <KpiCard
          label="Total Clicks & Scans"
          value={summary.totalClicks}
          hint="Website CTAs, social bios & QR scans"
          icon={Share2}
          tone="purple"
          loading={loading}
        />
        <KpiCard
          label="Conversations Started"
          value={summary.totalConversations}
          hint="Inbound queries landed in Shared Inbox"
          icon={MessageSquare}
          tone="green"
          loading={loading}
        />
        <KpiCard
          label="Avg Conversion Rate"
          value={`${summary.conversionRate}%`}
          hint="Visitors who initiated conversation"
          icon={Sparkles}
          tone="neutral"
          loading={loading}
        />
      </div>

      {/* Filters & Actions */}
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by title, slug, phone, or message..."
          ariaLabel="Search Chat Links"
        />
        <select
          aria-label="Filter by status"
          className="sarvya-select"
          style={{ width: 'auto', minWidth: '130px' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
        </select>
        <select
          aria-label="Filter by category"
          className="sarvya-select"
          style={{ width: 'auto', minWidth: '150px' }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: '8px' }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadLinks}
          >
            Refresh
          </Button>
        </div>
      </FilterBar>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {filteredLinks.length > 0 ? (
            <DataTable density="compact" columns={columns} data={filteredLinks} rows={filteredLinks} rowKey={(r) => r.id} keyField="id" />
          ) : (
            <EmptyState
              icon={Link2}
              title="No chat links created yet"
              description="Create custom Click-to-Chat links with pre-filled default messages to invite website visitors into live WhatsApp or in-app browser conversations."
              action={
                <Button type="button" variant="primary" icon={Plus} onClick={openCreateModal}>
                  Create First Chat Link
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLink ? `Edit Link: ${editingLink.title}` : 'Create New Click-to-Chat Link'}
        subtitle="Configure your custom slug, default message, and automated interactive response"
        size="lg"
      >
        <form onSubmit={handleSaveLink} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {formError && (
            <div role="alert" style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--status-error-border)',
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              padding: '10px 14px',
              fontSize: '12.5px'
            }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="link-title" className="sarvya-field-label">
                    Link Title <span style={{ color: 'var(--status-error-text)' }}>*</span>
                  </label>
                  <input
                    id="link-title"
                    type="text"
                    required
                    className="sarvya-input"
                    placeholder="e.g. Deluxe Villa Booking Desk"
                    value={form.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label htmlFor="link-slug" className="sarvya-field-label">
                      Custom Slug <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(Optional)</span>
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-generated if blank</span>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0 10px'
                  }}>
                    <span style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', userSelect: 'none', marginRight: '4px' }}>
                      /c/
                    </span>
                    <input
                      id="link-slug"
                      type="text"
                      style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12.5px',
                        color: 'var(--text-primary)',
                        padding: '8px 0'
                      }}
                      placeholder="villa-booking"
                      value={form.slug}
                      onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label htmlFor="link-phone" className="sarvya-field-label">
                      Target WhatsApp Number <span style={{ color: 'var(--status-error-text)' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setCustomPhoneMode(!customPhoneMode)}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: '11.5px', color: 'var(--sarvya-blue)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      {customPhoneMode ? 'Select from accounts' : '+ Custom number'}
                    </button>
                  </div>
                  {customPhoneMode ? (
                    <input
                      id="link-phone"
                      type="text"
                      className="sarvya-input"
                      placeholder="e.g. +91 93073 82030"
                      value={form.phoneNumber}
                      onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                      required
                    />
                  ) : (
                    <select
                      id="link-phone"
                      className="sarvya-select"
                      value={form.phoneNumber}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setCustomPhoneMode(true);
                          return;
                        }
                        const selected = phoneNumbers.find((p) => p.phone_number === e.target.value);
                        setForm((prev) => ({
                          ...prev,
                          phoneNumber: e.target.value,
                          phoneNumberId: selected?.phone_number_id || prev.phoneNumberId
                        }));
                      }}
                    >
                      {phoneNumbers.length === 0 && (
                        <option value="" disabled>-- No connected WhatsApp lines found --</option>
                      )}
                      {phoneNumbers.map((p) => (
                        <option key={p.id} value={p.phone_number}>
                          {p.display_name || 'Business Line'} ({p.phone_number}){p.is_default === 1 ? ' [Default]' : ''}
                        </option>
                      ))}
                      <option value="__custom__">+ Enter custom destination number...</option>
                    </select>
                  )}
                  <p className="sarvya-field-hint" style={{ margin: 0 }}>
                    Customers clicking this link start a WhatsApp chat with this number.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="link-category" className="sarvya-field-label">
                    Category
                  </label>
                  <select
                    id="link-category"
                    className="sarvya-select"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Default Message Textarea */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="link-msg" className="sarvya-field-label">
                    Pre-filled Default Message <span style={{ color: 'var(--status-error-text)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Placeholders: {'{{date}}'}, {'{{guests}}'}, {'{{room}}'}
                  </span>
                </div>
                <textarea
                  id="link-msg"
                  rows={3}
                  required
                  className="sarvya-textarea"
                  placeholder="Hi, I would like to book for {{date}} for {{guests}} guests."
                  value={form.defaultMessage}
                  onChange={(e) => setForm((p) => ({ ...p, defaultMessage: e.target.value }))}
                />
              </div>

              {/* Interactive Automated Response */}
              <div style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-subtle)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="var(--sarvya-blue)" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Interactive Automated Reply
                    </span>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={form.autoReplyEnabled}
                      onChange={(e) => setForm((p) => ({ ...p, autoReplyEnabled: e.target.checked }))}
                    />
                    <span>Active</span>
                  </label>
                </div>
                {form.autoReplyEnabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label htmlFor="link-autoreply" className="sarvya-field-hint" style={{ color: 'var(--text-secondary)' }}>
                      Automated Message (sent immediately upon starting chat)
                    </label>
                    <textarea
                      id="link-autoreply"
                      rows={2}
                      className="sarvya-textarea"
                      placeholder="Hello! Thank you for connecting. Our reservation concierge is reviewing your inquiry now..."
                      value={form.autoReplyMessage}
                      onChange={(e) => setForm((p) => ({ ...p, autoReplyMessage: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* In-App Landing Page Customization */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="link-welcome-title" className="sarvya-field-label">
                    Customer Landing Header
                  </label>
                  <input
                    id="link-welcome-title"
                    type="text"
                    className="sarvya-input"
                    placeholder="Your Business / Property Name"
                    value={form.welcomeTitle}
                    onChange={(e) => setForm((p) => ({ ...p, welcomeTitle: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label htmlFor="link-welcome-desc" className="sarvya-field-label">
                    Customer Subtitle
                  </label>
                  <input
                    id="link-welcome-desc"
                    type="text"
                    className="sarvya-input"
                    placeholder="Direct WhatsApp Concierge & Reservations"
                    value={form.welcomeDescription}
                    onChange={(e) => setForm((p) => ({ ...p, welcomeDescription: e.target.value }))}
                  />
                </div>
              </div>

              {/* Customizable Customer Intake Fields Section */}
              <div style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-subtle)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sliders size={16} color="var(--sarvya-blue)" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Customer Intake & Booking Fields (Customizable)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddField(!showAddField)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: '11.5px',
                      color: 'var(--sarvya-blue)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={13} />
                    {showAddField ? 'Cancel' : 'Add Custom Field'}
                  </button>
                </div>

                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Configure what guest details are requested on the chat landing page before initiating concierge chat (e.g. Check-in/out dates, guest count, room category, special notes).
                </p>

                {/* Field list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(form.customFields || []).map((field) => (
                    <div
                      key={field.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: '#FFFFFF',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        gap: '10px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '160px' }}>
                        <input
                          type="checkbox"
                          checked={field.enabled !== false}
                          onChange={() => handleToggleField(field.id)}
                          title="Enable/Disable field on landing page"
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: field.enabled !== false ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                            {field.label}
                          </span>
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                            {field.type} {field.options ? `(${field.options.length} options)` : ''}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={() => handleToggleRequired(field.id)}
                            disabled={field.enabled === false}
                          />
                          <span>Required</span>
                        </label>

                        {!['check_in', 'check_out', 'total_guests'].includes(field.id) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--status-error-text)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}
                            title="Remove Field"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Custom Field Inline Box */}
                {showAddField && (
                  <div style={{
                    marginTop: '6px',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    background: '#FFFFFF',
                    border: '1px dashed var(--sarvya-blue)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--sarvya-blue)' }}>
                      + New Custom Intake Field
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                      <input
                        type="text"
                        className="sarvya-input"
                        placeholder="Field Label (e.g. Flight Number)"
                        value={newFieldState.label}
                        onChange={(e) => setNewFieldState((p) => ({ ...p, label: e.target.value }))}
                        style={{ fontSize: '12px', padding: '6px 8px' }}
                      />
                      <select
                        className="sarvya-select"
                        value={newFieldState.type}
                        onChange={(e) => setNewFieldState((p) => ({ ...p, type: e.target.value }))}
                        style={{ fontSize: '12px', padding: '6px 8px' }}
                      >
                        <option value="text">Text Input</option>
                        <option value="number">Number Input</option>
                        <option value="date">Date Picker</option>
                        <option value="select">Dropdown Select</option>
                        <option value="textarea">Multi-line Text</option>
                      </select>
                    </div>

                    {newFieldState.type === 'select' && (
                      <input
                        type="text"
                        className="sarvya-input"
                        placeholder="Comma-separated options (e.g. Veg, Non-Veg, Jain)"
                        value={newFieldState.options}
                        onChange={(e) => setNewFieldState((p) => ({ ...p, options: e.target.value }))}
                        style={{ fontSize: '12px', padding: '6px 8px' }}
                      />
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={newFieldState.required}
                          onChange={(e) => setNewFieldState((p) => ({ ...p, required: e.target.checked }))}
                        />
                        <span>Is this field required?</span>
                      </label>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleAddCustomField}
                        disabled={!newFieldState.label.trim()}
                      >
                        Add to Intake Form
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Live WhatsApp / In-App Mockup */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-subtle)',
              padding: '16px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', alignSelf: 'flex-start' }}>
                Customer View Preview
              </span>
              <PhoneMockup
                template={previewTemplate}
                sampleData={{ date: 'Nov 20', guests: '2', room: 'Deluxe Sea View' }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)',
            marginTop: '8px'
          }}>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editingLink ? 'Update Link' : 'Save Chat Link'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Generator Drawer */}
      <Drawer
        isOpen={bulkDrawerOpen}
        open={bulkDrawerOpen}
        onClose={() => setBulkDrawerOpen(false)}
        title="Automated Bulk Link Generator"
        subtitle="Generate multiple branded chat links programmatically for room types, offers, or marketing channels"
      >
        <form onSubmit={handleBulkGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="bulk-prefix" className="sarvya-field-label">
              URL Slug Prefix
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '0 10px'
            }}>
              <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', userSelect: 'none' }}>
                /c/
              </span>
              <input
                id="bulk-prefix"
                type="text"
                required
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  padding: '8px 0'
                }}
                value={bulkPrefix}
                onChange={(e) => setBulkPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              />
              <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', userSelect: 'none' }}>
                -[item-slug]
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="bulk-items" className="sarvya-field-label">
              Item Names (one per line)
            </label>
            <p className="sarvya-field-hint" style={{ margin: 0 }}>
              Each line generates an active Click-to-Chat link with customized default inquiry message and automated bot reply.
            </p>
            <textarea
              id="bulk-items"
              rows={8}
              required
              className="sarvya-textarea"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
              value={bulkItemsText}
              onChange={(e) => setBulkItemsText(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={bulkGenerating}
            icon={Layers}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Generate All Links
          </Button>
        </form>
      </Drawer>

      {/* QR Code & Share Modal */}
      {shareModalOpen && activeShareLink && (
        <Modal
          isOpen={shareModalOpen}
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          title={`Share & Embed: ${activeShareLink.title}`}
          subtitle="Direct link, WhatsApp deep-link, high-resolution QR code, and HTML embed snippet"
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* High-Res QR Code Preview */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-subtle)'
            }}>
              <img
                src={`/api/v1/chat-links/${activeShareLink.id}/qr?format=svg&size=240`}
                alt="QR Code"
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: '#FFFFFF',
                  padding: '8px',
                  flexShrink: 0
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Printable QR Code
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Print on table tent cards, menus, room key cards, or reception desk banners. Scanning opens the WhatsApp conversation directly.
                </div>
                <div>
                  <a
                    href={`/api/v1/chat-links/${activeShareLink.id}/qr?format=svg`}
                    download={`qr_${activeShareLink.slug}.svg`}
                    className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Download size={13} />
                    <span>Download SVG</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Links to Copy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="sarvya-field-label" style={{ fontSize: '12px' }}>
                  1. Short Shareable Link (In-App Portal + WhatsApp)
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    readOnly
                    className="sarvya-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg-muted)' }}
                    value={getShareUrl(activeShareLink)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Copy}
                    onClick={() => copyToClipboard(getShareUrl(activeShareLink), 'modal_short')}
                  >
                    {copiedKey === 'modal_short' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="sarvya-field-label" style={{ fontSize: '12px' }}>
                  2. Direct WhatsApp wa.me Link
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    readOnly
                    className="sarvya-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'var(--bg-muted)' }}
                    value={activeShareLink.waMeUrl || activeShareLink.urls?.waMeUrl || ''}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Copy}
                    onClick={() => copyToClipboard(activeShareLink.waMeUrl || activeShareLink.urls?.waMeUrl, 'modal_wame')}
                  >
                    {copiedKey === 'modal_wame' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="sarvya-field-label" style={{ fontSize: '12px' }}>
                  3. HTML Website Button Embed Snippet
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <textarea
                    rows={2}
                    readOnly
                    className="sarvya-textarea"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--bg-muted)', resize: 'none' }}
                    value={getEmbedHtml(activeShareLink)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Code}
                    onClick={() => copyToClipboard(getEmbedHtml(activeShareLink), 'modal_embed')}
                  >
                    {copiedKey === 'modal_embed' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
              <Button type="button" variant="secondary" onClick={() => setShareModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

