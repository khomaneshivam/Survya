import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  ExternalLink,
  Zap,
  Link2,
  Receipt,
  X,
  Phone,
  Layers,
  ShoppingBag,
  RefreshCw,
  Send,
  AlertTriangle,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export default function InboxCommerceDrawer({
  customerPhone,
  customerName,
  isOpen,
  onClose,
  onInsertMessage,
  onOpenFlowModal,
  token
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Quick Pay Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payItemId, setPayItemId] = useState('');
  const [payCustomAmount, setPayCustomAmount] = useState('');
  const [payTitle, setPayTitle] = useState('');
  const [submittingPay, setSubmittingPay] = useState(false);

  // Offline Payment Modal
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [offlineTxnId, setOfflineTxnId] = useState(null);
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineMethod, setOfflineMethod] = useState('CASH');
  const [submittingOffline, setSubmittingOffline] = useState(false);

  // 1. Fetch drawer context
  const fetchDrawerContext = useCallback(async () => {
    if (!customerPhone) return;
    try {
      setLoading(true);
      const cleanPhone = String(customerPhone).replace(/\D/g, '');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/v1/transactions/drawer-context/${cleanPhone}`, { headers });
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (e) {
      console.warn('Failed to load commerce drawer context:', e);
    } finally {
      setLoading(false);
    }
  }, [customerPhone, token]);

  useEffect(() => {
    if (isOpen && customerPhone) {
      fetchDrawerContext();
    }
  }, [isOpen, customerPhone, fetchDrawerContext]);

  // 2. Active Hold Countdown Timer
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);

  useEffect(() => {
    if (!data?.activeHold?.expires_at) {
      setHoldSecondsLeft(0);
      return;
    }

    const calcLeft = () => {
      const expTime = new Date(data.activeHold.expires_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expTime - now) / 1000));
      setHoldSecondsLeft(diff);
    };

    calcLeft();
    const timer = setInterval(calcLeft, 1000);
    return () => clearInterval(timer);
  }, [data?.activeHold]);

  const holdMinutes = Math.floor(holdSecondsLeft / 60);
  const holdSeconds = holdSecondsLeft % 60;

  // 3. Quick Action 1: Create Quick Payment Link
  const handleCreatePaymentLink = async (e) => {
    e.preventDefault();
    try {
      setSubmittingPay(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const cleanPhone = String(customerPhone).replace(/\D/g, '');

      const res = await fetch('/api/v1/transactions/quick-link', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          customerPhone: cleanPhone,
          customerName: customerName || 'Valued Customer',
          itemId: payItemId || null,
          amount: payCustomAmount ? Number(payCustomAmount) : null,
          title: payTitle || (payItemId ? 'Item Purchase' : 'Payment')
        })
      });

      const resData = await res.json();
      if (resData.success) {
        setShowPayModal(false);
        setPayItemId('');
        setPayCustomAmount('');
        setPayTitle('');
        setFeedback('Payment link generated!');

        // Insert payment link directly into chat reply box
        if (onInsertMessage && resData.paymentLinkUrl) {
          const fullLink = window.location.origin + resData.paymentLinkUrl;
          onInsertMessage(
            `Hi ${customerName || 'there'}! Here is your secure payment link for ₹${Number(resData.quote?.grandTotal || payCustomAmount).toLocaleString('en-IN')}:\n👉 ${fullLink}\n\nPlease complete to confirm.`
          );
        }
        fetchDrawerContext();
      } else {
        alert(resData.message || 'Failed to create payment link');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingPay(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // 4. Quick Action 2: Confirm / Mark Paid
  const handleConfirmOfflinePayment = async (e) => {
    e.preventDefault();
    if (!offlineTxnId || !offlineAmount) return;

    try {
      setSubmittingOffline(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/v1/transactions/${offlineTxnId}/record-offline-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: Number(offlineAmount),
          paymentMethod: offlineMethod,
          notes: 'Marked paid from Inbox Commerce Drawer'
        })
      });

      const resData = await res.json();
      if (resData.success) {
        setShowOfflineModal(false);
        setOfflineTxnId(null);
        setOfflineAmount('');
        setFeedback('Payment recorded successfully!');
        fetchDrawerContext();
      } else {
        alert(resData.message || 'Failed to record payment');
      }
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingOffline(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // 5. Quick Action 4: Drop In-App /x/ link
  const handleSendInappLink = () => {
    const cleanPhone = String(customerPhone).replace(/\D/g, '');
    const inappUrl = `${window.location.origin}/public/x/experience?phone=${cleanPhone}`;
    if (onInsertMessage) {
      onInsertMessage(
        `Hi ${customerName || 'there'}! Tap this interactive link to browse live availability, custom add-ons & instant quotation directly:\n👉 ${inappUrl}`
      );
      setFeedback('In-App experience link added to chat input!');
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  if (!isOpen) return null;

  const latestTxn = data?.latestTransaction;
  const activeHold = data?.activeHold;
  const txns = data?.transactions || [];

  return (
    <aside style={{
      width: '340px',
      borderLeft: '1px solid #E5E5E8',
      background: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
      zIndex: 10,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid #EEEEF0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#F8FAF5'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: '#EDF4E6',
            color: '#2F5219',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Receipt size={16} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 800, color: '#171719' }}>
              Commerce & Actions
            </h4>
            <div style={{ fontSize: '0.7rem', color: '#67676B' }}>
              +{customerPhone}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={fetchDrawerContext}
            style={{ background: 'none', border: 'none', color: '#96969C', cursor: 'pointer', padding: '4px' }}
            title="Refresh Commerce Data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#96969C', cursor: 'pointer', padding: '4px' }}
            title="Close Drawer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {feedback && (
        <div style={{
          background: '#EDF4E6',
          color: '#2F5219',
          padding: '8px 12px',
          fontSize: '0.75rem',
          fontWeight: 700,
          borderBottom: '1px solid #C3D1AC',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <CheckCircle2 size={13} />
          <span>{feedback}</span>
        </div>
      )}

      {/* Drawer Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* 4 1-CLICK REVENUE ACTION BUTTONS */}
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
            ⚡ Instant Revenue Actions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Button 1: Send Payment Link */}
            <button
              type="button"
              onClick={() => {
                if (latestTxn && latestTxn.payment_status !== 'PAID') {
                  setPayCustomAmount(String(latestTxn.balance_due || latestTxn.grand_total));
                  setPayTitle(`Invoice ${latestTxn.reference_code}`);
                }
                setShowPayModal(true);
              }}
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#15803D',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                textAlign: 'left'
              }}
            >
              <CreditCard size={14} />
              <span>💳 Send Link</span>
            </button>

            {/* Button 2: Confirm / Mark Paid */}
            <button
              type="button"
              disabled={!latestTxn || latestTxn.payment_status === 'PAID'}
              onClick={() => {
                if (latestTxn) {
                  setOfflineTxnId(latestTxn.id);
                  setOfflineAmount(String(latestTxn.balance_due || latestTxn.grand_total));
                  setShowOfflineModal(true);
                }
              }}
              style={{
                background: latestTxn && latestTxn.payment_status !== 'PAID' ? '#EFF6FF' : '#F4F4F5',
                border: `1px solid ${latestTxn && latestTxn.payment_status !== 'PAID' ? '#BFDBFE' : '#E4E4E7'}`,
                color: latestTxn && latestTxn.payment_status !== 'PAID' ? '#1D4ED8' : '#A1A1AA',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: latestTxn && latestTxn.payment_status !== 'PAID' ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={14} />
              <span>✅ Mark Paid</span>
            </button>

            {/* Button 3: Trigger Flow */}
            <button
              type="button"
              onClick={() => {
                if (onOpenFlowModal) onOpenFlowModal();
              }}
              style={{
                background: '#FAF5FF',
                border: '1px solid #E9D5FF',
                color: '#7E22CE',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Zap size={14} />
              <span>⚡ Trigger Flow</span>
            </button>

            {/* Button 4: Send In-App Link */}
            <button
              type="button"
              onClick={handleSendInappLink}
              style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#B45309',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Link2 size={14} />
              <span>🔗 Send /x/ App</span>
            </button>
          </div>
        </div>

        {/* ACTIVE INVENTORY HOLD TIMER */}
        {activeHold && (
          <div style={{
            background: holdSecondsLeft > 300 ? '#EDF4E6' : '#FEF3C7',
            border: `1.5px solid ${holdSecondsLeft > 300 ? '#C3D1AC' : '#FDE68A'}`,
            borderRadius: '10px',
            padding: '12px',
            fontSize: '0.8rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ fontWeight: 700, color: holdSecondsLeft > 300 ? '#2F5219' : '#B45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={14} />
                <span>Active 15m Hold</span>
              </div>
              <span style={{
                fontFamily: 'monospace',
                fontWeight: 800,
                background: '#FFFFFF',
                padding: '2px 6px',
                borderRadius: '4px',
                color: holdSecondsLeft > 300 ? '#2F5219' : '#DC2626',
                border: '1px solid #D4D4D9'
              }}>
                {holdMinutes}:{String(holdSeconds).padStart(2, '0')}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#3A3A3E' }}>
              Holding: <strong>{activeHold.item_title || `Item #${activeHold.catalog_item_id}`}</strong> (Qty: {activeHold.quantity})
            </div>
          </div>
        )}

        {/* LATEST TRANSACTION SUMMARY */}
        {latestTxn ? (
          <div style={{
            background: '#F8FAF5',
            border: '1px solid #E5E5E8',
            borderRadius: '10px',
            padding: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, fontFamily: 'monospace', color: '#171719' }}>
                {latestTxn.reference_code}
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: latestTxn.payment_status === 'PAID' ? '#EDF4E6' : '#FEE2E2',
                color: latestTxn.payment_status === 'PAID' ? '#2F5219' : '#991B1B'
              }}>
                {latestTxn.payment_status}
              </span>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#67676B', marginBottom: '8px' }}>
              Type: <strong style={{ color: '#171719' }}>{latestTxn.transaction_type}</strong> | Branch: <strong style={{ color: '#171719' }}>{latestTxn.location_name || 'Main'}</strong>
              {latestTxn.service_date && <div>Date: <strong>{latestTxn.service_date}</strong></div>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: '8px', borderTop: '1px solid #EEEEF0' }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: '#67676B' }}>Total: </span>
                <strong style={{ fontSize: '0.875rem', color: '#171719' }}>₹{Number(latestTxn.grand_total).toLocaleString('en-IN')}</strong>
              </div>
              <a
                href={`/api/v1/public/receipt/${latestTxn.reference_code}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: '#2F5219', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
              >
                <span>Receipt</span> <ExternalLink size={11} />
              </a>
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px', background: '#F8F9FA', borderRadius: '10px', textAlign: 'center', fontSize: '0.78rem', color: '#96969C' }}>
            No recent transactions for this customer.
          </div>
        )}

        {/* PAST TRANSACTIONS HISTORY */}
        {txns.length > 1 && (
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#67676B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
              📜 Previous History ({txns.length - 1})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {txns.slice(1).map(t => (
                <div key={t.id} style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #EEEEF0',
                  background: '#FFFFFF',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.75rem'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{t.reference_code}</div>
                    <div style={{ fontSize: '0.68rem', color: '#96969C' }}>{new Date(t.created_at).toLocaleDateString('en-IN')}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>₹{Number(t.grand_total).toLocaleString('en-IN')}</strong>
                    <div style={{ fontSize: '0.68rem', color: t.payment_status === 'PAID' ? '#059669' : '#B45309' }}>{t.payment_status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* QUICK PAYMENT MODAL */}
      {showPayModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1060,
          padding: '16px'
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '380px', padding: '20px', border: '1px solid #E5E5E8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>💳 Send Payment Link</h4>
              <button type="button" onClick={() => setShowPayModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#96969C' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreatePaymentLink} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Pick Catalog Item (Optional)</label>
                <select
                  value={payItemId}
                  onChange={e => {
                    setPayItemId(e.target.value);
                    const it = (data?.catalogItems || []).find(i => String(i.id) === e.target.value);
                    if (it) {
                      setPayCustomAmount(String(it.base_price));
                      setPayTitle(it.title);
                    }
                  }}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D4D4D9', fontSize: '0.8rem' }}
                >
                  <option value="">-- Custom Amount --</option>
                  {(data?.catalogItems || []).map(ci => (
                    <option key={ci.id} value={ci.id}>{ci.title} (₹{ci.base_price})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 500"
                  value={payCustomAmount}
                  onChange={e => setPayCustomAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D4D4D9', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Payment Description</label>
                <input
                  type="text"
                  placeholder="e.g. Advance Deposit / Consultation"
                  value={payTitle}
                  onChange={e => setPayTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D4D4D9', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowPayModal(false)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingPay} className="btn btn-action-green" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  {submittingPay ? 'Generating...' : 'Generate & Insert Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFLINE PAYMENT MODAL */}
      {showOfflineModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1060,
          padding: '16px'
        }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '360px', padding: '20px', border: '1px solid #E5E5E8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>✅ Confirm / Mark Paid</h4>
              <button type="button" onClick={() => setShowOfflineModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#96969C' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmOfflinePayment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Amount Paid (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={offlineAmount}
                  onChange={e => setOfflineAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D4D4D9', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>Payment Mode</label>
                <select
                  value={offlineMethod}
                  onChange={e => setOfflineMethod(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D4D4D9', fontSize: '0.8rem' }}
                >
                  <option value="CASH">Cash (Front Desk / Staff)</option>
                  <option value="UPI">Direct UPI QR</option>
                  <option value="CARD_POS">Card Swiped (POS)</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowOfflineModal(false)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Cancel
                </button>
                <button type="submit" disabled={submittingOffline} className="btn btn-action-green" style={{ padding: '6px 16px', fontSize: '0.8rem' }}>
                  {submittingOffline ? 'Confirming...' : 'Mark Confirmed'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
