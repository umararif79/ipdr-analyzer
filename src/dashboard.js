/* ═══════════════════════════════════════════════════════════════════
   Dashboard — Animated Rank Widgets & Charts
   ═══════════════════════════════════════════════════════════════════ */

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
      <div class="rank-number">#${index + 1}</div>
      <div class="rank-label">${title}</div>
      <div class="rank-value">${truncate(item[valueKey], 20)}</div>
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

// ── Charts ──────────────────────────────────────────────────────
let protocolChart = null;
let hourlyChart = null;
let trendChart = null;

/**
 * Render charts section.
 * @param {Object} stats
 */
export function renderCharts(stats) {
  const existing = document.getElementById('chart-row');
  const existingTrend = document.getElementById('trend-row');
  if (existing) existing.remove();
  if (existingTrend) existingTrend.remove();

  const brasDaily = stats.brasDailyDistribution || [];
  const hourly = stats.hourlyTraffic || [];

  if (brasDaily.length === 0 && hourly.length === 0) return;

  const row = document.createElement('div');
  row.id = 'chart-row';
  row.className = 'chart-row';

  if (brasDaily.length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>BRAS Daily Distribution (Last 7 Days)</h3>
      <div class="chart-canvas-wrap"><canvas id="chart-bras-daily"></canvas></div>
    `;
    row.appendChild(card);
  }

  if (hourly.length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>Hourly Traffic Volume</h3>
      <div class="chart-canvas-wrap"><canvas id="chart-hourly"></canvas></div>
    `;
    row.appendChild(card);
  }

  DASHBOARD.insertAdjacentElement('afterend', row);

  // Create a second row for Trends and Heatmap
  const trendRow = document.createElement('div');
  trendRow.id = 'trend-row';
  trendRow.className = 'chart-row';

  if (stats.previousHourlyTraffic && stats.previousHourlyTraffic.length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>Traffic Trend (Current vs Previous)</h3>
      <div class="chart-canvas-wrap"><canvas id="chart-trend"></canvas></div>
    `;
    trendRow.appendChild(card);
  }

  if (stats.heatmap && Object.keys(stats.heatmap).length > 0) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.innerHTML = `
      <h3>Traffic Heatmap (30 Days)</h3>
      <div class="heatmap-scroll-wrap">
        <div id="heatmap-container" class="heatmap-container" style="display:grid; grid-template-columns: repeat(24, 1fr); gap:2px; padding:10px 0; font-family:var(--font-mono); font-size:0.6rem; color:var(--text-muted)">
        </div>
      </div>
    `;
    trendRow.appendChild(card);
  }

  DASHBOARD.insertAdjacentElement('afterend', trendRow);

  requestAnimationFrame(() => {
    drawBrasDailyChart(brasDaily);
    drawHourlyChart(hourly);
    if (stats.previousHourlyTraffic) drawTrendChart(hourly, stats.previousHourlyTraffic);
    if (stats.heatmap) drawHeatmap(stats.heatmap);
  });
}

async function drawTrendChart(current, previous) {
  const canvas = document.getElementById('chart-trend');
  if (!canvas) return;
  await ensureChartJS();
  if (trendChart) trendChart.destroy();

  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const currData = Array.from({ length: 24 }, (_, i) => {
    const match = current.find(h => h.hour === i);
    return match ? match.cnt : 0;
  });
  const prevData = Array.from({ length: 24 }, (_, i) => {
    const match = previous.find(h => h.hour === i);
    return match ? match.cnt : 0;
  });

  trendChart = new Chart(canvas, {
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
}

function drawHeatmap(heatmap) {
  const container = document.getElementById('heatmap-container');
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

async function drawBrasDailyChart(brasDaily) {
  const canvas = document.getElementById('chart-bras-daily');
  if (!canvas || brasDaily.length === 0) return;
  await ensureChartJS();
  if (protocolChart) protocolChart.destroy();

  const labels = brasDaily.map(d => d.date);
  const allBras = [...new Set(brasDaily.flatMap(d => Object.keys(d.data)))];
  const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899', '#f97316', '#14b8a6', '#6366f1', '#a855f7', '#fb923c', '#94a3b8', '#475569', '#1e293b'];

  const datasets = allBras.map((bras, i) => ({
    label: bras,
    data: brasDaily.map(d => d.data[bras] || 0),
    backgroundColor: colors[i % colors.length],
    borderRadius: 2,
  }));

  protocolChart = new Chart(canvas, {
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
}

async function drawHourlyChart(hourly) {
  const canvas = document.getElementById('chart-hourly');
  if (!canvas || hourly.length === 0) return;
  await ensureChartJS();
  if (hourlyChart) hourlyChart.destroy();
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
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
        y: { ticks: { color: '#64748b', font: { size: 10 }, callback: (v) => formatBigNumber(v) }, grid: { color: 'rgba(148, 163, 184, 0.06)' } },
      },
    },
  });
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
