import { describe, it, expect } from 'vitest';
import { verifyToken, authGuard } from '../src/middleware/auth.js';
import { config } from '../src/config/env.js';

describe('Auth & Timing-Safe Token Verification', () => {
  it('correctly validates matching tokens', () => {
    expect(verifyToken('secret_token_12345', 'secret_token_12345')).toBe(true);
  });

  it('rejects mismatching tokens', () => {
    expect(verifyToken('wrong_token', 'secret_token_12345')).toBe(false);
  });

  it('handles tokens of different lengths without throwing (pre-hashed)', () => {
    expect(verifyToken('short', 'much_longer_token_value_here')).toBe(false);
    expect(verifyToken('a'.repeat(500), 'b')).toBe(false);
  });

  it('rejects undefined, null, or empty tokens', () => {
    expect(verifyToken('', 'secret')).toBe(false);
    expect(verifyToken(null, 'secret')).toBe(false);
    expect(verifyToken(undefined, 'secret')).toBe(false);
    expect(verifyToken('secret', '')).toBe(false);
  });

  it('authGuard middleware allows request with valid Bearer token', () => {
    const validToken = config.accessToken;
    const req = {
      headers: { authorization: `Bearer ${validToken}` },
      query: {}
    };
    let nextCalled = false;
    const res = {
      status: () => ({ json: () => {} })
    };
    const next = () => { nextCalled = true; };

    authGuard(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('authGuard middleware rejects request with invalid token (401)', () => {
    const req = {
      headers: { authorization: 'Bearer wrong_token' },
      query: {}
    };
    let statusCode = 0;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { jsonResponse = data; }
        };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    authGuard(req, res, next);
    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(401);
    expect(jsonResponse.error.code).toBe('UNAUTHORIZED');
  });
});
