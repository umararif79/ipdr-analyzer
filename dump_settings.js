
import Database from 'better-sqlite3';
const db = new Database('local_system.db');
const rows = db.prepare("SELECT * FROM system_settings WHERE key LIKE 'PROXMOX_%'").all();
console.log(JSON.stringify(rows, null, 2));
