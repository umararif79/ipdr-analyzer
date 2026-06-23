/* ═══════════════════════════════════════════════════════════════════
   Dashboard — Animated Rank Widgets & Charts
   ═══════════════════════════════════════════════════════════════════ */

import { pivotToFilter } from './main.js';

const DASHBOARD = document.getElementById('dashboard-section');

/**
 * Creates an animated rank widget for a specific metric.
 * @param {string} title - Widget title (e.g., "Top IPs")
 * @param {Array} data - Array of { value, cnt } objects
 * @param {string} valueKey - Which key in data contains the label (e.g., 'dst_ip')
 */
function createRankWidget(title, data, valueKey) {
  const widget = document.createElement('div');
  widget.className = 'rank-widget glass-panel';

  // State for animation
  let currentIndex = 0;

  const renderItem = (index) => {
    const item = data[index];
    return `
      <div class="rank-number">${index + 1}</div>
      <div class="rank-label">${title}</div>
      <div class="rank-value" style="cursor:pointer" onclick="window.navigateToRecordsWithFilter('${valueKey}', '${item[valueKey]}')">${truncate(item[valueKey], 20)}</div>
      <div class="rank-count">${formatBigNumber(item.cnt)} hits</div>
    `;
  };

  widget.innerHTML = `
    ${renderItem(0)}
    <div class="expanded-list">
      <div class="close-expanded">✕</div>
      <div style="font-weight:bold; margin-bottom:10px; color:var(--text-primary)">Full Top 10 Ranking</div>
      ${data.map((item, i) => `
        <div class="rank-item">
          <span><span class="rank-pos">${i + 1}.</span>${truncate(item[valueKey], 25)}</span>
          <span>${formatBigNumber(item.cnt)}</span>
        </div>
      `).join('')}
    </div>
  `;

  // Rotation animation
  setInterval(() => {
    if (widget.classList.contains('expanded')) return;

    const valEl = widget.querySelector('.rank-value');
    const countEl = widget.querySelector('.rank-count');
    const numEl = widget.querySelector('.rank-number');

    valEl.classList.add('fade-out');

    setTimeout(() => {
      currentIndex = (currentIndex + 1) % data.length;
      const item = data[currentIndex];

      valEl.textContent = truncate(item[valueKey], 20);
      countEl.textContent = `${formatBigNumber(item.cnt)} hits`;
      numEl.textContent = `#${currentIndex + 1}`;

      valEl.classList.remove('fade-out');
      valEl.classList.add('fade-in');
      setTimeout(() => valEl.classList.remove('fade-in'), 300);
    }, 300);
  }, 3000);

  // Expand/Collapse logic
  widget.addEventListener('click', (e) => {
    if (e.target.classList.contains('close-expanded')) {
      widget.classList.remove('expanded');
      return;
    }
    widget.classList.toggle('expanded');
  });

  return widget;
}

/** Render dashboard structure */
export function renderDashboard() {
  DASHBOARD.innerHTML = '';
}

/**
 * Update dashboard with stats data.
 * @param {Object} stats — from /api/stats
 */
export function updateDashboard(stats) {
  DASHBOARD.innerHTML = ''; // Clear previous widgets

  const widgets = [
    { title: 'Top BRAS', data: stats.brasDistribution, key: 'bras' },
    { title: 'Top Destinations', data: stats.topDestinations, key: 'dst_ip' },
    { title: 'Top Countries', data: stats.topCountries, key: 'country' },
    { title: 'Top Applications', data: stats.topApps, key: 'application' },
    { title: 'Top Organizations', data: stats.topOrgs, key: 'organization' },
  ];


  widgets.forEach(w => {
    if (w.data && w.data.length > 0) {
      DASHBOARD.appendChild(createRankWidget(w.title, w.data, w.key));
    }
  });
}

/**
 * Expands a chart into a full-screen modal view.
 * @param {string} type - Chart type ('bras', 'hourly', 'trend', 'heatmap')
 * @param {string} title - Title for the modal header
 */
