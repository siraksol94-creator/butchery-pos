import React, { useState, useEffect, useRef } from 'react';
import { getProductions, getProductionStats, createProduction, deleteProduction, getProduction } from '../services/api';
import { getStoreInventory } from '../services/api';
import { FiPlus, FiTrash2, FiX, FiEye, FiTool, FiAlertTriangle, FiPrinter } from 'react-icons/fi';

const todayStr = new Date().toISOString().split('T')[0];

const emptyInput  = { product_id: '', product_name: '', quantity: '', unit_cost: '', unit: 'kg', store_balance: 0 };
const emptyOutput = { product_id: '', product_name: '', quantity: '', unit: 'kg' };

const Production = () => {
  const [entries, setEntries]       = useState([]);
  const [stats, setStats]           = useState({ total: 0, thisMonth: 0 });
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null); // null | 'create' | 'view' | 'delete'
  const [selected, setSelected]     = useState(null);
  const [detail, setDetail]         = useState(null);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState('');
  const [filterFrom, setFilterFrom] = useState(todayStr);
  const [filterTo,   setFilterTo]   = useState(todayStr);

  // Form state
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes]   = useState('');
  const [inputs, setInputs]   = useState([{ ...emptyInput }]);
  const [outputs, setOutputs] = useState([{ ...emptyOutput }]);

  // Dropdown search
  const [inputSearch,  setInputSearch]  = useState([]);
  const [outputSearch, setOutputSearch] = useState([]);
  const [inputOpen,    setInputOpen]    = useState([]);
  const [outputOpen,   setOutputOpen]   = useState([]);
  const dropRef = useRef([]);

  const fetchAll = async () => {
    try {
      const [eRes, sRes, pRes] = await Promise.all([getProductions(), getProductionStats(), getStoreInventory()]);
      console.log('[Production] fetchAll eRes.data:', eRes.data, 'sRes.data:', sRes.data);
      setEntries(Array.isArray(eRes.data) ? eRes.data : []);
      setStats(sRes.data || { total: 0, thisMonth: 0 });
      setProducts(Array.isArray(pRes.data) ? pRes.data : []);
    } catch (err) {
      console.error('[Production] fetchAll error:', err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.prod-dropdown')) {
        setInputOpen([]);
        setOutputOpen([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const rawMaterials = products.filter(p => p.product_type === 'raw_material');
  const finishedProducts = products.filter(p => p.product_type === 'finished');
  // Finished products with returned qty available for re-processing
  const returnedFinished = products.filter(p =>
    p.product_type === 'finished' && parseFloat(p.available_for_reprocessing || 0) > 0
  );

  const openCreate = () => {
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setInputs([{ ...emptyInput }]);
    setOutputs([{ ...emptyOutput }]);
    setInputSearch([]);
    setOutputSearch([]);
    setInputOpen([]);
    setOutputOpen([]);
    setError('');
    setModal('create');
  };

  const openView = async (entry) => {
    setSelected(entry);
    setModal('view');
    try {
      const res = await getProduction(entry.id);
      setDetail(res.data);
    } catch { setDetail(null); }
  };

  const openDelete = (entry) => { setSelected(entry); setModal('delete'); };
  const closeModal = () => { setModal(null); setSelected(null); setDetail(null); setError(''); };

  // ── Inputs management ───────────────────────────────────────────────────────
  const addInput = () => setInputs(prev => [...prev, { ...emptyInput }]);
  const removeInput = (i) => setInputs(prev => prev.filter((_, idx) => idx !== i));
  const updateInput = (i, field, val) => setInputs(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  const selectInputProduct = (i, product) => {
    const balance = parseFloat(product.store_balance || 0);
    setInputs(prev => prev.map((row, idx) => idx === i ? {
      ...row,
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'kg',
      unit_cost: product.avg_cost_price || product.cost_price || '',
      store_balance: balance,
      product_type: product.product_type,
    } : row));
    setInputSearch(prev => { const a = [...prev]; a[i] = ''; return a; });
    setInputOpen(prev => { const a = [...prev]; a[i] = false; return a; });
  };

  const selectOutputProduct = (i, product) => {
    setOutputs(prev => prev.map((row, idx) => idx === i ? {
      ...row,
      product_id: product.id,
      product_name: product.name,
      unit: product.unit || 'kg',
    } : row));
    setOutputSearch(prev => { const a = [...prev]; a[i] = ''; return a; });
    setOutputOpen(prev => { const a = [...prev]; a[i] = false; return a; });
  };

  // ── Outputs management ──────────────────────────────────────────────────────
  const addOutput = () => setOutputs(prev => [...prev, { ...emptyOutput }]);
  const removeOutput = (i) => setOutputs(prev => prev.filter((_, idx) => idx !== i));
  const updateOutput = (i, field, val) => setOutputs(prev => prev.map((row, idx) => idx === i ? { ...row, [field]: val } : row));

  // ── Cost calculations ───────────────────────────────────────────────────────
  const totalInputCost = inputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_cost) || 0), 0);
  const totalOutputQty = outputs.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const costPerKg = totalOutputQty > 0 ? totalInputCost / totalOutputQty : 0;

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const validInputs  = inputs.filter(r => r.product_id && parseFloat(r.quantity) > 0);
    const validOutputs = outputs.filter(r => r.product_id && parseFloat(r.quantity) > 0);
    if (!validInputs.length)  { setError('Add at least one input with a valid product and quantity.'); return; }
    if (!validOutputs.length) { setError('Add at least one output with a valid product and quantity.'); return; }
    setSaving(true);
    setError('');
    try {
      await createProduction({ date, notes, inputs: validInputs, outputs: validOutputs });
      await fetchAll();
      closeModal();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save production entry.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProduction(selected.id);
      await fetchAll();
      closeModal();
    } catch { setError('Failed to delete.'); }
    setDeleting(false);
  };

  const filteredInputProducts = (search) =>
    products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  const filteredOutputProducts = (search) =>
    finishedProducts.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  const filteredEntries = entries.filter(e => {
    const d = (e.date || '').split('T')[0];
    if (filterFrom && d < filterFrom) return false;
    if (filterTo   && d > filterTo)   return false;
    return true;
  });

  const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  const handlePrint = () => {
    const dateLabel = filterFrom === filterTo && filterFrom
      ? fmtDate(filterFrom)
      : filterFrom || filterTo
        ? `${filterFrom ? fmtDate(filterFrom) : 'Start'} – ${filterTo ? fmtDate(filterTo) : 'End'}`
        : 'All Dates';
    const rows = filteredEntries.map(e => `
      <tr>
        <td>${e.production_number}</td>
        <td>${e.date}</td>
        <td style="text-align:center">${e.input_count}</td>
        <td style="text-align:center">${e.output_count}</td>
        <td style="text-align:right">K ${parseFloat(e.total_input_cost || 0).toFixed(2)}</td>
        <td style="text-align:right">K ${parseFloat(e.cost_per_kg || 0).toFixed(2)}</td>
        <td>${e.notes || '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:A4;margin:15mm}*{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1f2937}
      .hdr{text-align:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #374151}
      .biz{font-size:18px;font-weight:bold;margin-bottom:3px}
      .sub{font-size:11px;color:#6b7280;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-top:4px}
      th{background:#f3f4f6;border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:bold}
      td{border:1px solid #e5e7eb;padding:7px 10px}
      .ft{margin-top:18px;font-size:9px;color:#9ca3af;text-align:center}
    </style></head><body>
      <div class="hdr">
        <div class="biz">Production Entries</div>
        <div class="sub">${dateLabel}</div>
      </div>
      <table>
        <thead><tr><th>Production #</th><th>Date</th><th style="text-align:center">Inputs</th><th style="text-align:center">Outputs</th><th style="text-align:right">Total Cost</th><th style="text-align:right">Cost/kg</th><th>Notes</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#9ca3af">No entries</td></tr>'}</tbody>
      </table>
      <div class="ft">Printed: ${new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Production</h1>
          <p>Transform raw materials into finished products</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePrint} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            <FiPrinter size={15} /> Print
          </button>
          <button className="btn btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiPlus /> New Production Entry
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 480 }}>
        <div className="stat-card stat-card-blue">
          <div className="stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}><FiTool /></div>
          <div><div className="stat-label">Total Entries</div><div className="stat-value">{stats.total}</div></div>
        </div>
        <div className="stat-card stat-card-green">
          <div className="stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}><FiTool /></div>
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
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{filteredEntries.length} entr{filteredEntries.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {/* Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Production #</th>
              <th>Date</th>
              <th>Inputs</th>
              <th>Outputs</th>
              <th>Total Input Cost</th>
              <th>Cost / kg</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Loading...</td></tr>
            ) : filteredEntries.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>{entries.length === 0 ? 'No production entries yet.' : 'No entries for selected date range.'}</td></tr>
            ) : filteredEntries.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600, color: '#2563eb' }}>{e.production_number}</td>
                <td>{e.date}</td>
                <td>{e.input_count} item{e.input_count !== 1 ? 's' : ''}</td>
                <td>{e.output_count} item{e.output_count !== 1 ? 's' : ''}</td>
                <td>K {parseFloat(e.total_input_cost || 0).toFixed(2)}</td>
                <td>K {parseFloat(e.cost_per_kg || 0).toFixed(2)}</td>
                <td style={{ color: '#9ca3af', fontSize: 13 }}>{e.notes || '—'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openView(e)} title="View details" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      <FiEye size={13} /> View
                    </button>
                    <button onClick={() => openDelete(e)} title="Delete" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fff1f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
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
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Production Entry</h3>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}><FiX size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {error && <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

              {/* Date + Notes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 24 }}>
                <div>
                  <label style={lbl}>Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Notes (optional)</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Cutting batch #1" style={inp} />
                </div>
              </div>

              {/* Inputs section */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#b45309' }}>Inputs — Raw Materials Consumed</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Products that will be deducted from Store inventory</p>
                  </div>
                  <button onClick={addInput} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <FiPlus size={13} /> Add Input
                  </button>
                </div>
                <div style={{ background: '#fffbeb', borderRadius: 10, border: '1px solid #fde68a', overflow: 'visible' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fef3c7' }}>
                        <th style={th}>Raw Material / Returned</th>
                        <th style={th}>Available</th>
                        <th style={th}>Quantity</th>
                        <th style={th}>Unit Cost (K)</th>
                        <th style={th}>Total Cost</th>
                        <th style={{ ...th, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {inputs.map((row, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #fde68a' }}>
                          <td style={td}>
                            <div className="prod-dropdown" style={{ position: 'relative' }}>
                              <input
                                type="text"
                                value={row.product_name || (inputSearch[i] !== undefined ? inputSearch[i] : '')}
                                onChange={e => {
                                  const v = e.target.value;
                                  setInputSearch(prev => { const a = [...prev]; a[i] = v; return a; });
                                  if (!v) updateInput(i, 'product_id', '');
                                  updateInput(i, 'product_name', v);
                                  setInputOpen(prev => { const a = [...prev]; a[i] = true; return a; });
                                }}
                                onFocus={() => setInputOpen(prev => { const a = [...prev]; a[i] = true; return a; })}
                                placeholder="Search raw material..."
                                style={{ ...inp, width: '100%', minWidth: 180 }}
                              />
                              {inputOpen[i] && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                                  {filteredInputProducts(row.product_name).length === 0
                                    ? <div style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 13 }}>No inputs available. Add raw materials or return finished products from sales.</div>
                                    : filteredInputProducts(row.product_name).map(p => {
                                        const bal = parseFloat(p.store_balance || 0);
                                        return (
                                          <div key={p.id} onMouseDown={() => selectInputProduct(i, p)}
                                            style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#fffbeb'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                          >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                              <span style={{ fontWeight: 500 }}>{p.name}</span>
                                            </div>
                                            <span style={{ color: '#9ca3af', fontSize: 12 }}>{bal.toFixed(2)} {p.unit}</span>
                                          </div>
                                        );
                                      })
                                  }
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ ...td, color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>{parseFloat(row.store_balance || 0).toFixed(2)} {row.unit}</td>
                          <td style={td}>
                            <input type="number" min="0" step="0.01" value={row.quantity} onChange={e => updateInput(i, 'quantity', e.target.value)} placeholder="0" style={{ ...inp, width: 80 }} />
                          </td>
                          <td style={td}>
                            <input type="number" min="0" step="0.01" value={row.unit_cost} onChange={e => updateInput(i, 'unit_cost', e.target.value)} placeholder="0.00" style={{ ...inp, width: 90 }} />
                          </td>
                          <td style={{ ...td, fontWeight: 600 }}>
                            K {((parseFloat(row.quantity) || 0) * (parseFloat(row.unit_cost) || 0)).toFixed(2)}
                          </td>
                          <td style={td}>
                            {inputs.length > 1 && (
                              <button onClick={() => removeInput(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}><FiX size={14} /></button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Outputs section */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#16a34a' }}>Outputs — Finished Products Produced</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Products that will be added to Store inventory</p>
                  </div>
                  <button onClick={addOutput} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <FiPlus size={13} /> Add Output
                  </button>
                </div>
                <div style={{ background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', overflow: 'visible' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#dcfce7' }}>
                        <th style={th}>Finished Product</th>
                        <th style={th}>Quantity</th>
                        <th style={th}>Allocated Cost/kg</th>
                        <th style={th}>Total Allocated Cost</th>
                        <th style={{ ...th, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.map((row, i) => {
                        const qty = parseFloat(row.quantity) || 0;
                        const allocatedTotal = qty * costPerKg;
                        return (
                          <tr key={i} style={{ borderTop: '1px solid #bbf7d0' }}>
                            <td style={td}>
                              <div className="prod-dropdown" style={{ position: 'relative' }}>
                                <input
                                  type="text"
                                  value={row.product_name || (outputSearch[i] !== undefined ? outputSearch[i] : '')}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setOutputSearch(prev => { const a = [...prev]; a[i] = v; return a; });
                                    if (!v) updateOutput(i, 'product_id', '');
                                    updateOutput(i, 'product_name', v);
                                    setOutputOpen(prev => { const a = [...prev]; a[i] = true; return a; });
                                  }}
                                  onFocus={() => setOutputOpen(prev => { const a = [...prev]; a[i] = true; return a; })}
                                  placeholder="Search finished product..."
                                  style={{ ...inp, width: '100%', minWidth: 180 }}
                                />
                                {outputOpen[i] && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                                    {filteredOutputProducts(row.product_name).length === 0
                                      ? <div style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 13 }}>No finished products found.</div>
                                      : filteredOutputProducts(row.product_name).map(p => (
                                        <div key={p.id} onMouseDown={() => selectOutputProduct(i, p)}
                                          style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                          onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        >
                                          <span style={{ fontWeight: 500 }}>{p.name}</span>
                                          <span style={{ color: '#9ca3af', fontSize: 12 }}>K{parseFloat(p.selling_price || 0).toFixed(2)}/{p.unit}</span>
                                        </div>
                                      ))
                                    }
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={td}>
                              <input type="number" min="0" step="0.01" value={row.quantity} onChange={e => updateOutput(i, 'quantity', e.target.value)} placeholder="0" style={{ ...inp, width: 80 }} />
                            </td>
                            <td style={{ ...td, color: '#16a34a', fontWeight: 600 }}>K {costPerKg.toFixed(2)}</td>
                            <td style={{ ...td, fontWeight: 600 }}>K {allocatedTotal.toFixed(2)}</td>
                            <td style={td}>
                              {outputs.length > 1 && (
                                <button onClick={() => removeOutput(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}><FiX size={14} /></button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost Summary */}
              <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>TOTAL INPUT COST</div><div style={{ fontSize: 20, fontWeight: 800, color: '#b45309' }}>K {totalInputCost.toFixed(2)}</div></div>
                <div><div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>TOTAL OUTPUT QTY</div><div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{totalOutputQty.toFixed(2)} kg</div></div>
                <div><div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>ALLOCATED COST / KG</div><div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>K {costPerKg.toFixed(2)}</div></div>
                {totalOutputQty > 0 && totalInputCost > totalOutputQty * (outputs[0]?.selling_price || 0) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
                    <FiAlertTriangle size={14} /> Review selling prices — cost may exceed revenue
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid #f1f5f9', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, color: '#374151', fontWeight: 500 }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {saving ? 'Saving...' : 'Save Production Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{selected.production_number}</h3>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{selected.date}</div>
              </div>
              <button onClick={closeModal} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}><FiX size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {!detail ? <div style={{ textAlign: 'center', color: '#9ca3af', padding: 32 }}>Loading...</div> : (
                <>
                  {/* Inputs */}
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#b45309' }}>Inputs Consumed</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                    <thead><tr style={{ background: '#fef3c7' }}>
                      <th style={th}>Product</th><th style={th}>Qty</th><th style={th}>Unit Cost</th><th style={th}>Total Cost</th>
                    </tr></thead>
                    <tbody>
                      {detail.inputs?.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #fde68a' }}>
                          <td style={td}>{r.product_name}</td>
                          <td style={td}>{parseFloat(r.quantity).toFixed(2)} {r.unit}</td>
                          <td style={td}>K {parseFloat(r.unit_cost).toFixed(2)}</td>
                          <td style={{ ...td, fontWeight: 600 }}>K {parseFloat(r.total_cost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Outputs */}
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#16a34a' }}>Outputs Produced</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                    <thead><tr style={{ background: '#dcfce7' }}>
                      <th style={th}>Product</th><th style={th}>Qty</th><th style={th}>Cost/kg</th><th style={th}>Allocated Cost</th>
                    </tr></thead>
                    <tbody>
                      {detail.outputs?.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid #bbf7d0' }}>
                          <td style={td}>{r.product_name}</td>
                          <td style={td}>{parseFloat(r.quantity).toFixed(2)} {r.unit}</td>
                          <td style={td}>K {parseFloat(r.allocated_cost_per_unit).toFixed(2)}</td>
                          <td style={{ ...td, fontWeight: 600 }}>K {parseFloat(r.total_allocated_cost).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Summary */}
                  <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>TOTAL INPUT COST</div><div style={{ fontSize: 17, fontWeight: 800, color: '#b45309' }}>K {parseFloat(selected.total_input_cost || 0).toFixed(2)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>COST PER KG</div><div style={{ fontSize: 17, fontWeight: 800, color: '#2563eb' }}>K {parseFloat(selected.cost_per_kg || 0).toFixed(2)}</div></div>
                    <div><div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>TOTAL OUTPUT</div><div style={{ fontSize: 17, fontWeight: 800, color: '#16a34a' }}>{parseFloat(selected.total_output_qty || 0).toFixed(2)} kg</div></div>
                  </div>
                  {selected.notes && <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Notes: {selected.notes}</div>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ── */}
      {modal === 'delete' && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '36px 40px', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FiAlertTriangle size={28} color="#dc2626" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>Delete Production Entry?</h3>
            <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 6px' }}>This will reverse all stock movements for</p>
            <p style={{ color: '#111827', fontSize: 15, fontWeight: 700, margin: '0 0 24px' }}>{selected.production_number}</p>
            {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={closeModal} style={{ padding: '10px 24px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '10px 24px', background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const lbl = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };
const inp = { padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 7, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' };
const th  = { padding: '8px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#374151' };
const td  = { padding: '8px 12px', fontSize: 13 };

export default Production;
