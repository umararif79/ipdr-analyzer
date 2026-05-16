import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { createClient } from '@clickhouse/client';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import db from './localdb.js';
import { generateToken, authMiddleware, adminMiddleware } from './auth.js';

const LOG_FILE = path.join(process.cwd(), 'server_debug.log');

function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logEntry);
  console.log(message);
}

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

app.use((req, res, next) => {
  writeLog(`[HTTP] ${req.method} ${req.url}`);
  next();
});

const clientCache = new Map();

async function getClickHouseClient(connectionId) {
  if (!connectionId) throw new Error('No connection ID provided');
  if (clientCache.has(connectionId)) return clientCache.get(connectionId);

  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId);
  if (!conn) throw new Error('Connection configuration not found');

  const client = createClient({
    url: conn.host,
    username: conn.username,
    password: conn.password,
    database: conn.database,
    request_timeout: 120000,
  });

  clientCache.set(connectionId, client);
  return client;
}

async function resolveActiveConnections(req) {
  const userId = req.user.id;
  const role = req.user.role;

  // Accept connectionIds from body or query
  const requested = req.body?.connectionIds || req.query?.connectionIds;

  const assigned = db.prepare('SELECT connection_id FROM user_connections WHERE user_id = ?').all(userId);
  const assignedIds = assigned.map(row => row.connection_id);

  writeLog(`[Auth] Resolving connections for user ${userId} (role: ${role}), requested: ${JSON.stringify(requested)}`);

  // Handle "0" (all available)
  if (requested === '0' || requested === [0]) {
    if (role === 'admin') {
      const all = db.prepare('SELECT id FROM connections').all().map(c => c.id);
      writeLog(`[Auth] Admin requested "0", returning all: ${JSON.stringify(all)}`);
      return all;
    }
    writeLog(`[Auth] User requested "0", returning assigned: ${JSON.stringify(assignedIds)}`);
    return assignedIds;
  }

  // Handle comma-separated string or array
  let ids = [];
  if (requested) {
    ids = Array.isArray(requested)
      ? requested
      : (typeof requested === 'string' ? requested.split(',') : [requested]);
    ids = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  }

  if (role === 'admin') {
    if (ids.length > 0) {
      writeLog(`[Auth] Admin requested specific IDs: ${JSON.stringify(ids)}`);
      return ids;
    }
    const all = db.prepare('SELECT id FROM connections').all().map(c => c.id);
    writeLog(`[Auth] Admin requested none, returning all: ${JSON.stringify(all)}`);
    return all;
  }

  if (ids.length > 0) {
    const validIds = ids.filter(id => assignedIds.includes(id));
    writeLog(`[Auth] User requested IDs ${JSON.stringify(ids)}, valid: ${JSON.stringify(validIds)}`);
    if (validIds.length === 0) throw new Error('No valid assigned connections selected');
    return validIds;
  }

  if (assignedIds.length === 1) return assignedIds;
  if (assignedIds.length > 1) throw new Error('Multiple connections available; please specify connectionIds (e.g. "0" for all, or "1,2" for specific ones)');
  throw new Error('No ClickHouse connections assigned to this user');
}

const VIEW = 'view_parsed_logs';

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

