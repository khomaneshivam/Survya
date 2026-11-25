import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button } from '../components/ui';
import { ArrowRight, AlertCircle, Eye, EyeOff, CheckCircle2, Sparkles } from 'lucide-react';

const FALLBACK_DOMAINS = [
  {
    code: 'HOSPITALITY',
    name: 'Hospitality & Resorts',
    tagline: 'Direct room & villa bookings, date-range tariffs, and concierge automation',
    highlights: ['Room & Villa Categories', 'Check-in / Check-out Calendar', 'Seasonal Rates & Quote Builder']
  },
  {
    code: 'RESTAURANT_FOOD',
    name: 'Restaurants & Cloud Kitchens',
    tagline: 'Digital menu ordering, Veg/Non-Veg add-ons, and instant out-of-stock toggles',
    highlights: ['Categorized Food Menu', 'Add-ons & Spice Prefs', 'WhatsApp Quick Ordering']
  },
  {
    code: 'RETAIL_ECOM',
    name: 'Retail & D2C E-Commerce',
    tagline: 'Product catalogs, size/variant stock tracking, promo codes, and doorstep orders',
    highlights: ['Multi-Variant SKU Stock', 'Cart & Promo Discounts', 'Automated Order Confirmation']
  },
  {
    code: 'CLINIC_HEALTH',
    name: 'Clinics & Healthcare',
    tagline: 'Doctor consultation slots, specialty scheduling, and WhatsApp patient intake',
    highlights: ['Doctor & Therapy Slots', 'Consultation Scheduling', 'Automated Reminder Receipts']
  },
  {
    code: 'SALON_WELLNESS',
    name: 'Salons & Wellness Spas',
    tagline: 'Stylist time-slot booking, therapy packages, and VIP client follow-ups',
    highlights: ['Appointment Time Slots', 'Service Add-on Upsells', 'Instant Confirmation Alerts']
  },
  {
    code: 'REAL_ESTATE',
    name: 'Real Estate & Living',
    tagline: 'Property listings, budget qualification, and automated site-visit scheduling',
    highlights: ['Project & Unit Inventory', 'Buyer Lead Qualification', 'Site Visit Booking']
  },
  {
    code: 'EDUCATION_COACHING',
    name: 'Education & Coaching',
    tagline: 'Course catalogs, batch admissions, counselling bookings, and student onboarding',
    highlights: ['Courses & Cohort Batches', 'Admission Intake Forms', 'Registration Receipts']
  },
  {
    code: 'B2B_WHOLESALE',
    name: 'B2B Wholesale & Manufacturing',
    tagline: 'Tiered bulk MOQ pricing, dynamic RFQ quotations, and lead qualification',
    highlights: ['Bulk Tier Volume Discounts', 'Instant RFQ Quotations', 'Rate Negotiation Desk']
  }
];

export default function RegisterPage({ onSwitchToLogin, onBackToLanding }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [domain, setDomain] = useState('HOSPITALITY');
  const [domains, setDomains] = useState(FALLBACK_DOMAINS);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/domains')
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.success && Array.isArray(data.domains) && data.domains.length > 0) {
          setDomains(data.domains);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedDomainMeta = domains.find((d) => d.code === domain) || domains[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setLoading(true);
    try {
      await register({
        name,
        businessName: businessName.trim() || undefined,
        domain,
        email,
        phone,
        password
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg-app)'
    }}>
      <Card style={{ width: '100%', maxWidth: '500px' }}>
        <CardBody style={{ padding: '28px 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--sarvya-blue)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '18px',
              margin: '0 auto 10px'
            }}>
              S
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Create SARVYA Account</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
              Select your business domain to launch a pre-built WhatsApp &amp; Studio experience in seconds
            </p>
          </div>

          {error && (
            <div role="alert" style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              border: '1px solid var(--status-error-border)',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px'
            }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="sarvya-field-label" htmlFor="regDomain">Business Domain (Pre-Built Profile)</label>
              <select
                id="regDomain"
                name="domain"
                required
                className="sarvya-select"
                style={{ width: '100%', fontWeight: 600 }}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                {domains.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>

              {selectedDomainMeta && (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  fontSize: '12px',
                  color: '#166534'
                }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                    <Sparkles size={13} />
                    <span>Pre-Built {selectedDomainMeta.name} Suite Included</span>
                  </div>
                  <div style={{ color: '#15803D', marginBottom: '6px' }}>{selectedDomainMeta.tagline}</div>
                  {Array.isArray(selectedDomainMeta.highlights) && selectedDomainMeta.highlights.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedDomainMeta.highlights.slice(0, 3).map((hl) => (
                        <span key={hl} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600 }}>
                          <CheckCircle2 size={11} />
                          {hl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="sarvya-field-label" htmlFor="regName">Full Name</label>
                <input
                  id="regName"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  className="sarvya-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav Sharma"
                />
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="regBizName">Business Name</label>
                <input
                  id="regBizName"
                  name="organization"
                  type="text"
                  autoComplete="organization"
                  className="sarvya-input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder={selectedDomainMeta?.sampleBusinessName || 'Optional brand name'}
                />
              </div>
            </div>

            <div>
              <label className="sarvya-field-label" htmlFor="regEmail">Work Email</label>
              <input
                id="regEmail"
                name="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                className="sarvya-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="sarvya-field-label" htmlFor="regPhone">WhatsApp / Mobile Number</label>
              <input
                id="regPhone"
                name="phone"
                type="tel"
                autoComplete="tel"
                required
                className="sarvya-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
            </div>

            <div>
              <label className="sarvya-field-label" htmlFor="regPwd">Password (min 8 characters)</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="regPwd"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="sarvya-input"
                  style={{ paddingRight: '40px' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%', padding: '10px 16px', marginTop: '4px' }}>
              <span>{loading ? 'Provisioning pre-built domain...' : 'Create Workspace Account'}</span>
              <ArrowRight size={15} />
            </Button>
          </form>

          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            <button type="button" onClick={onBackToLanding} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ← Back to overview
            </button>
            <button type="button" onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: 'var(--sarvya-blue)', fontWeight: 600, cursor: 'pointer' }}>
              Sign in instead
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
