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
    name,
    description,
    industry,
    category,
    active_version_number,
    metadata_json,
    config_schema_json,
    required_bindings_json
  } = template;

  const metadata = typeof metadata_json === 'string'
    ? (() => { try { return JSON.parse(metadata_json); } catch { return {}; } })()
    : (metadata_json || {});

  const configSchema = typeof config_schema_json === 'string'
    ? (() => { try { return JSON.parse(config_schema_json); } catch { return {}; } })()
    : (config_schema_json || {});

  const requiredBindings = typeof required_bindings_json === 'string'
    ? (() => { try { return JSON.parse(required_bindings_json); } catch { return []; } })()
    : (required_bindings_json || []);

  const capabilities = metadata.capabilities || metadata.features || [
    'Automated conversation routing & multi-turn memory',
    'Catalog and pricing lookup integration',
    'Interactive WhatsApp quick buttons & interactive lists'
  ];

  const configFieldsCount = Object.keys(configSchema.properties || {}).length;

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

      {/* Hero Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Bot size={28} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="blue" dot>{industry || 'GENERAL'}</Badge>
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {category || 'Standard'}
              </span>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                v{active_version_number || '1.0.0'}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">{name}</h2>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0">
          <Button
            variant="primary"
            size="md"
            className="text-xs font-semibold px-5 py-2.5 shadow-sm"
            onClick={() => onStartSetup(template)}
          >
            <span>Start 5-Min Setup</span>
            <ArrowRight size={14} className="ml-1.5" />
          </Button>
        </div>
      </div>

      {/* Content Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Capabilities & Workflow preview */}
        <div className="md:col-span-2 space-y-6">
          {/* Capabilities */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" />
              <span>What this template includes</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {capabilities.map((cap, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-700 leading-snug">{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Configurable Parameters List */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders size={14} className="text-blue-500" />
                <span>Configurable Client Parameters ({configFieldsCount})</span>
              </h3>
              <span className="text-[11px] text-slate-400">Customized per tenant</span>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {Object.entries(configSchema.properties || {}).map(([key, prop]) => (
                <div key={key} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800">{prop.title || key}</span>
                    <span className="text-[11px] text-slate-400 block">{prop.description || 'Custom variable'}</span>
                  </div>
                  <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {prop.type || 'string'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Requirements & Meta */}
        <div className="space-y-6">
          {/* Resource Bindings */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 size={14} className="text-purple-500" />
              <span>Required Connections</span>
            </h3>
            {requiredBindings.length === 0 ? (
              <p className="text-xs text-slate-500">Standalone. No specific external resource bindings required.</p>
            ) : (
              <div className="space-y-2">
                {requiredBindings.map((b, idx) => {
                  const key = typeof b === 'string' ? b : (b.key || b.label);
                  return (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{key}</span>
                      <span className="text-[10px] uppercase font-mono bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                        Required
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Specifications */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2.5 font-mono text-slate-600">
            <div className="flex items-center justify-between">
              <span>Template ID:</span>
              <span className="font-semibold text-slate-800">{template_key}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Estimated Setup:</span>
              <span className="font-semibold text-slate-800">{metadata.setupTime || '3-5 min'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Execution Engine:</span>
              <span className="font-semibold text-emerald-700">SARVYA O(1) Flow Engine</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

