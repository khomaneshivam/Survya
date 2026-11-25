import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Badge } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import { Mail, RefreshCw, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

export default function EmailGoalsTab({ token, toast }) {
  const [settings, setSettings] = useState(null);
  const [recipientsText, setRecipientsText] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [fromName, setFromName] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [goals, setGoals] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [setRes, logRes, goalRes] = await Promise.all([
        fetch('/api/v1/studio/email-settings', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/email-logs?limit=30', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/goals?limit=30', { headers: getAuthHeaders(token) })
      ]);
      const setData = await setRes.json();
      if (setData.success && setData.data) {
        setSettings(setData.data);
        setRecipientsText((setData.data.recipients || []).join(', '));
        setReplyTo(setData.data.replyTo || '');
        setFromName(setData.data.fromName || '');
        setEnabled(Boolean(setData.data.enabled));
      }
      const logData = await logRes.json();
      if (logData.success) setLogs(logData.data || []);
      const goalData = await goalRes.json();
      if (goalData.success) setGoals(goalData.data || []);
    } catch (_) {}
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/studio/email-settings', {
        method: 'PUT',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          enabled,
          recipients: recipientsText,
          replyTo: replyTo || null,
          fromName: fromName || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to update settings');
        return;
      }
      setSettings(data.data);
      if (toast) toast('Business email settings updated');
    } catch (err) {
      alert(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async (logId) => {
    try {
      const res = await fetch(`/api/v1/studio/email-logs/${logId}/retry`, {
        method: 'POST',
        headers: getAuthHeaders(token)
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast('Email queued for retry');
        loadData();
      } else {
        alert(data.message || 'Retry failed');
      }
    } catch (_) {}
  };

  const envStatus = settings?.envStatus || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* SMTP Readiness Banner */}
      <Card>
        <CardBody style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {envStatus.configured ? <CheckCircle2 size={20} color="#16A34A" /> : <AlertTriangle size={20} color="#D97706" />}
            <div>
              <div style={{ fontWeight: 700, fontSize: '14.5px' }}>
                SMTP Transport Status: {envStatus.configured ? 'Configured & Ready' : 'Not Configured on Server'}
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569' }}>
                {envStatus.configured
                  ? `Provider: ${envStatus.provider} (${envStatus.host}:${envStatus.port})`
                  : `Missing env vars: ${(envStatus.missingFields || ['EMAIL_ENABLED=true', 'SMTP_HOST']).join(', ')}`}
              </div>
            </div>
          </div>
          <Badge variant={envStatus.configured ? 'success' : 'warning'}>
            {envStatus.configured ? 'SMTP READY' : 'UNCONFIGURED'}
          </Badge>
        </CardBody>
      </Card>

      {/* Tenant Recipient & Alert Configuration */}
      <Card>
        <CardBody>
          <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={16} color="#2F5219" /> Business Notification Recipients
          </h3>
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={lbl}>Recipient Emails (comma-separated)</label>
              <input
                type="text"
                placeholder="reservations@company.com, ops@company.com"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
                style={inp}
              />
            </div>
            <div>
              <label style={lbl}>Sender Display Name</label>
              <input type="text" placeholder="Survya Studio" value={fromName} onChange={(e) => setFromName(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Reply-To Email</label>
              <input type="email" placeholder="support@company.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, paddingBottom: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enable Automated Alerts
            </label>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* Achieved Business Goals */}
      <Card>
        <CardBody>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#2F5219" /> Recent Business Goal Outcomes
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                  <th style={{ padding: '8px' }}>Event</th>
                  <th style={{ padding: '8px' }}>Experience</th>
                  <th style={{ padding: '8px' }}>Customer</th>
                  <th style={{ padding: '8px' }}>Reference</th>
                  <th style={{ padding: '8px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {goals.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#64748B' }}>No completed goals yet.</td></tr>
                ) : goals.map((g) => (
                  <tr key={g.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px' }}><Badge variant="success">{g.event_name}</Badge></td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{g.experience_name}</td>
                    <td style={{ padding: '8px' }}>{g.customer_name || g.customer_phone || 'Customer'}</td>
                    <td style={{ padding: '8px' }}><code>{g.reference_code}</code></td>
                    <td style={{ padding: '8px' }}>{g.monetary_value > 0 ? `${g.currency} ${g.monetary_value}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Email Delivery Log & Retry */}
      <Card>
        <CardBody>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700 }}>Email Notification Delivery Log</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                  <th style={{ padding: '8px' }}>Subject</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Attempts</th>
                  <th style={{ padding: '8px' }}>Last Error</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#64748B' }}>No email alerts logged yet.</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{l.subject}</td>
                    <td style={{ padding: '8px' }}>
                      <Badge variant={l.status === 'SENT' ? 'success' : l.status === 'DEAD_LETTER' ? 'danger' : 'warning'}>{l.status}</Badge>
                    </td>
                    <td style={{ padding: '8px' }}>{l.attempts} / {l.max_attempts}</td>
                    <td style={{ padding: '8px', color: '#64748B', maxWidth: '300px' }}>{l.last_error || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      {l.status !== 'SENT' && (
                        <Button variant="secondary" onClick={() => handleRetry(l.id)}>
                          <RefreshCw size={12} /> Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

const lbl = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' };
const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' };
