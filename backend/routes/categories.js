const router = require('express').Router();
const db = require('../config/database');
const syncConfig = require('../config/syncConfig');
const { randomUUID } = require('crypto');
const multer = require('multer');

const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, j) => { row[h] = vals[j] !== undefined ? vals[j] : ''; });
    rows.push(row);
  }
  return rows;
}

router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, color } = req.body;
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    const info = db.prepare(
      "INSERT INTO categories (name, color, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
    ).run(name, color, randomUUID(), tenantId, branchId, deviceId);
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, color } = req.body;
    const info = db.prepare(
      "UPDATE categories SET name=?, color=?, updated_at=datetime('now'), synced=0 WHERE id=?"
    ).run(name, color, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Category not found' });
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/all', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare("UPDATE products SET category_id = NULL, synced=0, updated_at=datetime('now') WHERE category_id IS NOT NULL AND deleted_at IS NULL").run();
      db.prepare("UPDATE categories SET deleted_at=datetime('now'), synced=0 WHERE deleted_at IS NULL").run();
    })();
    res.json({ message: 'All categories deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/import', csvUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const text = req.file.buffer.toString('utf8');
    const rows = parseCSV(text);
    const { tenantId, branchId, deviceId } = syncConfig.getConfig();
    let imported = 0, skipped = 0;
    const insertStmt = db.prepare(
      "INSERT INTO categories (name, color, sync_id, tenant_id, branch_id, device_id, synced, created_at, updated_at) VALUES (?,?,?,?,?,?,0,datetime('now'),datetime('now'))"
    );
    const checkStmt = db.prepare("SELECT id FROM categories WHERE name = ? AND deleted_at IS NULL");
    db.transaction(() => {
      for (const row of rows) {
        const name = row.name?.trim();
        const color = row.color?.trim() || '#6b7280';
        if (!name) { skipped++; continue; }
        const existing = checkStmt.get(name);
        if (existing) { skipped++; continue; }
        insertStmt.run(name, color, randomUUID(), tenantId, branchId, deviceId);
        imported++;
      }
    })();
    res.json({ imported, skipped, message: `Imported ${imported} categories. Skipped ${skipped} (duplicates or empty).` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(req.params.id);
      db.prepare("UPDATE categories SET deleted_at=datetime('now'), synced=0 WHERE id=?").run(req.params.id);
    })();
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
