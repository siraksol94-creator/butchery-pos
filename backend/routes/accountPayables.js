const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');

// Supplier ledger — derived from GRN (owed) and Payment Vouchers (paid)
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.name AS supplier_name,
        s.phone,
        COALESCE(grn_totals.total_amount, 0) AS total_purchases,
        COALESCE(grn_totals.grn_count, 0)    AS grn_count,
        grn_totals.last_grn_date,
        COALESCE(pv_totals.total_paid, 0)    AS total_paid,
        COALESCE(pv_totals.pv_count, 0)      AS pv_count,
        COALESCE(grn_totals.total_amount, 0) - COALESCE(pv_totals.total_paid, 0) AS balance,
        CASE
          WHEN COALESCE(grn_totals.total_amount, 0) = 0                                                      THEN 'No Purchases'
          WHEN COALESCE(grn_totals.total_amount, 0) - COALESCE(pv_totals.total_paid, 0) <= 0               THEN 'Paid'
          WHEN COALESCE(pv_totals.total_paid, 0) > 0                                                        THEN 'Partial'
          ELSE 'Unpaid'
        END AS status
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id,
          SUM(total_amount) AS total_amount,
          COUNT(*) AS grn_count,
          MAX(date) AS last_grn_date
        FROM grn
        WHERE deleted_at IS NULL
        GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT paid_to,
          SUM(amount) AS total_paid,
          COUNT(*) AS pv_count
        FROM payment_vouchers
        WHERE category = 'Supplier' AND deleted_at IS NULL
        GROUP BY paid_to
      ) pv_totals ON s.name = pv_totals.paid_to
      WHERE s.status = 'Active' AND s.deleted_at IS NULL
      ORDER BY balance DESC
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats derived from supplier ledger
router.get('/stats', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(grn_totals.total_amount), 0) AS total_purchases,
        COALESCE(SUM(pv_totals.total_paid), 0)    AS total_paid,
        COALESCE(SUM(grn_totals.total_amount), 0) - COALESCE(SUM(pv_totals.total_paid), 0) AS outstanding
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_amount
        FROM grn WHERE deleted_at IS NULL GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT paid_to, SUM(amount) AS total_paid
        FROM payment_vouchers WHERE category = 'Supplier' AND deleted_at IS NULL
        GROUP BY paid_to
      ) pv_totals ON s.name = pv_totals.paid_to
      WHERE s.status = 'Active' AND s.deleted_at IS NULL
    `).get();

    const supplierCount = db.prepare("SELECT COUNT(*) AS cnt FROM suppliers WHERE status = 'Active' AND deleted_at IS NULL").get();
    const unpaid = db.prepare(`
      SELECT COUNT(*) AS cnt FROM suppliers s
      INNER JOIN (
        SELECT supplier_id, SUM(total_amount) AS total_amount
        FROM grn WHERE deleted_at IS NULL GROUP BY supplier_id
      ) grn_totals ON s.id = grn_totals.supplier_id
      LEFT JOIN (
        SELECT paid_to, SUM(amount) AS total_paid
        FROM payment_vouchers WHERE category = 'Supplier' AND deleted_at IS NULL
        GROUP BY paid_to
      ) pv_totals ON s.name = pv_totals.paid_to
      WHERE s.status = 'Active' AND s.deleted_at IS NULL
        AND grn_totals.total_amount - COALESCE(pv_totals.total_paid, 0) > 0
    `).get();

    res.json({
      totalPurchases: parseFloat(row.total_purchases),
      totalPaid: parseFloat(row.total_paid),
      outstanding: parseFloat(row.outstanding),
      suppliers: supplierCount.cnt,
      unpaidCount: unpaid.cnt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
