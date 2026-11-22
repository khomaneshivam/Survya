import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import IndustryBlueprintsModal from '../components/catalog/IndustryBlueprintsModal';
import UniversalAvailabilityTab from '../components/catalog/UniversalAvailabilityTab';
import UniversalAddonsPricingTab from '../components/catalog/UniversalAddonsPricingTab';
import {
  Store,
  Plus,
  Search,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Calendar,
  Trash2,
  Edit2,
  Flame,
  Coffee,
  BedDouble,
  ShoppingBag,
  Stethoscope,
  RefreshCw,
  FileSpreadsheet,
  ToggleLeft,
  ToggleRight,
  X,
  Image,
  Upload
} from 'lucide-react';

const DOMAIN_ICONS = {
  HOSPITALITY: BedDouble,
  DINING: Coffee,
  RETAIL: ShoppingBag,
  SERVICES: Stethoscope,
  REAL_ESTATE: Store
};

const DOMAIN_LABELS = {
  HOSPITALITY: 'Stays & Hospitality',
  DINING: 'F&B & Dining',
  RETAIL: 'Retail & D2C',
  SERVICES: 'Clinic & Services',
  REAL_ESTATE: 'Tours & Real Estate'
};

export default function CatalogInventoryPage() {
  const { token } = useAuth();

  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | SOLD_OUT
  const [mainTab, setMainTab] = useState('items'); // 'items' | 'availability' | 'addons' | 'pricing'
  const [showBlueprintsModal, setShowBlueprintsModal] = useState(false);

  // Modals & Drawers
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStarterModal, setShowStarterModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryItem, setInventoryItem] = useState(null);
  const [inventoryMatrix, setInventoryMatrix] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Form State
  const [uploadingItemImage, setUploadingItemImage] = useState(false);
  const [itemForm, setItemForm] = useState({
    title: '',
    category_id: '',
    item_type: 'FOOD',
    base_price: '',
    tax_rate: 5,
    short_description: '',
    image_url: '',
    sku: '',
    max_adults: 2,
    max_children: 1,
    bed_type: 'King Bed',
    carpet_area_sqft: '',
    dietary_flag: 'NONE',
    spice_level: 0,
    prep_time_minutes: 15,
    stock_quantity: 20,
    duration_minutes: 30
  });

  const handleUploadItemPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingItemImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/media', {
        method: 'POST',
        headers: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        body: formData
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Media upload failed');
      }
      setItemForm(prev => ({ ...prev, image_url: data.url || data.relativeUrl }));
    } catch (err) {
      showToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setUploadingItemImage(false);
      e.target.value = '';
    }
  };

  const [categoryName, setCategoryName] = useState('');

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Fetch Entities
  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/entities', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.entities.length > 0) {
        setEntities(data.entities);
        if (!selectedEntityId) {
          setSelectedEntityId(data.entities[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load entities:', err);
    }
  }, [token, selectedEntityId]);

  // 2. Fetch Categories & Items
  const fetchCatalogData = useCallback(async (entityId) => {
    if (!entityId) return;
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        fetch(`/api/v1/entities/${entityId}/categories`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/entities/${entityId}/items`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const catData = await catRes.json();
      const itemData = await itemRes.json();

      if (catData.success) setCategories(catData.categories);
      if (itemData.success) setItems(itemData.items);
    } catch (err) {
      showToast('Error loading catalog records', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    if (selectedEntityId) {
      setSelectedCategoryId(null);
      fetchCatalogData(selectedEntityId);
    }
  }, [selectedEntityId, fetchCatalogData]);

  const currentEntity = entities.find(e => e.id === Number(selectedEntityId)) || entities[0];
  const DomainIcon = currentEntity ? (DOMAIN_ICONS[currentEntity.domain] || Store) : Store;

  // 3. 1-Click 86 Toggle (Instant Out-Of-Stock Switch)
  const handleToggle86 = async (item) => {
    const nextState = !item.is_sold_out_today;
    // Optimistic UI update
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_sold_out_today: nextState ? 1 : 0 } : i));

    try {
      const res = await fetch(`/api/v1/items/${item.id}/86-toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ isSoldOutToday: nextState })
      });
      const data = await res.json();
      if (!data.success) {
        // Rollback on error
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_sold_out_today: item.is_sold_out_today } : i));
        showToast('Failed to update 86 status', 'error');
      } else {
        showToast(nextState ? `'${item.title}' is now marked 86'd (Sold Out)` : `'${item.title}' is back on sale`);
      }
    } catch (err) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_sold_out_today: item.is_sold_out_today } : i));
      showToast('Network error updating 86 status', 'error');
    }
  };

  // 4. Starter Pack Seeding
  const handleSeedStarter = async (starterKit) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/seed-starter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ starterKit })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Instant Launch: Added ${data.items.length} items & ${data.categories.length} categories!`);
        setShowStarterModal(false);
        fetchCatalogData(selectedEntityId);
      } else {
        showToast(data.message || 'Seeding failed', 'error');
      }
    } catch (err) {
      showToast('Error seeding starter kit', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Create / Update Category
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: categoryName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setCategories(prev => [...prev, data.category]);
        setCategoryName('');
        setShowCategoryModal(false);
        showToast(`Category '${data.category.name}' created!`);
      } else {
        showToast(data.message || 'Failed to create category', 'error');
      }
    } catch (err) {
      showToast('Error creating category', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Create / Update Item
  const handleSaveItem = async (e) => {
    e.preventDefault();
    setActionLoading(true);

    try {
      const url = editingItem
        ? `/api/v1/items/${editingItem.id}`
        : `/api/v1/entities/${selectedEntityId}/items`;
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...itemForm,
          item_type: currentEntity?.domain === 'HOSPITALITY' ? 'ROOM' : (currentEntity?.domain === 'DINING' ? 'FOOD' : (currentEntity?.domain === 'RETAIL' ? 'PRODUCT' : 'SERVICE'))
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast(editingItem ? 'Item updated successfully' : 'New item added to catalog');
        setShowItemModal(false);
        setEditingItem(null);
        fetchCatalogData(selectedEntityId);
      } else {
        showToast(data.message || 'Failed to save item', 'error');
      }
    } catch (err) {
      showToast('Error saving item', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 7. Delete Item
  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Are you sure you want to delete this catalog item?')) return;
    try {
      const res = await fetch(`/api/v1/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setItems(prev => prev.filter(i => i.id !== itemId));
        showToast('Item deleted successfully');
      }
    } catch (err) {
      showToast('Error deleting item', 'error');
    }
  };

  // 8. Open Inventory Matrix Modal
  const handleOpenInventory = async (item) => {
    setInventoryItem(item);
    setShowInventoryModal(true);
    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/items/${item.id}/inventory-matrix`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setInventoryMatrix(data.matrix);
      }
    } catch (err) {
      showToast('Error fetching daily inventory matrix', 'error');
    }
  };

  // Filter Items
  const filteredItems = items.filter(item => {
    if (selectedCategoryId && item.category_id !== selectedCategoryId) return false;
    if (statusFilter === 'ACTIVE' && item.is_sold_out_today === 1) return false;
    if (statusFilter === 'SOLD_OUT' && item.is_sold_out_today !== 1) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (item.title || '').toLowerCase().includes(q) ||
             (item.sku || '').toLowerCase().includes(q) ||
             (item.short_description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="sarvya-page-container">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: notification.type === 'error' ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
          color: notification.type === 'error' ? 'var(--status-error-text)' : 'var(--status-success-text)',
          border: `1px solid ${notification.type === 'error' ? 'var(--status-error-border)' : 'var(--status-success-border)'}`,
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          fontSize: '13.5px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="sarvya-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-color)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)'
            }}>
              Polymorphic Catalog Engine
            </span>
            {currentEntity && (
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: 'var(--status-success-bg)',
                color: 'var(--status-success-text)',
                border: '1px solid var(--status-success-border)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <DomainIcon size={12} />
                {DOMAIN_LABELS[currentEntity.domain] || currentEntity.domain}
              </span>
            )}
          </div>
          <h1 className="sarvya-page-title">Catalog, Menu & Inventory</h1>
          <p className="sarvya-page-subtitle">
            Manage your items, tariffs, instant 86 out-of-stock switches, and daily availability matrix across all channels.
          </p>
        </div>

        {/* Domain & Outlet Switcher + Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            className="sarvya-select"
            value={selectedEntityId || ''}
            onChange={(e) => setSelectedEntityId(Number(e.target.value))}
            style={{ fontWeight: 600, minWidth: '220px' }}
          >
            {entities.map(e => (
              <option key={e.id} value={e.id}>
                {e.name} ({DOMAIN_LABELS[e.domain] || e.domain})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="sarvya-btn"
            onClick={() => setShowBlueprintsModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#16A34A', color: '#fff', border: 'none', fontWeight: 600, padding: '7px 14px', borderRadius: '6px' }}
          >
            <Sparkles size={15} />
            <span>⚡ Industry Blueprints</span>
          </button>

          <button
            type="button"
            className="sarvya-btn sarvya-btn-secondary"
            onClick={() => setShowStarterModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={15} color="var(--sarvya-blue)" />
            <span>3-Min Starter Pack</span>
          </button>

          <button
            type="button"
            className="sarvya-btn sarvya-btn-primary"
            onClick={() => {
              setEditingItem(null);
              setItemForm({
                title: '',
                category_id: categories[0]?.id || '',
                item_type: currentEntity?.domain === 'HOSPITALITY' ? 'ROOM' : (currentEntity?.domain === 'DINING' ? 'FOOD' : 'PRODUCT'),
                base_price: '',
                tax_rate: currentEntity?.domain === 'HOSPITALITY' ? 12 : 5,
                short_description: '',
                image_url: '',
                sku: '',
                max_adults: 2,
                max_children: 1,
                bed_type: 'King Bed',
                carpet_area_sqft: '',
                dietary_flag: 'NONE',
                spice_level: 0,
                prep_time_minutes: 15,
                stock_quantity: 20,
                duration_minutes: 30
              });
              setShowItemModal(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="sarvya-kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Active Catalog Items</div>
          <div className="sarvya-kpi-value">{items.filter(i => !i.is_sold_out_today).length}</div>
          <div className="sarvya-kpi-subtext">On-sale across WhatsApp & Web</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Sold Out / 86'd Today</div>
          <div className="sarvya-kpi-value" style={{ color: items.some(i => i.is_sold_out_today) ? '#B45309' : 'var(--text-primary)' }}>
            {items.filter(i => i.is_sold_out_today).length}
          </div>
          <div className="sarvya-kpi-subtext">Instant customer order suppression</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Menu Categories</div>
          <div className="sarvya-kpi-value">{categories.length}</div>
          <div className="sarvya-kpi-subtext">Organized dining/room sections</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Primary Currency & Tax</div>
          <div className="sarvya-kpi-value">INR (₹)</div>
          <div className="sarvya-kpi-subtext">GSTIN: {currentEntity?.tax_identifier || 'Standard GST'}</div>
        </div>
      </div>

      {/* 4-Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #E5E7EB', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setMainTab('items')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: mainTab === 'items' ? '#2563EB' : '#F1F5F9',
            color: mainTab === 'items' ? '#FFFFFF' : '#475569'
          }}
        >
          <ShoppingBag size={16} />
          <span>Items & Multi-Image Gallery</span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab('availability')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: mainTab === 'availability' ? '#2563EB' : '#F1F5F9',
            color: mainTab === 'availability' ? '#FFFFFF' : '#475569'
          }}
        >
          <Calendar size={16} />
          <span>4-Mode Availability & Slots</span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab('addons')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: mainTab === 'addons' ? '#2563EB' : '#F1F5F9',
            color: mainTab === 'addons' ? '#FFFFFF' : '#475569'
          }}
        >
          <Sparkles size={16} />
          <span>Add-Ons & Upsells</span>
        </button>
        <button
          type="button"
          onClick={() => setMainTab('pricing')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.86rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: mainTab === 'pricing' ? '#2563EB' : '#F1F5F9',
            color: mainTab === 'pricing' ? '#FFFFFF' : '#475569'
          }}
        >
          <Layers size={16} />
          <span>Dynamic Pricing & Promos</span>
        </button>
      </div>

      {/* TAB 1: Items & Gallery */}
      {mainTab === 'items' && (
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Categories Sidebar */}
        <div className="sarvya-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
              Categories
            </span>
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--sarvya-blue)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <Plus size={14} /> New
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: selectedCategoryId === null ? 'var(--bg-app)' : 'transparent',
                color: selectedCategoryId === null ? 'var(--sarvya-blue)' : 'var(--text-primary)',
                fontWeight: selectedCategoryId === null ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span>All Items</span>
              <span style={{ fontSize: '11px', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '10px' }}>
                {items.length}
              </span>
            </button>

            {categories.map(c => {
              const count = items.filter(i => i.category_id === c.id).length;
              const isSelected = selectedCategoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: isSelected ? 'var(--bg-app)' : 'transparent',
                    color: isSelected ? 'var(--sarvya-blue)' : 'var(--text-primary)',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                  <span style={{ fontSize: '11px', background: 'var(--border-color)', padding: '2px 6px', borderRadius: '10px' }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Catalog Items Container */}
        <div className="sarvya-card" style={{ padding: '0px', overflow: 'hidden' }}>
          {/* Controls bar */}
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            {/* Search */}
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search dish, villa, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="sarvya-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
              />
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {['ALL', 'ACTIVE', 'SOLD_OUT'].map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid var(--border-color)',
                    background: statusFilter === st ? 'var(--sarvya-blue)' : '#FFFFFF',
                    color: statusFilter === st ? '#FFFFFF' : 'var(--text-primary)',
                    cursor: 'pointer'
                  }}
                >
                  {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : '86\'d / Sold Out'}
                </button>
              ))}

              <button
                type="button"
                onClick={() => fetchCatalogData(selectedEntityId)}
                title="Refresh catalog list"
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
              Loading catalog records...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', margin: '0 auto 12px', borderRadius: '50%', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Store size={24} color="var(--text-secondary)" />
              </div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No items match your filter</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Add your first room, dish, or SKU, or launch a starter pack in 3 minutes.
              </p>
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary"
                onClick={() => setShowStarterModal(true)}
              >
                <Sparkles size={14} color="var(--sarvya-blue)" /> Seed 1-Click Starter Kit
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="sarvya-table">
                <thead>
                  <tr>
                    <th>Item / Description</th>
                    <th>Category</th>
                    <th>Specifications</th>
                    <th>Tariff / Price</th>
                    <th>Availability (86 Switch)</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const isSoldOut = !!item.is_sold_out_today;
                    return (
                      <tr key={item.id} style={{ opacity: isSoldOut ? 0.75 : 1 }}>
                        {/* Title & SKU */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {item.image_url && (
                              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)', flexShrink: 0, background: '#F8FAFC' }}>
                                <img
                                  src={item.image_url}
                                  alt={item.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              </div>
                            )}
                            {item.dietary_flag === 'VEG' && (
                              <span title="Vegetarian" style={{ width: '14px', height: '14px', border: '1px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16A34A' }} />
                              </span>
                            )}
                            {item.dietary_flag === 'NON_VEG' && (
                              <span title="Non-Vegetarian" style={{ width: '14px', height: '14px', border: '1px solid #DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#DC2626' }} />
                              </span>
                            )}
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13.5px', color: isSoldOut ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                                {item.title}
                              </div>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                                {item.sku ? `SKU: ${item.sku}` : ''} {item.short_description ? `· ${item.short_description}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td>
                          <span style={{ fontSize: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
                            {item.category_name || 'Uncategorized'}
                          </span>
                        </td>

                        {/* Specifications based on Domain */}
                        <td>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {item.item_type === 'ROOM' && (
                              <span>{item.max_adults} Adults · {item.bed_type || 'King'} {item.carpet_area_sqft ? `· ${item.carpet_area_sqft} sqft` : ''}</span>
                            )}
                            {item.item_type === 'FOOD' && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <Clock size={12} /> {item.prep_time_minutes}m
                                {item.spice_level > 0 && <span style={{ color: '#EA580C', marginLeft: '6px', display: 'inline-flex', alignItems: 'center' }}><Flame size={12} /> {item.spice_level}</span>}
                              </span>
                            )}
                            {item.item_type === 'PRODUCT' && (
                              <span>Stock: {item.stock_quantity} units</span>
                            )}
                            {item.item_type === 'SERVICE' && (
                              <span><Clock size={12} /> {item.duration_minutes} mins</span>
                            )}
                          </div>
                        </td>

                        {/* Price */}
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '13.5px' }}>
                            ₹{item.base_price.toLocaleString('en-IN')}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            +{item.tax_rate}% GST
                          </div>
                        </td>

                        {/* 1-Click 86 Switch */}
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggle86(item)}
                            title={isSoldOut ? 'Click to make item available' : 'Click to 86 / mark sold out for today'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-sm)',
                              border: `1px solid ${isSoldOut ? 'var(--status-warning-border)' : 'var(--status-success-border)'}`,
                              background: isSoldOut ? 'var(--status-warning-bg)' : 'var(--status-success-bg)',
                              color: isSoldOut ? 'var(--status-warning-text)' : 'var(--status-success-text)',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {isSoldOut ? <ToggleLeft size={16} color="var(--status-warning-text)" /> : <ToggleRight size={16} color="var(--status-success-text)" />}
                            <span>{isSoldOut ? "86'd (Sold Out)" : "Available"}</span>
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {item.item_type === 'ROOM' && (
                              <button
                                type="button"
                                onClick={() => handleOpenInventory(item)}
                                title="Daily Inventory & Rates Calendar"
                                style={{
                                  padding: '5px',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--border-color)',
                                  background: '#FFFFFF',
                                  cursor: 'pointer',
                                  color: 'var(--sarvya-blue)'
                                }}
                              >
                                <Calendar size={14} />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setEditingItem(item);
                                setItemForm({
                                  title: item.title,
                                  category_id: item.category_id || '',
                                  item_type: item.item_type,
                                  base_price: item.base_price,
                                  tax_rate: item.tax_rate || 5,
                                  short_description: item.short_description || '',
                                  image_url: item.image_url || '',
                                  sku: item.sku || '',
                                  max_adults: item.max_adults || 2,
                                  max_children: item.max_children || 1,
                                  bed_type: item.bed_type || 'King Bed',
                                  carpet_area_sqft: item.carpet_area_sqft || '',
                                  dietary_flag: item.dietary_flag || 'NONE',
                                  spice_level: item.spice_level || 0,
                                  prep_time_minutes: item.prep_time_minutes || 15,
                                  stock_quantity: item.stock_quantity || 20,
                                  duration_minutes: item.duration_minutes || 30
                                });
                                setShowItemModal(true);
                              }}
                              title="Edit Item"
                              style={{
                                padding: '5px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                background: '#FFFFFF',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)'
                              }}
                            >
                              <Edit2 size={14} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              title="Delete Item"
                              style={{
                                padding: '5px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                background: '#FFFFFF',
                                cursor: 'pointer',
                                color: '#EF4444'
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}

      {/* TAB 2: Availability & Slots */}
      {mainTab === 'availability' && (
        <UniversalAvailabilityTab
          token={token}
          selectedEntityId={selectedEntityId}
          showToast={showToast}
        />
      )}

      {/* TAB 3: Add-Ons & Upsells */}
      {mainTab === 'addons' && (
        <UniversalAddonsPricingTab
          token={token}
          selectedEntityId={selectedEntityId}
          showToast={showToast}
          activeSubView="addons"
        />
      )}

      {/* TAB 4: Dynamic Pricing & Promos */}
      {mainTab === 'pricing' && (
        <UniversalAddonsPricingTab
          token={token}
          selectedEntityId={selectedEntityId}
          showToast={showToast}
          activeSubView="pricing"
        />
      )}

      {/* MODAL 1: Starter Pack Seeding */}
      {showStarterModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '620px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={20} color="var(--sarvya-blue)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>3-Minute Domain Starter Packs</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowStarterModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              Choose a starter kit tailored to your business model. This immediately provisions realistic categories, sample dishes/rooms with tariffs, and dietary tags so you can start selling on WhatsApp in 180 seconds.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              {/* Option 1: Hospitality */}
              <div
                onClick={() => handleSeedStarter('RESORT_LUXURY_V1')}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  cursor: 'pointer',
                  background: 'var(--bg-app)',
                  transition: 'border-color 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <BedDouble size={18} color="var(--sarvya-blue)" />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Resort & Villa Pack</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Ocean Villas, Plunge Pool Suites, Garden Cottages with 30-day inventory matrix.
                </p>
              </div>

              {/* Option 2: F&B Dining */}
              <div
                onClick={() => handleSeedStarter('CAFE_DINING_V1')}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  cursor: 'pointer',
                  background: 'var(--bg-app)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Coffee size={18} color="var(--sarvya-blue)" />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Cafe & Seafood Pack</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Malvani Crab Masala, Wood-fired Pizzas, Solkadhi Coolers with Veg/Non-Veg flags.
                </p>
              </div>

              {/* Option 3: Retail D2C */}
              <div
                onClick={() => handleSeedStarter('D2C_RETAIL_V1')}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  cursor: 'pointer',
                  background: 'var(--bg-app)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <ShoppingBag size={18} color="var(--sarvya-blue)" />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Retail & Goods Pack</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Linen Resort Shirts, Coastal Spices with size variants & real-time stock counters.
                </p>
              </div>

              {/* Option 4: Clinic & Salon */}
              <div
                onClick={() => handleSeedStarter('SALON_CLINIC_V1')}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  cursor: 'pointer',
                  background: 'var(--bg-app)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Stethoscope size={18} color="var(--sarvya-blue)" />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>Clinic & Spa Pack</span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                  Ayurvedic full-body massage, Doctor consultations with durations & buffer times.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary"
                onClick={() => setShowStarterModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Category */}
      {showCategoryModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '420px', width: '100%', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '14px' }}>Add Menu Category</h3>
            <form onSubmit={handleSaveCategory}>
              <div style={{ marginBottom: '16px' }}>
                <label className="sarvya-field-label">Category Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Starters, Pool Villas, Apparel..."
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowCategoryModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {actionLoading ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add / Edit Item (Domain-Adaptive) */}
      {showItemModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700 }}>
                {editingItem ? 'Edit Item' : 'Add New Item'} ({DOMAIN_LABELS[currentEntity?.domain]})
              </h3>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveItem}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Title / Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Deluxe Sea Villa, Surmai Thali..."
                    value={itemForm.title}
                    onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
                    className="sarvya-input"
                  />
                </div>
                <div>
                  <label className="sarvya-field-label">SKU / Code</label>
                  <input
                    type="text"
                    placeholder="e.g. VILLA-01"
                    value={itemForm.sku}
                    onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                    className="sarvya-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Category</label>
                  <select
                    className="sarvya-select"
                    value={itemForm.category_id}
                    onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })}
                  >
                    <option value="">(Select Category)</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="sarvya-field-label">Base Price (₹) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    placeholder="e.g. 4500"
                    value={itemForm.base_price}
                    onChange={(e) => setItemForm({ ...itemForm, base_price: e.target.value })}
                    className="sarvya-input"
                  />
                </div>
              </div>

              {/* Domain Specific Fields */}
              {currentEntity?.domain === 'HOSPITALITY' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="sarvya-field-label">Max Adults</label>
                    <input
                      type="number"
                      value={itemForm.max_adults}
                      onChange={(e) => setItemForm({ ...itemForm, max_adults: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label">Max Children</label>
                    <input
                      type="number"
                      value={itemForm.max_children}
                      onChange={(e) => setItemForm({ ...itemForm, max_children: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label">Bed Type</label>
                    <input
                      type="text"
                      placeholder="e.g. King Bed"
                      value={itemForm.bed_type}
                      onChange={(e) => setItemForm({ ...itemForm, bed_type: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                </div>
              )}

              {currentEntity?.domain === 'DINING' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="sarvya-field-label">Dietary Flag</label>
                    <select
                      className="sarvya-select"
                      value={itemForm.dietary_flag}
                      onChange={(e) => setItemForm({ ...itemForm, dietary_flag: e.target.value })}
                    >
                      <option value="NONE">Standard</option>
                      <option value="VEG">Vegetarian</option>
                      <option value="NON_VEG">Non-Vegetarian</option>
                      <option value="VEGAN">Vegan</option>
                      <option value="JAIN">Jain</option>
                    </select>
                  </div>
                  <div>
                    <label className="sarvya-field-label">Spice Level (0-3)</label>
                    <input
                      type="number"
                      min="0"
                      max="3"
                      value={itemForm.spice_level}
                      onChange={(e) => setItemForm({ ...itemForm, spice_level: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label">Prep Time (mins)</label>
                    <input
                      type="number"
                      value={itemForm.prep_time_minutes}
                      onChange={(e) => setItemForm({ ...itemForm, prep_time_minutes: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                </div>
              )}

              {currentEntity?.domain === 'RETAIL' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="sarvya-field-label">Stock Quantity</label>
                    <input
                      type="number"
                      value={itemForm.stock_quantity}
                      onChange={(e) => setItemForm({ ...itemForm, stock_quantity: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label">Tax Rate (%)</label>
                    <input
                      type="number"
                      value={itemForm.tax_rate}
                      onChange={(e) => setItemForm({ ...itemForm, tax_rate: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                </div>
              )}

              {currentEntity?.domain === 'SERVICES' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="sarvya-field-label">Duration (Minutes)</label>
                    <input
                      type="number"
                      value={itemForm.duration_minutes}
                      onChange={(e) => setItemForm({ ...itemForm, duration_minutes: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label">Tax Rate (%)</label>
                    <input
                      type="number"
                      value={itemForm.tax_rate}
                      onChange={(e) => setItemForm({ ...itemForm, tax_rate: e.target.value })}
                      className="sarvya-input"
                    />
                  </div>
                </div>
              )}

              {/* Item Photo / Image */}
              <div style={{ marginBottom: '14px', padding: '12px', background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="sarvya-field-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Image size={14} color="#059669" />
                    <span>Item Photo / Image (Optional)</span>
                  </label>
                  {itemForm.image_url && (
                    <button
                      type="button"
                      onClick={() => setItemForm({ ...itemForm, image_url: '' })}
                      style={{ border: 'none', background: 'transparent', color: '#EF4444', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {itemForm.image_url && (
                    <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border-color)', flexShrink: 0, background: '#FFFFFF' }}>
                      <img
                        src={itemForm.image_url}
                        alt="Item preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="https://... or /uploads/..."
                    value={itemForm.image_url}
                    onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value.trim() })}
                    className="sarvya-input"
                    style={{ flex: 1, fontSize: '12px' }}
                  />
                  <label style={{
                    padding: '6px 12px',
                    background: uploadingItemImage ? '#9CA3AF' : 'var(--primary-color, #2F5219)',
                    color: '#FFFFFF',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: uploadingItemImage ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0
                  }}>
                    <Upload size={12} />
                    <span>{uploadingItemImage ? 'Uploading...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      disabled={uploadingItemImage}
                      onChange={handleUploadItemPhoto}
                    />
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label className="sarvya-field-label">Short Description</label>
                <textarea
                  rows={3}
                  placeholder="Highlights visible to guest on WhatsApp card and digital menu..."
                  value={itemForm.short_description}
                  onChange={(e) => setItemForm({ ...itemForm, short_description: e.target.value })}
                  className="sarvya-textarea"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowItemModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {actionLoading ? 'Saving...' : editingItem ? 'Update Item' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Daily Inventory & Tariff Matrix Drawer */}
      {showInventoryModal && inventoryItem && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>
                  Daily Availability & Seasonal Rates: {inventoryItem.title}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Base Rate: ₹{inventoryItem.base_price.toLocaleString('en-IN')} / night
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInventoryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
              <table className="sarvya-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Available Keys</th>
                    <th>Booked Keys</th>
                    <th>Surge / Tariff Override</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryMatrix.slice(0, 14).map(row => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.inventory_date}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: row.available_qty > 0 ? '#16A34A' : '#EF4444' }}>
                          {row.available_qty}
                        </span>
                      </td>
                      <td>{row.booked_qty}</td>
                      <td>
                        {row.rate_override ? (
                          <span style={{ fontWeight: 600 }}>₹{row.rate_override.toLocaleString('en-IN')}</span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>Base (₹{inventoryItem.base_price})</span>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: row.is_closed ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
                          color: row.is_closed ? 'var(--status-error-text)' : 'var(--status-success-text)'
                        }}>
                          {row.is_closed ? 'Blocked' : 'Open'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary"
                onClick={() => setShowInventoryModal(false)}
              >
                Close Calendar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 8-Sector Industry Blueprints Modal */}
      <IndustryBlueprintsModal
        isOpen={showBlueprintsModal}
        onClose={() => setShowBlueprintsModal(false)}
        token={token}
        onBlueprintApplied={() => {
          fetchEntities();
          if (selectedEntityId) {
            fetchCatalogData(selectedEntityId);
          }
        }}
      />
    </div>
  );
}

