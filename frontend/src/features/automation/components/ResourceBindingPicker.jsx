import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../../utils/apiAuth';
import { Phone, Building2, Kanban, Layers, AlertCircle, CheckCircle2 } from 'lucide-react';

export function ResourceBindingPicker({ requiredBindings = [], values = {}, onChange }) {
  const [properties, setProperties] = useState([]);
  const [lines, setLines] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTenantResources() {
      setLoading(true);
      try {
        const [propsRes, linesRes, catRes] = await Promise.all([
          fetchWithAuth('/api/properties').catch(() => ({ json: () => ({ success: false }) })),
          fetchWithAuth('/api/lines').catch(() => ({ json: () => ({ success: false }) })),
          fetchWithAuth('/api/catalog/categories').catch(() => ({ json: () => ({ success: false }) }))
        ]);

        const propsData = await propsRes.json().catch(() => ({}));
        const linesData = await linesRes.json().catch(() => ({}));
        const catData = await catRes.json().catch(() => ({}));

        if (propsData?.properties) setProperties(propsData.properties);
        if (linesData?.lines) setLines(linesData.lines);
        if (catData?.categories) setCategories(catData.categories);
      } catch {
        // Fallback gracefully
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

  return (
    <div className="space-y-3">
      {requiredBindings.map((binding) => {
        const key = typeof binding === 'string' ? binding : (binding.key || binding.binding_key);
        const label = typeof binding === 'object' && binding.label ? binding.label : key;
        const type = typeof binding === 'object' && binding.type ? binding.type : key;
        const isRequired = typeof binding === 'object' && binding.required !== undefined ? binding.required : true;
        const selectedValue = values[key] || '';

        return (
          <div key={key} className="p-3 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getBindingIcon(type)}
                <span className="text-xs font-semibold text-slate-800">{label}</span>
                {isRequired && <span className="text-rose-500 text-xs font-bold">*</span>}
              </div>
              <span className="text-[10px] uppercase font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {type}
              </span>
            </div>

            {/* Dropdown Options Based on Type */}
            {type === 'PROPERTY' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Property / Branch...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.code ? `(${p.code})` : ''}
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
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select WhatsApp Phone Number...</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.display_phone_number || l.phone_number_id} ({l.verified_name || 'Active Line'})
                  </option>
                ))}
                {lines.length === 0 && (
                  <option value="default">Default WhatsApp Business Line</option>
                )}
              </select>
            ) : type === 'CATALOG_CATEGORY' ? (
              <select
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select Catalog Category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {categories.length === 0 && (
                  <option value="default">All Live Catalog Categories</option>
                )}
              </select>
            ) : (
              <input
                type="text"
                placeholder={`Enter ${label} identifier...`}
                value={selectedValue}
                onChange={(e) => handleSelect(key, e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

