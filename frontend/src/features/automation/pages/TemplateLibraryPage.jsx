import React from 'react';
import { Search, Sparkles, Layers, SlidersHorizontal, ArrowLeft } from 'lucide-react';
import { TemplateCard } from '../components/TemplateCard';
import { useTemplates } from '../hooks/useTemplates';

export function TemplateLibraryPage({
  onSelectTemplate,
  onInspectTemplate,
  onBackToAutomations
}) {
  const {
    templates,
    loading,
    error,
    industry,
    setIndustry,
    category,
    setCategory,
    search,
    setSearch,
    industries,
    categories
  } = useTemplates();

  const industryLabels = {
    ALL: 'All Industries',
    HOSPITALITY: 'Hospitality & Resorts',
    B2B: 'B2B SaaS & Services',
    ECOMMERCE: 'E-Commerce & Retail',
    HEALTHCARE: 'Healthcare & Clinics',
    SERVICES: 'Professional Services'
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          {onBackToAutomations && (
            <button
              onClick={onBackToAutomations}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-2 transition-colors"
            >
              <ArrowLeft size={13} />
              <span>Back to My Automations</span>
            </button>
          )}
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Universal Template Library</span>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
              <Sparkles size={11} />
              Production Verified
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pre-built, battle-tested conversational workflows. Install once, configure your branding, and go live in minutes.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates or capabilities..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Industry Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {industries.map((ind) => (
          <button
            key={ind}
            onClick={() => setIndustry(ind)}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
              industry === ind
                ? 'bg-slate-900 text-white shadow-xs font-semibold'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {industryLabels[ind] || ind}
          </button>
        ))}
      </div>

      {/* Grid of Templates */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span>Loading catalog templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="py-14 text-center bg-white border border-slate-200 rounded-xl p-6 max-w-md mx-auto space-y-2">
          <Layers size={24} className="mx-auto text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-800">No templates found</h4>
          <p className="text-xs text-slate-500">
            Try clearing your search term or switching the industry filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((tpl) => (
            <TemplateCard
              key={tpl.id || tpl.template_key}
              template={tpl}
              onSelect={onSelectTemplate}
              onInspect={onInspectTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

