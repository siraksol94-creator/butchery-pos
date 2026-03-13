import React, { useState, useEffect } from 'react';
import { getCashBook, getCashBookStats, setOpeningBalance } from '../services/api';
import { FiTrendingUp, FiTrendingDown, FiDollarSign, FiEdit2, FiSave, FiX, FiPrinter, FiFilter } from 'react-icons/fi';
const CashBook = () => {
  const [stats, setStats] = useState({ openingBalance: 0, totalReceipts: 0, totalPV: 0, totalAP: 0, totalPayments: 0, currentBalance: 0 });
  const [entries, setEntries] = useState([]);
  const [openingBal, setOpeningBal] = useState(0);
  const [editingOB, setEditingOB] = useState(false);
  const [obInput, setObInput] = useState('');
  const [savingOB, setSavingOB] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchData = async (f, t) => {
    try {
      const params = {};
      if (f) params.from = f;
      if (t) params.to = t;
      const [statsRes, entriesRes] = await Promise.all([getCashBookStats(params), getCashBook(params)]);
      if (statsRes.data) {
        setStats(statsRes.data);
        setOpeningBal(statsRes.data.openingBalance);
      }
      if (entriesRes.data) {
        setEntries(entriesRes.data.entries || []);
      }
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => { fetchData(from, to); }, []); // eslint-disable-line

  const handleFilter = () => fetchData(from, to);
  const handleClearFilter = () => { setFrom(''); setTo(''); fetchData('', ''); };

  const handleSaveOB = async () => {
    setSavingOB(true);
    try {
      await setOpeningBalance(parseFloat(obInput) || 0);
      setEditingOB(false);
      await fetchData(from, to);
    } catch (err) { /* ignore */ }
    setSavingOB(false);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totals = entries.reduce((acc, e) => ({
    receipts: acc.receipts + parseFloat(e.receipt_amount || 0),
    payments: acc.payments + parseFloat(e.payment_amount || 0)
  }), { receipts: 0, payments: 0 });

  const printDirect = (html) => {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  };

  const handlePrint = () => {
    const div = '='.repeat(42);
    const rows = [
      `<tr><td>—</td><td>Opening Balance</td><td>OB</td><td>$${parseFloat(openingBal).toFixed(2)}</td><td></td><td>$${parseFloat(openingBal).toFixed(2)}</td></tr>`,
      ...entries.map(e => `<tr>
        <td>${new Date(e.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</td>
        <td>${e.description || ''}</td>
        <td>${e.reference || ''} ${e.type === 'AP' ? '[AP]' : ''}</td>
        <td>${parseFloat(e.receipt_amount) > 0 ? '$' + parseFloat(e.receipt_amount).toFixed(2) : ''}</td>
        <td>${parseFloat(e.payment_amount) > 0 ? '$' + parseFloat(e.payment_amount).toFixed(2) : ''}</td>
        <td>$${parseFloat(e.balance).toFixed(2)}</td>
      </tr>`),
      `<tr style="font-weight:700;border-top:1px solid #000"><td colspan="3" style="text-align:right">TOTALS:</td><td>$${totals.receipts.toFixed(2)}</td><td>$${totals.payments.toFixed(2)}</td><td>$${parseFloat(stats.currentBalance).toFixed(2)}</td></tr>`
    ].join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      @page { size: 80mm auto; margin: 2mm 3mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 74mm; font-family: 'Courier New', monospace; font-size: 9px; color: #000; }
      .c { text-align: center; }
      .div { text-align: center; font-size: 8px; margin: 2px 0; overflow: hidden; white-space: nowrap; }
      table { width: 100%; border-collapse: collapse; font-size: 8px; }
      td { padding: 1px 1px; vertical-align: top; white-space: nowrap; }
      td:nth-child(1) { width: 18%; }
      td:nth-child(2) { width: 28%; overflow: hidden; max-width: 0; text-overflow: ellipsis; }
      td:nth-child(3) { width: 14%; }
      td:nth-child(4), td:nth-child(5), td:nth-child(6) { width: 13%; text-align: right; }
    </style></head><body>
    <div class="c" style="font-size:11px;font-weight:700">CASH BOOK</div>
    <div class="div">${div}</div>
    <div class="c" style="font-size:8px">Printed: ${new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    <div class="div">${div}</div>
    <table>
      <thead><tr style="font-weight:700;border-bottom:1px solid #000">
        <th style="text-align:left">DATE</th>
        <th style="text-align:left">DESC</th>
        <th style="text-align:left">REF</th>
        <th style="text-align:right">CR</th>
        <th style="text-align:right">PV/AP</th>
        <th style="text-align:right">BAL</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="div">${div}</div>
    </body></html>`;

    printDirect(html);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Cash Book</h1>
          <p>Track all cash transactions (auto-generated from CR, PV &amp; AP)</p>
        </div>
        <button
          onClick={handlePrint}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
        >
          <FiPrinter size={15} /> Print
        </button>
      </div>

      {/* Date Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>From:</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
        <label style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>To:</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
        <button onClick={handleFilter}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 6, border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <FiFilter size={13} /> Filter
        </button>
        {(from || to) && (
          <button onClick={handleClearFilter}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>
            <FiX size={13} /> Clear
          </button>
        )}
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
          <div>
            <div className="stat-label">Total PV</div>
            <div className="stat-value">${(stats.totalPV ?? stats.totalPayments).toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card" style={{ borderLeft: '4px solid #7c3aed' }}>
          <div className="stat-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}><FiTrendingDown /></div>
          <div>
            <div className="stat-label">Total AP (COGS)</div>
            <div className="stat-value" style={{ color: '#7c3aed' }}>${(stats.totalAP ?? 0).toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon"><FiDollarSign /></div>
          <div><div className="stat-label">Current Balance</div><div className="stat-value">${stats.currentBalance.toLocaleString()}</div></div>
        </div>
        {(() => {
          const profit = stats.totalReceipts - (stats.totalPV ?? 0) - (stats.totalAP ?? 0);
          const isPos  = profit >= 0;
          return (
            <div className="stat-card" style={{ borderLeft: `4px solid ${isPos ? '#16a34a' : '#dc2626'}` }}>
              <div className="stat-icon" style={{ background: isPos ? '#dcfce7' : '#fee2e2', color: isPos ? '#16a34a' : '#dc2626' }}>
                {isPos ? <FiTrendingUp /> : <FiTrendingDown />}
              </div>
              <div>
                <div className="stat-label">Profit (CR − PV − AP)</div>
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
              <th>Date</th><th>Description</th><th>Reference</th><th>Type</th>
              <th style={{ color: '#16a34a' }}>Receipts</th>
              <th style={{ color: '#dc2626' }}>Payments</th><th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening Balance row */}
            <tr style={{ background: '#f0f9ff' }}>
              <td style={{ fontWeight: 500 }}>—</td>
              <td style={{ fontWeight: 600 }}>Opening Balance</td>
              <td style={{ color: '#9ca3af', fontSize: 12 }}>OB</td>
              <td></td>
              <td style={{ color: '#2563eb', fontWeight: 600 }}>${openingBal.toLocaleString()}</td>
              <td></td>
              <td style={{ fontWeight: 600 }}>${openingBal.toLocaleString()}</td>
            </tr>
            {entries.map(e => {
              const isAP = e.type === 'AP';
              return (
                <tr key={e.id} style={isAP ? { background: '#faf5ff' } : {}}>
                  <td>{formatDate(e.date)}</td>
                  <td style={{ fontWeight: 500 }}>{e.description}</td>
                  <td style={{ color: '#9ca3af', fontSize: 12 }}>{e.reference}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: isAP ? '#ede9fe' : '#fee2e2',
                      color: isAP ? '#7c3aed' : '#dc2626'
                    }}>
                      {isAP ? 'AP' : 'PV'}
                    </span>
                  </td>
                  <td style={{ color: '#16a34a', fontWeight: e.receipt_amount > 0 ? 500 : 400 }}>
                    {e.receipt_amount > 0 ? `$${parseFloat(e.receipt_amount).toLocaleString()}` : ''}
                  </td>
                  <td style={{ color: isAP ? '#7c3aed' : '#dc2626', fontWeight: e.payment_amount > 0 ? 500 : 400 }}>
                    {e.payment_amount > 0 ? `$${parseFloat(e.payment_amount).toLocaleString()}` : ''}
                  </td>
                  <td style={{ fontWeight: 600 }}>${parseFloat(e.balance).toFixed(2)}</td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr><td colSpan="7" style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No transactions yet. Create Cash Receipts, Payment Vouchers, or AP Payments.</td></tr>
            )}
            <tr style={{ background: '#f9fafb', fontWeight: 700, borderTop: '2px solid #e5e7eb' }}>
              <td colSpan="4" style={{ textAlign: 'right' }}>TOTALS:</td>
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
