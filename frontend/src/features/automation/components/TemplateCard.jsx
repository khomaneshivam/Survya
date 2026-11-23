import React from 'react';
import { Badge, Button } from '../../../components/ui/Primitives';
import { 
  Bot, 
  ArrowRight, 
  CheckCircle2, 
  Layers, 
  Building2, 
  Sparkles, 
  Clock, 
  ShieldCheck, 
  SlidersHorizontal 
} from 'lucide-react';

export function TemplateCard({ template, onSelect, onInspect }) {
  const {
    id,
    template_key,
    name,
    description,
    industry,
    category,
    active_version_number,
    metadata_json
  } = template;

  const metadata = typeof metadata_json === 'string'
    ? (() => { try { return JSON.parse(metadata_json); } catch { return {}; } })()
    : (metadata_json || {});

  const capabilities = metadata.capabilities || metadata.features || [
    'Automated conversation routing',
    'Catalog & booking integration',
    'WhatsApp-native interactive menus'
  ];

  const estimatedTime = metadata.setupTime || '3-5 min';
  const difficulty = metadata.difficulty || 'Beginner';

  const industryTone = {
    HOSPITALITY: 'blue',
    B2B: 'purple',
    ECOMMERCE: 'green',
    HEALTHCARE: 'coral',
    SERVICES: 'taupe'
  }[industry] || 'blue';

  return (
    <div className="bg-white border border-slate-200/90 rounded-xl p-5 hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={industryTone} dot>
              {industry || 'GENERAL'}
            </Badge>
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
              {category || 'Standard'}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
            v{active_version_number || '1.0.0'}
          </span>
        </div>

        {/* Title & Description */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0 group-hover:scale-105 transition-transform">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-[15px] leading-snug group-hover:text-emerald-700 transition-colors">
              {name}
            </h3>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Key Capabilities */}
        <div className="my-4 pt-3 border-t border-slate-100 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Sparkles size={12} className="text-amber-500" />
            <span>Included Capabilities</span>
          </div>
          {capabilities.slice(0, 3).map((cap, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
              <span className="truncate">{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Metrics & Actions */}
      <div className="pt-3 border-t border-slate-100 mt-2">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3 font-mono">
          <span className="flex items-center gap-1">
            <Clock size={12} className="text-slate-400" />
            Setup: {estimatedTime}
          </span>
          <span className="flex items-center gap-1">
            <SlidersHorizontal size={12} className="text-slate-400" />
            {difficulty}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onInspect && (
            <button
              onClick={() => onInspect(template)}
              className="flex-1 py-1.5 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Details
            </button>
          )}
          <Button
            variant="primary"
            size="sm"
            className="flex-1 text-xs py-1.5"
            onClick={() => onSelect(template)}
          >
            <span>Use Template</span>
            <ArrowRight size={13} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

