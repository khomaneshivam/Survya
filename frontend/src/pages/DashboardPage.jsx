import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  KpiCard,
  Card,
  CardHeader,
  CardBody,
  DataTable,
  Badge,
  Button,
  FilterBar,
  PastelBarChart,
  PastelBreakdownCard
} from '../components/ui';
import {
  Send,
  CheckCircle2,
  Eye,
  CalendarRange,
  BedDouble,
  RefreshCw,
  ArrowUpRight,
  Users,
  Calendar
} from 'lucide-react';
import { formatIndianDate } from '../utils/indianTime';

export default function DashboardPage({ setActiveTab }) {
  const { token } = useAuth();
  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [resortSummary, setResortSummary] = useState(null);
  const [dateWindow, setDateWindow] = useState('30d'); // '7d' | '30d' | 'all'
  const [referenceTs, setReferenceTs] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setReferenceTs(Date.now());
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [overRes, campRes, resortRes] = await Promise.all([
        fetch('/api/reports/overview', { headers }),
        fetch('/api/campaigns', { headers }),
        fetch('/api/v1/dashboard/summary', { headers }).catch(() => ({ json: () => ({ success: false }) }))
      ]);

      const overData = await overRes.json();
      const campData = await campRes.json();
      const resortData = await resortRes.json();

      if (overData.success) setOverview(overData.data);
      if (resortData.success) setResortSummary(resortData.data);
      if (campData.success && Array.isArray(campData.data)) {
        const formatted = campData.data.map((item) => ({
          id: item.id,
          name: item.name,
          template: item.template_name || item.template || 'Template',
          created_at: item.created_at,
          status: item.status || 'COMPLETED',
          recipients: item.valid_contacts || item.total_contacts || 0,
          delivered: item.sent_count || 0,
          failed: item.failed_count || 0
        }));
        setCampaigns(formatted);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const filteredCampaigns = useMemo(() => {
    if (dateWindow === 'all') return campaigns;
    const days = dateWindow === '7d' ? 7 : 30;
    const cutoff = referenceTs - days * 24 * 60 * 60 * 1000;
    return campaigns.filter((c) => {
      if (!c.created_at) return true;
      const t = new Date(c.created_at).getTime();
      return Number.isNaN(t) || t >= cutoff;
    });
  }, [campaigns, dateWindow, referenceTs]);

  const chartData = useMemo(() => {
    return filteredCampaigns.slice(0, 8).reverse().map((c) => ({
      label: c.name.length > 12 ? `${c.name.slice(0, 11)}…` : c.name,
      delivered: c.delivered || 0,
      failed: c.failed || 0
    }));
  }, [filteredCampaigns]);

  const totalRecipients = overview?.totalRecipients || 0;
  const totalDelivered = overview?.totalDelivered || 0;
  const totalRead = overview?.totalRead || 0;
  const deliveryRate = totalRecipients > 0 ? ((totalDelivered / totalRecipients) * 100).toFixed(1) : '0.0';
  const readRate = totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(1) : '0.0';

  const pipelineBreakdown = resortSummary
    ? [
        { label: 'New Enquiries', value: resortSummary.counts?.NEW || 0, color: '#B0DBF6' },
        { label: 'Quoted', value: resortSummary.counts?.QUOTED || 0, color: '#EFB0F6' },
        { label: 'Confirmed Won', value: resortSummary.counts?.WON || 0, color: '#C3D1AC' },
        { label: 'Closed Lost', value: resortSummary.counts?.LOST || 0, color: '#FDB1AF' }
      ]
    : [];

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Platform Overview"
        description="Unified telemetry across WhatsApp messaging campaigns, CRM pipeline conversions, and room availability."
        actions={
          <>
            <Button variant="secondary" onClick={loadDashboardData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-slow' : ''} />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => setActiveTab('enquiries')}>
              <Users size={14} />
              Open CRM
            </Button>
            <Button variant="primary" onClick={() => setActiveTab('broadcast')}>
              <Send size={14} />
              New Campaign
            </Button>
          </>
        }
      />

      {/* Filter Bar with Date Range Selector */}
      <FilterBar
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginInlineEnd: '4px' }}>
              Campaign Window:
            </span>
            {[
              { id: '7d', label: 'Last 7 days' },
              { id: '30d', label: 'Last 30 days' },
              { id: 'all', label: 'All time' }
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`filter-chip ${dateWindow === opt.id ? 'active' : ''}`}
                onClick={() => setDateWindow(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
        right={
          <Button variant="ghost" size="sm" onClick={() => setActiveTab('reports')}>
            View full Insights
            <ArrowUpRight size={13} />
          </Button>
        }
      />

      {/* Primary KPI Row */}
      <div className="sarvya-kpi-grid">
        <KpiCard
          label="Messages Delivered"
          value={totalDelivered.toLocaleString('en-IN')}
          meta={`${deliveryRate}% of ${totalRecipients.toLocaleString('en-IN')} targeted`}
          icon={CheckCircle2}
          accentTone="green"
          onClick={() => setActiveTab('reports')}
        />
        <KpiCard
          label="Customer Read Rate"
          value={`${readRate}%`}
          meta={`${totalRead.toLocaleString('en-IN')} read receipts recorded`}
          icon={Eye}
          accentTone="blue"
          onClick={() => setActiveTab('reports')}
        />
        <KpiCard
          label="Active CRM Enquiries"
          value={(resortSummary?.counts?.TOTAL || 0).toLocaleString('en-IN')}
          meta={`${resortSummary?.counts?.NEW || 0} new • ${resortSummary?.counts?.QUOTED || 0} quoted`}
          icon={CalendarRange}
          accentTone="purple"
          onClick={() => setActiveTab('enquiries')}
        />
        <KpiCard
          label="Confirmed Revenue"
          value={`₹${(resortSummary?.financial?.won_revenue || 0).toLocaleString('en-IN')}`}
          meta={`${resortSummary?.conversion_rate || 0}% win rate • ${resortSummary?.counts?.WON || 0} won`}
          icon={BedDouble}
          accentTone="green"
          onClick={() => setActiveTab('enquiries')}
        />
      </div>

      {/* Main Analytical Chart + CRM Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
        <PastelBarChart
          title="Recent Campaign Delivery Volume"
          subtitle="Delivered vs. failed recipient dispatches per recent campaign"
          loading={loading}
          data={chartData}
          series={[
            { key: 'delivered', label: 'Delivered', color: '#B0DBF6' },
            { key: 'failed', label: 'Failed', color: '#FDB1AF' }
          ]}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setActiveTab('broadcast')}>
              Manage Campaigns
            </Button>
          }
        />

        <PastelBreakdownCard
          title="CRM Lead Stage Breakdown"
          subtitle={`Pipeline value: ₹${(resortSummary?.financial?.pipeline_value || 0).toLocaleString('en-IN')}`}
          items={pipelineBreakdown}
          actions={
            <Button variant="ghost" size="sm" onClick={() => setActiveTab('enquiries')}>
              Pipeline View
            </Button>
          }
        />
      </div>

      {/* Hospitality Snapshot + Upcoming Check-ins */}
      {resortSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          <Card>
            <CardHeader
              title="Today's Room Availability"
              subtitle="Live inventory rates synced from Hospitality calendar"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('inventory')}>
                  Open Calendar
                </Button>
              }
            />
            <CardBody>
              {(!resortSummary.room_types || resortSummary.room_types.length === 0) ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  No room categories configured yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                  {resortSummary.room_types.map((rt) => (
                    <div
                      key={rt.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-subtle)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>{rt.name}</span>
                        <Badge tone={rt.today_is_closed ? 'coral' : 'green'}>
                          {rt.today_is_closed ? 'Closed' : `${rt.today_available_qty} free`}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Base rate: ₹{Number(rt.base_rate || 0).toLocaleString('en-IN')} / night
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Upcoming Check-ins"
              subtitle="Confirmed & quoted stays arriving soon"
              actions={
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('automation')}>
                  Lifecycle Rules
                </Button>
              }
            />
            <CardBody>
              {(!resortSummary.upcoming_checkins || resortSummary.upcoming_checkins.length === 0) ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  No upcoming check-ins scheduled in pipeline.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {resortSummary.upcoming_checkins.slice(0, 4).map((guest) => (
                    <div
                      key={guest.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: '13px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Calendar size={14} color="var(--sarvya-blue)" style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {guest.guest_name}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {guest.room_type_name || 'Standard'}
                        </span>
                      </div>
                      <Badge tone="blue">{guest.check_in}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Supporting Data Table */}
      <Card>
        <CardHeader
          title="Recent Broadcast Campaigns"
          subtitle="Structured dispatch log across active and completed campaigns"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setActiveTab('reports')}>
              Detailed Logs
            </Button>
          }
        />
        <CardBody style={{ padding: 0 }}>
          <DataTable
            density="compact"
            loading={loading}
            data={filteredCampaigns}
            pageSize={6}
            ariaLabel="Recent broadcast campaigns"
            emptyTitle="No campaigns dispatched in this window"
            emptyDescription="Create a new broadcast campaign or broaden the campaign time window."
            emptyAction={
              <Button variant="primary" size="sm" onClick={() => setActiveTab('broadcast')}>
                Launch Campaign
              </Button>
            }
            onRowClick={() => setActiveTab('reports')}
            columns={[
              {
                key: 'name',
                label: 'Campaign',
                sortable: true,
                render: (row) => (
                  <div>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{row.template}</div>
                  </div>
                )
              },
              {
                key: 'status',
                label: 'Status',
                sortable: true,
                render: (row) => {
                  const s = (row.status || '').toUpperCase();
                  const tone = s === 'COMPLETED' ? 'green' : s === 'FAILED' || s === 'CANCELLED' ? 'coral' : 'blue';
                  return <Badge tone={tone} dot>{s}</Badge>;
                }
              },
              {
                key: 'recipients',
                label: 'Targeted',
                sortable: true,
                align: 'end',
                render: (row) => <span className="tabular-nums">{(row.recipients || 0).toLocaleString('en-IN')}</span>
              },
              {
                key: 'delivered',
                label: 'Delivered',
                sortable: true,
                align: 'end',
                render: (row) => <span className="tabular-nums" style={{ fontWeight: 600 }}>{(row.delivered || 0).toLocaleString('en-IN')}</span>
              },
              {
                key: 'failed',
                label: 'Failed',
                sortable: true,
                align: 'end',
                render: (row) => (
                  <span className="tabular-nums" style={{ color: row.failed > 0 ? 'var(--status-error-text)' : 'var(--text-muted)' }}>
                    {(row.failed || 0).toLocaleString('en-IN')}
                  </span>
                )
              },
              {
                key: 'created_at',
                label: 'Created',
                sortable: true,
                render: (row) => (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {row.created_at ? formatIndianDate(row.created_at) : '—'}
                  </span>
                )
              }
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
