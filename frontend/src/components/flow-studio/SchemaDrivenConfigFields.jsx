import React from 'react';

/**
 * Declarative field editor for trusted workflow node descriptors.
 * Only data changes are emitted; no tenant-supplied code is executed.
 */
export default function SchemaDrivenConfigFields({ fields = [], config = {}, onChange }) {
  if (!Array.isArray(fields) || !fields.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {fields.filter((field) => {
        const rule = field.showWhen;
        return !rule || config[rule.field] === rule.equals;
      }).map((field) => {
        const rawValue = config[field.key];
        const value = rawValue ?? field.defaultValue ?? '';
        const id = `schema-field-${field.key}`;
        const inputStyle = { width: '100%' };
        const onValueChange = (incoming) => {
          if (field.type === 'number') {
            const numeric = Number(incoming);
            const bounded = Number.isFinite(numeric)
              ? Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, numeric))
              : (field.min ?? 0);
            onChange(field.key, bounded);
          } else {
            onChange(field.key, incoming);
          }
        };

        return (
          <div className="form-group" key={field.key}>
            <label htmlFor={id} className="form-label" style={{ fontWeight: 600, fontSize: '0.80rem' }}>
              {field.label}{field.required ? ' *' : ''}
            </label>

            {field.type === 'select' ? (
              <select
                id={id}
                className="form-input"
                style={inputStyle}
                value={String(value)}
                onChange={(e) => onValueChange(e.target.value)}
              >
                {(field.options || []).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={id}
                className="form-input"
                style={inputStyle}
                rows={3}
                value={String(value)}
                required={Boolean(field.required)}
                maxLength={field.maxLength}
                placeholder={field.placeholder || ''}
                onChange={(e) => onValueChange(e.target.value)}
              />
            ) : field.type === 'boolean' ? (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onValueChange(e.target.checked)}
              />
            ) : (
              <input
                id={id}
                className="form-input"
                style={inputStyle}
                type={field.type === 'number' ? 'number' : 'text'}
                value={value}
                min={field.min}
                max={field.max}
                maxLength={field.maxLength}
                pattern={field.pattern}
                required={Boolean(field.required)}
                placeholder={field.placeholder || ''}
                onChange={(e) => onValueChange(e.target.value)}
              />
            )}
            {field.description && (
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4 }}>
                {field.description}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
