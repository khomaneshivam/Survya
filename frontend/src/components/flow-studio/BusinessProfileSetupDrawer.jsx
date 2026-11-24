import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Save,
  MessageSquare
} from 'lucide-react';
import { automationApi } from '../../features/automation/api/automationApi';

const SECTORS = [
  { value: 'HOSPITALITY', label: 'Hotels, Resorts & Homestays' },
  { value: 'RETAIL_ECOM', label: 'Retail & eCommerce (D2C)' },
  { value: 'CLINIC_HEALTH', label: 'Clinics & Healthcare Services' },
  { value: 'RESTAURANT_FOOD', label: 'Restaurants, Cafes & Food' },
  { value: 'SALON_WELLNESS', label: 'Salons, Spas & Wellness' },
  { value: 'REAL_ESTATE', label: 'Real Estate & Properties' },
  { value: 'EDUCATION_COACHING', label: 'Education & Coaching' },
  { value: 'B2B_WHOLESALE', label: 'B2B Wholesale & Services' },
  { value: 'GENERAL', label: 'General Business' }
];

export default function BusinessProfileSetupDrawer({ isOpen, onClose, onProfileUpdated, flows = [] }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [form, setForm] = useState({
    businessName: '',
    sector: 'HOSPITALITY',
    phone: '',
    email: '',
    currency: 'INR',
    city: '',
    state: '',
    operatingHours: '09:00 - 21:00',
    fallbackMessage: 'Sorry, I did not understand that. Type *menu* to see available options.',
    rootFlowId: '',
    menuKeywords: 'menu, restart, home'
  });

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccessMsg(null);
      return;
    }

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await automationApi.getBusinessProfile();
        if (res && res.success && res.profile) {
          const p = res.profile;
          setForm({
            businessName: p.businessName || '',
            sector: p.sector || 'HOSPITALITY',
            phone: p.phone || '',
            email: p.email || '',
            currency: p.currency || 'INR',
            city: p.city || '',
            state: p.state || '',
            operatingHours: typeof p.operatingHours === 'object' ? JSON.stringify(p.operatingHours) : (p.operatingHours || '09:00 - 21:00'),
            fallbackMessage: p.fallbackMessage || 'Sorry, I did not understand that. Type *menu* to see available options.',
            rootFlowId: p.rootFlowId || '',
            menuKeywords: Array.isArray(p.menuKeywords) ? p.menuKeywords.join(', ') : (p.menuKeywords || 'menu, restart, home')
          });
        }
      } catch (err) {
        setError('Failed to fetch business profile: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        businessName: form.businessName.trim(),
        sector: form.sector,
        phone: form.phone.trim(),
        email: form.email.trim(),
        currency: form.currency.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        operatingHours: form.operatingHours,
        fallbackMessage: form.fallbackMessage.trim(),
        rootFlowId: form.rootFlowId ? Number(form.rootFlowId) : null,
        menuKeywords: form.menuKeywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      };

      const res = await automationApi.updateBusinessProfile(payload);
      if (res && res.success) {
        setSuccessMsg('Business Profile updated successfully!');
        if (onProfileUpdated) {
          onProfileUpdated(payload);
        }
        setTimeout(() => setSuccessMsg(null), 3500);
      } else {
        setError(res?.error || 'Failed to update business profile');
      }
    } catch (err) {
      setError(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '480px',
      maxWidth: '100vw',
      height: '100vh',
      background: '#FFFFFF',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#F8FAFC'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={18} />
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A' }}>
              Business Profile &amp; Bot Identity
            </span>
            <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
              Configure your business brand, contact line &amp; WhatsApp fallback
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: '4px' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body / Form */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: '#64748B' }}>
          <RefreshCw size={24} className="animate-spin" />
          <span style={{ fontSize: '0.82rem' }}>Loading business profile...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Business Identity */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#16A34A" />
              Brand Identity &amp; Sector
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.businessName}
                  onChange={(e) => setForm(prev => ({ ...prev, businessName: e.target.value }))}
                  placeholder="e.g. Azure Bay Resort / Apex Dental Care"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Sector / Industry
                  </label>
                  <select
                    value={form.sector}
                    onChange={(e) => setForm(prev => ({ ...prev, sector: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                  >
                    {SECTORS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    Currency
                  </label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm(prev => ({ ...prev, currency: e.target.value }))}
                    placeholder="INR, USD, etc."
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Contact & Handoff */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={14} color="#0284C7" />
              WhatsApp &amp; Support Contact
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Support / Agent Handoff WhatsApp Phone
                </label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+91 9876543210"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                  Forwarded when a customer requests agent escalation or handoff.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Support Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="contact@business.com"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Location & Operating Timings */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} color="#D97706" />
              Location &amp; Operating Hours
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Mumbai / Goa"
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                    State / Region
                  </label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm(prev => ({ ...prev, state: e.target.value }))}
                    placeholder="e.g. Maharashtra"
                    style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Operating Hours / Check-in Timings
                </label>
                <input
                  type="text"
                  value={form.operatingHours}
                  onChange={(e) => setForm(prev => ({ ...prev, operatingHours: e.target.value }))}
                  placeholder="09:00 - 21:00 or Check-in: 14:00, Check-out: 11:00"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* Section 4: WhatsApp Routing & Fallback */}
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', background: '#FFFFFF' }}>
            <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageSquare size={14} color="#7C3AED" />
              Bot Response Defaults &amp; Root Menu
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Default Root Flow
                </label>
                <select
                  value={form.rootFlowId}
                  onChange={(e) => setForm(prev => ({ ...prev, rootFlowId: e.target.value }))}
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                >
                  <option value="">None (Stay on current active flow)</option>
                  {flows.map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.status})</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                  Triggered when user types any main menu keyword.
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Menu Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={form.menuKeywords}
                  onChange={(e) => setForm(prev => ({ ...prev, menuKeywords: e.target.value }))}
                  placeholder="menu, restart, home"
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '3px' }}>
                  Fallback Message (when input matches no step)
                </label>
                <textarea
                  rows={2}
                  value={form.fallbackMessage}
                  onChange={(e) => setForm(prev => ({ ...prev, fallbackMessage: e.target.value }))}
                  placeholder="Sorry, I did not understand that. Type *menu* to see available options."
                  style={{ width: '100%', padding: '6px 8px', fontSize: '0.78rem', border: '1px solid #CBD5E1', borderRadius: '5px', boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: 'auto', paddingTop: '10px', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #CBD5E1',
                background: '#FFFFFF',
                color: '#334155',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2,
                padding: '8px',
                borderRadius: '6px',
                border: 'none',
                background: '#2F5219',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {saving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save Business Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
