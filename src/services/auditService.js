import db from '../../localdb.js';
import logger from '../../logger.js';

export async function logAuditAction(userId, action, resource, resourceId = null, oldValue = null, newValue = null, req = null) {
  try {
    const ipAddress = req ? req.ip : 'system';

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, old_value, new_value, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      action,
      resource,
      resourceId ? String(resourceId) : null,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress
    );

    logger.info(`[Audit] User ${userId} performed ${action} on ${resource}:${resourceId || 'all'}`);
  } catch (err) {
    logger.error(`[AuditService] Failed to log audit action: ${err.message}`);
  }
}
