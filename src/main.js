/* ═══════════════════════════════════════════════════════════════════
   IPDR Log Analyzer — Main Entry Point
   Wires up all modules: API, Filters, Table, Dashboard, Export
   ═══════════════════════════════════════════════════════════════════ */

import {
  checkHealth,
  fetchColumns,
  queryData,
  fetchStats,
  fetchRelated,
  getFavorites,
  saveFavorite,
  getPreferences,
  logout,
  getAlerts,
  resolveAlert,
  resolveAllAlerts,
  clearAlerts,
  adminGetConnections,
  fetchBrasDistribution,
  fetchHourlyTraffic,
  fetchTrafficTrend,
  fetchHeatmap
} from './api.js';
import { renderFilters, getFilterValues, resetFilters, setDefaultFilterValue, getStartOfToday, getStartOfYesterday, getStartOfLastWeek, applyFilterValues } from './filters.js';
import { setColumns, renderRows, updatePagination, showLoading, onSort, getSortState } from './table.js';
import { renderDashboard, updateDashboard, renderCharts, updateBrasChart, updateHourlyChart, updateTrendChart, updateHeatmap } from './dashboard.js';
import { downloadCSV } from './export.js';
import { showToast } from './toast.js';
import { loadSettings, saveSettings, getSettings, isAdmin } from './settings.js';
import { initAdmin } from './admin.js';

export async function pivotToFilter(column, value) {
  const filters = getFilterValues();
  filters[column] = value;
  applyFilterValues(filters);
  currentPage = 1;
  await loadData('pivot-navigation');
  await loadStats('pivot-navigation');
  showToast(`Pivoted to ${column}: ${value}`, 'info', 2000);
}
window.pivotToFilter = pivotToFilter;

export async function showRelatedEvents(srcIp, timestamp) {
  showLoading();
  try {
    const data = await fetchRelated(srcIp, timestamp);

    if (data.length === 0) {
      showToast('No related events found in the 5m window', 'info');
      return;
    }

    renderRows(data, 1, data.length);
    updatePagination(1, 1, data.length, data.length);
    showToast(`Found ${data.length} related events`, 'success');

    if (!document.getElementById('btn-back-to-main')) {
      const btn = document.createElement('button');
      btn.id = 'btn-back-to-main';
      btn.className = 'btn-secondary';
      btn.textContent = '← Back to Filtered View';
      btn.style.marginBottom = '10px';
      btn.onclick = () => {
        btn.remove();
        loadData('back-from-related');
      };
      document.getElementById('table-controls').prepend(btn);
    }
  } catch (err) {
    showToast(`Related events failed: ${err.message}`, 'error');
  }
}
window.showRelatedEvents = showRelatedEvents;

// ── State ──────────────────────────────────────────────────────
let columns = [];
let currentPage = 1;
let currentPageSize = 50;
let totalPages = 1;
const isDashboardPage = window.location.pathname.includes('dashboard.html');

/**
 * Syncs filters between pages via URL parameters.
 */
function serializeFilters(filters) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined || val === null || val === '') continue;
    params.set(key, key === 'customrules' ? JSON.stringify(val) : val);
  }
  return params.toString();
}

function deserializeFilters(queryString) {
  if (!queryString) return {};
  const params = new URLSearchParams(queryString);
  const filters = {};
  for (const [key, val] of params.entries()) {
    filters[key] = key === 'customrules' ? JSON.parse(val) : val;
  }
  return filters;
}

function navigateWithFilters(targetPage, overrides = {}) {
  const currentFilters = getFilterValues();
  const mergedFilters = { ...currentFilters, ...overrides };
  const query = serializeFilters(mergedFilters);
  window.location.href = `${targetPage}${query ? '?' + query : ''}`;
}

