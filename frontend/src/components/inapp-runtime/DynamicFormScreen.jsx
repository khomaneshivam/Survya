import React, { useState, useEffect } from 'react';
import { validateFormSubmission, validateField } from '../../utils/inappValidator';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function DynamicFormScreen({
  screen = {},
  fields = [],
  initialValues = {},
  serverFieldErrors = {},
  experience = {},
  submitting = false,
  onSubmit
}) {
  const primaryColor = experience.theme?.primaryColor || '#2F5219';
  const [formValues, setFormValues] = useState(() => ({ ...initialValues }));
  const [clientErrors, setClientErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Sync initialValues if changed externally
  useEffect(() => {
    setFormValues(prev => ({ ...initialValues, ...prev }));
  }, [initialValues]);

  // Combine server & client errors
  const errors = { ...clientErrors, ...serverFieldErrors };

  const handleFieldChange = (fieldKey, value, fieldConfig) => {
    const updatedValues = { ...formValues, [fieldKey]: value };
    setFormValues(updatedValues);

    // Validate on change if field has already been touched
    if (touched[fieldKey] && fieldConfig) {
      const err = validateField(fieldConfig, value, updatedValues);
      setClientErrors(prev => ({
        ...prev,
        [fieldKey]: err
      }));
    }
  };

  const handleFieldBlur = (fieldKey, fieldConfig) => {
    setTouched(prev => ({ ...prev, [fieldKey]: true }));
    if (fieldConfig) {
      const err = validateField(fieldConfig, formValues[fieldKey], formValues);
      setClientErrors(prev => ({
        ...prev,
        [fieldKey]: err
      }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Mark all as touched
    const allTouched = {};
    fields.forEach(f => { allTouched[f.fieldKey] = true; });
    setTouched(allTouched);

    // Validate entire form against DB rules
    const validation = validateFormSubmission(fields, formValues);
    if (!validation.valid) {
      setClientErrors(validation.errors);
      return;
    }

    setClientErrors({});
    if (onSubmit) {
      onSubmit(formValues);
    }
  };

  const submitBtnText = screen.config?.submitButtonText || screen.config?.ctaText || 'Continue';

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '18px' }}>
      {/* Screen Title & Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
          {screen.title || 'Please fill in your details'}
        </h1>
        {screen.subtitle && (
          <p style={{ margin: 0, fontSize: '13.5px', color: '#64748b', lineHeight: 1.5 }}>
            {screen.subtitle}
          </p>
        )}
      </div>

      {/* Dynamic Fields List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {fields.map((field) => {
          const fieldKey = field.fieldKey;
          const label = field.label || fieldKey;
          const inputType = field.inputType || 'text';
          const placeholder = field.placeholder || '';
          const rules = field.validationRules || {};
          const isRequired = Boolean(rules.required);
          const errorMsg = errors[fieldKey];
          const hasError = Boolean(errorMsg);
          const currentValue = formValues[fieldKey] !== undefined ? formValues[fieldKey] : '';

          return (
            <div key={field.id || fieldKey} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {/* Field Label */}
              <label
                htmlFor={`field_${fieldKey}`}
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: hasError ? '#dc2626' : '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>{label}</span>
                {isRequired && <span style={{ color: '#dc2626' }}>*</span>}
              </label>

              {/* Input Renderers by type */}
              {inputType === 'textarea' ? (
                <textarea
                  id={`field_${fieldKey}`}
                  rows={3}
                  value={currentValue}
                  placeholder={placeholder}
                  onChange={(e) => handleFieldChange(fieldKey, e.target.value, field)}
                  onBlur={() => handleFieldBlur(fieldKey, field)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: hasError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    backgroundColor: hasError ? '#fef2f2' : '#ffffff'
                  }}
                />
              ) : inputType === 'select' ? (
                <select
                  id={`field_${fieldKey}`}
                  value={currentValue}
                  onChange={(e) => handleFieldChange(fieldKey, e.target.value, field)}
                  onBlur={() => handleFieldBlur(fieldKey, field)}
                  style={{
                    height: '42px',
                    padding: '0 12px',
                    borderRadius: '10px',
                    border: hasError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    backgroundColor: hasError ? '#fef2f2' : '#ffffff',
                    outline: 'none'
                  }}
                >
                  <option value="">{placeholder || 'Select an option...'}</option>
                  {Array.isArray(rules.allowed_values) && rules.allowed_values.map((opt, idx) => (
                    <option key={idx} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : inputType === 'radio' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                  {Array.isArray(rules.allowed_values) && rules.allowed_values.map((opt, idx) => (
                    <label
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name={fieldKey}
                        value={opt}
                        checked={currentValue === opt}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value, field)}
                        style={{ accentColor: primaryColor }}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              ) : inputType === 'checkbox' ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(currentValue)}
                    onChange={(e) => handleFieldChange(fieldKey, e.target.checked, field)}
                    style={{ accentColor: primaryColor }}
                  />
                  <span>{placeholder || label}</span>
                </label>
              ) : (
                <input
                  id={`field_${fieldKey}`}
                  type={inputType}
                  value={currentValue}
                  placeholder={placeholder}
                  min={inputType === 'number' || inputType === 'date' ? rules.min : undefined}
                  max={inputType === 'number' || inputType === 'date' ? rules.max : undefined}
                  onChange={(e) => handleFieldChange(fieldKey, e.target.value, field)}
                  onBlur={() => handleFieldBlur(fieldKey, field)}
                  style={{
                    height: '42px',
                    padding: '0 12px',
                    borderRadius: '10px',
                    border: hasError ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    backgroundColor: hasError ? '#fef2f2' : '#ffffff',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              )}

              {/* Inline Validation Error Message */}
              {hasError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontSize: '11.5px', marginTop: '2px' }}>
                  <AlertCircle size={13} style={{ flexShrink: 0 }} />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit Button */}
      <div style={{ marginTop: 'auto', paddingTop: '16px' }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: primaryColor,
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: `0 4px 14px ${primaryColor}40`,
            opacity: submitting ? 0.75 : 1
          }}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Validating...</span>
            </>
          ) : (
            <>
              <span>{submitBtnText}</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}

