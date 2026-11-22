import React, { useState } from 'react';
import { PageHeader, Tabs, Button, Badge } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import {
  ArrowLeft,
  QrCode,
  Copy,
  ExternalLink,
  Play,
  Pause,
  Palette,
  Layers,
  FileSpreadsheet,
  Check,
  Smartphone
} from 'lucide-react';
import BrandingConnectionsTab from './BrandingConnectionsTab';
import MultiScreenFlowTab from './MultiScreenFlowTab';
import FormValidationBuilderTab from './FormValidationBuilderTab';
import LiveMobilePreviewModal from './LiveMobilePreviewModal';

export default function ExperienceDetailEditor({
  experience,
  token,
  onBack,
  onRefresh,
  onOpenQr,
  toast
}) {
  const [activeTab, setActiveTab] = useState('screens');
  const [targetFormScreenId, setTargetFormScreenId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const publicUrl = `/x/${experience.slug}`;

  const handleCopyUrl = () => {
    const fullUrl = `${window.location.origin}${publicUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (toast) toast('Experience URL copied to clipboard');
  };

  const handleSaveBranding = async (updatedData) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${experience.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(updatedData)
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast('Branding & connections updated successfully');
        if (onRefresh) onRefresh();
      } else {
        alert(data.message || 'Failed to update experience');
      }
    } catch (err) {
      alert(err.message || 'Error saving experience');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = experience.status === 'PUBLISHED' ? 'PAUSED' : 'PUBLISHED';
    try {
      const res = await fetch(`/api/v1/inapp/experiences/${experience.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Experience ${newStatus === 'PUBLISHED' ? 'published' : 'paused'}`);
        if (onRefresh) onRefresh();
      } else {
        alert(data.message || 'Failed to update status');
      }
    } catch (err) {
      alert(err.message || 'Error updating status');
    }
  };

  const handleJumpToFormBuilder = (screen) => {
    setTargetFormScreenId(screen.id);
    setActiveTab('forms');
  };

  const tabs = [
    { id: 'screens', label: 'Multi-Screen Flow', icon: Layers },
    { id: 'forms', label: 'Form & Validation Builder', icon: FileSpreadsheet },
    { id: 'branding', label: 'Branding & Connections', icon: Palette }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="secondary" size="sm" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Studio
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>
                {experience.name}
              </h2>
              <Badge variant={experience.status === 'PUBLISHED' ? 'success' : (experience.status === 'PAUSED' ? 'warning' : 'default')}>
                {experience.status}
              </Badge>
              <Badge variant="default">{experience.domain_type}</Badge>
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
              {publicUrl}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
            <Smartphone size={15} /> Live Mobile Preview
          </Button>

          <Button variant="secondary" size="sm" onClick={() => onOpenQr(experience)}>
            <QrCode size={15} /> QR Code
          </Button>

          <Button variant="secondary" size="sm" onClick={handleCopyUrl}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy Link'}
          </Button>

          <Button
            variant={experience.status === 'PUBLISHED' ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleStatus}
          >
            {experience.status === 'PUBLISHED' ? <Pause size={15} /> : <Play size={15} />}
            {experience.status === 'PUBLISHED' ? 'Pause Experience' : 'Publish Experience'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Panels */}
      {activeTab === 'screens' && (
        <MultiScreenFlowTab
          experience={experience}
          token={token}
          screens={experience.screens || []}
          onRefresh={onRefresh}
          onOpenFormBuilder={handleJumpToFormBuilder}
          toast={toast}
        />
      )}

      {activeTab === 'forms' && (
        <FormValidationBuilderTab
          experience={experience}
          token={token}
          screens={experience.screens || []}
          selectedScreenId={targetFormScreenId}
          onRefresh={onRefresh}
          toast={toast}
        />
      )}

      {activeTab === 'branding' && (
        <BrandingConnectionsTab
          experience={experience}
          token={token}
          onSave={handleSaveBranding}
          saving={saving}
        />
      )}

      {/* Live Mobile Device Preview Modal */}
      <LiveMobilePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        experience={experience}
      />
    </div>
  );
}

