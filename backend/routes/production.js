const router = require('express').Router();
const db = require('../config/database');
const { auth, readOnlyGuard } = require('../middleware/auth');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');

// GET /api/production
router.get('/', auth, readOnlyGuard, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM production_inputs WHERE production_sync_id = p.sync_id AND deleted_at IS NULL) AS input_count,
        (SELECT COUNT(*) FROM production_outputs WHERE production_sync_id = p.sync_id AND deleted_at IS NULL) AS output_count,
        (SELECT COALESCE(SUM(total_cost), 0) FROM production_inputs WHERE production_sync_id = p.sync_id AND deleted_at IS NULL) AS total_input_cost,
        (SELECT COALESCE(SUM(quantity), 0) FROM production_outputs WHERE production_sync_id = p.sync_id AND deleted_at IS NULL) AS total_output_qty
      FROM production p
      WHERE p.deleted_at IS NULL AND p.tenant_id = ?
      ORDER BY p.date DESC, p.id DESC
    `).all(req.user.tenantId);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/production/stats
router.get('/stats', auth, readOnlyGuard, (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const total = db.prepare('SELECT COUNT(*) AS cnt FROM production WHERE deleted_at IS NULL AND tenant_id = ?').get(tenantId);
    const thisMonth = db.prepare("SELECT COUNT(*) AS cnt FROM production WHERE deleted_at IS NULL AND tenant_id = ? AND date >= date('now', 'start of month')").get(tenantId);
    res.json({ total: total.cnt, thisMonth: thisMonth.cnt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/production/:id
router.get('/:id', auth, readOnlyGuard, (req, res) => {
  try {
    const entry = db.prepare('SELECT * FROM production WHERE id = ? AND deleted_at IS NULL AND tenant_id = ?').get(req.params.id, req.user.tenantId);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    const inputs = db.prepare(`
      SELECT pi.*, p.name AS product_name, p.unit
      FROM production_inputs pi
      LEFT JOIN products p ON p.sync_id = pi.product_sync_id
      WHERE pi.production_sync_id = ? AND pi.deleted_at IS NULL
    `).all(entry.sync_id);
    const outputs = db.prepare(`
      SELECT po.*, p.name AS product_name, p.unit
      FROM production_outputs po
      LEFT JOIN products p ON p.sync_id = po.product_sync_id
      WHERE po.production_sync_id = ? AND po.deleted_at IS NULL
    `).all(entry.sync_id);
    res.json({ ...entry, inputs, outputs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/production
router.post('/', auth, (req, res) => {
  try {
    const { date, notes, inputs, outputs } = req.body;
    if (!inputs?.length) return res.status(400).json({ error: 'At least one input is required.' });
    if (!outputs?.length) return res.status(400).json({ error: 'At least one output is required.' });

    const result = db.transaction(() => {
      const prodNum = syncConfig.generateNumber('PRD', 'production');
      const { tenantId, branchId, deviceId } = syncConfig.getConfig();
      const prodDate = date || new Date().toISOString().split('T')[0];

      // Cost allocation by weight
      const totalInputCost = inputs.reduce((sum, i) => sum + parseFloat(i.quantity) * parseFloat(i.unit_cost || 0), 0);
      const totalOutputQty = outputs.reduce((sum, o) => sum + parseFloat(o.quantity), 0);
      const costPerKg = totalOutputQty > 0 ? totalInputCost / totalOutputQty : 0;

      // Insert production header
      const prodSyncId = randomUUID();
      const info = db.prepare(`
        INSERT INTO production (production_number, date, notes, total_input_cost, cost_per_kg, total_output_qty, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
      `).run(prodNum, prodDate, notes || null, totalInputCost, costPerKg, totalOutputQty,
             req.user.id, prodSyncId, tenantId, branchId, deviceId);
      const prodId = info.lastInsertRowid;

      // Inputs: record items + negative stock movements
      for (const input of inputs) {
        const qty = parseFloat(input.quantity);
        const unitCost = parseFloat(input.unit_cost || 0);
        const inputProd = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(input.product_id);
        const inputSyncId = inputProd?.sync_id || null;
        db.prepare(`
          INSERT INTO production_inputs (production_id, production_sync_id, product_id, product_sync_id, quantity, unit_cost, total_cost, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
        `).run(prodId, prodSyncId, input.product_id, inputSyncId, qty, unitCost, qty * unitCost,
               randomUUID(), tenantId, branchId, deviceId);
        db.prepare(`
          INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)
        `).run(input.product_id, inputSyncId, 'store', 'production_input', -qty, prodId, 'production',
               notes || null, req.user.id, randomUUID(), tenantId, branchId, deviceId, prodSyncId);
      }

      // Outputs: record items + positive stock movements + update product cost_price (weighted avg)
      for (const output of outputs) {
        const qty = parseFloat(output.quantity);
        const allocated = costPerKg;
        const outputProd = db.prepare('SELECT sync_id FROM products WHERE id = ?').get(output.product_id);
        const outputSyncId = outputProd?.sync_id || null;
        db.prepare(`
          INSERT INTO production_outputs (production_id, production_sync_id, product_id, product_sync_id, quantity, allocated_cost_per_unit, total_allocated_cost, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))
        `).run(prodId, prodSyncId, output.product_id, outputSyncId, qty, allocated, qty * allocated,
               randomUUID(), tenantId, branchId, deviceId);
        db.prepare(`
          INSERT INTO stock_movements (product_id, product_sync_id, location, movement_type, quantity, reference_id, reference_type, notes, created_by, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at, reference_sync_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'),datetime('now'),?)
        `).run(output.product_id, outputSyncId, 'store', 'production_output', qty, prodId, 'production',
               notes || null, req.user.id, randomUUID(), tenantId, branchId, deviceId, prodSyncId);
        // Update cost_price using weighted average across production runs
        if (allocated > 0) {
          const existing = db.prepare('SELECT cost_price FROM products WHERE id = ?').get(output.product_id);
          const balRow = db.prepare("SELECT COALESCE(SUM(quantity), 0) AS bal FROM stock_movements WHERE product_sync_id = ? AND location = 'store' AND deleted_at IS NULL").get(outputSyncId);
          const existingQty = Math.max(0, parseFloat(balRow.bal) - qty); // balance before this run
          const existingCost = parseFloat(existing?.cost_price) || 0;
          const weightedAvg = (existingQty + qty) > 0
            ? (existingQty * existingCost + qty * allocated) / (existingQty + qty)
            : allocated;
          db.prepare("UPDATE products SET cost_price=?, updated_at=datetime('now'), synced=0 WHERE id=?")
            .run(weightedAvg, output.product_id);
        }
      }

      return db.prepare('SELECT * FROM production WHERE id = ?').get(prodId);
    })();
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/production/:id
router.delete('/:id', auth, (req, res) => {
  try {
    const prod = db.prepare('SELECT sync_id FROM production WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Not found' });
    db.transaction(() => {
      // Use sync_id for cross-device FK integrity
      db.prepare("UPDATE stock_movements SET deleted_at=datetime('now'), synced=0 WHERE reference_sync_id=? AND reference_type='production' AND deleted_at IS NULL")
        .run(prod.sync_id);
      db.prepare("UPDATE production_inputs SET deleted_at=datetime('now'), synced=0 WHERE production_sync_id=?")
        .run(prod.sync_id);
      db.prepare("UPDATE production_outputs SET deleted_at=datetime('now'), synced=0 WHERE production_sync_id=?")
        .run(prod.sync_id);
      db.prepare("UPDATE production SET deleted_at=datetime('now'), synced=0 WHERE id=?")
        .run(req.params.id);
    })();
    res.json({ message: 'Production entry deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
