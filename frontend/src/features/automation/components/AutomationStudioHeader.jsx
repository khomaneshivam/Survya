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
    <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sticky top-0 z-20 shadow-xs">
      {/* Left: Title & Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>Automation Studio</span>
            </h1>
            <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              Enterprise Hub
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block mt-0.5">
            Centralized conversational templates, tenant installations & visual workflows.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-emerald-600' : 'text-slate-500'} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="text-[9px] bg-purple-100 text-purple-700 font-bold px-1 rounded uppercase tracking-wider">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Refresh Data"
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-600' : ''} />
        </button>

        <Button
          variant="primary"
          size="sm"
          className="text-xs py-1.5 font-semibold"
          onClick={onNewAutomation}
        >
          <Plus size={14} className="mr-1" />
          <span>New Automation</span>
        </Button>
      </div>
    </div>
  );
}

