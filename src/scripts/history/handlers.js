import { state } from './state.js';
import { getStoredToken, rememberToken, syncTokenDisplay, mintReadSession } from '../token.js';
import { escapeHtml, showToast } from '../common.js';
import {
  renderArtifacts,
  highlightRow,
  updateSelectionUI,
  mountVersionRow,
  renderVersionPanel,
  syncComparePicks,
  expiryInfo
} from './render.js';

export function handleSearch(query) {
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = query ? 'block' : 'none';
  applyFiltersAndSort();
}

export function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  const clearBtn = document.getElementById('searchClearBtn');
  if (clearBtn) clearBtn.style.display = 'none';
  applyFiltersAndSort();
}

export function handleSort() {
  applyFiltersAndSort();
}

export function applyFiltersAndSort() {
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const sortVal = sortSelect ? sortSelect.value : 'updated_desc';

  let filtered = state.rawArtifacts.filter(item => {
    if (!query) return true;
    const t = (item.title || '').toLowerCase();
    const d = (item.description || '').toLowerCase();
    const id = (item.id || '').toLowerCase();
    return t.includes(query) || d.includes(query) || id.includes(query);
  });

  filtered.sort((a, b) => {
    if (sortVal === 'updated_desc') {
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    } else if (sortVal === 'created_desc') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortVal === 'title_asc') {
      return (a.title || '').localeCompare(b.title || '');
    } else if (sortVal === 'title_desc') {
      return (b.title || '').localeCompare(a.title || '');
    } else if (sortVal === 'versions_desc') {
      return (b.versionCount || 1) - (a.versionCount || 1);
    } else if (sortVal === 'size_desc') {
      return (b.totalSize || b.fileSize || 0) - (a.totalSize || a.fileSize || 0);
    } else if (sortVal === 'expiry_asc') {
      const aTime = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
      const bTime = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
      return aTime === bTime ? 0 : aTime - bTime;
    }
    return 0;
  });

  state.displayedArtifacts = filtered;
  renderArtifacts();
}

export function toggleVersionTimeline(id) {
  const btn = document.getElementById('vtoggle-' + id);
  if (state.expandedIds.has(id)) {
    state.expandedIds.delete(id);
    const row = document.getElementById('vrow-' + id);
    if (row) row.remove();
    if (btn) btn.classList.remove('open');
    return;
  }
  state.expandedIds.add(id);
  mountVersionRow(id);
}

export function retryVersionDetail(id) {
  state.versionCache.delete(id);
  renderVersionPanel(id);
  if (window.loadVersionDetail) window.loadVersionDetail(id);
}

export function toggleComparePick(id, version, checked) {
  const picks = (state.comparePicks.get(id) || []).filter(v => v !== version);
  if (checked) {
    picks.push(version);
    while (picks.length > 2) picks.shift();
  }
  state.comparePicks.set(id, picks);
  syncComparePicks(id);
}

export function toggleItemSelection(id, isSelected) {
  if (isSelected) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }
  updateSelectionUI();
  highlightRow(id, isSelected);
}

export function toggleSelectAll(checked) {
  if (checked) {
    state.displayedArtifacts.forEach(item => state.selectedIds.add(item.id));
  } else {
    state.displayedArtifacts.forEach(item => state.selectedIds.delete(item.id));
  }
  renderArtifacts();
}

export function clearSelection() {
  state.selectedIds.clear();
  renderArtifacts();
}

export function openStudioWithId(id) {
  try {
    sessionStorage.setItem('open_artifacts_target_id', id);
  } catch (_) {}
  window.location.href = '/upload?update=' + encodeURIComponent(id);
}

