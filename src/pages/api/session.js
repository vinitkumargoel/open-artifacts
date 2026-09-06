/**
 * POST /api/session   — exchange the publisher token for a read-scope cookie.
 * DELETE /api/session — drop that cookie.
 *
 * This is the only way a browser can read artifacts: an <iframe> navigation
 * cannot carry an Authorization header, so a localStorage-only scheme would
 * never reach the artifact bytes. The token is verified once here and never
 * placed in the cookie — see worker/session.js for what the cookie actually
 * contains, and why it is read-scope only.
 *
 * The route is deliberately outside the read gate (it is how you get past it)
 * but inside the `session` rate-limit scope, and its failures feed the
 * instance-wide backstop from src/middleware.js.
 */
import { verifyToken, extractToken } from '../../../worker/auth.js';
import { mintSession, sessionCookieHeader, clearSessionCookieHeader } from '../../../worker/session.js';
import { getConfig, json, jsonError, drainBody } from '../../lib/http.js';

export const prerender = false;

export async function POST({ request }) {
  const config = getConfig();

  // Body-carrying request: drain before every early return, or wrangler dev's
  // ProxyWorker kills the dev server on the half-closed connection.
  if (!config.accessToken) {
    await drainBody(request);
    return jsonError('AUTH_NOT_CONFIGURED',
      'Server ARTIFACT_ACCESS_TOKEN is not configured in environment variables.', 500);
  }

  const ok = await verifyToken(extractToken(request), config.accessToken);
  await drainBody(request);

  if (!ok) {
    const denied = jsonError('UNAUTHORIZED',
      'Unauthorized. Send the access token as "Authorization: Bearer <token>".', 401);
    denied.headers.set('Cache-Control', 'no-store');
    return denied;
  }

  const minted = await mintSession(config.accessToken, { epoch: config.sessionEpoch });
  return json({
    success: true,
    expiresAt: new Date(minted.expiresAt).toISOString()
  }, {
    headers: {
      'Set-Cookie': sessionCookieHeader(minted.value, minted.maxAge),
      'Cache-Control': 'no-store'
    }
  });
}

export async function DELETE({ request }) {
  await drainBody(request);
  return json({ success: true, message: 'Session cleared.' }, {
    headers: {
      'Set-Cookie': clearSessionCookieHeader(),
      'Cache-Control': 'no-store'
    }
  });
}
