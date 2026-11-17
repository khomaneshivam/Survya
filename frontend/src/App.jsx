import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import ImpersonationBanner from './components/ImpersonationBanner';
import DashboardPage from './pages/DashboardPage';
import BroadcastPage from './pages/BroadcastPage';
import FlowsPage from './pages/FlowsPage';
import AutomationPage from './pages/AutomationPage';
import InboxPage from './pages/InboxPage';
import ReportsPage from './pages/ReportsPage';
import SystemAdminPanel from './pages/SystemAdminPanel';
import SettingsPage from './pages/SettingsPage';
import SarvyaConnectPage from './pages/SarvyaConnectPage';
import ChatLinksPage from './pages/ChatLinksPage';
import PublicChatLandingPage from './pages/PublicChatLandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import EnquiriesPage from './pages/EnquiriesPage';
import InventoryCalendarPage from './pages/InventoryCalendarPage';
import CatalogInventoryPage from './pages/CatalogInventoryPage';
import PayoutsPage from './pages/PayoutsPage';
import AiAssistantPage from './pages/AiAssistantPage';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  MessageSquare,
  BarChart3
} from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[React ErrorBoundary caught error]:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px 24px',
          maxWidth: '640px',
          margin: '40px auto',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid var(--border-color, #e2e8f0)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          textAlign: 'center'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: '#fee2e2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            fontSize: '24px'
          }}>
            ⚠
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#1e293b' }}>
            Something went wrong rendering this view
          </h2>
          <p style={{ fontSize: '13.5px', color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected runtime error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'var(--sarvya-blue, #2F5219)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Return to Dashboard
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authView, setAuthView] = useState('landing');

  // Client-side RBAC Guard: non-admins cannot stay on admin-exclusive views
  useEffect(() => {
    if (!isAdmin && (activeTab === 'admin' || activeTab === 'payouts' || activeTab === 'connect')) {
      setActiveTab('dashboard');
    }
  }, [isAdmin, activeTab]);

  // Intercept public customer chat links (/c/:slug or /chat/:slug) without requiring login
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  const chatMatch = currentPath.match(/^\/(?:c|chat)\/([a-zA-Z0-9_-]+)/);
  if (chatMatch) {
    const slug = chatMatch[1];
    return <PublicChatLandingPage slug={slug} />;
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'var(--bg-app)',
        color: 'var(--text-secondary)'
      }}>
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
          fontSize: '18px'
        }}>
          S
        </div>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Loading SARVYA Workspace...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authView === 'landing') {
      return (
        <LandingPage
          onGetStarted={() => setAuthView('register')}
          onSignIn={() => setAuthView('login')}
        />
      );
    }
    if (authView === 'register') {
      return (
        <RegisterPage
          onSwitchToLogin={() => setAuthView('login')}
          onBackToLanding={() => setAuthView('landing')}
        />
      );
    }
    return (
      <LoginPage
        onSwitchToRegister={() => setAuthView('register')}
        onBackToLanding={() => setAuthView('landing')}
      />
    );
  }

  return (
    <div className="app-container">
      <ImpersonationBanner />

      <div className="app-body">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />

        <div className="app-main">
          <Topbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            setMobileOpen={setMobileOpen}
          />

          <main style={{ flex: 1 }}>
            <ErrorBoundary onReset={() => setActiveTab('dashboard')}>
              {activeTab === 'dashboard' && <DashboardPage setActiveTab={setActiveTab} />}
              {activeTab === 'enquiries' && <EnquiriesPage />}
              {activeTab === 'catalog' && <CatalogInventoryPage />}
              {activeTab === 'inventory' && <InventoryCalendarPage />}
              {activeTab === 'payouts' && isAdmin && <PayoutsPage />}
              {activeTab === 'broadcast' && <BroadcastPage />}
              {activeTab === 'links' && <ChatLinksPage onNavigate={setActiveTab} />}
              {activeTab === 'flows' && <FlowsPage />}
              {activeTab === 'automation' && <AutomationPage />}
              {activeTab === 'inbox' && <InboxPage />}
              {activeTab === 'ai' && <AiAssistantPage />}
              {activeTab === 'reports' && <ReportsPage />}
              {activeTab === 'pricing' && (
                <LandingPage
                  onGetStarted={() => setActiveTab('broadcast')}
                  onSignIn={() => setActiveTab('dashboard')}
                />
              )}
              {activeTab === 'admin' && isAdmin && <SystemAdminPanel onNavigate={setActiveTab} />}
              {activeTab === 'connect' && isAdmin && <SarvyaConnectPage onNavigate={setActiveTab} currentUser={{ role: 'ADMIN' }} />}
              {activeTab === 'settings' && <SettingsPage />}
            </ErrorBoundary>
          </main>

          <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
            <button
              type="button"
              className={`mobile-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <LayoutDashboard size={18} />
              <span>Overview</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${activeTab === 'enquiries' ? 'active' : ''}`}
              onClick={() => setActiveTab('enquiries')}
            >
              <Users size={18} />
              <span>CRM</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${activeTab === 'automation' ? 'active' : ''}`}
              onClick={() => setActiveTab('automation')}
            >
              <GitBranch size={18} />
              <span>Workflows</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${activeTab === 'inbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('inbox')}
            >
              <MessageSquare size={18} />
              <span>Inbox</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <BarChart3 size={18} />
              <span>Insights</span>
            </button>
          </nav>

          <footer style={{
            borderTop: '1px solid var(--border-color)',
            padding: '14px 24px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--text-muted)',
            background: 'var(--bg-surface)'
          }}>
            SARVYA Engagement &amp; Automation Ecosystem • Core, CRM, Forms, Flow, Connect, AI &amp; Insights
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
