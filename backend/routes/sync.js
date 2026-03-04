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
router.post('/register', (req, res) => {
  try {
    const { email, branchName } = req.body;
    if (!email || !branchName) {
      return res.status(400).json({ error: 'email and branchName are required' });
    }

    // Find or create tenant by email
    let tenantRow = db.prepare('SELECT * FROM sync_config WHERE key = ?').get(`tenant:${email}`);
    let tenantId;
    if (tenantRow) {
      tenantId = tenantRow.value;
    } else {
      tenantId = randomUUID();
      db.prepare('INSERT INTO sync_config (key, value) VALUES (?, ?)').run(`tenant:${email}`, tenantId);
    }

    // Create branch under tenant
    const branchId = randomUUID();
    db.prepare('INSERT INTO sync_config (key, value) VALUES (?, ?)').run(
      `branch:${tenantId}:${branchId}`, branchName
    );

    res.json({ tenantId, branchId });
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
    const result = {};

    for (const table of SYNC_TABLES) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const hasTenantId = cols.includes('tenant_id');
      const hasUpdatedAt = cols.includes('updated_at');
      if (!hasTenantId) continue;

      let rows;
      if (hasUpdatedAt) {
        rows = db.prepare(
          `SELECT * FROM ${table} WHERE tenant_id = ? AND updated_at > ?`
        ).all(tenantId, sinceTs);
      } else {
        rows = db.prepare(
          `SELECT * FROM ${table} WHERE tenant_id = ? AND created_at > ?`
        ).all(tenantId, sinceTs);
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
