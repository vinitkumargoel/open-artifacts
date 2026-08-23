import { escapeHtml } from '../utils/sanitize.js';
import { config } from '../config/env.js';

/**
 * Generates the complete HTML for the Artifact Viewer Shell.
 * @param {object} params
 * @param {object} params.artifact - The artifact metadata object from DB/meta.json
 * @param {number} params.currentVersion - The version number to display
 * @returns {string} Server-rendered HTML
 */
export function renderViewerHtml({ artifact, currentVersion }) {
  const uuid = escapeHtml(artifact._id);
  const title = escapeHtml(artifact.title || 'Untitled Artifact');
  const description = escapeHtml(artifact.description || '');
  const latestVer = artifact.latestVersion || 1;
  const activeVer = currentVersion || latestVer;

  const versions = (artifact.versions || []).slice().sort((a, b) => b.versionNumber - a.versionNumber);
  if (versions.length === 0) {
    versions.push({ versionNumber: 1, description: '', createdAt: artifact.createdAt });
  }

  const rawUrl = `/raw/${uuid}/${activeVer}`;
  const currentViewUrl = `${config.baseUrl}/a/${uuid}${activeVer === latestVer ? '' : `/v/${activeVer}`}`;

  // Find active version description/changelog
  const activeVersionObj = versions.find(v => v.versionNumber === activeVer);
  const versionNote = activeVersionObj?.description ? escapeHtml(activeVersionObj.description) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description || title}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <!-- OpenGraph & Social Cards -->
  <meta property="og:title" content="${title} &bull; OpenArtifacts">
  <meta property="og:description" content="${description || 'Interactive standalone HTML artifact.'}">
  <meta property="og:url" content="${currentViewUrl}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title} &bull; OpenArtifacts">
  <meta name="twitter:description" content="${description || 'Interactive standalone HTML artifact.'}">
  <title>${title} &bull; OpenArtifacts</title>
  <style>
    :root {
      --bg: #fbfbfb;
      --bg-surface: #ffffff;
      --bg-subtle: #f4f4f5;
      --bg-stage: #f4f4f5;
      --border: #e4e4e7;
      --text-primary: #18181b;
      --text-secondary: #52525b;
      --text-tertiary: #a1a1aa;
      --accent: #18181b;
      --radius-sm: 6px;
      --radius-md: 8px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
      --shadow-frame: 0 4px 20px -2px rgba(0,0,0,0.08);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: var(--font-sans);
      background: var(--bg-surface);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    /* ============ Top Bar ============ */
    .viewer-header {
      height: 52px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
      z-index: 20;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }

    .brand-mark {
      width: 26px;
      height: 26px;
      background: #18181b;
      color: #ffffff;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      text-decoration: none;
      flex-shrink: 0;
      transition: transform 0.15s;
    }
    .brand-mark:hover { transform: scale(1.05); }

    .brand-name {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      text-decoration: none;
      flex-shrink: 0;
    }
    .brand-name:hover { color: var(--text-secondary); }

    .brand-sep {
      color: var(--text-tertiary);
      font-size: 13px;
      flex-shrink: 0;
    }

    .artifact-title {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .version-note {
      font-size: 12px;
      color: var(--text-tertiary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 260px;
      flex-shrink: 2;
      border-left: 1px solid var(--border);
      padding-left: 10px;
    }

    /* ============ Controls ============ */
    .viewer-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .viewer-controls svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .version-select {
      height: 30px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 0 8px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 500;
      font-family: var(--font-sans);
      cursor: pointer;
      outline: none;
      transition: border-color 0.15s;
      max-width: 180px;
    }
    .version-select:hover, .version-select:focus {
      border-color: var(--text-secondary);
    }

    .viewport-group {
      display: flex;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
      height: 30px;
    }

    .view-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 0 9px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 500;
      font-family: var(--font-sans);
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s;
    }
    .view-btn:hover {
      color: var(--text-primary);
    }
    .view-btn.active {
      background: var(--bg-surface);
      color: var(--text-primary);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .control-divider {
      width: 1px;
      height: 20px;
      background: var(--border);
      flex-shrink: 0;
    }

    .icon-btn {
      height: 30px;
      width: 30px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      transition: all 0.15s;
    }
    .icon-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-secondary);
    }

    .copy-btn {
      height: 30px;
      background: var(--accent);
      color: #ffffff;
      border: 1px solid var(--accent);
      padding: 0 12px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-sans);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
      box-shadow: var(--shadow-sm);
    }
    .copy-btn:hover {
      background: #27272a;
    }

    /* ============ Sandbox Stage ============ */
    .stage-container {
      flex: 1;
      position: relative;
      background: var(--bg-stage);
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      padding: 0;
    }

    .viewport-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: #ffffff;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s ease;
    }

    .stage-container.mode-tablet .viewport-frame {
      width: 768px;
      height: calc(100% - 32px);
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow-frame);
    }

    .stage-container.mode-mobile .viewport-frame {
      width: 375px;
      height: calc(100% - 32px);
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow-frame);
    }

    /* ============ Toast ============ */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: #18181b;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: var(--radius-md);
      font-size: 12.5px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      pointer-events: none;
      opacity: 0;
      transition: all 0.2s ease;
      z-index: 999;
      max-width: min(90vw, 480px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* ============ Responsive ============ */
    @media (max-width: 1000px) {
      .version-note { display: none; }
      .view-btn span { display: none; }
      .view-btn { padding: 0 8px; }
    }

    @media (max-width: 840px) {
      .brand-name, .brand-sep { display: none; }
      .viewport-group { display: none; }
      .control-divider { display: none; }
    }

    @media (max-width: 600px) {
      .copy-btn span { display: none; }
      .copy-btn { width: 30px; padding: 0; justify-content: center; }
    }
  </style>
</head>
<body>

  <!-- Header Chrome -->
  <header class="viewer-header">
    <div class="header-left">
      <a href="/upload" class="brand-mark" title="OpenArtifacts Studio">&lambda;</a>
      <a href="/upload" class="brand-name">OpenArtifacts</a>
      <span class="brand-sep">/</span>
      <h1 class="artifact-title" title="${description || title}">${title}</h1>
      ${versionNote ? `<span class="version-note" title="${versionNote}">${versionNote}</span>` : ''}
    </div>

    <div class="viewer-controls">
      <!-- Version Dropdown -->
      <select class="version-select" id="versionSelect" onchange="changeVersion(this.value)" aria-label="Select version">
        ${versions.map(v => {
          const isLatest = v.versionNumber === latestVer;
          const isSelected = v.versionNumber === activeVer;
          const dateStr = v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '';
          return `<option value="${v.versionNumber}" ${isSelected ? 'selected' : ''}>
            v${v.versionNumber}${isLatest ? ' (Latest)' : ''} &bull; ${dateStr}
          </option>`;
        }).join('')}
      </select>

      <!-- Viewport Device Switcher -->
      <div class="viewport-group" role="group" aria-label="Responsive device previews">
        <button class="view-btn active" id="btn-desktop" onclick="setViewport('desktop')" title="Desktop preview">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"></rect><path stroke-linecap="round" d="M8 21h8m-4-4v4"></path></svg>
          <span>Desktop</span>
        </button>
        <button class="view-btn" id="btn-tablet" onclick="setViewport('tablet')" title="Tablet preview">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"></rect><path stroke-linecap="round" d="M12 18h.01"></path></svg>
          <span>Tablet</span>
        </button>
        <button class="view-btn" id="btn-mobile" onclick="setViewport('mobile')" title="Mobile preview">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"></rect><path stroke-linecap="round" d="M12 18h.01"></path></svg>
          <span>Mobile</span>
        </button>
      </div>

      <span class="control-divider"></span>

      <!-- Action Buttons -->
      <a href="/history" class="icon-btn" title="View all artifacts (History)" aria-label="View all artifacts">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
      </a>
      <button class="icon-btn" onclick="toggleFullscreen()" title="Toggle fullscreen" aria-label="Toggle fullscreen">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"></path></svg>
      </button>
      <a href="${rawUrl}" target="_blank" rel="noopener noreferrer" class="icon-btn" title="Open raw HTML in new tab" aria-label="Open raw HTML in new tab">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path></svg>
      </a>
      <button class="copy-btn" onclick="copyShareUrl()" title="Copy public link">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path></svg>
        <span>Copy Link</span>
      </button>
    </div>
  </header>

  <!-- Sandbox Stage -->
  <main class="stage-container" id="stageContainer">
    <iframe
      id="artifactFrame"
      class="viewport-frame"
      src="${rawUrl}"
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
      loading="eager"
      title="${title}">
    </iframe>
  </main>

  <div class="toast" id="toast" role="alert">Copied to clipboard</div>

  <script>
    const uuid = ${JSON.stringify(uuid)};
    let activeVersion = ${activeVer};
    let latestVersion = ${latestVer};

    // Stamp the initial history entry so popstate can restore it later
    window.history.replaceState({ version: activeVersion }, '', window.location.pathname);

    function changeVersion(newVer) {
      activeVersion = parseInt(newVer, 10);
      const frame = document.getElementById('artifactFrame');
      frame.src = '/raw/' + uuid + '/' + activeVersion;

      // Update URL with history.pushState without full page reload
      const newPath = activeVersion === latestVersion ? '/a/' + uuid : '/a/' + uuid + '/v/' + activeVersion;
      window.history.pushState({ version: activeVersion }, '', newPath);
      showToast('Switched to version ' + activeVersion);
    }

    function setViewport(mode) {
      const container = document.getElementById('stageContainer');
      container.className = 'stage-container mode-' + mode;

      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      const activeBtn = document.getElementById('btn-' + mode);
      if (activeBtn) activeBtn.classList.add('active');
    }

    function toggleFullscreen() {
      const stage = document.getElementById('stageContainer');
      if (!document.fullscreenElement) {
        stage.requestFullscreen().catch(err => {
          console.error(err);
        });
      } else {
        document.exitFullscreen();
      }
    }

    function copyShareUrl() {
      const shareUrl = window.location.origin + (activeVersion === latestVersion ? '/a/' + uuid : '/a/' + uuid + '/v/' + activeVersion);
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Link copied to clipboard');
      }).catch(() => {
        prompt('Copy artifact URL:', shareUrl);
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // Handle browser forward/back buttons (state may be null for entries
    // created outside pushState, so fall back to parsing the URL)
    window.addEventListener('popstate', (event) => {
      let ver = event.state && event.state.version;
      if (!ver) {
        const match = window.location.pathname.match(/\\/v\\/(\\d+)$/);
        ver = match ? parseInt(match[1], 10) : latestVersion;
      }
      activeVersion = ver;
      document.getElementById('versionSelect').value = String(ver);
      document.getElementById('artifactFrame').src = '/raw/' + uuid + '/' + ver;
    });
  </script>
</body>
</html>`;
}
