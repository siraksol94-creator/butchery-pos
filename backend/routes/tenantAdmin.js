/**
 * tenantAdmin.js
 * Admin endpoints for registering and managing tenants.
 * Protected by ADMIN_PASSWORD from .env
 */
const express = require('express');
const router = express.Router();
const { randomUUID } = require('crypto');
const { registerTenant, listTenants, deactivateTenant, isRegistered } = require('../config/masterDb');
const { getTenantDb } = require('../config/tenantDb');

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body.adminPassword;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/tenant-admin/list — list all tenants
router.get('/list', adminAuth, (req, res) => {
  const tenants = listTenants();
  res.json({ tenants });
});

// POST /api/tenant-admin/register — register a new tenant
router.post('/register', adminAuth, (req, res) => {
  const { slug, businessName, email } = req.body;

  if (!slug || !businessName) {
    return res.status(400).json({ error: 'slug and businessName are required' });
  }

  // Validate slug: lowercase letters, numbers, hyphens only
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'slug must be lowercase letters, numbers, hyphens only' });
  }

  if (isRegistered(slug)) {
    return res.status(409).json({ error: 'Tenant already registered' });
  }

  try {
    registerTenant(slug, businessName, email);
    // Pre-initialise the tenant DB immediately
    getTenantDb(slug);
    res.json({
      success: true,
      tenant: { slug, businessName, email },
      url: `https://${slug}.sidanitsolutions.com`
    });
  } catch (err) {
    console.error('[tenant-admin] register error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tenant-admin/create-license — create a license key in a tenant's DB
// Body: { slug, maxBranches, expiresAt, notes }
router.post('/create-license', adminAuth, (req, res) => {
  const { slug, maxBranches = 1, expiresAt, notes } = req.body;

  if (!slug || !expiresAt) {
    return res.status(400).json({ error: 'slug and expiresAt are required' });
  }

  if (!isRegistered(slug)) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  try {
    const tenantDb = getTenantDb(slug);
    const raw = randomUUID().replace(/-/g, '').toUpperCase();
    const licenseKey = `BUTCH-${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}`;

    tenantDb.prepare(`
      INSERT INTO licenses (key, max_branches, expires_at, notes, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(licenseKey, maxBranches, expiresAt, notes || null);

    res.json({
      success: true,
      licenseKey,
      slug,
      maxBranches,
      expiresAt,
      url: `https://${slug}.sidanitsolutions.com`
    });
  } catch (err) {
    console.error('[tenant-admin] create-license error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tenant-admin/deactivate — deactivate a tenant
router.post('/deactivate', adminAuth, (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  deactivateTenant(slug);
  res.json({ success: true });
});

module.exports = router;
