const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Get all orders
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM orders WHERE deleted_at IS NULL ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order (POS checkout)
router.post('/', auth, (req, res) => {
  try {
    const { customer_name, items, payment_method, subtotal, tax_amount, total_amount, discount, amount_received, change_amount } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const orderNum = syncConfig.generateNumber('ORD', 'orders');

    const order = db.transaction(() => {
      const orderSyncId = randomUUID();
      const info = db.prepare(
        `INSERT INTO orders (order_number, customer_name, subtotal, tax_amount, total_amount, discount, amount_received, change_amount, payment_method, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
      ).run(orderNum, customer_name, subtotal, tax_amount, total_amount, discount || 0, amount_received || 0, change_amount || 0, payment_method || 'Cash', req.user.id,
            orderSyncId, tenantId, branchId, deviceId);

      const orderId = info.lastInsertRowid;

      for (const item of items) {
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare(
          `INSERT INTO order_items (order_id, order_sync_id, product_id, product_sync_id, product_name, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
        ).run(orderId, orderSyncId, item.product_id, productSyncId, item.product_name, item.quantity, item.unit_price, item.total_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`
        ).run(item.product_id, productSyncId, 'sales', 'sale', -item.quantity, orderId, 'order', req.user.id,
              randomUUID(), tenantId, branchId, deviceId, orderSyncId);
      }

      return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    })();

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/product-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns total qty sold and revenue per product for active (non-reversed) orders
router.get('/product-summary', (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `
      SELECT
        oi.product_name,
        SUM(oi.quantity) AS total_qty,
        ROUND(SUM(oi.total_price) / SUM(oi.quantity), 2) AS avg_price,
        SUM(oi.total_price) AS total_revenue
      FROM order_items oi
      INNER JOIN orders o ON o.sync_id = oi.order_sync_id
      WHERE o.deleted_at IS NULL
        AND (o.status IS NULL OR o.status != 'Reversed')
        AND oi.deleted_at IS NULL
        AND (oi.reversed IS NULL OR oi.reversed = 0)
    `;
    const params = [];
    if (from) { sql += ' AND DATE(o.created_at) >= ?'; params.push(from); }
    if (to)   { sql += ' AND DATE(o.created_at) <= ?'; params.push(to); }
    sql += ' GROUP BY oi.product_name ORDER BY total_revenue DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order details
router.get('/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    const items = db.prepare('SELECT * FROM order_items WHERE order_sync_id = ? AND deleted_at IS NULL').all(order?.sync_id);
    res.json({ ...order, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reverse order - void the order and restore stock
router.put('/:id/reverse', auth, (req, res) => {
  try {
    const result = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.status === 'Reversed') throw Object.assign(new Error('Order already reversed'), { status: 400 });

      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      const items = db.prepare('SELECT * FROM order_items WHERE order_sync_id = ? AND reversed = 0 AND deleted_at IS NULL').all(order.sync_id);
      for (const item of items) {
        db.prepare(
          `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`
        ).run(item.product_id, item.product_sync_id, 'sales', 'reverse', item.quantity, parseInt(req.params.id), 'order', req.user.id,
              randomUUID(), tenantId, branchId, deviceId, order.sync_id);
      }

      db.prepare("UPDATE order_items SET reversed = 1, reversed_at = datetime('now'), synced=0 WHERE order_sync_id = ? AND reversed = 0 AND deleted_at IS NULL").run(order.sync_id);
      db.prepare("UPDATE orders SET status = 'Reversed', synced=0 WHERE id = ?").run(req.params.id);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    })();

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Reverse a single item
router.put('/:id/items/:itemId/reverse', auth, (req, res) => {
  try {
    const result = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.status === 'Reversed') throw Object.assign(new Error('Order already fully reversed'), { status: 400 });

      const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_sync_id = ? AND deleted_at IS NULL').get(req.params.itemId, order.sync_id);
      if (!item) throw Object.assign(new Error('Item not found in this order'), { status: 404 });
      if (item.reversed) throw Object.assign(new Error('Item already reversed'), { status: 400 });

      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      db.prepare(
        `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, reference_sync_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`
      ).run(item.product_id, item.product_sync_id, 'sales', 'reverse', item.quantity, parseInt(req.params.id), 'order', req.user.id,
            randomUUID(), tenantId, branchId, deviceId, order.sync_id);

      db.prepare("UPDATE order_items SET reversed = 1, reversed_at = datetime('now'), synced=0 WHERE id = ?").run(req.params.itemId);

      const newSubtotal = Math.max(0, parseFloat(order.subtotal) - parseFloat(item.total_price));
      const newTotal = Math.max(0, parseFloat(order.total_amount) - parseFloat(item.total_price));

      const remaining = db.prepare('SELECT COUNT(*) AS cnt FROM order_items WHERE order_sync_id = ? AND reversed = 0 AND deleted_at IS NULL').get(order.sync_id);
      const allReversed = remaining.cnt === 0;

      db.prepare('UPDATE orders SET subtotal = ?, total_amount = ?, status = ?, synced=0 WHERE id = ?').run(
        newSubtotal, newTotal, allReversed ? 'Reversed' : 'Partial', req.params.id
      );

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      const allItems = db.prepare('SELECT * FROM order_items WHERE order_sync_id = ? AND deleted_at IS NULL').all(order.sync_id);
      return { ...updatedOrder, items: allItems };
    })();

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
