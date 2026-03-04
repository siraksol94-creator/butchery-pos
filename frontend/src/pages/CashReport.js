import React, { useState, useEffect } from 'react';
import { FiSave, FiCalendar, FiEdit2, FiPlus, FiPrinter, FiEye, FiX } from 'react-icons/fi';
import { createPaymentVoucher, getSuppliers, getPaymentVouchers, getSettings, createCashReceipt, updateCashReceipt, checkSalesCashReceipt } from '../services/api';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const getStatus = (diff) => {
  if (diff === 0) return 'OK';
  if (diff > 0 && diff < 10) return 'Slight Surplus';
  if (diff >= 10) return 'Surplus';
  if (diff < 0 && diff > -10) return 'Slight Short';
  return 'Short';
};

const CashReport = () => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [reports, setReports] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);

  // History filter
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1); // 1–12, 0 = all
  const [filterYear, setFilterYear]   = useState(new Date().getFullYear());   // 0 = all

  const [form, setForm] = useState({
    initial_change: '', mobile_money: '', cash: '', expenses: '',
    pending: '', total: '', after_change: '', expected: '',
    difference: '', status: 'OK', comment: ''
  });

  const [dailyRevenue, setDailyRevenue] = useState(0);

  // Expenses list modal
  const [showExpenses, setShowExpenses] = useState(false);
  const [expensesList, setExpensesList] = useState([]);

  // Print preview
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printExpenses, setPrintExpenses] = useState([]);
  const [businessInfo, setBusinessInfo] = useState({});

  // Voucher modal state
  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    paid_to: '', description: '', category: 'Supplier',
    amount: '', date: today, paid_from: 'Cash Drawer'
  });
  const [suppliers, setSuppliers] = useState([]);
  const [savingVoucher, setSavingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState('');

  // CR auto-creation confirmation
  const [showCRConfirm, setShowCRConfirm] = useState(false);
  const [existingCR, setExistingCR] = useState(null);   // { id, receipt_number, amount }
  const [pendingCRData, setPendingCRData] = useState(null);
  const [crSaving, setCRSaving] = useState(false);

  const getToken = () => localStorage.getItem('token');

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/cash-reports`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) { setReports([]); }
  };

  const fetchDaily = async (d) => {
    try {
      const res = await fetch(`${API_BASE}/cash-reports/daily?date=${d}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      return data;
    } catch (err) { return null; }
  };

  const loadDate = async (d) => {
    setDate(d);
    setMessage('');

    const daily = await fetchDaily(d);
    if (daily) {
      setDailyRevenue(parseFloat(daily.total_revenue || 0));
    }

    const saved = reports.find(r => r.date && r.date.split('T')[0] === d);
    if (saved) {
      setForm({
        initial_change: saved.initial_change || '',
        mobile_money: saved.mobile_money || '',
        cash: saved.cash || '',
        expenses: saved.expenses || '',
        pending: saved.pending || '',
        total: saved.total || '',
        after_change: saved.after_change || '',
        expected: saved.expected || '',
        difference: saved.difference || '',
        status: saved.status || 'OK',
        comment: saved.comment || ''
      });
      setEditMode(false);
    } else {
      if (daily) {
        setForm(prev => ({
          ...prev,
          mobile_money: daily.mobile_money || '',
          expenses: daily.expenses || '',
          pending: daily.pending || '',
          cash: '',
          initial_change: '',
          after_change: '',
          comment: '',
          status: 'OK'
        }));
      }
      setEditMode(true);
    }
  };

  useEffect(() => {
    fetchReports();
    getSuppliers().then(r => setSuppliers(r.data || [])).catch(() => {});
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []);
  useEffect(() => { if (reports.length >= 0) loadDate(date); }, [reports]); // eslint-disable-line

  // Auto-calculate
  useEffect(() => {
    const ic = parseFloat(form.initial_change) || 0;
    const mm = parseFloat(form.mobile_money) || 0;
    const c = parseFloat(form.cash) || 0;
    const exp = parseFloat(form.expenses) || 0;
    const pend = parseFloat(form.pending) || 0;
    const total = mm + c + pend + exp;
    const after_change = total - ic;
    const expected = dailyRevenue;
    const diff = after_change - expected;
    const status = getStatus(diff);
    setForm(prev => ({ ...prev, total: total.toFixed(2), after_change: after_change.toFixed(2), expected: expected.toFixed(2), difference: diff.toFixed(2), status }));
  }, [form.initial_change, form.mobile_money, form.cash, form.expenses, form.pending, dailyRevenue]); // eslint-disable-line

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/cash-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({
          date,
          initial_change: parseFloat(form.initial_change) || 0,
          mobile_money: parseFloat(form.mobile_money) || 0,
          cash: parseFloat(form.cash) || 0,
          expenses: parseFloat(form.expenses) || 0,
          pending: parseFloat(form.pending) || 0,
          total: parseFloat(form.total) || 0,
          after_change: parseFloat(form.after_change) || 0,
          expected: parseFloat(form.expected) || 0,
          difference: parseFloat(form.difference) || 0,
          status: form.status,
          comment: form.comment
        })
      });
      if (res.ok) {
        setMessage('Report saved successfully!');
        setEditMode(false);
        await fetchReports();

        // Build CR payload from the saved report
        const afterChange = parseFloat(form.after_change) || 0;
        const status = form.status || computedStatus;
        const crData = {
          date,
          payment_method: 'Cash',
          received_from: 'Sales',
          amount: afterChange,
          description: form.comment ? `${status} — ${form.comment}` : status,
        };

        // Check if a Sales CR already exists for this date
        try {
          const checkRes = await checkSalesCashReceipt(date);
          if (checkRes.data.exists) {
            setExistingCR(checkRes.data);
            setPendingCRData(crData);
            setShowCRConfirm(true);
          } else {
            await createCashReceipt(crData);
            setMessage('Report saved and Cash Receipt created successfully!');
          }
        } catch (crErr) {
          // CR check/create failed silently — report was already saved
        }
      } else {
        const err = await res.json();
        setMessage(err.error || 'Failed to save.');
      }
    } catch (err) {
      setMessage('Failed to save report.');
    }
    setSaving(false);
  };

  const handleConfirmUpdateCR = async () => {
    if (!existingCR || !pendingCRData) return;
    setCRSaving(true);
    try {
      await updateCashReceipt(existingCR.id, pendingCRData);
      setMessage('Report saved and Cash Receipt updated successfully!');
    } catch (err) {
      setMessage('Report saved. Failed to update Cash Receipt.');
    } finally {
      setCRSaving(false);
      setShowCRConfirm(false);
      setExistingCR(null);
      setPendingCRData(null);
    }
  };

  const handleAbortUpdateCR = () => {
    setShowCRConfirm(false);
    setExistingCR(null);
    setPendingCRData(null);
  };

  // ── Expenses list helper ───────────────────────────────────────────
  const openExpensesList = async () => {
    try {
      const res = await getPaymentVouchers({ date, paid_from: 'Cash Drawer' });
      setExpensesList(res.data || []);
    } catch { setExpensesList([]); }
    setShowExpenses(true);
  };

  // ── Print preview helper ───────────────────────────────────────────
  const openPrintPreview = async () => {
    try {
      const res = await getPaymentVouchers({ date, paid_from: 'Cash Drawer' });
      setPrintExpenses(res.data || []);
    } catch { setPrintExpenses([]); }
    setShowPrintPreview(true);
  };

  // ── Voucher modal helpers ──────────────────────────────────────────
  const openVoucherForm = () => {
    setVoucherForm({ paid_to: '', description: '', category: 'Supplier', amount: '', date, paid_from: 'Cash Drawer' });
    setVoucherError('');
    setShowVoucher(true);
  };

  const handleSaveVoucher = async () => {
    setVoucherError('');
    if (voucherForm.category === 'Supplier' && !voucherForm.paid_to) return setVoucherError('Please select a supplier from the list.');
    if (!voucherForm.paid_to.trim()) return setVoucherError('Paid To is required.');
    if (!voucherForm.amount || parseFloat(voucherForm.amount) <= 0) return setVoucherError('Amount must be greater than 0.');
    setSavingVoucher(true);
    try {
      await createPaymentVoucher({
        paid_to: voucherForm.paid_to.trim(),
        description: voucherForm.description.trim(),
        category: voucherForm.category,
        amount: parseFloat(voucherForm.amount),
        date: voucherForm.date,
        paid_from: voucherForm.paid_from,
      });
      setShowVoucher(false);
      const daily = await fetchDaily(date);
      if (daily) setForm(prev => ({ ...prev, expenses: daily.expenses || '' }));
      setEditMode(true);
    } catch (err) {
      setVoucherError(err.response?.data?.error || 'Failed to save voucher.');
    } finally {
      setSavingVoucher(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const formatDateLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Always derive status from the live difference — never trust the saved status field
  const computedDiff = parseFloat(form.difference) || 0;
  const computedStatus = getStatus(computedDiff);

  const statusColor = (s) => {
    if (s === 'OK') return '#16a34a';
    if (s === 'Surplus') return '#2563eb';
    if (s === 'Slight Surplus') return '#0891b2';
    if (s === 'Slight Short') return '#d97706';
    return '#dc2626';
  };
  const statusBadge = (s) => {
    if (s === 'OK') return 'badge-green';
    if (s === 'Surplus' || s === 'Slight Surplus') return 'badge-blue';
    if (s === 'Slight Short') return 'badge-yellow';
    return 'badge-red';
  };
  const statusBg = (s) => {
    if (s === 'OK') return '#f0fdf4';
    if (s === 'Surplus') return '#eff6ff';
    if (s === 'Slight Surplus') return '#ecfeff';
    if (s === 'Slight Short') return '#fffbeb';
    return '#fef2f2';
  };
  const statusBorder = (s) => {
    if (s === 'OK') return '#86efac';
    if (s === 'Surplus') return '#93c5fd';
    if (s === 'Slight Surplus') return '#a5f3fc';
    if (s === 'Slight Short') return '#fde68a';
    return '#fca5a5';
  };

  const inputStyle = (editable) => ({
    background: editable ? '#fff' : '#f3f4f6',
    fontWeight: editable ? 400 : 600,
  });

  const fmt = (v) => parseFloat(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Derive unique years from saved reports for the year dropdown
  const availableYears = [...new Set(
    reports.map(r => r.date ? new Date(r.date + 'T12:00:00').getFullYear() : null).filter(Boolean)
  )].sort((a, b) => b - a);
  if (availableYears.length === 0) availableYears.push(new Date().getFullYear());

  // Apply month / year filter to history
  const filteredReports = reports.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date + 'T12:00:00');
    const okMonth = filterMonth === 0 || (d.getMonth() + 1) === filterMonth;
    const okYear  = filterYear  === 0 || d.getFullYear()    === filterYear;
    return okMonth && okYear;
  });

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="page-content">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header no-print">
        <div>
          <h1>Cash Report</h1>
          <p>Daily cash reconciliation</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px' }}>
            <FiCalendar style={{ color: '#9ca3af' }} />
            <input type="date" value={date} onChange={e => loadDate(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 14 }} />
          </div>
          <button
            onClick={openPrintPreview}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
          >
            <FiPrinter size={16} /> Print
          </button>
        </div>
      </div>

      {/* ── Cash Report Form ─────────────────────────────────────── */}
      <div className="card" id="cash-report-print" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Report for {formatDate(date)}</h3>
          <div style={{ display: 'flex', gap: 8 }} className="no-print">
            {!editMode && (
              <button className="btn btn-secondary" onClick={() => setEditMode(true)}>
                <FiEdit2 /> Edit
              </button>
            )}
            {editMode && (
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                <FiSave /> {saving ? 'Saving...' : 'Save Report'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div style={{ color: message.includes('success') ? '#16a34a' : '#dc2626', marginBottom: 12, fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="form-group">
            <label>Initial Change ($)</label>
            <input type="number" value={form.initial_change}
              onChange={e => setForm({ ...form, initial_change: e.target.value })}
              disabled={!editMode} placeholder="0.00" step="0.01"
              style={inputStyle(editMode)} />
          </div>
          <div className="form-group">
            <label>Mobile Money ($)</label>
            <input type="number" value={form.mobile_money}
              onChange={e => setForm({ ...form, mobile_money: e.target.value })}
              disabled={!editMode} placeholder="0.00" step="0.01"
              style={inputStyle(editMode)} />
          </div>
          <div className="form-group">
            <label>Cash ($)</label>
            <input type="number" value={form.cash}
              onChange={e => setForm({ ...form, cash: e.target.value })}
              disabled={!editMode} placeholder="0.00" step="0.01"
              style={inputStyle(editMode)} />
          </div>

          {/* Expenses — read-only with + button */}
          <div className="form-group">
            <label>Expenses ($)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number" value={form.expenses} disabled
                placeholder="0.00" step="0.01"
                style={{ background: '#f3f4f6', fontWeight: 600, flex: 1 }}
              />
              <button
                onClick={openExpensesList}
                title="View expenses"
                className="no-print"
                style={{
                  width: 34, height: 34, borderRadius: 8, border: '1.5px solid #e5e7eb', flexShrink: 0,
                  background: '#fff', color: '#6b7280', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.color = '#374151'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
              >
                <FiEye size={15} />
              </button>
              <button
                onClick={openVoucherForm}
                title="Add expense voucher"
                className="no-print"
                style={{
                  width: 34, height: 34, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: '#2563eb', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.35)', transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}
              >
                <FiPlus size={16} />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Pending ($)</label>
            <input type="number" value={form.pending}
              onChange={e => setForm({ ...form, pending: e.target.value })}
              disabled={!editMode} placeholder="0.00" step="0.01"
              style={inputStyle(editMode)} />
          </div>
          <div className="form-group">
            <label>Total ($)</label>
            <input type="number" value={form.total} disabled style={{ background: '#f3f4f6', fontWeight: 600 }} />
          </div>
          <div className="form-group">
            <label>After Change ($)</label>
            <input type="number" value={form.after_change} disabled placeholder="0.00"
              style={{ background: '#f3f4f6', fontWeight: 600 }} />
          </div>
          <div className="form-group">
            <label>Expected ($)</label>
            <input type="number" value={form.expected} disabled style={{ background: '#f3f4f6', fontWeight: 600 }} />
          </div>
          <div className="form-group">
            <label>Difference ($)</label>
            <input type="number" value={form.difference} disabled
              style={{ background: '#f3f4f6', fontWeight: 600, color: statusColor(computedStatus) }} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <input value={computedStatus} disabled
              style={{ background: '#f3f4f6', fontWeight: 600, color: statusColor(computedStatus) }} />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label>Comment</label>
            <input value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              disabled={!editMode} placeholder="Optional notes..."
              style={inputStyle(editMode)} />
          </div>
        </div>
      </div>

      {/* ── History Filter Bar ───────────────────────────────────── */}
      <div className="no-print" style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '12px 16px', background: '#f8fafc',
        border: '1px solid #e5e7eb', borderRadius: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginRight: 4 }}>Filter History:</span>

        {/* Month */}
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(Number(e.target.value))}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db',
            fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer',
          }}
        >
          <option value={0}>All Months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        {/* Year */}
        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          style={{
            padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db',
            fontSize: 13, background: '#fff', color: '#374151', cursor: 'pointer',
          }}
        >
          <option value={0}>All Years</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Clear */}
        {(filterMonth !== 0 || filterYear !== 0) && (
          <button
            onClick={() => { setFilterMonth(0); setFilterYear(0); }}
            style={{
              padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb',
              fontSize: 12, background: '#fff', color: '#6b7280', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {filteredReports.length} report{filteredReports.length !== 1 ? 's' : ''}
          {(filterMonth !== 0 || filterYear !== 0) && (
            <> — {filterMonth !== 0 ? MONTHS[filterMonth - 1] : ''}{filterMonth !== 0 && filterYear !== 0 ? ' ' : ''}{filterYear !== 0 ? filterYear : ''}</>
          )}
        </span>
      </div>

      {/* ── Report History ───────────────────────────────────────── */}
      {/* ── Summary Strip ────────────────────────────────────────── */}
      {filteredReports.length > 0 && (() => {
        const totalExpected   = filteredReports.reduce((s, r) => s + parseFloat(r.expected   || 0), 0);
        const totalAfterChange = filteredReports.reduce((s, r) => s + parseFloat(r.after_change || 0), 0);
        const totalDifference  = totalAfterChange - totalExpected;
        const diffStatus = getStatus(totalDifference);
        const summaryCards = [
          { label: 'Total Expected Cash', value: totalExpected,    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Total Cash on Hand',  value: totalAfterChange, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Total Difference',    value: totalDifference,
            color: totalDifference < 0 ? '#dc2626' : totalDifference > 0 ? '#16a34a' : '#6b7280',
            bg:    totalDifference < 0 ? '#fef2f2' : totalDifference > 0 ? '#f0fdf4' : '#f9fafb',
            border:totalDifference < 0 ? '#fecaca' : totalDifference > 0 ? '#bbf7d0' : '#e5e7eb',
            badge: diffStatus },
        ];
        return (
          <div className="no-print" style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            {summaryCards.map(card => (
              <div key={card.label} style={{
                flex: 1, padding: '18px 22px', borderRadius: 12,
                background: card.bg, border: `1.5px solid ${card.border}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: card.color, letterSpacing: -0.5 }}>
                  ${Math.abs(card.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {card.badge && (
                    <span style={{
                      marginLeft: 10, fontSize: 11, fontWeight: 600,
                      padding: '2px 10px', borderRadius: 20,
                      background: card.color + '1a', color: card.color, verticalAlign: 'middle'
                    }}>{card.badge}</span>
                  )}
                </div>
                {card.label === 'Total Difference' && totalDifference !== 0 && (
                  <div style={{ fontSize: 11, color: card.color, marginTop: 4 }}>
                    {totalDifference < 0 ? '▼ Short' : '▲ Surplus'} by ${Math.abs(totalDifference).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      <div className="data-table-container no-print">
        <h3 style={{ padding: '12px 16px', fontSize: 15, fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>Report History</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Initial Change</th><th>Mobile Money</th><th>Cash</th>
              <th>Expenses</th><th>Pending</th><th>Total</th>
              <th>After Change</th><th>Expected</th><th>Difference</th>
              <th>Status</th><th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {filteredReports.length === 0 ? (
              <tr><td colSpan="12" style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>No reports found for the selected period.</td></tr>
            ) : filteredReports.map(r => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => loadDate(r.date.split('T')[0])}>
                <td style={{ fontWeight: 500 }}>{formatDate(r.date)}</td>
                <td>${parseFloat(r.initial_change || 0).toLocaleString()}</td>
                <td>${parseFloat(r.mobile_money || 0).toLocaleString()}</td>
                <td>${parseFloat(r.cash || 0).toLocaleString()}</td>
                <td style={{ color: '#dc2626' }}>${parseFloat(r.expenses || 0).toLocaleString()}</td>
                <td>${parseFloat(r.pending || 0).toLocaleString()}</td>
                <td style={{ fontWeight: 600 }}>${parseFloat(r.total || 0).toLocaleString()}</td>
                <td>${parseFloat(r.after_change || 0).toLocaleString()}</td>
                <td style={{ fontWeight: 500 }}>${parseFloat(r.expected || 0).toLocaleString()}</td>
                {(() => { const d = parseFloat(r.difference || 0); const s = getStatus(d); return (<>
                <td style={{ fontWeight: 600, color: statusColor(s) }}>${d.toLocaleString()}</td>
                <td><span className={`badge ${statusBadge(s)}`}>{s}</span></td>
                </>); })()}
                <td style={{ color: '#6b7280', fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── New Payment Voucher Modal ─────────────────────────────── */}
      {showVoucher && (
        <div className="modal-overlay" onClick={() => setShowVoucher(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New Payment Voucher</h3>
              <button className="modal-close" onClick={() => setShowVoucher(false)}>×</button>
            </div>
            <div className="modal-body">
              {voucherError && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{voucherError}</div>}
              <div className="form-row">
                <div className="form-group">
                  <label>Paid From</label>
                  <select value={voucherForm.paid_from} disabled
                    style={{ background: '#f3f4f6', fontWeight: 600, cursor: 'not-allowed' }}>
                    <option value="Cash Drawer">Cash Drawer</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={voucherForm.date} onChange={e => setVoucherForm({ ...voucherForm, date: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select value={voucherForm.category} onChange={e => setVoucherForm({ ...voucherForm, category: e.target.value, paid_to: '' })}>
                    <option value="Supplier">Supplier</option>
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
                  {voucherForm.category === 'Supplier' ? (
                    <select value={voucherForm.paid_to} onChange={e => setVoucherForm({ ...voucherForm, paid_to: e.target.value })}>
                      <option value="">Select supplier...</option>
                      {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  ) : (
                    <input value={voucherForm.paid_to} onChange={e => setVoucherForm({ ...voucherForm, paid_to: e.target.value })} placeholder="Name of payee" />
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" value={voucherForm.amount}
                  onChange={e => setVoucherForm({ ...voucherForm, amount: e.target.value })}
                  placeholder="0.00" min="0" step="0.01" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input value={voucherForm.description}
                  onChange={e => setVoucherForm({ ...voucherForm, description: e.target.value })}
                  placeholder="Payment details" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowVoucher(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveVoucher} disabled={savingVoucher}>
                {savingVoucher ? 'Saving...' : 'Save Voucher'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expenses List Modal ──────────────────────────────────── */}
      {showExpenses && (
        <div className="modal-overlay" onClick={() => setShowExpenses(false)}>
          <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cash Drawer Expenses — {formatDate(date)}</h3>
              <button className="modal-close" onClick={() => setShowExpenses(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {expensesList.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '32px 0' }}>No expenses recorded for this date.</p>
              ) : (
                <table className="data-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Voucher No.</th><th>Category</th><th>Paid To</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expensesList.map(v => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 500 }}>{v.voucher_number}</td>
                        <td><span className="badge badge-gray">{v.category}</span></td>
                        <td>{v.paid_to}</td>
                        <td style={{ color: '#6b7280' }}>{v.description || '—'}</td>
                        <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>${parseFloat(v.amount).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      <td colSpan={4} style={{ textAlign: 'right' }}>Total</td>
                      <td style={{ textAlign: 'right', color: '#dc2626' }}>
                        ${expensesList.reduce((s, v) => s + parseFloat(v.amount || 0), 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowExpenses(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Preview ─────────────────────────────────────────── */}
      {showPrintPreview && (
        <div
          className="print-preview-overlay"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.85)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', overflowY: 'auto',
            paddingTop: 60, paddingBottom: 40,
          }}
        >
          {/* ── Preview Toolbar ── */}
          <div
            className="no-print"
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, height: 52,
              background: '#0f172a', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', padding: '0 24px', zIndex: 1001,
              borderBottom: '1px solid #1e293b',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FiPrinter size={16} style={{ color: '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                Print Preview — Cash Report for {formatDateLong(date)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => window.print()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 20px', borderRadius: 8, border: 'none',
                  background: '#2563eb', color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                <FiPrinter size={14} /> Print
              </button>
              <button
                onClick={() => setShowPrintPreview(false)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8,
                  border: '1px solid #334155',
                  background: 'transparent', color: '#94a3b8',
                  cursor: 'pointer', fontSize: 13,
                }}
              >
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          {/* ── A4 Print Document ── */}
          <div
            id="print-document"
            style={{
              width: 794,
              background: '#ffffff',
              margin: '0 auto',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              fontFamily: '"Segoe UI", Arial, sans-serif',
              fontSize: 12,
              color: '#1a1a2e',
              flexShrink: 0,
            }}
          >
            {/* ── Document Header ── */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)',
              padding: '30px 44px 24px',
              color: '#fff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email]
                    .filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
                  opacity: 0.65, marginBottom: 6,
                }}>
                  Daily Cash Report
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
                  {formatDateLong(date)}
                </div>
              </div>
            </div>

            {/* ── Thin accent bar ── */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6)' }} />

            {/* ── Body ── */}
            <div style={{ padding: '30px 44px 36px' }}>

              {/* ── Two-column: Breakdown + Reconciliation ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

                {/* Left — Cash Breakdown */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{
                    background: '#f8fafc', padding: '10px 18px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#2563eb', display: 'inline-block', flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#475569' }}>
                      Cash Breakdown
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        { label: 'Initial Change (Float)', value: form.initial_change, color: '#374151' },
                        { label: 'Mobile Money', value: form.mobile_money, color: '#374151' },
                        { label: 'Cash', value: form.cash, color: '#374151' },
                        { label: 'Pending Collections', value: form.pending, color: '#374151' },
                        { label: 'Expenses (Cash Drawer)', value: form.expenses, color: '#dc2626', italic: true },
                      ].map((row, i, arr) => (
                        <tr key={i} style={{ borderBottom: i < arr.length - 1 ? '1px solid #f1f5f9' : '2px solid #e2e8f0' }}>
                          <td style={{ padding: '9px 18px', color: row.color, fontSize: 12, fontStyle: row.italic ? 'italic' : 'normal' }}>
                            {row.label}
                          </td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 500, color: row.color, fontFamily: 'monospace', fontSize: 12 }}>
                            {row.color === '#dc2626' ? '−' : ''}${fmt(row.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '10px 18px', fontWeight: 700, fontSize: 12.5 }}>Total</td>
                        <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 700, fontSize: 13, fontFamily: 'monospace' }}>
                          ${fmt(form.total)}
                        </td>
                      </tr>
                      <tr style={{ background: '#eff6ff' }}>
                        <td style={{ padding: '11px 18px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>
                          Cash on Hand (After Change)
                        </td>
                        <td style={{ padding: '11px 18px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8', fontSize: 14, fontFamily: 'monospace' }}>
                          ${fmt(form.after_change)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Right — Reconciliation + Status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Reconciliation table */}
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{
                      background: '#f8fafc', padding: '10px 18px',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#10b981', display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#475569' }}>
                        Reconciliation
                      </span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 18px', color: '#374151', fontSize: 12 }}>Expected Revenue</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                            ${fmt(form.expected)}
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                          <td style={{ padding: '9px 18px', color: '#374151', fontSize: 12 }}>Cash on Hand</td>
                          <td style={{ padding: '9px 18px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                            ${fmt(form.after_change)}
                          </td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr style={{
                          background: statusBg(computedStatus),
                        }}>
                          <td style={{ padding: '11px 18px', fontWeight: 700, fontSize: 13 }}>Difference</td>
                          <td style={{
                            padding: '11px 18px', textAlign: 'right',
                            fontWeight: 800, fontSize: 14,
                            color: statusColor(computedStatus),
                            fontFamily: 'monospace',
                          }}>
                            {computedDiff >= 0 ? '+' : '−'}${fmt(Math.abs(computedDiff))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Status card */}
                  <div style={{
                    padding: '18px 20px', borderRadius: 10, textAlign: 'center',
                    background: statusBg(computedStatus),
                    border: `2px solid ${statusBorder(computedStatus)}`,
                    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#64748b', marginBottom: 8, fontWeight: 600 }}>
                      Report Status
                    </div>
                    <div style={{
                      fontSize: 26, fontWeight: 900, letterSpacing: 3,
                      color: statusColor(computedStatus), textTransform: 'uppercase',
                      marginBottom: 6,
                    }}>
                      {computedStatus}
                    </div>
                    {computedDiff !== 0 ? (
                      <div style={{ fontSize: 11.5, color: statusColor(computedStatus), fontWeight: 500 }}>
                        {computedDiff < 0 ? 'Cash short by' : 'Surplus of'}&nbsp;
                        <strong>${fmt(Math.abs(computedDiff))}</strong>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 500 }}>
                        Fully balanced
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Expenses Breakdown ── */}
              {printExpenses.length > 0 && (
                <div style={{ border: '1px solid #fed7aa', borderRadius: 10, overflow: 'hidden', marginBottom: 22 }}>
                  <div style={{
                    background: '#fff7ed', padding: '10px 18px',
                    borderBottom: '1px solid #fed7aa',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#f97316', display: 'inline-block',
                      }} />
                      <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#c2410c' }}>
                        Expenses Breakdown — Cash Drawer
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: '#c2410c', fontWeight: 600 }}>
                      {printExpenses.length} voucher{printExpenses.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                    <thead>
                      <tr style={{ background: '#fafaf9' }}>
                        {['Voucher No.', 'Category', 'Paid To', 'Description'].map(h => (
                          <th key={h} style={{ padding: '7px 18px', textAlign: 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontSize: 10.5, letterSpacing: 0.3 }}>{h}</th>
                        ))}
                        <th style={{ padding: '7px 18px', textAlign: 'right', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontSize: 10.5, letterSpacing: 0.3 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printExpenses.map((v, i) => (
                        <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 1 ? '#fffbf7' : '#fff' }}>
                          <td style={{ padding: '8px 18px', fontWeight: 600, color: '#374151', fontFamily: 'monospace', fontSize: 11 }}>{v.voucher_number}</td>
                          <td style={{ padding: '8px 18px', color: '#374151' }}>{v.category}</td>
                          <td style={{ padding: '8px 18px', fontWeight: 500 }}>{v.paid_to}</td>
                          <td style={{ padding: '8px 18px', color: '#9ca3af' }}>{v.description || '—'}</td>
                          <td style={{ padding: '8px 18px', textAlign: 'right', color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>
                            ${fmt(v.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#fff7ed', borderTop: '2px solid #fed7aa' }}>
                        <td colSpan={4} style={{ padding: '10px 18px', fontWeight: 700, textAlign: 'right', color: '#9a3412', fontSize: 12 }}>
                          Total Expenses
                        </td>
                        <td style={{ padding: '10px 18px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 13, fontFamily: 'monospace' }}>
                          ${fmt(printExpenses.reduce((s, v) => s + parseFloat(v.amount || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Comments ── */}
              {form.comment ? (
                <div style={{
                  border: '1px solid #e2e8f0', borderRadius: 10,
                  padding: '14px 18px', marginBottom: 26, background: '#f8fafc',
                }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                    Comments / Notes
                  </div>
                  <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.6 }}>{form.comment}</div>
                </div>
              ) : (
                <div style={{ marginBottom: 26 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                    Comments / Notes
                  </div>
                  <div style={{ borderBottom: '1px solid #cbd5e1', height: 24 }} />
                </div>
              )}

              {/* ── Signatures ── */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48,
                paddingTop: 20, borderTop: '1.5px solid #e2e8f0',
              }}>
                {['Prepared by (Cashier)', 'Approved by (Manager)'].map(label => (
                  <div key={label}>
                    <div style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 700, marginBottom: 22 }}>
                      {label}
                    </div>
                    {['Name', 'Signature', 'Date'].map(field => (
                      <div key={field} style={{ marginBottom: 20 }}>
                        <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: 2, marginBottom: 4, minHeight: 20 }}>&nbsp;</div>
                        <div style={{ fontSize: 9.5, color: '#94a3b8', letterSpacing: 0.3 }}>{field}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* ── Document Footer ── */}
              <div style={{
                borderTop: '1px solid #f1f5f9', marginTop: 20, paddingTop: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>
                  {businessInfo.business_name || 'Business'} — Confidential
                </span>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>
                  Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CR Duplicate Confirmation Modal ─────────────────────── */}
      {showCRConfirm && existingCR && pendingCRData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                ⚠
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Cash Receipt Already Exists</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{formatDate(date)}</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 24px' }}>
              <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>
                A Cash Receipt from <strong>Sales</strong> already exists for <strong>{formatDate(date)}</strong>:
              </p>
              <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9, marginBottom: 16, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#1d4ed8', fontFamily: 'monospace' }}>{existingCR.receipt_number}</span>
                  <span style={{ color: '#6b7280' }}>Current amount:</span>
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>${parseFloat(existingCR.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <p style={{ margin: '0 0 6px', fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>
                Do you want to update it with the new amount?
              </p>
              <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#15803d' }}>New amount:</span>
                  <span style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>${parseFloat(pendingCRData.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 4 }}>
                  Description: <em>{pendingCRData.description}</em>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={handleAbortUpdateCR}
                disabled={crSaving}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                No, Keep Existing
              </button>
              <button
                onClick={handleConfirmUpdateCR}
                disabled={crSaving}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: crSaving ? '#9ca3af' : '#1d4ed8', color: '#fff', cursor: crSaving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                {crSaving ? 'Updating…' : 'Yes, Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print styles ─────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }

          /* When preview is open: print only the document */
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

export default CashReport;
