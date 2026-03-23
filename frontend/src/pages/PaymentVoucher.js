import React, { useState, useEffect } from 'react';
import { getPaymentVouchers, getPaymentVoucherStats, createPaymentVoucher, updatePaymentVoucher, getSettings } from '../services/api';
import { FiPlus, FiDollarSign, FiCalendar, FiFileText, FiEdit2, FiEye, FiPrinter, FiX } from 'react-icons/fi';

const getCategoryColor = (cat) => {
  const map = { 'Supplier': 'badge-blue', 'Utilities': 'badge-orange', 'Salaries': 'badge-purple', 'Rent': 'badge-green', 'Other': 'badge-gray' };
  return map[cat] || 'badge-gray';
};

const todayStr = new Date().toISOString().split('T')[0];

const PaymentVoucher = () => {
  const [stats, setStats]       = useState({ todayPayments: 0, thisMonth: 0, totalVouchers: 0 });
  const [vouchers, setVouchers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState('');
  const [editId, setEditId]     = useState(null);
  const [businessInfo, setBusinessInfo] = useState({ business_name: '', address: '', phone: '' });

  // View / Print
  const [viewVoucher, setViewVoucher] = useState(null);
  const [showPVPrint, setShowPVPrint] = useState(false);
  const [showListPrint, setShowListPrint] = useState(false);

  // Date filter — default to today
  const [filterFrom, setFilterFrom] = useState(todayStr);
  const [filterTo,   setFilterTo]   = useState(todayStr);

  const [form, setForm] = useState({
    paid_to: '', description: '', category: 'Other',
    amount: '', date: todayStr, paid_from: 'Main cashier'
  });

  const fetchData = async () => {
    try {
      const [statsRes, vouchersRes, settingsRes] = await Promise.all([
        getPaymentVoucherStats(),
        getPaymentVouchers({}),
        getSettings(),
      ]);
      if (statsRes.data) setStats(statsRes.data);
      setVouchers(vouchersRes.data || []);
      if (settingsRes.data) setBusinessInfo(settingsRes.data);
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line

  // Client-side filter
  const filteredVouchers = vouchers.filter(v => {
    const d = (v.date || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });

  const filteredTotal = filteredVouchers.reduce((s, v) => s + parseFloat(v.amount || 0), 0);
  const allTotal      = vouchers.reduce((s, v) => s + parseFloat(v.amount || 0), 0);
  const hasFilter     = filterFrom || filterTo;

  const fmt2 = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const openForm = () => {
    setEditId(null);
    setForm({ paid_to: '', description: '', category: 'Other', amount: '', date: todayStr, paid_from: 'Main cashier' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (v) => {
    setEditId(v.id);
    setForm({
      paid_to:     v.paid_to     || '',
      description: v.description || '',
      category:    v.category    || 'Other',
      amount:      v.amount      || '',
      date:        v.date ? v.date.split('T')[0] : todayStr,
      paid_from:   v.paid_from   || 'Main cashier',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.paid_to.trim()) return setFormError('Paid To is required.');
    if (!form.amount || parseFloat(form.amount) <= 0) return setFormError('Amount must be greater than 0.');

    setSaving(true);
    try {
      const payload = {
        paid_to:     form.paid_to.trim(),
        description: form.description.trim(),
        category:    form.category,
        amount:      parseFloat(form.amount),
        date:        form.date,
        paid_from:   form.paid_from,
      };
      if (editId) {
        await updatePaymentVoucher(editId, payload);
      } else {
        await createPaymentVoucher(payload);
      }
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save voucher.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const handlePrint = () => setShowListPrint(true);

  return (
    <div className="page-content">

      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Payment Voucher (PV)</h1>
          <p>Track payments and expenses</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            <FiPrinter size={15} /> Print
          </button>
          <button className="btn btn-primary" onClick={openForm}><FiPlus /> New Voucher</button>
        </div>
      </div>

      {/* ── Stat Cards ──────────────────────────────────────────────── */}
      <div className="stat-cards">
        <div className="stat-card red">
          <div className="stat-icon"><FiDollarSign /></div>
          <div><div className="stat-label">Today's Payments</div><div className="stat-value">${fmt2(stats.todayPayments)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiCalendar /></div>
          <div><div className="stat-label">This Month</div><div className="stat-value">${fmt2(stats.thisMonth)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiFileText /></div>
          <div><div className="stat-label">Total Vouchers</div><div className="stat-value">{stats.totalVouchers}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiDollarSign /></div>
          <div>
            <div className="stat-label">Total Amount</div>
            <div className="stat-value" style={{ fontSize: 18 }}>${fmt2(allTotal)}</div>
          </div>
        </div>
      </div>

      {/* ── Date Filter Bar ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: '#f8fafc',
        border: '1px solid #e5e7eb', borderRadius: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Filter by Date:</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>From</span>
          <input
            type="date" value={filterFrom} max={filterTo || todayStr}
            onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>To</span>
          <input
            type="date" value={filterTo} min={filterFrom || undefined} max={todayStr}
            onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer' }}
          />
        </div>

        {hasFilter && (
          <button
            onClick={() => { setFilterFrom(''); setFilterTo(''); }}
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''}
          {hasFilter && (
            <> &nbsp;·&nbsp; Total: <strong style={{ color: '#dc2626' }}>${fmt2(filteredTotal)}</strong></>
          )}
        </span>
      </div>

      {/* ── Vouchers Table ──────────────────────────────────────────── */}
      <div className="data-table-container">
        {filteredVouchers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            {hasFilter ? 'No vouchers found for the selected date range.' : 'No vouchers recorded yet.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Voucher No.</th><th>Date</th><th>Paid From</th><th>Paid To</th>
                <th>Description</th><th>Category</th><th>Amount</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.voucher_number}</td>
                  <td>{formatDate(v.date)}</td>
                  <td>
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                      background: v.paid_from === 'Cash Drawer' ? '#eff6ff' : '#f0fdf4',
                      color: v.paid_from === 'Cash Drawer' ? '#2563eb' : '#16a34a',
                      border: `1px solid ${v.paid_from === 'Cash Drawer' ? '#bfdbfe' : '#bbf7d0'}`,
                    }}>
                      {v.paid_from || 'Main cashier'}
                    </span>
                  </td>
                  <td>{v.paid_to}</td>
                  <td style={{ color: '#6b7280' }}>{v.description || '—'}</td>
                  <td><span className={`badge ${getCategoryColor(v.category)}`}>{v.category}</span></td>
                  <td style={{ color: '#dc2626', fontWeight: 600 }}>${fmt2(v.amount)}</td>
                  <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={() => setViewVoucher(v)}
                      style={{
                        background: '#f0fdf4', border: '1px solid #bbf7d0', cursor: 'pointer',
                        color: '#16a34a', padding: '4px 10px', borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 12, fontWeight: 600, transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                      onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
                    >
                      <FiEye size={13} /> View
                    </button>
                    <button
                      onClick={() => openEdit(v)}
                      title="Edit"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#6b7280', padding: 6, borderRadius: 6,
                        display: 'inline-flex', alignItems: 'center', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
                    >
                      <FiEdit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td colSpan={7} style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontSize: 13 }}>
                  Total ({filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''})
                </td>
                <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 700, fontSize: 14 }}>
                  ${fmt2(filteredTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── View Voucher Modal ────────────────────────────────────────── */}
      {viewVoucher && !showPVPrint && (
        <div className="modal-overlay" onClick={() => setViewVoucher(null)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              borderRadius: '12px 12px 0 0', padding: '20px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  Payment Voucher
                </div>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>
                  {viewVoucher.voucher_number}
                </div>
              </div>
              <button
                onClick={() => setViewVoucher(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: 8, display: 'flex', alignItems: 'center' }}
              >
                <FiX size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Date',        value: formatDate(viewVoucher.date) },
                { label: 'Paid From',   value: viewVoucher.paid_from || 'Main cashier' },
                { label: 'Paid To',     value: viewVoucher.paid_to },
                { label: 'Category',    value: viewVoucher.category },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{value}</div>
                </div>
              ))}

              {viewVoucher.description && (
                <div style={{ gridColumn: '1 / -1', background: '#f8fafc', borderRadius: 8, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Description</div>
                  <div style={{ fontSize: 14, color: '#374151' }}>{viewVoucher.description}</div>
                </div>
              )}

              {/* Amount highlight */}
              <div style={{ gridColumn: '1 / -1', background: '#fef2f2', borderRadius: 10, padding: '14px 18px', border: '1px solid #fecaca', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Amount Paid</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626' }}>${fmt2(viewVoucher.amount)}</div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewVoucher(null)}>Close</button>
              <button
                className="btn btn-secondary"
                onClick={() => { openEdit(viewVoucher); setViewVoucher(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FiEdit2 size={14} /> Edit
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowPVPrint(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FiPrinter size={14} /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── List Print Preview ───────────────────────────────────────── */}
      {showListPrint && (
        <div
          className="pv-print-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', paddingTop: 60, paddingBottom: 40 }}
        >
          {/* Toolbar */}
          <div
            className="no-print"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 1001, borderBottom: '1px solid #1e293b' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FiPrinter size={16} style={{ color: '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                Print Preview — Payment Vouchers ({filteredVouchers.length} records)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <FiPrinter size={14} /> Print
              </button>
              <button onClick={() => setShowListPrint(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          {/* A4 Paper */}
          <div
            id="pv-print-document"
            style={{ width: 794, background: '#ffffff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', padding: '28px 44px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || businessInfo.business?.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.address || businessInfo.business?.business_address, businessInfo.phone || businessInfo.business?.business_phone, businessInfo.business?.business_email].filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>Payment Vouchers</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {filterFrom || filterTo
                    ? `${filterFrom ? formatDate(filterFrom) : 'All'} — ${filterTo ? formatDate(filterTo) : 'All'}`
                    : 'All Dates'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
            {/* Rainbow divider */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #dc2626, #a855f7)' }} />

            <div style={{ padding: '26px 44px 36px' }}>
              {/* Summary chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Period From',       value: filterFrom ? formatDate(filterFrom) : 'All',                                          bg: '#f8fafc', color: '#374151', border: '#e2e8f0' },
                  { label: 'Period To',         value: filterTo   ? formatDate(filterTo)   : 'All',                                          bg: '#f8fafc', color: '#374151', border: '#e2e8f0' },
                  { label: 'Vouchers',          value: filteredVouchers.length,                                                               bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
                  { label: 'Total Amount',      value: '$' + filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }),           bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
                ].map(chip => (
                  <div key={chip.label} style={{ padding: '12px 16px', borderRadius: 10, background: chip.bg, border: `1.5px solid ${chip.border}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chip.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: chip.color }}>{chip.value}</div>
                  </div>
                ))}
              </div>

              {/* Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#fef2f2' }}>
                      {['#', 'Voucher No.', 'Date', 'Paid From', 'Paid To', 'Description', 'Category', 'Amount'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 7 ? 'right' : 'left', fontWeight: 600, color: '#dc2626', borderBottom: '1px solid #fecaca', fontSize: 10.5, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVouchers.map((v, idx) => (
                      <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#dc2626' }}>{v.voucher_number}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{formatDate(v.date)}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{v.paid_from || 'Main cashier'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{v.paid_to}</td>
                        <td style={{ padding: '8px 12px', color: '#6b7280' }}>{v.description || '—'}</td>
                        <td style={{ padding: '8px 12px' }}>{v.category}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#dc2626' }}>${fmt2(v.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fef2f2', borderTop: '2px solid #fca5a5' }}>
                      <td colSpan={6} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 11.5, color: '#dc2626' }}>
                        TOTAL — {filteredVouchers.length} Voucher{filteredVouchers.length !== 1 ? 's' : ''}
                      </td>
                      <td />
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: '#dc2626' }}>
                        ${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>{businessInfo.business_name || businessInfo.business?.business_name || 'Business'} — Confidential</span>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── A4 Print Preview ─────────────────────────────────────────── */}
      {showPVPrint && viewVoucher && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          zIndex: 9999, display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '20px 0', overflowY: 'auto',
        }}>
          {/* Toolbar */}
          <div className="no-print" style={{
            display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center',
          }}>
            <button
              onClick={() => window.print()}
              style={{
                background: '#dc2626', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 24px', fontWeight: 600,
                fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <FiPrinter size={16} /> Print
            </button>
            <button
              onClick={() => setShowPVPrint(false)}
              style={{
                background: '#fff', color: '#374151', border: '1px solid #d1d5db',
                borderRadius: 8, padding: '10px 20px', fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>

          {/* A4 Document */}
          <div style={{
            width: 794, minHeight: 1123, background: '#fff',
            boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
            padding: '48px 56px', boxSizing: 'border-box',
            fontFamily: 'Arial, sans-serif',
          }}>
            {/* Business Header */}
            <div style={{ textAlign: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #dc2626' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', marginBottom: 4 }}>
                {businessInfo.business_name || 'Business Name'}
              </div>
              {businessInfo.address && (
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{businessInfo.address}</div>
              )}
              {businessInfo.phone && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>Tel: {businessInfo.phone}</div>
              )}
            </div>

            {/* Document Title */}
            <div style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              borderRadius: 10, padding: '16px 24px', marginBottom: 28,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  Payment Voucher
                </div>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{viewVoucher.voucher_number}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginBottom: 2 }}>Date</div>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{formatDate(viewVoucher.date)}</div>
              </div>
            </div>

            {/* Detail Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Paid From',  value: viewVoucher.paid_from || 'Main cashier' },
                { label: 'Paid To',    value: viewVoucher.paid_to },
                { label: 'Category',   value: viewVoucher.category },
                { label: 'Date',       value: formatDate(viewVoucher.date) },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '12px 16px', background: '#f9fafb',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {viewVoucher.description && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', background: '#f9fafb', marginBottom: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 14, color: '#374151' }}>{viewVoucher.description}</div>
              </div>
            )}

            {/* Amount Block */}
            <div style={{
              background: '#fef2f2', border: '2px solid #fca5a5',
              borderRadius: 12, padding: '20px 24px', marginBottom: 40,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Total Amount Paid
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#dc2626' }}>
                ${fmt2(viewVoucher.amount)}
              </div>
            </div>

            {/* Signature Lines */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32, marginTop: 32 }}>
              {['Prepared By', 'Approved By', 'Received By'].map(label => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ height: 1, background: '#9ca3af', marginBottom: 8 }} />
                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Footer note */}
            <div style={{ marginTop: 48, textAlign: 'center', fontSize: 11, color: '#d1d5db' }}>
              This is a computer-generated document.
            </div>
          </div>
        </div>
      )}

      {/* ── New / Edit Voucher Modal ─────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? 'Edit Payment Voucher' : 'New Payment Voucher'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              {formError && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{formError}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label>Paid From</label>
                  <select value={form.paid_from} onChange={e => setForm({ ...form, paid_from: e.target.value })}>
                    <option value="Main cashier">Main cashier</option>
                    <option value="Cash Drawer">Cash Drawer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    <option value="Utilities">Utilities</option>
                    <option value="Salaries">Salaries</option>
                    <option value="Rent">Rent</option>
                    <option value="Lunch allowance">Lunch allowance</option>
                    <option value="Yango">Yango</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Paid To</label>
                  <input value={form.paid_to} onChange={e => setForm({ ...form, paid_to: e.target.value })} placeholder="Name of payee" />
                </div>
              </div>

              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  type="number" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00" min="0" step="0.01"
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Payment details"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update Voucher' : 'Save Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .pv-print-overlay {
            position: static !important;
            background: #fff !important; padding: 0 !important;
            overflow: visible !important; display: block !important;
          }
          #pv-print-document { box-shadow: none !important; width: 100% !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default PaymentVoucher;
