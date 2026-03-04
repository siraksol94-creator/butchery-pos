const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Get all cash reports
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT cr.*, u.first_name || ' ' || u.last_name AS created_by_name
       FROM cash_reports cr
       LEFT JOIN users u ON cr.created_by = u.id
       WHERE cr.deleted_at IS NULL
       ORDER BY cr.date DESC`
    ).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get report for a specific date (auto-populate from sales data)
router.get('/daily', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const cashSales = db.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM orders WHERE DATE(created_at) = ? AND deleted_at IS NULL AND (status IS NULL OR status != 'Reversed') AND payment_method = 'Cash'`
    ).get(date);

    const mobileSales = db.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM orders WHERE DATE(created_at) = ? AND deleted_at IS NULL AND (status IS NULL OR status != 'Reversed') AND payment_method IN ('Transfer', 'Mobile Money')`
    ).get(date);

    const pendingSales = db.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total
       FROM orders WHERE DATE(created_at) = ? AND deleted_at IS NULL AND (status IS NULL OR status != 'Reversed') AND payment_method NOT IN ('Cash', 'Transfer', 'Mobile Money')`
    ).get(date);

    const expenses = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_vouchers WHERE deleted_at IS NULL AND date = ? AND paid_from = 'Cash Drawer'`
    ).get(date);

    const totalRevenue = db.prepare(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE DATE(created_at) = ? AND deleted_at IS NULL AND (status IS NULL OR status != 'Reversed')`
    ).get(date);

    res.json({
      date,
      cash: parseFloat(cashSales.total),
      mobile_money: parseFloat(mobileSales.total),
      pending: parseFloat(pendingSales.total),
      expenses: parseFloat(expenses.total),
      total_revenue: parseFloat(totalRevenue.total)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create / save cash report
router.post('/', auth, (req, res) => {
  try {
    const { date, initial_change, mobile_money, cash, expenses, pending, total,
            after_change, expected, difference, status, comment } = req.body;

    const existing = db.prepare('SELECT id FROM cash_reports WHERE date = ? AND deleted_at IS NULL').get(date);
    let row;

    if (existing) {
      db.prepare(
        `UPDATE cash_reports SET
          initial_change=?, mobile_money=?, cash=?, expenses=?, pending=?, total=?,
          after_change=?, expected=?, difference=?, status=?, comment=?,
          updated_at=datetime('now'), synced=0
         WHERE date=? AND deleted_at IS NULL`
      ).run(initial_change, mobile_money, cash, expenses, pending, total,
             after_change, expected, difference, status, comment, date);
      row = db.prepare('SELECT * FROM cash_reports WHERE date = ?').get(date);
    } else {
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      const info = db.prepare(
        `INSERT INTO cash_reports (date, initial_change, mobile_money, cash, expenses, pending, total,
          after_change, expected, difference, status, comment, created_by, sync_id, tenant_id, branch_id, device_id, synced)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
      ).run(date, initial_change, mobile_money, cash, expenses, pending, total,
             after_change, expected, difference, status, comment, req.user.id,
             randomUUID(), tenantId, branchId, deviceId);
      row = db.prepare('SELECT * FROM cash_reports WHERE id = ?').get(info.lastInsertRowid);
    }

    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
