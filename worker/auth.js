/**
 * Publisher token verification for the Worker runtime.
 * Same scheme as the legacy Express auth middleware (since removed): both tokens are pre-hashed to SHA-256
 * (guaranteeing equal-length buffers, eliminating length oracles) and compared
 * in constant time.
 */

async function sha256Bytes(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * @param {string|undefined} providedToken
 * @param {string|undefined} secretToken
 * @returns {Promise<boolean>}
 */
export async function verifyToken(providedToken, secretToken) {
  if (!providedToken || !secretToken || typeof providedToken !== 'string' || typeof secretToken !== 'string') {
    return false;
  }
  const [hashA, hashB] = await Promise.all([
    sha256Bytes(providedToken.trim()),
    sha256Bytes(secretToken.trim())
  ]);
  return timingSafeEqualBytes(hashA, hashB);
}

/**
 * Extracts the access token from Authorization / x-access-token / x-auth-token
 * headers, matching the Express authGuard precedence.
 * @param {Request} request
 * @returns {string|undefined}
 */
export function extractToken(request) {
  const tokenHeader = request.headers.get('x-access-token') || request.headers.get('x-auth-token');
  if (tokenHeader) return tokenHeader;

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return undefined;
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return authHeader.trim();
}
