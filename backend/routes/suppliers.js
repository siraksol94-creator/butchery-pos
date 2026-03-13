const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT s.*,
        COALESCE(g.total_purchases, 0) AS total_purchases,
        COALESCE(a.total_paid, 0) AS total_paid,
        COALESCE(g.total_purchases, 0) - COALESCE(a.total_paid, 0) AS outstanding
      FROM suppliers s
      LEFT JOIN (
        SELECT supplier_sync_id, SUM(total_amount) AS total_purchases
        FROM grn WHERE deleted_at IS NULL GROUP BY supplier_sync_id
      ) g ON s.sync_id = g.supplier_sync_id
      LEFT JOIN (
        SELECT supplier_id, SUM(amount) AS total_paid
        FROM ap_payments WHERE deleted_at IS NULL GROUP BY supplier_id
      ) a ON s.id = a.supplier_id
      WHERE s.deleted_at IS NULL ORDER BY s.name
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM suppliers WHERE deleted_at IS NULL').get();
    const active = db.prepare("SELECT COUNT(*) AS cnt FROM suppliers WHERE deleted_at IS NULL AND status = 'Active'").get();
    const outstanding = db.prepare(`
      SELECT COALESCE(SUM(COALESCE(g.total_purchases,0) - COALESCE(a.total_paid,0)), 0) AS total
      FROM suppliers s
      LEFT JOIN (SELECT supplier_sync_id, SUM(total_amount) AS total_purchases FROM grn WHERE deleted_at IS NULL GROUP BY supplier_sync_id) g ON s.sync_id = g.supplier_sync_id
      LEFT JOIN (SELECT supplier_id, SUM(amount) AS total_paid FROM ap_payments WHERE deleted_at IS NULL GROUP BY supplier_id) a ON s.id = a.supplier_id
      WHERE s.deleted_at IS NULL
    `).get();
    res.json({
      totalSuppliers: total.cnt,
      activeAccounts: active.cnt,
      outstanding: parseFloat(outstanding.total)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, (req, res) => {
  try {
    const { name, type, phone, email, address, contact_person } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      "INSERT INTO suppliers (name, type, phone, email, address, contact_person, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
    ).run(name, type, phone, email, address, contact_person, randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { name, type, phone, email, address, contact_person } = req.body;
    db.prepare(
      "UPDATE suppliers SET name=?, type=?, phone=?, email=?, address=?, contact_person=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(name, type, phone, email, address, contact_person, req.params.id);
    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, (req, res) => {
  try {
    db.prepare("UPDATE suppliers SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'Supplier deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
