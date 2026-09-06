/**
 * Cross-cutting middleware for every Astro-served route, mirroring the Hono
 * worker's global middleware stack in order:
 *
 *   1. CORS (hono/cors with origin '*', methods GET/POST/PATCH/DELETE/OPTIONS) —
 *      preflight OPTIONS short-circuits with 204 before anything else runs.
 *   2. Trailing-slash 404 (never a redirect).
 *   3. The read gate: routes that expose artifact data require a token, a
 *      capability signature, or a session cookie. It runs BEFORE the read
 *      limiter on purpose — see the comment on the gate below.
 *   4. Per-visitor rate limiting on the exact route/method pairs the Hono app
 *      guarded, plus deletes and the session endpoint (both were unlimited
 *      token oracles). 404s and /healthz stay unlimited.
 *   5. Baseline hardening headers on every response (Helmet defaults), only
 *      where a route hasn't already set the header.
 */
import { env } from 'cloudflare:workers';
import { checkRateLimit, checkGlobalRateLimit } from '../worker/ratelimit.js';
import { sessionCookieHeader, mintSession, SESSION_TTL_SECONDS } from '../worker/session.js';
import { getConfig, jsonError, mapError, drainBody, notFoundResponse } from './lib/http.js';
import { readGate, isReadAuthorized, unauthorizedRead } from './lib/readauth.js';

const BASELINE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Permitted-Cross-Domain-Policies': 'none'
};

/**
 * Which rate-limit scope (if any) applies.
 *
 * Hono's `:param` matches exactly one non-empty path segment, so the read
 * regexes do too — /a/x/y or /raw/x/y/z fell through to the (unlimited) 404
 * handler, and still do.
 */
function limiterScope(method, path) {
  if (method === 'POST') {
    if (path === '/api/artifacts') return 'upload';
    // Bulk delete was unlimited, which made it a free token oracle: a bad
    // token 401s and a good one reports per-id results.
    if (path === '/api/artifacts/bulk-delete') return 'upload';
    if (path === '/api/session') return 'session';
    return null;
  }
  // PATCH (retention changes) is a write to R2 like a publish, so it shares the
  // upload budget.
  if (method === 'PATCH') {
    return /^\/api\/artifacts\/[^/]+$/.test(path) ? 'upload' : null;
  }
  if (method === 'DELETE') {
    if (path === '/api/session') return 'session';
    // Same oracle as bulk-delete: 401 vs 404 distinguishes a wrong token from
    // an unknown UUID, and this route used to be entirely unthrottled.
    return /^\/api\/artifacts\/[^/]+$/.test(path) ? 'upload' : null;
  }
  // Hono dispatches HEAD through the matched GET route, so its read limiter
  // counted HEAD traffic too; without this, HEAD would be an unthrottled way
  // to force full R2 reads (Astro runs the GET handler and strips the body).
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (path === '/' || path === '/upload' || path === '/history' || path === '/unlock') return 'read';
  if (/^\/a\/[^/]+(\/v\/[^/]+|\/diff)?$/.test(path)) return 'read';
  if (/^\/raw\/[^/]+(\/[^/]+)?$/.test(path)) return 'read';
  if (path === '/api/artifacts') return 'read';
  if (/^\/api\/artifacts\/[^/]+$/.test(path)) return 'read';
  return null;
}

function limitFor(scope, config) {
  if (scope === 'upload') return config.uploadRateLimitPerMin;
  if (scope === 'session') return config.sessionRateLimitPerMin;
  return config.readRateLimitPerMin;
}

function limitMessage(scope, limit) {
  if (scope === 'upload') return `Upload rate limit exceeded. Max ${limit} uploads per minute.`;
  if (scope === 'session') return `Too many unlock attempts. Max ${limit} per minute.`;
  return `Read rate limit exceeded. Max ${limit} requests per minute.`;
}

function finalize(response, rateHeaders, options = {}) {
  const res = new Response(response.body, response);
  if (rateHeaders) {
    for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
  }
  for (const [k, v] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }
  // Read-gated routes get no CORS grant at all. A wildcard there would be a
  // lie — it can never be combined with credentials — and advertising it
  // suggests a cross-origin read path that does not exist. Everything else
  // (health, shells, the write API used by curl and agents) keeps the '*' the
  // legacy worker set unconditionally. Allow-Credentials is never emitted.
  if (!options.noCors) res.headers.set('Access-Control-Allow-Origin', '*');
  if (options.setCookie) res.headers.append('Set-Cookie', options.setCookie);
  return res;
}

