import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Modal, Button } from './ui';
import { Smartphone, AlertCircle, Info, Plus, CheckCircle2, RefreshCw, KeyRound, Globe, ShieldCheck } from 'lucide-react';

export default function AddPhoneNumberModal({ isOpen, onClose, onSuccess, onAdded, onPhoneAdded, initialData = null }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('sync'); // 'sync' | 'meta_pin'
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [pin, setPin] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const [detecting, setDetecting] = useState(false);
  const [detectSuccess, setDetectSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialData) {
      setPhoneNumberId(initialData.phone_number_id || initialData.phoneNumberId || '');
      setDisplayName(initialData.display_name || initialData.displayName || '');
      setPhoneNumber(initialData.phone_number || initialData.phoneNumber || '');
      setWabaId(initialData.waba_id || initialData.wabaId || '');
      setIsDefault(initialData.is_default !== undefined ? Boolean(initialData.is_default) : true);
      if (initialData.mode) {
        setActiveTab(initialData.mode);
      }
    } else {
      setDisplayName('');
      setPhoneNumber('');
      setPhoneNumberId('');
      setPin('');
      setCustomToken('');
      setWabaId('');
      setIsDefault(true);
      setDetectSuccess(null);
      setError(null);
    }
  }, [initialData, isOpen]);

  // Proactive auto-detection from Meta Graph API
  async function handleAutoDetect() {
    if (!phoneNumberId.trim()) {
      setError('Please enter a Meta Phone Number ID first to auto-detect.');
      return;
    }

    setError(null);
    setDetecting(true);
    setDetectSuccess(null);

    try {
      const payload = {
        phoneNumberId: phoneNumberId.trim()
      };
      if (customToken.trim()) {
        payload.token = customToken.trim();
      }

      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Could not auto-fetch phone details from Meta Graph API.');
      }

      const data = result.data || {};
      if (data.verifiedName) {
        setDisplayName(data.verifiedName);
      }
      if (data.displayPhoneNumber) {
        setPhoneNumber(data.displayPhoneNumber);
      }

      setDetectSuccess({
        verifiedName: data.verifiedName || 'Verified Sender',
        displayPhoneNumber: data.displayPhoneNumber || phoneNumberId.trim(),
        qualityRating: data.qualityRating || 'GREEN',
        status: data.codeVerificationStatus || data.status || 'CONNECTED'
      });
    } catch (err) {
      setError(`Auto-detect note: ${err.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const cleanPhoneId = phoneNumberId.trim();
    if (!cleanPhoneId) {
      setError('Meta Phone Number ID is required from Meta Developer Dashboard.');
      return;
    }

    if (activeTab === 'meta_pin') {
      if (!pin.trim()) {
        setError('6-digit Meta verification PIN is required for Meta Graph API registration.');
        return;
      }
      if (!/^\d{6}$/.test(pin.trim())) {
        setError('Meta two-step verification PIN must be exactly 6 numeric digits (e.g. 123456).');
        return;
      }
    } else {
      if (pin.trim() && !/^\d{6}$/.test(pin.trim())) {
        setError('Two-step verification PIN must be a 6-digit numeric string (e.g. 123456).');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint = (activeTab === 'meta_pin' || pin.trim())
        ? '/api/admin/phone-numbers/register-meta'
        : '/api/admin/phone-numbers';

      const payload = {
        phoneNumberId: cleanPhoneId,
        displayName: displayName.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
        wabaId: wabaId.trim() || undefined,
        isDefault
      };

      if (customToken.trim()) {
        payload.token = customToken.trim();
      }
      if (pin.trim()) {
        payload.pin = pin.trim();
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to register or sync WhatsApp phone line.');
      }

      const callback = onSuccess || onAdded || onPhoneAdded;
      if (callback) {
        callback(data.data?.localRecord || data.data);
      }

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
      title={activeTab === 'meta_pin' ? 'Register Line to Meta Graph API' : 'Connect & Sync WhatsApp Line'}
      subtitle="Configure, verify, and register official Meta WhatsApp Cloud API sender lines"
      icon={activeTab === 'meta_pin' ? KeyRound : Smartphone}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="add-phone-line-form" variant="primary" disabled={submitting}>
            {activeTab === 'meta_pin' ? <KeyRound size={15} /> : <Plus size={15} />}
            <span>
              {submitting
                ? (activeTab === 'meta_pin' ? 'Registering with Meta...' : 'Syncing Line...')
                : (activeTab === 'meta_pin' ? 'Register to Meta API' : 'Save & Connect Line')}
            </span>
          </Button>
        </>
      }
    >
      {/* Mode / Tab Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('sync'); setError(null); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            border: activeTab === 'sync' ? '1px solid var(--sarvya-blue)' : '1px solid transparent',
            background: activeTab === 'sync' ? 'var(--status-info-bg, #eff6ff)' : 'transparent',
            color: activeTab === 'sync' ? 'var(--sarvya-blue)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'sync' ? 600 : 500,
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          <Smartphone size={14} />
          <span>Add &amp; Sync Sender Line</span>
        </button>

        <button
          type="button"
          onClick={() => { setActiveTab('meta_pin'); setError(null); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            border: activeTab === 'meta_pin' ? '1px solid var(--sarvya-blue)' : '1px solid transparent',
            background: activeTab === 'meta_pin' ? 'var(--status-info-bg, #eff6ff)' : 'transparent',
            color: activeTab === 'meta_pin' ? 'var(--sarvya-blue)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'meta_pin' ? 600 : 500,
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          <KeyRound size={14} />
          <span>Register to Meta (6-Digit PIN)</span>
        </button>
      </div>

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

      {detectSuccess && (
        <div
          role="status"
          style={{
            background: 'var(--status-success-bg, #ecfdf5)',
            border: '1px solid var(--status-success-border, #a7f3d0)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            color: 'var(--status-success-text, #065f46)',
            fontSize: '12.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            marginBottom: '14px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <CheckCircle2 size={16} color="#059669" />
            <span>Verified with Meta Graph API</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', marginTop: '2px', opacity: 0.9 }}>
            <span><strong>Name:</strong> {detectSuccess.verifiedName}</span>
            <span><strong>Number:</strong> {detectSuccess.displayPhoneNumber}</span>
            <span><strong>Status:</strong> {detectSuccess.status}</span>
            <span><strong>Quality:</strong> {detectSuccess.qualityRating}</span>
          </div>
        </div>
      )}

      <form
        id="add-phone-line-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {/* Phone Number ID Input with Auto-Detect Button */}
        <div>
          <label className="sarvya-field-label" htmlFor="linePhoneNumberId">
            Meta Phone Number ID *
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              id="linePhoneNumberId"
              type="text"
              required
              className="sarvya-input"
              style={{ flex: 1 }}
              placeholder="e.g. 1510764325447375"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAutoDetect}
              disabled={detecting || !phoneNumberId.trim()}
              title="Auto-fetch verified name & phone number directly from Meta Graph API"
            >
              <RefreshCw size={13} className={detecting ? 'spin-slow' : ''} />
              <span>{detecting ? 'Verifying...' : 'Auto-Detect'}</span>
            </Button>
          </div>
          <div className="sarvya-field-hint" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Info size={12} />
            <span>Found in Meta Developer Dashboard &gt; WhatsApp &gt; API Setup &gt; Phone number ID</span>
          </div>
        </div>

        {/* Optional Access Token */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="sarvya-field-label" htmlFor="lineCustomToken">
              Permanent Meta Access Token (System User Token)
            </label>
            <a
              href="https://business.facebook.com/settings/system-users"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '11px', color: 'var(--sarvya-blue)', textDecoration: 'none', fontWeight: 600 }}
            >
              Meta System Users ↗
            </a>
          </div>
          <input
            id="lineCustomToken"
            type="password"
            className="sarvya-input font-mono"
            placeholder="EAAV... (Paste permanent token, or leave blank to use default)"
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
          />
          <div style={{
            marginTop: '6px',
            padding: '8px 10px',
            background: 'var(--status-info-bg, #eff6ff)',
            border: '1px solid var(--status-info-border, #bfdbfe)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '11.5px',
            color: 'var(--status-info-text, #1e40af)',
            lineHeight: 1.4
          }}>
            <strong>💡 Never-Expiring Token Tip:</strong> Temporary Graph Explorer tokens expire in 24 hours. To make your broadcast line work 24/7 without expiration, generate a <strong>System User Token</strong> in Meta Business Settings with <code>whatsapp_business_messaging</code> &amp; <code>whatsapp_business_management</code>.
          </div>
        </div>

        {/* Tab 2 PIN specific prompt or optional in Tab 1 */}
        {activeTab === 'meta_pin' ? (
          <div>
            <label className="sarvya-field-label" htmlFor="linePin">
              Meta 2-Step Verification PIN (6 digits) *
            </label>
            <input
              id="linePin"
              type="password"
              required
              maxLength={6}
              className="sarvya-input font-mono"
              placeholder="6-digit numeric PIN (e.g. 123456)"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <div className="sarvya-field-hint" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={12} />
              <span>Directly registers with Meta Cloud API via <code>POST /{phoneNumberId || 'phone_id'}/register</code></span>
            </div>
          </div>
        ) : (
          <div>
            <label className="sarvya-field-label" htmlFor="linePinOptional">
              Meta 2-Step Verification PIN (Optional)
            </label>
            <input
              id="linePinOptional"
              type="password"
              maxLength={6}
              className="sarvya-input font-mono"
              placeholder="6-digit numeric PIN if line requires registration"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <div className="sarvya-field-hint" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Info size={12} />
              <span>Provide your 6-digit PIN to connect and register directly with Meta Graph API in one step</span>
            </div>
          </div>
        )}

        {/* Display Name & Phone Number */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="sarvya-field-label" htmlFor="lineDisplayName">
              Display Name {activeTab === 'sync' ? '(Auto or Custom)' : '(Optional)'}
            </label>
            <input
              id="lineDisplayName"
              type="text"
              className="sarvya-input"
              placeholder="e.g. Sarvya Concierge"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="sarvya-field-label" htmlFor="linePhoneNumber">
              Phone Number {activeTab === 'sync' ? '(Auto or Custom)' : '(Optional)'}
            </label>
            <input
              id="linePhoneNumber"
              type="text"
              className="sarvya-input"
              placeholder="+91 87665 90634"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </div>
        </div>

        {/* WABA ID */}
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 500, marginTop: '2px' }}>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: 'var(--sarvya-blue)' }}
          />
          <span>Set as default primary sending line for platform campaigns and automations</span>
        </label>
      </form>
    </Modal>
  );
}
