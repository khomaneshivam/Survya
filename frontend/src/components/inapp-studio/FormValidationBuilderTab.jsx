import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody, Button, Badge, Modal } from '../ui';
import {
  Plus,
  Trash2,
  Edit,
  MoveUp,
  MoveDown,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Check,
  Play
} from 'lucide-react';
import { validateFormSubmission } from '../../utils/inappValidator';

const INPUT_TYPES = [
  { value: 'TEXT', label: 'Single-line Text' },
  { value: 'NUMBER', label: 'Number / Quantity' },
  { value: 'EMAIL', label: 'Email Address' },
  { value: 'PHONE', label: 'WhatsApp / Mobile Phone' },
  { value: 'DATE', label: 'Single Date' },
  { value: 'DATE_RANGE', label: 'Date Range' },
  { value: 'SELECT', label: 'Dropdown Select' },
  { value: 'RADIO', label: 'Radio Button Group' },
  { value: 'MULTISELECT', label: 'Multiple Selection' },
  { value: 'PRICE_RANGE', label: 'Price Range Slider' },
  { value: 'TEXTAREA', label: 'Multi-line Paragraph' }
];

const CRM_MAPPING_OPTIONS = [
  { value: '', label: 'None (Unmapped)' },
  { value: 'contact_name', label: 'Contact: Full Name' },
  { value: 'contact_phone', label: 'Contact: Phone Number' },
  { value: 'contact_email', label: 'Contact: Email Address' },
  { value: 'check_in_date', label: 'Booking: Check-in Date' },
  { value: 'check_out_date', label: 'Booking: Check-out Date' },
  { value: 'adults', label: 'Booking: Adults Count' },
  { value: 'children', label: 'Booking: Children Count' },
  { value: 'company_name', label: 'B2B: Company Name' },
  { value: 'team_size', label: 'B2B: Team Size' },
  { value: 'notes', label: 'CRM: Notes / Special Requests' }
];

