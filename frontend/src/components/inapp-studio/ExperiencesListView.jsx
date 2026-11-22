import React, { useState, useMemo } from 'react';
import { Card, CardBody, Button, Badge, SearchInput, Modal, DataTable } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import {
  Plus,
  Sparkles,
  QrCode,
  Copy,
  ExternalLink,
  Edit,
  Trash2,
  Play,
  Pause,
  Layers,
  Smartphone,
  Check,
  MessageSquareDiff
} from 'lucide-react';
import LiveMobilePreviewModal from './LiveMobilePreviewModal';

const DOMAIN_FILTERS = [
  { value: 'ALL', label: 'All Domains' },
  { value: 'HOSPITALITY', label: 'Hospitality' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'B2B_SALES', label: 'B2B Sales' },
  { value: 'SERVICES', label: 'Services' }
];

export default function ExperiencesListView({
  experiences = [],
  token,
  loading,
  onSelectExperience,
  onOpenStarterModal,
  onOpenNegotiationsModal,
  onOpenQr,
  onRefresh,
  toast
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newExpData, setNewExpData] = useState({ name: '', domain_type: 'CUSTOM', slug: '' });
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [previewExp, setPreviewExp] = useState(null);

  // Filter experiences
  const filtered = experiences.filter(exp => {
    if (domainFilter !== 'ALL' && exp.domain_type !== domainFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (exp.name || '').toLowerCase().includes(term) || (exp.slug || '').toLowerCase().includes(term);
    }
    return true;
  });

  const handleCopyLink = (exp) => {
    const fullUrl = `${window.location.origin}/x/${exp.slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(exp.id);
    setTimeout(() => setCopiedId(null), 2500);
    if (toast) toast('Link copied to clipboard');
  };

  const handleToggleStatus = async (exp) => {
    const newStatus = exp.status === 'PUBLISHED' ? 'PAUSED' : 'PUBLISHED';
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Experience ${newStatus.toLowerCase()}`);
        if (onRefresh) onRefresh();
      }
    } catch (e) {}
  };

  const handleDelete = async (exp) => {
    if (!window.confirm(`Are you sure you want to delete "${exp.name}"?`)) return;
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${exp.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast('Experience deleted');
        if (onRefresh) onRefresh();
      }
    } catch (e) {}
  };

  const handleCreateCustom = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/v1/inapp/experiences', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(newExpData)
      });
      const data = await res.json();
      if (data.success) {
        setCreateModalOpen(false);
        setNewExpData({ name: '', domain_type: 'CUSTOM', slug: '' });
        if (toast) toast('Experience created');
        if (onRefresh) onRefresh();
        if (onSelectExperience) onSelectExperience(data.data);
      } else {
        alert(data.message || 'Failed to create experience');
      }
    } catch (err) {
      alert(err.message || 'Error creating experience');
    } finally {
      setCreating(false);
    }
  };

  const experienceColumns = useMemo(() => [
    {
      header: 'Experience',
      accessor: 'name',
      cell: (exp) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{ fontWeight: 600, color: '#0F172A', cursor: 'pointer' }}
              onClick={() => onSelectExperience && onSelectExperience(exp)}
            >
              {exp.name}
            </span>
            <Badge variant="default">{exp.domain_type}</Badge>
          </div>
        </div>
      )
    },
    {
      header: 'URL Slug',
      accessor: 'slug',
      cell: (exp) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <code style={{ fontSize: '0.75rem', color: '#64748B' }}>/x/{exp.slug}</code>
          <button
            type="button"
            onClick={() => handleCopyLink(exp)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: copiedId === exp.id ? '#16A34A' : '#94A3B8' }}
            title="Copy URL"
          >
            {copiedId === exp.id ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <a
            href={`${window.location.origin}/x/${exp.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3B82F6', display: 'inline-flex' }}
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      )
    },
    {
      header: 'Screens',
      accessor: 'screens_count',
      numeric: true,
      align: 'right',
      cell: (exp) => (
        <span className="tabular-nums" style={{ fontSize: '0.8rem' }}>
          {exp.screens_count || 0}
        </span>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (exp) => {
        const isPub = exp.status === 'PUBLISHED';
        const isPaused = exp.status === 'PAUSED';
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleToggleStatus(exp)}
              style={{
                width: '30px',
                height: '16px',
                borderRadius: '8px',
                background: isPub ? '#10B981' : '#CBD5E1',
                border: 'none',
                position: 'relative',
                cursor: 'pointer',
                padding: 0
              }}
              title={isPub ? 'Pause Experience' : 'Publish Experience'}
            >
              <span style={{
                position: 'absolute',
                top: '2px',
                left: isPub ? '16px' : '2px',
                width: '12px',
                height: '12px',
                borderRadius: '6px',
                background: '#FFFFFF',
                transition: 'all 0.15s ease'
              }} />
            </button>
            <Badge variant={isPub ? 'success' : (isPaused ? 'warning' : 'default')}>
              {exp.status}
            </Badge>
          </div>
        );
      }
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (exp) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setPreviewExp(exp)}
            className="btn btn-secondary"
            style={{ padding: '3px 7px', fontSize: '0.74rem' }}
            title="Live Mobile Preview"
          >
            <Smartphone size={13} />
          </button>
          <button
            type="button"
            onClick={() => onOpenQr(exp)}
            className="btn btn-secondary"
            style={{ padding: '3px 7px', fontSize: '0.74rem' }}
            title="View QR Code"
          >
            <QrCode size={13} />
          </button>
          <button
            type="button"
            onClick={() => onSelectExperience(exp)}
            className="btn btn-secondary"
            style={{ padding: '3px 7px', fontSize: '0.74rem' }}
            title="Edit Screens"
          >
            <Edit size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(exp)}
            className="btn btn-secondary"
            style={{ padding: '3px 7px', fontSize: '0.74rem', color: '#DC2626' }}
            title="Delete Experience"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )
    }
  ], [copiedId, onSelectExperience, onOpenQr]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
          <SearchInput
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search experiences by name or slug..."
            style={{ maxWidth: '340px' }}
          />

          <select
            className="input-field"
            value={domainFilter}
            onChange={e => setDomainFilter(e.target.value)}
            style={{ width: '180px' }}
          >
            {DOMAIN_FILTERS.map(df => (
              <option key={df.value} value={df.value}>{df.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button variant="secondary" onClick={onOpenNegotiationsModal} style={{ gap: '6px' }}>
            <MessageSquareDiff size={16} /> Negotiations & Calls
          </Button>

          <Button variant="secondary" onClick={onOpenStarterModal}>
            <Sparkles size={16} /> 1-Click Starter Packs
          </Button>

          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            <Plus size={16} /> New Experience
          </Button>
        </div>
      </div>

      {/* Experience DataTable */}
      <DataTable
        density="compact"
        columns={experienceColumns}
        data={filtered}
        rows={filtered}
        emptyTitle="No In-App Experiences Found"
        emptyMessage="Instantiate a 1-click domain starter pack or create a custom multi-screen flow."
        emptyAction={
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <Button variant="primary" onClick={onOpenStarterModal}>
              <Sparkles size={14} /> Starter Pack
            </Button>
            <Button variant="secondary" onClick={() => setCreateModalOpen(true)}>
              <Plus size={14} /> New Experience
            </Button>
          </div>
        }
      />

      {/* New Custom Experience Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Custom In-App Experience"
        subtitle="Define experience title and domain classification."
        size="sm"
      >
        <form onSubmit={handleCreateCustom} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Experience Name
            </label>
            <input
              type="text"
              className="input-field"
              value={newExpData.name}
              onChange={e => setNewExpData({ ...newExpData, name: e.target.value })}
              required
              placeholder="e.g. VIP Concierge & Booking Portal"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Domain Solution
            </label>
            <select
              className="input-field"
              value={newExpData.domain_type}
              onChange={e => setNewExpData({ ...newExpData, domain_type: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="HOSPITALITY">Hospitality & Resorts</option>
              <option value="RETAIL">Retail & Storefront</option>
              <option value="B2B_SALES">B2B Sales & Leads</option>
              <option value="SERVICES">Services & Appointments</option>
              <option value="CUSTOM">Custom Domain</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Custom Slug (Optional)
            </label>
            <input
              type="text"
              className="input-field"
              value={newExpData.slug}
              onChange={e => setNewExpData({ ...newExpData, slug: e.target.value })}
              placeholder="Auto-generated if blank"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Experience'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Live Mobile Device Preview Modal */}
      <LiveMobilePreviewModal
        isOpen={Boolean(previewExp)}
        onClose={() => setPreviewExp(null)}
        experience={previewExp}
      />
    </div>
  );
}

