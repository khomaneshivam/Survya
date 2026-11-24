
import React, { Component, useEffect, useMemo, useCallback, Suspense } from 'react';

import { useAuth } from '../context/AuthContext';
import usePageMeta from '../utils/usePageMeta';
import lazyWithRetry from '../utils/lazyWithRetry';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  GitBranch,
  MessageSquare,
  BotMessageSquare,
  Send,
  Link2,
  Bot,
  BarChart3,
  Layers,
  BedDouble,
  ShieldCheck,
  Landmark,
  Plug,
  Settings,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Database,
  RotateCcw,
  Smartphone,
  Receipt
} from 'lucide-react';

// Code-split dynamic page imports with deployment chunk-mismatch auto-recovery
const DashboardPage = lazyWithRetry(() => import('../pages/DashboardPage'));
const EnquiriesPage = lazyWithRetry(() => import('../pages/EnquiriesPage'));
const FlowsPage = lazyWithRetry(() => import('../pages/FlowsPage'));
const FlowBuilderPage = lazyWithRetry(() => import('../pages/FlowBuilderPage'));
const AutomationPage = lazyWithRetry(() => import('../pages/AutomationPage'));
const InboxPage = lazyWithRetry(() => import('../pages/InboxPage'));
const AutomationStudio = lazyWithRetry(() => import('../features/automation/AutomationStudio'));
const AutoReplyBotPage = lazyWithRetry(() => import('../pages/AutoReplyBotPage'));
const BroadcastPage = lazyWithRetry(() => import('../pages/BroadcastPage'));
const FlowStudioPage = lazyWithRetry(() => import('../pages/FlowStudioPage'));
const ChatLinksPage = lazyWithRetry(() => import('../pages/ChatLinksPage'));
const InAppStudioPage = lazyWithRetry(() => import('../pages/InAppStudioPage'));
const AiAssistantPage = lazyWithRetry(() => import('../pages/AiAssistantPage'));
const ReportsPage = lazyWithRetry(() => import('../pages/ReportsPage'));
const CatalogInventoryPage = lazyWithRetry(() => import('../pages/CatalogInventoryPage'));
const BookingsOrdersPage = lazyWithRetry(() => import('../pages/BookingsOrdersPage'));
const MastersHubPage = lazyWithRetry(() => import('../pages/MastersHubPage'));
const InventoryCalendarPage = lazyWithRetry(() => import('../pages/InventoryCalendarPage'));
const SystemAdminPanel = lazyWithRetry(() => import('../pages/SystemAdminPanel'));
const PayoutsPage = lazyWithRetry(() => import('../pages/PayoutsPage'));
const SarvyaConnectPage = lazyWithRetry(() => import('../pages/SarvyaConnectPage'));
const SettingsPage = lazyWithRetry(() => import('../pages/SettingsPage'));
const LandingPage = lazyWithRetry(() => import('../pages/LandingPage'));

/**
 * Loading Skeleton Fallback for Lazy-Loaded Pages
 */
function PageSkeleton({ title }) {
  return (
    <div role="status" aria-label={`Loading ${title || 'page'}`} style={{ padding: '28px 24px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EEEEF0', animation: 'shimmer 1.4s infinite linear' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ width: '200px', height: '22px', borderRadius: '4px', background: '#EEEEF0', animation: 'shimmer 1.4s infinite linear' }} />
          <div style={{ width: '300px', height: '14px', borderRadius: '4px', background: '#F5F5F7', animation: 'shimmer 1.4s infinite linear' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '8px' }}>
        {[1, 2, 3, 4].map(n => (
          <div key={n} style={{ height: '110px', borderRadius: '10px', background: '#FAFAFB', border: '1px solid #EEEEF0', animation: 'shimmer 1.4s infinite linear' }} />
        ))}
      </div>
      <div style={{ height: '340px', borderRadius: '12px', background: '#FAFAFB', border: '1px solid #EEEEF0', marginTop: '10px', animation: 'shimmer 1.4s infinite linear' }} />
    </div>
  );
}

