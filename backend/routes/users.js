const router = require('express').Router();
const db = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const bcrypt = require('bcrypt');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

const parsePerms = (u) => ({ ...u, permissions: JSON.parse(u.permissions || '[]') });

router.get('/', auth, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, first_name, last_name, email, role, permissions, status, phone, last_login, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC'
    ).all();
    res.json(rows.map(parsePerms));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', auth, (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM users WHERE deleted_at IS NULL').get();
    const active = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE deleted_at IS NULL AND status = 'Active'").get();
    const inactive = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE deleted_at IS NULL AND status = 'Inactive'").get();
    const admins = db.prepare("SELECT COUNT(*) AS cnt FROM users WHERE deleted_at IS NULL AND role = 'Administrator'").get();
    res.json({
      totalUsers: total.cnt,
      active: active.cnt,
      inactive: inactive.cnt,
      administrators: admins.cnt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, role, permissions } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      `INSERT INTO users (first_name, last_name, email, password, phone, role, permissions, sync_id, tenant_id, branch_id, device_id, synced)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
    ).run(firstName, lastName, email, hashedPassword, phone, role, JSON.stringify(permissions || []),
          randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare(
      'SELECT id, first_name, last_name, email, role, permissions, status FROM users WHERE id = ?'
    ).get(info.lastInsertRowid);
    res.status(201).json(parsePerms(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', auth, (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, permissions, status } = req.body;
    db.prepare(
      `UPDATE users SET first_name=?, last_name=?, email=?, phone=?, role=?, permissions=?, status=?, updated_at=datetime('now'), synced=0
       WHERE id=?`
    ).run(firstName, lastName, email, phone, role, JSON.stringify(permissions || []), status, req.params.id);
    const row = db.prepare(
      'SELECT id, first_name, last_name, email, role, permissions, status FROM users WHERE id = ?'
    ).get(req.params.id);
    res.json(parsePerms(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', auth, adminOnly, (req, res) => {
  try {
    db.prepare("UPDATE users SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
