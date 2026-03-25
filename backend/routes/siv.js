const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM siv WHERE deleted_at IS NULL AND tenant_id = ? ORDER BY created_at DESC').all(req.user.tenantId);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL AND tenant_id = ? AND date >= date('now', 'start of month')").get(tenantId);
    const totalValue = db.prepare('SELECT COALESCE(SUM(total_value), 0) AS total FROM siv WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const pending = db.prepare("SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL AND tenant_id = ? AND status = 'Pending'").get(tenantId);
    res.json({
      totalSIVs: total.cnt,
      thisMonth: thisMonth.cnt,
      totalValue: parseFloat(totalValue.total),
      pending: pending.cnt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { department, items, notes, date } = req.body;
    const siv = db.transaction(() => {
      const sivNum = syncConfig.generateNumber('SIV', 'siv');
      const sivDate = date || new Date().toISOString().split('T')[0];
      const totalValue = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();

      const sivSyncId = randomUUID();
      const info = db.prepare(
        `INSERT INTO siv (siv_number, date, department, total_items, total_value, notes, created_by, status, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,'Issued',?,?,?,?,0,datetime('now'),datetime('now'))`
      ).run(sivNum, sivDate, department, items.length, totalValue, notes, req.user.id,
            sivSyncId, tenantId, branchId, deviceId);
      const sivId = info.lastInsertRowid;

      for (const item of items) {
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare(
          "INSERT INTO siv_items (siv_id, siv_sync_id, product_id, product_sync_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
        ).run(sivId, sivSyncId, item.product_id, productSyncId, item.quantity, item.unit_price, item.quantity * item.unit_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`
        ).run(item.product_id, productSyncId, 'store', 'siv', -item.quantity, sivId, 'siv', req.user.id,
              randomUUID(), tenantId, branchId, deviceId, sivSyncId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`
        ).run(item.product_id, productSyncId, 'sales', 'siv', item.quantity, sivId, 'siv', req.user.id,
              randomUUID(), tenantId, branchId, deviceId, sivSyncId);
      }

      return db.prepare('SELECT * FROM siv WHERE id = ?').get(sivId);
    })();
    res.status(201).json(siv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/items-summary', auth, readOnlyGuard, (req, res) => {
  try {
    const { from, to } = req.query;
    let sql = `
      SELECT p.id AS product_id, p.name AS product_name, p.unit,
        SUM(si.quantity) AS total_quantity,
        SUM(si.total_price) AS total_value
      FROM siv_items si
      JOIN siv s ON s.sync_id = si.siv_sync_id
      JOIN products p ON p.sync_id = si.product_sync_id
      WHERE s.deleted_at IS NULL AND s.tenant_id = ?
    `;
    const params = [req.user.tenantId];
    if (from) { sql += ' AND s.date >= ?'; params.push(from); }
    if (to)   { sql += ' AND s.date <= ?'; params.push(to); }
    sql += ' GROUP BY p.sync_id, p.name, p.unit ORDER BY p.name ASC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/item-breakdown', auth, readOnlyGuard, (req, res) => {
  try {
    const { product_id, from, to } = req.query;
    if (!product_id) return res.status(400).json({ error: 'product_id is required' });
    let sql = `
      SELECT s.siv_number, s.date, s.created_at, si.quantity, si.unit_price, si.total_price
      FROM siv_items si
      JOIN siv s ON s.sync_id = si.siv_sync_id
      WHERE si.product_sync_id = (SELECT sync_id FROM products WHERE id = ?) AND s.deleted_at IS NULL AND s.tenant_id = ?
    `;
    const params = [product_id, req.user.tenantId];
    if (from) { sql += ' AND s.date >= ?'; params.push(from); }
    if (to)   { sql += ' AND s.date <= ?'; params.push(to); }
    sql += ' ORDER BY s.created_at DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', auth, readOnlyGuard, (req, res) => {
  try {
    const siv = db.prepare('SELECT * FROM siv WHERE id = ? AND deleted_at IS NULL AND tenant_id = ?').get(req.params.id, req.user.tenantId);
    const items = db.prepare(
      'SELECT si.*, p.name as product_name, p.unit FROM siv_items si LEFT JOIN products p ON si.product_sync_id = p.sync_id WHERE si.siv_sync_id = (SELECT sync_id FROM siv WHERE id = ? AND tenant_id = ?)'
    ).all(req.params.id, req.user.tenantId);
    res.json({ ...siv, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { department, date, notes, items } = req.body;
    const sivId = req.params.id;
    const sivDate = date || new Date().toISOString().split('T')[0];
    const totalValue = items.reduce((sum, item) => sum + item.quantity * (item.unit_price || 0), 0);
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();

    db.transaction(() => {
      db.prepare("UPDATE siv SET date=?, department=?, total_items=?, total_value=?, notes=?, updated_at=datetime('now'), synced=0 WHERE id=?").run(
        sivDate, department, items.length, totalValue, notes, sivId
      );
      const sivRecord = db.prepare('SELECT sync_id FROM siv WHERE id=?').get(sivId);
      const sivSyncId = sivRecord?.sync_id;

      db.prepare("UPDATE siv_items SET deleted_at=datetime('now'), synced=0 WHERE siv_sync_id=? AND deleted_at IS NULL").run(sivSyncId);
      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='siv' AND deleted_at IS NULL").run(sivSyncId);

      for (const item of items) {
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare("INSERT INTO siv_items (siv_id, siv_sync_id, product_id, product_sync_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))").run(
          sivId, sivSyncId, item.product_id, productSyncId, item.quantity, item.unit_price || 0, item.quantity * (item.unit_price || 0),
          randomUUID(), tenantId, branchId, deviceId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id) VALUES (?,?,'store','siv',?,?,'siv',?,?,?,?,?,0,datetime('now'),datetime('now'),?)`).run(
          item.product_id, productSyncId, -item.quantity, sivId, req.user.id, randomUUID(), tenantId, branchId, deviceId, sivSyncId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id) VALUES (?,?,'sales','siv',?,?,'siv',?,?,?,?,?,0,datetime('now'),datetime('now'),?)`).run(
          item.product_id, productSyncId, item.quantity, sivId, req.user.id, randomUUID(), tenantId, branchId, deviceId, sivSyncId
        );
      }
    })();

    const updated = db.prepare('SELECT * FROM siv WHERE id=?').get(sivId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    const siv = db.prepare('SELECT sync_id FROM siv WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!siv) return res.status(404).json({ error: 'SIV not found' });
    db.transaction(() => {
      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='siv' AND deleted_at IS NULL").run(siv.sync_id);
      db.prepare("UPDATE siv_items SET deleted_at=datetime('now'), synced=0 WHERE siv_sync_id=?").run(siv.sync_id);
      db.prepare("UPDATE siv SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    })();
    res.json({ message: 'SIV deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
