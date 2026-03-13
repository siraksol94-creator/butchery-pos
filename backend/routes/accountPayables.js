const router = require('express').Router();
const db = require('../config/database');

// Supplier ledger — derived from GRN (owed) and AP Payments (paid)
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        s.id,
        s.sync_id,
        s.name AS supplier_name,
        s.phone,
        COALESCE(grn_totals.total_amount, 0) AS total_purchases,
        COALESCE(grn_totals.grn_count, 0)    AS grn_count,
        grn_totals.last_grn_date,
        COALESCE(ap_totals.total_paid, 0)    AS total_paid,
        COALESCE(ap_totals.ap_count, 0)      AS pv_count,
        COALESCE(grn_totals.total_amount, 0) - COALESCE(ap_totals.total_paid, 0) AS balance,
        CASE
          WHEN COALESCE(grn_totals.total_amount, 0) = 0                                               THEN 'No Purchases'
          WHEN COALESCE(grn_totals.total_amount, 0) - COALESCE(ap_totals.total_paid, 0) <= 0         THEN 'Paid'
          WHEN COALESCE(ap_totals.total_paid, 0) > 0                                                  THEN 'Partial'
          ELSE 'Unpaid'
        END AS status
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_sync_id,
          SUM(total_amount) AS total_amount,
          COUNT(*) AS grn_count,
          MAX(date) AS last_grn_date
        FROM grn
        WHERE deleted_at IS NULL
        GROUP BY supplier_sync_id
      ) grn_totals ON s.sync_id = grn_totals.supplier_sync_id
      LEFT JOIN (
        SELECT supplier_id,
          SUM(amount) AS total_paid,
          COUNT(*) AS ap_count
        FROM ap_payments
        WHERE deleted_at IS NULL
        GROUP BY supplier_id
      ) ap_totals ON s.id = ap_totals.supplier_id
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
        COALESCE(SUM(ap_totals.total_paid), 0)    AS total_paid,
        COALESCE(SUM(grn_totals.total_amount), 0) - COALESCE(SUM(ap_totals.total_paid), 0) AS outstanding
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_sync_id, SUM(total_amount) AS total_amount
        FROM grn WHERE deleted_at IS NULL GROUP BY supplier_sync_id
      ) grn_totals ON s.sync_id = grn_totals.supplier_sync_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid
        FROM ap_payments WHERE deleted_at IS NULL
        GROUP BY supplier_id
      ) ap_totals ON s.id = ap_totals.supplier_id
      WHERE s.status = 'Active' AND s.deleted_at IS NULL
    `).get();

    const supplierCount = db.prepare("SELECT COUNT(*) AS cnt FROM suppliers WHERE status = 'Active' AND deleted_at IS NULL").get();
    const unpaid = db.prepare(`
      SELECT COUNT(*) AS cnt FROM suppliers s
      INNER JOIN (
        SELECT supplier_sync_id, SUM(total_amount) AS total_amount
        FROM grn WHERE deleted_at IS NULL GROUP BY supplier_sync_id
      ) grn_totals ON s.sync_id = grn_totals.supplier_sync_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid
        FROM ap_payments WHERE deleted_at IS NULL
        GROUP BY supplier_id
      ) ap_totals ON s.id = ap_totals.supplier_id
      WHERE s.status = 'Active' AND s.deleted_at IS NULL
        AND grn_totals.total_amount - COALESCE(ap_totals.total_paid, 0) > 0
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
