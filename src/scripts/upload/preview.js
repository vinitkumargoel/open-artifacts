import { state } from './state.js';
import { showToast } from '../common.js';

export function setDevice(device) {
  const viewport = document.getElementById('previewViewport');
  if (viewport) {
    viewport.className = 'preview-viewport mode-' + device;
  }
  document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
  const devBtn = document.getElementById('dev-' + device);
  if (devBtn) devBtn.classList.add('active');
}

export function renderLivePreview(html) {
  const frame = document.getElementById('livePreviewFrame');
  const emptyState = document.getElementById('emptyState');

  if (emptyState) emptyState.style.display = 'none';
  if (frame) {
    frame.style.display = 'block';
    frame.srcdoc = html;
  }
}

export function popoutPreview() {
  if (!state.currentHtml) {
    showToast('Load an artifact first');
    return;
  }
  const blob = new Blob([state.currentHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function refreshPreview() {
  if (state.currentHtml) {
    renderLivePreview(state.currentHtml);
    showToast('Preview reloaded');
  }
}

export function clearPreview() {
  const frame = document.getElementById('livePreviewFrame');
  const emptyState = document.getElementById('emptyState');
  if (frame) {
    frame.srcdoc = '';
    frame.style.display = 'none';
  }
  if (emptyState) emptyState.style.display = 'flex';
}
