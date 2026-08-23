import { describe, it, expect } from 'vitest';
import { verifyToken, extractToken } from '../worker/auth.js';

describe('Auth & Timing-Safe Token Verification', () => {
  it('correctly validates matching tokens', async () => {
    expect(await verifyToken('secret_token_12345', 'secret_token_12345')).toBe(true);
  });

  it('rejects mismatching tokens', async () => {
    expect(await verifyToken('wrong_token', 'secret_token_12345')).toBe(false);
  });

  it('handles tokens of different lengths without throwing (pre-hashed)', async () => {
    expect(await verifyToken('short', 'much_longer_token_value_here')).toBe(false);
    expect(await verifyToken('a'.repeat(500), 'b')).toBe(false);
  });

  it('rejects undefined, null, or empty tokens', async () => {
    expect(await verifyToken('', 'secret')).toBe(false);
    expect(await verifyToken(null, 'secret')).toBe(false);
    expect(await verifyToken(undefined, 'secret')).toBe(false);
    expect(await verifyToken('secret', '')).toBe(false);
  });

  it('ignores surrounding whitespace in either token', async () => {
    expect(await verifyToken('  secret_token_12345  ', 'secret_token_12345')).toBe(true);
  });

  it('extractToken reads a Bearer authorization header', () => {
    const request = new Request('http://localhost/', {
      headers: { authorization: 'Bearer my_token' }
    });
    expect(extractToken(request)).toBe('my_token');
  });

  it('extractToken accepts a raw (non-Bearer) authorization header', () => {
    const request = new Request('http://localhost/', {
      headers: { authorization: 'my_raw_token' }
    });
    expect(extractToken(request)).toBe('my_raw_token');
  });

  it('extractToken prefers x-access-token / x-auth-token over authorization', () => {
    const request = new Request('http://localhost/', {
      headers: {
        'x-access-token': 'header_token',
        authorization: 'Bearer other_token'
      }
    });
    expect(extractToken(request)).toBe('header_token');

    const fallback = new Request('http://localhost/', {
      headers: { 'x-auth-token': 'alt_header_token' }
    });
    expect(extractToken(fallback)).toBe('alt_header_token');
  });

  it('extractToken returns undefined when no token headers are present', () => {
    expect(extractToken(new Request('http://localhost/'))).toBeUndefined();
  });
});
