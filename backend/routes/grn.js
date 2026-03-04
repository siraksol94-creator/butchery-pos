const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// FIFO payment-status SQL (SQLite version — uses CASE instead of GREATEST/LEAST)
// Soft-deleted GRNs and suppliers are excluded in the CTEs
const FIFO_SQL = (extraWhere = '', params = []) => ({
  text: `
    WITH supplier_paid AS (
      SELECT s.id AS supplier_id,
             COALESCE(SUM(pv.amount), 0) AS total_paid
      FROM   suppliers s
      LEFT JOIN payment_vouchers pv
             ON pv.paid_to = s.name
            AND pv.category = 'Supplier'
            AND pv.deleted_at IS NULL
      WHERE s.deleted_at IS NULL
      GROUP BY s.id
    ),
    grn_cumulative AS (
      SELECT g.*,
             SUM(g.total_amount) OVER (
               PARTITION BY g.supplier_id
               ORDER BY g.date ASC, g.id ASC
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ) AS cumulative_amount
      FROM grn g
      WHERE g.deleted_at IS NULL
    ),
    grn_with_avail AS (
      SELECT
        gc.*,
        s.name                        AS supplier_name,
        COALESCE(sp.total_paid, 0)    AS supplier_total_paid,
        COALESCE(sp.total_paid, 0) - (gc.cumulative_amount - gc.total_amount) AS available_for_grn
      FROM grn_cumulative gc
      LEFT JOIN suppliers     s  ON s.id           = gc.supplier_id
      LEFT JOIN supplier_paid sp ON sp.supplier_id = gc.supplier_id
    )
    SELECT
      gwa.*,
      CASE
        WHEN gwa.available_for_grn <= 0             THEN 0
        WHEN gwa.available_for_grn >= gwa.total_amount THEN gwa.total_amount
        ELSE gwa.available_for_grn
      END AS amount_paid_on_grn,
      gwa.total_amount - CASE
        WHEN gwa.available_for_grn <= 0             THEN 0
        WHEN gwa.available_for_grn >= gwa.total_amount THEN gwa.total_amount
        ELSE gwa.available_for_grn
      END AS balance_on_grn,
      CASE
        WHEN gwa.supplier_total_paid >= gwa.cumulative_amount                          THEN 'Paid'
        WHEN gwa.supplier_total_paid >  gwa.cumulative_amount - gwa.total_amount       THEN 'Partially Paid'
        ELSE 'Not Paid'
      END AS payment_status
    FROM grn_with_avail gwa
    ${extraWhere}
    ORDER BY gwa.date DESC, gwa.id DESC
  `,
  values: params,
});

