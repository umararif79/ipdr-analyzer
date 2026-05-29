/* ═══════════════════════════════════════════════════════════════════
   Admin Module — Manages Users and ClickHouse Connections
   ═══════════════════════════════════════════════════════════════════ */

import { showToast } from './toast.js';

let currentEditingConnId = null;
let currentEditingUserId = null;

export function initAdmin() {
  const btnAdmin = document.getElementById('btn-admin');
  const adminPanel = document.getElementById('admin-panel');
  const btnCloseAdmin = document.getElementById('btn-close-admin');

  if (!btnAdmin) return;

  // Show admin button only if user is admin
  const user = JSON.parse(localStorage.getItem('ipdr_user') || '{}');
  if (user.role === 'admin') {
    btnAdmin.classList.remove('hidden');
  }

  btnAdmin.onclick = () => adminPanel.classList.remove('hidden');
  btnCloseAdmin.onclick = () => adminPanel.classList.add('hidden');

  // Tabs logic
  document.querySelectorAll('#admin-panel .tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#admin-panel .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#admin-panel .tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    };
  });

// Initialization
  loadConnections();
  loadUsers();
  loadWarrants();
  loadSystemSettings();
  initConnectionModal();
  initUserModal();
  initWarrantModal();
}

async function loadWarrants() {
  try {
    const res = await fetch('/api/admin/warrants', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('warrant-body');
    tbody.innerHTML = data.map(w => `
      <tr class="${w.active ? '' : 'opacity-50'}">
        <td>${w.name}</td>
        <td><code style="background:var(--bg-elevated); color:var(--text-primary); padding:2px 4px; border-radius:3px; border:1px solid var(--border-default)">${w.column_name}</code></td>
        <td>${w.operator} <code style="background:var(--bg-elevated); color:var(--text-primary); padding:2px 4px; border-radius:3px; border:1px solid var(--border-default)">${w.value}</code></td>
        <td><span class="badge ${w.active ? 'bg-success' : 'bg-danger'}">${w.active ? 'Active' : 'Inactive'}</span></td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="editWarrant(${w.id})">Edit</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="deleteWarrant(${w.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load warrants', 'error');
  }
}

window.deleteWarrant = async (id) => {
  try {
    const res = await fetch(`/api/admin/warrants/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    if (res.ok) {
      showToast('Warrant deleted', 'success');
      loadWarrants();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Error deleting warrant', 'error');
    }
  } catch (err) {
    showToast('Error deleting warrant', 'error');
  }
};

window.editWarrant = async (id) => {
  try {
    const res = await fetch('/api/admin/warrants', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const warrants = await res.json();
    const warrant = warrants.find(w => w.id === id);
    if (!warrant) return;

    currentEditingWarrantId = id;
    document.getElementById('war-name').value = warrant.name;
    document.getElementById('war-column').value = warrant.column_name;
    document.getElementById('war-operator').value = warrant.operator;
    document.getElementById('war-value').value = warrant.value;
    document.getElementById('war-active').checked = warrant.active;
    document.getElementById('btn-save-warrant').textContent = 'Update Warrant';
    document.getElementById('warrant-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to load warrant details', 'error');
  }
};

let currentEditingWarrantId = null;

function initWarrantModal() {
  const modal = document.getElementById('warrant-modal');
  const btnAdd = document.getElementById('btn-add-warrant');

  btnAdd.onclick = () => {
    currentEditingWarrantId = null;
    document.getElementById('war-name').value = '';
    document.getElementById('war-column').value = '';
    document.getElementById('war-operator').value = '=';
    document.getElementById('war-value').value = '';
    document.getElementById('war-active').checked = true;
    document.getElementById('btn-save-warrant').textContent = 'Save Warrant';
    modal.classList.remove('hidden');
  };
  modal.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');

  document.getElementById('btn-save-warrant').onclick = async () => {
    const body = {
      name: document.getElementById('war-name').value,
      column_name: document.getElementById('war-column').value,
      operator: document.getElementById('war-operator').value,
      value: document.getElementById('war-value').value,
      active: document.getElementById('war-active').checked,
    };

    const method = currentEditingWarrantId ? 'PUT' : 'POST';
    const url = currentEditingWarrantId ? `/api/admin/warrants/${currentEditingWarrantId}` : '/api/admin/warrants';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast(currentEditingWarrantId ? 'Warrant updated' : 'Warrant saved', 'success');
        modal.classList.add('hidden');
        loadWarrants();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Error saving warrant', 'error');
      }
    } catch (err) {
      showToast('Error saving warrant', 'error');
    }
  };
}

async function loadSystemSettings() {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const settings = await res.json();
    const debugSetting = settings.find(s => s.key === 'debug_mode');
    const checkbox = document.getElementById('setting-debug-mode');
    if (checkbox) {
      checkbox.checked = debugSetting ? debugSetting.value === 'true' : true;
      checkbox.onchange = async () => {
        try {
          await fetch('/api/admin/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}`
            },
            body: JSON.stringify({ key: 'debug_mode', value: checkbox.checked })
          });
          showToast('Debug mode updated', 'success');
        } catch (e) {
          showToast('Failed to update debug mode', 'error');
        }
      };
    }

    const periodSetting = settings.find(s => s.key === 'stats_period');
    const periodSelect = document.getElementById('setting-stats-period');
    if (periodSelect) {
      periodSelect.value = periodSetting ? periodSetting.value : 'today';
      periodSelect.onchange = async () => {
        try {
          await fetch('/api/admin/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}`
            },
            body: JSON.stringify({ key: 'stats_period', value: periodSelect.value })
          });
          showToast('Stats period updated', 'success');
        } catch (e) {
          showToast('Failed to update stats period', 'error');
        }
      };
    }
  } catch (err) {
    console.error('Failed to load system settings:', err);
  }
}

