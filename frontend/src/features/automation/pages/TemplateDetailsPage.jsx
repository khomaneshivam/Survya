import React from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Sliders, 
  ShieldCheck, 
  Bot, 
  Phone, 
  Clock, 
  Building2,
  ArrowRight
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui/Primitives';

export function TemplateDetailsPage({ template, onStartSetup, onBack }) {
  if (!template) {
    return (
      <div className="p-6 text-center text-xs text-slate-500">
        Template not found.
      </div>
    );
  }

  const {
    template_key,
    title,
    name,
    description,
    industry,
    category,
    current_version,
    active_version_number,
    capabilities_json,
    config_schema_json,
    required_bindings_json
  } = template;

  const displayTitle = title || name || template_key || 'Untitled Template';
  const displayVersion = current_version || active_version_number || '1.0.0';

  const configSchema = typeof config_schema_json === 'string'
    ? (() => { try { return JSON.parse(config_schema_json); } catch { return {}; } })()
    : (config_schema_json || {});

  const requiredBindings = typeof required_bindings_json === 'string'
    ? (() => { try { return JSON.parse(required_bindings_json); } catch { return []; } })()
    : (required_bindings_json || []);

  const capabilities = Array.isArray(capabilities_json)
    ? capabilities_json
    : (typeof capabilities_json === 'string'
        ? (() => { try { return JSON.parse(capabilities_json); } catch { return []; } })()
        : [
            'Automated conversation routing & multi-turn memory',
            'Catalog and pricing lookup integration',
            'Interactive WhatsApp quick buttons & interactive lists'
          ]);

  const schemaProps = configSchema.properties || configSchema;
  const configFieldsCount = Object.keys(schemaProps).filter(k => !['type', 'required', 'properties', 'title', 'description'].includes(k) || schemaProps[k]?.type).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
      >
        <ArrowLeft size={13} />
        <span>Back to Template Library</span>
      </button>

      {/* Main Hero Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <Bot size={28} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone="blue" dot>
                  {industry || 'GENERAL'}
                </Badge>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                  {category || 'Standard'}
                </span>
                <span className="text-xs font-mono text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                  v{displayVersion}
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {displayTitle}
              </h1>
              <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                {description}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
            <Button
              variant="primary"
              size="md"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 px-4"
              onClick={() => onStartSetup && onStartSetup(template)}
            >
              <span>Use This Template</span>
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Configurable Fields</span>
            <span className="font-bold text-slate-800 text-sm">{configFieldsCount} Dynamic Fields</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Required Connections</span>
            <span className="font-bold text-slate-800 text-sm">{requiredBindings.length} Resource Bindings</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Deployment Time</span>
            <span className="font-bold text-slate-800 text-sm">~3 Minutes</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Safety Level</span>
            <span className="font-bold text-emerald-600 text-sm">Sandbox Verified</span>
          </div>
        </div>
      </div>

      {/* Two Column Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Included Capabilities */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={14} className="text-emerald-600" />
            <span>Built-in Workflow Capabilities</span>
          </h3>
          <div className="space-y-2.5">
            {capabilities.map((cap, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs text-slate-700">
                <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{cap}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Required Bindings & Resources */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-blue-600" />
            <span>Required Workspace Resources</span>
          </h3>
          {requiredBindings.length === 0 ? (
            <p className="text-xs text-slate-500">
              This blueprint runs standalone without external master catalog dependencies.
            </p>
          ) : (
            <div className="space-y-2.5">
              {requiredBindings.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{b.label || b.key}</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded">
                    {b.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
