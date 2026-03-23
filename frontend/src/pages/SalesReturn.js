import React, { useState, useEffect, useRef } from 'react';
import { getSalesReturns, getSalesReturnStats, getSalesReturnNotes, createSalesReturn, deleteSalesReturn, getSalesReturn, getInventory, getSettings } from '../services/api';
import { FiPlus, FiTrash2, FiX, FiEye, FiCornerDownLeft, FiAlertTriangle, FiPrinter } from 'react-icons/fi';

const todayStr = new Date().toISOString().split('T')[0];

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const th  = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 };
const td  = { padding: '10px 12px', fontSize: 13 };

const emptyItem = { product_id: '', product_name: '', quantity: '', sales_balance: 0, unit: 'kg' };

const SalesReturn = () => {
  const [entries, setEntries]   = useState([]);
  const [stats, setStats]       = useState({ total: 0, thisMonth: 0 });
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [filterFrom, setFilterFrom] = useState(todayStr);
  const [filterTo,   setFilterTo]   = useState(todayStr);
  const [showPrintPreview, setShowPrintPreview]   = useState(false);
  const [printItemsMap, setPrintItemsMap]         = useState({});
  const [printItemsLoading, setPrintItemsLoading] = useState(false);
  const [businessInfo, setBusinessInfo]           = useState({});

  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);

  const [search, setSearch]         = useState([]);
  const [open, setOpen]             = useState([]);
  const [notesHistory, setNotesHistory] = useState([]);
  const [notesOpen, setNotesOpen]   = useState(false);
  const dropRef = useRef([]);
  const notesRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [eRes, sRes, pRes, nRes] = await Promise.all([
        getSalesReturns(), getSalesReturnStats(), getInventory(), getSalesReturnNotes()
      ]);
      setEntries(eRes.data || []);
      setStats(sRes.data || { total: 0, thisMonth: 0 });
      setProducts((pRes.data || []).filter(p => parseFloat(p.sales_balance || 0) > 0));
      setNotesHistory(nRes.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.srt-dropdown')) setOpen([]);
      if (notesRef.current && !notesRef.current.contains(e.target)) setNotesOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openCreate = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setItems([{ ...emptyItem }]);
    setSearch([]);
    setOpen([]);
    setError('');
    setModal('create');
  };

  const openView = async (entry) => {
    setSelected(entry);
    setModal('view');
    try { const res = await getSalesReturn(entry.id); setDetail(res.data); }
    catch { setDetail(null); }
  };

  const openDelete = (entry) => { setSelected(entry); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setDetail(null); setError(''); };

  const addItem    = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, val) => setItems(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const selectProduct = (i, product) => {
    setItems(prev => prev.map((row, idx) => idx === i ? {
      ...row,
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'kg',
      sales_balance: parseFloat(product.sales_balance || 0),
    } : row));
    setSearch(prev => { const a = [...prev]; a[i] = ''; return a; });
    setOpen(prev => { const a = [...prev]; a[i] = false; return a; });
  };

  const filteredProducts = (s) =>
    products.filter(p => !s || p.name.toLowerCase().includes(s.toLowerCase())).slice(0, 8);

  const handleSave = async () => {
    const valid = items.filter(r => r.product_id && parseFloat(r.quantity) > 0);
    if (!notes.trim()) { setError('Notes is required.'); return; }
    if (!valid.length) { setError('Add at least one item with a valid product and quantity.'); return; }
    setSaving(true); setError('');
    try {
      await createSalesReturn({ date, notes, items: valid });
      await fetchAll();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save sales return.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    try {
      await deleteSalesReturn(selected.id);
      await fetchAll();
      closeModal();
    } catch { setError('Failed to delete.'); }
  };

  const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const filteredEntries = entries.filter(e => {
    const d = (e.date || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });

  const openPrintPreview = async () => {
    setPrintItemsLoading(true);
    try {
      const [results, settings] = await Promise.all([
        Promise.all(filteredEntries.map(e => getSalesReturn(e.id))),
        getSettings(),
      ]);
      const map = {};
      results.forEach(res => { if (res?.data?.id) map[res.data.id] = res.data; });
      setPrintItemsMap(map);
      setBusinessInfo(settings?.data?.business || {});
    } catch (e) {}
    setPrintItemsLoading(false);
    setShowPrintPreview(true);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Sales Returns to Store</h1>
          <p>Record items returned from the sales floor back to the store</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={openPrintPreview} disabled={printItemsLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: printItemsLoading ? '#93c5fd' : '#2563eb', color: '#fff', cursor: printItemsLoading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            <FiPrinter size={15} /> {printItemsLoading ? 'Loading...' : 'Print'}
          </button>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiPlus /> New Return
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 480 }}>
        <div className="stat-card stat-card-blue">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiCornerDownLeft /></div>
          <div><div className="stat-label">Total Returns</div><div className="stat-value">{stats.total}</div></div>
        </div>
        <div className="stat-card stat-card-green">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiCornerDownLeft /></div>
          <div><div className="stat-label">This Month</div><div className="stat-value">{stats.thisMonth}</div></div>
        </div>
      </div>

      {/* Date Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 16px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Filter by Date:</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>From</span>
        <input type="date" value={filterFrom} max={filterTo || todayStr} onChange={e => setFilterFrom(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>To</span>
        <input type="date" value={filterTo} min={filterFrom || undefined} max={todayStr} onChange={e => setFilterTo(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }} />
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(''); setFilterTo(''); }}
            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
            Clear
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{filteredEntries.length} return{filteredEntries.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Return #</th>
              <th>Date</th>
              <th>Items</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Loading...</td></tr>
            ) : filteredEntries.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>{entries.length === 0 ? 'No sales returns yet.' : 'No returns for selected date range.'}</td></tr>
            ) : filteredEntries.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, color: '#2563eb' }}>{e.return_number}</td>
                <td>{formatDate(e.date)}</td>
                <td>{e.item_count} item{e.item_count !== 1 ? 's' : ''}</td>
                <td style={{ color: '#9ca3af', fontSize: 13 }}>{e.notes || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openView(e)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <FiEye size={13} /> View
                    </button>
                    <button onClick={() => openDelete(e)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <FiTrash2 size={13} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create Modal ── */}
      {modal === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Sales Return</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6b7280' }}>Return items from the sales floor back to the store</p>
              </div>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}><FiX size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {error && <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={lbl}>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                </div>
                <div ref={notesRef} style={{ position: 'relative' }}>
                  <label style={lbl}>Notes <span style={{ color: '#dc2626' }}>*</span></label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => { setNotes(e.target.value); setNotesOpen(true); }}
                    onFocus={() => setNotesOpen(true)}
                    placeholder="e.g. Returned from sales — re-processing"
                    style={{ ...inp, borderColor: !notes.trim() && error ? '#dc2626' : '#e5e7eb' }}
                    autoComplete="off"
                  />
                  {notesOpen && notesHistory.filter(n => !notes || n.toLowerCase().includes(notes.toLowerCase())).length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, maxHeight: 180, overflowY: 'auto' }}>
                      {notesHistory.filter(n => !notes || n.toLowerCase().includes(notes.toLowerCase())).map((n, i) => (
                        <div key={i}
                          onMouseDown={() => { setNotes(n); setNotesOpen(false); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >{n}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#2563eb' }}>Items Returned</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Products moving from Sales floor → Store</p>
                  </div>
                  <button onClick={addItem} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <FiPlus size={13} /> Add Item
                  </button>
                </div>
                <div style={{ background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd', overflow: 'visible' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#e0f2fe' }}>
                        <th style={th}>Product</th>
                        <th style={th}>Sales Balance</th>
                        <th style={th}>Return Qty</th>
                        <th style={{ ...th, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #bae6fd' }}>
                          <td style={td}>
                            <div className="srt-dropdown" style={{ position: 'relative' }}>
                              <input
                                type="text"
                                value={row.product_name || (search[i] !== undefined ? search[i] : '')}
                                onChange={e => {
                                  const v = e.target.value;
                                  setSearch(prev => { const a = [...prev]; a[i] = v; return a; });
                                  if (!v) updateItem(i, 'product_id', '');
                                  updateItem(i, 'product_name', v);
                                  setOpen(prev => { const a = [...prev]; a[i] = true; return a; });
                                }}
                                onFocus={() => setOpen(prev => { const a = [...prev]; a[i] = true; return a; })}
                                placeholder="Search product on sales floor..."
                                style={{ ...inp, minWidth: 180 }}
                              />
                              {open[i] && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                                  {filteredProducts(row.product_name).length === 0
                                    ? <div style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 13 }}>No products with sales balance found.</div>
                                    : filteredProducts(row.product_name).map(p => (
                                      <div key={p.id} onMouseDown={() => selectProduct(i, p)}
                                        style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                      >
                                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                                        <span style={{ color: '#0284c7', fontSize: 12, fontWeight: 600 }}>{parseFloat(p.sales_balance || 0).toFixed(2)} {p.unit}</span>
                                      </div>
                                    ))
                                  }
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ ...td, color: '#0284c7', fontWeight: 600, textAlign: 'center' }}>
                            {parseFloat(row.sales_balance || 0).toFixed(2)} {row.unit}
                          </td>
                          <td style={td}>
                            <input type="number" min="0" step="0.01" value={row.quantity}
                              onChange={e => updateItem(i, 'quantity', e.target.value)}
                              placeholder="0"
                              style={{ ...inp, width: 90 }}
                            />
                          </td>
                          <td style={td}>
                            {items.length > 1 && (
                              <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}><FiX size={14} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={closeModal} style={{ padding: '9px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  {saving ? 'Saving...' : 'Save Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)', borderRadius: '14px 14px 0 0', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 3 }}>Sales Return to Store</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{selected.return_number}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{formatDate(selected.date)}</div>
              </div>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#fff', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FiX size={16} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {selected.notes && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#374151', marginBottom: 16 }}>{selected.notes}</div>}
              {!detail ? <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af' }}>Loading...</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={th}>Product</th>
                      <th style={{ ...th, textAlign: 'right' }}>Qty Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items?.map((item, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={td}>{item.product_name}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>{parseFloat(item.quantity).toFixed(2)} {item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {modal === 'delete' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: '#fff1f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FiAlertTriangle size={22} style={{ color: '#dc2626' }} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 700 }}>Delete {selected.return_number}?</h3>
            <p style={{ margin: '0 0 22px', fontSize: 13, color: '#6b7280' }}>This will reverse all stock movements from this return.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={closeModal} style={{ padding: '9px 22px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={handleDelete} style={{ padding: '9px 22px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Preview ──────────────────────────────────────────── */}
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
                Print Preview — Sales Returns ({filteredEntries.length} records)
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
            <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)', padding: '28px 44px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: 0.3, marginBottom: 5 }}>
                  {businessInfo.business_name || 'Business Name'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.7 }}>
                  {[businessInfo.business_address, businessInfo.business_phone, businessInfo.business_email].filter(Boolean).join('  |  ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, marginBottom: 6 }}>Sales Returns to Store</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {filterFrom || filterTo
                    ? `${filterFrom ? formatDate(filterFrom) : 'All'} — ${filterTo ? formatDate(filterTo) : 'All'}`
                    : formatDate(todayStr)}
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            {/* Accent bar */}
            <div style={{ height: 4, background: 'linear-gradient(90deg, #2563eb, #0284c7, #06b6d4)' }} />

            {/* Body */}
            <div style={{ padding: '26px 44px 36px' }}>

              {/* Summary chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Total Returns (All)', value: stats.total,            bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
                  { label: 'This Month',           value: stats.thisMonth,        bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
                  { label: 'Filtered Returns',     value: filteredEntries.length, bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
                ].map(chip => (
                  <div key={chip.label} style={{ padding: '12px 16px', borderRadius: 10, background: chip.bg, border: `1.5px solid ${chip.border}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#64748b', fontWeight: 600, marginBottom: 6 }}>{chip.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: chip.color }}>{chip.value}</div>
                  </div>
                ))}
              </div>

              {/* Returns Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284c7', display: 'inline-block' }} />
                    <span style={{ fontWeight: 700, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', color: '#475569' }}>Return Records</span>
                  </div>
                  {(filterFrom || filterTo) && (
                    <span style={{ fontSize: 10.5, color: '#64748b' }}>
                      {filterFrom ? formatDate(filterFrom) : '—'}  to  {filterTo ? formatDate(filterTo) : '—'}
                    </span>
                  )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['#', 'Return #', 'Date', 'Items', 'Notes'].map((h, i) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontSize: 10.5, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry, idx) => {
                      const detail = printItemsMap[entry.id];
                      const retItems = detail?.items || [];
                      return (
                        <React.Fragment key={entry.id}>
                          <tr style={{ background: idx % 2 === 1 ? '#f0f9ff' : '#fff', borderTop: idx > 0 ? '2px solid #e2e8f0' : 'none' }}>
                            <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 10.5 }}>{idx + 1}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: 11, color: '#1d4ed8' }}>{entry.return_number}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{formatDate(entry.date)}</td>
                            <td style={{ padding: '8px 12px', color: '#374151' }}>{entry.item_count} item{entry.item_count !== 1 ? 's' : ''}</td>
                            <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 10.5 }}>{entry.notes || '—'}</td>
                          </tr>
                          {retItems.length > 0 && (
                            <tr style={{ background: '#f8fafc' }}>
                              <td colSpan={5} style={{ padding: '0 12px 10px 32px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                                  <thead>
                                    <tr style={{ background: '#e0f2fe' }}>
                                      <th style={{ padding: '5px 10px', textAlign: 'left',  color: '#0369a1', fontWeight: 600 }}>Product</th>
                                      <th style={{ padding: '5px 10px', textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>Qty Returned</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {retItems.map((item, i) => (
                                      <tr key={i} style={{ borderBottom: '1px solid #bae6fd' }}>
                                        <td style={{ padding: '5px 10px', color: '#111827', fontWeight: 500 }}>{item.product_name}</td>
                                        <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: '#0284c7', fontFamily: 'monospace' }}>{parseFloat(item.quantity).toFixed(2)} {item.unit}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f0f9ff', borderTop: '2px solid #bae6fd' }}>
                      <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 700, fontSize: 11.5, color: '#0c4a6e' }}>
                        TOTAL — {filteredEntries.length} Return{filteredEntries.length !== 1 ? 's' : ''}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#374151' }}>
                        {filteredEntries.reduce((s, e) => s + parseInt(e.item_count || 0), 0)} items
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer */}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>{businessInfo.business_name || 'Business'} — Confidential</span>
                <span style={{ fontSize: 9.5, color: '#cbd5e1' }}>Printed: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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

export default SalesReturn;
