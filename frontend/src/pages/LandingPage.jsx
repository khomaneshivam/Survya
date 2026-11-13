import React, { useState } from 'react';
import { Button, Badge, Card, CardBody } from '../components/ui';
import {
  Users,
  FileSpreadsheet,
  GitBranch,
  MessageSquare,
  Send,
  Bot,
  BarChart3,
  ShieldCheck,
  Check,
  ArrowRight,
  ChevronRight
} from 'lucide-react';

export default function LandingPage({ onGetStarted, onSignIn }) {
  const [billingPeriod, setBillingPeriod] = useState('annual');
  const [activeFaq, setActiveFaq] = useState(null);

  const modules = [
    { name: 'SARVYA Core', desc: 'Tenant workspaces, identity governance, and role-based permissions.', icon: ShieldCheck, tone: 'blue' },
    { name: 'SARVYA CRM', desc: 'Contacts directory, lead pipelines, quotations, and activity timelines.', icon: Users, tone: 'purple' },
    { name: 'SARVYA Forms', desc: 'Interactive WhatsApp Flow builder, schema validation, and response analytics.', icon: FileSpreadsheet, tone: 'green' },
    { name: 'SARVYA Flow', desc: 'Stage-based workflow triggers synchronized with external sheets and stays.', icon: GitBranch, tone: 'blue' },
    { name: 'SARVYA Connect', desc: 'Multi-line Cloud API accounts, shared 2-way inbox, and broadcast campaigns.', icon: MessageSquare, tone: 'green' },
    { name: 'SARVYA AI', desc: 'Inbound assistant responders, template guardrails, and safety suppression.', icon: Bot, tone: 'purple' },
    { name: 'SARVYA Insights', desc: 'Acquisition, delivery, conversion, and lifecycle analytics with CSV/Excel export.', icon: BarChart3, tone: 'blue' }
  ];

  const pricingTiers = [
    {
      id: 'starter',
      name: 'Starter Workspace',
      badge: 'Single Team',
      description: 'Essential CRM, Forms, and WhatsApp Connect capabilities for boutique teams.',
      monthlyPrice: '₹1,499',
      annualPrice: '₹1,199',
      periodNote: 'billed annually (₹14,388/yr)',
      monthlyPeriodNote: 'billed monthly',
      featured: false,
      ctaText: 'Start Free Trial',
      features: [
        '1 Official WhatsApp Business Line',
        'Up to 10,000 monthly dispatches',
        'SARVYA CRM Lead Pipeline & Quotations',
        '2-Way Shared Inbox & Quick Replies',
        'CSV & Excel bulk audience import',
        'Meta Cloud API Webhook Sync'
      ]
    },
    {
      id: 'growth',
      name: 'Growth Automation',
      badge: 'Recommended',
      description: 'Multi-channel automation, interactive Forms, AI responders, and full Insights.',
      monthlyPrice: '₹3,499',
      annualPrice: '₹2,799',
      periodNote: 'billed annually (₹33,588/yr)',
      monthlyPeriodNote: 'billed monthly',
      featured: true,
      ctaText: 'Activate Growth Plan',
      features: [
        'Up to 3 WhatsApp Business Lines',
        'Up to 50,000 monthly dispatches',
        'Visual SARVYA Forms (WhatsApp Flows)',
        'SARVYA Flow scheduled stage automation',
        'SARVYA AI responder & suppression guardrails',
        'Audited Delivery Logs & WAMID Exports',
        'Adaptive rate pacing & priority support'
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise Ecosystem',
      badge: 'Multi-Property',
      description: 'Dedicated governance, RSA-encrypted Flows, and industry module extensibility.',
      monthlyPrice: '₹7,999',
      annualPrice: '₹6,399',
      periodNote: 'billed annually (₹76,788/yr)',
      monthlyPeriodNote: 'billed monthly',
      featured: false,
      ctaText: 'Contact Enterprise Sales',
      features: [
        'Unlimited WhatsApp Sender Lines',
        'Unlimited broadcasts & automated workflows',
        'Master Admin RBAC & workspace inspection',
        'Dynamic RSA-OAEP + AES-GCM Flow encryption',
        'Custom webhook routing & hospitality PMS sync',
        'Dedicated onboarding & 99.99% uptime SLA'
      ]
    }
  ];

  const faqs = [
    {
      q: 'How does SARVYA Connect integrate with the official WhatsApp Cloud API?',
      a: 'SARVYA connects directly via Meta Cloud API system user tokens and verified webhooks—requiring zero third-party middleware markups.'
    },
    {
      q: 'Can industry modules be used across hospitality, retail, and appointments?',
      a: 'Yes. All modules share the same SARVYA Core, CRM, Forms, and Flow design architecture while adapting domain entities like room inventory or appointments.'
    },
    {
      q: 'How do AI safety controls prevent duplicate replies to customers?',
      a: 'SARVYA AI enforces configurable suppression policies (such as once-per-contact cooldowns) and respects active opt-out registries.'
    }
  ];

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
      {/* Clean Enterprise Topbar */}
      <header style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-color)',
        position: 'sticky',
        top: 0,
        zIndex: 30
      }}>
        <div style={{
          maxWidth: '1200px',
          marginInline: 'auto',
          padding: '0 24px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--sarvya-blue)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '15px'
            }}>
              S
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', lineHeight: 1.1 }}>SARVYA</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Engagement Ecosystem</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button variant="ghost" onClick={onSignIn}>Sign In</Button>
            <Button variant="primary" onClick={onGetStarted}>
              Launch Workspace <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ maxWidth: '1200px', marginInline: 'auto', padding: '56px 24px 40px' }}>
        <div style={{ maxWidth: '720px' }}>
          <Badge tone="blue" dot>Enterprise CRM • Forms • Workflow Automation • Connect</Badge>
          <h1 style={{
            fontSize: 'clamp(30px, 4.5vw, 44px)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginTop: '14px',
            letterSpacing: '-0.025em'
          }}>
            Configurable Customer Engagement &amp; Operational Automation
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: '14px', lineHeight: 1.6 }}>
            Unify CRM lead pipelines, interactive WhatsApp Forms, automated stage workflows, shared team conversations, and analytical insights in one calm enterprise workspace.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onGetStarted} style={{ padding: '10px 18px' }}>
              Get Started <ArrowRight size={15} />
            </Button>
            <Button variant="secondary" onClick={onSignIn} style={{ padding: '10px 18px' }}>
              Sign in to Workspace
            </Button>
          </div>
        </div>

        {/* Clean Analytical Summary Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginTop: '36px'
        }}>
          {[
            { label: 'Delivery Audit Accuracy', val: '100%', sub: 'Meta WAMID verification logs', color: '#B0DBF6' },
            { label: 'Automation Lifecycle', val: '4 Stages', sub: 'Sheet sync & stay triggers', color: '#C3D1AC' },
            { label: 'Flow Data Cryptography', val: 'RSA-2048', sub: 'End-to-end AES-GCM exchange', color: '#EFB0F6' },
            { label: 'Multi-Tenant Core', val: 'RBAC', sub: 'Role & channel governance', color: '#FDB1AF' }
          ].map((stat) => (
            <Card key={stat.label}>
              <CardBody style={{ padding: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{stat.label}</span>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: stat.color }} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, marginTop: '6px' }}>{stat.val}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{stat.sub}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Modular Platform Grid */}
      <section style={{ maxWidth: '1200px', marginInline: 'auto', padding: '24px 24px 48px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Unified Platform Modules</h2>
          <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Consistent UX architecture across every team and industry vertical.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '14px' }}>
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card key={mod.name}>
                <CardBody style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <Badge tone={mod.tone}>
                      <Icon size={13} />
                    </Badge>
                    <span style={{ fontWeight: 600, fontSize: '14.5px' }}>{mod.name}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{mod.desc}</p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </section>

      {/* 3-Tier SaaS Pricing */}
      <section style={{ maxWidth: '1200px', marginInline: 'auto', padding: '24px 24px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Transparent Workspace Plans</h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Predictable SaaS licensing with zero per-message markup over Meta Cloud API rates.
            </p>
          </div>
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '3px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setBillingPeriod('monthly')}
              className={`sarvya-btn sarvya-btn-sm ${billingPeriod === 'monthly' ? 'sarvya-btn-primary' : 'sarvya-btn-ghost'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod('annual')}
              className={`sarvya-btn sarvya-btn-sm ${billingPeriod === 'annual' ? 'sarvya-btn-primary' : 'sarvya-btn-ghost'}`}
            >
              Annual (Save 20%)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '16px' }}>
          {pricingTiers.map((tier) => (
            <Card
              key={tier.id}
              style={{
                borderColor: tier.featured ? 'var(--sarvya-blue)' : 'var(--border-color)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <CardBody style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{tier.name}</h3>
                    <Badge tone={tier.featured ? 'blue' : 'neutral'}>{tier.badge}</Badge>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '6px' }}>{tier.description}</p>
                </div>

                <div style={{ paddingBlock: '12px', borderBlock: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700 }}>
                    {billingPeriod === 'annual' ? tier.annualPrice : tier.monthlyPrice}
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}> /mo</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {billingPeriod === 'annual' ? tier.periodNote : tier.monthlyPeriodNote}
                  </div>
                </div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {tier.features.map((feat) => (
                    <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      <Check size={14} color="var(--sarvya-blue)" style={{ flexShrink: 0 }} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  variant={tier.featured ? 'primary' : 'secondary'}
                  onClick={onGetStarted}
                  style={{ width: '100%' }}
                >
                  <Send size={13} />
                  <span>{tier.ctaText}</span>
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Compact FAQ */}
      <section style={{ maxWidth: '860px', marginInline: 'auto', padding: '0 24px 64px' }}>
        <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '14px' }}>Frequently Asked Questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {faqs.map((item, idx) => {
            const open = activeFaq === idx;
            return (
              <Card key={item.q}>
                <button
                  type="button"
                  onClick={() => setActiveFaq(open ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    background: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'start',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13.5px'
                  }}
                >
                  <span>{item.q}</span>
                  <ChevronRight size={15} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 140ms ease' }} />
                </button>
                {open && (
                  <div style={{ padding: '0 18px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {item.a}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
