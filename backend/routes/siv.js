const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM siv WHERE deleted_at IS NULL ORDER BY date DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL').get();
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL AND date >= date('now', 'start of month')").get();
    const totalValue = db.prepare('SELECT COALESCE(SUM(total_value), 0) AS total FROM siv WHERE deleted_at IS NULL').get();
    const pending = db.prepare("SELECT COUNT(*) AS cnt FROM siv WHERE deleted_at IS NULL AND status = 'Pending'").get();
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

      const info = db.prepare(
        `INSERT INTO siv (siv_number, date, department, total_items, total_value, notes, created_by, status, sync_id, tenant_id, branch_id, device_id, synced)
         VALUES (?,?,?,?,?,?,?,'Issued',?,?,?,?,0)`
      ).run(sivNum, sivDate, department, items.length, totalValue, notes, req.user.id,
            randomUUID(), tenantId, branchId, deviceId);
      const sivId = info.lastInsertRowid;

      for (const item of items) {
        db.prepare(
          'INSERT INTO siv_items (siv_id, product_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)'
        ).run(sivId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
        ).run(item.product_id, 'store', 'siv', -item.quantity, sivId, 'siv', req.user.id,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
        ).run(item.product_id, 'sales', 'siv', item.quantity, sivId, 'siv', req.user.id,
              randomUUID(), tenantId, branchId, deviceId);
      }

      return db.prepare('SELECT * FROM siv WHERE id = ?').get(sivId);
    })();
    res.status(201).json(siv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const siv = db.prepare('SELECT * FROM siv WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    const items = db.prepare(
      'SELECT si.*, p.name as product_name, p.unit FROM siv_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.siv_id = ?'
    ).all(req.params.id);
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
      db.prepare('DELETE FROM siv_items WHERE siv_id=?').run(sivId);
      db.prepare("DELETE FROM stock_movements WHERE reference_id=? AND reference_type='siv'").run(sivId);

      for (const item of items) {
        db.prepare('INSERT INTO siv_items (siv_id, product_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)').run(
          sivId, item.product_id, item.quantity, item.unit_price || 0, item.quantity * (item.unit_price || 0),
          randomUUID(), tenantId, branchId, deviceId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,'store','siv',?,?,'siv',?,?,?,?,?,0)`).run(
          item.product_id, -item.quantity, sivId, req.user.id, randomUUID(), tenantId, branchId, deviceId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,'sales','siv',?,?,'siv',?,?,?,?,?,0)`).run(
          item.product_id, item.quantity, sivId, req.user.id, randomUUID(), tenantId, branchId, deviceId
        );
      }
    })();

    const updated = db.prepare('SELECT * FROM siv WHERE id=?').get(sivId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
