import React from 'react';
import { HelpCircle, AlertCircle } from 'lucide-react';

export function ConfigurationForm({ schema, values = {}, onChange, errors = {} }) {
  if (!schema || !schema.properties) {
    return (
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
        No configurable properties specified for this template.
      </div>
    );
  }

  const properties = schema.properties || {};
  const requiredFields = new Set(schema.required || []);

  const handleChange = (key, val) => {
    onChange({
      ...values,
      [key]: val
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(properties).map(([key, field]) => {
          const isRequired = requiredFields.has(key);
          const currentValue = values[key] !== undefined ? values[key] : (field.default || '');
          const errorMsg = errors[key];

          const fieldType = field.type || 'string';
          const isFullWidth = fieldType === 'text' || field.isMultiline;

          return (
            <div
              key={key}
              className={`flex flex-col space-y-1.5 ${isFullWidth ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <span>{field.title || key}</span>
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

              {/* Field Input Variant */}
              {field.enum ? (
                <select
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                >
                  <option value="" disabled>
                    Select an option...
                  </option>
                  {field.enum.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : fieldType === 'boolean' ? (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={Boolean(currentValue)}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span>{field.description || `Enable ${field.title || key}`}</span>
                </label>
              ) : fieldType === 'number' || fieldType === 'integer' ? (
                <input
                  type="number"
                  min={field.minimum}
                  max={field.maximum}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder={field.default !== undefined ? String(field.default) : ''}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              ) : fieldType === 'text' || field.isMultiline ? (
                <textarea
                  rows={field.rows || 3}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={field.description || ''}
                  className={`w-full px-3 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    errorMsg ? 'border-rose-400 bg-rose-50/20' : 'border-slate-300'
                  }`}
                />
              ) : (
                <input
                  type={field.format === 'email' ? 'email' : field.format === 'time' ? 'time' : 'text'}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={field.description || field.default || ''}
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
              ) : field.helpText ? (
                <span className="text-[11px] text-slate-400">{field.helpText}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

