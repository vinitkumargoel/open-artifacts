import { describe, it, expect } from 'vitest';
import {
  mintSession,
  verifySession,
  readCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  signRawCapability,
  verifyRawCapability,
  SESSION_TTL_SECONDS
} from '../worker/session.js';
import { safeNextPath } from '../worker/sanitize.js';

const SECRET = 'a-32-byte-ish-secret-for-testing';
const OTHER = 'a-different-secret-entirely-ok!!';

describe('session cookie', () => {
  it('mints a versioned, non-guessable token that never contains the secret', async () => {
    const minted = await mintSession(SECRET);
    expect(minted.value.startsWith('v1.')).toBe(true);
    expect(minted.value.split('.')).toHaveLength(4);
    expect(minted.value).not.toContain(SECRET);
    expect(minted.maxAge).toBe(SESSION_TTL_SECONDS);
    expect(minted.expiresAt).toBeGreaterThan(Date.now());
  });

  it('round-trips a freshly minted session', async () => {
    const minted = await mintSession(SECRET);
    const verdict = await verifySession(minted.value, SECRET);
    expect(verdict.valid).toBe(true);
    expect(verdict.shouldRenew).toBe(false);
  });

  it('gives two mints in the same millisecond different values', async () => {
    const now = Date.now();
    const [a, b] = await Promise.all([
      mintSession(SECRET, { now }),
      mintSession(SECRET, { now })
    ]);
    expect(a.value).not.toBe(b.value);
    expect((await verifySession(a.value, SECRET)).valid).toBe(true);
    expect((await verifySession(b.value, SECRET)).valid).toBe(true);
  });

  it('rejects a session signed with a different secret', async () => {
    const minted = await mintSession(SECRET);
    expect((await verifySession(minted.value, OTHER)).valid).toBe(false);
  });

  it('rejects a session from a different SESSION_EPOCH', async () => {
    const minted = await mintSession(SECRET, { epoch: '1' });
    expect((await verifySession(minted.value, SECRET, { epoch: '1' })).valid).toBe(true);
    expect((await verifySession(minted.value, SECRET, { epoch: '2' })).valid).toBe(false);
  });

  it('rejects an expired session', async () => {
    const minted = await mintSession(SECRET, { ttlSeconds: 60 });
    const later = Date.now() + 61 * 1000;
    expect((await verifySession(minted.value, SECRET, { now: later })).valid).toBe(false);
  });

  it('flags renewal past the half-life, not before', async () => {
    const now = Date.now();
    const minted = await mintSession(SECRET, { now, ttlSeconds: 1000 });

    const early = await verifySession(minted.value, SECRET, { now: now + 400 * 1000, ttlSeconds: 1000 });
    expect(early.valid).toBe(true);
    expect(early.shouldRenew).toBe(false);

    const late = await verifySession(minted.value, SECRET, { now: now + 600 * 1000, ttlSeconds: 1000 });
    expect(late.valid).toBe(true);
    expect(late.shouldRenew).toBe(true);
  });

  it('rejects a tampered MAC, exp, nonce or version tag', async () => {
    const minted = await mintSession(SECRET);
    const [tag, exp, nonce, mac] = minted.value.split('.');

    const flip = (s) => s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A');
    expect((await verifySession([tag, exp, nonce, flip(mac)].join('.'), SECRET)).valid).toBe(false);
    expect((await verifySession([tag, String(Number(exp) + 1), nonce, mac].join('.'), SECRET)).valid).toBe(false);
    expect((await verifySession([tag, exp, flip(nonce), mac].join('.'), SECRET)).valid).toBe(false);
    expect((await verifySession(['v2', exp, nonce, mac].join('.'), SECRET)).valid).toBe(false);
  });

  it('never throws on malformed input', async () => {
    const junk = ['', 'x', 'v1', 'v1.2.3', 'v1.abc.def.ghi', 'v1.1.2.3.4', '....',
      'v1.99999999999999999999.a.b', 'v1.1.@@@.###'];
    for (const value of junk) {
      expect((await verifySession(value, SECRET)).valid, value).toBe(false);
    }
    expect((await verifySession(null, SECRET)).valid).toBe(false);
    expect((await verifySession(undefined, SECRET)).valid).toBe(false);
    expect((await verifySession('v1.1.a.b', '')).valid).toBe(false);
  });

  it('emits cookie attributes that survive both prod and wrangler dev', () => {
    const header = sessionCookieHeader('v1.abc', 604800);
    expect(header).toContain('oa_session=v1.abc');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=604800');
    expect(header).toContain('HttpOnly');
    // Unconditional: localhost counts as a trustworthy origin, so making this
    // protocol-dependent would only let prod and the e2e suite diverge.
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');

    expect(clearSessionCookieHeader()).toContain('Max-Age=0');
  });
});

