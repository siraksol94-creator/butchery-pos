const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// GET /api/ap-payments
router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const { from, to, supplier_id } = req.query;
    let sql = `SELECT ap.*, s.name AS supplier_name_resolved
               FROM ap_payments ap
               LEFT JOIN suppliers s ON s.id = ap.supplier_id
               WHERE ap.deleted_at IS NULL AND ap.tenant_id = ?`;
    const params = [req.user.tenantId];
    if (from) { sql += ' AND ap.date >= ?'; params.push(from); }
    if (to)   { sql += ' AND ap.date <= ?'; params.push(to); }
    if (supplier_id) { sql += ' AND ap.supplier_id = ?'; params.push(parseInt(supplier_id)); }
    sql += ' ORDER BY ap.date DESC, ap.id DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/ap-payments
router.post('/', auth, (req, res) => {
  try {
    const { supplier_id, supplier_name, amount, description, date, paid_from } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount is required.' });
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const paymentNum = syncConfig.generateNumber('APR', 'ap_payments');
    const info = db.prepare(`
      INSERT INTO ap_payments (payment_number, supplier_id, supplier_name, amount, description, date, paid_from, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
    `).run(paymentNum, supplier_id || null, supplier_name || null, parseFloat(amount),
           description || null, date || new Date().toISOString().split('T')[0],
           paid_from || 'Main cashier', req.user.id,
           randomUUID(), tenantId, branchId, deviceId);
    res.status(201).json(db.prepare('SELECT * FROM ap_payments WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/ap-payments/:id
router.put('/:id', auth, (req, res) => {
  try {
    const { amount, date, description, paid_from } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount is required.' });
    db.prepare(`
      UPDATE ap_payments SET amount=?, date=?, description=?, paid_from=?, synced=0, updated_at=datetime('now')
      WHERE id=? AND deleted_at IS NULL
    `).run(parseFloat(amount), date, description || null, paid_from || null, req.params.id);
    res.json(db.prepare('SELECT * FROM ap_payments WHERE id=?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/ap-payments/:id
router.delete('/:id', auth, (req, res) => {
  try {
    db.prepare("UPDATE ap_payments SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'Payment deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
