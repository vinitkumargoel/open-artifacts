/**
 * Security headers for the Viewer Shell (/a/:uuid, /upload, /)
 * Prevents clickjacking on the viewer chrome itself.
 */
export function viewerSecurityHeaders(req, res, next) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none';");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/**
 * Security headers for Direct / Raw Artifact Streaming (/raw/:uuid/:version)
 * Forces an opaque/null origin sandbox that isolates host cookies and tokens,
 * while permitting embedding inside iframes across Safari, Chrome, and Firefox.
 */
export function rawSandboxHeaders(req, res, next) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; frame-ancestors *; default-src * \'unsafe-inline\' \'unsafe-eval\' data: blob:;');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}
