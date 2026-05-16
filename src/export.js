/* ═══════════════════════════════════════════════════════════════════
   Export — CSV download + PDF
   ═══════════════════════════════════════════════════════════════════ */

import { exportCSV } from './api.js';
import { showToast } from './toast.js';

/**
 * Download CSV export for current filters.
 * @param {Object} filters — current filter values
 */
export async function downloadCSV(filters = {}) {
  try {
    showToast('Preparing CSV export...', 'info');

    const blob = await exportCSV(filters);
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ipdr_export_${formatDateForFile()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully!', 'success');
  } catch (err) {
    console.error('Export failed:', err);
    showToast(`Export failed: ${err.message}`, 'error');
  }
}

function formatDateForFile() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
