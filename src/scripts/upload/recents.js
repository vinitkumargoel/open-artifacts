import { escapeHtml, showToast } from '../common.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function openRecentsModal() {
  renderRecents();
  const modal = document.getElementById('recentsModal');
  if (modal) modal.style.display = 'flex';
}

export function openShortcutsModal() {
  const modal = document.getElementById('shortcutsModal');
  if (modal) modal.style.display = 'flex';
}

export function closeModals(e) {
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.style.display = 'none';
  });
}

export function renderRecents() {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('open_artifacts_recents') || '[]');
  } catch (_) {
    list = [];
  }
  list = list.filter(item => item && UUID_RE.test(item.id || ''));

  const container = document.getElementById('recentsList');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '<div style="font-size: 12.5px; color: var(--text-tertiary); text-align: center; padding: 20px;">No artifacts published yet.</div>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="recent-item">
      <div>
        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(item.title || 'Untitled')}</div>
        <div style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono);">${escapeHtml(item.id)} &bull; v${escapeHtml(item.version)}</div>
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="nav-btn" data-update-id="${escapeHtml(item.id)}" title="Bump to next version">Update</button>
        <a href="/a/${escapeHtml(item.id)}" target="_blank" rel="noopener noreferrer" class="nav-btn">Open &rarr;</a>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('button[data-update-id]').forEach(btn => {
    btn.addEventListener('click', () => applyUpdateTarget(btn.dataset.updateId));
  });
}

export function applyUpdateTarget(uuid) {
  const idInput = document.getElementById('idInput');
  if (idInput) idInput.value = uuid;

  if (window.syncTtlDefault) window.syncTtlDefault();

  const drawer = document.getElementById('advancedDrawer');
  if (drawer) drawer.classList.add('open');
  const chevron = document.getElementById('advChevron');
  if (chevron) chevron.innerHTML = '&or;';

  const modal = document.getElementById('recentsModal');
  if (modal) modal.style.display = 'none';

  showToast('Set update target: ' + uuid);
}

export function saveToRecents(item) {
  try {
    const recents = JSON.parse(localStorage.getItem('open_artifacts_recents') || '[]');
    const filtered = recents.filter(r => r.id !== item.id);
    filtered.unshift(item);
    localStorage.setItem('open_artifacts_recents', JSON.stringify(filtered.slice(0, 10)));
  } catch (_) {}
}