// ── Favorites Logic ───────────────────────────────────────────────
async function initFavorites() {
  const favoritesSelect = document.getElementById('filter-favorites');
  const btnSaveFav = document.getElementById('btn-save-favorite');

  if (!favoritesSelect || !btnSaveFav) return;

  // Load initial favorites
  await loadFavorites();

  // Apply favorite on change
  favoritesSelect.addEventListener('change', async (e) => {
    const favId = e.target.value;
    if (!favId) return;

    const favorites = Array.from(favoritesSelect.options)
      .filter(opt => opt.value !== '')
      .map(opt => ({ id: opt.value, name: opt.textContent }));

    try {
      const data = await getFavorites();
      const selected = data.find(f => f.id == favId);
      if (selected) {
        applyFilterValues(JSON.parse(selected.filter_values));
        currentPage = 1;
        loadData('favorite-applied');
        loadStats('favorite-applied');
        showToast(`Applied favorite: ${selected.name}`, 'success', 2000);
      }
    } catch (err) {
      showToast('Failed to apply favorite', 'error');
    }
  });

  // Save current filters as favorite
  btnSaveFav.onclick = async () => {
    const name = prompt('Enter a name for this filter preset:');
    if (!name) return;

    const filterValues = getFilterValues();
    if (Object.keys(filterValues).length === 0) {
      showToast('No active filters to save', 'warning');
      return;
    }

    try {
      await saveFavorite(name, filterValues);
      showToast('Favorite saved!', 'success');
      await loadFavorites();
    } catch (e) {
      showToast(`Save failed: ${e.message}`, 'error');
    }
  };
}

async function loadFavorites() {
  const select = document.getElementById('filter-favorites');
  if (!select) return;

  try {
    const favorites = await getFavorites();
    select.innerHTML = '<option value="">— Saved Filters —</option>' +
      favorites.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  } catch (err) {
    console.error('Failed to load favorites:', err);
  }
}

async function loadGlobalCharts(reason = 'periodic-refresh') {
  console.log(`[DEBUG] loadGlobalCharts triggered by: ${reason}`);

  // Ensure containers are rendered first
  renderCharts();

  try {
    // Fetch all graph data in parallel
    const [brasData, hourlyData, trendData, heatmapData] = await Promise.all([
      fetchBrasDistribution(),
      fetchHourlyTraffic(),
      fetchTrafficTrend(),
      fetchHeatmap()
    ]);

    // Update each chart independently
    updateBrasChart(brasData);
    updateHourlyChart(hourlyData);
    updateTrendChart(hourlyData, trendData);
    updateHeatmap(heatmapData);

  } catch (err) {
    console.error('Global charts load failed:', err);
    if (reason === 'initial-load') {
      showToast('Failed to load global analytics', 'error', 5000);
    }
  }
}

