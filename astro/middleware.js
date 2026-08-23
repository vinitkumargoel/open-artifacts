/**
 * Cross-cutting middleware for every Astro-served route, mirroring the Hono
 * worker's global middleware stack in order:
 *
 *   1. CORS (hono/cors with origin '*', methods GET/POST/DELETE/OPTIONS) —
 *      preflight OPTIONS short-circuits with 204 before anything else runs.
 *   2. Per-visitor rate limiting on the exact route/method pairs the Hono app
 *      guarded (read scope on pages/raw/API GETs, upload scope on the publish
 *      POST). 404s, /healthz, and delete routes are not limited — same as Hono,
 *      where the limiter was attached per-route rather than globally.
 *   3. Baseline hardening headers on every response (Helmet defaults), only
 *      where a route hasn't already set the header.
 */
import { env } from 'cloudflare:workers';
import { checkRateLimit } from '../worker/ratelimit.js';
import { getConfig, jsonError, mapError } from './lib/http.js';

const BASELINE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Permitted-Cross-Domain-Policies': 'none'
};

/**
 * Which rate-limit scope (if any) applies, matching the Hono route table.
 * Hono's `:param` matches exactly one non-empty path segment, so the regexes
 * do too — /a/x/y or /raw/x/y/z fell through to the (unlimited) 404 handler.
 */
function limiterScope(method, path) {
  if (method === 'POST') {
    return path === '/api/artifacts' ? 'upload' : null;
  }
  if (method !== 'GET') return null;
  if (path === '/' || path === '/upload' || path === '/history') return 'read';
  if (/^\/a\/[^/]+(\/v\/[^/]+)?$/.test(path)) return 'read';
  if (/^\/raw\/[^/]+(\/[^/]+)?$/.test(path)) return 'read';
  if (path === '/api/artifacts') return 'read';
  if (/^\/api\/artifacts\/[^/]+$/.test(path)) return 'read';
  return null;
}

function finalize(response, rateHeaders) {
  const res = new Response(response.body, response);
  if (rateHeaders) {
    for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
  }
  for (const [k, v] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }
  res.headers.set('Access-Control-Allow-Origin', '*');
  return res;
}

export async function onRequest(context, next) {
  const request = context.request;
  const { pathname } = new URL(request.url);

  // CORS preflight, mirroring hono/cors: 204, no baseline headers (in the
  // Hono stack the header middleware was registered after cors, so preflight
  // responses never received them).
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
    });
    const requestHeaders = request.headers.get('Access-Control-Request-Headers');
    if (requestHeaders) {
      headers.set('Access-Control-Allow-Headers',
        requestHeaders.split(',').map((h) => h.trim()).join(','));
      headers.append('Vary', 'Access-Control-Request-Headers');
    }
    return new Response(null, { status: 204, statusText: 'No Content', headers });
  }

  const scope = limiterScope(request.method, pathname);
  let rateHeaders = null;
  if (scope) {
    const config = getConfig();
    const limit = scope === 'upload' ? config.uploadRateLimitPerMin : config.readRateLimitPerMin;
    const verdict = await checkRateLimit({ request, env, scope, limit });

    rateHeaders = {
      'RateLimit-Limit': String(verdict.limit),
      'RateLimit-Remaining': String(verdict.remaining),
      'RateLimit-Reset': String(verdict.resetSeconds)
    };

    if (!verdict.allowed) {
      const message = scope === 'upload'
        ? `Upload rate limit exceeded. Max ${limit} uploads per minute.`
        : `Read rate limit exceeded. Max ${limit} requests per minute.`;
      rateHeaders['Retry-After'] = String(verdict.resetSeconds);
      return finalize(jsonError('RATE_LIMITED', message, 429), rateHeaders);
    }
  }

  let response;
  try {
    response = await next();
  } catch (err) {
    // Endpoints map their own storage errors; this is the last-resort
    // equivalent of Hono's app.onError.
    response = mapError(err);
  }

  return finalize(response, rateHeaders);
}
