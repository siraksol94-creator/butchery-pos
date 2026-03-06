const router = require('express').Router();
const db = require('../config/database');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, color } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      "INSERT INTO categories (name, color, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
    ).run(name, color, randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, color } = req.body;
    const info = db.prepare(
      "UPDATE categories SET name=?, color=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(name, color, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Category not found' });
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(req.params.id);
      db.prepare("UPDATE categories SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    })();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
