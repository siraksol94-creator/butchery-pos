const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// GET /api/sales-returns
router.get('/', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT sr.*,
        (SELECT COUNT(*) FROM sales_return_items WHERE return_sync_id = sr.sync_id) AS item_count
      FROM sales_returns sr
      WHERE sr.deleted_at IS NULL
      ORDER BY sr.date DESC, sr.id DESC
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sales-returns/notes — distinct notes history for autocomplete
router.get('/notes', auth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT notes FROM sales_returns
      WHERE deleted_at IS NULL AND notes IS NOT NULL AND notes != ''
      ORDER BY id DESC LIMIT 50
    `).all();
    res.json(rows.map(r => r.notes));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sales-returns/stats
router.get('/stats', auth, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM sales_returns WHERE deleted_at IS NULL').get();
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM sales_returns WHERE deleted_at IS NULL AND date >= date('now', 'start of month')").get();
    res.json({ total: total.cnt, thisMonth: thisMonth.cnt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/sales-returns
router.post('/', auth, (req, res) => {
  try {
    const { date, notes, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'At least one item is required.' });
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const returnDate = date || new Date().toISOString().split('T')[0];

    const result = db.transaction(() => {
      const returnNum = syncConfig.generateNumber('SRT', 'sales_returns');
      const returnSyncId = randomUUID();
      const info = db.prepare(`
        INSERT INTO sales_returns (return_number, date, notes, total_items, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
      `).run(returnNum, returnDate, notes || null, items.length, req.user.id,
             returnSyncId, tenantId, branchId, deviceId);
      const returnId = info.lastInsertRowid;

      for (const item of items) {
        const qty = parseFloat(item.quantity);
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare(`
          INSERT INTO sales_return_items (return_id, return_sync_id, product_id, product_sync_id, quantity, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
        `).run(returnId, returnSyncId, item.product_id, productSyncId, qty, randomUUID(), tenantId, branchId, deviceId);

        // Remove from sales
        db.prepare(`
          INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)
        `).run(item.product_id, productSyncId, 'sales', 'sales_return', -qty, returnId, 'sales_return',
               notes || null, req.user.id, randomUUID(), tenantId, branchId, deviceId, returnSyncId);

        // Add to store
        db.prepare(`
          INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)
        `).run(item.product_id, productSyncId, 'store', 'sales_return', qty, returnId, 'sales_return',
               notes || null, req.user.id, randomUUID(), tenantId, branchId, deviceId, returnSyncId);
      }

      return db.prepare('SELECT * FROM sales_returns WHERE id = ?').get(returnId);
    })();

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/sales-returns/:id
router.get('/:id', auth, (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM sales_returns WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    const items = db.prepare(`
      SELECT sri.*, p.name AS product_name, p.unit
      FROM sales_return_items sri
      LEFT JOIN products p ON p.sync_id = sri.product_sync_id
      WHERE sri.return_sync_id = (SELECT sync_id FROM sales_returns WHERE id = ?)
    `).all(req.params.id);
    res.json({ ...entry, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/sales-returns/:id
router.delete('/:id', auth, (req, res) => {
  try {
    const ret = db.prepare('SELECT sync_id FROM sales_returns WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!ret) return res.status(404).json({ error: 'Sales return not found' });
    db.transaction(() => {
      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='sales_return' AND deleted_at IS NULL").run(ret.sync_id);
      db.prepare("UPDATE sales_returns SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    })();
    res.json({ message: 'Sales return deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
