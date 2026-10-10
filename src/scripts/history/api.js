import { state } from './state.js';
import { getStoredToken, rememberToken, syncTokenDisplay, mintReadSession } from '../token.js';
import { showToast } from '../common.js';
import { updateStats, renderVersionPanel } from './render.js';
import { applyFiltersAndSort, closeTtlModal, refreshTtlSaveBtn, selectedTtlValue, closeDeleteModal } from './handlers.js';

/**
 * Loads the current page (state.page / state.pageSize) with the toolbar's
 * search and sort applied server-side.
 * @param {boolean} [isRefresh] - user-triggered refresh: keep the list, toast on success
 * @param {{quiet?: boolean}} [opts] - quiet: page/search/sort change, dim the list instead of the full loader
 */
export async function fetchArtifacts(isRefresh = false, { quiet = false } = {}) {
  const loading = document.getElementById('loadingState');
  const tableWrap = document.getElementById('tableViewWrap');
  const gridWrap = document.getElementById('gridViewWrap');
  const empty = document.getElementById('emptyState');
  const refreshBtn = document.getElementById('refreshBtn');
  const main = document.getElementById('historyMain');
  const seq = ++state.fetchSeq;

  if (isRefresh && refreshBtn) {
    refreshBtn.classList.add('loading');
  }

  if (quiet) {
    if (main) main.classList.add('is-paging');
  } else if (!isRefresh) {
    if (loading) loading.style.display = 'flex';
    if (tableWrap) tableWrap.style.display = 'none';
    if (gridWrap) gridWrap.style.display = 'none';
    if (empty) empty.style.display = 'none';
  }

  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.pageSize),
    sort: sortSelect ? sortSelect.value : 'updated_desc'
  });
  const query = searchInput ? searchInput.value.trim() : '';
  if (query) params.set('q', query);

  try {
    const res = await fetch('/api/artifacts?' + params.toString(), {
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (res.status === 401) {
      window.location.href = '/unlock?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    if (!res.ok) throw new Error('Failed to fetch artifact directory');
    const data = await res.json();
    if (seq !== state.fetchSeq) return; // a newer page/search request superseded this one

    state.total = data.total || 0;
    state.totalPages = data.totalPages || 1;

    // Deleting the last items on the final page leaves us past the end: step back.
    if (state.page > state.totalPages && state.total > 0) {
      state.page = state.totalPages;
      return fetchArtifacts(isRefresh, { quiet: true });
    }

    state.rawArtifacts = data.artifacts || [];

    // Selection is per page: drop anything no longer on screen.
    const currentIdSet = new Set(state.rawArtifacts.map(a => a.id));
    for (const id of state.selectedIds) {
      if (!currentIdSet.has(id)) state.selectedIds.delete(id);
    }

    updateStats(data.stats);
    syncPageToUrl();
    applyFiltersAndSort();

    if (isRefresh) showToast('Artifacts updated (' + state.total + ' total)');
  } catch (err) {
    if (seq === state.fetchSeq) showToast('Error: ' + err.message);
  } finally {
    if (seq === state.fetchSeq) {
      if (loading) loading.style.display = 'none';
      if (refreshBtn) refreshBtn.classList.remove('loading');
      if (main) main.classList.remove('is-paging');
    }
  }
}

function syncPageToUrl() {
  try {
    const url = new URL(window.location.href);
    if (state.page > 1) url.searchParams.set('page', String(state.page));
    else url.searchParams.delete('page');
    if (state.pageSize !== 25) url.searchParams.set('limit', String(state.pageSize));
    else url.searchParams.delete('limit');
    window.history.replaceState(null, '', url.pathname + url.search);
  } catch (_) {}
}

export async function loadVersionDetail(id) {
  if (state.versionLoading.has(id)) return;
  state.versionLoading.add(id);
  try {
    const res = await fetch('/api/artifacts/' + encodeURIComponent(id), {
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || 'Failed to load version history');
    state.versionCache.set(id, data);
  } catch (err) {
    state.versionCache.set(id, { error: err.message });
  } finally {
    state.versionLoading.delete(id);
    if (state.expandedIds.has(id)) renderVersionPanel(id);
  }
}

export async function applyTtl() {
  const id = state.pendingTtlId;
  const ttl = selectedTtlValue();
  if (!id || ttl === null) return;

  const tokenInput = document.getElementById('ttlTokenInput');
  const token = (tokenInput && tokenInput.value ? tokenInput.value : getStoredToken()).trim();
  if (!token) {
    showToast('Access token is required to change retention');
    const tokenWrap = document.getElementById('ttlTokenWrap');
    if (tokenWrap) tokenWrap.style.display = 'flex';
    if (tokenInput) tokenInput.focus();
    return;
  }
  rememberToken(token);
  syncTokenDisplay();
  mintReadSession(token);

  const btn = document.getElementById('ttlSaveBtn');
  if (!btn) return;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Saving…';

  try {
    const res = await fetch('/api/artifacts/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ttl: ttl })
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data.error && data.error.message) || 'Retention update failed');

    const item = state.rawArtifacts.find(a => a.id === id);
    if (item) {
      item.ttlDays = data.ttlDays;
      item.expiresAt = data.expiresAt;
    }
    const cached = state.versionCache.get(id);
    if (cached && !cached.error) {
      cached.ttlDays = data.ttlDays;
      cached.expiresAt = data.expiresAt;
    }

    closeTtlModal();
    applyFiltersAndSort();
    showToast(data.expiresAt
      ? 'Retention updated — expires ' + new Date(data.expiresAt).toLocaleDateString()
      : 'Retention updated — kept forever');
  } catch (err) {
    const hintEl = document.getElementById('ttlModalHint');
    if (hintEl) hintEl.textContent = err.message;
    showToast('Retention error: ' + err.message);
  } finally {
    btn.textContent = label;
    refreshTtlSaveBtn();
  }
}

export async function executeDeletion() {
  if (state.pendingDeletionIds.length === 0 || state.isDeleting) return;

  const tokenInput = document.getElementById('modalTokenInput');
  const token = (tokenInput && tokenInput.value ? tokenInput.value : getStoredToken()).trim();

  if (!token) {
    showToast('Access token is required to delete artifacts');
    if (tokenInput) tokenInput.focus();
    return;
  }

  rememberToken(token);
  syncTokenDisplay();
  mintReadSession(token);

  const targetIds = [...state.pendingDeletionIds];
  const totalCount = targetIds.length;

  state.isDeleting = true;
  state.deleteAbortController = new AbortController();

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const cancelBtn = document.getElementById('cancelDeleteBtn');
  const progressWrap = document.getElementById('deleteProgressWrap');
  const progressFill = document.getElementById('deleteProgressFill');
  const progressPct = document.getElementById('deleteProgressPct');
  const progressStatus = document.getElementById('deleteProgressStatus');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span><span>Deleting...</span>';
  }
  if (tokenInput) tokenInput.disabled = true;
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel Deletion';
    cancelBtn.disabled = false;
  }

  if (progressWrap) progressWrap.style.display = 'flex';
  if (progressFill) progressFill.style.width = '0%';
  if (progressPct) progressPct.textContent = '0%';
  if (progressStatus) {
    progressStatus.textContent = totalCount === 1 ? 'Deleting artifact...' : `Starting deletion of ${totalCount} artifacts...`;
  }

  const chunkSize = Math.min(100, Math.max(1, Math.ceil(totalCount / 8)));

  const chunks = [];
  for (let i = 0; i < totalCount; i += chunkSize) {
    chunks.push(targetIds.slice(i, i + chunkSize));
  }

  const successfullyDeletedIds = [];
  let userCancelled = false;
  let lastError = null;

  try {
    for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
      if (state.deleteAbortController.signal.aborted) {
        userCancelled = true;
        break;
      }

      const chunk = chunks[cIdx];
      const currentCount = successfullyDeletedIds.length;

      chunk.forEach(id => {
        const rowEl = document.getElementById('modalItem-' + id);
        if (rowEl) {
          const statusEl = rowEl.querySelector('.modal-item-status');
          if (statusEl) {
            statusEl.textContent = 'Deleting...';
            statusEl.style.color = 'var(--danger)';
          }
        }
      });

      if (chunk.length === 1) {
        const item = state.rawArtifacts.find(a => a.id === chunk[0]);
        const title = item ? (item.title || 'Untitled') : chunk[0].slice(0, 8);
        if (progressStatus) {
          progressStatus.textContent = totalCount === 1
            ? `Deleting "${title}"...`
            : `Deleting "${title}" (${currentCount + 1}/${totalCount})...`;
        }
      } else {
        if (progressStatus) {
          progressStatus.textContent = `Deleting ${currentCount + 1} to ${Math.min(currentCount + chunk.length, totalCount)} of ${totalCount}...`;
        }
      }

      let res;
      if (chunk.length === 1) {
        res = await fetch('/api/artifacts/' + encodeURIComponent(chunk[0]), {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          signal: state.deleteAbortController.signal
        });
      } else {
        res = await fetch('/api/artifacts/bulk-delete', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: chunk }),
          signal: state.deleteAbortController.signal
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }

      if (!res.ok) {
        throw new Error(data?.error?.message || `HTTP ${res.status}: Deletion failed`);
      }

      const deletedIds = chunk.length === 1
        ? chunk
        : (data?.deletedIds && Array.isArray(data.deletedIds) ? data.deletedIds : chunk);

      const deletedSet = new Set(deletedIds);
      successfullyDeletedIds.push(...deletedIds);

      deletedSet.forEach(id => {
        const rowEl = document.getElementById('modalItem-' + id);
        if (rowEl) {
          rowEl.style.opacity = '0.5';
          const statusEl = rowEl.querySelector('.modal-item-status');
          if (statusEl) {
            statusEl.textContent = 'Deleted';
            statusEl.style.color = 'var(--text-tertiary)';
          }
        }
        state.selectedIds.delete(id);
      });

      state.rawArtifacts = state.rawArtifacts.filter(a => !deletedSet.has(a.id));
      state.pendingDeletionIds = state.pendingDeletionIds.filter(id => !deletedSet.has(id));

      if (data?.failedIds && data.failedIds.length > 0) {
        data.failedIds.forEach(id => {
          const rowEl = document.getElementById('modalItem-' + id);
          if (rowEl) {
            const statusEl = rowEl.querySelector('.modal-item-status');
            if (statusEl) {
              statusEl.textContent = 'Failed';
              statusEl.style.color = 'var(--danger)';
            }
          }
        });
        throw new Error(`Failed to delete ${data.failedIds.length} artifact(s)`);
      }

      const processedCount = successfullyDeletedIds.length;
      const pct = Math.round((processedCount / totalCount) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressPct) progressPct.textContent = pct + '%';
      const progressBar = document.getElementById('deleteProgressBar');
      if (progressBar) progressBar.setAttribute('aria-valuenow', String(pct));
      if (progressStatus) {
        progressStatus.textContent = `Deleted ${processedCount} of ${totalCount} (${pct}%)`;
      }

    }
  } catch (err) {
    if (err.name === 'AbortError' || state.deleteAbortController?.signal.aborted) {
      userCancelled = true;
    } else {
      lastError = err;
    }
  } finally {
    state.isDeleting = false;
    state.deleteAbortController = null;

    applyFiltersAndSort();
    // Refill the page (and totals) from the server now that rows are gone.
    if (successfullyDeletedIds.length > 0) fetchArtifacts(false, { quiet: true });

    if (userCancelled) {
      closeDeleteModal();
      showToast(`Deletion stopped. ${successfullyDeletedIds.length} of ${totalCount} artifact(s) deleted.`);
    } else if (lastError) {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<span>Delete Permanently</span>';
      }
      if (cancelBtn) {
        cancelBtn.textContent = 'Cancel';
        cancelBtn.disabled = false;
      }
      if (tokenInput) tokenInput.disabled = false;

      if (successfullyDeletedIds.length > 0) {
        showToast(`Partial deletion (${successfullyDeletedIds.length}/${totalCount}): ${lastError.message}`);
      } else {
        showToast('Delete error: ' + lastError.message);
      }
      if (progressWrap) progressWrap.style.display = 'flex';
      if (progressStatus) progressStatus.textContent = 'Error: ' + lastError.message;
    } else {
      if (progressFill) progressFill.style.width = '100%';
      if (progressPct) progressPct.textContent = '100%';
      const progressBar = document.getElementById('deleteProgressBar');
      if (progressBar) progressBar.setAttribute('aria-valuenow', '100');
      closeDeleteModal();
      showToast(`Successfully deleted ${successfullyDeletedIds.length} artifact(s)`);
    }
  }
}