describe('readCookie', () => {
  it('picks the named cookie out of a header', () => {
    expect(readCookie('a=1; oa_session=v1.xyz; b=2', 'oa_session')).toBe('v1.xyz');
    expect(readCookie('oa_session=v1.xyz', 'oa_session')).toBe('v1.xyz');
    expect(readCookie('  oa_session = v1.xyz  ', 'oa_session')).toBe('v1.xyz');
  });

  it('returns null when absent, empty or malformed', () => {
    expect(readCookie('', 'oa_session')).toBeNull();
    expect(readCookie(null, 'oa_session')).toBeNull();
    expect(readCookie('other=1', 'oa_session')).toBeNull();
    expect(readCookie('novalue; other=1', 'oa_session')).toBeNull();
  });

  it('does not match a cookie whose name merely ends with the target', () => {
    expect(readCookie('not_oa_session=evil', 'oa_session')).toBeNull();
  });
});

describe('raw capability signatures', () => {
  const uuid = 'cb348dc9-f66f-4b4a-9fb5-34ef057b39a2';

  async function parse(secret, opts) {
    const qs = await signRawCapability(secret, opts);
    const params = new URLSearchParams(qs);
    return { exp: params.get('exp'), sig: params.get('sig') };
  }

  it('verifies a signature for the uuid and version it was minted for', async () => {
    const { exp, sig } = await parse(SECRET, { uuid, version: 3 });
    expect(await verifyRawCapability(SECRET, { uuid, version: '3', exp, sig })).toBe(true);
  });

  it('refuses replay against another artifact or version', async () => {
    const { exp, sig } = await parse(SECRET, { uuid, version: 3 });
    expect(await verifyRawCapability(SECRET, { uuid: '00000000-0000-4000-8000-000000000000', version: '3', exp, sig })).toBe(false);
    expect(await verifyRawCapability(SECRET, { uuid, version: '4', exp, sig })).toBe(false);
  });

  it('refuses a tampered expiry, a wrong secret, and a bumped epoch', async () => {
    const { exp, sig } = await parse(SECRET, { uuid, version: 1 });
    expect(await verifyRawCapability(SECRET, { uuid, version: '1', exp: String(Number(exp) + 3600), sig })).toBe(false);
    expect(await verifyRawCapability(OTHER, { uuid, version: '1', exp, sig })).toBe(false);
    expect(await verifyRawCapability(SECRET, { uuid, version: '1', exp, sig, epoch: '2' })).toBe(false);
  });

  it('refuses an expired signature', async () => {
    const now = Date.now();
    const { exp, sig } = await parse(SECRET, { uuid, version: 1, now, ttlSeconds: 60 });
    expect(await verifyRawCapability(SECRET, { uuid, version: '1', exp, sig, now: now + 61000 })).toBe(false);
  });

  it('cannot be substituted for a session token (separate HKDF subkeys)', async () => {
    const { exp, sig } = await parse(SECRET, { uuid, version: 1 });
    // A capability MAC replayed in cookie shape must not verify as a session.
    expect((await verifySession(`v1.${exp}.${uuid}|1.${sig}`, SECRET)).valid).toBe(false);
  });

  it('never throws on missing or malformed parameters', async () => {
    for (const args of [
      {},
      { exp: '123' },
      { sig: 'abc' },
      { exp: 'not-a-number', sig: 'abc' },
      { exp: '99999999999999999999', sig: 'abc' },
      { exp: '9999999999', sig: '!!!not-base64!!!' }
    ]) {
      expect(await verifyRawCapability(SECRET, { uuid, version: '1', ...args })).toBe(false);
    }
    expect(await verifyRawCapability('', { uuid, version: '1', exp: '9999999999', sig: 'abc' })).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeNextPath('/a/123')).toBe('/a/123');
    expect(safeNextPath('/a/123?from=1&to=2')).toBe('/a/123?from=1&to=2');
    expect(safeNextPath('/history')).toBe('/history');
  });

  it('rejects anything that could leave the origin', () => {
    for (const bad of ['//evil.example', 'https://evil.example', 'http://evil.example',
      '/\\evil.example', '\\\\evil.example', 'evil.example', '', null, undefined, 42]) {
      expect(safeNextPath(bad), String(bad)).toBe('/history');
    }
  });
});
