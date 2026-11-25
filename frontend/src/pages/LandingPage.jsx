import React, { useState, useMemo } from 'react';
import usePageMeta from '../utils/usePageMeta';
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
  ChevronRight,
  Calculator,
  BedDouble,
  Building2,
  Stethoscope,
  ShoppingBag,
  Sparkles,
  ExternalLink,
  Lock,
  PhoneCall
} from 'lucide-react';

export default function LandingPage({ onGetStarted, onSignIn }) {
  // Technical SEO for public landing page
  usePageMeta({
    title: 'Zero-Markup WhatsApp Business API CRM, AI Flow Builder & Automation India',
    description: 'Connect directly to Meta Cloud API at 0% per-message markup. AI Flow Builder, multi-screen forms, shared team inbox, and DPDP 2023 compliant CRM for Indian businesses.',
    noindex: false,
    canonical: 'https://sarvya.com/'
  });

  const [billingPeriod, setBillingPeriod] = useState('annual');
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeVertical, setActiveVertical] = useState('hospitality');

  // Oct 2026 India WhatsApp Cost Calculator State
  const [marketingCount, setMarketingCount] = useState(10000);
  const [utilityCount, setUtilityCount] = useState(5000);
  const [serviceCount, setServiceCount] = useState(2000);
  const [seatsCount, setSeatsCount] = useState(3);

  // Oct 1, 2026 Official Meta India Rates & Comparison Math
  const costCalc = useMemo(() => {
    const META_MKT_RATE = 0.8631; // ₹0.8631 per marketing msg
    const META_UTL_RATE = 0.1150; // ₹0.1150 per utility msg
    const META_SRV_RATE = 0.1150; // First 1,000 free per month, then ₹0.1150

    // Exact Meta Direct Cost
    const metaMkt = marketingCount * META_MKT_RATE;
    const metaUtl = utilityCount * META_UTL_RATE;
    const metaSrv = Math.max(0, serviceCount - 1000) * META_SRV_RATE;
    const metaBaseTotal = metaMkt + metaUtl + metaSrv;

    // SARVYA Platform: 0% markup + ₹0 per seat charges (flat ₹1,199/mo plan)
    const sarvyaPlatformFee = 1199;
    const sarvyaGst = (sarvyaPlatformFee + metaBaseTotal) * 0.18;
    const sarvyaMonthlyTotal = Math.round(sarvyaPlatformFee + metaBaseTotal + sarvyaGst);

    // Typical BSP (Wati/Aisensy/Interakt/Gallabox): ~25% message markup + ₹1,200/seat/mo
    const bspSeatCost = seatsCount * 1200;
    const bspPlatformFee = 2499;
    const bspMkt = marketingCount * (META_MKT_RATE * 1.25);
    const bspUtl = utilityCount * (META_UTL_RATE * 1.25);
    const bspSrv = serviceCount * (META_SRV_RATE * 1.25);
    const bspBaseTotal = bspPlatformFee + bspSeatCost + bspMkt + bspUtl + bspSrv;
    const bspGst = bspBaseTotal * 0.18;
    const bspMonthlyTotal = Math.round(bspBaseTotal + bspGst);

    const monthlySavings = Math.max(0, bspMonthlyTotal - sarvyaMonthlyTotal);
    const annualSavings = monthlySavings * 12;

    return {
      metaMkt: Math.round(metaMkt),
      metaUtl: Math.round(metaUtl),
      metaSrv: Math.round(metaSrv),
      metaBaseTotal: Math.round(metaBaseTotal),
      sarvyaPlatformFee,
      sarvyaMonthlyTotal,
      bspMonthlyTotal,
      monthlySavings,
      annualSavings
    };
  }, [marketingCount, utilityCount, serviceCount, seatsCount]);

  const modules = [
    { name: 'SARVYA Core', desc: 'Tenant workspaces, identity governance, and role-based permissions.', icon: ShieldCheck, tone: 'blue' },
    { name: 'SARVYA CRM', desc: 'Contacts directory, lead pipelines, quotations, and activity timelines.', icon: Users, tone: 'purple' },
    { name: 'SARVYA Forms', desc: 'Interactive WhatsApp Flow builder, schema validation, and response analytics.', icon: FileSpreadsheet, tone: 'green' },
    { name: 'SARVYA Flow', desc: 'Stage-based workflow triggers synchronized with external sheets and stays.', icon: GitBranch, tone: 'blue' },
    { name: 'SARVYA Connect', desc: 'Multi-line Cloud API accounts, shared 2-way inbox, and broadcast campaigns.', icon: MessageSquare, tone: 'green' },
    { name: 'SARVYA AI', desc: 'Inbound assistant responders, task-scoped knowledge, and voice transcription.', icon: Bot, tone: 'purple' },
    { name: 'SARVYA Insights', desc: 'Acquisition, delivery, conversion, and lifecycle analytics with CSV/Excel export.', icon: BarChart3, tone: 'blue' }
  ];

  const verticalSolutions = {
    hospitality: {
      id: 'hospitality',
      title: 'Hospitality & Luxury Resorts',
      icon: BedDouble,
      tagline: 'Direct guest bookings, room photo galleries, and zero-commission reservation flows',
      bulletPoints: [
        'Live room category sync & seasonal calendar rate rules',
        'Interactive WhatsApp Flow for instant room quotations & intake',
        'Dynamic Multi-Screen Runtime (/x/:slug) with photo carousels & rate negotiation',
        'Automated stay lifecycle triggers: directions, welcome greeting, review requests'
      ],
      sampleStat: '64% fewer OTA commissions on direct re-bookings'
    },
    b2b: {
      id: 'b2b',
      title: 'B2B Sales & Digital Agencies',
      icon: Building2,
      tagline: 'Multi-workspace white-labeling, automated pipeline stages, and lead attribution',
      bulletPoints: [
        'Agency workspace manager: switch client accounts in one click',
        'Automated lead intake and instant WhatsApp quote delivery',
        'Task-scoped AI copilot drafts replies for human sales agents',
        'Meta Marketing Cooldown & IST quiet hours shield for zero spam flags'
      ],
      sampleStat: '3.8x faster sales follow-up response time'
    },
    clinics: {
      id: 'clinics',
      title: 'Healthcare Clinics & Salons',
      icon: Stethoscope,
      tagline: 'Doctor appointments, pre-consultation intake forms, and automated reminders',
      bulletPoints: [
        'WhatsApp Flow time-slot selection & appointment confirmation',
        'Automated 24h & 2h appointment reminder triggers to eliminate no-shows',
        'DPDP Act 2023 compliance with encrypted patient phone records',
        'Voice note transcription in Hindi, Marathi, and Hinglish'
      ],
      sampleStat: '42% reduction in appointment no-shows'
    },
    d2c: {
      id: 'd2c',
      title: 'D2C Brands & Food Delivery',
      icon: ShoppingBag,
      tagline: 'Interactive digital catalogs, abandoned cart recovery, and instant order tracking',
      bulletPoints: [
        'Zero-fee web catalog browsing with price range filters and instant search',
        'Abandoned checkout nudge workflows via Transactional Job Queue',
        'RBI-compliant UPI dynamic payment link delivery',
        '0% per-message markup on mass broadcast promotional campaigns'
      ],
      sampleStat: '₹14,500/mo saved on per-message BSP markups'
    }
  };

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
      ctaText: 'Start 7-Day Free Trial',
      features: [
        '1 Official WhatsApp Business Line',
        '0% markup on Meta official message rates',
        'SARVYA CRM Lead Pipeline & Quotations',
        '2-Way Shared Inbox & Mobile PWA',
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
        'Visual SARVYA Forms (WhatsApp Flows)',
        'SARVYA Flow scheduled stage automation',
        'Task-Scoped AI Agent & Inbox Copilot',
        'Regional Voice-Note Transcription',
        'Dynamic Multi-Screen Runtime (/x/:slug)',
        'Audited Delivery Logs & WAMID Exports'
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise Ecosystem',
      badge: 'Agency & Multi-Property',
      description: 'Dedicated governance, RSA-encrypted Flows, and agency multi-workspace white-labeling.',
      monthlyPrice: '₹7,999',
      annualPrice: '₹6,399',
      periodNote: 'billed annually (₹76,788/yr)',
      monthlyPeriodNote: 'billed monthly',
      featured: false,
      ctaText: 'Contact Enterprise Sales',
      features: [
        'Unlimited WhatsApp Sender Lines',
        'Multi-Workspace Agency White-Label Switcher',
        'Master Admin RBAC & DPDP Compliance Desk',
        'Dynamic RSA-OAEP + AES-GCM Flow encryption',
        'Custom webhook routing & PMS sync',
        'Dedicated account manager & 99.99% uptime SLA'
      ]
    }
  ];

  const faqs = [
    {
      q: 'What does Zero-Markup on WhatsApp messages mean?',
      a: 'Unlike traditional BSPs that charge a 20% to 26% markup per message on top of Meta\'s rates, SARVYA passes Meta\'s exact official India rates (e.g. ₹0.8631 for marketing, ₹0.1150 for utility) with 0% extra fee. You pay Meta directly through your Meta Business Manager.'
    },
    {
      q: 'Can I use SARVYA without losing my WhatsApp mobile app?',
      a: 'Yes! Through Meta Embedded Signup v4 and Coexistence mode, you can maintain your physical phone app while unlocking automated Cloud API broadcasts, AI responders, and shared team inboxes.'
    },
    {
      q: 'Is SARVYA compliant with India\'s DPDP Act 2023?',
      a: 'Yes. SARVYA includes complete data fiduciary controls: cryptographic AES-256-GCM phone masking, a soft-delete recycle bin with 30-day hard-delete purge, and an Indian Data Protection & Grievance Officer desk.'
    },
    {
      q: 'Can industry modules be used across hospitality, retail, and appointments?',
      a: 'Yes. All modules share the same SARVYA Core, CRM, Forms, and Flow design architecture while adapting domain entities like room inventory or appointments.'
    },
    {
      q: 'How does the Mobile PWA Shared Inbox work?',
      a: 'SARVYA is fully installable on mobile devices (Android & iOS). Sales agents receive push notifications when new customer messages arrive, and can reply with AI copilot suggestions in a mobile-optimized view.'
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
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Zero-Markup WhatsApp CRM</div>
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
        <div style={{ maxWidth: '760px' }}>
          <Badge tone="green" dot>Official Meta Cloud API • Zero-Markup India Rates • DPDP 2023</Badge>
          <h1 style={{
            fontSize: 'clamp(32px, 4.8vw, 48px)',
            fontWeight: 800,
            lineHeight: 1.15,
            marginTop: '14px',
            letterSpacing: '-0.025em'
          }}>
            Zero-Markup WhatsApp Business API CRM &amp; AI Flow Builder
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: '14px', lineHeight: 1.6 }}>
            Connect directly to Meta Cloud API without paying 20–26% markups per message or per-seat fees. Unify lead pipelines, interactive WhatsApp Forms, AI voice responders, and collaborative shared inboxes.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={onGetStarted} style={{ padding: '12px 22px', fontSize: '15px' }}>
              Start 7-Day Free Trial <ArrowRight size={16} />
            </Button>
            <Button variant="secondary" onClick={onSignIn} style={{ padding: '12px 20px', fontSize: '15px' }}>
              Sign in to Workspace
            </Button>
            <a
              href="https://wa.me/919876543210?text=Hi%20SARVYA%20Team!%20I%20would%20like%20a%20live%20demo%20of%20zero-markup%20WhatsApp%20CRM"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '11px 18px',
                borderRadius: '8px',
                background: '#EDF4E6',
                border: '1px solid #C3D1AC',
                color: '#2F5219',
                fontSize: '14px',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <PhoneCall size={15} color="#2F5219" />
              <span>WhatsApp Demo</span>
            </a>
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
            { label: 'Message Markup Fee', val: '0%', sub: 'Direct Meta Cloud API billing', color: '#C3D1AC' },
            { label: 'Per-Seat Charge', val: '₹0', sub: 'Unlimited team agents included', color: '#B0DBF6' },
            { label: 'Flow Data Cryptography', val: 'RSA-2048', sub: 'End-to-end AES-GCM exchange', color: '#EFB0F6' },
            { label: 'DPDP Act 2023', val: 'Compliant', sub: 'Data fiduciary controls & logs', color: '#FDB1AF' }
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

      {/* Oct 2026 India Zero-Markup Cost Calculator */}
      <section style={{ maxWidth: '1200px', marginInline: 'auto', padding: '24px 24px 48px' }}>
        <Card style={{ borderColor: 'var(--sarvya-blue)', background: '#F8FAFD' }}>
          <CardBody style={{ padding: '32px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Calculator size={20} color="var(--sarvya-blue)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sarvya-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Interactive ROI Estimator
                  </span>
                </div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#171719' }}>
                  Calculate Your Oct 2026 WhatsApp API Savings
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Compare official Meta India direct rates (₹0.8631 marketing, ₹0.1150 utility) against traditional BSPs charging 20–26% markups plus per-seat charges.
                </p>
              </div>
              <div style={{
                background: '#EDF4E6',
                border: '1px solid #C3D1AC',
                borderRadius: '12px',
                padding: '12px 20px',
                textAlign: 'right'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#2F5219' }}>Your Estimated Annual Savings</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2F5219', fontFamily: 'var(--font-display)' }}>
                  ₹{costCalc.annualSavings.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: '#526E3A' }}>
                  (₹{costCalc.monthlySavings.toLocaleString('en-IN')} saved every month)
                </div>
              </div>
            </div>

            {/* Sliders Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '28px' }}>
              {/* Marketing Messages */}
              <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E5E8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Marketing Messages / mo</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sarvya-blue)' }}>{marketingCount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200000}
                  step={1000}
                  value={marketingCount}
                  onChange={(e) => setMarketingCount(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--sarvya-blue)' }}
                />
                <div style={{ fontSize: '11px', color: '#96969C', marginTop: '6px' }}>
                  Meta Rate: ₹0.8631 • Direct Cost: ₹{costCalc.metaMkt.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Utility Messages */}
              <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E5E8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Utility Messages / mo</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sarvya-blue)' }}>{utilityCount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100000}
                  step={1000}
                  value={utilityCount}
                  onChange={(e) => setUtilityCount(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--sarvya-blue)' }}
                />
                <div style={{ fontSize: '11px', color: '#96969C', marginTop: '6px' }}>
                  Meta Rate: ₹0.1150 • Direct Cost: ₹{costCalc.metaUtl.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Service Messages */}
              <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E5E8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Service Messages / mo</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sarvya-blue)' }}>{serviceCount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25000}
                  step={500}
                  value={serviceCount}
                  onChange={(e) => setServiceCount(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--sarvya-blue)' }}
                />
                <div style={{ fontSize: '11px', color: '#96969C', marginTop: '6px' }}>
                  First 1,000 free, then ₹0.1150 • Direct Cost: ₹{costCalc.metaSrv.toLocaleString('en-IN')}
                </div>
              </div>

              {/* Team Seats */}
              <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E5E5E8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Team Agent Seats</label>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sarvya-blue)' }}>{seatsCount} Agents</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={25}
                  step={1}
                  value={seatsCount}
                  onChange={(e) => setSeatsCount(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--sarvya-blue)' }}
                />
                <div style={{ fontSize: '11px', color: '#96969C', marginTop: '6px' }}>
                  SARVYA: ₹0/seat • Traditional BSP: ₹{(seatsCount * 1200).toLocaleString('en-IN')}/mo
                </div>
              </div>
            </div>

            {/* Comparison Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '2px solid #C3D1AC',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#171719' }}>SARVYA Zero-Markup CRM</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#EDF4E6', color: '#2F5219', padding: '2px 8px', borderRadius: '6px' }}>
                      Recommended
                    </span>
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#2F5219', margin: '12px 0 6px', fontFamily: 'var(--font-display)' }}>
                    ₹{costCalc.sarvyaMonthlyTotal.toLocaleString('en-IN')}
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#67676B' }}> / month (incl. GST)</span>
                  </div>
                  <ul style={{ fontSize: '13px', color: '#52525B', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#2F5219" />
                      <span>Flat platform plan: ₹1,199/mo</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#2F5219" />
                      <span>0% markup on Meta messages: ₹{costCalc.metaBaseTotal.toLocaleString('en-IN')}</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Check size={14} color="#2F5219" />
                      <span>Zero seat fees for {seatsCount} agents</span>
                    </li>
                  </ul>
                </div>
                <Button variant="primary" onClick={onGetStarted} style={{ marginTop: '20px' }}>
                  Lock In Zero-Markup Plan <ArrowRight size={14} />
                </Button>
              </div>

              <div style={{
                background: '#F9FAFB',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#6B7280' }}>Traditional WhatsApp BSP</span>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#9CA3AF', margin: '12px 0 6px', fontFamily: 'var(--font-display)' }}>
                    ₹{costCalc.bspMonthlyTotal.toLocaleString('en-IN')}
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#9CA3AF' }}> / month (incl. GST)</span>
                  </div>
                  <ul style={{ fontSize: '13px', color: '#9CA3AF', display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                    <li>• Higher base subscription: ₹2,499/mo</li>
                    <li>• 20–26% per-message markup on all broadcasts</li>
                    <li>• Extra seat fees: ₹{(seatsCount * 1200).toLocaleString('en-IN')}/mo</li>
                  </ul>
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '20px', fontStyle: 'italic' }}>
                  *Based on published competitor enterprise pricing across Wati, Interakt, and Aisensy as of late 2026.
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* Vertical Solutions Switcher */}
      <section style={{ maxWidth: '1200px', marginInline: 'auto', padding: '24px 24px 48px' }}>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#171719' }}>
            Built for Your Industry Workflow
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Zero-code industry modules customized for high-touch customer conversations.
          </p>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px' }}>
          {Object.values(verticalSolutions).map((v) => {
            const Icon = v.icon;
            const isActive = activeVertical === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVertical(v.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid var(--sarvya-blue)' : '1px solid #E5E5E8',
                  background: isActive ? '#F0F6FD' : '#FFFFFF',
                  color: isActive ? 'var(--sarvya-blue)' : '#52525B',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={16} />
                <span>{v.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Vertical Content Card */}
        {(() => {
          const current = verticalSolutions[activeVertical];
          const CurrentIcon = current.icon;
          return (
            <Card style={{ borderColor: 'var(--border-color)', background: '#FFFFFF' }}>
              <CardBody style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: '#EDF4E6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2F5219'
                  }}>
                    <CurrentIcon size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#171719' }}>{current.title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{current.tagline}</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {current.bulletPoints.map((bp) => (
                      <div key={bp} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', color: '#171719' }}>
                        <Check size={16} color="var(--sarvya-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{bp}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    background: '#F8FAFD',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    textAlign: 'center'
                  }}>
                    <Sparkles size={24} color="var(--sarvya-blue)" />
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#171719', marginTop: '8px' }}>
                      {current.sampleStat}
                    </div>
                    <Button variant="primary" onClick={onGetStarted} style={{ marginTop: '16px' }}>
                      Deploy {current.title.split('&')[0]} Pack <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })()}
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

      {/* Trust & DPDP Act 2023 Compliance Footer */}
      <footer style={{
        background: '#FFFFFF',
        borderTop: '1px solid #E5E5E8',
        padding: '48px 24px 36px',
        color: '#67676B'
      }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '32px', marginBottom: '36px' }}>
            {/* Col 1: Identity & DPDP Badge */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '6px',
                  background: 'var(--sarvya-blue)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px'
                }}>
                  S
                </div>
                <span style={{ fontWeight: 800, fontSize: '16px', color: '#171719' }}>SARVYA</span>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.5, color: '#67676B', marginBottom: '12px' }}>
                India's high-performance zero-markup WhatsApp Business API CRM &amp; AI Flow Builder platform.
              </p>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: '#EDF4E6',
                border: '1px solid #C3D1AC',
                color: '#2F5219',
                fontSize: '12px',
                fontWeight: 600
              }}>
                <ShieldCheck size={14} color="#2F5219" />
                <span>DPDP Act 2023 Compliant</span>
              </div>
            </div>

            {/* Col 2: Data Fiduciary Governance */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#171719', marginBottom: '10px' }}>
                Data Protection &amp; Governance
              </h4>
              <p style={{ fontSize: '12.5px', lineHeight: 1.5, color: '#67676B', marginBottom: '8px' }}>
                All customer records, phone digests, and message contents are cryptographically handled with AES-256-GCM. 30-day soft-delete retention ensures right-to-be-forgotten adherence under Indian law.
              </p>
              <div style={{ fontSize: '12px', color: '#96969C' }}>
                Data hosted locally on Indian cloud servers (Mumbai/Delhi regions).
              </div>
            </div>

            {/* Col 3: Grievance Officer Contact Block */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#171719', marginBottom: '10px' }}>
                Indian Grievance Redressal
              </h4>
              <div style={{ fontSize: '12.5px', lineHeight: 1.5, color: '#67676B' }}>
                <p><strong>Officer:</strong> Aditi Deshmukh</p>
                <p><strong>Designation:</strong> Data Protection &amp; Grievance Officer</p>
                <p><strong>Email:</strong> <a href="mailto:grievance@sarvya.com" style={{ color: 'var(--sarvya-blue)' }}>grievance@sarvya.com</a></p>
                <p style={{ marginTop: '4px', fontSize: '11.5px', color: '#96969C' }}>
                  SARVYA Technologies Pvt. Ltd., 100 Feet Rd, Indiranagar, Bengaluru, KA 560038
                </p>
              </div>
            </div>

            {/* Col 4: Quick Action */}
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#171719', marginBottom: '10px' }}>
                Live WhatsApp Assistance
              </h4>
              <p style={{ fontSize: '12.5px', color: '#67676B', marginBottom: '12px' }}>
                Speak with our team directly on WhatsApp to explore enterprise coexistence onboarding.
              </p>
              <a
                href="https://wa.me/919876543210?text=Hi%20SARVYA%20Team!%20I%20would%20like%20to%20learn%20more"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: '#25D366',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 700,
                  textDecoration: 'none'
                }}
              >
                <span>Chat with Team</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div style={{
            borderTop: '1px solid #EEEEF0',
            paddingTop: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '12px'
          }}>
            <div>
              &copy; {new Date().getFullYear()} SARVYA Technologies Private Limited. All rights reserved.
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <span style={{ cursor: 'pointer' }} onClick={() => alert('SARVYA Privacy Policy: We comply with India DPDP Act 2023. Data is never shared or sold.')}>Privacy Policy</span>
              <span style={{ cursor: 'pointer' }} onClick={() => alert('SARVYA Terms of Service: Direct Cloud API usage governed by Meta Platform Terms.')}>Terms of Service</span>
              <span style={{ cursor: 'pointer' }} onClick={() => alert('SARVYA Refund Policy: 7-day trial with no credit card required.')}>Refund Policy</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
