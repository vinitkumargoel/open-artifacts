import { state } from './state.js';
import { rememberToken, mintReadSession, syncTokenDisplay } from '../token.js';
import { promptToken } from '../token-modal.js';
import { showToast } from '../common.js';
import { renderLivePreview } from './preview.js';
import { runHealthDiagnostics } from './diagnostics.js';
import { saveToRecents } from './recents.js';

export function setMode(mode) {
  state.activeMode = mode;
  const dropzone = document.getElementById('dropzone');
  const codeWrap = document.getElementById('codeInputWrap');
  const btnFile = document.getElementById('btn-mode-file');
  const btnCode = document.getElementById('btn-mode-code');

  if (mode === 'file') {
    if (dropzone) dropzone.style.display = 'block';
    if (codeWrap) codeWrap.style.display = 'none';
    if (btnFile) btnFile.classList.add('active');
    if (btnCode) btnCode.classList.remove('active');
  } else {
    if (dropzone) dropzone.style.display = 'none';
    if (codeWrap) codeWrap.style.display = 'flex';
    if (btnFile) btnFile.classList.remove('active');
    if (btnCode) btnCode.classList.add('active');
  }
}

export function toggleAdvanced() {
  const drawer = document.getElementById('advancedDrawer');
  const chevron = document.getElementById('advChevron');
  if (!drawer) return;
  const isOpen = drawer.classList.toggle('open');
  if (chevron) chevron.innerHTML = isOpen ? '&or;' : '&rsaquo;';
}

export function formatHtmlCode() {
  const area = document.getElementById('codeArea');
  if (!area) return;
  let val = area.value;
  if (!val) return;
  val = val.trim();
  area.value = val;
  showToast('Formatted code');
}

export function copyLink() {
  if (state.publishedUrl) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(state.publishedUrl);
      showToast('Link copied to clipboard');
    }
  }
}

export function handleFileChange(input) {
  if (input && input.files && input.files[0]) {
    state.currentFile = input.files[0];
    const sizeStr = (state.currentFile.size / 1024).toFixed(1) + ' KB';

    const dropTitle = document.getElementById('dropTitle');
    if (dropTitle) dropTitle.textContent = state.currentFile.name;

    const fileChip = document.getElementById('fileChip');
    if (fileChip) {
      fileChip.textContent = '📄 ' + state.currentFile.name + ' • ' + sizeStr;
      fileChip.style.display = 'inline-flex';
    }

    const previewFilename = document.getElementById('previewFilename');
    if (previewFilename) previewFilename.textContent = state.currentFile.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      state.currentHtml = e.target.result;
      renderLivePreview(state.currentHtml);
      runHealthDiagnostics(state.currentHtml, state.currentFile.size);

      // Extract title
      const titleMatch = state.currentHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const extracted = titleMatch[1].trim();
        const titleInput = document.getElementById('titleInput');
        const titleHint = document.getElementById('titleHint');
        if (titleInput && !titleInput.value) {
          titleInput.placeholder = extracted;
          if (titleHint) titleHint.textContent = 'Found: "' + extracted + '"';
        }
      }
    };
    reader.readAsText(state.currentFile);
  }
}

export function handleCodeChange(code) {
  state.currentHtml = code;
  const sizeBytes = new Blob([code]).size;

  const charCount = document.getElementById('charCount');
  if (charCount) charCount.textContent = sizeBytes + ' bytes';

  const previewFilename = document.getElementById('previewFilename');
  if (previewFilename) previewFilename.textContent = 'pasted-snippet.html';

  renderLivePreview(code);
  runHealthDiagnostics(code, sizeBytes);

  const titleMatch = code.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const extracted = titleMatch[1].trim();
    const titleInput = document.getElementById('titleInput');
    if (titleInput && !titleInput.value) {
      titleInput.placeholder = extracted;
    }
  }
}

export function onTtlChange(userInitiated) {
  const sel = document.getElementById('ttlSelect');
  if (!sel) return;
  if (userInitiated !== false) sel.dataset.touched = '1';
  const custom = sel.value === 'custom';
  const ttlDaysInput = document.getElementById('ttlDaysInput');
  if (ttlDaysInput) ttlDaysInput.style.display = custom ? '' : 'none';
  updateTtlHint();
}

