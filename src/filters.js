/* ═══════════════════════════════════════════════════════════════════
   Filter Panel — Dynamic filters based on discovered columns
   ═══════════════════════════════════════════════════════════════════ */

const FILTER_GRID = document.getElementById('filter-grid');

// Well-known filter fields we always show (if column exists)
const KNOWN_FILTERS = [
  { key: 'dateFrom',  label: 'Date From',    type: 'datetime-local', colMatch: ['timestamp', 'datetime', 'date', 'log_time', 'event_time'] },
  { key: 'dateTo',    label: 'Date To',      type: 'datetime-local', colMatch: ['timestamp', 'datetime', 'date', 'log_time', 'event_time'] },
];

/**
 * QueryBuilder handles the linear state and rendering of custom filters.
 * Each rule is a flat object: { column, operator, value, logic }
 */
class QueryBuilder {
  constructor(columns) {
    this.columns = columns;
    this.state = []; // Array of rule objects
    this.container = null;
  }

  init(parent) {
    this.container = document.createElement('div');
    this.container.className = 'query-builder-root';
    this.container.style.gridColumn = 'span 2';
    this.container.style.marginTop = '12px';
    this.container.style.padding = '12px';
    this.container.style.background = 'var(--bg-secondary)';
    this.container.style.border = '1px solid var(--border-default)';
    this.container.style.borderRadius = 'var(--radius-sm)';

    parent.appendChild(this.container);
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary)">Advanced Custom Filters</span>
        <div style="display:flex;gap:8px">
          <button id="qb-add-rule" style="font-size:0.7rem;padding:4px 8px;cursor:pointer;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);border-radius:4px"> + Add Rule </button>
        </div>
      </div>
      <div id="qb-rules-list" style="display:flex;flex-direction:column;gap:8px"></div>
    `;

    this.container.querySelector('#qb-add-rule').onclick = () => {
      this.addRule();
      this.render();
    };

    const listEl = this.container.querySelector('#qb-rules-list');
    this.state.forEach((rule, idx) => {
      listEl.appendChild(this.createRuleUI(rule, idx));
    });
  }

  createRuleUI(rule, idx) {
    const wrapper = document.createElement('div');
    wrapper.className = 'qb-rule';
    wrapper.style.cssText = 'display:flex; gap:6px; align-items:center; padding:6px; background:rgba(0,0,0,0.1); border-radius:4px;';

    // Logic Select (AND/OR) - Hidden for the first rule
    if (idx > 0) {
      const logicSelect = document.createElement('select');
      logicSelect.style.cssText = 'flex:0 0 60px;font-size:0.7rem;padding:4px;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);border-radius:3px';
      logicSelect.innerHTML = `
        <option value="AND" ${rule.logic === 'AND' ? 'selected' : ''}>AND</option>
        <option value="OR" ${rule.logic === 'OR' ? 'selected' : ''}>OR</option>
      `;
      logicSelect.onchange = (e) => { rule.logic = e.target.value; };
      wrapper.appendChild(logicSelect);
    } else {
      // Placeholder for alignment of first rule
      const spacer = document.createElement('div');
      spacer.style.cssText = 'flex:0 0 60px';
      wrapper.appendChild(spacer);
    }

    const colSelect = document.createElement('select');
    colSelect.style.cssText = 'flex:0 0 30%;font-family:var(--font-mono);font-size:0.75rem;padding:4px;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);border-radius:3px';
    colSelect.innerHTML = `<option value="">-- column --</option>` + this.columns.map(c => `<option value="${c.name}" ${rule.column === c.name ? 'selected' : ''}>${c.name}</option>`).join('');
    colSelect.onchange = (e) => { rule.column = e.target.value; };

    const opSelect = document.createElement('select');
    opSelect.style.cssText = 'flex:0 0 20%;font-size:0.75rem;padding:4px;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);border-radius:3px';
    const ops = { '=': '=', '!=': '!=', 'LIKE': 'LIKE', 'contains': 'Contains' };
    opSelect.innerHTML = Object.entries(ops).map(([val, lab]) => `<option value="${val}" ${rule.operator === val ? 'selected' : ''}>${lab}</option>`).join('');
    opSelect.onchange = (e) => { rule.operator = e.target.value; };

    const valInput = document.createElement('input');
    valInput.style.cssText = 'flex:1;font-family:var(--font-mono);font-size:0.75rem;padding:4px;background:var(--bg-primary);border:1px solid var(--border-default);color:var(--text-primary);border-radius:3px';
    valInput.value = rule.value || '';
    valInput.placeholder = 'Value...';
    valInput.oninput = (e) => { rule.value = e.target.value; };

    const delBtn = document.createElement('button');
    delBtn.textContent = '×';
    delBtn.style.cssText = 'flex:0 0 24px;height:24px;cursor:pointer;background:transparent;border:none;color:var(--text-muted);font-size:1.2rem;line-height:1';
    delBtn.onclick = () => {
      this.removeRule(idx);
      this.render();
    };

    wrapper.append(colSelect, opSelect, valInput, delBtn);
    return wrapper;
  }

  addRule() {
    this.state.push({ column: '', operator: '=', value: '', logic: 'AND' });
  }

  removeRule(index) {
    this.state.splice(index, 1);
  }

  getState() {
    return this.state;
  }
}

let queryBuilder = null;
let filterInputs = {};

/**
 * Render filter inputs based on available columns.
 * @param {Array<{name:string, type:string}>} columns
 */
export function renderFilters(columns) {
  FILTER_GRID.innerHTML = '';
  filterInputs = {};

  const colNames = columns.map(c => c.name ? c.name.toLowerCase() : '');

  // Render known filters
  for (const f of KNOWN_FILTERS) {
    const isDate = f.type === 'datetime-local';
    const hasMatch = f.colMatch.some(m => colNames.includes(m));

    if (!isDate && !hasMatch) continue;

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

  // Initialize and render the Advanced Query Builder
  queryBuilder = new QueryBuilder(columns);
  queryBuilder.init(FILTER_GRID);
}

/** Collect current filter values into an object for the API. */
export function getFilterValues() {
  const filters = {};

  for (const [key, input] of Object.entries(filterInputs)) {
    if (key.startsWith('_')) continue;
    const val = input.value.trim();
    if (val) filters[key] = val;
  }

  if (queryBuilder) {
    const rules = queryBuilder.getState();
    // Only attach customrules if there are actually rules defined
    if (rules && rules.length > 0) {
      filters.customrules = rules;
    }
  }

  return filters;
}

/** Sets the values of filter inputs from a provided filter object. */
export function applyFilterValues(filters) {
  if (!filters) return;

  for (const [key, value] of Object.entries(filters)) {
    if (filterInputs[key]) {
      filterInputs[key].value = value;
    }
  }

  if (filters.customrules && queryBuilder) {
    queryBuilder.state = filters.customrules;
    queryBuilder.render();
  }
}

/** Reset all filter inputs. */
export function resetFilters() {
  for (const input of Object.values(filterInputs)) {
    if (input.tagName === 'INPUT') input.value = '';
    if (input.tagName === 'SELECT') input.selectedIndex = 0;
  }
  if (queryBuilder) {
    queryBuilder.state = [];
    queryBuilder.render();
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
