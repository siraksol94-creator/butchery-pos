const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

router.get('/', auth, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, first_name, last_name, email, phone, address, role FROM users WHERE id = ?'
    ).get(req.user.id);
    const business = db.prepare('SELECT * FROM business_settings LIMIT 1').get() || {};
    res.json({ user, business });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/profile', auth, (req, res) => {
  try {
    const { firstName, lastName, email, phone, address } = req.body;
    db.prepare(
      "UPDATE users SET first_name=?, last_name=?, email=?, phone=?, address=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(firstName, lastName, email, phone, address, req.user.id);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/business', auth, (req, res) => {
  try {
    const { business_name, business_phone, business_email, business_address, tax_rate } = req.body;
    const existing = db.prepare('SELECT * FROM business_settings LIMIT 1').get();
    let row;
    if (existing) {
      db.prepare(
        `UPDATE business_settings SET business_name=?, business_phone=?, business_email=?,
         business_address=?, tax_rate=?, updated_at=datetime('now'), synced=0 WHERE id=?`
      ).run(business_name, business_phone, business_email, business_address, tax_rate, existing.id);
      row = db.prepare('SELECT * FROM business_settings WHERE id = ?').get(existing.id);
    } else {
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      const info = db.prepare(
        'INSERT INTO business_settings (business_name, business_phone, business_email, business_address, tax_rate, sync_id, tenant_id, branch_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,?,0)'
      ).run(business_name, business_phone, business_email, business_address, tax_rate,
            randomUUID(), tenantId, branchId, deviceId);
      row = db.prepare('SELECT * FROM business_settings WHERE id = ?').get(info.lastInsertRowid);
    }
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