window.deleteConn = async (id) => {
  try {
    const res = await fetch(`/api/admin/connections/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });

    if (res.ok) {
      showToast('Connection deleted', 'success');
      loadConnections();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Error deleting connection', 'error');
    }
  } catch (err) {
    showToast('Error deleting connection', 'error');
  }
};

window.deleteUser = async (id) => {
  try {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });

    if (res.ok) {
      showToast('User deleted', 'success');
      loadUsers();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Error deleting user', 'error');
    }
  } catch (err) {
    showToast('Error deleting user', 'error');
  }
};

async function loadConnections() {
  try {
    const res = await fetch('/api/admin/connections', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('conn-body');
    tbody.innerHTML = data.map(c => `
      <tr>
        <td>${c.label}</td>
        <td>${c.host}</td>
        <td>${c.database}</td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="editConn(${c.id})">Edit</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="deleteConn(${c.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load connections', 'error');
  }
}

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const data = await res.json();
    const tbody = document.getElementById('user-body');
    tbody.innerHTML = data.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>${u.connectionIds && u.connectionIds.length > 0 ? u.connectionIds.join(', ') : 'None'}</td>
        <td class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="editUser(${u.id})">Edit</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="deleteUser(${u.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

window.editConn = async (id) => {
  try {
    const res = await fetch('/api/admin/connections', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const conns = await res.json();
    const conn = conns.find(c => c.id === id);
    if (!conn) return;

    currentEditingConnId = id;
    document.getElementById('conn-label').value = conn.label;
    document.getElementById('conn-host').value = conn.host;
    document.getElementById('conn-user').value = conn.username;
    document.getElementById('conn-pass').value = ''; // Don't show password
    document.getElementById('conn-db').value = conn.database;
    document.getElementById('btn-save-conn').textContent = 'Update Connection';

    document.getElementById('conn-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to load connection details', 'error');
  }
};

window.editUser = async (id) => {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const users = await res.json();
    const user = users.find(u => u.id === id);
    if (!user) return;

    currentEditingUserId = id;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-password').value = ''; // Don't show password
    document.getElementById('user-role').value = user.role;

    // Load connections for the dropdown
    const connRes = await fetch('/api/admin/connections', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const conns = await connRes.json();
    const select = document.getElementById('user-conn-select');
    select.innerHTML = conns.map(c => `<option value="${c.id}" ${user.connectionIds?.includes(c.id) ? 'selected' : ''}>${c.label}</option>`).join('');

    document.getElementById('btn-save-user').textContent = 'Update User';
    document.getElementById('user-modal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to load user details', 'error');
  }
};

function initConnectionModal() {
  const modal = document.getElementById('conn-modal');
  const btnAdd = document.getElementById('btn-add-conn');

  btnAdd.onclick = () => {
    currentEditingConnId = null;
    document.getElementById('conn-label').value = '';
    document.getElementById('conn-host').value = '';
    document.getElementById('conn-user').value = '';
    document.getElementById('conn-pass').value = '';
    document.getElementById('conn-db').value = '';
    document.getElementById('btn-save-conn').textContent = 'Save Connection';
    modal.classList.remove('hidden');
  };
  modal.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');

  document.getElementById('btn-save-conn').onclick = async () => {
    const body = {
      label: document.getElementById('conn-label').value,
      host: document.getElementById('conn-host').value,
      username: document.getElementById('conn-user').value,
      password: document.getElementById('conn-pass').value,
      database: document.getElementById('conn-db').value,
    };

    const method = currentEditingConnId ? 'PUT' : 'POST';
    const url = currentEditingConnId ? `/api/admin/connections/${currentEditingConnId}` : '/api/admin/connections';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast(currentEditingConnId ? 'Connection updated' : 'Connection saved', 'success');
        modal.classList.add('hidden');
        loadConnections();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Error saving connection', 'error');
      }
    } catch (err) {
      showToast('Error saving connection', 'error');
    }
  };
}

function initUserModal() {
  const modal = document.getElementById('user-modal');
  const btnAdd = document.getElementById('btn-add-user');

  btnAdd.onclick = async () => {
    currentEditingUserId = null;
    document.getElementById('user-username').value = '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = 'user';

    const res = await fetch('/api/admin/connections', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}` }
    });
    const conns = await res.json();
    const select = document.getElementById('user-conn-select');
    select.innerHTML = conns.map(c => `<option value="${c.id}">${c.label}</option>`).join('');

    document.getElementById('btn-save-user').textContent = 'Save User';
    modal.classList.remove('hidden');
  };
  modal.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');

  document.getElementById('btn-save-user').onclick = async () => {
    const body = {
      username: document.getElementById('user-username').value,
      password: document.getElementById('user-password').value,
      role: document.getElementById('user-role').value,
      connectionIds: Array.from(document.getElementById('user-conn-select').selectedOptions).map(opt => parseInt(opt.value, 10)),
    };

    const method = currentEditingUserId ? 'PUT' : 'POST';
    const url = currentEditingUserId ? `/api/admin/users/${currentEditingUserId}` : '/api/admin/users';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ipdr_token')}`
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        showToast(currentEditingUserId ? 'User updated' : 'User created', 'success');
        modal.classList.add('hidden');
        loadUsers();
      } else {
        const errData = await res.json();
        showToast(errData.error || 'Error saving user', 'error');
      }
    } catch (err) {
      showToast('Error saving user', 'error');
    }
  }
}
