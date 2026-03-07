const router = require('express').Router();
const db = require('../config/database');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// All tables that participate in sync
const SYNC_TABLES = [
  'users', 'categories', 'products', 'customers', 'suppliers',
  'orders', 'order_items', 'grn', 'grn_items', 'siv', 'siv_items',
  'stock_movements', 'cash_receipts', 'payment_vouchers', 'cash_book',
  'business_settings', 'cash_reports', 'stock_adjustments', 'daily_actual_balance',
];

// ─── POST /api/sync/register ─────────────────────────────────────────────────
// Called by a new device to get/create a tenant + branch
// Now requires a valid licenseKey
router.post('/register', (req, res) => {
  try {
    const { email, branchName, licenseKey } = req.body;
    if (!email || !branchName || !licenseKey) {
      return res.status(400).json({ error: 'email, branchName and licenseKey are required' });
    }

    // ── Validate license ───────────────────────────────────────────────────
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(licenseKey.trim().toUpperCase());
    if (!license)           return res.status(403).json({ error: 'Invalid license key.' });
    if (!license.is_active) return res.status(403).json({ error: 'This license has been deactivated.' });
    if (license.expires_at < new Date().toISOString())
      return res.status(403).json({ error: 'This license has expired.' });
    if (license.tenant_email && license.tenant_email !== email.trim())
      return res.status(403).json({ error: 'This license key is already registered to a different account.' });

    // ── Find or create tenant by email ────────────────────────────────────
    let tenantRow = db.prepare('SELECT * FROM sync_config WHERE key = ?').get(`tenant:${email}`);
    let tenantId;
    if (tenantRow) {
      tenantId = tenantRow.value;
    } else {
      tenantId = randomUUID();
      db.prepare('INSERT INTO sync_config (key, value) VALUES (?, ?)').run(`tenant:${email}`, tenantId);
    }

    // ── Check branch limit ────────────────────────────────────────────────
    const branchCount = db.prepare(
      "SELECT COUNT(*) AS cnt FROM sync_config WHERE key LIKE ?"
    ).get(`branch:${tenantId}:%`);
    if (branchCount.cnt >= license.max_branches) {
      return res.status(403).json({
        error: `Branch limit reached. Your license allows ${license.max_branches} branch(es). Contact support to upgrade.`
      });
    }

    // ── Create branch ─────────────────────────────────────────────────────
    const branchId = randomUUID();
    db.prepare('INSERT INTO sync_config (key, value) VALUES (?, ?)').run(
      `branch:${tenantId}:${branchId}`, branchName
    );

    // ── Activate license (stamp email + tenantId on first use) ────────────
    if (!license.tenant_email) {
      db.prepare(
        "UPDATE licenses SET tenant_email = ?, tenant_id = ?, activated_at = datetime('now') WHERE key = ?"
      ).run(email.trim(), tenantId, licenseKey.trim().toUpperCase());
    }

    res.json({ tenantId, branchId, expiresAt: license.expires_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/sync/license-status ────────────────────────────────────────────
// Device checks if its license is still valid (called on startup + every 24h)
router.get('/license-status', (req, res) => {
  try {
    const { tenantId } = req.query;
    if (!tenantId || tenantId === 'local-only') {
      return res.json({ valid: true, localOnly: true });
    }

    // Find the license associated with this tenant
    const license = db.prepare('SELECT * FROM licenses WHERE tenant_id = ?').get(tenantId);
    if (!license) return res.json({ valid: false, reason: 'License not found' });
    if (!license.is_active) return res.json({ valid: false, reason: 'License deactivated' });

    const now = new Date();
    const expiry = new Date(license.expires_at);
    const daysRemaining = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

    res.json({
      valid:         daysRemaining > 0,
      isExpired:     daysRemaining <= 0,
      daysRemaining: Math.max(0, daysRemaining),
      expiresAt:     license.expires_at,
      reason:        daysRemaining <= 0 ? 'License expired' : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/sync/identity ───────────────────────────────────────────────────
// Returns business email, branch name, license info for a registered device
// Query: ?tenantId=...&branchId=...
router.get('/identity', (req, res) => {
  try {
    const { tenantId, branchId } = req.query;
    if (!tenantId || !branchId) {
      return res.status(400).json({ error: 'tenantId and branchId are required' });
    }

    // Find email by tenantId
    const tenantRow = db.prepare(
      "SELECT key FROM sync_config WHERE key LIKE 'tenant:%' AND value = ?"
    ).get(tenantId);
    const email = tenantRow ? tenantRow.key.replace('tenant:', '') : null;

    // Find branch name
    const branchRow = db.prepare(
      'SELECT value FROM sync_config WHERE key = ?'
    ).get(`branch:${tenantId}:${branchId}`);
    const branchName = branchRow ? branchRow.value : null;

    // Find license info
    const license = db.prepare(
      'SELECT expires_at, is_active, max_branches FROM licenses WHERE tenant_id = ?'
    ).get(tenantId);

    const now = new Date();
    const expiry = license ? new Date(license.expires_at) : null;
    const daysRemaining = expiry ? Math.ceil((expiry - now) / (1000 * 60 * 60 * 24)) : null;

    res.json({
      email,
      branchName,
      expiresAt:     license ? license.expires_at : null,
      daysRemaining: daysRemaining !== null ? Math.max(0, daysRemaining) : null,
      isExpired:     daysRemaining !== null ? daysRemaining <= 0 : false,
      maxBranches:   license ? license.max_branches : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/sync/join-branch ──────────────────────────────────────────────
// Called by a new PC joining an EXISTING branch (no new branch created)
// Body: { branchCode, licenseKey }
router.post('/join-branch', (req, res) => {
  try {
    const { branchCode, licenseKey } = req.body;
    if (!branchCode || !licenseKey) {
      return res.status(400).json({ error: 'branchCode and licenseKey are required' });
    }

    // ── Find branch by code (first 8 chars of branchId, uppercase) ────────
    const branchRows = db.prepare(
      "SELECT key FROM sync_config WHERE key LIKE 'branch:%'"
    ).all();

    let foundTenantId = null;
    let foundBranchId = null;

    for (const row of branchRows) {
      // key format: branch:tenantId:branchId
      const parts = row.key.split(':');
      if (parts.length !== 3) continue;
      const bid  = parts[2];
      const code = bid.replace(/-/g, '').substring(0, 8).toUpperCase();
      if (code === branchCode.trim().toUpperCase()) {
        foundTenantId = parts[1];
        foundBranchId = bid;
        break;
      }
    }

    if (!foundTenantId) {
      return res.status(404).json({ error: 'Branch not found. Please check your Branch Code.' });
    }

    // ── Verify license belongs to this tenant ─────────────────────────────
    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(licenseKey.trim().toUpperCase());
    if (!license)           return res.status(403).json({ error: 'Invalid license key.' });
    if (!license.is_active) return res.status(403).json({ error: 'This license has been deactivated.' });
    if (license.expires_at < new Date().toISOString()) {
      return res.status(403).json({ error: 'This license has expired.' });
    }
    if (license.tenant_id !== foundTenantId) {
      return res.status(403).json({ error: 'This license key does not belong to that branch.' });
    }

    // ── Return existing IDs — no new branch created ───────────────────────
    res.json({ tenantId: foundTenantId, branchId: foundBranchId, expiresAt: license.expires_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/sync/push ──────────────────────────────────────────────────────
// Device pushes local unsynced records to VPS
// Body: { tenantId, branchId, deviceId, records: { tableName: [...rows] } }
router.post('/push', (req, res) => {
  try {
    const { tenantId, branchId, deviceId, records } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const conflicts = [];

    db.transaction(() => {
      for (const [table, rows] of Object.entries(records || {})) {
        if (!SYNC_TABLES.includes(table)) continue;

        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        const hasSyncId = cols.includes('sync_id');
        const hasUpdatedAt = cols.includes('updated_at');
        if (!hasSyncId) continue;

        for (const row of rows) {
          if (!row.sync_id) continue;

          // Check if record exists on VPS by sync_id
          const existing = db.prepare(`SELECT * FROM ${table} WHERE sync_id = ?`).get(row.sync_id);

          if (!existing) {
            // New record — insert it
            const insertCols = cols.filter(c => c !== 'id' && row[c] !== undefined);
            const placeholders = insertCols.map(() => '?').join(', ');
            const values = insertCols.map(c => row[c]);
            db.prepare(
              `INSERT OR IGNORE INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`
            ).run(...values);
            // Stamp VPS receive time so pull filters on other devices work correctly
            if (hasUpdatedAt) {
              db.prepare(`UPDATE ${table} SET updated_at = datetime('now') WHERE sync_id = ?`).run(row.sync_id);
            }
          } else if (hasUpdatedAt) {
            // Existing record — last-write-wins based on updated_at
            const incomingUpdatedAt = row.updated_at || row.created_at || '1970-01-01';
            const existingUpdatedAt = existing.updated_at || existing.created_at || '1970-01-01';

            if (incomingUpdatedAt >= existingUpdatedAt) {
              // Incoming is newer — update
              const updateCols = cols.filter(c => c !== 'id' && c !== 'sync_id' && row[c] !== undefined);
              const setClause = updateCols.map(c => `${c} = ?`).join(', ');
              const values = [...updateCols.map(c => row[c]), row.sync_id];
              db.prepare(`UPDATE ${table} SET ${setClause} WHERE sync_id = ?`).run(...values);
              // Stamp VPS receive time so pull filters on other devices work correctly
              db.prepare(`UPDATE ${table} SET updated_at = datetime('now') WHERE sync_id = ?`).run(row.sync_id);
            } else {
              // Local is newer — report conflict (incoming loses)
              conflicts.push({ table, sync_id: row.sync_id, reason: 'stale' });
            }
          } else {
            // No updated_at — always overwrite
            const updateCols = cols.filter(c => c !== 'id' && c !== 'sync_id' && row[c] !== undefined);
            const setClause = updateCols.map(c => `${c} = ?`).join(', ');
            const values = [...updateCols.map(c => row[c]), row.sync_id];
            db.prepare(`UPDATE ${table} SET ${setClause} WHERE sync_id = ?`).run(...values);
          }
        }
      }
    })();

    res.json({ success: true, conflicts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/sync/pull ───────────────────────────────────────────────────────
// Device pulls records updated on VPS since last pull
// Query: ?tenantId=T1&since=2024-01-01T00:00:00.000Z
router.get('/pull', (req, res) => {
  try {
    const { tenantId, since } = req.query;
    if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

    const sinceTs = since || '1970-01-01T00:00:00.000Z';
    const isInitialPull = sinceTs === '1970-01-01T00:00:00.000Z';
    // Normalize to SQLite space format: '2026-03-06T14:50:22.739Z' → '2026-03-06 14:50:22'
    const sinceSQLite = sinceTs.replace('T', ' ').replace('Z', '').substring(0, 19);
    const result = {};

    for (const table of SYNC_TABLES) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const hasTenantId = cols.includes('tenant_id');
      const hasUpdatedAt = cols.includes('updated_at');
      const hasCreatedAt = cols.includes('created_at');
      if (!hasTenantId) continue;

      let rows;
      if (isInitialPull) {
        // First sync — return everything for this tenant regardless of timestamps
        rows = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).all(tenantId);
      } else if (hasUpdatedAt) {
        const timeCol = hasCreatedAt ? 'COALESCE(updated_at, created_at)' : 'updated_at';
        rows = db.prepare(
          `SELECT * FROM ${table} WHERE tenant_id = ? AND ${timeCol} > ?`
        ).all(tenantId, sinceSQLite);
      } else if (hasCreatedAt) {
        rows = db.prepare(
          `SELECT * FROM ${table} WHERE tenant_id = ? AND created_at > ?`
        ).all(tenantId, sinceSQLite);
      } else {
        rows = db.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).all(tenantId);
      }

      if (rows.length > 0) {
        result[table] = rows;
      }
    }

    res.json({ records: result, serverTime: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/sync/current-status ────────────────────────────────────────────
// Returns live sync service state — polled by the SyncStatus UI component
router.get('/current-status', (req, res) => {
  try {
    const syncService = require('../services/syncService');
    res.json(syncService.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/sync/status ────────────────────────────────────────────────────
// Returns current sync configuration (used by Setup screen to check registration)
router.get('/status', (req, res) => {
  try {
    const cfg = syncConfig.getConfig();
    res.json({
      isConfigured: cfg.isConfigured,
      tenantId: cfg.tenantId,
      branchId: cfg.branchId,
      deviceId: cfg.deviceId,
      lastPullTime: cfg.lastPullTime,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/sync/reset ────────────────────────────────────────────────────
// Clears tenant_id + branch_id so the Setup screen appears on next reload
router.post('/reset', (req, res) => {
  try {
    db.prepare("DELETE FROM sync_config WHERE key IN ('tenant_id','branch_id','last_pull_time')").run();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/sync/configure ────────────────────────────────────────────────
// Save tenantId + branchId on local device after registration
router.post('/configure', (req, res) => {
  try {
    const { tenantId, branchId } = req.body;
    if (!tenantId || !branchId) {
      return res.status(400).json({ error: 'tenantId and branchId are required' });
    }
    syncConfig.setRegistration(tenantId, branchId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
