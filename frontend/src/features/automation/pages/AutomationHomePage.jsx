import React, { useState, useMemo } from 'react';
import { 
  GitBranch, 
  Play, 
  Pause, 
  Trash2, 
  Copy, 
  Settings, 
  History, 
  ExternalLink, 
  Search, 
  Filter, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Layers,
  ArrowUpRight,
  MoreVertical
} from 'lucide-react';
import { Badge, Button } from '../../../components/ui/Primitives';

export function AutomationHomePage({
  automations = [],
  metrics = {},
  loading = false,
  onOpenBuilder,
  onOpenDetails,
  onOpenHistory,
  onToggleStatus,
  onDeleteAutomation,
  onDuplicateAutomation,
  onBrowseTemplates
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | DRAFT | PAUSED

  const filteredAutomations = useMemo(() => {
    return automations.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const trigger = (item.trigger_keyword || '').toLowerCase();
      const status = (item.status || 'DRAFT').toUpperCase();

      const matchesSearch = !search || name.includes(search.toLowerCase()) || trigger.includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && (status === 'ACTIVE' || status === 'PUBLISHED')) ||
        (statusFilter === 'DRAFT' && status === 'DRAFT') ||
        (statusFilter === 'PAUSED' && status === 'PAUSED');

      return matchesSearch && matchesStatus;
    });
  }, [automations, search, statusFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top High-Density Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-white border-slate-400 shadow-xs ring-1 ring-slate-400'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Automations</span>
            <GitBranch size={16} className="text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {metrics.total || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Across all workspaces</p>
        </div>

        <div
          onClick={() => setStatusFilter('ACTIVE')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'ACTIVE'
              ? 'bg-white border-emerald-500 shadow-xs ring-1 ring-emerald-500'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active & Live</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
            {metrics.active || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Routing incoming chats</p>
        </div>

        <div
          onClick={() => setStatusFilter('DRAFT')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'DRAFT'
              ? 'bg-white border-amber-400 shadow-xs ring-1 ring-amber-400'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Drafts</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-700 tabular-nums">
            {metrics.drafts || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Unpublished workflows</p>
        </div>

        <div className="p-4 rounded-xl border bg-white border-slate-200/90">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Needs Attention</span>
            <AlertCircle size={16} className={metrics.needsAttention > 0 ? 'text-rose-500' : 'text-slate-400'} />
          </div>
          <div className={`text-2xl font-bold font-mono tabular-nums ${metrics.needsAttention > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {metrics.needsAttention || 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Errors or broken bindings</p>
        </div>
      </div>

      {/* Control Bar: Search, Filters & Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by flow name, trigger keyword, or ID..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 text-xs">
            {['ALL', 'ACTIVE', 'DRAFT', 'PAUSED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            className="text-xs py-1.5"
            onClick={onBrowseTemplates}
          >
            <Layers size={13} className="mr-1 text-slate-500" />
            <span>Template Library</span>
          </Button>
        </div>
      </div>

      {/* Automations Table / List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {filteredAutomations.length === 0 ? (
          <div className="py-14 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <GitBranch size={22} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">No automations found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {search || statusFilter !== 'ALL'
                  ? 'No automations match your active search and filter criteria.'
                  : 'Get started in under 3 minutes by selecting an industry template or building a custom workflow.'}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={onBrowseTemplates}>
                <Layers size={13} className="mr-1" />
                <span>Browse Template Library</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Automation Name</th>
                  <th className="py-3 px-3">Type & Origin</th>
                  <th className="py-3 px-3">Trigger Keyword</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Performance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAutomations.map((item) => {
                  const status = (item.status || 'DRAFT').toUpperCase();
                  const isActive = status === 'ACTIVE' || status === 'PUBLISHED';
                  const isTemplate = item.isTemplateBased;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/60 transition-colors group"
                    >
                      {/* Name & ID */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => onOpenBuilder(item.id)}
                            className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700 group-hover:border-emerald-200 transition-colors cursor-pointer flex-shrink-0"
                          >
                            <GitBranch size={15} />
                          </div>
                          <div>
                            <span
                              onClick={() => onOpenBuilder(item.id)}
                              className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors cursor-pointer hover:underline block"
                            >
                              {item.name || 'Untitled Automation'}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              ID: {item.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Origin & Version */}
                      <td className="py-3 px-3">
                        {isTemplate ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                              <Sparkles size={10} className="text-blue-500" />
                              <span>Template</span>
                            </span>
                            {item.installedVersion && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                v{item.installedVersion}
                                {item.hasUpgrade && (
                                  <span className="text-amber-600 font-bold ml-1">● Update</span>
                                )}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            Custom Flow
                          </span>
                        )}
                      </td>

                      {/* Trigger Keyword */}
                      <td className="py-3 px-3">
                        {item.trigger_keyword ? (
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-700 border border-slate-200/80 px-2 py-0.5 rounded font-semibold">
                            {item.trigger_keyword}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Default Inbound</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Active</span>
                          </span>
                        ) : status === 'PAUSED' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                            <span>Paused</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                            <span>Draft</span>
                          </span>
                        )}
                      </td>

                      {/* Performance Metric */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600 tabular-nums">
                        <div>
                          <span>{item.execution_count || 0} runs</span>
                        </div>
                        {item.dropoff_rate !== undefined && (
                          <span className="text-[10px] text-slate-400">
                            Dropoff: {(item.dropoff_rate * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle Status */}
                          <button
                            onClick={() => onToggleStatus(item.id, item.status)}
                            title={isActive ? 'Pause Automation' : 'Publish / Activate'}
                            className={`p-1.5 rounded-md border transition-colors ${
                              isActive
                                ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                                : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            {isActive ? <Pause size={13} /> : <Play size={13} />}
                          </button>

                          {/* Builder */}
                          <button
                            onClick={() => onOpenBuilder(item.id)}
                            title="Open Visual Graph Editor"
                            className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                          >
                            <GitBranch size={13} />
                          </button>

                          {/* Settings / Config Details */}
                          {item.installation ? (
                            <button
                              onClick={() => onOpenDetails(item.id, item.installation.id)}
                              title="Configuration & Bindings"
                              className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                            >
                              <Settings size={13} />
                            </button>
                          ) : null}

                          {/* History */}
                          <button
                            onClick={() => onOpenHistory(item.id)}
                            title="Execution Logs"
                            className="p-1.5 text-slate-600 hover:text-purple-700 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
                          >
                            <History size={13} />
                          </button>

                          {/* Duplicate */}
                          <button
                            onClick={() => onDuplicateAutomation(item.id)}
                            title="Duplicate"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Copy size={13} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
                                onDeleteAutomation(item.id);
                              }
                            }}
                            title="Delete"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

