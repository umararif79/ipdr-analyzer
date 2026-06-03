import db from '../../localdb.js';
import logger from '../../logger.js';
import { getClickHouseClient, getFullyQualifiedView } from './connectionService.js';

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

export function resolveColumn(logicalName, connectionId, cachedColumns) {
  if (!cachedColumns || !cachedColumns.has(connectionId)) return null;
  const cols = cachedColumns.get(connectionId);

  const mapped = COLUMN_MAP[logicalName];
  if (mapped && cols.some(c => c.name === mapped)) return mapped;
  if (cols.some(c => c.name === logicalName)) return logicalName;
  return null;
}

export function buildWhereClause(filters, connectionId, cachedColumns) {
  const conditions = [];
  const params = {};
  const cols = cachedColumns?.get(connectionId) || [];

  const dateCol = 'log_date';
  const normalizedFilters = {};
  if (filters && typeof filters === 'object') {
    Object.entries(filters).forEach(([key, value]) => {
      if (typeof key === 'string') {
        normalizedFilters[key.toLowerCase()] = value;
      }
    });
  }
  logger.info(`[Filter Debug] Normalized Filters: ${JSON.stringify(normalizedFilters)}`);

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

  const genericCol = normalizedFilters.genericcolumn;
  const genericVal = normalizedFilters.genericvalue;
  if (genericCol && genericVal) {
    const resolvedGenericCol = resolveColumn(genericCol, connectionId, cachedColumns);
    if (resolvedGenericCol) {
      const colMatch = cols.find(c => c.name === resolvedGenericCol);
      if (colMatch) {
        const colType = colMatch.type;
        if (colType.includes('UInt') || colType.includes('Int')) {
          const val = parseInt(genericVal, 10);
          if (!isNaN(val)) {
            conditions.push(`${resolvedGenericCol} = {genericVal:Int64}`);
            params.genericVal = val;
          }
        } else {
          conditions.push(`toString(${resolvedGenericCol}) = {genericVal:String}`);
          params.genericVal = String(genericVal);
        }
      }
    }
  }

  let paramCount = 0;
  for (const [filterKey, filterVal] of Object.entries(normalizedFilters)) {
    if (filterKey === 'datefrom' || filterKey === 'dateto' || filterKey === 'genericcolumn' || filterKey === 'genericvalue') continue;
    if (!filterVal && filterVal !== 0) continue;

    const colName = resolveColumn(filterKey, connectionId, cachedColumns);
    if (!colName) continue;

    const colMatch = cols.find(c => c.name === colName);
    if (!colMatch) continue;

    const colType = colMatch.type;
    const paramName = `p${paramCount++}`;

    if (colType.includes('UInt') || colType.includes('Int')) {
      const val = parseInt(filterVal, 10);
      if (!isNaN(val)) {
        conditions.push(`${colName} = {${paramName}:Int64}`);
        params[paramName] = val;
      }
    } else {
      conditions.push(`toString(${colName}) = {${paramName}:String}`);
      params[paramName] = String(filterVal);
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  if (where) logger.info(`\n[SQL Query]\n  WHERE: ${where}\n  PARAMS: ${JSON.stringify(params)}`);
  return { where, params };
}

export function getPeriodDateRange(period) {
  const now = new Date();
  const formatDate = (d) => d.toISOString().slice(0, 10);

  let start = new Date(now);
  let end = new Date(now);

  switch (period) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(now.getDate() - 1);
      end.setDate(now.getDate() - 1);
      break;
    case 'last-week':
      start.setDate(now.getDate() - 7);
      break;
    case 'last-month':
      start.setMonth(now.getMonth() - 1);
      if (start.getDate() !== now.getDate()) {
        start.setDate(0);
      }
      break;
    case 'last-quarter':
      start.setMonth(now.getMonth() - 3);
      if (start.getDate() !== now.getDate()) {
        start.setDate(0);
      }
      break;
    default:
      return null;
  }
  return { datefrom: formatDate(start), dateto: formatDate(end) };
}

export function getPreviousPeriodDateRange(currentRange) {
  if (!currentRange || !currentRange.datefrom || !currentRange.dateto) return null;
  const start = new Date(currentRange.datefrom);
  const end = new Date(currentRange.dateto);
  const durationMs = end.getTime() - start.getTime() + 86400000;
  const prevEnd = new Date(start);
  prevEnd.setDate(start.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setTime(prevEnd.getTime() - durationMs + 86400000);

  const formatDate = (d) => d.toISOString().slice(0, 10);
  return { datefrom: formatDate(prevStart), dateto: formatDate(prevEnd) };
}

export async function fetchStatsForRange(activeIds, filters, cachedColumns) {
  const allStats = await Promise.all(activeIds.map(async (connId) => {
    const { where, params } = buildWhereClause(filters, connId, cachedColumns);
    const viewName = getFullyQualifiedView(connId);
    const tsCol = resolveColumn('timestamp', connId, cachedColumns) || 'log_datetime';
    const hourlyCol = (tsCol === 'log_date') ? 'log_datetime' : tsCol;
    const client = await getClickHouseClient(connId);
    const controller = new AbortController();

    const queryDefs = [
      { key: 'summary', sql: `SELECT count() as total_records, uniq(src_ip) as unique_sources, uniq(dest_ip) as unique_destinations FROM ${viewName} ${where}` },
      { key: 'bras', sql: `SELECT d.bras, ifNull(t.total_logs, 0) AS cnt FROM (SELECT DISTINCT device_label AS bras FROM ${viewName}) AS d LEFT JOIN (SELECT device_label AS bras, count(*) AS total_logs FROM ${viewName} ${where} GROUP BY device_label) AS t ON d.bras = t.bras ORDER BY cnt DESC LIMIT 10` },
      { key: 'dest', sql: `SELECT toString(dest_ip) as dst_ip, count() as cnt FROM ${viewName} ${where} GROUP BY dst_ip ORDER BY cnt DESC LIMIT 10` },
      { key: 'country', sql: `SELECT toString(country) as country, count() as cnt FROM ${viewName} ${where} GROUP BY country ORDER BY cnt DESC LIMIT 10` },
      { key: 'app', sql: `SELECT toString(application) as application, count() as cnt FROM ${viewName} ${where} GROUP BY application ORDER BY cnt DESC LIMIT 10` },
      { key: 'org', sql: `SELECT toString(organization) as organization, count() as cnt FROM ${viewName} ${where} GROUP BY organization ORDER BY cnt DESC LIMIT 10` },
      { key: 'bras_daily', sql: `SELECT log_date, device_label as bras, count(*) as cnt FROM ${viewName} WHERE log_date >= toDate(now() - interval 7 day) GROUP BY log_date, bras ORDER BY log_date ASC` },
    ];
    if (hourlyCol) {
      queryDefs.push({ key: 'hourly', sql: `SELECT toHour(${hourlyCol}) as hour, count() as cnt FROM ${viewName} ${where} GROUP BY hour ORDER BY hour` });
    }

    const results = [];
    for (const def of queryDefs) {
      try {
        const res = await client.query({ query: def.sql, params, format: 'JSON', abort_signal: controller.signal });
        results.push(await res.json());
      } catch (e) {
        results.push({ data: [] });
      }
    }

    return {
      summary: results[0]?.data[0] || {},
      brasDistribution: results[1]?.data || [],
      brasDailyDistribution: results[6]?.data || [],
      topDestinations: results[2]?.data || [],
      topCountries: results[3]?.data || [],
      topApps: results[4]?.data || [],
      topOrgs: results[5]?.data || [],
      hourlyTraffic: (hourlyCol && results[7]) ? results[7].data : [],
    };
  }));

  const finalSummary = { total_records: 0, unique_sources: 0, unique_destinations: 0 };
  allStats.forEach(s => {
    finalSummary.total_records += (s.summary.total_records || 0);
    finalSummary.unique_sources += (s.summary.unique_sources || 0);
    finalSummary.unique_destinations += (s.summary.unique_destinations || 0);
  });
  const mergeBras = allStats.flatMap(s => s.brasDistribution).reduce((acc, item) => {
    acc[item.bras] = (item.bras && (acc[item.bras] || 0) + item.cnt);
    return acc;
  }, {});
  const finalBras = Object.entries(mergeBras).map(([bras, cnt]) => ({ bras, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const mergeBrasDaily = allStats.flatMap(s => s.brasDailyDistribution).reduce((acc, item) => {
    const dateKey = item.log_date;
    if (!acc[dateKey]) acc[dateKey] = {};
    acc[dateKey][item.bras] = (item.bras && (acc[dateKey][item.bras] || 0) + item.cnt);
    return acc;
  }, {});
  const finalBrasDaily = Object.entries(mergeBrasDaily).map(([date, brasMap]) => ({
    date,
    data: brasMap
  })).sort((a, b) => a.date.localeCompare(b.date));
  const mergeDestinations = allStats.flatMap(s => s.topDestinations).reduce((acc, item) => {
    acc[item.dst_ip] = (item.dst_ip && (acc[item.dst_ip] || 0) + item.cnt);
    return acc;
  }, {});
  const finalDestinations = Object.entries(mergeDestinations).map(([dst_ip, cnt]) => ({ dst_ip, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const mergeCountries = allStats.flatMap(s => s.topCountries).reduce((acc, item) => {
    acc[item.country] = (item.country && (acc[item.country] || 0) + item.cnt);
    return acc;
  }, {});
  const finalCountries = Object.entries(mergeCountries).map(([country, cnt]) => ({ country, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const mergeApps = allStats.flatMap(s => s.topApps).reduce((acc, item) => {
    acc[item.application] = (item.application && (acc[item.application] || 0) + item.cnt);
    return acc;
  }, {});
  const finalApps = Object.entries(mergeApps).map(([app, cnt]) => ({ application: app, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const mergeOrgs = allStats.flatMap(s => s.topOrgs).reduce((acc, item) => {
    acc[item.organization] = (item.organization && (acc[item.organization] || 0) + item.cnt);
    return acc;
  }, {});
  const finalOrgs = Object.entries(mergeOrgs).map(([org, cnt]) => ({ organization: org, cnt })).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
  const mergeTraffic = allStats.flatMap(s => s.hourlyTraffic).reduce((acc, item) => {
    acc[item.hour] = (item.hour !== undefined) ? (acc[item.hour] || 0) + item.cnt : acc[item.hour];
    return acc;
  }, {});
  const finalTraffic = Object.entries(mergeTraffic).map(([hour, cnt]) => ({ hour: parseInt(hour), cnt })).sort((a, b) => a.hour - b.hour);

  return {
    summary: finalSummary,
    brasDistribution: finalBras,
    brasDailyDistribution: finalBrasDaily,
    topDestinations: finalDestinations,
    topCountries: finalCountries,
    topApps: finalApps,
    topOrgs: finalOrgs,
    hourlyTraffic: finalTraffic
  };
}

export function escapeString(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/'/g, "''");
}
