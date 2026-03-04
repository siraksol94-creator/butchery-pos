import React, { useState, useEffect } from 'react';
import { getSIVs, getSIVStats, createSIV, updateSIV, getSIV, getProducts, getSettings } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiPlus, FiFileText, FiCalendar, FiTrendingDown, FiClock, FiTrash2, FiX, FiPrinter, FiEye, FiEdit2 } from 'react-icons/fi';

const defaultStats = { totalSIVs: 0, thisMonth: 0, totalValue: 0, pending: 0 };
const emptyItem = () => ({ product_id: '', product_text: '', quantity: '', unit_price: '', total_price: 0 });

const DEFAULT_DEPARTMENTS = ['SALES DEPARTMENT', 'PRODUCTION', 'KITCHEN', 'MANAGEMENT', 'DELIVERY'];
const todayStr = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

const SIV = () => {
  const { t } = useLanguage();
  const [stats, setStats]     = useState(defaultStats);
  const [sivs, setSIVs]       = useState([]);
  const [products, setProducts] = useState([]);
  const [businessInfo, setBusinessInfo] = useState({});

  // ── Form state ────────────────────────────────────────────────────
  const [showForm, setShowForm]   = useState(false);
  const [editMode, setEditMode]   = useState(false);
  const [editId, setEditId]       = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');
  const [department, setDepartment] = useState('SALES DEPARTMENT');
  const [date, setDate]           = useState(todayStr);
  const [notes, setNotes]         = useState('');
  const [items, setItems]         = useState([emptyItem()]);

  // ── Product autocomplete ──────────────────────────────────────────
  const [openDropdownIdx, setOpenDropdownIdx] = useState(-1);

  // ── Department management ─────────────────────────────────────────
  const [departments, setDepartments]     = useState(DEFAULT_DEPARTMENTS);
  const [showAddDept, setShowAddDept]     = useState(false);
  const [newDeptName, setNewDeptName]     = useState('');

  // ── View / Print state ────────────────────────────────────────────
  const [viewSIV, setViewSIV]           = useState(null);
  const [viewLoading, setViewLoading]   = useState(false);
  const [showSIVPrint, setShowSIVPrint] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // ── Date filter ───────────────────────────────────────────────────
  const [filterFrom, setFilterFrom] = useState(todayStr);
  const [filterTo,   setFilterTo]   = useState(todayStr);

  const fetchData = async () => {
    try {
      const [statsRes, sivsRes] = await Promise.all([getSIVStats(), getSIVs()]);
      if (statsRes.data) setStats(statsRes.data);
      setSIVs(sivsRes.data || []);
    } catch (err) {}
  };

  useEffect(() => {
    fetchData();
    getProducts().then(r => { if (r.data?.length > 0) setProducts(r.data); }).catch(() => {});
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []);

  // ── Filtered list ─────────────────────────────────────────────────
  const filteredSIVs = sivs.filter(siv => {
    const d = (siv.date || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });
  const filteredTotal = filteredSIVs.reduce((s, v) => s + parseFloat(v.total_value || 0), 0);
  const hasFilter = filterFrom || filterTo;

  // ── Formatters ────────────────────────────────────────────────────
  const formatDate = (d) => {
    const str = (d || '').split('T')[0];
    if (!str) return '—';
    return new Date(str + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const formatDateLong = (d) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Form helpers ──────────────────────────────────────────────────
  const resetForm = () => {
    setEditMode(false); setEditId(null);
    setDepartment('SALES DEPARTMENT'); setDate(todayStr);
    setNotes(''); setItems([emptyItem()]); setFormError('');
    setOpenDropdownIdx(-1); setShowAddDept(false); setNewDeptName('');
  };

  const openForm = () => { resetForm(); setShowForm(true); };

  const openEdit = async (siv) => {
    setEditLoading(true);
    setFormError('');
    try {
      const res = await getSIV(siv.id);
      const s = res.data;
      setEditMode(true);
      setEditId(s.id);
      setDepartment(s.department || 'SALES DEPARTMENT');
      setDate((s.date || todayStr).split('T')[0]);
      setNotes(s.notes || '');
      setItems(
        (s.items || []).length > 0
          ? s.items.map(i => ({
              product_id:   String(i.product_id),
              product_text: i.product_name || '',
              quantity:     String(i.quantity),
              unit_price:   String(i.unit_price),
              total_price:  parseFloat(i.total_price || 0),
            }))
          : [emptyItem()]
      );
      setOpenDropdownIdx(-1); setShowAddDept(false); setNewDeptName('');
      setShowForm(true);
    } catch {
      alert('Failed to load SIV details.');
    } finally {
      setEditLoading(false);
    }
  };

  const openView = async (siv) => {
    setViewLoading(true);
    try {
      const res = await getSIV(siv.id);
      setViewSIV(res.data);
    } catch {
      alert('Failed to load SIV details.');
    } finally {
      setViewLoading(false);
    }
  };

  const updateItem = (index, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'product_id') {
        const product = products.find(p => String(p.id) === String(value));
        if (product) updated[index].unit_price = parseFloat(product.selling_price || 0).toFixed(2);
      }
      const qty   = parseFloat(updated[index].quantity) || 0;
      const price = parseFloat(updated[index].unit_price) || 0;
      updated[index].total_price = qty * price;
      return updated;
    });
  };

  const selectProduct = (index, product) => {
    setItems(prev => {
      const updated = [...prev];
      const qty = parseFloat(updated[index].quantity) || 0;
      updated[index] = {
        ...updated[index],
        product_id:   String(product.id),
        product_text: product.name,
        unit_price:   parseFloat(product.selling_price || 0).toFixed(2),
        total_price:  qty * parseFloat(product.selling_price || 0),
      };
      return updated;
    });
    setOpenDropdownIdx(-1);
  };

  const addItem    = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));
  const grandTotal = items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);

  const handleSave = async () => {
    setFormError('');
    if (!department.trim()) { setFormError('Department is required.'); return; }
    const validItems = items.filter(i => i.product_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) { setFormError('Add at least one item with a product and quantity.'); return; }
    const payload = {
      department: department.trim(), date, notes,
      items: validItems.map(i => ({
        product_id: parseInt(i.product_id),
        quantity:   parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price) || 0,
      })),
    };
    setSaving(true);
    try {
      if (editMode) {
        await updateSIV(editId, payload);
      } else {
        await createSIV(payload);
      }
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save SIV. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>{t('sivTitle')}</h1>
          <p>Track stock issues and transfers</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowPrintPreview(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
          >
            <FiPrinter size={16} /> Print
          </button>
          <button className="btn btn-primary" onClick={openForm}><FiPlus /> {t('newSIV')}</button>
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────── */}
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}><FiFileText /></div>
          <div><div className="stat-label">{t('totalSIVs')}</div><div className="stat-value">{stats.totalSIVs}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiCalendar /></div>
          <div><div className="stat-label">{t('thisMonth')}</div><div className="stat-value">{stats.thisMonth}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiTrendingDown /></div>
          <div><div className="stat-label">{t('total')} {t('amount')}</div><div className="stat-value">${parseFloat(stats.totalValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#ffedd5', color: '#ea580c' }}><FiClock /></div>
          <div><div className="stat-label">{t('pending')}</div><div className="stat-value">{stats.pending}</div></div>
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
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#374151' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>To</span>
          <input
            type="date" value={filterTo} min={filterFrom || undefined} max={todayStr}
            onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#374151' }}
          />
        </div>
        <button
          onClick={() => { setFilterFrom(todayStr); setFilterTo(todayStr); }}
          style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff', color: '#6b7280', cursor: 'pointer' }}
        >
          Reset
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
          {filteredSIVs.length} SIV{filteredSIVs.length !== 1 ? 's' : ''}
          {hasFilter && <> &nbsp;·&nbsp; Total: <strong style={{ color: '#2563eb' }}>${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></>}
        </span>
      </div>

      {/* ── SIV Table ─────────────────────────────────────────────── */}
      <div className="data-table-container">
        {filteredSIVs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            {hasFilter ? 'No SIVs found for the selected date range.' : t('noData')}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>SIV Number</th><th>{t('date')}</th><th>{t('department')}</th>
                <th>Items</th><th>{t('total')} {t('amount')}</th><th>{t('status')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSIVs.map(siv => (
                <tr key={siv.id}>
                  <td style={{ fontWeight: 500 }}>{siv.siv_number}</td>
                  <td>{formatDate(siv.date)}</td>
                  <td>{siv.department}</td>
                  <td style={{ textAlign: 'center' }}>{siv.total_items}</td>
                  <td>${parseFloat(siv.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>
                    <span className={`badge ${siv.status === 'Issued' ? 'badge-green' : 'badge-yellow'}`}>
                      {siv.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => openView(siv)}
                        disabled={viewLoading}
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
                        onClick={() => openEdit(siv)}
                        disabled={editLoading}
                        title="Edit SIV"
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
          </table>
        )}
      </div>

      {/* ── View SIV Modal ────────────────────────────────────────── */}
      {viewSIV && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', borderRadius: '14px 14px 0 0', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <FiFileText size={16} style={{ color: 'rgba(255,255,255,0.8)' }} />
                  <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Store Issue Voucher</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.3 }}>{viewSIV.siv_number}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                  {formatDate(viewSIV.date)} &nbsp;·&nbsp; {viewSIV.department}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>
                  {viewSIV.status || 'Issued'}
                </span>
                <button
                  onClick={() => setViewSIV(null)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#fff', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <FiX size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '24px 28px', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Department',  value: viewSIV.department },
                  { label: 'Date',        value: formatDate(viewSIV.date) },
                  { label: 'Total Items', value: viewSIV.total_items },
                ].map(info => (
                  <div key={info.label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{info.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{info.value}</div>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: '#eff6ff', padding: '10px 14px', borderBottom: '1px solid #bfdbfe', fontSize: 11.5, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Items Issued
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>#</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Product</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Quantity</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Unit Price ($)</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: 11.5, borderBottom: '1px solid #e5e7eb' }}>Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewSIV.items || []).map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>
                          {item.product_name}
                          {item.unit && <span style={{ marginLeft: 6, fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 10 }}>{item.unit}</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{parseFloat(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#374151', fontFamily: 'monospace' }}>{parseFloat(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>{parseFloat(item.total_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eff6ff', borderTop: '2px solid #93c5fd' }}>
                      <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13, color: '#1d4ed8' }}>TOTAL</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, fontSize: 15, fontFamily: 'monospace', color: '#1d4ed8' }}>
                        ${parseFloat(viewSIV.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {viewSIV.notes && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
                  <span style={{ fontWeight: 600 }}>Notes: </span>{viewSIV.notes}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => setShowSIVPrint(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#9ca3af'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#d1d5db'; }}
              >
                <FiPrinter size={14} /> Print
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { openEdit({ id: viewSIV.id }); setViewSIV(null); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                >
                  <FiEdit2 size={13} /> Edit
                </button>
                <button
                  onClick={() => setViewSIV(null)}
                  style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New / Edit SIV Modal ──────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 980, width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {editMode && (
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FiEdit2 size={15} style={{ color: '#2563eb' }} />
                  </div>
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{editMode ? 'Edit SIV' : t('sivTitle')}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>
                    {editMode ? 'Update the store issue voucher' : 'Record stock issued from store'}
                  </p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
            </div>

            <div className="modal-body" style={{ maxHeight: '82vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label className="form-label">{t('department')} *</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      className="form-input"
                      style={{ flex: 1, margin: 0 }}
                      value={departments.includes(department) ? department : '__custom__'}
                      onChange={e => {
                        if (e.target.value !== '__custom__') setDepartment(e.target.value);
                      }}
                    >
                      {departments.map(d => <option key={d} value={d}>{d}</option>)}
                      {!departments.includes(department) && (
                        <option value="__custom__">{department} (custom)</option>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setShowAddDept(v => !v); setNewDeptName(''); }}
                      style={{ padding: '0 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: showAddDept ? '#dcfce7' : '#f9fafb', color: showAddDept ? '#16a34a' : '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                    >
                      <FiPlus size={13} /> New
                    </button>
                  </div>

                  {showAddDept && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={newDeptName}
                        onChange={e => setNewDeptName(e.target.value)}
                        placeholder="New department name"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newDeptName.trim()) {
                            const name = newDeptName.trim().toUpperCase();
                            if (!departments.includes(name)) setDepartments(prev => [...prev, name]);
                            setDepartment(name);
                            setShowAddDept(false); setNewDeptName('');
                          }
                        }}
                        style={{ flex: 1, minWidth: 140, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newDeptName.trim()) return;
                          const name = newDeptName.trim().toUpperCase();
                          if (!departments.includes(name)) setDepartments(prev => [...prev, name]);
                          setDepartment(name);
                          setShowAddDept(false); setNewDeptName('');
                        }}
                        style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddDept(false); setNewDeptName(''); }}
                        style={{ padding: '6px 10px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('date')} *</label>
                  <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">{t('notes')}</label>
                <textarea
                  className="form-input" rows={2} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Optional notes..." style={{ resize: 'vertical' }}
                />
              </div>

              {/* Items Table */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>{t('product')}s *</label>
                  <button
                    type="button" onClick={addItem}
                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  >
                    <FiPlus style={{ marginRight: 4, verticalAlign: 'middle' }} />Add Item
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left',  border: '1px solid #e5e7eb', fontWeight: 600 }}>{t('product')}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600, width: 70 }}>{t('balance')}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600, width: 72 }}>{t('quantity')}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600, width: 88 }}>Unit Price</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', border: '1px solid #e5e7eb', fontWeight: 600, width: 88 }}>{t('total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const prod = products.find(pp => String(pp.id) === String(item.product_id));
                      const remaining = prod ? parseFloat(prod.store_balance || 0) - parseFloat(item.quantity || 0) : null;
                      return (
                        <tr key={index}>
                          <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input
                                  value={item.product_text}
                                  onChange={e => {
                                    setItems(prev => {
                                      const u = [...prev];
                                      u[index] = { ...u[index], product_text: e.target.value, product_id: '' };
                                      return u;
                                    });
                                    setOpenDropdownIdx(index);
                                  }}
                                  onFocus={() => setOpenDropdownIdx(index)}
                                  onBlur={() => setTimeout(() => setOpenDropdownIdx(-1), 160)}
                                  placeholder="Type or search product…"
                                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                                />
                                {openDropdownIdx === index && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, maxHeight: 320, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', marginTop: 2 }}>
                                    {products
                                      .filter(p => !item.product_text || p.name.toLowerCase().includes(item.product_text.toLowerCase()))
                                      .map(p => (
                                        <div
                                          key={p.id}
                                          onMouseDown={() => selectProduct(index, p)}
                                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        >
                                          <span style={{ fontWeight: 500 }}>{p.name} <span style={{ fontSize: 11, color: '#9ca3af' }}>({p.unit})</span></span>
                                          <span style={{ fontSize: 11, color: '#9ca3af' }}>${parseFloat(p.selling_price || 0).toFixed(2)}</span>
                                        </div>
                                      ))
                                    }
                                    {products.filter(p => !item.product_text || p.name.toLowerCase().includes(item.product_text.toLowerCase())).length === 0 && (
                                      <div style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>No matching products</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {items.length > 1 && (
                                <button type="button" onClick={() => removeItem(index)}
                                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 600, color: remaining !== null && remaining <= 0 ? '#dc2626' : '#16a34a' }}>
                            {remaining !== null ? remaining.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb' }}>
                            <input type="number" className="form-input" style={{ margin: 0, padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                              min="0" step="0.01" value={item.quantity}
                              onChange={e => updateItem(index, 'quantity', e.target.value)} placeholder="0" />
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb' }}>
                            <input type="number" className="form-input" style={{ margin: 0, padding: '6px 8px', fontSize: 13, textAlign: 'right' }}
                              min="0" step="0.01" value={item.unit_price}
                              onChange={e => updateItem(index, 'unit_price', e.target.value)} placeholder="0.00" />
                          </td>
                          <td style={{ padding: '6px 8px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 500 }}>
                            ${(parseFloat(item.total_price) || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f9fafb' }}>
                      <td colSpan={4} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 600 }}>{t('total')}</td>
                      <td style={{ padding: '8px 10px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                        ${grandTotal.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {formError && (
                <div style={{ color: '#dc2626', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                  {formError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={saving}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? t('saving') : editMode ? 'Update SIV' : `${t('save')} SIV`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── List Print Preview ────────────────────────────────────── */}
      {showPrintPreview && (
        <div
          className="siv-print-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', paddingTop: 60, paddingBottom: 40 }}
        >
          <div
            className="no-print"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 1001, borderBottom: '1px solid #1e293b' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FiPrinter size={16} style={{ color: '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>
                Print Preview — Store Issue Vouchers ({filteredSIVs.length} records)
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

          <div
            id="siv-print-document"
            style={{ width: 794, background: '#ffffff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', padding: '28px 44px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>Store Issue Vouchers</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {hasFilter
                    ? `${filterFrom ? formatDate(filterFrom) : 'All'} — ${filterTo ? formatDate(filterTo) : 'All'}`
                    : formatDateLong(todayStr)}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #2563eb, #22c55e)' }} />

            <div style={{ padding: '26px 44px 36px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Period From',    value: formatDate(filterFrom),                                                              bg: '#f8fafc', color: '#374151',  border: '#e2e8f0' },
                  { label: 'Period To',      value: formatDate(filterTo),                                                                bg: '#f8fafc', color: '#374151',  border: '#e2e8f0' },
                  { label: 'SIVs in Period', value: filteredSIVs.length,                                                                 bg: '#eff6ff', color: '#1d4ed8',  border: '#bfdbfe' },
                  { label: 'Total Value',    value: '$' + filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }),         bg: '#fff7ed', color: '#c2410c',  border: '#fed7aa' },
                ].map(chip => (
                  <div key={chip.label} style={{ padding: '12px 16px', borderRadius: 10, background: chip.bg, border: `1.5px solid ${chip.border}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chip.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: chip.color }}>{chip.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#eff6ff' }}>
                      {['#', 'SIV Number', 'Date', 'Department', 'Items', 'Total Value', 'Status'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 600, color: '#1d4ed8', borderBottom: '1px solid #bfdbfe', fontSize: 10.5, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSIVs.map((siv, idx) => (
                      <tr key={siv.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#2563eb' }}>{siv.siv_number}</td>
                        <td style={{ padding: '8px 12px', color: '#374151' }}>{formatDate(siv.date)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{siv.department}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>{siv.total_items}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#1d4ed8' }}>
                          ${parseFloat(siv.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600,
                            background: siv.status === 'Issued' ? '#dcfce7' : '#fef9c3',
                            color: siv.status === 'Issued' ? '#166534' : '#854d0e' }}>
                            {siv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eff6ff', borderTop: '2px solid #93c5fd' }}>
                      <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 11.5, color: '#1d4ed8' }}>
                        TOTAL — {filteredSIVs.length} SIV{filteredSIVs.length !== 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: '#374151' }}>
                        {filteredSIVs.reduce((s, v) => s + parseInt(v.total_items || 0), 0)} items
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 13, fontFamily: 'monospace', color: '#1d4ed8' }}>
                        ${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>{businessInfo.business_name || 'Business'} — Confidential</span>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Single SIV Print Preview ──────────────────────────────── */}
      {viewSIV && showSIVPrint && (
        <div
          className="siv-print-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.88)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', paddingTop: 60, paddingBottom: 40 }}
        >
          <div
            className="no-print"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', zIndex: 2001, borderBottom: '1px solid #1e293b' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FiPrinter size={15} style={{ color: '#64748b' }} />
              <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Print Preview — {viewSIV.siv_number}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <FiPrinter size={14} /> Print
              </button>
              <button onClick={() => setShowSIVPrint(false)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                <FiX size={14} /> Close
              </button>
            </div>
          </div>

          <div
            id="siv-print-document"
            style={{ width: 794, background: '#fff', margin: '0 auto', boxShadow: '0 25px 60px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: 12, color: '#1a1a2e', flexShrink: 0 }}
          >
            {/* Document header */}
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #2563eb 100%)', padding: '30px 44px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 8, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.6, marginBottom: 8 }}>Store Issue Voucher</div>
                <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: 0.3, marginBottom: 6 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 10.5, opacity: 0.7, lineHeight: 1.8 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  ·  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.55, marginBottom: 8 }}>Document No.</div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, fontFamily: 'monospace' }}>{viewSIV.siv_number}</div>
                <div style={{ marginTop: 10, display: 'inline-block', padding: '3px 12px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff' }}>
                  {viewSIV.status || 'Issued'}
                </div>
              </div>
            </div>
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #2563eb, #22c55e, #a855f7)' }} />

            <div style={{ padding: '28px 44px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 26 }}>
                {[
                  { label: 'Department',   value: viewSIV.department,               bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
                  { label: 'Issue Date',   value: formatDate(viewSIV.date),          bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
                  { label: 'Total Items',  value: `${viewSIV.total_items} line${viewSIV.total_items !== 1 ? 's' : ''}`, bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
                ].map(card => (
                  <div key={card.label} style={{ padding: '12px 16px', borderRadius: 10, background: card.bg, border: `1.5px solid ${card.border}` }}>
                    <div style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 5 }}>{card.label}</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: card.color }}>{card.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: '#1e40af', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#93c5fd', display: 'inline-block' }} />
                  <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: '#dbeafe' }}>Items Issued</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#eff6ff' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 700, color: '#1d4ed8', borderBottom: '1.5px solid #93c5fd', fontSize: 10.5, width: 30 }}>#</th>
                      <th style={{ padding: '9px 14px', textAlign: 'left',  fontWeight: 700, color: '#1d4ed8', borderBottom: '1.5px solid #93c5fd', fontSize: 10.5 }}>Product</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', borderBottom: '1.5px solid #93c5fd', fontSize: 10.5 }}>Quantity</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', borderBottom: '1.5px solid #93c5fd', fontSize: 10.5 }}>Unit Price ($)</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', borderBottom: '1.5px solid #93c5fd', fontSize: 10.5 }}>Line Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewSIV.items || []).map((item, idx) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>
                          {item.product_name}
                          {item.unit && <span style={{ marginLeft: 6, fontSize: 10, color: '#6b7280' }}>({item.unit})</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>{parseFloat(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>{parseFloat(item.unit_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#1d4ed8' }}>{parseFloat(item.total_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eff6ff', borderTop: '2px solid #93c5fd' }}>
                      <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800, fontSize: 12, color: '#1e3a5f', letterSpacing: 0.5 }}>GRAND TOTAL</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, fontSize: 16, fontFamily: 'monospace', color: '#1d4ed8' }}>
                        ${parseFloat(viewSIV.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {viewSIV.notes && (
                <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11.5, color: '#78350f', marginBottom: 24 }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 9.5, letterSpacing: 0.8, marginRight: 8, color: '#92400e' }}>Notes</span>
                  {viewSIV.notes}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, marginTop: 44 }}>
                {['Prepared By', 'Issued By', 'Received By'].map(label => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ height: 40, borderBottom: '1.5px solid #cbd5e1', marginBottom: 6 }} />
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#6b7280' }}>{label}</div>
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Name / Signature / Date</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '10px 44px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>{businessInfo.business_name || 'Business'} — Confidential Document</span>
              <span style={{ fontSize: 9, color: '#94a3b8' }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .siv-print-overlay {
            position: fixed !important; top: 0 !important; left: 0 !important;
            right: 0 !important; bottom: 0 !important;
            background: #fff !important; padding: 0 !important;
            overflow: visible !important; display: block !important;
          }
          #siv-print-document { box-shadow: none !important; width: 100% !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default SIV;
