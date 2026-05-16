/* ═══════════════════════════════════════════════════════════════════
   Settings Manager — User-dependent preferences and global parameters
   ═══════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'ipdr_user_settings';

// Default settings
const DEFAULT_SETTINGS = {
  theme: 'dark',
  visibleColumns: [], // Empty means all
  pageSize: 50,
  autoRefresh: 0, // Minutes, 0 = disabled
  userRole: 'user', // 'user' | 'admin'
  globalParams: {
    orgName: 'Enterprise IPDR',
    maxExportRows: 100000,
  }
};

let settings = { ...DEFAULT_SETTINGS };

/** Load settings from localStorage */
export function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to parse settings', e);
    }
  }
  applyTheme(settings.theme);
  return settings;
}

/** Save settings to localStorage */
export function saveSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyTheme(settings.theme);
  return settings;
}

/** Get current settings */
export function getSettings() {
  return settings;
}

/** Apply theme to document */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Add/remove class for legacy support
  document.body.className = `theme-${theme}`;
}

/** Check if user has admin rights */
export function isAdmin() {
  return settings.userRole === 'admin';
}

/** Toggle column visibility */
export function toggleColumn(columnName, visible) {
  let list = settings.visibleColumns || [];
  if (visible) {
    if (!list.includes(columnName)) list.push(columnName);
  } else {
    list = list.filter(c => c !== columnName);
  }
  return saveSettings({ visibleColumns: list });
}
