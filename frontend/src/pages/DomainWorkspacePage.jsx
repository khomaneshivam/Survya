import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Card, CardHeader, CardBody, Badge, Button, KpiCard, EmptyState, Skeleton } from '../components/ui';
import {
  BedDouble,
  UtensilsCrossed,
  ShoppingBag,
  Stethoscope,
  Sparkle,
  Building,
  GraduationCap,
  Boxes,
  CheckCircle2,
  Lock,
  ArrowRight,
  ExternalLink,
  Layers,
  GitBranch,
  Smartphone,
  Database,
  Receipt,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

const DOMAIN_ICONS = {
  HOSPITALITY: BedDouble,
  RESTAURANT_FOOD: UtensilsCrossed,
  RETAIL_ECOM: ShoppingBag,
  CLINIC_HEALTH: Stethoscope,
  SALON_WELLNESS: Sparkle,
  REAL_ESTATE: Building,
  EDUCATION_COACHING: GraduationCap,
  B2B_WHOLESALE: Boxes
};

const DOMAIN_ACCENTS = {
  HOSPITALITY: { bg: '#EEF5FB', fg: '#1D4ED8', border: '#BFDBFE' },
  RESTAURANT_FOOD: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  RETAIL_ECOM: { bg: '#FDF2F8', fg: '#BE185D', border: '#FBCFE8' },
  CLINIC_HEALTH: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  SALON_WELLNESS: { bg: '#FAF5FF', fg: '#7E22CE', border: '#E9D5FF' },
  REAL_ESTATE: { bg: '#FEFCE8', fg: '#A16207', border: '#FDE68A' },
  EDUCATION_COACHING: { bg: '#F0FDF4', fg: '#15803D', border: '#BBF7D0' },
  B2B_WHOLESALE: { bg: '#F1F5F9', fg: '#334155', border: '#CBD5E1' }
};

export default function DomainWorkspacePage({ onNavigate, setActiveTab }) {
  const {
    token,
    isPlatformAdmin,
    domainAccess: authDomainAccess,
    allowedDomains: authAllowedDomains,
    primaryDomain: authPrimaryDomain,
    planCode: authPlanCode,
    refreshUser
  } = useAuth();

  const [access, setAccess] = useState(authDomainAccess || null);
  const [entities, setEntities] = useState([]);
  const [items, setItems] = useState([]);
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activatingDomain, setActivatingDomain] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const navigateTo = useCallback((tab) => {
    if (typeof onNavigate === 'function') {
      onNavigate(tab);
    } else if (typeof setActiveTab === 'function') {
      setActiveTab(tab);
    } else if (typeof window !== 'undefined') {
      window.location.hash = `#${tab}`;
    }
  }, [onNavigate, setActiveTab]);

  const loadDomainWorkspace = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [accessRes, entRes, itemsRes, expRes] = await Promise.all([
        fetch('/api/v1/studio/domain-access', { headers }),
        fetch('/api/v1/entities', { headers }),
        fetch('/api/v1/universal/items', { headers }),
        fetch('/api/v1/studio/experiences', { headers })
      ]);

      const [accessData, entData, itemsData, expData] = await Promise.all([
        accessRes.json().catch(() => ({})),
        entRes.json().catch(() => ({})),
        itemsRes.json().catch(() => ({})),
        expRes.json().catch(() => ({}))
      ]);

      if (accessData.success && accessData.data) {
        setAccess(accessData.data);
      }
      if (entData.success) {
        setEntities(entData.entities || []);
      }
      if (itemsData.success) {
        setItems(itemsData.items || []);
      }
      if (expData.success) {
        setExperiences(expData.data || []);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load domain workspace.' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDomainWorkspace();
  }, [loadDomainWorkspace]);

  const effectiveAccess = access || authDomainAccess || {};
  const primaryDomain = effectiveAccess.primaryDomain || authPrimaryDomain || 'HOSPITALITY';
  const allowedDomains = effectiveAccess.allowedDomains || authAllowedDomains || [primaryDomain];
  const planCode = effectiveAccess.planCode || authPlanCode || 'TRIAL';
  const maxDomains = effectiveAccess.maxDomains || (isPlatformAdmin ? 8 : 1);
  const availableProfiles = effectiveAccess.availableProfiles || [];
  const activeProfile = effectiveAccess.activeProfile
    || availableProfiles.find((p) => p.code === primaryDomain)
    || { code: primaryDomain, name: primaryDomain, shortLabel: primaryDomain, tagline: 'Pre-built conversational commerce stack', highlights: [] };

  const ActiveIcon = DOMAIN_ICONS[primaryDomain] || Sparkles;
  const activeAccent = DOMAIN_ACCENTS[primaryDomain] || DOMAIN_ACCENTS.HOSPITALITY;
  const primaryExp = experiences.find((e) => e.status === 'PUBLISHED') || experiences[0] || null;
  const primaryEntity = entities[0] || null;

  async function handleActivateOrSwitchDomain(domainCode, makePrimary = true) {
    setActivatingDomain(domainCode);
    setFeedback(null);
    try {
      const res = await fetch('/api/v1/studio/domain-access/activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ domain: domainCode, makePrimary })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to activate domain');
      }
      setFeedback({
        type: 'success',
        message: `${domainCode.replace(/_/g, ' ')} suite is active and provisioned for your workspace.`
      });
      if (typeof refreshUser === 'function') {
        await refreshUser();
      }
      await loadDomainWorkspace();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Unable to activate domain.' });
    } finally {
      setActivatingDomain(null);
    }
  }

  return (
    <div className="sarvya-page-container">
      <PageHeader
        title={activeProfile.name}
        subtitle={activeProfile.tagline}
        badge={isPlatformAdmin ? 'SUPER-ADMIN · ALL 8 DOMAINS' : `${planCode} PLAN · ${allowedDomains.length}/${maxDomains} DOMAIN${maxDomains > 1 ? 'S' : ''}`}
        actions={(
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigateTo('catalog')}>
              <Layers size={15} />
              <span>Catalog &amp; Menu</span>
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('transactions')}>
              <Receipt size={15} />
              <span>Orders &amp; Bookings</span>
            </Button>
            {(isPlatformAdmin || allowedDomains.includes('HOSPITALITY')) && (
              <Button variant="secondary" onClick={() => navigateTo('inventory')}>
                <BedDouble size={15} />
                <span>Room Rate Calendar</span>
              </Button>
            )}
            <Button variant="primary" onClick={() => navigateTo('inapp_studio')}>
              <Smartphone size={15} />
              <span>Survya Studio</span>
            </Button>
          </div>
        )}
      />

      {feedback && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          fontWeight: 600,
          background: feedback.type === 'error' ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
          color: feedback.type === 'error' ? 'var(--status-error-text)' : 'var(--status-success-text)',
          border: `1px solid ${feedback.type === 'error' ? 'var(--status-error-border)' : 'var(--status-success-border)'}`
        }}>
          {feedback.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Skeleton height="100px" />
          <Skeleton height="220px" />
        </div>
      ) : (
        <>
          <div className="sarvya-kpi-grid" style={{ marginBottom: '20px' }}>
            <KpiCard
              label="Primary Business Domain"
              value={activeProfile.shortLabel || primaryDomain}
              hint={effectiveAccess.policyLabel || `${planCode} plan entitlement`}
            />
            <KpiCard
              label="Pre-Built Catalog Items"
              value={items.length}
              hint={primaryEntity ? `${primaryEntity.name} (${primaryEntity.city || 'India'})` : 'Ready across WhatsApp & Studio'}
            />
            <KpiCard
              label="Studio Experiences"
              value={experiences.length}
              hint={primaryExp ? `Live: /x/${primaryExp.slug}` : 'Publish from Survya Studio'}
            />
            <KpiCard
              label="Plan Domain Quota"
              value={`${allowedDomains.length} / ${maxDomains}`}
              hint={maxDomains < 8 && !isPlatformAdmin ? 'Upgrade plan to unlock more verticals' : 'Multi-domain enabled'}
            />
          </div>

          {/* Active Pre-Built Profile Card */}
          <Card style={{ marginBottom: '20px', border: `1px solid ${activeAccent.border}` }}>
            <CardHeader
              title={(
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: activeAccent.bg,
                    color: activeAccent.fg,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <ActiveIcon size={17} />
                  </span>
                  <span>Pre-Built {activeProfile.name} Stack</span>
                </div>
              )}
              action={<Badge variant="success">Active Primary</Badge>}
            />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Included Pre-Built Capabilities
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {(activeProfile.highlights || []).map((hl) => (
                      <div key={hl} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                        <CheckCircle2 size={14} color="#16A34A" />
                        <span>{hl}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
                    <Button variant="secondary" onClick={() => navigateTo('masters')}>
                      <Database size={14} />
                      <span>Masters Hub</span>
                    </Button>
                    <Button variant="secondary" onClick={() => navigateTo('flows')}>
                      <GitBranch size={14} />
                      <span>WhatsApp Flows</span>
                    </Button>
                    {primaryExp?.slug && (
                      <a
                        href={`/x/${primaryExp.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sarvya-btn sarvya-btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                      >
                        <span>Open Live Studio Chat</span>
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Pre-Seeded Catalog Preview ({items.length})
                  </div>
                  {items.length === 0 ? (
                    <EmptyState
                      title="No catalog items yet"
                      description="Deploy your pre-built domain suite below to populate realistic items & tariffs."
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {items.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: 'var(--bg-app)',
                            border: '1px solid var(--border-color)',
                            fontSize: '12.5px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {item.category_name || item.item_type}
                            </div>
                          </div>
                          <div className="tabular-nums" style={{ fontWeight: 700, color: 'var(--sarvya-blue)' }}>
                            ₹{Number(item.base_price || 0).toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Plan-Scoped Domain Profiles Directory */}
          <Card>
            <CardHeader
              title="Business Domains & Plan Entitlements"
              subtitle={isPlatformAdmin
                ? 'Platform Super-Admin view has access to inspect and launch any of the 8 pre-built industry suites.'
                : `Your ${planCode} workspace unlocks ${maxDomains} domain${maxDomains > 1 ? 's' : ''}. Only unlocked domains are active in your workspace navigation.`}
              action={!isPlatformAdmin && maxDomains < 8 ? (
                <Button variant="secondary" onClick={() => navigateTo('settings')}>
                  <span>Manage Plan &amp; Billing</span>
                  <ArrowRight size={14} />
                </Button>
              ) : null}
            />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {availableProfiles.map((profile) => {
                  const Icon = DOMAIN_ICONS[profile.code] || Boxes;
                  const accent = DOMAIN_ACCENTS[profile.code] || DOMAIN_ACCENTS.HOSPITALITY;
                  const isUnlocked = Boolean(isPlatformAdmin || profile.unlocked);
                  const isCurrentPrimary = profile.code === primaryDomain;
                  const isWorking = activatingDomain === profile.code;

                  return (
                    <div
                      key={profile.code}
                      style={{
                        border: isCurrentPrimary ? `2px solid ${accent.fg}` : '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '14px',
                        background: isUnlocked ? '#FFFFFF' : 'var(--bg-app)',
                        opacity: isUnlocked ? 1 : 0.78,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: accent.bg,
                            color: accent.fg,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Icon size={17} />
                          </span>
                          {isCurrentPrimary ? (
                            <Badge variant="success">Active</Badge>
                          ) : isUnlocked ? (
                            <Badge variant="info">Unlocked</Badge>
                          ) : (
                            <Badge variant="neutral">
                              <Lock size={11} style={{ marginRight: '4px' }} />
                              Upgrade Plan
                            </Badge>
                          )}
                        </div>
                        <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                          {profile.name}
                        </h3>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                          {profile.tagline}
                        </p>
                      </div>

                      {isUnlocked ? (
                        <Button
                          variant={isCurrentPrimary ? 'secondary' : 'primary'}
                          disabled={isWorking}
                          onClick={() => handleActivateOrSwitchDomain(profile.code, true)}
                          style={{ width: '100%' }}
                        >
                          {isWorking ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>Applying Suite...</span>
                            </>
                          ) : isCurrentPrimary ? (
                            <span>Re-Sync Pre-Built Suite</span>
                          ) : (
                            <>
                              <span>Switch Primary Domain</span>
                              <ArrowRight size={13} />
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => navigateTo('settings')}
                          style={{ width: '100%' }}
                        >
                          <Lock size={13} />
                          <span>Upgrade to Growth / Enterprise</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
