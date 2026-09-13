import { getStoredToken, tokenIsSessionOnly, syncTokenDisplay, mintReadSession, dropReadSession, clearStoredToken } from './token.js';
import { showToast } from './common.js';

export const EYE_SVG = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>';
export const EYE_OFF_SVG = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path><path stroke-linecap="round" d="M4 4l16 16"></path></svg>';

export function promptToken() {
  openTokenModal();
}

export function openTokenModal() {
  const input = document.getElementById('tokenModalInput');
  const hint = document.getElementById('tokenModalHint');
  const clearBtn = document.getElementById('tokenClearBtn');
  const saveBtn = document.getElementById('tokenSaveBtn');
  const eyeBtn = document.getElementById('tokenEyeBtn');
  const rememberChk = document.getElementById('tokenRememberChk');
  const modal = document.getElementById('tokenModal');

  if (!modal || !input) return;

  const stored = getStoredToken();
  input.value = '';
  input.type = 'password';

  if (eyeBtn) {
    eyeBtn.innerHTML = EYE_SVG;
    eyeBtn.title = 'Show token';
    eyeBtn.setAttribute('aria-label', 'Show token');
  }

  if (saveBtn) saveBtn.disabled = true;
  if (rememberChk) rememberChk.checked = !tokenIsSessionOnly();

  if (hint) {
    if (stored) {
      hint.textContent = 'A token is saved ' + (tokenIsSessionOnly() ? 'for this tab' : 'on this device') + '. Saving a new value replaces it.';
      hint.classList.add('saved');
    } else {
      hint.textContent = 'No token saved yet. Ask the instance owner for ARTIFACT_ACCESS_TOKEN.';
      hint.classList.remove('saved');
    }
  }

  if (clearBtn) {
    clearBtn.style.display = stored ? '' : 'none';
  }

  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 30);
}

export function closeTokenModal() {
  const modal = document.getElementById('tokenModal');
  const input = document.getElementById('tokenModalInput');
  if (input) input.value = '';
  if (modal) modal.style.display = 'none';
}

export function handleTokenBackdrop(e) {
  if (e && e.target && e.target.id === 'tokenModal') {
    closeTokenModal();
  }
}

export function onTokenModalInput() {
  const input = document.getElementById('tokenModalInput');
  const saveBtn = document.getElementById('tokenSaveBtn');
  if (saveBtn && input) {
    saveBtn.disabled = !input.value.trim();
  }
}

export function toggleTokenVisibility() {
  const input = document.getElementById('tokenModalInput');
  const btn = document.getElementById('tokenEyeBtn');
  if (!input || !btn) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
  btn.title = show ? 'Hide token' : 'Show token';
  btn.setAttribute('aria-label', btn.title);
  input.focus();
}

export function saveTokenFromModal() {
  const input = document.getElementById('tokenModalInput');
  if (!input) return;
  const trimmed = input.value.trim();
  if (!trimmed) return;

  const rememberChk = document.getElementById('tokenRememberChk');
  const remember = rememberChk ? rememberChk.checked : true;

  try {
    if (remember) {
      localStorage.setItem('open_artifacts_token', trimmed);
      sessionStorage.removeItem('open_artifacts_token');
    } else {
      sessionStorage.setItem('open_artifacts_token', trimmed);
      localStorage.removeItem('open_artifacts_token');
    }
  } catch (_) {}

  const formTokenInput = document.getElementById('tokenInput');
  if (formTokenInput) {
    formTokenInput.value = trimmed;
  }

  closeTokenModal();
  syncTokenDisplay();
  showToast(remember ? 'Access token saved on this device' : 'Access token saved for this tab');

  mintReadSession(trimmed).then(ok => {
    if (window.__onTokenSaved) {
      window.__onTokenSaved(trimmed, ok);
    }
  });
}

export function clearTokenFromModal() {
  clearStoredToken();
  dropReadSession();

  const formTokenInput = document.getElementById('tokenInput');
  if (formTokenInput) {
    formTokenInput.value = '';
  }

  closeTokenModal();
  syncTokenDisplay();
  showToast('Access token cleared');

  if (window.__onTokenCleared) {
    window.__onTokenCleared();
  }
}
