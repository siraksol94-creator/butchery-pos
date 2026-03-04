import React, { useState, useEffect } from 'react';
import { getGRNs, getGRNStats, createGRN, getProducts, getSuppliers, createSupplier, getSettings, getGRNProductReport, getGRN, updateGRN } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiPlus, FiFileText, FiCalendar, FiUsers, FiClock, FiX, FiTrash2, FiPrinter, FiSearch, FiChevronDown, FiChevronUp, FiPackage, FiEdit2, FiEye } from 'react-icons/fi';

const defaultStats = { totalGRNs: 0, thisMonth: 0, suppliers: 0, pending: 0 };
const emptyItem = () => ({ product_id: '', product_text: '', quantity: '', unit_price: '' });
const todayStr = new Date().toISOString().split('T')[0];

// ── Row is "complete" when product, quantity > 0, and unit price are all filled ──
const isRowComplete = (row) =>
  row.product_id !== '' &&
  row.quantity !== '' && parseFloat(row.quantity) > 0 &&
  row.unit_price !== '';

// ── Payment status badge style ────────────────────────────────────────────
const paymentStatusStyle = (status) => {
  if (status === 'Paid')           return { bg: '#dcfce7', color: '#166534', border: '#86efac' };
  if (status === 'Partially Paid') return { bg: '#fef9c3', color: '#854d0e', border: '#fcd34d' };
  return                                  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }; // Not Paid
};

