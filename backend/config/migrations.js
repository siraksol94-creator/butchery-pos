/**
 * initTenantDb(db)
 * Runs on a fresh tenant SQLite database to create all tables and add sync columns.
 * Safe to run on existing DBs (all statements use IF NOT EXISTS / column checks).
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');

function initTenantDb(db) {
  // ── Core tables ────────────────────────────────────────────────────────────
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
      product_type        TEXT NOT NULL DEFAULT 'finished',
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
      total_price REAL NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
      total_price REAL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS ap_payments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT UNIQUE NOT NULL,
      supplier_id    INTEGER REFERENCES suppliers(id),
      supplier_name  TEXT,
      amount         REAL NOT NULL DEFAULT 0,
      description    TEXT,
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
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id       INTEGER NOT NULL REFERENCES products(id),
      product_sync_id  TEXT,
      date             TEXT NOT NULL,
      actual_balance   REAL NOT NULL,
      reason           TEXT,
      created_by       INTEGER,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, date)
    );

    CREATE TABLE IF NOT EXISTS sync_config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

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

    CREATE TABLE IF NOT EXISTS production (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      production_number TEXT UNIQUE NOT NULL,
      date              TEXT NOT NULL,
      notes             TEXT,
      total_input_cost  REAL DEFAULT 0,
      cost_per_kg       REAL DEFAULT 0,
      total_output_qty  REAL DEFAULT 0,
      created_by        INTEGER REFERENCES users(id),
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_inputs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      production_id INTEGER NOT NULL REFERENCES production(id),
      product_id    INTEGER REFERENCES products(id),
      quantity      REAL NOT NULL,
      unit_cost     REAL NOT NULL DEFAULT 0,
      total_cost    REAL NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS production_outputs (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      production_id            INTEGER NOT NULL REFERENCES production(id),
      product_id               INTEGER REFERENCES products(id),
      quantity                 REAL NOT NULL,
      allocated_cost_per_unit  REAL NOT NULL DEFAULT 0,
      total_allocated_cost     REAL NOT NULL DEFAULT 0,
      created_at               TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_returns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      date          TEXT NOT NULL,
      notes         TEXT,
      total_items   INTEGER DEFAULT 0,
      created_by    INTEGER REFERENCES users(id),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales_return_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id  INTEGER REFERENCES sales_returns(id),
      product_id INTEGER REFERENCES products(id),
      quantity   REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Add sync columns to all tables ────────────────────────────────────────
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
    'production', 'production_inputs', 'production_outputs',
    'sales_returns', 'sales_return_items', 'ap_payments',
  ];

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
    addCol(t, 'created_at', 'TEXT');
    if (!hasUpdatedAt.has(t)) {
      addCol(t, 'updated_at', 'TEXT');
    }
  }

  addCol('stock_movements',    'reference_sync_id', 'TEXT');
  addCol('stock_movements',    'product_sync_id',   'TEXT');
  addCol('grn_items',          'product_sync_id',   'TEXT');
  addCol('grn_items',          'grn_sync_id',       'TEXT');
  addCol('siv_items',          'product_sync_id',   'TEXT');
  addCol('siv_items',          'siv_sync_id',       'TEXT');
  addCol('order_items',        'product_sync_id',   'TEXT');
  addCol('order_items',        'order_sync_id',     'TEXT');
  addCol('production_inputs',  'product_sync_id',   'TEXT');
  addCol('production_inputs',  'production_sync_id','TEXT');
  addCol('production_outputs', 'product_sync_id',   'TEXT');
  addCol('production_outputs', 'production_sync_id','TEXT');
  addCol('sales_return_items', 'product_sync_id',   'TEXT');
  addCol('sales_return_items', 'return_sync_id',    'TEXT');
  addCol('stock_adjustments',  'product_sync_id',   'TEXT');
  addCol('products',           'category_sync_id',  'TEXT');
  addCol('grn',                'supplier_sync_id',  'TEXT');
  addCol('ap_payments',        'supplier_sync_id',  'TEXT');
  addCol('daily_actual_balance','product_sync_id',  'TEXT');

  try {
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dab_product_sync_date ON daily_actual_balance (product_sync_id, date)`).run();
  } catch (_) {}

  // ── Default admin user ─────────────────────────────────────────────────────
  const existing = db.prepare("SELECT id FROM users WHERE email = 'admin'").get();
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    const syncId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (first_name, last_name, email, password, role, permissions, status, sync_id, created_at, updated_at)
      VALUES ('Admin', 'User', 'admin', ?, 'Admin', '[]', 'Active', ?, datetime('now'), datetime('now'))
    `).run(hash, syncId);
    console.log('[tenant] Default admin created (admin / admin123)');
  }
}

module.exports = { initTenantDb };
