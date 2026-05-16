
import db from './localdb.js';

const migrationDone = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE name = 'migration_multi_conn'").get().count > 0;

if (!migrationDone) {
  console.log('🚀 Running migration: users.connection_id -> user_connections');
  const tx = db.transaction(() => {
    const usersWithConn = db.prepare('SELECT id, connection_id FROM users WHERE connection_id IS NOT NULL').all();
    for (const user of usersWithConn) {
      db.prepare('INSERT OR IGNORE INTO user_connections (user_id, connection_id) VALUES (?, ?)').run(user.id, user.connection_id);
    }
    db.exec('CREATE TABLE migration_multi_conn (id INTEGER PRIMARY KEY)');
  });
  tx();
  console.log('✅ Migration completed.');
} else {
  console.log('ℹ️ Migration already performed.');
}
