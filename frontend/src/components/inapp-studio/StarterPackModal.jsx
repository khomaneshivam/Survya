import React, { useState } from 'react';
import { Modal, Button, Badge } from '../ui';
import { BedDouble, ShoppingBag, Briefcase, Stethoscope, Sparkles, ArrowRight } from 'lucide-react';

const STARTER_PACKS = [
  {
    type: 'HOSPITALITY',
    title: 'Hospitality & Luxury Resort Booking',
    icon: BedDouble,
    color: '#059669',
    badge: 'Recommended',
    description: 'Direct resort booking journey with villa explorer, nightly price slider, photo galleries, guest intake with date validation, rate negotiation, and concierge callback.',
    screensCount: 7,
    screens: ['Welcome Hero', 'Villa Explorer (Price Slider)', 'Room Detail & Gallery', 'Guest Intake (Date Validated)', 'Rate Negotiation', 'Concierge Call/Chat', 'Booking Confirmation']
  },
  {
    type: 'RETAIL',
    title: 'Storefront Catalog & Instant Ordering',
    icon: ShoppingBag,
    color: '#2563EB',
    badge: 'E-Commerce',
    description: 'Interactive product catalog with real-time stock sync, price range filters, variant selection, delivery intake form with Indian PIN validation, and instant WhatsApp confirmation.',
    screensCount: 5,
    screens: ['Storefront Welcome', 'Product Grid & Filters', 'Item Detail & Bulk Offer', 'Delivery Address & Slot Form', 'Order Confirmation']
  },
  {
    type: 'B2B_SALES',
    title: 'Enterprise Solution & Lead Qualification',
    icon: Briefcase,
    color: '#4F46E5',
    badge: 'B2B CRM',
    description: 'High-ticket sales pipeline with solution tier comparison, qualification intake (work email, team size, monthly volume), custom quote negotiation, and architect call scheduling.',
    screensCount: 6,
    screens: ['Enterprise Hero', 'Solution Tier Explorer', 'Qualification Intake Form', 'Custom Rate Negotiation', 'Schedule Architecture Review', 'Request Confirmed']
  },
  {
    type: 'SERVICES',
    title: 'Wellness Clinic & Professional Services',
    icon: Stethoscope,
    color: '#0D9488',
    badge: 'Appointments',
    description: 'Healthcare, clinic, and salon appointment scheduling with service fee filters, date/time slot selection, intake form with future date validation, and instant appointment voucher.',
    screensCount: 5,
    screens: ['Clinic Welcome', 'Clinical Services Menu', 'Appointment Intake Form', 'Hold Slot & Confirmation', 'Support & Directions']
  }
];

export default function StarterPackModal({ isOpen, onClose, onSelectStarter, loading }) {
  const [selectedType, setSelectedType] = useState('HOSPITALITY');

  const selectedPack = STARTER_PACKS.find(p => p.type === selectedType) || STARTER_PACKS[0];

  const handleClone = () => {
    if (onSelectStarter) {
      onSelectStarter(selectedType);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="1-Click Domain Starter Packs"
      subtitle="Instantly instantiate a complete, multi-screen database-driven web experience."
      size="xl"
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {STARTER_PACKS.map(pack => {
          const Icon = pack.icon;
          const isSelected = selectedType === pack.type;
          return (
            <div
              key={pack.type}
              onClick={() => setSelectedType(pack.type)}
              style={{
                border: isSelected ? `2px solid ${pack.color}` : '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--bg-active, rgba(5, 150, 105, 0.05))' : 'var(--card-bg, #ffffff)',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: `${pack.color}15`,
                  color: pack.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={22} />
                </div>
                <Badge variant={isSelected ? 'success' : 'default'}>{pack.badge}</Badge>
              </div>

              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '600' }}>{pack.title}</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                {pack.description}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: pack.color, fontWeight: '500' }}>
                <Sparkles size={14} />
                <span>{pack.screensCount} Pre-configured Screens</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Preview Box */}
      <div style={{
        backgroundColor: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '10px',
        padding: '16px',
        marginBottom: '24px',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            Included Multi-Screen Flow Sequence:
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {selectedPack.screens.length} Screens + Validated Forms
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {selectedPack.screens.map((screenName, idx) => (
            <div
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              <span style={{ color: selectedPack.color, fontWeight: 'bold' }}>{idx + 1}.</span>
              <span>{screenName}</span>
              {idx < selectedPack.screens.length - 1 && (
                <ArrowRight size={12} style={{ color: 'var(--text-tertiary, #94a3b8)', marginLeft: '4px' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleClone} disabled={loading}>
          {loading ? 'Creating Experience...' : `Instantiate ${selectedPack.title}`}
        </Button>
      </div>
    </Modal>
  );
}
