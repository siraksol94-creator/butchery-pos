import React, { useState, useEffect } from 'react';
import { getCashBook, getCashBookStats, setOpeningBalance } from '../services/api';
import { FiTrendingUp, FiTrendingDown, FiDollarSign, FiEdit2, FiSave, FiX } from 'react-icons/fi';

const CashBook = () => {
  const [stats, setStats] = useState({ openingBalance: 0, totalReceipts: 0, totalPayments: 0, currentBalance: 0 });
  const [entries, setEntries] = useState([]);
  const [openingBal, setOpeningBal] = useState(0);
  const [editingOB, setEditingOB] = useState(false);
  const [obInput, setObInput] = useState('');
  const [savingOB, setSavingOB] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, entriesRes] = await Promise.all([getCashBookStats(), getCashBook()]);
      if (statsRes.data) {
        setStats(statsRes.data);
        setOpeningBal(statsRes.data.openingBalance);
      }
      if (entriesRes.data) {
        setEntries(entriesRes.data.entries || []);
      }
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveOB = async () => {
    setSavingOB(true);
    try {
      await setOpeningBalance(parseFloat(obInput) || 0);
      setEditingOB(false);
      await fetchData();
    } catch (err) { /* ignore */ }
    setSavingOB(false);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totals = entries.reduce((acc, e) => ({
    receipts: acc.receipts + parseFloat(e.receipt_amount || 0),
    payments: acc.payments + parseFloat(e.payment_amount || 0)
  }), { receipts: 0, payments: 0 });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Cash Book</h1>
          <p>Track all cash transactions (auto-generated from CR &amp; PV)</p>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiDollarSign /></div>
          <div>
            <div className="stat-label">Opening Balance</div>
            <div className="stat-value">
              {editingOB ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>$</span>
                  <input type="number" value={obInput} onChange={e => setObInput(e.target.value)}
                    style={{ width: 100, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}
                    autoFocus />
                  <button onClick={handleSaveOB} disabled={savingOB}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 16 }}><FiSave /></button>
                  <button onClick={() => setEditingOB(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}><FiX /></button>
                </div>
              ) : (
                <span>
                  ${openingBal.toLocaleString()}
                  <button onClick={() => { setObInput(String(openingBal)); setEditingOB(true); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', marginLeft: 6, fontSize: 13 }}>
                    <FiEdit2 />
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon"><FiTrendingUp /></div>
          <div><div className="stat-label">Total Receipts (CR)</div><div className="stat-value">${stats.totalReceipts.toLocaleString()}</div></div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon"><FiTrendingDown /></div>
          <div><div className="stat-label">Total Payments (PV)</div><div className="stat-value">${stats.totalPayments.toLocaleString()}</div></div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon"><FiDollarSign /></div>
          <div><div className="stat-label">Current Balance</div><div className="stat-value">${stats.currentBalance.toLocaleString()}</div></div>
        </div>
        {(() => {
          const profit = stats.totalReceipts - stats.totalPayments;
          const isPos  = profit >= 0;
          return (
            <div className="stat-card" style={{ borderLeft: `4px solid ${isPos ? '#16a34a' : '#dc2626'}` }}>
              <div className="stat-icon" style={{ background: isPos ? '#dcfce7' : '#fee2e2', color: isPos ? '#16a34a' : '#dc2626' }}>
                {isPos ? <FiTrendingUp /> : <FiTrendingDown />}
              </div>
              <div>
                <div className="stat-label">Profit (CR − PV)</div>
                <div className="stat-value" style={{ color: isPos ? '#16a34a' : '#dc2626' }}>
                  {isPos ? '' : '−'}${Math.abs(profit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th>Reference</th><th style={{ color: '#16a34a' }}>Receipts</th>
              <th style={{ color: '#dc2626' }}>Payments</th><th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance row */}
            <tr style={{ background: '#f0f9ff' }}>
              <td style={{ fontWeight: 500 }}>—</td>
              <td style={{ fontWeight: 600 }}>Opening Balance</td>
              <td style={{ color: '#9ca3af', fontSize: 12 }}>OB</td>
              <td style={{ color: '#2563eb', fontWeight: 600 }}>${openingBal.toLocaleString()}</td>
              <td></td>
              <td style={{ fontWeight: 600 }}>${openingBal.toLocaleString()}</td>
            </tr>
            {entries.map(e => (
              <tr key={e.id}>
                <td>{formatDate(e.date)}</td>
                <td style={{ fontWeight: 500 }}>{e.description}</td>
                <td style={{ color: '#9ca3af', fontSize: 12 }}>{e.reference}</td>
                <td style={{ color: '#16a34a', fontWeight: e.receipt_amount > 0 ? 500 : 400 }}>
                  {e.receipt_amount > 0 ? `$${parseFloat(e.receipt_amount).toLocaleString()}` : ''}
                </td>
                <td style={{ color: '#dc2626', fontWeight: e.payment_amount > 0 ? 500 : 400 }}>
                  {e.payment_amount > 0 ? `$${parseFloat(e.payment_amount).toLocaleString()}` : ''}
                </td>
                <td style={{ fontWeight: 600 }}>${parseFloat(e.balance).toLocaleString()}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan="6" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No transactions yet. Create Cash Receipts or Payment Vouchers.</td></tr>
            )}
            <tr style={{ background: '#f9fafb', fontWeight: 700, borderTop: '2px solid #e5e7eb' }}>
              <td colSpan="3" style={{ textAlign: 'right' }}>TOTALS:</td>
              <td style={{ color: '#16a34a' }}>${totals.receipts.toLocaleString()}</td>
              <td style={{ color: '#dc2626' }}>${totals.payments.toLocaleString()}</td>
              <td style={{ color: stats.currentBalance >= 0 ? '#16a34a' : '#dc2626' }}>${stats.currentBalance.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CashBook;
