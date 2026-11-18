import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  PhoneCall,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

export default function FlowAnalyticsPanel({ flowId, token }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!flowId) return;
    setLoading(true);
    fetch(`/api/flows/conversation-flows/${flowId}/analytics`, {
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
  }, [flowId, token]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#8E8E93' }}>
        <RotateCcw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
        <div>Loading journey analytics...</div>
      </div>
    );
  }

  if (!analytics) return null;

  const completionRate = analytics.totalSessions > 0
    ? Math.round((analytics.completedSessions / analytics.totalSessions) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.76rem', color: '#67676B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} color="#2F5219" /> Total Sessions
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1C1C1E', marginTop: '6px' }}>
            {analytics.totalSessions}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#8E8E93', marginTop: '4px' }}>
            Customer interactions triggered
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.76rem', color: '#67676B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} color="#16A34A" /> Completed Enquiries
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#16A34A', marginTop: '6px' }}>
            {analytics.completedSessions}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#16A34A', fontWeight: 600, marginTop: '4px' }}>
            {completionRate}% Completion Rate
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.76rem', color: '#67676B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PhoneCall size={14} color="#2563EB" /> Staff Handoffs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563EB', marginTop: '6px' }}>
            {analytics.handedOffSessions}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#8E8E93', marginTop: '4px' }}>
            Transferred to front-desk agents
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid #E5E5E8',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '0.76rem', color: '#67676B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} color="#D97706" /> In-Progress Sessions
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#D97706', marginTop: '6px' }}>
            {analytics.activeSessions}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#8E8E93', marginTop: '4px' }}>
            Active customer conversations
          </div>
        </div>
      </div>

      {/* Funnel & Dropoff Breakdown */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E5E5E8',
        padding: '20px'
      }}>
        <h4 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 14px 0', color: '#1C1C1E' }}>
          Drop-off Points by Node
        </h4>
        {analytics.dropoffByNode?.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: '#67676B', padding: '16px 0' }}>
            No abandonment drop-offs recorded. Stays & inquiries are converting smoothly!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {analytics.dropoffByNode.map((d, i) => (
              <div key={d.current_node_id || i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '0.82rem'
              }}>
                <span style={{ width: '180px', fontFamily: 'monospace', color: '#48484A' }}>
                  {d.current_node_id}
                </span>
                <div style={{ flex: 1, background: '#F2F2F7', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(10, d.count * 15))}%`,
                    background: '#DC2626',
                    height: '100%',
                    borderRadius: '6px'
                  }} />
                </div>
                <span style={{ width: '60px', textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                  {d.count} drop
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
