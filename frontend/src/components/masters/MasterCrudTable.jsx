import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react';

export default function MasterCrudTable({
  masterType,
  masterTitle,
  columns = [],
  fields = [],
  emptyText = 'No records found.'
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/masters/${masterType}?includeInactive=true`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      } else {
        setError(data.error || 'Failed to fetch items');
      }
    } catch (err) {
      setError(err.message || 'Network error fetching master records');
    } finally {
      setLoading(false);
    }
  }, [masterType]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    const initial = {};
    for (const f of fields) {
      initial[f.key] = f.defaultValue !== undefined ? f.defaultValue : '';
    }
    setFormData(initial);
    setModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    const initial = {};
    for (const f of fields) {
      initial[f.key] = item[f.key] !== undefined ? item[f.key] : (f.defaultValue || '');
    }
    setFormData(initial);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const isEdit = Boolean(editingItem);
      const url = isEdit
        ? `/api/v1/masters/${masterType}/${editingItem.id}`
        : `/api/v1/masters/${masterType}`;
      const method = isEdit ? 'PUT' : 'POST';

      // Clean payload: parse JSON fields if required
      const payload = { ...formData };
      for (const f of fields) {
        if (f.type === 'json' && typeof payload[f.key] === 'string') {
          try {
            payload[f.key] = JSON.parse(payload[f.key]);
          } catch (err) {
            // Keep as is or alert
          }
        }
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(isEdit ? 'Record updated successfully!' : 'Record created successfully!');
        handleCloseModal();
        fetchItems();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save record');
      }
    } catch (err) {
      setError(err.message || 'Error saving record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/masters/${masterType}/${id}/toggle-active`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchItems();
      } else {
        setError(data.error || 'Failed to toggle status');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to soft-delete "${name || 'this item'}"? It can be restored from the Recycle Bin.`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/v1/masters/${masterType}/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Item moved to Recycle Bin.');
        fetchItems();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to delete');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMoveOrder = async (index, direction) => {
    const newItems = [...items];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;

    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setItems(newItems);

    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/v1/masters/${masterType}/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ orderedIds: newItems.map(i => i.id) })
      });
    } catch (err) {
      // Background reorder silently fails
    }
  };

  const filteredItems = items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return Object.values(item).some(val =>
      typeof val === 'string' && val.toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            {masterTitle}
          </h2>
          <p style={{ fontSize: '0.82rem', color: '#64748B', margin: '4px 0 0 0' }}>
            ERP-grade master dictionary for WhatsApp flow nodes and in-app checkout screens.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#F8FAFC',
              color: '#475569',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              background: '#10B981',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(16, 185, 129, 0.2)'
            }}
          >
            <Plus size={15} />
            Add New Record
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '0.84rem', marginBottom: '14px' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', fontSize: '0.84rem', marginBottom: '14px' }}>
          ✅ {success}
        </div>
      )}

      {/* Filter toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px' }}>
        <Search size={16} color="#94A3B8" />
        <input
          type="text"
          placeholder={`Search ${masterTitle}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: '0.84rem',
            width: '100%',
            color: '#1E293B'
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B' }}>
              <th style={{ padding: '10px 8px', width: '50px' }}>Order</th>
              {columns.map(col => (
                <th key={col.key} style={{ padding: '10px 12px', width: col.width || 'auto' }}>
                  {col.label}
                </th>
              ))}
              <th style={{ padding: '10px 12px', width: '90px' }}>Status</th>
              <th style={{ padding: '10px 12px', width: '100px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item, index) => {
              const isActive = Boolean(item.active_status);
              return (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: '1px solid #F1F5F9',
                    background: isActive ? '#FFFFFF' : '#F8FAFC',
                    opacity: isActive ? 1 : 0.65
                  }}
                >
                  <td style={{ padding: '8px', verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        type="button"
                        onClick={() => handleMoveOrder(index, -1)}
                        disabled={index === 0}
                        style={{ border: 'none', background: 'transparent', cursor: index === 0 ? 'not-allowed' : 'pointer', color: index === 0 ? '#CBD5E1' : '#64748B', padding: '1px' }}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveOrder(index, 1)}
                        disabled={index === filteredItems.length - 1}
                        style={{ border: 'none', background: 'transparent', cursor: index === filteredItems.length - 1 ? 'not-allowed' : 'pointer', color: index === filteredItems.length - 1 ? '#CBD5E1' : '#64748B', padding: '1px' }}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </td>

                  {columns.map(col => {
                    let val = item[col.key];
                    if (col.type === 'json' && typeof val === 'object') {
                      val = JSON.stringify(val);
                    }
                    if (col.render) {
                      return <td key={col.key} style={{ padding: '10px 12px' }}>{col.render(val, item)}</td>;
                    }
                    return (
                      <td key={col.key} style={{ padding: '10px 12px', color: '#1E293B', fontWeight: col.isPrimary ? 600 : 400 }}>
                        {val !== undefined && val !== null ? String(val) : '—'}
                      </td>
                    );
                  })}

                  <td style={{ padding: '10px 12px' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item.id)}
                      style={{
                        border: 'none',
                        background: isActive ? '#DCFCE7' : '#F1F5F9',
                        color: isActive ? '#15803D' : '#64748B',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>

                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        title="Edit record"
                        style={{ border: 'none', background: '#F1F5F9', color: '#334155', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id, item[columns[0]?.key] || item.name || item.title)}
                        title="Delete record"
                        style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredItems.length === 0 && !loading && (
              <tr>
                <td colSpan={columns.length + 3} style={{ textAlign: 'center', padding: '32px 16px', color: '#94A3B8' }}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {editingItem ? `Edit ${masterTitle}` : `Create New ${masterTitle}`}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {fields.map(field => {
                const val = formData[field.key] !== undefined ? formData[field.key] : '';
                return (
                  <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                      {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
                    </label>

                    {field.type === 'select' ? (
                      <select
                        value={val}
                        required={field.required}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                      >
                        <option value="">Select option...</option>
                        {(field.options || []).map(opt => {
                          const optVal = typeof opt === 'object' ? opt.value : opt;
                          const optLabel = typeof opt === 'object' ? opt.label : opt;
                          return <option key={optVal} value={optVal}>{optLabel}</option>;
                        })}
                      </select>
                    ) : field.type === 'textarea' || field.type === 'json' ? (
                      <textarea
                        rows={field.type === 'json' ? 3 : 2}
                        value={typeof val === 'object' ? JSON.stringify(val, null, 2) : val}
                        placeholder={field.placeholder || ''}
                        required={field.required}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontFamily: field.type === 'json' ? 'monospace' : 'inherit' }}
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        value={val}
                        placeholder={field.placeholder || ''}
                        required={field.required}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.84rem' }}
                      />
                    )}
                    {field.hint && (
                      <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{field.hint}</span>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#475569', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', background: '#10B981', color: '#FFFFFF', fontSize: '0.84rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  {submitting ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
