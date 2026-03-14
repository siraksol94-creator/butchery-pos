const router = require('express').Router();
const db = require('../config/database');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Shared balance query (no params needed)
const balanceSQL = `
  SELECT
    p.id, p.code, p.name, p.unit, p.cost_price, p.selling_price, p.min_stock, p.status, p.image_url,
    p.product_type,
    p.ub_number_start, p.ub_number_length, p.ub_quantity_start, p.ub_quantity_length, p.ub_decimal_start,
    c.name AS category_name, c.color AS category_color,
    COALESCE(store_agg.store_balance, 0) AS store_balance,
    COALESCE(sales_agg.sales_balance, 0) AS sales_balance,
    COALESCE(opening_agg.opening_balance, 0) AS opening_balance,
    COALESCE(grn_agg.total_in, 0) AS total_in,
    COALESCE(prod_out_agg.total_prod_out, 0) AS total_prod_out,
    COALESCE(prod_in_agg.total_prod_in, 0) AS total_prod_in,
    COALESCE(siv_agg.total_out, 0) AS total_out
  FROM products p
  LEFT JOIN categories c ON p.category_sync_id = c.sync_id
  LEFT JOIN (
    SELECT product_sync_id, SUM(quantity) AS store_balance
    FROM stock_movements WHERE location = 'store' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) store_agg ON store_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, SUM(quantity) AS sales_balance
    FROM stock_movements WHERE location = 'sales' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) sales_agg ON sales_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, SUM(quantity) AS opening_balance
    FROM stock_movements WHERE location = 'store' AND movement_type = 'opening' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) opening_agg ON opening_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, SUM(quantity) AS total_in
    FROM stock_movements WHERE location = 'store' AND movement_type = 'grn' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) grn_agg ON grn_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, SUM(quantity) AS total_prod_out
    FROM stock_movements WHERE location = 'store' AND movement_type = 'production_output' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) prod_out_agg ON prod_out_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, ABS(SUM(quantity)) AS total_prod_in
    FROM stock_movements WHERE location = 'store' AND movement_type = 'production_input' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) prod_in_agg ON prod_in_agg.product_sync_id = p.sync_id
  LEFT JOIN (
    SELECT product_sync_id, ABS(SUM(quantity)) AS total_out
    FROM stock_movements WHERE location = 'store' AND movement_type = 'siv' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
  ) siv_agg ON siv_agg.product_sync_id = p.sync_id
  WHERE p.deleted_at IS NULL
  ORDER BY p.name
`;

// GET /api/inventory
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(balanceSQL).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/store
router.get('/store', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        p.id, p.code, p.name, p.unit, p.cost_price, p.selling_price, p.min_stock, p.status, p.product_type,
        c.name AS category_name, c.color AS category_color,
        COALESCE(store_agg.store_balance, 0) AS store_balance,
        COALESCE(opening_agg.opening_balance, 0) AS opening_balance,
        COALESCE(mvt_agg.total_in, 0) AS total_in,
        COALESCE(mvt_agg.total_out, 0) AS total_out,
        CASE WHEN COALESCE(grn_cost.total_qty, 0) > 0
          THEN ROUND(COALESCE(grn_cost.total_cost, 0) / grn_cost.total_qty, 2)
          ELSE p.cost_price
        END AS avg_cost_price,
        CASE WHEN COALESCE(reprocess_agg.available_for_reprocessing, 0) < 0
          THEN 0
          ELSE COALESCE(reprocess_agg.available_for_reprocessing, 0)
        END AS available_for_reprocessing
      FROM products p
      LEFT JOIN categories c ON p.category_sync_id = c.sync_id
      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS store_balance
        FROM stock_movements WHERE location = 'store' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) store_agg ON store_agg.product_sync_id = p.sync_id
      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS opening_balance
        FROM stock_movements WHERE location = 'store' AND movement_type = 'opening' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) opening_agg ON opening_agg.product_sync_id = p.sync_id
      LEFT JOIN (
        SELECT product_sync_id,
          SUM(CASE WHEN quantity > 0 AND movement_type != 'opening' THEN quantity ELSE 0 END) AS total_in,
          ABS(SUM(CASE WHEN quantity < 0 THEN quantity ELSE 0 END)) AS total_out
        FROM stock_movements WHERE location = 'store' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) mvt_agg ON mvt_agg.product_sync_id = p.sync_id
      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_cost
        FROM grn_items WHERE product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) grn_cost ON grn_cost.product_sync_id = p.sync_id
      LEFT JOIN (
        SELECT product_sync_id,
          SUM(CASE WHEN movement_type = 'sales_return' THEN quantity ELSE 0 END) +
          SUM(CASE WHEN movement_type = 'production_input' THEN quantity ELSE 0 END)
          AS available_for_reprocessing
        FROM stock_movements WHERE location = 'store' AND deleted_at IS NULL AND product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) reprocess_agg ON reprocess_agg.product_sync_id = p.sync_id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/sales
