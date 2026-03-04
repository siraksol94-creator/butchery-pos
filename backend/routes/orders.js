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
      const info = db.prepare(
        `INSERT INTO orders (order_number, customer_name, subtotal, tax_amount, total_amount, discount, amount_received, change_amount, payment_method, created_by, sync_id, tenant_id, branch_id, device_id, synced)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
      ).run(orderNum, customer_name, subtotal, tax_amount, total_amount, discount || 0, amount_received || 0, change_amount || 0, payment_method || 'Cash', req.user.id,
            randomUUID(), tenantId, branchId, deviceId);

      const orderId = info.lastInsertRowid;

      for (const item of items) {
        db.prepare(
          `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,0)`
        ).run(orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.total_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
        ).run(item.product_id, 'sales', 'sale', -item.quantity, orderId, 'order', req.user.id,
              randomUUID(), tenantId, branchId, deviceId);
      }

      return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    })();

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order details
router.get('/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL').all(req.params.id);
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
      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND reversed = 0 AND deleted_at IS NULL').all(req.params.id);
      for (const item of items) {
        db.prepare(
          `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
        ).run(item.product_id, 'sales', 'reverse', item.quantity, parseInt(req.params.id), 'order', req.user.id,
              randomUUID(), tenantId, branchId, deviceId);
      }

      db.prepare("UPDATE order_items SET reversed = 1, reversed_at = datetime('now'), synced=0 WHERE order_id = ? AND reversed = 0 AND deleted_at IS NULL").run(req.params.id);
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

      const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ? AND deleted_at IS NULL').get(req.params.itemId, req.params.id);
      if (!item) throw Object.assign(new Error('Item not found in this order'), { status: 404 });
      if (item.reversed) throw Object.assign(new Error('Item already reversed'), { status: 400 });

      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      db.prepare(
        `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
      ).run(item.product_id, 'sales', 'reverse', item.quantity, parseInt(req.params.id), 'order', req.user.id,
            randomUUID(), tenantId, branchId, deviceId);

      db.prepare("UPDATE order_items SET reversed = 1, reversed_at = datetime('now'), synced=0 WHERE id = ?").run(req.params.itemId);

      const newSubtotal = Math.max(0, parseFloat(order.subtotal) - parseFloat(item.total_price));
      const newTotal = Math.max(0, parseFloat(order.total_amount) - parseFloat(item.total_price));

      const remaining = db.prepare('SELECT COUNT(*) AS cnt FROM order_items WHERE order_id = ? AND reversed = 0 AND deleted_at IS NULL').get(req.params.id);
      const allReversed = remaining.cnt === 0;

      db.prepare('UPDATE orders SET subtotal = ?, total_amount = ?, status = ?, synced=0 WHERE id = ?').run(
        newSubtotal, newTotal, allReversed ? 'Reversed' : 'Partial', req.params.id
      );

      const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      const allItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL').all(req.params.id);
      return { ...updatedOrder, items: allItems };
    })();

    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
