const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM cash_receipts WHERE deleted_at IS NULL ORDER BY date DESC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const today = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM cash_receipts WHERE deleted_at IS NULL AND date = DATE('now')").get();
    const month = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM cash_receipts WHERE deleted_at IS NULL AND date >= date('now', 'start of month')").get();
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM cash_receipts WHERE deleted_at IS NULL').get();
    const avg = db.prepare('SELECT COALESCE(AVG(amount),0) AS avg FROM cash_receipts WHERE deleted_at IS NULL').get();
    res.json({
      todayReceipts: parseFloat(today.total),
      thisMonth: parseFloat(month.total),
      totalReceipts: count.cnt,
      avgReceipt: Math.round(parseFloat(avg.avg))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if a Sales CR exists for a given date (must be before /:id)
router.get('/check-sales', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.json({ exists: false });
    const row = db.prepare(
      "SELECT id, receipt_number, amount FROM cash_receipts WHERE deleted_at IS NULL AND received_from = 'Sales' AND date = ?"
    ).get(date);
    if (row) {
      res.json({ exists: true, ...row });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { received_from, description, payment_method, amount, date } = req.body;
    const crDate = date || new Date().toISOString().split('T')[0];
    const receiptNum = syncConfig.generateNumber('CR', 'cash_receipts');
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      `INSERT INTO cash_receipts (receipt_number, received_from, description, payment_method, amount, date, created_by, sync_id, tenant_id, branch_id, device_id, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
    ).run(receiptNum, received_from, description, payment_method, amount, crDate, req.user.id,
          randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM cash_receipts WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { received_from, description, payment_method, amount, date } = req.body;
    const info = db.prepare(
      "UPDATE cash_receipts SET received_from=?, description=?, payment_method=?, amount=?, date=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(received_from, description, payment_method, amount, date, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Receipt not found' });
    const row = db.prepare('SELECT * FROM cash_receipts WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
