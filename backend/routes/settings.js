const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

// GET /api/settings/drawer-port — get configured cash drawer port
router.get('/drawer-port', (req, res) => {
  try {
    const row = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    res.json({ port: row?.value || 'USB005' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings/drawer-port — save cash drawer port
router.put('/drawer-port', auth, (req, res) => {
  try {
    const { port } = req.body;
    if (!port || !port.trim()) return res.status(400).json({ error: 'Port is required.' });
    const existing = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    if (existing) {
      db.prepare("UPDATE sync_config SET value = ? WHERE key = 'drawer_port'").run(port.trim());
    } else {
      db.prepare("INSERT INTO sync_config (key, value) VALUES ('drawer_port', ?)").run(port.trim());
    }
    res.json({ port: port.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings/open-drawer — send ESC/POS drawer kick
router.post('/open-drawer', (req, res) => {
  try {
    const portRow = db.prepare("SELECT value FROM sync_config WHERE key = 'drawer_port'").get();
    const port = portRow?.value || 'USB005';
    const DRAWER_KICK = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    const tmpFile = path.join(os.tmpdir(), 'butchery_dk.bin');
    fs.writeFileSync(tmpFile, DRAWER_KICK);
    exec(`copy /b "${tmpFile}" ${port}:`, (err) => {
      if (err) return res.status(500).json({ error: 'Failed to open drawer: ' + err.message });
      res.json({ success: true });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
