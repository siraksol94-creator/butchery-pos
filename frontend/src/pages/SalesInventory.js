import React, { useState, useEffect } from 'react';
import { getSalesInventory, saveSalesActualBalance } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FiSearch, FiPackage, FiAlertTriangle, FiCalendar, FiSave,
  FiCheckCircle, FiXCircle, FiEdit2, FiTrendingUp, FiDollarSign
} from 'react-icons/fi';

const SalesInventory = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [actualBalances, setActualBalances] = useState({});
  const [reasons, setReasons] = useState({});
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const maxDate = new Date(Date.now() + 86400000).toISOString().split('T')[0]; // today + 1 day
  const [toast, setToast] = useState(null);
  const [savedRows, setSavedRows] = useState({});   // rows confirmed saved on server
  const [editingRows, setEditingRows] = useState({}); // rows user unlocked for re-edit
  const [otherModal, setOtherModal] = useState(null); // { productId, text }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async (date) => {
    setLoading(true);
    try {
      const res = await getSalesInventory({ date });
      const data = res.data || [];
      setProducts(data);
      const savedAB = {}, savedReasons = {}, newSavedRows = {};
      data.forEach(p => {
        if (p.saved_actual_balance !== null && p.saved_actual_balance !== undefined) {
          savedAB[p.id] = p.saved_actual_balance;
        }
        if (p.saved_reason) {
          savedReasons[p.id] = p.saved_reason;
        }
        if (p.saved_actual_balance !== null && p.saved_actual_balance !== undefined && p.saved_reason) {
          newSavedRows[p.id] = true;
        }
      });
      setActualBalances(savedAB);
      setReasons(savedReasons);
      setSavedRows(newSavedRows);
      setEditingRows({});
    } catch (err) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(filterDate); }, [filterDate]);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const computeRow = (product) => {
    const openingBalance = parseFloat(product.opening_balance || 0);
    const input = parseFloat(product.input || 0);
    const totalStock = openingBalance + input;
    const totalSales = parseFloat(product.total_sales || 0);
    const salesBalance = totalStock - totalSales;
    const costPrice = parseFloat(product.avg_cost_price || product.cost_price || 0);
    const sellingPrice = parseFloat(product.avg_selling_price || product.selling_price || 0);
    const actualVal = actualBalances[product.id] !== undefined && actualBalances[product.id] !== ''
      ? parseFloat(actualBalances[product.id]) : 0;
    const difference = actualVal - salesBalance;
    const totalCostPrice = totalSales * costPrice;
    const totalSellingPrice = totalSales * sellingPrice;
    const totalDifference = difference * sellingPrice;
    const profit = totalSellingPrice - totalCostPrice + totalDifference;
    const stockingPrice = actualVal * sellingPrice;
    return {
      openingBalance, input, totalStock, totalSales, salesBalance,
      costPrice, sellingPrice, actualVal, difference,
      totalCostPrice, totalSellingPrice, totalDifference, profit, stockingPrice
    };
  };

  const isLocked = (id) => !!savedRows[id] && !editingRows[id];

  const PRESET_REASONS = ['Weight Loss', 'Shortage'];

  const getSelectValue = (id) => {
    const r = reasons[id];
    if (!r) return 'Weight Loss';
    return PRESET_REASONS.includes(r) ? r : 'Other';
  };

  const handleReasonChange = (productId, val) => {
    if (val === 'Other') {
      const current = reasons[productId];
      setOtherModal({ productId, text: PRESET_REASONS.includes(current) ? '' : (current || '') });
    } else {
      setReasons(prev => ({ ...prev, [productId]: val }));
    }
  };

  const confirmOtherReason = () => {
    if (!otherModal?.text?.trim()) return;
    setReasons(prev => ({ ...prev, [otherModal.productId]: otherModal.text.trim() }));
    setOtherModal(null);
  };

  const handleSave = async () => {
    const entries = Object.keys(actualBalances)
      .filter(id => {
        if (actualBalances[id] === '' || actualBalances[id] === undefined) return false;
        if (savedRows[id] && !editingRows[id]) return false; // still locked
        return true;
      })
      .map(id => ({
        product_id: parseInt(id),
        actual_balance: parseFloat(actualBalances[id]),
        reason: reasons[id] || null
      }));

    if (entries.length === 0) {
      showToast('No actual balances to save.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveSalesActualBalance({ date: filterDate, entries, created_by: user?.id });
      showToast(`${entries.length} actual balance${entries.length > 1 ? 's' : ''} saved successfully!`, 'success');
      await loadData(filterDate);
    } catch (err) {
      showToast('Failed to save: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const summaryTotals = filtered.reduce((acc, p) => {
    const r = computeRow(p);
    acc.totalSales += r.totalSales;
    acc.totalCost += r.totalCostPrice;
    acc.totalRevenue += r.totalSellingPrice;
    acc.totalProfit += r.profit;
    acc.totalStocking += r.stockingPrice;
    acc.totalDiff += r.totalDifference || 0;
    return acc;
  }, { totalSales: 0, totalCost: 0, totalRevenue: 0, totalProfit: 0, totalStocking: 0, totalDiff: 0 });

  const fmt = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const pendingCount = Object.keys(actualBalances)
    .filter(id => {
      if (actualBalances[id] === '' || actualBalances[id] === undefined) return false;
      if (savedRows[id] && !editingRows[id]) return false;
      return true;
    }).length;

  const summaryCards = [
    {
      label: 'Total Products', value: products.length, prefix: '',
      icon: <FiPackage size={18} />, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe'
    },
    {
      label: 'Total Revenue', value: fmt(summaryTotals.totalRevenue), prefix: '$',
      icon: <FiDollarSign size={18} />, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0'
    },
    {
      label: 'Total Cost', value: fmt(summaryTotals.totalCost), prefix: '$',
      icon: <FiDollarSign size={18} />, color: '#d97706', bg: '#fffbeb', border: '#fde68a'
    },
    {
      label: 'Profit',
      value: fmt(summaryTotals.totalProfit), prefix: '$',
      icon: <FiTrendingUp size={18} />,
      color: summaryTotals.totalProfit >= 0 ? '#16a34a' : '#dc2626',
      bg: summaryTotals.totalProfit >= 0 ? '#f0fdf4' : '#fef2f2',
      border: summaryTotals.totalProfit >= 0 ? '#bbf7d0' : '#fecaca'
    },
    {
      label: 'Stocking Value', value: fmt(summaryTotals.totalStocking), prefix: '$',
      icon: <FiPackage size={18} />, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe'
    },
    {
      label: 'Difference',
      value: fmt(summaryTotals.totalDiff), prefix: '$',
      icon: <FiAlertTriangle size={18} />,
      color: summaryTotals.totalDiff < 0 ? '#dc2626' : '#16a34a',
      bg: summaryTotals.totalDiff < 0 ? '#fef2f2' : '#f0fdf4',
      border: summaryTotals.totalDiff < 0 ? '#fecaca' : '#bbf7d0'
    },
  ];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Sales Inventory</h1>
          <p>Daily stock tracking &mdash; transferred via SIV</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || pendingCount === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 10, border: 'none',
            cursor: pendingCount === 0 ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 600,
            background: pendingCount > 0 ? 'linear-gradient(135deg, #16a34a, #15803d)' : '#d1d5db',
            color: 'white',
            boxShadow: pendingCount > 0 ? '0 4px 14px rgba(22,163,74,0.45)' : 'none',
            transition: 'all 0.25s', opacity: saving ? 0.75 : 1,
          }}
        >
          <FiSave size={17} />
          {saving ? 'Saving...' : 'Save Actual Balances'}
          {pendingCount > 0 && !saving && (
            <span style={{
              background: 'rgba(255,255,255,0.25)', borderRadius: 12,
              padding: '1px 9px', fontSize: 12, fontWeight: 700, marginLeft: 2
            }}>
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Summary Strip — Horizontal */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{
            flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', borderRadius: 12,
            background: card.bg, border: `1.5px solid ${card.border}`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)', minWidth: 140,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: card.color + '1a', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: card.color,
            }}>
              {card.icon}
            </div>
            <div>
              <div style={{
                fontSize: 10, color: '#6b7280', fontWeight: 600,
                letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3
              }}>
                {card.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: card.color, lineHeight: 1.2 }}>
                {card.prefix}{card.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input-container" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <FiSearch style={{ color: '#9ca3af' }} />
            <input type="text" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiCalendar size={16} style={{ color: '#6b7280' }} />
            <input
              type="date" value={filterDate} max={maxDate}
              onChange={e => setFilterDate(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer' }}
            />
            <button
              onClick={() => setFilterDate(new Date().toISOString().split('T')[0])}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                color: '#374151', whiteSpace: 'nowrap',
              }}
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <h3>Sales Stock Levels</h3>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} products</span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>No products found.</div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ fontSize: 12, minWidth: 1400 }}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Opening Bal.</th>
                  <th style={{ textAlign: 'right' }}>Input</th>
                  <th style={{ textAlign: 'right' }}>Total Stock</th>
                  <th style={{ textAlign: 'right' }}>Total Sales</th>
                  <th style={{ textAlign: 'right' }}>Sales Bal.</th>
                  <th style={{ textAlign: 'right', color: '#15803d', background: '#f0fdf4' }}>Actual Bal.</th>
                  <th style={{ textAlign: 'right' }}>Difference</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Cost Price</th>
                  <th style={{ textAlign: 'right' }}>Selling Price</th>
                  <th style={{ textAlign: 'right' }}>Total Cost</th>
                  <th style={{ textAlign: 'right' }}>Total Selling</th>
                  <th style={{ textAlign: 'right' }}>Total Diff.</th>
                  <th style={{ textAlign: 'right' }}>Profit</th>
                  <th style={{ textAlign: 'right' }}>Stocking Price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(product => {
                  const r = computeRow(product);
                  const locked = isLocked(product.id);
                  const hasActual = actualBalances[product.id] !== undefined && actualBalances[product.id] !== '';
                  return (
                    <tr key={product.id} style={{ background: locked ? '#f9fafb' : undefined }}>
                      <td><strong>{product.name}</strong></td>
                      <td style={{ textAlign: 'right' }}>{r.openingBalance.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: r.input > 0 ? '#2563eb' : '#9ca3af' }}>{r.input.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.totalStock.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: r.totalSales > 0 ? '#dc2626' : '#9ca3af' }}>{r.totalSales.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.salesBalance.toLocaleString()}</td>

                      {/* Actual Balance */}
                      <td style={{ textAlign: 'right', background: '#f0fdf4' }}>
                        {locked ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontWeight: 700, color: '#15803d', fontSize: 13 }}>
                              {r.actualVal.toFixed(2)}
                            </span>
                            <button
                              onClick={() => setEditingRows(prev => ({ ...prev, [product.id]: true }))}
                              title="Edit actual balance"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#9ca3af', padding: 3, display: 'flex', alignItems: 'center',
                                borderRadius: 4, transition: 'color 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                            >
                              <FiEdit2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <input
                            type="number" step="0.01" min="0"
                            value={actualBalances[product.id] ?? ''}
                            onChange={e => {
                              const val = e.target.value;
                              setActualBalances(prev => ({ ...prev, [product.id]: val }));
                              if (val !== '' && !reasons[product.id]) {
                                const diff = parseFloat(val) - r.salesBalance;
                                setReasons(prev => ({ ...prev, [product.id]: diff < 0 ? 'Weight Loss' : 'Shortage' }));
                              }
                            }}
                            style={{
                              width: 90, textAlign: 'right', padding: '6px 10px', borderRadius: 8,
                              border: hasActual ? '2px solid #16a34a' : '1.5px solid #d1d5db',
                              fontSize: 13, fontWeight: hasActual ? 700 : 400,
                              background: hasActual ? '#dcfce7' : '#fff',
                              color: '#15803d', outline: 'none', transition: 'all 0.2s',
                              boxShadow: hasActual ? '0 0 0 3px rgba(22,163,74,0.12)' : 'none',
                            }}
                            placeholder="0.00"
                          />
                        )}
                      </td>

                      {/* Difference */}
                      <td style={{
                        textAlign: 'right', fontWeight: 600,
                        color: r.difference < 0 ? '#dc2626' : r.difference > 0 ? '#16a34a' : '#374151'
                      }}>
                        {r.difference.toFixed(2)}
                      </td>

                      {/* Reason */}
                      <td>
                        {r.difference !== 0 ? (
                          locked ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                fontSize: 11, color: '#374151', background: '#f3f4f6',
                                borderRadius: 6, padding: '3px 8px', fontWeight: 500,
                                maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                display: 'inline-block'
                              }} title={reasons[product.id] || '—'}>
                                {reasons[product.id] || '—'}
                              </span>
                              <button
                                onClick={() => setEditingRows(prev => ({ ...prev, [product.id]: true }))}
                                title="Edit this row"
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#9ca3af', padding: 3, display: 'flex', alignItems: 'center',
                                  borderRadius: 4, transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                              >
                                <FiEdit2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <select
                                value={getSelectValue(product.id)}
                                onChange={e => handleReasonChange(product.id, e.target.value)}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db',
                                  fontSize: 11, background: '#fff', minWidth: 100, cursor: 'pointer'
                                }}
                              >
                                <option value="Weight Loss">Weight Loss</option>
                                <option value="Shortage">Shortage</option>
                                <option value="Other">Other</option>
                              </select>
                              {/* Show custom text indicator */}
                              {reasons[product.id] && !PRESET_REASONS.includes(reasons[product.id]) && (
                                <span
                                  title={reasons[product.id]}
                                  style={{
                                    fontSize: 10, color: '#2563eb', cursor: 'pointer',
                                    background: '#eff6ff', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap'
                                  }}
                                  onClick={() => setOtherModal({ productId: product.id, text: reasons[product.id] })}
                                >
                                  ✎ custom
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <span style={{ color: '#9ca3af' }}>—</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>${r.costPrice.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>${r.sellingPrice.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>${fmt(r.totalCostPrice)}</td>
                      <td style={{ textAlign: 'right' }}>${fmt(r.totalSellingPrice)}</td>
                      <td style={{ textAlign: 'right', color: r.totalDifference < 0 ? '#dc2626' : '#16a34a' }}>
                        ${fmt(r.totalDifference)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: r.profit >= 0 ? '#16a34a' : '#dc2626' }}>
                        ${fmt(r.profit)}
                      </td>
                      <td style={{ textAlign: 'right' }}>${fmt(r.stockingPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                  <td>TOTALS</td>
                  <td colSpan={3}></td>
                  <td style={{ textAlign: 'right' }}>{summaryTotals.totalSales.toLocaleString()}</td>
                  <td colSpan={5}></td>
                  <td></td>
                  <td style={{ textAlign: 'right' }}>${fmt(summaryTotals.totalCost)}</td>
                  <td style={{ textAlign: 'right' }}>${fmt(summaryTotals.totalRevenue)}</td>
                  <td style={{ textAlign: 'right', color: summaryTotals.totalDiff < 0 ? '#dc2626' : '#16a34a' }}>${fmt(summaryTotals.totalDiff)}</td>
                  <td style={{ textAlign: 'right', color: summaryTotals.totalProfit >= 0 ? '#16a34a' : '#dc2626' }}>${fmt(summaryTotals.totalProfit)}</td>
                  <td style={{ textAlign: 'right' }}>${fmt(summaryTotals.totalStocking)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* "Other" Reason Modal */}
      {otherModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: 14, padding: '26px 28px', width: 380,
            boxShadow: '0 20px 60px rgba(0,0,0,0.22)', animation: 'slideUp 0.2s ease'
          }}>
            <h4 style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 700, color: '#111827' }}>
              Enter Custom Reason
            </h4>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
              Describe why this difference occurred
            </p>
            <textarea
              autoFocus
              value={otherModal.text}
              onChange={e => setOtherModal(prev => ({ ...prev, text: e.target.value }))}
              placeholder="e.g. Spoilage due to refrigeration failure..."
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                borderRadius: 8, border: '1.5px solid #d1d5db', fontSize: 13,
                resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                transition: 'border-color 0.2s', lineHeight: 1.5,
              }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e => e.target.style.borderColor = '#d1d5db'}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => setOtherModal(null)}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmOtherReason}
                disabled={!otherModal.text?.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 8, border: 'none',
                  background: otherModal.text?.trim() ? '#2563eb' : '#d1d5db',
                  color: '#fff', cursor: otherModal.text?.trim() ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600, transition: 'background 0.2s'
                }}
              >
                Save Reason
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 500,
          color: 'white', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          background: toast.type === 'success'
            ? 'linear-gradient(135deg, #16a34a, #15803d)'
            : toast.type === 'warning'
            ? 'linear-gradient(135deg, #ca8a04, #a16207)'
            : 'linear-gradient(135deg, #dc2626, #b91c1c)',
          animation: 'slideUp 0.3s ease', minWidth: 260, maxWidth: 380,
        }}>
          {toast.type === 'success'
            ? <FiCheckCircle size={20} style={{ flexShrink: 0 }} />
            : toast.type === 'warning'
            ? <FiAlertTriangle size={20} style={{ flexShrink: 0 }} />
            : <FiXCircle size={20} style={{ flexShrink: 0 }} />
          }
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, marginLeft: 4 }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default SalesInventory;
