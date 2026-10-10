import { state } from './state.js';
import { copyText, showToast, escapeHtml, formatBytes, formatRelativeDate } from '../common.js';
import { getStoredToken, syncTokenDisplay, rememberToken, clearStoredToken, mintReadSession, dropReadSession } from '../token.js';
import {
  promptToken,
  openTokenModal,
  closeTokenModal,
  handleTokenBackdrop,
  onTokenModalInput,
  toggleTokenVisibility,
  saveTokenFromModal,
  clearTokenFromModal
} from '../token-modal.js';
import {
  setViewMode,
  updateStats,
  renderArtifacts,
  expiryInfo,
  expiryPillHtml,
  highlightRow,
  updateSelectionUI,
  mountVersionRow,
  renderVersionPanel,
  comparePickHint,
  syncComparePicks
} from './render.js';
import {
  handleSearch,
  clearSearch,
  handleSort,
  goToPage,
  handlePageSize,
  applyFiltersAndSort,
  toggleVersionTimeline,
  retryVersionDetail,
  toggleComparePick,
  toggleItemSelection,
  toggleSelectAll,
  clearSelection,
  openStudioWithId,
  openTtlModal,
  closeTtlModal,
  handleTtlBackdrop,
  selectTtlChoice,
  onTtlCustomInput,
  openSingleDeleteModal,
  openBulkDeleteModal,
  closeDeleteModal,
  cancelOrCloseDeleteModal,
  handleModalBackdrop
} from './handlers.js';
import { fetchArtifacts, loadVersionDetail, applyTtl, executeDeletion } from './api.js';

// Expose public API on window for inline HTML handlers
Object.assign(window, {
  state,
  fetchArtifacts,
  loadVersionDetail,
  applyTtl,
  executeDeletion,
  setViewMode,
  handleSearch,
  clearSearch,
  handleSort,
  goToPage,
  handlePageSize,
  applyFiltersAndSort,
  toggleVersionTimeline,
  retryVersionDetail,
  toggleComparePick,
  toggleItemSelection,
  toggleSelectAll,
  clearSelection,
  openStudioWithId,
  openTtlModal,
  closeTtlModal,
  handleTtlBackdrop,
  selectTtlChoice,
  onTtlCustomInput,
  openSingleDeleteModal,
  openBulkDeleteModal,
  closeDeleteModal,
  cancelOrCloseDeleteModal,
  handleModalBackdrop,
  copyText,
  showToast,
  promptToken,
  openTokenModal,
  closeTokenModal,
  handleTokenBackdrop,
  onTokenModalInput,
  toggleTokenVisibility,
  saveTokenFromModal,
  clearTokenFromModal,
  syncTokenDisplay
});

// Configure token modal lifecycle callbacks for History
window.__onTokenSaved = (token, ok) => {
  if (ok) fetchArtifacts(true);
};

window.__onTokenCleared = () => {
  dropReadSession().then(() => {
    window.location.href = '/unlock?next=%2Fhistory';
  });
};

// Global Keybindings
window.addEventListener('keydown', (e) => {
  // Focus Search with '/'
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    e.preventDefault();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.focus();
  }
  // Select All with Cmd/Ctrl + A when not in input
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (state.isDeleting) return;
    e.preventDefault();
    toggleSelectAll(true);
  }
  // Escape closes modal / clears search
  if (e.key === 'Escape') {
    if (!state.isDeleting) {
      closeDeleteModal();
    }
    closeTokenModal();
    closeTtlModal();
    const searchInput = document.getElementById('searchInput');
    if (searchInput && document.activeElement === searchInput) {
      searchInput.blur();
    }
  }
  // Delete key triggers bulk delete if items selected
  if ((e.key === 'Delete' || e.key === 'Backspace') && (e.metaKey || e.ctrlKey) && state.selectedIds.size > 0 && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    e.preventDefault();
    openBulkDeleteModal();
  }
});

// Guard against accidental page reload / navigation while deletion is in flight
window.addEventListener('beforeunload', (e) => {
  if (state.isDeleting) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Restore page / page size from the URL (shareable) or the last-used size.
function initPagination() {
  const params = new URLSearchParams(window.location.search);
  let size = parseInt(params.get('limit') || '', 10);
  if (!size) {
    try { size = parseInt(localStorage.getItem('open_artifacts_page_size') || '', 10); } catch (_) {}
  }
  if ([10, 25, 50, 100].includes(size)) state.pageSize = size;
  const page = parseInt(params.get('page') || '', 10);
  if (page > 0) state.page = page;
}

// Initialize on DOM ready
function init() {
  initPagination();
  syncTokenDisplay();
  fetchArtifacts();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
