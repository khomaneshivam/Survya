import React, { useState } from 'react';
import MasterCrudTable from '../components/masters/MasterCrudTable';
import {
  Database,
  Layers,
  MapPin,
  Users,
  CreditCard,
  Percent,
  Ruler,
  Sliders,
  Tag,
  Globe,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

const SECTORS = [
  { key: 'HOSPITALITY', label: 'Hotels, Resorts & Homestays', icon: '🏨' },
  { key: 'RETAIL_D2C', label: 'Retail & eCommerce (D2C)', icon: '🛍️' },
  { key: 'CLINIC_HEALTH', label: 'Clinics & Healthcare Services', icon: '🩺' },
  { key: 'RESTAURANT', label: 'Restaurants, Cafes & Cloud Kitchens', icon: '🍽️' },
  { key: 'SALON_SPA', label: 'Salons, Spas & Wellness', icon: '✂️' },
  { key: 'REAL_ESTATE', label: 'Real Estate & Property Developers', icon: '🏢' },
  { key: 'EDUCATION', label: 'Education, EdTech & Coaching Batches', icon: '🎓' },
  { key: 'B2B_SERVICES', label: 'B2B Services, Agencies & Consulting', icon: '💼' }
];

const TABS = [
  { id: 'master_categories', label: 'Categories', icon: Layers, countName: 'Categories' },
  { id: 'master_locations', label: 'Locations & Branches', icon: MapPin, countName: 'Branches' },
  { id: 'master_resources', label: 'Resources & Staff', icon: Users, countName: 'Doctors/Staff' },
  { id: 'master_payment_modes', label: 'Payment Modes', icon: CreditCard, countName: 'Payment Options' },
  { id: 'master_tax_slabs', label: 'GST & Tax Slabs', icon: Percent, countName: 'Tax Slabs' },
  { id: 'master_units', label: 'Units of Measure', icon: Ruler, countName: 'Units' },
  { id: 'master_attributes', label: 'Attributes & Variants', icon: Sliders, countName: 'Attributes' },
  { id: 'master_status_tags', label: 'Status Tags', icon: Tag, countName: 'Tags' },
  { id: 'master_domain_profiles', label: 'Domain Profiles', icon: Globe, countName: 'Domains' }
];

export default function MastersHubPage() {
  const [activeTab, setActiveTab] = useState('master_categories');
  const [selectedSector, setSelectedSector] = useState('HOSPITALITY');
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [seedError, setSeedError] = useState(null);

  const handleSeedSector = async () => {
    setSeeding(true);
    setSeedResult(null);
    setSeedError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/masters/seed-sector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sector: selectedSector })
      });
      const data = await res.json();
      if (data.success) {
        setSeedResult(data);
        setTimeout(() => setSeedResult(null), 5000);
      } else {
        setSeedError(data.error || 'Failed to seed sector');
      }
    } catch (err) {
      setSeedError(err.message || 'Network error seeding sector');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Universal Masters Hub
              </h1>
              <span style={{ fontSize: '0.84rem', color: '#64748B' }}>
                ERP-grade business masters for multi-sector WhatsApp Flow nodes, dynamic checkout screens & billing.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 1-Click Sector Setup Banner */}
      <div style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)', border: '1px solid #A7F3D0', borderRadius: '14px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '280px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#10B981', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#065F46' }}>
              1-Click Industry Master Onboarding
            </div>
            <div style={{ fontSize: '0.8rem', color: '#047857' }}>
              Instantly scaffold GST slabs, payment modes, categories, attributes, and resources tailored to your sector.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #6EE7B7',
              background: '#FFFFFF',
              color: '#065F46',
              fontSize: '0.84rem',
              fontWeight: 600
            }}
          >
            {SECTORS.map(s => (
              <option key={s.key} value={s.key}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleSeedSector}
            disabled={seeding}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#059669',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: seeding ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
            }}
          >
            <Sparkles size={14} />
            {seeding ? 'Initializing...' : '1-Click Initialize Sector Masters'}
          </button>
        </div>
      </div>

      {seedResult && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} />
          Successfully initialized {seedResult.sector} sector masters! {JSON.stringify(seedResult.seeded)}
        </div>
      )}

      {seedError && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', fontSize: '0.84rem' }}>
          ⚠️ {seedError}
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', borderBottom: '1px solid #E2E8F0' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: isActive ? '#FFFFFF' : 'transparent',
                color: isActive ? '#059669' : '#64748B',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.84rem',
                cursor: 'pointer',
                borderBottom: isActive ? '2px solid #059669' : '2px solid transparent',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Table Render */}
      <div>
        {activeTab === 'master_categories' && (
          <MasterCrudTable
            key="master_categories"
            masterType="master_categories"
            masterTitle="Categories & Collections"
            columns={[
              { key: 'category_code', label: 'Code', width: '130px', isPrimary: true },
              { key: 'name', label: 'Category Name', width: '220px' },
              { key: 'domain_key', label: 'Domain', width: '140px' },
              { key: 'description', label: 'Description' }
            ]}
            fields={[
              { key: 'category_code', label: 'Category Code', placeholder: 'e.g. DELUXE_ROOMS or APPAREL', required: true },
              { key: 'name', label: 'Category Name', placeholder: 'e.g. Deluxe Rooms & Suites', required: true },
              { key: 'domain_key', label: 'Domain', type: 'select', options: ['GENERAL', 'HOSPITALITY', 'RETAIL_D2C', 'CLINIC_HEALTH', 'RESTAURANT', 'SALON_SPA', 'REAL_ESTATE', 'EDUCATION', 'B2B_SERVICES'], required: true },
              { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Brief summary of this category' },
              { key: 'icon', label: 'Icon (Lucide name)', placeholder: 'e.g. BedDouble' }
            ]}
          />
        )}

        {activeTab === 'master_locations' && (
          <MasterCrudTable
            key="master_locations"
            masterType="master_locations"
            masterTitle="Locations, Branches & Warehouses"
            columns={[
              { key: 'location_code', label: 'Branch Code', width: '130px', isPrimary: true },
              { key: 'name', label: 'Location Name', width: '220px' },
              { key: 'branch_type', label: 'Type', width: '130px' },
              { key: 'city', label: 'City', width: '120px' },
              { key: 'phone_e164', label: 'Phone', width: '140px' }
            ]}
            fields={[
              { key: 'location_code', label: 'Location Code', placeholder: 'e.g. BRANCH_MUMBAI', required: true },
              { key: 'name', label: 'Location Name', placeholder: 'e.g. Bandra West Outlet', required: true },
              { key: 'branch_type', label: 'Branch Type', type: 'select', options: ['MAIN_BRANCH', 'BRANCH', 'STORE', 'CLINIC_CENTER', 'CAMPUS', 'WAREHOUSE'], required: true },
              { key: 'city', label: 'City', placeholder: 'e.g. Mumbai' },
              { key: 'state', label: 'State', placeholder: 'e.g. Maharashtra' },
              { key: 'address_line1', label: 'Address Line 1', placeholder: 'Street address' },
              { key: 'phone_e164', label: 'Contact Phone', placeholder: '+919876543210' },
              { key: 'email', label: 'Email', placeholder: 'branch@example.com' }
            ]}
          />
        )}

        {activeTab === 'master_resources' && (
          <MasterCrudTable
            key="master_resources"
            masterType="master_resources"
            masterTitle="Resources, Staff, Doctors & Tables"
            columns={[
              { key: 'resource_code', label: 'Resource Code', width: '140px', isPrimary: true },
              { key: 'name', label: 'Name / Title', width: '200px' },
              { key: 'resource_type', label: 'Type', width: '120px' },
              { key: 'specialization', label: 'Specialization' },
              { key: 'slot_duration_minutes', label: 'Slot (min)', width: '100px' },
              { key: 'contact_phone', label: 'Phone', width: '130px' }
            ]}
            fields={[
              { key: 'resource_code', label: 'Resource Code', placeholder: 'e.g. DR_SHARMA or TABLE_1', required: true },
              { key: 'name', label: 'Name / Designation', placeholder: 'e.g. Dr. Rajesh Sharma', required: true },
              { key: 'resource_type', label: 'Type', type: 'select', options: ['STAFF', 'DOCTOR', 'STYLIST', 'TABLE', 'THERAPIST', 'TRAINER', 'AGENT', 'ROOM', 'EQUIPMENT'], required: true },
              { key: 'specialization', label: 'Specialization', placeholder: 'e.g. Diabetologist or Senior Stylist' },
              { key: 'slot_duration_minutes', label: 'Slot Duration (Minutes)', type: 'number', defaultValue: 30 },
              { key: 'capacity', label: 'Simultaneous Capacity', type: 'number', defaultValue: 1 },
              { key: 'contact_phone', label: 'Phone', placeholder: '+919876543210' }
            ]}
          />
        )}

        {activeTab === 'master_payment_modes' && (
          <MasterCrudTable
            key="master_payment_modes"
            masterType="master_payment_modes"
            masterTitle="Payment Modes & Gateways"
            columns={[
              { key: 'mode_code', label: 'Mode Code', width: '150px', isPrimary: true },
              { key: 'name', label: 'Display Name', width: '220px' },
              {
                key: 'is_online',
                label: 'Payment Gateway',
                width: '140px',
                render: (val) => Boolean(val) ? (
                  <span style={{ color: '#059669', fontWeight: 600 }}>Online Gateway</span>
                ) : (
                  <span style={{ color: '#64748B' }}>Pay on Arrival / Offline</span>
                )
              },
              { key: 'description', label: 'Description' }
            ]}
            fields={[
              { key: 'mode_code', label: 'Mode Code', placeholder: 'e.g. UPI_INTENT or RAZORPAY_GATEWAY', required: true },
              { key: 'name', label: 'Display Name', placeholder: 'e.g. Instant UPI / Netbanking', required: true },
              { key: 'is_online', label: 'Online or Offline?', type: 'select', options: [{ value: 1, label: 'Online (Auto-Verified Gateway)' }, { value: 0, label: 'Offline (Pay at Property / COD)' }], required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'instructions_text', label: 'Payment Instructions (Sent on WhatsApp)', type: 'textarea' }
            ]}
          />
        )}

        {activeTab === 'master_tax_slabs' && (
          <MasterCrudTable
            key="master_tax_slabs"
            masterType="master_tax_slabs"
            masterTitle="GST & Indirect Tax Slabs"
            columns={[
              { key: 'slab_code', label: 'Slab Code', width: '130px', isPrimary: true },
              { key: 'title', label: 'Title', width: '200px' },
              { key: 'tax_rate', label: 'Total %', width: '90px', render: (val) => `${val}%` },
              { key: 'cgst_rate', label: 'CGST %', width: '80px', render: (val) => `${val}%` },
              { key: 'sgst_rate', label: 'SGST %', width: '80px', render: (val) => `${val}%` },
              { key: 'igst_rate', label: 'IGST %', width: '80px', render: (val) => `${val}%` },
              {
                key: 'is_default',
                label: 'Default',
                width: '90px',
                render: (val) => Boolean(val) ? <span style={{ color: '#059669', fontWeight: 700 }}>YES</span> : '—'
              }
            ]}
            fields={[
              { key: 'slab_code', label: 'Slab Code', placeholder: 'e.g. GST_18', required: true },
              { key: 'title', label: 'Title', placeholder: 'e.g. GST 18% Standard', required: true },
              { key: 'tax_rate', label: 'Total Tax %', type: 'number', required: true, defaultValue: 18 },
              { key: 'cgst_rate', label: 'CGST %', type: 'number', defaultValue: 9 },
              { key: 'sgst_rate', label: 'SGST %', type: 'number', defaultValue: 9 },
              { key: 'igst_rate', label: 'IGST %', type: 'number', defaultValue: 18 },
              { key: 'is_default', label: 'Default Slab?', type: 'select', options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }] }
            ]}
          />
        )}

        {activeTab === 'master_units' && (
          <MasterCrudTable
            key="master_units"
            masterType="master_units"
            masterTitle="Units of Measure (UOM)"
            columns={[
              { key: 'unit_code', label: 'Unit Code', width: '130px', isPrimary: true },
              { key: 'name', label: 'Unit Name', width: '200px' },
              { key: 'unit_symbol', label: 'Symbol', width: '100px' },
              {
                key: 'is_fractional',
                label: 'Fractional?',
                width: '120px',
                render: (val) => Boolean(val) ? 'Yes (Decimals)' : 'No (Whole Number)'
              }
            ]}
            fields={[
              { key: 'unit_code', label: 'Unit Code', placeholder: 'e.g. PCS, NIGHT, KG', required: true },
              { key: 'name', label: 'Unit Name', placeholder: 'e.g. Pieces or Night', required: true },
              { key: 'unit_symbol', label: 'Symbol', placeholder: 'e.g. pcs or night', required: true },
              { key: 'is_fractional', label: 'Allows Decimals?', type: 'select', options: [{ value: 0, label: 'No (Whole items only)' }, { value: 1, label: 'Yes (e.g. 1.5 kg)' }] }
            ]}
          />
        )}

        {activeTab === 'master_attributes' && (
          <MasterCrudTable
            key="master_attributes"
            masterType="master_attributes"
            masterTitle="Dynamic Product & Service Attributes"
            columns={[
              { key: 'attribute_code', label: 'Attribute Code', width: '150px', isPrimary: true },
              { key: 'name', label: 'Attribute Name', width: '180px' },
              { key: 'attribute_type', label: 'Input Type', width: '130px' },
              { key: 'domain_key', label: 'Domain', width: '130px' },
              { key: 'options_json', label: 'Options / Values', type: 'json' }
            ]}
            fields={[
              { key: 'attribute_code', label: 'Attribute Code', placeholder: 'e.g. SIZE or MEAL_PLAN', required: true },
              { key: 'name', label: 'Attribute Name', placeholder: 'e.g. Apparel Size or Room View', required: true },
              { key: 'attribute_type', label: 'Type', type: 'select', options: ['SELECT', 'MULTI_SELECT', 'TEXT', 'NUMBER', 'BOOLEAN'], required: true },
              { key: 'domain_key', label: 'Domain', type: 'select', options: ['GENERAL', 'HOSPITALITY', 'RETAIL_D2C', 'CLINIC_HEALTH', 'RESTAURANT', 'SALON_SPA', 'REAL_ESTATE', 'EDUCATION', 'B2B_SERVICES'], required: true },
              { key: 'options_json', label: 'Options (JSON Array)', type: 'json', placeholder: '["Small", "Medium", "Large"]' }
            ]}
          />
        )}

        {activeTab === 'master_status_tags' && (
          <MasterCrudTable
            key="master_status_tags"
            masterType="master_status_tags"
            masterTitle="Status Tags & CRM Labels"
            columns={[
              { key: 'tag_code', label: 'Tag Code', width: '160px', isPrimary: true },
              {
                key: 'tag_name',
                label: 'Tag Name',
                width: '180px',
                render: (val, item) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '4px', background: `${item.color_hex || '#6366F1'}1A`, color: item.color_hex || '#6366F1', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color_hex || '#6366F1' }} />
                    {val}
                  </span>
                )
              },
              { key: 'scope', label: 'Scope', width: '120px' },
              { key: 'color_hex', label: 'Color Hex', width: '100px' }
            ]}
            fields={[
              { key: 'tag_code', label: 'Tag Code', placeholder: 'e.g. BOOKING_CONFIRMED', required: true },
              { key: 'tag_name', label: 'Tag Name', placeholder: 'e.g. Booking Confirmed', required: true },
              { key: 'scope', label: 'Scope', type: 'select', options: ['CRM', 'ORDER', 'BOOKING', 'CONTACT', 'INQUIRY'], required: true },
              { key: 'color_hex', label: 'Color Hex Code', placeholder: '#10B981', defaultValue: '#6366F1' }
            ]}
          />
        )}

        {activeTab === 'master_domain_profiles' && (
          <MasterCrudTable
            key="master_domain_profiles"
            masterType="master_domain_profiles"
            masterTitle="Domain Profiles & Active Vertical Settings"
            columns={[
              { key: 'domain_key', label: 'Domain Key', width: '160px', isPrimary: true },
              { key: 'display_name', label: 'Display Name', width: '220px' },
              { key: 'icon', label: 'Icon', width: '100px' },
              {
                key: 'is_primary',
                label: 'Primary Profile',
                width: '120px',
                render: (val) => Boolean(val) ? <span style={{ color: '#059669', fontWeight: 700 }}>PRIMARY</span> : '—'
              },
              { key: 'description', label: 'Description' }
            ]}
            fields={[
              { key: 'domain_key', label: 'Domain Key', placeholder: 'e.g. HOSPITALITY or RETAIL_D2C', required: true },
              { key: 'display_name', label: 'Display Name', placeholder: 'e.g. Resorts & Hotels', required: true },
              { key: 'description', label: 'Description', type: 'textarea' },
              { key: 'icon', label: 'Icon Name', placeholder: 'BedDouble' },
              { key: 'is_primary', label: 'Primary Domain?', type: 'select', options: [{ value: 0, label: 'No' }, { value: 1, label: 'Yes' }] }
            ]}
          />
        )}
      </div>
    </div>
  );
}

