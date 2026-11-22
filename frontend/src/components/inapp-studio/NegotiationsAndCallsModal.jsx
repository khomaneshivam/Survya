import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, Button, Badge, Skeleton, DataTable } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import {
  MessageSquareDiff,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

export default function NegotiationsAndCallsModal({
  isOpen,
  onClose,
  token,
  toast
}) {
  const [activeTab, setActiveTab] = useState('negotiations'); // 'negotiations' | 'calls'
  const [negotiations, setNegotiations] = useState([]);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counterModalOpen, setCounterModalOpen] = useState(false);
  const [selectedNeg, setSelectedNeg] = useState(null);
  const [counterPrice, setCounterPrice] = useState('');
  const [agentNote, setAgentNote] = useState('');
  const [acting, setActing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders(token);
      const [negRes, callRes] = await Promise.all([
        fetch('/api/v1/inapp/negotiations', { headers }),
        fetch('/api/v1/inapp/calls', { headers })
      ]);
      const negData = await negRes.json();
      const callData = await callRes.json();
      if (negData.success) setNegotiations(negData.data || []);
      if (callData.success) setCalls(callData.data || []);
    } catch (err) {
      console.warn('[NegotiationsAndCallsModal] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleAgentAction = async (negotiationId, action, extra = {}) => {
    setActing(true);
    try {
      const res = await fetch(`/api/v1/inapp/negotiations/${negotiationId}/agent-action`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action, ...extra })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Negotiation ${action.toLowerCase()}ed successfully`);
        setCounterModalOpen(false);
        loadData();
      } else {
        alert(data.message || 'Action failed');
      }
    } catch (err) {
      alert(err.message || 'Error processing action');
    } finally {
      setActing(false);
    }
  };

  const handleUpdateCall = async (callId, status) => {
    try {
      const res = await fetch(`/api/v1/inapp/calls/${callId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Call marked as ${status.toLowerCase()}`);
        loadData();
      }
    } catch (err) {
      alert(err.message || 'Error updating call');
    }
  };

  const negotiationColumns = useMemo(() => [
    {
      header: 'Item / Experience',
      accessor: 'item_title',
      cell: (neg) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>{neg.item_title}</span>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{neg.experience_name}</span>
        </div>
      )
    },
    {
      header: 'Offer vs List',
      cell: (neg) => {
        const base = Number(neg.base_unit_price || 0);
        const offer = Number(neg.customer_offer_price || 0);
        const discount = base > 0 ? Math.round(((base - offer) / base) * 100) : 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontWeight: 700, color: '#0F172A' }} className="tabular-nums">
              ₹{offer.toLocaleString('en-IN')} <span style={{ fontSize: '0.72rem', color: '#16A34A' }}>({discount}% OFF)</span>
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }} className="tabular-nums">
              List: ₹{base.toLocaleString('en-IN')} • Qty: {neg.quantity}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Visitor',
      accessor: 'visitor_name',
      cell: (neg) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{neg.visitor_name || 'Guest'}</span>
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>{neg.visitor_phone || '—'}</span>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (neg) => {
        const isPending = neg.status === 'PENDING_AGENT';
        return (
          <Badge variant={isPending ? 'warning' : (neg.status === 'AUTO_APPROVED' || neg.status === 'ACCEPTED' ? 'success' : 'default')}>
            {neg.status}
          </Badge>
        );
      }
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (neg) => {
        const isPending = neg.status === 'PENDING_AGENT';
        const base = Number(neg.base_unit_price || 0);
        const offer = Number(neg.customer_offer_price || 0);
        if (!isPending) return <span style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Resolved</span>;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleAgentAction(neg.id, 'APPROVE')}
              disabled={acting}
            >
              <CheckCircle2 size={13} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedNeg(neg);
                setCounterPrice(Math.round((base + offer) / 2));
                setCounterModalOpen(true);
              }}
            >
              Counter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAgentAction(neg.id, 'REJECT')}
              disabled={acting}
              style={{ color: '#ef4444' }}
            >
              <XCircle size={13} />
            </Button>
          </div>
        );
      }
    }
  ], [acting, handleAgentAction]);

  const callColumns = useMemo(() => [
    {
      header: 'Visitor & Contact',
      cell: (call) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>{call.visitor_name || 'Customer'}</span>
          <span style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: '#64748B' }}>{call.visitor_phone}</span>
        </div>
      )
    },
    {
      header: 'Topic & Type',
      cell: (call) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge variant="default">{call.call_type}</Badge>
          <span style={{ fontSize: '0.76rem', color: '#334155' }}>{call.topic}</span>
        </div>
      )
    },
    {
      header: 'Time / Slot',
      cell: (call) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '0.75rem', color: '#0F172A' }}>{call.preferred_slot_at || 'Immediate'}</span>
          <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
            {new Date(call.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (call) => (
        <Badge variant={call.status === 'QUEUED' ? 'warning' : (call.status === 'COMPLETED' || call.status === 'CALLED' ? 'success' : 'default')}>
          {call.status}
        </Badge>
      )
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (call) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
          <a
            href={`tel:${call.visitor_phone}`}
            style={{
              padding: '4px 8px',
              borderRadius: '5px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <PhoneCall size={11} /> Call
          </a>
          {call.status === 'QUEUED' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleUpdateCall(call.id, 'CALLED')}
            >
              <CheckCircle2 size={12} />
            </Button>
          )}
        </div>
      )
    }
  ], [handleUpdateCall]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Live Rate Negotiations & Callbacks"
      maxWidth="800px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Sub-Header Tabs & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('negotiations')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'negotiations' ? 'var(--sarvya-blue)' : '#f1f5f9',
                color: activeTab === 'negotiations' ? '#ffffff' : '#334155',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <MessageSquareDiff size={15} />
              <span>Rate Negotiations ({negotiations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calls')}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'calls' ? 'var(--sarvya-blue)' : '#f1f5f9',
                color: activeTab === 'calls' ? '#ffffff' : '#334155',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <PhoneCall size={15} />
              <span>Callbacks & Calls ({calls.length})</span>
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>

        {/* Content Panel */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton style={{ height: '70px', borderRadius: '8px' }} />
            <Skeleton style={{ height: '70px', borderRadius: '8px' }} />
          </div>
        ) : activeTab === 'negotiations' ? (
          <DataTable
            density="compact"
            columns={negotiationColumns}
            data={negotiations}
            rows={negotiations}
            emptyTitle="No Negotiations"
            emptyMessage="No active rate negotiations recorded yet."
          />
        ) : (
          <DataTable
            density="compact"
            columns={callColumns}
            data={calls}
            rows={calls}
            emptyTitle="No Callback Requests"
            emptyMessage="No callback requests logged yet."
          />
        )}

        {/* Counter Offer Modal */}
        {counterModalOpen && selectedNeg && (
          <Modal
            isOpen={counterModalOpen}
            onClose={() => setCounterModalOpen(false)}
            title={`Counter-Offer for ${selectedNeg.item_title}`}
            maxWidth="450px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                Customer offered <strong>₹{Number(selectedNeg.customer_offer_price).toLocaleString('en-IN')}</strong> against base price of ₹{Number(selectedNeg.base_unit_price).toLocaleString('en-IN')}.
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Counter Price (₹) *</label>
                <input
                  type="number"
                  value={counterPrice}
                  onChange={(e) => setCounterPrice(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Manager Note for Customer</label>
                <input
                  type="text"
                  placeholder="e.g. Best price with free breakfast included!"
                  value={agentNote}
                  onChange={(e) => setAgentNote(e.target.value)}
                  style={{ width: '100%', height: '38px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <Button variant="secondary" onClick={() => setCounterModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={acting || !counterPrice}
                  onClick={() => handleAgentAction(selectedNeg.id, 'COUNTER', { counterPrice, agentNote })}
                >
                  Send Counter to Customer
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Modal>
  );
}

