import React, { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, RotateCcw, ShieldCheck, X } from 'lucide-react';

function absolutePreviewUrl(path) {
  if (!path || typeof window === 'undefined') return path || '';
  return `${window.location.origin}${path}`;
}

function formatExpiry(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusStyle(status) {
  if (status === 'ACTIVE') return { background: '#ECFDF5', color: '#166534', border: '#BBF7D0' };
  if (status === 'REVOKED') return { background: '#FEF2F2', color: '#991B1B', border: '#FECACA' };
  return { background: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
}

/** Admin controls for an expiring browser-only draft preview. */
export default function FlowPreviewLinksPanel({ flowId, token }) {
  const [links, setLinks] = useState([]);
  const [expiryHours, setExpiryHours] = useState('24');
  const [loading, setLoading] = useState(Boolean(flowId));
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [rawLink, setRawLink] = useState(null);
  const [notice, setNotice] = useState(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const load = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/flows/conversation-flows/${flowId}/preview-links`, { headers: headers() });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not load browser preview links.');
      setLinks(payload.links || []);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [flowId, headers]);

  useEffect(() => { load(); }, [load]);

  async function createLink() {
    setCreating(true);
    setNotice(null);
    setRawLink(null);
    try {
      const response = await fetch(`/api/flows/conversation-flows/${flowId}/preview-links`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ expiresInHours: Number(expiryHours) })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not create a browser preview link.');
      const link = absolutePreviewUrl(payload.previewLink?.browserPath);
      setRawLink(link || null);
      setNotice({ type: 'success', message: 'Temporary browser preview created. Copy the link now; its token is shown only once.' });
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!rawLink) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable');
      await navigator.clipboard.writeText(rawLink);
      setNotice({ type: 'success', message: 'Browser preview link copied.' });
    } catch {
      setNotice({ type: 'info', message: 'Copy the displayed link manually.' });
    }
  }

  async function revoke(previewLinkId) {
    setRevoking(previewLinkId);
    setNotice(null);
    try {
      const response = await fetch(`/api/flow-preview-links/${previewLinkId}/revoke`, {
        method: 'POST',
        headers: headers()
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Could not revoke the preview link.');
      setNotice({ type: 'success', message: 'Browser preview link revoked.' });
      await load();
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setRevoking(null);
    }
  }

  if (!flowId) return null;

  return (
    <section style={{ border: '1px solid #D8E4D0', borderRadius: '12px', background: '#FFFFFF', overflow: 'hidden' }}>
      <header style={{ padding: '14px 16px', background: '#F0FDF4', borderBottom: '1px solid #D8E4D0', display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
        <Link2 size={18} color="#166534" style={{ flex: '0 0 auto', marginTop: 1 }} />
        <div>
          <h3 style={{ margin: 0, color: '#14532D', fontSize: '0.9rem' }}>Browser demo link</h3>
          <p style={{ margin: '3px 0 0', color: '#3F6212', fontSize: '0.77rem', lineHeight: 1.4 }}>Share a frozen draft for review. It is not a WhatsApp test and cannot send messages.</p>
        </div>
      </header>

      <div style={{ padding: '14px 16px', display: 'grid', gap: '11px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#475569', fontSize: '0.78rem', fontWeight: 700 }}>
            Expires in
            <select value={expiryHours} onChange={(event) => setExpiryHours(event.target.value)} disabled={creating} style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 8px', font: 'inherit', background: '#FFFFFF' }}>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </select>
          </label>
          <button type="button" onClick={createLink} disabled={creating || loading} style={{ border: 0, borderRadius: '7px', padding: '8px 10px', background: '#1F5135', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: creating || loading ? 'wait' : 'pointer', opacity: creating || loading ? 0.65 : 1 }}>
            {creating ? <RotateCcw size={14} className="spin" /> : <Link2 size={14} />} {creating ? 'Creating…' : 'Create preview link'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', color: '#475569', fontSize: '0.75rem', lineHeight: 1.4 }}><ShieldCheck size={16} color="#166534" style={{ flex: '0 0 auto' }} /><span>Preview data is a sanitized snapshot. The link token is stored only as a hash and can be revoked here.</span></div>

        {notice && <div role="status" style={{ padding: '8px 10px', borderRadius: '7px', fontSize: '0.77rem', color: notice.type === 'error' ? '#991B1B' : '#166534', background: notice.type === 'error' ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${notice.type === 'error' ? '#FECACA' : '#BBF7D0'}` }}>{notice.message}</div>}

        {rawLink && (
          <div style={{ display: 'grid', gap: '7px', padding: '10px', border: '1px solid #BBF7D0', borderRadius: '8px', background: '#FFFFFF' }}>
            <span style={{ color: '#166534', fontSize: '0.76rem', fontWeight: 700 }}>Copy this temporary link now</span>
            <code style={{ overflowWrap: 'anywhere', color: '#334155', fontSize: '0.72rem' }}>{rawLink}</code>
            <div style={{ display: 'flex', gap: '7px' }}>
              <button type="button" onClick={copyLink} style={{ border: '1px solid #86EFAC', borderRadius: '6px', background: '#F0FDF4', color: '#166534', padding: '6px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700 }}><Copy size={13} /> Copy</button>
              <a href={rawLink} target="_blank" rel="noreferrer" style={{ border: '1px solid #CBD5E1', borderRadius: '6px', color: '#334155', padding: '6px 8px', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>
            </div>
          </div>
        )}

        {loading ? <span style={{ color: '#64748B', fontSize: '0.78rem' }}>Loading preview links…</span> : links.length === 0 ? <span style={{ color: '#64748B', fontSize: '0.78rem' }}>No preview links created for this draft.</span> : (
          <div style={{ display: 'grid', gap: '7px' }}>
            {links.map((link) => {
              const style = statusStyle(link.status);
              return <div key={link.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '9px', padding: '9px 10px', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '0.75rem' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block', color: '#334155' }}>{link.title || 'Browser preview'} <span style={{ color: '#94A3B8', fontWeight: 500 }}>…{link.tokenPrefix}</span></strong>
                  <span style={{ color: '#64748B' }}>Expires {formatExpiry(link.expiresAt)}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flex: '0 0 auto' }}>
                  <span style={{ border: `1px solid ${style.border}`, background: style.background, color: style.color, padding: '3px 6px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800 }}>{link.status}</span>
                  {link.status === 'ACTIVE' && <button type="button" onClick={() => revoke(link.id)} disabled={revoking === link.id} title="Revoke preview link" style={{ border: '1px solid #FECACA', borderRadius: '6px', background: '#FFFFFF', color: '#B91C1C', padding: '4px 5px', cursor: revoking === link.id ? 'wait' : 'pointer' }}><X size={13} /></button>}
                </div>
              </div>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}
