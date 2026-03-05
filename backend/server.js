require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./config/database');
const syncConfig = require('./config/syncConfig');
const app = express();

const uploadsDir = process.env.UPLOADS_DIR
  || (process.env.ELECTRON_USER_DATA ? path.join(process.env.ELECTRON_USER_DATA, 'uploads') : path.join(__dirname, 'uploads'));

const fs = require('fs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// ─── Create all tables on first run ────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name  TEXT NOT NULL,
    last_name   TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    phone       TEXT,
    address     TEXT,
    role        TEXT NOT NULL DEFAULT 'Cashier',
    permissions TEXT DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'Active',
    last_login  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT DEFAULT '#6B7280',
    status      TEXT NOT NULL DEFAULT 'Active',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    code                TEXT,
    name                TEXT NOT NULL,
    category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    unit                TEXT NOT NULL DEFAULT 'kg',
    cost_price          REAL NOT NULL DEFAULT 0,
    selling_price       REAL NOT NULL DEFAULT 0,
    current_stock       REAL NOT NULL DEFAULT 0,
    min_stock           REAL NOT NULL DEFAULT 10,
    status              TEXT NOT NULL DEFAULT 'Active',
    image_url           TEXT,
    ub_number_start     INTEGER DEFAULT 1,
    ub_number_length    INTEGER DEFAULT 6,
    ub_quantity_start   INTEGER DEFAULT 7,
    ub_quantity_length  INTEGER DEFAULT 0,
    ub_decimal_start    INTEGER DEFAULT 2,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'Regular',
    phone            TEXT,
    email            TEXT,
    address          TEXT,
    total_purchases  REAL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'Active',
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    contact_person  TEXT,
    outstanding     REAL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'Active',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number    TEXT UNIQUE NOT NULL,
    customer_name   TEXT,
    payment_method  TEXT DEFAULT 'Cash',
    subtotal        REAL NOT NULL DEFAULT 0,
    tax_rate        REAL DEFAULT 0,
    tax_amount      REAL DEFAULT 0,
    discount        REAL DEFAULT 0,
    total_amount    REAL NOT NULL DEFAULT 0,
    amount_received REAL DEFAULT 0,
    change_amount   REAL DEFAULT 0,
    status          TEXT DEFAULT NULL,
    created_by      INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id            INTEGER NOT NULL REFERENCES orders(id),
    product_id          INTEGER REFERENCES products(id),
    product_name        TEXT NOT NULL,
    quantity            REAL NOT NULL,
    unit_price          REAL NOT NULL,
    discount_percentage REAL DEFAULT 0,
    discount_amount     REAL DEFAULT 0,
    total_price         REAL NOT NULL,
    reversed            INTEGER NOT NULL DEFAULT 0,
    reversed_at         TEXT
  );

  CREATE TABLE IF NOT EXISTS grn (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_number   TEXT UNIQUE NOT NULL,
    date         TEXT NOT NULL,
    supplier_id  INTEGER REFERENCES suppliers(id),
    total_items  INTEGER DEFAULT 0,
    total_amount REAL DEFAULT 0,
    notes        TEXT,
    created_by   INTEGER REFERENCES users(id),
    status       TEXT DEFAULT 'Completed',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grn_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_id      INTEGER NOT NULL REFERENCES grn(id),
    product_id  INTEGER REFERENCES products(id),
    quantity    REAL NOT NULL,
    unit_price  REAL NOT NULL,
    total_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS siv (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    siv_number  TEXT UNIQUE NOT NULL,
    date        TEXT NOT NULL,
    department  TEXT,
    total_items INTEGER DEFAULT 0,
    total_value REAL DEFAULT 0,
    notes       TEXT,
    created_by  INTEGER REFERENCES users(id),
    status      TEXT DEFAULT 'Issued',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS siv_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    siv_id      INTEGER NOT NULL REFERENCES siv(id),
    product_id  INTEGER REFERENCES products(id),
    quantity    REAL NOT NULL,
    unit_price  REAL DEFAULT 0,
    total_price REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER REFERENCES products(id),
    location       TEXT NOT NULL,
    movement_type  TEXT NOT NULL,
    quantity       REAL NOT NULL,
    reference_id   INTEGER,
    reference_type TEXT,
    notes          TEXT,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cash_receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT UNIQUE NOT NULL,
    received_from  TEXT,
    description    TEXT,
    payment_method TEXT,
    amount         REAL NOT NULL DEFAULT 0,
    date           TEXT NOT NULL,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payment_vouchers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT UNIQUE NOT NULL,
    paid_to        TEXT,
    description    TEXT,
    category       TEXT,
    amount         REAL NOT NULL DEFAULT 0,
    date           TEXT NOT NULL,
    paid_from      TEXT DEFAULT 'Main cashier',
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cash_book (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT NOT NULL,
    description    TEXT,
    reference      TEXT,
    receipt_amount REAL DEFAULT 0,
    payment_amount REAL DEFAULT 0,
    balance        REAL DEFAULT 0,
    type           TEXT DEFAULT 'entry',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS business_settings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name    TEXT,
    business_phone   TEXT,
    business_email   TEXT,
    business_address TEXT,
    tax_rate         REAL DEFAULT 0,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cash_reports (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    date           TEXT UNIQUE NOT NULL,
    initial_change REAL DEFAULT 0,
    mobile_money   REAL DEFAULT 0,
    cash           REAL DEFAULT 0,
    expenses       REAL DEFAULT 0,
    pending        REAL DEFAULT 0,
    total          REAL DEFAULT 0,
    after_change   REAL DEFAULT 0,
    expected       REAL DEFAULT 0,
    difference     REAL DEFAULT 0,
    status         TEXT,
    comment        TEXT,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_adjustments (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    adjustment_number TEXT UNIQUE NOT NULL,
    date              TEXT NOT NULL,
    product_id        INTEGER REFERENCES products(id),
    adjustment_type   TEXT NOT NULL,
    quantity          REAL NOT NULL,
    reason            TEXT,
    notes             TEXT,
    created_by        INTEGER REFERENCES users(id),
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_actual_balance (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id     INTEGER NOT NULL REFERENCES products(id),
    date           TEXT NOT NULL,
    actual_balance REAL NOT NULL,
    reason         TEXT,
    created_by     INTEGER,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, date)
  );
`);

// ─── Sync: config table ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sync_config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ─── Licenses table ──────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key          TEXT UNIQUE NOT NULL,
    tenant_email TEXT,
    tenant_id    TEXT,
    max_branches INTEGER NOT NULL DEFAULT 1,
    expires_at   TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 1,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT
  );
`);

// ─── Sync: schema migration (add sync columns to all tables) ─────────────────
(function runSyncMigration() {
  function addCol(table, col, def) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.find(c => c.name === col)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
    }
  }

  const allTables = [
    'users', 'categories', 'products', 'customers', 'suppliers',
    'orders', 'order_items', 'grn', 'grn_items', 'siv', 'siv_items',
    'stock_movements', 'cash_receipts', 'payment_vouchers', 'cash_book',
    'business_settings', 'cash_reports', 'stock_adjustments', 'daily_actual_balance',
  ];

  // Tables that already have updated_at — skip them
  const hasUpdatedAt = new Set([
    'users', 'products', 'customers', 'suppliers', 'business_settings', 'cash_reports',
  ]);

  for (const t of allTables) {
    addCol(t, 'sync_id',   'TEXT');
    addCol(t, 'tenant_id', 'TEXT');
    addCol(t, 'branch_id', 'TEXT');
    addCol(t, 'device_id', 'TEXT');
    addCol(t, 'deleted_at','TEXT');
    addCol(t, 'synced',    'INTEGER NOT NULL DEFAULT 0');
    if (!hasUpdatedAt.has(t)) {
      addCol(t, 'updated_at', 'TEXT');
    }
  }
})();

// ─── Sync: initialise device_id ──────────────────────────────────────────────
syncConfig.init(db);

// ─── Sync: start background sync service ─────────────────────────────────────
const syncService = require('./services/syncService');
syncService.start(db, syncConfig);

// ─── Default admin user ─────────────────────────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
if (userCount.cnt === 0) {
  const hashed = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (first_name, last_name, email, password, role, permissions)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Admin', 'User', 'admin@butchery.com', hashed, 'Administrator', '[]');
  console.log('Default admin created  →  admin@butchery.com / admin123');
}

console.log('Database schema ready');

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/grn', require('./routes/grn'));
app.use('/api/siv', require('./routes/siv'));
app.use('/api/cash-receipts', require('./routes/cashReceipts'));
app.use('/api/payment-vouchers', require('./routes/paymentVouchers'));
app.use('/api/cash-book', require('./routes/cashBook'));
app.use('/api/account-payables', require('./routes/accountPayables'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/cash-reports', require('./routes/cashReport'));
app.use('/api/stock-adjustments', require('./routes/stockAdjustments'));
app.use('/api/sync', require('./routes/sync'));
app.use('/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// Serve React frontend (Electron mode only — web mode uses Nginx)
// Try multiple paths in case env var isn't set
const _frontendBuild = process.env.ELECTRON_FRONTEND_BUILD
  || (process.resourcesPath ? path.join(process.resourcesPath, 'frontend', 'build') : null)
  || (process.env.ELECTRON_USER_DATA ? path.join(__dirname, '../frontend/build') : null);

if (_frontendBuild && require('fs').existsSync(_frontendBuild)) {
  app.use(express.static(_frontendBuild));
  app.get('*', (req, res) => res.sendFile(path.join(_frontendBuild, 'index.html')));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Butchery Pro server running on port ${PORT}`);
});
