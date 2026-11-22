import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Activity,
  Users,
  Smartphone,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Clock,
  HardDrive,
  Globe,
  ShieldCheck
} from 'lucide-react';
import {
  KpiCard,
  Badge,
  Button,
  Card,
  CardHeader,
  CardBody
} from '../ui';

export default function AdminOverviewTab({
  overview,
  users = [],
  phoneNumbers = [],
  metaSettings = {},
  token,
  onRefresh,
  flashSuccess,
  flashError
}) {
  const [telemetry, setTelemetry] = useState(null);
  const [loadingTelemetry, setLoadingTelemetry] = useState(true);
  const [testingConnection, setTestingConnection] = useState(false);
  const [metaConnectionResult, setMetaConnectionResult] = useState(null);

  const fetchHealth = useCallback(async () => {
    setLoadingTelemetry(true);
    try {
      const res = await fetch('/api/system/health');
      const data = await res.json();
      if (data.success && data.data) {
        setTelemetry(data.data);
      }
    } catch (err) {
      console.warn('Failed to load system health:', err.message);
    } finally {
      setLoadingTelemetry(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const handleTestMetaConnection = async () => {
    setTestingConnection(true);
    setMetaConnectionResult(null);
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          token: metaSettings.WHATSAPP_API_TOKEN,
          phoneNumberId: metaSettings.WHATSAPP_PHONE_NUMBER_ID
        })
      });
      const data = await res.json();
      setMetaConnectionResult(data);
      if (data.success) {
        if (flashSuccess) flashSuccess('Meta WhatsApp Cloud API is connected and authenticated!');
      } else {
        if (flashError) flashError(data.message || 'Connection test failed.');
      }
    } catch (err) {
      setMetaConnectionResult({ success: false, message: err.message });
      if (flashError) flashError(err.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const formatUptime = (seconds = 0) => {
    if (!seconds) return '0m';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPI Cards Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        <KpiCard
          title="Active Accounts"
          value={users.filter((u) => u.status === 'ACTIVE' && u.delete_status !== 1).length}
          subtext={`Total accounts: ${users.length}`}
          icon={Users}
          color="#0284c7"
        />
        <KpiCard
          title="Registered WABA Lines"
          value={phoneNumbers.length}
          subtext={`${phoneNumbers.filter((p) => p.quality_rating === 'GREEN').length} lines healthy (GREEN)`}
          icon={Smartphone}
          color="#10b981"
        />
        <KpiCard
          title="Broadcast Campaigns"
          value={overview?.totalCampaigns ?? 0}
          subtext={`${overview?.completedCampaigns ?? 0} completed successfully`}
          icon={Activity}
          color="#8b5cf6"
        />
        <KpiCard
          title="Database Engine"
          value={telemetry?.dbEngine || 'MySQL 8.4'}
          subtext={`${telemetry?.dbName || 'whatsapp_bulk_db'} : ${telemetry?.dbPort || 3306}`}
          icon={Database}
          color="#f59e0b"
        />
      </div>

      {/* Telemetry and Health Checks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
        {/* Live System Telemetry */}
        <Card>
          <CardHeader
            title="Live System Telemetry & Architecture"
            icon={Server}
            action={
              <button
                type="button"
                onClick={fetchHealth}
                disabled={loadingTelemetry}
                className="sarvya-btn sarvya-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Refresh system telemetry"
              >
                <RefreshCw size={13} className={loadingTelemetry ? 'spin-slow' : ''} />
                <span>Refresh</span>
              </button>
            }
          />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Server Runtime</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {telemetry ? `${telemetry.nodeVersion} (${telemetry.platform} ${telemetry.arch})` : 'Node.js (Detecting...)'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Process Uptime</span>
                <span style={{ fontWeight: 600, color: '#16a34a' }}>
                  {telemetry ? formatUptime(telemetry.uptimeSeconds) : 'Calculating...'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Memory Consumption (RSS)</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {telemetry?.memoryUsageMb ? `${telemetry.memoryUsageMb.rss} MB (Heap: ${telemetry.memoryUsageMb.heapUsed}/${telemetry.memoryUsageMb.heapTotal} MB)` : 'Measuring...'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Database Host & Port</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {telemetry ? `${telemetry.dbHost}:${telemetry.dbPort}` : 'localhost:3306'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Environment</span>
                <Badge variant={telemetry?.environment === 'production' ? 'success' : 'info'}>
                  {telemetry?.environment ? String(telemetry.environment).toUpperCase() : 'PRODUCTION'}
                </Badge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Platform Timezone</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {telemetry?.timezone || metaSettings.APP_TIMEZONE || 'Asia/Kolkata'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Active Tenant Scope</span>
                <span style={{ fontWeight: 600, color: 'var(--sarvya-blue)' }}>
                  Master Tenant #{telemetry?.activeTenantCount || 1}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* WhatsApp Cloud API Health Card */}
        <Card>
          <CardHeader title="WhatsApp Cloud API Health Quick Check" icon={Activity} />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Test your configured WhatsApp Cloud API credentials directly against Meta's Graph API to verify token validity, phone line status, and verified business identity.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  onClick={handleTestMetaConnection}
                  disabled={testingConnection}
                >
                  <RefreshCw size={14} className={testingConnection ? 'spin-slow' : ''} />
                  {testingConnection ? 'Verifying with Meta...' : 'Test Meta Connection'}
                </Button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Target Phone ID: {metaSettings.WHATSAPP_PHONE_NUMBER_ID || 'Configured Default'}
                </span>
              </div>

              {metaConnectionResult && (
                <div style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: metaConnectionResult.success ? 'var(--color-success-subtle, #ecfdf5)' : 'var(--color-danger-subtle, #fef2f2)',
                  border: `1px solid ${metaConnectionResult.success ? 'var(--color-success-border, #a7f3d0)' : 'var(--color-danger-border, #fecaca)'}`,
                  fontSize: '12.5px'
                }}>
                  <div style={{ fontWeight: 700, color: metaConnectionResult.success ? 'var(--color-success, #059669)' : 'var(--color-danger, #dc2626)' }}>
                    {metaConnectionResult.success ? '✓ WhatsApp Cloud API Live & Connected' : '✗ Meta Connection Verification Failed'}
                  </div>
                  {metaConnectionResult.data && (
                    <div style={{ marginTop: '6px', color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div><strong>Verified Name:</strong> {metaConnectionResult.data.verifiedName}</div>
                      <div><strong>Phone:</strong> {metaConnectionResult.data.displayPhoneNumber}</div>
                      <div><strong>Status:</strong> {metaConnectionResult.data.status}</div>
                      <div><strong>Quality:</strong> {metaConnectionResult.data.qualityRating}</div>
                    </div>
                  )}
                  {metaConnectionResult.hint && (
                    <div style={{ marginTop: '6px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                      Hint: {metaConnectionResult.hint}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
