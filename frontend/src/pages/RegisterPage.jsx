import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button } from '../components/ui';
import { ArrowRight, AlertCircle, ShieldAlert } from 'lucide-react';

export default function RegisterPage({ onSwitchToLogin, onBackToLanding }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(name, email, phone, password);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
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
      <Card style={{ width: '100%', maxWidth: '440px' }}>
        <CardBody style={{ padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
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
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Create SARVYA Account</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Provision operator access to SARVYA CRM &amp; Messaging
            </p>
          </div>

          <div style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-info-bg)',
            border: '1px solid var(--status-info-border)',
            color: 'var(--status-info-text)',
            fontSize: '12px',
            display: 'flex',
            gap: '8px',
            marginBottom: '16px'
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>New accounts start with Agent Operator permissions. Channel lines are governed by Workspace Admins.</span>
          </div>

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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="regName">Full Name</label>
              <input id="regName" type="text" required className="sarvya-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="regEmail">Work Email</label>
              <input id="regEmail" type="email" required className="sarvya-input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="regPhone">Mobile Number</label>
              <input id="regPhone" type="text" required className="sarvya-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="regPwd">Password</label>
              <input id="regPwd" type="password" required className="sarvya-input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="regConfirm">Confirm Password</label>
              <input id="regConfirm" type="password" required className="sarvya-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>

            <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%', padding: '10px 16px', marginTop: '4px' }}>
              <span>{loading ? 'Creating account...' : 'Create Workspace Account'}</span>
              <ArrowRight size={15} />
            </Button>
          </form>

          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            <button type="button" onClick={onBackToLanding} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← Back to overview
            </button>
            <button type="button" onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: 'var(--sarvya-blue)', fontWeight: 600, cursor: 'pointer' }}>
              Sign in instead
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