// TTL Modal Handlers
export function openTtlModal(id) {
  const item = state.rawArtifacts.find(a => a.id === id);
  if (!item) return;

  state.pendingTtlId = id;
  const info = expiryInfo(item);
  const descEl = document.getElementById('ttlModalDescription');
  if (descEl) {
    descEl.textContent =
      '"' + (item.title || 'Untitled') + '" — ' + info.title
      + '. The clock restarts from now, and again on every new version.';
  }

  const current = item.expiresAt ? String(item.ttlDays == null ? '' : item.ttlDays) : 'never';
  document.querySelectorAll('#ttlChoices .ttl-choice').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ttl === current);
  });

  const customWrap = document.getElementById('ttlCustomWrap');
  if (customWrap) customWrap.style.display = 'none';
  const customInput = document.getElementById('ttlCustomInput');
  if (customInput) customInput.value = '';

  const stored = getStoredToken();
  const tokenWrap = document.getElementById('ttlTokenWrap');
  const tokenInput = document.getElementById('ttlTokenInput');
  if (tokenInput) tokenInput.value = stored;
  if (tokenWrap) tokenWrap.style.display = stored ? 'none' : 'flex';

  const hintEl = document.getElementById('ttlModalHint');
  if (hintEl) hintEl.innerHTML = '&nbsp;';
  refreshTtlSaveBtn();

  const ttlModal = document.getElementById('ttlModal');
  if (ttlModal) ttlModal.style.display = 'flex';
}

export function closeTtlModal() {
  const ttlModal = document.getElementById('ttlModal');
  if (ttlModal) ttlModal.style.display = 'none';
  state.pendingTtlId = null;
}

export function handleTtlBackdrop(e) {
  if (e.target && e.target.id === 'ttlModal') closeTtlModal();
}

export function selectTtlChoice(btn) {
  document.querySelectorAll('#ttlChoices .ttl-choice').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const custom = btn.dataset.ttl === 'custom';
  const customWrap = document.getElementById('ttlCustomWrap');
  if (customWrap) customWrap.style.display = custom ? 'flex' : 'none';
  if (custom) {
    const customInput = document.getElementById('ttlCustomInput');
    if (customInput) setTimeout(() => customInput.focus(), 30);
  }
  refreshTtlSaveBtn();
}

export function onTtlCustomInput() {
  refreshTtlSaveBtn();
}

export function selectedTtlValue() {
  const active = document.querySelector('#ttlChoices .ttl-choice.active');
  if (!active) return null;
  if (active.dataset.ttl !== 'custom') return active.dataset.ttl;

  const customInput = document.getElementById('ttlCustomInput');
  const days = parseInt(customInput ? customInput.value : '', 10);
  if (!Number.isFinite(days) || days < 1 || days > 3650) return null;
  return String(days);
}

export function refreshTtlSaveBtn() {
  const saveBtn = document.getElementById('ttlSaveBtn');
  if (saveBtn) saveBtn.disabled = selectedTtlValue() === null;
}

// Delete Modal Handlers
export function resetDeleteModalState() {
  const progressWrap = document.getElementById('deleteProgressWrap');
  if (progressWrap) progressWrap.style.display = 'none';
  const progressFill = document.getElementById('deleteProgressFill');
  if (progressFill) {
    progressFill.style.width = '0%';
    progressFill.style.background = 'var(--danger)';
  }
  const progressBar = document.getElementById('deleteProgressBar');
  if (progressBar) progressBar.setAttribute('aria-valuenow', '0');
  const progressPct = document.getElementById('deleteProgressPct');
  if (progressPct) progressPct.textContent = '0%';
  const progressStatus = document.getElementById('deleteProgressStatus');
  if (progressStatus) progressStatus.textContent = '';

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span>Delete Permanently</span>';
  }
  const cancelBtn = document.getElementById('cancelDeleteBtn');
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel';
    cancelBtn.disabled = false;
  }
  const tokenInput = document.getElementById('modalTokenInput');
  if (tokenInput) tokenInput.disabled = false;
}

