/* ═══════════════════════════════════════════════════════════════════
   Dashboard — Stats cards + mini charts
   ═══════════════════════════════════════════════════════════════════ */

const DASHBOARD = document.getElementById('dashboard-section');

const STAT_CARDS = [
  { id: 'total',  label: 'Total Records',      icon: '📊', iconClass: 'blue',   field: 'total_records' },
  { id: 'users',  label: 'Unique Sources',      icon: '👥', iconClass: 'purple', field: 'unique_sources' },
  { id: 'dests',  label: 'Unique Destinations', icon: '🌐', iconClass: 'green',  field: 'unique_destinations' },
  { id: 'proto',  label: 'Top Protocol',        icon: '⚡', iconClass: 'orange', field: '_topProtocol' },
  { id: 'topDst', label: 'Top Destination',     icon: '🎯', iconClass: 'cyan',   field: '_topDest' },
];

/** Render dashboard stat cards */
export function renderDashboard() {
  DASHBOARD.innerHTML = '';

  for (const card of STAT_CARDS) {
    const el = document.createElement('div');
    el.className = 'stat-card';
    el.id = `stat-${card.id}`;
    el.innerHTML = `
      <div class="stat-icon ${card.iconClass}">${card.icon}</div>
      <div class="stat-content">
        <div class="stat-label">${card.label}</div>
        <div class="stat-value skeleton" style="width:80px;height:28px">&nbsp;</div>
        <div class="stat-sub">&nbsp;</div>
      </div>
    `;
    DASHBOARD.appendChild(el);
  }
}

/**
 * Update dashboard with stats data.
 * @param {Object} stats — from /api/stats
 */
export function updateDashboard(stats) {
  const summary = stats.summary || {};
  const protocols = stats.protocols || [];
  const topDests = stats.topDestinations || [];

  // Total records
  updateCard('total', formatBigNumber(summary.total_records || 0), 'records in view');

  // Unique sources
  updateCard('users', formatBigNumber(summary.unique_sources || 0), 'unique source IPs');

  // Unique destinations
  updateCard('dests', formatBigNumber(summary.unique_destinations || 0), 'unique destination IPs');

  // Top protocol
  if (protocols.length > 0) {
    const top = protocols[0];
    updateCard('proto', top.protocol || '—', `${formatBigNumber(top.cnt)} connections`);
  } else {
    updateCard('proto', '—', 'no data');
  }

  // Top destination
  if (topDests.length > 0) {
    const top = topDests[0];
    updateCard('topDst', truncate(top.dst_ip || '—', 18), `${formatBigNumber(top.cnt)} hits`);
  } else {
    updateCard('topDst', '—', 'no data');
  }
}

function updateCard(id, value, sub) {
  const card = document.getElementById(`stat-${id}`);
  if (!card) return;

  const valEl = card.querySelector('.stat-value');
  const subEl = card.querySelector('.stat-sub');

  valEl.classList.remove('skeleton');
  valEl.textContent = value;
  subEl.textContent = sub;
}

// ── Charts ──────────────────────────────────────────────────────
let protocolChart = null;
let hourlyChart = null;

/**
 * Render charts section.
 * @param {Object} stats
 */
export function renderCharts(stats) {
  // Remove existing chart row if present
  const existing = document.getElementById('chart-row');
  if (existing) existing.remove();

  const protocols = stats.protocols || [];
  const hourly = stats.hourlyTraffic || [];

  if (protocols.length === 0 && hourly.length === 0) return;

  const row = document.createElement('div');
  row.id = 'chart-row';
  row.className = 'chart-row';

  // Protocol Distribution
  if (protocols.length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>Protocol Distribution</h3>
      <div class="chart-canvas-wrap"><canvas id="chart-protocols"></canvas></div>
    `;
    row.appendChild(card);
  }

  // Hourly Traffic
  if (hourly.length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>Hourly Traffic Volume</h3>
      <div class="chart-canvas-wrap"><canvas id="chart-hourly"></canvas></div>
    `;
    row.appendChild(card);
  }

  // Insert after dashboard
  DASHBOARD.insertAdjacentElement('afterend', row);

  // Draw charts (Chart.js loaded from CDN)
  requestAnimationFrame(() => {
    drawProtocolChart(protocols);
    drawHourlyChart(hourly);
  });
}

async function ensureChartJS() {
  if (window.Chart) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function drawProtocolChart(protocols) {
  const canvas = document.getElementById('chart-protocols');
  if (!canvas || protocols.length === 0) return;

  await ensureChartJS();

  if (protocolChart) protocolChart.destroy();

  const colors = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4',
    '#ef4444', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
  ];

  protocolChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: protocols.map(p => p.protocol || 'unknown'),
      datasets: [{
        data: protocols.map(p => parseInt(p.cnt, 10)),
        backgroundColor: colors.slice(0, protocols.length),
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            padding: 12,
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
      },
      cutout: '60%',
    },
  });
}

async function drawHourlyChart(hourly) {
  const canvas = document.getElementById('chart-hourly');
  if (!canvas || hourly.length === 0) return;

  await ensureChartJS();

  if (hourlyChart) hourlyChart.destroy();

  // Fill 24 hours
  const hourMap = {};
  hourly.forEach(h => { hourMap[parseInt(h.hour, 10)] = parseInt(h.cnt, 10); });
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const data = Array.from({ length: 24 }, (_, i) => hourMap[i] || 0);

  hourlyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Connections',
        data,
        backgroundColor: 'rgba(59, 130, 246, 0.4)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: 'rgba(59, 130, 246, 0.7)',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 10 } },
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
        },
        y: {
          ticks: {
            color: '#64748b',
            font: { size: 10 },
            callback: (v) => formatBigNumber(v),
          },
          grid: { color: 'rgba(148, 163, 184, 0.06)' },
        },
      },
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function formatBigNumber(n) {
  const num = Number(n);
  if (isNaN(num)) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString('en-US');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
