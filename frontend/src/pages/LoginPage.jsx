import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button, Modal } from '../components/ui';
import { Lock, Mail, ArrowRight, AlertCircle, Key, CheckCircle2 } from 'lucide-react';

export default function LoginPage({ onSwitchToRegister, onBackToLanding }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  const [forgotSuccess, setForgotSuccess] = useState(null);
  const [forgotDevCode, setForgotDevCode] = useState(null);
  const [forgotMaskedPhone, setForgotMaskedPhone] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  function openForgotModal() {
    setForgotEmail(email || '');
    setForgotCode('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotStep(1);
    setForgotError(null);
    setForgotSuccess(null);
    setForgotDevCode(null);
    setForgotMaskedPhone(null);
    setShowForgotModal(true);
  }

  async function handleRequestRecovery(e) {
    e.preventDefault();
    setForgotError(null);
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Recovery failed.');
      setForgotSuccess(data.message);
      if (data.data?.maskedPhone) setForgotMaskedPhone(data.data.maskedPhone);
      if (data.data?.devRecoveryCode) setForgotDevCode(data.data.devRecoveryCode);
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    setForgotError(null);
    if (forgotNewPassword.length < 8) {
      setForgotError('New password must be at least 8 characters long.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail, code: forgotCode.trim(), newPassword: forgotNewPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to reset password.');
      setShowForgotModal(false);
      setEmail(forgotEmail);
      setPassword(forgotNewPassword);
      setSuccessNotice('Password reset successfully. Sign in with your new credentials.');
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg-app)'
    }}>
      <Card style={{ width: '100%', maxWidth: '420px' }}>
        <CardBody style={{ padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--sarvya-blue)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '18px',
              margin: '0 auto 12px'
            }}>
              S
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Sign in to SARVYA</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Access CRM, Forms, Workflows &amp; WhatsApp Connect
            </p>
          </div>

          {successNotice && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--status-success-bg)',
              color: 'var(--status-success-text)',
              border: '1px solid var(--status-success-border)',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px'
            }}>
              <CheckCircle2 size={15} />
              <span>{successNotice}</span>
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              border: '1px solid var(--status-error-border)',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px'
            }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="loginEmail">Work Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} className="sarvya-search-icon" style={{ top: '11px' }} />
                <input
                  id="loginEmail"
                  type="email"
                  required
                  className="sarvya-input"
                  style={{ paddingInlineStart: '32px' }}
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="sarvya-field-label" htmlFor="loginPwd" style={{ marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={openForgotModal}
                  style={{ background: 'none', border: 'none', color: 'var(--sarvya-blue)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={14} className="sarvya-search-icon" style={{ top: '11px' }} />
                <input
                  id="loginPwd"
                  type="password"
                  required
                  className="sarvya-input"
                  style={{ paddingInlineStart: '32px' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%', padding: '10px 16px' }}>
              <span>{loading ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight size={15} />
            </Button>
          </form>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            <button type="button" onClick={onBackToLanding} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← Back to overview
            </button>
            <button type="button" onClick={onSwitchToRegister} style={{ background: 'none', border: 'none', color: 'var(--sarvya-blue)', fontWeight: 600, cursor: 'pointer' }}>
              Create account
            </button>
          </div>
        </CardBody>
      </Card>

      <Modal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        title="Recover Workspace Access"
        subtitle="Reset your password via registered email recovery code"
        icon={Key}
      >
        {forgotError && (
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '12.5px', marginBottom: '12px' }}>
            {forgotError}
          </div>
        )}
        {forgotSuccess && (
          <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', fontSize: '12.5px', marginBottom: '12px' }}>
            {forgotSuccess}
            {forgotMaskedPhone && <div>Sent to: {forgotMaskedPhone}</div>}
            {forgotDevCode && <div>Recovery code: <strong>{forgotDevCode}</strong></div>}
          </div>
        )}

        {forgotStep === 1 ? (
          <form onSubmit={handleRequestRecovery} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="recEmail">Registered Email</label>
              <input
                id="recEmail"
                type="email"
                required
                className="sarvya-input"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={forgotLoading}>
              {forgotLoading ? 'Sending code...' : 'Send Recovery Code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="recCode">Verification Code</label>
              <input id="recCode" type="text" required className="sarvya-input" value={forgotCode} onChange={(e) => setForgotCode(e.target.value)} />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="recNewPwd">New Password</label>
              <input id="recNewPwd" type="password" required className="sarvya-input" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="recConfirmPwd">Confirm New Password</label>
              <input id="recConfirmPwd" type="password" required className="sarvya-input" value={forgotConfirmPassword} onChange={(e) => setForgotConfirmPassword(e.target.value)} />
            </div>
            <Button type="submit" variant="primary" disabled={forgotLoading}>
              {forgotLoading ? 'Resetting...' : 'Update Password'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
