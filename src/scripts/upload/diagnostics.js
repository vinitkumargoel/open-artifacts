/**
 * Document health analysis for Studio Publisher
 */

export function runHealthDiagnostics(html, sizeBytes) {
  const bar = document.getElementById('diagnosticsBar');
  if (!bar) return;
  bar.style.display = 'flex';

  // Size
  const sizeEl = document.getElementById('diagSize');
  if (sizeEl) sizeEl.textContent = (sizeBytes / 1024).toFixed(1) + ' KB';

  // Viewport tag
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const vpEl = document.getElementById('diagViewport');
  if (vpEl) {
    vpEl.textContent = hasViewport ? 'Viewport: OK' : 'Viewport: Missing';
    vpEl.style.color = hasViewport ? 'var(--text-secondary)' : 'var(--warning)';
  }

  // External scripts
  const hasScripts = /<script/i.test(html);
  const scriptEl = document.getElementById('diagScripts');
  if (scriptEl) {
    scriptEl.textContent = hasScripts ? 'JS Active' : 'Static HTML';
  }

  // Inline base64 assets
  let dataBytes = 0;
  const dataUri = /data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
  let match;
  while ((match = dataUri.exec(html)) !== null) dataBytes += match[0].length;

  const assetsWrap = document.getElementById('diagAssetsWrap');
  if (assetsWrap) {
    if (dataBytes > 0 && sizeBytes > 0) {
      const pct = Math.round((dataBytes / sizeBytes) * 100);
      const el = document.getElementById('diagAssets');
      if (el) el.textContent = (dataBytes / 1024).toFixed(0) + ' KB inline (' + pct + '%)';
      assetsWrap.classList.toggle('warn', pct >= 40 || dataBytes > 1024 * 1024);
      assetsWrap.title = 'Base64 data: URIs account for ' + (dataBytes / 1024).toFixed(0)
        + ' KB of this artifact. Every version stores its own copy.';
      assetsWrap.style.display = 'flex';
    } else {
      assetsWrap.style.display = 'none';
    }
  }
}
