import React, { useState } from 'react';
import { Card, CardHeader, CardBody, Button, Badge, Modal } from '../ui';
import {
  Plus,
  Trash2,
  Edit,
  ArrowRight,
  MoveUp,
  MoveDown,
  Layers,
  FileSpreadsheet,
  Settings2,
  Check,
  Smartphone,
  ExternalLink
} from 'lucide-react';

const SCREEN_TYPES = [
  { value: 'HERO_WELCOME', label: 'Hero Welcome Banner', desc: 'Cover image, welcoming copy, and primary action CTA' },
  { value: 'CATALOG_EXPLORER', label: 'Catalog & Item Explorer', desc: 'Browse catalog items with price-range sliders & filter tags' },
  { value: 'ITEM_DETAIL', label: 'Item Detail & Photo Gallery', desc: 'High-res gallery, amenities/specs, and availability status' },
  { value: 'DYNAMIC_FORM', label: 'Validated Dynamic Intake Form', desc: 'Customer data collection with database-driven validation rules' },
  { value: 'RATE_NEGOTIATION', label: 'Live Rate Discussion & Offer', desc: 'Allow customer to submit custom price offer with floor protection' },
  { value: 'CALL_CONNECT', label: 'Callback & Phone Dispatch', desc: 'Direct dial, instant callback SLA, and WhatsApp voice connect' },
  { value: 'LIVE_CHAT', label: 'Live Concierge Chat', desc: 'Real-time multi-channel conversational chat' },
  { value: 'CONFIRMATION', label: 'Order / Booking Confirmation', desc: 'Reference voucher, summary breakdown, and WhatsApp handover' }
];

