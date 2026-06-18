import db from '../../localdb.js';
import logger from '../../logger.js';
import { sendNotification } from './notificationService.js';
import { getClickHouseClient, getFullyQualifiedView } from './connectionService.js';
import { resolveColumn } from './queryService.js';

export function generateAlertFingerprint(warrantId, matchedValues) {
  const data = JSON.stringify({ warrantId, matchedValues });
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}

export async function runWarrantMonitor(cachedColumns) {
  logger.info(`[WarrantMonitor] Starting periodic check...`);
  try {
    const activeWarrants = db.prepare('SELECT * FROM warrants WHERE active = 1').all();
    if (activeWarrants.length === 0) return;

    const connections = db.prepare('SELECT id FROM connections').all();
    const notifSettings = db.prepare('SELECT * FROM system_settings WHERE key LIKE \'notif_%\'').all();
    const notifConfig = {};
    notifSettings.forEach(s => { notifConfig[s.key.replace('notif_', '')] = s.value; });

    for (const conn of connections) {
      const client = await getClickHouseClient(conn.id);
      const viewName = getFullyQualifiedView(conn.id);

      for (const warrant of activeWarrants) {
        const { id: warrantId, conditionsRaw, threshold_count = 1, threshold_window = 120 } = warrant;

        // Support both old single-column format and new conditions array
        let conditions = [];
        if (conditionsRaw) {
          conditions = JSON.parse(conditionsRaw);
        } else if (warrant.column_name && warrant.operator && warrant.value) {
          conditions = [{ col: warrant.column_name, op: warrant.operator, val: warrant.value }];
        }

        if (conditions.length === 0) continue;

        const queryParams = [];
        const whereClauses = [];

        for (let i = 0; i < conditions.length; i++) {
          const cond = conditions[i];
          const resolvedCol = resolveColumn(cond.col, conn.id, cachedColumns);
          if (!resolvedCol) continue;

          let val = cond.val;
          let op = cond.op;

          if (op === 'LIKE' && !val.includes('%')) {
            val = `%${val}%`;
          }
          const effectiveOp = (op === 'LIKE') ? 'ILIKE' : op;

          // Check if it's a numeric column
          const colMatch = cachedColumns?.get(conn.id)?.find(c => c.name === resolvedCol);
          if (colMatch && (colMatch.type.includes('UInt') || colMatch.type.includes('Int'))) {
            const numVal = parseInt(val, 10);
            if (!isNaN(numVal)) {
              whereClauses.push(`${resolvedCol} ${effectiveOp} ?`);
              queryParams.push(numVal);
            }
          } else {
            whereClauses.push(`toString(${resolvedCol}) ${effectiveOp} ?`);
            queryParams.push(String(val));
          }
        }

        if (whereClauses.length === 0) continue;
        const where = `WHERE ${whereClauses.join(' AND ')}`;

        try {
          const query = `SELECT count() as cnt FROM ${viewName} ${where} AND log_datetime >= now() - interval ${threshold_window} minute`;
          const result = await client.query({ query, params: queryParams, format: 'JSON' });
          const data = await result.json();
          const count = data.data[0]?.cnt || 0;

          if (count >= threshold_count) {
            // Alert Fingerprinting: capture matched sample to identify unique hits
            const sampleQuery = `SELECT * FROM ${viewName} ${where} AND log_datetime >= now() - interval ${threshold_window} minute LIMIT 1`;
            const sampleRes = await client.query({ query: sampleQuery, params: queryParams, format: 'JSONEachRow' });
            const sampleRows = await sampleRes.json();
            const sampleRow = sampleRows && sampleRows.length > 0 ? sampleRows[0] : null;
            const sampleStr = sampleRow ? JSON.stringify(sampleRow) : 'No sample available';

            // Create fingerprint based on warrant and a key value from the sample (e.g. src_ip)
            const matchedVal = sampleRow ? (sampleRow.src_ip || sampleRow.dest_ip || 'unknown') : 'unknown';
            const fingerprint = generateAlertFingerprint(warrantId, matchedVal);

            // Check if this fingerprint was already alerted within the window
            const existing = db.prepare('SELECT id FROM alerts WHERE warrant_id = ? AND fingerprint = ? AND detected_at > datetime("now", ?)').get(warrantId, fingerprint, `-${threshold_window} minutes`);

            if (!existing) {
              db.prepare('INSERT INTO alerts (warrant_id, log_sample, fingerprint) VALUES (?, ?, ?)')
                .run(warrantId, sampleStr, fingerprint);
              logger.info(`[WarrantMonitor] ALERT triggered for Warrant ${warrantId}: ${warrant.name} (Count: ${count}/${threshold_count} in ${threshold_window}m)`);

              if (notifConfig.provider) {
                const message = `🚨 <b>IPDR Alert triggered!</b>\n\n<b>Warrant:</b> ${warrant.name}\n<b>Matched:</b> ${count} events in last ${threshold_window} mins\n<b>Connection:</b> ${conn.id}`;
                try {
                  await sendNotification(notifConfig.provider, notifConfig, message);
                  db.prepare('INSERT INTO notification_logs (alert_id, provider, status, message) VALUES (?, ?, ?, ?)')
                    .run(null, notifConfig.provider, 'success', message);
                } catch (e) {
                  db.prepare('INSERT INTO notification_logs (alert_id, provider, status, message) VALUES (?, ?, ?, ?)')
                    .run(null, notifConfig.provider, 'failed', e.message);
                }
              }
            }
          }
        } catch (e) {
          logger.error(`[WarrantMonitor] Query error for warrant ${warrantId} on conn ${conn.id}: ${e.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[WarrantMonitor] Critical error: ${err.message}`);
  }
}

export async function runAnomalyDetection() {
  logger.info(`[AnomalyDetection] Scanning for traffic spikes...`);
  try {
    const connections = db.prepare('SELECT id FROM connections').all();

    for (const conn of connections) {
      const client = await getClickHouseClient(conn.id);
      const viewName = getFullyQualifiedView(conn.id);

      // Query to find destinations where current hour's volume > 3x 7-day hourly average
      const query = `
        WITH
          avg_traffic AS (
            SELECT dest_ip, avg(cnt) as avg_vol
            FROM (
              SELECT dest_ip, toHour(log_datetime) as hr, count() as cnt
              FROM ${viewName}
              WHERE log_datetime >= now() - interval 7 day
              GROUP BY dest_ip, hr
            )
            GROUP BY dest_ip
          ),
          current_traffic AS (
            SELECT dest_ip, count() as cur_vol
            FROM ${viewName}
            WHERE log_datetime >= now() - interval 1 hour
            GROUP BY dest_ip
          )
        SELECT
          c.dest_ip,
          c.cur_vol,
          a.avg_vol,
          (c.cur_vol / a.avg_vol) as multiplier
        FROM current_traffic c
        JOIN avg_traffic a ON c.dest_ip = a.dest_ip
        WHERE c.cur_vol > 3 * a.avg_vol AND a.avg_vol > 0
      `;

      const result = await client.query({ query, format: 'JSON' });
      const anomalies = await result.json();

      for (const anomaly of anomalies.data) {
        const { dest_ip, cur_vol, avg_vol, multiplier } = anomaly;

        // Trigger alert with a special system warrant ID (e.g., 0 or a generated one)
        const alertMsg = `Anomaly detected for ${dest_ip}: ${cur_vol} hits (avg: ${Math.round(avg_vol)}, multiplier: ${multiplier.toFixed(1)}x)`;
        db.prepare('INSERT INTO alerts (warrant_id, log_sample, fingerprint) VALUES (?, ?, ?)')
          .run(0, alertMsg, `anomaly_${dest_ip}_${new Date().toISOString().slice(0, 13)}`);

        logger.info(`[AnomalyDetection] ${alertMsg}`);
      }
    }
  } catch (err) {
    logger.error(`[AnomalyDetection] Error: ${err.message}`);
  }
}
