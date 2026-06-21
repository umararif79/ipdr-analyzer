import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createClient } from '@clickhouse/client';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import db from './localdb.js';
import { generateToken, authMiddleware, adminMiddleware, roleMiddleware } from './auth.js';
import logger from './logger.js';
import { encrypt, decrypt } from './crypto.js';
import { sendNotification } from './src/services/notificationService.js';
import rateLimit from 'express-rate-limit';

import { getClickHouseClient, resolveActiveConnections, getFullyQualifiedView, cachedColumns } from './src/services/connectionService.js';
import { buildWhereClause, resolveColumn, getPeriodDateRange, getPreviousPeriodDateRange, fetchStatsForRange } from './src/services/queryService.js';
import { logAuditAction } from './src/services/auditService.js';
import { runWarrantMonitor, runAnomalyDetection } from './src/services/monitoringService.js';
import { validate, schemas } from './src/services/validationService.js';
import proxmoxService from './src/services/proxmoxService.js';

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
  process.exit(1);
}

const app = express();
console.log(`[SERVER BOOT] Starting server at ${new Date().toISOString()} - Version 2.2`);
app.use(cors());
app.use(compression());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);

app.use((req, res, next) => {
  logger.info(`[HTTP] ${req.method} ${req.url}`);
  next();
});

const VIEW = 'view_parsed_logs';

app.get('/api/debug/secret', (req, res) => {
  res.json({ secret: process.env.JWT_SECRET || 'ipdr-secret-key-2026' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/health', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    const healthResults = await Promise.all(activeIds.map(async (id) => {
      try {
        const client = await getClickHouseClient(id);
        const res = await client.query({ query: 'SELECT 1', format: 'JSON' });
        await res.json();
        return { id, status: 'ok' };
      } catch (err) { return { id, status: 'error', message: err.message }; }
    }));
    const allOk = healthResults.every(r => r.status === 'ok');
    res.json({ status: allOk ? 'ok' : 'partial_error', connections: healthResults, timestamp: new Date().toISOString() });
  } catch (err) { res.status(400).json({ status: 'error', message: err.message }); }
});

