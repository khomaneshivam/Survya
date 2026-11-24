import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Building2, 
  Phone, 
  Sliders, 
  Sparkles, 
  Smartphone,
  Play
} from 'lucide-react';
import { Button } from '../../../components/ui/Primitives';
import { ConfigurationForm } from '../components/ConfigurationForm';
import { ResourceBindingPicker } from '../components/ResourceBindingPicker';
import { SimulationPanel } from '../components/SimulationPanel';
import { PublishChecklist } from '../components/PublishChecklist';
import { automationApi } from '../api/automationApi';

export function TemplateSetupPage({ template, onComplete, onCancel }) {
  const [step, setStep] = useState(1); // 1: Business Identity, 2: Connections, 3: Trigger & Naming, 4: Customization, 5: Test & Activate
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const displayTitle = template?.title || template?.name || 'Automation';

  // Flow naming & trigger
  const [flowName, setFlowName] = useState(`${displayTitle} (${new Date().toLocaleDateString('en-GB')})`);
  const [triggerKeyword, setTriggerKeyword] = useState(() => {
    if (template.industry === 'HOSPITALITY') return 'STAY';
    if (template.industry === 'B2B_SAAS' || template.industry === 'B2B') return 'DEMO';
    return 'HELLO';
  });

  // Config values & bindings
  const configSchema = useMemo(() => {
    const raw = template.configSchema || template.config_schema_json || template.currentVersion?.configSchema || {};
    return typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : raw;
  }, [template]);

  const requiredBindings = useMemo(() => {
    const raw = template.requiredBindings || template.required_bindings_json || template.currentVersion?.requiredBindings || [];
    return typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
  }, [template]);

  const [configValues, setConfigValues] = useState(() => {
    const defaults = {};
    const props = configSchema.properties || configSchema;
    Object.entries(props || {}).forEach(([k, prop]) => {
      if (prop && prop.default !== undefined) {
        defaults[k] = prop.default;
      }
    });
    return defaults;
  });

  const [bindingValues, setBindingValues] = useState({});
  const [simulationTested, setSimulationTested] = useState(false);

  // Group schema properties into Step 1 (Identity/Branding) vs Step 4 (Rules/Policies)
  const allSchemaKeys = useMemo(() => {
    const props = configSchema.properties || configSchema;
    return Object.keys(props).filter(k => !['type', 'required', 'properties', 'title', 'description'].includes(k) || props[k]?.type);
  }, [configSchema]);

  const step1Keys = useMemo(() => {
    const brandKeys = allSchemaKeys.filter(k => k.startsWith('business.') || k.includes('name') || k.includes('greeting') || k.includes('phone') || k.includes('email'));
    return brandKeys.length > 0 ? brandKeys : allSchemaKeys.slice(0, 3);
  }, [allSchemaKeys]);

  const step4Keys = useMemo(() => {
    const customKeys = allSchemaKeys.filter(k => !step1Keys.includes(k));
    return customKeys.length > 0 ? customKeys : allSchemaKeys;
  }, [allSchemaKeys, step1Keys]);

  const steps = [
    { number: 1, title: 'Business Profile', desc: 'Brand & contact info' },
    { number: 2, title: 'Connections', desc: 'WhatsApp & catalog' },
    { number: 3, title: 'Trigger & Naming', desc: 'Keyword routing' },
    { number: 4, title: 'Customization', desc: 'Tariffs & policies' },
    { number: 5, title: 'Test & Activate', desc: 'Sandbox & launch' }
  ];

  const handleNext = () => {
    setError(null);
    if (step < 5) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      const formattedBindings = Object.entries(bindingValues).map(([key, target_resource_id]) => ({
        key,
        target_resource_id: String(target_resource_id)
      }));

      const payload = {
        customFlowName: flowName,
        triggerKeyword: triggerKeyword.trim().toUpperCase(),
        configValues,
        bindings: formattedBindings,
        activateImmediately: true
      };

      const res = await automationApi.installTemplate(template.id || template.template_key, payload);
      if (res && res.success) {
        if (onComplete) onComplete(res.installation, res.flow);
      } else {
        setError(res?.error || 'Failed to complete automation setup');
      }
    } catch (err) {
      setError(err.message || 'Error activating automation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid #E5E5E8' }}>
        <div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#67676B',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              padding: 0
            }}
          >
            <ArrowLeft size={13} />
            <span>Cancel Setup</span>
          </button>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#171719', letterSpacing: '-0.015em', margin: 0 }}>
            Setting up: {displayTitle}
          </h2>
        </div>

        <div style={{
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#67676B',
          fontWeight: 600,
          background: '#EEEEF0',
          padding: '4px 10px',
          borderRadius: '6px'
        }}>
          Step {step} of 5
        </div>
      </div>

      {/* Step Stepper Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '8px',
        background: '#EEEEF0',
        padding: '6px',
        borderRadius: '12px',
        border: '1px solid #E5E5E8'
      }}>
        {steps.map((s) => {
          const isCurrent = step === s.number;
          const isPast = step > s.number;

          return (
            <button
              key={s.number}
              type="button"
              onClick={() => setStep(s.number)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                textAlign: 'left',
                background: isCurrent ? '#FFFFFF' : 'transparent',
                border: isCurrent ? '1px solid #E5E5E8' : '1px solid transparent',
                boxShadow: isCurrent ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                cursor: 'pointer',
                transition: 'all 120ms ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  background: isPast ? '#2F5219' : isCurrent ? '#171719' : '#96969C'
                }}>
                  {isPast ? '✓' : s.number}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#171719', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
              </div>
              <span style={{ fontSize: '10px', color: '#96969C', display: 'block', marginLeft: '28px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Step Body */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '24px'
      }}>
        {/* Left Form Area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E5E8',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            {step === 1 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-600" />
                  <span>1. Business Profile & Branding</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  These values are dynamically resolved into greetings, quotes, and acknowledgments during chat execution.
                </p>
                <ConfigurationForm
                  schema={configSchema}
                  values={configValues}
                  onChange={setConfigValues}
                  filterKeys={step1Keys}
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <Phone size={16} className="text-blue-600" />
                  <span>2. Connect Workspace Resources</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select your verified WhatsApp phone line and bind target catalogs, properties, or pipelines.
                </p>
                <ResourceBindingPicker
                  requiredBindings={requiredBindings}
                  values={bindingValues}
                  onChange={setBindingValues}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600" />
                    <span>3. Trigger Routing & Naming</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Assign a human-readable name for your dashboard and configure the trigger keyword that launches the flow.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Automation Name</label>
                  <input
                    type="text"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Trigger Keyword</label>
                  <input
                    type="text"
                    value={triggerKeyword}
                    onChange={(e) => setTriggerKeyword(e.target.value.toUpperCase())}
                    placeholder="e.g. BOOK, STAY, DEMO, HI"
                    className="w-full text-xs font-mono font-semibold px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                  />
                  <span className="text-[11px] text-slate-400">
                    When an incoming WhatsApp customer texts this keyword, this automation activates immediately.
                  </span>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <Sliders size={16} className="text-purple-600" />
                  <span>4. Fine-Tune Operational Rules & Customization</span>
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Review and customize operational hours, check-in policies, and threshold values exposed by this template.
                </p>
                <ConfigurationForm
                  schema={configSchema}
                  values={configValues}
                  onChange={setConfigValues}
                  filterKeys={step4Keys}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>5. Pre-flight Validation & Activation</span>
                  </h3>
                  <p className="text-xs text-slate-500 mb-2">
                    Review your setup checklist and test turns in the simulator before taking the flow live.
                  </p>
                </div>

                <PublishChecklist
                  config={configValues}
                  bindings={bindingValues}
                  requiredBindings={requiredBindings}
                  flowName={flowName}
                  simulationTested={simulationTested}
                  onFixStep={(stepNum) => setStep(stepNum)}
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {error}
              </div>
            )}

            {/* Step Navigation Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBack}
                disabled={step === 1 || loading}
                className="text-xs py-1.5"
              >
                <ArrowLeft size={13} className="mr-1" />
                <span>Previous Step</span>
              </Button>

              {step < 5 ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-1.5 font-semibold"
                >
                  <span>Continue</span>
                  <ArrowRight size={13} className="ml-1" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  loading={loading}
                  onClick={handleActivate}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-1.5 font-semibold"
                >
                  <Play size={13} className="mr-1" />
                  <span>Activate Live Automation</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Sandbox Chat Simulator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E5E5E8',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', marginBottom: '14px', borderBottom: '1px solid #F0F0F2' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#171719', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={14} color="#2F5219" />
                <span>Live WhatsApp Simulation</span>
              </span>
              <span style={{ fontSize: '10px', background: '#F5F5F6', border: '1px solid #E5E5E8', color: '#67676B', fontFamily: 'monospace', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                100% Mock Sandbox
              </span>
            </div>
            <SimulationPanel
              template={template}
              configValues={configValues}
              onTestInteraction={() => setSimulationTested(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
