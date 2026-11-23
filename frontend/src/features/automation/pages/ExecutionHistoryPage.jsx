import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  History, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Phone, 
  ArrowRight, 
  User, 
  Bot, 
  Code,
  ShieldCheck,
  ChevronRight,
  X
} from 'lucide-react';
import { automationApi } from '../api/automationApi';
import { Button, Badge } from '../../../components/ui/Primitives';

export function ExecutionHistoryPage({ initialFlowId, onBack }) {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadExecutions() {
      setLoading(true);
      try {
        const res = await automationApi.getExecutions({ flowId: initialFlowId, limit: 100 });
        const list = res?.executions || res?.data || [];
        setExecutions(Array.isArray(list) ? list : []);
      } catch {
        // Fallback gracefully
      } finally {
        setLoading(false);
      }
    }
    loadExecutions();
  }, [initialFlowId]);

  const handleSelectSession = async (sessionId) => {
    setSelectedSessionId(sessionId);
    setDetailsLoading(true);
    try {
      const res = await automationApi.getExecutionDetails(sessionId);
      if (res && res.success) {
        setSessionDetails(res.execution || res.session);
      } else {
        setSessionDetails(null);
      }
    } catch {
      setSessionDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const filtered = executions.filter((ex) => {
    const status = (ex.status || 'ACTIVE').toUpperCase();
    const phone = ex.sender_phone || ex.guest_phone || '';
    const flowName = ex.flow_name || '';

    const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
    const matchesSearch = !search || phone.includes(search) || flowName.toLowerCase().includes(search.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 mb-1.5 transition-colors"
            >
              <ArrowLeft size={13} />
              <span>Back to Automations</span>
            </button>
          )}
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History size={20} className="text-slate-700" />
            <span>Workflow Execution History</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit conversation turns, step state transitions, guest responses, and error traces.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by phone or flow..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="ACTIVE">Active (In-Flight)</option>
            <option value="DROPOFF">Dropoff</option>
            <option value="ERROR">Error</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-14 text-center text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span>Loading execution traces...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-xs text-slate-500">
            No execution logs found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Session ID</th>
                  <th className="py-3 px-3">Flow Name</th>
                  <th className="py-3 px-3">Guest Contact</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Current Node</th>
                  <th className="py-3 px-3">Started</th>
                  <th className="py-3 px-4 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const status = (item.status || 'ACTIVE').toUpperCase();
                  const isCompleted = status === 'COMPLETED';
                  const isError = status === 'ERROR';
                  const isDropoff = status === 'DROPOFF';

                  return (
                    <tr
                      key={item.id || item.session_id}
                      onClick={() => handleSelectSession(item.session_id || item.id)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                        selectedSessionId === (item.session_id || item.id) ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono text-[11px] font-medium text-slate-700">
                        {item.session_id ? item.session_id.substring(0, 12) + '...' : item.id}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {item.flow_name || `Flow #${item.flow_id}`}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {item.sender_phone
                          ? item.sender_phone.replace(/(\d{4})\d{4}(\d{2})/, '$1****$2')
                          : '+91 ****'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : isError
                              ? 'bg-rose-100 text-rose-800'
                              : isDropoff
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {item.current_node_id || item.last_node || 'START'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {item.created_at ? new Date(item.created_at).toLocaleTimeString() : 'Recent'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-slate-400 group-hover:text-slate-700">
                          <ChevronRight size={14} className="inline" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Side Slide-Over Drawer for Session Inspection */}
      {selectedSessionId && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Session Trace Inspector
              </h3>
              <p className="text-[11px] font-mono text-slate-500 truncate max-w-xs">
                {selectedSessionId}
              </p>
            </div>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {detailsLoading ? (
              <div className="py-12 text-center text-slate-400">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Loading trace details...</span>
              </div>
            ) : !sessionDetails ? (
              <div className="py-8 text-center text-slate-400">
                No detailed log records captured for this session.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Meta details */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-bold text-slate-800">{sessionDetails.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact:</span>
                    <span className="text-slate-800">{sessionDetails.sender_phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Node:</span>
                    <span className="text-slate-800">{sessionDetails.current_node_id}</span>
                  </div>
                </div>

                {/* Variable Context Snapshot */}
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
                    <Code size={14} className="text-blue-600" />
                    <span>Variable Context Snapshot</span>
                  </h4>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto max-h-60">
                    {JSON.stringify(sessionDetails.context_json || sessionDetails.variable_context || {}, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

