import React, { useState, useEffect } from 'react';
import { getCashReceipts, getCashReceiptStats, createCashReceipt, updateCashReceipt, getSettings } from '../services/api';
import { FiPlus, FiDollarSign, FiCalendar, FiFileText, FiEye, FiEdit2, FiPrinter, FiX } from 'react-icons/fi';

const getPaymentColor = (method) => {
  const map = { 'Cash': 'badge-green', 'Card': 'badge-blue', 'Check': 'badge-purple', 'Transfer': 'badge-orange' };
  return map[method] || 'badge-gray';
};

const todayStr = new Date().toISOString().split('T')[0];

const CashReceipt = () => {
  const [stats, setStats]     = useState({ todayReceipts: 0, thisMonth: 0, totalReceipts: 0 });
  const [receipts, setReceipts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  // Date filter — default to empty (show all)
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');

  // View / print
  const [viewReceipt, setViewReceipt] = useState(null);
  const [showCRPrint, setShowCRPrint] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({});

  // Edit
  const [editMode, setEditMode] = useState(false);
  const [editId,   setEditId]   = useState(null);

  const [form, setForm] = useState({
    received_from: '', description: '', payment_method: 'Cash', amount: '', date: todayStr,
  });

  const fetchData = async () => {
    try {
      const [statsRes, receiptsRes] = await Promise.all([getCashReceiptStats(), getCashReceipts()]);
      if (statsRes.data) setStats(statsRes.data);
      setReceipts(receiptsRes.data || []);
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => {
    fetchData();
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []);

  // Client-side filter
  const filteredReceipts = receipts.filter(r => {
    const d = (r.date || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });

  const filteredTotal = filteredReceipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0);

  const openForm = () => {
    setEditMode(false);
    setEditId(null);
    setForm({ received_from: '', description: '', payment_method: 'Cash', amount: '', date: todayStr });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (r) => {
    setEditMode(true);
    setEditId(r.id);
    setForm({
      received_from:  r.received_from  || '',
      description:    r.description    || '',
      payment_method: r.payment_method || 'Cash',
      amount:         String(parseFloat(r.amount) || ''),
      date:           (r.date || todayStr).split('T')[0],
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.received_from.trim()) return setFormError('Received From is required.');
    if (!form.amount || parseFloat(form.amount) <= 0) return setFormError('Amount must be greater than 0.');

    setSaving(true);
    try {
      const payload = {
        received_from:  form.received_from.trim(),
        description:    form.description.trim(),
        payment_method: form.payment_method,
        amount:         parseFloat(form.amount),
        date:           form.date,
      };
      if (editMode) {
        await updateCashReceipt(editId, payload);
      } else {
        await createCashReceipt(payload);
      }
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save receipt.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const fmt2 = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Cash Receipt (CR)</h1>
          <p>Record cash and payments received</p>
        </div>
        <button className="btn btn-primary" onClick={openForm}><FiPlus /> New Receipt</button>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────── */}
      <div className="stat-cards">
        <div className="stat-card green">
          <div className="stat-icon"><FiDollarSign /></div>
          <div><div className="stat-label">Today's Receipts</div><div className="stat-value">${fmt2(stats.todayReceipts)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiCalendar /></div>
          <div><div className="stat-label">This Month</div><div className="stat-value">${fmt2(stats.thisMonth)}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiFileText /></div>
          <div><div className="stat-label">Total Receipts</div><div className="stat-value">{stats.totalReceipts}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><FiDollarSign /></div>
          <div>
            <div className="stat-label">Total</div>
            <div className="stat-value" style={{ fontSize: 18 }}>${fmt2(receipts.reduce((s, r) => s + parseFloat(r.amount || 0), 0))}</div>
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

        {(filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterFrom(''); setFilterTo(''); }}
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? 's' : ''}
          <> &nbsp;·&nbsp; Total: <strong style={{ color: '#16a34a' }}>${fmt2(filteredTotal)}</strong></>
        </span>
      </div>

      {/* ── Receipts Table ──────────────────────────────────────────── */}
      <div className="data-table-container">
        {filteredReceipts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            No receipts found for the selected date range.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt No.</th><th>Date</th><th>Received From</th><th>Description</th><th>Payment Method</th><th>Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.receipt_number}</td>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.received_from}</td>
                  <td style={{ color: '#6b7280' }}>{r.description || '—'}</td>
                  <td><span className={`badge ${getPaymentColor(r.payment_method)}`}>{r.payment_method}</span></td>
                  <td style={{ color: '#16a34a', fontWeight: 600 }}>${fmt2(r.amount)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setViewReceipt(r)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 11px', borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#f9fafb', color: '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#16a34a'; e.currentTarget.style.borderColor = '#86efac'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        <FiEye size={12} /> View
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        title="Edit Receipt"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#f9fafb', color: '#6b7280', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.color = '#2563eb'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        <FiEdit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td colSpan={6} style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontSize: 13 }}>
                  Total ({filteredReceipts.length} receipt{filteredReceipts.length !== 1 ? 's' : ''})
                </td>
                <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 700, fontSize: 14 }}>
                  ${fmt2(filteredTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── View Receipt Modal ──────────────────────────────────────── */}
      {viewReceipt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)', borderRadius: '14px 14px 0 0', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FiFileText size={15} style={{ color: 'rgba(255,255,255,0.8)' }} />
                  <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Cash Receipt</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{viewReceipt.receipt_number}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                  {formatDate(viewReceipt.date)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>
                  {viewReceipt.payment_method}
                </span>
                <button onClick={() => setViewReceipt(null)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#fff', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FiX size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Received From', value: viewReceipt.received_from },
                  { label: 'Date',          value: formatDate(viewReceipt.date) },
                  { label: 'Payment Method', value: viewReceipt.payment_method },
                  { label: 'Amount',         value: `$${fmt2(viewReceipt.amount)}` },
                ].map(info => (
                  <div key={info.label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{info.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{info.value}</div>
                  </div>
                ))}
              </div>

              {viewReceipt.description && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
                  <span style={{ fontWeight: 600 }}>Description: </span>{viewReceipt.description}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowCRPrint(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#9ca3af'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#d1d5db'; }}
              >
                <FiPrinter size={14} /> Print
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { openEdit(viewReceipt); setViewReceipt(null); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  <FiEdit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => setViewReceipt(null)}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New / Edit Receipt Modal ────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editMode ? 'Edit Cash Receipt' : 'New Cash Receipt'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              {formError && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{formError}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                    <option value="Cash">Cash</option>
                    <option value="Card">Card</option>
                    <option value="Check">Check</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Received From</label>
                  <input value={form.received_from} onChange={e => setForm({...form, received_from: e.target.value})} placeholder="Name of payer" />
                </div>
                <div className="form-group">
                  <label>Amount ($)</label>
                  <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Purpose of payment" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editMode ? 'Update Receipt' : 'Save Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single CR Print Preview ─────────────────────────────────── */}
      {viewReceipt && showCRPrint && (
        <div
          className="print-preview-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.88)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', paddingTop: 60, paddingBottom: 40 }}
        >
          {/* Toolbar */}
          <div
            className="no-print"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 2001, borderBottom: '1px solid #1e293b' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FiPrinter size={15} style={{ color: '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                Print Preview — {viewReceipt.receipt_number}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <FiPrinter size={14} /> Print
              </button>
              <button onClick={() => setShowCRPrint(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          {/* A4 Document */}
          <div
            id="print-document"
            style={{ width: 600, background: '#fff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #16a34a 100%)', padding: '28px 40px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>Cash Receipt</div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.8 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  ·  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8 }}>Receipt No.</div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1, fontFamily: 'monospace' }}>{viewReceipt.receipt_number}</div>
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>{formatDate(viewReceipt.date)}</div>
              </div>
            </div>

            {/* Accent bar */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #22c55e, #2563eb, #a855f7)' }} />

            {/* Body */}
            <div style={{ padding: '28px 40px 36px' }}>

              {/* Detail cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 26 }}>
                {[
                  { label: 'Received From',  value: viewReceipt.received_from,   bg: '#f0fdf4', border: '#86efac',  color: '#15803d' },
                  { label: 'Payment Method', value: viewReceipt.payment_method,  bg: '#eff6ff', border: '#bfdbfe',  color: '#1d4ed8' },
                  { label: 'Date',           value: formatDate(viewReceipt.date), bg: '#fff7ed', border: '#fed7aa',  color: '#c2410c' },
                  { label: 'Amount',         value: `$${fmt2(viewReceipt.amount)}`, bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
                ].map(card => (
                  <div key={card.label} style={{ padding: '14px 18px', borderRadius: 10, background: card.bg, border: `1.5px solid ${card.border}` }}>
                    <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{card.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Amount highlight */}
              <div style={{ border: '2px solid #86efac', borderRadius: 12, padding: '18px 24px', background: '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#15803d', fontWeight: 700, marginBottom: 4 }}>Total Amount Received</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{viewReceipt.payment_method} · {viewReceipt.received_from}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#15803d', fontFamily: 'monospace' }}>
                  ${fmt2(viewReceipt.amount)}
                </div>
              </div>

              {/* Description */}
              {viewReceipt.description && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11.5, color: '#78350f', marginBottom: 24 }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 0.8, marginRight: 8, color: '#92400e' }}>Description</span>
                  {viewReceipt.description}
                </div>
              )}

              {/* Signatures */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 40 }}>
                {['Received By', 'Authorized By'].map(label => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ height: 36, borderBottom: '1.5px solid #cbd5e1', marginBottom: 6 }} />
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#6b7280' }}>{label}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Name / Signature / Date</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer bar */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{businessInfo.business_name || 'Business'} — Confidential Document</span>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>
                Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Print styles ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-preview-overlay {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            right: 0 !important; bottom: 0 !important;
            background: #fff !important;
            padding: 0 !important;
            overflow: visible !important;
            display: block !important;
          }
          #print-document {
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
};

export default CashReceipt;
