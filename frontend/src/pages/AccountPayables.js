import React, { useState, useEffect } from 'react';
import { getAccountPayables, getAccountPayableStats } from '../services/api';
import { FiDollarSign, FiAlertCircle, FiUsers, FiTrendingDown } from 'react-icons/fi';

const getStatusBadge = (status) => {
  const map = { 'Paid': 'badge-green', 'Partial': 'badge-orange', 'Unpaid': 'badge-red', 'No Purchases': 'badge-gray' };
  return map[status] || 'badge-gray';
};

const AccountPayables = () => {
  const [stats, setStats] = useState({ totalPurchases: 0, totalPaid: 0, outstanding: 0, suppliers: 0, unpaidCount: 0 });
  const [payables, setPayables] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, payablesRes] = await Promise.all([getAccountPayableStats(), getAccountPayables()]);
        if (statsRes.data) setStats(statsRes.data);
        setPayables(payablesRes.data || []);
      } catch (err) { /* use defaults */ }
    };
    fetchData();
  }, []);

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
          <div><div className="stat-label">Total Purchases (GRN)</div><div className="stat-value">${stats.totalPurchases.toLocaleString()}</div></div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><FiTrendingDown /></div>
          <div><div className="stat-label">Total Paid (PV)</div><div className="stat-value">${stats.totalPaid.toLocaleString()}</div></div>
        </div>
        <div className="stat-card orange">
          <div className="stat-icon"><FiAlertCircle /></div>
          <div><div className="stat-label">Outstanding</div><div className="stat-value">${stats.outstanding.toLocaleString()}</div></div>
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
              <th>Total Paid</th><th>Balance</th><th>Last GRN</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payables.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>No suppliers found. Add suppliers and create GRNs to see the ledger.</td></tr>
            ) : payables.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.supplier_name}</td>
                <td style={{ color: '#6b7280' }}>{p.phone || '—'}</td>
                <td style={{ textAlign: 'center' }}>{p.grn_count}</td>
                <td>${parseFloat(p.total_purchases).toLocaleString()}</td>
                <td style={{ color: '#16a34a' }}>${parseFloat(p.total_paid).toLocaleString()}</td>
                <td style={{ color: parseFloat(p.balance) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                  ${parseFloat(p.balance).toLocaleString()}
                </td>
                <td>{formatDate(p.last_grn_date)}</td>
                <td><span className={`badge ${getStatusBadge(p.status)}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountPayables;
