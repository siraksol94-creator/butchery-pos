const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Get cash book — derived from CR + PV with opening balance
router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const openingRow = db.prepare(
      "SELECT COALESCE(SUM(receipt_amount), 0) AS opening FROM cash_book WHERE type = 'opening' AND deleted_at IS NULL AND tenant_id = ?"
    ).get(tenantId);
    const openingBalance = parseFloat(openingRow.opening);

    const { from, to } = req.query;
    const dateFilter = (from ? ' AND date >= ?' : '') + (to ? ' AND date <= ?' : '');
    const dParams = [...(from ? [from] : []), ...(to ? [to] : [])];

    const entries = db.prepare(`
      SELECT date, 'CR' AS type, receipt_number AS reference,
        COALESCE(received_from, '') || ' - ' || COALESCE(description, '') AS description,
        amount AS receipt_amount, 0 AS payment_amount
      FROM cash_receipts
      WHERE deleted_at IS NULL AND tenant_id = ?${dateFilter}
      UNION ALL
      SELECT date, 'PV' AS type, voucher_number AS reference,
        COALESCE(paid_to, '') || ' - ' || COALESCE(description, '') AS description,
        0 AS receipt_amount, amount AS payment_amount
      FROM payment_vouchers
      WHERE deleted_at IS NULL AND tenant_id = ?${dateFilter}
      UNION ALL
      SELECT date, 'AP' AS type, payment_number AS reference,
        COALESCE(supplier_name, '') || ' - ' || COALESCE(description, 'Supplier Payment') AS description,
        0 AS receipt_amount, amount AS payment_amount
      FROM ap_payments
      WHERE deleted_at IS NULL AND tenant_id = ?${dateFilter}
      ORDER BY date ASC, reference ASC
    `).all(tenantId, ...dParams, tenantId, ...dParams, tenantId, ...dParams);

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
router.get('/stats', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const openingRow = db.prepare(
      "SELECT COALESCE(SUM(receipt_amount), 0) AS opening FROM cash_book WHERE type = 'opening' AND deleted_at IS NULL AND tenant_id = ?"
    ).get(tenantId);

    const { from, to } = req.query;
    const df = (from ? ' AND date >= ?' : '') + (to ? ' AND date <= ?' : '');
    const dp = [...(from ? [from] : []), ...(to ? [to] : [])];

    const receipts = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM cash_receipts WHERE deleted_at IS NULL AND tenant_id = ?${df}`).get(tenantId, ...dp);
    const payments = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM payment_vouchers WHERE deleted_at IS NULL AND tenant_id = ?${df}`).get(tenantId, ...dp);
    const apPmts   = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM ap_payments WHERE deleted_at IS NULL AND tenant_id = ?${df}`).get(tenantId, ...dp);

    const opening = parseFloat(openingRow.opening);
    const totalReceipts = parseFloat(receipts.total);
    const totalPV = parseFloat(payments.total);
    const totalAP = parseFloat(apPmts.total);
    const totalPayments = totalPV + totalAP;

    res.json({
      openingBalance: opening,
      totalReceipts,
      totalPV,
      totalAP,
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
