import React from 'react';
import { 
  GitBranch, 
  Layers, 
  Plus, 
  RefreshCw, 
  History, 
  Sliders, 
  ShieldCheck, 
  ChevronRight 
} from 'lucide-react';
import { Button } from '../../../components/ui/Primitives';

export function AutomationStudioHeader({
  activeView,
  onViewChange,
  onNewAutomation,
  onRefresh,
  loading,
  isAdmin = false,
  metrics = {}
}) {
  const tabs = [
    { id: 'my-automations', label: 'My Automations', icon: GitBranch, count: metrics.total },
    { id: 'templates', label: 'Template Library', icon: Layers },
    { id: 'history', label: 'Execution History', icon: History },
    ...(isAdmin ? [{ id: 'admin', label: 'Master Templates', icon: ShieldCheck, badge: 'Admin' }] : [])
  ];

  return (
    <div className="studio-header" style={{
      background: '#FFFFFF',
      borderBottom: '1px solid #E5E5E8',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      position: 'sticky',
      top: 0,
      zIndex: 20,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      flexWrap: 'wrap'
    }}>
      {/* Left: Title & Sub-tabs */}
      <div className="studio-header-left" style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <div className="studio-title-block">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#171719', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Automation Studio</span>
            </h1>
            <span className="studio-pill-badge" style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#2F5219',
              background: '#EDF4E6',
              border: '1px solid #C3D1AC',
              padding: '2px 8px',
              borderRadius: '999px'
            }}>
              Enterprise Hub
            </span>
          </div>
          <p style={{ fontSize: '12px', color: '#67676B', margin: '2px 0 0 0' }}>
            Centralized conversational templates, tenant installations &amp; visual workflows.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="studio-nav-tabs" style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: '#EEEEF0',
          padding: '3px',
          borderRadius: '8px',
          border: '1px solid #E5E5E8',
          gap: '3px'
        }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewChange(tab.id)}
                className={`studio-nav-tab-btn ${isActive ? 'is-active' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#171719' : '#67676B',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <Icon size={14} color={isActive ? '#2F5219' : '#67676B'} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className="tab-count"
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      background: isActive ? '#EDF4E6' : '#E5E5E8',
                      color: isActive ? '#2F5219' : '#3A3A3E'
                    }}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span
                    className="tab-admin-badge"
                    style={{
                      fontSize: '9px',
                      background: '#FCF2FE',
                      color: '#7A2E83',
                      border: '1px solid #EFB0F6',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="studio-header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh Data"
          className="studio-icon-btn"
          style={{
            padding: '7px',
            borderRadius: '8px',
            border: '1px solid #E5E5E8',
            background: '#FFFFFF',
            cursor: 'pointer',
            color: '#67676B',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} color={loading ? '#2876B8' : '#67676B'} />
        </button>

        <button
          type="button"
          onClick={onNewAutomation}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 16px',
            borderRadius: '8px',
            fontSize: '12.5px',
            fontWeight: 600,
            color: '#FFFFFF',
            background: '#2F5219',
            border: '1px solid #2F5219',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(47,82,25,0.2)'
          }}
        >
          <Plus size={14} />
          <span>New Automation</span>
        </button>
      </div>
    </div>
  );
}

