import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  PageHeader,
  Tabs,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Button,
  Modal
} from '../components/ui';
import {
  User,
  Key,
  Smartphone,
  Save,
  CheckCircle2,
  AlertCircle,
  Bot,
  Clock,
  Shield,
  ShieldCheck,
  RefreshCw,
  Plus,
  KeyRound,
  ExternalLink,
  Copy,
  Star,
  CreditCard,
  FileText,
  Download,
  Sparkles,
  Zap
} from 'lucide-react';
import { formatIndianDate } from '../utils/indianTime';
import AddPhoneNumberModal from '../components/AddPhoneNumberModal';

export default function SettingsPage() {
  const { user, token, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('lines'); // lines | profile | security | autoreply
  const [savingProfile, setSavingProfile] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Profile Form
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Phone Lines Registry
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [loadingPhones, setLoadingPhones] = useState(true);
  const [testingLineId, setTestingLineId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [settingDefaultId, setSettingDefaultId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalInitialData, setAddModalInitialData] = useState(null);

  // Update Permanent Token Modal State
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenModalPhone, setTokenModalPhone] = useState(null);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [tokenModalError, setTokenModalError] = useState(null);

  // Auto Reply Settings
  const [autoReplySettings, setAutoReplySettings] = useState({
    autoReplyEnabled: true,
    autoReplyMode: 'ONCE_PER_CONTACT',
    autoReplyMessage: ''
  });
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Billing & Subscriptions State
  const [billingData, setBillingData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('GROWTH');
  const [billingCycle, setBillingCycle] = useState('MONTHLY');
  const [customerStateCode, setCustomerStateCode] = useState('27');
  const [checkoutGstin, setCheckoutGstin] = useState('');
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [checkoutBreakdown, setCheckoutBreakdown] = useState(null);
  const [processingCheckout, setProcessingCheckout] = useState(false);

  function flashSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  function flashError(msg) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  }

  const loadBillingData = useCallback(async () => {
    if (!token) return;
    setLoadingBilling(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [subRes, invRes] = await Promise.all([
        fetch('/api/v1/billing/subscription', { headers }),
        fetch('/api/v1/billing/invoices', { headers })
      ]);
      const subData = await subRes.json();
      const invData = await invRes.json();
      if (subData.success) setBillingData(subData.data);
      if (invData.success) setInvoices(invData.data || []);
    } catch (err) {
      console.warn('[Billing] Failed to load billing telemetry:', err);
    } finally {
      setLoadingBilling(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'billing') {
      loadBillingData();
    }
  }, [activeTab, loadBillingData]);

  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || ''
      }));
    }
  }, [user]);

  // Load All Registered Phone Lines
  const loadPhoneNumbers = useCallback(async () => {
    setLoadingPhones(true);
    try {
      const res = await fetch('/api/phone-numbers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setPhoneNumbers(data.data);
      }
    } catch (e) {
      console.warn('Failed to load phone numbers:', e);
    } finally {
      setLoadingPhones(false);
    }
  }, [token]);

  // Load Auto-reply settings
  const loadAutoReplySettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        const s = data.settings || data.data || {};
        setAutoReplySettings({
          autoReplyEnabled: s.AUTO_REPLY_ENABLED === 'true' || s.AUTO_REPLY_ENABLED === true,
          autoReplyMode: s.AUTO_REPLY_MODE || 'ONCE_PER_CONTACT',
          autoReplyMessage: s.AUTO_REPLY_MESSAGE || ''
        });
      }
    } catch (e) {}
  }, [token]);

  useEffect(() => {
    loadPhoneNumbers();
    loadAutoReplySettings();
  }, [loadPhoneNumbers, loadAutoReplySettings]);

  // Test live connection with Meta Graph API
  async function handleTestLine(line) {
    setTestingLineId(line.id);
    setTestResult(null);
    const startTime = Date.now();
    try {
      const res = await fetch(`/api/phone-numbers/${line.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const latency = Date.now() - startTime;
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to verify with Meta Graph API.');
      }
      setTestResult({
        id: line.id,
        success: true,
        latency,
        message: data.message || `Connected to ${line.display_name} in ${latency}ms.`
      });
      flashSuccess(`✓ Verified with Meta: '${line.display_name}' (${data.data?.phone_number || line.phone_number}) is CONNECTED (${latency}ms)!`);
      loadPhoneNumbers();
    } catch (err) {
      setTestResult({
        id: line.id,
        success: false,
        message: err.message
      });
      flashError(`Meta Connection Error: ${err.message}`);
    } finally {
      setTestingLineId(null);
    }
  }

  // Set line as Default sender
  async function handleSetDefault(id) {
    setSettingDefaultId(id);
    try {
      const res = await fetch(`/api/phone-numbers/${id}/default`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        flashSuccess(data.message || 'Primary default sender line updated.');
        loadPhoneNumbers();
      } else {
        flashError(data.message || 'Failed to set default sender line.');
      }
    } catch (err) {
      flashError(err.message);
    } finally {
      setSettingDefaultId(null);
    }
  }

  // Open Update Token Modal
  function handleOpenTokenModal(phone) {
    setTokenModalPhone(phone);
    setTokenInput('');
    setTokenModalError(null);
    setTokenModalOpen(true);
  }

  // Submit Update Permanent Token
  async function handleSaveToken(e) {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setTokenModalError('Please enter a valid Meta Bearer Access Token.');
      return;
    }
    setSavingToken(true);
    setTokenModalError(null);
    try {
      const res = await fetch(`/api/phone-numbers/${tokenModalPhone.id}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          token: tokenInput.trim(),
          tokenType: 'PERMANENT'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Meta rejected the token. Please check token permissions.');
      }
      flashSuccess(data.message || 'Permanent token verified and saved successfully!');
      setTokenModalOpen(false);
      setTokenModalPhone(null);
      setTokenInput('');
      loadPhoneNumbers();
    } catch (err) {
      setTokenModalError(err.message);
    } finally {
      setSavingToken(false);
    }
  }

  // Save Profile Details
  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileForm.name,
          phone: profileForm.phone
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update profile');
      flashSuccess('Profile details updated successfully.');
      if (refreshUser) refreshUser();
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  // Change Password
  async function handleChangePassword(e) {
    e.preventDefault();
    if (!profileForm.currentPassword) {
      flashError('Current password is required.');
      return;
    }
    if (!profileForm.newPassword || profileForm.newPassword.length < 8) {
      flashError('New password must be at least 8 characters long.');
      return;
    }
    if (profileForm.newPassword !== profileForm.confirmPassword) {
      flashError('New password and confirmation do not match.');
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
        body: JSON.stringify({
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to change password');
      flashSuccess('Your password has been changed successfully.');
      setProfileForm((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  // Save Auto Reply
  async function handleSaveAutoReply(e) {
    e.preventDefault();
    setSavingAutoReply(true);
    try {
      const res = await fetch('/api/settings/auto-reply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(autoReplySettings)
      });
      const data = await res.json();
      if (data.success) {
        flashSuccess('Auto-reply configuration saved.');
      } else {
        flashError(data.message || 'Failed to save auto-reply settings.');
      }
    } catch (err) {
      flashError(err.message);
    } finally {
      setSavingAutoReply(false);
    }
  }

  async function handleOpenCheckout(planCode) {
    setSelectedPlan(planCode);
    setShowCheckoutModal(true);
    try {
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          planCode,
          billingCycle,
          customerStateCode,
          gstin: checkoutGstin,
          billingAddress: checkoutAddress
        })
      });
      const data = await res.json();
      if (data.success) {
        setCheckoutBreakdown(data.breakdown);
      }
    } catch (e) {}
  }

  async function handleCompletePayment() {
    setProcessingCheckout(true);
    try {
      const res = await fetch('/api/v1/billing/webhook/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-razorpay-signature': 'mock_signature'
        },
        body: JSON.stringify({
          event: 'payment.captured',
          payment: {
            id: `pay_${Date.now()}`,
            notes: {
              tenant_id: user?.tenant_id,
              plan_code: selectedPlan,
              billing_cycle: billingCycle,
              customer_state_code: customerStateCode
            }
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Payment processing failed.');
      }
      flashSuccess(`Subscription successfully activated! GST Tax Invoice ${data.invoiceNumber} generated.`);
      setShowCheckoutModal(false);
      await loadBillingData();
      if (refreshUser) refreshUser();
    } catch (err) {
      flashError(err.message);
    } finally {
      setProcessingCheckout(false);
    }
  }

  const tabs = [
    { id: 'lines', label: 'WhatsApp Sender Lines & Tokens', icon: Smartphone },
    { id: 'billing', label: 'Billing & GST Invoices', icon: CreditCard },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'security', label: 'Security & Password', icon: Key },
    { id: 'autoreply', label: 'Inbound Auto-Reply', icon: Bot }
  ];

  return (
    <div className="app-content-container" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <PageHeader
        title="Settings & Sender Management"
        description="Manage your verified WhatsApp Business sender lines, permanent System User tokens, and staff account security."
      />

      {successMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--status-success-bg, #EDF3E7)',
          color: 'var(--status-success-text, #4C7A2B)',
          border: '1px solid var(--status-success-border, #C3D1AC)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 600
        }}>
          <CheckCircle2 size={16} /> {successMsg}
        </div>
      )}

      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          background: 'var(--color-danger-subtle, #fef2f2)',
          color: 'var(--color-danger, #dc2626)',
          border: '1px solid var(--color-danger-border, #fecaca)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px',
          fontWeight: 600
        }}>
          <AlertCircle size={16} /> {errorMsg}
        </div>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* =========================================================================
          TAB 1: WHATSAPP SENDER LINES & PERMANENT TOKENS
          ========================================================================= */}
      {activeTab === 'lines' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Registered WhatsApp Sender Lines
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Each phone line connects directly to Meta Cloud API for bulk broadcasting and real-time chat.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setAddModalInitialData(null);
                setShowAddModal(true);
              }}
            >
              <Plus size={15} />
              <span>Register New WhatsApp Line</span>
            </Button>
          </div>

          {/* Permanent Token Architecture Guide Card */}
          <div style={{
            padding: '16px 18px',
            borderRadius: '10px',
            background: 'var(--color-info-subtle, #f0fdf4)',
            border: '1px solid var(--color-info-border, #bbf7d0)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#166534', fontSize: '14px' }}>
                <ShieldCheck size={18} color="#16a34a" />
                <span>How to Create a Never-Expiring Meta Permanent System User Token</span>
              </div>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#15803d',
                  textDecoration: 'none',
                  background: '#dcfce7',
                  padding: '4px 10px',
                  borderRadius: '6px'
                }}
              >
                <span>Open Meta Business Settings</span>
                <ExternalLink size={12} />
              </a>
            </div>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#14532d', lineHeight: 1.5 }}>
              Temporary tokens generated in the Graph API Explorer expire after 24 hours. For reliable 24/7 campaigns, generate a <strong>Permanent System User Access Token</strong>:
            </p>
            <ol style={{ margin: '4px 0 0', paddingLeft: '20px', fontSize: '12px', color: '#166534', lineHeight: 1.6 }}>
              <li>Go to <strong>Meta Business Suite &gt; Business Settings &gt; Users &gt; System Users</strong>.</li>
              <li>Click <strong>Add</strong> to create a System User (set role to <strong>Admin</strong>), then assign your WhatsApp App as an asset.</li>
              <li>Click <strong>Generate New Token</strong>, select permissions <code>whatsapp_business_messaging</code> &amp; <code>whatsapp_business_management</code>, and choose <strong>Never</strong> for expiration.</li>
              <li>Click <strong>"Update Permanent Token"</strong> on your phone line below and paste the token to verify and save it permanently!</li>
            </ol>
          </div>

          {/* Phone Numbers List */}
          {loadingPhones ? (
            <Card>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={22} className="spin-slow" style={{ margin: '0 auto 8px' }} />
                  <div>Loading registered WhatsApp sender lines...</div>
                </div>
              </CardBody>
            </Card>
          ) : phoneNumbers.length === 0 ? (
            <Card>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <Smartphone size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                  <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: 'var(--text-primary)' }}>No WhatsApp Lines Registered</h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto 16px' }}>
                    Connect your Meta Cloud API Phone Number ID and Permanent Access Token to start broadcasting.
                  </p>
                  <Button variant="primary" onClick={() => setShowAddModal(true)}>
                    <Plus size={15} /> Add First Phone Line
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' }}>
              {phoneNumbers.map((line) => {
                const isTesting = testingLineId === line.id;
                const isSettingDefault = settingDefaultId === line.id;
                const isDefault = Boolean(line.is_default);

                return (
                  <Card key={line.id} style={{
                    border: isDefault ? '2px solid var(--sarvya-primary, #2F5219)' : '1px solid var(--border-color)',
                    background: 'var(--bg-card)'
                  }}>
                    <CardBody style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      
                      {/* Top Row: Name, Status, Default Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {line.display_name}
                            </h4>
                            {isDefault && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: '#EDF4E6',
                                color: '#2F5219',
                                border: '1px solid #C3D1AC',
                                padding: '2px 8px',
                                borderRadius: '12px'
                              }}>
                                <Star size={11} fill="#2F5219" /> Default Line
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--sarvya-blue)', marginTop: '3px' }}>
                            {line.phone_number}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <Badge variant="success">
                            {line.status || 'CONNECTED'}
                          </Badge>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Quality: <strong>{line.quality_rating || 'GREEN'}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Meta Identifiers & Token Badge */}
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: 'var(--bg-app)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        fontSize: '12px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Phone Number ID:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {line.phone_number_id}
                          </span>
                        </div>

                        {line.waba_id && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)' }}>WABA ID:</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                              {line.waba_id}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed var(--border-color)' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Token Storage:</span>
                          {line.has_token ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: '#15803d',
                              fontWeight: 600,
                              fontFamily: 'monospace'
                            }}>
                              <ShieldCheck size={13} color="#16a34a" />
                              <span>{line.access_token_preview || 'Permanent Token Active'}</span>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              Global Fallback Token
                            </span>
                          )}
                        </div>

                        {line.last_verified_at && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <span>Last Verified with Meta:</span>
                            <span>{new Date(line.last_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Controls */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleTestLine(line)}
                            disabled={isTesting}
                            title="Ping Meta Graph API live to verify token and line connectivity"
                          >
                            <RefreshCw size={13} className={isTesting ? 'spin-slow' : ''} />
                            <span>{isTesting ? 'Pinging Meta...' : 'Test Connection'}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenTokenModal(line)}
                            title="Update or replace permanent System User Token for this line"
                          >
                            <Key size={13} />
                            <span>Update Token</span>
                          </Button>
                        </div>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!isDefault && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSetDefault(line.id)}
                              disabled={isSettingDefault}
                              title="Set this line as default sender for broadcast and automated messages"
                            >
                              <Star size={13} />
                              <span>{isSettingDefault ? 'Setting...' : 'Set Default'}</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setAddModalInitialData({
                                phone_number_id: line.phone_number_id,
                                display_name: line.display_name,
                                phone_number: line.phone_number,
                                waba_id: line.waba_id,
                                is_default: line.is_default,
                                mode: 'meta_pin'
                              });
                              setShowAddModal(true);
                            }}
                            title="Register 2-step verification PIN with Meta"
                          >
                            <KeyRound size={13} />
                            <span>PIN</span>
                          </Button>
                        </div>
                      </div>

                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB: SUBSCRIPTION, PRICING & GST INVOICES (SAC 998314)
          ========================================================================= */}
      {activeTab === 'billing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Active Subscription & Quota Card */}
          <Card>
            <CardHeader
              title="Active Subscription & Resource Quotas"
              icon={CreditCard}
              action={
                <Button
                  variant="primary"
                  onClick={() => handleOpenCheckout(billingData?.planCode === 'GROWTH' ? 'ENTERPRISE' : 'GROWTH')}
                >
                  <Sparkles size={14} /> Upgrade Plan
                </Button>
              }
            />
            <CardBody>
              {loadingBilling ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Loading billing and subscription telemetry...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingBottom: '14px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Current Plan</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {billingData?.planCode || 'TRIAL'}
                        </span>
                        <Badge variant={billingData?.subscriptionStatus === 'ACTIVE' ? 'success' : 'warning'}>
                          {billingData?.subscriptionStatus || 'TRIALING'}
                        </Badge>
                      </div>
                      {billingData?.trialEndsAt && (
                        <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '2px' }}>
                          7-Day Trial expires on: {billingData.trialEndsAt.slice(0, 10)}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Billing Entity</div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{billingData?.tenantName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        GSTIN: {billingData?.gstin || 'Unregistered'}
                      </div>
                    </div>
                  </div>

                  {/* Quota Usage Meters */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                    <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600 }}>WhatsApp Lines</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {billingData?.usage?.wabaLinesUsed || 0} / {billingData?.usage?.wabaLinesLimit || 1}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, ((billingData?.usage?.wabaLinesUsed || 0) / (billingData?.usage?.wabaLinesLimit || 1)) * 100)}%`,
                            height: '100%',
                            background: 'var(--sarvya-blue)'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600 }}>Monthly Messages</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {billingData?.usage?.messagesUsed || 0} / {(billingData?.usage?.messagesLimit || 1000).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, ((billingData?.usage?.messagesUsed || 0) / (billingData?.usage?.messagesLimit || 1000)) * 100)}%`,
                            height: '100%',
                            background: '#10b981'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Pricing Tiers Comparison Cards */}
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Choose a Plan that Scales with Your Business</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              {/* Starter Plan */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '20px', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>Starter</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>For single-location businesses &amp; boutique resorts</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '12px', color: 'var(--text-primary)' }}>
                    ₹1,499 <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>/ month</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>+ 18% GST (₹269.82)</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>✓ 1 WhatsApp Business Line</li>
                    <li>✓ 10,000 Messages / month</li>
                    <li>✓ Full CRM &amp; Booking Pipelines</li>
                    <li>✓ Meta 131049 Delivery Shield</li>
                    <li>✓ 24h Standard Support</li>
                  </ul>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Button
                    variant="secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleOpenCheckout('STARTER')}
                  >
                    Select Starter
                  </Button>
                </div>
              </div>

              {/* Growth Plan (Popular) */}
              <div style={{ border: '2px solid #2563eb', borderRadius: '10px', padding: '20px', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-11px', right: '16px', background: '#2563eb', color: '#fff', fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', textTransform: 'uppercase' }}>
                  Most Popular
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>Growth</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>For fast-growing hospitality chains &amp; clinics</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '12px', color: '#2563eb' }}>
                    ₹3,999 <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>/ month</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>+ 18% GST (₹719.82)</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>✓ 3 WhatsApp Business Lines</li>
                    <li>✓ 50,000 Messages / month</li>
                    <li>✓ <strong>Meta v4 Coexistence Mode</strong></li>
                    <li>✓ AI Knowledge Agent &amp; Copilot</li>
                    <li>✓ Rate Discussion &amp; Negotiation Engine</li>
                    <li>✓ Priority Support (4h SLA)</li>
                  </ul>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Button
                    variant="primary"
                    style={{ width: '100%', justifyContent: 'center', background: '#2563eb' }}
                    onClick={() => handleOpenCheckout('GROWTH')}
                  >
                    Select Growth
                  </Button>
                </div>
              </div>

              {/* Enterprise Plan */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '20px', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>Enterprise</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>For large operators &amp; digital marketing agencies</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '12px', color: 'var(--text-primary)' }}>
                    ₹9,999 <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>/ month</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>+ 18% GST (₹1,799.82)</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li>✓ 10 WhatsApp Business Lines</li>
                    <li>✓ 200,000 Messages / month</li>
                    <li>✓ <strong>Agency White-Label Multi-Workspace</strong></li>
                    <li>✓ RBI-Safe Direct Merchant Gateway</li>
                    <li>✓ Dedicated Account Manager (1h SLA)</li>
                  </ul>
                </div>
                <div style={{ marginTop: '20px' }}>
                  <Button
                    variant="secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleOpenCheckout('ENTERPRISE')}
                  >
                    Select Enterprise
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Past GST Tax Invoices Table */}
          <Card>
            <CardHeader title="GST Tax Invoices (SAC 998314)" icon={FileText} />
            <CardBody>
              {invoices.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No past invoices generated yet. Invoices appear here automatically upon subscription activation.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="sarvya-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 14px' }}>Invoice Number</th>
                        <th style={{ padding: '10px 14px' }}>Date</th>
                        <th style={{ padding: '10px 14px' }}>Plan</th>
                        <th style={{ padding: '10px 14px' }}>Cycle</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Taxable (₹)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>GST 18% (₹)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total (₹)</th>
                        <th style={{ padding: '10px 14px' }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, fontFamily: 'monospace' }}>
                            {inv.invoice_number || `INV-${inv.id}`}
                          </td>
                          <td style={{ padding: '10px 14px' }}>{inv.created_at ? inv.created_at.slice(0, 10) : '-'}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{inv.plan_code}</td>
                          <td style={{ padding: '10px 14px' }}>{inv.billing_cycle}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>₹{Number(inv.amount_inr).toFixed(2)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>₹{Number(inv.gst_inr).toFixed(2)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>₹{Number(inv.total_inr).toFixed(2)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge variant={inv.status === 'ACTIVE' ? 'success' : 'neutral'}>PAID</Badge>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <a
                              href={`/api/v1/billing/invoices/${inv.invoice_number || inv.id}/html`}
                              target="_blank"
                              rel="noreferrer"
                              className="sarvya-btn sarvya-btn-secondary sarvya-btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                            >
                              <Download size={13} />
                              <span>HTML</span>
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Checkout & GST Breakdown Modal */}
          <Modal
            isOpen={showCheckoutModal}
            onClose={() => setShowCheckoutModal(false)}
            title={`Subscribe to SARVYA ${selectedPlan} Plan`}
            size="md"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Billing Cycle
                  </label>
                  <select
                    className="sarvya-input"
                    value={billingCycle}
                    onChange={(e) => {
                      setBillingCycle(e.target.value);
                      handleOpenCheckout(selectedPlan);
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly (2 Months Free)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    Customer State (Place of Supply)
                  </label>
                  <select
                    className="sarvya-input"
                    value={customerStateCode}
                    onChange={(e) => {
                      setCustomerStateCode(e.target.value);
                      handleOpenCheckout(selectedPlan);
                    }}
                    style={{ width: '100%' }}
                  >
                    <option value="27">27 - Maharashtra (CGST 9% + SGST 9%)</option>
                    <option value="29">29 - Karnataka (IGST 18%)</option>
                    <option value="07">07 - Delhi (IGST 18%)</option>
                    <option value="33">33 - Tamil Nadu (IGST 18%)</option>
                    <option value="99">Other State (IGST 18%)</option>
                  </select>
                </div>
              </div>

              {/* Tax Invoice SAC 998314 Breakdown */}
              {checkoutBreakdown && (
                <div style={{ padding: '14px', borderRadius: '8px', background: 'var(--surface-hover)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                    GST Tax Calculation (SAC {checkoutBreakdown.sacCode})
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Taxable Base Value:</span>
                    <span>₹{checkoutBreakdown.baseAmount.toFixed(2)}</span>
                  </div>
                  {checkoutBreakdown.isMaharashtra ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        <span>Central GST (CGST @ 9%):</span>
                        <span>₹{checkoutBreakdown.cgst.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        <span>State GST (SGST @ 9%):</span>
                        <span>₹{checkoutBreakdown.sgst.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                      <span>Integrated GST (IGST @ 18%):</span>
                      <span>₹{checkoutBreakdown.igst.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '14.5px', color: 'var(--sarvya-blue)' }}>
                    <span>Grand Total:</span>
                    <span>₹{checkoutBreakdown.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
                <Button variant="secondary" onClick={() => setShowCheckoutModal(false)} disabled={processingCheckout}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleCompletePayment} disabled={processingCheckout}>
                  {processingCheckout ? 'Processing Payment...' : 'Pay with Razorpay (Instant Activation)'}
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      )}
      {activeTab === 'profile' && (
        <Card style={{ maxWidth: '560px' }}>
          <CardHeader title="Account Details" icon={User} />
          <CardBody>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  placeholder="Your full name"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  className="sarvya-input"
                  style={{ width: '100%', opacity: 0.7 }}
                  value={profileForm.email}
                  disabled
                  title="Email cannot be modified directly."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="e.g. 919876543210"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button type="submit" variant="primary" disabled={savingProfile}>
                  <Save size={14} /> {savingProfile ? 'Saving...' : 'Save Profile'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* =========================================================================
          TAB 3: SECURITY & PASSWORD MANAGEMENT
          ========================================================================= */}
      {activeTab === 'security' && (
        <Card style={{ maxWidth: '560px' }}>
          <CardHeader title="Change Account Password" icon={Key} />
          <CardBody>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Current Password
                </label>
                <input
                  type="password"
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={profileForm.currentPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                  placeholder="Enter current password"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  New Password
                </label>
                <input
                  type="password"
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={profileForm.newPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, newPassword: e.target.value })}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Confirm New Password
                </label>
                <input
                  type="password"
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={profileForm.confirmPassword}
                  onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                  placeholder="Re-type new password"
                  required
                  minLength={8}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button type="submit" variant="primary" disabled={savingProfile}>
                  <Key size={14} /> {savingProfile ? 'Updating Password...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* =========================================================================
          TAB 4: INBOUND AUTO-REPLY
          ========================================================================= */}
      {activeTab === 'autoreply' && (
        <Card style={{ maxWidth: '640px' }}>
          <CardHeader title="Automated Inbound Greeting & Response" icon={Bot} />
          <CardBody>
            <form onSubmit={handleSaveAutoReply} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                When customers message your business WhatsApp number or click your chat links, SARVYA can immediately send an automated acknowledgment.
              </p>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={autoReplySettings.autoReplyEnabled}
                    onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyEnabled: e.target.checked })}
                  />
                  Enable Automated Greeting on First Inbound Message
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Dispatch Frequency
                </label>
                <select
                  className="sarvya-input"
                  style={{ width: '100%' }}
                  value={autoReplySettings.autoReplyMode}
                  onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyMode: e.target.value })}
                >
                  <option value="ONCE_PER_CONTACT">Once Per Customer (Prevents Spam)</option>
                  <option value="ALWAYS">On Every Inbound Message</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Auto-Reply Message Text (supports {'{{name}}'} variable)
                </label>
                <textarea
                  className="sarvya-input"
                  rows={4}
                  style={{ width: '100%', resize: 'vertical' }}
                  value={autoReplySettings.autoReplyMessage}
                  onChange={(e) => setAutoReplySettings({ ...autoReplySettings, autoReplyMessage: e.target.value })}
                  placeholder="Hi {{name}}, thank you for reaching out! Our team has received your message and will reply shortly."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <Button type="submit" variant="primary" disabled={savingAutoReply}>
                  <Save size={14} /> {savingAutoReply ? 'Saving...' : 'Save Greeting Settings'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* =========================================================================
          MODAL: UPDATE PERMANENT TOKEN
          ========================================================================= */}
      <Modal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        title={`Update Permanent Token — ${tokenModalPhone?.display_name || 'Line'}`}
        subtitle={`Set a non-expiring System User Token for Meta Phone ID: ${tokenModalPhone?.phone_number_id || ''}`}
        icon={Key}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTokenModalOpen(false)} disabled={savingToken}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveToken} disabled={savingToken}>
              <ShieldCheck size={14} />
              <span>{savingToken ? 'Verifying with Meta...' : 'Verify & Save Token'}</span>
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {tokenModalError && (
            <div style={{
              padding: '10px 12px',
              borderRadius: '6px',
              background: 'var(--status-error-bg)',
              color: 'var(--status-error-text)',
              border: '1px solid var(--status-error-border)',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{tokenModalError}</span>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Meta Permanent Access Token (System User Token) *
              </label>
              <a
                href="https://business.facebook.com/settings/system-users"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '11.5px', color: 'var(--sarvya-blue)', fontWeight: 600, textDecoration: 'none' }}
              >
                Meta System Users ↗
              </a>
            </div>
            <textarea
              className="sarvya-input font-mono"
              rows={4}
              style={{ width: '100%', resize: 'vertical', fontSize: '12.5px' }}
              placeholder="Paste Bearer token (starts with EAAV... or EAAB...)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              required
            />
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
              The system will ping Meta Graph API immediately to test that this token has permission to send messages from <strong>{tokenModalPhone?.phone_number_id}</strong> before saving.
            </div>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL: ADD / REGISTER NEW PHONE NUMBER
          ========================================================================= */}
      <AddPhoneNumberModal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setAddModalInitialData(null);
        }}
        onSuccess={() => {
          flashSuccess('WhatsApp phone line registered and synchronized successfully!');
          loadPhoneNumbers();
        }}
        initialData={addModalInitialData}
      />

    </div>
  );
}