app.delete('/api/admin/connections/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM connections WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
    res.json({ message: 'Connection deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/connections', authMiddleware, adminMiddleware, (req, res) => {
  const conns = db.prepare('SELECT id, label, host, username, database FROM connections').all();
  res.json(conns);
});

app.post('/api/admin/connections', authMiddleware, adminMiddleware, (req, res) => {
  const { label, host, username, password, database } = req.body;
  const result = db.prepare(`INSERT INTO connections (label, host, username, password, database) VALUES (?, ?, ?, ?, ?)`).run(label, host, username, password, database);
  res.json({ id: result.lastInsertRowid, message: 'Connection created' });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
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

app.post('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
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
    res.json({ id: userId, message: 'User created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/connections/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { label, host, username, password, database } = req.body;
    if (password && password.trim() !== '') {
      const result = db.prepare(`UPDATE connections SET label = ?, host = ?, username = ?, password = ?, \`database\` = ? WHERE id = ?`).run(label, host, username, password, database, id);
      if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
    } else {
      const result = db.prepare(`UPDATE connections SET label = ?, host = ?, username = ?, \`database\` = ? WHERE id = ?`).run(label, host, username, database, id);
      if (result.changes === 0) return res.status(404).json({ error: 'Connection not found' });
    }
    res.json({ message: 'Connection updated' });
  } catch (err) { writeLog(`[ERROR] Connection Update failed: ${err.message}`); res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, connectionIds, role } = req.body;
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
    res.json({ message: 'User updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const settings = db.prepare('SELECT * FROM system_settings').all();
    res.json(settings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Key is required' });
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, String(value));
    res.json({ message: 'Setting updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Column Resolution ──────────────────────────────────────────────
const COLUMN_MAP = {
  timestamp: 'log_datetime',
  src_ip: 'src_ip',
  dst_ip: 'dest_ip',
  src_port: 'src_port',
  dst_port: 'dest_port',
  protocol: 'proto',
  username: 'pppoe_username',
  mac: 'src_mac',
};

async function getSystemSetting(key, defaultValue) {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function resolveColumn(logicalName, connectionId) {
  if (!cachedColumns.has(connectionId)) return null;
  const cols = cachedColumns.get(connectionId);

  const mapped = COLUMN_MAP[logicalName];
  if (mapped && cols.some(c => c.name === mapped)) return mapped;
  if (cols.some(c => c.name === logicalName)) return logicalName;
  return null;
}

function getFullyQualifiedView(connectionId) {
  const conn = db.prepare('SELECT database FROM connections WHERE id = ?').get(connectionId);
  return (conn && conn.database) ? `${conn.database}.${VIEW}` : VIEW;
}

function escapeString(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}

function buildWhereClause(filters, connectionId) {
  const conditions = [];
  const cols = cachedColumns.get(connectionId) || [];

  // Use log_date for date-only filters, log_datetime for precise time
  const dateCol = 'log_date';

  const normalizedFilters = {};
  for (const key in filters) { normalizedFilters[key.toLowerCase()] = filters[key]; }
  writeLog(`[Filter Debug] Normalized Filters: ${JSON.stringify(normalizedFilters)}`);

  const dateFrom = normalizedFilters.datefrom;
  const dateTo = normalizedFilters.dateto;

  if (dateFrom && dateCol) {
    const cleanDateFrom = typeof dateFrom === 'string' ? dateFrom.slice(0, 10) : dateFrom;
    conditions.push(`${dateCol} >= toDate('${cleanDateFrom}')`);
  }
  if (dateTo && dateCol) {
    const cleanDateTo = typeof dateTo === 'string' ? dateTo.slice(0, 10) : dateTo;
    conditions.push(`${dateCol} <= toDate('${cleanDateTo}')`);
  } else if (dateFrom && !dateTo && dateCol) {
    const now = new Date().toISOString().slice(0, 10);
    conditions.push(`${dateCol} <= toDate('${now}')`);
  }

  // Handle Generic Custom Filter
  const genericCol = normalizedFilters.genericcolumn;
  const genericVal = normalizedFilters.genericvalue;
  writeLog(`[Filter Debug] Generic Column: ${genericCol}, Generic Value: ${genericVal}`);
  if (genericCol && genericVal) {
    const resolvedGenericCol = resolveColumn(genericCol, connectionId);
    writeLog(`[Filter Debug] Resolved Generic Col: ${resolvedGenericCol}`);
    if (resolvedGenericCol) {
      const colMatch = cols.find(c => c.name === resolvedGenericCol);
      if (colMatch) {
        const colType = colMatch.type;
        writeLog(`[Filter Debug] Col Match Found: ${colMatch.name}, Type: ${colType}`);
        if (colType.includes('UInt') || colType.includes('Int')) {
          const val = parseInt(genericVal, 10);
          if (!isNaN(val)) conditions.push(`${resolvedGenericCol} = ${val}`);
        } else if (colType.includes('String')) {
          conditions.push(`${resolvedGenericCol} = '${escapeString(genericVal)}'`);
        } else {
          conditions.push(`toString(${resolvedGenericCol}) = '${escapeString(genericVal)}'`);
        }
      } else {
        writeLog(`[Filter Debug] Col Match NOT found for ${resolvedGenericCol} in cols list`);
      }
    } else {
      writeLog(`[Filter Debug] Could not resolve column ${genericCol}`);
    }
  }

  for (const [filterKey, filterVal] of Object.entries(normalizedFilters)) {
    if (filterKey === 'datefrom' || filterKey === 'dateto' || filterKey === 'genericcolumn' || filterKey === 'genericvalue') continue;
    if (!filterVal && filterVal !== 0) continue; // Skip empty filters

    const colName = resolveColumn(filterKey, connectionId);
    if (!colName) continue;

    const colMatch = cols.find(c => c.name === colName);
    if (!colMatch) continue;

    const colType = colMatch.type;

    if (colType.includes('UInt') || colType.includes('Int')) {
      const val = parseInt(filterVal, 10);
      if (!isNaN(val)) conditions.push(`${colName} = ${val}`);
    } else if (colType.includes('String')) {
      conditions.push(`${colName} = '${escapeString(filterVal)}'`);
    } else {
      conditions.push(`toString(${colName}) = '${escapeString(filterVal)}'`);
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  if (where) writeLog(`\n[SQL Query]\n  WHERE: ${where}`);
  return { where, params: {} };
}

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

let cachedColumns = new Map();
async function initColumns(connectionId) {
  try {
    const client = await getClickHouseClient(connectionId);
    const viewName = getFullyQualifiedView(connectionId);
    const result = await client.query({ query: `DESCRIBE TABLE ${viewName}`, format: 'JSON' });
    const data = await result.json();
  const cols = data.data.map(col => ({ name: col.name, type: col.type }));
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
    const uniqueCols = Array.from(new Map(allCols.map(c => [c.name, c])).values());
    res.json(uniqueCols);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/query', authMiddleware, async (req, res) => {
  try {
    writeLog(`\n[API] Incoming Query: ${JSON.stringify(req.body, null, 2)}`);
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
      const { where, params } = buildWhereClause(filters, connId);

      let orderCol = resolveColumn(sortColumn, connId);
      if (!orderCol && sortColumn === 'timestamp') {
        // Optimization: For sorting, if timestamp is requested, use log_date for partition pruning
        const cols = cachedColumns.get(connId) || [];
        if (cols.some(c => c.name === 'log_date')) {
          orderCol = 'log_date';
        }
      }
      if (!orderCol) orderCol = resolveColumn('timestamp', connId) || 'log_date';

      const escapedView = viewName.includes('.') ? `\`${viewName.split('.')[0]}\`.\`${viewName.split('.')[1]}\`` : `\`${viewName}\``;

      // FIX: Ensure there is a space before WHERE if where exists
      const whereClause = where ? ` ${where}` : '';
      const query = `SELECT * FROM ${escapedView}${whereClause} ORDER BY \`${orderCol}\` ${order} LIMIT ${limit} OFFSET ${offset}`;

      writeLog(`\n[ClickHouse Execute] Connection: ${connId}\nSQL: ${query}`);

      const result = await client.query({ query, format: 'JSONEachRow', abort_signal: controller.signal });
      const rows = await result.json();

      let total = 0;
      const countQuery = `SELECT count() as total FROM ${escapedView}${whereClause}`;
      const countResult = await client.query({ query: countQuery, format: 'JSON', abort_signal: controller.signal });
      const countData = await countResult.json();
      total = parseInt(countData.data[0].total, 10);

      return { rows, total, connId, query, params };
    }));

    const combinedRows = queryResults.flatMap(r => r.rows);
    const combinedTotal = queryResults.reduce((acc, r) => acc + r.total, 0);

    const debugValue = await getSystemSetting('debug_mode', 'true');
    const debugEnabled = debugValue === 'true';
    writeLog(`[DebugSetting] debug_mode: ${debugValue}, enabled: ${debugEnabled}`);

    const debugSql = debugEnabled
      ? queryResults.map(r => `Connection ${r.connId}: ${r.query} | Params: ${JSON.stringify(r.params)}`).join('\n')
      : null;

    res.json({ data: combinedRows, total: combinedTotal, page: Math.floor(offset / limit) + 1, pageSize: limit, totalPages: Math.ceil(combinedTotal / limit), debugSql });
  } catch (err) {
    if (err.name === 'AbortError') return;
    writeLog(`Query failed: ${err.message}`);
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
      const { where, params } = buildWhereClause(filters, connId);
      const safeMax = Math.min(parseInt(maxRows, 10) || 50000, 100000);
      const result = await client.query({ query: `SELECT * FROM ${viewName} ${where} LIMIT ${safeMax}`, format: 'CSVWithNames' });
      return await result.text();
    }));
    let combinedCsv = csvParts[0] || '';
    for (let i = 1; i < csvParts.length; i++) {
      const lines = csvParts[i].split('\\n');
      combinedCsv += '\\n' + lines.slice(1).join('\\n');
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=ipdr_export_${Date.now()}.csv`);
    res.send(combinedCsv);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/stats', authMiddleware, async (req, res) => {
  try {
    const { filters = {} } = req.body;
    const activeIds = await resolveActiveConnections(req);
    const allStats = await Promise.all(activeIds.map(async (connId) => {
      const { where, params } = buildWhereClause(filters, connId);
      const viewName = getFullyQualifiedView(connId);
      const srcIpCol = resolveColumn('src_ip', connId) || 'src_ip';
      const dstIpCol = resolveColumn('dst_ip', connId) || 'dest_ip';
      const tsCol = resolveColumn('timestamp', connId) || 'log_datetime';
      writeLog(`[Stats Debug] Connection: ${connId}, tsCol: ${tsCol}`);

      // Ensure we use a DateTime column for toHour, as log_date (Date type) will fail.
      const hourlyCol = (tsCol === 'log_date') ? 'log_datetime' : tsCol;

      const protoCol = resolveColumn('protocol', connId) || 'proto';
      const client = await getClickHouseClient(connId);
      const controller = new AbortController();
      const queries = [
        client.query({ query: `SELECT count() as total_records, uniq(${srcIpCol}) as unique_sources, uniq(${dstIpCol}) as unique_destinations FROM ${viewName} ${where}`, format: 'JSON', abort_signal: controller.signal }),
        client.query({ query: `SELECT toString(${protoCol}) as protocol, count() as cnt FROM ${viewName} ${where} GROUP BY protocol ORDER BY cnt DESC LIMIT 10`, format: 'JSON', abort_signal: controller.signal }),
        client.query({ query: `SELECT toString(${dstIpCol}) as dst_ip, count() as cnt FROM ${viewName} ${where} GROUP BY dst_ip ORDER BY cnt DESC LIMIT 10`, format: 'JSON', abort_signal: controller.signal }),
      ];
      if (hourlyCol) {
        queries.push(client.query({ query: `SELECT toHour(${hourlyCol}) as hour, count() as cnt FROM ${viewName} ${where} GROUP BY hour ORDER BY hour`, format: 'JSON', abort_signal: controller.signal }));
      }
      const results = await Promise.all(queries);
      const jsonResults = await Promise.all(results.map(r => r.json()));
      return {
        summary: jsonResults[0].data[0] || {},
        protocols: jsonResults[1].data || [],
        topDestinations: jsonResults[2].data || [],
        hourlyTraffic: tsCol ? (jsonResults[3]?.data || []) : [],
      };
    }));
    const finalSummary = { total_records: 0, unique_sources: 0, unique_destinations: 0 };
    allStats.forEach(s => {
      finalSummary.total_records += (s.summary.total_records || 0);
      finalSummary.unique_sources += (s.summary.unique_sources || 0);
      finalSummary.unique_destinations += (s.summary.unique_destinations || 0);
    });
    const mergeProtocols = allStats.flatMap(s => s.protocols).reduce((acc, item) => {
      acc[item.protocol] = (acc[item.protocol] || 0) + item.cnt;
      return acc;
    }, {});
    const finalProtocols = Object.entries(mergeProtocols).map(([protocol, cnt]) => ({ protocol, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
    const mergeDestinations = allStats.flatMap(s => s.topDestinations).reduce((acc, item) => {
      acc[item.dst_ip] = (acc[item.dst_ip] || 0) + item.cnt;
      return acc;
    }, {});
    const finalDestinations = Object.entries(mergeDestinations).map(([dst_ip, cnt]) => ({ dst_ip, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
    const mergeTraffic = allStats.flatMap(s => s.hourlyTraffic).reduce((acc, item) => {
      acc[item.hour] = (acc[item.hour] || 0) + item.cnt;
      return acc;
    }, {});
    const finalTraffic = Object.entries(mergeTraffic).map(([hour, cnt]) => ({ hour: parseInt(hour), cnt })).sort((a, b) => a.hour - b.hour);
    res.json({ summary: finalSummary, protocols: finalProtocols, topDestinations: finalDestinations, hourlyTraffic: finalTraffic });
  } catch (err) {
    if (err.name === 'AbortError') return;
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  🔒 IPDR API Server running on http://localhost:${PORT}`);
  console.log(`  📊 ClickHouse: ${process.env.CLICKHOUSE_HOST || 'http://localhost:8123'}`);
  console.log(`  📁 Database:   ${process.env.CLICKHOUSE_DATABASE || 'syslogdb'}`);
  console.log(`  👁  View:       ${VIEW}\n`);
});
