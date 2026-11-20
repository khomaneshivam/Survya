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
  ChevronRight
} from 'lucide-react';

export default function AiFlowGeneratorModal({
  isOpen,
  onClose,
  onFlowGenerated,
  token
}) {
  const [prompt, setPrompt] = useState('');
  const [selectedLine, setSelectedLine] = useState('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [error, setError] = useState(null);
  const [generationResult, setGenerationResult] = useState(null);

  const QUICK_PROMPTS = [
    {
      label: '🏖️ Resort Room Booking',
      text: 'Create a luxury resort room booking flow that checks live room tariffs, collects check-in & check-out dates, logs the booking lead in CRM, and schedules a 1-hour follow-up reminder.'
    },
    {
      label: '💼 B2B Sales Demo Qualification',
      text: 'Build a B2B sales qualification workflow that collects company name, team size, and monthly budget, routes enterprise SQL deals to Account Executives, and sends self-serve starter links to smaller teams.'
    },
    {
      label: '🎯 Lead Gen & 24h Nurturing Drip',
      text: 'Build a high-converting lead generation flow that captures user requirements, sends an exclusive 15% discount coupon code, logs the lead in CRM, and delivers a compliant 24h follow-up message.'
    },
    {
      label: '🍕 Cafe Dining Order & UPI Payment',
      text: 'Create an interactive dining menu order workflow for table service that takes food preferences, generates an instant UPI payment link, and notifies the kitchen.'
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

  const handleGenerate = async () => {
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
          phoneNumberId: selectedLine || null,
          autoPublish
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
                Prompt-to-Workflow Generator Grounded in Real System APIs &amp; Inventory
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

        {/* Live Grounding Capability Pill Strip */}
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
          <span style={{ fontWeight: 600, color: '#475569' }}>Live Grounding Context:</span>
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
                  placeholder="e.g., Build a luxury resort room booking flow that checks live room tariffs, collects check-in & check-out dates, logs the booking lead in CRM, and schedules a 1-hour follow-up reminder..."
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
                  Quick Ideas &amp; Industry Blueprints:
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
                    <span>Assign Directly to Connected WhatsApp Line:</span>
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
                    {capabilities?.connectedLines?.map(line => (
                      <option key={line.phoneNumberId} value={line.phoneNumberId}>
                        {line.displayName} ({line.phoneNumber}) {line.isDefault ? '— Default Line' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748B', lineHeight: 1.4 }}>
                  Inbound messages arriving on the selected line will be routed with top priority to this newly generated flow.
                </p>
              </div>

              {/* Auto Publish Checkbox */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="auto_publish_chk"
                  checked={autoPublish}
                  onChange={e => setAutoPublish(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: '#2F5219', cursor: 'pointer' }}
                />
                <label htmlFor="auto_publish_chk" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  Auto-publish flow immediately (activates triggers and begins live execution)
                </label>
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

              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>
                Your generated workflow has been grounded with live catalog inventory and CRM pipelines, laid out hierarchically, and saved to your flows library.
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
                disabled={loading || !prompt.trim()}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: loading || !prompt.trim() ? '#94A3B8' : '#2F5219',
                  color: '#FFFFFF',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(47,82,25,0.25)'
                }}
              >
                {loading ? <RotateCcw size={16} className="spin" /> : <Sparkles size={16} color="#FDE047" />}
                <span>{loading ? 'Architecting Flow...' : 'Generate Workflow with AI'}</span>
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
