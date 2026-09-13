import { state } from './state.js';
import { copyText, showToast } from '../common.js';
import { getStoredToken, syncTokenDisplay } from '../token.js';
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
import { setDevice, renderLivePreview, popoutPreview, refreshPreview, clearPreview } from './preview.js';
import { runHealthDiagnostics } from './diagnostics.js';
import { openRecentsModal, openShortcutsModal, closeModals, renderRecents, applyUpdateTarget, UUID_RE } from './recents.js';
import { loadSampleTemplate } from './templates.js';
import {
  setMode,
  toggleAdvanced,
  formatHtmlCode,
  copyLink,
  handleFileChange,
  handleCodeChange,
  onTtlChange,
  syncTtlDefault,
  submitPublish
} from './form.js';

// Expose public API on window for inline HTML handlers
Object.assign(window, {
  state,
  setMode,
  setDevice,
  toggleAdvanced,
  formatHtmlCode,
  copyLink,
  loadSampleTemplate,
  handleFileChange,
  handleCodeChange,
  renderLivePreview,
  popoutPreview,
  refreshPreview,
  clearPreview,
  openRecentsModal,
  openShortcutsModal,
  closeModals,
  renderRecents,
  applyUpdateTarget,
  onTtlChange,
  syncTtlDefault,
  submitPublish,
  promptToken,
  openTokenModal,
  closeTokenModal,
  handleTokenBackdrop,
  onTokenModalInput,
  toggleTokenVisibility,
  saveTokenFromModal,
  clearTokenFromModal,
  copyText,
  showToast,
  syncTokenDisplay
});

function initStudio() {
  // Sync token into hidden input if present
  const saved = getStoredToken();
  const tokenInput = document.getElementById('tokenInput');
  if (tokenInput && saved) {
    tokenInput.value = saved;
  }
  syncTokenDisplay();

  // Dropzone drag-and-drop wiring
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (dropzone && fileInput) {
    ['dragenter', 'dragover'].forEach(n => {
      dropzone.addEventListener(n, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(n => {
      dropzone.addEventListener(n, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileChange(fileInput);
      }
    });
  }

  // Form submit wiring
  const studioForm = document.getElementById('studioForm');
  if (studioForm) {
    studioForm.addEventListener('submit', submitPublish);
  }

  // ID input listener to update default retention
  const idInput = document.getElementById('idInput');
  if (idInput) {
    idInput.addEventListener('input', syncTtlDefault);
  }
  syncTtlDefault();

  // Check URL parameters for pre-selected update target ID
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const updateTarget = urlParams.get('update') || sessionStorage.getItem('open_artifacts_target_id');
    if (updateTarget && UUID_RE.test(updateTarget)) {
      sessionStorage.removeItem('open_artifacts_target_id');
      applyUpdateTarget(updateTarget);
    }
  } catch (_) {}
}

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const studioForm = document.getElementById('studioForm');
    if (studioForm) studioForm.requestSubmit();
  }
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
    if (e.key === '1') setDevice('desktop');
    if (e.key === '2') setDevice('tablet');
    if (e.key === '3') setDevice('mobile');
  }
  if (e.key === 'Escape') {
    closeModals();
    closeTokenModal();
  }
});

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStudio);
} else {
  initStudio();
}
