const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Robust context-aware HTML entity escaping for XSS prevention.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates whether a string is a valid RFC 4122 UUID v4.
 * @param {string} uuid
 * @returns {boolean}
 */
export function isValidUuid4(uuid) {
  if (typeof uuid !== 'string') return false;
  return UUID_V4_REGEX.test(uuid.trim());
}

/**
 * Parses and validates positive integer (>= 1). Returns NaN if invalid.
 * @param {unknown} val
 * @returns {number}
 */
export function parsePositiveInt(val) {
  if (val === undefined || val === null) return NaN;
  const num = Number(val);
  if (!Number.isInteger(num) || num < 1) return NaN;
  return num;
}

/**
 * Extracts <title>...</title> or first <h1> from HTML content.
 * Caps parsing window to the first 64KB to avoid ReDoS / CPU spikes on large files.
 * @param {string} htmlContent
 * @param {number} maxLength
 * @returns {string}
 */
export function extractTitleFromHtml(htmlContent, maxLength = 120) {
  if (!htmlContent || typeof htmlContent !== 'string') return 'Untitled Artifact';

  const windowSlice = htmlContent.slice(0, 65536);

  // Try extracting from <title> tag
  const titleMatch = windowSlice.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const cleanTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (cleanTitle.length > 0) {
      return cleanTitle.slice(0, maxLength);
    }
  }

  // Fallback to first <h1>
  const h1Match = windowSlice.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    const cleanH1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
    if (cleanH1.length > 0) {
      return cleanH1.slice(0, maxLength);
    }
  }

  return 'Untitled Artifact';
}

/**
 * Extracts meta description from HTML content.
 * Caps parsing window to the first 64KB to avoid ReDoS / CPU spikes on large files.
 * @param {string} htmlContent
 * @param {number} maxLength
 * @returns {string}
 */
export function extractDescriptionFromHtml(htmlContent, maxLength = 500) {
  if (!htmlContent || typeof htmlContent !== 'string') return '';

  const windowSlice = htmlContent.slice(0, 65536);

  const metaMatch = windowSlice.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["'][^>]*>/i) ||
                    windowSlice.match(/<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["'][^>]*>/i);

  if (metaMatch && metaMatch[1]) {
    const cleanDesc = metaMatch[1].trim();
    return cleanDesc.slice(0, maxLength);
  }

  return '';
}