// Get all GRNs
router.get('/', (req, res) => {
  try {
    const q = FIFO_SQL();
    const rows = db.prepare(q.text).all(...q.values);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GRN stats
router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM grn WHERE deleted_at IS NULL').get();
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM grn WHERE deleted_at IS NULL AND date >= date('now', 'start of month')").get();
    const suppliers = db.prepare('SELECT COUNT(DISTINCT supplier_id) AS cnt FROM grn WHERE deleted_at IS NULL').get();
    const unpaid = db.prepare(`
      WITH supplier_paid AS (
        SELECT s.id AS supplier_id, COALESCE(SUM(pv.amount), 0) AS total_paid
        FROM suppliers s
        LEFT JOIN payment_vouchers pv ON pv.paid_to = s.name AND pv.category = 'Supplier' AND pv.deleted_at IS NULL
        WHERE s.deleted_at IS NULL
        GROUP BY s.id
      ),
      grn_cumulative AS (
        SELECT g.*,
               SUM(g.total_amount) OVER (
                 PARTITION BY g.supplier_id
                 ORDER BY g.date ASC, g.id ASC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS cumulative_amount
        FROM grn g
        WHERE g.deleted_at IS NULL
      )
      SELECT COUNT(*) AS cnt
      FROM grn_cumulative gc
      LEFT JOIN supplier_paid sp ON sp.supplier_id = gc.supplier_id
      WHERE COALESCE(sp.total_paid, 0) < gc.cumulative_amount
    `).get();

    res.json({
      totalGRNs: total.cnt,
      thisMonth: thisMonth.cnt,
      suppliers: suppliers.cnt,
      pending: unpaid.cnt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create GRN
router.post('/', auth, (req, res) => {
  try {
    const { supplier_id, items, notes, date } = req.body;
    const grn = db.transaction(() => {
      const grnNum = syncConfig.generateNumber('GRN', 'grn');
      const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
      const grnDate = date || new Date().toISOString().split('T')[0];
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();

      const info = db.prepare(
        `INSERT INTO grn (grn_number, date, supplier_id, total_items, total_amount, notes, created_by, status, sync_id, tenant_id, branch_id, device_id, synced)
         VALUES (?,?,?,?,?,?,?,'Completed',?,?,?,?,0)`
      ).run(grnNum, grnDate, supplier_id, items.length, totalAmount, notes, req.user.id,
            randomUUID(), tenantId, branchId, deviceId);
      const grnId = info.lastInsertRowid;

      for (const item of items) {
        db.prepare(
          'INSERT INTO grn_items (grn_id, product_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)'
        ).run(grnId, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
        ).run(item.product_id, 'store', 'grn', item.quantity, grnId, 'grn', req.user.id,
              randomUUID(), tenantId, branchId, deviceId);
      }

      return db.prepare('SELECT * FROM grn WHERE id = ?').get(grnId);
    })();
    res.status(201).json(grn);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Product Received Report
router.get('/product-report', (req, res) => {
  try {
    const { from, to, product_id } = req.query;
    const params = [];
    const conditions = ['g.deleted_at IS NULL'];

    if (from) { params.push(from); conditions.push('g.date >= ?'); }
    if (to)   { params.push(to);   conditions.push('g.date <= ?'); }
    if (product_id) { params.push(parseInt(product_id)); conditions.push('gi.product_id = ?'); }

    const where = 'WHERE ' + conditions.join(' AND ');

    const rows = db.prepare(`
      SELECT
        p.id                      AS product_id,
        p.name                    AS product_name,
        p.unit,
        SUM(gi.quantity)          AS total_quantity,
        COUNT(DISTINCT gi.grn_id) AS grn_count,
        SUM(gi.total_price)       AS total_cost,
        MIN(g.date)               AS first_received,
        MAX(g.date)               AS last_received
      FROM grn_items gi
      JOIN grn      g  ON gi.grn_id     = g.id
      JOIN products p  ON gi.product_id = p.id
      ${where}
      GROUP BY p.id, p.name, p.unit
      ORDER BY p.name
    `).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update GRN
router.put('/:id', auth, (req, res) => {
  try {
    const { supplier_id, date, notes, items } = req.body;
    const id = parseInt(req.params.id);
    const validItems = (items || []).filter(i => i.product_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) return res.status(400).json({ error: 'At least one valid item is required.' });

    const totalAmount = validItems.reduce((s, i) => s + parseFloat(i.quantity) * parseFloat(i.unit_price), 0);
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();

    db.transaction(() => {
      db.prepare("UPDATE grn SET supplier_id=?, date=?, notes=?, total_items=?, total_amount=?, updated_at=datetime('now'), synced=0 WHERE id=?").run(
        supplier_id, date, notes, validItems.length, totalAmount, id
      );

      const oldItems = db.prepare('SELECT * FROM grn_items WHERE grn_id=?').all(id);
      for (const old of oldItems) {
        db.prepare("DELETE FROM stock_movements WHERE reference_id=? AND reference_type='grn' AND product_id=?").run(id, old.product_id);
      }
      db.prepare('DELETE FROM grn_items WHERE grn_id=?').run(id);

      for (const item of validItems) {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price);
        db.prepare('INSERT INTO grn_items (grn_id, product_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)').run(
          id, item.product_id, qty, price, qty * price, randomUUID(), tenantId, branchId, deviceId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,'store','grn',?,?,?,?,?,?,?,?,0)`).run(
          item.product_id, qty, id, 'grn', req.user.id, randomUUID(), tenantId, branchId, deviceId
        );
      }
    })();

    const q = FIFO_SQL('WHERE gwa.id = ?', [id]);
    const updated = db.prepare(q.text).get(...q.values);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get GRN by ID
router.get('/:id', (req, res) => {
  try {
    const q = FIFO_SQL('WHERE gwa.id = ?', [req.params.id]);
    const grn = db.prepare(q.text).get(...q.values);
    const items = db.prepare(
      `SELECT gi.*, p.name AS product_name
       FROM grn_items gi
       LEFT JOIN products p ON gi.product_id = p.id
       WHERE gi.grn_id = ?`
    ).all(req.params.id);
    res.json({ ...grn, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete GRN (soft-delete parent; hard-delete sub-records to reverse stock)
router.delete('/:id', auth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = db.transaction(() => {
      const grn = db.prepare('SELECT * FROM grn WHERE id = ? AND deleted_at IS NULL').get(id);
      if (!grn) throw Object.assign(new Error('GRN not found.'), { status: 404 });

      const itemsRows = db.prepare(`
        SELECT
          gi.product_id,
          gi.quantity                       AS grn_qty,
          p.name                            AS product_name,
          p.unit,
          COALESCE(sm_agg.current_stock, 0) AS current_stock
        FROM grn_items gi
        JOIN products p ON p.id = gi.product_id
        LEFT JOIN (
          SELECT product_id, SUM(quantity) AS current_stock
          FROM stock_movements WHERE location = 'store'
          GROUP BY product_id
        ) sm_agg ON sm_agg.product_id = gi.product_id
        WHERE gi.grn_id = ?
      `).all(id);

      const violations = itemsRows.filter(r => parseFloat(r.current_stock) - parseFloat(r.grn_qty) < 0);
      if (violations.length > 0) {
        throw Object.assign(new Error('Cannot delete: store stock would go negative.'), {
          status: 400,
          violations: violations.map(v => ({
            product_name: v.product_name, unit: v.unit,
            grn_qty: parseFloat(v.grn_qty), current_stock: parseFloat(v.current_stock),
            shortfall: parseFloat(v.grn_qty) - parseFloat(v.current_stock),
          })),
        });
      }

      db.prepare("DELETE FROM stock_movements WHERE reference_id = ? AND reference_type = 'grn'").run(id);
      db.prepare('DELETE FROM grn_items WHERE grn_id = ?').run(id);
      db.prepare("UPDATE grn SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(id);
      return null;
    })();

    res.json({ message: 'GRN deleted successfully.' });
  } catch (error) {
    if (error.violations) {
      return res.status(error.status || 400).json({ error: error.message, violations: error.violations });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
