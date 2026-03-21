import React, { useState, useEffect } from 'react';
import { getCashBook, getCashBookStats, setOpeningBalance, getSettings } from '../services/api';
import { FiTrendingUp, FiTrendingDown, FiDollarSign, FiEdit2, FiSave, FiX, FiPrinter, FiFilter } from 'react-icons/fi';
const CashBook = () => {
  const [stats, setStats] = useState({ openingBalance: 0, totalReceipts: 0, totalPV: 0, totalAP: 0, totalPayments: 0, currentBalance: 0 });
  const [entries, setEntries] = useState([]);
  const [businessInfo, setBusinessInfo] = useState({});
  const [openingBal, setOpeningBal] = useState(0);
  const [editingOB, setEditingOB] = useState(false);
  const [obInput, setObInput] = useState('');
  const [savingOB, setSavingOB] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);

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

  useEffect(() => {
    fetchData(todayStr, todayStr);
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []); // eslint-disable-line

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

  const handlePrint = () => {
    const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const bizName = businessInfo.business_name || 'Business Name';
    const printedAt = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const dateLabel = from && to && from !== to ? `${formatDate(from)} — ${formatDate(to)}` : from ? formatDate(from) : 'All Dates';
    const profit = (stats.totalReceipts || 0) - (stats.totalPV || 0) - (stats.totalAP || 0);
    const obRow = `<tr><td>—</td><td><b>Opening Balance</b></td><td></td><td style="text-align:center">OB</td><td style="text-align:right;font-weight:600;color:#2563eb">$${fmt(openingBal)}</td><td></td><td style="text-align:right;font-weight:600">$${fmt(openingBal)}</td></tr>`;
    const rows = entries.map(e => {
      const isAP = e.type === 'AP';
      const isPV = e.type === 'PV';
      const typeColor = isAP ? '#7c3aed' : isPV ? '#dc2626' : '#16a34a';
      return `<tr>
        <td>${formatDate(e.date)}</td>
        <td>${e.description || ''}</td>
        <td style="font-size:10px;color:#6b7280">${e.reference || ''}</td>
        <td style="text-align:center;font-weight:700;color:${typeColor}">${e.type}</td>
        <td style="text-align:right;color:#16a34a;font-weight:500">${parseFloat(e.receipt_amount) > 0 ? '$' + fmt(e.receipt_amount) : ''}</td>
        <td style="text-align:right;color:#dc2626;font-weight:500">${parseFloat(e.payment_amount) > 0 ? '$' + fmt(e.payment_amount) : ''}</td>
        <td style="text-align:right;font-weight:600">$${fmt(e.balance)}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:A4 portrait;margin:15mm}*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1f2937}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #1e3a5f;margin-bottom:16px}
      .hdr-left .biz{font-size:20px;font-weight:900;color:#1e3a5f;letter-spacing:0.3px}
      .hdr-left .sub{font-size:10px;color:#6b7280;margin-top:4px}
      .hdr-right{text-align:right}
      .hdr-right .title{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
      .hdr-right .dates{font-size:13px;font-weight:700;color:#1e3a5f}
      .hdr-right .printed{font-size:9px;color:#9ca3af;margin-top:3px}
      .stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px}
      .stat{border:1.5px solid #d1d5db;border-radius:6px;padding:8px 12px}
      .stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:3px}
      .stat-val{font-size:13px;font-weight:800}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th{border:1px solid #d1d5db;padding:7px 9px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
      td{border:1px solid #e5e7eb;padding:6px 9px}
      .tot-row td{font-weight:700;border-top:2px solid #1e3a5f}
      .ft{margin-top:16px;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
    </style></head><body>
      <div class="hdr">
        <div class="hdr-left">
          <div class="biz">${bizName}</div>
          <div class="sub">Cash Book Report</div>
        </div>
        <div class="hdr-right">
          <div class="title">Cash Book</div>
          <div class="dates">${dateLabel}</div>
          <div class="printed">Printed: ${printedAt}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-lbl">Opening Balance</div><div class="stat-val" style="color:#2563eb">$${fmt(openingBal)}</div></div>
        <div class="stat"><div class="stat-lbl">Total Receipts (CR)</div><div class="stat-val" style="color:#16a34a">$${fmt(stats.totalReceipts)}</div></div>
        <div class="stat"><div class="stat-lbl">Total Payments (PV)</div><div class="stat-val" style="color:#dc2626">$${fmt(stats.totalPV)}</div></div>
        <div class="stat"><div class="stat-lbl">Total AP (COGS)</div><div class="stat-val" style="color:#7c3aed">$${fmt(stats.totalAP)}</div></div>
        <div class="stat"><div class="stat-lbl">Profit</div><div class="stat-val" style="color:${profit >= 0 ? '#16a34a' : '#dc2626'}">$${fmt(profit)}</div></div>
        <div class="stat"><div class="stat-lbl">Current Balance</div><div class="stat-val">$${fmt(stats.currentBalance)}</div></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th style="text-align:center">Type</th><th style="text-align:right">Receipts</th><th style="text-align:right">Payments</th><th style="text-align:right">Balance</th></tr></thead>
        <tbody>${obRow}${rows}</tbody>
        <tfoot><tr class="tot-row"><td colspan="4" style="text-align:right">TOTALS</td><td style="text-align:right;color:#16a34a">$${fmt(totals.receipts)}</td><td style="text-align:right;color:#dc2626">$${fmt(totals.payments)}</td><td style="text-align:right">$${fmt(stats.currentBalance)}</td></tr></tfoot>
      </table>
      <div class="ft"><span>${bizName} — Confidential</span><span>Printed: ${printedAt}</span></div>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
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
                  {!from && !to && (
                    <button onClick={() => {
                      if (window.confirm('Editing the opening balance will affect all running balances in the Cash Book. Do you want to continue?')) {
                        setObInput(String(openingBal));
                        setEditingOB(true);
                      }
                    }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', marginLeft: 6, fontSize: 13 }}>
                      <FiEdit2 />
                    </button>
                  )}
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
              const isCR = e.type === 'CR';
              return (
                <tr key={e.id} style={isAP ? { background: '#faf5ff' } : isCR ? { background: '#f0fdf4' } : {}}>
                  <td>{formatDate(e.date)}</td>
                  <td style={{ fontWeight: 500 }}>{e.description}</td>
                  <td style={{ color: '#9ca3af', fontSize: 12 }}>{e.reference}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: isAP ? '#ede9fe' : isCR ? '#dcfce7' : '#fee2e2',
                      color: isAP ? '#7c3aed' : isCR ? '#16a34a' : '#dc2626'
                    }}>
                      {e.type}
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
