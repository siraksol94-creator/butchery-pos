/**
 * masterDb.js
 * Manages the master database that tracks all registered tenants.
 * Lives at MASTER_DB_PATH (default: /var/www/butchery-pos-tenant/master.db)
 */
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const masterDbPath = process.env.MASTER_DB_PATH
  || path.join(__dirname, '..', '..', 'master.db');

const dir = path.dirname(masterDbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const masterDb = new Database(masterDbPath);
masterDb.pragma('journal_mode = WAL');
masterDb.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
masterDb.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    email         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

console.log('[master] Master DB ready:', masterDbPath);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isRegistered(slug) {
  const row = masterDb.prepare(
    'SELECT id FROM tenants WHERE slug = ? AND is_active = 1'
  ).get(slug);
  return !!row;
}

function registerTenant(slug, businessName, email) {
  masterDb.prepare(`
    INSERT INTO tenants (slug, business_name, email)
    VALUES (?, ?, ?)
  `).run(slug, businessName, email || null);
}

function listTenants() {
  return masterDb.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all();
}

function deactivateTenant(slug) {
  masterDb.prepare('UPDATE tenants SET is_active = 0 WHERE slug = ?').run(slug);
}

module.exports = { isRegistered, registerTenant, listTenants, deactivateTenant };