export default function FormValidationBuilderTab({
  experience,
  screens = [],
  selectedScreenId = null,
  onRefresh,
  toast
}) {
  const dynamicScreens = screens.filter(s => s.screen_type === 'DYNAMIC_FORM');

  const [activeScreenId, setActiveScreenId] = useState(
    selectedScreenId || (dynamicScreens[0]?.id || '')
  );

  useEffect(() => {
    if (selectedScreenId) {
      setActiveScreenId(selectedScreenId);
    } else if (!activeScreenId && dynamicScreens.length > 0) {
      setActiveScreenId(dynamicScreens[0].id);
    }
  }, [selectedScreenId, dynamicScreens]);

  const currentScreen = screens.find(s => String(s.id) === String(activeScreenId));
  const fields = currentScreen?.fields || [];

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [loading, setLoading] = useState(false);

  // Field Edit State
  const [formData, setFormData] = useState({
    field_key: '',
    label: '',
    placeholder: '',
    input_type: 'TEXT',
    options_raw: '',
    crm_field_mapping: '',
    rules: {
      required: true,
      minLength: '',
      maxLength: '',
      min: '',
      max: '',
      regex: '',
      date_min_today: false,
      date_after_field: '',
      errorMessage: ''
    }
  });

  // Interactive Live Validation Test State
  const [testValues, setTestValues] = useState({});
  const [testResult, setTestResult] = useState(null);

  const openAddField = () => {
    setEditingField(null);
    setFormData({
      field_key: `field_${fields.length + 1}`,
      label: '',
      placeholder: '',
      input_type: 'TEXT',
      options_raw: '',
      crm_field_mapping: '',
      rules: {
        required: true,
        minLength: '',
        maxLength: '',
        min: '',
        max: '',
        regex: '',
        date_min_today: false,
        date_after_field: '',
        errorMessage: ''
      }
    });
    setFieldModalOpen(true);
  };

  const openEditField = (field) => {
    setEditingField(field);

    let parsedRules = {};
    if (typeof field.validation_rules_json === 'string') {
      try { parsedRules = JSON.parse(field.validation_rules_json || '{}'); } catch (e) {}
    } else if (field.validation_rules_json) {
      parsedRules = field.validation_rules_json;
    }

    let optsRaw = '';
    if (typeof field.options_json === 'string') {
      try {
        const opts = JSON.parse(field.options_json || '[]');
        optsRaw = Array.isArray(opts) ? opts.join(', ') : '';
      } catch (e) {}
    } else if (Array.isArray(field.options_json)) {
      optsRaw = field.options_json.join(', ');
    }

    setFormData({
      field_key: field.field_key,
      label: field.label,
      placeholder: field.placeholder || '',
      input_type: field.input_type,
      options_raw: optsRaw,
      crm_field_mapping: field.crm_field_mapping || '',
      rules: {
        required: Boolean(parsedRules.required),
        minLength: parsedRules.minLength !== undefined ? String(parsedRules.minLength) : '',
        maxLength: parsedRules.maxLength !== undefined ? String(parsedRules.maxLength) : '',
        min: parsedRules.min !== undefined ? String(parsedRules.min) : '',
        max: parsedRules.max !== undefined ? String(parsedRules.max) : '',
        regex: parsedRules.regex || '',
        date_min_today: Boolean(parsedRules.date_min_today),
        date_after_field: parsedRules.date_after_field || '',
        errorMessage: parsedRules.errorMessage || ''
      }
    });
    setFieldModalOpen(true);
  };

  const handleSaveField = async (e) => {
    e.preventDefault();
    if (!activeScreenId) return;
    setLoading(true);

    try {
      const cleanRules = { required: formData.rules.required };
      if (formData.rules.minLength) cleanRules.minLength = parseInt(formData.rules.minLength, 10);
      if (formData.rules.maxLength) cleanRules.maxLength = parseInt(formData.rules.maxLength, 10);
      if (formData.rules.min) cleanRules.min = Number(formData.rules.min);
      if (formData.rules.max) cleanRules.max = Number(formData.rules.max);
      if (formData.rules.regex) cleanRules.regex = formData.rules.regex;
      if (formData.rules.date_min_today) cleanRules.date_min_today = true;
      if (formData.rules.date_after_field) cleanRules.date_after_field = formData.rules.date_after_field;
      if (formData.rules.errorMessage) cleanRules.errorMessage = formData.rules.errorMessage;

      let optionsArray = null;
      if (formData.options_raw) {
        optionsArray = formData.options_raw.split(',').map(o => o.trim()).filter(Boolean);
      }

      const payload = {
        field_key: formData.field_key,
        label: formData.label,
        placeholder: formData.placeholder,
        input_type: formData.input_type,
        options_json: optionsArray,
        validation_rules_json: cleanRules,
        crm_field_mapping: formData.crm_field_mapping || null
      };

      const url = editingField
        ? `/api/v1/inapp/fields/${editingField.id}`
        : `/api/v1/inapp/screens/${activeScreenId}/fields`;
      const method = editingField ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setFieldModalOpen(false);
        if (toast) toast(editingField ? 'Field updated' : 'Field added to form');
        if (onRefresh) onRefresh();
      } else {
        alert(data.message || 'Failed to save field');
      }
    } catch (err) {
      alert(err.message || 'Error saving field');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteField = async (fieldId) => {
    if (!window.confirm('Delete this form field?')) return;
    try {
      const res = await fetch(`/api/v1/inapp/fields/${fieldId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast('Field deleted');
        if (onRefresh) onRefresh();
      }
    } catch (e) {}
  };

  const handleMoveOrder = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= fields.length) return;

    const reordered = [...fields];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    const fieldIds = reordered.map(f => f.id);

    try {
      await fetch(`/api/v1/inapp/screens/${activeScreenId}/fields/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fieldIds })
      });
      if (onRefresh) onRefresh();
    } catch (e) {}
  };

  const handleRunLiveTest = () => {
    const result = validateFormSubmission(fields, testValues);
    setTestResult(result);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Screen Selection Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: '600' }}>Target Dynamic Form:</label>
          <select
            className="input-field"
            value={activeScreenId}
            onChange={e => {
              setActiveScreenId(e.target.value);
              setTestValues({});
              setTestResult(null);
            }}
            style={{ minWidth: '220px' }}
          >
            {dynamicScreens.length === 0 ? (
              <option value="">No DYNAMIC_FORM screen found</option>
            ) : (
              dynamicScreens.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.title} ({ds.screen_key})
                </option>
              ))
            )}
          </select>
        </div>

        {currentScreen && (
          <Button variant="primary" onClick={openAddField}>
            <Plus size={16} /> Add Field
          </Button>
        )}
      </div>

      {!currentScreen ? (
        <Card>
          <CardBody>
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <FileSpreadsheet size={36} style={{ color: 'var(--text-tertiary, #94a3b8)', marginBottom: '10px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>No Dynamic Form Screen Selected</h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Please create a screen of type <code>DYNAMIC_FORM</code> in the Multi-Screen Flow tab first.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Form Fields List & Rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {fields.length === 0 ? (
              <Card>
                <CardBody>
                  <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                    <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      No fields added to this intake form yet.
                    </p>
                    <Button variant="primary" onClick={openAddField}>
                      <Plus size={16} /> Add First Field
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ) : (
              fields.map((field, idx) => {
                let rules = {};
                try {
                  rules = typeof field.validation_rules_json === 'string'
                    ? JSON.parse(field.validation_rules_json || '{}')
                    : (field.validation_rules_json || {});
                } catch (e) {}

                return (
                  <Card key={field.id}>
                    <CardBody style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '600' }}>{field.label}</span>
                            <Badge variant="default">{field.input_type}</Badge>
                            {rules.required && <Badge variant="success">Required</Badge>}
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                              ({field.field_key})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {field.crm_field_mapping && (
                              <span>CRM Map: <strong>{field.crm_field_mapping}</strong></span>
                            )}
                            {rules.minLength && <span>MinLen: {rules.minLength}</span>}
                            {rules.maxLength && <span>MaxLen: {rules.maxLength}</span>}
                            {rules.min !== undefined && <span>Min: {rules.min}</span>}
                            {rules.max !== undefined && <span>Max: {rules.max}</span>}
                            {rules.date_min_today && <span>Min Date: Today</span>}
                            {rules.date_after_field && <span>After: {rules.date_after_field}</span>}
                            {rules.regex && <span>Regex: <code>{rules.regex}</code></span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={idx === 0}
                            onClick={() => handleMoveOrder(idx, -1)}
                          >
                            <MoveUp size={13} />
                          </Button>

                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={idx === fields.length - 1}
                            onClick={() => handleMoveOrder(idx, 1)}
                          >
                            <MoveDown size={13} />
                          </Button>

                          <Button variant="secondary" size="sm" onClick={() => openEditField(field)}>
                            <Edit size={13} />
                          </Button>

                          <Button variant="secondary" size="sm" onClick={() => handleDeleteField(field.id)} style={{ color: '#ef4444' }}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                );
              })
            )}
          </div>

          {/* Right Column: Live Form Preview & Real-Time Validator */}
          <Card>
            <CardHeader
              title="Live Form Validation Test"
              subtitle="Test real-time validation rules against your schema."
            />
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {fields.map(f => {
                  const error = testResult?.fieldErrors?.[f.field_key];
                  return (
                    <div key={f.id}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                        {f.label}
                      </label>
                      <input
                        type={f.input_type === 'NUMBER' ? 'number' : (f.input_type === 'DATE' ? 'date' : 'text')}
                        className="input-field"
                        value={testValues[f.field_key] || ''}
                        onChange={e => setTestValues({ ...testValues, [f.field_key]: e.target.value })}
                        placeholder={f.placeholder || f.label}
                        style={{
                          width: '100%',
                          borderColor: error ? '#ef4444' : undefined,
                          fontSize: '13px'
                        }}
                      />
                      {error && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#ef4444', marginTop: '3px' }}>
                          <AlertCircle size={12} /> {error}
                        </span>
                      )}
                    </div>
                  );
                })}

                <Button variant="primary" onClick={handleRunLiveTest} style={{ marginTop: '8px' }}>
                  <Play size={14} /> Test Form Submission
                </Button>

                {testResult && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px',
                    borderRadius: '8px',
                    backgroundColor: testResult.isValid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${testResult.isValid ? '#10b981' : '#ef4444'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '13px', color: testResult.isValid ? '#059669' : '#dc2626', marginBottom: '4px' }}>
                      {testResult.isValid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                      {testResult.isValid ? 'Validation Passed 100%' : 'Validation Failed'}
                    </div>

                    {testResult.isValid ? (
                      <pre style={{ margin: 0, fontSize: '11px', overflowX: 'auto', color: 'var(--text-secondary)' }}>
                        {JSON.stringify(testResult.normalizedValues, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#dc2626' }}>
                        {Object.values(testResult.fieldErrors).map((err, i) => (
                          <div key={i}>• {err}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Field Add / Edit Modal */}
      <Modal
        isOpen={fieldModalOpen}
        onClose={() => setFieldModalOpen(false)}
        title={editingField ? `Edit Field: ${editingField.label}` : 'Add Form Field'}
        subtitle="Configure input type, DB validation constraints, and CRM attribute binding."
        size="lg"
      >
        <form onSubmit={handleSaveField} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Field Identifier Key
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.field_key}
                onChange={e => setFormData({ ...formData, field_key: e.target.value })}
                required
                placeholder="e.g. check_in_date"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Field Label (Shown to Customer)
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.label}
                onChange={e => setFormData({ ...formData, label: e.target.value })}
                required
                placeholder="e.g. Check-in Date"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Input Type
              </label>
              <select
                className="input-field"
                value={formData.input_type}
                onChange={e => setFormData({ ...formData, input_type: e.target.value })}
                style={{ width: '100%' }}
              >
                {INPUT_TYPES.map(it => (
                  <option key={it.value} value={it.value}>{it.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Placeholder Text
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.placeholder}
                onChange={e => setFormData({ ...formData, placeholder: e.target.value })}
                placeholder="e.g. Select date..."
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {(formData.input_type === 'SELECT' || formData.input_type === 'RADIO' || formData.input_type === 'MULTISELECT') && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                Dropdown / Radio Options (Comma Separated)
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.options_raw}
                onChange={e => setFormData({ ...formData, options_raw: e.target.value })}
                placeholder="e.g. Deluxe Suite, Sea View Villa, President Penthouse"
                style={{ width: '100%' }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
              CRM Pipeline Attribute Mapping
            </label>
            <select
              className="input-field"
              value={formData.crm_field_mapping}
              onChange={e => setFormData({ ...formData, crm_field_mapping: e.target.value })}
              style={{ width: '100%' }}
            >
              {CRM_MAPPING_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Validation Rules Section */}
          <div style={{
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <h5 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
              Database Validation Rules
            </h5>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.rules.required}
                  onChange={e => setFormData({
                    ...formData,
                    rules: { ...formData.rules, required: e.target.checked }
                  })}
                />
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Required Field</span>
              </label>

              {formData.input_type === 'DATE' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.rules.date_min_today}
                    onChange={e => setFormData({
                      ...formData,
                      rules: { ...formData.rules, date_min_today: e.target.checked }
                    })}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '500' }}>Must be Today or Future</span>
                </label>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                  Min Length / Min Value
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.rules.minLength || formData.rules.min}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData,
                      rules: {
                        ...formData.rules,
                        minLength: formData.input_type === 'NUMBER' ? '' : val,
                        min: formData.input_type === 'NUMBER' ? val : ''
                      }
                    });
                  }}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                  Max Length / Max Value
                </label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.rules.maxLength || formData.rules.max}
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData,
                      rules: {
                        ...formData.rules,
                        maxLength: formData.input_type === 'NUMBER' ? '' : val,
                        max: formData.input_type === 'NUMBER' ? val : ''
                      }
                    });
                  }}
                  style={{ width: '100%' }}
                />
              </div>

              {formData.input_type === 'DATE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                    Date After Field (Cross-field check)
                  </label>
                  <select
                    className="input-field"
                    value={formData.rules.date_after_field}
                    onChange={e => setFormData({
                      ...formData,
                      rules: { ...formData.rules, date_after_field: e.target.value }
                    })}
                    style={{ width: '100%' }}
                  >
                    <option value="">None</option>
                    {fields.filter(f => f.input_type === 'DATE' && f.field_key !== formData.field_key).map(df => (
                      <option key={df.field_key} value={df.field_key}>After {df.label} ({df.field_key})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                  Custom Regex Pattern
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.rules.regex}
                  onChange={e => setFormData({
                    ...formData,
                    rules: { ...formData.rules, regex: e.target.value }
                  })}
                  placeholder="e.g. ^[1-9][0-9]{5}$"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                Custom Error Message (Overrides default system error)
              </label>
              <input
                type="text"
                className="input-field"
                value={formData.rules.errorMessage}
                onChange={e => setFormData({
                  ...formData,
                  rules: { ...formData.rules, errorMessage: e.target.value }
                })}
                placeholder="e.g. Please enter a valid 6-digit Indian PIN code"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="secondary" type="button" onClick={() => setFieldModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Saving...' : (editingField ? 'Update Field' : 'Add Field')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