async function initializeApp() {
  // 1. Auth Check - MUST be first
  const token = localStorage.getItem('ipdr_token');
  const isLoginPage = window.location.pathname === '/login.html' || window.location.pathname === '/login';
  if (!token && !isLoginPage) {
    window.location.href = '/login.html';
    return;
  }

  try {
    // 2. Load settings
    const userSettings = loadSettings();
    currentPageSize = userSettings.pageSize || 50;
    const pageSizeSelect = document.getElementById('page-size-select');
    if (pageSizeSelect) pageSizeSelect.value = currentPageSize;

    // Apply Global Params
    const logoH1 = document.querySelector('.logo h1');
    if (logoH1 && userSettings.globalParams?.orgName) {
      logoH1.textContent = userSettings.globalParams.orgName;
    }

    // Health check
    await doHealthCheck();

    // Discover columns
    try {
      columns = await fetchColumns();
      if (!columns || columns.length === 0) {
        showToast('No columns found in view_parsed_logs. Check ClickHouse connection.', 'warning', 8000);
        return;
      }
      showToast(`Discovered ${columns.length} columns`, 'success', 2500);

      // Populate Connection Selector
      await initConnectionSelector();

      // Load User Preferences
      const prefs = await getPreferences();

      // Apply column visibility
      const visibleColNames = userSettings.visibleColumns.length > 0
        ? userSettings.visibleColumns
        : columns.map(c => c.name);

      const filteredCols = columns.filter(c => visibleColNames.includes(c.name));
      const finalCols = filteredCols.length > 0 ? filteredCols : columns;

      // Initialize Shared UI
      initSettingsModal(columns);
      initAdmin();
      initAlerts();

      // Handle Page-Specific Init
      if (isDashboardPage) {
        renderDashboard();
        initPeriodSelector();

        // Apply URL filters
        const urlFilters = deserializeFilters(window.location.search.substring(1));
        if (Object.keys(urlFilters).length > 0) {
          applyFilterValues(urlFilters);
        }

        await loadStats('initial-load');
        await loadGlobalCharts('initial-load');
      } else {
        setColumns(finalCols);
        renderFilters(columns);
        setDefaultFilterValue('dateFrom', getStartOfToday());
        initFavorites();

        // Apply URL filters
        const urlFilters = deserializeFilters(window.location.search.substring(1));
        if (Object.keys(urlFilters).length > 0) {
          applyFilterValues(urlFilters);
        }

        // Set initial active period to 'Today'
        document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
        const todayBtn = document.querySelector('.btn-period[data-period="today"]');
        if (todayBtn) todayBtn.classList.add('active');

        loadData('initial-load');
      }

    } catch (err) {
      showToast(`Column discovery failed: ${err.message}`, 'error', 8000);
      console.error(err);
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

document.addEventListener('DOMContentLoaded', initializeApp);

// ── Event Listeners ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('btn-search');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      currentPage = 1;
      loadData('search-btn');
      loadStats('search-btn');
    });
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetFilters();
      currentPage = 1;
      loadData('reset-btn');
      loadStats('reset-btn');
    });
  }

  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadData('refresh-btn');
      loadStats('refresh-btn');
    });
  }

  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const s = getSettings();
      downloadCSV(getFilterValues(), s.globalParams?.maxExportRows || 100000);
    });
  }

  // Pagination
  document.getElementById('btn-first-page')?.addEventListener('click', () => {
    currentPage = 1;
    loadData('pagination-first');
  });
  document.getElementById('btn-prev-page')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; loadData('pagination-prev'); }
  });
  document.getElementById('btn-next-page')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; loadData('pagination-next'); }
  });
  document.getElementById('btn-last-page')?.addEventListener('click', () => {
    currentPage = totalPages;
    loadData('pagination-last');
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await logout();
      } catch (e) {
        console.error('Logout API failed', e);
      } finally {
        localStorage.removeItem('ipdr_token');
        localStorage.removeItem('ipdr_user');
        window.location.href = '/login.html';
      }
    });
  }

  const brasMgmtBtn = document.getElementById('btn-bras-mgmt');
  if (brasMgmtBtn) {
    brasMgmtBtn.onclick = () => {
      window.location.href = 'bras-list.html';
    };
  }

  const auditLogsBtn = document.getElementById('btn-audit-logs');
  if (auditLogsBtn) {
    auditLogsBtn.onclick = () => {
      window.location.href = 'audit-logs.html';
    };
  }

  const dashboardBtn = document.getElementById('btn-go-dashboard');
  if (dashboardBtn) {
    dashboardBtn.onclick = () => navigateWithFilters('dashboard.html');
  }

  const recordsBtn = document.getElementById('btn-go-records');
  if (recordsBtn) {
    recordsBtn.onclick = () => navigateWithFilters('index.html');
  }

  const sizeSelect = document.getElementById('page-size-select');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', (e) => {
      currentPageSize = parseInt(e.target.value, 10);
      currentPage = 1;
      saveSettings({ pageSize: currentPageSize });
      loadData('pagination-size-change');
    });
  }

  onSort((col, order) => {
    currentPage = 1;
    loadData('sort-change');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-search')?.click();
    }
  });

  // Global charts refresh every 15 minutes
  if (isDashboardPage) {
    setInterval(() => loadGlobalCharts('periodic-refresh'), 15 * 60 * 1000);
  }
});

window.navigateToRecordsWithFilter = (column, value) => {
  navigateWithFilters('index.html', { [column]: value });
};

