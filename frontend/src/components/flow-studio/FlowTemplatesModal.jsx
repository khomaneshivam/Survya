import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Hotel,
  HelpCircle,
  PhoneCall,
  RotateCcw
} from 'lucide-react';

export default function FlowTemplatesModal({
  isOpen,
  onClose,
  templates = [],
  onCloneTemplate,
  cloning = false
}) {
  const [selectedSlug, setSelectedSlug] = useState('hospitality-booking-quote-journey');
  const [customName, setCustomName] = useState('');

  if (!isOpen) return null;

  const selectedTpl = templates.find(t => t.slug === selectedSlug) || templates[0];

  const handleUseTemplate = () => {
    if (!selectedTpl) return;
    onCloneTemplate(selectedTpl.slug, customName || `${selectedTpl.title} (Custom)`);
  };

  const getTemplateIcon = (slug) => {
    if (slug.includes('booking') || slug.includes('hospitality')) return Hotel;
    if (slug.includes('faq') || slug.includes('concierge')) return HelpCircle;
    return PhoneCall;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        width: '840px',
        maxWidth: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#FAFAFB'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: '#E8F5E9',
              color: '#2F5219',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#1C1C1E' }}>
                Conversation Flow Starter Templates
              </h2>
              <div style={{ fontSize: '0.8rem', color: '#67676B' }}>
                Deploy production-tested customer journeys without building from scratch
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8E8E93', padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Split */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Template Cards */}
          <div style={{
            width: '320px',
            borderRight: '1px solid #E5E5E8',
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: '#F9F9FB'
          }}>
            {templates.map(tpl => {
              const Icon = getTemplateIcon(tpl.slug);
              const isSelected = selectedSlug === tpl.slug;
              return (
                <div
                  key={tpl.slug}
                  onClick={() => {
                    setSelectedSlug(tpl.slug);
                    setCustomName(`${tpl.title} (Custom)`);
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #2F5219' : '1px solid #E5E5E8',
                    background: isSelected ? '#FFFFFF' : '#FFFFFF',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 4px 12px rgba(47,82,25,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: isSelected ? '#E8F5E9' : '#F2F2F7',
                      color: isSelected ? '#2F5219' : '#67676B',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={16} />
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1C1C1E' }}>
                      {tpl.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#67676B', lineHeight: '1.4' }}>
                    {tpl.description.slice(0, 85)}...
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', fontSize: '0.7rem', color: '#8E8E93' }}>
                    <span>{tpl.nodeCount || 10} steps</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{tpl.category.toLowerCase()}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Selected Template Deep Details & Preview */}
          <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {selectedTpl ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#E8F5E9',
                    color: '#2F5219',
                    textTransform: 'uppercase'
                  }}>
                    {selectedTpl.industry}
                  </span>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: '#EFF6FF',
                    color: '#1E40AF',
                    textTransform: 'uppercase'
                  }}>
                    {selectedTpl.category}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1C1C1E', margin: '0 0 10px 0' }}>
                  {selectedTpl.title}
                </h3>

                <p style={{ fontSize: '0.86rem', color: '#48484A', lineHeight: '1.5', margin: '0 0 18px 0' }}>
                  {selectedTpl.description}
                </p>

                <div style={{
                  background: '#F9F9FB',
                  border: '1px solid #E5E5E8',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '8px', color: '#1C1C1E' }}>
                    Key Capabilities Included:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#2F5219' }}>
                      <CheckCircle2 size={14} />
                      <span>Dynamic WhatsApp interactive button menu choices</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#2F5219' }}>
                      <CheckCircle2 size={14} />
                      <span>Natural language date intake with check-in & check-out validation</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#2F5219' }}>
                      <CheckCircle2 size={14} />
                      <span>Automated room inventory & live rate calculation</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#2F5219' }}>
                      <CheckCircle2 size={14} />
                      <span>Instant CRM enquiry creation and front-desk handoff</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 'auto' }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                    Flow Name in Your Workspace
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={customName || `${selectedTpl.title} (Custom)`}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Enter flow name..."
                    style={{ marginBottom: '16px' }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={onClose}
                      className="btn btn-outline"
                      style={{ padding: '9px 18px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUseTemplate}
                      disabled={cloning}
                      className="btn btn-primary"
                      style={{
                        padding: '9px 20px',
                        background: '#2F5219',
                        borderColor: '#2F5219',
                        fontWeight: 600,
                        gap: '8px'
                      }}
                    >
                      {cloning ? <RotateCcw size={16} className="spin" /> : <ArrowRight size={16} />}
                      <span>{cloning ? 'Cloning Journey...' : 'Clone & Open in Visual Builder'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
