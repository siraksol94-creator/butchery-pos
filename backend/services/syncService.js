'use strict';
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const os    = require('os');
const path  = require('path');

const logFile = path.join(os.tmpdir(), 'butchery-startup.log');
function slog(msg) {
  try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] [Sync] ${msg}\n`); } catch (e) {}
}

const SYNC_TABLES = [
  'users', 'categories', 'products', 'customers', 'suppliers',
  'orders', 'order_items', 'grn', 'grn_items', 'siv', 'siv_items',
  'stock_movements', 'cash_receipts', 'payment_vouchers', 'cash_book',
  'business_settings', 'cash_reports', 'stock_adjustments', 'daily_actual_balance',
];

const VPS_URL         = (process.env.VPS_URL || 'https://butchery.sidanitsolutions.com').replace(/\/$/, '');
const SYNC_INTERVAL   = 30_000;
const HEALTH_TIMEOUT  = 5_000;
const REQUEST_TIMEOUT = 20_000;

let _db         = null;
let _syncConfig = null;
let _timer      = null;
let _status     = { state: 'idle', lastSynced: null, error: null };

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function request(url, method = 'GET', body = null, timeoutMs = REQUEST_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  { 'Content-Type': 'application/json' },
      timeout:  timeoutMs,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Internet / VPS check ─────────────────────────────────────────────────────
async function isOnline() {
  try {
    const r = await request(`${VPS_URL}/api/health`, 'GET', null, HEALTH_TIMEOUT);
    return r.status === 200;
  } catch {
    return false;
  }
}

// ─── Push local unsynced records → VPS ───────────────────────────────────────
async function push() {
  const { tenantId, branchId, deviceId } = _syncConfig.getConfig();
  if (!tenantId || tenantId === 'local-only') return;

  const records = {};
  for (const table of SYNC_TABLES) {
    try {
      const cols = _db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      if (!cols.includes('sync_id') || !cols.includes('synced')) continue;
      const rows = _db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all();
      if (rows.length > 0) records[table] = rows;
    } catch { /* table might not exist */ }
  }

  if (Object.keys(records).length === 0) { slog('push: nothing to push'); return; }

  slog('push: sending ' + JSON.stringify(Object.entries(records).map(([t,r]) => `${t}:${r.length}`)));
  const result = await request(
    `${VPS_URL}/api/sync/push`,
    'POST',
    { tenantId, branchId, deviceId, records }
  );
  slog('push: response ' + result.status + ' ' + JSON.stringify(result.body).substring(0, 200));

  if (result.status === 200) {
    _db.transaction(() => {
      for (const [table, rows] of Object.entries(records)) {
        for (const row of rows) {
          if (!row.sync_id) continue;
          try {
            _db.prepare(`UPDATE ${table} SET synced = 1 WHERE sync_id = ?`).run(row.sync_id);
          } catch { /* ignore */ }
        }
      }
    })();
  }
}

// ─── Pull VPS records → local DB (merge by sync_id) ──────────────────────────
async function pull() {
  const { tenantId, lastPullTime } = _syncConfig.getConfig();
  if (!tenantId || tenantId === 'local-only') return;

  const result = await request(
    `${VPS_URL}/api/sync/pull?tenantId=${encodeURIComponent(tenantId)}&since=${encodeURIComponent(lastPullTime)}`
  );

  slog('pull: since=' + lastPullTime + ' status=' + result.status);
  if (result.status !== 200 || !result.body || !result.body.records) {
    slog('pull: failed or empty response');
    return;
  }
  const pulled = Object.entries(result.body.records).map(([t,r]) => `${t}:${r.length}`);
  slog('pull: received ' + (pulled.length ? JSON.stringify(pulled) : 'nothing'));

  _db.transaction(() => {
    for (const [table, rows] of Object.entries(result.body.records)) {
      if (!SYNC_TABLES.includes(table)) continue;

      let cols;
      try {
        cols = _db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      } catch { continue; }
      if (!cols.includes('sync_id')) continue;

      for (const row of rows) {
        if (!row.sync_id) continue;

        try {
          const existing = _db.prepare(`SELECT id FROM ${table} WHERE sync_id = ?`).get(row.sync_id);

          if (!existing) {
            // New record from VPS — insert it (mark synced=1 so we don't push it back)
            const insertCols = cols.filter(c => c !== 'id' && row[c] !== undefined && row[c] !== null);
            if (insertCols.length === 0) continue;
            const placeholders = insertCols.map(() => '?').join(', ');
            _db.prepare(
              `INSERT OR IGNORE INTO ${table} (${insertCols.join(', ')}) VALUES (${placeholders})`
            ).run(...insertCols.map(c => row[c]));
            _db.prepare(`UPDATE ${table} SET synced = 1 WHERE sync_id = ?`).run(row.sync_id);
          } else {
            // Existing record — update all columns except id and sync_id, mark synced=1
            const updateCols = cols.filter(c => c !== 'id' && c !== 'sync_id' && row[c] !== undefined);
            if (updateCols.length === 0) continue;
            const setClause = [...updateCols.map(c => `${c} = ?`), 'synced = 1'].join(', ');
            _db.prepare(`UPDATE ${table} SET ${setClause} WHERE sync_id = ?`).run(
              ...updateCols.map(c => row[c]), row.sync_id
            );
          }
        } catch { /* ignore individual row errors */ }
      }
    }
  })();

  if (result.body.serverTime) {
    _syncConfig.updateLastPullTime(result.body.serverTime);
  }
}

// ─── One full sync cycle ──────────────────────────────────────────────────────
async function runCycle() {
  try {
    const { tenantId } = _syncConfig.getConfig();
    if (!tenantId || tenantId === 'local-only') {
      _status = { state: 'idle', lastSynced: null, error: null };
      return;
    }

    _status = { ..._status, state: 'checking' };

    const online = await isOnline();
    if (!online) {
      _status = { ..._status, state: 'offline', error: null };
      return;
    }

    _status = { ..._status, state: 'syncing', error: null };
    await push();
    await pull();

    const now = new Date().toISOString();
    _status = { state: 'synced', lastSynced: now, error: null };
    _syncConfig.set('last_synced', now);
    _syncConfig.set('sync_error', '');
    console.log('[SyncService] Cycle complete:', now);
  } catch (err) {
    console.error('[SyncService] Error:', err.message);
    _status = { ..._status, state: 'error', error: err.message };
    try { _syncConfig.set('sync_error', err.message); } catch { /* ignore */ }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
function start(db, syncConfig) {
  if (_timer) return;
  _db         = db;
  _syncConfig = syncConfig;

  // Initial cycle after 8s (give server time to finish startup)
  setTimeout(runCycle, 8_000);
  _timer = setInterval(runCycle, SYNC_INTERVAL);

  const cfg = syncConfig.getConfig();
  slog(`started — tenantId=${cfg.tenantId} branchId=${cfg.branchId} VPS=${VPS_URL}`);
  console.log(`[SyncService] Started — interval: ${SYNC_INTERVAL / 1000}s, VPS: ${VPS_URL}`);
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function getStatus() {
  return { ..._status };
}

module.exports = { start, stop, getStatus };
