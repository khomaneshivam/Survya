import React, { useState, useEffect } from 'react';
import { Phone, Building2, Kanban, Layers, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { automationApi } from '../api/automationApi';

export function ResourceBindingPicker({ requiredBindings = [], values = {}, onChange }) {
  const [resources, setResources] = useState({
    whatsappLines: [],
    properties: [],
    catalogCategories: [],
    crmPipelines: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTenantResources() {
      setLoading(true);
      try {
        const res = await automationApi.getTenantResources();
        if (res && res.success && res.resources) {
          setResources(res.resources);
        }
      } catch (err) {
        console.warn('Failed to load tenant resources for binding picker:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTenantResources();
  }, []);

  const handleSelect = (bindingKey, resId) => {
    onChange({
      ...values,
      [bindingKey]: resId
    });
  };

  const getBindingIcon = (type) => {
    switch (type) {
      case 'WHATSAPP_LINE': return <Phone size={14} className="text-emerald-600" />;
      case 'PROPERTY': return <Building2 size={14} className="text-blue-600" />;
      case 'CRM_PIPELINE': return <Kanban size={14} className="text-purple-600" />;
      case 'CATALOG_CATEGORY': return <Layers size={14} className="text-amber-600" />;
      default: return <Building2 size={14} className="text-slate-600" />;
    }
  };

  if (!requiredBindings || requiredBindings.length === 0) {
    return (
      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 flex items-center gap-2">
        <CheckCircle2 size={14} className="text-emerald-500" />
        <span>No specific external resource bindings required. This automation will run standalone.</span>
      </div>
    );
  }

  const { whatsappLines = [], properties = [], catalogCategories = [], crmPipelines = [] } = resources;

  return (
    <div className="space-y-3">
      {requiredBindings.map((binding) => {
        const key = typeof binding === 'string' ? binding : (binding.key || binding.binding_key);
        const label = typeof binding === 'object' && binding.label ? binding.label : key;
        const type = typeof binding === 'object' && binding.type ? binding.type : key;
        const isRequired = typeof binding === 'object' && binding.required !== undefined ? binding.required : true;
        const selectedValue = values[key] || '';

        return (
          <div key={key} className="p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getBindingIcon(type)}
                <span className="text-xs font-semibold text-slate-800">{label}</span>
                {isRequired && <span className="text-rose-500 text-xs font-bold">*</span>}
              </div>
              <span className="text-[10px] uppercase font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {type}
              </span>
            </div>

            {/* Dropdown Options Based on Type */}
            {type === 'PROPERTY' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select Property / Branch...</option>
                {properties.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} {p.city ? `(${p.city})` : ''}
                  </option>
                ))}
                {properties.length === 0 && (
                  <option value="1">Primary Property (Default Workspace)</option>
                )}
              </select>
            ) : type === 'WHATSAPP_LINE' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none font-mono"
              >
                <option value="">Select WhatsApp Phone Line...</option>
                {whatsappLines.map((l) => (
                  <option key={l.phone_number_id} value={String(l.phone_number_id || l.phone_number)}>
                    {l.display_name || l.phone_number} ({l.phone_number || l.phone_number_id})
                  </option>
                ))}
                {whatsappLines.length === 0 && (
                  <option value="919307382030">Primary WhatsApp Line (+91 93073 82030)</option>
                )}
              </select>
            ) : type === 'CRM_PIPELINE' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select CRM Sales Pipeline...</option>
                {crmPipelines.map((pipe) => (
                  <option key={pipe.id} value={pipe.slug || String(pipe.id)}>
                    {pipe.name} ({pipe.slug || pipe.industry_type || 'Sales'})
                  </option>
                ))}
                {crmPipelines.length === 0 && (
                  <option value="b2b-sales-pipeline">B2B Sales Pipeline (Default)</option>
                )}
              </select>
            ) : type === 'CATALOG_CATEGORY' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select Catalog Category...</option>
                {catalogCategories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
                {catalogCategories.length === 0 && (
                  <option value="1">All Live Catalog Categories</option>
                )}
              </select>
            ) : (
              <input
                type="text"
                placeholder={`Enter ${label} identifier...`}
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-emerald-500 focus:outline-none"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
