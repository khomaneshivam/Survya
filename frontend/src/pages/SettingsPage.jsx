import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';
import {
  PageHeader,
  Tabs,
  Card,
  CardHeader,
  CardBody,
  DataTable,
  Badge,
  Button
} from '../components/ui';
import {
  Smartphone,
  Key,
  User,
  CheckCircle2,
  Save,
  RefreshCw,
  Copy,
  Plus,
  Trash2,
  Star,
  Bot
} from 'lucide-react';

export default function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const [connectTab, setConnectTab] = useState('channels'); // 'channels' | 'api' | 'account' | 'autoreply'
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [metaHealth, setMetaHealth] = useState(null);
  const [copied, setCopied] = useState(false);

  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [showAddPhoneModal, setShowAddPhoneModal] = useState(false);

  const [metaSettings, setMetaSettings] = useState({
    WHATSAPP_API_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '',
    WEBHOOK_VERIFY_TOKEN: '',
    BROADCAST_DELAY_MS: '250'
  });

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [autoReplySettings, setAutoReplySettings] = useState({
    autoReplyEnabled: false,
    autoReplyMode: 'ONCE_PER_CONTACT',
    autoReplyMessage: ''
  });
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  function flash(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const s = data.settings || data.data || {};
      if (data.success) {
        setMetaSettings({
          WHATSAPP_API_TOKEN: s.WHATSAPP_API_TOKEN || '',
          WHATSAPP_PHONE_NUMBER_ID: s.WHATSAPP_PHONE_NUMBER_ID || '',
          WHATSAPP_BUSINESS_ACCOUNT_ID: s.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
          WEBHOOK_VERIFY_TOKEN: s.WEBHOOK_VERIFY_TOKEN || '',
          BROADCAST_DELAY_MS: s.BROADCAST_DELAY_MS !== undefined ? String(s.BROADCAST_DELAY_MS) : '250'
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }, [token]);

  const loadPhoneNumbers = useCallback(async () => {
    try {
      const res = await fetch('/api/phone-numbers', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        setPhoneNumbers(data.data);
      }
    } catch (err) {
      console.error('Failed to load phone numbers:', err);
    }
  }, [token]);

  const loadAutoReplySettings = useCallback(async () => {
    try {
      const res = await fetch('/api/replies/auto-reply-settings', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.data) {
        setAutoReplySettings(data.data);
      }
    } catch (err) {
      console.error('Failed to load auto-reply settings:', err);
    }
  }, [token]);

  useEffect(() => {
    loadSettings();
    loadPhoneNumbers();
    loadAutoReplySettings();
  }, [loadSettings, loadPhoneNumbers, loadAutoReplySettings]);

  async function handleSetDefaultPhone(id) {
    try {
      const res = await fetch(`/api/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flash('Primary default WhatsApp line updated.');
        loadPhoneNumbers();
        loadSettings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDeletePhone(id, displayName) {
    if (!confirm(`Remove '${displayName}' from workspace channels?`)) return;
    try {
      const res = await fetch(`/api/phone-numbers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        flash(data.message || 'WhatsApp line removed.');
        loadPhoneNumbers();
        loadSettings();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleVerifyMeta() {
    setVerifying(true);
    setMetaHealth(null);
    try {
      const activeToken = token || localStorage.getItem('token');
      const res = await fetch('/api/settings/verify-meta', {
        headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
      });
      const data = await res.json();
      setMetaHealth(data);
    } catch (err) {
      setMetaHealth({ success: false, message: err.message });
    } finally {
      setVerifying(false);
    }
  }

  async function handleSaveMeta(e) {
    e.preventDefault();
    setSavingMeta(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(metaSettings)
      });
      const data = await res.json();
      if (data.success) {
        flash('Meta Cloud API configuration saved.');
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      alert('New passwords do not match.');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (data.success) {
        flash('Profile & security credentials updated.');
        setProfileForm((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        if (refreshUser) refreshUser();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveAutoReply(e) {
    e.preventDefault();
    setSavingAutoReply(true);
    try {
      const res = await fetch('/api/replies/auto-reply-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(autoReplySettings)
      });
      const data = await res.json();
      if (data.success) {
        setAutoReplySettings(data.data);
        flash('Auto-reply settings updated.');
      } else {
        alert(data.message || 'Failed to save auto-reply settings');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingAutoReply(false);
    }
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(`${window.location.origin}/webhook`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="SARVYA Connect &amp; Workspace Settings"
        description="Manage connected WhatsApp accounts, Meta Graph API credentials, webhook routing, and profile security."
        actions={
          <Button variant="primary" onClick={() => setShowAddPhoneModal(true)}>
            <Plus size={14} /> Connect WhatsApp Line
          </Button>
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

      <Tabs
        activeTab={connectTab}
        onChange={setConnectTab}
        ariaLabel="Connect and Integration sections"
        tabs={[
          { id: 'channels', label: 'Connected Accounts', icon: Smartphone, count: phoneNumbers.length },
          { id: 'api', label: 'Meta API & Webhooks', icon: Key },
          { id: 'autoreply', label: 'Auto-Reply Rules', icon: Bot },
          { id: 'account', label: 'Profile & Security', icon: User }
        ]}
      />

      {connectTab === 'channels' && (
        <DataTable
          data={phoneNumbers}
          ariaLabel="Connected WhatsApp sender accounts"
          emptyTitle="No WhatsApp channels registered"
          emptyDescription="Add your official WhatsApp Business Phone Number ID to activate campaigns and shared inbox."
          emptyAction={
            <Button variant="primary" onClick={() => setShowAddPhoneModal(true)}>
              <Plus size={14} /> Connect First Line
            </Button>
          }
          columns={[
            {
              key: 'display_name',
              label: 'Account Name',
              sortable: true,
              render: (row) => (
                <div style={{ fontWeight: 600 }}>{row.display_name}</div>
              )
            },
            {
              key: 'phone_number',
              label: 'Phone Number',
              render: (row) => <span className="font-mono">{row.phone_number}</span>
            },
            {
              key: 'phone_number_id',
              label: 'Phone Number ID',
              render: (row) => <span className="font-mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.phone_number_id}</span>
            },
            {
              key: 'is_default',
              label: 'Status',
              render: (row) => row.is_default ? <Badge tone="blue" dot>Primary Default</Badge> : <Badge tone="neutral">Standby</Badge>
            },
            {
              key: 'actions',
              label: 'Actions',
              align: 'end',
              render: (row) => (
                <div style={{ display: 'inline-flex', gap: '6px' }}>
                  {!row.is_default && (
                    <Button variant="secondary" size="sm" onClick={() => handleSetDefaultPhone(row.id)}>
                      <Star size={12} /> Set Primary
                    </Button>
                  )}
                  <Button variant="danger" size="sm" onClick={() => handleDeletePhone(row.id, row.display_name)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              )
            }
          ]}
        />
      )}

      {connectTab === 'api' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          <Card>
            <CardHeader
              title="Meta Graph API Credentials"
              subtitle="Permanent system user token & WABA configuration"
              actions={
                <Button variant="secondary" size="sm" onClick={handleVerifyMeta} disabled={verifying}>
                  <RefreshCw size={13} className={verifying ? 'spin-slow' : ''} />
                  Test Connection
                </Button>
              }
            />
            <CardBody>
              {metaHealth && (
                <div style={{
                  marginBottom: '14px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12.5px',
                  background: metaHealth.success ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                  color: metaHealth.success ? 'var(--status-success-text)' : 'var(--status-error-text)',
                  border: `1px solid ${metaHealth.success ? 'var(--status-success-border)' : 'var(--status-error-border)'}`
                }}>
                  {metaHealth.message}
                </div>
              )}

              <form onSubmit={handleSaveMeta} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="sarvya-field-label" htmlFor="waToken">System User Access Token</label>
                  <input
                    id="waToken"
                    type="password"
                    className="sarvya-input"
                    value={metaSettings.WHATSAPP_API_TOKEN}
                    onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_API_TOKEN: e.target.value })}
                    placeholder="EAAG..."
                  />
                </div>
                <div>
                  <label className="sarvya-field-label" htmlFor="waPhoneId">Default Phone Number ID</label>
                  <input
                    id="waPhoneId"
                    type="text"
                    className="sarvya-input"
                    value={metaSettings.WHATSAPP_PHONE_NUMBER_ID}
                    onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_PHONE_NUMBER_ID: e.target.value })}
                  />
                </div>
                <div>
                  <label className="sarvya-field-label" htmlFor="waWabaId">WhatsApp Business Account ID (WABA)</label>
                  <input
                    id="waWabaId"
                    type="text"
                    className="sarvya-input"
                    value={metaSettings.WHATSAPP_BUSINESS_ACCOUNT_ID}
                    onChange={(e) => setMetaSettings({ ...metaSettings, WHATSAPP_BUSINESS_ACCOUNT_ID: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="sarvya-field-label" htmlFor="waVerify">Webhook Verify Token</label>
                    <input
                      id="waVerify"
                      type="text"
                      className="sarvya-input"
                      value={metaSettings.WEBHOOK_VERIFY_TOKEN}
                      onChange={(e) => setMetaSettings({ ...metaSettings, WEBHOOK_VERIFY_TOKEN: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="sarvya-field-label" htmlFor="waDelay">Dispatch Throttle (ms)</label>
                    <input
                      id="waDelay"
                      type="number"
                      min="0"
                      className="sarvya-input"
                      value={metaSettings.BROADCAST_DELAY_MS}
                      onChange={(e) => setMetaSettings({ ...metaSettings, BROADCAST_DELAY_MS: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <Button type="submit" variant="primary" disabled={savingMeta}>
                    <Save size={14} /> {savingMeta ? 'Saving...' : 'Save API Credentials'}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Webhook Callback Endpoint" subtitle="Configure in Meta App Dashboard > WhatsApp > Configuration" />
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div className="sarvya-field-label">Callback URL</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="sarvya-input font-mono"
                    value={`${window.location.origin}/webhook`}
                    style={{ fontSize: '12px' }}
                  />
                  <Button type="button" variant="secondary" onClick={copyWebhookUrl}>
                    <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Subscribe to webhook fields: <strong>messages</strong> and <strong>message_template_status_update</strong> to enable real-time delivery tracking and 2-way Inbox synchronization.
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {connectTab === 'autoreply' && (
        <Card>
          <CardHeader title="Inbound Auto-Reply Configuration" subtitle="Mirrors SARVYA AI automatic responder settings" />
          <CardBody>
            <form onSubmit={handleSaveAutoReply} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '640px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(autoReplySettings.autoReplyEnabled)}
                  onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyEnabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--sarvya-blue)' }}
                />
                Enable automatic first-contact acknowledgement
              </label>
              <div>
                <label className="sarvya-field-label" htmlFor="settingsAutoMode">Dispatch Rule</label>
                <select
                  id="settingsAutoMode"
                  className="sarvya-select"
                  value={autoReplySettings.autoReplyMode || 'ONCE_PER_CONTACT'}
                  onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyMode: e.target.value })}
                >
                  <option value="ONCE_PER_CONTACT">Once per contact conversation</option>
                  <option value="EVERY_MESSAGE">Every inbound message</option>
                </select>
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="settingsAutoMsg">Auto-Reply Message</label>
                <textarea
                  id="settingsAutoMsg"
                  rows={4}
                  className="sarvya-textarea"
                  value={autoReplySettings.autoReplyMessage || ''}
                  onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyMessage: e.target.value })}
                />
              </div>
              <div>
                <Button type="submit" variant="primary" disabled={savingAutoReply}>
                  <Save size={14} /> {savingAutoReply ? 'Saving...' : 'Save Auto-Reply Settings'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {connectTab === 'account' && (
        <Card>
          <CardHeader title="Operator Profile &amp; Password" subtitle="Manage your signed-in workspace identity" />
          <CardBody>
            <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', maxWidth: '720px' }}>
              <div>
                <label className="sarvya-field-label" htmlFor="profName">Full Name</label>
                <input
                  id="profName"
                  type="text"
                  className="sarvya-input"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="profPhone">Phone</label>
                <input
                  id="profPhone"
                  type="text"
                  className="sarvya-input"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="profCurPwd">Current Password</label>
                <input
                  id="profCurPwd"
                  type="password"
                  className="sarvya-input"
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                />
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="profNewPwd">New Password</label>
                <input
                  id="profNewPwd"
                  type="password"
                  className="sarvya-input"
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                />
              </div>
              <div>
                <label className="sarvya-field-label" htmlFor="profConfirmPwd">Confirm New Password</label>
                <input
                  id="profConfirmPwd"
                  type="password"
                  className="sarvya-input"
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="primary" disabled={savingProfile}>
                  <Save size={14} /> {savingProfile ? 'Updating...' : 'Update Profile'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <AddPhoneNumberModal
        isOpen={showAddPhoneModal}
        onClose={() => setShowAddPhoneModal(false)}
        onSuccess={() => {
          loadPhoneNumbers();
          loadSettings();
          flash('WhatsApp line registered successfully.');
        }}
      />
    </div>
  );
}
