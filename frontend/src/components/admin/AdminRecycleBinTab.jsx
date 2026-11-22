import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  Lock
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge
} from '../ui';
import { formatIndianDate } from '../../utils/indianTime';

const SUPPORTED_ENTITIES = [
  { value: 'ALL', label: 'All Entities' },
  { value: 'users', label: 'User Accounts' },
  { value: 'waba_phone_numbers', label: 'WhatsApp Phone Lines' },
  { value: 'conversation_flows', label: 'Conversation Flows' },
  { value: 'campaigns', label: 'Broadcast Campaigns' },
  { value: 'templates', label: 'WhatsApp Templates' },
  { value: 'contacts', label: 'Customer Contacts' },
  { value: 'enquiries', label: 'General Enquiries' },
  { value: 'booking_enquiries', label: 'Booking Enquiries' },
  { value: 'crm_pipelines', label: 'CRM Pipelines' },
  { value: 'crm_records', label: 'CRM Leads & Deals' },
  { value: 'business_entities', label: 'Business Entities' },
  { value: 'catalog_items', label: 'Catalog Items' },
  { value: 'room_types', label: 'Room Types' },
  { value: 'chat_links', label: 'Click-to-Chat Links' },
  { value: 'inapp_experiences', label: 'In-App Experiences' }
];

export default function AdminRecycleBinTab({
  token,
  flashSuccess,
  flashError
}) {
  const [entityType, setEntityType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Restore action
  const [restoringId, setRestoringId] = useState(null);

  // Hard Delete Modal
  const [hardDeleteTarget, setHardDeleteTarget] = useState(null);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [hardDeleting, setHardDeleting] = useState(false);

  const fetchDeletedItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/recycle-bin?entityType=${entityType}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data);
      } else {
        setItems([]);
      }
    } catch (err) {
      if (flashError) flashError(err.message || 'Failed to load recycle bin records');
    } finally {
      setLoading(false);
    }
  }, [token, entityType, flashError]);

  useEffect(() => {
    fetchDeletedItems();
  }, [fetchDeletedItems]);

  // Handle Restore
  const handleRestore = async (item) => {
    setRestoringId(item.id);
    try {
      const res = await fetch(`/api/admin/recycle-bin/${item.entityType}/${item.id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to restore item');
      }
      if (flashSuccess) flashSuccess(data.message || `Restored '${item.label}' successfully.`);
      fetchDeletedItems();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setRestoringId(null);
    }
  };

  // Handle Guarded Hard Delete
  const handleHardDeleteSubmit = async (e) => {
    e.preventDefault();
    if (!hardDeleteTarget || !confirmCheckbox) return;
    setHardDeleting(true);
    try {
      const res = await fetch(`/api/admin/recycle-bin/${hardDeleteTarget.entityType}/${hardDeleteTarget.id}/hard-delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ confirmHardDelete: true })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Hard delete failed');
      }
      if (flashSuccess) flashSuccess(data.message || `Permanently deleted record.`);
      setHardDeleteTarget(null);
      setConfirmCheckbox(false);
      fetchDeletedItems();
    } catch (err) {
      if (flashError) flashError(err.message);
    } finally {
      setHardDeleting(false);
    }
  };

  // Filtered Items
  const filteredItems = items.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (item.label && String(item.label).toLowerCase().includes(term)) ||
      (item.secondary && String(item.secondary).toLowerCase().includes(term)) ||
      (item.entityType && String(item.entityType).toLowerCase().includes(term)) ||
      (item.deleted_by && String(item.deleted_by).toLowerCase().includes(term))
    );
  });

  return (
    <Card>
      <CardHeader
        title="Universal Recycle Bin & Recovery Desk"
        icon={Trash2}
        action={
          <Button variant="secondary" onClick={fetchDeletedItems} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-slow' : ''} /> Refresh
          </Button>
        }
      />
      <CardBody>
        {/* Banner on Governance & Immutability */}
        <div style={{
          background: 'var(--bg-app)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={18} color="var(--sarvya-blue)" />
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <strong>Zero Data Loss Governance:</strong> Deleted entities remain safely soft-deleted until permanently purged. Financial and audit ledgers (<code>audit_logs</code>, <code>whatsapp_usage_ledger</code>, <code>merchant_payout_ledger</code>, <code>dpdp_consent_ledger</code>) are cryptographically immutable and permanently protected from hard deletion.
            </div>
          </div>
          <Badge variant="info">MySQL 8.4 Audit</Badge>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search deleted records by title, slug, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="sarvya-input"
              style={{ paddingLeft: '32px', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={15} color="var(--text-muted)" />
            <select
              className="sarvya-select"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              style={{ fontSize: '12.5px', minWidth: '190px' }}
            >
              {SUPPORTED_ENTITIES.map((ent) => (
                <option key={ent.value} value={ent.value}>{ent.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Deleted Records Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="sarvya-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px 14px' }}>Entity Type</th>
                <th style={{ padding: '10px 14px' }}>Item Title / Identifier</th>
                <th style={{ padding: '10px 14px' }}>Secondary Reference</th>
                <th style={{ padding: '10px 14px' }}>Deleted At</th>
                <th style={{ padding: '10px 14px' }}>Deleted By</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading deleted records...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={32} color="#16A34A" style={{ margin: '0 auto 8px' }} />
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Recycle Bin is Empty</div>
                    <div style={{ fontSize: '12px' }}>No deleted items found for selected filter.</div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={`${item.entityType}-${item.id}`} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant="secondary">
                        {item.displayName || item.entityType}
                      </Badge>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        ID: {String(item.id).substring(0, 18)}
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                      {item.secondary || '—'}
                    </td>

                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      {formatIndianDate(item.deleted_at || item.updated_at)}
                    </td>

                    <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {item.deleted_by || 'Admin'}
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={restoringId === item.id}
                          onClick={() => handleRestore(item)}
                          title="Restore item to active status"
                        >
                          <RotateCcw size={13} className={restoringId === item.id ? 'spin-slow' : ''} />
                          <span>Restore</span>
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setHardDeleteTarget(item);
                            setConfirmCheckbox(false);
                          }}
                          title="Permanently hard-delete"
                        >
                          <Trash2 size={13} />
                          <span>Purge</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardBody>

      {/* GUARDED HARD DELETE CONFIRMATION MODAL */}
      {hardDeleteTarget && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '460px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#DC2626', marginBottom: '14px' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Permanent Hard Delete</h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
              You are about to <strong>permanently purge</strong> this {hardDeleteTarget.displayName || hardDeleteTarget.entityType} record:
              <br />
              <strong style={{ color: 'var(--text-primary)' }}>"{hardDeleteTarget.label}"</strong> (ID: {hardDeleteTarget.id}).
              <br /><br />
              <span style={{ color: '#DC2626', fontWeight: 600 }}>WARNING:</span> This action is completely irreversible. All database rows and associated relations will be permanently destroyed.
            </p>

            <form onSubmit={handleHardDeleteSubmit}>
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  id="confirmHardDelete"
                  checked={confirmCheckbox}
                  onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="confirmHardDelete" style={{ fontSize: '12.5px', fontWeight: 600, color: '#991B1B', cursor: 'pointer' }}>
                  I understand this deletion is permanent and cannot be recovered.
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => {
                    setHardDeleteTarget(null);
                    setConfirmCheckbox(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!confirmCheckbox || hardDeleting}
                  className="sarvya-btn sarvya-btn-danger"
                >
                  {hardDeleting ? 'Purging...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