export async function expandChart(type, title) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content glass-panel';
  content.style.width = '98%';
  content.style.maxWidth = 'none';
  content.style.height = '98vh';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; flex:1">
      <div style="font-weight:bold; font-size:1.2rem; color:var(--text-primary)">${title}</div>
    </div>
    <div class="chart-actions" style="gap:10px">
      <button class="btn-icon" id="modal-export-btn">
        <i class="fas fa-download"></i> Export Image
      </button>
      <div class="close-expanded" style="cursor:pointer; font-size:1.5rem; line-height:1; margin-left:10px;">&times;</div>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'modal-body';
  body.style.padding = '10px';

  const chartWrap = document.createElement('div');
  chartWrap.className = 'modal-chart-container';

  const canvasId = `modal-chart-${Date.now()}`;

  if (type === 'heatmap') {
    chartWrap.innerHTML = `<div id="${canvasId}" class="heatmap-container" style="display:grid; grid-template-columns: repeat(24, 1fr); gap:2px; font-family:var(--font-mono); font-size:0.6rem; color:var(--text-muted)"></div>`;
  } else {
    chartWrap.innerHTML = `<canvas id="${canvasId}"></canvas>`;
  }

  body.appendChild(chartWrap);
  content.appendChild(header);
  content.appendChild(body);
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  // Draw the chart into the modal
  let modalChart = null;
  if (type === 'bras' && chartData.brasDaily) {
    modalChart = await drawBrasDailyChart(chartData.brasDaily, canvasId);
  } else if (type === 'hourly' && chartData.hourly) {
    modalChart = await drawHourlyChart(chartData.hourly, canvasId);
  } else if (type === 'trend' && chartData.trendCurrent) {
    modalChart = await drawTrendChart(chartData.trendCurrent, chartData.trendPrevious, canvasId);
  } else if (type === 'heatmap' && chartData.heatmap) {
    drawHeatmap(chartData.heatmap, canvasId);
  }

  const close = () => {
    if (modalChart) modalChart.destroy();
    overlay.remove();
  };

  header.querySelector('.close-expanded').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };

  // Export Image functionality
  header.querySelector('#modal-export-btn').onclick = () => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (type === 'heatmap') {
      // Heatmaps are DOM elements, not canvas. We can't easily export as image without a library.
      // For now, we'll notify the user or try to capture if it were a canvas.
      alert('Image export is currently only supported for line/bar charts.');
      return;
    }

    try {
      const link = document.createElement('a');
      link.download = `${title.replace(/\s+/g, '_').toLowerCase()}_export.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export chart image.');
    }
  };
}

// Expose to window for onclick handlers
window.expandChart = expandChart;

// ── Charts ──────────────────────────────────────────────────────
let protocolChart = null;
let hourlyChart = null;
let trendChart = null;

// Cache for the latest data used in charts to allow expansion into modals
const chartData = {
  brasDaily: null,
  hourly: null,
  trendCurrent: null,
  trendPrevious: null,
  heatmap: null,
};

/**
 * Render the basic structure for charts.
 * This creates the containers once so they can be updated independently.
 */
export function renderCharts() {
  const existing = document.getElementById('chart-row');
  const existingTrend = document.getElementById('trend-row');
  if (existing) existing.remove();
  if (existingTrend) existingTrend.remove();

  const row = document.createElement('div');
  row.id = 'chart-row';
  row.className = 'chart-row';
  row.innerHTML = `
    <div class="chart-card">
      <div class="chart-header">
        <h3>BRAS Daily Distribution (Last 7 Days)</h3>
        <div class="chart-actions">
          <button class="btn-icon" onclick="window.expandChart('bras', 'BRAS Daily Distribution')">
            <i class="fas fa-expand-alt"></i> Expand
          </button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-bras-daily"></canvas></div>
      <div id="inactive-bras-container" class="hidden" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-subtle)">
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-header">
        <h3>Hourly Traffic Volume</h3>
        <div class="chart-actions">
          <button class="btn-icon" onclick="window.expandChart('hourly', 'Hourly Traffic Volume')">
            <i class="fas fa-expand-alt"></i> Expand
          </button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-hourly"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-header">
        <h3>Traffic Trend (Current vs Previous)</h3>
        <div class="chart-actions">
          <button class="btn-icon" onclick="window.expandChart('trend', 'Traffic Trend')">
            <i class="fas fa-expand-alt"></i> Expand
          </button>
        </div>
      </div>
      <div class="chart-canvas-wrap"><canvas id="chart-trend"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-header">
        <h3>Traffic Heatmap (30 Days)</h3>
        <div class="chart-actions">
          <button class="btn-icon" onclick="window.expandChart('heatmap', 'Traffic Heatmap')">
            <i class="fas fa-expand-alt"></i> Expand
          </button>
        </div>
      </div>
      <div class="heatmap-scroll-wrap">
        <div id="heatmap-container" class="heatmap-container" style="display:grid; grid-template-columns: repeat(24, 1fr); gap:2px; padding:10px 0; font-family:var(--font-mono); font-size:0.6rem; color:var(--text-muted)">
        </div>
      </div>
    </div>
  `;
  DASHBOARD.insertAdjacentElement('afterend', row);
}

/**
 * Update specific charts with provided data.
 */
export function updateBrasChart(data) {
  if (!data || !data.distribution || data.distribution.length === 0) return;
  chartData.brasDaily = data.distribution;
  drawBrasDailyChart(data.distribution);
  updateInactiveBrasList(data.inactiveBras || []);
}

function updateInactiveBrasList(inactiveBras) {
  const container = document.getElementById('inactive-bras-container');
  if (!container) return;

  if (inactiveBras.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    <div style="font-size: 0.7rem; font-weight: bold; color: var(--error); margin-bottom: 8px; text-transform: uppercase; display: flex; align-items: center; gap: 5px;">
      <i class="fas fa-exclamation-triangle"></i> Inactive BRAS (No data last 7 days)
    </div>
    <div class="inactive-bras-list">
      ${inactiveBras.map(item => `
        <div class="inactive-bras-item">
          <span class="bras-name">${truncate(item.bras, 25)}</span>
          <span class="last-seen">Last seen: ${item.lastSeen}</span>
        </div>
      `).join('')}
    </div>
  `;
}