// ── Period Selector Logic ──────────────────────────────────────
function initPeriodSelector() {
  const btns = document.querySelectorAll('.btn-period');
  btns.forEach(btn => {
    btn.onclick = () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const period = btn.dataset.period;
      let dateFrom = '';
      let dateTo = '';

      if (period === 'today') {
        dateFrom = getStartOfToday();
        dateTo = getStartOfToday();
      } else if (period === 'yesterday') {
        dateFrom = getStartOfYesterday();
        dateTo = getStartOfYesterday();
      } else if (period === 'last-week') {
        dateFrom = getStartOfLastWeek();
        dateTo = getStartOfToday();
      }

      const dateInput = document.getElementById('filter-dateFrom');
      const dateToInput = document.getElementById('filter-dateTo');
      if (dateInput) {
        dateInput.value = dateFrom;
        if (dateToInput) dateToInput.value = dateTo;
        currentPage = 1;
        loadData('period-selector');
        loadStats('period-selector');
      }
    };
  });
}

// ── Settings Modal Logic ───────────────────────────────────────
function initSettingsModal(allCols) {
  const modal = document.getElementById('settings-modal');
  const btnSettings = document.getElementById('btn-settings');
  const btnClose = document.getElementById('btn-close-settings');
  const btnSave = document.getElementById('btn-save-settings');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const themeOpts = document.querySelectorAll('.theme-opt');
  const columnList = document.getElementById('column-list');

  const current = getSettings();

  columnList.innerHTML = allCols
    .filter(col => col && col.name)
    .map(col => `
    <label class="col-item">
      <input type="checkbox" data-col="${col.name}" ${current.visibleColumns.length === 0 || current.visibleColumns.includes(col.name) ? 'checked' : ''} />
      <span>${col.name}</span>
    </label>
  `).join('');

  document.getElementById('setting-refresh').value = current.autoRefresh;
  document.getElementById('setting-role').value = current.userRole;
  document.getElementById('setting-org').value = current.globalParams.orgName;
  document.getElementById('setting-export-limit').value = current.globalParams.maxExportRows;

  themeOpts.forEach(opt => {
    if (opt.dataset.theme === current.theme) opt.classList.add('active');
    else opt.classList.remove('active');
  });

  btnSettings.onclick = () => modal.classList.remove('hidden');
  btnClose.onclick = () => modal.classList.add('hidden');

  tabBtns.forEach(btn => {
    btn.onclick = () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });

  themeOpts.forEach(opt => {
    opt.onclick = () => {
      themeOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    };
  });

  btnSave.onclick = () => {
    const activeTheme = document.querySelector('.theme-opt.active').dataset.theme;
    const selectedCols = Array.from(columnList.querySelectorAll('input:checked')).map(i => i.dataset.col);

    const newSettings = {
      theme: activeTheme,
      visibleColumns: selectedCols,
      autoRefresh: parseInt(document.getElementById('setting-refresh').value, 10),
      userRole: document.getElementById('setting-role').value,
      globalParams: {
        orgName: document.getElementById('setting-org').value,
        maxExportRows: parseInt(document.getElementById('setting-export-limit').value, 10),
      }
    };

    saveSettings(newSettings);
    showToast('Settings saved! Reloading view...', 'success');
    setTimeout(() => window.location.reload(), 1000);
  };
}

async function initConnectionSelector() {
  const select = document.getElementById('filter-connection');
  if (!select) return;

  try {
    const conns = await adminGetConnections();
    select.innerHTML = conns.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    if (conns.length === 0) {
      showToast('No connections assigned to user', 'warning');
    }
  } catch (err) {
    console.error('Failed to load connections:', err);
  }
}

