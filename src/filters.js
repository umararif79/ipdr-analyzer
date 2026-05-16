/* ═══════════════════════════════════════════════════════════════════
   Filter Panel — Dynamic filters based on discovered columns
   ═══════════════════════════════════════════════════════════════════ */

const FILTER_GRID = document.getElementById('filter-grid');

// Well-known filter fields we always show (if column exists)
const KNOWN_FILTERS = [
  { key: 'dateFrom',  label: 'Date From',    type: 'datetime-local', colMatch: ['timestamp', 'datetime', 'date', 'log_time', 'event_time'] },
  { key: 'dateTo',    label: 'Date To',      type: 'datetime-local', colMatch: ['timestamp', 'datetime', 'date', 'log_time', 'event_time'] },
];

let filterInputs = {};

/**
 * Render filter inputs based on available columns.
 * @param {Array<{name:string, type:string}>} columns
 */
export function renderFilters(columns) {
  FILTER_GRID.innerHTML = '';
  filterInputs = {};

  const colNames = columns.map(c => c.name.toLowerCase());

  // Render known filters
  for (const f of KNOWN_FILTERS) {
    // Show date filters always, others only if a matching column exists
    const isDate = f.type === 'datetime-local';
    const hasMatch = f.colMatch.some(m => colNames.includes(m));

    if (!isDate && !hasMatch) continue;
    // For date: only show if at least one time column exists
    if (isDate && !f.colMatch.some(m => colNames.includes(m))) {
      // Still show date filters — likely that timestamp exists with different name
    }

    const group = document.createElement('div');
    group.className = 'filter-group';

    const label = document.createElement('label');
    label.textContent = f.label;
    label.setAttribute('for', `filter-${f.key}`);

    const input = document.createElement('input');
    input.id = `filter-${f.key}`;
    input.type = f.type;
    input.placeholder = f.label + '...';

    if (f.type === 'number') {
      input.min = 0;
      input.max = 65535;
    }

    // Enter key triggers search
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-search')?.click();
      }
    });

    group.appendChild(label);
    group.appendChild(input);
    FILTER_GRID.appendChild(group);

    filterInputs[f.key] = input;
  }

  // Generic column filter
  const genericGroup = document.createElement('div');
  genericGroup.className = 'filter-group';
  genericGroup.style.gridColumn = 'span 2';

  genericGroup.innerHTML = `
    <label>Custom Column Filter</label>
    <div style="display:flex;gap:6px">
      <select id="filter-generic-col" style="flex:0 0 40%;font-family:var(--font-mono);font-size:0.8rem;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:var(--radius-sm);color:var(--text-primary);outline:none">
        <option value="">— column —</option>
        ${columns.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
      </select>
      <input id="filter-generic-val" type="text" placeholder="Value..." style="flex:1;font-family:var(--font-mono);font-size:0.8rem;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-default);border-radius:var(--radius-sm);color:var(--text-primary);outline:none" />
    </div>
  `;
  FILTER_GRID.appendChild(genericGroup);

  filterInputs._genericCol = genericGroup.querySelector('#filter-generic-col');
  filterInputs._genericVal = genericGroup.querySelector('#filter-generic-val');

  // Enter key on generic value
  filterInputs._genericVal.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-search')?.click();
  });
}

/** Collect current filter values into an object for the API. */
export function getFilterValues() {
  const filters = {};

  for (const [key, input] of Object.entries(filterInputs)) {
    if (key.startsWith('_')) continue;
    const val = input.value.trim();
    if (val) filters[key] = val;
  }

  // Generic
  const col = filterInputs._genericCol?.value;
  const val = filterInputs._genericVal?.value?.trim();
  if (col && val) {
    filters.genericColumn = col;
    filters.genericValue = val;
  } else {
    // Ensure we don't send stale generic filters if the input is cleared
    delete filters.genericColumn;
    delete filters.genericValue;
  }

  return filters;
}

/** Reset all filter inputs. */
export function resetFilters() {
  for (const input of Object.values(filterInputs)) {
    if (input.tagName === 'INPUT') input.value = '';
    if (input.tagName === 'SELECT') input.selectedIndex = 0;
  }
}

/** Formats a date object to YYYY-MM-DDTHH:mm for datetime-local inputs. */
export function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${mins}`;
}

/** Returns today's date at midnight in YYYY-MM-DDTHH:mm format. */
export function getStartOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return formatDateForInput(now);
}

/** Returns yesterday's date at midnight in YYYY-MM-DDTHH:mm format. */
export function getStartOfYesterday() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  now.setHours(0, 0, 0, 0);
  return formatDateForInput(now);
}

/** Returns the date 7 days ago at midnight in YYYY-MM-DDTHH:mm format. */
export function getStartOfLastWeek() {
  const now = new Date();
  now.setDate(now.getDate() - 7);
  now.setHours(0, 0, 0, 0);
  return formatDateForInput(now);
}

/** Sets a default value for a filter by its key. */
export function setDefaultFilterValue(key, value) {
  if (filterInputs[key]) {
    filterInputs[key].value = value;
  }
}
