const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const { type, search } = req.query;
    let query = 'SELECT * FROM customers WHERE deleted_at IS NULL';
    const params = [];
    if (type && type !== 'All Types') {
      params.push(type);
      query += ` AND type = ?`;
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      query += ` AND (name LIKE ? OR phone LIKE ?)`;
    }
    query += ' ORDER BY name';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL').get();
    const retail = db.prepare("SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL AND type = 'Retail'").get();
    const wholesale = db.prepare("SELECT COUNT(*) AS cnt FROM customers WHERE deleted_at IS NULL AND type = 'Wholesale'").get();
    const revenue = db.prepare('SELECT COALESCE(SUM(total_purchases),0) AS total FROM customers WHERE deleted_at IS NULL').get();
    res.json({
      totalCustomers: total.cnt,
      retail: retail.cnt,
      wholesale: wholesale.cnt,
      totalRevenue: parseFloat(revenue.total)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { name, type, phone, email, address } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      "INSERT INTO customers (name, type, phone, email, address, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
    ).run(name, type || 'Regular', phone, email, address, randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { name, type, phone, email, address } = req.body;
    db.prepare(
      "UPDATE customers SET name=?, type=?, phone=?, email=?, address=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(name, type, phone, email, address, req.params.id);
    const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    db.prepare("UPDATE customers SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