// ── Data Loading ───────────────────────────────────────────────
async function loadData(reason = 'unknown') {
  console.log(`[DEBUG] loadData triggered by: ${reason}`);
  showLoading();

  try {
    const filters = getFilterValues();
    const { sortColumn, sortOrder } = getSortState();
    const connectionId = document.getElementById('filter-connection')?.value;

    const result = await queryData({
      connectionId,
      filters,
      page: currentPage,
      pageSize: currentPageSize,
      sortColumn,
      sortOrder,
    });

    if (!result) return;

    if (result.debugSql) {
      const preview = document.getElementById('query-preview');
      if (preview) {
        preview.textContent = result.debugSql;
        preview.classList.remove('hidden');
      }
      console.log(`[SQL Debug] ${result.debugSql}`);
    } else {
      const preview = document.getElementById('query-preview');
      if (preview) {
        preview.classList.add('hidden');
      }
    }

    totalPages = result.totalPages || 1;
    currentPage = result.page || 1;

    renderRows(result.data, currentPage, currentPageSize);
    updatePagination(currentPage, totalPages, result.total, currentPageSize);
  } catch (err) {
    showToast(`Query failed: ${err.message}`, 'error');
    console.error(err);
    renderRows([], 1, currentPageSize);
    updatePagination(1, 1, 0, currentPageSize);
  }
}

async function loadStats(reason = 'unknown') {
  console.log(`[DEBUG] loadStats triggered by: ${reason}`);
  try {
    const filters = getFilterValues();
    const connectionId = document.getElementById('filter-connection')?.value || '0';
    const stats = await fetchStats(filters, connectionId);
    if (!stats) return;
    updateDashboard(stats);
    // Global charts are now handled by loadGlobalCharts to reduce DB load
  } catch (err) {
    console.error('Stats load failed:', err);
  }
}

// ── Health Check ───────────────────────────────────────────────
async function doHealthCheck() {
  const badge = document.getElementById('connection-status');
  const text = badge.querySelector('.status-text');

  try {
    await checkHealth();
    badge.className = 'connection-badge connected';
    text.textContent = 'Connected';
    return true;
  } catch (err) {
    badge.className = 'connection-badge disconnected';
    text.textContent = 'Disconnected';
    showToast('Cannot reach ClickHouse. Is the API server running?', 'error', 6000);
    return false;
  }
}

setInterval(doHealthCheck, 30000);

// ── Alert Notifications Logic ──────────────────────────────────────
async function initAlerts() {
  const btnAlerts = document.getElementById('btn-alerts');
  const panel = document.getElementById('alerts-panel');
  const btnClose = document.getElementById('btn-close-alerts');
  const btnResolveAll = document.getElementById('btn-resolve-all');
  const btnClear = document.getElementById('btn-clear-alerts');

  if (!btnAlerts || !panel) return;

  btnAlerts.onclick = () => {
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  };

  btnClose.onclick = () => {
    panel.style.display = 'none';
  };

  btnResolveAll.onclick = async () => {
    try {
      await resolveAllAlerts();
      showToast('All alerts resolved', 'success');
      updateAlerts();
    } catch (err) {
      showToast('Failed to resolve alerts', 'error');
    }
  };

  btnClear.onclick = async () => {
    if (!confirm('Clear all alert history?')) return;
    try {
      await clearAlerts();
      showToast('Alert history cleared', 'success');
      updateAlerts();
    } catch (err) {
      showToast('Failed to clear alerts', 'error');
    }
  };

  // Initial load and periodic poll
  updateAlerts();
  setInterval(updateAlerts, 30000);
}

async function updateAlerts() {
  try {
    const alerts = await getAlerts();
    const countBadge = document.getElementById('alert-count');
    const list = document.getElementById('alerts-list');

    if (countBadge) countBadge.textContent = alerts.length;
    if (!list) return;

    list.innerHTML = alerts.length === 0
      ? '<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:0.9rem">No active alerts</div>'
      : alerts.map(a => `
          <div class="alert-item" onclick="resolveAlert(${a.id})">
            <div class="alert-title">
              <span>${a.warrant_name}</span>
              <span class="alert-time">${new Date(a.detected_at).toLocaleString()}</span>
            </div>
            <code class="alert-sample">${a.log_sample || 'No sample available'}</code>
          </div>
        `).join('');
  } catch (err) {
    console.error('Alert update failed:', err);
  }
}

window.resolveAlert = async (id) => {
  try {
    await resolveAlert(id, true);
    showToast('Alert resolved', 'success');
    updateAlerts();
  } catch (err) {
    showToast('Failed to resolve alert', 'error');
  }
};
