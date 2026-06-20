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
  const res = await request('/health?connectionIds=0');
  return res.json();
}

export async function fetchGlobalStats() {
  const res = await request('/stats/global?connectionIds=0');
  return res.json();
}

/** Individual Graph APIs */
export async function fetchBrasDistribution() {
  const res = await request('/stats/bras-distribution?connectionIds=0');
  return res.json();
}

export async function fetchHourlyTraffic() {
  const res = await request('/stats/hourly-traffic?connectionIds=0');
  return res.json();
}

export async function fetchTrafficTrend() {
  const res = await request('/stats/traffic-trend?connectionIds=0');
  return res.json();
}

export async function fetchHeatmap() {
  const res = await request('/stats/heatmap?connectionIds=0');
  return res.json();
}

/** Discover columns from DESCRIBE view_parsed_logs */
export async function fetchColumns(refresh = false) {
  const params = new URLSearchParams();
  if (refresh) params.append('refresh', '1');
  params.append('connectionIds', '0');
  const res = await request(`/columns?${params.toString()}`);
  return res.json();
}

/**
 * Query data with filters, pagination, sorting.
 */
export async function queryData({ filters = {}, page = 1, pageSize = 50, sortColumn = '', sortOrder = 'DESC', connectionId = '0' } = {}) {
  let queryController = new AbortController();

  try {
    const res = await request('/query', {
      method: 'POST',
      signal: queryController.signal,
      body: JSON.stringify({ filters, page, pageSize, sortColumn, sortOrder, connectionIds: connectionId }),
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/** Fetch dashboard stats */
export async function fetchStats(filters = {}, connectionId = '0') {
  let statsController = new AbortController();

  try {
    const res = await request('/stats', {
      method: 'POST',
      signal: statsController.signal,
      body: JSON.stringify({ filters, connectionIds: connectionId }),
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') return null;
    throw err;
  }
}

/** Export CSV — returns a Blob */
export async function exportCSV(filters = {}, maxRows = 50000) {
  const res = await request('/export', {
    method: 'POST',
    body: JSON.stringify({ filters, maxRows }),
  });
  return res.blob();
}

// ── Auth ──────────────────────────────────────────────────────────────

export async function login(username, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

// ── Preferences & Favorites ───────────────────────────────────────────

export async function getPreferences() {
  const res = await request('/preferences');
  return res.json();
}

export async function savePreferences(dashboard_layout) {
  const res = await request('/preferences', {
    method: 'POST',
    body: JSON.stringify({ dashboard_layout }),
  });
  return res.json();
}

export async function getFavorites() {
  const res = await request('/filters/favorites');
  return res.json();
}

export async function saveFavorite(name, filterValues) {
  const res = await request('/filters/favorites', {
    method: 'POST',
    body: JSON.stringify({ name, filter_values: filterValues }),
  });
  return res.json();
}

export async function deleteFavorite(id) {
  const res = await request(`/filters/favorites/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function adminGetNotifications() {
  const res = await request('/admin/notifications');
  return res.json();
}

export async function adminSaveNotifications(settings) {
  const res = await request('/admin/notifications', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.json();
}

// ── Related Events ────────────────────────────────────────────────────

export async function fetchRelated(srcIp, timestamp) {
  const res = await request(`/related?src_ip=${encodeURIComponent(srcIp)}&timestamp=${encodeURIComponent(timestamp)}`);
  return res.json();
}

// ── Alerts ────────────────────────────────────────────────────────────

export async function getAlerts() {
  const res = await request('/alerts');
  return res.json();
}

export async function resolveAlert(id, resolved = true) {
  const res = await request(`/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ resolved }),
  });
  return res.json();
}

export async function resolveAllAlerts() {
  const res = await request('/alerts/resolve-all', { method: 'PUT' });
  return res.json();
}

export async function clearAlerts() {
  const res = await request('/alerts/clear', { method: 'DELETE' });
  return res.json();
}

// ── Admin ──────────────────────────────────────────────────────────────

export async function adminGetConnections() {
  const res = await request('/admin/connections');
  return res.json();
}

export async function adminSaveConnection(conn) {
  const res = await request('/admin/connections', {
    method: 'POST',
    body: JSON.stringify(conn),
  });
  return res.json();
}

export async function adminUpdateConnection(id, conn) {
  const res = await request(`/admin/connections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(conn),
  });
  return res.json();
}

export async function adminDeleteConnection(id) {
  const res = await request(`/admin/connections/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function adminGetUsers() {
  const res = await request('/admin/users');
  return res.json();
}

export async function adminSaveUser(user) {
  const res = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify(user),
  });
  return res.json();
}

export async function adminUpdateUser(id, user) {
  const res = await request(`/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  });
  return res.json();
}

export async function adminDeleteUser(id) {
  const res = await request(`/admin/users/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function adminGetWarrants() {
  const res = await request('/admin/warrants');
  return res.json();
}

export async function adminSaveWarrant(warrant) {
  const res = await request('/admin/warrants', {
    method: 'POST',
    body: JSON.stringify(warrant),
  });
  return res.json();
}

export async function adminUpdateWarrant(id, warrant) {
  const res = await request(`/admin/warrants/${id}`, {
    method: 'PUT',
    body: JSON.stringify(warrant),
  });
  return res.json();
}

export async function adminDeleteWarrant(id) {
  const res = await request(`/admin/warrants/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function adminGetSettings() {
  const res = await request('/admin/settings');
  return res.json();
}

export async function adminSaveSettings(settings) {
  const res = await request('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return res.json();
}

// ── Proxmox Proxy ──────────────────────────────────────────────────────────

export async function fetchProxmoxNodes() {
  const res = await request('/proxmox/nodes');
  return res.json();
}

export async function fetchProxmoxVMs() {
  const res = await request('/proxmox/vms');
  return res.json();
}

export async function fetchProxmoxIpSet(node, vmid) {
  const res = await request(`/proxmox/ipset/${node}/${vmid}`);
  return res.json();
}
