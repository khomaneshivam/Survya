import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Badge, Skeleton } from '../ui';
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
          negotiations.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              No active rate negotiations recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {negotiations.map((neg) => {
                const base = Number(neg.base_unit_price || 0);
                const offer = Number(neg.customer_offer_price || 0);
                const discount = base > 0 ? Math.round(((base - offer) / base) * 100) : 0;
                const isPending = neg.status === 'PENDING_AGENT';

                return (
                  <div
                    key={neg.id}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {neg.item_title}
                        </span>
                        <Badge variant={isPending ? 'warning' : (neg.status === 'AUTO_APPROVED' || neg.status === 'ACCEPTED' ? 'success' : 'default')}>
                          {neg.status}
                        </Badge>
                      </div>

                      <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                        Customer Offer: <strong>₹{offer.toLocaleString('en-IN')}</strong> (List: ₹{base.toLocaleString('en-IN')} • {discount}% OFF) • Qty: {neg.quantity}
                      </div>

                      <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                        Visitor: {neg.visitor_name || 'Guest'} {neg.visitor_phone ? `(${neg.visitor_phone})` : ''} • Experience: {neg.experience_name}
                      </div>
                    </div>

                    {isPending && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleAgentAction(neg.id, 'APPROVE')}
                          disabled={acting}
                        >
                          <CheckCircle2 size={14} /> Approve
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
                          <XCircle size={14} /> Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          calls.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              No callback requests logged yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {calls.map((call) => (
                <div
                  key={call.id}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {call.visitor_name || 'Customer'} — {call.visitor_phone}
                      </span>
                      <Badge variant={call.status === 'QUEUED' ? 'warning' : (call.status === 'COMPLETED' || call.status === 'CALLED' ? 'success' : 'default')}>
                        {call.status}
                      </Badge>
                      <Badge variant="default">{call.call_type}</Badge>
                    </div>

                    <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '3px' }}>
                      Topic: <strong>{call.topic}</strong> {call.preferred_slot_at ? `• Preferred Slot: ${call.preferred_slot_at}` : ''}
                    </div>

                    <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                      Logged: {new Date(call.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST) • Experience: {call.experience_name}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a
                      href={`tel:${call.visitor_phone}`}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <PhoneCall size={12} /> Call
                    </a>
                    {call.status === 'QUEUED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleUpdateCall(call.id, 'CALLED')}
                      >
                        <CheckCircle2 size={13} /> Mark Called
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
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

