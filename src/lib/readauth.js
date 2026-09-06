/**
 * Read-scope gate: which routes need a token to *read*, what counts as proof,
 * and what a rejection looks like.
 *
 * Writes are unaffected — they keep going through authGuard() in ./http.js,
 * which accepts nothing but an explicit header. Keeping the two guards separate
 * is the whole point: the session cookie below is sent on same-site subresource
 * requests made from inside a published artifact, and `security: { checkOrigin:
 * false }` means Astro will not stop them, so a cookie that authGuard honoured
 * would make every artifact a delete-everything CSRF weapon.
 */
import { verifyToken, extractToken } from '../../worker/auth.js';
import {
  SESSION_COOKIE,
  readCookie,
  verifySession,
  verifyRawCapability,
  signRawCapability
} from '../../worker/session.js';
import { getConfig, jsonError } from './http.js';

const RAW_VERSION_PATH = /^\/raw\/([^/]+)\/([^/]+)$/;

/**
 * Classifies a request as read-gated or not.
 *
 * Gating is by PATH, not method: `HEAD /raw/:uuid/:n` left open would be a
 * 200-vs-404 existence oracle over the whole catalogue, and `/raw/:uuid`
 * (the versionless redirect) leaks both existence and the latest version
 * number in its Location header.
 *
 * Open by design: `/`, `/upload` and `/unlock` are where a token is entered,
 * so gating them would lock the owner out of the unlock UI; `/healthz` is a
 * liveness probe; `/api/session` is the unlock endpoint itself. None of them
 * carry artifact data.
 *
 * @param {string} method
 * @param {string} path
 * @returns {'raw'|'page'|'api'|null}
 */
export function readGate(method, path) {
  // Writes are guarded by authGuard() at the endpoint, which never accepts a
  // cookie. Routing them through here as well would undo that separation.
  if (method !== 'GET' && method !== 'HEAD') return null;

  if (path === '/raw' || path.startsWith('/raw/')) return 'raw';
  if (path === '/a' || path.startsWith('/a/')) return 'page';
  if (path === '/history') return 'page';
  if (path === '/api/artifacts' || path.startsWith('/api/artifacts/')) return 'api';
  return null;
}

/**
 * Decides whether a read may proceed. Three proofs are accepted, in the order
 * they are cheapest to present:
 *
 *   1. `Authorization: Bearer` / `x-access-token` — CLI, curl, agents.
 *   2. A capability signature on `/raw/:uuid/:version` — the only proof a
 *      sandboxed iframe can carry (see worker/session.js).
 *   3. The `oa_session` cookie — browsers, after unlocking once.
 *
 * @returns {Promise<{ok: boolean, renew?: boolean, unconfigured?: boolean}>}
 */
export async function isReadAuthorized(request, url, gate) {
  const config = getConfig();
  const secret = config.accessToken;
  if (!secret) return { ok: false, unconfigured: true };

  const headerToken = extractToken(request);
  if (headerToken && await verifyToken(headerToken, secret)) {
    return { ok: true };
  }

  if (gate === 'raw') {
    const match = RAW_VERSION_PATH.exec(url.pathname);
    if (match) {
      const signed = await verifyRawCapability(secret, {
        uuid: match[1],
        version: match[2],
        exp: url.searchParams.get('exp'),
        sig: url.searchParams.get('sig'),
        epoch: config.sessionEpoch
      });
      if (signed) return { ok: true };
    }
  }

  const cookie = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (cookie) {
    const verdict = await verifySession(cookie, secret, { epoch: config.sessionEpoch });
    if (verdict.valid) return { ok: true, renew: verdict.shouldRenew };
  }

  return { ok: false };
}

/**
 * True when the rejection should be a redirect a human can act on rather than
 * a JSON envelope.
 *
 * Sec-Fetch-Dest is exact where it exists, and it is the only way to tell a
 * top-level navigation from an iframe load — which matters because bouncing a
 * frame to /unlock is useless: at its opaque origin localStorage throws and
 * there is no allow-top-navigation to escape with.
 */
function wantsDocument(request, gate) {
  const dest = request.headers.get('sec-fetch-dest');
  if (dest) return dest === 'document';
  // Pre-16.4 Safari sends no Sec-Fetch-Dest. Guessing from Accept is fine for
  // shell pages; for /raw the cost of guessing wrong is a dead frame, so don't.
  if (gate === 'raw') return false;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

const UNAUTHORIZED_MESSAGE =
  'Unauthorized. This server requires an access token to read artifacts. '
  + 'Send "Authorization: Bearer <ARTIFACT_ACCESS_TOKEN>", or unlock this browser at /unlock.';

/**
 * The rejection itself. Always `no-store`: a cached 401 would survive the
 * unlock that fixes it, and a cached redirect would outlive the session.
 */
export function unauthorizedRead(request, url, gate) {
  if (wantsDocument(request, gate)) {
    const next = url.pathname + (url.search || '');
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/unlock?next=${encodeURIComponent(next)}`,
        'Cache-Control': 'no-store'
      }
    });
  }

  const res = jsonError('UNAUTHORIZED', UNAUTHORIZED_MESSAGE, 401);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * Mints one capability query string per version so a shell page can hand its
 * <iframe> a URL that authenticates itself.
 *
 * Signing is a handful of HMACs over a memoised subkey, so doing every version
 * up front costs less than the R2 read the page has already done, and it means
 * the client-side version switcher never has to round-trip for a new URL.
 *
 * @param {string} uuid
 * @param {number[]} versionNumbers
 * @returns {Promise<Record<number, string>>} version -> "exp=...&sig=..." ('' when gating is off)
 */
export async function signVersionUrls(uuid, versionNumbers) {
  const config = getConfig();
  const out = {};

  if (!config.readAuthEnabled || !config.accessToken) {
    for (const n of versionNumbers) out[n] = '';
    return out;
  }

  const signed = await Promise.all(versionNumbers.map(n => signRawCapability(config.accessToken, {
    uuid,
    version: n,
    epoch: config.sessionEpoch
  })));
  versionNumbers.forEach((n, i) => { out[n] = signed[i]; });
  return out;
}
