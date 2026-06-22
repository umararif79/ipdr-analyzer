import 'dotenv/config';
import db from './localdb.js';
import logger from './logger.js';

const secretsToMigrate = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'SENSITIVE_DATA_ENCRYPTION_KEY',
  'PROXMOX_HOST',
  'PROXMOX_USERNAME',
  'PROXMOX_PASSWORD',
  'CLICKHOUSE_HOST',
  'CLICKHOUSE_USER',
  'CLICKHOUSE_PASSWORD',
  'CLICKHOUSE_DATABASE'
];

async function migrate() {
  logger.info('[Migration] Starting secret migration from .env to localdb...');
  
  const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
  
  let migratedCount = 0;
  for (const key of secretsToMigrate) {
    const value = process.env[key];
    if (value) {
      stmt.run(key, value);
      logger.info(`[Migration] Migrated ${key}`);
      migratedCount++;
    } else {
      logger.warn(`[Migration] ${key} not found in .env, skipping.`);
    }
  }
  
  logger.info(`[Migration] Successfully migrated ${migratedCount} secrets to localdb.`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
