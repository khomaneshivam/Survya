import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Hotel,
  HelpCircle,
  PhoneCall,
  RotateCcw,
  Building2,
  Target,
  Calendar,
  Layers,
  Briefcase,
  UtensilsCrossed,
  LifeBuoy,
  ReceiptText,
  Video,
  Sliders
} from 'lucide-react';
import TemplateInstallerModal from './TemplateInstallerModal';

export default function FlowTemplatesModal({
  isOpen,
  onClose,
  templates = [],
  onCloneTemplate,
  onFlowInstalled,
  token,
  cloning = false
}) {
  const [selectedSlug, setSelectedSlug] = useState('b2b-sales-qualification-demo');
  const [customName, setCustomName] = useState('');
  const [industryFilter, setIndustryFilter] = useState('ALL');
  const [installerOpen, setInstallerOpen] = useState(false);
  const [templateToInstall, setTemplateToInstall] = useState(null);

  if (!isOpen) return null;

  const filteredTemplates = templates.filter(t => {
    if (industryFilter === 'ALL') return true;
    if (industryFilter === 'B2B_SAAS') return t.industry === 'B2B_SAAS' || t.category === 'SALES';
    if (industryFilter === 'LEAD_GEN') return t.industry === 'LEAD_GEN' || t.category === 'LEAD_GEN' || t.industry === 'EVENTS';
    if (industryFilter === 'BOOKING') return (t.industry === 'BOOKING' || t.category === 'BOOKING') && t.industry !== 'HOSPITALITY';
    if (industryFilter === 'HOSPITALITY') return t.industry === 'HOSPITALITY';
    if (industryFilter === 'D2C_ECOMMERCE') return t.industry === 'D2C_ECOMMERCE' || t.category === 'ORDERS';
    if (industryFilter === 'SUPPORT') return t.industry === 'SUPPORT' || t.category === 'SUPPORT';
    if (industryFilter === 'FINTECH') return t.industry === 'FINTECH' || t.category === 'BILLING';
    return true;
  });

  const selectedTpl = templates.find(t => t.slug === selectedSlug) || filteredTemplates[0] || templates[0];

  const handleUseTemplate = () => {
    if (!selectedTpl) return;
    onCloneTemplate(selectedTpl.slug, customName || `${selectedTpl.title} (Custom)`);
  };

  const getTemplateIcon = (tpl) => {
    const slug = tpl?.slug || '';
    const ind = tpl?.industry || '';
    if (ind === 'D2C_ECOMMERCE' || slug.includes('restaurant') || slug.includes('order')) return UtensilsCrossed;
    if (ind === 'SUPPORT' || slug.includes('support') || slug.includes('triage')) return LifeBuoy;
    if (ind === 'FINTECH' || slug.includes('recovery') || slug.includes('payment') || slug.includes('renewal')) return ReceiptText;
    if (ind === 'EVENTS' || slug.includes('webinar') || slug.includes('event')) return Video;
    if (ind === 'B2B_SAAS' || slug.includes('b2b') || slug.includes('sales')) return Building2;
    if (ind === 'LEAD_GEN' || slug.includes('lead')) return Target;
    if (ind === 'BOOKING' || slug.includes('booking')) return Calendar;
    if (ind === 'HOSPITALITY' || slug.includes('hotel') || slug.includes('resort')) return Hotel;
    if (slug.includes('faq') || slug.includes('concierge')) return HelpCircle;
    return PhoneCall;
  };

  const getTemplateCapabilities = (tpl) => {
    const slug = tpl?.slug || '';
    if (slug.includes('restaurant-order') || slug.includes('d2c')) {
      return [
        'Interactive cuisine & combo food item selection menu',
        'Customer delivery address and landmark intake',
        'Prepaid instant UPI/Card link vs. Cash on Delivery (COD) branching',
        'Automated order sync into D2C Orders CRM Pipeline'
      ];
    }
    if (slug.includes('customer-support') || slug.includes('triage')) {
      return [
        'Automated complaint categorization (Billing, Tech, Delivery)',
        'Detailed issue & order tracking identifier intake',
        'High-urgency priority condition detection',
        'Automatic L2 Supervisor Human Handoff with SLA guarantees'
      ];
    }
    if (slug.includes('payment-recovery') || slug.includes('renewal')) {
      return [
        'Invoice due webhook and automated payment reminder pulse',
        'Interactive choice: Pay Now, 7-Day Extension, or Billing Handoff',
        'Instant payment gateway link delivery with receipt generation',
        'CRM subscription pipeline status sync with grace period tracking'
      ];
    }
    if (slug.includes('webinar') || slug.includes('event')) {
      return [
        'Interactive attendee name and professional role qualification',
        'CXO / Founder VIP attendee condition tagging and high lead scoring',
        'Instant calendar invite link (.ics) and Zoom room pass delivery',
        'Automated 24h pre-event reminder message pulse'
      ];
    }
    if (slug.includes('b2b-sales-qualification')) {
      return [
        'Dynamic team seat qualification & automatic lead score calculation',
        'Conditional enterprise branching (SQL vs. MQL self-serve routing)',
        'Automated deal upsert into B2B Sales Pipeline with calculated deal value',
        'Outbound HTTP webhook notification & simulated follow-up delay'
      ];
    }
    if (slug.includes('multi-channel-lead-gen')) {
      return [
        'Inbound Webhook & WhatsApp keyword multi-channel event triggering',
        'Instant collateral delivery with PDF download link',
        'Time-delayed nurture check-in with cancel-on-reply protection',
        'Intelligent human growth consultant handoff on customer interest'
      ];
    }
    if (slug.includes('universal-dynamic-booking')) {
      return [
        'Industry-agnostic catalog availability check (Rooms, Doctors, Equipment)',
        'Date & customer contact conversational intake',
        'Universal Booking Pipeline synchronization & deal tracking',
        'Instant WhatsApp confirmation & booking reference generation'
      ];
    }
    if (slug.includes('sales-quotation-b2b')) {
      return [
        'Interactive team seat & monthly volume selection',
        'Dynamic quotation calculation with tax & SLA tier',
        'CRM deal logging in B2B pipeline',
        'Account executive notification and WhatsApp handoff'
      ];
    }
    if (slug.includes('hospitality-booking')) {
      return [
        'Real-time room availability & dynamic seasonal rate engine',
        'Natural language check-in / check-out date parsing',
        'Automated quotation breakdown with GST taxes',
        'Direct booking enquiry creation and staff escalation'
      ];
    }
    return [
      'Interactive WhatsApp buttons and option menus',
      'Context-aware session variables and state persistence',
      'Automated customer CRM profile tracking',
      'Smooth fallback and human team escalation'
    ];
  };

  const industries = [
    { id: 'ALL', label: 'All Blueprints', icon: Layers },
    { id: 'B2B_SAAS', label: 'B2B Sales', icon: Building2 },
    { id: 'LEAD_GEN', label: 'Lead Gen & Drip', icon: Target },
    { id: 'BOOKING', label: 'Universal Booking', icon: Calendar },
    { id: 'D2C_ECOMMERCE', label: 'D2C Orders', icon: UtensilsCrossed },
    { id: 'SUPPORT', label: 'Support & SLA', icon: LifeBuoy },
    { id: 'FINTECH', label: 'Billing & Renewal', icon: ReceiptText },
    { id: 'HOSPITALITY', label: 'Hospitality', icon: Hotel }
  ];

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

        {/* Industry Filter Pills */}
        <div style={{
          padding: '10px 24px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          gap: '8px',
          background: '#FAFAFB',
          overflowX: 'auto'
        }}>
          {industries.map(ind => {
            const Icon = ind.icon;
            const active = industryFilter === ind.id;
            return (
              <button
                key={ind.id}
                type="button"
                onClick={() => setIndustryFilter(ind.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  border: active ? '1px solid #2F5219' : '1px solid #E5E5E8',
                  background: active ? '#2F5219' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#48484A',
                  fontSize: '0.78rem',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={14} />
                <span>{ind.label}</span>
              </button>
            );
          })}
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
            {filteredTemplates.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#8E8E93', fontSize: '0.82rem' }}>
                No templates found for this industry filter.
              </div>
            ) : filteredTemplates.map(tpl => {
              const Icon = getTemplateIcon(tpl);
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
                    {tpl.description ? tpl.description.slice(0, 85) + '...' : ''}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '8px', fontSize: '0.7rem', color: '#8E8E93' }}>
                    <span>{Array.isArray(tpl.nodes) ? tpl.nodes.length : (tpl.nodeCount || 8)} steps</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{(tpl.category || 'general').toLowerCase()}</span>
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
                    {getTemplateCapabilities(selectedTpl).map((cap, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#2F5219' }}>
                        <CheckCircle2 size={14} />
                        <span>{cap}</span>
                      </div>
                    ))}
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
                      style={{ padding: '9px 16px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUseTemplate}
                      disabled={cloning}
                      className="btn btn-outline"
                      style={{
                        padding: '9px 16px',
                        fontWeight: 600,
                        gap: '6px'
                      }}
                      title="Quick clone without business configuration"
                    >
                      {cloning ? <RotateCcw size={15} className="spin" /> : <ArrowRight size={15} />}
                      <span>Quick Clone</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTemplateToInstall(selectedTpl);
                        setInstallerOpen(true);
                      }}
                      className="btn btn-primary"
                      style={{
                        padding: '9px 20px',
                        background: '#2F5219',
                        borderColor: '#2F5219',
                        fontWeight: 600,
                        gap: '8px'
                      }}
                    >
                      <Sliders size={16} />
                      <span>Configure & Install (Guided)</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Guided Template Installer Wizard Modal */}
      {installerOpen && templateToInstall && (
        <TemplateInstallerModal
          isOpen={installerOpen}
          onClose={() => {
            setInstallerOpen(false);
            setTemplateToInstall(null);
          }}
          template={templateToInstall}
          token={token || localStorage.getItem('token') || ''}
          onInstalled={(result) => {
            setInstallerOpen(false);
            setTemplateToInstall(null);
            onClose();
            if (onFlowInstalled) {
              onFlowInstalled(result.flow);
            } else if (onCloneTemplate && result.flow) {
              onCloneTemplate(result.flow.id, result.flow.name);
            }
          }}
        />
      )}
    </div>
  );
}
