const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

// ─── AsyncLocalStorage: one DB per request context ───────────────────────────
const als = new AsyncLocalStorage();
const dbPool = new Map(); // dbPath → Database instance

function openDb(dbPath) {
  if (!dbPool.has(dbPath)) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const d = new Database(dbPath);
    d.pragma('journal_mode = WAL');
    d.pragma('foreign_keys = ON');
    dbPool.set(dbPath, d);
    console.log(`[db] Opened: ${dbPath}`);
  }
  return dbPool.get(dbPath);
}

// ─── Default DB (Electron / local dev / VPS single-tenant) ───────────────────
let defaultDbPath;
if (process.env.DB_PATH) {
  defaultDbPath = process.env.DB_PATH;
} else if (process.env.ELECTRON_USER_DATA) {
  defaultDbPath = path.join(process.env.ELECTRON_USER_DATA, 'butchery.db');
} else {
  defaultDbPath = path.join(__dirname, '..', 'butchery.db');
}

const defaultDb = openDb(defaultDbPath);
console.log('Connected to SQLite database');

// ─── Proxy: all property accesses go to the current-request DB ───────────────
// Helpers (openDb, defaultDb, runWithDb) live on the proxy's own target object
// so they don't get intercepted and forwarded to the underlying DB.
const _helpers = {};

const HELPER_KEYS = new Set(['openDb', 'defaultDb', 'runWithDb']);

const proxy = new Proxy(_helpers, {
  get(target, prop) {
    if (HELPER_KEYS.has(prop)) return target[prop];
    const db = als.getStore() || defaultDb;
    const val = db[prop];
    return typeof val === 'function' ? val.bind(db) : val;
  },
  set(target, prop, value) {
    target[prop] = value; // helpers and any external assignments go on target
    return true;
  }
});

proxy.openDb = openDb;
proxy.defaultDb = defaultDb;
proxy.runWithDb = (db, fn) => als.run(db, fn);

module.exports = proxy;
