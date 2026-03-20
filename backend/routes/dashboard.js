const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');

router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const todaySales = db.prepare(
      "SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE DATE(created_at) = DATE('now') AND (status IS NULL OR status != 'Reversed') AND tenant_id = ?"
    ).get(tenantId);
    const totalOrders = db.prepare("SELECT COUNT(*) AS cnt FROM orders WHERE (status IS NULL OR status != 'Reversed') AND tenant_id = ?").get(tenantId);
    const weeklyRevenue = db.prepare(
      "SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE created_at >= date('now', '-7 days') AND (status IS NULL OR status != 'Reversed') AND tenant_id = ?"
    ).get(tenantId);
    const totalCustomers = db.prepare('SELECT COUNT(*) AS cnt FROM customers WHERE tenant_id = ?').get(tenantId);
    const topProducts = db.prepare(
      `SELECT oi.product_name, SUM(oi.quantity) AS units_sold, SUM(oi.total_price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.sync_id = oi.order_sync_id
       WHERE o.tenant_id = ? AND (o.status IS NULL OR o.status != 'Reversed')
       GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 5`
    ).all(tenantId);
    const lowStock = db.prepare(
      `SELECT p.name, p.current_stock, p.unit, p.min_stock FROM products p
       WHERE p.current_stock <= p.min_stock AND p.tenant_id = ? ORDER BY p.current_stock ASC LIMIT 5`
    ).all(tenantId);
    const salesByCategory = db.prepare(
      `SELECT c.name AS category, COALESCE(SUM(oi.total_price),0) AS total
       FROM order_items oi
       JOIN orders o ON o.sync_id = oi.order_sync_id
       JOIN products p ON oi.product_sync_id = p.sync_id
       JOIN categories c ON p.category_sync_id = c.sync_id
       WHERE o.tenant_id = ? AND (o.status IS NULL OR o.status != 'Reversed')
       GROUP BY c.name ORDER BY total DESC`
    ).all(tenantId);
    const salesTrend = db.prepare(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(total_amount),0) AS total
       FROM orders WHERE created_at >= date('now', '-7 days') AND (status IS NULL OR status != 'Reversed') AND tenant_id = ?
       GROUP BY DATE(created_at) ORDER BY date`
    ).all(tenantId);

    res.json({
      todaySales: parseFloat(todaySales.total),
      totalOrders: totalOrders.cnt,
      weeklyRevenue: parseFloat(weeklyRevenue.total),
      totalCustomers: totalCustomers.cnt,
      topProducts,
      lowStock,
      salesByCategory,
      salesTrend
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