/**
 * Master Page System Registry
 * Single Source of Truth for all Sidebar Navigation Tabs
 */
export const PAGE_REGISTRY = {
  dashboard: {
    id: 'dashboard',
    title: 'Overview & Analytics',
    module: 'Insights',
    group: 'Operations & Messaging',
    badge: 'Real-Time',
    badgeTone: 'blue',
    icon: LayoutDashboard,
    description: 'Executive overview, conversion metrics, campaign throughput, and guest engagement.',
    adminOnly: false,
    component: DashboardPage
  },
  enquiries: {
    id: 'enquiries',
    title: 'CRM & Booking Pipeline',
    module: 'CRM',
    group: 'Operations & Messaging',
    badge: 'Pipeline',
    badgeTone: 'green',
    icon: Users,
    description: 'Manage guest contacts, reservation inquiries, stage transitions, and quotation statuses.',
    adminOnly: false,
    component: EnquiriesPage
  },
  flows: {
    id: 'flows',
    title: 'Flow Builder',
    module: 'Flow',
    group: 'Operations & Messaging',
    badge: 'Studio',
    badgeTone: 'purple',
    icon: GitBranch,
    description: 'Visual builder for WhatsApp conversation flows, modular sub-flows, and live session monitor.',
    adminOnly: false,
    component: FlowBuilderPage
  },
  automation: {
    id: 'automation',
    title: 'Flow Builder',
    module: 'Flow',
    group: 'Operations & Messaging',
    badge: 'Studio',
    badgeTone: 'purple',
    icon: GitBranch,
    description: 'Visual builder for WhatsApp conversation flows, modular sub-flows, and live session monitor.',
    adminOnly: false,
    component: FlowBuilderPage
  },
  inbox: {
    id: 'inbox',
    title: 'Shared Conversations & Chat',
    module: 'Connect',
    group: 'Operations & Messaging',
    badge: 'Live',
    badgeTone: 'green',
    icon: MessageSquare,
    description: 'Unified multi-channel customer conversations (WhatsApp, Web Chat, Links) with real-time SSE streaming.',
    adminOnly: false,
    component: InboxPage
  },
  autoreply: {
    id: 'autoreply',
    title: 'Enterprise Automation Studio',
    module: 'Connect',
    group: 'System Administration',
    badge: 'Enterprise',
    badgeTone: 'green',
    icon: BotMessageSquare,
    description: 'Universal conversational template library, client configurations, and visual workflow builder.',
    adminOnly: true,
    component: AutomationStudio
  },
  flowStudio: {
    id: 'flowStudio',
    title: 'Multi-Flow Hub & Studio',
    module: 'Flow',
    group: 'System Administration',
    badge: 'Universal',
    badgeTone: 'purple',
    icon: BotMessageSquare,
    description: 'High-speed multi-flow control hub with O(1) trigger router, conflict detector, AI Architect & dual-mode editor.',
    adminOnly: true,
    component: AutomationStudio
  },
  broadcast: {
    id: 'broadcast',
    title: 'Campaigns & Broadcast Studio',
    module: 'Connect',
    group: 'Operations & Messaging',
    badge: 'Meta WABA',
    badgeTone: 'blue',
    icon: Send,
    description: 'Create, schedule, and dispatch bulk WhatsApp messages with variables, media headers, and delivery analytics.',
    adminOnly: false,
    component: BroadcastPage
  },
  links: {
    id: 'links',
    title: 'Chat Links & In-App Messaging',
    module: 'Connect',
    group: 'Operations & Messaging',
    badge: 'Web Chat',
    badgeTone: 'blue',
    icon: Link2,
    description: 'Generate sharable customer chat links, QR codes, and zero-fee web conversational landing pages.',
    adminOnly: false,
    component: ChatLinksPage
  },
  inapp_studio: {
    id: 'inapp_studio',
    title: 'In-App Experience Studio',
    module: 'In-App',
    group: 'System Administration',
    badge: 'Dynamic',
    badgeTone: 'purple',
    icon: Smartphone,
    description: 'WhatsApp-Flows-style multi-screen web experiences with validated forms, catalog browsing, image galleries, price-range filters, rate discussions, and calls.',
    adminOnly: true,
    component: InAppStudioPage
  },
  ai: {
    id: 'ai',
    title: 'SARVYA AI Assistant & Guardrails',
    module: 'AI',
    group: 'Operations & Messaging',
    badge: 'GenAI',
    badgeTone: 'purple',
    icon: Bot,
    description: 'Configure conversational intelligence prompts, sentiment analysis, policy guardrails, and customer suggestions.',
    adminOnly: false,
    component: AiAssistantPage
  },
  reports: {
    id: 'reports',
    title: 'Insights, Telemetry & Audit Logs',
    module: 'Insights',
    group: 'Operations & Messaging',
    badge: 'Analytics',
    badgeTone: 'taupe',
    icon: BarChart3,
    description: 'Comprehensive delivery analytics, template conversion rates, operator performance, and CSV exports.',
    adminOnly: false,
    component: ReportsPage
  },
  catalog: {
    id: 'catalog',
    title: 'Catalog, Menu & Inventory Items',
    module: 'Industry',
    group: 'Industry Solutions',
    badge: 'Catalog',
    badgeTone: 'taupe',
    icon: Layers,
    description: 'Manage dining dishes, beverages, room add-ons, pricing, photos, and instant 86-stock status toggles.',
    adminOnly: false,
    component: CatalogInventoryPage
  },
  transactions: {
    id: 'transactions',
    title: 'Orders, Bookings & Transactions',
    module: 'Industry',
    group: 'Industry Solutions',
    badge: 'Universal',
    badgeTone: 'sage',
    icon: Receipt,
    description: 'Track orders, bookings, appointments, quotations, payment reconciliation, and GST tax invoices.',
    adminOnly: false,
    component: BookingsOrdersPage
  },
  masters: {
    id: 'masters',
    title: 'Universal Masters Hub',
    module: 'Industry',
    group: 'Industry Solutions',
    badge: 'ERP',
    badgeTone: 'sage',
    icon: Database,
    description: 'Universal business masters: categories, locations, staff/doctors, payment modes, GST slabs, units, and tags.',
    adminOnly: false,
    component: MastersHubPage
  },
  inventory: {
    id: 'inventory',
    title: 'Hospitality Inventory & Rate Calendar',
    module: 'Industry',
    group: 'Industry Solutions',
    badge: 'Hospitality',
    badgeTone: 'taupe',
    icon: BedDouble,
    description: 'Room categories, calendar view, seasonal tariff rules, occupancy limits, and real-time room availability.',
    adminOnly: false,
    component: InventoryCalendarPage
  },
  admin: {
    id: 'admin',
    title: 'System Admin Panel & Security Governance',
    module: 'Governance',
    group: 'System Administration',
    badge: 'Admin Only',
    badgeTone: 'coral',
    icon: ShieldCheck,
    description: 'User management, RBAC role permissions, WABA multi-number provisioning, audit trails, and server telemetry.',
    adminOnly: true,
    component: SystemAdminPanel
  },
  payouts: {
    id: 'payouts',
    title: 'Payouts & Bank Settlements',
    module: 'Governance',
    group: 'System Administration',
    badge: 'IMPS/UTR',
    badgeTone: 'coral',
    icon: Landmark,
    description: 'Manage property bank accounts, penny-drop IFSC verification, settlement queues, and automated UTR reconciliations.',
    adminOnly: true,
    component: PayoutsPage
  },
  connect: {
    id: 'connect',
    title: 'Connect & Integration Hub',
    module: 'Connect',
    group: 'System Administration',
    badge: 'API Hub',
    badgeTone: 'coral',
    icon: Plug,
    description: 'Meta Graph API configurations, Google Sheets integrations, webhooks, and third-party webhook relays.',
    adminOnly: true,
    component: SarvyaConnectPage
  },
  settings: {
    id: 'settings',
    title: 'My Account & Preferences',
    module: 'Account',
    group: 'Account',
    badge: 'Personal',
    badgeTone: 'neutral',
    icon: Settings,
    description: 'Manage your profile details, change security passwords, set default country codes, and notification preferences.',
    adminOnly: false,
    component: SettingsPage
  },
  pricing: {
    id: 'pricing',
    title: 'Enterprise Plans & Pricing',
    module: 'Core',
    group: 'SARVYA Core',
    badge: 'Plans',
    badgeTone: 'blue',
    icon: Sparkles,
    description: 'Explore platform tiers, feature inclusions, and enterprise deployment options.',
    adminOnly: false,
    component: LandingPage
  }
};

