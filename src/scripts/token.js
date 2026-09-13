/**
 * Client-side token storage and session synchronization.
 */

export function getStoredToken() {
  try {
    return localStorage.getItem('open_artifacts_token') || sessionStorage.getItem('open_artifacts_token') || '';
  } catch (_) {
    return '';
  }
}

export function tokenIsSessionOnly() {
  try {
    return !localStorage.getItem('open_artifacts_token') && !!sessionStorage.getItem('open_artifacts_token');
  } catch (_) {
    return false;
  }
}

export function rememberToken(token) {
  try {
    if (tokenIsSessionOnly()) {
      sessionStorage.setItem('open_artifacts_token', token);
    } else {
      localStorage.setItem('open_artifacts_token', token);
    }
  } catch (_) {
    // Storage blocked (private mode): request carries token in memory
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem('open_artifacts_token');
    sessionStorage.removeItem('open_artifacts_token');
  } catch (_) {}
}

export function syncTokenDisplay() {
  const token = getStoredToken();
  const dot = document.getElementById('tokenDot');
  const text = document.getElementById('tokenDisplay');
  if (dot) {
    dot.classList.toggle('active', !!token);
  }
  if (text) {
    text.textContent = token ? 'token: active' : 'token: unset';
  }
}

export async function mintReadSession(token) {
  if (!token) return false;
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

export async function dropReadSession() {
  try {
    await fetch('/api/session', { method: 'DELETE' });
  } catch (_) {
    // Cookie survives until expiry
  }
}
