import React, { useState, useEffect, useRef } from 'react';
import { getInventory, createOrder, getSettings } from '../services/api';
import { FiSearch, FiShoppingCart, FiX, FiPlus, FiMinus, FiDollarSign } from 'react-icons/fi';

const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

const defaultProducts = [
  { id: 1, name: 'Prime Beef Steak', category_name: 'Beef', selling_price: 30, current_stock: 50, unit: 'kg' },
  { id: 2, name: 'Beef Ribs', category_name: 'Beef', selling_price: 25, current_stock: 35, unit: 'kg' },
  { id: 3, name: 'Ground Beef', category_name: 'Beef', selling_price: 15, current_stock: 60, unit: 'kg' },
  { id: 4, name: 'Chicken Breast', category_name: 'Chicken', selling_price: 10, current_stock: 80, unit: 'kg' },
  { id: 5, name: 'Chicken Thighs', category_name: 'Chicken', selling_price: 8, current_stock: 75, unit: 'kg' },
  { id: 6, name: 'Whole Chicken', category_name: 'Chicken', selling_price: 12, current_stock: 40, unit: 'kg' },
  { id: 7, name: 'Pork Chops', category_name: 'Pork', selling_price: 20, current_stock: 45, unit: 'kg' },
  { id: 8, name: 'Pork Belly', category_name: 'Pork', selling_price: 18, current_stock: 38, unit: 'kg' },
  { id: 9, name: 'Lamb Shoulder', category_name: 'Lamb', selling_price: 30, current_stock: 25, unit: 'kg' },
  { id: 10, name: 'Lamb Chops', category_name: 'Lamb', selling_price: 35, current_stock: 20, unit: 'kg' },
  { id: 11, name: 'Pork Sausages', category_name: 'Processed', selling_price: 12, current_stock: 55, unit: 'pack' },
  { id: 12, name: 'Beef Burgers', category_name: 'Processed', selling_price: 15, current_stock: 40, unit: 'pack' },
];

const categories = ['All', 'Beef', 'Chicken', 'Pork', 'Lamb', 'Processed'];

const getCategoryClass = (cat) => {
  const map = { 'Beef': 'category-beef', 'Chicken': 'category-chicken', 'Pork': 'category-pork', 'Lamb': 'category-lamb', 'Processed': 'category-processed' };
  return map[cat] || 'badge-gray';
};