export function openSingleDeleteModal(id) {
  if (state.isDeleting) return;
  const item = state.rawArtifacts.find(a => a.id === id);
  if (!item) return;

  state.pendingDeletionIds = [id];
  const modalTitle = document.getElementById('modalTitle');
  const modalDesc = document.getElementById('modalDescription');
  if (modalTitle) modalTitle.textContent = 'Delete Artifact';
  if (modalDesc) {
    modalDesc.textContent = 'Are you sure you want to permanently delete "' + (item.title || 'Untitled') + '"? All versions and files will be permanently erased.';
  }

  const listEl = document.getElementById('modalItemsList');
  if (listEl) {
    listEl.innerHTML = `
      <div class="modal-item-row" id="modalItem-${escapeHtml(item.id)}">
        <span class="modal-item-title"><strong>${escapeHtml(item.title || 'Untitled')}</strong></span>
        <span class="modal-item-status">v${escapeHtml(String(item.latestVersion || 1))}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-secondary);">ID: ${escapeHtml(item.id)}</div>
    `;
  }

  resetDeleteModalState();
  setupModalToken();
  const deleteModal = document.getElementById('deleteModal');
  if (deleteModal) deleteModal.style.display = 'flex';
}

export function openBulkDeleteModal() {
  if (state.selectedIds.size === 0 || state.isDeleting) return;

  state.pendingDeletionIds = Array.from(state.selectedIds);
  const count = state.pendingDeletionIds.length;
  const modalTitle = document.getElementById('modalTitle');
  const modalDesc = document.getElementById('modalDescription');
  if (modalTitle) modalTitle.textContent = 'Delete ' + count + ' Artifacts';
  if (modalDesc) {
    modalDesc.textContent = 'Are you sure you want to permanently delete ' + count + ' selected artifacts? All corresponding versions and storage files will be erased.';
  }

  const listEl = document.getElementById('modalItemsList');
  if (listEl) {
    listEl.innerHTML = state.pendingDeletionIds.map(id => {
      const item = state.rawArtifacts.find(a => a.id === id);
      const title = item ? (item.title || 'Untitled') : id;
      return `
        <div class="modal-item-row" id="modalItem-${escapeHtml(id)}">
          <span class="modal-item-title">${escapeHtml(title)}</span>
          <span class="modal-item-status" style="font-size: 10.5px; color: var(--text-tertiary);">${escapeHtml(id.slice(0, 8))}...</span>
        </div>
      `;
    }).join('');
  }

  resetDeleteModalState();
  setupModalToken();
  const deleteModal = document.getElementById('deleteModal');
  if (deleteModal) deleteModal.style.display = 'flex';
}

export function setupModalToken() {
  const stored = getStoredToken();
  const tokenWrap = document.getElementById('modalTokenWrap');
  const tokenInput = document.getElementById('modalTokenInput');
  if (stored) {
    if (tokenInput) tokenInput.value = stored;
    if (tokenWrap) tokenWrap.style.display = 'none';
  } else {
    if (tokenInput) tokenInput.value = '';
    if (tokenWrap) tokenWrap.style.display = 'flex';
  }
}

export function closeDeleteModal() {
  if (state.isDeleting) return;
  const deleteModal = document.getElementById('deleteModal');
  if (deleteModal) deleteModal.style.display = 'none';
  state.pendingDeletionIds = [];
  resetDeleteModalState();
}

export function cancelOrCloseDeleteModal() {
  if (state.isDeleting) {
    if (state.deleteAbortController) {
      const cancelBtn = document.getElementById('cancelDeleteBtn');
      if (cancelBtn) {
        cancelBtn.textContent = 'Stopping...';
        cancelBtn.disabled = true;
      }
      const progressStatus = document.getElementById('deleteProgressStatus');
      if (progressStatus) {
        progressStatus.textContent = 'Stopping deletion...';
      }
      state.deleteAbortController.abort();
    }
    return;
  }
  closeDeleteModal();
}

export function handleModalBackdrop(e) {
  if (e.target && e.target.id === 'deleteModal') {
    if (state.isDeleting) return;
    closeDeleteModal();
  }
}
