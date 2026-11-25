import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  Tabs,
  FilterBar,
  SearchInput,
  DataTable,
  Drawer,
  Modal,
  Badge,
  Button,
  Card,
  CardBody,
  KpiCard
} from '../components/ui';
import {
  Calendar,
  Plus,
  Send,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Users,
  Phone,
  BedDouble,
  Trash2,
  LayoutGrid,
  List,
  Sparkles,
  TrendingUp,
  Award,
  Tag,
  ExternalLink,
  ChevronRight,
  Kanban
} from 'lucide-react';
import { formatIndianDateTime } from '../utils/indianTime';

const STATUS_BADGE = {
  NEW: { label: 'New', tone: 'blue' },
  QUOTED: { label: 'Quoted', tone: 'purple' },
  WON: { label: 'Confirmed Won', tone: 'green' },
  LOST: { label: 'Closed Lost', tone: 'coral' }
};

export default function EnquiriesPage() {
  const { token } = useAuth();
  const [crmTab, setCrmTab] = useState('pipeline'); // 'pipeline' | 'contacts'

  // Leads / Enquiries state
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEnquiry, setSelectedEnquiry] = useState(null);
  const [roomTypes, setRoomTypes] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);

  // Contacts Directory state
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactSearch, setContactSearch] = useState('');

  // Dynamic Multi-Industry CRM Pipelines & Records State
  const [pipelines, setPipelines] = useState([]);
  const [activePipelineId, setActivePipelineId] = useState(null);
  const [crmRecords, setCrmRecords] = useState([]);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmView, setCrmView] = useState('kanban'); // 'kanban' | 'table'
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [crmSearch, setCrmSearch] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  const [newForm, setNewForm] = useState({
    guest_name: '',
    phone: '',
    email: '',
    check_in: '',
    check_out: '',
    adults: 2,
    children: 0,
    rooms_requested: 1,
    room_type_id: '',
    notes: ''
  });

  const [quoteForm, setQuoteForm] = useState({
    items: [{ description: 'Room Stay', quantity: 1, nights: 1, unit_rate: 4500, room_type_id: '' }],
    tax_rate: 0.12,
    valid_until: '',
    notes: 'Includes complimentary breakfast buffet & property amenities.'
  });

  const getHeaders = useCallback(() => {
    const t = token || localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: t ? `Bearer ${t}` : ''
    };
  }, [token]);

  const loadEnquiries = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/v1/enquiries?status=${statusFilter}`;
      if (searchQuery.trim()) {
        url += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setEnquiries(data.enquiries || []);
      }
    } catch (err) {
      console.warn('Error loading enquiries:', err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, getHeaders]);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const q = contactSearch.trim() ? `?search=${encodeURIComponent(contactSearch.trim())}` : '';
      const res = await fetch(`/api/v1/contacts${q}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts || data.data || []);
      }
    } catch (err) {
      console.warn('Error loading contacts:', err.message);
    } finally {
      setContactsLoading(false);
    }
  }, [contactSearch, getHeaders]);

  const loadMetadata = useCallback(async () => {
    try {
      const [rtRes, staffRes] = await Promise.all([
        fetch('/api/v1/room-types', { headers: getHeaders() }),
        fetch('/api/admin/users', { headers: getHeaders() }).catch(() => ({ json: () => ({ success: false }) }))
      ]);
      const rtData = await rtRes.json();
      if (rtData.success) setRoomTypes(rtData.data || []);
      const staffData = await staffRes.json().catch(() => ({ success: false }));
      if (staffData.success) setStaffUsers(staffData.data || []);
    } catch {
      // Optional staff metadata for non-admin operators
    }
  }, [getHeaders]);

  useEffect(() => {
    loadEnquiries();
    loadMetadata();
  }, [loadEnquiries, loadMetadata]);

  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/crm/pipelines', { headers: getHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPipelines(data.data);
        if (data.data.length > 0 && !activePipelineId) {
          setActivePipelineId(data.data[0].id);
        }
      }
    } catch (err) {
      console.warn('Error loading CRM pipelines:', err.message);
    }
  }, [activePipelineId, getHeaders]);

  const loadCrmRecords = useCallback(async (pipelineId) => {
    if (!pipelineId) return;
    setCrmLoading(true);
    try {
      let url = `/api/v1/crm/records?pipeline_id=${pipelineId}`;
      if (crmSearch.trim()) {
        url += `&search=${encodeURIComponent(crmSearch.trim())}`;
      }
      const res = await fetch(url, { headers: getHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setCrmRecords(data.data);
      }
    } catch (err) {
      console.warn('Error loading CRM records:', err.message);
    } finally {
      setCrmLoading(false);
    }
  }, [crmSearch, getHeaders]);

  useEffect(() => {
    if (crmTab === 'dynamic_crm') {
      loadPipelines();
    }
  }, [crmTab, loadPipelines]);

  useEffect(() => {
    if (crmTab === 'dynamic_crm' && activePipelineId) {
      loadCrmRecords(activePipelineId);
    }
  }, [crmTab, activePipelineId, loadCrmRecords]);

  const handleUpdateRecordStage = async (recordId, newStageId) => {
    try {
      const res = await fetch(`/api/v1/crm/records/${recordId}/stage`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ stage_id: newStageId })
      });
      const data = await res.json();
      if (data.success) {
        loadCrmRecords(activePipelineId);
        if (selectedRecord && selectedRecord.id === recordId) {
          setSelectedRecord(prev => ({ ...prev, stage_id: newStageId }));
        }
      }
    } catch (err) {
      console.warn('Failed to update record stage:', err.message);
    }
  };

  useEffect(() => {
    if (crmTab === 'contacts') {
      loadContacts();
    }
  }, [crmTab, loadContacts]);

  async function handleSelectEnquiry(enquiryId) {
    try {
      const res = await fetch(`/api/v1/enquiries/${enquiryId}`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSelectedEnquiry(data.data);
      }
    } catch (err) {
      console.warn('Failed to load enquiry details:', err.message);
    }
  }

  async function handleUpdateStatus(newStatus, customNotes = null, customLostReason = null) {
    if (!selectedEnquiry) return;
    setSubmitting(true);
    try {
      const payload = { status: newStatus };
      if (customNotes) payload.notes = customNotes;
      if (customLostReason) payload.lost_reason = customLostReason;

      const res = await fetch(`/api/v1/enquiries/${selectedEnquiry.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setSelectedEnquiry(data.data);
        loadEnquiries();
        setActionNotice({ type: 'success', text: `Enquiry updated to ${newStatus}.` });
        setShowLostModal(false);
        setLostReason('');
      } else {
        setActionNotice({ type: 'error', text: data.message || 'Status update failed.' });
      }
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignStaff(staffId) {
    if (!selectedEnquiry) return;
    try {
      const res = await fetch(`/api/v1/enquiries/${selectedEnquiry.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ assigned_to: staffId })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedEnquiry(data.data);
        loadEnquiries();
      }
    } catch (err) {
      console.warn('Assign error:', err.message);
    }
  }

  async function handleCreateEnquiry(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/enquiries', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowNewModal(false);
        setNewForm({
          guest_name: '',
          phone: '',
          email: '',
          check_in: '',
          check_out: '',
          adults: 2,
          children: 0,
          rooms_requested: 1,
          room_type_id: '',
          notes: ''
        });
        loadEnquiries();
        setSelectedEnquiry(data.data);
        setActionNotice({ type: 'success', text: 'New booking enquiry created.' });
      } else {
        setActionNotice({ type: 'error', text: data.message || 'Failed to create enquiry.' });
      }
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenQuoteBuilder() {
    if (!selectedEnquiry) return;
    let nights = 1;
    if (selectedEnquiry.check_in && selectedEnquiry.check_out) {
      const diff = Math.round((new Date(selectedEnquiry.check_out) - new Date(selectedEnquiry.check_in)) / 86400000);
      if (diff > 0) nights = diff;
    }
    const defaultRate = selectedEnquiry.room_base_rate || 4500;
    const roomName = selectedEnquiry.room_type_name || selectedEnquiry.room_preference || 'Room Stay';

    const d = new Date();
    d.setDate(d.getDate() + 3);

    setQuoteForm({
      items: [{
        description: `${roomName} (${nights} night${nights > 1 ? 's' : ''})`,
        quantity: selectedEnquiry.rooms_requested || 1,
        nights,
        unit_rate: defaultRate,
        room_type_id: selectedEnquiry.room_type_id || ''
      }],
      tax_rate: 0.12,
      valid_until: d.toISOString().split('T')[0],
      notes: 'Includes complimentary breakfast buffet & standard resort amenities.'
    });
    setShowQuoteModal(true);
  }

  const quoteSubtotal = quoteForm.items.reduce(
    (sum, it) => sum + Number(it.quantity || 1) * Number(it.nights || 1) * Number(it.unit_rate || 0),
    0
  );
  const quoteTax = Math.round(quoteSubtotal * (Number(quoteForm.tax_rate) || 0.12));
  const quoteTotal = quoteSubtotal + quoteTax;

  async function handleCreateAndSendQuote(sendImmediately = true) {
    if (!selectedEnquiry) return;
    setSubmitting(true);
    try {
      const createRes = await fetch(`/api/v1/enquiries/${selectedEnquiry.id}/quotes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          items: quoteForm.items,
          currency: 'INR',
          tax_total: quoteTax,
          valid_until: quoteForm.valid_until,
          notes: quoteForm.notes
        })
      });
      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error(createData.message || 'Quotation creation failed.');
      }

      const quoteId = createData.data.id;
      if (sendImmediately) {
        const sendRes = await fetch(`/api/v1/quotes/${quoteId}/send`, {
          method: 'POST',
          headers: getHeaders()
        });
        const sendData = await sendRes.json();
        if (!sendData.success) {
          throw new Error(sendData.message || 'WhatsApp dispatch failed.');
        }
        setActionNotice({ type: 'success', text: `Quotation #${createData.data.quote_number} sent via WhatsApp.` });
      } else {
        setActionNotice({ type: 'success', text: `Quotation #${createData.data.quote_number} saved as draft.` });
      }

      setShowQuoteModal(false);
      handleSelectEnquiry(selectedEnquiry.id);
      loadEnquiries();
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const countsByStatus = enquiries.reduce(
    (acc, e) => {
      const k = e.status || 'NEW';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    { NEW: 0, QUOTED: 0, WON: 0, LOST: 0 }
  );

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="SARVYA CRM"
        description="Manage guest contacts, booking lead pipelines, availability verification, and WhatsApp quotations."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => (crmTab === 'pipeline' ? loadEnquiries() : loadContacts())}
              disabled={loading || contactsLoading}
            >
              <RefreshCw size={14} className={loading || contactsLoading ? 'spin-slow' : ''} />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setShowNewModal(true)}>
              <Plus size={14} />
              New Enquiry
            </Button>
          </>
        }
      />

      {actionNotice && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            fontSize: '13px',
            background: actionNotice.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
            color: actionNotice.type === 'success' ? 'var(--status-success-text)' : 'var(--status-error-text)',
            border: `1px solid ${actionNotice.type === 'success' ? 'var(--status-success-border)' : 'var(--status-error-border)'}`
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {actionNotice.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {actionNotice.text}
          </span>
          <button
            type="button"
            className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
            onClick={() => setActionNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="sarvya-kpi-grid">
        <KpiCard label="Visible Enquiries" value={enquiries.length} meta="Active pipeline records" icon={Users} accentTone="blue" />
        <KpiCard label="New Leads" value={countsByStatus.NEW} meta="Awaiting quotation" icon={Calendar} accentTone="blue" />
        <KpiCard label="Quoted" value={countsByStatus.QUOTED} meta="Proposals sent" icon={FileText} accentTone="purple" />
        <KpiCard label="Confirmed Won" value={countsByStatus.WON} meta="Converted bookings" icon={CheckCircle2} accentTone="green" />
      </div>

      {/* Horizontal CRM Module Tabs */}
      <Tabs
        activeTab={crmTab}
        onChange={setCrmTab}
        ariaLabel="CRM sections"
        tabs={[
          { id: 'pipeline', label: 'Lead Pipeline', icon: Calendar, count: enquiries.length },
          { id: 'dynamic_crm', label: 'Dynamic Pipelines', icon: LayoutGrid, count: crmRecords.length || null },
          { id: 'contacts', label: 'Contacts Directory', icon: Users, count: contacts.length || null }
        ]}
      />

      {crmTab === 'pipeline' && (
        <>
          <FilterBar
            left={
              <>
                <SearchInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search guest name, phone, or room..."
                  style={{ width: 'min(290px, 100%)' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {['ALL', 'NEW', 'QUOTED', 'WON', 'LOST'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`filter-chip ${statusFilter === st ? 'active' : ''}`}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st === 'ALL' ? 'All Stages' : STATUS_BADGE[st].label}
                    </button>
                  ))}
                </div>
              </>
            }
          />

          <DataTable
            density="compact"
            loading={loading}
            data={enquiries}
            selectedKey={selectedEnquiry?.id}
            onRowClick={(row) => handleSelectEnquiry(row.id)}
            ariaLabel="Booking lead pipeline table"
            emptyTitle="No enquiries match these filters"
            emptyDescription="Create a new manual booking enquiry or clear the search filter."
            emptyAction={
              <Button variant="primary" size="sm" onClick={() => setShowNewModal(true)}>
                <Plus size={14} />
                Create Enquiry
              </Button>
            }
            columns={[
              {
                key: 'guest_name',
                label: 'Guest',
                sortable: true,
                render: (row) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.guest_name}</div>
                    <div className="font-mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {row.phone_e164}
                    </div>
                  </div>
                )
              },
              {
                key: 'check_in',
                label: 'Stay Window',
                sortable: true,
                render: (row) => (
                  <span style={{ fontSize: '12.5px' }}>
                    {row.check_in} → {row.check_out}
                  </span>
                )
              },
              {
                key: 'room_type_name',
                label: 'Room & Guests',
                render: (row) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{row.room_type_name || row.room_preference || 'Standard'}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {row.adults} Adults, {row.children || 0} Child • {row.rooms_requested || 1} Rm
                    </div>
                  </div>
                )
              },
              {
                key: 'status',
                label: 'Stage',
                sortable: true,
                render: (row) => {
                  const meta = STATUS_BADGE[row.status] || { label: row.status, tone: 'neutral' };
                  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
                }
              },
              {
                key: 'latest_quote_total',
                label: 'Quote Value',
                sortable: true,
                align: 'end',
                render: (row) =>
                  row.latest_quote_total ? (
                    <span className="tabular-nums" style={{ fontWeight: 600 }}>
                      ₹{Number(row.latest_quote_total).toLocaleString('en-IN')}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>Unquoted</span>
                  )
              }
            ]}
          />
        </>
      )}

      {/* 2. DYNAMIC CRM PIPELINES & KANBAN / TABLE VIEW */}
      {crmTab === 'dynamic_crm' && (
        <>
          <FilterBar
            left={
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Pipeline:
                  </label>
                  <select
                    className="form-input"
                    value={activePipelineId || ''}
                    onChange={(e) => setActivePipelineId(Number(e.target.value))}
                    style={{ minWidth: '220px', padding: '6px 10px', fontSize: '0.82rem' }}
                  >
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.industry})</option>
                    ))}
                  </select>
                </div>

                <SearchInput
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  placeholder="Search deals, company, or phone..."
                  style={{ width: 'min(260px, 100%)' }}
                />
              </div>
            }
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => setCrmView('kanban')}
                    style={{
                      padding: '6px 10px',
                      background: crmView === 'kanban' ? 'var(--brand-primary, #2F5219)' : 'transparent',
                      color: crmView === 'kanban' ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.78rem',
                      fontWeight: 600
                    }}
                  >
                    <LayoutGrid size={13} />
                    <span>Kanban</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrmView('table')}
                    style={{
                      padding: '6px 10px',
                      background: crmView === 'table' ? 'var(--brand-primary, #2F5219)' : 'transparent',
                      color: crmView === 'table' ? '#FFFFFF' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.78rem',
                      fontWeight: 600
                    }}
                  >
                    <List size={13} />
                    <span>Table</span>
                  </button>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => loadCrmRecords(activePipelineId)}
                  disabled={crmLoading}
                  style={{ padding: '6px 10px' }}
                >
                  <RefreshCw size={13} className={crmLoading ? 'spin-slow' : ''} />
                </Button>
              </div>
            }
          />

          {/* Current Pipeline Stats Bar */}
          {(() => {
            const totalPipelineValue = crmRecords.reduce((sum, r) => sum + Number(r.deal_value || 0), 0);
            const avgScore = crmRecords.length > 0 
              ? Math.round(crmRecords.reduce((sum, r) => sum + Number(r.lead_score || 0), 0) / crmRecords.length) 
              : 0;

            return (
              <div style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                margin: '4px 0 12px 0'
              }}>
                <div style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.80rem'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Deals:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{crmRecords.length}</strong>
                </div>

                <div style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.80rem'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pipeline Value:</span>
                  <strong style={{ color: 'var(--brand-primary, #2F5219)' }}>
                    ₹{totalPipelineValue.toLocaleString('en-IN')}
                  </strong>
                </div>

                <div style={{
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card, #FFFFFF)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.80rem'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Avg Lead Score:</span>
                  <strong style={{ color: avgScore >= 70 ? '#16A34A' : avgScore >= 40 ? '#D97706' : 'var(--text-primary)' }}>
                    {avgScore} / 100
                  </strong>
                </div>
              </div>
            );
          })()}

          {/* Kanban Board View */}
          {crmView === 'kanban' && (
            <div style={{
              display: 'flex',
              gap: '14px',
              overflowX: 'auto',
              paddingBottom: '16px',
              minHeight: '480px'
            }}>
              {(() => {
                const currentPipeline = pipelines.find(p => p.id === activePipelineId);
                const stages = currentPipeline?.stages || [
                  { id: 'lead', name: 'Lead Inflow', color: '#3B82F6' },
                  { id: 'qualified', name: 'Qualified', color: '#2F5219' },
                  { id: 'proposal', name: 'Proposal Sent', color: '#8B5CF6' },
                  { id: 'won', name: 'Closed Won', color: '#16A34A' }
                ];

                return stages.map((stg) => {
                  const stageRecords = crmRecords.filter(r => r.stage_id === stg.id || r.stage_name === stg.name);
                  const stageTotalVal = stageRecords.reduce((sum, r) => sum + Number(r.deal_value || 0), 0);

                  return (
                    <div
                      key={stg.id}
                      style={{
                        width: '280px',
                        minWidth: '280px',
                        background: 'var(--bg-secondary, #F8FAFC)',
                        borderRadius: 'var(--radius-lg, 12px)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '650px'
                      }}
                    >
                      {/* Column Header */}
                      <div style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--bg-card, #FFFFFF)',
                        borderRadius: '12px 12px 0 0'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: stg.color || '#2F5219'
                          }} />
                          <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {stg.name}
                          </span>
                        </div>
                        <Badge tone="neutral">{stageRecords.length}</Badge>
                      </div>

                      {/* Column Subtotal */}
                      {stageTotalVal > 0 && (
                        <div style={{
                          padding: '6px 14px',
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          background: 'rgba(0,0,0,0.02)',
                          borderBottom: '1px solid var(--border-color)'
                        }}>
                          Stage Total: ₹{stageTotalVal.toLocaleString('en-IN')}
                        </div>
                      )}

                      {/* Cards Container */}
                      <div style={{
                        padding: '10px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        flex: 1
                      }}>
                        {stageRecords.length === 0 ? (
                          <div style={{
                            padding: '24px 10px',
                            textAlign: 'center',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)'
                          }}>
                            No records in this stage
                          </div>
                        ) : stageRecords.map((rec) => {
                          const parsedTags = (() => {
                            try {
                              return typeof rec.tags === 'string' ? JSON.parse(rec.tags) : (rec.tags || []);
                            } catch (e) {
                              return [];
                            }
                          })();

                          return (
                            <div
                              key={rec.id}
                              onClick={() => setSelectedRecord(rec)}
                              style={{
                                background: 'var(--bg-card, #FFFFFF)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                padding: '12px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {rec.title || rec.contact_name || 'Untitled Record'}
                                </div>
                                {rec.lead_score != null && (
                                  <span style={{
                                    fontSize: '0.70rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: rec.lead_score >= 70 ? '#DCFCE7' : rec.lead_score >= 40 ? '#FEF3C7' : '#F1F5F9',
                                    color: rec.lead_score >= 70 ? '#166534' : rec.lead_score >= 40 ? '#B45309' : '#475569'
                                  }}>
                                    Score: {rec.lead_score}
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Phone size={11} />
                                <span className="font-mono">{rec.contact_phone || '—'}</span>
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                                <span style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--brand-primary, #2F5219)' }}>
                                  ₹{Number(rec.deal_value || 0).toLocaleString('en-IN')}
                                </span>
                                {rec.status && (
                                  <Badge tone={rec.status === 'WON' ? 'green' : rec.status === 'LOST' ? 'coral' : 'blue'}>
                                    {rec.status}
                                  </Badge>
                                )}
                              </div>

                              {parsedTags.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                  {parsedTags.slice(0, 2).map((tg, i) => (
                                    <span key={i} style={{
                                      fontSize: '0.66rem',
                                      padding: '1px 5px',
                                      borderRadius: '3px',
                                      background: '#F1F5F9',
                                      color: '#475569'
                                    }}>
                                      {tg}
                                    </span>
                                  ))}
                                  {parsedTags.length > 2 && (
                                    <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>+{parsedTags.length - 2}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Table View */}
          {crmView === 'table' && (
            <DataTable
              density="compact"
              rows={crmRecords}
              keyField="id"
              loading={crmLoading}
              emptyMessage="No CRM records found in this pipeline."
              onRowClick={(row) => setSelectedRecord(row)}
              columns={[
                {
                  key: 'title',
                  label: 'Deal / Record',
                  sortable: true,
                  render: (row) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{row.title || 'Untitled Record'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.contact_name || ''}</div>
                    </div>
                  )
                },
                {
                  key: 'contact_phone',
                  label: 'WhatsApp Phone',
                  render: (row) => <span className="font-mono">{row.contact_phone || '—'}</span>
                },
                {
                  key: 'stage_name',
                  label: 'Stage',
                  sortable: true,
                  render: (row) => <Badge tone="blue">{row.stage_name || row.stage_id}</Badge>
                },
                {
                  key: 'lead_score',
                  label: 'Lead Score',
                  sortable: true,
                  render: (row) => (
                    <span style={{
                      fontWeight: 700,
                      color: (row.lead_score || 0) >= 70 ? '#16A34A' : (row.lead_score || 0) >= 40 ? '#D97706' : 'var(--text-secondary)'
                    }}>
                      {row.lead_score ?? '—'}
                    </span>
                  )
                },
                {
                  key: 'deal_value',
                  label: 'Deal Value',
                  sortable: true,
                  align: 'end',
                  render: (row) => (
                    <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--brand-primary, #2F5219)' }}>
                      ₹{Number(row.deal_value || 0).toLocaleString('en-IN')}
                    </span>
                  )
                },
                {
                  key: 'updated_at',
                  label: 'Last Updated',
                  sortable: true,
                  render: (row) => (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {row.updated_at ? formatIndianDateTime(row.updated_at) : '—'}
                    </span>
                  )
                }
              ]}
            />
          )}
        </>
      )}

      {crmTab === 'contacts' && (
        <>
          <FilterBar
            left={
              <SearchInput
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts by name or phone..."
                style={{ width: 'min(320px, 100%)' }}
              />
            }
            right={
              <Button variant="secondary" size="sm" onClick={loadContacts}>
                Search Contacts
              </Button>
            }
          />

          <DataTable
            density="compact"
            loading={contactsLoading}
            data={contacts}
            ariaLabel="CRM Contacts Directory"
            emptyTitle="No CRM contacts found"
            emptyDescription="Contacts captured via WhatsApp Flows, enquiries, and guest messaging appear here."
            columns={[
              {
                key: 'name',
                label: 'Contact',
                sortable: true,
                render: (row) => (
                  <div style={{ fontWeight: 600 }}>{row.name || row.guest_name || 'Guest Contact'}</div>
                )
              },
              {
                key: 'phone_e164',
                label: 'Phone',
                render: (row) => <span className="font-mono">{row.phone_e164 || row.phone}</span>
              },
              {
                key: 'email',
                label: 'Email',
                render: (row) => row.email || '—'
              },
              {
                key: 'created_at',
                label: 'Added',
                sortable: true,
                render: (row) => (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {row.created_at ? formatIndianDateTime(row.created_at) : '—'}
                  </span>
                )
              }
            ]}
          />
        </>
      )}

      {/* Contact / Enquiry Details Slide-Over Drawer */}
      <Drawer
        isOpen={Boolean(selectedEnquiry)}
        onClose={() => setSelectedEnquiry(null)}
        title={selectedEnquiry ? selectedEnquiry.guest_name : ''}
        subtitle={selectedEnquiry ? `Enquiry #${selectedEnquiry.id} • ${selectedEnquiry.phone_e164}` : ''}
        width="520px"
        footer={
          selectedEnquiry && (
            <>
              <Button variant="secondary" onClick={() => setSelectedEnquiry(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={handleOpenQuoteBuilder}>
                <FileText size={14} />
                Create &amp; Send Quote
              </Button>
            </>
          )
        }
      >
        {selectedEnquiry && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Indicative Inventory Banner */}
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${selectedEnquiry.availability_check?.available ? 'var(--status-success-border)' : 'var(--status-error-border)'}`,
              background: selectedEnquiry.availability_check?.available ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
              color: selectedEnquiry.availability_check?.available ? 'var(--status-success-text)' : 'var(--status-error-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <BedDouble size={15} />
                  {selectedEnquiry.availability_check?.available ? 'Rooms Available in Inventory' : 'Unconfirmed / Limited Inventory'}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.88, marginTop: '2px' }}>
                  {selectedEnquiry.availability_check?.nights || 1} night(s) • Min {selectedEnquiry.availability_check?.min_available_qty || 0} unit(s) free
                </div>
              </div>
              <Badge tone="neutral">Indicative</Badge>
            </div>

            {/* Stay & Contact Context */}
            <Card>
              <CardBody style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Stage</div>
                  <div style={{ marginTop: '4px' }}>
                    <Badge tone={STATUS_BADGE[selectedEnquiry.status]?.tone || 'neutral'} dot>
                      {STATUS_BADGE[selectedEnquiry.status]?.label || selectedEnquiry.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>WhatsApp</div>
                  <div className="font-mono" style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={12} /> {selectedEnquiry.phone_e164}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Stay Window</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                    {selectedEnquiry.check_in} → {selectedEnquiry.check_out}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Party &amp; Room</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                    {selectedEnquiry.adults}A / {selectedEnquiry.children || 0}C • {selectedEnquiry.rooms_requested || 1} Rm
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Assignment & Stage Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="sarvya-field-label" htmlFor="crmAssignee">Assigned Owner</label>
                <select
                  id="crmAssignee"
                  className="sarvya-select"
                  value={selectedEnquiry.assigned_to || ''}
                  onChange={(e) => handleAssignStaff(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedEnquiry.status !== 'WON' && (
                  <Button variant="secondary" size="sm" onClick={() => handleUpdateStatus('WON')}>
                    <CheckCircle2 size={14} /> Mark Booking Won
                  </Button>
                )}
                {selectedEnquiry.status !== 'LOST' && (
                  <Button variant="danger" size="sm" onClick={() => setShowLostModal(true)}>
                    <XCircle size={14} /> Mark Lost
                  </Button>
                )}
              </div>
            </div>

            {selectedEnquiry.notes && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Notes</div>
                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  {selectedEnquiry.notes}
                </div>
              </div>
            )}

            {/* Quotation Timeline */}
            <div>
              <h4 style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '10px' }}>
                Activity &amp; Quotation History ({selectedEnquiry.quotes?.length || 0})
              </h4>
              {(!selectedEnquiry.quotes || selectedEnquiry.quotes.length === 0) ? (
                <div style={{ padding: '14px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  No quotations generated for this lead yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedEnquiry.quotes.map((q) => (
                    <div
                      key={q.id}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>
                          #{q.quote_number} • ₹{Number(q.total).toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                          Valid until {q.valid_until} • {q.created_by_name || 'Staff'}
                        </div>
                      </div>
                      <Badge tone={q.status === 'SENT' ? 'green' : 'neutral'}>{q.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal 1: Create Enquiry */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Booking Enquiry"
        subtitle="Capture a guest lead manually in SARVYA CRM"
        icon={Plus}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button type="submit" form="create-enquiry-form" variant="primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Enquiry'}
            </Button>
          </>
        }
      >
        <form id="create-enquiry-form" onSubmit={handleCreateEnquiry} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="sarvya-field-label" htmlFor="enqGuestName">Guest Full Name *</label>
            <input
              id="enqGuestName"
              type="text"
              required
              className="sarvya-input"
              value={newForm.guest_name}
              onChange={(e) => setNewForm({ ...newForm, guest_name: e.target.value })}
              placeholder="e.g. Aarav Kulkarni"
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqPhone">WhatsApp Phone *</label>
            <input
              id="enqPhone"
              type="text"
              required
              className="sarvya-input"
              value={newForm.phone}
              onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
              placeholder="919820012345"
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqEmail">Email</label>
            <input
              id="enqEmail"
              type="email"
              className="sarvya-input"
              value={newForm.email}
              onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqCheckIn">Check-in *</label>
            <input
              id="enqCheckIn"
              type="date"
              required
              className="sarvya-input"
              value={newForm.check_in}
              onChange={(e) => setNewForm({ ...newForm, check_in: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqCheckOut">Check-out *</label>
            <input
              id="enqCheckOut"
              type="date"
              required
              className="sarvya-input"
              value={newForm.check_out}
              onChange={(e) => setNewForm({ ...newForm, check_out: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqRoomType">Room Category</label>
            <select
              id="enqRoomType"
              className="sarvya-select"
              value={newForm.room_type_id}
              onChange={(e) => setNewForm({ ...newForm, room_type_id: e.target.value })}
            >
              <option value="">Any Available Category</option>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name} (₹{rt.base_rate})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqRooms">Rooms Requested</label>
            <input
              id="enqRooms"
              type="number"
              min="1"
              className="sarvya-input"
              value={newForm.rooms_requested}
              onChange={(e) => setNewForm({ ...newForm, rooms_requested: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqAdults">Adults</label>
            <input
              id="enqAdults"
              type="number"
              min="1"
              className="sarvya-input"
              value={newForm.adults}
              onChange={(e) => setNewForm({ ...newForm, adults: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="enqChildren">Children</label>
            <input
              id="enqChildren"
              type="number"
              min="0"
              className="sarvya-input"
              value={newForm.children}
              onChange={(e) => setNewForm({ ...newForm, children: Number(e.target.value) })}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="sarvya-field-label" htmlFor="enqNotes">Notes</label>
            <textarea
              id="enqNotes"
              rows={2}
              className="sarvya-textarea"
              value={newForm.notes}
              onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Modal 2: Quotation Builder */}
      <Modal
        isOpen={showQuoteModal}
        onClose={() => setShowQuoteModal(false)}
        title="Itemized Quotation Builder"
        subtitle={selectedEnquiry ? `Prepare quotation for ${selectedEnquiry.guest_name}` : ''}
        icon={FileText}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowQuoteModal(false)}>Cancel</Button>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => handleCreateAndSendQuote(false)}>
              Save Draft
            </Button>
            <Button type="button" variant="primary" disabled={submitting} onClick={() => handleCreateAndSendQuote(true)}>
              <Send size={14} />
              {submitting ? 'Dispatching...' : 'Send via WhatsApp'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {quoteForm.items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 70px 70px 100px auto',
                gap: '8px',
                alignItems: 'end'
              }}
            >
              <div>
                <label className="sarvya-field-label">Description</label>
                <input
                  type="text"
                  className="sarvya-input"
                  value={item.description}
                  onChange={(e) => {
                    const items = [...quoteForm.items];
                    items[idx] = { ...items[idx], description: e.target.value };
                    setQuoteForm({ ...quoteForm, items });
                  }}
                />
              </div>
              <div>
                <label className="sarvya-field-label">Qty</label>
                <input
                  type="number"
                  min="1"
                  className="sarvya-input"
                  value={item.quantity}
                  onChange={(e) => {
                    const items = [...quoteForm.items];
                    items[idx] = { ...items[idx], quantity: Number(e.target.value) };
                    setQuoteForm({ ...quoteForm, items });
                  }}
                />
              </div>
              <div>
                <label className="sarvya-field-label">Nights</label>
                <input
                  type="number"
                  min="1"
                  className="sarvya-input"
                  value={item.nights}
                  onChange={(e) => {
                    const items = [...quoteForm.items];
                    items[idx] = { ...items[idx], nights: Number(e.target.value) };
                    setQuoteForm({ ...quoteForm, items });
                  }}
                />
              </div>
              <div>
                <label className="sarvya-field-label">Rate (₹)</label>
                <input
                  type="number"
                  min="0"
                  className="sarvya-input"
                  value={item.unit_rate}
                  onChange={(e) => {
                    const items = [...quoteForm.items];
                    items[idx] = { ...items[idx], unit_rate: Number(e.target.value) };
                    setQuoteForm({ ...quoteForm, items });
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={quoteForm.items.length <= 1}
                onClick={() => setQuoteForm({ ...quoteForm, items: quoteForm.items.filter((_, i) => i !== idx) })}
                aria-label="Remove item"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setQuoteForm((prev) => ({
                  ...prev,
                  items: [...prev.items, { description: 'Add-on Experience', quantity: 1, nights: 1, unit_rate: 1200, room_type_id: '' }]
                }))
              }
            >
              <Plus size={13} /> Add Line Item
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="quoteValidUntil">Valid Until</label>
              <input
                id="quoteValidUntil"
                type="date"
                className="sarvya-input"
                value={quoteForm.valid_until}
                onChange={(e) => setQuoteForm({ ...quoteForm, valid_until: e.target.value })}
              />
            </div>
            <div>
              <label className="sarvya-field-label" htmlFor="quoteTaxRate">Tax Rate</label>
              <select
                id="quoteTaxRate"
                className="sarvya-select"
                value={quoteForm.tax_rate}
                onChange={(e) => setQuoteForm({ ...quoteForm, tax_rate: Number(e.target.value) })}
              >
                <option value={0}>0% (Exempt)</option>
                <option value={0.05}>5% GST</option>
                <option value={0.12}>12% GST</option>
                <option value={0.18}>18% GST</option>
              </select>
            </div>
          </div>

          <div>
            <label className="sarvya-field-label" htmlFor="quoteNotes">Inclusions / Terms</label>
            <textarea
              id="quoteNotes"
              rows={2}
              className="sarvya-textarea"
              value={quoteForm.notes}
              onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
            />
          </div>

          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Subtotal ₹{quoteSubtotal.toLocaleString('en-IN')} + Tax ₹{quoteTax.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Total: ₹{quoteTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </Modal>

      {/* Modal 3: Mark Lost */}
      <Modal
        isOpen={showLostModal}
        onClose={() => setShowLostModal(false)}
        title="Mark Enquiry Closed Lost"
        subtitle="Record the reason so Insights reflects accurate win/loss diagnostics"
        icon={XCircle}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowLostModal(false)}>Cancel</Button>
            <Button
              type="button"
              variant="danger"
              disabled={submitting || !lostReason.trim()}
              onClick={() => handleUpdateStatus('LOST', null, lostReason)}
            >
              Confirm Closed Lost
            </Button>
          </>
        }
      >
        <div>
          <label className="sarvya-field-label" htmlFor="lostReasonInput">Lost Reason *</label>
          <input
            id="lostReasonInput"
            type="text"
            className="sarvya-input"
            placeholder="e.g. Dates sold out, budget mismatch, or unresponsive"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Dynamic CRM Record Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.title || 'CRM Record Details'}
        subtitle={selectedRecord ? `Phone: ${selectedRecord.contact_phone} • Pipeline #${selectedRecord.pipeline_id}` : ''}
        width="480px"
        footer={
          selectedRecord && (
            <Button variant="secondary" onClick={() => setSelectedRecord(null)}>
              Close
            </Button>
          )
        }
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Card>
              <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Change Stage</label>
                  <select
                    className="form-input"
                    value={selectedRecord.stage_id}
                    onChange={(e) => handleUpdateRecordStage(selectedRecord.id, e.target.value)}
                  >
                    {(pipelines.find(p => p.id === selectedRecord.pipeline_id)?.stages || []).map(stg => (
                      <option key={stg.id} value={stg.id}>{stg.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Deal Value (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={selectedRecord.deal_value || 0}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Lead Score (0-100)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={selectedRecord.lead_score || 0}
                      readOnly
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Associated Customer Phone</label>
                  <div className="font-mono" style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--brand-primary, #2F5219)' }}>
                    {selectedRecord.contact_phone}
                  </div>
                </div>

                {selectedRecord.notes && (
                  <div>
                    <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600 }}>Notes / Summary</label>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px' }}>
                      {selectedRecord.notes}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
