const router = require('express').Router();
const db = require('../config/database');

router.get('/', (req, res) => {
  try {
    const todaySales = db.prepare(
      "SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE DATE(created_at) = DATE('now')"
    ).get();
    const totalOrders = db.prepare('SELECT COUNT(*) AS cnt FROM orders').get();
    const weeklyRevenue = db.prepare(
      "SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE created_at >= date('now', '-7 days')"
    ).get();
    const totalCustomers = db.prepare('SELECT COUNT(*) AS cnt FROM customers').get();
    const topProducts = db.prepare(
      `SELECT oi.product_name, SUM(oi.quantity) AS units_sold, SUM(oi.total_price) AS revenue
       FROM order_items oi GROUP BY oi.product_name ORDER BY revenue DESC LIMIT 5`
    ).all();
    const lowStock = db.prepare(
      `SELECT p.name, p.current_stock, p.unit, p.min_stock FROM products p
       WHERE p.current_stock <= p.min_stock ORDER BY p.current_stock ASC LIMIT 5`
    ).all();
    const salesByCategory = db.prepare(
      `SELECT c.name AS category, COALESCE(SUM(oi.total_price),0) AS total
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       JOIN categories c ON p.category_id = c.id
       GROUP BY c.name ORDER BY total DESC`
    ).all();
    const salesTrend = db.prepare(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(total_amount),0) AS total
       FROM orders WHERE created_at >= date('now', '-7 days')
       GROUP BY DATE(created_at) ORDER BY date`
    ).all();

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
