import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingDown,
  ShieldAlert,
  Loader2,
  MessageSquare,
  PhoneCall
} from 'lucide-react';

export default function RateNegotiationScreen({
  experience = {},
  item = {},
  sessionToken,
  slug,
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';

  const basePrice = Number(item.price || item.basePrice || 5000);
  const [quantity, setQuantity] = useState(1);
  const [offerPrice, setOfferPrice] = useState(Math.round(basePrice * 0.9));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Negotiation State from API or SSE
  const [negotiation, setNegotiation] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const subtotal = offerPrice * quantity;
  const taxRate = Number(item.taxRate || 18);
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const grandTotal = subtotal + taxAmount;
  const savings = Math.max(0, (basePrice - offerPrice) * quantity);
  const discountPercent = Math.max(0, Math.round(((basePrice - offerPrice) / basePrice) * 100));

  // Handle SSE listener for real-time manager updates
  useEffect(() => {
    if (!sessionToken || !slug) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/v1/public/x/${slug}/stream?sessionToken=${sessionToken}`);
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'negotiation_updated' && parsed.data) {
            setNegotiation((prev) => ({
              ...prev,
              ...parsed.data
            }));
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [sessionToken, slug]);

  const handleSubmitOffer = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/public/x/${slug}/negotiations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          catalogItemId: item.id,
          quantity,
          customerOfferPrice: offerPrice,
          notes
        })
      });
      const data = await res.json();
      if (data.success) {
        setNegotiation(data);
        setStatusMessage(data.message);
      } else {
        alert(data.message || 'Failed to submit offer');
      }
    } catch (err) {
      alert(err.message || 'Network error submitting offer');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptFinal = async () => {
    if (!negotiation?.negotiationId) {
      onAction && onAction('NEXT');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/public/x/${slug}/negotiations/${negotiation.negotiationId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          response: 'ACCEPT'
        })
      });
      const data = await res.json();
      if (data.success) {
        onAction && onAction('NEXT', {
          negotiationId: negotiation.negotiationId,
          negotiatedPrice: negotiation.approvedFinalPrice || negotiation.agentCounterPrice,
          dealValue: data.grandTotal
        });
      }
    } catch (err) {
      alert(err.message || 'Failed to accept rate');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustToMin = () => {
    if (negotiation?.suggestedMinPrice) {
      setOfferPrice(negotiation.suggestedMinPrice);
      setNegotiation(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '18px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: primaryColor, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
          <Sparkles size={14} />
          <span>Interactive Rate Discussion</span>
        </div>
        <h1 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
          Discuss Rate for {item.title || 'Selected Item'}
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
          Make a fair offer. Our automated rate manager or on-duty concierge will review it instantly.
        </p>
      </div>

      {/* Item Summary Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderRadius: '12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0'
        }}
      >
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>{item.title}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Standard Base Rate: ₹{basePrice.toLocaleString('en-IN')}</div>
        </div>
        {/* Quantity Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Qty:</span>
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
          >
            -
          </button>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
          >
            +
          </button>
        </div>
      </div>

      {/* Real-time Status Card (If negotiation active) */}
      {negotiation?.status === 'AUTO_APPROVED' ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #10b981',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            textAlign: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#059669', fontSize: '15px', fontWeight: 800 }}>
            <CheckCircle2 size={20} />
            <span>Offer Auto-Approved!</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#065f46' }}>
            ₹{negotiation.approvedFinalPrice?.toLocaleString('en-IN')} <span style={{ fontSize: '12px', fontWeight: 500 }}>/ unit</span>
          </div>
          <div style={{ fontSize: '12.5px', color: '#047857' }}>
            Grand Total (incl. 18% GST): <strong>₹{negotiation.grandTotal?.toLocaleString('en-IN')}</strong>
          </div>
          <button
            type="button"
            onClick={handleAcceptFinal}
            style={{
              marginTop: '4px',
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#059669',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>Accept Rate & Continue</span>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : negotiation?.status === 'AGENT_COUNTERED' ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#eff6ff',
            border: '1.5px solid #3b82f6',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            textAlign: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#1d4ed8', fontSize: '14px', fontWeight: 800 }}>
            <MessageSquare size={18} />
            <span>Manager Counter-Offer Received</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#1e40af' }}>
            ₹{negotiation.agentCounterPrice?.toLocaleString('en-IN')}
          </div>
          {negotiation.agentNote && (
            <p style={{ margin: 0, fontSize: '12.5px', color: '#1e3a8a', fontStyle: 'italic' }}>
              &ldquo;{negotiation.agentNote}&rdquo;
            </p>
          )}
          <button
            type="button"
            onClick={handleAcceptFinal}
            style={{
              marginTop: '4px',
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>Accept Counter & Lock Rate</span>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : negotiation?.status === 'PENDING_AGENT' ? (
        <div
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#fffbeb',
            border: '1.5px solid #f59e0b',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            textAlign: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#b45309', fontSize: '14px', fontWeight: 800 }}>
            <Clock size={18} className="animate-pulse" />
            <span>Reviewing with Duty Manager...</span>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#92400e', lineHeight: 1.4 }}>
            Your offer of <strong>₹{offerPrice.toLocaleString('en-IN')}</strong> is under review. You will receive an instant update here as soon as approved.
          </p>
        </div>
      ) : negotiation?.status === 'OFFER_TOO_LOW' ? (
        <div
          style={{
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fca5a5',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '13px', fontWeight: 700 }}>
            <ShieldAlert size={16} />
            <span>Offer Below Floor Threshold</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#991b1b', lineHeight: 1.4 }}>
            {statusMessage || `We cannot accept offers below ₹${negotiation.suggestedMinPrice}.`}
          </p>
          <button
            type="button"
            onClick={handleAdjustToMin}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              alignSelf: 'flex-start'
            }}
          >
            Adjust to ₹{negotiation.suggestedMinPrice}
          </button>
        </div>
      ) : null}

      {/* Interactive Offer Slider & Input (Shown if not yet accepted) */}
      {(!negotiation || negotiation.status === 'PENDING_AGENT' || negotiation.status === 'OFFER_TOO_LOW') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="negotiation_offer_input" style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
              Your Offered Rate per Unit
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>₹</span>
              <input
                id="negotiation_offer_input"
                type="number"
                value={offerPrice}
                onChange={(e) => setOfferPrice(Number(e.target.value) || 0)}
                style={{
                  width: '100px',
                  height: '36px',
                  padding: '0 8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: primaryColor,
                  textAlign: 'right'
                }}
              />
            </div>
          </div>

          {/* Interactive Range Slider */}
          <input
            type="range"
            min={Math.round(basePrice * 0.5)}
            max={basePrice}
            step={basePrice > 10000 ? 500 : 50}
            value={offerPrice}
            onChange={(e) => setOfferPrice(Number(e.target.value))}
            style={{ width: '100%', accentColor: primaryColor }}
          />

          {/* Savings Badge */}
          {savings > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#059669',
                backgroundColor: '#ecfdf5',
                padding: '6px 12px',
                borderRadius: '8px',
                alignSelf: 'flex-start'
              }}
            >
              <TrendingDown size={14} />
              <span>You save ₹{savings.toLocaleString('en-IN')} ({discountPercent}% OFF)</span>
            </div>
          )}

          {/* Optional Notes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="negotiation_notes_input" style={{ fontSize: '12px', color: '#64748b' }}>Reason / Notes for Manager (optional)</label>
            <input
              id="negotiation_notes_input"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Booking 3 nights for family anniversary"
              style={{
                height: '38px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Live Quote Breakdown */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '12.5px',
              color: '#475569'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal ({quantity} {quantity === 1 ? 'unit' : 'units'})</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>GST ({taxRate}%)</span>
              <span>+ ₹{taxAmount.toLocaleString('en-IN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0f172a', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
              <span>Estimated Grand Total</span>
              <span style={{ color: primaryColor }}>₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Submit Offer Button */}
          <button
            type="button"
            disabled={loading || offerPrice <= 0}
            onClick={handleSubmitOffer}
            style={{
              height: '46px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: primaryColor,
              color: '#ffffff',
              fontSize: '14.5px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: `0 4px 14px ${primaryColor}40`
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <span>Submit Rate Offer</span>}
          </button>
        </div>
      )}

      {/* Alternative Call Connect Trigger */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '12px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => onAction && onAction('JUMP', { targetScreenKey: 'call_connect' })}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#475569',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <PhoneCall size={14} color="#059669" />
          <span>Prefer talking to our team directly? Request a Call</span>
        </button>
      </div>
    </div>
  );
}