export default function MultiScreenFlowTab({
  experience,
  screens = [],
  onRefresh,
  onOpenFormBuilder,
  toast
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingScreen, setEditingScreen] = useState(null);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    screen_key: '',
    title: '',
    subtitle: '',
    screen_type: 'HERO_WELCOME',
    config_json: '{}',
    navigation_rules_json: '{}'
  });

  const openAddModal = () => {
    setEditingScreen(null);
    setFormData({
      screen_key: `screen_${screens.length + 1}`,
      title: '',
      subtitle: '',
      screen_type: 'HERO_WELCOME',
      config_json: JSON.stringify({ ctaButtonText: 'Continue ➡️' }, null, 2),
      navigation_rules_json: JSON.stringify({ nextScreenKey: '' }, null, 2)
    });
    setModalOpen(true);
  };

  const openEditModal = (screen) => {
    setEditingScreen(screen);
    setFormData({
      screen_key: screen.screen_key,
      title: screen.title,
      subtitle: screen.subtitle || '',
      screen_type: screen.screen_type,
      config_json: typeof screen.config_json === 'string' ? screen.config_json : JSON.stringify(screen.config_json || {}, null, 2),
      navigation_rules_json: typeof screen.navigation_rules_json === 'string' ? screen.navigation_rules_json : JSON.stringify(screen.navigation_rules_json || {}, null, 2)
    });
    setModalOpen(true);
  };

  const handleSaveScreen = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let parsedConfig = {};
      let parsedNav = {};
      try { parsedConfig = JSON.parse(formData.config_json || '{}'); } catch (err) {}
      try { parsedNav = JSON.parse(formData.navigation_rules_json || '{}'); } catch (err) {}

      const payload = {
        screen_key: formData.screen_key,
        title: formData.title,
        subtitle: formData.subtitle,
        screen_type: formData.screen_type,
        config_json: parsedConfig,
        navigation_rules_json: parsedNav
      };

      const url = editingScreen
        ? `/api/v1/inapp/screens/${editingScreen.id}`
        : `/api/v1/inapp/experiences/${experience.id}/screens`;
      const method = editingScreen ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setModalOpen(false);
        if (toast) toast(editingScreen ? 'Screen updated successfully' : 'Screen created successfully');
        if (onRefresh) onRefresh();
      } else {
        alert(data.message || 'Failed to save screen');
      }
    } catch (err) {
      alert(err.message || 'Error saving screen');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScreen = async (screenId) => {
    if (!window.confirm('Are you sure you want to delete this screen? All associated form fields will be removed.')) return;

    try {
      const res = await fetch(`/api/v1/inapp/screens/${screenId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast('Screen removed');
        if (onRefresh) onRefresh();
      } else {
        alert(data.message || 'Failed to delete screen');
      }
    } catch (err) {
      alert(err.message || 'Error deleting screen');
    }
  };

  const handleMoveOrder = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= screens.length) return;

    const reordered = [...screens];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const screenIds = reordered.map(s => s.id);

    try {
      const res = await fetch(`/api/v1/inapp/experiences/${experience.id}/screens/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ screenIds })
      });
      const data = await res.json();
      if (data.success) {
        if (onRefresh) onRefresh();
      }
    } catch (e) {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>
            Multi-Screen Journey Flow ({screens.length} Screens)
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
            Sequential multi-screen web flow from entry welcome to booking confirmation.
          </p>
        </div>

        <Button variant="primary" onClick={openAddModal}>
          <Plus size={16} />
          Add Screen
        </Button>
      </div>

      {screens.length === 0 ? (
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Layers size={40} style={{ color: 'var(--text-tertiary, #94a3b8)', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>No Screens Configured</h4>
              <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Add your first screen to start designing your in-app customer journey.
              </p>
              <Button variant="primary" onClick={openAddModal}>
                <Plus size={16} /> Add First Screen
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {screens.map((screen, idx) => {
            const isEntry = screen.screen_key === experience.entry_screen_key || idx === 0;
            const nextKey = screen.navigation_rules_json && typeof screen.navigation_rules_json === 'object'
              ? screen.navigation_rules_json.nextScreenKey
              : (screen.navigation_rules_json ? JSON.parse(screen.navigation_rules_json || '{}').nextScreenKey : null);

            return (
              <Card key={screen.id} style={{ borderLeft: isEntry ? '4px solid var(--sarvya-blue, #2563eb)' : '1px solid var(--border-color)' }}>
                <CardBody style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                      {/* Step Number */}
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-secondary, #f1f5f9)',
                        color: 'var(--text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: '700',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '15px', fontWeight: '600' }}>{screen.title}</span>
                          <Badge variant="default">{screen.screen_type}</Badge>
                          {isEntry && <Badge variant="success">Entry Screen</Badge>}
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            ({screen.screen_key})
                          </span>
                        </div>

                        {screen.subtitle && (
                          <p style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {screen.subtitle}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-tertiary, #64748b)' }}>
                          {nextKey && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <ArrowRight size={12} /> Next: <strong>{nextKey}</strong>
                            </span>
                          )}

                          {screen.screen_type === 'DYNAMIC_FORM' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: '500' }}>
                              <FileSpreadsheet size={13} /> {screen.fields?.length || 0} Form Fields
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {screen.screen_type === 'DYNAMIC_FORM' && onOpenFormBuilder && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenFormBuilder(screen)}
                          style={{ color: '#059669', borderColor: '#059669' }}
                        >
                          <FileSpreadsheet size={14} />
                          Form Builder ({screen.fields?.length || 0})
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={idx === 0}
                        onClick={() => handleMoveOrder(idx, -1)}
                        title="Move Up"
                      >
                        <MoveUp size={14} />
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={idx === screens.length - 1}
                        onClick={() => handleMoveOrder(idx, 1)}
                        title="Move Down"
                      >
                        <MoveDown size={14} />
                      </Button>

                      <Button variant="secondary" size="sm" onClick={() => openEditModal(screen)}>
                        <Edit size={14} />
                      </Button>

                      <Button variant="secondary" size="sm" onClick={() => handleDeleteScreen(screen.id)} style={{ color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Screen Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingScreen ? `Edit Screen: ${editingScreen.title}` : 'Add Screen to Experience'}
        subtitle="Configure screen type, title, copy, and navigation transition."
        size="lg"
      >
        <form onSubmit={handleSaveScreen} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Screen Key (Identifier)
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.screen_key}
                onChange={e => setFormData({ ...formData, screen_key: e.target.value })}
                required
                placeholder="e.g. villa_explorer"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Screen Type
              </label>
              <select
                className="input-field"
                value={formData.screen_type}
                onChange={e => setFormData({ ...formData, screen_type: e.target.value })}
                style={{ width: '100%' }}
              >
                {SCREEN_TYPES.map(st => (
                  <option key={st.value} value={st.value}>{st.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Screen Headline / Title
            </label>
            <input
              type="text"
              className="input-field"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g. Choose Your Villa"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Subtitle / Description
            </label>
            <textarea
              className="input-field"
              value={formData.subtitle}
              onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
              rows={2}
              placeholder="Short supporting description for this screen..."
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Navigation Rules JSON
            </label>
            <textarea
              className="input-field"
              value={formData.navigation_rules_json}
              onChange={e => setFormData({ ...formData, navigation_rules_json: e.target.value })}
              rows={3}
              placeholder='{ "nextScreenKey": "guest_intake" }'
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              Screen Config JSON (Price Sliders, Galleries, Negotiation Floor)
            </label>
            <textarea
              className="input-field"
              value={formData.config_json}
              onChange={e => setFormData({ ...formData, config_json: e.target.value })}
              rows={4}
              placeholder='{ "enablePriceSlider": true, "priceMin": 2500, "priceMax": 15000 }'
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : (editingScreen ? 'Update Screen' : 'Add Screen')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

