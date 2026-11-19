import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  History,
  RefreshCw,
  Search,
  Clock,
  Database,
  Smartphone
} from 'lucide-react';

export default function FlowExecutionsModal({
  flowId,
  flowName,
  token,
  onClose
}) {
  const [executions, setExecutions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchPhone, setSearchPhone] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const activeToken = token || localStorage.getItem('token');
    return activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
  }, [token]);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchPhone.trim()) params.append('phone', searchPhone.trim());
      params.append('limit', '50');

      const url = flowId
        ? `/api/flows/conversation-flows/${flowId}/executions?${params.toString()}`
        : `/api/flows/executions?${params.toString()}`;

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) {
        setExecutions(data.executions || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch executions:', err);
    } finally {
      setLoading(false);
    }
  }, [flowId, statusFilter, searchPhone, getAuthHeaders]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  const loadSessionTrace = async (sessionId) => {
    setSelectedSessionId(sessionId);
    setLoadingDetail(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/flows/executions/${sessionId}`, { headers });
      const data = await res.json();
      if (data.success) {
        setSessionDetail(data);
      }
    } catch (err) {
      console.error('Failed to load session trace:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Active Session</span>;
      case 'COMPLETED':
        return <span style={{ background: '#DBEAFE', color: '#1D4ED8', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Completed</span>;
      case 'PAUSED_AGENT_HANDOFF':
        return <span style={{ background: '#FEF3C7', color: '#D97706', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Staff Handoff</span>;
      case 'EXPIRED':
        return <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Silent Expired</span>;
      case 'FAILED':
        return <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>Failed</span>;
      default:
        return <span style={{ background: '#F3F4F6', color: '#6B7280', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600 }}>{status}</span>;
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1050,
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '90vh',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#1C1C1E', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={20} color="#2F5219" />
              <span>Workflow Execution History & Event Traces</span>
            </h3>
            <div style={{ fontSize: '0.8rem', color: '#67676B', marginTop: '3px' }}>
              Auditable live session turns for {flowName ? `"${flowName}"` : 'All Workflows'} ({total} Recorded Sessions)
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#8E8E93', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          padding: '12px 24px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={14} color="#8E8E93" style={{ position: 'absolute', left: '10px', top: '10px' }} />
              <input
                type="text"
                placeholder="Search phone number..."
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '30px', fontSize: '0.82rem', height: '34px' }}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input"
              style={{ width: '150px', fontSize: '0.82rem', height: '34px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="PAUSED_AGENT_HANDOFF">Staff Handoff</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          <button
            type="button"
            onClick={fetchExecutions}
            className="btn btn-outline"
            style={{ padding: '6px 14px', fontSize: '0.8rem', gap: '6px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Modal Body: Two Column (List on left, Trace detail on right) */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Executions Table */}
          <div style={{ flex: 1, overflowY: 'auto', borderRight: '1px solid #E5E5E8', minWidth: '350px' }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#67676B' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px auto' }} />
                <div>Loading executions...</div>
              </div>
            ) : executions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#8E8E93' }}>
                <History size={32} style={{ margin: '0 auto 10px auto', opacity: 0.5 }} />
                <div>No execution sessions recorded yet.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {executions.map((sess) => {
                  const isSelected = selectedSessionId === sess.id;
                  return (
                    <div
                      key={sess.id}
                      onClick={() => loadSessionTrace(sess.id)}
                      style={{
                        padding: '12px 18px',
                        borderBottom: '1px solid #F2F2F7',
                        cursor: 'pointer',
                        background: isSelected ? '#F0FDF4' : '#FFFFFF',
                        borderLeft: isSelected ? '4px solid #2F5219' : '4px solid transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#1C1C1E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Smartphone size={13} color="#2F5219" />
                          <span>+{sess.sender_phone}</span>
                        </div>
                        {getStatusBadge(sess.session_status)}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#67676B' }}>
                        <span>Node: <code style={{ color: '#2F5219' }}>{sess.current_node_id}</code></span>
                        <span>{new Date(sess.last_interaction_at || sess.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Session Detail Trace Inspector */}
          <div style={{ flex: 1.2, overflowY: 'auto', padding: '20px', background: '#FAFAFB' }}>
            {!selectedSessionId ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#8E8E93' }}>
                <Clock size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                <div style={{ fontWeight: 600, color: '#1C1C1E', marginBottom: '4px' }}>Select an execution session</div>
                <div style={{ fontSize: '0.82rem' }}>Click any turn on the left to inspect step-by-step trace events, collected variables, and replies.</div>
              </div>
            ) : loadingDetail ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#67676B' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px auto' }} />
                <div>Loading audit events trace...</div>
              </div>
            ) : sessionDetail ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Session Summary Card */}
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1C1C1E' }}>
                      Session #{sessionDetail.session.id} Details
                    </div>
                    {getStatusBadge(sessionDetail.session.session_status)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', fontSize: '0.78rem' }}>
                    <div><span style={{ color: '#8E8E93' }}>Phone:</span> +{sessionDetail.session.sender_phone}</div>
                    <div><span style={{ color: '#8E8E93' }}>Flow:</span> {sessionDetail.session.flow_name || 'Standard'} (v{sessionDetail.session.version_number || 1})</div>
                    <div><span style={{ color: '#8E8E93' }}>Current Node:</span> <code>{sessionDetail.session.current_node_id}</code></div>
                    <div><span style={{ color: '#8E8E93' }}>Expires At:</span> {sessionDetail.session.expires_at ? new Date(sessionDetail.session.expires_at).toLocaleTimeString() : 'N/A'}</div>
                  </div>
                </div>

                {/* Collected Variables Card */}
                <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '8px', border: '1px solid #E5E5E8' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1C1C1E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Database size={14} color="#2F5219" />
                    <span>Collected Session Variables</span>
                  </div>
                  {Object.keys(sessionDetail.session.collected_data || {}).length === 0 ? (
                    <div style={{ fontSize: '0.76rem', color: '#8E8E93' }}>No variables collected yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(sessionDetail.session.collected_data || {}).map(([k, v]) => (
                        <div key={k} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.74rem' }}>
                          <span style={{ fontWeight: 600, color: '#166534' }}>{k}:</span> <span style={{ color: '#15803D' }}>{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Event Audit Trail */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#1C1C1E', marginBottom: '10px' }}>
                    Event Audit Trace ({sessionDetail.events?.length || 0} Steps)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(sessionDetail.events || []).map((ev, idx) => (
                      <div key={ev.id || idx} style={{
                        background: '#FFFFFF',
                        border: '1px solid #E5E5E8',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
                              #{idx + 1}
                            </span>
                            <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1C1C1E' }}>
                              [{ev.node_type}] {ev.node_id}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#8E8E93' }}>
                            {new Date(ev.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        {ev.payload?.accumulatedReplies && ev.payload.accumulatedReplies.length > 0 && (
                          <div style={{
                            background: '#F9FAFB',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            fontSize: '0.76rem',
                            color: '#374151',
                            whiteSpace: 'pre-line',
                            borderLeft: '3px solid #2F5219'
                          }}>
                            {ev.payload.accumulatedReplies.join('\n\n')}
                          </div>
                        )}
                      </div>
                    ))}
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
