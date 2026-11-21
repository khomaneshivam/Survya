import React, { useState } from 'react';
import { Card, CardBody, Button, Badge, SearchInput, Modal } from '../ui';
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
        credentials: 'include'
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

      {/* Experience Cards Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <Smartphone size={48} style={{ color: 'var(--text-tertiary, #94a3b8)', marginBottom: '14px' }} />
              <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: '600' }}>
                No In-App Experiences Found
              </h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                Instantiate a 1-click domain starter pack or create a custom multi-screen flow.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                <Button variant="primary" onClick={onOpenStarterModal}>
                  <Sparkles size={16} /> Choose a Starter Pack
                </Button>
                <Button variant="secondary" onClick={() => setCreateModalOpen(true)}>
                  <Plus size={16} /> Blank Custom Experience
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filtered.map(exp => {
            const isPub = exp.status === 'PUBLISHED';
            const isPaused = exp.status === 'PAUSED';
            const statusBadgeVariant = isPub ? 'success' : (isPaused ? 'warning' : 'default');

            return (
              <Card key={exp.id} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <CardBody style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
                  <div>
                    {/* Header line */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                      <h4
                        style={{ margin: 0, fontSize: '16px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-primary)' }}
                        onClick={() => onSelectExperience(exp)}
                      >
                        {exp.name}
                      </h4>
                      <Badge variant={statusBadgeVariant}>{exp.status}</Badge>
                    </div>

                    {/* Metadata tags */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <Badge variant="default">{exp.domain_type}</Badge>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <Layers size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '3px' }} />
                        {exp.screens_count || 0} Screens
                      </span>
                    </div>

                    {/* URL preview */}
                    <div style={{
                      backgroundColor: 'var(--bg-secondary, #f8fafc)',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: 'var(--text-secondary)',
                      wordBreak: 'break-all',
                      marginBottom: '16px',
                      border: '1px solid var(--border-color)'
                    }}>
                      /x/{exp.slug}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Button variant="secondary" size="sm" onClick={() => setPreviewExp(exp)} title="Live Mobile Preview">
                        <Smartphone size={14} />
                      </Button>

                      <Button variant="secondary" size="sm" onClick={() => onOpenQr(exp)} title="View QR Code">
                        <QrCode size={14} />
                      </Button>

                      <Button variant="secondary" size="sm" onClick={() => handleCopyLink(exp)} title="Copy URL">
                        {copiedId === exp.id ? <Check size={14} /> : <Copy size={14} />}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleStatus(exp)}
                        title={isPub ? 'Pause Experience' : 'Publish Experience'}
                      >
                        {isPub ? <Pause size={14} /> : <Play size={14} />}
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDelete(exp)}
                        title="Delete Experience"
                        style={{ color: '#ef4444' }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>

                    <Button variant="primary" size="sm" onClick={() => onSelectExperience(exp)}>
                      <Edit size={14} /> Manage Experience
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

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

