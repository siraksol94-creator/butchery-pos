import React, { useState, useEffect } from 'react';
import { getProducts, getSalesBinCard, getSettings } from '../services/api';
import { FiSearch, FiPrinter, FiShoppingCart, FiArrowDown, FiArrowUp, FiActivity } from 'react-icons/fi';

const todayStr = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const movementLabel = (type) => {
  if (type === 'siv')           return 'SIV In';
  if (type === 'sale')          return 'Sale';
  if (type === 'reverse')       return 'Reversal';
  if (type === 'sales_return')  return 'Return';
  if (type === 'reconciliation') return 'Reconciliation';
  if (type === 'adjustment')    return 'Adjustment';
  return type;
};

const typeStyle = (type) => {
  if (type === 'siv')           return { background: '#dcfce7', color: '#166534' };
  if (type === 'sale')          return { background: '#fee2e2', color: '#dc2626' };
  if (type === 'reverse')       return { background: '#dbeafe', color: '#1d4ed8' };
  if (type === 'sales_return')  return { background: '#fef9c3', color: '#854d0e' };
  if (type === 'reconciliation') return { background: '#ede9fe', color: '#7c3aed' };
  return { background: '#f3f4f6', color: '#374151' };
};

const ACCENT = '#b91c1c';
const ACCENT_DARK = '#7f1d1d';
const ACCENT_LIGHT = '#fef2f2';

