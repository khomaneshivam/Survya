import React, { useState } from 'react';
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
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import SarvyaConnectPage from './pages/SarvyaConnectPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import LandingPage from './pages/LandingPage';
import EnquiriesPage from './pages/EnquiriesPage';
import InventoryCalendarPage from './pages/InventoryCalendarPage';
import AiAssistantPage from './pages/AiAssistantPage';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  MessageSquare,
  BarChart3
} from 'lucide-react';

function AppContent() {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authView, setAuthView] = useState('landing');

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
            {activeTab === 'dashboard' && <DashboardPage setActiveTab={setActiveTab} />}
            {activeTab === 'enquiries' && <EnquiriesPage />}
            {activeTab === 'inventory' && <InventoryCalendarPage />}
            {activeTab === 'broadcast' && <BroadcastPage />}
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
            {activeTab === 'admin' && isAdmin && <AdminPage />}
            {activeTab === 'connect' && <SarvyaConnectPage onNavigate={setActiveTab} currentUser={{ role: isAdmin ? 'ADMIN' : 'USER' }} />}
            {activeTab === 'settings' && <SettingsPage />}
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
