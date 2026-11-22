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
  RefreshCw
} from 'lucide-react';

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

export default function IndustryBlueprintsModal({ isOpen, onClose, onBlueprintApplied, token }) {
  const [blueprints, setBlueprints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seedingSector, setSeedingSector] = useState(null);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setSuccessResult(null);
      setError(null);
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

  const handleSeed = async (sectorCode) => {
    setSeedingSector(sectorCode);
    setError(null);
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch('/api/v1/universal/blueprints/seed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sectorCode })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to seed blueprint');
      }
      setSuccessResult(data);
      if (onBlueprintApplied) {
        onBlueprintApplied(data);
      }
    } catch (err) {
      setError(err.message);
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
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Sparkles size={20} color="#16A34A" />
              1-Click Industry Blueprint Launcher
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#6B7280' }}>
              Instantly seed a production-ready catalog, gallery images, add-on upsells, dynamic pricing rules, and a published WhatsApp bot flow for any sector.
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
            <div style={{ padding: '16px', borderRadius: '8px', background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534', marginBottom: '20px', fontSize: '0.9rem' }}>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <CheckCircle2 size={18} color="#16A34A" />
                <span>{successResult.sectorName} Blueprint Successfully Deployed!</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#15803D' }}>
                Created {successResult.itemCount} catalog items with gallery media, {successResult.addonGroupCount} add-on groups, {successResult.pricingRuleCount} pricing rules, and published Flow #{successResult.flowId}.
              </p>
            </div>
          )}

          {loading ? (
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

                    <button
                      type="button"
                      disabled={isSeeding}
                      onClick={() => handleSeed(bp.code)}
                      style={{
                        width: '100%',
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
                          <span>Apply Blueprint</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', background: '#F9FAFB' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #D1D5DB', background: '#FFFFFF', color: '#374151', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
