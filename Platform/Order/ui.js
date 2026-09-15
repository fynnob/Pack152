// UI Utilities: Toasts, Modals, and Sanitization
window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

window.showConfirmModal = function(title, body, onConfirm, confirmLabel = 'Confirm') {
  const overlay = document.getElementById('custom-modal');
  if (!overlay) return;

  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;

  const confirmBtn = document.getElementById('modal-confirm-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  confirmBtn.textContent = confirmLabel;

  overlay.style.display = 'flex';

  const cleanup = () => { overlay.style.display = 'none'; };

  confirmBtn.onclick = () => { cleanup(); onConfirm(); };
  cancelBtn.onclick = cleanup;
};

window.escapeHtml = function(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
};