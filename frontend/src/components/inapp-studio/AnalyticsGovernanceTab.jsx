import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Button, Badge } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import { BarChart3, ShieldCheck, History, RotateCcw, CheckCircle2 } from 'lucide-react';

export default function AnalyticsGovernanceTab({ token, experiences = [], onRefreshExperiences, toast }) {
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedExpId, setSelectedExpId] = useState(experiences[0]?.id ? String(experiences[0].id) : '');
  const [versions, setVersions] = useState([]);
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadAnalyticsAndAudit = useCallback(async () => {
    try {
      const [anRes, auRes] = await Promise.all([
        fetch('/api/v1/studio/analytics?days=30', { headers: getAuthHeaders(token) }),
        fetch('/api/v1/studio/audit-logs?limit=30', { headers: getAuthHeaders(token) })
      ]);
      const anData = await anRes.json();
      if (anData.success) setAnalytics(anData.data);
      const auData = await auRes.json();
      if (auData.success) setAuditLogs(auData.data || []);
    } catch (_) {}
  }, [token]);

  const loadVersions = useCallback(async (expId) => {
    if (!expId) return;
    try {
      const res = await fetch(`/api/v1/studio/experiences/${expId}/versions`, { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (data.success) setVersions(data.data || []);
    } catch (_) {}
  }, [token]);

  useEffect(() => {
    loadAnalyticsAndAudit();
  }, [loadAnalyticsAndAudit]);

  useEffect(() => {
    if (selectedExpId) loadVersions(selectedExpId);
  }, [selectedExpId, loadVersions]);

  const handleValidate = async () => {
    if (!selectedExpId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/experiences/${selectedExpId}/validate`, { headers: getAuthHeaders(token) });
      const data = await res.json();
      if (data.success) setValidation(data.data);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedExpId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/experiences/${selectedExpId}/publish`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ changelog: 'Studio version publish' })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Published v${data.data.versionNumber} cleanly!`);
        loadVersions(selectedExpId);
        loadAnalyticsAndAudit();
        if (onRefreshExperiences) onRefreshExperiences();
      } else {
        alert(data.message || 'Publish blocked');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (versionNumber) => {
    if (!selectedExpId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/studio/experiences/${selectedExpId}/rollback`, {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ versionNumber })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Rolled back cleanly to v${versionNumber}`);
        loadVersions(selectedExpId);
        loadAnalyticsAndAudit();
        if (onRefreshExperiences) onRefreshExperiences();
      } else {
        alert(data.message || 'Rollback failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const f = analytics?.funnel || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Live Funnel KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px' }}>
        <Stat label="WA Link Clicks" value={f.waLinkClicks ?? 0} />
        <Stat label="Chat Launches (Live)" value={f.chatLaunches ?? 0} />
        <Stat label="Goals Completed" value={f.goalsCompleted ?? 0} />
        <Stat label="Conversion Rate" value={`${f.conversionRatePercent ?? 0}%`} />
        <Stat label="Human Handoffs" value={f.humanHandoffs ?? 0} />
        <Stat label="Revenue Attributed" value={`₹${Number(f.totalAttributedRevenue || 0).toLocaleString('en-IN')}`} />
      </div>

      {/* Versioning, Validation & Safe Rollback */}
      <Card>
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} color="#2F5219" /> Experience Publishing & Version Rollback
            </h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedExpId}
                onChange={(e) => setSelectedExpId(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
              >
                {experiences.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <Button variant="secondary" disabled={busy || !selectedExpId} onClick={handleValidate}>Validate</Button>
              <Button variant="primary" disabled={busy || !selectedExpId} onClick={handlePublish}>Publish Version</Button>
            </div>
          </div>

          {validation && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', background: validation.valid ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${validation.valid ? '#BBF7D0' : '#FECACA'}`, fontSize: '13px' }}>
              <strong>{validation.valid ? 'Validation Passed' : 'Validation Issues Detected'}</strong> ({validation.stepsChecked} steps checked)
              {validation.errors?.length > 0 && <div style={{ color: '#991B1B', marginTop: '4px' }}>Errors: {validation.errors.join(' · ')}</div>}
              {validation.warnings?.length > 0 && <div style={{ color: '#92400E', marginTop: '4px' }}>Warnings: {validation.warnings.join(' · ')}</div>}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                  <th style={{ padding: '8px' }}>Version</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Changelog</th>
                  <th style={{ padding: '8px' }}>Published By</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {versions.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '14px', color: '#64748B', textAlign: 'center' }}>No immutable versions published yet.</td></tr>
                ) : versions.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>v{v.version_number}</td>
                    <td style={{ padding: '8px' }}><Badge variant={v.status === 'PUBLISHED' ? 'success' : 'secondary'}>{v.status}</Badge></td>
                    <td style={{ padding: '8px' }}>{v.changelog}</td>
                    <td style={{ padding: '8px' }}>{v.published_by || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      {v.status !== 'PUBLISHED' && (
                        <Button variant="secondary" disabled={busy} onClick={() => handleRollback(v.version_number)}>
                          <RotateCcw size={12} /> Rollback
                        </Button>
                      )}
                      {v.status === 'PUBLISHED' && (
                        <span style={{ color: '#15803D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Studio Audit Log */}
      <Card>
        <CardBody>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={16} color="#2F5219" /> Governance Audit Log
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                  <th style={{ padding: '7px' }}>Action</th>
                  <th style={{ padding: '7px' }}>Actor</th>
                  <th style={{ padding: '7px' }}>Experience ID</th>
                  <th style={{ padding: '7px' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '14px', textAlign: 'center', color: '#64748B' }}>No audit entries yet.</td></tr>
                ) : auditLogs.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '7px', fontWeight: 600 }}>{a.action}</td>
                    <td style={{ padding: '7px' }}>{a.actor_email || a.actor_id}</td>
                    <td style={{ padding: '7px' }}>{a.experience_id || '—'}</td>
                    <td style={{ padding: '7px', color: '#64748B' }}>{a.created_at}</td>
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

function Stat({ label, value }) {
  return (
    <Card>
      <CardBody style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748B' }}>{label}</div>
        <div style={{ fontSize: '21px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{value}</div>
      </CardBody>
    </Card>
  );
}
