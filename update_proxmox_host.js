
import Database from 'better-sqlite3';
const db = new Database('local_system.db');
const result = db.prepare("UPDATE system_settings SET value = 'https://10.202.1.201:8006' WHERE key = 'PROXMOX_HOST'").run();
console.log(`Updated PROXMOX_HOST: ${result.changes} row(s) modified`);
