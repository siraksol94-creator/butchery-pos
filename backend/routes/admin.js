const router  = require('express').Router();
const db      = require('../config/database');
const crypto  = require('crypto');
const path    = require('path');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin-change-me';
const TOKEN_SECRET   = process.env.JWT_SECRET      || 'dev-secret';

// ── Simple token helpers (no extra dependencies) ──────────────────────────────
function makeToken() {
  const payload = Buffer.from(JSON.stringify({ ts: Date.now() })).toString('base64');
  const sig     = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  if (sig !== expected) return false;
  const { ts } = JSON.parse(Buffer.from(payload, 'base64').toString());
  return Date.now() - ts < 24 * 60 * 60 * 1000; // 24h session
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!verifyToken(token)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── License key generator: BUTCH-XXXX-XXXX-XXXX ───────────────────────────────
function generateLicenseKey() {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `BUTCH-${seg()}-${seg()}-${seg()}`;
}

// ─── Serve admin HTML page ────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// ─── POST /admin/login ────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ token: makeToken() });
});

// ─── GET /admin/licenses ──────────────────────────────────────────────────────
router.get('/licenses', authMiddleware, (req, res) => {
  const licenses = db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM sync_config sc
       WHERE sc.key LIKE 'branch:' || l.tenant_id || ':%') AS branch_count
    FROM licenses l ORDER BY l.created_at DESC
  `).all();
  res.json(licenses);
});

// ─── POST /admin/licenses ─────────────────────────────────────────────────────
router.post('/licenses', authMiddleware, (req, res) => {
  try {
    const { expiresAt, maxBranches = 1, notes = '' } = req.body;
    if (!expiresAt) return res.status(400).json({ error: 'expiresAt is required' });

    let key;
    // Ensure unique key
    do { key = generateLicenseKey(); }
    while (db.prepare('SELECT id FROM licenses WHERE key = ?').get(key));

    db.prepare(
      'INSERT INTO licenses (key, max_branches, expires_at, notes) VALUES (?, ?, ?, ?)'
    ).run(key, Number(maxBranches), expiresAt, notes);

    res.json({ key });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PATCH /admin/licenses/:key ───────────────────────────────────────────────
router.patch('/licenses/:key', authMiddleware, (req, res) => {
  try {
    const { expiresAt, isActive, maxBranches, notes } = req.body;
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(req.params.key);
    if (!license) return res.status(404).json({ error: 'License not found' });

    db.prepare(`
      UPDATE licenses SET
        expires_at   = COALESCE(?, expires_at),
        is_active    = COALESCE(?, is_active),
        max_branches = COALESCE(?, max_branches),
        notes        = COALESCE(?, notes)
      WHERE key = ?
    `).run(
      expiresAt   ?? null,
      isActive    ?? null,
      maxBranches ?? null,
      notes       ?? null,
      req.params.key
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  const now = new Date().toISOString();
  const soon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const total    = db.prepare('SELECT COUNT(*) AS n FROM licenses').get().n;
  const active   = db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE is_active=1 AND expires_at > ?").get(now).n;
  const expired  = db.prepare("SELECT COUNT(*) AS n FROM licenses WHERE expires_at <= ?").get(now).n;
  const expiring = db.prepare(
    "SELECT COUNT(*) AS n FROM licenses WHERE is_active=1 AND expires_at > ? AND expires_at <= ?"
  ).get(now, soon).n;

  res.json({ total, active, expired, expiring });
});

module.exports = router;
