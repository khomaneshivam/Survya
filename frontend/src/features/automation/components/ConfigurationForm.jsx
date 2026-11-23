import React from 'react';
import { HelpCircle, AlertCircle, Phone, Clock, Mail, Calendar, DollarSign } from 'lucide-react';

export function ConfigurationForm({ schema, values = {}, onChange, errors = {}, filterKeys = null }) {
  if (!schema || typeof schema !== 'object') {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        No configuration parameters required for this step.
      </div>
    );
  }

  // Support both JSON Schema ({ properties: { ... } }) and flat definitions ({ "field": { ... } })
  const properties = schema.properties || schema;
  const entries = Object.entries(properties).filter(([key, field]) => {
    if (!field || typeof field !== 'object') return false;
    // Don't render top-level schema meta keywords
    if (['type', 'required', 'properties', 'title', 'description', '$schema'].includes(key) && !field.type) return false;
    if (filterKeys && Array.isArray(filterKeys)) {
      return filterKeys.includes(key);
    }
    return true;
  });

  if (entries.length === 0) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        No configurable fields found.
      </div>
    );
  }

  const requiredFields = new Set(
    Array.isArray(schema.required)
      ? schema.required
      : entries.filter(([, f]) => f.required === true).map(([k]) => k)
  );

  const handleChange = (key, val) => {
    onChange({
      ...values,
      [key]: val
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map(([key, field]) => {
          const isRequired = requiredFields.has(key) || field.required === true;
          const currentValue = values[key] !== undefined ? values[key] : (field.default !== undefined ? field.default : '');
          const errorMsg = errors[key];

          const fieldType = (field.type || 'string').toLowerCase();
          const isFullWidth = fieldType === 'text' || field.isMultiline || fieldType === 'textarea';
          const label = field.label || field.title || key;

          return (
            <div
              key={key}
              className={`flex flex-col space-y-1.5 ${isFullWidth ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>{label}</span>
                  {isRequired && <span className="text-rose-500 font-bold">*</span>}
                </label>
                {field.description && (
                  <span
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-help"
                    title={field.description}
                  >
                    <HelpCircle size={13} />
                  </span>
                )}
              </div>

              {/* Field Variant */}
              {field.enum || field.options ? (
                <select
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                >
                  <option value="" disabled>Select option...</option>
                  {(field.options || field.enum).map((opt) => {
                    const optVal = typeof opt === 'object' ? opt.value || opt.id : opt;
                    const optLabel = typeof opt === 'object' ? opt.label || opt.title || optVal : opt;
                    return (
                      <option key={optVal} value={optVal}>
                        {optLabel}
                      </option>
                    );
                  })}
                </select>
              ) : fieldType === 'boolean' ? (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(currentValue)}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span>{field.description || `Enable ${label}`}</span>
                </label>
              ) : fieldType === 'phone' ? (
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    value={currentValue}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={field.placeholder || 'e.g. 919422359446'}
                    className={`w-full pl-9 pr-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors font-mono ${
                      errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                    }`}
                  />
                </div>
              ) : fieldType === 'email' ? (
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    value={currentValue}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={field.placeholder || 'e.g. contact@business.com'}
                    className={`w-full pl-9 pr-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                      errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                    }`}
                  />
                </div>
              ) : fieldType === 'time' ? (
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="time"
                    value={currentValue}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className={`w-full pl-9 pr-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                      errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                    }`}
                  />
                </div>
              ) : fieldType === 'date' ? (
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={currentValue}
                    onChange={(e) => handleChange(key, e.target.value)}
                    className={`w-full pl-9 pr-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                      errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                    }`}
                  />
                </div>
              ) : fieldType === 'number' || fieldType === 'integer' || fieldType === 'currency' ? (
                <input
                  type="number"
                  min={field.min !== undefined ? field.min : field.minimum}
                  max={field.max !== undefined ? field.max : field.maximum}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={field.placeholder || (field.default !== undefined ? String(field.default) : '')}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              ) : fieldType === 'text' || fieldType === 'textarea' || field.isMultiline ? (
                <textarea
                  rows={field.rows || 3}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={field.placeholder || field.description || ''}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              ) : (
                <input
                  type="text"
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={field.placeholder || field.default || ''}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              )}

              {/* Helper text or validation error */}
              {errorMsg ? (
                <span className="text-[11px] text-rose-500 flex items-center gap-1 font-medium">
                  <AlertCircle size={11} />
                  {errorMsg}
                </span>
              ) : field.description && fieldType !== 'boolean' ? (
                <span className="text-[11px] text-slate-400">{field.description}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
