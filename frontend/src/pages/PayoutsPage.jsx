import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { DataTable, HelpTip } from '../components/ui';
import {
  Landmark,
  Building,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  Plus,
  RefreshCw,
  Wallet,
  Receipt,
  ExternalLink,
  X,
  CreditCard
} from 'lucide-react';

export default function PayoutsPage() {
  const { token } = useAuth();

  const [entities, setEntities] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [savingPaymentMode, setSavingPaymentMode] = useState(false);
  const [loading, setLoading] = useState(true);

  const settlementColumns = useMemo(() => [
    {
      key: 'settled_at',
      header: 'Settlement Date & Time',
      sortable: true,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>
            {new Date(row.settled_at || row.created_at).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {new Date(row.settled_at || row.created_at).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      )
    },
    {
      key: 'payout_batch_id',
      header: 'Batch Reference',
      sortable: true,
      render: (v) => (
        <span style={{ fontSize: '12px', fontFamily: 'monospace', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '4px' }}>
          {v}
        </span>
      )
    },
    {
      key: 'gross_amount',
      header: 'Gross Collected',
      align: 'right',
      sortable: true,
      render: (v) => <span className="tabular-nums" style={{ fontWeight: 600 }}>₹{Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
    },
    {
      key: 'platform_fee',
      header: 'Platform Fee (2%)',
      align: 'right',
      sortable: true,
      render: (_, row) => (
        <span className="tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: '12.5px' }}>
          -₹{(Number(row.platform_fee) + Number(row.tax_on_fee)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'net_payout_amount',
      header: 'Net Dispatched to Bank',
      align: 'right',
      sortable: true,
      render: (v) => (
        <span className="tabular-nums" style={{ fontWeight: 700, color: '#16A34A', fontSize: '13.5px' }}>
          ₹{Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'bank_utr',
      header: 'Bank IMPS UTR',
      sortable: true,
      render: (v) => (
        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
          {v}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: () => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          background: 'var(--status-success-bg)',
          color: 'var(--status-success-text)',
          border: '1px solid var(--status-success-border)',
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11.5px',
          fontWeight: 700
        }}>
          <CheckCircle2 size={12} />
          Settled
        </span>
      )
    }
  ], []);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Modals
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    ifsc_code: '',
    account_type: 'CURRENT'
  });

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Fetch Entities
  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/entities', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.entities.length > 0) {
        setEntities(data.entities);
        if (!selectedEntityId) {
          setSelectedEntityId(data.entities[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load entities:', err);
    }
  }, [token, selectedEntityId]);

  // 2. Fetch Payout Telemetry
  const fetchPayoutData = useCallback(async (entityId) => {
    if (!entityId) return;
    setLoading(true);
    try {
      const [summaryRes, ledgerRes, benRes, configRes] = await Promise.all([
        fetch(`/api/v1/entities/${entityId}/payouts/summary`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/entities/${entityId}/payouts/ledger`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/entities/${entityId}/payouts/beneficiaries`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`/api/v1/entities/${entityId}/payment-config`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => null)
      ]);

      const summaryData = await summaryRes.json();
      const ledgerData = await ledgerRes.json();
      const benData = await benRes.json();
      const configData = configRes && configRes.ok ? await configRes.json() : null;

      if (summaryData.success) setSummary(summaryData.summary);
      if (ledgerData.success) setLedger(ledgerData.ledger);
      if (benData.success) setBeneficiaries(benData.beneficiaries);
      if (configData?.success) setPaymentConfig(configData.config);
    } catch (err) {
      showToast('Error loading payout information', 'error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  useEffect(() => {
    if (selectedEntityId) {
      fetchPayoutData(selectedEntityId);
    }
  }, [selectedEntityId, fetchPayoutData]);

  const currentEntity = entities.find(e => e.id === Number(selectedEntityId)) || entities[0];
  const primaryBeneficiary = summary?.primaryBeneficiary;

  // 3. Trigger Penny Drop
  const handlePennyDrop = async (beneficiaryId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/payouts/beneficiaries/${beneficiaryId}/verify-penny-drop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Bank verified with Penny-Drop!');
        fetchPayoutData(selectedEntityId);
      } else {
        showToast(data.message || 'Verification failed', 'error');
      }
    } catch (err) {
      showToast('Error verifying bank account', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 3b. Update Payment Gateway Mode (RBI PA/PG Master Directions)
  const handlePaymentModeChange = async (newMode) => {
    setSavingPaymentMode(true);
    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/payment-config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...(paymentConfig || {}),
          payment_mode: newMode
        })
      });
      const data = await res.json();
      if (data.success) {
        setPaymentConfig(data.config);
        showToast(`Payment settlement mode updated to ${newMode === 'MERCHANT_DIRECT_GATEWAY' ? 'Direct Merchant Gateway' : 'Licensed Split Partner'}.`);
      } else {
        showToast(data.message || 'Failed to update payment mode', 'error');
      }
    } catch (err) {
      showToast('Error updating payment mode', 'error');
    } finally {
      setSavingPaymentMode(false);
    }
  };

  // 4. Request Instant Payout
  const handleTriggerPayout = async (e) => {
    e.preventDefault();
    const amountNum = parseFloat(payoutAmount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      showToast('Enter a valid payout amount', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/payouts/request-instant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: amountNum })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Payout successfully dispatched!');
        setShowPayoutModal(false);
        setPayoutAmount('');
        fetchPayoutData(selectedEntityId);
      } else {
        showToast(data.message || 'Failed to trigger payout', 'error');
      }
    } catch (err) {
      showToast('Network error processing payout', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Add Beneficiary Account
  const handleSaveBank = async (e) => {
    e.preventDefault();
    setActionLoading(true);

    try {
      const res = await fetch(`/api/v1/entities/${selectedEntityId}/payouts/beneficiaries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bankForm)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Bank account registered. Verifying...');
        setShowBankModal(false);
        // Automatically verify penny-drop
        if (data.beneficiary?.id) {
          await handlePennyDrop(data.beneficiary.id);
        } else {
          fetchPayoutData(selectedEntityId);
        }
      } else {
        showToast(data.message || 'Failed to save bank account', 'error');
      }
    } catch (err) {
      showToast('Error registering bank account', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Fee calculation helpers
  const grossNum = parseFloat(payoutAmount || 0);
  const feeNum = Math.round(grossNum * 0.02 * 100) / 100;
  const gstNum = Math.round(feeNum * 0.18 * 100) / 100;
  const netNum = Math.max(0, Math.round((grossNum - (feeNum + gstNum)) * 100) / 100);

  return (
    <div className="sarvya-page-container">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: notification.type === 'error' ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
          color: notification.type === 'error' ? 'var(--status-error-text)' : 'var(--status-success-text)',
          border: `1px solid ${notification.type === 'error' ? 'var(--status-error-border)' : 'var(--status-success-border)'}`,
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          fontSize: '13.5px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="sarvya-page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-color)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)'
            }}>
              Direct Merchant Settlements
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              background: 'var(--status-success-bg)',
              color: 'var(--status-success-text)',
              border: '1px solid var(--status-success-border)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <CheckCircle2 size={12} />
              Instant IMPS & UPI Dispatches
            </span>
          </div>
          <h1 className="sarvya-page-title">Payouts & Bank Settlements</h1>
          <p className="sarvya-page-subtitle">
            Automated daily deposits direct to your registered business bank account with 0% hidden deductions.
          </p>
        </div>

        {/* Outlet Switcher & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            className="sarvya-select"
            value={selectedEntityId || ''}
            onChange={(e) => setSelectedEntityId(Number(e.target.value))}
            style={{ fontWeight: 600, minWidth: '220px' }}
          >
            {entities.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          <button
            type="button"
            className="sarvya-btn sarvya-btn-secondary"
            onClick={() => setShowBankModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Building size={15} />
            <span>Bank Account</span>
          </button>

          <button
            type="button"
            className="sarvya-btn sarvya-btn-primary"
            onClick={() => {
              setPayoutAmount(summary?.unsettledGrossRevenue ? String(summary.unsettledGrossRevenue) : '10000');
              setShowPayoutModal(true);
            }}
            disabled={!summary?.primaryBeneficiary || summary.primaryBeneficiary.verificationStatus !== 'PENNY_VERIFIED'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowUpRight size={16} />
            <span>Request Instant Payout</span>
          </button>
        </div>
      </div>

      {/* RBI Master Directions Compliance & Settlement Mode Strip */}
      <div className="sarvya-card" style={{
        padding: '16px 20px',
        marginBottom: '20px',
        background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.04) 0%, rgba(16, 185, 129, 0.04) 100%)',
        border: '1px solid rgba(2, 132, 199, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px', maxWidth: '720px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#0284c7',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  RBI Master Directions Compliance (PA/PG Guidelines 2020)
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: '#ECFDF5',
                  color: '#059669',
                  border: '1px solid #A7F3D0',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  Zero-Escrow TSP Mode
                </span>
                <HelpTip text="Under RBI circular RBI/DPSS/2019-20/174, SARVYA operates strictly as a Technology Service Provider (TSP). Customer payments from WhatsApp Flows, UPI QR, and payment links disburse directly to your merchant account without intermediary pooling or holding." />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>SETTLEMENT GATEWAY MODE</div>
              <select
                className="sarvya-select"
                disabled={savingPaymentMode}
                value={paymentConfig?.payment_mode || 'MERCHANT_DIRECT_GATEWAY'}
                onChange={(e) => handlePaymentModeChange(e.target.value)}
                style={{ fontSize: '12.5px', fontWeight: 700, minWidth: '240px', marginTop: '2px' }}
              >
                <option value="MERCHANT_DIRECT_GATEWAY">Merchant Direct Gateway (Default, 0% Escrow)</option>
                <option value="LICENSED_SPLIT_PARTNER">Licensed Split Partner (RBI Authorized PA)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="sarvya-kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Available for Instant Payout</div>
          <div className="sarvya-kpi-value" style={{ color: 'var(--sarvya-blue)' }}>
            ₹{(summary?.availableForPayout || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="sarvya-kpi-subtext">Gross cleared: ₹{(summary?.unsettledGrossRevenue || 0).toLocaleString('en-IN')}</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Lifetime Deposited to Bank</div>
          <div className="sarvya-kpi-value" style={{ color: '#16A34A' }}>
            ₹{(summary?.lifetimeSettledNet || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="sarvya-kpi-subtext">Verified bank transfers</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Platform Fee Rate</div>
          <div className="sarvya-kpi-value">2.0%</div>
          <div className="sarvya-kpi-subtext">+18% GST on platform service fee</div>
        </div>

        <div className="sarvya-kpi-card">
          <div className="sarvya-kpi-label">Payout Schedule</div>
          <div className="sarvya-kpi-value" style={{ fontSize: '18px' }}>Daily 06:00 AM</div>
          <div className="sarvya-kpi-subtext">Auto batch transfer to verified current A/c</div>
        </div>
      </div>

      {/* Verified Bank Account Details Banner */}
      <div className="sarvya-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'var(--bg-app)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--sarvya-blue)'
            }}>
              <Landmark size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Registered Settlement Bank Account</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                All guest payments from UPI QR, cards, and WhatsApp Flow are routed to this account.
              </p>
            </div>
          </div>

          <div>
            {primaryBeneficiary?.verificationStatus === 'PENNY_VERIFIED' ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--status-success-bg)',
                color: 'var(--status-success-text)',
                border: '1px solid var(--status-success-border)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 700
              }}>
                <ShieldCheck size={14} />
                Penny-Drop Verified (NPCI IMPS)
              </span>
            ) : primaryBeneficiary ? (
              <button
                type="button"
                className="sarvya-btn sarvya-btn-secondary"
                disabled={actionLoading}
                onClick={() => handlePennyDrop(primaryBeneficiary.id)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Verify with ₹1 Penny-Drop
              </button>
            ) : (
              <span style={{ fontSize: '12px', color: '#B45309', fontWeight: 600 }}>No Bank Configured</span>
            )}
          </div>
        </div>

        {primaryBeneficiary ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            background: 'var(--bg-app)',
            padding: '16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)'
          }}>
            <div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>BANK NAME</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>{primaryBeneficiary.bankName}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{primaryBeneficiary.accountType} ACCOUNT</div>
            </div>

            <div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>ACCOUNT NUMBER</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace' }}>
                {primaryBeneficiary.accountNumberMasked}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>IFSC CODE</div>
              <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px', fontFamily: 'monospace' }}>
                {primaryBeneficiary.ifscCode}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>REGISTERED BENEFICIARY</div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px' }}>
                {primaryBeneficiary.accountHolder}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              You have not registered a settlement bank account yet. Please add your business account to receive customer payouts.
            </p>
            <button
              type="button"
              className="sarvya-btn sarvya-btn-primary"
              onClick={() => setShowBankModal(true)}
            >
              <Plus size={14} /> Add Business Bank Account
            </button>
          </div>
        )}
      </div>

      {/* Settlement Ledger Table */}
      <div className="sarvya-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Recent Settlement Ledger</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Full bank statement with Unique Transaction References (UTR) and itemized fee receipts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fetchPayoutData(selectedEntityId)}
            title="Refresh settlement ledger"
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <DataTable
          columns={settlementColumns}
          data={ledger}
          density="compact"
          pageSize={10}
          loading={loading && ledger.length === 0}
          emptyMessage="No settlement history yet. Completed payouts and daily batch deposits will appear here."
        />
      </div>

      {/* MODAL 1: Request Instant Payout */}
      {showPayoutModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUpRight size={20} color="var(--sarvya-blue)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>Request Instant IMPS Payout</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleTriggerPayout}>
              <div style={{ marginBottom: '16px' }}>
                <label className="sarvya-field-label">Disbursement Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 15000"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="sarvya-input"
                  style={{ fontSize: '16px', fontWeight: 700 }}
                />
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Available cleared balance: ₹{(summary?.unsettledGrossRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Real-time Fee Breakdown Card */}
              <div style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                marginBottom: '20px',
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Gross Amount:</span>
                  <span style={{ fontWeight: 600 }}>₹{grossNum.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Platform Fee (2%):</span>
                  <span style={{ color: '#DC2626' }}>-₹{feeNum.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>GST on Fee (18%):</span>
                  <span style={{ color: '#DC2626' }}>-₹{gstNum.toFixed(2)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '8px',
                  fontWeight: 700,
                  fontSize: '14px'
                }}>
                  <span>Net Credited to Bank:</span>
                  <span style={{ color: '#16A34A' }}>₹{netNum.toFixed(2)}</span>
                </div>
              </div>

              <div style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <ShieldCheck size={14} color="#16A34A" />
                <span>Depositing to: {primaryBeneficiary?.bankName} ({primaryBeneficiary?.accountNumberMasked})</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowPayoutModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {actionLoading ? 'Dispersing...' : 'Confirm & Transfer via IMPS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Bank Account */}
      {showBankModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div className="sarvya-card" style={{ maxWidth: '520px', width: '100%', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={20} color="var(--sarvya-blue)" />
                <h3 style={{ fontSize: '17px', fontWeight: 700 }}>Add Settlement Bank Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBankModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBank}>
              <div style={{ marginBottom: '12px' }}>
                <label className="sarvya-field-label">Legal Beneficiary / Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. KONKANTRIP HOSPITALITY LLP"
                  value={bankForm.account_holder_name}
                  onChange={(e) => setBankForm({ ...bankForm, account_holder_name: e.target.value.toUpperCase() })}
                  className="sarvya-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label className="sarvya-field-label">Bank Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC Bank, ICICI Bank"
                    value={bankForm.bank_name}
                    onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                    className="sarvya-input"
                  />
                </div>
                <div>
                  <label className="sarvya-field-label">Account Type</label>
                  <select
                    className="sarvya-select"
                    value={bankForm.account_type}
                    onChange={(e) => setBankForm({ ...bankForm, account_type: e.target.value })}
                  >
                    <option value="CURRENT">Current Account</option>
                    <option value="SAVINGS">Savings Account</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="sarvya-field-label">Account Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 50200084920194"
                    value={bankForm.account_number}
                    onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value.trim() })}
                    className="sarvya-input"
                  />
                </div>
                <div>
                  <label className="sarvya-field-label">IFSC Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HDFC0000240"
                    value={bankForm.ifsc_code}
                    onChange={(e) => setBankForm({ ...bankForm, ifsc_code: e.target.value.toUpperCase().trim() })}
                    className="sarvya-input"
                    style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                marginBottom: '18px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5
              }}>
                <ShieldCheck size={14} color="#16A34A" style={{ display: 'inline', marginRight: '6px' }} />
                <span>
                  <strong>Penny-Drop Verification:</strong> SARVYA will initiate an automated ₹1.00 micro-deposit via NPCI to confirm the account name and active status before initiating payouts.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sarvya-btn sarvya-btn-secondary"
                  onClick={() => setShowBankModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="sarvya-btn sarvya-btn-primary"
                >
                  {actionLoading ? 'Saving...' : 'Save & Verify Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

