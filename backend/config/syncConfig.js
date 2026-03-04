const crypto = require('crypto');

let _db = null;

function init(db) {
  _db = db;
  if (!get('device_id')) {
    set('device_id', crypto.randomUUID());
  }
}

function get(key) {
  if (!_db) return null;
  const row = _db.prepare('SELECT value FROM sync_config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function set(key, value) {
  if (!_db) return;
  _db.prepare('INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)').run(key, String(value));
}

function getConfig() {
  return {
    tenantId:     get('tenant_id'),
    branchId:     get('branch_id'),
    deviceId:     get('device_id'),
    lastPullTime: get('last_pull_time') || '1970-01-01T00:00:00.000Z',
    isConfigured: !!get('tenant_id'),
  };
}

function setRegistration(tenantId, branchId) {
  set('tenant_id', tenantId);
  set('branch_id', branchId);
}

function updateLastPullTime(isoString) {
  set('last_pull_time', isoString);
}

// Returns an ever-increasing integer per table, stored in sync_config.
// Survives restarts; safe for offline multi-device unique number generation.
function nextSeq(tableName) {
  const key = `seq_${tableName}`;
  const next = parseInt(get(key) || '0') + 1;
  set(key, next);
  return next;
}

// Generates a unique document number like  ORD-2024-A1B2C3-0001
// prefix  : 'ORD', 'GRN', etc.
// table   : used for the per-device sequence counter
function generateNumber(prefix, table) {
  const cfg = getConfig();
  const shortCode = cfg.deviceId
    ? cfg.deviceId.replace(/-/g, '').substring(0, 6).toUpperCase()
    : 'LOCAL1';
  const year = new Date().getFullYear();
  const seq  = String(nextSeq(table)).padStart(4, '0');
  return `${prefix}-${year}-${shortCode}-${seq}`;
}

module.exports = { init, get, set, getConfig, setRegistration, updateLastPullTime, generateNumber };
