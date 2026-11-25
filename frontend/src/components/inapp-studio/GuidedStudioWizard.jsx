import React, { useState } from 'react';
import { Button, Card, CardBody, Modal } from '../ui';
import { getAuthHeaders } from '../../utils/apiAuth';
import { Sparkles, MessageCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

const BUSINESS_TYPES = [
  { value: 'HOSPITALITY', label: 'Hospitality & Resorts' },
  { value: 'RETAIL', label: 'Retail & E-Commerce' },
  { value: 'HEALTHCARE', label: 'Clinics & Healthcare' },
  { value: 'SERVICES', label: 'Home & Professional Services' },
  { value: 'REAL_ESTATE', label: 'Real Estate & Properties' },
  { value: 'EDUCATION', label: 'Education & Admissions' },
  { value: 'B2B_SALES', label: 'B2B Sales & Quotations' }
];

const GOALS = [
  { value: 'LEAD_QUALIFICATION', label: 'Lead Qualification' },
  { value: 'BOOKING_CONFIRMED', label: 'Hotel / Room Booking' },
  { value: 'APPOINTMENT_CONFIRMED', label: 'Appointment Scheduling' },
  { value: 'ORDER_PLACED', label: 'Product Ordering' },
  { value: 'QUOTATION_REQUESTED', label: 'Quotation Request' },
  { value: 'PROPERTY_ENQUIRY', label: 'Property Enquiry' },
  { value: 'REGISTRATION_COMPLETED', label: 'Customer Registration' }
];

export default function GuidedStudioWizard({ isOpen, onClose, token, onCreated, toast }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'HOSPITALITY',
    goalType: 'BOOKING_CONFIRMED',
    welcomeMessage: 'Hi! Tell us what you are looking for and we will guide you step-by-step.',
    quickActionsText: 'Check Availability, Get Instant Quote, Talk to Specialist',
    phoneNumber: '',
    prefilledMessage: '',
    initialReplyText: 'Thanks for contacting us on WhatsApp! Tap below to open our quick interactive assistant:',
    publishImmediately: true,
    autoCreateShareLink: true
  });

  const handleCreate = async () => {
    if (!form.businessName.trim()) {
      alert('Please enter your business name');
      return;
    }
    setSubmitting(true);
    try {
      const quickActions = form.quickActionsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/v1/studio/experiences/guided', {
        method: 'POST',
        headers: getAuthHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...form,
          quickActions
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.message || 'Unable to create guided experience');
        return;
      }
      if (toast) toast('Guided conversational experience & WhatsApp entry ready!');
      if (onCreated) onCreated(data.data);
      setStep(1);
      onClose();
    } catch (err) {
      alert(err.message || 'Error creating guided experience');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mode A: Guided Business Setup">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#475569' }}>
          <Sparkles size={15} color="#2F5219" />
          <span>Step {step} of 3 — Set up your WhatsApp entry & interactive chat in plain business language.</span>
        </div>

        {step === 1 && (
          <Card>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Business Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Coastal Palm Resort"
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Industry Category</label>
                <select
                  value={form.businessType}
                  onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                  style={inputStyle}
                >
                  {BUSINESS_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Primary Business Objective (Goal)</label>
                <select
                  value={form.goalType}
                  onChange={(e) => setForm({ ...form, goalType: e.target.value })}
                  style={inputStyle}
                >
                  {GOALS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
            </CardBody>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Customer Welcome Message</label>
                <textarea
                  rows={3}
                  value={form.welcomeMessage}
                  onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Quick Action Buttons (comma-separated)</label>
                <input
                  type="text"
                  value={form.quickActionsText}
                  onChange={(e) => setForm({ ...form, quickActionsText: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </CardBody>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803D', fontSize: '12.5px', fontWeight: 600 }}>
                <MessageCircle size={15} />
                <span>WhatsApp Entry Link & First Automated Reply</span>
              </div>
              <div>
                <label style={labelStyle}>WhatsApp Number (with country code, e.g. 919820012345)</label>
                <input
                  type="text"
                  placeholder="Optional — uses verified business line if blank"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Pre-filled WhatsApp Link Message</label>
                <input
                  type="text"
                  placeholder={`Hi ${form.businessName || 'Team'}, I want to enquire`}
                  value={form.prefilledMessage}
                  onChange={(e) => setForm({ ...form, prefilledMessage: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>First Automated WhatsApp Reply</label>
                <textarea
                  rows={2}
                  value={form.initialReplyText}
                  onChange={(e) => setForm({ ...form, initialReplyText: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.publishImmediately}
                  onChange={(e) => setForm({ ...form, publishImmediately: e.target.checked })}
                />
                <span>Publish experience immediately so customers can test it right away</span>
              </label>
            </CardBody>
          </Card>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          {step > 1 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Next <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" disabled={submitting} onClick={handleCreate}>
              <CheckCircle2 size={14} />
              {submitting ? 'Creating...' : 'Create Experience & Link'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: '12.5px',
  fontWeight: 600,
  color: '#334155',
  marginBottom: '6px'
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: '8px',
  border: '1px solid #CBD5E1',
  fontSize: '13.5px',
  backgroundColor: '#FFFFFF',
  color: '#0F172A'
};
