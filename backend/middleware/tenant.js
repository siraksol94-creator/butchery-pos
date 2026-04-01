const { getTenantDb } = require('../config/tenantDb');
const { runWithDb } = require('../config/database');
const { isRegistered } = require('../config/masterDb');

// Subdomains that bypass tenant check
const SKIP_SLUGS = new Set(['www', 'butchery', 'localhost', 'api', '127']);

module.exports = function tenantMiddleware(req, res, next) {
  // Nginx sets X-Tenant to the full hostname e.g. "wiskings.sidanitsolutions.com"
  const host = (req.headers['x-tenant'] || req.hostname || '').toLowerCase();
  const slug = host.split('.')[0];

  if (!slug || SKIP_SLUGS.has(slug)) {
    return next(); // use default DB
  }

  // Block unregistered tenants
  if (!isRegistered(slug)) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  try {
    const tenantDb = getTenantDb(slug);
    runWithDb(tenantDb, () => next());
  } catch (err) {
    console.error(`[tenant] Failed to open DB for "${slug}":`, err.message);
    res.status(503).json({ error: 'Tenant database unavailable' });
  }
};
