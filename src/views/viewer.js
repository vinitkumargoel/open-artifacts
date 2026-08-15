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
      --bg-chrome: #0f172a;
      --bg-surface: #1e293b;
      --bg-subtle: #334155;
      --bg-active: #475569;
      --border-color: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent: #3b82f6;
      --accent-hover: #60a5fa;
      --success: #10b981;
      --canvas-bg: #e2e8f0;
      --radius: 8px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      background: var(--bg-chrome);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
    }

    /* Top Navigation / Chrome Bar */
    .viewer-header {
      background: var(--bg-chrome);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
      z-index: 20;
    }

    .artifact-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-mark {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
      flex-shrink: 0;
    }

    .title-group {
      min-width: 0;
    }

    .artifact-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 320px;
    }

    .artifact-desc {
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 360px;
    }

    /* Controls Bar */
    .viewer-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .version-select {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 5px 10px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      outline: none;
      transition: border-color 0.2s;
    }
    .version-select:hover, .version-select:focus {
      border-color: var(--accent);
    }

    .viewport-group {
      display: flex;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 2px;
      gap: 2px;
    }

    .view-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
    }
    .view-btn:hover {
      color: var(--text-primary);
    }
    .view-btn.active {
      background: var(--bg-subtle);
      color: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }

    .action-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 5px 10px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: var(--bg-subtle);
      color: var(--text-primary);
      border-color: var(--accent);
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
    .btn-primary:hover {
      background: var(--accent-hover);
      color: #fff;
    }

    /* Main Sandbox Stage */
    .stage-container {
      flex: 1;
      position: relative;
      background: #020617;
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
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
    }

    .stage-container.mode-mobile .viewport-frame {
      width: 375px;
      height: calc(100% - 32px);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #1e293b;
      border: 1px solid var(--accent);
      color: #fff;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
      pointer-events: none;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 999;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    @media (max-width: 800px) {
      .artifact-desc { display: none; }
      .viewport-group { display: none; }
    }
  </style>
</head>
<body>

  <!-- Header Chrome -->
  <header class="viewer-header">
    <div class="artifact-info">
      <a href="/upload" class="brand-mark" title="Publish New Artifact">&lambda;</a>
      <div class="title-group">
        <div class="artifact-title" title="${title}">${title}</div>
        <div class="artifact-desc" title="${description || versionNote}">${versionNote || description || 'OpenArtifacts Viewer'}</div>
      </div>
    </div>

    <div class="viewer-controls">
      <!-- Version Dropdown -->
      <select class="version-select" id="versionSelect" onchange="changeVersion(this.value)" aria-label="Select Version">
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
      <div class="viewport-group" role="group" aria-label="Responsive Device Previews">
        <button class="view-btn active" id="btn-desktop" onclick="setViewport('desktop')">💻 Desktop</button>
        <button class="view-btn" id="btn-tablet" onclick="setViewport('tablet')">📲 Tablet</button>
        <button class="view-btn" id="btn-mobile" onclick="setViewport('mobile')">📱 Mobile</button>
      </div>

      <!-- Action Buttons -->
      <button class="action-btn" onclick="toggleFullscreen()" title="Toggle Fullscreen">⛶ Fullscreen</button>
      <button class="action-btn btn-primary" onclick="copyShareUrl()" title="Copy Public URL">🔗 Copy Link</button>
      <a href="${rawUrl}" target="_blank" rel="noopener noreferrer" class="action-btn" title="Open Raw Sandbox">📑 Raw</a>
    </div>
  </header>

  <!-- Sandbox Stage -->
  <main class="stage-container" id="stageContainer">
    <iframe
      id="artifactFrame"
      class="viewport-frame"
      src="${rawUrl}"
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      loading="eager"
      title="${title}">
    </iframe>
  </main>

  <div class="toast" id="toast" role="alert">&check; Copied to clipboard!</div>

  <script>
    const uuid = ${JSON.stringify(uuid)};
    let activeVersion = ${activeVer};
    let latestVersion = ${latestVer};

    function changeVersion(newVer) {
      activeVersion = parseInt(newVer, 10);
      const frame = document.getElementById('artifactFrame');
      frame.src = '/raw/' + uuid + '/' + activeVersion;

      // Update URL with history.pushState without full page reload
      const newPath = activeVersion === latestVersion ? '/a/' + uuid : '/a/' + uuid + '/v/' + activeVersion;
      window.history.pushState({ version: activeVersion }, '', newPath);
      showToast('Switched to Version ' + activeVersion);
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
        showToast('🔗 Link copied: ' + shareUrl);
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

    // Handle browser forward/back buttons
    window.addEventListener('popstate', (event) => {
      if (event.state && event.state.version) {
        document.getElementById('versionSelect').value = event.state.version;
        document.getElementById('artifactFrame').src = '/raw/' + uuid + '/' + event.state.version;
      }
    });
  </script>
</body>
</html>`;
}
