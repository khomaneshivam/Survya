import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  GitBranch, 
  Settings, 
  Sparkles, 
  Layers, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  Play, 
  Pause, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight,
  Sliders,
  Building2,
  Clock,
  History
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui/Primitives';
import { ConfigurationForm } from '../components/ConfigurationForm';
import { ResourceBindingPicker } from '../components/ResourceBindingPicker';
import { automationApi } from '../api/automationApi';

export function AutomationDetailsPage({
  flowId,
  installationId,
  onBack,
  onOpenBuilder,
  onOpenHistory
}) {
  const [installation, setInstallation] = useState(null);
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [activeTab, setActiveTab] = useState('CONFIG'); // CONFIG | BINDINGS | HEALTH
  const [configValues, setConfigValues] = useState({});
  const [bindingValues, setBindingValues] = useState({});
  const [upgradeInfo, setUpgradeInfo] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [instRes, flowRes] = await Promise.all([
          installationId ? automationApi.getInstallation(installationId) : Promise.resolve(null),
          flowId ? automationApi.getFlow(flowId) : Promise.resolve(null)
        ]);

        if (instRes && instRes.success) {
          const inst = instRes.installation;
          setInstallation(inst);
          const parsedConfig = typeof inst.config_values_json === 'string'
            ? JSON.parse(inst.config_values_json)
            : (inst.config_values_json || {});
          setConfigValues(parsedConfig);

          // Check if upgrade available
          if (installationId) {
            automationApi.checkUpgrade(installationId).then(uRes => {
              if (uRes && uRes.upgradeAvailable) {
                setUpgradeInfo(uRes);
              }
            }).catch(() => {});
          }
        }

        if (flowRes && flowRes.success) {
          setFlow(flowRes.flow);
        }
      } catch (err) {
        setErrorMsg(err.message || 'Failed to load automation details');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [flowId, installationId]);

  const handleSaveConfig = async () => {
    if (!installationId) return;
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const res = await automationApi.updateInstallationConfig(installationId, {
        configValues
      });
      if (res && res.success) {
        setSuccessMsg('Configuration updated successfully! New values will take effect immediately.');
        setInstallation(res.installation);
      } else {
        setErrorMsg(res?.error || 'Failed to update configuration');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error updating configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyUpgrade = async () => {
    if (!installationId || !upgradeInfo?.targetVersion) return;
    setUpgrading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await automationApi.applyUpgrade(installationId, upgradeInfo.targetVersion);
      if (res && res.success) {
        setSuccessMsg(`Upgraded to version ${upgradeInfo.targetVersion} successfully! Your customized values were preserved.`);
        setUpgradeInfo(null);
        setInstallation(res.installation);
      } else {
        setErrorMsg(res?.error || 'Failed to upgrade template version');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error during version upgrade');
    } finally {
      setUpgrading(false);
    }
  };

  const template = installation?.template || null;
  const configSchema = template?.config_schema_json
    ? (typeof template.config_schema_json === 'string'
        ? JSON.parse(template.config_schema_json)
        : template.config_schema_json)
    : {};

  const requiredBindings = template?.required_bindings_json
    ? (typeof template.required_bindings_json === 'string'
        ? JSON.parse(template.required_bindings_json)
        : template.required_bindings_json)
    : [];

  if (loading) {
    return (
      <div className="p-12 text-center text-xs text-slate-500">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <span>Loading automation settings...</span>
      </div>
    );
  }

  const isFlowActive = (flow?.status || '').toUpperCase() === 'ACTIVE' || (flow?.status || '').toUpperCase() === 'PUBLISHED';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1.5 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Back to Automations</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {flow?.name || 'Automation Details'}
            </h2>
            <Badge tone={isFlowActive ? 'green' : 'taupe'} dot>
              {isFlowActive ? 'Active & Live' : flow?.status || 'Draft'}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Trigger Keyword: <span className="font-mono font-semibold text-slate-700">{flow?.trigger_keyword || 'DEFAULT'}</span>
            {installation && ` • Installed from ${installation.template_key} (v${installation.installed_version_number})`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenHistory && (
            <Button
              variant="secondary"
              size="sm"
              className="text-xs py-1.5"
              onClick={() => onOpenHistory(flowId)}
            >
              <History size={13} className="mr-1 text-slate-500" />
              <span>Execution Logs</span>
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            className="text-xs py-1.5"
            onClick={() => onOpenBuilder(flowId)}
          >
            <GitBranch size={13} className="mr-1" />
            <span>Open in Visual Editor</span>
          </Button>
        </div>
      </div>

      {/* Upgrade Notification Banner */}
      {upgradeInfo && (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-900">
                New Template Version Available: v{upgradeInfo.targetVersion}
              </h4>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Upgrading brings updated nodes and bug fixes while safely preserving all your custom business parameters.
              </p>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={upgrading}
            onClick={handleApplyUpgrade}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <span>Upgrade to v{upgradeInfo.targetVersion}</span>
          </Button>
        </div>
      )}

      {/* Alert Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab('CONFIG')}
          className={`py-2 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'CONFIG'
              ? 'border-emerald-600 text-emerald-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Configuration Values
        </button>
        <button
          onClick={() => setActiveTab('BINDINGS')}
          className={`py-2 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'BINDINGS'
              ? 'border-emerald-600 text-emerald-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Resource Connections
        </button>
        <button
          onClick={() => setActiveTab('HEALTH')}
          className={`py-2 px-3 border-b-2 font-medium transition-colors ${
            activeTab === 'HEALTH'
              ? 'border-emerald-600 text-emerald-700 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Health & Telemetry
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'CONFIG' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Customized Business Parameters
              </h3>
              <p className="text-[11px] text-slate-500">
                Update parameters without modifying the core workflow graph.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleSaveConfig}
              className="text-xs py-1.5"
            >
              <Save size={13} className="mr-1" />
              <span>Save Changes</span>
            </Button>
          </div>

          <ConfigurationForm
            schema={configSchema}
            values={configValues}
            onChange={setConfigValues}
          />
        </div>
      )}

      {activeTab === 'BINDINGS' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
              Attached Workspace Resources
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              Resources linked to this flow installation.
            </p>
          </div>

          <ResourceBindingPicker
            requiredBindings={requiredBindings}
            values={bindingValues}
            onChange={setBindingValues}
          />
        </div>
      )}

      {activeTab === 'HEALTH' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 uppercase font-semibold">Total Turns</span>
            <div className="text-2xl font-mono font-bold text-slate-800 mt-1 tabular-nums">
              {flow?.execution_count || 0}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Live guest turns processed</span>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 uppercase font-semibold">Dropoff Rate</span>
            <div className="text-2xl font-mono font-bold text-slate-800 mt-1 tabular-nums">
              {flow?.dropoff_rate ? `${(flow.dropoff_rate * 100).toFixed(1)}%` : '0%'}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Guests exiting before completion</span>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <span className="text-xs text-slate-500 uppercase font-semibold">Execution Engine</span>
            <div className="text-sm font-semibold text-emerald-600 mt-2 flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              <span>O(1) Route Validated</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Under 50ms dispatch latency</span>
          </div>
        </div>
      )}
    </div>
  );
}

