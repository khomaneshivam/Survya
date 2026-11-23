import React, { useState } from 'react';
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

  // Flow naming & trigger
  const [flowName, setFlowName] = useState(`${template.name} (My Workspace)`);
  const [triggerKeyword, setTriggerKeyword] = useState(template.metadata_json?.defaultTrigger || 'BOOK');

  // Config values & bindings
  const configSchema = typeof template.config_schema_json === 'string'
    ? (() => { try { return JSON.parse(template.config_schema_json); } catch { return {}; } })()
    : (template.config_schema_json || {});

  const requiredBindings = typeof template.required_bindings_json === 'string'
    ? (() => { try { return JSON.parse(template.required_bindings_json); } catch { return []; } })()
    : (template.required_bindings_json || []);

  const [configValues, setConfigValues] = useState(() => {
    const defaults = {};
    Object.entries(configSchema.properties || {}).forEach(([k, prop]) => {
      if (prop.default !== undefined) {
        defaults[k] = prop.default;
      }
    });
    return defaults;
  });

  const [bindingValues, setBindingValues] = useState({});
  const [simulationTested, setSimulationTested] = useState(false);

  const steps = [
    { number: 1, title: 'Business Identity', desc: 'Brand & contact info' },
    { number: 2, title: 'Connections', desc: 'WhatsApp & catalog' },
    { number: 3, title: 'Trigger & Naming', desc: 'Keyword routing' },
    { number: 4, title: 'Customization', desc: 'Pricing & policies' },
    { number: 5, title: 'Test & Activate', desc: 'Sandbox & launch' }
  ];

  // Validation
  const requiredFields = configSchema.required || [];
  const missingConfigFields = requiredFields.filter(f => !configValues[f]);
  const isConfigValid = missingConfigFields.length === 0;

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
      const payload = {
        flowName,
        triggerKeyword,
        configValues,
        bindings: bindingValues,
        activateNow: true
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <button
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Cancel Setup</span>
          </button>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            Setting up: {template.name}
          </h2>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Step {step} of 5
        </div>
      </div>

      {/* Step Stepper Header */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
        {steps.map((s) => {
          const isCurrent = step === s.number;
          const isPast = step > s.number;

          return (
            <button
              key={s.number}
              onClick={() => setStep(s.number)}
              className={`p-2 rounded-lg text-left transition-all ${
                isCurrent
                  ? 'bg-white shadow-xs border border-slate-200'
                  : 'hover:bg-slate-200/50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    isPast
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-300 text-slate-600'
                  }`}
                >
                  {isPast ? '✓' : s.number}
                </span>
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {s.title}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate ml-6">
                {s.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Step Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form Area (7 cols on lg) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            {step === 1 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  1. Business Identity & Branding
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  These values are dynamically inserted into guest messages, quotations, and booking confirmations.
                </p>
                <ConfigurationForm
                  schema={configSchema}
                  values={configValues}
                  onChange={setConfigValues}
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  2. Connect Workspace Resources
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select the WhatsApp Business line and property or catalog to attach to this automation.
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
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    3. Trigger & Naming
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Give this automation a recognizable name and assign the trigger keyword that starts the journey.
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
                    placeholder="e.g. BOOK, STAY, MENU"
                    className="w-full text-xs font-mono font-semibold px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[11px] text-slate-400">
                    When an incoming WhatsApp customer texts this keyword, this automation activates immediately.
                  </span>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  4. Fine-Tune Customizations & Rules
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Review and customize optional policies, cancellation rules, and default operational hours.
                </p>
                <ConfigurationForm
                  schema={configSchema}
                  values={configValues}
                  onChange={setConfigValues}
                />
              </div>
            )}

            {step === 5 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    5. Ready to Activate
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    Review the pre-flight checklist. Test conversation turns in the live sandbox on the right.
                  </p>
                </div>

                <PublishChecklist
                  configValid={isConfigValid}
                  bindingsValid={true}
                  graphValid={true}
                  simulationDone={simulationTested}
                  missingFields={missingConfigFields}
                  onFixStep={(targetStep) => setStep(targetStep)}
                />

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Nav Buttons */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBack}
                disabled={step === 1 || loading}
              >
                <ArrowLeft size={13} className="mr-1" />
                <span>Back</span>
              </Button>

              {step < 5 ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <Play size={13} className="mr-1" />
                  <span>Activate Automation</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Sandbox Preview Area (5 cols on lg) */}
        <div className="lg:col-span-5">
          <div className="sticky top-20 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={14} className="text-emerald-600" />
                <span>Live Interactive Preview</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Safe In-Memory Sandbox
              </span>
            </div>

            <SimulationPanel
              templateKey={template.template_key}
              configValues={configValues}
              onResetContext={() => setSimulationTested(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

