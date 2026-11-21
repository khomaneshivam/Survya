import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody, Button } from '../ui';
import { Palette, Plug, Clock, Sliders, Save, Check } from 'lucide-react';

const DOMAIN_OPTIONS = [
  { value: 'HOSPITALITY', label: 'Hospitality & Resorts' },
  { value: 'RETAIL', label: 'Retail & E-Commerce' },
  { value: 'B2B_SALES', label: 'B2B & Enterprise Sales' },
  { value: 'SERVICES', label: 'Healthcare & Professional Services' },
  { value: 'DINING', label: 'Restaurant & Dining' },
  { value: 'REAL_ESTATE', label: 'Real Estate & Properties' },
  { value: 'CUSTOM', label: 'Custom Domain' }
];

export default function BrandingConnectionsTab({ experience, onSave, saving }) {
  // Parse JSON configs safely
  const initialTheme = typeof experience.theme_json === 'string'
    ? JSON.parse(experience.theme_json || '{}')
    : (experience.theme_json || {});

  const initialFeatures = typeof experience.features_json === 'string'
    ? JSON.parse(experience.features_json || '{}')
    : (experience.features_json || {});

  const initialHours = typeof experience.business_hours_json === 'string'
    ? JSON.parse(experience.business_hours_json || '{}')
    : (experience.business_hours_json || {});

  const [formData, setFormData] = useState({
    name: experience.name || '',
    slug: experience.slug || '',
    domain_type: experience.domain_type || 'CUSTOM',
    business_entity_id: experience.business_entity_id || '',
    crm_pipeline_id: experience.crm_pipeline_id || '',
    assigned_phone_number_id: experience.assigned_phone_number_id || '',
    entry_screen_key: experience.entry_screen_key || 'welcome',
    theme: {
      primaryColor: initialTheme.primaryColor || '#059669',
      secondaryColor: initialTheme.secondaryColor || '#10B981',
      accentColor: initialTheme.accentColor || '#F59E0B',
      borderRadius: initialTheme.borderRadius || '14px',
      logoUrl: initialTheme.logoUrl || '',
      coverImageUrl: initialTheme.coverImageUrl || ''
    },
    features: {
      enablePriceFilter: initialFeatures.enablePriceFilter !== false,
      enableRateDiscussion: initialFeatures.enableRateDiscussion !== false,
      enableCallbacks: initialFeatures.enableCallbacks !== false,
      enableLiveChat: initialFeatures.enableLiveChat !== false
    },
    businessHours: {
      timezone: initialHours.timezone || 'Asia/Kolkata',
      openTime: initialHours.openTime || '09:00',
      closeTime: initialHours.closeTime || '21:00',
      days: initialHours.days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }
  });

  const [entities, setEntities] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);

  useEffect(() => {
    // Fetch business entities
    fetch('/api/commerce/entities', { credentials: 'include' })
      .then(res => res.json())
      .then(d => { if (d.data) setEntities(d.data); })
      .catch(() => {});

    // Fetch CRM pipelines
    fetch('/api/v1/crm/pipelines', { credentials: 'include' })
      .then(res => res.json())
      .then(d => { if (d.data) setPipelines(d.data); })
      .catch(() => {
        // Fallback to /api/enquiries/pipelines
        fetch('/api/enquiries/pipelines', { credentials: 'include' })
          .then(res => res.json())
          .then(d => { if (d.data) setPipelines(d.data); })
          .catch(() => {});
      });

    // Fetch WhatsApp phone lines
    fetch('/api/phone-numbers', { credentials: 'include' })
      .then(res => res.json())
      .then(d => { if (d.data) setPhoneNumbers(d.data); })
      .catch(() => {});
  }, []);

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleThemeChange = (field, val) => {
    setFormData(prev => ({
      ...prev,
      theme: { ...prev.theme, [field]: val }
    }));
  };

  const handleFeatureToggle = (feat) => {
    setFormData(prev => ({
      ...prev,
      features: { ...prev.features, [feat]: !prev.features[feat] }
    }));
  };

  const handleHoursChange = (field, val) => {
    setFormData(prev => ({
      ...prev,
      businessHours: { ...prev.businessHours, [field]: val }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSave) {
      onSave({
        name: formData.name,
        slug: formData.slug,
        domain_type: formData.domain_type,
        business_entity_id: formData.business_entity_id ? Number(formData.business_entity_id) : null,
        crm_pipeline_id: formData.crm_pipeline_id ? Number(formData.crm_pipeline_id) : null,
        assigned_phone_number_id: formData.assigned_phone_number_id || null,
        entry_screen_key: formData.entry_screen_key,
        theme_json: formData.theme,
        features_json: formData.features,
        business_hours_json: formData.businessHours
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. General & Domain Settings */}
      <Card>
        <CardHeader
          title="Experience Essentials"
          subtitle="Configure basic identity, domain classification, and URL slug."
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Experience Title
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.name}
                onChange={e => handleChange('name', e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                URL Slug (/x/:slug)
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.slug}
                onChange={e => handleChange('slug', e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Domain Solution
              </label>
              <select
                className="input-field"
                value={formData.domain_type}
                onChange={e => handleChange('domain_type', e.target.value)}
                style={{ width: '100%' }}
              >
                {DOMAIN_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Entry Screen Key
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.entry_screen_key}
                onChange={e => handleChange('entry_screen_key', e.target.value)}
                placeholder="e.g. welcome"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 2. Visual Theme & Branding */}
      <Card>
        <CardHeader
          title="Visual Theme & Custom Branding"
          subtitle="Customize palette, rounded geometry, and cover artwork."
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Primary Brand Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={formData.theme.primaryColor}
                  onChange={e => handleThemeChange('primaryColor', e.target.value)}
                  style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="input-field"
                  value={formData.theme.primaryColor}
                  onChange={e => handleThemeChange('primaryColor', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Secondary Brand Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={formData.theme.secondaryColor}
                  onChange={e => handleThemeChange('secondaryColor', e.target.value)}
                  style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="input-field"
                  value={formData.theme.secondaryColor}
                  onChange={e => handleThemeChange('secondaryColor', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Accent Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={formData.theme.accentColor}
                  onChange={e => handleThemeChange('accentColor', e.target.value)}
                  style={{ width: '40px', height: '36px', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                />
                <input
                  type="text"
                  className="input-field"
                  value={formData.theme.accentColor}
                  onChange={e => handleThemeChange('accentColor', e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Corner Radius
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.theme.borderRadius}
                onChange={e => handleThemeChange('borderRadius', e.target.value)}
                placeholder="14px"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Logo Image URL
              </label>
              <input
                type="url"
                className="input-field"
                value={formData.theme.logoUrl}
                onChange={e => handleThemeChange('logoUrl', e.target.value)}
                placeholder="https://..."
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Hero Cover Artwork URL
              </label>
              <input
                type="url"
                className="input-field"
                value={formData.theme.coverImageUrl}
                onChange={e => handleThemeChange('coverImageUrl', e.target.value)}
                placeholder="https://images.unsplash.com/..."
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 3. System Connections (Catalog, CRM, WhatsApp Line) */}
      <Card>
        <CardHeader
          title="Platform Connections & WhatsApp Routing"
          subtitle="Bind to real inventory catalog, CRM pipeline stages, and WhatsApp sender identity."
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Linked Catalog / Business Entity
              </label>
              <select
                className="input-field"
                value={formData.business_entity_id}
                onChange={e => handleChange('business_entity_id', e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">None (Standalone Experience)</option>
                {entities.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name} ({ent.domain})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Linked CRM Pipeline
              </label>
              <select
                className="input-field"
                value={formData.crm_pipeline_id}
                onChange={e => handleChange('crm_pipeline_id', e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Default Pipeline</option>
                {pipelines.map(pip => (
                  <option key={pip.id} value={pip.id}>{pip.name} ({pip.industry_type})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Assigned WhatsApp Business Line
              </label>
              <select
                className="input-field"
                value={formData.assigned_phone_number_id}
                onChange={e => handleChange('assigned_phone_number_id', e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">Default System Line</option>
                {phoneNumbers.map(ph => (
                  <option key={ph.id || ph.phone_number_id} value={ph.phone_number_id || ph.id}>
                    {ph.display_name || ph.phone_number} ({ph.phone_number})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 4. Interactive Feature Toggles & Business Hours */}
      <Card>
        <CardHeader
          title="Interactive Feature Toggles & Business Hours"
          subtitle="Enable dynamic price sliders, live negotiations, and Indian Standard Time operational hours."
        />
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.features.enablePriceFilter}
                onChange={() => handleFeatureToggle('enablePriceFilter')}
              />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Price Range Slider Filter</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.features.enableRateDiscussion}
                onChange={() => handleFeatureToggle('enableRateDiscussion')}
              />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Live Rate Negotiation</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.features.enableCallbacks}
                onChange={() => handleFeatureToggle('enableCallbacks')}
              />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Instant Callback Requests</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.features.enableLiveChat}
                onChange={() => handleFeatureToggle('enableLiveChat')}
              />
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Live Concierge Chat</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Timezone
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.businessHours.timezone}
                onChange={e => handleHoursChange('timezone', e.target.value)}
                disabled
                style={{ width: '100%', backgroundColor: 'var(--bg-secondary, #f8fafc)' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Opening Time
              </label>
              <input
                type="time"
                className="input-field"
                value={formData.businessHours.openTime}
                onChange={e => handleHoursChange('openTime', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Closing Time
              </label>
              <input
                type="time"
                className="input-field"
                value={formData.businessHours.closeTime}
                onChange={e => handleHoursChange('closeTime', e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
        <Button variant="primary" type="submit" disabled={saving}>
          <Save size={16} />
          {saving ? 'Saving Changes...' : 'Save Branding & Settings'}
        </Button>
      </div>
    </form>
  );
}

