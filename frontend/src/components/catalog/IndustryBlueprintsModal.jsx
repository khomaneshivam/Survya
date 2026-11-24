import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  BedDouble,
  ShoppingBag,
  Stethoscope,
  UtensilsCrossed,
  Sparkle,
  Building,
  GraduationCap,
  Boxes,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import { automationApi } from '../../features/automation/api/automationApi';

const SECTOR_ICONS = {
  HOSPITALITY: BedDouble,
  RETAIL_ECOM: ShoppingBag,
  CLINIC_HEALTH: Stethoscope,
  RESTAURANT_FOOD: UtensilsCrossed,
  SALON_WELLNESS: Sparkle,
  REAL_ESTATE: Building,
  EDUCATION_COACHING: GraduationCap,
  B2B_WHOLESALE: Boxes
};

export default function IndustryBlueprintsModal({
  isOpen,
  onClose,
  onBlueprintApplied,
  onOpenFlow,
  onOpenProfile,
  token
}) {
  const [blueprints, setBlueprints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seedingSector, setSeedingSector] = useState(null);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  // Customization Step
  const [activeBlueprint, setActiveBlueprint] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [customPhone, setCustomPhone] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSuccessResult(null);
      setError(null);
      setActiveBlueprint(null);
      return;
    }

    const fetchBlueprints = async () => {
      setLoading(true);
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/v1/universal/blueprints', { headers });
        const data = await res.json();
        if (data.success) {
          setBlueprints(data.blueprints);
        }
      } catch (err) {
        setError('Failed to load industry blueprints');
      } finally {
        setLoading(false);
      }
    };

    fetchBlueprints();
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleStartCustomizing = (bp) => {
    setActiveBlueprint(bp);
    setCustomName(bp.entityName || bp.name);
    setCustomCity('Mumbai');
    setCustomPhone('');
    setError(null);
  };

  const handleImportFullSuite = async (sectorCode, overrides = {}) => {
    setSeedingSector(sectorCode);
    setError(null);
    try {
      const payload = {
        sectorCode,
        businessName: overrides.businessName || customName || undefined,
        city: overrides.city || customCity || undefined,
        phone: overrides.phone || customPhone || undefined
      };

      const res = await automationApi.importFullIndustrySuite(payload);
      if (!res || !res.success) {
        throw new Error(res?.error || 'Failed to import industry suite');
      }

      setSuccessResult(res);
      setActiveBlueprint(null);

      if (onBlueprintApplied) {
        onBlueprintApplied(res);
      }
    } catch (err) {
      setError(err.message || 'Error deploying blueprint');
    } finally {
      setSeedingSector(null);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        maxWidth: '920px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)'
        }}>
          <div>
            <h2 style={{ fontSize: '1.20rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Sparkles size={20} color="#16A34A" />
              1-Click Industry Blueprint Launcher
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#6B7280' }}>
              Scaffold ERP master data, catalog products, pricing rules, and a pre-wired WhatsApp flow for your account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '6px', borderRadius: '8px', color: '#9CA3AF' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successResult && (
            <div style={{ padding: '18px', borderRadius: '10px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', marginBottom: '20px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.96rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <CheckCircle2 size={20} color="#16A34A" />
                <span>{successResult.sectorName} Suite Successfully Deployed!</span>
              </div>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: '#15803D', lineHeight: 1.5 }}>
                Created business entity <strong>"{successResult.businessName}"</strong>, seeded ERP masters, {successResult.itemCount} catalog items with gallery media, {successResult.addonGroupCount} add-on groups, {successResult.pricingRuleCount} pricing rules, and generated conversation Flow #{successResult.flowId}.
              </p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {onOpenFlow && successResult.flowId && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenFlow(successResult.flowId);
                      onClose();
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🎨 Open Flow #{successResult.flowId} in Canvas</span>
                    <ExternalLink size={14} />
                  </button>
                )}
                {onOpenProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenProfile();
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#FFFFFF',
                      color: '#166534',
                      border: '1px solid #86EFAC',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    ⚙️ Review Business Profile
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#E2E8F0',
                    color: '#334155',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {activeBlueprint ? (
            /* Customization & Launch View */
            <div style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px', background: '#FAFAFA' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => setActiveBlueprint(null)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#4B5563', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <ChevronLeft size={16} />
                  Back to All Blueprints
                </button>
                <span style={{ fontSize: '0.78rem', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                  {activeBlueprint.name}
                </span>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
                  Customize Your {activeBlueprint.name} Setup
                </h3>
                <p style={{ margin: 0, fontSize: '0.80rem', color: '#6B7280' }}>
                  Optionally personalize your business brand details. You can also fine-tune them anytime from the Business Profile Drawer.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
                    Business / Brand Name *
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. My Business Name"
                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', border: '1px solid #D1D5DB', borderRadius: '6px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
                      City / Primary Location
                    </label>
                    <input
                      type="text"
                      value={customCity}
                      onChange={(e) => setCustomCity(e.target.value)}
                      placeholder="e.g. Mumbai / Bangalore / Goa"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', border: '1px solid #D1D5DB', borderRadius: '6px', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.76rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>
                      WhatsApp Handoff Phone (Optional)
                    </label>
                    <input
                      type="text"
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      style={{ width: '100%', padding: '8px 10px', fontSize: '0.84rem', border: '1px solid #D1D5DB', borderRadius: '6px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setActiveBlueprint(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={seedingSector === activeBlueprint.code}
                  onClick={() => handleImportFullSuite(activeBlueprint.code)}
                  style={{
                    flex: 1,
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    cursor: seedingSector === activeBlueprint.code ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {seedingSector === activeBlueprint.code ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Provisioning Industry Suite &amp; Bot Flow...</span>
                    </>
                  ) : (
                    <>
                      <span>🚀 Deploy Suite &amp; Generate Flow</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280', fontSize: '0.9rem' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              Loading sector blueprints...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {blueprints.map(bp => {
                const IconComponent = SECTOR_ICONS[bp.code] || Boxes;
                const isSeeding = seedingSector === bp.code;
                return (
                  <div
                    key={bp.code}
                    style={{
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      background: '#FFFFFF',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
                          <IconComponent size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#111827' }}>{bp.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{bp.domain}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#4B5563', marginBottom: '12px', lineHeight: '1.4' }}>
                        {bp.tagline}
                      </div>

                      <div style={{ background: '#F9FAFB', borderRadius: '6px', padding: '8px 10px', marginBottom: '14px', fontSize: '0.75rem', color: '#4B5563' }}>
                        <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>Sample Items:</div>
                        <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.4' }}>
                          {bp.itemsPreview?.slice(0, 2).map((item, idx) => (
                            <li key={idx}>
                              {item.title} (₹{item.base_price.toLocaleString('en-IN')})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleStartCustomizing(bp)}
                        title="Customize before deploying"
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid #D1D5DB',
                          background: '#FFFFFF',
                          color: '#374151',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={isSeeding}
                        onClick={() => handleImportFullSuite(bp.code, { businessName: bp.entityName })}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: '#16A34A',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: isSeeding ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        {isSeeding ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Deploying...</span>
                          </>
                        ) : (
                          <>
                            <span>1-Click Deploy</span>
                            <ArrowRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
