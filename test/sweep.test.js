import { describe, it, expect } from 'vitest';
import { sweepExpiredArtifacts } from '../worker/storage.js';

const DAY = 86400000;

/**
 * Minimal in-memory stand-in for the R2 binding: just the four methods
 * sweepExpiredArtifacts touches (list/get/delete, with delete accepting an
 * array for the bulk path in deleteArtifact).
 */
function fakeBucket(objects = {}) {
  const store = new Map(Object.entries(objects));
  return {
    store,
    async list({ prefix = '', cursor } = {}) {
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      return { objects: keys.map(key => ({ key })), truncated: false, cursor: undefined };
    },
    async get(key) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      return {
        async json() {
          if (value === '__CORRUPT__') throw new SyntaxError('Unexpected token');
          return JSON.parse(value);
        }
      };
    },
    async delete(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
    }
  };
}

function artifact(id, { expiresAt = null, versions = 1 } = {}) {
  const out = {
    [`artifacts/${id}/meta.json`]: JSON.stringify({
      _id: id,
      title: id.slice(0, 8),
      latestVersion: versions,
      ttlDays: expiresAt ? 30 : null,
      expiresAt,
      versions: Array.from({ length: versions }, (_, i) => ({ versionNumber: i + 1 }))
    })
  };
  for (let v = 1; v <= versions; v++) out[`artifacts/${id}/v${v}.html`] = '<h1>x</h1>';
  return out;
}

const EXPIRED = '11111111-1111-4111-8111-111111111111';
const LIVE = '22222222-2222-4222-8222-222222222222';
const PINNED = '33333333-3333-4333-8333-333333333333';

const past = new Date(Date.now() - 2 * DAY).toISOString();
const future = new Date(Date.now() + 20 * DAY).toISOString();

describe('sweepExpiredArtifacts', () => {
  it('deletes expired artifacts and every version body with them', async () => {
    const bucket = fakeBucket({
      ...artifact(EXPIRED, { expiresAt: past, versions: 3 }),
      ...artifact(LIVE, { expiresAt: future })
    });

    const result = await sweepExpiredArtifacts(bucket);

    expect(result).toMatchObject({ scanned: 2, expired: 1, deleted: 1, failed: 0 });
    expect(result.deletedIds).toEqual([EXPIRED]);
    // All three version bodies plus the meta are gone, not just the meta.
    expect([...bucket.store.keys()].filter(k => k.includes(EXPIRED))).toEqual([]);
    expect([...bucket.store.keys()].filter(k => k.includes(LIVE))).toHaveLength(2);
  });

  it('never touches artifacts with no expiresAt (pre-TTL metadata)', async () => {
    const bucket = fakeBucket(artifact(PINNED, { expiresAt: null }));
    const result = await sweepExpiredArtifacts(bucket);
    expect(result).toMatchObject({ scanned: 1, expired: 0, deleted: 0 });
    expect(bucket.store.size).toBe(2);
  });

  it('reports without deleting in dry-run mode', async () => {
    const bucket = fakeBucket(artifact(EXPIRED, { expiresAt: past }));
    const result = await sweepExpiredArtifacts(bucket, { dryRun: true });
    expect(result).toMatchObject({ expired: 1, deleted: 0 });
    expect(bucket.store.size).toBe(2);
  });

  it('skips corrupt metadata rather than deleting it', async () => {
    // A parse bug must never escalate into data loss.
    const bucket = fakeBucket({
      [`artifacts/${EXPIRED}/meta.json`]: '__CORRUPT__',
      [`artifacts/${EXPIRED}/v1.html`]: '<h1>x</h1>'
    });
    const result = await sweepExpiredArtifacts(bucket);
    expect(result).toMatchObject({ expired: 0, deleted: 0, failed: 1 });
    expect(bucket.store.size).toBe(2);
  });

  it('honours the boundary: expiry in the future survives, in the past does not', async () => {
    const now = Date.now();
    const bucket = fakeBucket({
      ...artifact(EXPIRED, { expiresAt: new Date(now - 1000).toISOString() }),
      ...artifact(LIVE, { expiresAt: new Date(now + 1000).toISOString() })
    });
    const result = await sweepExpiredArtifacts(bucket, { now });
    expect(result.deletedIds).toEqual([EXPIRED]);
  });

  it('truncates at maxScan instead of blowing the subrequest budget', async () => {
    const many = {};
    for (let i = 0; i < 10; i++) {
      const id = `4444444${i}-4444-4444-8444-444444444444`;
      Object.assign(many, artifact(id, { expiresAt: past }));
    }
    const result = await sweepExpiredArtifacts(fakeBucket(many), { maxScan: 4 });
    expect(result.scanned).toBe(4);
    expect(result.deleted).toBe(4);
    expect(result.truncated).toBe(true);
  });
});
