import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';
import {
  PageHeader,
  Tabs,
  KpiCard,
  DataTable,
  Modal,
  Badge,
  Button,
  Card,
  CardBody
} from '../components/ui';
import {
  Users,
  Smartphone,
  Activity,
  CheckCircle2,
  Trash2,
  Star,
  Eye,
  Plus,
  RefreshCw,
  Key,
  Archive,
  ShieldCheck
} from 'lucide-react';
import { formatIndianDate } from '../utils/indianTime';

export default function AdminPage() {
  const { token, user: currentUser, impersonateUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [unassignedSummary, setUnassignedSummary] = useState(null);
  const [claimingHistory, setClaimingHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  const [resetPasswordModal, setResetPasswordModal] = useState({
    open: false,
    user: null,
    newPassword: '',
    loading: false,
    error: null
  });

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [usersRes, phonesRes, overviewRes, unassignedRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/phone-numbers', { headers }),
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/unassigned-summary', { headers }).catch(() => null)
      ]);
      const usersData = await usersRes.json();
      const phonesData = await phonesRes.json();
      const overviewData = await overviewRes.json();
      const unassignedData = unassignedRes ? await unassignedRes.json().catch(() => null) : null;

      if (usersData.success) setUsers(usersData.data || []);
      if (phonesData.success) setPhoneNumbers(phonesData.data || []);
      if (overviewData.success) setOverview(overviewData.data || null);
      if (unassignedData?.success) setUnassignedSummary(unassignedData.data);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  function flashSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  async function handleToggleStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleToggleRole(userId, currentRole) {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!confirm(`Change this user's role to ${newRole}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAssignPhone(userId, phoneId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/assign-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phoneId: phoneId || null })
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleInspect(userId, userName) {
    if (!confirm(`Switch workspace view into ${userName}'s account?`)) return;
    try {
      await impersonateUser(userId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleClaimHistory(userId, userName) {
    if (!confirm(`Assign all unassigned legacy records to ${userName}?`)) return;
    setClaimingHistory(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/claim-history`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Claim failed.');
      flashSuccess(data.message);
      loadAllAdminData();
    } catch (err) {
      alert(err.message);
    } finally {
      setClaimingHistory(false);
    }
  }

  async function handleSubmitAdminResetPassword(e) {
    e.preventDefault();
    const { user, newPassword } = resetPasswordModal;
    if (!newPassword || newPassword.length < 8) {
      setResetPasswordModal((prev) => ({ ...prev, error: 'Password must be at least 8 characters.' }));
      return;
    }
    setResetPasswordModal((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Reset failed.');
      flashSuccess(data.message);
      setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null });
    } catch (err) {
      setResetPasswordModal((prev) => ({ ...prev, error: err.message, loading: false }));
    }
  }

  async function handleSetDefaultPhone(id) {
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess('Default workspace line updated.');
        loadAllAdminData();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeletePhone(id, displayName) {
    if (!confirm(`Remove '${displayName}' from registry?`)) return;
    try {
      const res = await fetch(`/api/admin/phone-numbers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess(data.message);
        loadAllAdminData();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="SARVYA Core — Platform Administration"
        description="Centralized tenant identity governance, RBAC permissions, WhatsApp line assignments, and system telemetry."
        actions={
          <>
            <Button variant="secondary" onClick={loadAllAdminData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-slow' : ''} /> Refresh
            </Button>
            <Button variant="primary" onClick={() => setShowPhoneModal(true)}>
              <Plus size={14} /> Add Sender Line
            </Button>
          </>
        }
      />

      {successMsg && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--status-success-bg)',
            color: 'var(--status-success-text)',
            border: '1px solid var(--status-success-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px'
          }}
        >
          <CheckCircle2 size={15} />
          <span>{successMsg}</span>
        </div>
      )}

      {unassignedSummary && (unassignedSummary.campaigns > 0 || unassignedSummary.replies > 0) && (
        <Card>
          <CardBody style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
              <Archive size={16} color="var(--sarvya-blue)" />
              <span>
                <strong>Unassigned Legacy Data:</strong> {unassignedSummary.campaigns} campaigns &amp; {unassignedSummary.replies} inbox messages awaiting owner attribution.
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={claimingHistory}
              onClick={() => handleClaimHistory(currentUser.id, currentUser.name)}
            >
              Claim to My Admin Workspace
            </Button>
          </CardBody>
        </Card>
      )}

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Admin Core sections"
        tabs={[
          { id: 'users', label: 'Users & Permissions', icon: Users, count: users.length },
          { id: 'phones', label: 'Sender Line Registry', icon: Smartphone, count: phoneNumbers.length },
          { id: 'overview', label: 'System Telemetry', icon: Activity }
        ]}
      />

      {activeTab === 'users' && (
        <DataTable
          loading={loading}
          data={users}
          ariaLabel="Platform users and permissions"
          columns={[
            {
              key: 'name',
              label: 'User',
              sortable: true,
              render: (u) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{u.email}</div>
                </div>
              )
            },
            {
              key: 'role',
              label: 'Role',
              sortable: true,
              render: (u) => (
                <Badge tone={u.role === 'ADMIN' ? 'purple' : 'neutral'}>{u.role}</Badge>
              )
            },
            {
              key: 'status',
              label: 'Status',
              sortable: true,
              render: (u) => (
                <Badge tone={u.status === 'ACTIVE' ? 'green' : 'coral'} dot>{u.status}</Badge>
              )
            },
            {
              key: 'assigned_phone_id',
              label: 'Assigned Line',
              render: (u) => (
                <select
                  className="sarvya-select"
                  value={u.assigned_phone_id || ''}
                  onChange={(e) => handleAssignPhone(u.id, e.target.value)}
                  style={{ maxWidth: '190px', padding: '5px 8px', fontSize: '12px' }}
                >
                  <option value="">Workspace Default</option>
                  {phoneNumbers.map((p) => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              )
            },
            {
              key: 'created_at',
              label: 'Joined',
              sortable: true,
              render: (u) => (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {u.created_at ? formatIndianDate(u.created_at) : '—'}
                </span>
              )
            },
            {
              key: 'actions',
              label: 'Governance',
              align: 'end',
              render: (u) => (
                <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                  <Button variant="secondary" size="sm" onClick={() => handleToggleRole(u.id, u.role)}>
                    Role
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleToggleStatus(u.id, u.status)}>
                    {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setResetPasswordModal({ open: true, user: u, newPassword: '', loading: false, error: null })}
                    title="Reset Password"
                  >
                    <Key size={12} />
                  </Button>
                  {u.id !== currentUser?.id && (
                    <Button variant="ghost" size="sm" onClick={() => handleInspect(u.id, u.name)} title="Inspect Account">
                      <Eye size={13} />
                    </Button>
                  )}
                </div>
              )
            }
          ]}
        />
      )}

      {activeTab === 'phones' && (
        <DataTable
          loading={loading}
          data={phoneNumbers}
          ariaLabel="Platform sender lines"
          columns={[
            { key: 'display_name', label: 'Display Name', sortable: true, render: (p) => <span style={{ fontWeight: 600 }}>{p.display_name}</span> },
            { key: 'phone_number', label: 'Phone Number', render: (p) => <span className="font-mono">{p.phone_number}</span> },
            { key: 'phone_number_id', label: 'Meta Phone ID', render: (p) => <span className="font-mono" style={{ fontSize: '12px' }}>{p.phone_number_id}</span> },
            {
              key: 'is_default',
              label: 'Priority',
              render: (p) => p.is_default ? <Badge tone="blue" dot>Default</Badge> : <Badge tone="neutral">Secondary</Badge>
            },
            {
              key: 'actions',
              label: 'Actions',
              align: 'end',
              render: (p) => (
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  {!p.is_default && (
                    <Button variant="secondary" size="sm" onClick={() => handleSetDefaultPhone(p.id)}>
                      <Star size={12} /> Default
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleDeletePhone(p.id, p.display_name)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              )
            }
          ]}
        />
      )}

      {activeTab === 'overview' && overview && (
        <div className="sarvya-kpi-grid">
          <KpiCard
            label="Registered Users"
            value={overview.users?.total || 0}
            meta={`${overview.users?.active || 0} active • ${overview.users?.admins || 0} admins`}
            icon={Users}
            accentTone="blue"
          />
          <KpiCard
            label="Broadcast Campaigns"
            value={overview.campaigns?.total || 0}
            meta={`${overview.campaigns?.completed || 0} completed`}
            icon={ShieldCheck}
            accentTone="purple"
          />
          <KpiCard
            label="Messages Dispatched"
            value={overview.messages?.sent || 0}
            meta={`${overview.messages?.delivered || 0} delivered`}
            icon={Smartphone}
            accentTone="green"
          />
          <KpiCard
            label="Lifecycle Automations"
            value={overview.automation?.totalAutomatedDispatches || 0}
            meta="4-stage triggers"
            icon={Activity}
            accentTone="taupe"
          />
        </div>
      )}

      <AddPhoneNumberModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSuccess={loadAllAdminData}
      />

      <Modal
        isOpen={resetPasswordModal.open}
        onClose={() => setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null })}
        title="Reset User Password"
        subtitle={resetPasswordModal.user ? `Set temporary credentials for ${resetPasswordModal.user.email}` : ''}
        icon={Key}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetPasswordModal({ open: false, user: null, newPassword: '', loading: false, error: null })}
            >
              Cancel
            </Button>
            <Button type="submit" form="admin-reset-pwd-form" variant="primary" disabled={resetPasswordModal.loading}>
              {resetPasswordModal.loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </>
        }
      >
        <form id="admin-reset-pwd-form" onSubmit={handleSubmitAdminResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {resetPasswordModal.error && (
            <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '12.5px' }}>
              {resetPasswordModal.error}
            </div>
          )}
          <div>
            <label className="sarvya-field-label" htmlFor="adminNewPwd">New Password (min 8 chars)</label>
            <input
              id="adminNewPwd"
              type="text"
              className="sarvya-input"
              value={resetPasswordModal.newPassword}
              onChange={(e) => setResetPasswordModal((prev) => ({ ...prev, newPassword: e.target.value }))}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
              let pwd = '';
              for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
              setResetPasswordModal((prev) => ({ ...prev, newPassword: pwd }));
            }}
          >
            Generate Secure Password
          </Button>
        </form>
      </Modal>
    </div>
  );
}
