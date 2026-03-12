import React, { useState, useEffect } from 'react';
import { getAccountPayables, getAccountPayableStats, createPaymentVoucher } from '../services/api';
import { FiDollarSign, FiAlertCircle, FiUsers, FiTrendingDown, FiX } from 'react-icons/fi';

const getStatusBadge = (status) => {
  const map = { 'Paid': 'badge-green', 'Partial': 'badge-orange', 'Unpaid': 'badge-red', 'No Purchases': 'badge-gray' };
  return map[status] || 'badge-gray';
};

const AccountPayables = () => {
  const [stats, setStats] = useState({ totalPurchases: 0, totalPaid: 0, outstanding: 0, suppliers: 0, unpaidCount: 0 });
  const [payables, setPayables] = useState([]);
  const [payModal, setPayModal] = useState(null); // supplier row
  const [form, setForm] = useState({ amount: '', date: '', description: '', paid_from: 'Main Cashier' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [statsRes, payablesRes] = await Promise.all([getAccountPayableStats(), getAccountPayables()]);
      if (statsRes.data) setStats(statsRes.data);
      setPayables(payablesRes.data || []);
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => { fetchData(); }, []);

  const openPayModal = (supplier) => {
    setForm({
      amount: parseFloat(supplier.balance) > 0 ? parseFloat(supplier.balance).toFixed(2) : '',
      date: new Date().toISOString().split('T')[0],
      description: `Payment to ${supplier.supplier_name}`,
      paid_from: 'Main Cashier',
    });
    setError('');
    setPayModal(supplier);
  };

  const handlePay = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount.'); return; }
    if (!form.date) { setError('Select a date.'); return; }
    setSaving(true);
    try {
      await createPaymentVoucher({
        paid_to: payModal.supplier_name,
        category: 'Supplier',
        amount: parseFloat(form.amount),
        date: form.date,
        description: form.description,
        paid_from: form.paid_from,
      });
      setPayModal(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Account Payables</h1>
          <p>Supplier ledger — track what you owe suppliers</p>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card red">
          <div className="stat-icon"><FiDollarSign /></div>
          <div><div className="stat-label">Total Purchases (GRN)</div><div className="stat-value">K{stats.totalPurchases.toLocaleString()}</div></div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><FiTrendingDown /></div>
          <div><div className="stat-label">Total Paid</div><div className="stat-value">K{stats.totalPaid.toLocaleString()}</div></div>
        </div>
        <div className="stat-card orange">
          <div className="stat-icon"><FiAlertCircle /></div>
          <div><div className="stat-label">Outstanding</div><div className="stat-value">K{stats.outstanding.toLocaleString()}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiUsers /></div>
          <div><div className="stat-label">Suppliers</div><div className="stat-value">{stats.suppliers}</div></div>
        </div>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Supplier</th><th>Phone</th><th>GRNs</th><th>Total Purchases</th>
              <th>Total Paid</th><th>Balance</th><th>Last GRN</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payables.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>No suppliers found. Add suppliers and create GRNs to see the ledger.</td></tr>
            ) : payables.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.supplier_name}</td>
                <td style={{ color: '#6b7280' }}>{p.phone || '—'}</td>
                <td style={{ textAlign: 'center' }}>{p.grn_count}</td>
                <td>K{parseFloat(p.total_purchases).toLocaleString()}</td>
                <td style={{ color: '#16a34a' }}>K{parseFloat(p.total_paid).toLocaleString()}</td>
                <td style={{ color: parseFloat(p.balance) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                  K{parseFloat(p.balance).toLocaleString()}
                </td>
                <td>{formatDate(p.last_grn_date)}</td>
                <td><span className={`badge ${getStatusBadge(p.status)}`}>{p.status}</span></td>
                <td>
                  {parseFloat(p.balance) > 0 && (
                    <button
                      onClick={() => openPayModal(p)}
                      style={{ padding: '5px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                    >
                      Pay
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Record Payment</h2>
              <button onClick={() => setPayModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><FiX size={20} /></button>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>{payModal.supplier_name}</div>
              <div style={{ fontSize: 12, color: '#15803d', marginTop: 2 }}>Outstanding balance: K{parseFloat(payModal.balance).toLocaleString()}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Amount (K) *</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Date *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Paid From</label>
                <input
                  type="text"
                  value={form.paid_from}
                  onChange={e => setForm(f => ({ ...f, paid_from: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {error && <div style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setPayModal(null)} style={{ flex: 1, padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={handlePay} disabled={saving} style={{ flex: 1, padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountPayables;
