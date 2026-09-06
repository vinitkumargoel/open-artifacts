/**
 * Read-scope authentication primitives: the browser session cookie and the
 * short-lived capability signatures that let a sandboxed <iframe> load /raw.
 *
 * Both are stateless HMACs — no KV, no DO, no storage. Two properties matter:
 *
 *  1. The signing key is never the bearer token. Both key materials are HKDF
 *     subkeys of ARTIFACT_ACCESS_TOKEN under distinct `info` labels, so a
 *     leaked cookie or capability URL cannot be replayed as a publisher token,
 *     and the two cannot be swapped for each other.
 *  2. SESSION_EPOCH is folded into the HKDF salt. Bumping it invalidates every
 *     outstanding cookie and capability URL without rotating the token itself,
 *     which would break every CLI and agent consumer.
 *
 * The session cookie is READ SCOPE ONLY. It is deliberately never consulted by
 * authGuard(): the cookie rides along on same-site subresource requests from
 * inside published artifacts, and `security: { checkOrigin: false }` removes
 * Astro's CSRF backstop, so a cookie accepted for writes would turn every
 * artifact into a delete-everything CSRF weapon.
 */
import { timingSafeEqualBytes } from './auth.js';

export const SESSION_COOKIE = 'oa_session';
/** Cookie lifetime. Short enough that a stolen cookie ages out; renewed below. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Capability URLs only have to outlive a viewing session, not a login. */
export const RAW_CAPABILITY_TTL_SECONDS = 60 * 60;

const TAG = 'v1';
const SESSION_INFO = 'oa-session-v1';
const RAW_INFO = 'oa-raw-capability-v1';

const encoder = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Derivation is pure CPU but not free, and the inputs only change on a secret
// rotation or an epoch bump, so the promises are memoised for the isolate's
// lifetime. Nothing here is per-request or per-visitor.
const keyCache = new Map();

async function deriveKey(secret, epoch, info) {
  const ikm = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode(`open-artifacts|epoch:${epoch}`),
    info: encoder.encode(info)
  }, ikm, 256);
  return crypto.subtle.importKey(
    'raw', bits, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function getKey(secret, epoch, info) {
  const cacheKey = `${info} ${epoch} ${secret}`;
  let pending = keyCache.get(cacheKey);
  if (!pending) {
    pending = deriveKey(secret, epoch, info);
    keyCache.set(cacheKey, pending);
  }
  return pending;
}

async function sign(secret, epoch, info, message) {
  const key = await getKey(secret, epoch, info);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return new Uint8Array(sig);
}

/** Test-only: drops the memoised subkeys so a fresh secret takes effect. */
export function resetKeyCache() {
  keyCache.clear();
}

// ---------------------------------------------------------------- session

/**
 * Mints a session token: `v1.<expEpochSeconds>.<nonce>.<mac>`.
 *
 * The nonce makes two cookies minted in the same second distinguishable, so a
 * cookie is never a stable fingerprint of the second it was issued in.
 *
 * @param {string} secret ARTIFACT_ACCESS_TOKEN
 * @param {{epoch?: string, now?: number, ttlSeconds?: number}} [options]
 * @returns {Promise<{value: string, maxAge: number, expiresAt: number}>}
 */
export async function mintSession(secret, options = {}) {
  const { epoch = '1', now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS } = options;
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const mac = await sign(secret, epoch, SESSION_INFO, `${TAG}|${exp}|${nonce}`);
  return {
    value: `${TAG}.${exp}.${nonce}.${b64url(mac)}`,
    maxAge: ttlSeconds,
    expiresAt: exp * 1000
  };
}

/**
 * @param {string|null|undefined} cookieHeader raw Cookie request header
 * @param {string} name
 * @returns {string|null}
 */
export function readCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Verifies a session token. Never throws: malformed input is simply invalid.
 *
 * @returns {Promise<{valid: boolean, exp?: number, shouldRenew?: boolean}>}
 *   `shouldRenew` is set once the cookie is past its half-life, so an active
 *   browser keeps a rolling window instead of being logged out mid-session.
 */
export async function verifySession(token, secret, options = {}) {
  const { epoch = '1', now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS } = options;
  if (!token || !secret) return { valid: false };

  const parts = token.split('.');
  if (parts.length !== 4) return { valid: false };

  const [tag, expText, nonce, macText] = parts;
  if (tag !== TAG) return { valid: false };
  if (!/^[0-9]{1,15}$/.test(expText)) return { valid: false };

  const exp = Number(expText);
  if (exp * 1000 <= now) return { valid: false };

  let provided;
  try {
    provided = fromB64url(macText);
  } catch (err) {
    return { valid: false };
  }

  const expected = await sign(secret, epoch, SESSION_INFO, `${TAG}|${exp}|${nonce}`);
  // Constant time: `provided` is attacker-controlled, and a byte-at-a-time
  // comparison here would be a remote forgery oracle.
  if (!timingSafeEqualBytes(expected, provided)) return { valid: false };

  const remaining = exp - Math.floor(now / 1000);
  return { valid: true, exp, shouldRenew: remaining < ttlSeconds / 2 };
}

/** `Set-Cookie` value that installs a freshly minted session. */
export function sessionCookieHeader(value, maxAge) {
  // Secure is unconditional: localhost and 127.0.0.1 count as trustworthy
  // origins, so `wrangler dev` over http still stores it, and making the flag
  // protocol-dependent would let prod and the e2e suite diverge.
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** `Set-Cookie` value that removes the session. */
export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ------------------------------------------------------------- capability

/**
 * Signs one `/raw/:uuid/:version` URL.
 *
 * A sandboxed iframe cannot authenticate itself: localStorage throws at its
 * opaque origin, it has no allow-top-navigation, and its fetches to
 * /api/session fail the CORS check. So the already-authenticated shell hands
 * the frame a URL that carries its own proof. The signature is scoped to one
 * uuid+version and expires within the hour, which is why putting it in a query
 * string the artifact's own JS can read is acceptable where the master token
 * would not be.
 *
 * @returns {Promise<string>} query string, e.g. `exp=1234&sig=abc`
 */
export async function signRawCapability(secret, options) {
  const {
    uuid,
    version,
    epoch = '1',
    now = Date.now(),
    ttlSeconds = RAW_CAPABILITY_TTL_SECONDS
  } = options;
  const exp = Math.floor(now / 1000) + ttlSeconds;
  const mac = await sign(secret, epoch, RAW_INFO, `${TAG}|${uuid}|${version}|${exp}`);
  return `exp=${exp}&sig=${b64url(mac)}`;
}

/**
 * Verifies a capability signature against the uuid+version actually requested,
 * so a signature minted for one artifact cannot be replayed against another.
 * @returns {Promise<boolean>}
 */
export async function verifyRawCapability(secret, options) {
  const { uuid, version, exp, sig, epoch = '1', now = Date.now() } = options;
  if (!secret || !sig || !exp) return false;
  if (!/^[0-9]{1,15}$/.test(String(exp))) return false;

  const expNum = Number(exp);
  if (expNum * 1000 <= now) return false;

  let provided;
  try {
    provided = fromB64url(String(sig));
  } catch (err) {
    return false;
  }

  const expected = await sign(secret, epoch, RAW_INFO, `${TAG}|${uuid}|${version}|${expNum}`);
  return timingSafeEqualBytes(expected, provided);
}
