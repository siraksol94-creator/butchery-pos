const router = require('express').Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password, licenseKey } = req.body;
    let tenantId, webAccess = false;

    if (licenseKey) {
      const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(licenseKey.trim().toUpperCase());
      if (!license)           return res.status(403).json({ error: 'Invalid license key.' });
      if (!license.is_active) return res.status(403).json({ error: 'License deactivated.' });
      if (license.expires_at < new Date().toISOString()) return res.status(403).json({ error: 'License expired.' });
      if (!license.tenant_id) return res.status(403).json({ error: 'License not yet activated. Set up the desktop app first.' });
      tenantId = license.tenant_id;
      webAccess = true;
    } else {
      tenantId = syncConfig.getConfig().tenantId || 'local-only';
    }

    const user = tenantId && tenantId !== 'local-only'
      ? db.prepare('SELECT * FROM users WHERE email = ? AND tenant_id = ? AND deleted_at IS NULL').get(email, tenantId)
      : db.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(email);

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    db.prepare("UPDATE users SET last_login = datetime('now'), synced=0 WHERE id = ?").run(user.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: `${user.first_name} ${user.last_name}`, tenantId, webAccess },
      process.env.JWT_SECRET || 'butchery-pro-secret-key-2026',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        address: user.address,
        permissions: JSON.parse(user.permissions || '[]')
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Account status — no auth required (used by App.js to check if any users exist)
router.get('/account-status', (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL').get();
    res.json({ hasUsers: userCount.cnt > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// First-time registration — no auth required, only works if no users exist
router.post('/register-first', async (req, res) => {
  try {
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL').get();
    if (userCount.cnt > 0) return res.status(403).json({ error: 'Account already exists. Please log in.' });
    const { firstName, lastName, email, password, phone } = req.body;
    if (!firstName || !lastName || !email || !password)
      return res.status(400).json({ error: 'First name, last name, email and password are required.' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const { deviceId, tenantId } = syncConfig.getConfig();
    const info = db.prepare(
      'INSERT INTO users (first_name, last_name, email, password, phone, role, sync_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,0)'
    ).run(firstName, lastName, email, hashedPassword, phone || '', 'Administrator', randomUUID(), deviceId);
    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, name: `${newUser.first_name} ${newUser.last_name}`, tenantId: tenantId || 'local-only', webAccess: false },
      process.env.JWT_SECRET || 'butchery-pro-secret-key-2026',
      { expiresIn: '24h' }
    );
    res.status(201).json({
      token,
      user: { id: newUser.id, firstName: newUser.first_name, lastName: newUser.last_name, email: newUser.email, role: newUser.role, phone: newUser.phone, permissions: [] }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const { deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      'INSERT INTO users (first_name, last_name, email, password, phone, role, sync_id, device_id, synced) VALUES (?,?,?,?,?,?,?,?,0)'
    ).run(firstName, lastName, email, hashedPassword, phone, role || 'Cashier', randomUUID(), deviceId);
    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
