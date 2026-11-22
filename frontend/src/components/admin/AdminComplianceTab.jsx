import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Download,
  Trash2,
  FileText,
  UserCheck,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Eye,
  X,
  Lock,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Tabs
} from '../ui';
import { formatIndianDate } from '../../utils/indianTime';

export default function AdminComplianceTab({
  token,
  flashSuccess,
  flashError
}) {
  const [subTab, setSubTab] = useState('consent'); // consent | export | erasure | requests

  // 1. Consent Ledger State
  const [consentList, setConsentList] = useState([]);
  const [consentPhoneFilter, setConsentPhoneFilter] = useState('');
  const [loadingConsent, setLoadingConsent] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentForm, setConsentForm] = useState({
    phoneE164: '',
    purpose: 'MARKETING',
    status: 'GRANTED',
    source: 'ADMIN_DASHBOARD',
    noticeVersion: 'v1.0'
  });
  const [savingConsent, setSavingConsent] = useState(false);

  // 2. Data Portability / Export State
  const [exportPhone, setExportPhone] = useState('');
  const [exportData, setExportData] = useState(null);
  const [exporting, setExporting] = useState(false);

  // 3. Erasure / Anonymization State
  const [erasurePhone, setErasurePhone] = useState('');
  const [erasureReason, setErasureReason] = useState('Customer requested DPDP erasure under Section 12');
  const [erasureMode, setErasureMode] = useState('SCHEDULED_48H'); // SCHEDULED_48H | IMMEDIATE
  const [processingErasure, setProcessingErasure] = useState(false);
  const [erasureResult, setErasureResult] = useState(null);

  // 4. Requests & Grievances State
  const [requestsList, setRequestsList] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    phoneE164: '',
    requestType: 'ERASURE',
    details: ''
  });
  const [savingRequest, setSavingRequest] = useState(false);
  const [editTicket, setEditTicket] = useState(null);
  const [ticketStatusForm, setTicketStatusForm] = useState({ status: 'COMPLETED', details: '' });
  const [updatingTicket, setUpdatingTicket] = useState(false);

  // Fetch Consent Ledger
  const fetchConsentLedger = useCallback(async () => {
    setLoadingConsent(true);
    try {
      const q = consentPhoneFilter ? `?phone=${encodeURIComponent(consentPhoneFilter)}` : '';
      const res = await fetch(`/api/admin/compliance/consent-ledger${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setConsentList(data.data);
      } else {
        setConsentList([]);
      }
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setLoadingConsent(false);
    }
  }, [token, consentPhoneFilter, flashError]);

  // Fetch Requests Desk
  const fetchRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch('/api/admin/compliance/requests', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRequestsList(data.data);
      } else {
        setRequestsList([]);
      }
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setLoadingRequests(false);
    }
  }, [token, flashError]);

  useEffect(() => {
    if (subTab === 'consent') fetchConsentLedger();
    if (subTab === 'requests') fetchRequests();
  }, [subTab, fetchConsentLedger, fetchRequests]);

  // 1. Handle Consent Submit
  const handleConsentSubmit = async (e) => {
    e.preventDefault();
    if (!consentForm.phoneE164) {
      if (flashError) flashError('Phone number is required.');
      return;
    }
    setSavingConsent(true);
    try {
      const res = await fetch('/api/admin/compliance/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(consentForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to record consent');
      }
      if (flashSuccess) flashSuccess(data.message || 'Consent updated successfully.');
      setShowConsentModal(false);
      setConsentForm({ phoneE164: '', purpose: 'MARKETING', status: 'GRANTED', source: 'ADMIN_DASHBOARD', noticeVersion: 'v1.0' });
      fetchConsentLedger();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setSavingConsent(false);
    }
  };

  // 2. Handle Export PII
  const handleExportSubmit = async (e) => {
    e.preventDefault();
    if (!exportPhone) {
      if (flashError) flashError('Enter a valid phone number to export.');
      return;
    }
    setExporting(true);
    setExportData(null);
    try {
      const res = await fetch(`/api/admin/compliance/export/${encodeURIComponent(exportPhone)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to export PII');
      }
      setExportData(data.data);
      if (flashSuccess) flashSuccess(`Discovered PII bundle for ${exportPhone}.`);
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setExporting(false);
    }
  };

  // 2b. Download Export JSON
  const downloadExportJson = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dpdp_export_${exportPhone}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 3. Handle Erasure / Anonymization Submit
  const handleErasureSubmit = async (e) => {
    e.preventDefault();
    if (!erasurePhone) {
      if (flashError) flashError('Enter phone number for erasure.');
      return;
    }
    if (!confirm(`Are you sure you want to proceed with DPDP Erasure/Anonymization for ${erasurePhone}?`)) {
      return;
    }
    setProcessingErasure(true);
    setErasureResult(null);
    try {
      const res = await fetch(`/api/admin/compliance/erasure/${encodeURIComponent(erasurePhone)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          immediate: erasureMode === 'IMMEDIATE',
          scheduleNoticeHours: erasureMode === 'SCHEDULED_48H' ? 48 : 0,
          reason: erasureReason
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to process erasure');
      }
      setErasureResult(data.data);
      if (flashSuccess) flashSuccess(data.message || 'Erasure request submitted.');
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setProcessingErasure(false);
    }
  };

  // 4. Handle Create Request Ticket
  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestForm.phoneE164) return;
    setSavingRequest(true);
    try {
      const res = await fetch('/api/admin/compliance/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to create request ticket');
      }
      if (flashSuccess) flashSuccess('Compliance ticket logged.');
      setShowRequestModal(false);
      setRequestForm({ phoneE164: '', requestType: 'ERASURE', details: '' });
      fetchRequests();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setSavingRequest(false);
    }
  };

  // 4b. Update Ticket Status Submit
  const handleTicketUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editTicket) return;
    setUpdatingTicket(true);
    try {
      const res = await fetch(`/api/admin/compliance/requests/${editTicket.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(ticketStatusForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to update ticket');
      }
      if (flashSuccess) flashSuccess('Compliance ticket updated.');
      setEditTicket(null);
      fetchRequests();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setUpdatingTicket(false);
    }
  };

  const complianceTabs = [
    { id: 'consent', label: 'Consent Ledger & Audit', icon: UserCheck },
    { id: 'export', label: 'Data Portability (Right to Access)', icon: Download },
    { id: 'erasure', label: 'Erasure & Cryptographic Anonymization', icon: Trash2 },
    { id: 'requests', label: 'Grievance & Erasure Tickets', icon: FileText }
  ];

  return (
    <Card>
      <CardHeader
        title="DPDP Act 2023 Compliance & Privacy Governance"
        icon={ShieldCheck}
      />
      <CardBody>
        {/* DPDP Statutory Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)',
          border: '1px solid rgba(2, 132, 199, 0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '14px 18px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sarvya-blue)' }}>
              India DPDP Act 2023 & Meta BSUID Standard
            </span>
            <Badge variant="success">Compliant</Badge>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Automated compliance with India's <strong>Digital Personal Data Protection Act, 2023</strong> (Sections 6, 11, 12) and Meta WhatsApp Business Scoped User ID (BSUID). 
            Provides itemized consent logging, instant withdrawal sync with broadcast suppressions, 48-hour pre-erasure scheduling, salted SHA-256 hash preservation, and complete PII export.
          </p>
        </div>

        {/* Inner Sub-Navigation */}
        <div style={{ marginBottom: '20px' }}>
          <Tabs tabs={complianceTabs} activeTab={subTab} onChange={setSubTab} />
        </div>

        {/* =========================================================================
            SUB-TAB 1: CONSENT LEDGER
            ========================================================================= */}
        {subTab === 'consent' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  placeholder="Filter by customer phone (e.g. 919820098200)..."
                  value={consentPhoneFilter}
                  onChange={(e) => setConsentPhoneFilter(e.target.value)}
                  className="sarvya-input"
                  style={{ fontSize: '13px' }}
                />
                <Button variant="secondary" onClick={fetchConsentLedger} disabled={loadingConsent}>
                  <RefreshCw size={14} className={loadingConsent ? 'spin-slow' : ''} />
                </Button>
              </div>

              <Button variant="primary" onClick={() => setShowConsentModal(true)}>
                <Plus size={14} /> Record / Withdraw Consent
              </Button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="sarvya-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Phone & BSUID</th>
                    <th style={{ padding: '10px 14px' }}>Purpose</th>
                    <th style={{ padding: '10px 14px' }}>Consent Status</th>
                    <th style={{ padding: '10px 14px' }}>Source / Channel</th>
                    <th style={{ padding: '10px 14px' }}>Notice Ver.</th>
                    <th style={{ padding: '10px 14px' }}>Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConsent ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading consent ledger...
                      </td>
                    </tr>
                  ) : consentList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No consent records found. Customer opt-ins from WhatsApp Flows and forms will appear here.
                      </td>
                    </tr>
                  ) : (
                    consentList.map((row) => (
                      <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.phone_e164}</div>
                          {row.wa_bsuid && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              BSUID: {row.wa_bsuid.substring(0, 16)}...
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {row.purpose}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <Badge variant={row.status === 'GRANTED' ? 'success' : 'danger'}>
                            {row.status === 'GRANTED' ? 'CONSENT GRANTED' : 'WITHDRAWN (OPT-OUT)'}
                          </Badge>
                        </td>

                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {row.source || 'WHATSAPP_CHAT'}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '12px', fontFamily: 'monospace' }}>{row.notice_version || 'v1.0'}</span>
                        </td>

                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {formatIndianDate(row.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            SUB-TAB 2: DATA PORTABILITY (RIGHT TO ACCESS)
            ========================================================================= */}
        {subTab === 'export' && (
          <div>
            <div style={{ maxWidth: '640px', marginBottom: '24px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Export Data Subject Records (Right to Access)</h4>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
                Under Section 11 of the DPDP Act 2023, data principals have the right to obtain a summary of personal data being processed. 
                Enter the phone number to compile an itemized export of contacts, chats, reservations, CRM records, and consent history.
              </p>

              <form onSubmit={handleExportSubmit} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919820098200"
                  value={exportPhone}
                  onChange={(e) => setExportPhone(e.target.value)}
                  className="sarvya-input"
                  style={{ fontSize: '14px', fontWeight: 600 }}
                />
                <Button variant="primary" type="submit" disabled={exporting}>
                  <Download size={14} />
                  {exporting ? 'Compiling...' : 'Export PII'}
                </Button>
              </form>
            </div>

            {exportData && (
              <div style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h5 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>
                      Data Subject Report: {exportData.dataSubject}
                    </h5>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Notice Version: {exportData.dpdpNoticeVersion} • Generated: {formatIndianDate(exportData.exportedAt)}
                    </div>
                  </div>

                  <Button variant="secondary" onClick={downloadExportJson}>
                    <Download size={14} /> Download JSON Bundle
                  </Button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                  <div style={{ background: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>CONTACTS</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{exportData.summary?.contactsCount ?? 0}</div>
                  </div>
                  <div style={{ background: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>CHAT MESSAGES</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{exportData.summary?.messagesCount ?? 0}</div>
                  </div>
                  <div style={{ background: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>BOOKINGS & ENQUIRIES</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{exportData.summary?.enquiriesCount ?? 0}</div>
                  </div>
                  <div style={{ background: '#FFF', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>CRM RECORDS</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{exportData.summary?.crmRecordsCount ?? 0}</div>
                  </div>
                </div>

                <div style={{ maxHeight: '300px', overflowY: 'auto', background: '#0F172A', color: '#F8FAFC', padding: '14px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace' }}>
                  <pre style={{ margin: 0 }}>{JSON.stringify(exportData, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            SUB-TAB 3: ERASURE & CRYPTOGRAPHIC ANONYMIZATION
            ========================================================================= */}
        {subTab === 'erasure' && (
          <div style={{ maxWidth: '640px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Right to Erasure & Cryptographic Anonymization</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', lineHeight: 1.5 }}>
              Under Section 12 of the DPDP Act 2023, data fiduciaries must erase personal data upon customer request unless retention is required by applicable law (e.g., GST or RBI audit rules).
              SARVYA replaces all customer names, emails, and message text with <code>[DPDP-ANONYMIZED]</code>, retains a salted SHA-256 phone hash in suppressions to prevent future broadcasts, and keeps financial ledgers intact.
            </p>

            <form onSubmit={handleErasureSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label className="sarvya-field-label">Customer Phone (E.164) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919820098200"
                  value={erasurePhone}
                  onChange={(e) => setErasurePhone(e.target.value)}
                  className="sarvya-input"
                  style={{ fontSize: '14px', fontWeight: 600 }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="sarvya-field-label">Erasure Execution Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: erasureMode === 'SCHEDULED_48H' ? '2px solid var(--sarvya-blue)' : '1px solid var(--border-color)',
                    background: erasureMode === 'SCHEDULED_48H' ? 'rgba(2, 132, 199, 0.05)' : 'transparent',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="erasureMode"
                      value="SCHEDULED_48H"
                      checked={erasureMode === 'SCHEDULED_48H'}
                      onChange={() => setErasureMode('SCHEDULED_48H')}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>48-Hour Notice Queue</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Enqueues job in MySQL queue for safe 48h notice window.
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: erasureMode === 'IMMEDIATE' ? '2px solid #DC2626' : '1px solid var(--border-color)',
                    background: erasureMode === 'IMMEDIATE' ? 'rgba(220, 38, 38, 0.05)' : 'transparent',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="erasureMode"
                      value="IMMEDIATE"
                      checked={erasureMode === 'IMMEDIATE'}
                      onChange={() => setErasureMode('IMMEDIATE')}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Immediate Anonymize</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Instantly scrub all PII across tables right now.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Reason / Justification</label>
                <input
                  type="text"
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  className="sarvya-input"
                />
              </div>

              <Button
                variant={erasureMode === 'IMMEDIATE' ? 'danger' : 'primary'}
                type="submit"
                disabled={processingErasure}
              >
                <Trash2 size={14} />
                {processingErasure ? 'Processing...' : erasureMode === 'IMMEDIATE' ? 'Execute Immediate Anonymization' : 'Schedule 48-Hour Erasure Job'}
              </Button>
            </form>

            {erasureResult && (
              <div style={{
                marginTop: '20px',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                fontSize: '13px',
                color: '#065F46'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>
                  ✓ Erasure Operation Logged Successfully
                </div>
                <div>Status: <strong>{erasureResult.status}</strong></div>
                {erasureResult.scheduledAt && <div>Execution Scheduled: {formatIndianDate(erasureResult.scheduledAt)}</div>}
                {erasureResult.contactsUpdated !== undefined && (
                  <div style={{ marginTop: '6px', fontSize: '12px' }}>
                    Updated {erasureResult.contactsUpdated} contact(s), {erasureResult.repliesUpdated} message(s), {erasureResult.enquiriesUpdated} enquiry(ies).
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            SUB-TAB 4: GRIEVANCE & ERASURE REQUESTS DESK
            ========================================================================= */}
        {subTab === 'requests' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Grievance Redressal & DPDP Ticket Desk</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Manage customer rights requests: Erasure, Access, Rectification, and Complaints under DPDP Act 2023.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button variant="secondary" onClick={fetchRequests} disabled={loadingRequests}>
                  <RefreshCw size={14} className={loadingRequests ? 'spin-slow' : ''} />
                </Button>
                <Button variant="primary" onClick={() => setShowRequestModal(true)}>
                  <Plus size={14} /> Log Request Ticket
                </Button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="sarvya-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Ticket ID</th>
                    <th style={{ padding: '10px 14px' }}>Phone Number</th>
                    <th style={{ padding: '10px 14px' }}>Request Type</th>
                    <th style={{ padding: '10px 14px' }}>Status</th>
                    <th style={{ padding: '10px 14px' }}>Created At</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRequests ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Loading compliance tickets...
                      </td>
                    </tr>
                  ) : requestsList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No compliance grievance or erasure requests pending.
                      </td>
                    </tr>
                  ) : (
                    requestsList.map((req) => (
                      <tr key={req.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                          #{req.id}
                        </td>

                        <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                          {req.phone_e164}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <Badge variant="secondary">{req.request_type}</Badge>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <Badge variant={req.status === 'COMPLETED' ? 'success' : req.status === 'SCHEDULED_48H' ? 'warning' : 'primary'}>
                            {req.status}
                          </Badge>
                        </td>

                        <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                          {formatIndianDate(req.created_at)}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditTicket(req);
                              setTicketStatusForm({ status: req.status, details: req.details || '' });
                            }}
                          >
                            Update Ticket
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardBody>

      {/* RECORD / WITHDRAW CONSENT MODAL */}
      {showConsentModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Record / Withdraw DPDP Consent</h3>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConsentSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Customer Phone (E.164) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919820098200"
                  value={consentForm.phoneE164}
                  onChange={(e) => setConsentForm({ ...consentForm, phoneE164: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Purpose</label>
                  <select
                    className="sarvya-select"
                    value={consentForm.purpose}
                    onChange={(e) => setConsentForm({ ...consentForm, purpose: e.target.value })}
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="TRANSACTIONAL">Transactional</option>
                    <option value="SUPPORT">Support</option>
                  </select>
                </div>

                <div>
                  <label className="sarvya-field-label">Consent State</label>
                  <select
                    className="sarvya-select"
                    value={consentForm.status}
                    onChange={(e) => setConsentForm({ ...consentForm, status: e.target.value })}
                  >
                    <option value="GRANTED">GRANTED</option>
                    <option value="WITHDRAWN">WITHDRAWN (Opt-out)</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Source Channel</label>
                <input
                  type="text"
                  value={consentForm.source}
                  onChange={(e) => setConsentForm({ ...consentForm, source: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowConsentModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConsent}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {savingConsent ? 'Saving...' : 'Record Consent Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG NEW COMPLIANCE TICKET MODAL */}
      {showRequestModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Log Compliance Request Ticket</h3>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Customer Phone *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 919820098200"
                  value={requestForm.phoneE164}
                  onChange={(e) => setRequestForm({ ...requestForm, phoneE164: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Request Type</label>
                <select
                  className="sarvya-select"
                  value={requestForm.requestType}
                  onChange={(e) => setRequestForm({ ...requestForm, requestType: e.target.value })}
                >
                  <option value="ERASURE">Erasure Request (Section 12)</option>
                  <option value="ACCESS">Access & Portability (Section 11)</option>
                  <option value="RECTIFICATION">Correction & Rectification</option>
                  <option value="GRIEVANCE">Grievance / Complaint</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Details / Notes</label>
                <textarea
                  rows={3}
                  value={requestForm.details}
                  onChange={(e) => setRequestForm({ ...requestForm, details: e.target.value })}
                  className="sarvya-input"
                  placeholder="Customer request details..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowRequestModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRequest}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {savingRequest ? 'Logging...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT TICKET STATUS MODAL */}
      {editTicket && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '440px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Update Ticket #{editTicket.id}</h3>
              <button
                type="button"
                onClick={() => setEditTicket(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTicketUpdateSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Ticket Status</label>
                <select
                  className="sarvya-select"
                  value={ticketStatusForm.status}
                  onChange={(e) => setTicketStatusForm({ ...ticketStatusForm, status: e.target.value })}
                >
                  <option value="PENDING">PENDING</option>
                  <option value="SCHEDULED_48H">SCHEDULED_48H</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="sarvya-field-label">Resolution Details</label>
                <textarea
                  rows={3}
                  value={ticketStatusForm.details}
                  onChange={(e) => setTicketStatusForm({ ...ticketStatusForm, details: e.target.value })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setEditTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingTicket}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {updatingTicket ? 'Saving...' : 'Update Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