router.get('/sales', (req, res) => {
  try {
    const { date } = req.query;
    const selectedDate = date || new Date().toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT
        p.id, p.code, p.name, p.unit, p.cost_price, p.selling_price, p.min_stock, p.status,
        c.name AS category_name, c.color AS category_color,

        COALESCE(prev_actual.actual_balance,
          COALESCE(opening_agg.opening_balance, 0)
        ) AS opening_balance,

        COALESCE(input_agg.input, 0) AS input,
        COALESCE(sales_day_agg.total_sales, 0) AS total_sales,
        COALESCE(returns_day_agg.total_returns, 0) AS total_returns,
        COALESCE(all_sales_agg.sales_balance, 0) AS sales_balance,

        CASE WHEN COALESCE(grn_cost.total_qty, 0) > 0
          THEN ROUND(COALESCE(grn_cost.total_cost, 0) / grn_cost.total_qty, 2)
          ELSE p.cost_price
        END AS avg_cost_price,

        CASE WHEN COALESCE(order_rev.total_qty, 0) > 0
          THEN ROUND(COALESCE(order_rev.total_revenue, 0) / order_rev.total_qty, 2)
          ELSE p.selling_price
        END AS avg_selling_price,

        COALESCE(today_actual.actual_balance, NULL) AS saved_actual_balance,
        today_actual.reason AS saved_reason

      FROM products p
      LEFT JOIN categories c ON p.category_sync_id = c.sync_id

      LEFT JOIN daily_actual_balance prev_actual
        ON prev_actual.product_sync_id = p.sync_id AND prev_actual.date = date(@date, '-1 day')

      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS opening_balance
        FROM stock_movements WHERE location = 'sales' AND created_at < @date AND product_sync_id IS NOT NULL
        GROUP BY product_sync_id
      ) opening_agg ON opening_agg.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT sm.product_sync_id, SUM(sm.quantity) AS input
        FROM stock_movements sm
        JOIN siv s ON s.sync_id = sm.reference_sync_id
        WHERE sm.location = 'sales' AND sm.movement_type = 'siv'
          AND s.date = @date AND sm.deleted_at IS NULL AND sm.product_sync_id IS NOT NULL
        GROUP BY sm.product_sync_id
      ) input_agg ON input_agg.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT product_sync_id, ABS(SUM(quantity)) AS total_sales
        FROM stock_movements WHERE location = 'sales' AND movement_type IN ('sale', 'reverse')
          AND created_at >= @date AND created_at < date(@date, '+1 day') AND product_sync_id IS NOT NULL
        GROUP BY product_sync_id
      ) sales_day_agg ON sales_day_agg.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT product_sync_id, ABS(SUM(quantity)) AS total_returns
        FROM stock_movements WHERE location = 'sales' AND movement_type = 'sales_return'
          AND created_at >= @date AND created_at < date(@date, '+1 day') AND deleted_at IS NULL AND product_sync_id IS NOT NULL
        GROUP BY product_sync_id
      ) returns_day_agg ON returns_day_agg.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS sales_balance
        FROM stock_movements WHERE location = 'sales'
          AND created_at < date(@date, '+1 day') AND product_sync_id IS NOT NULL
        GROUP BY product_sync_id
      ) all_sales_agg ON all_sales_agg.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_cost
        FROM grn_items WHERE product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) grn_cost ON grn_cost.product_sync_id = p.sync_id

      LEFT JOIN (
        SELECT product_sync_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_revenue
        FROM order_items WHERE product_sync_id IS NOT NULL GROUP BY product_sync_id
      ) order_rev ON order_rev.product_sync_id = p.sync_id

      LEFT JOIN daily_actual_balance today_actual
        ON today_actual.product_sync_id = p.sync_id AND today_actual.date = @date

      WHERE p.deleted_at IS NULL AND (
        COALESCE(all_sales_agg.sales_balance, 0) != 0
        OR COALESCE(input_agg.input, 0) != 0
        OR COALESCE(sales_day_agg.total_sales, 0) != 0
        OR COALESCE(prev_actual.actual_balance, 0) != 0
        OR today_actual.actual_balance IS NOT NULL
      )

      ORDER BY p.name
    `).all({ date: selectedDate });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/sales/siv-breakdown?date=&product_id=
router.get('/sales/siv-breakdown', (req, res) => {
  try {
    const { date, product_id } = req.query;
    const rows = db.prepare(`
      SELECT s.siv_number, s.department, sm.quantity, sm.created_at
      FROM stock_movements sm
      JOIN siv s ON s.sync_id = sm.reference_sync_id
      WHERE sm.location = 'sales' AND sm.movement_type = 'siv'
        AND sm.product_sync_id = (SELECT sync_id FROM products WHERE id = ?) AND s.date = ? AND sm.deleted_at IS NULL
      ORDER BY sm.created_at ASC
    `).all(product_id, date);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/inventory/sales/actual — save actual balances for a date
router.post('/sales/actual', (req, res) => {
  try {
    const { date, entries, created_by } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    db.transaction(() => {
      for (const entry of entries) {
        const entryProd = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(entry.product_id);
        const entryProductSyncId = entryProd?.sync_id || null;

        // Save actual balance record
        db.prepare(`
          INSERT INTO daily_actual_balance (product_id, product_sync_id, date, actual_balance, reason, created_by, sync_id, tenant_id, branch_id, device_id, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT (product_sync_id, date)
          DO UPDATE SET actual_balance = excluded.actual_balance,
                        reason = excluded.reason,
                        created_by = excluded.created_by,
                        created_at = datetime('now'),
                        synced = 0
        `).run(entry.product_id, entryProductSyncId, date, entry.actual_balance, entry.reason || null, created_by,
               randomUUID(), tenantId, branchId, deviceId);

        // Create reconciliation movement so POS "In Stock" reflects the actual balance
        const currentSales = db.prepare(
          `SELECT COALESCE(SUM(quantity), 0) AS bal FROM stock_movements WHERE product_sync_id = ? AND location = 'sales' AND deleted_at IS NULL`
        ).get(entryProductSyncId);
        const diff = parseFloat(entry.actual_balance) - parseFloat(currentSales.bal);
        if (Math.abs(diff) > 0.0001) {
          // Remove any previous reconciliation for this product+date to avoid stacking
          db.prepare(
            `UPDATE stock_movements SET deleted_at = datetime('now'), synced = 0 WHERE product_sync_id = ? AND location = 'sales' AND movement_type = 'reconciliation' AND date(created_at) = ? AND deleted_at IS NULL`
          ).run(entryProductSyncId, date);
          db.prepare(`
            INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
            VALUES (?, ?, 'sales', 'reconciliation', ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
          `).run(entry.product_id, entryProductSyncId, diff, `Reconciliation: actual balance set to ${entry.actual_balance}`, created_by,
                 randomUUID(), tenantId, branchId, deviceId);
        }
      }
    })();
    res.json({ message: 'Actual balances saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/stats
router.get('/stats', (req, res) => {
  try {
    const products = db.prepare(balanceSQL).all();
    const totalProducts = products.length;
    const storeValue = products.reduce((sum, p) => sum + parseFloat(p.store_balance) * parseFloat(p.selling_price || 0), 0);
    const salesValue = products.reduce((sum, p) => sum + parseFloat(p.sales_balance) * parseFloat(p.selling_price || 0), 0);
    const lowStockSales = products.filter(p => parseFloat(p.sales_balance) <= parseFloat(p.min_stock || 0)).length;
    const lowStockStore = products.filter(p => parseFloat(p.store_balance) <= parseFloat(p.min_stock || 0)).length;
    res.json({ totalProducts, storeValue, salesValue, lowStockSales, lowStockStore });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/inventory/bin-card
router.get('/bin-card', (req, res) => {
  try {
    const { product_id, from, to } = req.query;
    if (!product_id) return res.status(400).json({ error: 'product_id is required.' });
    const pid = parseInt(product_id);

    // Opening balance: sum of ALL store movements BEFORE the `from` date
    const pidSyncRow = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(pid);
    const pidSync = pidSyncRow?.sync_id;

    let obSql = `SELECT COALESCE(SUM(quantity), 0) AS opening_balance FROM stock_movements WHERE product_sync_id = ? AND location = 'store'`;
    const obParams = [pidSync];
    if (from) { obSql += ' AND created_at < ?'; obParams.push(from); }
    obSql += ' AND deleted_at IS NULL';
    const obRow = db.prepare(obSql).get(...obParams);
    const openingBalance = parseFloat(obRow.opening_balance);

    // Main bin-card query using named params
    const namedParams = { product_sync_id: pidSync, opening_balance: openingBalance };
    let sql = `
      SELECT
        sm.id,
        date(sm.created_at)   AS date,
        sm.movement_type,
        sm.reference_type,
        COALESCE(g.grn_number, sv.siv_number, pr.production_number, sm.movement_type) AS reference,
        sm.quantity,
        @opening_balance + SUM(sm.quantity) OVER (
          ORDER BY sm.created_at ASC, sm.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS balance
      FROM stock_movements sm
      LEFT JOIN grn g        ON g.sync_id  = sm.reference_sync_id AND sm.reference_type = 'grn'
      LEFT JOIN siv sv       ON sv.sync_id = sm.reference_sync_id AND sm.reference_type = 'siv'
      LEFT JOIN production pr ON pr.sync_id = sm.reference_sync_id AND sm.reference_type = 'production'
      WHERE sm.product_sync_id = @product_sync_id AND sm.location = 'store' AND sm.deleted_at IS NULL
    `;
    if (from) { sql += ' AND sm.created_at >= @from'; namedParams.from = from; }
    if (to)   { sql += " AND sm.created_at < date(@to, '+1 day')"; namedParams.to = to; }
    sql += ' ORDER BY sm.created_at ASC, sm.id ASC';

    const rows = db.prepare(sql).all(namedParams);
    res.json({ rows, opening_balance: openingBalance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
