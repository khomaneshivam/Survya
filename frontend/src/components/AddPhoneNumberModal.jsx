import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Modal, Button } from './ui';
import { Smartphone, AlertCircle, Info, Plus } from 'lucide-react';

export default function AddPhoneNumberModal({ isOpen, onClose, onSuccess }) {
  const { token } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError('Line Display Name is required (e.g. "Primary Booking Line").');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('WhatsApp Phone Number with country code is required (e.g. +91 98200 12345).');
      return;
    }
    if (!phoneNumberId.trim()) {
      setError('Meta Phone Number ID is required from Meta Developer Dashboard.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          phoneNumber: phoneNumber.trim(),
          phoneNumberId: phoneNumberId.trim(),
          wabaId: wabaId.trim() || undefined,
          isDefault
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to register WhatsApp phone line.');
      }

      setDisplayName('');
      setPhoneNumber('');
      setPhoneNumberId('');
      setWabaId('');
      setIsDefault(true);

      if (onSuccess) onSuccess(data.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Connect WhatsApp Line"
      subtitle="Register an official Meta WhatsApp Business Cloud API sender line"
      icon={Smartphone}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-phone-line-form" variant="primary" disabled={submitting}>
            <Plus size={15} />
            <span>{submitting ? 'Connecting...' : 'Connect WhatsApp Line'}</span>
          </Button>
        </>
      }
    >
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 12px',
            color: 'var(--status-error-text)',
            fontSize: '12.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px'
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form
        id="add-phone-line-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <div>
          <label className="sarvya-field-label" htmlFor="lineDisplayName">
            Line Display Name *
          </label>
          <input
            id="lineDisplayName"
            type="text"
            required
            className="sarvya-input"
            placeholder="e.g. Primary Booking Desk or Concierge Line"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div>
          <label className="sarvya-field-label" htmlFor="linePhoneNumber">
            WhatsApp Phone Number (with Country Code) *
          </label>
          <input
            id="linePhoneNumber"
            type="text"
            required
            className="sarvya-input"
            placeholder="+91 98200 12345"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>

        <div>
          <label className="sarvya-field-label" htmlFor="linePhoneNumberId">
            Meta Phone Number ID *
          </label>
          <input
            id="linePhoneNumberId"
            type="text"
            required
            className="sarvya-input"
            placeholder="e.g. 109876543210987"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
          <div className="sarvya-field-hint" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Info size={12} />
            <span>Meta Developer Dashboard &gt; WhatsApp &gt; API Setup &gt; Phone number ID</span>
          </div>
        </div>

        <div>
          <label className="sarvya-field-label" htmlFor="lineWabaId">
            WhatsApp Business Account ID (WABA ID) (Optional)
          </label>
          <input
            id="lineWabaId"
            type="text"
            className="sarvya-input"
            placeholder="e.g. 104523789123456"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--sarvya-blue)' }}
          />
          <span>Set as primary sending line for campaigns and automations</span>
        </label>
      </form>
    </Modal>
  );
}
