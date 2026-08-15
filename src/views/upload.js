export function renderUploadHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenArtifacts &bull; Instant Artifact Publisher</title>
  <style>
    :root {
      --bg-canvas: #090d16;
      --bg-surface: #111827;
      --bg-subtle: #1f2937;
      --bg-active: #374151;
      --border: #1f2937;
      --border-focus: #3b82f6;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent: #2563eb;
      --accent-hover: #3b82f6;
      --success: #10b981;
      --danger: #ef4444;
      --radius: 12px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      background: var(--bg-canvas);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 580px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }

    .header-group {
      text-align: center;
      margin-bottom: 24px;
    }

    .brand-logo {
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 20px;
      margin-bottom: 12px;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    }

    .title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .subtitle {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    /* Dropzone */
    .dropzone {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      background: var(--bg-subtle);
      transition: all 0.2s;
      margin-bottom: 20px;
      position: relative;
    }

    .dropzone:hover, .dropzone.dragover {
      border-color: var(--accent);
      background: rgba(37, 99, 235, 0.08);
    }

    .dropzone-icon {
      width: 40px;
      height: 40px;
      color: var(--accent);
      margin-bottom: 8px;
    }

    .file-name-preview {
      font-size: 13px;
      font-weight: 700;
      color: var(--success);
      margin-top: 6px;
      word-break: break-all;
      display: none;
    }

    /* Form Fields */
    .form-group {
      margin-bottom: 16px;
    }

    .label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }

    .input {
      width: 100%;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
    }

    .input:focus {
      border-color: var(--border-focus);
      background: var(--bg-active);
    }

    .btn-submit {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .btn-submit:hover:not(:disabled) {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    /* Results Card */
    .result-box {
      margin-top: 24px;
      background: var(--bg-subtle);
      border: 1px solid var(--success);
      border-radius: var(--radius);
      padding: 18px;
      display: none;
    }

    .result-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--success);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .result-link {
      display: block;
      color: #60a5fa;
      text-decoration: none;
      font-size: 13px;
      word-break: break-all;
      font-family: monospace;
      padding: 8px 12px;
      background: rgba(0,0,0,0.3);
      border-radius: 6px;
      margin: 8px 0;
    }

    .result-link:hover {
      text-decoration: underline;
    }

    .copy-btn-group {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .btn-copy {
      flex: 1;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-primary);
      border-radius: 6px;
      cursor: pointer;
    }
    .btn-copy:hover {
      background: var(--bg-active);
    }

    .error-box {
      margin-top: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid var(--danger);
      color: var(--danger);
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
  </style>
</head>
<body>

  <div class="container">
    <div class="header-group">
      <div class="brand-logo">&lambda;</div>
      <h1 class="title">OpenArtifacts Publisher</h1>
      <p class="subtitle">Publish and version standalone interactive HTML artifacts</p>
    </div>

    <form id="uploadForm">
      <!-- File Dropzone -->
      <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
        <svg class="dropzone-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
        <div style="font-size: 14px; font-weight: 700;">Drop HTML artifact here or click to browse</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Supports standalone HTML files (CSS, JS, Canvas, React) up to 25MB</div>
        <div class="file-name-preview" id="fileNamePreview"></div>
        <input type="file" id="fileInput" name="file" accept=".html,.htm" style="display: none;" onchange="handleFileSelected(this)">
      </div>

      <!-- Title Input -->
      <div class="form-group">
        <label class="label" for="titleInput">Artifact Title (Optional)</label>
        <input type="text" id="titleInput" class="input" placeholder="e.g. Real-Time Radar Map (Auto-extracted from HTML if empty)">
      </div>

      <!-- Description Input -->
      <div class="form-group">
        <label class="label" for="descInput">Description / Version Note (Optional)</label>
        <input type="text" id="descInput" class="input" placeholder="e.g. Added responsive radar charts & dark theme">
      </div>

      <!-- Optional Existing ID to update -->
      <div class="form-group">
        <label class="label" for="idInput">Update Existing UUID-4 (Optional)</label>
        <input type="text" id="idInput" class="input" placeholder="Leave empty for new artifact, or paste UUID to create next version">
      </div>

      <!-- Access Token -->
      <div class="form-group">
        <label class="label" for="tokenInput">Access Token *</label>
        <input type="password" id="tokenInput" class="input" placeholder="Enter ARTIFACT_ACCESS_TOKEN" required>
      </div>

      <button type="submit" class="btn-submit" id="submitBtn">
        <span>🚀 Publish Artifact</span>
      </button>
    </form>

    <div class="error-box" id="errorBox" role="alert"></div>

    <div class="result-box" id="resultBox">
      <div class="result-title">&check; Artifact Successfully Published!</div>
      <div style="font-size: 12px; color: var(--text-secondary);">Public Viewer URL:</div>
      <a href="#" target="_blank" class="result-link" id="resultUrl"></a>
      <div class="copy-btn-group">
        <button class="btn-copy" onclick="copyResultUrl()">🔗 Copy Viewer Link</button>
        <button class="btn-copy" onclick="openResultUrl()">🚀 Open in Browser</button>
      </div>
    </div>
  </div>

  <script>
    // Remember token in sessionStorage
    const savedToken = sessionStorage.getItem('open_artifacts_token') || localStorage.getItem('open_artifacts_token');
    if (savedToken) {
      document.getElementById('tokenInput').value = savedToken;
    }

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileNamePreview = document.getElementById('fileNamePreview');

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      }, false);
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        fileInput.files = files;
        handleFileSelected(fileInput);
      }
    });

    function handleFileSelected(input) {
      if (input.files && input.files[0]) {
        fileNamePreview.textContent = '📄 ' + input.files[0].name + ' (' + (input.files[0].size / 1024).toFixed(1) + ' KB)';
        fileNamePreview.style.display = 'block';
      }
    }

    let currentPublishedUrl = '';

    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const errorBox = document.getElementById('errorBox');
      const resultBox = document.getElementById('resultBox');
      const submitBtn = document.getElementById('submitBtn');

      errorBox.style.display = 'none';
      resultBox.style.display = 'none';

      if (!fileInput.files || fileInput.files.length === 0) {
        errorBox.textContent = 'Please select or drop an HTML file to upload.';
        errorBox.style.display = 'block';
        return;
      }

      const token = document.getElementById('tokenInput').value.trim();
      if (!token) {
        errorBox.textContent = 'Please provide an Access Token.';
        errorBox.style.display = 'block';
        return;
      }

      // Store token
      sessionStorage.setItem('open_artifacts_token', token);

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      const title = document.getElementById('titleInput').value.trim();
      if (title) formData.append('title', title);

      const desc = document.getElementById('descInput').value.trim();
      if (desc) formData.append('description', desc);

      const existingId = document.getElementById('idInput').value.trim();
      if (existingId) formData.append('id', existingId);

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Uploading & Publishing...';

      try {
        const res = await fetch('/api/artifacts', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token
          },
          body: formData
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message || 'Failed to upload artifact (' + res.status + ')');
        }

        currentPublishedUrl = data.url;
        const resultUrlEl = document.getElementById('resultUrl');
        resultUrlEl.href = data.url;
        resultUrlEl.textContent = data.url;

        resultBox.style.display = 'block';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Publish Artifact';
      }
    });

    function copyResultUrl() {
      if (currentPublishedUrl) {
        navigator.clipboard.writeText(currentPublishedUrl).then(() => {
          alert('🔗 Copied viewer link to clipboard!');
        });
      }
    }

    function openResultUrl() {
      if (currentPublishedUrl) {
        window.open(currentPublishedUrl, '_blank');
      }
    }
  </script>
</body>
</html>`;
}
