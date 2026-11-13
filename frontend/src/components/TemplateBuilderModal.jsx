import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Image as ImageIcon,
  Lock,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Video
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Modal } from './ui';
import PhoneMockup from './PhoneMockup';

const LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en', label: 'English (Global)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'mr', label: 'Marathi (मराठी)' }
];

const HEADER_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'TEXT', label: 'Text' },
  { value: 'IMAGE', label: 'Image' },
  { value: 'VIDEO', label: 'Video' },
  { value: 'DOCUMENT', label: 'Document' }
];

export default function TemplateBuilderModal({
  open,
  onClose,
  template = null,
  onSaved
}) {
  const { token } = useAuth();
  const isEditing = Boolean(template?.id);
  const currentStatus = String(template?.status || 'DRAFT').toUpperCase();
  const isLocked = isEditing && (currentStatus === 'APPROVED' || currentStatus === 'PENDING' || currentStatus === 'IN_REVIEW');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('en_US');
  const [headerType, setHeaderType] = useState('NONE');
  const [headerText, setHeaderText] = useState('');
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [samples, setSamples] = useState({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setStatusMessage('');

    if (template) {
      setName(template.name || '');
      setCategory(String(template.category || 'MARKETING').toUpperCase());
      setLanguage(template.language || 'en_US');

      const hComp = Array.isArray(template.components)
        ? template.components.find((c) => String(c.type || '').toUpperCase() === 'HEADER')
        : null;
      const fComp = Array.isArray(template.components)
        ? template.components.find((c) => String(c.type || '').toUpperCase() === 'FOOTER')
        : null;

      setHeaderType(String(template.headerType || hComp?.format || 'NONE').toUpperCase());
      setHeaderText(template.headerText || hComp?.text || '');
      setHeaderMediaUrl(template.headerMediaUrl || hComp?.example?.header_handle?.[0] || '');
      setBodyText(template.bodyText || '');
      setFooterText(template.footerText || fComp?.text || '');

      const parsedBtns = Array.isArray(template.buttons) ? template.buttons : [];
      setButtons(parsedBtns.map((b) => ({
        type: String(b.type || 'QUICK_REPLY').toUpperCase(),
        text: b.text || '',
        url: b.url || '',
        phone_number: b.phone_number || ''
      })));

      const sampleMap = {};
      if (Array.isArray(template.variables)) {
        template.variables.forEach((v) => {
          sampleMap[v.key || String(v.index)] = v.example || '';
        });
      }
      setSamples(sampleMap);
    } else {
      setName('');
      setCategory('MARKETING');
      setLanguage('en_US');
      setHeaderType('NONE');
      setHeaderText('');
      setHeaderMediaUrl('');
      setBodyText('Hi {{1}},\n\nYour booking confirmation for {{2}} is ready.\n\nReply if you need assistance.');
      setFooterText('Sent via SARVYA Connect');
      setButtons([{ type: 'QUICK_REPLY', text: 'Confirm Visit', url: '', phone_number: '' }]);
      setSamples({ '1': 'Aarav', '2': 'KonkanTrip Beach Resort' });
    }
  }, [open, template]);

  const detectedVars = useMemo(() => {
    const matches = [...String(bodyText || '').matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)];
    return [...new Set(matches.map((m) => m[1]))];
  }, [bodyText]);

  const insertNextVariable = () => {
    if (isLocked) return;
    const numericIndices = detectedVars.filter((k) => /^\d+$/.test(k)).map((k) => parseInt(k, 10));
    const nextIdx = numericIndices.length > 0 ? Math.max(...numericIndices) + 1 : detectedVars.length + 1;
    setBodyText((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}{{${nextIdx}}}`);
  };

  const addButton = () => {
    if (isLocked || buttons.length >= 3) return;
    setButtons((prev) => [...prev, { type: 'QUICK_REPLY', text: '', url: '', phone_number: '' }]);
  };

  const updateButton = (idx, field, value) => {
    if (isLocked) return;
    setButtons((prev) => prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b)));
  };

  const removeButton = (idx) => {
    if (isLocked) return;
    setButtons((prev) => prev.filter((_, i) => i !== idx));
  };

  // Build live PhoneMockup template object
  const previewTemplate = useMemo(() => {
    const comps = [];
    if (headerType === 'TEXT' && headerText) {
      comps.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      comps.push({ type: 'HEADER', format: headerType });
    }

    let rendered = bodyText || '';
    detectedVars.forEach((key) => {
      const val = samples[key] || `[${key}]`;
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });
    comps.push({ type: 'BODY', text: rendered });

    if (footerText) {
      comps.push({ type: 'FOOTER', text: footerText });
    }
    if (buttons.length > 0) {
      comps.push({ type: 'BUTTONS', buttons });
    }

    return {
      name: name || 'custom_template_draft',
      category,
      language,
      status: currentStatus,
      bodyText: rendered,
      components: comps,
      buttons
    };
  }, [name, category, language, currentStatus, headerType, headerText, bodyText, footerText, buttons, detectedVars, samples]);

  const validateClient = () => {
    const clean = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(clean)) {
      return 'Template name must contain only lowercase letters, numbers, and underscores (e.g. seasonal_stay_offer).';
    }
    if (!String(bodyText || '').trim()) {
      return 'Template body message is required.';
    }
    for (const b of buttons) {
      if (!String(b.text || '').trim()) return 'All template buttons must have a label.';
      if (b.type === 'URL' && !/^https?:\/\//i.test(String(b.url || ''))) {
        return `URL button "${b.text}" must start with https:// or http://.`;
      }
      if (b.type === 'PHONE_NUMBER' && !String(b.phone_number || '').trim()) {
        return `Phone button "${b.text}" requires a phone number.`;
      }
    }
    return '';
  };

  const handleSaveDraft = async (e) => {
    if (e) e.preventDefault();
    if (isLocked) return;

    const clientErr = validateClient();
    if (clientErr) {
      setError(clientErr);
      return null;
    }

    setSaving(true);
    setError('');
    setStatusMessage('');
    try {
      const payload = {
        name: String(name).trim().toLowerCase(),
        category,
        language,
        headerType,
        headerText,
        headerMediaUrl,
        bodyText,
        footerText,
        buttons,
        samples
      };

      const endpoint = isEditing ? `/api/v1/whatsapp/templates/${template.id}` : '/api/v1/whatsapp/templates';
      const resp = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.message || 'Failed to save template draft.');
      }

      const saved = json.template || json.data;
      setStatusMessage(`Draft "${saved?.name || name}" saved.`);
      if (onSaved) onSaved(saved);
      return saved;
    } catch (err) {
      setError(err.message || 'Failed to save template draft.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToMeta = async () => {
    if (isLocked) return;
    const missing = detectedVars.filter((k) => !samples[k] || !String(samples[k]).trim());
    if (missing.length > 0) {
      setError(`Provide sample values for all variables before submitting to Meta: ${missing.map((k) => `{{${k}}}`).join(', ')}`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      let targetId = template?.id;
      const saved = await handleSaveDraft();
      if (!saved && !targetId) {
        setSubmitting(false);
        return;
      }
      if (saved?.id) targetId = saved.id;

      const resp = await fetch(`/api/v1/whatsapp/templates/${targetId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({})
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.message || 'Meta submission failed.');
      }
      const submitted = json.template || json.data;
      setStatusMessage(json.message || 'Submitted to Meta for approval.');
      if (onSaved) onSaved(submitted);
      onClose();
    } catch (err) {
      setError(err.message || 'Meta submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloneAsDraft = async () => {
    if (!template?.id) return;
    setCloning(true);
    setError('');
    try {
      const resp = await fetch(`/api/v1/whatsapp/templates/${template.id}/clone`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.message || 'Failed to clone template.');
      }
      const cloned = json.template || json.data;
      if (onSaved) onSaved(cloned);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to clone template.');
    } finally {
      setCloning(false);
    }
  };

  const statusTone = currentStatus === 'APPROVED'
    ? 'green'
    : currentStatus === 'PENDING' || currentStatus === 'IN_REVIEW'
      ? 'blue'
      : currentStatus === 'REJECTED' || currentStatus === 'PAUSED'
        ? 'coral'
        : 'neutral';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? `Template: ${template.name}` : 'Create Custom WhatsApp Template'}
      subtitle="Build and submit Meta Cloud API templates directly inside SARVYA Connect"
      size="lg"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Structured Form Editor */}
        <form className="lg:col-span-7 space-y-4" onSubmit={handleSaveDraft} noValidate>
          {/* State Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-muted)] px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Badge tone={statusTone}>{currentStatus}</Badge>
              {isLocked ? (
                <span className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)]">
                  <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  Read-only ({currentStatus} on Meta)
                </span>
              ) : (
                <span>Editable draft — saves locally before Meta review</span>
              )}
            </div>
            {isEditing && isLocked && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={Copy}
                onClick={handleCloneAsDraft}
                loading={cloning}
              >
                Clone to Edit
              </Button>
            )}
          </div>

          {currentStatus === 'REJECTED' && template?.rejectionReason && (
            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[#E59290] bg-[#FEEAE9] p-3 text-xs text-[#6B1F1E]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Rejected by Meta</p>
                <p className="mt-0.5">{template.rejectionReason}</p>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-[var(--radius-md)] border border-[#E59290] bg-[#FEEAE9] px-3 py-2 text-xs text-[#6B1F1E]">
              {error}
            </div>
          )}

          {statusMessage && (
            <div role="status" className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[#EDF3E4] px-3 py-2 text-xs text-[#2B3D1A]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {statusMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="tpl-name" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                Template Name <span aria-hidden="true">*</span>
              </label>
              <p id="tpl-name-hint" className="text-[11px] text-[var(--text-muted)] mb-1.5">
                Lowercase letters, numbers, and underscores only.
              </p>
              <input
                id="tpl-name"
                name="name"
                type="text"
                className="sarvya-input"
                value={name}
                disabled={isLocked}
                required
                pattern="[a-z0-9_]+"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="tpl-name-hint"
                placeholder="monsoon_escape_offer"
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="tpl-category" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                  Category
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-1.5">Meta billing tier</p>
                <select
                  id="tpl-category"
                  name="category"
                  className="sarvya-input"
                  value={category}
                  disabled={isLocked}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label htmlFor="tpl-language" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                  Language
                </label>
                <p className="text-[11px] text-[var(--text-muted)] mb-1.5">Locale pack</p>
                <select
                  id="tpl-language"
                  name="language"
                  className="sarvya-input"
                  value={language}
                  disabled={isLocked}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Header Fieldset */}
          <fieldset className="rounded-[var(--radius-md)] border border-[var(--border-default)] p-3 space-y-2.5">
            <legend className="px-1.5 text-xs font-semibold text-[var(--text-primary)]">Header (Optional)</legend>
            <div className="flex flex-wrap gap-2">
              {HEADER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isLocked}
                  onClick={() => setHeaderType(opt.value)}
                  className={`px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-medium border transition-colors ${
                    headerType === opt.value
                      ? 'bg-[var(--brand-primary-tint)] border-[var(--brand-primary)] text-[var(--brand-primary-dark)]'
                      : 'bg-white border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {headerType === 'TEXT' && (
              <div>
                <label htmlFor="tpl-header-text" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Header Text (max 60 chars)
                </label>
                <input
                  id="tpl-header-text"
                  type="text"
                  maxLength={60}
                  disabled={isLocked}
                  className="sarvya-input"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Special Resort Confirmation"
                />
              </div>
            )}

            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && (
              <div>
                <label htmlFor="tpl-header-media" className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Sample {headerType.toLowerCase()} URL (used for preview & campaigns)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)]">
                    {headerType === 'IMAGE' ? <ImageIcon className="h-4 w-4" /> : headerType === 'VIDEO' ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <input
                    id="tpl-header-media"
                    type="url"
                    disabled={isLocked}
                    className="sarvya-input"
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder="https://example.com/resort-banner.jpg"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* Body Text + Dynamic Variable Samples */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="tpl-body" className="text-xs font-medium text-[var(--text-primary)]">
                Message Body <span aria-hidden="true">*</span>
              </label>
              {!isLocked && (
                <button
                  type="button"
                  onClick={insertNextVariable}
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-white px-2 py-1 text-[11px] font-medium text-[var(--brand-primary)] hover:bg-[var(--bg-hover)]"
                >
                  <Sparkles className="h-3 w-3" />
                  + Add Variable
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Supports *bold*, _italic_, and placeholders like {'{{1}}'} or {'{{name}}'} (max 1024 characters).
            </p>
            <textarea
              id="tpl-body"
              rows={5}
              maxLength={1024}
              required
              disabled={isLocked}
              className="sarvya-input min-h-[120px]"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Hi {{1}}, your stay at {{2}} is confirmed for {{3}}."
            />

            {detectedVars.length > 0 && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-muted)] p-3 space-y-2">
                <p className="text-xs font-medium text-[var(--text-primary)]">
                  Variable Sample Values (required for Meta review)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detectedVars.map((vKey) => (
                    <div key={vKey} className="flex items-center gap-2">
                      <span className="shrink-0 rounded bg-white border border-[var(--border-default)] px-2 py-1 text-xs font-mono text-[var(--text-secondary)]">
                        {`{{${vKey}}}`}
                      </span>
                      <input
                        type="text"
                        disabled={isLocked}
                        className="sarvya-input py-1.5 text-xs"
                        aria-label={`Sample value for variable ${vKey}`}
                        value={samples[vKey] || ''}
                        onChange={(e) => setSamples((prev) => ({ ...prev, [vKey]: e.target.value }))}
                        placeholder={`Sample for ${vKey}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div>
            <label htmlFor="tpl-footer" className="block text-xs font-medium text-[var(--text-primary)] mb-1">
              Footer (Optional, max 60 chars)
            </label>
            <input
              id="tpl-footer"
              type="text"
              maxLength={60}
              disabled={isLocked}
              className="sarvya-input"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Reply STOP to opt out"
            />
          </div>

          {/* Interactive Buttons */}
          <fieldset className="rounded-[var(--radius-md)] border border-[var(--border-default)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <legend className="px-1.5 text-xs font-semibold text-[var(--text-primary)]">
                Interactive Buttons ({buttons.length}/3)
              </legend>
              {!isLocked && buttons.length < 3 && (
                <button
                  type="button"
                  onClick={addButton}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add button
                </button>
              )}
            </div>

            {buttons.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">No interactive buttons attached.</p>
            )}

            {buttons.map((btn, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-muted)] p-2">
                <select
                  className="sarvya-input sm:col-span-4 py-1.5 text-xs"
                  disabled={isLocked}
                  aria-label={`Button ${idx + 1} type`}
                  value={btn.type}
                  onChange={(e) => updateButton(idx, 'type', e.target.value)}
                >
                  <option value="QUICK_REPLY">Quick Reply</option>
                  <option value="URL">Visit Website</option>
                  <option value="PHONE_NUMBER">Call Phone</option>
                </select>
                <input
                  type="text"
                  maxLength={25}
                  disabled={isLocked}
                  className="sarvya-input sm:col-span-4 py-1.5 text-xs"
                  placeholder="Button label"
                  aria-label={`Button ${idx + 1} label`}
                  value={btn.text}
                  onChange={(e) => updateButton(idx, 'text', e.target.value)}
                />
                {btn.type === 'URL' && (
                  <input
                    type="url"
                    disabled={isLocked}
                    className="sarvya-input sm:col-span-3 py-1.5 text-xs"
                    placeholder="https://..."
                    aria-label={`Button ${idx + 1} URL`}
                    value={btn.url || ''}
                    onChange={(e) => updateButton(idx, 'url', e.target.value)}
                  />
                )}
                {btn.type === 'PHONE_NUMBER' && (
                  <input
                    type="tel"
                    disabled={isLocked}
                    className="sarvya-input sm:col-span-3 py-1.5 text-xs"
                    placeholder="+919307382030"
                    aria-label={`Button ${idx + 1} phone`}
                    value={btn.phone_number || ''}
                    onChange={(e) => updateButton(idx, 'phone_number', e.target.value)}
                  />
                )}
                {btn.type === 'QUICK_REPLY' && (
                  <span className="sm:col-span-3 text-[11px] text-[var(--text-muted)] px-1">Instant tap reply</span>
                )}
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => removeButton(idx)}
                    aria-label={`Remove button ${idx + 1}`}
                    className="sm:col-span-1 inline-flex items-center justify-center p-1.5 text-[var(--text-muted)] hover:text-[#6B1F1E]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </fieldset>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-default)]">
            <Button type="button" variant="secondary" onClick={onClose}>
              {isLocked ? 'Close' : 'Cancel'}
            </Button>
            {!isLocked && (
              <>
                <Button type="submit" variant="secondary" loading={saving}>
                  Save Draft
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  icon={Send}
                  loading={submitting}
                  onClick={handleSubmitToMeta}
                >
                  Submit to Meta
                </Button>
              </>
            )}
          </div>
        </form>

        {/* Right: Live WhatsApp Handset Preview */}
        <div className="lg:col-span-5 flex flex-col items-center rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-muted)] p-4">
          <div className="w-full flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[var(--text-primary)]">Live WhatsApp Preview</span>
            <Badge tone="neutral">{category}</Badge>
          </div>
          <PhoneMockup
            template={previewTemplate}
            sampleData={samples}
            mediaUrl={headerMediaUrl}
          />
        </div>
      </div>
    </Modal>
  );
}
