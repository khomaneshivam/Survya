import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Receipt,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  RefreshCw,
  X,
  Check,
  Calendar,
  Building,
  Phone,
  User,
  Layers,
  ArrowUpDown,
  ShoppingBag,
  BedDouble,
  Stethoscope,
  FileText
} from 'lucide-react';

export default function BookingsOrdersPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [domainProfile, setDomainProfile] = useState(null);
  const [locations, setLocations] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [serviceDateFilter, setServiceDateFilter] = useState('');

  // Modals & Active Actions
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [offlineModalTxn, setOfflineModalTxn] = useState(null);
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineMethod, setOfflineMethod] = useState('CASH');
  const [offlineNotes, setOfflineNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // 1. Fetch Master Locations & Domain Profile
  useEffect(() => {
    async function fetchMasters() {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const [locRes, profRes] = await Promise.all([
          fetch('/api/v1/masters/master_locations', { headers }),
          fetch('/api/v1/masters/master_domain_profiles', { headers })
        ]);

        const locData = await locRes.json();
        if (locData.success) {
          setLocations(locData.data || []);
        }

        const profData = await profRes.json();
        if (profData.success && profData.data?.length > 0) {
          const activeProf = profData.data.find(p => p.is_active) || profData.data[0];
          setDomainProfile(activeProf);
        }
      } catch (e) {
        console.warn('Failed to load masters:', e);
      }
    }
    fetchMasters();
  }, [token]);

  // 2. Fetch Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('transaction_type', typeFilter);
      if (fulfillmentFilter) params.set('fulfillment_status', fulfillmentFilter);
      if (paymentFilter) params.set('payment_status', paymentFilter);
      if (locationFilter) params.set('location_id', locationFilter);
      if (serviceDateFilter) params.set('service_date', serviceDateFilter);
      params.set('limit', '50');

      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/v1/transactions?${params.toString()}`, { headers });
      const data = await res.json();

      if (data.success) {
        setTransactions(data.data || []);
        setTotalCount(data.total || 0);
      }
    } catch (e) {
      console.error('Failed to load transactions:', e);
    } finally {
      setLoading(false);
    }
  }, [token, search, typeFilter, fulfillmentFilter, paymentFilter, locationFilter, serviceDateFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Dynamic Terminology
  const terminology = domainProfile?.terminology_json
    ? (typeof domainProfile.terminology_json === 'string'
      ? JSON.parse(domainProfile.terminology_json)
      : domainProfile.terminology_json)
    : {};

  const pageTitle = terminology.orders
    ? terminology.orders
    : (terminology.bookings
      ? terminology.bookings
      : (terminology.appointments ? terminology.appointments : 'Orders & Bookings'));

  // Update Status Action
  const handleUpdateStatus = async (txnId, newStatus) => {
    try {
      setActionLoading(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/v1/transactions/${txnId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fulfillmentStatus: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg(`Status updated to ${newStatus}`);
        fetchTransactions();
      } else {
        alert(data.message || 'Status update failed');
      }
    } catch (e) {
      alert('Error updating status: ' + e.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Submit Offline Payment
  const handleRecordOfflinePayment = async (e) => {
    e.preventDefault();
    if (!offlineModalTxn || !offlineAmount) return;

    try {
      setActionLoading(true);
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/v1/transactions/${offlineModalTxn.id}/record-offline-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: Number(offlineAmount),
          paymentMethod: offlineMethod,
          notes: offlineNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg(`Payment of ₹${Number(offlineAmount).toLocaleString('en-IN')} recorded successfully!`);
        setOfflineModalTxn(null);
        setOfflineAmount('');
        setOfflineNotes('');
        fetchTransactions();
      } else {
        alert(data.message || 'Failed to record payment');
      }
    } catch (err) {
      alert('Error recording payment: ' + err.message);
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // Re-send Payment Link
  const handleSendPaymentLink = async (txnId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/v1/transactions/${txnId}/send-payment-link`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setFeedbackMsg(data.message || 'Payment link dispatched!');
      } else {
        alert(data.message || 'Failed to send payment link');
      }
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setTimeout(() => setFeedbackMsg(null), 3000);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    if (!transactions.length) return;
    const headers = [
      'Reference Code',
      'Type',
      'Customer Name',
      'Customer Phone',
      'Service Date',
      'Branch/Location',
      'Grand Total (INR)',
      'Amount Paid (INR)',
      'Balance Due (INR)',
      'Payment Status',
      'Fulfillment Status',
      'Created At'
    ];

    const rows = transactions.map(t => [
      t.reference_code,
      t.transaction_type,
      `"${(t.customer_name || '').replace(/"/g, '""')}"`,
      t.customer_phone,
      t.service_date || '',
      `"${(t.location_name || '').replace(/"/g, '""')}"`,
      t.grand_total,
      t.amount_paid,
      t.balance_due,
      t.payment_status,
      t.fulfillment_status,
      t.created_at
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `transactions-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: '#EDF4E6',
              color: '#2F5219',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Receipt size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#171719', margin: 0 }}>
                {pageTitle}
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#67676B', margin: '2px 0 0 0' }}>
                Universal Multi-Sector Orders, Bookings, Quotations & Payment Reconciliation
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={fetchTransactions}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!transactions.length}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div style={{
          background: '#EDF4E6',
          border: '1px solid #C3D1AC',
          color: '#2F5219',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontWeight: 600,
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Fast Filter Bar */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E8',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '12px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#96969C' }} />
          <input
            type="text"
            placeholder="Search ref, phone, name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: '8px',
              border: '1px solid #D4D4D9',
              fontSize: '0.825rem'
            }}
          />
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.825rem' }}
        >
          <option value="">All Types</option>
          <option value="ORDER">Orders (Unit Stock)</option>
          <option value="BOOKING">Bookings (Dates)</option>
          <option value="APPOINTMENT">Appointments (Slots)</option>
          <option value="QUOTE">Quotes & Proposals</option>
        </select>

        {/* Fulfillment Status */}
        <select
          value={fulfillmentFilter}
          onChange={e => setFulfillmentFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.825rem' }}
        >
          <option value="">All Fulfillment</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Payment Status */}
        <select
          value={paymentFilter}
          onChange={e => setPaymentFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.825rem' }}
        >
          <option value="">All Payment</option>
          <option value="PAID">Paid in Full</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PAY_AT_DESK">Pay at Desk</option>
          <option value="COD_PENDING">COD Pending</option>
          <option value="LINK_SENT">Link Sent</option>
          <option value="UNPAID">Unpaid</option>
        </select>

        {/* Location Filter */}
        <select
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.825rem' }}
        >
          <option value="">All Branches</option>
          {locations.map(loc => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>

        {/* Service Date */}
        <input
          type="date"
          value={serviceDateFilter}
          onChange={e => setServiceDateFilter(e.target.value)}
          title="Filter by service/booking date"
          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.825rem' }}
        />
      </div>

      {/* Main Transactions Table */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #E5E5E8',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#F8FAF5', borderBottom: '1px solid #E5E5E8', color: '#2F5219', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Reference</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Customer</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Type & Branch</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Service Date</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Total & Balance</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Payment</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Fulfillment</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#96969C' }}>
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#96969C' }}>
                    No transactions found matching active filters.
                  </td>
                </tr>
              ) : (
                transactions.map(txn => {
                  const isPaid = txn.payment_status === 'PAID';
                  const isPartPaid = txn.payment_status === 'PARTIALLY_PAID';
                  const isConfirmed = txn.fulfillment_status === 'CONFIRMED';
                  const isCompleted = txn.fulfillment_status === 'COMPLETED';

                  return (
                    <tr key={txn.id} style={{ borderBottom: '1px solid #EEEEF0', transition: 'background 0.15s' }}>
                      {/* Reference Code */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: '#171719' }}>
                          {txn.reference_code}
                        </span>
                        <div style={{ fontSize: '0.725rem', color: '#96969C' }}>
                          {new Date(txn.created_at).toLocaleDateString('en-IN')}
                        </div>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#171719' }}>
                          {txn.customer_name || 'Guest'}
                        </div>
                        <a
                          href={`https://wa.me/${txn.customer_phone}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.75rem', color: '#059669', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                        >
                          <Phone size={11} /> +{txn.customer_phone}
                        </a>
                      </td>

                      {/* Type & Branch */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: txn.transaction_type === 'BOOKING' ? '#EDE9FE' : (txn.transaction_type === 'APPOINTMENT' ? '#E0F2FE' : '#FEF3C7'),
                          color: txn.transaction_type === 'BOOKING' ? '#6D28D9' : (txn.transaction_type === 'APPOINTMENT' ? '#0369A1' : '#B45309')
                        }}>
                          {txn.transaction_type}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: '#67676B', marginTop: '2px' }}>
                          {txn.location_name || 'Main Location'}
                        </div>
                      </td>

                      {/* Service Date */}
                      <td style={{ padding: '12px 16px' }}>
                        {txn.service_date ? (
                          <div style={{ fontWeight: 600 }}>
                            {txn.service_date}
                            {txn.service_end_date && <span style={{ color: '#67676B' }}> to {txn.service_end_date}</span>}
                          </div>
                        ) : (
                          <span style={{ color: '#96969C' }}>Immediate</span>
                        )}
                      </td>

                      {/* Total & Balance */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#171719' }}>
                          ₹{Number(txn.grand_total).toLocaleString('en-IN')}
                        </div>
                        {txn.balance_due > 0 ? (
                          <div style={{ fontSize: '0.74rem', color: '#B45309', fontWeight: 600 }}>
                            Due: ₹{Number(txn.balance_due).toLocaleString('en-IN')}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.74rem', color: '#059669', fontWeight: 600 }}>
                            Paid in Full
                          </div>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: isPaid ? '#EDF4E6' : (isPartPaid ? '#FEF3C7' : '#FEE2E2'),
                          color: isPaid ? '#2F5219' : (isPartPaid ? '#B45309' : '#991B1B'),
                          border: `1px solid ${isPaid ? '#C3D1AC' : (isPartPaid ? '#FDE68A' : '#FCA5A5')}`
                        }}>
                          {txn.payment_status}
                        </span>
                      </td>

                      {/* Fulfillment Status */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <select
                          value={txn.fulfillment_status}
                          disabled={actionLoading}
                          onChange={e => handleUpdateStatus(txn.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            border: '1px solid #D4D4D9',
                            background: isCompleted ? '#EDF4E6' : (isConfirmed ? '#EFF6FF' : '#FFFFFF'),
                            color: isCompleted ? '#2F5219' : (isConfirmed ? '#1D4ED8' : '#3A3A3E')
                          }}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </td>

                      {/* Quick Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {/* Record Payment Button */}
                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setOfflineModalTxn(txn);
                                setOfflineAmount(String(txn.balance_due || txn.grand_total));
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.725rem', gap: '4px' }}
                              title="Record Offline Payment (Cash / UPI / POS)"
                            >
                              <CreditCard size={12} /> Pay
                            </button>
                          )}

                          {/* View GST Receipt */}
                          <a
                            href={`/api/v1/public/receipt/${txn.reference_code}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.725rem', gap: '4px', textDecoration: 'none' }}
                            title="Printable GST Receipt / Voucher"
                          >
                            <ExternalLink size={12} /> Receipt
                          </a>

                          {/* Re-send link */}
                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => handleSendPaymentLink(txn.id)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.725rem' }}
                              title="Resend payment link to customer"
                            >
                              Link
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Offline Payment Modal */}
      {offlineModalTxn && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '16px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            border: '1px solid #E5E5E8',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #EEEEF0',
              background: '#F8FAF5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} color="#2F5219" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#171719' }}>
                  Record Offline Payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOfflineModalTxn(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#96969C' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRecordOfflinePayment} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '0.825rem', color: '#67676B' }}>
                Invoice: <strong>{offlineModalTxn.reference_code}</strong> | Customer: <strong>{offlineModalTxn.customer_name || offlineModalTxn.customer_phone}</strong>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={offlineAmount}
                  onChange={e => setOfflineAmount(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.9rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Payment Method
                </label>
                <select
                  value={offlineMethod}
                  onChange={e => setOfflineMethod(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.85rem' }}
                >
                  <option value="CASH">Cash (Front Desk / Driver)</option>
                  <option value="UPI">Direct UPI (Merchant QR Code)</option>
                  <option value="CARD_POS">Credit / Debit Card (Card POS)</option>
                  <option value="BANK_TRANSFER">Bank NEFT / RTGS Transfer</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#3A3A3E', marginBottom: '4px' }}>
                  Staff Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received by Rahul at reception"
                  value={offlineNotes}
                  onChange={e => setOfflineNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D4D4D9', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setOfflineModalTxn(null)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="btn btn-action-green"
                  style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                >
                  {actionLoading ? 'Recording...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