export async function onRequest(context, next) {
  const request = context.request;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CORS preflight, mirroring hono/cors: 204, no baseline headers (in the
  // Hono stack the header middleware was registered after cors, so preflight
  // responses never received them).
  if (request.method === 'OPTIONS') {
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    });
    const requestHeaders = request.headers.get('Access-Control-Request-Headers');
    if (requestHeaders) {
      headers.set('Access-Control-Allow-Headers',
        requestHeaders.split(',').map((h) => h.trim()).join(','));
      headers.append('Vary', 'Access-Control-Request-Headers');
    }
    return new Response(null, { status: 204, statusText: 'No Content', headers });
  }

  // Astro's trailingSlash handling would otherwise redirect `/upload/` &c.
  // before this middleware runs, but Hono's strict router 404'd trailing-slash
  // variants like any other unmatched route — same body, same headers, no
  // redirect, and (like Hono 404s) no rate limiting.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    await drainBody(request);
    return finalize(notFoundResponse(request), null);
  }

  const config = getConfig();
  const gate = readGate(request.method, pathname);
  const gateActive = gate !== null && config.readAuthEnabled;
  let renewCookie = null;

  if (gateActive) {
    const verdict = await isReadAuthorized(request, url, gate);

    if (!verdict.ok) {
      // Rejections are counted against their own budgets, never the read one:
      // otherwise a crawler hammering 401s would 429 every legitimate visitor
      // sharing its NAT. This is also why the gate runs before the limiter.
      const throttled = await countAuthFailure(request, config);
      if (throttled) {
        await drainBody(request);
        return finalize(throttled.response, throttled.headers, { noCors: true });
      }

      await drainBody(request);
      const response = verdict.unconfigured
        ? jsonError('AUTH_NOT_CONFIGURED',
          'Server ARTIFACT_ACCESS_TOKEN is not configured in environment variables.', 500)
        : unauthorizedRead(request, url, gate);
      return finalize(response, null, { noCors: true });
    }

    if (verdict.renew) {
      // Sliding window: an active browser is re-issued a full-length cookie
      // once it passes its half-life, so a session in daily use never lapses.
      try {
        const minted = await mintSession(config.accessToken, {
          epoch: config.sessionEpoch,
          ttlSeconds: SESSION_TTL_SECONDS
        });
        renewCookie = sessionCookieHeader(minted.value, minted.maxAge);
      } catch (err) {
        // A failed renewal is cosmetic — the existing cookie is still valid.
        console.error('[readauth] session renewal failed', err);
      }
    }
  }

  const scope = limiterScope(request.method, pathname);
  let rateHeaders = null;
  if (scope) {
    const limit = limitFor(scope, config);
    let verdict;
    try {
      verdict = await checkRateLimit({ request, env, scope, limit });
    } catch (err) {
      // A Durable Object failure must still produce the standard error
      // envelope with CORS + baseline headers (Hono's app.onError did).
      await drainBody(request);
      return finalize(mapError(err), null, { noCors: gateActive });
    }

    rateHeaders = {
      'RateLimit-Limit': String(verdict.limit),
      'RateLimit-Remaining': String(verdict.remaining),
      'RateLimit-Reset': String(verdict.resetSeconds)
    };

    if (!verdict.allowed) {
      rateHeaders['Retry-After'] = String(verdict.resetSeconds);
      await drainBody(request);
      return finalize(jsonError('RATE_LIMITED', limitMessage(scope, limit), 429), rateHeaders,
        { noCors: gateActive });
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

  // A rejected unlock attempt is a credential guess like any other, so feed it
  // into the same instance-wide window the read gate enforces. Otherwise an
  // attacker just aims at /api/session and skips the backstop entirely.
  if (pathname === '/api/session' && request.method === 'POST' && response.status === 401) {
    await countAuthFailure(request, config);
  }

  return finalize(response, rateHeaders, { noCors: gateActive, setCookie: renewCookie });
}

/**
 * Records one authentication failure against the per-visitor `session` budget
 * and the instance-wide backstop.
 *
 * Per-visitor limiting alone does nothing against a distributed attacker —
 * every source address gets its own uncontended Durable Object and therefore
 * its own full budget — so the global counter is the one that actually bounds
 * guesses per minute. It is fed by failures only, so ordinary traffic never
 * touches it.
 *
 * @returns {Promise<{response: Response, headers: object}|null>} a 429 to send
 *   instead of the 401, or null to carry on with the normal rejection.
 */
async function countAuthFailure(request, config) {
  let verdict;
  try {
    verdict = await checkRateLimit({
      request,
      env,
      scope: 'session',
      limit: config.sessionRateLimitPerMin
    });
  } catch (err) {
    // The limiter being down must not turn a 401 into a 500.
    console.error('[readauth] per-visitor failure counter unavailable', err);
    return null;
  }

  const headers = {
    'RateLimit-Limit': String(verdict.limit),
    'RateLimit-Remaining': String(verdict.remaining),
    'RateLimit-Reset': String(verdict.resetSeconds)
  };

  if (!verdict.allowed) {
    headers['Retry-After'] = String(verdict.resetSeconds);
    return {
      response: jsonError('RATE_LIMITED', limitMessage('session', verdict.limit), 429),
      headers
    };
  }

  if (config.authFailureLimitPerMin > 0) {
    try {
      const global = await checkGlobalRateLimit({
        env,
        scope: 'authfail',
        limit: config.authFailureLimitPerMin
      });
      if (!global.allowed) {
        headers['Retry-After'] = String(global.resetSeconds);
        return {
          response: jsonError('RATE_LIMITED',
            'Too many failed authentication attempts against this server. Try again shortly.', 429),
          headers
        };
      }
    } catch (err) {
      console.error('[readauth] global failure counter unavailable', err);
    }
  }

  return null;
}
