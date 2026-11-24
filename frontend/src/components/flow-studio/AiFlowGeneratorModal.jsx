import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Send,
  CheckCircle2,
  AlertCircle,
  X,
  Phone,
  Layers,
  Building,
  Check,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export default function AiFlowGeneratorModal({
  isOpen,
  onClose,
  onFlowGenerated,
  token
}) {
  const [prompt, setPrompt] = useState('');
  const [selectedLine, setSelectedLine] = useState('');
  const [loading, setLoading] = useState(false);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState(null);
  const [generationResult, setGenerationResult] = useState(null);

  const QUICK_PROMPTS = [
    {
      label: '🏖️ Resort Room Booking (Hospitality)',
      text: 'Create a luxury resort room booking flow that checks configured room tariffs, collects check-in and check-out dates, logs the booking lead in CRM, and schedules a follow-up reminder.'
    },
    {
      label: '👗 D2C Fashion & Apparel (Retail)',
      text: 'Create an e-commerce clothing catalog browsing flow that displays hoodies and shirts with sizes, offers gift packaging and express shipping add-ons, and records the order in CRM.'
    },
    {
      label: '🦷 Dental & Healthcare (Clinic)',
      text: 'Build a dental clinic appointment booking flow that presents teeth whitening and cleaning services, schedules consultation time slots, and offers preventive care upgrades.'
    },
    {
      label: '🍕 Cafe Dining Order & UPI Payment (F&B)',
      text: 'Create an interactive dining menu order workflow for table service that takes food preferences, adds extra cheese or dessert add-ons, generates an instant UPI payment link, and notifies the kitchen.'
    },
    {
      label: '💆‍♀️ Spa & Salon Rejuvenation (Wellness)',
      text: 'Create a luxury spa appointment flow that offers traditional Balinese massages and facials, books time slots, and upsells aromatherapy oils.'
    },
    {
      label: '🏢 Penthouse & Property Tour (Real Estate)',
      text: 'Build a premium realty lead flow that showcases 3 and 4 BHK residences, provides instant digital brochures, and schedules VIP site inspections.'
    },
    {
      label: '🎓 Coding Bootcamp & Courses (Education)',
      text: 'Create an ed-tech academy enrollment flow that provides full-stack syllabus details, offers 1-on-1 mentorship add-ons, and captures student registrations.'
    },
    {
      label: '📦 Wholesale Packaging & Cartons (B2B)',
      text: 'Build a B2B wholesale quotation flow for corrugated boxes that takes minimum order quantities, applies bulk volume discounts, and supports custom printing add-ons.'
    }
  ];

  useEffect(() => {
    if (!isOpen) {
      setGenerationResult(null);
      setError(null);
      return;
    }

    const fetchCaps = async () => {
      setCapabilitiesLoading(true);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/flows/ai/capabilities', { headers });
        const data = await res.json();
        if (data.success) {
          setCapabilities(data.capabilities);
          if (data.capabilities?.connectedLines?.length > 0) {
            const defaultLine = data.capabilities.connectedLines.find(l => l.isDefault) || data.capabilities.connectedLines[0];
            setSelectedLine(defaultLine.phoneNumberId || '');
          }
        }
      } catch (err) {
        console.warn('Failed to load AI capabilities:', err.message);
      } finally {
        setCapabilitiesLoading(false);
      }
    };

    fetchCaps();
  }, [isOpen, token]);

  if (!isOpen) return null;
  const flowBuilderEnabled = capabilities?.flowBuilder?.enabled !== false;

  const handleGenerate = async () => {
    if (!flowBuilderEnabled) {
      setError('AI flow drafting is disabled. Enable it in System Administration → AI Flow Builder setup.');
      return;
    }
    if (!prompt.trim()) {
      setError('Please provide a prompt describing your desired workflow.');
      return;
    }

    setLoading(true);
    setError(null);
    setGenerationResult(null);

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch('/api/flows/ai/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: prompt.trim(),
          phoneNumberId: selectedLine || null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate workflow');
      }

      setGenerationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCanvas = () => {
    if (generationResult && onFlowGenerated) {
      onFlowGenerated(generationResult);
      onClose();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '16px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          background: 'linear-gradient(135deg, #1E3A12 0%, #2F5219 100%)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.15)',
              padding: '8px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={20} color="#FDE047" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                AI Flow Architect
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
                Describe the outcome; AI creates a reviewable draft from your approved business context.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Available system context */}
        <div style={{
          padding: '10px 24px',
          background: '#F8FAFC',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          fontSize: '0.78rem'
        }}>
          <span style={{ fontWeight: 600, color: '#475569' }}>Available system context:</span>
          {capabilities ? (
            <>
              <span style={{
                background: '#ECFDF5',
                color: '#065F46',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                border: '1px solid #A7F3D0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Building size={12} />
                {capabilities.roomTypesCount} Room Types Grounded
              </span>
              <span style={{
                background: '#EEF2FF',
                color: '#3730A3',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                border: '1px solid #C7D2FE',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Layers size={12} />
                {capabilities.pipelinesCount} CRM Pipelines
              </span>
              <span style={{
                background: '#FEF3C7',
                color: '#92400E',
                padding: '2px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                border: '1px solid #FDE68A',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Phone size={12} />
                {capabilities.connectedLines?.length || 0} Connected Phone Lines
              </span>
              <span style={{
                marginLeft: 'auto',
                color: '#64748B',
                fontSize: '0.75rem',
                fontStyle: 'italic'
              }}>
                Engine: {capabilities.aiConfig?.hasApiKey ? capabilities.aiConfig.provider : 'Smart System Synthesizer'}
              </span>
            </>
          ) : (
            <span style={{ color: '#94A3B8' }}>Detecting connected resources...</span>
          )}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #F87171',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.85rem'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {capabilities && !flowBuilderEnabled && (
            <div style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              color: '#92400E',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '0.84rem'
            }}>
              AI flow drafting is disabled by the administrator. Configure it in System Administration before creating a proposal.
            </div>
          )}

          {!generationResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#1E293B',
                  marginBottom: '6px'
                }}>
                  What workflow would you like to build?
                </label>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g., Build a resort booking flow that checks configured room tariffs, collects stay dates, logs a CRM lead, and schedules a follow-up..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.88rem',
                    color: '#0F172A',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Quick Prompt Chips */}
              <div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B', display: 'block', marginBottom: '8px' }}>
                  Examples (optional):
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
                  {QUICK_PROMPTS.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPrompt(qp.text)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#F1F5F9';
                        e.currentTarget.style.borderColor = '#94A3B8';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#F8FAFC';
                        e.currentTarget.style.borderColor = '#E2E8F0';
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{qp.label}</span>
                      <ChevronRight size={14} color="#94A3B8" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Connected Line Assignment Dropdown */}
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <label style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={14} color="#2F5219" />
                    <span>Use this line as draft context:</span>
                  </label>
                  <select
                    value={selectedLine}
                    onChange={e => setSelectedLine(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      color: '#0F172A',
                      background: '#FFFFFF',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">All Connected Lines (Global Fallback)</option>
                    {capabilities?.connectedLines?.map((line, idx) => (
                      <option key={`${line.phoneNumberId || line.id || 'line'}_${idx}`} value={line.phoneNumberId}>
                        {line.displayName} ({line.phoneNumber}) {line.isDefault ? '— Default Line' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', lineHeight: 1.4 }}>
                  This selection is saved with the draft only. It does not activate routing or send any message.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', fontSize: '0.78rem', lineHeight: 1.45 }}>
                <ShieldCheck size={16} style={{ flex: '0 0 auto', marginTop: '1px' }} />
                <span>This creates a draft only. Review requirements, APIs, design, and simulation before requesting activation.</span>
              </div>
            </div>
          ) : (
            /* Result Card */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '12px',
                padding: '18px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <CheckCircle2 size={24} color="#15803D" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#166534' }}>
                      {generationResult.flow?.name || 'Workflow Generated Successfully!'}
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#15803D' }}>
                      {generationResult.flow?.description}
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                  marginTop: '14px'
                }}>
                  <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>NODES</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>
                      {generationResult.summary?.nodeCount || 0}
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>TRANSITIONS</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>
                      {generationResult.summary?.transitionCount || 0}
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>STATUS</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: generationResult.summary?.isPublished ? '#15803D' : '#D97706' }}>
                      {generationResult.summary?.isPublished ? 'PUBLISHED' : 'DRAFT'}
                    </div>
                  </div>
                  <div style={{ background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600 }}>LINE ASSIGNMENT</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>
                      {generationResult.summary?.assignedLine || 'All Lines'}
                    </div>
                  </div>
                </div>
              </div>

              {generationResult.governance?.apiReadiness?.items?.length > 0 && (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', marginBottom: '8px' }}>
                    <strong style={{ color: '#1E293B', fontSize: '0.82rem' }}>Integration review</strong>
                    <span style={{ color: generationResult.governance.apiReadiness.reviewCount ? '#92400E' : '#166534', fontSize: '0.74rem', fontWeight: 700 }}>
                      {generationResult.governance.apiReadiness.reviewCount ? `${generationResult.governance.apiReadiness.reviewCount} item(s) need review` : 'Ready for API review'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: '7px' }}>
                    {generationResult.governance.apiReadiness.items.map((item) => (
                      <div key={item.type} style={{ fontSize: '0.76rem', color: '#475569', lineHeight: 1.45 }}>
                        <strong style={{ color: item.status === 'READY' ? '#166534' : '#92400E' }}>{item.title}:</strong> {item.detail}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generationResult?.suggestedCatalogItems?.length > 0 && (
                <div style={{ marginTop: '12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#166534' }}>
                  <span style={{ fontWeight: 700 }}>📦 Sector Catalog Scaffolding Available: </span>
                  Includes {generationResult.suggestedCatalogItems.length} curated catalog items and {generationResult.suggestedAddons?.length || 0} add-on upsell groups. You can inspect or expand them anytime in the Catalog tab.
                </div>
              )}

              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                Your draft is grounded in available catalog and CRM context, laid out for review, and saved to the flow library.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 24px',
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          {!generationResult ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !prompt.trim() || !flowBuilderEnabled}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: loading || !prompt.trim() || !flowBuilderEnabled ? '#94A3B8' : '#2F5219',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: loading || !prompt.trim() || !flowBuilderEnabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
                }}
              >
                {loading ? <RotateCcw size={16} className="spin" /> : <Sparkles size={16} color="#FDE047" />}
                <span>{loading ? 'Creating draft...' : 'Create draft with AI'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGenerationResult(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Generate Another
              </button>
              <button
                type="button"
                onClick={handleOpenCanvas}
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#2F5219',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
                }}
              >
                <span>Open in Visual Canvas &amp; Test</span>
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
