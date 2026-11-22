import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileSpreadsheet,
  GitBranch,
  MessageSquare,
  BotMessageSquare,
  Send,
  Bot,
  BarChart3,
  BedDouble,
  CreditCard,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  X,
  Link2,
  Layers,
  Landmark,
  UserCheck,
  Settings,
  Plug,
  Database,
  Smartphone
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen
}) {
  const { user, isAdmin, logout } = useAuth();

  // Role-based segmented navigation
  const sections = [
    {
      title: 'Operations & Messaging',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'enquiries', label: 'CRM', icon: Users },
        { id: 'flows', label: 'Forms', icon: FileSpreadsheet },
        { id: 'automation', label: 'Workflows', icon: GitBranch },
        { id: 'inbox', label: 'Conversations', icon: MessageSquare },
        { id: 'autoreply', label: 'Auto-Reply Bot', icon: BotMessageSquare },
        { id: 'broadcast', label: 'Campaigns', icon: Send },
        { id: 'links', label: 'Chat Links', icon: Link2 },
        { id: 'inapp_studio', label: 'In-App Studio', icon: Smartphone, badge: 'Dynamic' },
        { id: 'ai', label: 'SARVYA AI', icon: Bot },
        { id: 'reports', label: 'Insights', icon: BarChart3 }
      ]
    },
    {
      title: 'Industry Solutions',
      items: [
        { id: 'masters', label: 'Masters Hub', icon: Database, badge: 'ERP' },
        { id: 'catalog', label: 'Catalog & Menu', icon: Layers },
        { id: 'inventory', label: 'Hospitality', icon: BedDouble }
      ]
    },
    ...(isAdmin ? [
      {
        title: 'System Administration',
        isAdminSection: true,
        items: [
          { id: 'admin', label: 'System Admin Panel', icon: ShieldCheck, highlight: true },
          { id: 'payouts', label: 'Payouts & Settlements', icon: Landmark },
          { id: 'connect', label: 'Connect', icon: Plug }
        ]
      }
    ] : []),
    {
      title: 'Account',
      items: [
        { id: 'settings', label: 'My Account', icon: Settings }
      ]
    }
  ];

  function handleNavigate(id) {
    setActiveTab(id);
    if (setMobileOpen) setMobileOpen(false);
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Primary Sidebar Navigation"
      >
        {/* Brand Header */}
        <div style={{
          height: 'var(--topbar-height)',
          paddingInline: collapsed ? '12px' : '16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: '8px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'var(--sarvya-blue)',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '14px',
              flexShrink: 0
            }}>
              S
            </div>

            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '15px',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1
                }}>
                  SARVYA
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {isAdmin ? 'System Admin Console' : 'Engagement Workspace'}
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm sidebar-collapse-btn"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              style={{ padding: '5px' }}
            >
              <PanelLeftClose size={16} />
            </button>
          )}

          {mobileOpen && (
            <button
              type="button"
              className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              style={{ padding: '5px' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '12px 10px' : '14px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {collapsed && (
            <button
              type="button"
              className="sidebar-nav-btn sidebar-collapse-btn"
              onClick={() => setCollapsed(false)}
              data-tooltip="Expand sidebar"
              aria-label="Expand sidebar"
              style={{ color: 'var(--text-secondary)' }}
            >
              <PanelLeftOpen size={17} />
            </button>
          )}

          {sections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <div style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: section.isAdminSection ? 'var(--sarvya-blue)' : 'var(--text-muted)',
                  padding: '0 10px 6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>{section.title}</span>
                  {section.isAdminSection && (
                    <span style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'var(--sarvya-blue-soft)',
                      color: 'var(--sarvya-blue)',
                      fontWeight: 800
                    }}>
                      ADMIN
                    </span>
                  )}
                </div>
              )}

              <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} aria-label={section.title}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      data-tooltip={collapsed ? item.label : undefined}
                      className={`sidebar-nav-btn ${isActive ? 'is-active' : ''}`}
                      style={item.highlight && !isActive ? {
                        color: 'var(--sarvya-blue)',
                        fontWeight: 600
                      } : undefined}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                        <Icon size={17} strokeWidth={isActive ? 2.1 : 1.75} style={{ flexShrink: 0 }} />
                        {!collapsed && (
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.label}
                          </span>
                        )}
                      </span>
                      {!collapsed && item.badge && (
                        <span style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: '#8b5cf6',
                          fontWeight: 700,
                          marginLeft: 'auto'
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Workspace User Footer */}
        <div style={{
          padding: collapsed ? '12px 10px' : '12px 14px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: '8px'
        }}>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isAdmin ? 'var(--sarvya-blue)' : 'var(--sarvya-blue-soft)',
                border: isAdmin ? '1px solid var(--sarvya-blue)' : '1px solid var(--sarvya-blue-border)',
                color: isAdmin ? '#FFFFFF' : 'var(--sarvya-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12.5px',
                fontWeight: 700,
                flexShrink: 0
              }}>
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {user?.name || 'Operator'}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: isAdmin ? 'var(--sarvya-blue)' : 'var(--text-muted)',
                  fontWeight: isAdmin ? 600 : 400
                }}>
                  {isAdmin ? 'System Administrator' : 'Workspace Operator'}
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={logout}
            className="sarvya-btn sarvya-btn-ghost sarvya-btn-sm"
            title="Sign out"
            aria-label="Sign out"
            style={{ padding: '6px' }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
