/* ═══════════════════════════════════════════════════════════════════
   IPDR Log Analyzer — Main Entry Point
   Wires up all modules: API, Filters, Table, Dashboard, Export
   ═══════════════════════════════════════════════════════════════════ */

import { checkHealth, fetchColumns, queryData, fetchStats } from './api.js';
import { renderFilters, getFilterValues, resetFilters, setDefaultFilterValue, getStartOfToday, getStartOfYesterday, getStartOfLastWeek } from './filters.js';
import { setColumns, renderRows, updatePagination, showLoading, onSort, getSortState } from './table.js';
import { renderDashboard, updateDashboard, renderCharts } from './dashboard.js';
import { downloadCSV } from './export.js';
import { showToast } from './toast.js';
import { loadSettings, saveSettings, getSettings, isAdmin } from './settings.js';
import { initAdmin } from './admin.js';

// ── State ──────────────────────────────────────────────────────
let columns = [];
let currentPage = 1;
let currentPageSize = 50;
let totalPages = 1;

// ── Init ───────────────────────────────────────────────────────
async function initializeApp() {
  // 1. Auth Check - MUST be first
  const token = localStorage.getItem('ipdr_token');
  if (!token) {
    window.location.href = '/login';
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

    // Render dashboard skeleton immediately
    renderDashboard();

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

      // Apply column visibility
      const visibleColNames = userSettings.visibleColumns.length > 0
        ? userSettings.visibleColumns
        : columns.map(c => c.name);

      const filteredCols = columns.filter(c => visibleColNames.includes(c.name));

      // Initialize UI
      setColumns(filteredCols);
      renderFilters(columns);
      setDefaultFilterValue('dateFrom', getStartOfToday());
      initSettingsModal(columns);
      initPeriodSelector();
      initAdmin();

      // Set initial active period to 'Today'
      document.querySelectorAll('.btn-period').forEach(b => b.classList.remove('active'));
      const todayBtn = document.querySelector('.btn-period[data-period="today"]');
      if (todayBtn) todayBtn.classList.add('active');

      // Load initial data and stats
      loadData('initial-load');
      loadStats('initial-load');

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
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
        });
      } catch (e) {
        console.error('Logout API failed', e);
      } finally {
        localStorage.removeItem('ipdr_token');
        localStorage.removeItem('ipdr_user');
        window.location.href = '/login';
      }
    });
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
});

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

  columnList.innerHTML = allCols.map(col => `
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
    const res = await fetch('/api/admin/connections', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const conns = await res.json();

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
    const stats = await fetchStats(filters);
    if (!stats) return;
    updateDashboard(stats);
    renderCharts(stats);
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
