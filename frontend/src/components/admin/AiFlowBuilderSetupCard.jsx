import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, KeyRound, Save, ShieldCheck } from 'lucide-react';

const DEFAULT_CONFIG = {
  enabled: false,
  provider: 'GEMINI',
  model: 'gemini-1.5-flash',
  credential: { configured: false, source: 'not configured' },
  rules: {
    requireStepApproval: true,
    requireApiReview: true,
    requireMockTests: true,
    requireSandboxPreview: true,
    instructions: ''
  },
  safety: {
    autoPublish: false,
    runtimeCodeChanges: false,
    liveMessageDispatch: false
  }
};

const fieldStyle = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #CBD5E1',
  borderRadius: '8px',
  padding: '9px 10px',
  font: 'inherit',
  color: '#0F172A',
  background: '#FFFFFF'
};

/**
 * Admin-only configuration card for the provider and guardrails used by AI Flow Builder.
 * The API never returns the API key; this component only submits a new one when supplied.
 */
export default function AiFlowBuilderSetupCard({ token, onSuccess, onError }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const callbacksRef = useRef({ onSuccess, onError });

  useEffect(() => {
    callbacksRef.current = { onSuccess, onError };
  }, [onSuccess, onError]);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      if (!token) return;
      setLoading(true);
      try {
        const response = await fetch('/api/admin/ai-flow-config', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Could not load AI flow builder configuration.');
        }
        if (active) {
          setConfig({
            ...DEFAULT_CONFIG,
            ...data.data,
            credential: { ...DEFAULT_CONFIG.credential, ...(data.data?.credential || {}) },
            rules: { ...DEFAULT_CONFIG.rules, ...(data.data?.rules || {}) },
            safety: { ...DEFAULT_CONFIG.safety, ...(data.data?.safety || {}) }
          });
        }
      } catch (error) {
        if (active) {
          setNotice({ type: 'error', message: error.message });
          callbacksRef.current.onError?.(error.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadConfig();
    return () => { active = false; };
  }, [token]);

  function handleProviderChange(provider) {
    setConfig((current) => ({
      ...current,
      provider,
      model: provider === 'OPENAI' ? 'gpt-4o-mini' : 'gemini-1.5-flash',
      credential: { configured: false, source: 'not configured until saved' }
    }));
    setApiKey('');
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/ai-flow-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          enabled: config.enabled,
          provider: config.provider,
          model: config.model,
          apiKey: apiKey || undefined,
          rules: config.rules
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not save AI flow builder configuration.');
      }
      setConfig((current) => ({
        ...current,
        ...data.data,
        credential: { ...DEFAULT_CONFIG.credential, ...(data.data?.credential || {}) },
        rules: { ...DEFAULT_CONFIG.rules, ...(data.data?.rules || {}) }
      }));
      setApiKey('');
      const message = data.message || 'AI flow builder configuration saved.';
      setNotice({ type: 'success', message });
      callbacksRef.current.onSuccess?.(message);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
      callbacksRef.current.onError?.(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{
      border: '1px solid #D8E4D0',
      borderRadius: '14px',
      background: '#FFFFFF',
      overflow: 'hidden'
    }}>
      <header style={{
        padding: '18px 20px',
        background: 'linear-gradient(135deg, #173B2A 0%, #2D6248 100%)',
        color: '#FFFFFF',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start'
      }}>
        <div style={{ background: 'rgba(255,255,255,0.14)', padding: '9px', borderRadius: '10px', display: 'flex' }}>
          <Bot size={20} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>AI Flow Builder setup</h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', opacity: 0.86, lineHeight: 1.45 }}>
            Choose the AI used to draft flows and define the rules it must follow. Credentials are stored securely and never displayed here.
          </p>
        </div>
      </header>

      <form onSubmit={handleSave} style={{ padding: '20px', display: 'grid', gap: '18px' }}>
        {notice && (
          <div role="status" style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start', borderRadius: '8px', padding: '10px 12px',
            background: notice.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: notice.type === 'success' ? '#166534' : '#991B1B',
            border: `1px solid ${notice.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
            fontSize: '0.84rem'
          }}>
            {notice.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
            <span>{notice.message}</span>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', borderRadius: '9px', background: config.enabled ? '#ECFDF5' : '#F8FAFC', border: `1px solid ${config.enabled ? '#86EFAC' : '#E2E8F0'}` }}>
          <input
            type="checkbox"
            checked={Boolean(config.enabled)}
            onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))}
            disabled={loading || saving}
            style={{ width: '17px', height: '17px', accentColor: '#166534' }}
          />
          <span>
            <strong style={{ display: 'block', color: '#1E293B', fontSize: '0.88rem' }}>Enable AI flow drafting</strong>
            <span style={{ color: '#64748B', fontSize: '0.78rem' }}>When disabled, administrators can still view drafts but cannot generate new AI proposals.</span>
          </span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.83rem', fontWeight: 700, color: '#334155' }}>
            AI provider
            <select value={config.provider} onChange={(event) => handleProviderChange(event.target.value)} disabled={loading || saving} style={fieldStyle}>
              <option value="GEMINI">Google Gemini</option>
              <option value="OPENAI">OpenAI</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.83rem', fontWeight: 700, color: '#334155' }}>
            Model
            <input value={config.model} maxLength={160} onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))} disabled={loading || saving} style={fieldStyle} />
          </label>
        </div>

        <div style={{ padding: '13px', border: '1px solid #E2E8F0', borderRadius: '9px', background: '#F8FAFC' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '0.83rem', fontWeight: 700, color: '#334155' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><KeyRound size={15} /> Provider API key</span>
            <input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={loading || saving} placeholder={config.credential.configured ? 'Configured — leave blank to keep it unchanged' : 'Paste a key to configure this provider'} style={fieldStyle} />
          </label>
          <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: '#64748B' }}>
            Current credential: <strong>{config.credential.configured ? `configured via ${config.credential.source}` : 'not configured'}</strong>. The key is encrypted on save and is never returned to the browser.
          </p>
        </div>

        <div style={{ padding: '13px', border: '1px solid #D8E4D0', borderRadius: '9px', background: '#F0FDF4' }}>
          <strong style={{ display: 'block', color: '#14532D', fontSize: '0.88rem', marginBottom: '8px' }}>Required review gates</strong>
          <div style={{ display: 'grid', gap: '6px', color: '#3F6212', fontSize: '0.8rem', lineHeight: 1.4 }}>
            <span>✓ Approve requirements, API readiness, design, simulation, and final activation in order.</span>
            <span>✓ Record mock-only test and zero-dispatch preview evidence before final approval.</span>
            <span>✓ These safeguards are fixed for every AI-generated flow.</span>
          </div>
        </div>

        <label style={{ display: 'grid', gap: '6px', fontSize: '0.83rem', fontWeight: 700, color: '#334155' }}>
          Flow-builder instructions and business rules
          <textarea
            rows={5}
            value={config.rules.instructions || ''}
            maxLength={6000}
            onChange={(event) => updateRules({ instructions: event.target.value })}
            disabled={loading || saving}
            placeholder="Example: Ask for check-in and check-out dates before availability. Never quote a rate without an approved pricing API. Escalate cancellation requests to a human."
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.45 }}
          />
          <span style={{ color: '#64748B', fontWeight: 400, fontSize: '0.74rem', textAlign: 'right' }}>{(config.rules.instructions || '').length}/6000</span>
        </label>

        <div style={{ borderRadius: '9px', padding: '12px', background: '#FFF7ED', border: '1px solid #FED7AA', display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#9A3412', fontSize: '0.8rem', lineHeight: 1.45 }}>
          <ShieldCheck size={18} style={{ flex: '0 0 auto', marginTop: '1px' }} />
          <span><strong>Locked safety policy:</strong> AI can prepare a draft and an implementation proposal only. It cannot auto-publish, alter the runtime codebase, deploy services, or send a WhatsApp message.</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={loading || saving} style={{ display: 'inline-flex', gap: '7px', alignItems: 'center', border: 0, borderRadius: '8px', background: '#1F5135', color: '#FFFFFF', padding: '10px 14px', fontWeight: 700, cursor: loading || saving ? 'not-allowed' : 'pointer', opacity: loading || saving ? 0.65 : 1 }}>
            <Save size={16} /> {saving ? 'Saving setup…' : 'Save AI flow setup'}
          </button>
        </div>
      </form>
    </section>
  );
}