const POS = () => {
  const [products, setProducts] = useState(defaultProducts);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [discount, setDiscount] = useState(0);
  const [amountReceived, setAmountReceived] = useState('');
  const [businessName, setBusinessName] = useState('Premium Butchery Services');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [barcodeMsg, setBarcodeMsg] = useState(null); // { text, type: 'error'|'success' }
  const [scannerActive, setScannerActive] = useState(true);
  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadValue, setNumpadValue] = useState('');
  const barcodeBuffer = useRef('');

  // Keyboard input for numpad modal
  useEffect(() => {
    if (!showNumpad) return;
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setNumpadValue(prev => prev === '0' ? e.key : prev + e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        setNumpadValue(prev => prev.includes('.') ? prev : prev + '.');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setNumpadValue(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        setAmountReceived(numpadValue || '0');
        setShowNumpad(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowNumpad(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showNumpad, numpadValue]);
  const barcodeTimer = useRef(null);

  // Track whether an input is focused — update scannerActive accordingly
  useEffect(() => {
    const onFocusIn = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        setScannerActive(false);
        barcodeBuffer.current = '';
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
      }
    };
    const onFocusOut = (e) => {
      setTimeout(() => {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          setScannerActive(true);
        }
      }, 0);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const focusScanner = () => {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    setScannerActive(true);
    barcodeBuffer.current = '';
  };

  // Barcode scanner: accumulate keystrokes, match on Enter
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Block scanner when an input/textarea/select is focused
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isTypingField = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isTypingField) return;

      if (e.key === 'Enter') {
        const rawCode = barcodeBuffer.current.trim();
        barcodeBuffer.current = '';
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        if (!rawCode) return;

        let found = null;
        let weight = null;

        // 1) Try each product's configured UB barcode settings (weight-embedded barcodes)
        for (const p of products) {
          const qLen = parseInt(p.ub_quantity_length || 0);
          if (qLen === 0) continue; // no weight barcode configured for this product

          const numStart = parseInt(p.ub_number_start  ?? 1);
          const numLen   = parseInt(p.ub_number_length  ?? 6);
          if (rawCode.length < numStart + numLen) continue;

          const extractedCode = rawCode.substring(numStart, numStart + numLen);
          if (p.code && extractedCode.toLowerCase() === p.code.trim().toLowerCase()) {
            // Code matched — extract weight using this product's settings
            const qStart   = parseInt(p.ub_quantity_start ?? 7);
            const decStart = parseInt(p.ub_decimal_start   ?? 2);
            const weightStr = rawCode.substring(qStart, qStart + qLen);
            if (weightStr.length === qLen) {
              const formatted = weightStr.substring(0, decStart) + '.' + weightStr.substring(decStart);
              weight = parseFloat(formatted);
              found = p;
              break;
            }
          }
        }

        // 2) If no weight-barcode match, fall back to direct product code match
        if (!found) {
          found = products.find(p => p.code && p.code.trim().toLowerCase() === rawCode.toLowerCase());
        }

        if (found) {
          addToCart(found, weight !== null ? weight : 1);
          const label = weight !== null ? `${found.name} — ${weight.toFixed(3)} ${found.unit}` : found.name;
          showBarcodeMsg(`Added: ${label}`, 'success');
        } else {
          showBarcodeMsg('No Item found', 'error');
        }
        return;
      }

      // Accumulate characters — only if not a modifier key
      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        // Reset buffer after 100ms of inactivity (scanner sends chars very fast)
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    };
  }, [products]);

  const showBarcodeMsg = (text, type) => {
    setBarcodeMsg({ text, type });
    setTimeout(() => setBarcodeMsg(null), 3000);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getInventory();
        if (res.data?.length > 0) setProducts(res.data);
      } catch (err) { /* use defaults */ }
      try {
        const res = await getSettings();
        if (res.data?.business_name) setBusinessName(res.data.business_name);
      } catch (err) { /* use default */ }
    };
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => {
    const hasSalesStock = parseFloat(p.sales_balance || 0) > 0;
    const matchCategory = selectedCategory === 'All' || p.category_name === selectedCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return hasSalesStock && matchCategory && matchSearch;
  });

  const addToCart = (product, qty = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product_id === product.id);
      if (existing) {
        const newQty = parseFloat((existing.quantity + qty).toFixed(3));
        return prev.map(item => item.product_id === product.id
          ? { ...item, quantity: newQty, total_price: parseFloat((newQty * item.unit_price).toFixed(2)) }
          : item);
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        unit_price: parseFloat(product.selling_price),
        quantity: parseFloat(qty.toFixed(3)),
        total_price: parseFloat((qty * product.selling_price).toFixed(2)),
        unit: product.unit
      }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQty = parseFloat((Math.max(0, item.quantity + delta)).toFixed(3));
        if (newQty === 0) return null;
        return { ...item, quantity: newQty, total_price: parseFloat((newQty * item.unit_price).toFixed(2)) };
      }
      return item;
    }).filter(Boolean));
  };

  const setItemQty = (productId, value) => {
    const qty = parseFloat(value);
    if (isNaN(qty) || qty <= 0) {
      setCart(prev => prev.filter(item => item.product_id !== productId));
      return;
    }
    const q = parseFloat(qty.toFixed(3));
    setCart(prev => prev.map(item =>
      item.product_id === productId
        ? { ...item, quantity: q, total_price: parseFloat((q * item.unit_price).toFixed(2)) }
        : item
    ));
  };

  const removeItem = (productId) => {
    setCart(prev => prev.filter(item => item.product_id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total_price, 0);
  const total = Math.max(0, subtotal - parseFloat(discount || 0));
  const change = Math.max(0, parseFloat(amountReceived || 0) - total);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    try {
      const orderRes = await createOrder({
        customer_name: customerName,
        items: cart,
        subtotal,
        tax_amount: 0,
        total_amount: total,
        discount: parseFloat(discount || 0),
        amount_received: parseFloat(amountReceived || 0),
        change_amount: change,
        payment_method: 'Cash'
      });

      const rData = {
        orderNumber: orderRes.data.order_number,
        date: new Date(),
        customerName,
        items: [...cart],
        subtotal,
        discount: parseFloat(discount || 0),
        total,
        amountReceived: parseFloat(amountReceived || 0),
        change,
        paymentMethod: 'Cash'
      };

      setCart([]);
      setCustomerName('');
      setDiscount(0);
      setAmountReceived('');
      setReceiptData(rData);
      setShowReceipt(true);

      // Refresh stock balances
      try {
        const updated = await getInventory();
        if (updated.data?.length > 0) setProducts(updated.data);
      } catch (err) { /* keep current */ }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      alert(`Checkout failed: ${msg}`);
    }
  };

  const printThermalReceipt = (data, bName) => {
    const div42eq = '='.repeat(42);
    const div42da = '-'.repeat(42);

    const itemsRows = data.items.map(item => `
      <tr><td colspan="4" style="font-weight:700;padding-top:4px;">${item.product_name}</td></tr>
      <tr>
        <td></td>
        <td style="text-align:center;">${item.quantity}&nbsp;${item.unit || ''}</td>
        <td style="text-align:right;">$${item.unit_price.toFixed(2)}</td>
        <td style="text-align:right;">$${item.total_price.toFixed(2)}</td>
      </tr>`).join('');

    const discountRow = data.discount > 0
      ? `<tr><td>Discount</td><td></td><td></td><td style="text-align:right;">-$${data.discount.toFixed(2)}</td></tr>`
      : '';

    const changeRow = data.amountReceived >= data.total
      ? `<tr><td>Change</td><td></td><td></td><td style="text-align:right;">$${data.change.toFixed(2)}</td></tr>`
      : `<tr><td style="color:#991b1b;">Balance Due</td><td></td><td></td><td style="text-align:right;color:#991b1b;">$${(data.total - data.amountReceived).toFixed(2)}</td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: 80mm auto; margin: 2mm 3mm; }
  html, body { height: auto; margin: 0; padding: 0; }
  * { box-sizing: border-box; }
  body {
    width: 74mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    color: #000;
    font-weight: 700;
  }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  td { padding: 1px 0; vertical-align: top; }
  .c { text-align: center; }
  .divider { text-align: center; font-size: 10px; overflow: hidden; white-space: nowrap; margin: 3px 0; }
  .grand { font-size: 13px; font-weight: 700; }
</style>
</head>
<body>
  <div class="c" style="font-size:13px;font-weight:700;letter-spacing:1px;">${bName}</div>
  <div class="divider">${div42eq}</div>
  <div class="c" style="font-weight:700;font-size:12px;">SALES RECEIPT</div>
  <div class="divider">${div42eq}</div>

  <table>
    <tr><td>Receipt #:</td><td></td><td style="text-align:right;">${data.orderNumber}</td></tr>
    <tr><td>Date:</td><td></td><td style="text-align:right;">${data.date.toLocaleDateString('en-GB')}</td></tr>
    <tr><td>Time:</td><td></td><td style="text-align:right;">${data.date.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})}</td></tr>
    <tr><td>Customer:</td><td></td><td style="text-align:right;">${data.customerName || 'Walk-in'}</td></tr>
    <tr><td>Payment:</td><td></td><td style="text-align:right;">${data.paymentMethod}</td></tr>
  </table>
  <div class="divider">${div42eq}</div>

  <table>
    <tr style="font-size:10px;">
      <td style="width:42%;font-weight:700;">ITEM</td>
      <td style="width:18%;text-align:center;font-weight:700;">QTY</td>
      <td style="width:20%;text-align:right;font-weight:700;">PRICE</td>
      <td style="width:20%;text-align:right;font-weight:700;">TOTAL</td>
    </tr>
    ${itemsRows}
  </table>
  <div class="divider">${div42da}</div>

  <table>
    <tr><td>Subtotal</td><td></td><td></td><td style="text-align:right;">$${data.subtotal.toFixed(2)}</td></tr>
    ${discountRow}
  </table>
  <div class="divider">${div42eq}</div>

  <table>
    <tr class="grand"><td>TOTAL</td><td></td><td></td><td style="text-align:right;">$${data.total.toFixed(2)}</td></tr>
  </table>
  <div class="divider">${div42eq}</div>

  <table>
    <tr><td>Amt Received:</td><td></td><td></td><td style="text-align:right;">$${data.amountReceived.toFixed(2)}</td></tr>
    ${changeRow}
  </table>
  <div class="divider">${div42eq}</div>

  <div class="c" style="margin-top:4px;">Thank you for your purchase!</div>
  <div class="c">Please come again.</div>
</body>
</html>`;

    // Use a hidden iframe so no popup window appears
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 300);
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

  return (
    <>
      <div className="pos-layout no-print">
        {/* Products Section */}
        <div className="pos-products">
          <div className="page-header">
            <div>
              <h1>Point of Sale</h1>
              <p>Select products to add to cart</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={focusScanner}
                title={scannerActive ? 'Scanner is active' : 'Click to re-enable barcode scanner'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                  fontWeight: 600, fontSize: 13,
                  background: scannerActive ? '#dcfce7' : '#fee2e2',
                  border: `2px solid ${scannerActive ? '#16a34a' : '#dc2626'}`,
                  color: scannerActive ? '#16a34a' : '#dc2626',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: scannerActive ? '#16a34a' : '#dc2626',
                  display: 'inline-block', flexShrink: 0
                }} />
                {scannerActive ? 'Scanner Active' : 'Focus Scanner'}
              </button>
              <div className="page-time">🕐 {timeStr}</div>
            </div>
          </div>

          <div className="search-input-container">
            <FiSearch style={{ color: '#9ca3af' }} />
            <input type="text" placeholder="Search products by name..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {barcodeMsg && (
            <div style={{
              margin: '8px 0',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: barcodeMsg.type === 'error' ? '#fee2e2' : '#dcfce7',
              color: barcodeMsg.type === 'error' ? '#dc2626' : '#16a34a',
              border: `1px solid ${barcodeMsg.type === 'error' ? '#fca5a5' : '#86efac'}`,
            }}>
              {barcodeMsg.type === 'error' ? '⚠ ' : '✓ '}{barcodeMsg.text}
            </div>
          )}

          <div className="category-filters">
            {categories.map(cat => (
              <button key={cat} className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}>{cat}</button>
            ))}
          </div>

          <div className="product-grid">
            {filteredProducts.map(product => {
              const salesBalance = parseFloat(product.sales_balance || 0);
              return (
                <div key={product.id} className="product-card" onClick={() => addToCart(product)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className={`badge ${getCategoryClass(product.category_name)}`} style={{ fontSize: 10 }}>
                      {product.category_name}
                    </span>
                    <h3>{product.name}</h3>
                    <p className="stock-info">In Stock: {salesBalance.toLocaleString()}</p>
                    <div className="product-price">
                      <div className="price">${product.selling_price} <span>/ {product.unit}</span></div>
                    </div>
                  </div>
                  {product.image_url ? (
                    <img
                      src={`${API_BASE}${product.image_url}`}
                      alt={product.name}
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Cart Section */}
        <div className="pos-cart">
          <div className="cart-header">
            <h3>Current Order</h3>
            <span className="cart-items-badge">{cart.length} items</span>
          </div>

          <div className="cart-customer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#9ca3af' }}>👤</span>
              <input type="text" placeholder="Customer name (optional)" value={customerName}
                onChange={e => setCustomerName(e.target.value)} />
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="cart-empty-icon"><FiDollarSign /></div>
              <h4>Cart is empty</h4>
              <p>Add products from the catalog<br/>to start a new sale</p>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map(item => (
                <div key={item.product_id} className="cart-item">
                  <div className="cart-item-info">
                    <h4>{item.product_name}</h4>
                    <p>${item.unit_price} / {item.unit}</p>
                  </div>
                  <div className="cart-item-qty">
                    <button onClick={() => updateQty(item.product_id, -1)}><FiMinus /></button>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={e => setItemQty(item.product_id, e.target.value)}
                      style={{
                        width: 64, textAlign: 'center',
                        border: '1px solid #e5e7eb', borderRadius: 6,
                        padding: '3px 4px', fontSize: 13, fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                    <button onClick={() => updateQty(item.product_id, 1)}><FiPlus /></button>
                  </div>
                  <div className="cart-item-total">${item.total_price.toFixed(2)}</div>
                  <button className="cart-item-remove" onClick={() => removeItem(item.product_id)}><FiX /></button>
                </div>
              ))}
            </div>
          )}

          <div className="cart-footer">
            <div className="cart-totals">
              <div className="cart-total-line">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="cart-total-line">
                <span>Discount</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  -$<input
                    type="number" min="0" value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    style={{ width: 64, border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 6px', fontSize: 13, textAlign: 'right' }}
                  />
                </span>
              </div>
              <div className="cart-total-line total">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="cart-total-line">
                <span>Amount Received</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  $<button
                    onClick={() => { setNumpadValue(amountReceived ? String(amountReceived) : ''); setShowNumpad(true); }}
                    style={{
                      width: 130, border: '2px solid #2563eb', borderRadius: 6,
                      padding: '6px 10px', fontSize: 16, textAlign: 'right', fontWeight: 600,
                      outline: 'none', background: amountReceived ? '#eff6ff' : '#fff',
                      color: amountReceived ? '#1d4ed8' : '#9ca3af', cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {amountReceived || '0.00'}
                  </button>
                </span>
              </div>
              <div className="cart-total-line" style={{ color: parseFloat(amountReceived || 0) >= total ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                <span>{parseFloat(amountReceived || 0) >= total ? 'Change' : 'Remaining'}</span>
                <span>${parseFloat(amountReceived || 0) >= total ? change.toFixed(2) : (total - parseFloat(amountReceived || 0)).toFixed(2)}</span>
              </div>
            </div>
            <div className="cart-actions">
              <button className="btn-clear" onClick={() => setCart([])}>
                <FiX /> Clear
              </button>
              <button className="btn-checkout" onClick={handleCheckout} disabled={cart.length === 0 || (total - parseFloat(amountReceived || 0)) > 0.3}>
                <FiShoppingCart /> Checkout
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Numpad Modal */}
      {showNumpad && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
          onClick={() => setShowNumpad(false)}
        >
          <div style={{
            background: '#fff', borderRadius: 20, padding: 24, width: 320,
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          }}
            onClick={e => e.stopPropagation()}
          >
            {/* Title */}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Amount Received
            </div>

            {/* Display */}
            <div style={{
              background: '#f8faff', border: '2px solid #2563eb', borderRadius: 12,
              padding: '14px 18px', marginBottom: 16, textAlign: 'right',
              fontSize: 32, fontWeight: 800, color: '#1d4ed8', letterSpacing: 1,
              minHeight: 62, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              fontFamily: 'monospace',
            }}>
              ${numpadValue || '0'}
            </div>

            {/* Quick amounts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {[total, Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map(amt => (
                <button key={amt} onClick={() => setNumpadValue(amt.toFixed(2))}
                  style={{
                    padding: '8px 4px', borderRadius: 8, border: '1.5px solid #bfdbfe',
                    background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer',
                  }}>
                  ${amt.toFixed(2)}
                </button>
              ))}
            </div>

            {/* Number Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(key => (
                <button key={key} onClick={() => {
                  if (key === '⌫') {
                    setNumpadValue(prev => prev.slice(0, -1));
                  } else if (key === '.' && numpadValue.includes('.')) {
                    // ignore second dot
                  } else {
                    setNumpadValue(prev => (prev === '0' ? key : prev + key));
                  }
                }}
                  style={{
                    padding: '18px 0', borderRadius: 12, fontSize: 22, fontWeight: 700,
                    border: key === '⌫' ? '1.5px solid #fecaca' : '1.5px solid #e5e7eb',
                    background: key === '⌫' ? '#fee2e2' : '#f9fafb',
                    color: key === '⌫' ? '#dc2626' : '#111827',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseDown={e => e.currentTarget.style.background = key === '⌫' ? '#fecaca' : '#e5e7eb'}
                  onMouseUp={e => e.currentTarget.style.background = key === '⌫' ? '#fee2e2' : '#f9fafb'}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Clear + Confirm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 12 }}>
              <button onClick={() => setNumpadValue('')}
                style={{
                  padding: '14px 0', borderRadius: 12, border: '1.5px solid #e5e7eb',
                  background: '#f3f4f6', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                }}>
                Clear
              </button>
              <button onClick={() => {
                  setAmountReceived(numpadValue || '0');
                  setShowNumpad(false);
                }}
                style={{
                  padding: '14px 0', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(22,163,74,0.4)',
                }}>
                Confirm ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff', borderRadius: 12, width: 420,
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            {/* Receipt preview */}
            <div style={{ padding: '28px 28px 16px', fontFamily: 'monospace' }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, fontFamily: 'sans-serif' }}>{businessName}</h2>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: '#6b7280' }}>Official Receipt</p>
              </div>

              <div style={{ borderTop: '1px dashed #d1d5db', margin: '10px 0' }} />

              {/* Order Info */}
              <div style={{ fontSize: 12, marginBottom: 10 }}>
                {[
                  ['Receipt #', receiptData.orderNumber],
                  ['Date', receiptData.date.toLocaleDateString('en-GB')],
                  ['Time', receiptData.date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })],
                  ['Customer', receiptData.customerName || 'Walk-in'],
                  ['Payment', receiptData.paymentMethod],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#6b7280' }}>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #d1d5db', margin: '10px 0' }} />

              {/* Items */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', fontSize: 10, color: '#6b7280', marginBottom: 5, fontWeight: 600 }}>
                  <span style={{ flex: 3 }}>ITEM</span>
                  <span style={{ textAlign: 'center', flex: 1 }}>QTY</span>
                  <span style={{ textAlign: 'right', flex: 1 }}>PRICE</span>
                  <span style={{ textAlign: 'right', flex: 1 }}>TOTAL</span>
                </div>
                {receiptData.items.map((item, idx) => (
                  <div key={idx} style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.product_name}</div>
                    <div style={{ display: 'flex', fontSize: 11 }}>
                      <span style={{ flex: 3 }} />
                      <span style={{ textAlign: 'center', flex: 1 }}>{item.quantity} {item.unit || ''}</span>
                      <span style={{ textAlign: 'right', flex: 1 }}>${item.unit_price.toFixed(2)}</span>
                      <span style={{ textAlign: 'right', flex: 1 }}>${item.total_price.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #d1d5db', margin: '10px 0' }} />

              {/* Totals */}
              <div style={{ fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#6b7280' }}>Subtotal</span>
                  <span>${receiptData.subtotal.toFixed(2)}</span>
                </div>
                {receiptData.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#dc2626' }}>Discount</span>
                    <span style={{ color: '#dc2626' }}>-${receiptData.discount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, paddingTop: 5, borderTop: '1px solid #e5e7eb', fontWeight: 700, fontSize: 14 }}>
                  <span>TOTAL</span>
                  <span>${receiptData.total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: '#6b7280' }}>Amount Received</span>
                  <span>${receiptData.amountReceived.toFixed(2)}</span>
                </div>
                {receiptData.amountReceived >= receiptData.total ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#16a34a' }}>
                    <span>Change</span>
                    <span>${receiptData.change.toFixed(2)}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#dc2626' }}>
                    <span>Balance Due</span>
                    <span>${(receiptData.total - receiptData.amountReceived).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed #d1d5db', margin: '14px 0 10px' }} />

              <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280' }}>
                <p style={{ margin: 0 }}>Thank you for your purchase!</p>
                <p style={{ margin: '2px 0 0' }}>Please come again.</p>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, padding: '0 28px 24px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowReceipt(false)}
                style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                Close
              </button>
              <button onClick={() => printThermalReceipt(receiptData, businessName)}
                style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                🖨 Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default POS;
