const { getTenantDb } = require('../config/tenantDb');
const { runWithDb } = require('../config/database');

// Subdomains that should use the default DB, not a tenant DB
const SKIP_SLUGS = new Set(['www', 'butchery', 'localhost', 'api', '127']);

module.exports = function tenantMiddleware(req, res, next) {
  // Nginx sets X-Tenant to the full hostname, e.g. "wiskings.sidanitsolutions.com"
  const host = (req.headers['x-tenant'] || req.hostname || '').toLowerCase();
  const slug = host.split('.')[0];

  if (!slug || SKIP_SLUGS.has(slug)) {
    return next(); // use default DB
  }

  try {
    const tenantDb = getTenantDb(slug);
    // Run all subsequent middleware + route handlers with tenantDb as the active DB
    runWithDb(tenantDb, () => next());
  } catch (err) {
    console.error(`[tenant] Failed to open DB for "${slug}":`, err.message);
    res.status(503).json({ error: 'Tenant database unavailable' });
  }
};
