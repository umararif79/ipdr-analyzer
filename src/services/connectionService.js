import db from '../../localdb.js';
import { decrypt } from '../../crypto.js';
import { createClient } from '@clickhouse/client';
import logger from '../../logger.js';

const clientCache = new Map();
export const cachedColumns = new Map();

export async function getClickHouseClient(connectionId) {
  if (!connectionId) throw new Error('No connection ID provided');
  if (clientCache.has(connectionId)) return clientCache.get(connectionId);

  const conn = db.prepare('SELECT * FROM connections WHERE id = ?').get(connectionId);
  if (!conn) throw new Error('Connection configuration not found');

  const decryptedPassword = decrypt(conn.password);

  const client = createClient({
    url: conn.host,
    username: conn.username,
    password: decryptedPassword,
    database: conn.database,
    request_timeout: 120000,
  });

  clientCache.set(connectionId, client);
  return client;
}

export async function resolveActiveConnections(req) {
  const userId = req.user.id;
  const role = req.user.role;

  // Accept connectionIds from body or query
  const requested = req.body?.connectionIds || req.query?.connectionIds;

  const assigned = db.prepare('SELECT connection_id FROM user_connections WHERE user_id = ?').all(userId);
  const assignedIds = assigned.map(row => row.connection_id);

  logger.info(`[Auth] Resolving connections for user ${userId} (role: ${role}), requested: ${JSON.stringify(requested)}`);

  // Handle "0" (all available)
  if (requested === '0' || requested === [0]) {
    if (role === 'admin') {
      const all = db.prepare('SELECT id FROM connections').all().map(c => c.id);
      logger.info(`[Auth] Admin requested "0", returning all: ${JSON.stringify(all)}`);
      return all;
    }
    logger.info(`[Auth] User requested "0", returning assigned: ${JSON.stringify(assignedIds)}`);
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
      logger.info(`[Auth] Admin requested specific IDs: ${JSON.stringify(ids)}`);
      return ids;
    }
    const all = db.prepare('SELECT id FROM connections').all().map(c => c.id);
    logger.info(`[Auth] Admin requested none, returning all: ${JSON.stringify(all)}`);
    return all;
  }

  if (ids.length > 0) {
    const validIds = ids.filter(id => assignedIds.includes(id));
    logger.info(`[Auth] User requested IDs ${JSON.stringify(ids)}, valid: ${JSON.stringify(validIds)}`);
    if (validIds.length === 0) throw new Error('No valid assigned connections selected');
    return validIds;
  }

  if (assignedIds.length === 1) return assignedIds;
  if (assignedIds.length > 1) throw new Error('Multiple connections available; please specify connectionIds (e.g. "0" for all, or "1,2" for specific ones)');
  throw new Error('No ClickHouse connections assigned to this user');
}

export function getFullyQualifiedView(connectionId, viewName = 'view_parsed_logs') {
  const conn = db.prepare('SELECT database FROM connections WHERE id = ?').get(connectionId);
  return (conn && conn.database) ? `${conn.database}.${viewName}` : viewName;
}
