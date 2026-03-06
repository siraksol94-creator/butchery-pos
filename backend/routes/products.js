const router = require('express').Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/products');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `product_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Get all products
router.get('/', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `SELECT p.*, c.name as category_name, c.color as category_color,
                   COALESCE(store_agg.store_balance, 0) as store_balance,
                   COALESCE(sales_agg.sales_balance, 0) as sales_balance,
                   CASE WHEN COALESCE(grn_qty.total_qty, 0) > 0
                     THEN ROUND(COALESCE(grn_qty.total_cost, 0) / grn_qty.total_qty, 2)
                     ELSE p.cost_price
                   END as avg_cost_price
                 FROM products p
                 LEFT JOIN categories c ON p.category_id = c.id
                 LEFT JOIN (
                   SELECT product_id, SUM(quantity) as store_balance
                   FROM stock_movements WHERE location = 'store' GROUP BY product_id
                 ) store_agg ON store_agg.product_id = p.id
                 LEFT JOIN (
                   SELECT product_id, SUM(quantity) as sales_balance
                   FROM stock_movements WHERE location = 'sales' GROUP BY product_id
                 ) sales_agg ON sales_agg.product_id = p.id
                 LEFT JOIN (
                   SELECT product_id, SUM(quantity) as total_qty, SUM(total_price) as total_cost
                   FROM grn_items GROUP BY product_id
                 ) grn_qty ON grn_qty.product_id = p.id
                 WHERE p.deleted_at IS NULL`;
    const params = [];

    if (category && category !== 'All') {
      params.push(category);
      query += ` AND c.name = ?`;
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      query += ` AND (p.name LIKE ? OR p.code LIKE ?)`;
    }
    query += ' ORDER BY p.created_at DESC';

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
router.get('/:id', (req, res) => {
  try {
    const row = db.prepare(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ? AND p.deleted_at IS NULL`
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
router.post('/', auth, (req, res) => {
  try {
    const { code, name, category_id, unit, cost_price, selling_price, current_stock, min_stock } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      `INSERT INTO products (code, name, category_id, unit, cost_price, selling_price, current_stock, min_stock, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
    ).run(code, name, category_id, unit || 'kg', cost_price, selling_price, current_stock || 0, min_stock || 10,
          randomUUID(), tenantId, branchId, deviceId);
    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    if (parseFloat(current_stock) > 0) {
      db.prepare(
        `INSERT INTO stock_movements (product_id, location, movement_type, quantity, notes, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`
      ).run(newProduct.id, 'store', 'opening', current_stock, 'Opening balance',
            randomUUID(), tenantId, branchId, deviceId);
    }
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
router.put('/:id', auth, (req, res) => {
  try {
    const { code, name, category_id, unit, cost_price, selling_price, current_stock, min_stock,
            ub_number_start, ub_number_length, ub_quantity_start, ub_quantity_length, ub_decimal_start } = req.body;
    db.prepare(
      `UPDATE products SET code=?, name=?, category_id=?, unit=?, cost_price=?, selling_price=?,
       current_stock=?, min_stock=?,
       ub_number_start=?, ub_number_length=?, ub_quantity_start=?, ub_quantity_length=?, ub_decimal_start=?,
       updated_at=datetime('now'), synced=0 WHERE id=?`
    ).run(code, name, category_id, unit, cost_price, selling_price, current_stock, min_stock,
          ub_number_start ?? 1, ub_number_length ?? 6, ub_quantity_start ?? 7, ub_quantity_length ?? 0, ub_decimal_start ?? 2,
          req.params.id);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update barcode settings only
router.patch('/:id/barcode', auth, (req, res) => {
  try {
    const { ub_number_start, ub_number_length, ub_quantity_start, ub_quantity_length, ub_decimal_start } = req.body;
    const pInt = (val, def) => { const n = parseInt(val); return isNaN(n) ? def : n; };
    const info = db.prepare(
      `UPDATE products SET
         ub_number_start=?, ub_number_length=?, ub_quantity_start=?,
         ub_quantity_length=?, ub_decimal_start=?,
         updated_at=datetime('now'), synced=0
       WHERE id=?`
    ).run(
      pInt(ub_number_start, 1), pInt(ub_number_length, 6), pInt(ub_quantity_start, 7),
      pInt(ub_quantity_length, 0), pInt(ub_decimal_start, 2), req.params.id
    );
    if (info.changes === 0) return res.status(404).json({ error: 'Product not found' });
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload product image
router.post('/:id/image', auth, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const imageUrl = `/uploads/products/${req.file.filename}`;

    const old = db.prepare('SELECT image_url FROM products WHERE id = ?').get(req.params.id);
    if (old?.image_url) {
      const oldPath = path.join(__dirname, '..', old.image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    db.prepare("UPDATE products SET image_url = ?, updated_at = datetime('now'), synced=0 WHERE id = ?").run(imageUrl, req.params.id);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product image
router.delete('/:id/image', auth, (req, res) => {
  try {
    const old = db.prepare('SELECT image_url FROM products WHERE id = ?').get(req.params.id);
    if (old?.image_url) {
      const oldPath = path.join(__dirname, '..', old.image_url);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.prepare("UPDATE products SET image_url = NULL, updated_at = datetime('now'), synced=0 WHERE id = ?").run(req.params.id);
    res.json({ message: 'Image removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
router.delete('/:id', auth, (req, res) => {
  try {
    db.prepare("UPDATE products SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
