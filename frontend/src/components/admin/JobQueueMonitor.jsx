import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Modal,
  KpiCard,
  Skeleton
} from '../ui';
import {
  Server,
  RefreshCw,
  Play,
  RotateCcw,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Sliders,
  Database,
  Cpu,
  Layers,
  Check,
  Ban
} from 'lucide-react';
import { formatIndianDate } from '../../utils/indianTime';

const QUEUE_TABS = [
  { id: 'ALL', label: 'All Queues' },
  { id: 'high_priority', label: 'High Priority' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'broadcasts', label: 'Broadcasts' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'default', label: 'Default' }
];

const STATUS_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'DONE', label: 'Done' },
  { id: 'FAILED', label: 'Failed' },
  { id: 'DEAD_LETTER', label: 'Dead Letter' },
  { id: 'CANCELLED', label: 'Cancelled' }
];

export default function JobQueueMonitor({ toast }) {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [selectedQueue, setSelectedQueue] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Payload detail modal
  const [inspectJob, setInspectJob] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/queue/stats', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (_) {}
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/queue/schedules', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSchedules(data.data || []);
      }
    } catch (_) {}
  }, []);

  const fetchJobs = useCallback(async (pg = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pg,
        limit: 25
      });
      if (selectedQueue !== 'ALL') params.append('queueName', selectedQueue);
      if (selectedStatus !== 'ALL') params.append('status', selectedStatus);

      const res = await fetch(`/api/v1/admin/queue/jobs?${params.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || 1);
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [selectedQueue, selectedStatus]);

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchSchedules();
    fetchJobs(page);
  }, [fetchStats, fetchSchedules, fetchJobs, page]);

  useEffect(() => {
    refreshAll();
  }, [selectedQueue, selectedStatus]);

  // Auto-refresh interval (5 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStats();
      fetchJobs(page);
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStats, fetchJobs, page]);

  // Action handlers
  const handleRetryJob = async (jobId) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/admin/queue/jobs/${jobId}/retry`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(data.message || `Job #${jobId} retried`);
        refreshAll();
      } else {
        alert(data.message || 'Retry failed');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJob = async (jobId) => {
    if (!window.confirm(`Cancel pending job #${jobId}?`)) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/admin/queue/jobs/${jobId}/cancel`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(data.message || `Job #${jobId} cancelled`);
        refreshAll();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteJob = async (jobId) => {
    if (!window.confirm(`Permanently delete job #${jobId}?`)) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/admin/queue/jobs/${jobId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(data.message || `Job #${jobId} deleted`);
        refreshAll();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSchedule = async (schedule) => {
    const nextState = !schedule.is_enabled;
    try {
      const res = await fetch(`/api/v1/admin/queue/schedules/${schedule.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isEnabled: nextState })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Schedule ${schedule.schedule_name} ${nextState ? 'enabled' : 'disabled'}`);
        fetchSchedules();
      }
    } catch (e) {}
  };

  const handlePurge = async () => {
    if (!window.confirm('Purge completed and cancelled jobs older than 7 days?')) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/admin/queue/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ olderThanDays: 7 })
      });
      const data = await res.json();
      if (data.success) {
        if (toast) toast(`Purged ${data.purgedCount} old jobs`);
        refreshAll();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadgeVariant = (st) => {
    switch (st) {
      case 'DONE': return 'success';
      case 'PROCESSING': return 'warning';
      case 'PENDING': return 'default';
      case 'DEAD_LETTER': return 'danger';
      case 'FAILED': return 'danger';
      case 'CANCELLED': return 'secondary';
      default: return 'default';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Card */}
      <Card>
        <CardBody style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Server size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>MySQL 8.4 Transactional Job Queue</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Powered by async pool and <code style={{ fontSize: '12px', background: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>FOR UPDATE SKIP LOCKED</code>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                background: autoRefresh ? '#ECFDF5' : '#F1F5F9',
                color: autoRefresh ? '#059669' : '#64748B',
                border: `1px solid ${autoRefresh ? '#A7F3D0' : '#CBD5E1'}`,
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: autoRefresh ? '#10B981' : '#94A3B8' }} />
              Auto-Refresh: {autoRefresh ? 'ON (5s)' : 'OFF'}
            </button>

            <Button variant="secondary" onClick={refreshAll} disabled={loading} style={{ gap: '6px' }}>
              <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> Refresh
            </Button>

            <Button variant="outline" onClick={handlePurge} disabled={actionLoading} style={{ gap: '6px', borderColor: '#CBD5E1' }}>
              <Trash2 size={14} /> Purge &gt;7d
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <KpiCard
          title="Total Jobs"
          value={stats?.total ?? 0}
          icon={Layers}
          subtext={`Queues: ${Object.keys(stats?.byQueue || {}).length}`}
        />
        <KpiCard
          title="Pending Queue"
          value={stats?.pending ?? 0}
          icon={Clock}
          subtext="Waiting for execution"
        />
        <KpiCard
          title="Processing"
          value={stats?.processing ?? 0}
          icon={Cpu}
          subtext={`Active Workers: ${stats?.activeWorkers?.length || 0}`}
        />
        <KpiCard
          title="Completed (Done)"
          value={stats?.done ?? 0}
          icon={CheckCircle2}
          subtext="Executed successfully"
        />
        <KpiCard
          title="Failed / Dead Letter"
          value={(stats?.failed ?? 0) + (stats?.deadLetter ?? 0)}
          icon={AlertTriangle}
          subtext={`Dead Letter: ${stats?.deadLetter ?? 0}`}
        />
      </div>

      {/* Main Jobs Section */}
      <Card>
        <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Queue Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '4px' }}>Queue:</span>
            {QUEUE_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedQueue(tab.id)}
                style={{
                  background: selectedQueue === tab.id ? '#2563EB' : '#F1F5F9',
                  color: selectedQueue === tab.id ? '#FFFFFF' : '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
                {stats?.byQueue?.[tab.id] !== undefined && (
                  <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '11px' }}>
                    ({stats.byQueue[tab.id]})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingTop: '4px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginRight: '4px' }}>Status:</span>
            {STATUS_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                style={{
                  background: selectedStatus === tab.id ? '#0F172A' : '#F8FAFC',
                  color: selectedStatus === tab.id ? '#FFFFFF' : '#64748B',
                  border: '1px solid',
                  borderColor: selectedStatus === tab.id ? '#0F172A' : '#E2E8F0',
                  borderRadius: '6px',
                  padding: '3px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardBody style={{ padding: 0 }}>
          {loading && jobs.length === 0 ? (
            <div style={{ padding: '24px' }}>
              <Skeleton style={{ height: '40px', marginBottom: '8px' }} />
              <Skeleton style={{ height: '40px', marginBottom: '8px' }} />
              <Skeleton style={{ height: '40px' }} />
            </div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Server size={36} style={{ color: '#94A3B8', marginBottom: '10px' }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No jobs found matching criteria</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>Enqueued jobs will automatically appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '10px 16px' }}>ID</th>
                    <th style={{ padding: '10px 16px' }}>Queue</th>
                    <th style={{ padding: '10px 16px' }}>Job Type</th>
                    <th style={{ padding: '10px 16px' }}>Priority</th>
                    <th style={{ padding: '10px 16px' }}>Status</th>
                    <th style={{ padding: '10px 16px' }}>Attempts</th>
                    <th style={{ padding: '10px 16px' }}>Run At (UTC)</th>
                    <th style={{ padding: '10px 16px' }}>Worker / Error</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--border-color)', verticalAlign: 'middle' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>
                        #{job.id}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          background: '#F1F5F9',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#334155'
                        }}>
                          {job.queue_name}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                        {job.job_type}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748B' }}>
                        P{job.priority}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={getStatusBadgeVariant(job.status)}>
                          {job.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748B' }}>
                        {job.attempts} / {job.max_attempts}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#475569', fontSize: '12px' }}>
                        {job.run_at ? String(job.run_at).replace('T', ' ').slice(0, 19) : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', maxWidth: '240px' }}>
                        {job.status === 'PROCESSING' && job.locked_by ? (
                          <span style={{ color: '#D97706', fontSize: '11px', fontWeight: 600 }}>
                            ⚙️ {job.locked_by}
                          </span>
                        ) : job.last_error ? (
                          <span style={{ color: '#DC2626', fontSize: '11px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.last_error}>
                            ⚠️ {job.last_error}
                          </span>
                        ) : job.completed_at ? (
                          <span style={{ color: '#059669', fontSize: '11px' }}>
                            ✓ {String(job.completed_at).replace('T', ' ').slice(0, 19)}
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            title="Inspect Payload"
                            onClick={() => setInspectJob(job)}
                            style={{ background: '#F1F5F9', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#475569' }}
                          >
                            <Eye size={13} />
                          </button>

                          {(job.status === 'FAILED' || job.status === 'DEAD_LETTER' || job.status === 'CANCELLED') && (
                            <button
                              type="button"
                              title="Retry Job"
                              disabled={actionLoading}
                              onClick={() => handleRetryJob(job.id)}
                              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#2563EB' }}
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}

                          {job.status === 'PENDING' && (
                            <button
                              type="button"
                              title="Cancel Job"
                              disabled={actionLoading}
                              onClick={() => handleCancelJob(job.id)}
                              style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#DC2626' }}
                            >
                              <Ban size={13} />
                            </button>
                          )}

                          {(job.status === 'DONE' || job.status === 'DEAD_LETTER' || job.status === 'CANCELLED') && (
                            <button
                              type="button"
                              title="Delete Job"
                              disabled={actionLoading}
                              onClick={() => handleDeleteJob(job.id)}
                              style={{ background: '#F1F5F9', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', color: '#94A3B8' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Showing Page {page} of {totalPages} ({total} total jobs)
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => fetchJobs(page - 1)}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => fetchJobs(page + 1)}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Recurring Schedules Section */}
      <Card>
        <CardHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={16} /> Recurring Background Schedules
          </h4>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: '#475569' }}>
                  <th style={{ padding: '10px 16px' }}>Schedule Name</th>
                  <th style={{ padding: '10px 16px' }}>Job Type</th>
                  <th style={{ padding: '10px 16px' }}>Queue</th>
                  <th style={{ padding: '10px 16px' }}>Interval</th>
                  <th style={{ padding: '10px 16px' }}>Status</th>
                  <th style={{ padding: '10px 16px' }}>Next Run At</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right' }}>Toggle</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(sched => (
                  <tr key={sched.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1E293B' }}>
                      {sched.schedule_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                      {sched.job_type}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                        {sched.queue_name}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748B' }}>
                      Every {sched.interval_seconds}s
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Badge variant={sched.is_enabled ? 'success' : 'secondary'}>
                        {sched.is_enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#475569' }}>
                      {sched.next_run_at ? String(sched.next_run_at).replace('T', ' ').slice(0, 19) : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleSchedule(sched)}
                        style={{
                          background: sched.is_enabled ? '#FEF2F2' : '#EFF6FF',
                          color: sched.is_enabled ? '#DC2626' : '#2563EB',
                          border: `1px solid ${sched.is_enabled ? '#FECACA' : '#BFDBFE'}`,
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {sched.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Inspect Job Modal */}
      {inspectJob && (
        <Modal
          isOpen={!!inspectJob}
          onClose={() => setInspectJob(null)}
          title={`Job #${inspectJob.id}: ${inspectJob.job_type}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#F8FAFC', padding: '12px', borderRadius: '8px' }}>
              <div><strong>Queue:</strong> {inspectJob.queue_name}</div>
              <div><strong>Status:</strong> {inspectJob.status}</div>
              <div><strong>Priority:</strong> {inspectJob.priority}</div>
              <div><strong>Attempts:</strong> {inspectJob.attempts} / {inspectJob.max_attempts}</div>
              <div><strong>Run At:</strong> {inspectJob.run_at}</div>
              <div><strong>Completed At:</strong> {inspectJob.completed_at || '-'}</div>
              {inspectJob.idempotency_key && (
                <div style={{ gridColumn: 'span 2' }}>
                  <strong>Idempotency Key:</strong> {inspectJob.idempotency_key}
                </div>
              )}
            </div>

            {inspectJob.last_error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '10px 14px', borderRadius: '6px', color: '#991B1B' }}>
                <strong>Last Error:</strong>
                <pre style={{ margin: '6px 0 0 0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
                  {inspectJob.last_error}
                </pre>
              </div>
            )}

            <div>
              <strong>Payload JSON:</strong>
              <pre style={{
                background: '#0F172A',
                color: '#E2E8F0',
                padding: '14px',
                borderRadius: '8px',
                overflowX: 'auto',
                fontSize: '12px',
                maxHeight: '260px'
              }}>
                {JSON.stringify(inspectJob.payload_json, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="secondary" onClick={() => setInspectJob(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
