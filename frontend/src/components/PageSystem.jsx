import React, { Component, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
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
  ArrowLeft,
  Sparkles,
  ExternalLink,
  RotateCcw
} from 'lucide-react';

// Lazy or direct import of all pages
import DashboardPage from '../pages/DashboardPage';
import EnquiriesPage from '../pages/EnquiriesPage';
import FlowsPage from '../pages/FlowsPage';
import AutomationPage from '../pages/AutomationPage';
import InboxPage from '../pages/InboxPage';
import AutoReplyBotPage from '../pages/AutoReplyBotPage';
import BroadcastPage from '../pages/BroadcastPage';
import ChatLinksPage from '../pages/ChatLinksPage';
import AiAssistantPage from '../pages/AiAssistantPage';
import ReportsPage from '../pages/ReportsPage';
import CatalogInventoryPage from '../pages/CatalogInventoryPage';
import InventoryCalendarPage from '../pages/InventoryCalendarPage';
import SystemAdminPanel from '../pages/SystemAdminPanel';
import PayoutsPage from '../pages/PayoutsPage';
import SarvyaConnectPage from '../pages/SarvyaConnectPage';
import SettingsPage from '../pages/SettingsPage';
import LandingPage from '../pages/LandingPage';

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
    title: 'Forms & Flow Builder',
    module: 'Forms',
    group: 'Operations & Messaging',
    badge: 'Interactive',
    badgeTone: 'purple',
    icon: FileSpreadsheet,
    description: 'Visual builder and editor for native WhatsApp Flow screens, survey forms, and intake schemas.',
    adminOnly: false,
    component: FlowsPage
  },
  automation: {
    id: 'automation',
    title: 'Workflows & Lifecycle Triggers',
    module: 'Flow',
    group: 'Operations & Messaging',
    badge: 'Automated',
    badgeTone: 'blue',
    icon: GitBranch,
    description: 'Multi-stage guest lifecycle automations: directions, arrival greetings, departures, and review collection.',
    adminOnly: false,
    component: AutomationPage
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
    title: 'Conversational Concierge & Auto-Reply Bot',
    module: 'Connect',
    group: 'Operations & Messaging',
    badge: 'AI Smart',
    badgeTone: 'green',
    icon: BotMessageSquare,
    description: 'Inbound automation engine: instant room quotes, WhatsApp quick buttons, Meta Flows, and programmable dynamic rules.',
    adminOnly: false,
    component: AutoReplyBotPage
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

  componentDidUpdate(prevProps) {
    if (prevProps.tabId !== this.props.tabId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '60px 24px',
          maxWidth: '680px',
          margin: '40px auto',
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #FDB1AF',
          boxShadow: '0 8px 24px rgba(153, 47, 45, 0.08)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '50%',
            background: '#FEF2F2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            boxShadow: '0 2px 8px rgba(220, 38, 38, 0.15)'
          }}>
            <AlertTriangle size={26} />
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0', color: '#171719' }}>
            Unable to display "{this.props.pageTitle || this.props.tabId}"
          </h2>
          <p style={{ fontSize: '0.86rem', color: '#67676B', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected rendering error occurred while loading this view.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="btn btn-primary"
              style={{ gap: '6px', fontSize: '0.84rem', background: '#2F5219', borderColor: '#2F5219' }}
            >
              <RotateCcw size={15} />
              <span>Retry This View</span>
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
export default function PageSystem({
  activeTab,
  setActiveTab,
  sidebarCollapsed,
  mobileOpen
}) {
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
        <PageErrorBoundary tabId={activePage.id} pageTitle={activePage.title} onNavigate={handleNavigate}>
          <ActiveComponent
            onNavigate={handleNavigate}
            setActiveTab={handleNavigate}
            activeTab={activeTab}
            currentUser={user}
            isAdmin={isAdmin}
          />
        </PageErrorBoundary>
      </div>
    </div>
  );
}
