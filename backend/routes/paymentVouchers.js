const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const { date, paid_from } = req.query;
    let q = 'SELECT * FROM payment_vouchers WHERE deleted_at IS NULL';
    const params = [];
    if (date)      { params.push(date);      q += ' AND date = ?'; }
    if (paid_from) { params.push(paid_from); q += ' AND paid_from = ?'; }
    q += ' ORDER BY date DESC';
    const rows = db.prepare(q).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const today = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payment_vouchers WHERE deleted_at IS NULL AND date = DATE('now')").get();
    const month = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payment_vouchers WHERE deleted_at IS NULL AND date >= date('now', 'start of month')").get();
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM payment_vouchers WHERE deleted_at IS NULL').get();
    const avg = db.prepare('SELECT COALESCE(AVG(amount),0) AS avg FROM payment_vouchers WHERE deleted_at IS NULL').get();
    res.json({
      todayPayments: parseFloat(today.total),
      thisMonth: parseFloat(month.total),
      totalVouchers: count.cnt,
      avgPayment: Math.round(parseFloat(avg.avg))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { paid_to, description, category, amount, date, paid_from } = req.body;
    const voucherNum = syncConfig.generateNumber('PV', 'payment_vouchers');
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      `INSERT INTO payment_vouchers (voucher_number, paid_to, description, category, amount, date, paid_from, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
    ).run(voucherNum, paid_to, description, category, amount,
          date || new Date().toISOString().split('T')[0],
          paid_from || 'Main cashier',
          req.user.id,
          randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM payment_vouchers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { paid_to, description, category, amount, date, paid_from } = req.body;
    const info = db.prepare(
      "UPDATE payment_vouchers SET paid_to=?, description=?, category=?, amount=?, date=?, paid_from=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(paid_to, description, category, amount,
          date || new Date().toISOString().split('T')[0],
          paid_from || 'Main cashier',
          req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Voucher not found' });
    const row = db.prepare('SELECT * FROM payment_vouchers WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
