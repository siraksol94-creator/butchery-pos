import React, { useState, useEffect } from 'react';
import { getProducts, createProduct, updateProduct, updateProductBarcode, deleteProduct, uploadProductImage, deleteProductImage, getSettings, getCategories, deleteAllProducts, importProducts } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { FiSearch, FiPlus, FiEdit2, FiTrash2, FiCamera, FiX, FiZap, FiPrinter, FiUpload, FiDownload, FiAlertTriangle } from 'react-icons/fi';
import { FaBarcode } from 'react-icons/fa';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

const getCategoryClass = (cat) => {
  const map = { 'Beef': 'category-beef', 'Chicken': 'category-chicken', 'Pork': 'category-pork', 'Lamb': 'category-lamb', 'Processed': 'category-processed' };
  return map[cat] || 'badge-gray';
};

// Inline category badge style for the print document
const catBadgeStyle = (cat) => {
  const map = {
    'Beef':      { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    'Chicken':   { background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' },
    'Pork':      { background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' },
    'Lamb':      { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
    'Processed': { background: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' },
  };
  return {
    ...(map[cat] || { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }),
    padding: '2px 8px', borderRadius: 12, fontSize: 10.5, fontWeight: 600, display: 'inline-block',
  };
};

const emptyBarcodeForm = { ub_number_start: 1, ub_number_length: 6, ub_quantity_start: 7, ub_quantity_length: 0, ub_decimal_start: 2 };

const BarcodePreview = ({ form }) => {
  const numStart  = parseInt(form.ub_number_start)  || 0;
  const numLen    = parseInt(form.ub_number_length)  || 0;
  const qStart    = parseInt(form.ub_quantity_start) || 0;
  const qLen      = parseInt(form.ub_quantity_length)|| 0;
  const decStart  = parseInt(form.ub_decimal_start)  || 0;
  const totalLen  = Math.max(numStart + numLen, qLen > 0 ? qStart + qLen : 0) + 1;
  const sample    = '2000006009982'.padEnd(totalLen, '?').slice(0, totalLen);
  return (
    <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Preview</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, fontFamily: 'monospace', fontSize: 15 }}>
        {sample.split('').map((char, i) => {
          const isCode   = i >= numStart && i < numStart + numLen;
          const isWeight = qLen > 0 && i >= qStart && i < qStart + qLen;
          return (
            <span key={i} style={{
              padding: '3px 5px', borderRadius: 4, fontWeight: 700,
              background: isCode ? '#dbeafe' : isWeight ? '#dcfce7' : '#f1f5f9',
              color:      isCode ? '#1d4ed8' : isWeight ? '#15803d' : '#94a3b8',
              border: `1px solid ${isCode ? '#93c5fd' : isWeight ? '#86efac' : '#e2e8f0'}`,
            }}>{char}</span>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12 }}>
        <span style={{ color: '#1d4ed8' }}>■ Product Code (pos {numStart}–{numStart + numLen - 1})</span>
        {qLen > 0 && <span style={{ color: '#15803d' }}>■ Weight (pos {qStart}–{qStart + qLen - 1})</span>}
      </div>
      {qLen > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>
          Weight digits: <strong>{sample.slice(qStart, qStart + qLen)}</strong> → insert decimal at {decStart} →{' '}
          <strong>{sample.slice(qStart, qStart + decStart)}.{sample.slice(qStart + decStart, qStart + qLen)}</strong> ={' '}
          <strong style={{ color: '#15803d' }}>{parseFloat(sample.slice(qStart, qStart + decStart) + '.' + sample.slice(qStart + decStart, qStart + qLen)).toFixed(3)} kg</strong>
        </div>
      )}
    </div>
  );
};

const ItemDetails = () => {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', category_id: '', unit: 'kg', cost_price: '', selling_price: '', current_stock: '', min_stock: '' });
  const [formError, setFormError] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const csvInputRef = React.useRef(null);

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete ALL products? This cannot be undone.')) return;
    try {
      await deleteAllProducts();
      await fetchItems();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete all products.');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportMsg('');
    try {
      const res = await importProducts(file);
      setImportMsg(res.data.message);
      await fetchItems();
    } catch (err) {
      setImportMsg(err.response?.data?.error || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadSample = () => {
    const csv = 'code,name,category,unit,cost_price,selling_price,current_stock,min_stock,ub_number_start,ub_number_length,ub_quantity_start,ub_quantity_length,ub_decimal_start\nBF001,Beef Steak,Beef,kg,5.00,8.00,0,10,1,6,7,0,2\nBF002,Beef Ribs,Beef,kg,3.50,6.00,0,5,1,6,7,5,2\nCH001,Whole Chicken,Chicken,pack,3.00,5.00,0,5,1,6,0,0,2\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample_products.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeItem, setBarcodeItem]  = useState(null);
  const [barcodeForm, setBarcodeForm]  = useState(emptyBarcodeForm);
  const [barcodeSaving, setBarcodeSaving] = useState(false);

  // Print preview
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({});

  useEffect(() => {
    fetchItems();
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
    getCategories().then(r => setDbCategories(r.data || [])).catch(() => {});
  }, []);

  const fetchItems = async () => {
    try {
      const res = await getProducts();
      setItems(res.data || []);
    } catch (err) { setItems([]); }
  };

  const filtered = items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.code.toLowerCase().includes(search.toLowerCase()));

  const generateCode = () => {
    const prefixMap = { '1': 'BF', '2': 'CH', '3': 'PK', '4': 'LM', '5': 'PR' };
    const prefix = prefixMap[form.category_id] || 'IT';
    let num = 1;
    let code;
    do {
      code = `${prefix}${String(num).padStart(3, '0')}`;
      num++;
    } while (items.some(i => i.code === code));
    setForm(prev => ({ ...prev, code }));
    setFormError('');
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.code.trim()) {
      setFormError('Item code is required. Enter a code or click ⚡ to generate one.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Item name is required.');
      return;
    }
    const duplicate = items.find(i => i.code.trim().toLowerCase() === form.code.trim().toLowerCase() && (!editItem || i.id !== editItem.id));
    if (duplicate) {
      setFormError(`Code "${form.code}" is already used by "${duplicate.name}". Please choose a different code.`);
      return;
    }
    if (form.cost_price !== '' && parseFloat(form.cost_price) < 0) { setFormError('Cost Price cannot be negative.'); return; }
    if (form.selling_price !== '' && parseFloat(form.selling_price) < 0) { setFormError('Selling Price cannot be negative.'); return; }
    if (form.current_stock !== '' && parseFloat(form.current_stock) < 0) { setFormError('Opening Stock cannot be negative.'); return; }
    if (form.min_stock !== '' && parseFloat(form.min_stock) < 0) { setFormError('Min. Stock cannot be negative.'); return; }
    try {
      const data = {
        ...form,
        cost_price:    form.cost_price    === '' ? 0  : parseFloat(form.cost_price),
        selling_price: form.selling_price === '' ? 0  : parseFloat(form.selling_price),
        current_stock: form.current_stock === '' ? 0  : parseFloat(form.current_stock),
        min_stock:     form.min_stock     === '' ? 10 : parseFloat(form.min_stock),
        category_id:   form.category_id   === '' ? null : parseInt(form.category_id),
      };
      let savedProduct;
      if (editItem) {
        const res = await updateProduct(editItem.id, data);
        savedProduct = res.data;
      } else {
        const res = await createProduct(data);
        savedProduct = res.data;
      }
      if (imageFile && savedProduct?.id) await uploadProductImage(savedProduct.id, imageFile);
      fetchItems();
      setShowModal(false);
      setEditItem(null);
      setImageFile(null);
      setImagePreview(null);
      setFormError('');
    } catch (err) {
      setFormError('Failed to save item: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = async () => {
    if (editItem?.id && editItem.image_url) {
      try { await deleteProductImage(editItem.id); } catch (err) { /* ignore */ }
    }
    setImageFile(null);
    setImagePreview(null);
    if (editItem) setEditItem(prev => ({ ...prev, image_url: null }));
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      try { await deleteProduct(id); fetchItems(); }
      catch (err) { setItems(prev => prev.filter(i => i.id !== id)); }
    }
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ code: '', name: '', category_id: '', unit: 'kg', cost_price: '', selling_price: '', current_stock: '', min_stock: '' });
    setImageFile(null); setImagePreview(null); setFormError('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ code: item.code, name: item.name, category_id: item.category_id, unit: item.unit, cost_price: item.cost_price, selling_price: item.selling_price, current_stock: item.current_stock, min_stock: item.min_stock });
    setImageFile(null);
    setImagePreview(item.image_url ? `${API_BASE}${item.image_url}` : null);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setFormError(''); };

  const openBarcodeSettings = (item) => {
    setBarcodeItem(item);
    const defaultQtyLen = String(item.code || '').length === 6 ? 5 : 0;
    setBarcodeForm({
      ub_number_start:    item.ub_number_start   ?? 1,
      ub_number_length:   item.ub_number_length  ?? 6,
      ub_quantity_start:  item.ub_quantity_start  ?? 7,
      ub_quantity_length: item.ub_quantity_length ?? defaultQtyLen,
      ub_decimal_start:   item.ub_decimal_start   ?? 2,
    });
    setShowBarcodeModal(true);
  };

  const saveBarcodeSettings = async () => {
    setBarcodeSaving(true);
    try {
      const pInt = (val, def) => { const n = parseInt(val); return isNaN(n) ? def : n; };
      const newUB = {
        ub_number_start:    pInt(barcodeForm.ub_number_start,    1),
        ub_number_length:   pInt(barcodeForm.ub_number_length,   6),
        ub_quantity_start:  pInt(barcodeForm.ub_quantity_start,  7),
        ub_quantity_length: pInt(barcodeForm.ub_quantity_length, 0),
        ub_decimal_start:   pInt(barcodeForm.ub_decimal_start,   2),
      };
      const res = await updateProductBarcode(barcodeItem.id, newUB);
      const saved = res.data ? res.data : { ...barcodeItem, ...newUB };
      setItems(prev => prev.map(i => i.id === barcodeItem.id ? { ...i, ...saved } : i));
      setShowBarcodeModal(false);
      fetchItems();
    } catch (err) {
      alert('Failed to save barcode settings: ' + (err.response?.data?.error || err.message));
    } finally { setBarcodeSaving(false); }
  };

  const setBF = (field) => (e) => setBarcodeForm(prev => ({ ...prev, [field]: e.target.value }));
  const inputSt = { width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
  const labelSt = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };

  // ── Print preview stats ──
  const lowStockItems = items.filter(i => parseFloat(i.store_balance || 0) <= parseFloat(i.min_stock || 0));
  const categories    = [...new Set(items.map(i => i.category_name).filter(Boolean))];

  return (
    <div className="page-content">

      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>{t('itemDetailsTitle')}</h1>
          <p>Manage product information</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleDownloadSample} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <FiDownload size={14} /> Sample CSV
          </button>
          <button onClick={() => csvInputRef.current?.click()} disabled={importing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: importing ? '#d1fae5' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 10px rgba(16,185,129,0.3)' }}>
            <FiUpload size={14} /> {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button onClick={handleDeleteAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 10px rgba(220,38,38,0.3)' }}>
            <FiAlertTriangle size={14} /> Delete All
          </button>
          <button
            onClick={() => setShowPrintPreview(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
          >
            <FiPrinter size={16} /> Print
          </button>
          <button className="btn btn-primary" onClick={openNew}>
            <FiPlus /> {t('newEntry')} Item
          </button>
        </div>
      </div>

      {importMsg && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: importMsg.includes('failed') || importMsg.includes('error') ? '#fef2f2' : '#f0fdf4', color: importMsg.includes('failed') || importMsg.includes('error') ? '#dc2626' : '#16a34a', borderRadius: 8, fontSize: 13, fontWeight: 500, border: `1px solid ${importMsg.includes('failed') || importMsg.includes('error') ? '#fecaca' : '#bbf7d0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}><FiX size={14} /></button>
        </div>
      )}

      <div className="search-input-container">
        <FiSearch style={{ color: '#9ca3af' }} />
        <input type="text" placeholder="Search by item name or code..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 52 }}>Photo</th>
              <th>Code</th>
              <th>{t('name')}</th>
              <th>Category</th>
              <th>Units</th>
              <th>Avg. Cost Price</th>
              <th>Selling Price</th>
              <th>Min. Stock</th>
              <th>{t('storeBalance')}</th>
              <th>{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td>
                  {item.image_url ? (
                    <img src={`${API_BASE}${item.image_url}`} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  ) : (
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' }}>
                      <FiCamera size={16} />
                    </div>
                  )}
                </td>
                <td style={{ fontWeight: 500 }}>{item.code}</td>
                <td style={{ fontWeight: 500 }}>{item.name}</td>
                <td><span className={`badge ${getCategoryClass(item.category_name)}`}>{item.category_name}</span></td>
                <td>{item.unit}</td>
                <td>${parseFloat(item.avg_cost_price || item.cost_price || 0).toFixed(2)}</td>
                <td>${parseFloat(item.selling_price).toFixed(2)}</td>
                <td>{parseFloat(item.min_stock || 0).toFixed(2)} {item.unit}</td>
                <td style={{ color: parseFloat(item.store_balance || 0) <= parseFloat(item.min_stock || 0) ? '#dc2626' : '#16a34a', fontWeight: 500 }}>
                  {parseFloat(item.store_balance || 0).toFixed(2)} {item.unit}
                </td>
                <td>
                  <div className="action-btns">
                    <button className="action-btn edit" onClick={() => openEdit(item)} title="Edit item"><FiEdit2 /></button>
                    <button
                      onClick={() => openBarcodeSettings(item)}
                      title="Barcode scanner settings"
                      style={{
                        background: parseInt(item.ub_quantity_length) > 0 ? '#f0fdf4' : '#fffbeb',
                        border: `1px solid ${parseInt(item.ub_quantity_length) > 0 ? '#86efac' : '#fcd34d'}`,
                        color: parseInt(item.ub_quantity_length) > 0 ? '#15803d' : '#92400e',
                        borderRadius: 6, padding: '5px 7px', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center',
                      }}
                    >
                      <FaBarcode />
                    </button>
                    <button className="action-btn delete" onClick={() => handleDelete(item.id)} title="Delete item"><FiTrash2 /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editItem ? `${t('edit')} Item` : `${t('newEntry')} Item`}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {formError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13 }}>
                  <span style={{ flexShrink: 0, fontSize: 15, marginTop: 1 }}>⚠</span>
                  <span>{formError}</span>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Code <span style={{ color: '#dc2626' }}>*</span>
                    <span style={{ fontSize: 10.5, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>or click ⚡ to generate</span>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={form.code}
                      onChange={e => { setForm({ ...form, code: e.target.value }); setFormError(''); }}
                      placeholder="e.g. BF001"
                      style={{ flex: 1, border: formError && !form.code.trim() ? '1.5px solid #dc2626' : undefined }}
                    />
                    <button
                      type="button" onClick={generateCode} title="Auto-generate a unique code based on category"
                      style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: '1.5px solid #d1d5db', background: '#fafafa', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fffbeb'; e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.color = '#d97706'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; }}
                    >
                      <FiZap size={15} />
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Item Name <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    value={form.name}
                    onChange={e => { setForm({ ...form, name: e.target.value }); setFormError(''); }}
                    placeholder="Product name"
                    style={{ border: formError && !form.name.trim() ? '1.5px solid #dc2626' : undefined }}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Unit</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="pack">pack</option>
                    <option value="piece">piece</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">Select Category</option>
                    {dbCategories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cost Price ($)</label>
                  <input type="number" min="0" step="0.01" value={form.cost_price}
                    onChange={e => setForm({ ...form, cost_price: e.target.value })}
                    onBlur={e => { if (e.target.value !== '' && parseFloat(e.target.value) < 0) setForm(f => ({ ...f, cost_price: '0' })); }} />
                </div>
                <div className="form-group">
                  <label>Selling Price ($)</label>
                  <input type="number" min="0" step="0.01" value={form.selling_price}
                    onChange={e => setForm({ ...form, selling_price: e.target.value })}
                    onBlur={e => { if (e.target.value !== '' && parseFloat(e.target.value) < 0) setForm(f => ({ ...f, selling_price: '0' })); }} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Opening Stock</label>
                  <input type="number" min="0" step="0.01" value={form.current_stock}
                    onChange={e => setForm({ ...form, current_stock: e.target.value })}
                    onBlur={e => { if (e.target.value !== '' && parseFloat(e.target.value) < 0) setForm(f => ({ ...f, current_stock: '0' })); }} />
                </div>
                <div className="form-group">
                  <label>Min. Stock</label>
                  <input type="number" min="0" step="0.01" value={form.min_stock}
                    onChange={e => setForm({ ...form, min_stock: e.target.value })}
                    onBlur={e => { if (e.target.value !== '' && parseFloat(e.target.value) < 0) setForm(f => ({ ...f, min_stock: '0' })); }} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 4 }}>
                <label>Product Photo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 }}>
                  {imagePreview ? (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={imagePreview} alt="preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '2px solid #e5e7eb' }} />
                      <button type="button" onClick={handleRemoveImage} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 0 }}>
                        <FiX size={11} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 10, border: '2px dashed #d1d5db', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexShrink: 0 }}>
                      <FiCamera size={22} />
                      <span style={{ fontSize: 10, marginTop: 4 }}>No photo</span>
                    </div>
                  )}
                  <div>
                    <label htmlFor="product-image-input" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                      <FiCamera size={14} /> {imagePreview ? 'Change Photo' : 'Upload Photo'}
                    </label>
                    <input id="product-image-input" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>JPG, PNG, WEBP · Max 5MB</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>{t('cancel')}</button>
              <button className="btn btn-primary" onClick={handleSave}>{t('save')} Item</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Barcode Settings Modal ────────────────────────────────── */}
      {showBarcodeModal && barcodeItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <FaBarcode style={{ color: '#2563eb', fontSize: 18 }} />
                  <h3 style={{ margin: 0, fontSize: 16 }}>Barcode Scanner Settings</h3>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>{barcodeItem.name} ({barcodeItem.code})</p>
              </div>
              <button onClick={() => setShowBarcodeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af', marginBottom: 20 }}>
                Configure where in the barcode the <strong>product code</strong> and <strong>weight</strong> are located. Set <em>Quantity Length</em> to <strong>0</strong> for regular (non-weight) barcodes.
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 4 }}>■</span> Product Code Position
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelSt}>Start Position (0-indexed)</label>
                    <input style={inputSt} type="number" min="0" value={barcodeForm.ub_number_start} onChange={setBF('ub_number_start')} />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>e.g. 1 → skip first digit</div>
                  </div>
                  <div>
                    <label style={labelSt}>Code Length (digits)</label>
                    <input style={inputSt} type="number" min="1" value={barcodeForm.ub_number_length} onChange={setBF('ub_number_length')} />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>e.g. 6 → read 6 digits</div>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 4 }}>■</span> Weight / Quantity Position
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelSt}>Start Position</label>
                    <input style={inputSt} type="number" min="0" value={barcodeForm.ub_quantity_start} onChange={setBF('ub_quantity_start')} />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>e.g. 7</div>
                  </div>
                  <div>
                    <label style={labelSt}>Length (0 = none)</label>
                    <input style={inputSt} type="number" min="0" value={barcodeForm.ub_quantity_length} onChange={setBF('ub_quantity_length')} />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>e.g. 5 digits</div>
                  </div>
                  <div>
                    <label style={labelSt}>Decimal At</label>
                    <input style={inputSt} type="number" min="0" value={barcodeForm.ub_decimal_start} onChange={setBF('ub_decimal_start')} />
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>e.g. 2 → XX.XXX</div>
                  </div>
                </div>
              </div>
              <BarcodePreview form={barcodeForm} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button onClick={() => setShowBarcodeModal(false)} style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={saveBarcodeSettings} disabled={barcodeSaving} style={{ padding: '9px 24px', background: barcodeSaving ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: barcodeSaving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 }}>
                  {barcodeSaving ? 'Saving...' : 'Save Settings'}
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
                Print Preview — Items List ({items.length} items)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => window.print()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                <FiPrinter size={14} /> Print
              </button>
              <button
                onClick={() => setShowPrintPreview(false)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
              >
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
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)', padding: '28px 44px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>Product Items List</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>

            {/* Accent bar */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6)' }} />

            {/* Body */}
            <div style={{ padding: '26px 44px 36px' }}>

              {/* Summary chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Total Items',   value: items.length,        bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                  { label: 'Categories',    value: categories.length,   bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
                  { label: 'Low Stock',     value: lowStockItems.length, bg: lowStockItems.length > 0 ? '#fef2f2' : '#f0fdf4', color: lowStockItems.length > 0 ? '#dc2626' : '#15803d', border: lowStockItems.length > 0 ? '#fca5a5' : '#86efac' },
                  { label: 'Avg. Sell Price', value: items.length > 0 ? '$' + (items.reduce((s, i) => s + parseFloat(i.selling_price || 0), 0) / items.length).toFixed(2) : '$0.00', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
                ].map(chip => (
                  <div key={chip.label} style={{ padding: '12px 16px', borderRadius: 10, background: chip.bg, border: `1.5px solid ${chip.border}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chip.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: chip.color }}>{chip.value}</div>
                  </div>
                ))}
              </div>

              {/* Items table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                {/* Table header */}
                <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#475569' }}>
                    Product Inventory
                  </span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['#', 'Code', 'Item Name', 'Category', 'Unit', 'Cost Price', 'Selling Price', 'Min. Stock', 'Store Balance'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: i >= 5 ? 'right' : 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontSize: 10.5, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isLow = parseFloat(item.store_balance || 0) <= parseFloat(item.min_stock || 0);
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isLow ? '#fff5f5' : idx % 2 === 1 ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#374151', fontFamily: 'monospace', fontSize: 11 }}>{item.code}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 500, color: '#1e293b' }}>{item.name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={catBadgeStyle(item.category_name)}>{item.category_name || '—'}</span>
                          </td>
                          <td style={{ padding: '8px 12px', color: '#374151' }}>{item.unit}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                            ${parseFloat(item.avg_cost_price || item.cost_price || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#1d4ed8' }}>
                            ${parseFloat(item.selling_price || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>
                            {parseFloat(item.min_stock || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: isLow ? '#dc2626' : '#16a34a' }}>
                            {isLow ? '⚠ ' : ''}{parseFloat(item.store_balance || 0).toFixed(2)} {item.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 11, color: '#374151' }}>
                        Total — {items.length} items
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', fontSize: 11 }}>
                        —
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#1d4ed8', fontSize: 11 }}>
                        Avg ${items.length > 0 ? (items.reduce((s, i) => s + parseFloat(i.selling_price || 0), 0) / items.length).toFixed(2) : '0.00'}
                      </td>
                      <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: lowStockItems.length > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                        {lowStockItems.length > 0 ? `⚠ ${lowStockItems.length} item${lowStockItems.length > 1 ? 's' : ''} low on stock` : '✓ All stock levels OK'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Low stock notice */}
              {lowStockItems.length > 0 && (
                <div style={{ border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', background: '#fff5f5', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 14, color: '#dc2626', flexShrink: 0 }}>⚠</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 11, color: '#dc2626', marginBottom: 3 }}>Low Stock Alert</div>
                    <div style={{ fontSize: 11, color: '#7f1d1d' }}>
                      {lowStockItems.map(i => i.name).join(', ')} — stock at or below minimum threshold
                    </div>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div style={{ display: 'flex', gap: 20, marginBottom: 20, fontSize: 10.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 3, display: 'inline-block' }} />
                  <span style={{ color: '#6b7280' }}>Low / zero stock row</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠</span>
                  <span style={{ color: '#6b7280' }}>Balance at or below minimum</span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* ── Print styles ──────────────────────────────────────────── */}
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

export default ItemDetails;
