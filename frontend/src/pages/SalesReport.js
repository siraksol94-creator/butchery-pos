import React, { useState, useEffect, useCallback } from 'react';
import { getOrders, getOrder, reverseOrder, reverseOrderItem, getSettings } from '../services/api';
import { FiFileText, FiDollarSign, FiShoppingCart, FiCalendar, FiEye, FiRotateCcw, FiX, FiPrinter } from 'react-icons/fi';

const today = new Date().toISOString().split('T')[0];

const SalesReport = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [viewOrder, setViewOrder] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [reversingItemId, setReversingItemId] = useState(null);
  const [businessName, setBusinessName] = useState('Butchery Pro');

  const fetchOrders = useCallback(async () => {
    try {
      const res = await getOrders();
      setOrders(res.data || []);
    } catch (err) {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    getSettings().then(r => { if (r.data?.business_name) setBusinessName(r.data.business_name); }).catch(() => {});
  }, [fetchOrders]);

  const filtered = orders.filter(o => {
    const orderDate = new Date(o.created_at);
    if (dateFrom && orderDate < new Date(dateFrom)) return false;
    if (dateTo && orderDate > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  });

  const activeOrders = filtered.filter(o => o.status !== 'Reversed');
  const totalRevenue = activeOrders.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
  const totalDiscount = activeOrders.reduce((sum, o) => sum + parseFloat(o.discount || 0), 0);
  const totalSubtotal = activeOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || 0), 0);

  const handleView = async (orderId) => {
    setViewLoading(true);
    try {
      const res = await getOrder(orderId);
      setViewOrder(res.data);
    } catch (err) {
      alert('Failed to load order details.');
    } finally {
      setViewLoading(false);
    }
  };

  const handleReverse = async (order) => {
    if (order.status === 'Reversed') return;
    if (!window.confirm(`Reverse order ${order.order_number}? This will void the sale and restore stock.`)) return;
    try {
      await reverseOrder(order.id);
      await fetchOrders();
      alert(`Order ${order.order_number} has been reversed successfully.`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reverse order.');
    }
  };

  const handleReverseItem = async (item) => {
    if (item.reversed) return;
    if (!window.confirm(`Void item "${item.product_name}"? Stock will be restored.`)) return;
    setReversingItemId(item.id);
    try {
      const res = await reverseOrderItem(viewOrder.id, item.id);
      setViewOrder(res.data);
      await fetchOrders();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reverse item.');
    } finally {
      setReversingItemId(null);
    }
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Sales Report</h1>
          <p>View and filter completed sales transactions</p>
        </div>
      </div>

      {/* Filters */}
      <style>{`
        .sr-date-box:focus-within {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .sr-date-input::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
        .sr-clear-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 20px;
          background: linear-gradient(135deg, #f87171, #dc2626);
          color: #fff; border: none; border-radius: 10px;
          cursor: pointer; font-size: 13px; font-weight: 700;
          box-shadow: 0 3px 10px rgba(220,38,38,0.25);
          transition: transform 0.15s, box-shadow 0.15s;
          white-space: nowrap; align-self: flex-end;
        }
        .sr-clear-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(220,38,38,0.4);
        }
        .sr-clear-btn:active { transform: scale(0.97); }
      `}</style>

      <div className="card" style={{ marginBottom: 24, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FiCalendar style={{ color: '#2563eb', fontSize: 16 }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e3a5f' }}>Filter by Date</span>
          {(dateFrom || dateTo) && (
            <span style={{
              marginLeft: 6, padding: '2px 10px', borderRadius: 20,
              background: '#eff6ff', color: '#2563eb',
              fontSize: 11, fontWeight: 600, border: '1px solid #bfdbfe'
            }}>
              {dateFrom === dateTo && dateFrom
                ? dateFrom === today ? 'Today' : dateFrom
                : `${dateFrom || '...'} → ${dateTo || '...'}`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {/* From Date */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              From
            </label>
            <div className="sr-date-box" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              padding: '9px 14px', background: '#f8faff',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}>
              <FiCalendar style={{ color: '#2563eb', flexShrink: 0 }} />
              <input
                type="date" value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="sr-date-input"
                style={{ border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontWeight: 500, color: '#1e293b', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Arrow separator */}
          <div style={{ paddingBottom: 10, color: '#9ca3af', fontSize: 18, fontWeight: 300, flexShrink: 0 }}>→</div>

          {/* To Date */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              To
            </label>
            <div className="sr-date-box" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1.5px solid #e5e7eb', borderRadius: 10,
              padding: '9px 14px', background: '#f8faff',
              transition: 'border-color 0.15s, box-shadow 0.15s'
            }}>
              <FiCalendar style={{ color: '#2563eb', flexShrink: 0 }} />
              <input
                type="date" value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="sr-date-input"
                style={{ border: 'none', outline: 'none', fontSize: 14, background: 'transparent', fontWeight: 500, color: '#1e293b', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Clear Filter button */}
          <button className="sr-clear-btn" onClick={() => { setDateFrom(today); setDateTo(today); }}>
            <FiX size={14} /> Reset to Today
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        marginBottom: 24
      }}>
        {/* Total Orders */}
        <div style={{
          borderRadius: 14, padding: '20px 22px',
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: '#fff', boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
          display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', right: -12, top: -12,
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)'
          }} />
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <FiShoppingCart size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Orders</div>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{activeOrders.length}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{filtered.length} incl. reversed</div>
          </div>
        </div>

        {/* Total Revenue */}
        <div style={{
          borderRadius: 14, padding: '20px 22px',
          background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
          color: '#fff', boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
          display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', right: -12, top: -12,
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)'
          }} />
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <FiDollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Revenue</div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>${totalRevenue.toFixed(2)}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>after discounts</div>
          </div>
        </div>

        {/* Total Subtotal */}
        <div style={{
          borderRadius: 14, padding: '20px 22px',
          background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
          color: '#fff', boxShadow: '0 4px 16px rgba(217,119,6,0.3)',
          display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', right: -12, top: -12,
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)'
          }} />
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <FiFileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Subtotal</div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>${totalSubtotal.toFixed(2)}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>before discounts</div>
          </div>
        </div>

        {/* Total Discounts */}
        <div style={{
          borderRadius: 14, padding: '20px 22px',
          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
          color: '#fff', boxShadow: '0 4px 16px rgba(220,38,38,0.3)',
          display: 'flex', alignItems: 'center', gap: 16, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', right: -12, top: -12,
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)'
          }} />
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <FiDollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Discounts</div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>${totalDiscount.toFixed(2)}</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>given to customers</div>
          </div>
        </div>

      </div>

      {/* Orders Table */}
      <div className="card">
        <div className="card-header">
          <h3>Sales Transactions</h3>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{filtered.length} records ({activeOrders.length} active)</span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>No sales records found.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Date</th>
                  <th>Sub Total</th>
                  <th>Discount</th>
                  <th>Total</th>
                  <th>Amount Received</th>
                  <th>Change</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} style={{ opacity: order.status === 'Reversed' ? 0.6 : 1 }}>
                    <td><strong>{order.order_number}</strong></td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>${parseFloat(order.subtotal).toFixed(2)}</td>
                    <td style={{ color: parseFloat(order.discount) > 0 ? '#dc2626' : '#374151' }}>
                      {parseFloat(order.discount) > 0 ? `-$${parseFloat(order.discount).toFixed(2)}` : '$0.00'}
                    </td>
                    <td><strong>${parseFloat(order.total_amount).toFixed(2)}</strong></td>
                    <td>${parseFloat(order.amount_received || 0).toFixed(2)}</td>
                    <td style={{ color: '#16a34a' }}>${parseFloat(order.change_amount || 0).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${order.status === 'Reversed' ? 'badge-danger' : order.status === 'Partial' ? 'badge-warning' : 'badge-success'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleView(order.id)}
                          title="View Details"
                          style={{ padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <FiEye size={13} /> View
                        </button>
                        <button
                          onClick={() => handleReverse(order)}
                          disabled={order.status === 'Reversed'}
                          title="Reverse Order"
                          style={{ padding: '5px 10px', background: order.status === 'Reversed' ? '#e5e7eb' : '#dc2626', color: order.status === 'Reversed' ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: order.status === 'Reversed' ? 'not-allowed' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <FiRotateCcw size={13} /> Reverse
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Order Receipt Modal */}
      <style>{`
        @media print {
          .sr-no-print { display: none !important; }
          .sr-receipt-print { display: block !important; }
          body * { visibility: hidden; }
          #sr-receipt-content, #sr-receipt-content * { visibility: visible; }
          #sr-receipt-content { position: fixed; top: 0; left: 0; width: 100%; }
        }
        .sr-btn-close {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 20px; border: 1.5px solid #e5e7eb;
          border-radius: 10px; background: #fff; cursor: pointer;
          font-size: 13px; font-weight: 600; color: #374151;
          transition: background 0.15s, border-color 0.15s;
        }
        .sr-btn-close:hover { background: #f9fafb; border-color: #d1d5db; }
        .sr-btn-print {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 20px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #fff; cursor: pointer; font-size: 13px; font-weight: 700;
          box-shadow: 0 3px 10px rgba(37,99,235,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .sr-btn-print:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(37,99,235,0.4); }
        .sr-btn-reverse {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 10px 20px; border: none; border-radius: 10px;
          background: linear-gradient(135deg, #f87171, #dc2626);
          color: #fff; cursor: pointer; font-size: 13px; font-weight: 700;
          box-shadow: 0 3px 10px rgba(220,38,38,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .sr-btn-reverse:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(220,38,38,0.4); }
      `}</style>

      {(viewOrder || viewLoading) && (
        <div className="sr-no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 420, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
            {viewLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>Loading receipt...</div>
            ) : viewOrder && (
              <>
                {/* Receipt content */}
                <div id="sr-receipt-content" style={{ padding: '32px 28px', fontFamily: 'monospace', flex: 1 }}>

                  {/* Header */}
                  <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'sans-serif' }}>{businessName}</h2>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>Official Receipt</p>
                    {viewOrder.status === 'Reversed' && (
                      <div style={{ marginTop: 8, padding: '3px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 20, display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                        ✕ REVERSED
                      </div>
                    )}
                    {viewOrder.status === 'Partial' && (
                      <div style={{ marginTop: 8, padding: '3px 12px', background: '#fff7ed', color: '#d97706', borderRadius: 20, display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                        ~ PARTIAL REVERSAL
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px dashed #d1d5db', margin: '12px 0' }} />

                  {/* Order Info */}
                  <div style={{ fontSize: 12, marginBottom: 12 }}>
                    {[
                      ['Receipt #', viewOrder.order_number],
                      ['Date',      new Date(viewOrder.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })],
                      ['Time',      new Date(viewOrder.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })],
                      ['Customer',  viewOrder.customer_name || 'Walk-in'],
                      ['Payment',   viewOrder.payment_method],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#6b7280' }}>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px dashed #d1d5db', margin: '12px 0' }} />

                  {/* Items */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', fontSize: 11, color: '#6b7280', marginBottom: 6, fontWeight: 600 }}>
                      <span style={{ flex: 2 }}>ITEM</span>
                      <span style={{ textAlign: 'center', flex: 1 }}>QTY</span>
                      <span style={{ textAlign: 'right', flex: 1 }}>PRICE</span>
                      <span style={{ textAlign: 'right', flex: 1 }}>TOTAL</span>
                      <span className="sr-no-print" style={{ width: 28 }} />
                    </div>
                    {(viewOrder.items || []).map((item, idx) => (
                      <div key={idx} style={{
                        display: 'flex', fontSize: 12, marginBottom: 5,
                        alignItems: 'center',
                        opacity: item.reversed ? 0.5 : 1
                      }}>
                        <span style={{ flex: 2, textDecoration: item.reversed ? 'line-through' : 'none' }}>
                          {item.product_name}
                          {item.reversed && (
                            <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '1px 4px', verticalAlign: 'middle' }}>
                              VOID
                            </span>
                          )}
                        </span>
                        <span style={{ textAlign: 'center', flex: 1, textDecoration: item.reversed ? 'line-through' : 'none' }}>{item.quantity}</span>
                        <span style={{ textAlign: 'right', flex: 1, textDecoration: item.reversed ? 'line-through' : 'none' }}>${parseFloat(item.unit_price).toFixed(2)}</span>
                        <span style={{ textAlign: 'right', flex: 1, textDecoration: item.reversed ? 'line-through' : 'none' }}>${parseFloat(item.total_price).toFixed(2)}</span>
                        {/* Per-item void button — hidden on print */}
                        <span className="sr-no-print" style={{ width: 28, display: 'flex', justifyContent: 'flex-end' }}>
                          {!item.reversed && viewOrder.status !== 'Reversed' && (
                            <button
                              title="Void this item"
                              disabled={reversingItemId === item.id}
                              onClick={() => handleReverseItem(item)}
                              style={{
                                width: 22, height: 22, padding: 0, border: 'none',
                                borderRadius: 5, cursor: 'pointer',
                                background: reversingItemId === item.id ? '#e5e7eb' : 'linear-gradient(135deg,#f87171,#dc2626)',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}
                            >
                              <FiRotateCcw size={11} />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: '1px dashed #d1d5db', margin: '12px 0' }} />

                  {/* Totals */}
                  <div style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Subtotal</span>
                      <span>${parseFloat(viewOrder.subtotal).toFixed(2)}</span>
                    </div>
                    {parseFloat(viewOrder.discount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#dc2626' }}>Discount</span>
                        <span style={{ color: '#dc2626' }}>-${parseFloat(viewOrder.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: 14 }}>
                      <span>TOTAL</span>
                      <span>${parseFloat(viewOrder.total_amount).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Amount Received</span>
                      <span>${parseFloat(viewOrder.amount_received || 0).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#16a34a' }}>
                      <span>Change</span>
                      <span>${parseFloat(viewOrder.change_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed #d1d5db', margin: '16px 0 12px' }} />

                  <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280' }}>
                    <p style={{ margin: 0 }}>Thank you for your purchase!</p>
                    <p style={{ margin: '2px 0 0' }}>Please come again.</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sr-no-print" style={{
                  display: 'flex', gap: 8, padding: '14px 24px 20px',
                  borderTop: '1px solid #f3f4f6', justifyContent: 'flex-end',
                  flexWrap: 'wrap'
                }}>
                  <button className="sr-btn-close" onClick={() => setViewOrder(null)}>
                    <FiX size={14} /> Close
                  </button>
                  <button className="sr-btn-print" onClick={() => window.print()}>
                    <FiPrinter size={14} /> Print Receipt
                  </button>
                  {viewOrder.status !== 'Reversed' && (
                    <button className="sr-btn-reverse" onClick={() => { setViewOrder(null); handleReverse(viewOrder); }}>
                      <FiRotateCcw size={14} /> Reverse Order
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesReport;
