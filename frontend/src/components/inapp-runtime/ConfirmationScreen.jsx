import React from 'react';
import { CheckCircle2, MessageSquare, RotateCcw } from 'lucide-react';

function interpolate(template, data = {}) {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path) => {
    const parts = path.split('.');
    let curr = data;
    for (const p of parts) {
      if (curr == null || typeof curr !== 'object') return '';
      curr = curr[p];
    }
    return curr !== undefined && curr !== null ? String(curr) : '';
  });
}

export default function ConfirmationScreen({
  screen = {},
  stateData = {},
  experience = {},
  onReset
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const config = screen.config || {};

  const rawTitle = screen.title || 'Reservation Inquiry Received! 🎉';
  const rawSubtitle = screen.subtitle || 'Thank you, {{name}}! Our concierge is preparing your stay details.';

  const title = interpolate(rawTitle, stateData);
  const subtitle = interpolate(rawSubtitle, stateData);

  const selectedItem = stateData.selectedItem || null;
  const guestName = stateData.name || stateData.contact_name || 'Guest';
  const phone = stateData.phone || stateData.contact_phone || '';
  const email = stateData.email || stateData.contact_email || '';
  const checkin = stateData.checkin_date || stateData.checkinDate || '';
  const checkout = stateData.checkout_date || stateData.checkoutDate || '';

  // WhatsApp Handoff URL
  const waNumber = experience.assignedPhoneNumberId || '919307382030';
  const waMessage = encodeURIComponent(
    `Namaste! I just completed my in-app inquiry for ${selectedItem?.title || experience.name}. Name: ${guestName}, Phone: ${phone}.`
  );
  const waUrl = `https://wa.me/${waNumber}?text=${waMessage}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px', alignItems: 'center', textAlign: 'center' }}>
      {/* Celebration Icon */}
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: '#ecfdf5',
          color: '#10b981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '12px',
          boxShadow: '0 4px 16px rgba(16, 185, 129, 0.2)'
        }}
      >
        <CheckCircle2 size={40} />
      </div>

      {/* Title & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
          {title}
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      </div>

      {/* Summary Card */}
      <div
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '14px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          textAlign: 'left',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
          Summary Details
        </div>

        {selectedItem && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>Item / Room</span>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>{selectedItem.title}</span>
          </div>
        )}

        {guestName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>Name</span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>{guestName}</span>
          </div>
        )}

        {phone && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>Phone</span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>{phone}</span>
          </div>
        )}

        {email && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>Email</span>
            <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#0f172a' }}>{email}</span>
          </div>
        )}

        {(checkin || checkout) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#475569' }}>Dates</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              {checkin} {checkout ? `to ${checkout}` : ''}
            </span>
          </div>
        )}

        {stateData.crmRecordId && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Reference ID</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: primaryColor }}>#{stateData.crmRecordId}</span>
          </div>
        )}
      </div>

      {/* WhatsApp Handoff CTA */}
      <div style={{ width: '100%', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '12px',
            backgroundColor: '#25D366',
            color: '#ffffff',
            textDecoration: 'none',
            fontSize: '14.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(37, 211, 102, 0.35)',
            boxSizing: 'border-box'
          }}
        >
          <MessageSquare size={18} />
          <span>Chat on WhatsApp</span>
        </a>

        {/* Start Over Button */}
        <button
          type="button"
          onClick={onReset}
          style={{
            width: '100%',
            height: '42px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            color: '#475569',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}
        >
          <RotateCcw size={15} />
          <span>Start Over</span>
        </button>
      </div>
    </div>
  );
}