/**
 * Isolated Per-Page Error Boundary
 */
class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[PageSystem Error caught in tab "${this.props.tabId}"]:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.name === 'ChunkLoadError' ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Expected a JavaScript-or-Wasm module script') ||
        this.state.error?.message?.includes('error loading dynamically imported module') ||
        this.state.error?.message?.includes('Loading chunk') ||
        this.state.error?.message?.includes('Failed to load module script');

      return (
        <div style={{
          padding: '60px 24px',
          maxWidth: '680px',
          margin: '40px auto',
          background: '#FFFFFF',
          borderRadius: '14px',
          border: isChunkError ? '1px solid #C3D1AC' : '1px solid #FDB1AF',
          boxShadow: isChunkError ? '0 8px 24px rgba(47, 82, 25, 0.08)' : '0 8px 24px rgba(153, 47, 45, 0.08)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: isChunkError ? '#F3F6EE' : '#FEF2F2',
            color: isChunkError ? '#2F5219' : '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: isChunkError ? '0 2px 8px rgba(47, 82, 25, 0.15)' : '0 2px 8px rgba(220, 38, 38, 0.15)'
          }}>
            {isChunkError ? <Sparkles size={26} /> : <AlertTriangle size={26} />}
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0', color: '#171719' }}>
            {isChunkError ? 'New Release Available' : `Unable to display "${this.props.pageTitle || this.props.tabId}"`}
          </h2>
          <p style={{ fontSize: '0.86rem', color: '#67676B', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            {isChunkError
              ? 'A fresh update of SARVYA was deployed. Please reload the page to load the latest components.'
              : (this.state.error?.message || 'An unexpected rendering error occurred while loading this view.')}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => {
                if (isChunkError) {
                  window.location.reload();
                } else {
                  this.setState({ hasError: false, error: null });
                }
              }}
              className="btn btn-primary"
              style={{ gap: '6px', fontSize: '0.84rem', background: '#2F5219', borderColor: '#2F5219' }}
            >
              <RotateCcw size={15} />
              <span>{isChunkError ? 'Reload Latest Version' : 'Retry This View'}</span>
            </button>
            <button
              type="button"
              onClick={() => this.props.onNavigate && this.props.onNavigate('dashboard')}
              className="btn btn-secondary"
              style={{ fontSize: '0.84rem' }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Standardized Page System Container Component
 * Wraps every sidebar tab view with unified layout, breadcrumb bar, navigation injection, and deep-linking.
 */
export default function PageSystem({ activeTab, setActiveTab }) {
  const { user, isAdmin } = useAuth();

  // Resolve active page configuration from registry with safe fallback to dashboard
  const activePage = useMemo(() => {
    const page = PAGE_REGISTRY[activeTab];
    if (page) {
      if (page.adminOnly && !isAdmin) {
        return PAGE_REGISTRY.dashboard;
      }
      return page;
    }
    return PAGE_REGISTRY.dashboard;
  }, [activeTab, isAdmin]);

  // Update document metadata & noindex for authenticated app tabs
  usePageMeta({
    title: activePage ? activePage.title : 'Overview',
    description: activePage ? activePage.description : 'Zero-Markup WhatsApp Business API CRM & Automation',
    noindex: true
  });

  // Sibling Tabs in the same group/module for quick contextual switching
  const siblingTabs = useMemo(() => {
    if (!activePage) return [];
    return Object.values(PAGE_REGISTRY).filter(p => {
      if (p.id === activePage.id) return false;
      if (p.adminOnly && !isAdmin) return false;
      return p.group === activePage.group || p.module === activePage.module;
    });
  }, [activePage, isAdmin]);

  // Universal Navigation Dispatcher
  const handleNavigate = useCallback((targetTab) => {
    if (PAGE_REGISTRY[targetTab]) {
      setActiveTab(targetTab);
    }
  }, [setActiveTab]);

  const ActiveComponent = activePage.component;
  const PageIcon = activePage.icon;

  return (
    <div className="sarvya-page-system" style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Universal Page System Contextual Header / Breadcrumb Strip */}
      <div style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E5E8',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Left: Breadcrumbs & Module Hierarchy */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: '#96969C', fontWeight: 600 }}>SARVYA</span>
          <ChevronRight size={13} color="#96969C" />
          <span style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: activePage.badgeTone === 'green' ? '#EDF4E6' : activePage.badgeTone === 'purple' ? '#FCF2FE' : activePage.badgeTone === 'coral' ? '#FEF2F2' : '#EEF5FB',
            color: activePage.badgeTone === 'green' ? '#2F5219' : activePage.badgeTone === 'purple' ? '#7A2E83' : activePage.badgeTone === 'coral' ? '#992F2D' : '#2876B8',
            padding: '2px 8px',
            borderRadius: '6px'
          }}>
            {activePage.module}
          </span>
          <ChevronRight size={13} color="#96969C" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PageIcon size={14} color="#171719" />
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#171719' }}>
              {activePage.title}
            </span>
          </div>
          {activePage.badge && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: '8px',
              background: '#F4F4F5',
              color: '#52525B',
              border: '1px solid #E4E4E7'
            }}>
              {activePage.badge}
            </span>
          )}
        </div>

        {/* Right: Quick Sibling Navigation Shortcuts */}
        {siblingTabs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
            <span style={{ fontSize: '0.72rem', color: '#96969C', fontWeight: 600, marginRight: '4px' }}>
              Jump to:
            </span>
            {siblingTabs.slice(0, 4).map(s => {
              const SibIcon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleNavigate(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 9px',
                    borderRadius: '6px',
                    fontSize: '0.76rem',
                    fontWeight: 500,
                    color: '#67676B',
                    background: '#FAFAFB',
                    border: '1px solid #E5E5E8',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#171719';
                    e.currentTarget.style.borderColor = '#C3D1AC';
                    e.currentTarget.style.background = '#F3F6EE';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = '#67676B';
                    e.currentTarget.style.borderColor = '#E5E5E8';
                    e.currentTarget.style.background = '#FAFAFB';
                  }}
                  title={s.description}
                >
                  <SibIcon size={12} />
                  <span>{s.title.split('&')[0].trim()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Viewport Wrapped in Per-Page Error Boundary */}
      <div style={{ flex: 1, position: 'relative' }}>
        <PageErrorBoundary key={activePage.id} tabId={activePage.id} pageTitle={activePage.title} onNavigate={handleNavigate}>
          <Suspense fallback={<PageSkeleton title={activePage.title} />}>
            <ActiveComponent
              onNavigate={handleNavigate}
              setActiveTab={handleNavigate}
              activeTab={activeTab}
              currentUser={user}
              isAdmin={isAdmin}
            />
          </Suspense>
        </PageErrorBoundary>
      </div>
    </div>
  );
}
