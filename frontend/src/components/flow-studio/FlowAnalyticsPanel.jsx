import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  PhoneCall,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Zap,
  ArrowRight,
  DollarSign,
  Layers,
  Check
} from 'lucide-react';

export default function FlowAnalyticsPanel({ flowId, token, onFlowUpdated }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  // AI Optimizer State
  const [recommendations, setRecommendations] = useState([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [applyingRecId, setApplyingRecId] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [appliedRecs, setAppliedRecs] = useState(new Set());

  const fetchAnalytics = useCallback(() => {
    if (!flowId) return;
    setLoading(true);
    fetch(`/api/flows/conversation-flows/${flowId}/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAnalytics(data.analytics);
        }
      })
      .catch(err => console.error('Failed to load analytics:', err))
      .finally(() => setLoading(false));
  }, [flowId, token, days]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const fetchAiOptimizations = () => {
    if (!flowId) return;
    setLoadingAi(true);
    setAiError(null);
    fetch(`/api/flows/conversation-flows/${flowId}/ai-optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRecommendations(data.recommendations || []);
        } else {
          setAiError(data.error || 'Failed to generate recommendations');
        }
      })
      .catch(err => setAiError(err.message))
      .finally(() => setLoadingAi(false));
  };

  const handleApplyOptimization = (rec) => {
    if (!flowId || applyingRecId) return;
    setApplyingRecId(rec.id);
    fetch(`/api/flows/conversation-flows/${flowId}/ai-optimize/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        recommendationId: rec.id,
        patch: rec.patch,
        patchType: rec.patchType
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAppliedRecs(prev => new Set([...prev, rec.id]));
          if (onFlowUpdated) onFlowUpdated();
          fetchAnalytics();
        } else {
          alert(`Could not apply optimization: ${data.error || 'Unknown error'}`);
        }
      })
      .catch(err => alert(`Error applying optimization: ${err.message}`))
      .finally(() => setApplyingRecId(null));
  };

  if (loading && !analytics) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#8E8E93' }}>
        <RotateCcw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
        <div>Loading journey analytics &amp; drop-off metrics...</div>
      </div>
    );
  }

  const funnel = analytics?.funnel;
  const kpis = funnel?.kpis || {
    totalEntries: analytics?.totalSessions || 0,
    totalCompletions: analytics?.completedSessions || 0,
    overallCompletionRate: analytics?.totalSessions > 0
      ? Math.round((analytics.completedSessions / analytics.totalSessions) * 100)
      : 0,
    totalDropoffs: analytics?.expiredSessions || 0,
    totalHandoffs: analytics?.handedOffSessions || 0,
    totalConversions: 0,
    totalRevenueInr: 0
  };

  const bottleneck = funnel?.bottleneckNode;
  const steps = funnel?.funnelSteps || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Filter & Status Strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Time Window:</span>
          {[7, 30, 90].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              style={{
                fontSize: '0.75rem',
                fontWeight: days === d ? 700 : 500,
                padding: '4px 10px',
                borderRadius: '6px',
                border: days === d ? '1px solid #16A34A' : '1px solid #CBD5E1',
                background: days === d ? '#DCFCE7' : '#FFFFFF',
                color: days === d ? '#15803D' : '#475569',
                cursor: 'pointer'
              }}
            >
              Last {d} Days
            </button>
          ))}
        </div>

        {funnel?.queryTimeMs !== undefined && (
          <div style={{
            fontSize: '0.72rem',
            color: '#16A34A',
            background: '#F0FDF4',
            padding: '3px 8px',
            borderRadius: '4px',
            border: '1px solid #DCFCE7',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Zap size={12} />
            <span>O(1) Daily Rollup ({funnel.queryTimeMs}ms)</span>
          </div>
        )}
      </div>

      {/* KPI Cards Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '12px'
      }}>
        <div style={{
          background: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Users size={14} color="#2563EB" /> Total Inbound Entries
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0F172A', marginTop: '6px' }}>
            {kpis.totalEntries}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
            Started conversations
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle2 size={14} color="#16A34A" /> Completed Enquiries
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16A34A', marginTop: '6px' }}>
            {kpis.totalCompletions}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 600, marginTop: '2px' }}>
            {kpis.overallCompletionRate}% Overall Rate
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <AlertTriangle size={14} color="#DC2626" /> Drop-offs &amp; Expiries
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#DC2626', marginTop: '6px' }}>
            {kpis.totalDropoffs}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600, marginTop: '2px' }}>
            Abandoned mid-flow
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <PhoneCall size={14} color="#7C3AED" /> Staff Handoffs
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7C3AED', marginTop: '6px' }}>
            {kpis.totalHandoffs}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
            Escalated to human agents
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '14px 16px',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <DollarSign size={14} color="#059669" /> Attributed Revenue
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', marginTop: '6px' }}>
            ₹{kpis.totalRevenueInr ? kpis.totalRevenueInr.toLocaleString('en-IN') : '0'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
            {kpis.totalConversions} Confirmed Deals
          </div>
        </div>
      </div>

      {/* Bottleneck Alert Banner */}
      {bottleneck && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: '10px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B' }}>
              Primary Bottleneck Detected: {bottleneck.title} ({bottleneck.nodeId})
            </div>
            <div style={{ fontSize: '0.78rem', color: '#B91C1C', marginTop: '4px' }}>
              {bottleneck.reason} <strong>{bottleneck.dropoffs} drop-offs</strong> recorded ({bottleneck.dropOffRate}% drop-off rate).
            </div>
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                onClick={fetchAiOptimizations}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Sparkles size={12} />
                <span>Fix Bottleneck with 1-Click AI Optimizer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step-by-Step Funnel Bars */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={16} color="#0284C7" /> Step-by-Step Funnel Progression
          </h4>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            Showing sequential flow steps &amp; drop-off ratios
          </span>
        </div>

        {steps.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: '#64748B', padding: '16px 0', textAlign: 'center' }}>
            No step progression metrics recorded in this time window yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {steps.map((step) => {
              const entries = step.entries || 0;
              const completions = step.completions || 0;
              const dropoffs = step.dropoffs || 0;
              const compPercent = entries > 0 ? Math.min(100, Math.round((completions / entries) * 100)) : 0;
              const dropPercent = entries > 0 ? Math.min(100, Math.round((dropoffs / entries) * 100)) : 0;

              return (
                <div key={step.nodeId} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: '#E2E8F0',
                        color: '#334155',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        #{step.stepIndex}
                      </span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', fontFamily: 'monospace' }}>
                        [{step.nodeType}]
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem' }}>
                      <span style={{ color: '#475569' }}>
                        <strong>{entries}</strong> entered
                      </span>
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>
                        {completions} advanced ({compPercent}%)
                      </span>
                      {dropoffs > 0 && (
                        <span style={{ color: '#DC2626', fontWeight: 600 }}>
                          {dropoffs} dropped ({dropPercent}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Visual Drop-off & Completion Bar */}
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#E2E8F0',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    display: 'flex'
                  }}>
                    <div style={{
                      width: `${compPercent}%`,
                      background: '#16A34A',
                      height: '100%',
                      transition: 'width 0.3s ease'
                    }} />
                    <div style={{
                      width: `${dropPercent}%`,
                      background: '#EF4444',
                      height: '100%',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1-Click AI Flow Optimizer Section */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} color="#7C3AED" /> 1-Click AI Flow Optimizer (Auto-Tuning)
            </h4>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
              Analyzes node drop-offs, message fatigue &amp; friction to generate instant high-converting improvements
            </div>
          </div>

          <button
            type="button"
            onClick={fetchAiOptimizations}
            disabled={loadingAi}
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#7C3AED',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} className={loadingAi ? 'spin' : ''} />
            <span>{loadingAi ? 'Analyzing Flow...' : 'Generate AI Optimizations'}</span>
          </button>
        </div>

        {aiError && (
          <div style={{ fontSize: '0.78rem', color: '#DC2626', background: '#FEF2F2', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
            {aiError}
          </div>
        )}

        {recommendations.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recommendations.map(rec => {
              const isApplied = appliedRecs.has(rec.id);
              const isApplying = applyingRecId === rec.id;

              return (
                <div key={rec.id} style={{
                  border: isApplied ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  background: isApplied ? '#F0FDF4' : '#FFFFFF',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: rec.category === 'HYBRID_INAPP' ? '#E0F2FE' : '#EDE9FE',
                        color: rec.category === 'HYBRID_INAPP' ? '#0369A1' : '#6D28D9'
                      }}>
                        {rec.category || 'IMPROVEMENT'}
                      </span>
                      <strong style={{ fontSize: '0.85rem', color: '#0F172A' }}>
                        {rec.title}
                      </strong>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
                      {rec.description}
                    </div>

                    {rec.expectedImpact && (
                      <div style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <TrendingUp size={12} /> Expected Impact: {rec.expectedImpact}
                      </div>
                    )}
                  </div>

                  <div>
                    {isApplied ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.78rem',
                        color: '#16A34A',
                        fontWeight: 600,
                        background: '#DCFCE7',
                        padding: '6px 12px',
                        borderRadius: '6px'
                      }}>
                        <Check size={14} /> Applied to Draft
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApplyOptimization(rec)}
                        disabled={isApplying}
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          padding: '7px 14px',
                          borderRadius: '6px',
                          background: '#16A34A',
                          color: '#FFFFFF',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Zap size={14} className={isApplying ? 'spin' : ''} />
                        <span>{isApplying ? 'Applying...' : 'Apply Optimization'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !loadingAi && (
            <div style={{ fontSize: '0.8rem', color: '#64748B', textAlign: 'center', padding: '16px 0' }}>
              Click <strong>"Generate AI Optimizations"</strong> above to inspect your flow's bottleneck drops and get 1-click conversion fixes.
            </div>
          )
        )}
      </div>
    </div>
  );
}
