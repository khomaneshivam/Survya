import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DataTable } from '../ui';
import {
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Tag,
  DollarSign,
  Layers,
  Calendar,
  Send
} from 'lucide-react';

export default function UniversalAddonsPricingTab({ token, selectedEntityId, showToast, activeSubView = 'addons' }) {
  const [subView, setSubView] = useState(activeSubView);
  const [addonGroups, setAddonGroups] = useState([]);
  const [pricingRules, setPricingRules] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Addon Modal States
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupForm, setGroupForm] = useState({ title: '', code: '', selection_type: 'MULTIPLE' });
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [addonForm, setAddonForm] = useState({
    name: '',
    price_mode: 'FIXED',
    price: 0,
    gst_percent: 18,
    is_default: 0
  });

  // Rule Modal State
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    title: '',
    rule_type: 'PROMO_CODE',
    discount_mode: 'PERCENTAGE',
    discount_value: 10,
    promo_code: '',
    priority: 10
  });

  // Sandbox State
  const [sandboxItem, setSandboxItem] = useState('');
  const [sandboxQty, setSandboxQty] = useState(1);
  const [sandboxAddons, setSandboxAddons] = useState([]);
  const [sandboxPromo, setSandboxPromo] = useState('');
  const [sandboxQuote, setSandboxQuote] = useState(null);
  const [calculatingQuote, setCalculatingQuote] = useState(false);

  const addonColumns = useMemo(() => [
    {
      key: 'name',
      header: 'Option Name',
      sortable: true,
      render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>
    },
    {
      key: 'price_mode',
      header: 'Price Mode',
      render: (v) => <code>{v}</code>
    },
    {
      key: 'price',
      header: 'Price (₹)',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums" style={{ fontWeight: 700, color: '#16A34A' }}>₹{v}</span>
    },
    {
      key: 'gst_percent',
      header: 'GST %',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums">{v}%</span>
    },
    {
      key: 'is_default',
      header: 'Default',
      align: 'center',
      render: (v) => (v ? '✅ Yes' : 'No')
    }
  ], []);

  const pricingRuleColumns = useMemo(() => [
    {
      key: 'title',
      header: 'Rule Title',
      sortable: true,
      render: (v, r) => <span style={{ fontWeight: 600 }}>{v || r?.name || r?.promo_code || '-'}</span>
    },
    {
      key: 'rule_type',
      header: 'Rule Type',
      sortable: true,
      render: (v) => (
        <span style={{
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '0.72rem',
          fontWeight: 600,
          background: v === 'PROMO_CODE' ? '#FEF3C7' : (v === 'BULK_TIER' ? '#DBEAFE' : '#DCFCE7'),
          color: v === 'PROMO_CODE' ? '#92400E' : (v === 'BULK_TIER' ? '#1E40AF' : '#166534')
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'discount_value',
      header: 'Discount / Surge Value',
      align: 'right',
      sortable: true,
      render: (v, r) => {
        const amt = Number(v ?? r?.adjustment_value ?? 0);
        const mode = r?.discount_mode || r?.adjustment_type || 'PERCENTAGE';
        return (
          <span className="tabular-nums" style={{ fontWeight: 600, color: amt < 0 ? '#DC2626' : '#16A34A' }}>
            {mode === 'PERCENTAGE' ? `${amt}%` : `₹${amt}`}
            {amt < 0 ? ' (Surge)' : ' (Discount)'}
          </span>
        );
      }
    },
    {
      key: 'promo_code',
      header: 'Promo Code',
      render: (v) => (v ? <code>{v}</code> : '-')
    },
    {
      key: 'priority',
      header: 'Priority',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums">{v}</span>
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center',
      render: (v) => (v ? '🟢 Active' : '⚪ Paused')
    }
  ], []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [grpRes, ruleRes, itemRes] = await Promise.all([
        fetch(`/api/v1/universal/addon-groups?entityId=${selectedEntityId || ''}`, { headers }),
        fetch(`/api/v1/universal/pricing-rules`, { headers }),
        fetch(`/api/v1/universal/items?entityId=${selectedEntityId || ''}`, { headers })
      ]);

      const grpData = await grpRes.json();
      const ruleData = await ruleRes.json();
      const itemData = await itemRes.json();

      if (grpData.success) setAddonGroups(grpData.addonGroups || []);
      if (ruleData.success) setPricingRules(ruleData.pricingRules || []);
      if (itemData.success) {
        setItems(itemData.items || []);
        if (itemData.items?.length > 0 && !sandboxItem) {
          setSandboxItem(itemData.items[0].id);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch addons/pricing data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedEntityId, sandboxItem]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group Create
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/universal/addon-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...groupForm, entity_id: selectedEntityId || null })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create group');
      showToast('Add-on group created!');
      setShowGroupModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Addon Create
  const handleCreateAddon = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/universal/addon-groups/${selectedGroupId}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(addonForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create add-on');
      showToast('Add-on created!');
      setShowAddonModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Rule Create
  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/universal/pricing-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...ruleForm, entity_id: selectedEntityId || null })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create rule');
      showToast('Pricing rule created!');
      setShowRuleModal(false);
      fetchData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Quote Sandbox Run
  const handleCalculateSandboxQuote = async () => {
    setCalculatingQuote(true);
    try {
      const res = await fetch('/api/v1/universal/pricing/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: sandboxItem ? [{ itemId: Number(sandboxItem), quantity: Number(sandboxQty) }] : [],
          addOns: sandboxAddons.map(id => ({ addonId: Number(id), quantity: 1 })),
          promoCode: sandboxPromo || null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Quotation failed');
      setSandboxQuote(data.quote);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCalculatingQuote(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Sub-view Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setSubView('addons')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: subView === 'addons' ? '#16A34A' : '#F3F4F6',
            color: subView === 'addons' ? '#FFFFFF' : '#4B5563'
          }}
        >
          Add-On Groups & Upsells ({addonGroups.length})
        </button>
        <button
          type="button"
          onClick={() => setSubView('pricing')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: subView === 'pricing' ? '#16A34A' : '#F3F4F6',
            color: subView === 'pricing' ? '#FFFFFF' : '#4B5563'
          }}
        >
          Dynamic Pricing Rules ({pricingRules.length})
        </button>
        <button
          type="button"
          onClick={() => setSubView('sandbox')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: subView === 'sandbox' ? '#16A34A' : '#F3F4F6',
            color: subView === 'sandbox' ? '#FFFFFF' : '#4B5563'
          }}
        >
          🧪 Live Quotation Sandbox
        </button>
      </div>

      {/* 1. ADD-ON GROUPS VIEW */}
      {subView === 'addons' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                Add-On Groups & Upsell Packages
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6B7280' }}>
                Create extras (Airport transfer, gift boxes, dessert, OPG X-ray, extra bed) that customers select on WhatsApp.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} />
              <span>Create Add-On Group</span>
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>Loading add-ons...</div>
          ) : addonGroups.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', background: '#F9FAFB', borderRadius: '8px' }}>
              No add-on groups yet. Click 'Create Add-On Group' or apply an Industry Blueprint.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {addonGroups.map(group => (
                <div key={group.id} style={{ border: '1px solid #E5E7EB', borderRadius: '10px', background: '#FFFFFF', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{group.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                        Code: <code>{group.code}</code> • Selection: {group.selection_type}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setAddonForm({ name: '', price_mode: 'FIXED', price: 0, gst_percent: 18, is_default: 0 });
                        setShowAddonModal(true);
                      }}
                      style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={13} />
                      <span>Add Option</span>
                    </button>
                  </div>

                  {group.addons?.length > 0 ? (
                    <DataTable
                      columns={addonColumns}
                      data={group.addons}
                      density="compact"
                      pageSize={10}
                      emptyMessage="No options yet in this group."
                    />
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#9CA3AF', padding: '8px 0' }}>No options yet in this group.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. DYNAMIC PRICING RULES VIEW */}
      {subView === 'pricing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                Dynamic Pricing Rules, Surges & Promos
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6B7280' }}>
                Configure automated pricing rules: Bulk Volume Tiers, Weekend Demand Surges, Seasonal Rates, and Promo Codes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRuleModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
            >
              <Plus size={14} />
              <span>Create Pricing Rule</span>
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280' }}>Loading rules...</div>
          ) : (
            <DataTable
              columns={pricingRuleColumns}
              data={pricingRules}
              density="compact"
              pageSize={10}
              emptyMessage="No dynamic pricing rules configured."
            />
          )}
        </div>
      )}

      {/* 3. LIVE QUOTATION SANDBOX VIEW */}
      {subView === 'sandbox' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
          {/* Controls */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
              Quotation Parameters
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Select Item</label>
                <select
                  value={sandboxItem}
                  onChange={e => setSandboxItem(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.title} (₹{i.base_price})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={sandboxQty}
                  onChange={e => setSandboxQty(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Add-Ons</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                  {addonGroups.flatMap(g => g.addons || []).map(a => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                      <input
                        type="checkbox"
                        checked={sandboxAddons.includes(a.id)}
                        onChange={e => {
                          if (e.target.checked) setSandboxAddons([...sandboxAddons, a.id]);
                          else setSandboxAddons(sandboxAddons.filter(id => id !== a.id));
                        }}
                      />
                      <span>{a.name} (+₹{a.price})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Promo Code</label>
                <input
                  type="text"
                  placeholder="e.g. EARLYBIRD10"
                  value={sandboxPromo}
                  onChange={e => setSandboxPromo(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <button
                type="button"
                disabled={calculatingQuote}
                onClick={handleCalculateSandboxQuote}
                style={{ padding: '10px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: '6px' }}
              >
                {calculatingQuote ? 'Calculating...' : 'Calculate Live Quotation'}
              </button>
            </div>
          </div>

          {/* Rendered WhatsApp Receipt Card */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>
              Rendered WhatsApp Receipt Preview
            </h3>
            {sandboxQuote ? (
              <div style={{ background: '#DCF8C6', border: '1px solid #B8E894', borderRadius: '10px', padding: '16px', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                {sandboxQuote.receiptText}
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                Click 'Calculate Live Quotation' to test deterministic dynamic pricing & tax receipt rendering.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Add-On Group */}
      {showGroupModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 700 }}>New Add-On Group</h3>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Group Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Resort Experiences"
                  value={groupForm.title}
                  onChange={e => setGroupForm({ ...groupForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Selection Type</label>
                <select
                  value={groupForm.selection_type}
                  onChange={e => setGroupForm({ ...groupForm, selection_type: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  <option value="MULTIPLE">MULTIPLE (Select any/all)</option>
                  <option value="SINGLE">SINGLE (Pick one only)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowGroupModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontWeight: 600 }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Add-On Option */}
      {showAddonModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', maxWidth: '420px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 700 }}>New Add-On Option</h3>
            <form onSubmit={handleCreateAddon} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Option Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Airport Transfer"
                  value={addonForm.name}
                  onChange={e => setAddonForm({ ...addonForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Price Mode</label>
                  <select
                    value={addonForm.price_mode}
                    onChange={e => setAddonForm({ ...addonForm, price_mode: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  >
                    <option value="FIXED">FIXED</option>
                    <option value="PER_UNIT">PER_UNIT</option>
                    <option value="PER_NIGHT_OR_SLOT">PER_NIGHT_OR_SLOT</option>
                    <option value="PERCENTAGE">PERCENTAGE</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={addonForm.price}
                    onChange={e => setAddonForm({ ...addonForm, price: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>GST %</label>
                <input
                  type="number"
                  min="0"
                  max="28"
                  value={addonForm.gst_percent}
                  onChange={e => setAddonForm({ ...addonForm, gst_percent: Number(e.target.value) })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddonModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontWeight: 600 }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Pricing Rule */}
      {showRuleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', maxWidth: '440px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', fontWeight: 700 }}>New Pricing Rule</h3>
            <form onSubmit={handleCreateRule} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Rule Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Early Bird 10% Off"
                  value={ruleForm.title}
                  onChange={e => setRuleForm({ ...ruleForm, title: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Rule Type</label>
                <select
                  value={ruleForm.rule_type}
                  onChange={e => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  <option value="PROMO_CODE">PROMO_CODE</option>
                  <option value="BULK_TIER">BULK_TIER</option>
                  <option value="WEEKEND_SURGE">WEEKEND_SURGE</option>
                  <option value="SEASONAL">SEASONAL</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Discount Mode</label>
                  <select
                    value={ruleForm.discount_mode}
                    onChange={e => setRuleForm({ ...ruleForm, discount_mode: e.target.value })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  >
                    <option value="PERCENTAGE">PERCENTAGE (%)</option>
                    <option value="FIXED_AMOUNT">FIXED_AMOUNT (₹)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Value</label>
                  <input
                    type="number"
                    required
                    value={ruleForm.discount_value}
                    onChange={e => setRuleForm({ ...ruleForm, discount_value: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>
              {ruleForm.rule_type === 'PROMO_CODE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Promo Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SUMMER10"
                    value={ruleForm.promo_code}
                    onChange={e => setRuleForm({ ...ruleForm, promo_code: e.target.value.toUpperCase() })}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowRuleModal(false)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#fff' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#16A34A', color: '#fff', fontWeight: 600 }}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

