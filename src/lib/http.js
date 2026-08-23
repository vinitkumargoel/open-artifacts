/**
 * Shared request/response helpers for the Astro endpoints and pages.
 * Ported from the legacy Hono worker (since removed): same config resolution, same
 * error envelope, same HTML error page markup.
 */
import { env } from 'cloudflare:workers';
import { verifyToken, extractToken } from '../../worker/auth.js';
import { VIEWER_SECURITY_HEADERS } from '../../worker/headers.js';

function intVar(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig() {
  return {
    maxFileSizeMb: intVar(env.MAX_FILE_SIZE_MB, 25),
    uploadRateLimitPerMin: intVar(env.UPLOAD_RATE_LIMIT_PER_MIN, 30),
    readRateLimitPerMin: intVar(env.READ_RATE_LIMIT_PER_MIN, 500),
    accessToken: env.ARTIFACT_ACCESS_TOKEN || '',
    nodeEnv: env.NODE_ENV || 'production'
  };
}

export function baseUrl(request) {
  return (env.BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
}

export function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

export function jsonError(code, message, status) {
  return json({ error: { code, message, status } }, { status });
}

export function htmlErrorPage(status, heading, body) {
  const html = `
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>${heading}</h2>
          <p style="color:#94a3b8;">${body}</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Back to Upload</a>
        </body></html>
      `;
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8', ...VIEWER_SECURITY_HEADERS }
  });
}

/**
 * Discards an unread request body chunk-by-chunk (no buffering). Responding
 * before the body is consumed is fine on deployed workerd, but wrangler dev's
 * ProxyWorker treats the resulting half-closed connection as fatal ("Network
 * connection lost") and kills the dev server, so every early rejection of a
 * body-carrying request must drain first.
 *
 * The drain is capped at the upload size limit (plus slack) so an
 * unauthenticated client can never make the Worker read more bytes than a
 * legitimate upload would; past the cap the stream is cancelled instead.
 */
export async function drainBody(request) {
  try {
    if (request.body) {
      const maxBytes = getConfig().maxFileSizeMb * 1024 * 1024 + 64 * 1024;
      let seen = 0;
      const reader = request.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        seen += value.byteLength;
        if (seen > maxBytes) {
          await reader.cancel();
          break;
        }
      }
    }
  } catch (err) {
    // Body already consumed or the client hung up — nothing left to drain.
    console.debug('[drainBody] drain failed:', err);
  }
}

/**
 * Publisher token guard, mirroring the Hono authGuard. Returns an error
 * Response when the request must be rejected, or null to proceed.
 */
export async function authGuard(request) {
  const config = getConfig();
  if (!config.accessToken) {
    await drainBody(request);
    return jsonError('AUTH_NOT_CONFIGURED',
      'Server ARTIFACT_ACCESS_TOKEN is not configured in environment variables.', 500);
  }
  const ok = await verifyToken(extractToken(request), config.accessToken);
  if (!ok) {
    await drainBody(request);
    return jsonError('UNAUTHORIZED',
      'Unauthorized. Missing or invalid access token. Provide a valid Authorization: Bearer <token> or x-access-token header.', 401);
  }
  return null;
}

/**
 * Application error mapping, mirroring the Hono app.onError handler. Must never
 * throw itself, even for `throw null` / non-Error values.
 */
export function mapError(err) {
  const config = getConfig();
  const code = err?.code;
  const message = err?.message;

  const known = {
    INVALID_FILE_TYPE: [400, message || 'Invalid file type. Only standalone HTML files (.html, .htm) are supported.'],
    INVALID_UUID_FORMAT: [400, 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.'],
    ARTIFACT_NOT_FOUND: [404, message || 'Artifact not found.'],
    VERSION_NOT_FOUND: [404, message || 'The requested artifact version does not exist.'],
    UNAUTHORIZED: [401, message || 'Unauthorized access.']
  };

  if (code && known[code]) {
    const [status, knownMessage] = known[code];
    return jsonError(code, knownMessage, status);
  }

  console.error('[OpenArtifacts Error]', err);
  return jsonError('INTERNAL_SERVER_ERROR',
    config.nodeEnv === 'production' ? 'An internal server error occurred.' : String(message ?? err), 500);
}

/**
 * The Hono app.notFound response: HTML for browser-ish clients (missing Accept
 * or wildcard included, matching Express req.accepts('html')), JSON error
 * envelope otherwise. Shared by the catch-all route and the middleware's
 * trailing-slash handling.
 */
export function notFoundResponse(request) {
  const accept = request.headers.get('accept');
  if (!accept || accept.includes('text/html') || accept.includes('*/*')) {
    return new Response(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>404 &bull; Page Not Found</h2>
          <p style="color:#94a3b8;">The requested page could not be found.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Go to Upload Portal</a>
        </body></html>
      `, { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } });
  }
  return jsonError('NOT_FOUND', `Cannot ${request.method} ${new URL(request.url).pathname}`, 404);
}
