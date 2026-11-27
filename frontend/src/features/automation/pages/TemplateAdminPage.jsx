import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Plus, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  GitBranch, 
  UploadCloud, 
  Edit, 
  Copy, 
  RefreshCw,
  Search,
  AlertCircle,
  Tag
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui/Primitives';
import { automationApi } from '../api/automationApi';

export function TemplateAdminPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  // New Template form state
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newIndustry, setNewIndustry] = useState('HOSPITALITY');
  const [newCategory, setNewCategory] = useState('BOOKING');
  const [newConfigSchema, setNewConfigSchema] = useState(JSON.stringify({
    type: 'object',
    required: ['business_name', 'support_phone'],
    properties: {
      business_name: { type: 'string', title: 'Business Name', default: 'My Brand' },
      support_phone: { type: 'string', title: 'Support Phone', default: '+919876543210' }
    }
  }, null, 2));

  // Release Version form state
  const [releaseVersionNumber, setReleaseVersionNumber] = useState('1.1.0');
  const [releaseChangelog, setReleaseChangelog] = useState('Added enhanced error handling and updated pricing labels.');
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchAdminTemplates = async () => {
    setLoading(true);
    try {
      const res = await automationApi.getAdminTemplates();
      if (res && res.success) {
        setTemplates(res.templates || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminTemplates();
  }, []);

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      let parsedSchema = {};
      try {
        parsedSchema = JSON.parse(newConfigSchema);
      } catch {
        setErrorMsg('Invalid JSON in Configuration Schema.');
        setSubmitting(false);
        return;
      }

      const payload = {
        template_key: newKey.toLowerCase().replace(/[^a-z0-9._-]/g, '-'),
        title: newName,
        description: newDesc,
        industry: newIndustry,
        category: newCategory,
        config_schema_json: parsedSchema,
        required_bindings_json: [{ resource_type: 'WHATSAPP_LINE', logical_key: 'sender_line', label: 'WhatsApp Line', required: true }],
        graph_json: {
          nodes: [{ id: 'START', type: 'TRIGGER_WHATSAPP', title: 'Start', config: {} }],
          transitions: []
        }
      };

      const res = await automationApi.createMasterTemplate(payload);
      if (res && res.success) {
        setActionMsg('Master template created successfully!');
        setIsNewTemplateModalOpen(false);
        await fetchAdminTemplates();
      } else {
        setErrorMsg(res?.error || 'Failed to create template');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error creating master template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReleaseVersion = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return;
    setSubmitting(true);
    setActionMsg(null);
    setErrorMsg(null);
    try {
      const payload = {
        version_number: releaseVersionNumber,
        changelog: releaseChangelog,
        graph_json: {
          nodes: [{ id: 'START', type: 'TRIGGER_WHATSAPP', title: 'Start', config: {} }],
          transitions: []
        }
      };

      const res = await automationApi.createVersionRelease(selectedTemplate.id, payload);
      if (res && res.success) {
        setActionMsg(`Version ${releaseVersionNumber} released for "${selectedTemplate.title || selectedTemplate.name}"!`);
        setIsReleaseModalOpen(false);
        await fetchAdminTemplates();
      } else {
        setErrorMsg(res?.error || 'Failed to release version');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error releasing version');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    const displayName = (t.title || t.name || '').toLowerCase();
    return !search || displayName.includes(q) || (t.template_key || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <ShieldCheck size={20} className="text-purple-600" />
              <span>Master Template Governance</span>
            </h2>
            <span className="text-[11px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-full">
              Platform Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Create reusable conversation templates, release immutable versions, and distribute updates across all customer tenants.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewTemplateModalOpen(true)}
            className="text-xs py-1.5"
          >
            <Plus size={13} className="mr-1" />
            <span>Create Master Template</span>
          </Button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle size={15} className="text-rose-600 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Templates Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            All System Templates ({filtered.length})
          </span>
          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search master templates..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Loading master templates...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No master templates authored yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Template Name & Key</th>
                  <th className="py-3 px-3">Industry / Category</th>
                  <th className="py-3 px-3">Active Version</th>
                  <th className="py-3 px-3">Installations</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-semibold text-slate-900 block">{item.title || item.name}</span>
                        <span className="font-mono text-[11px] text-slate-400">{item.template_key}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {item.industry} • {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] font-bold text-slate-800">
                      v{item.current_version || item.active_version_number || '1.0.0'}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-600 tabular-nums">
                      {item.installations_count || item.total_installations || 0} tenants
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        {item.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs py-1"
                        onClick={() => {
                          setSelectedTemplate(item);
                          setIsReleaseModalOpen(true);
                        }}
                      >
                        <Sparkles size={12} className="mr-1 text-purple-600" />
                        <span>Release Version</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Master Template */}
      {isNewTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus size={16} className="text-purple-600" />
              <span>Create New Master Template</span>
            </h3>

            <form onSubmit={handleCreateTemplate} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Template Key (Unique Identifier)</label>
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. hospitality.luxury-resort"
                  className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Template Title</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Luxury Resort Booking & Concierge"
                  className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Summary of conversational flow capabilities..."
                  className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700">Industry</label>
                  <select
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="HOSPITALITY">HOSPITALITY</option>
                    <option value="B2B">B2B</option>
                    <option value="ECOMMERCE">ECOMMERCE</option>
                    <option value="HEALTHCARE">HEALTHCARE</option>
                    <option value="SERVICES">SERVICES</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                  >
                    <option value="BOOKING">BOOKING</option>
                    <option value="LEAD_GEN">LEAD_GEN</option>
                    <option value="SUPPORT">SUPPORT</option>
                    <option value="COMMERCE">COMMERCE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Config Schema (JSON)</label>
                <textarea
                  rows={4}
                  value={newConfigSchema}
                  onChange={(e) => setNewConfigSchema(e.target.value)}
                  className="w-full mt-1 p-2 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px]"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setIsNewTemplateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={submitting}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Create Master Template
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Release Version */}
      {isReleaseModalOpen && selectedTemplate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" />
              <span>Release New Immutable Version: {selectedTemplate.name}</span>
            </h3>

            <form onSubmit={handleReleaseVersion} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Target Version Number</label>
                <input
                  type="text"
                  required
                  value={releaseVersionNumber}
                  onChange={(e) => setReleaseVersionNumber(e.target.value)}
                  placeholder="e.g. 1.1.0"
                  className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700">Release Changelog</label>
                <textarea
                  rows={3}
                  required
                  value={releaseChangelog}
                  onChange={(e) => setReleaseChangelog(e.target.value)}
                  placeholder="Summarize the updates and changes included in this version release..."
                  className="w-full mt-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setIsReleaseModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  loading={submitting}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Publish Immutable Version
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

