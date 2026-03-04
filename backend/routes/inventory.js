const router = require('express').Router();
const db = require('../config/database');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Shared balance query (no params needed)
const balanceSQL = `
  SELECT
    p.id, p.code, p.name, p.unit, p.cost_price, p.selling_price, p.min_stock, p.status, p.image_url,
    p.ub_number_start, p.ub_number_length, p.ub_quantity_start, p.ub_quantity_length, p.ub_decimal_start,
    c.name AS category_name, c.color AS category_color,
    COALESCE(store_agg.store_balance, 0) AS store_balance,
    COALESCE(sales_agg.sales_balance, 0) AS sales_balance,
    COALESCE(opening_agg.opening_balance, 0) AS opening_balance,
    COALESCE(grn_agg.total_in, 0) AS total_in,
    COALESCE(siv_agg.total_out, 0) AS total_out
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS store_balance
    FROM stock_movements WHERE location = 'store' GROUP BY product_id
  ) store_agg ON store_agg.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS sales_balance
    FROM stock_movements WHERE location = 'sales' GROUP BY product_id
  ) sales_agg ON sales_agg.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS opening_balance
    FROM stock_movements WHERE location = 'store' AND movement_type = 'opening' GROUP BY product_id
  ) opening_agg ON opening_agg.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS total_in
    FROM stock_movements WHERE location = 'store' AND movement_type = 'grn' GROUP BY product_id
  ) grn_agg ON grn_agg.product_id = p.id
  LEFT JOIN (
    SELECT product_id, ABS(SUM(quantity)) AS total_out
    FROM stock_movements WHERE location = 'store' AND movement_type = 'siv' GROUP BY product_id
  ) siv_agg ON siv_agg.product_id = p.id
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
        p.id, p.code, p.name, p.unit, p.cost_price, p.selling_price, p.min_stock, p.status,
        c.name AS category_name, c.color AS category_color,
        COALESCE(store_agg.store_balance, 0) AS store_balance,
        COALESCE(opening_agg.opening_balance, 0) AS opening_balance,
        COALESCE(grn_agg.total_in, 0) AS total_in,
        COALESCE(siv_agg.total_out, 0) AS total_out,
        CASE WHEN COALESCE(grn_cost.total_qty, 0) > 0
          THEN ROUND(COALESCE(grn_cost.total_cost, 0) / grn_cost.total_qty, 2)
          ELSE p.cost_price
        END AS avg_cost_price
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS store_balance
        FROM stock_movements WHERE location = 'store' GROUP BY product_id
      ) store_agg ON store_agg.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS opening_balance
        FROM stock_movements WHERE location = 'store' AND movement_type = 'opening' GROUP BY product_id
      ) opening_agg ON opening_agg.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_in
        FROM stock_movements WHERE location = 'store' AND movement_type = 'grn' GROUP BY product_id
      ) grn_agg ON grn_agg.product_id = p.id
      LEFT JOIN (
        SELECT product_id, ABS(SUM(quantity)) AS total_out
        FROM stock_movements WHERE location = 'store' AND movement_type = 'siv' GROUP BY product_id
      ) siv_agg ON siv_agg.product_id = p.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_cost
        FROM grn_items GROUP BY product_id
      ) grn_cost ON grn_cost.product_id = p.id
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
      LEFT JOIN categories c ON p.category_id = c.id

      LEFT JOIN daily_actual_balance prev_actual
        ON prev_actual.product_id = p.id AND prev_actual.date = date(@date, '-1 day')

      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS opening_balance
        FROM stock_movements WHERE location = 'sales' AND created_at < @date
        GROUP BY product_id
      ) opening_agg ON opening_agg.product_id = p.id

      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS input
        FROM stock_movements WHERE location = 'sales' AND movement_type = 'siv'
          AND created_at >= @date AND created_at < date(@date, '+1 day')
        GROUP BY product_id
      ) input_agg ON input_agg.product_id = p.id

      LEFT JOIN (
        SELECT product_id, ABS(SUM(quantity)) AS total_sales
        FROM stock_movements WHERE location = 'sales' AND movement_type = 'sale'
          AND created_at >= @date AND created_at < date(@date, '+1 day')
        GROUP BY product_id
      ) sales_day_agg ON sales_day_agg.product_id = p.id

      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS sales_balance
        FROM stock_movements WHERE location = 'sales'
          AND created_at < date(@date, '+1 day')
        GROUP BY product_id
      ) all_sales_agg ON all_sales_agg.product_id = p.id

      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_cost
        FROM grn_items GROUP BY product_id
      ) grn_cost ON grn_cost.product_id = p.id

      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_qty, SUM(total_price) AS total_revenue
        FROM order_items GROUP BY product_id
      ) order_rev ON order_rev.product_id = p.id

      LEFT JOIN daily_actual_balance today_actual
        ON today_actual.product_id = p.id AND today_actual.date = @date

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

// POST /api/inventory/sales/actual — save actual balances for a date
router.post('/sales/actual', (req, res) => {
  try {
    const { date, entries, created_by } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    db.transaction(() => {
      for (const entry of entries) {
        db.prepare(`
          INSERT INTO daily_actual_balance (product_id, date, actual_balance, reason, created_by, sync_id, tenant_id, branch_id, device_id, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT (product_id, date)
          DO UPDATE SET actual_balance = excluded.actual_balance,
                        reason = excluded.reason,
                        created_by = excluded.created_by,
                        created_at = datetime('now'),
                        synced = 0
        `).run(entry.product_id, date, entry.actual_balance, entry.reason || null, created_by,
               randomUUID(), tenantId, branchId, deviceId);
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
    let obSql = `SELECT COALESCE(SUM(quantity), 0) AS opening_balance FROM stock_movements WHERE product_id = ? AND location = 'store'`;
    const obParams = [pid];
    if (from) { obSql += ' AND created_at < ?'; obParams.push(from); }
    const obRow = db.prepare(obSql).get(...obParams);
    const openingBalance = parseFloat(obRow.opening_balance);

    // Main bin-card query using named params
    const namedParams = { product_id: pid, opening_balance: openingBalance };
    let sql = `
      SELECT
        sm.id,
        date(sm.created_at)   AS date,
        sm.movement_type,
        sm.reference_type,
        COALESCE(g.grn_number, sv.siv_number, sm.movement_type) AS reference,
        sm.quantity,
        @opening_balance + SUM(sm.quantity) OVER (
          ORDER BY sm.created_at ASC, sm.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS balance
      FROM stock_movements sm
      LEFT JOIN grn g  ON g.id  = sm.reference_id AND sm.reference_type = 'grn'
      LEFT JOIN siv sv ON sv.id = sm.reference_id AND sm.reference_type = 'siv'
      WHERE sm.product_id = @product_id AND sm.location = 'store'
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
