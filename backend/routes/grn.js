const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// FIFO payment-status SQL (SQLite version — uses CASE instead of GREATEST/LEAST)
// Soft-deleted GRNs and suppliers are excluded in the CTEs
const FIFO_SQL = (extraWhere = '', params = [], tenantId = null) => ({
  text: `
    WITH supplier_paid AS (
      SELECT s.id AS supplier_id,
             COALESCE(SUM(ap.amount), 0) AS total_paid
      FROM   suppliers s
      LEFT JOIN ap_payments ap
             ON ap.supplier_id = s.id
            AND ap.deleted_at IS NULL
      WHERE s.deleted_at IS NULL${tenantId ? ' AND s.tenant_id = ?' : ''}
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
      WHERE g.deleted_at IS NULL${tenantId ? ' AND g.tenant_id = ?' : ''}
    ),
    grn_with_avail AS (
      SELECT
        gc.*,
        s.name                        AS supplier_name,
        COALESCE(sp.total_paid, 0)    AS supplier_total_paid,
        COALESCE(sp.total_paid, 0) - (gc.cumulative_amount - gc.total_amount) AS available_for_grn
      FROM grn_cumulative gc
      LEFT JOIN suppliers     s  ON s.sync_id       = gc.supplier_sync_id
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
  values: tenantId ? [tenantId, tenantId, ...params] : params,
});

// Get all GRNs
router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const q = FIFO_SQL('', [], req.user.tenantId);
    const rows = db.prepare(q.text).all(...q.values);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GRN stats
router.get('/stats', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM grn WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM grn WHERE deleted_at IS NULL AND tenant_id = ? AND date >= date('now', 'start of month')").get(tenantId);
    const suppliers = db.prepare('SELECT COUNT(DISTINCT supplier_sync_id) AS cnt FROM grn WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const unpaid = db.prepare(`
      WITH supplier_paid AS (
        SELECT s.id AS supplier_id, COALESCE(SUM(ap.amount), 0) AS total_paid
        FROM suppliers s
        LEFT JOIN ap_payments ap ON ap.supplier_id = s.id AND ap.deleted_at IS NULL
        WHERE s.deleted_at IS NULL AND s.tenant_id = ?
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
        WHERE g.deleted_at IS NULL AND g.tenant_id = ?
      )
      SELECT COUNT(*) AS cnt
      FROM grn_cumulative gc
      LEFT JOIN supplier_paid sp ON sp.supplier_id = gc.supplier_id
      WHERE COALESCE(sp.total_paid, 0) < gc.cumulative_amount
    `).get(tenantId, tenantId);

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

      const grnSyncId = randomUUID();
      const supplier = db.prepare('SELECT sync_id FROM suppliers WHERE id = ?').get(supplier_id);
      const supplierSyncId = supplier?.sync_id || null;
      const info = db.prepare(
        `INSERT INTO grn (grn_number, date, supplier_id, supplier_sync_id, total_items, total_amount, notes, created_by, status, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,'Completed',?,?,?,?,0,datetime('now'),datetime('now'))`
      ).run(grnNum, grnDate, supplier_id, supplierSyncId, items.length, totalAmount, notes, req.user.id,
            grnSyncId, tenantId, branchId, deviceId);
      const grnId = info.lastInsertRowid;

      for (const item of items) {
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare(
          "INSERT INTO grn_items (grn_id, grn_sync_id, product_id, product_sync_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
        ).run(grnId, grnSyncId, item.product_id, productSyncId, item.quantity, item.unit_price, item.quantity * item.unit_price,
              randomUUID(), tenantId, branchId, deviceId);
        db.prepare(
          `INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`
        ).run(item.product_id, productSyncId, 'store', 'grn', item.quantity, grnId, 'grn', req.user.id,
              randomUUID(), tenantId, branchId, deviceId, grnSyncId);
      }

      return db.prepare('SELECT * FROM grn WHERE id = ?').get(grnId);
    })();
    res.status(201).json(grn);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Product Received Report
router.get('/product-report', auth, readOnlyGuard, (req, res) => {
  try {
    const { from, to, product_id } = req.query;
    const params = [req.user.tenantId];
    const conditions = ['g.deleted_at IS NULL', 'g.tenant_id = ?'];

    if (from) { params.push(from); conditions.push('g.date >= ?'); }
    if (to)   { params.push(to);   conditions.push('g.date <= ?'); }
    if (product_id) { params.push(parseInt(product_id)); conditions.push('gi.product_sync_id = (SELECT sync_id FROM products WHERE id = ?)'); }

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
      JOIN grn      g  ON gi.grn_sync_id  = g.sync_id
      JOIN products p  ON gi.product_sync_id = p.sync_id
      ${where}
      GROUP BY p.sync_id, p.name, p.unit
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
      const updSupplier = db.prepare('SELECT sync_id FROM suppliers WHERE id = ?').get(supplier_id);
      const updSupplierSyncId = updSupplier?.sync_id || null;
      db.prepare("UPDATE grn SET supplier_id=?, supplier_sync_id=?, date=?, notes=?, total_items=?, total_amount=?, updated_at=datetime('now'), synced=0 WHERE id=?").run(
        supplier_id, updSupplierSyncId, date, notes, validItems.length, totalAmount, id
      );

      const grnRecord = db.prepare('SELECT sync_id FROM grn WHERE id=?').get(id);
      const grnSyncId = grnRecord?.sync_id;

      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='grn' AND deleted_at IS NULL").run(grnSyncId);
      db.prepare("UPDATE grn_items SET deleted_at=datetime('now'), synced=0 WHERE grn_sync_id=? AND deleted_at IS NULL").run(grnSyncId);

      for (const item of validItems) {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price);
        const prod = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(item.product_id);
        const productSyncId = prod?.sync_id || null;
        db.prepare("INSERT INTO grn_items (grn_id, grn_sync_id, product_id, product_sync_id, quantity, unit_price, total_price, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))").run(
          id, grnSyncId, item.product_id, productSyncId, qty, price, qty * price, randomUUID(), tenantId, branchId, deviceId
        );
        db.prepare(`INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id) VALUES (?,?,'store','grn',?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)`).run(
          item.product_id, productSyncId, qty, id, 'grn', req.user.id, randomUUID(), tenantId, branchId, deviceId, grnSyncId
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
router.get('/:id', auth, readOnlyGuard, (req, res) => {
  try {
    const q = FIFO_SQL('WHERE gwa.id = ?', [req.params.id], req.user.tenantId);
    const grn = db.prepare(q.text).get(...q.values);
    const items = db.prepare(
      `SELECT gi.*, p.name AS product_name
       FROM grn_items gi
       LEFT JOIN products p ON gi.product_sync_id = p.sync_id
       WHERE gi.grn_sync_id = (SELECT sync_id FROM grn WHERE id = ? AND tenant_id = ?)
         AND gi.deleted_at IS NULL`
    ).all(req.params.id, req.user.tenantId);
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
        JOIN products p ON p.sync_id = gi.product_sync_id
        LEFT JOIN (
          SELECT product_sync_id, SUM(quantity) AS current_stock
          FROM stock_movements WHERE location = 'store' AND deleted_at IS NULL
          GROUP BY product_sync_id
        ) sm_agg ON sm_agg.product_sync_id = gi.product_sync_id
        WHERE gi.grn_sync_id = ?
      `).all(grn.sync_id);

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

      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='grn' AND deleted_at IS NULL").run(grn.sync_id);
      db.prepare('DELETE FROM grn_items WHERE grn_sync_id = ?').run(grn.sync_id);
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
