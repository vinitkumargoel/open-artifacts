/**
 * Security header sets, ported verbatim from the legacy Express security middleware (since removed).
 */

/**
 * Headers for the Viewer Shell (/a/:uuid, /upload, /, /history).
 * Prevents clickjacking on the viewer chrome itself.
 */
export const VIEWER_SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

/**
 * Headers for Direct / Raw Artifact Streaming (/raw/:uuid/:version).
 * Forces an opaque/null origin sandbox that isolates host cookies and tokens,
 * while permitting embedding inside iframes across Safari, Chrome, and Firefox.
 *
 * frame-ancestors is 'self', not '*': reads are token-gated, so a cross-site
 * embed would 401 anyway (its capability signature is only ever minted for our
 * own shell). Advertising '*' would promise an embed that cannot work.
 */
export const RAW_SANDBOX_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; frame-ancestors 'self'; default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};