const GRN = () => {
  const { t } = useLanguage();
  const [stats, setStats]       = useState(defaultStats);
  const [grns, setGRNs]         = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editMode, setEditMode]   = useState(false);   // true = editing existing GRN
  const [editId, setEditId]       = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [viewGRN, setViewGRN]           = useState(null);
  const [viewLoading, setViewLoading]   = useState(false);
  const [showGRNPrint, setShowGRNPrint] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [addRowError, setAddRowError] = useState('');

  // ── List date filter ──────────────────────────────────────────────
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');

  // ── Print preview ─────────────────────────────────────────────────
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [businessInfo, setBusinessInfo]         = useState({});

  // ── Product Received Report ────────────────────────────────────────
  const [showReport, setShowReport]       = useState(false);
  const [reportFrom, setReportFrom]       = useState('');
  const [reportTo, setReportTo]           = useState(todayStr);
  const [reportProduct, setReportProduct] = useState('');
  const [reportData, setReportData]       = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError]     = useState('');
  const [reportSearched, setReportSearched] = useState(false);

  // ── New GRN form state ────────────────────────────────────────────
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate]             = useState(todayStr);
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState([emptyItem()]);

  // ── Product autocomplete ──────────────────────────────────────────
  const [openDropdownIdx, setOpenDropdownIdx] = useState(-1);

  // ── Quick-add supplier ────────────────────────────────────────────
  const [showAddSupplier, setShowAddSupplier]   = useState(false);
  const [newSupName, setNewSupName]             = useState('');
  const [newSupPhone, setNewSupPhone]           = useState('');
  const [addingSupplier, setAddingSupplier]     = useState(false);
  const [addSupplierError, setAddSupplierError] = useState('');

  const fetchData = async () => {
    try {
      const [statsRes, grnsRes] = await Promise.all([getGRNStats(), getGRNs()]);
      if (statsRes.data) setStats(statsRes.data);
      if (grnsRes.data) setGRNs(grnsRes.data);
    } catch (err) { /* use defaults */ }
  };

  useEffect(() => {
    fetchData();
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
    const fetchFormData = async () => {
      try {
        const [prodRes, supRes] = await Promise.all([getProducts(), getSuppliers()]);
        if (prodRes.data?.length > 0) setProducts(prodRes.data);
        if (supRes.data?.length > 0)  setSuppliers(supRes.data);
      } catch (err) {}
    };
    fetchFormData();
  }, []);

  // ── Filtered list (applied to the table + print) ──────────────────
  const filteredGRNs = grns.filter(grn => {
    const d = (grn.date || grn.created_at || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });

  const filteredTotal = filteredGRNs.reduce((s, g) => s + parseFloat(g.total_amount || 0), 0);

  // ── Form helpers ──────────────────────────────────────────────────
  const openForm = () => {
    setEditMode(false); setEditId(null);
    setSupplierId(''); setDate(todayStr); setNotes('');
    setItems([emptyItem()]); setError(''); setAddRowError('');
    setOpenDropdownIdx(-1);
    setShowAddSupplier(false); setNewSupName(''); setNewSupPhone(''); setAddSupplierError('');
    setShowForm(true);
  };

  const openEdit = async (grn) => {
    setEditLoading(true);
    setError(''); setAddRowError('');
    try {
      const res = await getGRN(grn.id);
      const g = res.data;
      setEditMode(true);
      setEditId(g.id);
      setSupplierId(String(g.supplier_id || ''));
      setDate((g.date || g.created_at || todayStr).split('T')[0]);
      setNotes(g.notes || '');
      setItems(
        (g.items || []).length > 0
          ? g.items.map(i => ({
              product_id:   String(i.product_id),
              product_text: i.product_name || '',
              quantity:     String(i.quantity),
              unit_price:   String(i.unit_price),
            }))
          : [emptyItem()]
      );
      setOpenDropdownIdx(-1);
      setShowAddSupplier(false); setNewSupName(''); setNewSupPhone(''); setAddSupplierError('');
      setShowForm(true);
    } catch (err) {
      alert('Failed to load GRN details.');
    } finally {
      setEditLoading(false);
    }
  };

  const openView = async (grn) => {
    setViewLoading(true);
    try {
      const res = await getGRN(grn.id);
      setViewGRN(res.data);
    } catch (err) {
      alert('Failed to load GRN details.');
    } finally {
      setViewLoading(false);
    }
  };

  const updateItem = (idx, field, value) =>
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const addItemRow = () => {
    const last = items[items.length - 1];
    if (!isRowComplete(last)) {
      setAddRowError('Please complete the current row — select a product, enter a quantity and unit cost — before adding another.');
      return;
    }
    setAddRowError('');
    setItems(prev => [...prev, emptyItem()]);
  };

  const removeItemRow = (idx) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
    setAddRowError('');
  };

  const handleAddSupplier = async () => {
    if (!newSupName.trim()) return setAddSupplierError('Name is required.');
    setAddingSupplier(true); setAddSupplierError('');
    try {
      const res = await createSupplier({ name: newSupName.trim(), phone: newSupPhone.trim() || null });
      const s = res.data;
      setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(String(s.id));
      setShowAddSupplier(false); setNewSupName(''); setNewSupPhone('');
    } catch (err) {
      setAddSupplierError(err.response?.data?.error || 'Failed to create supplier.');
    } finally { setAddingSupplier(false); }
  };

  const totalAmount = items.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
  }, 0);

  const handleSave = async () => {
    setError('');
    if (!supplierId) return setError('Please select a supplier.');
    const validItems = items.filter(i => i.product_id && parseFloat(i.quantity) > 0 && parseFloat(i.unit_price) >= 0);
    if (validItems.length === 0) return setError('Please add at least one item with a product and quantity.');
    const payload = {
      supplier_id: parseInt(supplierId),
      date, notes,
      items: validItems.map(i => ({
        product_id: parseInt(i.product_id),
        quantity:   parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price),
      })),
    };
    setSaving(true);
    try {
      if (editMode) {
        await updateGRN(editId, payload);
      } else {
        await createGRN(payload);
      }
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save GRN. Please try again.');
    } finally { setSaving(false); }
  };

  const formatDate = (d) => {
    const str = (d || '').split('T')[0];
    if (!str) return '—';
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateLong = (d) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const hasFilter = filterFrom || filterTo;

  const runProductReport = async () => {
    setReportLoading(true);
    setReportError('');
    setReportSearched(true);
    try {
      const params = {};
      if (reportFrom)    params.from       = reportFrom;
      if (reportTo)      params.to         = reportTo;
      if (reportProduct) params.product_id = reportProduct;
      const res = await getGRNProductReport(params);
      setReportData(res.data || []);
    } catch (err) {
      setReportError(err.response?.data?.error || 'Failed to load report.');
      setReportData([]);
    } finally {
      setReportLoading(false);
    }
  };

  const reportTotal = reportData.reduce((s, r) => s + parseFloat(r.total_cost || 0), 0);

  return (
    <div className="page-content">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>{t('grnTitle')}</h1>
          <p>Track incoming stock deliveries</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowPrintPreview(true)}
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
          <button className="btn btn-primary" onClick={openForm}><FiPlus /> {t('newGRN')}</button>
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────── */}
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiFileText /></div>
          <div><div className="stat-label">{t('totalGRNs')}</div><div className="stat-value">{stats.totalGRNs}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiCalendar /></div>
          <div><div className="stat-label">{t('thisMonth')}</div><div className="stat-value">{stats.thisMonth}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiUsers /></div>
          <div><div className="stat-label">{t('suppliers')}</div><div className="stat-value">{stats.suppliers}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ffedd5', color: '#ea580c' }}><FiClock /></div>
          <div><div className="stat-label">{t('pending')}</div><div className="stat-value">{stats.pending}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}><FiFileText /></div>
          <div>
            <div className="stat-label">Total Amount</div>
            <div className="stat-value" style={{ fontSize: 18 }}>${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      {/* ── Date Filter Bar ───────────────────────────────────────── */}
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
          {filteredGRNs.length} GRN{filteredGRNs.length !== 1 ? 's' : ''}
          {hasFilter && <> &nbsp;·&nbsp; Total: <strong style={{ color: '#16a34a' }}>${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></>}
        </span>
      </div>

      {/* ── GRN Table ─────────────────────────────────────────────── */}
      <div className="data-table-container">
        {filteredGRNs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            {hasFilter ? 'No GRNs found for the selected date range.' : t('noData')}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>GRN Number</th><th>{t('date')}</th><th>{t('supplier')}</th>
                <th>Items</th><th>{t('amount')}</th><th>{t('status')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredGRNs.map(grn => (
                <tr key={grn.id}>
                  <td style={{ fontWeight: 500 }}>{grn.grn_number}</td>
                  <td>{formatDate(grn.date || grn.created_at)}</td>
                  <td>{grn.supplier_name || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{grn.total_items}</td>
                  <td>${parseFloat(grn.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>
                    {(() => { const s = paymentStatusStyle(grn.payment_status); return (
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {grn.payment_status || 'Not Paid'}
                      </span>
                    ); })()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => openView(grn)}
                        disabled={viewLoading}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 11px', borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#f9fafb', color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s', fontSize: 12, fontWeight: 500,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4'; e.currentTarget.style.color = '#16a34a'; e.currentTarget.style.borderColor = '#86efac'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        <FiEye size={12} /> View
                      </button>
                      <button
                        onClick={() => openEdit(grn)}
                        disabled={editLoading}
                        title="Edit GRN"
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 30, height: 30, borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#f9fafb', color: '#6b7280', cursor: 'pointer', transition: 'all 0.15s',
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
          </table>
        )}
      </div>

      {/* ── Product Received Breakdown ────────────────────────────── */}
      <div style={{ marginTop: 20, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>

        {/* Collapsible Header */}
        <button
          onClick={() => setShowReport(v => !v)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: showReport ? '#f0fdf4' : '#f8fafc',
            border: 'none', cursor: 'pointer', borderBottom: showReport ? '1px solid #d1fae5' : 'none',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FiPackage size={16} style={{ color: '#16a34a' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: '#15803d' }}>Product Received Breakdown</span>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>— How much of each product was received in a date range</span>
          </div>
          {showReport ? <FiChevronUp size={16} style={{ color: '#6b7280' }} /> : <FiChevronDown size={16} style={{ color: '#6b7280' }} />}
        </button>

        {showReport && (
          <div style={{ padding: '20px 24px', background: '#fff' }}>

            {/* Filter Row */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>Product</label>
                <select
                  value={reportProduct}
                  onChange={e => setReportProduct(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', minWidth: 200, color: '#374151' }}
                >
                  <option value="">All Products</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>From Date</label>
                <input
                  type="date" value={reportFrom} max={reportTo || todayStr}
                  onChange={e => setReportFrom(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 5 }}>To Date</label>
                <input
                  type="date" value={reportTo} min={reportFrom || undefined} max={todayStr}
                  onChange={e => setReportTo(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, color: '#374151' }}
                />
              </div>
              <button
                onClick={runProductReport}
                disabled={reportLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: reportLoading ? '#9ca3af' : '#16a34a',
                  color: '#fff', cursor: reportLoading ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}
              >
                <FiSearch size={14} />
                {reportLoading ? 'Searching…' : 'Search'}
              </button>
              {reportSearched && !reportLoading && (
                <button
                  onClick={() => { setReportFrom(''); setReportTo(todayStr); setReportProduct(''); setReportData([]); setReportSearched(false); setReportError(''); }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Error */}
            {reportError && (
              <div style={{ padding: '10px 14px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
                {reportError}
              </div>
            )}

            {/* Results */}
            {!reportSearched && !reportLoading && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af', fontSize: 13 }}>
                Set a date range and click Search to see product quantities received.
              </div>
            )}

            {reportSearched && !reportLoading && reportData.length === 0 && !reportError && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#9ca3af', fontSize: 13 }}>
                No GRN items found for the selected filters.
              </div>
            )}

            {reportData.length > 0 && (
              <>
                {/* Period label */}
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Showing <strong style={{ color: '#15803d' }}>{reportData.length}</strong> product{reportData.length !== 1 ? 's' : ''}
                  {(reportFrom || reportTo) && (
                    <> from <strong>{reportFrom ? formatDate(reportFrom) : 'the beginning'}</strong> to <strong>{reportTo ? formatDate(reportTo) : 'today'}</strong></>
                  )}
                </div>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f0fdf4' }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>#</th>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>Product</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>Qty Received</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>GRN Count</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>Total Cost ($)</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>First Received</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#15803d', fontSize: 11.5, letterSpacing: 0.4 }}>Last Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.map((row, idx) => (
                        <tr key={row.product_id} style={{ borderTop: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>
                            {row.product_name}
                            {row.unit && <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>{row.unit}</span>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: '#15803d', fontFamily: 'monospace' }}>
                            {parseFloat(row.total_quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151' }}>{row.grn_count}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>
                            ${parseFloat(row.total_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{formatDate(row.first_received)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{formatDate(row.last_received)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                        <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12.5, color: '#14532d' }}>
                          TOTAL
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14, fontFamily: 'monospace', color: '#15803d' }}>
                          ${reportTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── View GRN Modal ────────────────────────────────────────── */}
      {viewGRN && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)', borderRadius: '14px 14px 0 0', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FiFileText size={16} style={{ color: 'rgba(255,255,255,0.8)' }} />
                  <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Goods Received Note</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{viewGRN.grn_number}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                  {formatDate(viewGRN.date || viewGRN.created_at)} &nbsp;·&nbsp; {viewGRN.supplier_name || '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)',
                }}>
                  {viewGRN.payment_status || 'Not Paid'}
                </span>
                <button onClick={() => setViewGRN(null)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#fff', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FiX size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px', flex: 1 }}>

              {/* Info strip */}
              {/* Payment status bar */}
              {(() => {
                const s = paymentStatusStyle(viewGRN.payment_status);
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}`, marginBottom: 16 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{viewGRN.payment_status || 'Not Paid'}</span>
                    <span style={{ fontSize: 12, color: s.color, opacity: 0.8 }}>
                      &nbsp;·&nbsp; Paid: <strong>${parseFloat(viewGRN.amount_paid_on_grn || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      &nbsp;&nbsp;Balance: <strong>${parseFloat(viewGRN.balance_on_grn || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Supplier',    value: viewGRN.supplier_name || '—' },
                  { label: 'Date',        value: formatDate(viewGRN.date || viewGRN.created_at) },
                  { label: 'Total Items', value: viewGRN.total_items },
                ].map(info => (
                  <div key={info.label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{info.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{info.value}</div>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: '#f0fdf4', padding: '10px 14px', borderBottom: '1px solid #d1fae5', fontSize: 11.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Items Received
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>#</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Product</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Quantity</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Unit Cost ($)</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewGRN.items || []).map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>{item.product_name}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{parseFloat(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{parseFloat(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#15803d', fontFamily: 'monospace' }}>{parseFloat(item.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: '#14532d' }}>TOTAL</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 15, fontFamily: 'monospace', color: '#15803d' }}>
                        ${parseFloat(viewGRN.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Notes */}
              {viewGRN.notes && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
                  <span style={{ fontWeight: 600 }}>Notes: </span>{viewGRN.notes}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowGRNPrint(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#9ca3af'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#d1d5db'; }}
              >
                <FiPrinter size={14} /> Print
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { openEdit({ id: viewGRN.id }); setViewGRN(null); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  <FiEdit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => setViewGRN(null)}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New GRN Modal ─────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editMode && (
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FiEdit2 size={15} style={{ color: '#2563eb' }} />
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: 17 }}>{editMode ? 'Edit GRN' : t('grnTitle')}</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                    {editMode ? 'Update the goods received note' : 'Record stock received from a supplier'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}><FiX size={20} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Supplier & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    {t('supplier')} <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={supplierId} onChange={e => setSupplierId(e.target.value)}
                      style={{ flex: 1, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff' }}
                    >
                      <option value="">— Select Supplier —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setShowAddSupplier(v => !v); setAddSupplierError(''); }}
                      title="Add new supplier"
                      style={{ padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: showAddSupplier ? '#dcfce7' : '#f9fafb', color: showAddSupplier ? '#16a34a' : '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                    >
                      <FiPlus size={13} /> New
                    </button>
                  </div>

                  {/* Quick-add supplier form */}
                  {showAddSupplier && (
                    <div style={{ marginTop: 8, padding: '12px 14px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>Quick-add Supplier</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input
                          value={newSupName} onChange={e => setNewSupName(e.target.value)}
                          placeholder="Supplier name *"
                          style={{ flex: 2, minWidth: 120, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                        />
                        <input
                          value={newSupPhone} onChange={e => setNewSupPhone(e.target.value)}
                          placeholder="Phone (optional)"
                          style={{ flex: 1, minWidth: 100, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                        />
                        <button
                          type="button" onClick={handleAddSupplier} disabled={addingSupplier}
                          style={{ padding: '7px 14px', background: addingSupplier ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: addingSupplier ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
                        >
                          {addingSupplier ? '…' : 'Create'}
                        </button>
                        <button
                          type="button" onClick={() => { setShowAddSupplier(false); setNewSupName(''); setNewSupPhone(''); setAddSupplierError(''); }}
                          style={{ padding: '7px 10px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                        >
                          Cancel
                        </button>
                      </div>
                      {addSupplierError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{addSupplierError}</div>}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{t('date')}</label>
                  <input
                    type="date" value={date} max={todayStr}
                    onChange={e => setDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{t('notes')}</label>
                <input
                  type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Delivery reference, invoice number..."
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              {/* Items */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    {t('product')}s <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <button
                    onClick={addItemRow}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                  >
                    <FiPlus size={13} /> Add Item
                  </button>
                </div>

                {/* Add-row validation message */}
                {addRowError && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '9px 13px', marginBottom: 10, borderRadius: 8,
                    background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12.5,
                  }}>
                    <span style={{ flexShrink: 0 }}>⚠</span>
                    <span>{addRowError}</span>
                  </div>
                )}

                {/* Items Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 36px', gap: 8, padding: '8px 10px', background: '#f9fafb', borderRadius: 6, marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                  <span>{t('product')}</span>
                  <span>{t('quantity')}</span>
                  <span>Unit Cost ($)</span>
                  <span>{t('total')} ($)</span>
                  <span></span>
                </div>

                {items.map((item, idx) => {
                  const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
                  const isLast    = idx === items.length - 1;
                  const incomplete = isLast && addRowError && !isRowComplete(item);
                  return (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      {/* ── Product autocomplete ── */}
                      <div style={{ position: 'relative' }}>
                        <input
                          value={item.product_text}
                          onChange={e => {
                            updateItem(idx, 'product_text', e.target.value);
                            updateItem(idx, 'product_id', '');
                            setOpenDropdownIdx(idx);
                            if (addRowError) setAddRowError('');
                          }}
                          onFocus={() => setOpenDropdownIdx(idx)}
                          onBlur={() => setTimeout(() => setOpenDropdownIdx(-1), 160)}
                          placeholder="Type or search product…"
                          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${incomplete && !item.product_id ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                        />
                        {openDropdownIdx === idx && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 200, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', marginTop: 2 }}>
                            {products
                              .filter(p => !item.product_text || p.name.toLowerCase().includes(item.product_text.toLowerCase()))
                              .map(p => (
                                <div
                                  key={p.id}
                                  onMouseDown={() => {
                                    updateItem(idx, 'product_id', String(p.id));
                                    updateItem(idx, 'product_text', p.name);
                                    updateItem(idx, 'unit_price', parseFloat(p.cost_price || p.selling_price || 0));
                                    setOpenDropdownIdx(-1);
                                    if (addRowError) setAddRowError('');
                                  }}
                                  style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                >
                                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                                  {(p.cost_price || p.selling_price) && (
                                    <span style={{ fontSize: 11, color: '#9ca3af' }}>${parseFloat(p.cost_price || p.selling_price || 0).toFixed(2)}</span>
                                  )}
                                </div>
                              ))
                            }
                            {products.filter(p => !item.product_text || p.name.toLowerCase().includes(item.product_text.toLowerCase())).length === 0 && (
                              <div style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>No matching products</div>
                            )}
                          </div>
                        )}
                      </div>
                      <input
                        type="number" min="0" step="0.01" placeholder="0"
                        value={item.quantity}
                        onChange={e => { updateItem(idx, 'quantity', e.target.value); if (addRowError) setAddRowError(''); }}
                        style={{ padding: '8px 10px', border: `1px solid ${incomplete && (!item.quantity || parseFloat(item.quantity) <= 0) ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                      />
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={item.unit_price}
                        onChange={e => { updateItem(idx, 'unit_price', e.target.value); if (addRowError) setAddRowError(''); }}
                        style={{ padding: '8px 10px', border: `1px solid ${incomplete && item.unit_price === '' ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                      />
                      <div style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, textAlign: 'right', background: '#f9fafb', color: '#374151' }}>
                        {lineTotal.toFixed(2)}
                      </div>
                      <button
                        onClick={() => removeItemRow(idx)}
                        disabled={items.length === 1}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: items.length === 1 ? '#f3f4f6' : '#fee2e2', color: items.length === 1 ? '#9ca3af' : '#dc2626', border: 'none', borderRadius: 6, cursor: items.length === 1 ? 'not-allowed' : 'pointer' }}
                      >
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* Grand Total */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '2px solid #e5e7eb' }}>
                  <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>{t('amount')}:</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: '#16a34a' }}>${totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Save error */}
              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setShowForm(false)} style={{ padding: '10px 24px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                  {t('cancel')}
                </button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '10px 28px', background: saving ? '#9ca3af' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 }}>
                  {saving ? t('saving') : editMode ? 'Update GRN' : `${t('save')} GRN`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Preview ─────────────────────────────────────────── */}
      {showPrintPreview && (
        <div
          className="print-preview-overlay"
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
                Print Preview — Goods Received Notes ({filteredGRNs.length} records)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <FiPrinter size={14} /> Print
              </button>
              <button onClick={() => setShowPrintPreview(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          {/* A4 Document */}
          <div
            id="print-document"
            style={{ width: 794, background: '#ffffff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* Header Banner */}
            <div style={{ background: 'linear-gradient(135deg, #14532d 0%, #16a34a 100%)', padding: '28px 44px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>
                  Goods Received Notes
                </div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {hasFilter
                    ? `${filterFrom ? formatDate(filterFrom) : 'All'} — ${filterTo ? formatDate(filterTo) : 'All'}`
                    : formatDateLong(todayStr)}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Accent bar */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #22c55e, #2563eb)' }} />

            {/* Body */}
            <div style={{ padding: '26px 44px 36px' }}>

              {/* Summary chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Total GRNs (All)',  value: stats.totalGRNs, bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
                  { label: 'This Month',         value: stats.thisMonth, bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                  { label: filteredGRNs.length === grns.length ? 'Total Amount' : 'Filtered Amount',
                    value: '$' + filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }),
                    bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
                  { label: 'Suppliers',           value: stats.suppliers, bg: '#faf5ff', color: '#7e22ce', border: '#d8b4fe' },
                ].map(chip => (
                  <div key={chip.label} style={{ padding: '12px 16px', borderRadius: 10, background: chip.bg, border: `1.5px solid ${chip.border}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chip.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: chip.color }}>{chip.value}</div>
                  </div>
                ))}
              </div>

              {/* GRN Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#475569' }}>
                      GRN Records
                    </span>
                  </div>
                  {hasFilter && (
                    <span style={{ fontSize: 10.5, color: '#64748b' }}>
                      {filterFrom ? formatDate(filterFrom) : '—'}  to  {filterTo ? formatDate(filterTo) : '—'}
                    </span>
                  )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['#', 'GRN Number', 'Date', 'Supplier', 'Items', 'Total Amount', 'Status'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontSize: 10.5, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGRNs.map((grn, idx) => (
                      <tr key={grn.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8' }}>{grn.grn_number}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{formatDate(grn.date || grn.created_at)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{grn.supplier_name || '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>{grn.total_items}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#15803d' }}>
                          ${parseFloat(grn.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          {(() => { const s = paymentStatusStyle(grn.payment_status); return (
                            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                              background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                              {grn.payment_status || 'Not Paid'}
                            </span>
                          ); })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 11.5, color: '#14532d' }}>
                        TOTAL — {filteredGRNs.length} GRN{filteredGRNs.length !== 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#374151' }}>
                        {filteredGRNs.reduce((s, g) => s + parseInt(g.total_items || 0), 0)} items
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: '#15803d' }}>
                        ${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>{businessInfo.business_name || 'Business'} — Confidential</span>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>
                  Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Print styles ──────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }

          /* GRN list print preview */
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

      {/* ── GRN Single-Record Print Preview ───────────────────────── */}
      {viewGRN && showGRNPrint && (
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
                Print Preview — {viewGRN.grn_number}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <FiPrinter size={14} /> Print
              </button>
              <button onClick={() => setShowGRNPrint(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          {/* A4 Document */}
          <div
            id="print-document"
            style={{ width: 794, background: '#fff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* ── Green gradient header ── */}
            <div style={{ background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #16a34a 100%)', padding: '30px 44px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>Goods Received Note</div>
                <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: 0.3, marginBottom: 6 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 10.5, opacity: 0.7, lineHeight: 1.8 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  ·  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8 }}>Document No.</div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, fontFamily: 'monospace' }}>{viewGRN.grn_number}</div>
                <div style={{ marginTop: 10, display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}>
                  {viewGRN.payment_status || 'Not Paid'}
                </div>
              </div>
            </div>

            {/* Accent bar */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #22c55e, #2563eb, #a855f7)' }} />

            {/* Body */}
            <div style={{ padding: '28px 44px 40px' }}>

              {/* Info cards row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 26 }}>
                {[
                  { label: 'Supplier',     value: viewGRN.supplier_name || '—',                           icon: '🏢', bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
                  { label: 'Received Date', value: formatDate(viewGRN.date || viewGRN.created_at),         icon: '📅', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
                  { label: 'Total Items',   value: `${viewGRN.total_items} line${viewGRN.total_items !== 1 ? 's' : ''}`, icon: '📦', bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
                ].map(card => (
                  <div key={card.label} style={{ padding: '12px 16px', borderRadius: 10, background: card.bg, border: `1.5px solid ${card.border}` }}>
                    <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{card.label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                {/* Table header bar */}
                <div style={{ background: '#14532d', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#d1fae5' }}>Items Received</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 700, color: '#166534', borderBottom: '1.5px solid #86efac', fontSize: 10.5, letterSpacing: 0.3, width: 30 }}>#</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 700, color: '#166534', borderBottom: '1.5px solid #86efac', fontSize: 10.5, letterSpacing: 0.3 }}>Product</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#166534', borderBottom: '1.5px solid #86efac', fontSize: 10.5, letterSpacing: 0.3 }}>Quantity</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#166534', borderBottom: '1.5px solid #86efac', fontSize: 10.5, letterSpacing: 0.3 }}>Unit Cost ($)</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#166534', borderBottom: '1.5px solid #86efac', fontSize: 10.5, letterSpacing: 0.3 }}>Line Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewGRN.items || []).map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>{item.product_name}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>{parseFloat(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>{parseFloat(item.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#15803d' }}>{parseFloat(item.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800, fontSize: 12, color: '#14532d', letterSpacing: 0.5 }}>GRAND TOTAL</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 16, fontFamily: 'monospace', color: '#15803d' }}>
                        ${parseFloat(viewGRN.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Notes */}
              {viewGRN.notes && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11.5, color: '#78350f', marginBottom: 24 }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 0.8, marginRight: 8, color: '#92400e' }}>Notes</span>
                  {viewGRN.notes}
                </div>
              )}

              {/* Signature section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 44 }}>
                {['Prepared By', 'Received By', 'Approved By'].map(label => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ height: 40, borderBottom: '1.5px solid #cbd5e1', marginBottom: 6 }} />
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#6b7280' }}>{label}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Name / Signature / Date</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer bar */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{businessInfo.business_name || 'Business'} — Confidential Document</span>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>
                Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GRN;
