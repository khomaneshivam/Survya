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
    title,
    name,
    description,
    industry,
    category,
    current_version,
    active_version_number,
    capabilities_json,
    badge
  } = template;

  const displayTitle = title || name || template_key || 'Untitled Template';
  const displayVersion = current_version || active_version_number || '1.0.0';

  const capabilities = Array.isArray(capabilities_json)
    ? capabilities_json
    : (typeof capabilities_json === 'string'
        ? (() => { try { return JSON.parse(capabilities_json); } catch { return []; } })()
        : [
            'Automated conversation routing & multi-turn memory',
            'Catalog & dynamic pricing lookup integration',
            'WhatsApp-native interactive menus & buttons'
          ]);

  const industryTone = {
    HOSPITALITY: 'blue',
    B2B_SAAS: 'purple',
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
            {badge && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded uppercase">
                {badge}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
            v{displayVersion}
          </span>
        </div>

        {/* Title & Description */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0 group-hover:scale-105 transition-transform">
            <Bot size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-[15px] leading-snug group-hover:text-emerald-700 transition-colors">
              {displayTitle}
            </h3>
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-1.5 my-4 border-t border-slate-100 pt-3">
          {capabilities.slice(0, 3).map((cap, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
              <span className="truncate">{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="text-xs py-1.5 flex-1"
          onClick={() => onInspect && onInspect(template)}
        >
          <span>Preview Details</span>
        </Button>

        <Button
          variant="primary"
          size="sm"
          className="text-xs py-1.5 font-semibold flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onSelect && onSelect(template)}
        >
          <span>Use Template</span>
          <ArrowRight size={13} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}
