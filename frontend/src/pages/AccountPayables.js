import React, { useState, useEffect } from 'react';
import { getAccountPayables, getAccountPayableStats, createApPayment, getSupplierBreakdown, updateApPayment, getSettings } from '../services/api';
import { FiDollarSign, FiAlertCircle, FiUsers, FiTrendingDown, FiX, FiChevronRight, FiPrinter, FiEdit2, FiSave } from 'react-icons/fi';

const getStatusBadge = (status) => {
  const map = { 'Paid': 'badge-green', 'Partial': 'badge-orange', 'Unpaid': 'badge-red', 'No Purchases': 'badge-gray' };
  return map[status] || 'badge-gray';
};

const AccountPayables = () => {
  const [stats, setStats] = useState({ totalPurchases: 0, totalPaid: 0, outstanding: 0, suppliers: 0, unpaidCount: 0 });
  const [payables, setPayables] = useState([]);
  const [businessInfo, setBusinessInfo] = useState({});
  const [payModal, setPayModal] = useState(null);
  const [form, setForm] = useState({ amount: '', date: '', description: '', paid_from: 'Main Cashier' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [breakdown, setBreakdown] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null); // { id, amount, date, description, paid_from }
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const fetchData = async () => {
    try {
      const [statsRes, payablesRes] = await Promise.all([getAccountPayableStats(), getAccountPayables()]);
      if (statsRes.data) setStats(statsRes.data);
      setPayables(payablesRes.data || []);
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => {
    fetchData();
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []);

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
      await createApPayment({
        supplier_id: payModal.id,
        supplier_name: payModal.supplier_name,
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

  const openBreakdown = async (supplier) => {
    setLoadingBreakdown(true);
    setBreakdown({ supplier, grns: [], payments: [] });
    try {
      const res = await getSupplierBreakdown(supplier.id);
      setBreakdown(res.data);
    } catch (e) { /* keep empty */ }
    setLoadingBreakdown(false);
  };

  const handleSaveEdit = async () => {
    if (!editingPayment.amount || parseFloat(editingPayment.amount) <= 0) { setEditError('Enter a valid amount.'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      await updateApPayment(editingPayment.id, {
        amount: parseFloat(editingPayment.amount),
        date: editingPayment.date,
        description: editingPayment.description,
        paid_from: editingPayment.paid_from,
      });
      setEditingPayment(null);
      // Refresh breakdown
      const res = await getSupplierBreakdown(breakdown.supplier.id || breakdown.supplier.supplier_id);
      setBreakdown(res.data);
      fetchData();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update payment.');
    } finally {
      setEditSaving(false);
    }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const handlePrint = () => {
    const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const bizName = businessInfo.business_name || 'Business Name';
    const printedAt = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const rows = payables.map((p, i) => `
      <tr>
        <td style="text-align:center;color:#6b7280">${i + 1}</td>
        <td style="font-weight:600">${p.supplier_name}</td>
        <td style="color:#6b7280">${p.phone || '—'}</td>
        <td style="text-align:center">${p.grn_count}</td>
        <td style="text-align:right">K${fmt(p.total_purchases)}</td>
        <td style="text-align:right;color:#16a34a;font-weight:600">K${fmt(p.total_paid)}</td>
        <td style="text-align:right;color:${parseFloat(p.balance) > 0 ? '#dc2626' : '#16a34a'};font-weight:700">K${fmt(p.balance)}</td>
        <td>${p.status}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:A4 portrait;margin:15mm}*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1f2937}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #991b1b;margin-bottom:16px}
      .hdr-left .biz{font-size:20px;font-weight:900;color:#991b1b;letter-spacing:0.3px}
      .hdr-left .sub{font-size:10px;color:#6b7280;margin-top:4px}
      .hdr-right{text-align:right}
      .hdr-right .title{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
      .hdr-right .dates{font-size:13px;font-weight:700;color:#991b1b}
      .hdr-right .printed{font-size:9px;color:#9ca3af;margin-top:3px}
      .stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
      .stat{border:1.5px solid #d1d5db;border-radius:6px;padding:8px 12px}
      .stat-lbl{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:3px}
      .stat-val{font-size:13px;font-weight:800}
      table{width:100%;border-collapse:collapse;font-size:10.5px}
      th{border:1px solid #d1d5db;padding:7px 9px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:0.5px}
      td{border:1px solid #e5e7eb;padding:6px 9px}
      .tot-row td{font-weight:700;border-top:2px solid #991b1b}
      .ft{margin-top:16px;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
    </style></head><body>
      <div class="hdr">
        <div class="hdr-left">
          <div class="biz">${bizName}</div>
          <div class="sub">Supplier Ledger</div>
        </div>
        <div class="hdr-right">
          <div class="title">Account Payables</div>
          <div class="dates">As of ${printedAt}</div>
          <div class="printed">Printed: ${printedAt}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="stat-lbl">Total Purchases (GRN)</div><div class="stat-val">K${fmt(stats.totalPurchases)}</div></div>
        <div class="stat"><div class="stat-lbl">Total Paid</div><div class="stat-val" style="color:#16a34a">K${fmt(stats.totalPaid)}</div></div>
        <div class="stat"><div class="stat-lbl">Outstanding Balance</div><div class="stat-val" style="color:#dc2626">K${fmt(stats.outstanding)}</div></div>
        <div class="stat"><div class="stat-lbl">Total Suppliers</div><div class="stat-val">${stats.suppliers}</div></div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Supplier</th><th>Phone</th><th style="text-align:center">GRNs</th><th style="text-align:right">Purchases</th><th style="text-align:right">Paid</th><th style="text-align:right">Balance</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="tot-row"><td colspan="4" style="text-align:right">TOTALS</td><td style="text-align:right">K${fmt(stats.totalPurchases)}</td><td style="text-align:right;color:#16a34a">K${fmt(stats.totalPaid)}</td><td style="text-align:right;color:#dc2626">K${fmt(stats.outstanding)}</td><td></td></tr></tfoot>
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
          <h1>Account Payables</h1>
          <p>Supplier ledger — track what you owe suppliers</p>
        </div>
        <button onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
          <FiPrinter size={15} /> Print
        </button>
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
                <td>
                  <button onClick={() => openBreakdown(p)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, color: '#2563eb', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {p.supplier_name} <FiChevronRight size={13} />
                  </button>
                </td>
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
                  <button
                    onClick={() => openPayModal(p)}
                    style={{ padding: '5px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    Pay
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Breakdown Modal */}
      {breakdown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{breakdown.supplier?.supplier_name || breakdown.supplier?.name}</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Supplier account breakdown</p>
              </div>
              <button onClick={() => setBreakdown(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><FiX size={20} /></button>
            </div>

            <div style={{ padding: '18px 24px' }}>
              {loadingBreakdown ? (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>Loading...</div>
              ) : (
                <>
                  {/* GRNs */}
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Purchases (GRN)</h3>
                  {breakdown.grns?.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>No purchases yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>GRN #</th>
                          <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600 }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.grns.map(g => (
                          <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 10px', color: '#6b7280' }}>{g.grn_number}</td>
                            <td style={{ padding: '7px 10px' }}>{formatDate(g.date)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>K{parseFloat(g.total_amount).toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr style={{ background: '#f0fdf4', fontWeight: 700 }}>
                          <td colSpan="2" style={{ padding: '7px 10px', textAlign: 'right' }}>Total Purchases:</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#dc2626' }}>K{breakdown.grns.reduce((s, g) => s + parseFloat(g.total_amount), 0).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  {/* Payments */}
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Payments Made (AP)</h3>
                  {breakdown.payments?.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>No payments yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Ref #</th>
                          <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '7px 10px', fontWeight: 600 }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600 }}>Amount</th>
                          <th style={{ padding: '7px 10px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.payments.map(p => (
                          editingPayment?.id === p.id ? (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: '#fffbeb' }}>
                              <td style={{ padding: '7px 10px', color: '#6b7280', fontSize: 12 }}>{p.payment_number}</td>
                              <td style={{ padding: '4px 6px' }}>
                                <input type="date" value={editingPayment.date} onChange={e => setEditingPayment(ep => ({ ...ep, date: e.target.value }))}
                                  style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, width: '100%' }} />
                              </td>
                              <td style={{ padding: '4px 6px' }}>
                                <input type="text" value={editingPayment.description} onChange={e => setEditingPayment(ep => ({ ...ep, description: e.target.value }))}
                                  style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, width: '100%' }} />
                              </td>
                              <td style={{ padding: '4px 6px' }}>
                                <input type="number" value={editingPayment.amount} onChange={e => setEditingPayment(ep => ({ ...ep, amount: e.target.value }))}
                                  style={{ padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, width: 80, textAlign: 'right' }} />
                              </td>
                              <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                <button onClick={handleSaveEdit} disabled={editSaving} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, marginRight: 4 }}>
                                  {editSaving ? '...' : <FiSave size={12} />}
                                </button>
                                <button onClick={() => { setEditingPayment(null); setEditError(''); }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>
                                  <FiX size={12} />
                                </button>
                              </td>
                            </tr>
                          ) : (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 10px', color: '#6b7280' }}>{p.payment_number}</td>
                            <td style={{ padding: '7px 10px' }}>{formatDate(p.date)}</td>
                            <td style={{ padding: '7px 10px', color: '#6b7280' }}>{p.description || '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>K{parseFloat(p.amount).toLocaleString()}</td>
                            <td style={{ padding: '7px 10px' }}>
                              <button onClick={() => { setEditingPayment({ id: p.id, amount: p.amount, date: p.date, description: p.description || '', paid_from: p.paid_from || '' }); setEditError(''); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                                <FiEdit2 size={13} />
                              </button>
                            </td>
                          </tr>
                          )
                        ))}
                        <tr style={{ background: '#f0fdf4', fontWeight: 700 }}>
                          <td colSpan="3" style={{ padding: '7px 10px', textAlign: 'right' }}>Total Paid:</td>
                          <td style={{ padding: '7px 10px', textAlign: 'right', color: '#16a34a' }}>K{breakdown.payments.reduce((s, p) => s + parseFloat(p.amount), 0).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  {editError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{editError}</div>}

                  {/* Balance */}
                  {(() => {
                    const totalPurchases = breakdown.grns?.reduce((s, g) => s + parseFloat(g.total_amount), 0) || 0;
                    const totalPaid = breakdown.payments?.reduce((s, p) => s + parseFloat(p.amount), 0) || 0;
                    const balance = totalPurchases - totalPaid;
                    return (
                      <div style={{ background: balance > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${balance > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>Outstanding Balance:</span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: balance > 0 ? '#dc2626' : '#16a34a' }}>K{balance.toLocaleString()}</span>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