const SalesBinCard = () => {
  const [products, setProducts]           = useState([]);
  const [productId, setProductId]         = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [from, setFrom]                   = useState(firstOfMonth);
  const [to, setTo]                       = useState(todayStr);
  const [rows, setRows]                   = useState([]);
  const [openingBal, setOpeningBal]       = useState(0);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [searched, setSearched]           = useState(false);
  const [businessInfo, setBusinessInfo]   = useState({});
  const [showPrint, setShowPrint]         = useState(false);

  useEffect(() => {
    getProducts().then(r => setProducts((r.data || []).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    getSettings().then(r => setBusinessInfo(r.data?.business || {})).catch(() => {});
  }, []);

  const selectedProduct = products.find(p => String(p.id) === String(productId));

  const handleProductInput = (val) => {
    setProductSearch(val);
    const match = products.find(p => `${p.name}${p.unit ? ` (${p.unit})` : ''}` === val);
    setProductId(match ? String(match.id) : '');
  };

  const handleSearch = async () => {
    if (!productId) { setError('Please select a product.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await getSalesBinCard({ product_id: productId, from, to });
      setRows(res.data?.rows || []);
      setOpeningBal(parseFloat(res.data?.opening_balance ?? 0));
      setSearched(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load sales bin card.');
    } finally {
      setLoading(false);
    }
  };

  const totalIn  = rows.filter(r => parseFloat(r.quantity) > 0).reduce((s, r) => s + parseFloat(r.quantity), 0);
  const totalOut = rows.filter(r => parseFloat(r.quantity) < 0).reduce((s, r) => s + Math.abs(parseFloat(r.quantity)), 0);
  const openBal  = openingBal;
  const closeBal = rows.length > 0 ? parseFloat(rows[rows.length - 1].balance) : openBal;

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${ACCENT_DARK},${ACCENT})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(185,28,28,0.25)' }}>
              <FiShoppingCart size={22} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' }}>Sales Bin Card</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>Sales counter stock movement history per product</p>
            </div>
          </div>
          {searched && (rows.length > 0 || openBal > 0) && (
            <button onClick={() => setShowPrint(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <FiPrinter size={15} /> Print
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '18px 20px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 220px', minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Product *</label>
          <input list="salesbincard-products" value={productSearch} onChange={e => handleProductInput(e.target.value)}
            placeholder="Type or select a product…"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
          <datalist id="salesbincard-products">
            {products.map(p => <option key={p.id} value={`${p.name}${p.unit ? ` (${p.unit})` : ''}`} />)}
          </datalist>
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 130 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 130 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }} />
        </div>
        <div>
          <button onClick={handleSearch} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 8, border: 'none', background: loading ? '#9ca3af' : ACCENT, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
            <FiSearch size={14} /> {loading ? 'Loading…' : 'Show'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626' }}>{error}</div>
      )}

      {/* Summary Cards */}
      {searched && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Opening Balance', value: openBal.toFixed(2),  unit: selectedProduct?.unit, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', icon: <FiActivity size={18} /> },
            { label: 'Total In',        value: totalIn.toFixed(2),   unit: selectedProduct?.unit, color: '#166534', bg: '#dcfce7', border: '#86efac', icon: <FiArrowDown size={18} /> },
            { label: 'Total Out',       value: totalOut.toFixed(2),  unit: selectedProduct?.unit, color: '#b45309', bg: '#fef9c3', border: '#fcd34d', icon: <FiArrowUp size={18} /> },
            { label: 'Closing Balance', value: closeBal.toFixed(2),  unit: selectedProduct?.unit, color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', icon: <FiShoppingCart size={18} /> },
          ].map((c, i) => (
            <div key={i} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: c.color }}>{c.label}</span>
                <span style={{ color: c.color }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              {c.unit && <div style={{ fontSize: 11, color: c.color, opacity: 0.7, marginTop: 2 }}>{c.unit}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {searched && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
              {selectedProduct ? selectedProduct.name : 'Product'} — Sales Bin Card
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {formatDate(from)} – {formatDate(to)} &nbsp;·&nbsp; {rows.length} movement{rows.length !== 1 ? 's' : ''}
            </div>
          </div>

          {rows.length === 0 && openBal === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              No sales movements found for this product in the selected period.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 520px)', minHeight: 120 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: ACCENT, color: '#fff' }}>
                    {['#', 'Date', 'Reference', 'Type', 'In', 'Out', 'Balance'].map((h, i) => (
                      <th key={i} style={{ padding: '11px 14px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap', background: ACCENT }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
                    <td style={{ padding: '10px 14px', color: '#9ca3af', fontFamily: 'monospace' }}>—</td>
                    <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{formatDate(from)}</td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>—</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>Opening Balance</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#166534', fontWeight: 700, fontFamily: 'monospace' }}>{openBal > 0 ? openBal.toFixed(2) : '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>—</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1d4ed8', fontWeight: 800, fontFamily: 'monospace' }}>{openBal.toFixed(2)}</td>
                  </tr>
                  {rows.map((row, idx) => {
                    const qty   = parseFloat(row.quantity);
                    const isIn  = qty > 0;
                    const isOut = qty < 0;
                    const ts    = typeStyle(row.movement_type);
                    return (
                      <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 14px', color: '#9ca3af', fontFamily: 'monospace' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                        <td style={{ padding: '10px 14px', color: '#111827', fontWeight: 600 }}>{row.reference || '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, ...ts }}>
                            {movementLabel(row.movement_type)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#166534', fontWeight: 700, fontFamily: 'monospace' }}>{isIn ? qty.toFixed(2) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>{isOut ? Math.abs(qty).toFixed(2) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#111827', fontWeight: 800, fontFamily: 'monospace' }}>{parseFloat(row.balance).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${ACCENT}`, background: ACCENT_LIGHT }}>
                    <td colSpan={4} style={{ padding: '11px 14px', fontWeight: 700, color: ACCENT, fontSize: 12, textTransform: 'uppercase' }}>Totals</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#166534', fontFamily: 'monospace' }}>{totalIn.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontFamily: 'monospace' }}>{totalOut.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 800, color: '#111827', fontFamily: 'monospace' }}>{closeBal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Print Preview */}
      {showPrint && (
        <div className="print-preview-overlay" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: '#1e293b', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ color: '#94a3b8', fontSize: 13 }}>
              Sales Bin Card — <strong style={{ color: '#fff' }}>{selectedProduct?.name}</strong>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => window.print()} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: ACCENT, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                <FiPrinter size={13} style={{ marginRight: 6 }} />Print
              </button>
              <button onClick={() => setShowPrint(false)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #475569', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                Close
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '30px 20px' }}>
            <div id="print-document" style={{ width: 740, margin: '0 auto', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
              <div style={{ background: `linear-gradient(135deg,${ACCENT_DARK},${ACCENT},#f87171)`, padding: '28px 32px', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, opacity: 0.75, marginBottom: 4 }}>Sales Document</div>
                    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5 }}>SALES BIN CARD</div>
                    <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>{selectedProduct?.name} {selectedProduct?.unit ? `· ${selectedProduct.unit}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{businessInfo.name || 'Business Name'}</div>
                    {businessInfo.address && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{businessInfo.address}</div>}
                    {businessInfo.phone  && <div style={{ fontSize: 11, opacity: 0.8 }}>Tel: {businessInfo.phone}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 20 }}>
                  {['#fbbf24','#34d399','#60a5fa','#f472b6'].map((c, i) => (
                    <div key={i} style={{ height: 4, flex: 1, background: c, borderRadius: 2 }} />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                {[
                  { label: 'Period From',  value: formatDate(from) },
                  { label: 'Period To',    value: formatDate(to) },
                  { label: 'Opening Bal.', value: `${openBal.toFixed(2)} ${selectedProduct?.unit || ''}` },
                  { label: 'Closing Bal.', value: `${closeBal.toFixed(2)} ${selectedProduct?.unit || ''}` },
                ].map((item, i) => (
                  <div key={i} style={{ flex: 1, padding: '14px 16px', borderRight: i < 3 ? '1px solid #e5e7eb' : 'none' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#9ca3af', marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '20px 24px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: ACCENT, color: '#fff' }}>
                      {['#', 'Date', 'Reference', 'Type', 'In', 'Out', 'Balance'].map((h, i) => (
                        <th key={i} style={{ padding: '9px 10px', textAlign: i >= 4 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
                      <td style={{ padding: '8px 10px', color: '#9ca3af' }}>—</td>
                      <td style={{ padding: '8px 10px', color: '#374151' }}>{formatDate(from)}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7280' }}>—</td>
                      <td style={{ padding: '8px 10px', color: '#1d4ed8', fontWeight: 700 }}>Opening Balance</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#166534', fontWeight: 700 }}>{openBal > 0 ? openBal.toFixed(2) : ''}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>—</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{openBal.toFixed(2)}</td>
                    </tr>
                    {rows.map((row, idx) => {
                      const qty = parseFloat(row.quantity);
                      const isIn  = qty > 0;
                      const isOut = qty < 0;
                      return (
                        <tr key={row.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 10px', color: '#9ca3af' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', color: '#374151' }}>{formatDate(row.date)}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.reference || '—'}</td>
                          <td style={{ padding: '8px 10px', color: '#6b7280' }}>{movementLabel(row.movement_type)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#166534', fontWeight: 700 }}>{isIn ? qty.toFixed(2) : ''}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{isOut ? Math.abs(qty).toFixed(2) : ''}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>{parseFloat(row.balance).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: ACCENT_LIGHT, borderTop: `2px solid ${ACCENT}` }}>
                      <td colSpan={4} style={{ padding: '9px 10px', fontWeight: 700, color: ACCENT, fontSize: 11, textTransform: 'uppercase' }}>Totals</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{totalIn.toFixed(2)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>{totalOut.toFixed(2)}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800 }}>{closeBal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12 }}>
                  {['Prepared By', 'Checked By', 'Approved By'].map((label, i) => (
                    <div key={i} style={{ textAlign: 'center', width: 160 }}>
                      <div style={{ borderTop: '1px solid #374151', paddingTop: 8, fontSize: 11, color: '#6b7280' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: ACCENT, padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11, opacity: 0.8 }}>Printed: {new Date().toLocaleDateString('en-GB')}</span>
                <span style={{ color: '#fff', fontSize: 11, opacity: 0.8 }}>{businessInfo.name || ''}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body > * { display: none !important; }
          .print-preview-overlay { position: static !important; background: #fff !important; }
          .print-preview-overlay > div:first-child { display: none !important; }
          #print-document { box-shadow: none !important; border-radius: 0 !important; width: 100% !important; margin: 0 !important; }
        }
      `}</style>
    </div>
  );
};

export default SalesBinCard;