export function selectedTtl() {
  const sel = document.getElementById('ttlSelect');
  if (!sel) return '';
  if (sel.value !== 'custom') return sel.value;

  const daysInput = document.getElementById('ttlDaysInput');
  const days = parseInt(daysInput ? daysInput.value : '', 10);
  if (!Number.isFinite(days) || days < 1 || days > 3650) return null;
  return String(days);
}

export function updateTtlHint() {
  const hint = document.getElementById('ttlHint');
  if (!hint) return;
  const ttl = selectedTtl();

  if (ttl === null) {
    hint.textContent = 'Enter 1-3650 days';
  } else if (ttl === '') {
    const idInput = document.getElementById('idInput');
    hint.textContent = idInput && idInput.value.trim()
      ? "Keeps this artifact's current retention"
      : 'Server default (30 days)';
  } else if (ttl === 'never') {
    hint.textContent = 'Never deleted';
  } else {
    hint.textContent = 'Deleted on '
      + new Date(Date.now() + Number(ttl) * 86400000).toLocaleDateString();
  }
}

export function syncTtlDefault() {
  const sel = document.getElementById('ttlSelect');
  if (!sel || sel.dataset.touched === '1') return;
  const idInput = document.getElementById('idInput');
  sel.value = idInput && idInput.value.trim() ? '' : '30';
  onTtlChange(false);
}

export async function submitPublish(e) {
  if (e && e.preventDefault) e.preventDefault();

  const tokenInput = document.getElementById('tokenInput');
  const token = tokenInput ? tokenInput.value.trim() : '';
  const btn = document.getElementById('publishBtn');

  if (!token) {
    promptToken();
    return;
  }

  let fileBlob = null;
  let filename = 'artifact.html';

  if (state.activeMode === 'file') {
    if (!state.currentFile) {
      showToast('Please select or drop an HTML file');
      return;
    }
    fileBlob = state.currentFile;
    filename = state.currentFile.name;
  } else {
    const codeArea = document.getElementById('codeArea');
    const code = codeArea ? codeArea.value.trim() : '';
    if (!code) {
      showToast('Please enter HTML code');
      return;
    }
    fileBlob = new Blob([code], { type: 'text/html' });
  }

  const ttl = selectedTtl();
  if (ttl === null) {
    showToast('Retention must be between 1 and 3650 days');
    const ttlDaysInput = document.getElementById('ttlDaysInput');
    if (ttlDaysInput) ttlDaysInput.focus();
    return;
  }

  rememberToken(token);
  syncTokenDisplay();
  mintReadSession(token);

  const formData = new FormData();
  formData.append('file', fileBlob, filename);

  const titleInput = document.getElementById('titleInput');
  const title = titleInput ? titleInput.value.trim() : '';
  if (title) formData.append('title', title);

  const descInput = document.getElementById('descInput');
  const desc = descInput ? descInput.value.trim() : '';
  if (desc) formData.append('description', desc);

  const idInput = document.getElementById('idInput');
  const id = idInput ? idInput.value.trim() : '';
  if (id) formData.append('id', id);

  if (ttl !== '') formData.append('ttl', ttl);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Publishing...</span>';
  }

  try {
    const res = await fetch('/api/artifacts', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Publish failed');

    state.publishedUrl = data.url;
    const pubUrlLink = document.getElementById('publishedUrlLink');
    if (pubUrlLink) {
      pubUrlLink.textContent = data.url;
      pubUrlLink.href = data.url;
    }
    const viewBtn = document.getElementById('viewBtn');
    if (viewBtn) viewBtn.href = data.url;

    const successBanner = document.getElementById('successBanner');
    if (successBanner) successBanner.style.display = 'block';

    saveToRecents({
      id: data.id,
      title: data.title,
      version: data.version,
      url: data.url,
      timestamp: new Date().toISOString()
    });

    showToast('Artifact published successfully');
  } catch (err) {
    showToast('Publish failed: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>Publish Artifact</span><span class="kbd-badge">⌘↵</span>';
    }
  }
}
