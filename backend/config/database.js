const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let dbPath;
if (process.env.DB_PATH) {
  // VPS: explicit path from .env
  dbPath = process.env.DB_PATH;
} else if (process.env.ELECTRON_USER_DATA) {
  // Electron: store in user data dir
  dbPath = path.join(process.env.ELECTRON_USER_DATA, 'butchery.db');
} else {
  // Local dev
  dbPath = path.join(__dirname, '..', 'butchery.db');
}

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// WAL mode for better performance; enforce foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Connected to SQLite database');

module.exports = db;
