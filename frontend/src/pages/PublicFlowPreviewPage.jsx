import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, ExternalLink, RotateCcw, Send, ShieldCheck } from 'lucide-react';

const cardStyle = {
  width: 'min(100%, 720px)',
  background: '#FFFFFF',
  border: '1px solid #D8E4D0',
  borderRadius: '18px',
  overflow: 'hidden',
  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.10)'
};

function unavailableMessage(payload) {
  return payload?.error || 'This browser preview is unavailable, expired, or has been revoked.';
}

/**
 * A public, browser-only renderer for a frozen draft snapshot. It never asks
 * for a WhatsApp number and only calls the pure preview endpoints.
 */
export default function PublicFlowPreviewPage({ token }) {
  const [preview, setPreview] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const runSimulation = useCallback(async ({ nextInput = '', selectedOptionId = '', reset = false } = {}) => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/flow-previews/${encodeURIComponent(token)}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          input: nextInput,
          selectedOptionId,
          state: reset ? null : simulation?.state || null
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(unavailableMessage(payload));
      setSimulation(payload.simulation);
      setInput('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRunning(false);
    }
  }, [simulation, token]);

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/public/flow-previews/${encodeURIComponent(token)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(unavailableMessage(payload));
        if (!active) return;
        setPreview(payload.preview);
        setSimulation(null);
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPreview();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!loading && preview && !simulation && !error) {
      runSimulation({ reset: true });
    }
  }, [loading, preview, simulation, error, runSimulation]);

  const terminal = Boolean(simulation?.terminal);
  const hasChoices = Array.isArray(simulation?.interactive?.options) && simulation.interactive.options.length > 0;
  const expiresAt = preview?.expiresAt ? new Date(preview.expiresAt).toLocaleString() : null;

  return (
    <main style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: '24px 16px', background: 'linear-gradient(145deg, #F0FDF4 0%, #F8FAFC 50%, #ECFDF5 100%)', display: 'grid', placeItems: 'center', color: '#0F172A', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <section style={cardStyle}>
        <header style={{ background: 'linear-gradient(135deg, #163D2A, #2D6248)', color: '#FFFFFF', padding: '22px 24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.14)', flex: '0 0 auto' }}><Bot size={21} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.76, fontWeight: 800 }}>Safe flow demo</p>
            <h1 style={{ margin: '3px 0 0', fontSize: '1.12rem', lineHeight: 1.3 }}>{preview?.title || 'Loading browser preview…'}</h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', opacity: 0.84, lineHeight: 1.45 }}>Browser-only simulation · no WhatsApp number · no message delivery</p>
          </div>
        </header>

        <div style={{ padding: '18px 20px 20px', display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 11px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '9px', color: '#166534', fontSize: '0.78rem', lineHeight: 1.45 }}>
            <ShieldCheck size={17} style={{ flex: '0 0 auto', marginTop: 1 }} />
            <span>This preview is a frozen draft. It cannot contact WhatsApp, Meta, AI, webhooks, CRM, or any live system.</span>
          </div>

          {expiresAt && <p style={{ margin: 0, color: '#64748B', fontSize: '0.73rem' }}>This preview expires: {expiresAt}</p>}

          {error ? (
            <div role="alert" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '13px', borderRadius: '9px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.83rem', lineHeight: 1.45 }}>
              <AlertTriangle size={18} style={{ flex: '0 0 auto' }} />
              <span>{error}</span>
            </div>
          ) : loading || !simulation ? (
            <div style={{ minHeight: 190, display: 'grid', placeItems: 'center', color: '#64748B', fontSize: '0.86rem' }}><RotateCcw size={20} className="spin" /> Loading safe simulation…</div>
          ) : (
            <>
              <div aria-live="polite" style={{ minHeight: 190, maxHeight: '48dvh', overflowY: 'auto', padding: '15px', display: 'grid', alignContent: 'start', gap: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                {(simulation.messages || []).map((message, index) => (
                  <div key={`${index}-${message.slice(0, 20)}`} style={{ justifySelf: 'start', maxWidth: '90%', padding: '10px 12px', borderRadius: '12px 12px 12px 3px', background: '#FFFFFF', border: '1px solid #E2E8F0', color: '#334155', fontSize: '0.88rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {message}
                  </div>
                ))}
                {terminal && <span style={{ color: '#166534', fontWeight: 700, fontSize: '0.76rem' }}>Demo complete — no external action was taken.</span>}
              </div>

              {hasChoices && !terminal && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {simulation.interactive.options.map((option) => (
                    <button key={option.id} type="button" disabled={running} onClick={() => runSimulation({ selectedOptionId: option.id })} style={{ border: '1px solid #86EFAC', background: '#FFFFFF', color: '#166534', borderRadius: '8px', padding: '8px 11px', cursor: running ? 'wait' : 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                      {option.title}
                    </button>
                  ))}
                </div>
              )}

              {!hasChoices && !terminal && (
                <form onSubmit={(event) => { event.preventDefault(); if (input.trim()) runSimulation({ nextInput: input.trim() }); }} style={{ display: 'flex', gap: '8px' }}>
                  <input aria-label="Preview response" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} disabled={running} placeholder="Type a demo response" style={{ flex: 1, minWidth: 0, border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 11px', font: 'inherit', fontSize: '0.86rem' }} />
                  <button type="submit" disabled={running || !input.trim()} style={{ border: 0, borderRadius: '8px', background: '#1F5135', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 12px', cursor: running || !input.trim() ? 'not-allowed' : 'pointer', opacity: running || !input.trim() ? 0.6 : 1, fontWeight: 700 }}><Send size={15} /> Try</button>
                </form>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => runSimulation({ reset: true })} disabled={running} style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', borderRadius: '8px', padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: running ? 'wait' : 'pointer', fontSize: '0.78rem', fontWeight: 700 }}><RotateCcw size={14} /> Restart demo</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#64748B', fontSize: '0.72rem' }}><ExternalLink size={13} /> This link is temporary and browser-only.</span>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
