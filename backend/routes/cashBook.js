const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Get cash book — derived from CR + PV with opening balance
router.get('/', (req, res) => {
  try {
    const openingRow = db.prepare(
      "SELECT COALESCE(SUM(receipt_amount), 0) AS opening FROM cash_book WHERE type = 'opening' AND deleted_at IS NULL"
    ).get();
    const openingBalance = parseFloat(openingRow.opening);

    const entries = db.prepare(`
      SELECT date, 'CR' AS type, receipt_number AS reference,
        COALESCE(received_from, '') || ' - ' || COALESCE(description, '') AS description,
        amount AS receipt_amount, 0 AS payment_amount
      FROM cash_receipts
      WHERE deleted_at IS NULL
      UNION ALL
      SELECT date, 'PV' AS type, voucher_number AS reference,
        COALESCE(paid_to, '') || ' - ' || COALESCE(description, '') AS description,
        0 AS receipt_amount, amount AS payment_amount
      FROM payment_vouchers
      WHERE deleted_at IS NULL
      ORDER BY date ASC, reference ASC
    `).all();

    let balance = openingBalance;
    const rows = entries.map((e, i) => {
      balance = balance + parseFloat(e.receipt_amount) - parseFloat(e.payment_amount);
      return { ...e, id: i + 1, balance };
    });

    res.json({ openingBalance, entries: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats
router.get('/stats', (req, res) => {
  try {
    const openingRow = db.prepare(
      "SELECT COALESCE(SUM(receipt_amount), 0) AS opening FROM cash_book WHERE type = 'opening' AND deleted_at IS NULL"
    ).get();
    const receipts = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM cash_receipts WHERE deleted_at IS NULL').get();
    const payments = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM payment_vouchers WHERE deleted_at IS NULL').get();

    const opening = parseFloat(openingRow.opening);
    const totalReceipts = parseFloat(receipts.total);
    const totalPayments = parseFloat(payments.total);

    res.json({
      openingBalance: opening,
      totalReceipts,
      totalPayments,
      currentBalance: opening + totalReceipts - totalPayments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set opening balance
router.post('/opening-balance', auth, (req, res) => {
  try {
    const { amount } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    db.prepare("DELETE FROM cash_book WHERE type = 'opening'").run();
    const info = db.prepare(
      `INSERT INTO cash_book (date, description, reference, receipt_amount, payment_amount, balance, type, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
       VALUES (DATE('now'), 'Opening Balance', 'OB', ?, 0, ?, 'opening', ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`
    ).run(parseFloat(amount) || 0, parseFloat(amount) || 0, randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM cash_book WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
