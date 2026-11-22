import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../ui';
import {
  Calendar,
  Clock,
  Layers,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  Check
} from 'lucide-react';

export default function UniversalAvailabilityTab({ token, selectedEntityId, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState([]);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [slotForm, setSlotForm] = useState({
    slot_date: new Date().toISOString().split('T')[0],
    start_time: '10:00:00',
    end_time: '11:00:00',
    total_capacity: 10,
    catalog_item_id: ''
  });
  const [bulkForm, setBulkForm] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    startTime: '09:00:00',
    endTime: '18:00:00',
    slotDurationMinutes: 30,
    totalCapacity: 5,
    catalogItemId: ''
  });
  const [actionLoading, setActionLoading] = useState(false);

  const inventoryColumns = useMemo(() => [
    {
      key: 'title',
      header: 'Item / Offering',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 600, color: '#111827' }}>{v}</span>
    },
    {
      key: 'category_name',
      header: 'Category',
      sortable: true,
      render: (v, r) => v || r.item_type || '-'
    },
    {
      key: 'inventory_mode',
      header: 'Inventory Mode',
      sortable: true,
      render: (v) => {
        const mode = v || 'UNIT_STOCK';
        return (
          <span style={{
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: mode === 'DATE_RANGE' ? '#DCFCE7' : (mode === 'TIME_SLOT' ? '#EDE9FE' : (mode === 'QUOTE_SERVICE' ? '#FEF3C7' : '#E0F2FE')),
            color: mode === 'DATE_RANGE' ? '#166534' : (mode === 'TIME_SLOT' ? '#5B21B6' : (mode === 'QUOTE_SERVICE' ? '#92400E' : '#0369A1'))
          }}>
            {mode}
          </span>
        );
      }
    },
    {
      key: 'stock_qty',
      header: 'Total Stock',
      align: 'right',
      sortable: true,
      render: (v, r) => <span className="tabular-nums">{r.track_inventory ? v : '∞ Infinite'}</span>
    },
    {
      key: 'reserved_qty',
      header: 'Reserved (Held)',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums" style={{ color: v > 0 ? '#D97706' : '#6B7280' }}>{v || 0}</span>
    },
    {
      key: 'available',
      header: 'Available Balance',
      align: 'right',
      sortable: true,
      accessor: (r) => Math.max(0, (r.stock_qty || 0) - (r.reserved_qty || 0)),
      render: (v, r) => (
        <span className="tabular-nums" style={{ fontWeight: 700, color: v > 0 ? '#16A34A' : '#DC2626' }}>
          {r.track_inventory ? v : 'Available'}
        </span>
      )
    },
    {
      key: 'is_sold_out',
      header: 'Status',
      align: 'center',
      render: (v) => (
        v ? <span style={{ color: '#DC2626', fontWeight: 600 }}>Sold Out</span> : <span style={{ color: '#16A34A', fontWeight: 600 }}>In Stock</span>
      )
    }
  ], []);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/universal/items?entityId=${selectedEntityId || ''}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch (err) {
      console.warn('Failed to fetch items for availability:', err.message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedEntityId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/universal/availability/slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...slotForm,
          entity_id: selectedEntityId || null,
          catalog_item_id: slotForm.catalog_item_id || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create slot');
      }
      showToast('Availability time slot added successfully!');
      setShowSlotModal(false);
      setSlots(prev => [...prev, data.slot]);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkGenerate = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/universal/availability/slots/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...bulkForm,
          catalogItemId: bulkForm.catalogItemId || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate bulk slots');
      }
      showToast(`Generated ${data.slotsGenerated || 0} slots across ${data.totalDates || 0} dates!`);
      setShowBulkModal(false);
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 4-Mode Availability Explanation Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Layers size={15} color="#2563EB" />
            <span>UNIT_STOCK Mode</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
            For Retail, D2C, Food & Wholesale. Real-time balance: <code>(Stock - Reserved)</code>.
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Calendar size={15} color="#16A34A" />
            <span>DATE_RANGE Mode</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
            For Hospitality & Resorts. Multi-night checks across check-in and check-out dates.
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Clock size={15} color="#7C3AED" />
            <span>TIME_SLOT Mode</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
            For Dental Clinics, Spas & Salons. Capacity scheduler per hour with instant holds.
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <Lock size={15} color="#D97706" />
            <span>QUOTE_SERVICE Mode</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
            For Real Estate & B2B. Instant lead capture with custom quotation & site visits.
          </div>
        </div>
      </div>

      {/* Real-Time Stock & Capacity Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Live Stock & Inventory Capacity
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6B7280' }}>
              Real-time available quantities deducting active 15-minute customer WhatsApp holds.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={fetchItems}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <span>⚡ Bulk Generator</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSlotModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} />
              <span>Add Time Slot</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', fontSize: '0.85rem' }}>
            Loading inventory records...
          </div>
        ) : (
          <DataTable
            columns={inventoryColumns}
            data={items}
            density="compact"
            pageSize={10}
            emptyMessage="No catalog items found for this entity. Seed a blueprint or add items in Tab 1."
          />
        )}
      </div>

      {/* Add Slot Modal */}
      {showSlotModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{ background: '#fff', borderRadius: '12px', maxWidth: '440px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>
              Add Availability Time Slot
            </h3>
            <form onSubmit={handleCreateSlot} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Date</label>
                <input
                  type="date"
                  value={slotForm.slot_date}
                  onChange={e => setSlotForm({ ...slotForm, slot_date: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Start Time</label>
                  <input
                    type="time"
                    value={slotForm.start_time.slice(0, 5)}
                    onChange={e => setSlotForm({ ...slotForm, start_time: `${e.target.value}:00` })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>End Time</label>
                  <input
                    type="time"
                    value={slotForm.end_time.slice(0, 5)}
                    onChange={e => setSlotForm({ ...slotForm, end_time: `${e.target.value}:00` })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Total Slot Capacity</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={slotForm.total_capacity}
                  onChange={e => setSlotForm({ ...slotForm, total_capacity: Number(e.target.value) })}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Link to Service / Item (Optional)</label>
                <select
                  value={slotForm.catalog_item_id}
                  onChange={e => setSlotForm({ ...slotForm, catalog_item_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  <option value="">All Services (Universal Slot)</option>
                  {items.filter(i => i.inventory_mode === 'TIME_SLOT').map(i => (
                    <option key={i.id} value={i.id}>{i.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowSlotModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {actionLoading ? 'Saving...' : 'Save Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Slot Generator Modal */}
      {showBulkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
              ⚡ Bulk Availability Slot Generator
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#6B7280', margin: '0 0 16px' }}>
              Generate recurring daily time slots for clinics, salons, wellness appointments, or sessions.
            </p>

            <form onSubmit={handleBulkGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Start Date</label>
                  <input
                    type="date"
                    value={bulkForm.startDate}
                    onChange={e => setBulkForm({ ...bulkForm, startDate: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>End Date</label>
                  <input
                    type="date"
                    value={bulkForm.endDate}
                    onChange={e => setBulkForm({ ...bulkForm, endDate: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Daily Start Time</label>
                  <input
                    type="time"
                    step="1"
                    value={bulkForm.startTime}
                    onChange={e => setBulkForm({ ...bulkForm, startTime: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Daily End Time</label>
                  <input
                    type="time"
                    step="1"
                    value={bulkForm.endTime}
                    onChange={e => setBulkForm({ ...bulkForm, endTime: e.target.value })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Slot Duration (Mins)</label>
                  <select
                    value={bulkForm.slotDurationMinutes}
                    onChange={e => setBulkForm({ ...bulkForm, slotDurationMinutes: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes (1 Hour)</option>
                    <option value={90}>90 Minutes</option>
                    <option value={120}>120 Minutes (2 Hours)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Capacity Per Slot</label>
                  <input
                    type="number"
                    min="1"
                    value={bulkForm.totalCapacity}
                    onChange={e => setBulkForm({ ...bulkForm, totalCapacity: Number(e.target.value) })}
                    required
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Link to Specific Service (Optional)</label>
                <select
                  value={bulkForm.catalogItemId}
                  onChange={e => setBulkForm({ ...bulkForm, catalogItemId: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  <option value="">All Services (Universal Slots)</option>
                  {items.filter(i => i.inventory_mode === 'TIME_SLOT').map(i => (
                    <option key={i.id} value={i.id}>{i.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#7C3AED', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  {actionLoading ? 'Generating...' : '⚡ Generate Slots'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

