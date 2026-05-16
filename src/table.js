/* ═══════════════════════════════════════════════════════════════════
   Data Table — Dynamic columns, sorting, cell formatting
   ═══════════════════════════════════════════════════════════════════ */

const TABLE_HEAD = document.getElementById('table-head');
const TABLE_BODY = document.getElementById('table-body');
const TABLE_LOADING = document.getElementById('table-loading');
const TABLE_EMPTY = document.getElementById('table-empty');
const TABLE_INFO = document.getElementById('table-info');
const PAGE_INDICATOR = document.getElementById('page-indicator');
const TOTAL_RECORDS = document.getElementById('total-records');

let currentColumns = [];
let sortColumn = 'log_datetime';
let sortOrder = 'DESC';
let onSortChange = null;

// Column classification helpers
const IP_PATTERNS = ['ip', 'addr', 'address', 'sip', 'dip'];
const TIME_PATTERNS = ['time', 'date', 'timestamp', 'datetime'];
const PORT_PATTERNS = ['port', 'sport', 'dport'];
const PROTOCOL_PATTERNS = ['protocol', 'proto'];
const URL_PATTERNS = ['url', 'uri', 'domain', 'host', 'sni'];

function matchesPattern(name, patterns) {
  const lower = name.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

/** Set columns and render table header. */
export function setColumns(columns) {
  currentColumns = columns;
  renderHeader();
}

/** Register a callback when sort changes: (column, order) => {} */
export function onSort(callback) {
  onSortChange = callback;
}

function renderHeader() {
  TABLE_HEAD.innerHTML = '';
  const tr = document.createElement('tr');

  // Row number
  const thNum = document.createElement('th');
  thNum.textContent = '#';
  thNum.style.width = '50px';
  thNum.style.cursor = 'default';
  tr.appendChild(thNum);

  for (const col of currentColumns) {
    const th = document.createElement('th');
    th.dataset.column = col.name;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = col.name;

    const sortSpan = document.createElement('span');
    sortSpan.className = 'sort-indicator';
    sortSpan.textContent = '⇅';

    th.appendChild(nameSpan);
    th.appendChild(sortSpan);

    // Update sort indicator
    if (col.name === sortColumn) {
      th.classList.add(sortOrder === 'ASC' ? 'sort-asc' : 'sort-desc');
      sortSpan.textContent = sortOrder === 'ASC' ? '▲' : '▼';
    }

    th.addEventListener('click', () => {
      if (sortColumn === col.name) {
        sortOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
      } else {
        sortColumn = col.name;
        sortOrder = 'DESC';
      }
      renderHeader();
      if (onSortChange) onSortChange(sortColumn, sortOrder);
    });

    tr.appendChild(th);
  }

  TABLE_HEAD.appendChild(tr);
}

/**
 * Render table body.
 * @param {Array<Object>} rows
 * @param {number} page
 * @param {number} pageSize
 */
export function renderRows(rows, page = 1, pageSize = 50) {
  TABLE_BODY.innerHTML = '';
  TABLE_LOADING.classList.add('hidden');

  if (!rows || rows.length === 0) {
    TABLE_EMPTY.classList.remove('hidden');
    return;
  }

  TABLE_EMPTY.classList.add('hidden');

  const startIdx = (page - 1) * pageSize;

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');

    // Row number
    const tdNum = document.createElement('td');
    tdNum.textContent = startIdx + i + 1;
    tdNum.style.color = 'var(--text-tertiary)';
    tdNum.style.fontSize = '0.72rem';
    tr.appendChild(tdNum);

    for (const col of currentColumns) {
      const td = document.createElement('td');
      const raw = row[col.name];
      const val = raw != null ? String(raw) : '';

      // Classify & style
      if (matchesPattern(col.name, PROTOCOL_PATTERNS)) {
        const badge = document.createElement('span');
        const proto = val.toLowerCase();
        badge.className = `protocol-badge ${['tcp','udp','http','https','dns'].includes(proto) ? proto : 'default'}`;
        badge.textContent = val || '—';
        td.appendChild(badge);
      } else if (matchesPattern(col.name, IP_PATTERNS)) {
        td.textContent = val || '—';
        td.classList.add('cell-ip');
      } else if (matchesPattern(col.name, TIME_PATTERNS)) {
        td.textContent = formatTimestamp(val);
        td.classList.add('cell-timestamp');
        td.title = val;
      } else if (matchesPattern(col.name, URL_PATTERNS)) {
        td.textContent = val || '—';
        td.title = val;
        td.style.maxWidth = '350px';
      } else {
        td.textContent = val || '—';
      }

      tr.appendChild(td);
    }

    TABLE_BODY.appendChild(tr);
  });
}

/** Update pagination info */
export function updatePagination(page, totalPages, total, pageSize) {
  PAGE_INDICATOR.textContent = `Page ${page} of ${totalPages || 1}`;
  TOTAL_RECORDS.textContent = `${formatNumber(total)} records`;

  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  TABLE_INFO.innerHTML = `Showing <strong>${formatNumber(from)}–${formatNumber(to)}</strong> of <strong>${formatNumber(total)}</strong>`;

  // Enable/disable buttons
  document.getElementById('btn-first-page').disabled = page <= 1;
  document.getElementById('btn-prev-page').disabled = page <= 1;
  document.getElementById('btn-next-page').disabled = page >= totalPages;
  document.getElementById('btn-last-page').disabled = page >= totalPages;
}

/** Show loading state */
export function showLoading() {
  TABLE_LOADING.classList.remove('hidden');
  TABLE_EMPTY.classList.add('hidden');
  TABLE_BODY.innerHTML = '';
}

/** Get current sort state */
export function getSortState() {
  return { sortColumn, sortOrder };
}

// ── Helpers ──────────────────────────────────────────────────────
function formatTimestamp(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
  } catch {
    return val;
  }
}

function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}
