import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  MessageSquare,
  Clock,
  CheckCircle2,
  Calendar,
  Zap,
  ArrowRight,
  Loader2,
  ShieldCheck
} from 'lucide-react';

export default function CallConnectScreen({
  experience = {},
  sessionToken,
  slug,
  onAction
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';

  const [availability, setAvailability] = useState(null);
  const [loadingAvail, setLoadingAvail] = useState(true);

  // Callback form state
  const [callType, setCallType] = useState('INSTANT_CALLBACK'); // 'INSTANT_CALLBACK' | 'SCHEDULED_CALL'
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [topic, setTopic] = useState('Room Booking Inquiry');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState(null);

  // Fetch live IST availability
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const res = await fetch(`/api/v1/public/x/${slug}/call-availability`);
        const data = await res.json();
        if (data.success && data.data) {
          setAvailability(data.data);
          if (data.data.nextAvailableSlots?.length > 0) {
            setSelectedSlot(data.data.nextAvailableSlots[0]);
          }
        }
      } catch (err) {
        console.warn('[CallConnectScreen] Availability load error:', err.message);
      } finally {
        setLoadingAvail(false);
      }
    }
    fetchAvailability();
  }, [slug]);

  // Listen for live SSE call status updates (e.g. ASSIGNED, CALLED)
  useEffect(() => {
    if (!sessionToken || !slug) return;

    let eventSource = null;
    try {
      eventSource = new EventSource(`/api/v1/public/x/${slug}/stream?sessionToken=${sessionToken}`);
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === 'call_status_updated' && parsed.data) {
            setSubmittedRequest((prev) => ({
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

  const handleSubmitCallback = async (e) => {
    e.preventDefault();
    if (!visitorPhone.trim()) {
      alert('Please enter your phone number');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/public/x/${slug}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          visitorPhone: visitorPhone.trim(),
          visitorName: visitorName.trim() || 'Customer',
          callType,
          topic,
          preferredSlotAt: callType === 'SCHEDULED_CALL' ? selectedSlot : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setSubmittedRequest(data.data);
      } else {
        alert(data.message || 'Failed to submit callback request');
      }
    } catch (err) {
      alert(err.message || 'Network error requesting call');
    } finally {
      setSubmitting(false);
    }
  };

  const directPhone = availability?.directDialPhone || '919307382030';
  const isOpen = availability?.isOpenNow ?? true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '18px' }}>
      {/* Header & IST Business Hours Status */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: primaryColor, textTransform: 'uppercase' }}>
            Concierge Connect
          </span>
          {/* Live Open / Closed IST Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '12px',
              backgroundColor: isOpen ? '#ecfdf5' : '#fffbeb',
              color: isOpen ? '#059669' : '#b45309',
              fontSize: '11.5px',
              fontWeight: 700
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isOpen ? '#10b981' : '#f59e0b'
              }}
            />
            <span>{isOpen ? 'Open Now (IST)' : 'After Hours'}</span>
          </div>
        </div>

        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
          Speak with our Guest Team
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
          Direct dial or request a priority callback from our Alibaug guest concierge desk.
        </p>
      </div>

      {/* Direct Call & WhatsApp Quick Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        <a
          href={`tel:${directPhone}`}
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            textDecoration: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
          }}
        >
          <PhoneCall size={20} color="#38bdf8" />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>Direct Call Now</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Standard rates</span>
        </a>

        <a
          href={`https://wa.me/${directPhone}?text=${encodeURIComponent('Namaste! I would like to speak with a concierge.')}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '12px 14px',
            borderRadius: '12px',
            backgroundColor: '#25D366',
            color: '#ffffff',
            textDecoration: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)'
          }}
        >
          <MessageSquare size={20} />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>WhatsApp Call</span>
          <span style={{ fontSize: '10.5px', color: '#dcfce7' }}>Free over Wi-Fi</span>
        </a>
      </div>

      {/* Callback Request Section */}
      {submittedRequest ? (
        <div
          style={{
            padding: '20px 16px',
            borderRadius: '14px',
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #10b981',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '10px'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <CheckCircle2 size={28} />
          </div>

          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#065f46' }}>
            Callback Request Confirmed!
          </h3>

          <p style={{ margin: 0, fontSize: '13px', color: '#047857', lineHeight: 1.5 }}>
            {submittedRequest.call_type === 'INSTANT_CALLBACK'
              ? 'Our concierge desk has been alerted and will call you within 5 minutes.'
              : `Scheduled for ${submittedRequest.preferred_slot_at || 'your requested slot'}.`}
          </p>

          <div
            style={{
              marginTop: '4px',
              padding: '6px 14px',
              borderRadius: '20px',
              backgroundColor: '#d1fae5',
              fontSize: '11.5px',
              fontWeight: 700,
              color: '#065f46',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={13} />
            <span>Status: {submittedRequest.status || 'QUEUED'}</span>
          </div>

          <button
            type="button"
            onClick={() => onAction && onAction('NEXT')}
            style={{
              marginTop: '8px',
              height: '40px',
              padding: '0 20px',
              borderRadius: '10px',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Continue Browsing
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmitCallback}
          style={{
            padding: '16px',
            borderRadius: '14px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          {/* Sub-Tabs: Instant vs Scheduled */}
          <div style={{ display: 'flex', backgroundColor: '#e2e8f0', padding: '3px', borderRadius: '10px' }}>
            <button
              type="button"
              onClick={() => setCallType('INSTANT_CALLBACK')}
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: callType === 'INSTANT_CALLBACK' ? '#ffffff' : 'transparent',
                color: callType === 'INSTANT_CALLBACK' ? '#0f172a' : '#64748b',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <Zap size={13} color="#eab308" />
              <span>Instant (5-min SLA)</span>
            </button>
            <button
              type="button"
              onClick={() => setCallType('SCHEDULED_CALL')}
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: callType === 'SCHEDULED_CALL' ? '#ffffff' : 'transparent',
                color: callType === 'SCHEDULED_CALL' ? '#0f172a' : '#64748b',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <Calendar size={13} />
              <span>Schedule Later</span>
            </button>
          </div>

          {/* Form Inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="call_connect_phone_input" style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Your Phone Number *</label>
            <input
              id="call_connect_phone_input"
              type="tel"
              required
              placeholder="e.g. +91 98765 43210"
              value={visitorPhone}
              onChange={(e) => setVisitorPhone(e.target.value)}
              style={{
                height: '40px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                backgroundColor: '#ffffff'
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="call_connect_name_input" style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Your Name (optional)</label>
            <input
              id="call_connect_name_input"
              type="text"
              placeholder="e.g. Rohan Verma"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              style={{
                height: '40px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                backgroundColor: '#ffffff'
              }}
            />
          </div>

          {callType === 'SCHEDULED_CALL' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="call_connect_slot_select" style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>Preferred Time Slot</label>
              <select
                id="call_connect_slot_select"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                style={{
                  height: '40px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  backgroundColor: '#ffffff'
                }}
              >
                {availability?.nextAvailableSlots?.map((slot, idx) => (
                  <option key={idx} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              height: '44px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: primaryColor,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: `0 4px 12px ${primaryColor}40`,
              marginTop: '4px'
            }}
          >
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <span>{callType === 'INSTANT_CALLBACK' ? 'Request Immediate Callback' : 'Confirm Callback Slot'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>
      )}

      {/* Trust Badge */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
        <ShieldCheck size={13} color={primaryColor} />
        <span>No spam calls. Your number is strictly used for concierge assistance.</span>
      </div>
    </div>
  );
}

