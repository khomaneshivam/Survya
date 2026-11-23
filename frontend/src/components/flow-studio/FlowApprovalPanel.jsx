import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, LockKeyhole, MessageSquareWarning, ShieldCheck } from 'lucide-react';

const STAGE_LABELS = {
  REQUIREMENTS: 'Requirements',
  API_READINESS: 'API readiness',
  FLOW_DESIGN: 'Flow design',
  SIMULATION: 'Simulation',
  PUBLISH: 'Publish approval'
};

const STAGE_HELP = {
  REQUIREMENTS: 'Confirm the business goal, trigger, customer data, and handoff scope.',
  API_READINESS: 'Confirm every API or integration is available, approved, and safe to use.',
  FLOW_DESIGN: 'Review messages, steps, conditions, data collection, and fallbacks.',
  SIMULATION: 'Confirm the flow passed a zero-dispatch sandbox walkthrough.',
  PUBLISH: 'Final administrator approval before this flow can be activated.'
};

function statusStyle(status) {
  if (status === 'APPROVED') return { color: '#166534', background: '#ECFDF5', border: '#BBF7D0' };
  if (status === 'PENDING') return { color: '#92400E', background: '#FFFBEB', border: '#FDE68A' };
  if (status === 'CHANGES_REQUESTED') return { color: '#991B1B', background: '#FEF2F2', border: '#FECACA' };
  return { color: '#64748B', background: '#F8FAFC', border: '#E2E8F0' };
}

/**
 * Admin-only, server-backed review gates for a flow. It never dispatches a
 * message; simulation and live activation remain separate actions.
 */
export default function FlowApprovalPanel({ flowId, token, onChanged, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(flowId));
  const [actingStage, setActingStage] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState('');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const load = useCallback(async () => {
    if (!flowId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/flows/conversation-flows/${flowId}/approvals`, { headers: headers() });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not load approval status.');
      setData(body);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [flowId, headers]);

  useEffect(() => { load(); }, [load]);

  async function request(stage) {
    setActingStage(stage);
    setError(null);
    try {
      const response = await fetch(`/api/flows/conversation-flows/${flowId}/approvals/request`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ stage, summary: STAGE_HELP[stage] })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not request approval.');
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActingStage(null);
    }
  }

  async function decide(stage, decision) {
    setActingStage(stage);
    setError(null);
    try {
      const response = await fetch(`/api/flows/conversation-flows/${flowId}/approvals/decision`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ stage, decision, note: note.trim() })
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not record the decision.');
      setNote('');
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setActingStage(null);
    }
  }

  if (!flowId) return null;

  const stages = data?.stages || Object.keys(STAGE_LABELS);
  const latestByStage = data?.latestByStage || {};
  const hasAnyRequest = Object.values(latestByStage).some(Boolean);

  return (
    <section style={{ border: '1px solid #D8E4D0', borderRadius: '12px', background: '#FFFFFF', overflow: 'hidden' }}>
      <header style={{ padding: compact ? '12px 14px' : '15px 18px', background: '#F0FDF4', borderBottom: '1px solid #D8E4D0', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <ShieldCheck size={19} color="#166534" style={{ flex: '0 0 auto', marginTop: '1px' }} />
        <div>
          <h3 style={{ margin: 0, color: '#14532D', fontSize: '0.93rem' }}>Approval gates</h3>
          <p style={{ margin: '3px 0 0', color: '#3F6212', fontSize: '0.78rem', lineHeight: 1.4 }}>
            Each decision is saved to the audit trail. This panel never sends a message or activates a flow automatically.
          </p>
        </div>
      </header>

      <div style={{ padding: compact ? '12px' : '16px', display: 'grid', gap: '10px' }}>
        {error && <div role="alert" style={{ padding: '9px 11px', borderRadius: '7px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.8rem' }}>{error}</div>}
        {loading && <div style={{ color: '#64748B', fontSize: '0.82rem' }}>Loading approval history…</div>}

        {!loading && !hasAnyRequest && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px', border: '1px dashed #CBD5E1', borderRadius: '8px', color: '#475569', fontSize: '0.8rem' }}>
            <span>Start the review sequence before this flow is activated.</span>
            <button type="button" onClick={() => request('REQUIREMENTS')} disabled={Boolean(actingStage)} style={{ border: 0, borderRadius: '6px', padding: '7px 10px', background: '#1F5135', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer' }}>Start review</button>
          </div>
        )}

        {!loading && hasAnyRequest && stages.map((stage, index) => {
          const approval = latestByStage[stage];
          const style = statusStyle(approval?.status);
          const isPending = approval?.status === 'PENDING';
          const needsResubmission = approval?.status === 'CHANGES_REQUESTED';
          return (
            <div key={stage} style={{ border: `1px solid ${style.border}`, borderRadius: '9px', padding: '11px', background: style.background }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                {approval?.status === 'APPROVED' ? <CheckCircle2 size={18} color={style.color} /> : isPending ? <CircleDashed size={18} color={style.color} /> : <LockKeyhole size={18} color={style.color} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                    <strong style={{ color: '#1E293B', fontSize: '0.83rem' }}>{index + 1}. {STAGE_LABELS[stage]}</strong>
                    <span style={{ color: style.color, fontWeight: 700, fontSize: '0.72rem' }}>{approval?.status?.replace(/_/g, ' ') || 'LOCKED'}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.75rem', lineHeight: 1.4 }}>{approval?.summary || STAGE_HELP[stage]}</p>
                  {approval?.checklist?.length > 0 && (
                    <ul style={{ margin: '7px 0 0', paddingLeft: '17px', color: '#475569', fontSize: '0.74rem', lineHeight: 1.55 }}>
                      {approval.checklist.map((item, itemIndex) => <li key={`${stage}-${itemIndex}`}>{item}</li>)}
                    </ul>
                  )}
                  {approval?.decision_note && <p style={{ margin: '7px 0 0', color: style.color, fontSize: '0.74rem' }}>Decision note: {approval.decision_note}</p>}
                </div>
              </div>
              {isPending && (
                <div style={{ marginTop: '10px', paddingLeft: '27px', display: 'flex', flexWrap: 'wrap', gap: '7px', alignItems: 'center' }}>
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={5000} placeholder="Optional decision note" style={{ flex: '1 1 190px', minWidth: 0, border: '1px solid #CBD5E1', borderRadius: '6px', padding: '6px 8px', fontSize: '0.76rem' }} />
                  <button type="button" onClick={() => decide(stage, 'CHANGES_REQUESTED')} disabled={Boolean(actingStage)} style={{ border: '1px solid #FCA5A5', borderRadius: '6px', padding: '6px 9px', background: '#FFFFFF', color: '#B91C1C', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}><MessageSquareWarning size={13} /> Request changes</button>
                  <button type="button" onClick={() => decide(stage, 'APPROVED')} disabled={Boolean(actingStage)} style={{ border: 0, borderRadius: '6px', padding: '6px 9px', background: '#166534', color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>{actingStage === stage ? 'Saving…' : 'Approve stage'}</button>
                </div>
              )}
              {needsResubmission && (
                <div style={{ marginTop: '10px', paddingLeft: '27px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#991B1B', fontSize: '0.74rem' }}>Update the draft or requirements, then submit this stage again.</span>
                  <button type="button" onClick={() => request(stage)} disabled={Boolean(actingStage)} style={{ border: 0, borderRadius: '6px', padding: '6px 9px', background: '#1F5135', color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                    {actingStage === stage ? 'Submitting…' : 'Resubmit review'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
