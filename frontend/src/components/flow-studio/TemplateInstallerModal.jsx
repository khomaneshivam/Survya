import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ShieldCheck,
  Building2,
  PhoneCall,
  Hotel,
  Calendar,
  Layers,
  ChevronRight,
  Play,
  RotateCcw
} from 'lucide-react';

export default function TemplateInstallerModal({
  isOpen,
  onClose,
  template,
  token,
  onInstalled
}) {
  const [step, setStep] = useState(1); // 1: Config, 2: Bindings, 3: Review & Activate
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [templateDetails, setTemplateDetails] = useState(null);
  const [configValues, setConfigValues] = useState({});
  const [bindings, setBindings] = useState({});
  const [customFlowName, setCustomFlowName] = useState('');
  const [installing, setInstalling] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Fetch full template details including configSchema and tenant resources
  useEffect(() => {
    if (!isOpen || !template) return;
    const fetchDetails = async () => {
      setLoadingDetails(true);
      setErrorMsg(null);
      try {
        const id = template.id || template.template_key || template.slug;
        const res = await fetch(`/api/v1/template-library/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.success) {
          setTemplateDetails(data);
          // Initialize default config values from schema
          const schema = data.currentVersion?.configSchema || {};
          const defaults = {};
          Object.entries(schema).forEach(([k, def]) => {
            if (def.default !== undefined) {
              defaults[k] = def.default;
            } else if (def.type === 'phone') {
              defaults[k] = '919422359446';
            } else if (def.type === 'string') {
              defaults[k] = '';
            }
          });
          setConfigValues(defaults);
          setCustomFlowName(`${data.template?.title || template.title} (Live)`);

          // Initialize bindings with tenant first available resources
          const resources = data.tenantResources || {};
          const initialBindings = {};
          (data.currentVersion?.requiredBindings || []).forEach(req => {
            if (req.type === 'WHATSAPP_LINE' && resources.whatsappLines?.length > 0) {
              initialBindings[req.key] = {
                logical_key: req.key,
                resource_type: req.type,
                target_resource_id: resources.whatsappLines[0].phone_number_id,
                target_resource_name: resources.whatsappLines[0].display_name || resources.whatsappLines[0].phone_number
              };
            } else if (req.type === 'PROPERTY' && resources.properties?.length > 0) {
              initialBindings[req.key] = {
                logical_key: req.key,
                resource_type: req.type,
                target_resource_id: String(resources.properties[0].id),
                target_resource_name: resources.properties[0].name
              };
            } else if (req.type === 'CRM_PIPELINE' && resources.crmPipelines?.length > 0) {
              initialBindings[req.key] = {
                logical_key: req.key,
                resource_type: req.type,
                target_resource_id: String(resources.crmPipelines[0].id || resources.crmPipelines[0].slug),
                target_resource_name: resources.crmPipelines[0].name
              };
            } else if (req.type === 'CATALOG_CATEGORY' && resources.catalogCategories?.length > 0) {
              initialBindings[req.key] = {
                logical_key: req.key,
                resource_type: req.type,
                target_resource_id: String(resources.catalogCategories[0].id),
                target_resource_name: resources.catalogCategories[0].name
              };
            }
          });
          setBindings(initialBindings);
        } else {
          setErrorMsg(data.error || 'Failed to load template details');
        }
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [isOpen, template, token]);

  if (!isOpen || !template) return null;

  const currentVersion = templateDetails?.currentVersion;
  const configSchema = currentVersion?.configSchema || {};
  const requiredBindings = currentVersion?.requiredBindings || [];
  const tenantResources = templateDetails?.tenantResources || {};

  const handleConfigChange = (key, value) => {
    setConfigValues(prev => ({ ...prev, [key]: value }));
  };

  const handleBindingChange = (key, type, targetId, targetName) => {
    setBindings(prev => ({
      ...prev,
      [key]: {
        logical_key: key,
        resource_type: type,
        target_resource_id: String(targetId),
        target_resource_name: targetName
      }
    }));
  };

  // Compute live rendered preview text for the WhatsApp message card
  const renderedBusinessName = configValues['business.name'] || 'Your Business';
  const renderedGreeting = configValues['greeting'] || 'Welcome to our service! How may we assist you today?';
  const renderedPhone = configValues['business.phone'] || '91 94223 59446';
  const renderedPrice = '₹3,500';

  const handleInstallAndActivate = async () => {
    setInstalling(true);
    setErrorMsg(null);
    try {
      const templateId = template.id || template.template_key;
      const res = await fetch(`/api/v1/template-library/${templateId}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          customFlowName,
          configValues,
          bindings: Object.values(bindings),
          activateImmediately: true
        })
      });

      const data = await res.json();
      if (data.success) {
        onInstalled?.(data);
        onClose();
      } else {
        setErrorMsg(data.error || 'Installation failed');
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '960px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Top Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #E5E5E8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FAFAFB'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#E8F5E9',
              color: '#2F5219',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Hotel size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#1C1C1E' }}>
                  {template.title || 'Universal Flow Template'}
                </h2>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: '#EDF4E6',
                  color: '#2F5219'
                }}>
                  v{template.current_version || '1.0.0'}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#666', margin: '2px 0 0 0' }}>
                Universal Client Configuration & 1-Click Multi-Tenant Deployment
              </p>
            </div>
          </div>

          {/* Stepper Dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: step >= 1 ? '#2F5219' : '#E5E5E8',
                color: step >= 1 ? '#FFF' : '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>1</div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: step === 1 ? '#2F5219' : '#888' }}>
                Configuration
              </span>
            </div>
            <ChevronRight size={14} color="#BBB" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: step >= 2 ? '#2F5219' : '#E5E5E8',
                color: step >= 2 ? '#FFF' : '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>2</div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: step === 2 ? '#2F5219' : '#888' }}>
                Resource Bindings
              </span>
            </div>
            <ChevronRight size={14} color="#BBB" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: step >= 3 ? '#2F5219' : '#E5E5E8',
                color: step >= 3 ? '#FFF' : '#888',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 700
              }}>3</div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: step === 3 ? '#2F5219' : '#888' }}>
                Activate
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8E8E93',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {errorMsg && (
            <div style={{
              background: '#FEE2E2',
              border: '1px solid #FCA5A5',
              color: '#991B1B',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {loadingDetails ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#666' }}>
              <RotateCcw size={28} className="spin" style={{ margin: '0 auto 12px auto' }} />
              <div>Loading template configuration schema & tenant assets...</div>
            </div>
          ) : (
            <>
              {/* STEP 1: BUSINESS CONFIGURATION + LIVE WHATSAPP PREVIEW */}
              {step === 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '28px' }}>
                  {/* Left Form */}
                  <div>
                    <div style={{ marginBottom: '16px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0', color: '#1C1C1E' }}>
                        Step 1: Set Your Business Details
                      </h3>
                      <p style={{ fontSize: '0.8rem', color: '#666', margin: 0 }}>
                        Configure the dynamic placeholders. These values are stored independently in your workspace.
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          Flow Title in Your Workspace
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={customFlowName}
                          onChange={e => setCustomFlowName(e.target.value)}
                          placeholder="e.g. Resort Booking Concierge"
                        />
                      </div>

                      {Object.entries(configSchema).map(([key, def]) => (
                        <div key={key}>
                          <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{def.label || key}</span>
                            {def.required ? (
                              <span style={{ fontSize: '0.7rem', color: '#DC2626' }}>Required</span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: '#888' }}>Optional</span>
                            )}
                          </label>

                          {def.type === 'text' ? (
                            <textarea
                              className="form-input"
                              rows={3}
                              value={configValues[key] ?? ''}
                              onChange={e => handleConfigChange(key, e.target.value)}
                              placeholder={`Enter ${def.label}...`}
                              style={{ resize: 'vertical' }}
                            />
                          ) : (
                            <input
                              type={def.type === 'phone' ? 'tel' : def.type === 'number' ? 'number' : 'text'}
                              className="form-input"
                              value={configValues[key] ?? ''}
                              onChange={e => handleConfigChange(key, e.target.value)}
                              placeholder={`Enter ${def.label}...`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right Live WhatsApp Preview Card */}
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <Smartphone size={16} color="#2F5219" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1C1C1E' }}>
                        Live WhatsApp Chat Preview
                      </span>
                    </div>

                    {/* Smartphone Mockup */}
                    <div style={{
                      background: '#ECE5DD',
                      backgroundImage: 'radial-gradient(#D4C5B9 1px, transparent 1px)',
                      backgroundSize: '14px 14px',
                      borderRadius: '16px',
                      border: '4px solid #1C1C1E',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      height: '420px'
                    }}>
                      {/* Phone Top Bar */}
                      <div style={{
                        background: '#075E54',
                        color: '#FFFFFF',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: '#25D366',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFF',
                          fontWeight: 700,
                          fontSize: '0.85rem'
                        }}>
                          {renderedBusinessName.charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, truncate: 'true' }}>
                            {renderedBusinessName}
                          </div>
                          <div style={{ fontSize: '0.68rem', opacity: 0.85 }}>
                            Online • Survya Automated Concierge
                          </div>
                        </div>
                      </div>

                      {/* Chat Bubbles */}
                      <div style={{
                        flex: 1,
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        overflowY: 'auto'
                      }}>
                        {/* Outbound Guest Trigger */}
                        <div style={{
                          alignSelf: 'flex-end',
                          background: '#D9FDD3',
                          padding: '8px 12px',
                          borderRadius: '10px 10px 2px 10px',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                          fontSize: '0.8rem',
                          color: '#111B21'
                        }}>
                          Hi! What are your current tariffs?
                        </div>

                        {/* Bot Response Bubble with Dynamic Variables Interpolated Live */}
                        <div style={{
                          alignSelf: 'flex-start',
                          background: '#FFFFFF',
                          padding: '10px 12px',
                          borderRadius: '10px 10px 10px 2px',
                          boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                          fontSize: '0.82rem',
                          lineHeight: '1.4',
                          color: '#111B21',
                          whiteSpace: 'pre-wrap',
                          maxWidth: '92%'
                        }}>
                          {`🌿 *Welcome to ${renderedBusinessName}!*

${renderedGreeting}
Our starting rate is ${renderedPrice}.
For direct booking assistance, call ${renderedPhone}.`}

                          {/* Quick Interactive Button Stubs */}
                          <div style={{
                            marginTop: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{
                              padding: '6px 10px',
                              background: '#F0F2F5',
                              border: '1px solid #E2E8F0',
                              borderRadius: '6px',
                              textAlign: 'center',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: '#00A884'
                            }}>
                              Reserve a Stay 🛏️
                            </div>
                            <div style={{
                              padding: '6px 10px',
                              background: '#F0F2F5',
                              border: '1px solid #E2E8F0',
                              borderRadius: '6px',
                              textAlign: 'center',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: '#00A884'
                            }}>
                              View Room Types 🏡
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Phone Bottom bar */}
                      <div style={{
                        background: '#F0F2F5',
                        padding: '8px 12px',
                        fontSize: '0.72rem',
                        color: '#667781',
                        textAlign: 'center',
                        borderTop: '1px solid #E0E0E0'
                      }}>
                        ⚡ Live Dynamic Preview: Changes reflect as you type
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: RESOURCE BINDINGS */}
              {step === 2 && (
                <div style={{ maxWidth: '680px', margin: '0 auto' }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0', color: '#1C1C1E' }}>
                      Step 2: Bind to Your Workspace Resources
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: '#666', margin: 0 }}>
                      Connect the template logic to your WhatsApp sender line, catalog categories, and CRM pipeline.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {requiredBindings.map(req => {
                      const cur = bindings[req.key]?.target_resource_id || '';
                      return (
                        <div
                          key={req.key}
                          style={{
                            background: '#F9F9FB',
                            border: '1px solid #E5E5E8',
                            borderRadius: '10px',
                            padding: '16px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {req.type === 'WHATSAPP_LINE' ? <PhoneCall size={16} color="#2F5219" /> : <Layers size={16} color="#2F5219" />}
                              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1C1C1E' }}>
                                {req.label || req.key}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', background: '#E2E8F0', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                              {req.type}
                            </span>
                          </div>

                          {req.type === 'WHATSAPP_LINE' && (
                            <select
                              className="form-input"
                              value={cur}
                              onChange={e => {
                                const selected = tenantResources.whatsappLines?.find(l => l.phone_number_id === e.target.value);
                                handleBindingChange(req.key, req.type, e.target.value, selected?.display_name || selected?.phone_number);
                              }}
                            >
                              {tenantResources.whatsappLines?.length > 0 ? (
                                tenantResources.whatsappLines.map(l => (
                                  <option key={l.phone_number_id} value={l.phone_number_id}>
                                    {l.display_name || l.phone_number} ({l.phone_number})
                                  </option>
                                ))
                              ) : (
                                <option value="default_phone_1">Default Verified WhatsApp Line (+91 93073 82030)</option>
                              )}
                            </select>
                          )}

                          {req.type === 'PROPERTY' && (
                            <select
                              className="form-input"
                              value={cur}
                              onChange={e => {
                                const selected = tenantResources.properties?.find(p => String(p.id) === e.target.value);
                                handleBindingChange(req.key, req.type, e.target.value, selected?.name);
                              }}
                            >
                              {tenantResources.properties?.length > 0 ? (
                                tenantResources.properties.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.city || 'Primary'})
                                  </option>
                                ))
                              ) : (
                                <option value="1">Primary Property (Konkan Beach Resort)</option>
                              )}
                            </select>
                          )}

                          {req.type === 'CRM_PIPELINE' && (
                            <select
                              className="form-input"
                              value={cur}
                              onChange={e => {
                                const selected = tenantResources.crmPipelines?.find(p => String(p.id || p.slug) === e.target.value);
                                handleBindingChange(req.key, req.type, e.target.value, selected?.name);
                              }}
                            >
                              {tenantResources.crmPipelines?.length > 0 ? (
                                tenantResources.crmPipelines.map(p => (
                                  <option key={p.id || p.slug} value={p.id || p.slug}>
                                    {p.name} ({p.industry_type})
                                  </option>
                                ))
                              ) : (
                                <option value="b2b-sales-pipeline">B2B Sales Pipeline (Default)</option>
                              )}
                            </select>
                          )}

                          {req.type === 'CATALOG_CATEGORY' && (
                            <select
                              className="form-input"
                              value={cur}
                              onChange={e => {
                                const selected = tenantResources.catalogCategories?.find(c => String(c.id) === e.target.value);
                                handleBindingChange(req.key, req.type, e.target.value, selected?.name);
                              }}
                            >
                              {tenantResources.catalogCategories?.length > 0 ? (
                                tenantResources.catalogCategories.map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))
                              ) : (
                                <option value="1">All Active Catalog Categories</option>
                              )}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: REVIEW & 1-CLICK ACTIVATE */}
              {step === 3 && (
                <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: '#EDF4E6',
                    color: '#2F5219',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto'
                  }}>
                    <ShieldCheck size={32} />
                  </div>

                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px 0', color: '#1C1C1E' }}>
                    Ready to Validate & Activate
                  </h3>
                  <p style={{ fontSize: '0.86rem', color: '#555', margin: '0 0 24px 0', lineHeight: 1.5 }}>
                    Survya will atomically provision an isolated conversation flow under your workspace, attach your business configuration, and activate inbound keyword triggers.
                  </p>

                  <div style={{
                    background: '#F9F9FB',
                    border: '1px solid #E5E5E8',
                    borderRadius: '12px',
                    padding: '18px',
                    textAlign: 'left',
                    marginBottom: '24px'
                  }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '12px', color: '#1C1C1E' }}>
                      Installation Summary:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8rem' }}>
                      <div>
                        <span style={{ color: '#888' }}>Flow Name:</span>
                        <div style={{ fontWeight: 600, color: '#1C1C1E' }}>{customFlowName}</div>
                      </div>
                      <div>
                        <span style={{ color: '#888' }}>Template Key:</span>
                        <div style={{ fontWeight: 600, color: '#1C1C1E' }}>{template.template_key} (v1.0.0)</div>
                      </div>
                      <div>
                        <span style={{ color: '#888' }}>Business Identity:</span>
                        <div style={{ fontWeight: 600, color: '#1C1C1E' }}>{renderedBusinessName}</div>
                      </div>
                      <div>
                        <span style={{ color: '#888' }}>Assigned WhatsApp Line:</span>
                        <div style={{ fontWeight: 600, color: '#1C1C1E' }}>
                          {bindings['sender_line']?.target_resource_name || 'Default Verified Line'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '0.78rem',
                    color: '#1E40AF',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'center',
                    marginBottom: '24px'
                  }}>
                    <CheckCircle2 size={16} />
                    <span>In-memory sandbox verified: No live outbound Meta WhatsApp API calls will be made.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Footer Navigation */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E5E5E8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#FAFAFB'
        }}>
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(s => s - 1)}
                className="btn btn-outline"
                style={{ padding: '8px 16px', gap: '6px' }}
                disabled={installing}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline"
              style={{ padding: '8px 16px' }}
              disabled={installing}
            >
              Cancel
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(s => s + 1)}
                className="btn btn-primary"
                style={{
                  padding: '8px 20px',
                  background: '#2F5219',
                  borderColor: '#2F5219',
                  fontWeight: 600,
                  gap: '6px'
                }}
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleInstallAndActivate}
                disabled={installing}
                className="btn btn-primary"
                style={{
                  padding: '8px 24px',
                  background: '#2F5219',
                  borderColor: '#2F5219',
                  fontWeight: 600,
                  gap: '8px'
                }}
              >
                {installing ? <RotateCcw size={16} className="spin" /> : <Play size={16} />}
                <span>{installing ? 'Validating & Publishing...' : 'Validate & Activate Flow'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