app.get('/', (req, res) => { res.sendFile(path.join(process.cwd(), 'index.html')); });
app.get('/login', (req, res) => { res.sendFile(path.join(process.cwd(), 'login.html')); });
app.get('/login.html', (req, res) => { res.sendFile(path.join(process.cwd(), 'login.html')); });
app.get('/api-docs', (req, res) => { res.sendFile(path.join(process.cwd(), 'api-docs.html')); });

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = generateToken(user);
    res.json({ token, user: { username: user.username, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/logout', (req, res) => { res.json({ message: 'Logged out successfully' }); });

app.delete('/api/admin/connections/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
    if (!conn) return res.status(404).json({ error: 'Connection not found' });

    const result = db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    await logAuditAction(req.user.id, 'DELETE', 'connection', id, conn, null, req);
    res.json({ message: 'Connection deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    await logAuditAction(req.user.id, 'DELETE', 'user', id, user, null, req);
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/connections', authMiddleware, roleMiddleware(['admin', 'manager', 'auditor']), (req, res) => {
  const conns = db.prepare('SELECT id, label, host, username, database FROM connections').all();
  res.json(conns);
});

app.post('/api/admin/connections', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.connection.create), async (req, res) => {
  try {
    const { label, host, username, password, database } = req.body;
    const encryptedPassword = encrypt(password);
    const result = db.prepare(`INSERT INTO connections (label, host, username, password, database) VALUES (?, ?, ?, ?, ?)`).run(label, host, username, encryptedPassword, database);
    const id = result.lastInsertRowid;
    await logAuditAction(req.user.id, 'CREATE', 'connection', id, null, { label, host, username, database }, req);
    res.json({ id, message: 'Connection created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/users', authMiddleware, roleMiddleware(['admin', 'manager', 'auditor']), (req, res) => {
  const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
  const usersWithConns = users.map(user => {
    const conns = db.prepare('SELECT connection_id FROM user_connections WHERE user_id = ?').all(user.id);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at,
      connectionIds: conns.map(c => c.connection_id)
    };
  });
  res.json(usersWithConns);
});

app.post('/api/admin/users', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.user.create), async (req, res) => {
  try {
    const { username, password, connectionIds, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`).run(username, hash, role);
    const userId = result.lastInsertRowid;
    if (connectionIds) {
      const ids = Array.isArray(connectionIds) ? connectionIds : [connectionIds];
      const normalizedIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      const insertConn = db.prepare('INSERT INTO user_connections (user_id, connection_id) VALUES (?, ?)');
      const tx = db.transaction((idList) => { for (const id of idList) insertConn.run(userId, id); });
      tx(normalizedIds);
    }
    await logAuditAction(req.user.id, 'CREATE', 'user', userId, null, { username, role, connectionIds }, req);
    res.json({ id: userId, message: 'User created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/connections/:id', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.connection.update), async (req, res) => {
  try {
    const { id } = req.params;
    const { label, host, username, password, database } = req.body;
    const oldConn = db.prepare('SELECT * FROM connections WHERE id = ?').get(id);
    if (!oldConn) return res.status(404).json({ error: 'Connection not found' });

    if (password && password.trim() !== '') {
      const encryptedPassword = encrypt(password);
      const result = db.prepare(`UPDATE connections SET label = ?, host = ?, username = ?, password = ?, \`database\` = ? WHERE id = ?`).run(label, host, username, encryptedPassword, database, id);
      if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
    } else {
      const result = db.prepare(`UPDATE connections SET label = ?, host = ?, username = ?, \`database\` = ? WHERE id = ?`).run(label, host, username, database, id);
      if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
    }
    await logAuditAction(req.user.id, 'UPDATE', 'connection', id, oldConn, { label, host, username, database }, req);
    res.json({ message: 'Connection updated' });
  } catch (err) { logger.error(`[ERROR] Connection Update failed: ${err.message}`); res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.user.update), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, connectionIds, role } = req.body;
    const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!oldUser) return res.status(404).json({ error: 'User not found' });

    let updateQuery = 'UPDATE users SET username = ?, role = ? WHERE id = ?';
    let params = [username, role, id];
    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      updateQuery = 'UPDATE users SET username = ?, password_hash = ?, role = ? WHERE id = ?';
      params = [username, hash, role, id];
    }
    const result = db.prepare(updateQuery).run(...params);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    if (connectionIds) {
      const ids = Array.isArray(connectionIds) ? connectionIds : [connectionIds];
      const normalizedIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      db.prepare('DELETE FROM user_connections WHERE user_id = ?').run(id);
      const insertConn = db.prepare('INSERT INTO user_connections (user_id, connection_id) VALUES (?, ?)');
      const tx = db.transaction((idList) => { for (const connId of idList) insertConn.run(id, connId); });
      tx(normalizedIds);
    }
    await logAuditAction(req.user.id, 'UPDATE', 'user', id, oldUser, { username, role, connectionIds }, req);
    res.json({ message: 'User updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── User Personalization ──────────────────────────────────────────────

app.get('/api/filters/favorites', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const favorites = db.prepare('SELECT * FROM favorite_filters WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    res.json(favorites);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/filters/favorites', authMiddleware, (req, res) => {
  try {
    const { name, filter_values } = req.body;
    const userId = req.user.id;
    if (!name || !filter_values) return res.status(400).json({ error: 'Name and filter_values are required' });
    const result = db.prepare('INSERT INTO favorite_filters (user_id, name, filter_values) VALUES (?, ?, ?)')
      .run(userId, name, JSON.stringify(filter_values));
    res.json({ id: result.lastInsertRowid, message: 'Favorite filter saved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/filters/favorites/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const result = db.prepare('DELETE FROM favorite_filters WHERE id = ? AND user_id = ?').run(id, userId);
    if (result.changes === 0) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ message: 'Favorite deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/preferences', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const pref = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
    res.json(pref || { dashboard_layout: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/preferences', authMiddleware, (req, res) => {
  try {
    const { dashboard_layout } = req.body;
    const userId = req.user.id;
    db.prepare('INSERT OR REPLACE INTO user_preferences (user_id, dashboard_layout, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(userId, JSON.stringify(dashboard_layout));
    res.json({ message: 'Preferences updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Warrant & Alert System ──────────────────────────────────────────────

app.get('/api/admin/warrants', authMiddleware, roleMiddleware(['admin', 'manager', 'auditor']), (req, res) => {
  try {
    const warrants = db.prepare('SELECT * FROM warrants ORDER BY created_at DESC').all();
    res.json(warrants);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/warrants', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.warrant.create), async (req, res) => {
  try {
    const { name, conditions } = req.body;
    if (!name || !conditions || !Array.isArray(conditions)) return res.status(400).json({ error: 'Name and conditions array are required' });
    const result = db.prepare('INSERT INTO warrants (name, conditions, active) VALUES (?, ?, ?)')
      .run(name, JSON.stringify(conditions), 1);
    const id = result.lastInsertRowid;
    await logAuditAction(req.user.id, 'CREATE', 'warrant', id, null, { name, conditions }, req);
    res.json({ id, message: 'Warrant created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/warrants/:id', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.warrant.update), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, conditions, active } = req.body;
    const oldWarrant = db.prepare('SELECT * FROM warrants WHERE id = ?').get(id);
    if (!oldWarrant) return res.status(404).json({ error: 'Warrant not found' });

    const params = [
      name ?? null,
      conditions ? JSON.stringify(conditions) : null,
      active ?? 1,
      id
    ];

    const result = db.prepare('UPDATE warrants SET name = ?, conditions = ?, active = ? WHERE id = ?')
      .run(...params);
    if (result.changes === 0) return res.status(404).json({ error: 'Warrant not found' });
    await logAuditAction(req.user.id, 'UPDATE', 'warrant', id, oldWarrant, { name, conditions, active }, req);
    res.json({ message: 'Warrant updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/warrants/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const warrant = db.prepare('SELECT * FROM warrants WHERE id = ?').get(id);
    if (!warrant) return res.status(404).json({ error: 'Warrant not found' });
    const result = db.prepare('DELETE FROM warrants WHERE id = ?').run(id);
    await logAuditAction(req.user.id, 'DELETE', 'warrant', id, warrant, null, req);
    res.json({ message: 'Warrant deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts', authMiddleware, (req, res) => {
  try {
    const alerts = db.prepare(`
      SELECT a.*, w.name as warrant_name
      FROM alerts a
      JOIN warrants w ON a.warrant_id = w.id
      WHERE a.resolved = 0
      ORDER BY a.detected_at DESC
    `).all();
    res.json(alerts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/alerts/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { resolved } = req.body;
    const result = db.prepare('UPDATE alerts SET resolved = ? WHERE id = ?').run(resolved, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ message: 'Alert status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/alerts/resolve-all', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE alerts SET resolved = 1').run();
    res.json({ message: 'All alerts resolved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/clear', authMiddleware, roleMiddleware(['admin', 'manager']), (req, res) => {
  try {
    db.prepare('DELETE FROM alerts').run();
    res.json({ message: 'Alert history cleared' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Proxmox Proxy Endpoints ──────────────────────────────────────────────

app.get('/api/infra/nodes', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const nodes = await proxmoxService.getNodes();
    res.json(nodes);
  } catch (err) {
    logger.error(`[Infra Bridge Error] Nodes: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch cluster nodes' });
  }
});

app.get('/api/infra/vms', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const vms = await proxmoxService.getVMs();
    res.json(vms);
  } catch (err) {
    logger.error(`[Infra Bridge Error] VMs: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch cluster VMs' });
  }
});

app.get('/api/infra/bras-list', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const bras = await proxmoxService.getStaticBrasIpSet();
    res.json(bras);
  } catch (err) {
    logger.error(`[Infra Bridge Error] Static BRAS IPSet: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch BRAS IPSet data' });
  }
});

app.post('/api/infra/bras', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const { cidr, deviceName, deviceLabel } = req.body;
    if (!cidr) return res.status(400).json({ error: 'CIDR is required' });

    const result = await proxmoxService.addBras(cidr, deviceName || '—', deviceLabel || '—');
    res.json({ data: result.data, message: 'BRAS entry added successfully' });
  } catch (err) {
    logger.error(`[Infra Bridge Error] Add BRAS: ${err.message}`);
    res.status(500).json({ error: 'Failed to add BRAS entry' });
  }
});

app.put('/api/infra/bras', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const { cidr, deviceName, deviceLabel } = req.body;
    if (!cidr) return res.status(400).json({ error: 'CIDR is required in request body' });

    const result = await proxmoxService.updateBras(cidr, deviceName || '—', deviceLabel || '—');
    res.json({ data: result.data, message: 'BRAS entry updated successfully' });
  } catch (err) {
    logger.error(`[Infra Bridge Error] Update BRAS: ${err.message}`);
    res.status(500).json({ error: 'Failed to update BRAS entry' });
  }
});

app.delete('/api/infra/bras', authMiddleware, roleMiddleware(['admin', 'manager']), async (req, res) => {
  try {
    const { cidr } = req.query;
    if (!cidr) return res.status(400).json({ error: 'CIDR is required as a query parameter' });
    const result = await proxmoxService.deleteBras(cidr);
    res.json({ data: result.data, message: 'BRAS entry deleted successfully' });
  } catch (err) {
    logger.error(`[Infra Bridge Error] Delete BRAS: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete BRAS entry' });
  }
});

app.get('/api/admin/settings', authMiddleware, roleMiddleware(['admin', 'manager', 'auditor']), (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings').all();
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/settings', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.settings.update), async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    const oldSetting = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, String(value));
    await logAuditAction(req.user.id, 'UPDATE', 'setting', key, oldSetting, { key, value }, req);
    res.json({ message: 'Setting updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/notifications', authMiddleware, roleMiddleware(['admin', 'manager', 'auditor']), (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings WHERE key LIKE "notif_%"').all();
    const config = {};
    settings.forEach(s => { config[s.key.replace('notif_', '')] = s.value; });
    res.json(config);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/notifications', authMiddleware, roleMiddleware(['admin', 'manager']), validate(schemas.notifications.update), async (req, res) => {
  try {
    const { provider, token, chatId, webhookUrl } = req.body;
    if (!provider) return res.status(400).json({ error: 'Provider is required' });

    const settings = [];
    if (provider === 'telegram') {
      settings.push({ key: 'notif_provider', value: 'telegram' });
      if (token) settings.push({ key: 'notif_token', value: token });
      if (chatId) settings.push({ key: 'notif_chatid', value: chatId });
    } else if (provider === 'slack') {
      settings.push({ key: 'notif_provider', value: 'slack' });
      if (webhookUrl) settings.push({ key: 'notif_webhook', value: webhookUrl });
    }

    for (const s of settings) {
      db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(s.key, s.value);
    }
    await logAuditAction(req.user.id, 'UPDATE', 'notifications', null, null, { provider, token, chatId, webhookUrl }, req);
    res.json({ message: 'Notification settings updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/related', authMiddleware, async (req, res) => {
  try {
    const { src_ip, timestamp } = req.query;
    if (!src_ip || !timestamp) return res.status(400).json({ error: 'src_ip and timestamp are required' });

    const activeIds = await resolveActiveConnections(req);
    const results = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);

      const query = `SELECT * FROM ${viewName} WHERE src_ip = ? AND log_datetime BETWEEN toDateTime64('${timestamp}') - INTERVAL 5 MINUTE AND toDateTime64('${timestamp}') + INTERVAL 5 MINUTE ORDER BY log_datetime ASC`;
      const result = await client.query({ query, params: [src_ip], format: 'JSONEachRow' });
      return await result.json();
    }));

    res.json(results.flat());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats/global', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    if (!activeIds || activeIds.length === 0) {
      return res.json({ summary: {}, brasDistribution: [], topDestinations: [], topCountries: [], topApps: [], topOrgs: [], hourlyTraffic: [], previousHourlyTraffic: [], heatmap: {} });
    }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Fetch all three sets of stats in parallel to avoid sequential blocking and reduce overall request time
    const [stats, currentDayStats, prevDayStats] = await Promise.all([
      fetchStatsForRange(activeIds, { datefrom: yesterdayStr, dateto: today }, cachedColumns),
      fetchStatsForRange(activeIds, { datefrom: today, dateto: today }, cachedColumns),
      fetchStatsForRange(activeIds, { datefrom: yesterdayStr, dateto: yesterdayStr }, cachedColumns)
    ]);

    // Merge results
    const finalStats = {
      ...stats,
      hourlyTraffic: currentDayStats.hourlyTraffic,
      previousHourlyTraffic: prevDayStats.hourlyTraffic,
    };

    // Traffic Heatmap (30 Days) - handled separately as it's a large query
    const heatmapData = await Promise.all(activeIds.map(async (connId) => {
      try {
        const client = await getClickHouseClient(connId);
        const viewName = getFullyQualifiedView(connId);
        const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
        const result = await client.query({
          query: `SELECT toDate(${tsCol}) as date, toHour(${tsCol}) as hour, count() as cnt FROM ${viewName} WHERE ${tsCol} >= toDate(now() - interval 30 day) GROUP BY date, hour ORDER BY date, hour`,
          format: 'JSON'
        });
        return await result.json();
      } catch (e) {
        logger.error(`[Global Heatmap Error] Connection ${connId}: ${e.message}`);
        return { data: [] };
      }
    }));

    const mergedHeatmap = heatmapData.flatMap(r => r.data || []).reduce((acc, item) => {
      const key = `${item.date}_${item.hour}`;
      acc[key] = (acc[key] || 0) + item.cnt;
      return acc;
    }, {});

    finalStats.heatmap = mergedHeatmap;

    res.json(finalStats);
  } catch (err) {
    logger.error(`[Global Stats Error] ${err.stack || err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/bras-distribution', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);

    const distributionResults = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const query = `
        SELECT
            toDate(log_datetime) as date,
            device_label as bras,
            count() as cnt
        FROM ${viewName}
        WHERE log_datetime >= today() - 6
        GROUP BY date, bras
        ORDER BY date ASC`;
      const result = await client.query({ query, format: 'JSON' });
      return await result.json();
    }));

    const inactiveResults = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const query = `
        SELECT
            device_label as bras,
            MAX(toDate(log_datetime)) as last_seen
        FROM ${viewName}
        GROUP BY bras
        HAVING last_seen < today() - 6
        ORDER BY last_seen ASC`;
      const result = await client.query({ query, format: 'JSON' });
      return await result.json();
    }));

    // Process distribution data
    const allRows = distributionResults.flatMap(r => r.data || []);
    const dateMap = {};
    allRows.forEach(row => {
      if (!dateMap[row.date]) dateMap[row.date] = {};
      dateMap[row.date][row.bras] = (dateMap[row.date][row.bras] || 0) + row.cnt;
    });
    const distribution = Object.entries(dateMap).map(([date, data]) => ({ date, data })).sort((a, b) => a.date.localeCompare(b.date));

    // Process inactive BRAS
    const inactiveBras = inactiveResults.flatMap(r => r.data || []).map(item => ({
      bras: item.bras,
      lastSeen: item.last_seen
    }));

    res.json({ distribution, inactiveBras });
  } catch (err) {
    logger.error(`[BRAS Dist Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/hourly-traffic', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    const results = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
      const query = `SELECT toHour(${tsCol}) as hour, count() as cnt FROM ${viewName} WHERE ${tsCol} >= toStartOfDay(now()) GROUP BY hour ORDER BY hour`;
      const result = await client.query({ query, format: 'JSON' });
      return await result.json();
    }));
    const merged = results.flatMap(r => r.data || []).reduce((acc, item) => {
      acc[item.hour] = (acc[item.hour] || 0) + item.cnt;
      return acc;
    }, {});
    const final = Object.entries(merged).map(([hour, cnt]) => ({ hour: parseInt(hour), cnt }));
    res.json(final.sort((a, b) => a.hour - b.hour));
  } catch (err) {
    logger.error(`[Hourly Traffic Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/traffic-trend', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    const results = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
      const query = `SELECT toHour(${tsCol}) as hour, count() as cnt FROM ${viewName} WHERE ${tsCol} >= toStartOfDay(now() - interval 1 day) AND ${tsCol} < toStartOfDay(now()) GROUP BY hour ORDER BY hour`;
      const result = await client.query({ query, format: 'JSON' });
      return await result.json();
    }));
    const merged = results.flatMap(r => r.data || []).reduce((acc, item) => {
      acc[item.hour] = (acc[item.hour] || 0) + item.cnt;
      return acc;
    }, {});
    const final = Object.entries(merged).map(([hour, cnt]) => ({ hour: parseInt(hour), cnt }));
    res.json(final.sort((a, b) => a.hour - b.hour));
  } catch (err) {
    logger.error(`[Traffic Trend Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats/heatmap', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    const results = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
      const query = `SELECT toDate(${tsCol}) as date, toHour(${tsCol}) as hour, count() as cnt FROM ${viewName} WHERE ${tsCol} >= toDate(now() - interval 30 day) GROUP BY date, hour ORDER BY date, hour`;
      const result = await client.query({ query, format: 'JSON' });
      return await result.json();
    }));
    const merged = results.flatMap(r => r.data || []).reduce((acc, item) => {
      const key = `${item.date}_${item.hour}`;
      acc[key] = (acc[key] || 0) + item.cnt;
      return acc;
    }, {});
    res.json(merged);
  } catch (err) {
    logger.error(`[Heatmap Error] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

async function initColumns(connectionId) {
  try {
    const client = await getClickHouseClient(connectionId);
    const viewName = getFullyQualifiedView(connectionId);
    const result = await client.query({ query: `DESCRIBE TABLE ${viewName}`, format: 'JSON' });
    const data = await result.json();
    const cols = data.data.map(col => ({ name: col.name, type: col.type })).filter(c => c && c.name);
    cachedColumns.set(connectionId, cols);
    return cols;
  } catch (err) { return null; }
}

app.get('/api/columns', authMiddleware, async (req, res) => {
  try {
    const activeIds = await resolveActiveConnections(req);
    const allCols = [];
    for (const id of activeIds) {
      if (cachedColumns.has(id) && !req.query.refresh) {
        allCols.push(...cachedColumns.get(id));
      } else {
        const cols = await initColumns(id);
        if (cols) allCols.push(...cols);
      }
    }
    const uniqueCols = Array.from(new Map(allCols.filter(c => c && c.name).map(c => [c.name, c])).values());
    res.json(uniqueCols);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/query', authMiddleware, validate(schemas.query.body), async (req, res) => {
  try {
    logger.info(`\n[API] Incoming Query: ${JSON.stringify(req.body, null, 2)}`);
    const { filters = {}, page = 1, pageSize = 50, sortColumn = '', sortOrder = 'DESC' } = req.body;
    const limit = Math.min(parseInt(pageSize, 10) || 50, 10000);
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const activeIds = await resolveActiveConnections(req);
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const queryResults = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const { where, params } = buildWhereClause(filters, connId, cachedColumns);

      let orderCol = resolveColumn(sortColumn, connId, cachedColumns);
      if (!orderCol && sortColumn === 'timestamp') {
        const cols = cachedColumns.get(connId) || [];
        if (cols.some(c => c.name === 'log_date')) {
          orderCol = 'log_date';
        }
      }
      if (!orderCol) orderCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_date';

      const escapedView = viewName.includes('.') ? `\`${viewName.split('.')[0]}\`.\`${viewName.split('.')[1]}\`` : `\`${viewName}\``;
      const whereClause = where ? ` ${where}` : '';
      const query = `SELECT * FROM ${escapedView}${whereClause} ORDER BY \`${orderCol}\` ${order} LIMIT ${limit} OFFSET ${offset}`;

      const debugRow = await db.prepare('SELECT value FROM system_settings WHERE key = ?').get('debug_mode');
      const debugEnabled = debugRow?.value === 'true';

      if (debugEnabled) {
        logger.info(`\n[DEBUG-EXECUTION] 🚀 Sending to ClickHouse:`);
        logger.info(`  SQL: ${query}`);
        logger.info(`  Params: ${JSON.stringify(params, null, 2)}`);
        logger.info(`  Connection: ${connId}\n`);
      }

      const result = await client.query({ query, params, format: 'JSONEachRow', abort_signal: controller.signal });
      const rows = await result.json();

      let total = 0;
      const countQuery = `SELECT count() as total FROM ${escapedView}${whereClause}`;
      const countResult = await client.query({ query: countQuery, params, format: 'JSON', abort_signal: controller.signal });
      const countData = await countResult.json();
      total = parseInt(countData.data[0].total, 10);

      return { rows, total, connId, query, params };
    }));

    const combinedRows = queryResults.flatMap(r => r.rows);
    const combinedTotal = queryResults.reduce((acc, r) => acc + r.total, 0);

    const debugRow = await db.prepare('SELECT value FROM system_settings WHERE key = ?').get('debug_mode');
    const debugEnabled = debugRow?.value === 'true';
    logger.info(`[DebugSetting] debug_mode: ${debugRow?.value}, enabled: ${debugEnabled}`);

    const debugSql = debugEnabled
      ? queryResults.map(r => `Connection ${r.connId}: ${r.query} | Params: ${JSON.stringify(r.params)}`).join('\n')
      : null;

    res.json({ data: combinedRows, total: combinedTotal, page: Math.floor(offset / limit) + 1, pageSize: limit, totalPages: Math.ceil(combinedTotal / limit), debugSql });
  } catch (err) {
    if (err.name === 'AbortError') return;
    logger.error(`Query failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/export', authMiddleware, async (req, res) => {
  try {
    const { filters = {}, maxRows = 50000 } = req.body;
    const activeIds = await resolveActiveConnections(req);
    const csvParts = await Promise.all(activeIds.map(async (connId) => {
      const client = await getClickHouseClient(connId);
      const viewName = getFullyQualifiedView(connId);
      const { where, params } = buildWhereClause(filters, connId, cachedColumns);
      const safeMax = Math.min(parseInt(maxRows, 10) || 50000, 100000);
      const result = await client.query({ query: `SELECT * FROM ${viewName} ${where} LIMIT ${safeMax}`, params, format: 'CSVWithNames' });
      return await result.text();
    }));
    let combinedCsv = csvParts[0] || '';
    for (let i = 1; i < csvParts.length; i++) {
      const lines = csvParts[i].split('\\n');
      combinedCsv += '\\n' + lines.slice(1).join('\\n');
    }

    let filterString = 'all';
    const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== 'datefrom' && k !== 'dateto');
    if (activeFilters.length > 0) {
      filterString = activeFilters.map(([k, v]) => `${k}-${v}`).join('_');
    }
    const filename = `ipdr_export_${Date.now()}_${filterString}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(combinedCsv);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/stats', authMiddleware, async (req, res) => {
  try {
    const { filters = {} } = req.body;
    const modifiedFilters = { ...filters };

    // Normalize filter keys to lowercase for consistency
    const normalized = {};
    Object.entries(modifiedFilters).forEach(([k, v]) => {
      normalized[k.toLowerCase()] = v;
    });

    if (!normalized.datefrom || !normalized.dateto) {
      const statsRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('stats_period');
      const statsPeriod = statsRow?.value || 'today';
      const periodRange = getPeriodDateRange(statsPeriod);
      if (periodRange) {
        modifiedFilters.datefrom = modifiedFilters.datefrom || normalized.datefrom || periodRange.datefrom;
        modifiedFilters.dateto = modifiedFilters.dateto || normalized.dateto || periodRange.dateto;
        logger.info(`[Stats] Applying global period [${statsPeriod}] as fallback: ${periodRange.datefrom} to ${periodRange.dateto}`);
      }
    }

    const activeIds = await resolveActiveConnections(req);
    const currentStats = await fetchStatsForRange(activeIds, modifiedFilters, cachedColumns);

    const currentRange = { datefrom: modifiedFilters.datefrom, dateto: modifiedFilters.dateto };
    const prevRange = getPreviousPeriodDateRange(currentRange);
    let prevTraffic = [];
    if (prevRange) {
      const prevStats = await fetchStatsForRange(activeIds, prevRange, cachedColumns);
      prevTraffic = prevStats.hourlyTraffic;
    }

    const heatmapData = await Promise.all(activeIds.map(async (connId) => {
      try {
        const client = await getClickHouseClient(connId);
        const viewName = getFullyQualifiedView(connId);
        const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
// laB de l'utilisateur.L'un des filtres_date est absent, donc on utilise la plage par défaut.
        const { where, params } = buildWhereClause(modifiedFilters, connId, cachedColumns, { excludeDates: true });
        const whereClause = where ? ` AND ${where.replace('WHERE', '').trim()}` : '';
        const result = await client.query({
          query: `SELECT toDate(${tsCol}) as date, toHour(${tsCol}) as hour, count() as cnt FROM ${viewName} WHERE ${tsCol} >= toDate(now() - interval 30 day) ${whereClause} GROUP BY date, hour ORDER BY date, hour`,
          params,
          format: 'JSON'
        });
        return await result.json();
// laB de l'utilisateur.L'un des filtres_date est absent, donc on utilise la plage par défaut.
      } catch (e) {
        logger.error(`[Heatmap Error] Connection ${connId}: ${e.message}`);
        return { data: [] };
      }
    }));
    const mergedHeatmap = heatmapData.flatMap(r => r.data || []).reduce((acc, item) => {
      const key = `${item.date}_${item.hour}`;
      acc[key] = (acc[key] || 0) + item.cnt;
      return acc;
    }, {});

    res.json({
      ...currentStats,
      previousHourlyTraffic: prevTraffic,
      heatmap: mergedHeatmap
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    logger.error(`[Stats API Error] ${err.stack || err.message}`);
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🔒 IPDR API Server running on http://localhost:${PORT}`);
  console.log(`  📊 ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}`);
  console.log(`  📁 Database:   ${process.env.CLICKHOUSE_DATABASE || 'syslogdb'}`);
  console.log(`  👁  View:       ${VIEW}\n`);
});

setInterval(runAnomalyDetection, 60 * 60 * 1000);
setInterval(runWarrantMonitor, 15 * 60 * 1000);
logger.info(`[Schedules] Anomaly detection (1h), Warrant monitor (15m)`);
