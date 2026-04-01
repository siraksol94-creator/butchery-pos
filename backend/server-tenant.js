/**
 * server-tenant.js — Multi-tenant web server (port 5001)
 *
 * Handles requests for *.sidanitsolutions.com.
 * Reads the subdomain from the X-Tenant header (set by Nginx),
 * opens the correct tenant DB, and routes all API calls into it.
 *
 * No sync service — desktop devices sync via the main server (port 5000).
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ─── Uploads dir (tenant uploads live inside TENANTS_DIR/<slug>/uploads) ─────
// Resolved per-request in routes via req.uploadsDir (set by tenant middleware).
// For the tenant server, a shared base dir is used; subfolders are per-tenant.
const uploadsBase = process.env.TENANTS_DIR
  || path.join(__dirname, '..', 'tenants');

const fs = require('fs');
if (!fs.existsSync(uploadsBase)) fs.mkdirSync(uploadsBase, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Tenant middleware — MUST come before all routes ─────────────────────────
app.use(require('./middleware/tenant'));

// ─── Static file serving for uploaded images ─────────────────────────────────
// Each tenant's uploads live at TENANTS_DIR/<slug>/uploads/
// The URL pattern is /uploads/<filename> — served from the correct tenant folder
app.use('/uploads', (req, res, next) => {
  const host = (req.headers['x-tenant'] || req.hostname || '').toLowerCase();
  const slug = host.split('.')[0];
  const tenantUploads = path.join(uploadsBase, slug, 'uploads');
  express.static(tenantUploads)(req, res, next);
});

// ─── API Routes (identical to main server) ───────────────────────────────────
app.use('/api/auth',             require('./routes/auth'));
app.use('/api/products',         require('./routes/products'));
app.use('/api/categories',       require('./routes/categories'));
app.use('/api/orders',           require('./routes/orders'));
app.use('/api/grn',              require('./routes/grn'));
app.use('/api/siv',              require('./routes/siv'));
app.use('/api/cash-receipts',    require('./routes/cashReceipts'));
app.use('/api/payment-vouchers', require('./routes/paymentVouchers'));
app.use('/api/cash-book',        require('./routes/cashBook'));
app.use('/api/account-payables', require('./routes/accountPayables'));
app.use('/api/suppliers',        require('./routes/suppliers'));
app.use('/api/customers',        require('./routes/customers'));
app.use('/api/users',            require('./routes/users'));
app.use('/api/dashboard',        require('./routes/dashboard'));
app.use('/api/settings',         require('./routes/settings'));
app.use('/api/inventory',        require('./routes/inventory'));
app.use('/api/cash-reports',     require('./routes/cashReport'));
app.use('/api/stock-adjustments',require('./routes/stockAdjustments'));
app.use('/api/production',       require('./routes/production'));
app.use('/api/sales-returns',    require('./routes/salesReturns'));
app.use('/api/ap-payments',      require('./routes/apPayments'));
app.use('/api/sync',             require('./routes/sync'));
app.use('/api/tenant-admin',     require('./routes/tenantAdmin'));
app.use('/admin',                require('./routes/admin'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', mode: 'tenant', timestamp: new Date().toISOString() });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.TENANT_PORT || 5001;
app.listen(PORT, () => {
  console.log(`Butchery Pro tenant server running on port ${PORT}`);
});
