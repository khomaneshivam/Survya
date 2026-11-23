import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Primitives';

export function PublishChecklist({
  configValid = true,
  bindingsValid = true,
  graphValid = true,
  simulationDone = false,
  missingFields = [],
  missingBindings = [],
  onFixStep
}) {
  const allReady = configValid && bindingsValid && graphValid;

  const checks = [
    {
      id: 'config',
      stepNumber: 1,
      title: 'Business Configuration',
      desc: missingFields.length === 0
        ? 'All required brand and contact variables provided'
        : `Missing: ${missingFields.join(', ')}`,
      valid: configValid,
      critical: true
    },
    {
      id: 'bindings',
      stepNumber: 2,
      title: 'Resource Connections',
      desc: missingBindings.length === 0
        ? 'Connected to authorized WhatsApp line & catalog resources'
        : `Missing: ${missingBindings.join(', ')}`,
      valid: bindingsValid,
      critical: true
    },
    {
      id: 'graph',
      stepNumber: 3,
      title: 'Workflow Graph Validation',
      desc: graphValid
        ? 'Trigger keyword and execution branches verified'
        : 'Graph has unreachable nodes or invalid trigger',
      valid: graphValid,
      critical: true
    },
    {
      id: 'simulation',
      stepNumber: 4,
      title: 'Interactive Simulation Sandbox',
      desc: simulationDone
        ? 'Verified end-to-end responses in mock WhatsApp sandbox'
        : 'Recommended: send a test message in the sandbox preview',
      valid: simulationDone,
      critical: false
    }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Pre-Flight Activation Checklist
          </h4>
          <p className="text-[11px] text-slate-500">
            {allReady
              ? '✓ All mandatory operational criteria satisfied.'
              : 'Resolve required items before publishing to live traffic.'}
          </p>
        </div>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            allReady
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-amber-100 text-amber-800 border border-amber-200'
          }`}
        >
          {allReady ? 'Ready for Activation' : 'Pending Requirements'}
        </span>
      </div>

      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.id}
            className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
              check.valid
                ? 'bg-emerald-50/40 border-emerald-100'
                : check.critical
                ? 'bg-rose-50/30 border-rose-200'
                : 'bg-amber-50/30 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {check.valid ? (
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              ) : check.critical ? (
                <XCircle size={16} className="text-rose-500 flex-shrink-0" />
              ) : (
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              )}
              <div>
                <span className="text-xs font-semibold text-slate-800 block">
                  {check.title}
                </span>
                <span className="text-[11px] text-slate-500">{check.desc}</span>
              </div>
            </div>

            {!check.valid && onFixStep && (
              <button
                onClick={() => onFixStep(check.stepNumber)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 ml-2"
              >
                <span>Fix</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

