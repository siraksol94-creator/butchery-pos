const path = require('path');
const fs = require('fs');
const { openDb } = require('./database');
const { initTenantDb } = require('./migrations');

// Tenant DB files live here: /var/www/butchery-pos/tenants/<slug>.db
const TENANTS_DIR = process.env.TENANTS_DIR
  || path.join(__dirname, '..', '..', 'tenants');

const cache = new Map(); // slug → Database instance

function getTenantDb(slug) {
  if (cache.has(slug)) return cache.get(slug);

  if (!fs.existsSync(TENANTS_DIR)) {
    fs.mkdirSync(TENANTS_DIR, { recursive: true });
  }

  const dbPath = path.join(TENANTS_DIR, `${slug}.db`);
  const isNew = !fs.existsSync(dbPath);
  const db = openDb(dbPath);

  if (isNew) {
    console.log(`[tenant] Initialising new DB for: ${slug}`);
    initTenantDb(db);
  }

  cache.set(slug, db);
  return db;
}

module.exports = { getTenantDb, TENANTS_DIR };
