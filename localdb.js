import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_FILE = path.join(process.cwd(), 'local_system.db');
const db = new Database(DB_FILE);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    host TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    database TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_connections (
    user_id INTEGER NOT NULL,
    connection_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, connection_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS favorite_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filter_values TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY,
    dashboard_layout TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS warrants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    operator TEXT NOT NULL,
    value TEXT NOT NULL,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    warrant_id INTEGER NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    log_sample TEXT,
    resolved BOOLEAN DEFAULT 0,
    FOREIGN KEY (warrant_id) REFERENCES warrants(id) ON DELETE CASCADE
  );

`);

// Seed Admin User and Ensure Default Connection is Correct
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

// ALWAYS update the default connection credentials from .env to avoid "Authentication failed" on existing DBs
const connections = db.prepare('SELECT id FROM connections LIMIT 1').get();
if (connections) {
  db.prepare(`
    UPDATE connections
    SET host = ?, username = ?, password = ?, database = ?
    WHERE id = ?
  `).run(
    process.env.CLICKHOUSE_HOST || 'http://10.202.1.206:8123',
    process.env.CLICKHOUSE_USER || 'default',
    process.env.CLICKHOUSE_PASSWORD || 'umarumar',
    process.env.CLICKHOUSE_DATABASE || 'syslogdb',
    connections.id
  );
} else {
  db.prepare(`
    INSERT INTO connections (label, host, username, password, database)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Default Cluster',
    process.env.CLICKHOUSE_HOST || 'http://10.202.1.206:8123',
    process.env.CLICKHOUSE_USER || 'default',
    process.env.CLICKHOUSE_PASSWORD || 'umarumar',
    process.env.CLICKHOUSE_DATABASE || 'syslogdb'
  );
}

if (!adminExists) {
  const bcrypt = await import('bcryptjs');
  const adminHash = await bcrypt.hash('admin123', 10);

  db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `).run('admin', adminHash, 'admin');

  const firstConn = db.prepare('SELECT id FROM connections LIMIT 1').get();
  if (firstConn) {
    const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    db.prepare(`
      INSERT OR IGNORE INTO user_connections (user_id, connection_id)
      VALUES (?, ?)
    `).run(adminUser.id, firstConn.id);
  }

  console.log('  ✅ Seeded default admin user: admin / admin123');
}

export default db;
