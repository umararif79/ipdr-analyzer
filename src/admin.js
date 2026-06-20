/* ═══════════════════════════════════════════════════════════════════
   Admin Module — Manages Users and ClickHouse Connections
   ═══════════════════════════════════════════════════════════════════ */

import { showToast } from './toast.js';
import {
  adminGetConnections, adminSaveConnection, adminUpdateConnection, adminDeleteConnection,
  adminGetUsers, adminSaveUser, adminUpdateUser, adminDeleteUser,
  adminGetWarrants, adminSaveWarrant, adminUpdateWarrant, adminDeleteWarrant,
  adminGetSettings, adminSaveSettings,
  fetchProxmoxNodes, fetchProxmoxVMs
} from './api.js';


let currentEditingConnId = null;
let currentEditingUserId = null;
let currentEditingWarrantId = null;

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
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'admin-bras') {
        loadProxmoxData();
      }
    };
  });


  // Initialization
  loadConnections();
  loadUsers();
  loadWarrants();
  loadSystemSettings();
  initProxmox();
  initConnectionModal();
  initUserModal();
  initWarrantModal();
}


async function loadWarrants() {
  try {
    const data = await adminGetWarrants();
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
    await adminDeleteWarrant(id);
    showToast('Warrant deleted', 'success');
    loadWarrants();
  } catch (err) {
    showToast(err.message || 'Error deleting warrant', 'error');
  }
};

window.editWarrant = async (id) => {
  try {
    const warrants = await adminGetWarrants();
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

    try {
      if (currentEditingWarrantId) {
        await adminUpdateWarrant(currentEditingWarrantId, body);
        showToast('Warrant updated', 'success');
      } else {
        await adminSaveWarrant(body);
        showToast('Warrant saved', 'success');
      }
      modal.classList.add('hidden');
      loadWarrants();
    } catch (err) {
      showToast(err.message || 'Error saving warrant', 'error');
    }
  };
}

async function loadSystemSettings() {
  try {
    const settings = await adminGetSettings();
    const debugSetting = settings.find(s => s.key === 'debug_mode');
    const checkbox = document.getElementById('setting-debug-mode');
    if (checkbox) {
      checkbox.checked = debugSetting ? debugSetting.value === 'true' : true;
      checkbox.onchange = async () => {
        try {
          await adminSaveSettings({ key: 'debug_mode', value: checkbox.checked });
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
          await adminSaveSettings({ key: 'stats_period', value: periodSelect.value });
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
    await adminDeleteConnection(id);
    showToast('Connection deleted', 'success');
    loadConnections();
  } catch (err) {
    showToast(err.message || 'Error deleting connection', 'error');
  }
};

window.deleteUser = async (id) => {
  try {
    await adminDeleteUser(id);
    showToast('User deleted', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message || 'Error deleting user', 'error');
  }
};

async function loadConnections() {
  try {
    const data = await adminGetConnections();
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
    const data = await adminGetUsers();
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

async function initProxmox() {
  const btnRefresh = document.getElementById('btn-refresh-bras');
  if (!btnRefresh) return;

  btnRefresh.onclick = async () => {
    await loadProxmoxData();
  };
}

async function loadProxmoxData() {
  try {
    const nodesBody = document.getElementById('proxmox-nodes-body');
    const vmsBody = document.getElementById('proxmox-vms-body');
    if (!nodesBody || !vmsBody) return;

    nodesBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Loading nodes...</td></tr>';
    vmsBody.innerHTML = '<tr><td colspan="6" style="text-align:center">Loading VMs...</td></tr>';

    const [nodes, vms] = await Promise.all([
      fetchProxmoxNodes(),
      fetchProxmoxVMs()
    ]);

    nodesBody.innerHTML = nodes.map(n => `
      <tr>
        <td>${n.node}</td>
        <td><span class="badge ${n.status === 'running' ? 'bg-success' : 'bg-danger'}">${n.status}</span></td>
        <td>${Math.round(n.cpu * 100)}%</td>
        <td>${Math.round(n.mem * 100)}%</td>
      </tr>
    `).join('');

    vmsBody.innerHTML = vms.map(v => `
      <tr style="cursor:pointer" onclick="viewBrasIpSet('${v.node}', '${v.vmid}')">
        <td>${v.vmid}</td>
        <td>${v.name}</td>
        <td><span class="badge ${v.status === 'running' ? 'bg-success' : 'bg-danger'}">${v.status}</span></td>
        <td>${v.node}</td>
        <td>${Math.round(v.cpu * 100)}%</td>
        <td>${Math.round(v.mem * 100)}%</td>
      </tr>
    `).join('');

  } catch (err) {
    showToast(`Proxmox load failed: ${err.message}`, 'error');
  }
}

window.viewBrasIpSet = async (node, vmid) => {
  try {
    showToast(`Fetching IPSet for VM ${vmid}...`, 'info');
    const ipset = await fetchProxmoxIpSet(node, vmid);

    if (!ipset || ipset.length === 0) {
      showToast('No IPSet entries found', 'warning');
      return;
    }

    const details = ipset.map(item => `
      <tr>
        <td>${item.cidr}</td>
        <td>${item.comment || '-'}</td>
      </tr>
    `).join('');

    const modalHtml = `
      <div class="modal-overlay" id="ipset-modal">
        <div class="modal-content glass-panel" style="max-width:600px">
          <div class="modal-header">
            <h2>IPSet: BRAS (VM ${vmid})</h2>
            <button class="btn btn-icon close-ipset-modal">✕</button>
          </div>
          <div class="modal-body">
            <div class="table-container">
              <table class="admin-table">
                <thead>
                  <tr><th class="text-left">CIDR</th><th class="text-left">Comment</th></tr>
                </thead>
                <tbody>${details}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.querySelector('.close-ipset-modal').onclick = () => {
      document.getElementById('ipset-modal').remove();
    };

    // Close on overlay click
    document.getElementById('ipset-modal').onclick = (e) => {
      if (e.target.id === 'ipset-modal') {
        document.getElementById('ipset-modal').remove();
      }
    };

  } catch (err) {
    showToast(`Failed to fetch IPSet: ${err.message}`, 'error');
  }
};

window.editConn = async (id) => {
  try {
    const conns = await adminGetConnections();
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
    const users = await adminGetUsers();
    const user = users.find(u => u.id === id);
    if (!user) return;

    currentEditingUserId = id;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-password').value = ''; // Don't show password
    document.getElementById('user-role').value = user.role;

    // Load connections for the dropdown
    const conns = await adminGetConnections();
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

    try {
      if (currentEditingConnId) {
        await adminUpdateConnection(currentEditingConnId, body);
        showToast('Connection updated', 'success');
      } else {
        await adminSaveConnection(body);
        showToast('Connection saved', 'success');
      }
      modal.classList.add('hidden');
      loadConnections();
    } catch (err) {
      showToast(err.message || 'Error saving connection', 'error');
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

    const conns = await adminGetConnections();
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

    try {
      if (currentEditingUserId) {
        await adminUpdateUser(currentEditingUserId, body);
        showToast('User updated', 'success');
      } else {
        await adminSaveUser(body);
        showToast('User created', 'success');
      }
      modal.classList.add('hidden');
      loadUsers();
    } catch (err) {
      showToast(err.message || 'Error saving user', 'error');
    }
  };
}
