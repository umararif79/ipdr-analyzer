/* ═══════════════════════════════════════════════════════════════════
   API Client — Wraps all fetch calls to the Express backend
   ═══════════════════════════════════════════════════════════════════ */

const BASE = '/api';

async function request(url, options = {}) {
  const token = localStorage.getItem('ipdr_token');
  const headers = { 'Content-Type': 'application/json' };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${url}`, {
    headers,
    ...options,
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('ipdr_token');
      localStorage.removeItem('ipdr_user');
      window.location.href = '/login.html';
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res;
}

/** Health check — returns { status, clickhouse, timestamp } */
export async function checkHealth() {
  const res = await request('/health');
  return res.json();
}

/** Discover columns from DESCRIBE view_parsed_logs */
export async function fetchColumns(refresh = false) {
  const qs = refresh ? '?refresh=1' : '';
  const res = await request(`/columns${qs}`);
  return res.json();
}

let queryController = null;
let statsController = null;

/**
 * Query data with filters, pagination, sorting.
 */
export async function queryData({ filters = {}, page = 1, pageSize = 50, sortColumn = '', sortOrder = 'DESC' } = {}) {
  // [DEBUG] Temporarily disabled automatic abort to diagnose early cancellations
  // if (queryController) queryController.abort();
  console.log(`[DEBUG] queryData started. Previous controller aborted? No (disabled).`);
  queryController = new AbortController();

  try {
    const res = await request('/query', {
      method: 'POST',
      signal: queryController.signal,
      body: JSON.stringify({ filters, page, pageSize, sortColumn, sortOrder }),
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') return null; // Silently handle cancellations
    throw err;
  }
}

/** Fetch dashboard stats */
export async function fetchStats(filters = {}) {
  // Cancel previous stats request
  if (statsController) statsController.abort();
  statsController = new AbortController();

  try {
    const res = await request('/stats', {
      method: 'POST',
      signal: statsController.signal,
      body: JSON.stringify({ filters }),
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/** Export CSV — returns a Blob */
export async function exportCSV(filters = {}, maxRows = 50000) {
  const res = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters, maxRows }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Export failed: HTTP ${res.status}`);
  }

  return res.blob();
}