export function updateHourlyChart(data) {
  if (!data || data.length === 0) return;
  chartData.hourly = data;
  drawHourlyChart(data);
}

export function updateTrendChart(current, previous) {
  if (!current || current.length === 0) return;
  chartData.trendCurrent = current;
  chartData.trendPrevious = previous;
  drawTrendChart(current, previous || []);
}

export function updateHeatmap(data) {
  if (!data || Object.keys(data).length === 0) return;
  chartData.heatmap = data;
  drawHeatmap(data);
}

async function drawTrendChart(current, previous, canvasId = 'chart-trend') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  await ensureChartJS();
  if (trendChart && canvasId === 'chart-trend') trendChart.destroy();

  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const currData = Array.from({ length: 24 }, (_, i) => {
    const match = current.find(h => h.hour === i);
    return match ? match.cnt : 0;
  });
  const prevData = Array.from({ length: 24 }, (_, i) => {
    const match = previous.find(h => h.hour === i);
    return match ? match.cnt : 0;
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Current',
          data: currData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
        },
        {
          label: 'Previous',
          data: prevData,
          borderColor: '#94a3b8',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.4,
          pointRadius: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatBigNumber(ctx.raw)} hits` } }
      },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatBigNumber(v) }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
      },
    },
  });

  if (canvasId === 'chart-trend') trendChart = chart;
  return chart;
}

function drawHeatmap(heatmap, containerId = 'heatmap-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const values = Object.values(heatmap);
  const max = Math.max(...values);
  const min = Math.min(...values);

  const dates = [...new Set(Object.keys(heatmap).map(k => k.split('_')[0]))].sort();

  container.innerHTML = '';

  // Header Row (Hours)
  const headerRow = document.createElement('div');
  headerRow.style.display = 'contents';
  for (let i = 0; i < 24; i++) {
    const cell = document.createElement('div');
    cell.textContent = i;
    cell.style.textAlign = 'center';
    cell.style.paddingBottom = '4px';
    headerRow.appendChild(cell);
  }
  container.appendChild(headerRow);

  // Data Rows (Dates)
  dates.forEach(date => {
    const dateLabel = document.createElement('div');
    dateLabel.textContent = date.slice(5); // MM-DD
    dateLabel.style.gridColumn = 'span 1';
    dateLabel.style.fontSize = '0.5rem';
    dateLabel.style.display = 'flex';
    dateLabel.style.alignItems = 'center';
    container.appendChild(dateLabel);

    for (let h = 0; h < 24; h++) {
      const val = heatmap[`${date}_${h}`] || 0;
      const cell = document.createElement('div');
      const intensity = max === min ? 0.2 : (val - min) / (max - min);
      cell.style.backgroundColor = `rgba(59, 130, 246, ${0.1 + intensity * 0.9})`;
      cell.style.height = '12px';
      cell.style.borderRadius = '1px';
      cell.title = `${date} ${h}:00 - ${formatBigNumber(val)} hits`;
      container.appendChild(cell);
    }
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

async function drawBrasDailyChart(brasDaily, canvasId = 'chart-bras-daily') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !brasDaily || brasDaily.length === 0) return;
  await ensureChartJS();
  if (protocolChart && canvasId === 'chart-bras-daily') protocolChart.destroy();

  const labels = brasDaily.map(d => d.date);
  const allBras = [...new Set(brasDaily.flatMap(d => Object.keys(d.data)))];
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#a855f7', '#fb923c', '#94a3b8', '#475569', '#1e293b'];

  const datasets = allBras.map((bras, i) => ({
    label: bras,
    data: brasDaily.map(d => d.data[bras] || 0),
    backgroundColor: colors[i % colors.length],
    borderRadius: 2,
  }));

  const chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12, usePointStyle: true, pointStyleWidth: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBigNumber(ctx.raw)} hits`
          }
        }
      },
      scales: {
        x: { stacked: true, ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatBigNumber(v) }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
      },
    },
  });

  if (canvasId === 'chart-bras-daily') protocolChart = chart;
  return chart;
}

async function drawHourlyChart(hourly, canvasId = 'chart-hourly') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || hourly.length === 0) return;
  await ensureChartJS();
  if (hourlyChart && canvasId === 'chart-hourly') hourlyChart.destroy();
  const hourMap = {};
  hourly.forEach(h => { hourMap[parseInt(h.hour, 10)] = parseInt(h.cnt, 10); });
  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const data = Array.from({ length: 24 }, (_, i) => hourMap[i] || 0);
  const chart = new Chart(canvas, {
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
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
        y: { ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatBigNumber(v) }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
      },
    },
  });
  if (canvasId === 'chart-hourly') hourlyChart = chart;
  return chart;
}

function formatBigNumber(n) {
  const num = Number(n);
  if (isNaN(num)) return '0';

  const decimals = 2;
  if (num >= 1_000_000_000_000) return (num / 1_000_000_000_000).toFixed(decimals) + 'T';
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(decimals) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(decimals) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(decimals) + 'K';
  return num.toLocaleString('en-US');
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : (str || '—');
}
