import { describe, it, expect } from 'vitest';
import {
  resolveTtlDays,
  computeExpiresAt,
  isExpired,
  DEFAULT_TTL_DAYS,
  MAX_TTL_DAYS
} from '../worker/storage.js';

const DAY = 86400000;

describe('resolveTtlDays', () => {
  it('falls back to the default when nothing is supplied', () => {
    expect(resolveTtlDays(undefined)).toBe(DEFAULT_TTL_DAYS);
    expect(resolveTtlDays(null)).toBe(DEFAULT_TTL_DAYS);
    expect(resolveTtlDays('')).toBe(DEFAULT_TTL_DAYS);
    expect(resolveTtlDays('   ')).toBe(DEFAULT_TTL_DAYS);
  });

  it('accepts day counts as numbers or strings', () => {
    expect(resolveTtlDays(7)).toBe(7);
    expect(resolveTtlDays('7')).toBe(7);
    expect(resolveTtlDays(' 90 ')).toBe(90);
    expect(resolveTtlDays(1.9)).toBe(1);
  });

  it('treats never/none/forever/permanent and 0 as "keep forever"', () => {
    for (const word of ['never', 'NEVER', 'none', 'forever', 'Permanent']) {
      expect(resolveTtlDays(word)).toBeNull();
    }
    expect(resolveTtlDays(0)).toBeNull();
    expect(resolveTtlDays('0')).toBeNull();
    expect(resolveTtlDays(-5)).toBeNull();
  });

  it('clamps absurd values to MAX_TTL_DAYS', () => {
    expect(resolveTtlDays(999999)).toBe(MAX_TTL_DAYS);
  });

  it('falls back rather than guessing when the value is unparseable', () => {
    // A typo must never silently produce a longer-lived artifact than intended.
    expect(resolveTtlDays('thirty')).toBe(DEFAULT_TTL_DAYS);
    expect(resolveTtlDays(NaN)).toBe(DEFAULT_TTL_DAYS);
    expect(resolveTtlDays({}, 14)).toBe(14);
  });

  it('honours an explicit fallback, including a null one', () => {
    expect(resolveTtlDays(undefined, null)).toBeNull();
    expect(resolveTtlDays(undefined, 5)).toBe(5);
  });
});

describe('computeExpiresAt', () => {
  it('returns null for a never-expiring TTL', () => {
    expect(computeExpiresAt(null)).toBeNull();
  });

  it('adds whole days to the supplied instant', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    expect(computeExpiresAt(30, from)).toBe('2026-01-31T00:00:00.000Z');
    expect(computeExpiresAt(1, from)).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('isExpired', () => {
  const now = Date.parse('2026-06-01T00:00:00.000Z');

  it('treats metadata with no expiresAt as never expiring', () => {
    // Everything published before TTL existed must keep working until the
    // backfill runs, so a missing field can never mean "delete me".
    expect(isExpired({}, now)).toBe(false);
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
  });

  it('is true only once the instant has passed', () => {
    expect(isExpired({ expiresAt: '2026-05-31T23:59:59.000Z' }, now)).toBe(true);
    expect(isExpired({ expiresAt: '2026-06-01T00:00:00.000Z' }, now)).toBe(true);
    expect(isExpired({ expiresAt: '2026-06-01T00:00:01.000Z' }, now)).toBe(false);
  });

  it('ignores an unparseable expiresAt rather than deleting the artifact', () => {
    expect(isExpired({ expiresAt: 'not-a-date' }, now)).toBe(false);
  });
});

describe('TTL round trip', () => {
  it('a 30-day default lands 30 days out', () => {
    const from = new Date('2026-03-10T12:00:00.000Z');
    const exp = computeExpiresAt(resolveTtlDays(undefined), from);
    expect(Date.parse(exp) - from.getTime()).toBe(30 * DAY);
    expect(isExpired({ expiresAt: exp }, from.getTime() + 29 * DAY)).toBe(false);
    expect(isExpired({ expiresAt: exp }, from.getTime() + 31 * DAY)).toBe(true);
  });
});
