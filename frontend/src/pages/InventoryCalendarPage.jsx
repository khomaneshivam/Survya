import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  FilterBar,
  Modal,
  Badge,
  Button,
  EmptyState
} from '../components/ui';
import {
  BedDouble,
  Plus,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  Sliders
} from 'lucide-react';

export default function InventoryCalendarPage() {
  const { token } = useAuth();
  const [roomTypes, setRoomTypes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 13);
    return d.toISOString().split('T')[0];
  });

  const [localEdits, setLocalEdits] = useState({});
  const [showRoomTypeModal, setShowRoomTypeModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const [newRoomForm, setNewRoomForm] = useState({
    name: '',
    base_rate: 4500,
    max_adults: 2,
    max_children: 1,
    description: ''
  });

  const [bulkForm, setBulkForm] = useState({
    room_type_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: endDate,
    available_qty: 6,
    base_rate: 4500,
    is_closed: false
  });

  const getHeaders = useCallback(() => {
    const t = token || localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: t ? `Bearer ${t}` : ''
    };
  }, [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rtRes, invRes] = await Promise.all([
        fetch('/api/v1/room-types', { headers: getHeaders() }),
        fetch(`/api/v1/inventory/availability?start_date=${startDate}&end_date=${endDate}`, { headers: getHeaders() })
      ]);
      const rtData = await rtRes.json();
      const invData = await invRes.json();

      if (rtData.success) {
        setRoomTypes(rtData.data || []);
        if (rtData.data?.length > 0) {
          setBulkForm((prev) => (prev.room_type_id ? prev : { ...prev, room_type_id: rtData.data[0].id }));
        }
      }
      if (invData.success) {
        setAvailability(invData.data?.by_room_type || []);
      }
    } catch (err) {
      console.warn('Error loading inventory:', err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, getHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dateList = [];
  if (startDate && endDate) {
    const cur = new Date(startDate);
    const stop = new Date(endDate);
    while (cur <= stop && dateList.length < 31) {
      dateList.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
    }
  }

  function getCellValue(roomTypeId, dateStr, field, defaultVal) {
    const editKey = `${roomTypeId}_${dateStr}`;
    if (localEdits[editKey] && localEdits[editKey][field] !== undefined) {
      return localEdits[editKey][field];
    }
    const room = availability.find((r) => r.room_type_id === roomTypeId);
    if (room?.dates?.[dateStr]) {
      return room.dates[dateStr][field];
    }
    return defaultVal;
  }

  function handleCellChange(roomTypeId, dateStr, field, value) {
    const editKey = `${roomTypeId}_${dateStr}`;
    setLocalEdits((prev) => {
      const current = prev[editKey] || {
        available_qty: getCellValue(roomTypeId, dateStr, 'available_qty', 5),
        base_rate: getCellValue(roomTypeId, dateStr, 'base_rate', 4500),
        is_closed: getCellValue(roomTypeId, dateStr, 'is_closed', false)
      };
      return {
        ...prev,
        [editKey]: {
          ...current,
          room_type_id: roomTypeId,
          inventory_date: dateStr,
          [field]: value
        }
      };
    });
  }

  async function handleSaveAll() {
    const updates = Object.values(localEdits);
    if (updates.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch('/api/v1/inventory/daily', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ updates })
      });
      const data = await res.json();
      if (data.success) {
        setLocalEdits({});
        setToast({ type: 'success', text: `Saved ${updates.length} inventory updates.` });
        loadData();
      } else {
        setToast({ type: 'error', text: data.message || 'Save failed.' });
      }
    } catch (err) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateRoomType(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/room-types', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(newRoomForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowRoomTypeModal(false);
        setNewRoomForm({ name: '', base_rate: 4500, max_adults: 2, max_children: 1, description: '' });
        setToast({ type: 'success', text: `Room category "${data.data.name}" created.` });
        loadData();
      } else {
        setToast({ type: 'error', text: data.message });
      }
    } catch (err) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyBulk(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const cur = new Date(bulkForm.start_date);
      const stop = new Date(bulkForm.end_date);
      const updates = [];
      while (cur <= stop) {
        updates.push({
          room_type_id: Number(bulkForm.room_type_id),
          inventory_date: cur.toISOString().split('T')[0],
          available_qty: Number(bulkForm.available_qty),
          base_rate: Number(bulkForm.base_rate),
          is_closed: bulkForm.is_closed ? 1 : 0
        });
        cur.setDate(cur.getDate() + 1);
      }

      const res = await fetch('/api/v1/inventory/daily', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ updates })
      });
      const data = await res.json();
      if (data.success) {
        setShowBulkModal(false);
        setToast({ type: 'success', text: `Bulk inventory applied to ${updates.length} date(s).` });
        loadData();
      } else {
        setToast({ type: 'error', text: data.message });
      }
    } catch (err) {
      setToast({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const editCount = Object.keys(localEdits).length;

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Hospitality Module — Room Inventory"
        description="Industry workspace for room categories, nightly rates, available units, and blackout controls."
        actions={
          <>
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-slow' : ''} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setShowBulkModal(true)} disabled={roomTypes.length === 0}>
              <Sliders size={14} />
              Bulk Edit Dates
            </Button>
            <Button variant="secondary" onClick={() => setShowRoomTypeModal(true)}>
              <Plus size={14} />
              Add Room Category
            </Button>
            <Button variant="primary" onClick={handleSaveAll} disabled={saving || editCount === 0}>
              <Save size={14} />
              Save Changes {editCount > 0 ? `(${editCount})` : ''}
            </Button>
          </>
        }
      />

      {toast && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
            background: toast.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
            color: toast.type === 'success' ? 'var(--status-success-text)' : 'var(--status-error-text)',
            border: `1px solid ${toast.type === 'success' ? 'var(--status-success-border)' : 'var(--status-error-border)'}`
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {toast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {toast.text}
          </span>
          <button type="button" className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      )}

      <FilterBar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              From:
              <input
                type="date"
                className="sarvya-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: 'auto', marginInlineStart: '6px', padding: '5px 10px' }}
              />
            </label>
            <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              To:
              <input
                type="date"
                className="sarvya-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: 'auto', marginInlineStart: '6px', padding: '5px 10px' }}
              />
            </label>
          </div>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge tone="blue">{roomTypes.length} Categories</Badge>
            <Badge tone="neutral">{dateList.length} Days Shown</Badge>
          </div>
        }
      />

      {roomTypes.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={BedDouble}
            title="No room categories defined yet"
            description="Create your first room category to manage daily quantities, seasonal tariffs, and open/closed status."
            action={
              <Button variant="primary" onClick={() => setShowRoomTypeModal(true)}>
                <Plus size={14} /> Add Room Category
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Daily Availability & Tariff Matrix"
            subtitle="Edit nightly room counts, INR rates, or toggle date locks inline. Unsaved cells highlight automatically."
          />
          <CardBody style={{ padding: 0 }}>
            <div className="table-wrapper" tabIndex={0} role="region" aria-label="Room Inventory Matrix" style={{ border: 'none', borderRadius: 0 }}>
              <table className="sarvya-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ minWidth: '185px', position: 'sticky', left: 0, zIndex: 3 }}>
                      Room Category
                    </th>
                    {dateList.map((d) => {
                      const dateObj = new Date(`${d}T00:00:00`);
                      const dayLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
                      return (
                        <th key={d} scope="col" style={{ minWidth: '112px', textAlign: 'center' }}>
                          {dayLabel}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {roomTypes.map((rt) => (
                    <tr key={rt.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1, fontWeight: 600, borderInlineEnd: '1px solid var(--border-subtle)' }}>
                        <div>{rt.name}</div>
                        <div style={{ fontSize: '11.5px', fontWeight: 400, color: 'var(--text-secondary)' }}>
                          Base ₹{Number(rt.base_rate || 0).toLocaleString('en-IN')} • Max {rt.max_adults}A/{rt.max_children}C
                        </div>
                      </td>
                      {dateList.map((d) => {
                        const qty = getCellValue(rt.id, d, 'available_qty', 5);
                        const rate = getCellValue(rt.id, d, 'base_rate', rt.base_rate || 4500);
                        const isClosed = Boolean(getCellValue(rt.id, d, 'is_closed', false));
                        const isDirty = Boolean(localEdits[`${rt.id}_${d}`]);

                        return (
                          <td
                            key={d}
                            style={{
                              padding: '8px',
                              background: isDirty ? 'var(--sarvya-blue-soft)' : isClosed ? 'var(--status-error-bg)' : undefined
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  aria-label={`${rt.name} ${d} quantity`}
                                  className="sarvya-input"
                                  value={qty}
                                  onChange={(e) => handleCellChange(rt.id, d, 'available_qty', Number(e.target.value))}
                                  style={{ padding: '4px 6px', fontSize: '12px', textAlign: 'center' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleCellChange(rt.id, d, 'is_closed', !isClosed)}
                                  title={isClosed ? 'Unlock date' : 'Close date'}
                                  className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
                                  style={{ padding: '4px 6px' }}
                                >
                                  {isClosed ? <Lock size={12} color="var(--status-error-text)" /> : <Unlock size={12} />}
                                </button>
                              </div>
                              <input
                                type="number"
                                min="0"
                                aria-label={`${rt.name} ${d} rate`}
                                className="sarvya-input"
                                value={rate}
                                onChange={(e) => handleCellChange(rt.id, d, 'base_rate', Number(e.target.value))}
                                style={{ padding: '3px 6px', fontSize: '11.5px', textAlign: 'center', color: 'var(--text-secondary)' }}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Create Room Type Modal */}
      <Modal
        isOpen={showRoomTypeModal}
        onClose={() => setShowRoomTypeModal(false)}
        title="Add Room Category"
        subtitle="Create a new hospitality inventory unit with 30-day default availability"
        icon={BedDouble}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowRoomTypeModal(false)}>Cancel</Button>
            <Button type="submit" form="create-room-type-form" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Category'}
            </Button>
          </>
        }
      >
        <form id="create-room-type-form" onSubmit={handleCreateRoomType} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="sarvya-field-label" htmlFor="rtName">Category Name *</label>
            <input
              id="rtName"
              type="text"
              required
              className="sarvya-input"
              placeholder="e.g. Sea View Cottage"
              value={newRoomForm.name}
              onChange={(e) => setNewRoomForm({ ...newRoomForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="rtRate">Base Tariff (₹)</label>
            <input
              id="rtRate"
              type="number"
              min="0"
              required
              className="sarvya-input"
              value={newRoomForm.base_rate}
              onChange={(e) => setNewRoomForm({ ...newRoomForm, base_rate: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="rtAdults">Max Adults</label>
            <input
              id="rtAdults"
              type="number"
              min="1"
              className="sarvya-input"
              value={newRoomForm.max_adults}
              onChange={(e) => setNewRoomForm({ ...newRoomForm, max_adults: Number(e.target.value) })}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="sarvya-field-label" htmlFor="rtDesc">Description</label>
            <textarea
              id="rtDesc"
              rows={2}
              className="sarvya-textarea"
              value={newRoomForm.description}
              onChange={(e) => setNewRoomForm({ ...newRoomForm, description: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Bulk Update Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Inventory Adjustment"
        subtitle="Apply room counts, rates, or closures across a multi-day date range"
        icon={Sliders}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setShowBulkModal(false)}>Cancel</Button>
            <Button type="submit" form="bulk-inv-form" variant="primary" disabled={saving}>
              {saving ? 'Applying...' : 'Apply Range Update'}
            </Button>
          </>
        }
      >
        <form id="bulk-inv-form" onSubmit={handleApplyBulk} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="sarvya-field-label" htmlFor="bulkRoom">Room Category *</label>
            <select
              id="bulkRoom"
              className="sarvya-select"
              required
              value={bulkForm.room_type_id}
              onChange={(e) => setBulkForm({ ...bulkForm, room_type_id: e.target.value })}
            >
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="bulkStart">Start Date *</label>
            <input
              id="bulkStart"
              type="date"
              required
              className="sarvya-input"
              value={bulkForm.start_date}
              onChange={(e) => setBulkForm({ ...bulkForm, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="bulkEnd">End Date *</label>
            <input
              id="bulkEnd"
              type="date"
              required
              className="sarvya-input"
              value={bulkForm.end_date}
              onChange={(e) => setBulkForm({ ...bulkForm, end_date: e.target.value })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="bulkQty">Available Rooms</label>
            <input
              id="bulkQty"
              type="number"
              min="0"
              required
              className="sarvya-input"
              value={bulkForm.available_qty}
              onChange={(e) => setBulkForm({ ...bulkForm, available_qty: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="sarvya-field-label" htmlFor="bulkRate">Nightly Tariff (₹)</label>
            <input
              id="bulkRate"
              type="number"
              min="0"
              required
              className="sarvya-input"
              value={bulkForm.base_rate}
              onChange={(e) => setBulkForm({ ...bulkForm, base_rate: Number(e.target.value) })}
            />
          </div>
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={bulkForm.is_closed}
              onChange={(e) => setBulkForm({ ...bulkForm, is_closed: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: 'var(--sarvya-blue)' }}
            />
            <span>Mark all dates in range as Closed / Sold Out</span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
