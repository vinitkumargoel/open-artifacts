export function renderUploadHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <title>OpenArtifacts &bull; Studio Publisher</title>
  <style>
    :root {
      --bg: #fbfbfb;
      --bg-surface: #ffffff;
      --bg-subtle: #f4f4f5;
      --bg-muted: #e4e4e7;
      --border: #e4e4e7;
      --border-subtle: #f0f0f2;
      --border-focus: #18181b;
      --text-primary: #18181b;
      --text-secondary: #52525b;
      --text-tertiary: #a1a1aa;
      --accent: #18181b;
      --accent-blue: #0969da;
      --accent-blue-bg: #eff6ff;
      --success: #16a34a;
      --success-bg: #f0fdf4;
      --success-border: #bbf7d0;
      --warning: #d97706;
      --warning-bg: #fffbeb;
      --warning-border: #fde68a;
      --danger: #dc2626;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,0.05);
      --shadow-lg: 0 10px 25px -5px rgba(0,0,0,0.1);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    /* Top Navigation */
    .top-nav {
      height: 52px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      z-index: 50;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
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
      transition: transform 0.15s;
    }
    .brand-mark:hover { transform: scale(1.05); }

    .brand-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
    }

    .brand-separator {
      color: var(--text-tertiary);
      font-size: 13px;
    }

    .brand-sub {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .nav-btn {
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 5px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-family: var(--font-sans);
      font-weight: 500;
      transition: all 0.15s;
    }

    .nav-btn:hover {
      border-color: var(--text-primary);
      color: var(--text-primary);
    }

    .token-pill {
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-family: var(--font-mono);
      transition: all 0.15s;
    }

    .token-pill:hover {
      border-color: var(--text-secondary);
    }

    .token-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-tertiary);
    }

    .token-dot.active {
      background: var(--success);
    }

    /* Main Studio Grid */
    .studio-grid {
      flex: 1;
      display: grid;
      grid-template-columns: 460px 1fr;
      height: calc(100vh - 52px);
      overflow: hidden;
    }

    @media (max-width: 960px) {
      .studio-grid {
        grid-template-columns: 1fr;
        height: auto;
        overflow: visible;
      }
    }

    /* Left Pane: Publisher Controls */
    .controls-pane {
      background: var(--bg-surface);
      border-right: 1px solid var(--border);
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    /* Template Loader Row */
    .template-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .template-select {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px 8px;
      font-size: 11.5px;
      color: var(--text-primary);
      outline: none;
      cursor: pointer;
    }

    .segmented-control {
      display: flex;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 2px;
      gap: 2px;
    }

    .segment-btn {
      flex: 1;
      padding: 7px 12px;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.12s ease;
    }

    .segment-btn:hover {
      color: var(--text-primary);
    }

    .segment-btn.active {
      background: var(--bg-surface);
      color: var(--text-primary);
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(0,0,0,0.06);
    }

    /* Dropzone */
    .dropzone-container {
      border: 1.5px dashed var(--border);
      background: var(--bg);
      border-radius: var(--radius-lg);
      padding: 28px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s ease;
      position: relative;
    }

    .dropzone-container:hover, .dropzone-container.dragover {
      border-color: var(--text-primary);
      background: var(--bg-subtle);
    }

    .dropzone-icon {
      width: 30px;
      height: 30px;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .dropzone-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .dropzone-sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .file-chip {
      margin-top: 10px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 5px 10px;
      font-size: 11.5px;
      color: var(--text-primary);
      font-family: var(--font-mono);
    }

    /* Raw Code Textarea */
    .code-input-container {
      display: none;
      flex-direction: column;
      gap: 6px;
    }

    .raw-code-area {
      width: 100%;
      height: 180px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-primary);
      outline: none;
      resize: vertical;
      transition: border-color 0.15s;
    }

    .raw-code-area:focus {
      border-color: var(--border-focus);
      background: var(--bg-surface);
    }

    .code-meta-bar {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-tertiary);
      font-family: var(--font-mono);
    }

    /* Diagnostics Badge Bar */
    .diagnostics-bar {
      display: none;
      align-items: center;
      gap: 8px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      font-size: 11.5px;
      color: var(--text-secondary);
      font-family: var(--font-mono);
    }

    .diag-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Form Fields */
    .form-stack {
      display: flex;
      flex-direction: column;
      gap: 13px;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .field-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .field-hint {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .input-field {
      width: 100%;
      height: 36px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 0 12px;
      font-size: 13px;
      color: var(--text-primary);
      outline: none;
      transition: all 0.15s;
    }

    .input-field:focus {
      background: var(--bg-surface);
      border-color: var(--border-focus);
    }

    .input-mono {
      font-family: var(--font-mono);
      font-size: 12px;
    }

    /* Expandable Advanced Section */
    .advanced-toggle {
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
    }

    .advanced-toggle:hover {
      color: var(--text-primary);
    }

    .advanced-drawer {
      display: none;
      flex-direction: column;
      gap: 12px;
      padding-top: 4px;
    }

    .advanced-drawer.open {
      display: flex;
    }

    /* Publish Button */
    .btn-publish {
      width: 100%;
      height: 42px;
      background: #18181b;
      color: #ffffff;
      border: 1px solid #18181b;
      border-radius: var(--radius-md);
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      transition: all 0.12s ease;
      margin-top: 6px;
    }

    .btn-publish:hover {
      background: #27272a;
      transform: translateY(-0.5px);
      box-shadow: 0 3px 8px rgba(0,0,0,0.12);
    }

    .btn-publish:active {
      transform: translateY(0);
    }

    .kbd-badge {
      font-size: 11px;
      font-family: var(--font-mono);
      background: rgba(255, 255, 255, 0.16);
      padding: 2px 6px;
      border-radius: 4px;
      color: #e4e4e7;
    }

    /* Right Pane: Live Interactive Sandbox Preview */
    .preview-pane {
      background: #f4f4f5;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-toolbar {
      height: 44px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border);
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .preview-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .device-switcher {
      display: flex;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 2px;
      gap: 2px;
    }

    .device-btn {
      background: transparent;
      border: none;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary);
      border-radius: 4px;
      cursor: pointer;
    }

    .device-btn.active {
      background: var(--bg-surface);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .icon-tool-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 4px 8px;
      font-size: 11.5px;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
    }
    .icon-tool-btn:hover {
      color: var(--text-primary);
      border-color: var(--text-secondary);
    }

    .preview-stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow: hidden;
      position: relative;
    }

    .preview-viewport {
      width: 100%;
      height: 100%;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: 0 4px 20px -2px rgba(0,0,0,0.06);
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .preview-viewport.mode-tablet {
      width: 768px;
    }

    .preview-viewport.mode-mobile {
      width: 375px;
    }

    .preview-frame {
      width: 100%;
      height: 100%;
      border: none;
      background: #ffffff;
    }

    .empty-preview-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-tertiary);
      gap: 12px;
      text-align: center;
      padding: 40px;
    }

    .empty-icon {
      width: 44px;
      height: 44px;
      stroke-width: 1.5;
      color: #cbd5e1;
    }

    /* Result Card Overlay */
    .success-banner {
      background: var(--success-bg);
      border: 1px solid var(--success-border);
      border-radius: var(--radius-md);
      padding: 14px;
      display: none;
      animation: fadeIn 0.2s ease-out;
    }

    .success-header {
      font-size: 13px;
      font-weight: 700;
      color: #15803d;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .success-link {
      display: block;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #166534;
      background: #ffffff;
      border: 1px solid var(--success-border);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      margin: 8px 0;
      word-break: break-all;
      text-decoration: none;
      font-weight: 600;
    }

    .success-actions {
      display: flex;
      gap: 8px;
    }

    .btn-secondary {
      flex: 1;
      height: 32px;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      text-decoration: none;
      transition: all 0.15s;
    }

    .btn-secondary:hover {
      background: var(--bg-subtle);
    }

    /* Recents Drawer Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(4px);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
    }

    .modal-content {
      width: 100%;
      max-width: 520px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-lg);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    .recent-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      margin-bottom: 8px;
      background: var(--bg);
      transition: all 0.15s;
    }
    .recent-item:hover { background: var(--bg-subtle); }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #18181b;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: var(--radius-md);
      font-size: 12.5px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.2s ease;
      z-index: 1000;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>

  <!-- Minimal Nav -->
  <header class="top-nav">
    <div class="brand-section">
      <a href="/upload" class="brand-mark">&lambda;</a>
      <span class="brand-title">OpenArtifacts</span>
      <span class="brand-separator">/</span>
      <span class="brand-sub">Studio Publisher</span>
    </div>

    <div class="nav-actions">
      <!-- History Button -->
      <a href="/history" class="nav-btn" title="View all artifacts directory">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        <span>History</span>
      </a>

      <!-- Recents Button -->
      <button class="nav-btn" onclick="openRecentsModal()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path stroke-linecap="round" d="M12 7v5l3 3"></path></svg>
        <span>Recents</span>
      </button>

      <!-- Keyboard Shortcuts Help -->
      <button class="nav-btn" onclick="openShortcutsModal()" title="Keyboard Shortcuts">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path stroke-linecap="round" d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 13h6M8 17h8"></path></svg>
        <span>Shortcuts</span>
      </button>

      <!-- Token Status Pill -->
      <div class="token-pill" onclick="promptToken()">
        <div class="token-dot" id="tokenDot"></div>
        <span id="tokenDisplay">token: unset</span>
      </div>
    </div>
  </header>

  <!-- Studio Workspace -->
  <main class="studio-grid">

    <!-- Left: Controls Pane -->
    <div class="controls-pane">

      <!-- Sample Template Bar -->
      <div class="template-bar">
        <span>Quick load template:</span>
        <select class="template-select" onchange="loadSampleTemplate(this.value)">
          <option value="">Select sample...</option>
          <option value="radar">Sales Radar Dashboard</option>
          <option value="sphere">3D Canvas Orbit</option>
          <option value="game">Retro Snake Game</option>
        </select>
      </div>

      <!-- Mode Selector -->
      <div class="segmented-control">
        <button class="segment-btn active" id="btn-mode-file" onclick="setMode('file')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
          <span>Upload File</span>
        </button>
        <button class="segment-btn" id="btn-mode-code" onclick="setMode('code')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
          <span>Paste Code</span>
        </button>
      </div>

      <!-- Mode 1: File Dropzone -->
      <div class="dropzone-container" id="dropzone" onclick="document.getElementById('fileInput').click()">
        <svg class="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
        <div class="dropzone-title" id="dropTitle">Choose HTML file or drag here</div>
        <div class="dropzone-sub">Standalone interactive HTML, Canvas, or React bundle</div>
        <div class="file-chip" id="fileChip" style="display: none;"></div>
        <input type="file" id="fileInput" name="file" accept=".html,.htm" style="display: none;" onchange="handleFileChange(this)">
      </div>

      <!-- Mode 2: Raw Code Area -->
      <div class="code-input-container" id="codeInputWrap">
        <textarea class="raw-code-area" id="codeArea" placeholder="<!DOCTYPE html>
<html>
<head>
  <title>Interactive Application</title>
</head>
<body>
  <h1>Hello OpenArtifacts!</h1>
</body>
</html>" oninput="handleCodeChange(this.value)"></textarea>
        <div class="code-meta-bar">
          <span id="charCount">0 bytes</span>
          <span style="cursor: pointer; color: var(--text-secondary);" onclick="formatHtmlCode()">🧹 Clean Indent</span>
        </div>
      </div>

      <!-- Document Health Diagnostics Bar -->
      <div class="diagnostics-bar" id="diagnosticsBar">
        <div class="diag-item"><span>📦</span> <span id="diagSize">0 KB</span></div>
        <div class="diag-item"><span>📱</span> <span id="diagViewport">Viewport OK</span></div>
        <div class="diag-item"><span>⚡</span> <span id="diagScripts">Standalone</span></div>
      </div>

      <!-- Main Form -->
      <form id="studioForm" class="form-stack">
        <div class="field-group">
          <div class="field-header">
            <label class="field-label" for="titleInput">Title</label>
            <span class="field-hint" id="titleHint">Auto-extracted</span>
          </div>
          <input type="text" id="titleInput" class="input-field" placeholder="e.g. Financial Radar Dashboard">
        </div>

        <div class="field-group">
          <div class="field-header">
            <label class="field-label" for="descInput">Changelog Note</label>
            <span class="field-hint">Optional</span>
          </div>
          <input type="text" id="descInput" class="input-field" placeholder="e.g. Added dark mode toggle">
        </div>

        <!-- Advanced Toggle -->
        <div>
          <button type="button" class="advanced-toggle" onclick="toggleAdvanced()">
            <span id="advChevron">&rsaquo;</span>
            <span>Version Target & Access Token</span>
          </button>

          <div class="advanced-drawer" id="advancedDrawer">
            <div class="field-group">
              <label class="field-label" for="idInput">Update Existing UUID-4</label>
              <input type="text" id="idInput" class="input-field input-mono" placeholder="Leave empty for new artifact">
            </div>

            <div class="field-group">
              <label class="field-label" for="tokenInput">Access Token</label>
              <input type="password" id="tokenInput" class="input-field input-mono" placeholder="ARTIFACT_ACCESS_TOKEN">
            </div>
          </div>
        </div>

        <!-- Publish Action -->
        <button type="submit" class="btn-publish" id="publishBtn">
          <span>Publish Artifact</span>
          <span class="kbd-badge">⌘↵</span>
        </button>
      </form>

      <!-- Success Feedback -->
      <div class="success-banner" id="successBanner">
        <div class="success-header">&check; Published to Production</div>
        <a href="#" target="_blank" class="success-link" id="publishedUrlLink"></a>
        <div class="success-actions">
          <button class="btn-secondary" onclick="copyLink()">📋 Copy URL</button>
          <a href="#" target="_blank" class="btn-secondary" id="viewBtn">🚀 Open App &rarr;</a>
        </div>
      </div>

    </div>

    <!-- Right: Live Interactive Sandbox Preview -->
    <div class="preview-pane">
      <div class="preview-toolbar">
        <div class="preview-title-group">
          <span>Live Stage</span>
          <span style="color: var(--text-tertiary);">&bull;</span>
          <span id="previewFilename" style="color: var(--text-primary); font-family: var(--font-mono);">No document loaded</span>
        </div>

        <div class="toolbar-actions">
          <!-- Pop-out Window -->
          <button class="icon-tool-btn" onclick="popoutPreview()" title="Open Preview in Separate Window">
            <span>⤢ Pop Out</span>
          </button>

          <!-- Device Switcher -->
          <div class="device-switcher">
            <button class="device-btn active" id="dev-desktop" onclick="setDevice('desktop')">Desktop</button>
            <button class="device-btn" id="dev-tablet" onclick="setDevice('tablet')">Tablet</button>
            <button class="device-btn" id="dev-mobile" onclick="setDevice('mobile')">Mobile</button>
          </div>
        </div>
      </div>

      <div class="preview-stage">
        <div class="preview-viewport" id="previewViewport">
          <!-- Empty State Placeholder -->
          <div class="empty-preview-state" id="emptyState">
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">Interactive Sandbox Preview</div>
            <div style="font-size: 12px; max-width: 260px;">Drop an HTML file or paste code to see a live working preview before deploying.</div>
          </div>

          <!-- Live Frame -->
          <iframe id="livePreviewFrame" class="preview-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals" style="display: none;" title="Artifact Preview"></iframe>
        </div>
      </div>
    </div>

  </main>

  <!-- Recents Modal -->
  <div class="modal-backdrop" id="recentsModal" onclick="closeModals(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div style="font-weight: 700; font-size: 14px;">Recently Published Artifacts</div>
        <button class="nav-btn" onclick="document.getElementById('recentsModal').style.display='none'">✕</button>
      </div>
      <div id="recentsList">
        <div style="font-size: 12.5px; color: var(--text-tertiary); text-align: center; padding: 20px;">
          No artifacts published from this browser yet.
        </div>
      </div>
    </div>
  </div>

  <!-- Keyboard Shortcuts Modal -->
  <div class="modal-backdrop" id="shortcutsModal" onclick="closeModals(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div style="font-weight: 700; font-size: 14px;">Keyboard Shortcuts</div>
        <button class="nav-btn" onclick="document.getElementById('shortcutsModal').style.display='none'">✕</button>
      </div>
      <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
        <tr style="border-bottom: 1px solid var(--border);"><td style="padding: 8px 0;"><strong>⌘ / Ctrl + Enter</strong></td><td style="text-align: right; color: var(--text-secondary);">Publish Artifact</td></tr>
        <tr style="border-bottom: 1px solid var(--border);"><td style="padding: 8px 0;"><strong>1 / 2 / 3</strong></td><td style="text-align: right; color: var(--text-secondary);">Desktop / Tablet / Mobile View</td></tr>
        <tr style="border-bottom: 1px solid var(--border);"><td style="padding: 8px 0;"><strong>Esc</strong></td><td style="text-align: right; color: var(--text-secondary);">Close Dialogs</td></tr>
      </table>
    </div>
  </div>

  <div class="toast" id="toast">Copied to clipboard</div>

  <script>
    let activeMode = 'file';
    let currentFile = null;
    let currentHtml = '';
    let publishedUrl = '';

    // Initialize Token
    const savedToken = localStorage.getItem('open_artifacts_token') || sessionStorage.getItem('open_artifacts_token') || '';
    if (savedToken) {
      document.getElementById('tokenInput').value = savedToken;
      setTokenStatus(true);
    }

    function setTokenStatus(active) {
      document.getElementById('tokenDisplay').textContent = active ? 'token: active' : 'token: unset';
      document.getElementById('tokenDot').classList.toggle('active', !!active);
    }

    function setMode(mode) {
      activeMode = mode;
      const dropzone = document.getElementById('dropzone');
      const codeWrap = document.getElementById('codeInputWrap');
      const btnFile = document.getElementById('btn-mode-file');
      const btnCode = document.getElementById('btn-mode-code');

      if (mode === 'file') {
        dropzone.style.display = 'block';
        codeWrap.style.display = 'none';
        btnFile.classList.add('active');
        btnCode.classList.remove('active');
      } else {
        dropzone.style.display = 'none';
        codeWrap.style.display = 'flex';
        btnFile.classList.remove('active');
        btnCode.classList.add('active');
      }
    }

    function setDevice(device) {
      const viewport = document.getElementById('previewViewport');
      viewport.className = 'preview-viewport mode-' + device;
      document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('dev-' + device).classList.add('active');
    }

    function toggleAdvanced() {
      const drawer = document.getElementById('advancedDrawer');
      const chevron = document.getElementById('advChevron');
      const isOpen = drawer.classList.toggle('open');
      chevron.innerHTML = isOpen ? '&or;' : '&rsaquo;';
    }

    function promptToken() {
      const current = document.getElementById('tokenInput').value;
      const res = prompt('Enter ARTIFACT_ACCESS_TOKEN:', current);
      if (res !== null) {
        document.getElementById('tokenInput').value = res.trim();
        localStorage.setItem('open_artifacts_token', res.trim());
        setTokenStatus(!!res.trim());
        showToast('Token updated');
      }
    }

    // Drag & Drop
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    ['dragenter', 'dragover'].forEach(n => {
      dropzone.addEventListener(n, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(n => {
      dropzone.addEventListener(n, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        handleFileChange(fileInput);
      }
    });

    function handleFileChange(input) {
      if (input.files && input.files[0]) {
        currentFile = input.files[0];
        const sizeStr = (currentFile.size / 1024).toFixed(1) + ' KB';

        document.getElementById('dropTitle').textContent = currentFile.name;
        document.getElementById('fileChip').textContent = '📄 ' + currentFile.name + ' • ' + sizeStr;
        document.getElementById('fileChip').style.display = 'inline-flex';
        document.getElementById('previewFilename').textContent = currentFile.name;

        const reader = new FileReader();
        reader.onload = (e) => {
          currentHtml = e.target.result;
          renderLivePreview(currentHtml);
          runHealthDiagnostics(currentHtml, currentFile.size);

          // Extract title
          const titleMatch = currentHtml.match(/<title[^>]*>([^<]+)<\\/title>/i);
          if (titleMatch && titleMatch[1]) {
            const extracted = titleMatch[1].trim();
            if (!document.getElementById('titleInput').value) {
              document.getElementById('titleInput').placeholder = extracted;
              document.getElementById('titleHint').textContent = 'Found: "' + extracted + '"';
            }
          }
        };
        reader.readAsText(currentFile);
      }
    }

    function handleCodeChange(code) {
      currentHtml = code;
      const sizeBytes = new Blob([code]).size;
      document.getElementById('charCount').textContent = sizeBytes + ' bytes';
      document.getElementById('previewFilename').textContent = 'pasted-snippet.html';
      renderLivePreview(code);
      runHealthDiagnostics(code, sizeBytes);

      const titleMatch = code.match(/<title[^>]*>([^<]+)<\\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const extracted = titleMatch[1].trim();
        if (!document.getElementById('titleInput').value) {
          document.getElementById('titleInput').placeholder = extracted;
        }
      }
    }

    function renderLivePreview(html) {
      const frame = document.getElementById('livePreviewFrame');
      const emptyState = document.getElementById('emptyState');

      emptyState.style.display = 'none';
      frame.style.display = 'block';
      frame.srcdoc = html;
    }

    function runHealthDiagnostics(html, sizeBytes) {
      const bar = document.getElementById('diagnosticsBar');
      bar.style.display = 'flex';

      // Size
      document.getElementById('diagSize').textContent = (sizeBytes / 1024).toFixed(1) + ' KB';

      // Viewport tag
      const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
      const vpEl = document.getElementById('diagViewport');
      vpEl.textContent = hasViewport ? 'Viewport: OK' : 'Viewport: Missing';
      vpEl.style.color = hasViewport ? 'var(--text-secondary)' : 'var(--warning)';

      // External scripts
      const hasScripts = /<script/i.test(html);
      document.getElementById('diagScripts').textContent = hasScripts ? 'JS Active' : 'Static HTML';
    }

    function popoutPreview() {
      if (!currentHtml) {
        showToast('Load an artifact first');
        return;
      }
      const blob = new Blob([currentHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function formatHtmlCode() {
      const area = document.getElementById('codeArea');
      let val = area.value;
      if (!val) return;
      val = val.trim();
      area.value = val;
      showToast('Formatted code');
    }

    function loadSampleTemplate(type) {
      if (!type) return;
      setMode('code');

      let sample = '';
      let title = '';

      if (type === 'radar') {
        title = 'Interactive Performance Radar';
        sample = '<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta charset="UTF-8">\\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n  <title>Performance Radar</title>\\n  <style>\\n    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }\\n    canvas { background: #1e293b; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }\\n    h2 { margin-bottom: 12px; font-weight: 700; letter-spacing: -0.02em; }\\n  </style>\\n</head>\\n<body>\\n  <h2>📡 Interactive Radar Chart</h2>\\n  <canvas id="radar" width="340" height="340"></canvas>\\n  <script>\\n    const ctx = document.getElementById("radar").getContext("2d");\\n    let angle = 0;\\n    function draw() {\\n      ctx.fillStyle = "rgba(30, 41, 59, 0.2)";\\n      ctx.fillRect(0, 0, 340, 340);\\n      ctx.beginPath();\\n      ctx.arc(170, 170, 120, 0, Math.PI * 2);\\n      ctx.strokeStyle = "#334155";\\n      ctx.stroke();\\n      ctx.beginPath();\\n      ctx.moveTo(170, 170);\\n      ctx.arc(170, 170, 120, angle, angle + 0.3);\\n      ctx.fillStyle = "rgba(56, 189, 248, 0.4)";\\n      ctx.fill();\\n      angle += 0.04;\\n      requestAnimationFrame(draw);\\n    }\\n    draw();\\n  <\\\\/script>\\n</body>\\n</html>';
      } else if (type === 'sphere') {
        title = '3D Canvas Orbit Mesh';
        sample = '<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta charset="UTF-8">\\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n  <title>3D Orbit Mesh</title>\\n  <style>body{margin:0;background:#050505;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif;}</style>\\n</head>\\n<body>\\n  <canvas id="c"></canvas>\\n  <script>\\n    const c = document.getElementById("c"), ctx = c.getContext("2d");\\n    c.width = window.innerWidth; c.height = window.innerHeight;\\n    let t = 0;\\n    function loop() {\\n      ctx.fillStyle = "rgba(5,5,5,0.15)"; ctx.fillRect(0,0,c.width,c.height);\\n      const cx = c.width/2, cy = c.height/2;\\n      for (let i = 0; i < 180; i++) {\\n        const rad = i * 0.1, dist = 140 + Math.sin(t + i*0.05)*40;\\n        const x = cx + Math.cos(rad + t*0.5)*dist;\\n        const y = cy + Math.sin(rad + t*0.3)*dist;\\n        ctx.fillStyle = "hsl(" + (i*2 + t*50) + ", 80%, 65%)";\\n        ctx.fillRect(x, y, 3, 3);\\n      }\\n      t += 0.02; requestAnimationFrame(loop);\\n    }\\n    loop();\\n  <\\\\/script>\\n</body>\\n</html>';
      } else if (type === 'game') {
        title = 'Retro Snake Mini Game';
        sample = '<!DOCTYPE html>\\n<html>\\n<head>\\n  <meta charset="UTF-8">\\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n  <title>Retro Snake</title>\\n  <style>\\n    body { background: #111827; color: #fff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }\\n    canvas { border: 2px solid #374151; background: #000; }\\n  </style>\\n</head>\\n<body>\\n  <h3>🐍 RETRO SNAKE • Arrow Keys to Move</h3>\\n  <canvas id="gc" width="300" height="300"></canvas>\\n  <script>\\n    const cvs = document.getElementById("gc"), ctx = cvs.getContext("2d");\\n    let px=10, py=10, gs=15, tc=20, ax=15, ay=15, xv=0, yv=0, trail=[], tail=5;\\n    window.addEventListener("keydown", (e) => {\\n      if(e.keyCode===37 && xv!==1){xv=-1;yv=0;}\\n      if(e.keyCode===38 && yv!==1){xv=0;yv=-1;}\\n      if(e.keyCode===39 && xv!==-1){xv=1;yv=0;}\\n      if(e.keyCode===40 && yv!==-1){xv=0;yv=1;}\\n    });\\n    setInterval(() => {\\n      px+=xv; py+=yv;\\n      if(px<0)px=tc-1; if(px>tc-1)px=0; if(py<0)py=tc-1; if(py>tc-1)py=0;\\n      ctx.fillStyle="#000"; ctx.fillRect(0,0,cvs.width,cvs.height);\\n      ctx.fillStyle="#10b981";\\n      for(let i=0;i<trail.length;i++){\\n        ctx.fillRect(trail[i].x*gs,trail[i].y*gs,gs-2,gs-2);\\n        if(trail[i].x===px && trail[i].y===py && (xv!==0||yv!==0)) tail=5;\\n      }\\n      trail.push({x:px,y:py});\\n      while(trail.length>tail) trail.shift();\\n      if(ax===px && ay===py){ tail++; ax=Math.floor(Math.random()*tc); ay=Math.floor(Math.random()*tc); }\\n      ctx.fillStyle="#ef4444"; ctx.fillRect(ax*gs,ay*gs,gs-2,gs-2);\\n    }, 1000/12);\\n  <\\\\/script>\\n</body>\\n</html>';
      }

      document.getElementById('codeArea').value = sample;
      document.getElementById('titleInput').value = title;
      handleCodeChange(sample);
      showToast('Loaded ' + title);
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2400);
    }

    function copyLink() {
      if (publishedUrl) {
        navigator.clipboard.writeText(publishedUrl);
        showToast('Link copied to clipboard');
      }
    }

    // Modal Handlers
    function openRecentsModal() {
      renderRecents();
      document.getElementById('recentsModal').style.display = 'flex';
    }

    function openShortcutsModal() {
      document.getElementById('shortcutsModal').style.display = 'flex';
    }

    function closeModals(e) {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    function renderRecents() {
      let list = [];
      try {
        list = JSON.parse(localStorage.getItem('open_artifacts_recents') || '[]');
      } catch (e) { list = []; }
      list = list.filter(item => item && UUID_RE.test(item.id || ''));

      const container = document.getElementById('recentsList');
      if (list.length === 0) {
        container.innerHTML = '<div style="font-size: 12.5px; color: var(--text-tertiary); text-align: center; padding: 20px;">No artifacts published yet.</div>';
        return;
      }

      container.innerHTML = list.map(item => \`
        <div class="recent-item">
          <div>
            <div style="font-weight: 600; font-size: 13px;">\${escapeHtml(item.title || 'Untitled')}</div>
            <div style="font-size: 11px; color: var(--text-secondary); font-family: var(--font-mono);">\${escapeHtml(item.id)} &bull; v\${escapeHtml(item.version)}</div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="nav-btn" data-update-id="\${escapeHtml(item.id)}" title="Bump to next version">Update</button>
            <a href="/a/\${escapeHtml(item.id)}" target="_blank" rel="noopener noreferrer" class="nav-btn">Open &rarr;</a>
          </div>
        </div>
      \`).join('');

      container.querySelectorAll('button[data-update-id]').forEach(btn => {
        btn.addEventListener('click', () => applyUpdateTarget(btn.dataset.updateId));
      });
    }

    function applyUpdateTarget(uuid) {
      document.getElementById('idInput').value = uuid;
      document.getElementById('advancedDrawer').classList.add('open');
      document.getElementById('advChevron').innerHTML = '&or;';
      document.getElementById('recentsModal').style.display = 'none';
      showToast('Set update target: ' + uuid);
    }

    function saveToRecents(item) {
      const recents = JSON.parse(localStorage.getItem('open_artifacts_recents') || '[]');
      const filtered = recents.filter(r => r.id !== item.id);
      filtered.unshift(item);
      localStorage.setItem('open_artifacts_recents', JSON.stringify(filtered.slice(0, 10)));
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
    }

    // Submit Action
    document.getElementById('studioForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = document.getElementById('tokenInput').value.trim();
      const btn = document.getElementById('publishBtn');

      if (!token) {
        promptToken();
        return;
      }

      let fileBlob = null;
      let filename = 'artifact.html';

      if (activeMode === 'file') {
        if (!currentFile) {
          showToast('Please select or drop an HTML file');
          return;
        }
        fileBlob = currentFile;
        filename = currentFile.name;
      } else {
        const code = document.getElementById('codeArea').value.trim();
        if (!code) {
          showToast('Please enter HTML code');
          return;
        }
        fileBlob = new Blob([code], { type: 'text/html' });
      }

      localStorage.setItem('open_artifacts_token', token);
      setTokenStatus(true);

      const formData = new FormData();
      formData.append('file', fileBlob, filename);

      const title = document.getElementById('titleInput').value.trim();
      if (title) formData.append('title', title);

      const desc = document.getElementById('descInput').value.trim();
      if (desc) formData.append('description', desc);

      const id = document.getElementById('idInput').value.trim();
      if (id) formData.append('id', id);

      btn.disabled = true;
      btn.innerHTML = '<span>Publishing...</span>';

      try {
        const res = await fetch('/api/artifacts', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || 'Publish failed');

        publishedUrl = data.url;
        document.getElementById('publishedUrlLink').textContent = data.url;
        document.getElementById('publishedUrlLink').href = data.url;
        document.getElementById('viewBtn').href = data.url;
        document.getElementById('successBanner').style.display = 'block';

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
        btn.disabled = false;
        btn.innerHTML = '<span>Publish Artifact</span><span class="kbd-badge">⌘↵</span>';
      }
    });

    // Check URL parameters for pre-selected update target ID
    const urlParams = new URLSearchParams(window.location.search);
    const updateTarget = urlParams.get('update') || sessionStorage.getItem('open_artifacts_target_id');
    if (updateTarget && UUID_RE.test(updateTarget)) {
      sessionStorage.removeItem('open_artifacts_target_id');
      applyUpdateTarget(updateTarget);
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        document.getElementById('studioForm').requestSubmit();
      }
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === '1') setDevice('desktop');
        if (e.key === '2') setDevice('tablet');
        if (e.key === '3') setDevice('mobile');
      }
      if (e.key === 'Escape') {
        closeModals();
      }
    });
  </script>
</body>
</html>`;
}
