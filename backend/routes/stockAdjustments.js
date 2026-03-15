const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// GET all adjustments
router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT sa.*, p.name AS product_name, p.unit,
             u.first_name || ' ' || u.last_name AS created_by_name
      FROM stock_adjustments sa
      LEFT JOIN products p ON sa.product_sync_id = p.sync_id
      LEFT JOIN users u ON sa.created_by = u.id
      WHERE sa.deleted_at IS NULL AND sa.tenant_id = ?
      ORDER BY sa.created_at DESC
    `).all(req.user.tenantId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET stats
router.get('/stats', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM stock_adjustments WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const increases = db.prepare("SELECT COUNT(*) AS cnt FROM stock_adjustments WHERE deleted_at IS NULL AND tenant_id = ? AND adjustment_type = 'increase'").get(tenantId);
    const decreases = db.prepare("SELECT COUNT(*) AS cnt FROM stock_adjustments WHERE deleted_at IS NULL AND tenant_id = ? AND adjustment_type = 'decrease'").get(tenantId);
    const thisMonth = db.prepare(
      "SELECT COUNT(*) AS cnt FROM stock_adjustments WHERE deleted_at IS NULL AND tenant_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
    ).get(tenantId);
    res.json({
      total: total.cnt,
      increases: increases.cnt,
      decreases: decreases.cnt,
      thisMonth: thisMonth.cnt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create adjustment
router.post('/', auth, (req, res) => {
  try {
    const { product_id, adjustment_type, quantity, reason, notes, date } = req.body;

    if (!product_id || !adjustment_type || !quantity) {
      return res.status(400).json({ error: 'product_id, adjustment_type, and quantity are required.' });
    }

    const result = db.transaction(() => {
      const adjNum = syncConfig.generateNumber('ADJ', 'stock_adjustments');
      const adjDate = date || new Date().toISOString().split('T')[0];
      const qty = parseFloat(quantity);
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();

      const adjSyncId = randomUUID();
      const adjProdLookup = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(product_id);
      const adjProductSyncId = adjProdLookup?.sync_id || null;
      const info = db.prepare(
        `INSERT INTO stock_adjustments (adjustment_number, date, product_id, product_sync_id, adjustment_type, quantity, reason, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
      ).run(adjNum, adjDate, product_id, adjProductSyncId, adjustment_type, qty, reason || null, notes || null, req.user.id,
            adjSyncId, tenantId, branchId, deviceId);

      const stockDelta = adjustment_type === 'increase' ? qty : -qty;
      db.prepare(
        `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
         VALUES (?, ?, 'store', 'adjustment', ?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'), ?)`
      ).run(product_id, adjProductSyncId, stockDelta, info.lastInsertRowid, reason || null, req.user.id,
            randomUUID(), tenantId, branchId, deviceId, adjSyncId);

      db.prepare(
        "UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now'), synced=0 WHERE id = ?"
      ).run(stockDelta, product_id);

      return db.prepare('SELECT * FROM stock_adjustments WHERE id = ?').get(info.lastInsertRowid);
    })();

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
