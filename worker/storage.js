/**
 * R2-backed artifact storage for the Cloudflare Worker runtime.
 *
 * Object layout mirrors the disk layout of the Express backend exactly:
 *   artifacts/{uuid}/meta.json   - artifact metadata (same shape as sidecar meta.json)
 *   artifacts/{uuid}/v{n}.html   - immutable version bodies
 *
 * R2 reads-after-writes are strongly consistent, so an upload is immediately
 * visible to the viewer and the history dashboard.
 */
import {
  extractTitleFromHtml,
  extractDescriptionFromHtml,
  isValidUuid4,
  parsePositiveInt
} from './sanitize.js';
import { formatArtifactList } from './formatArtifacts.js';

const ARTIFACT_PREFIX = 'artifacts/';

/** Default artifact lifetime, in days, applied when a publish doesn't specify one. */
export const DEFAULT_TTL_DAYS = 30;

/** Upper bound, so a fat-fingered TTL can't push expiry past a sane horizon. */
export const MAX_TTL_DAYS = 3650;

/**
 * Normalises a caller-supplied TTL into a day count, or null for "never expires".
 * Accepts a number of days, a numeric string, or never/none/forever/permanent.
 * Anything unparseable falls back to `fallback`, so a typo in a form field can
 * never silently produce an artifact that outlives the retention policy.
 *
 * @param {unknown} ttl
 * @param {number|null} [fallback]
 * @returns {number|null} whole days, or null to never expire
 */
export function resolveTtlDays(ttl, fallback = DEFAULT_TTL_DAYS) {
  if (ttl === null || ttl === undefined) return fallback;
  if (typeof ttl === 'string') {
    const norm = ttl.trim().toLowerCase();
    if (norm === '') return fallback;
    if (norm === 'never' || norm === 'none' || norm === 'forever' || norm === 'permanent') return null;
  }
  const n = Number(ttl);
  if (!Number.isFinite(n)) return fallback;
  const days = Math.floor(n);
  // 0 and negatives mean "keep forever" — the explicit opt-out from expiry.
  if (days <= 0) return null;
  return Math.min(days, MAX_TTL_DAYS);
}

/**
 * @param {number|null} ttlDays
 * @param {Date} [from]
 * @returns {string|null} ISO expiry timestamp, or null when never expiring
 */
export function computeExpiresAt(ttlDays, from = new Date()) {
  if (ttlDays === null) return null;
  return new Date(from.getTime() + ttlDays * 86400000).toISOString();
}

/**
 * True once an artifact's lifetime has elapsed. Metadata written before TTL
 * existed carries no expiresAt and is treated as never expiring, so this can
 * ship ahead of the backfill without deleting anything.
 *
 * @param {object|null} meta
 * @param {number} [now]
 */
export function isExpired(meta, now = Date.now()) {
  const exp = meta?.expiresAt;
  if (!exp) return false;
  const t = Date.parse(exp);
  return Number.isFinite(t) && t <= now;
}

export function metaKey(uuid) {
  return `${ARTIFACT_PREFIX}${uuid}/meta.json`;
}

export function versionKey(uuid, versionNumber) {
  return `${ARTIFACT_PREFIX}${uuid}/v${versionNumber}.html`;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Retrieves artifact metadata by UUID-4 from R2.
 * @param {R2Bucket} bucket
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function getArtifactMetadata(bucket, uuid) {
  if (!isValidUuid4(uuid)) return null;
  const obj = await bucket.get(metaKey(uuid));
  if (!obj) return null;
  try {
    return await obj.json();
  } catch (err) {
    console.error(`[Storage] Corrupt meta.json for ${uuid}:`, err);
    return null;
  }
}

/**
 * Retrieves a version body as an R2 object (streamable) with validation.
 * @param {R2Bucket} bucket
 * @param {string} uuid
 * @param {unknown} versionNumber
 * @returns {Promise<R2ObjectBody|null>}
 */
export async function getArtifactVersionObject(bucket, uuid, versionNumber) {
  if (!isValidUuid4(uuid)) return null;
  const ver = parsePositiveInt(versionNumber);
  if (isNaN(ver)) return null;
  return await bucket.get(versionKey(uuid, ver));
}

/**
 * Processes an uploaded artifact File and creates or versions the artifact record.
 * Mirrors processArtifactUpload() from the legacy Express storage service (since removed).
 *
 * @param {object} params
 * @param {R2Bucket} params.bucket
 * @param {File} params.file - File from multipart form-data
 * @param {string} [params.id] - Optional UUID-4 to update
 * @param {string} [params.title]
 * @param {string} [params.description]
 * @param {unknown} [params.ttl] - Lifetime in days, or never/0 to keep forever
 * @param {number|null} [params.defaultTtlDays] - Policy default for new artifacts
 * @returns {Promise<{ artifact: object, versionNumber: number, isNew: boolean }>}
 */
export async function processArtifactUpload({ bucket, file, id, title, description, ttl, defaultTtlDays = DEFAULT_TTL_DAYS }) {
  const buffer = await file.arrayBuffer();
  const fileSize = buffer.byteLength;

  if (fileSize === 0) {
    const err = new Error('Uploaded file is empty (0 bytes).');
    err.code = 'INVALID_FILE_TYPE';
    throw err;
  }

  const content = new TextDecoder('utf-8').decode(buffer);
  const contentHash = await sha256Hex(buffer);
  const extractedTitle = extractTitleFromHtml(content);
  const extractedDesc = extractDescriptionFromHtml(content);

  let artifactId = id ? id.trim() : null;
  let targetVersion = 1;
  let isNew = true;
  let artifactRecord = null;

  if (artifactId) {
    if (!isValidUuid4(artifactId)) {
      const err = new Error('Invalid UUID-4 format for artifact ID.');
      err.code = 'INVALID_UUID_FORMAT';
      throw err;
    }

    artifactRecord = await getArtifactMetadata(bucket, artifactId);
    if (!artifactRecord) {
      const err = new Error(`Artifact with ID ${artifactId} not found.`);
      err.code = 'ARTIFACT_NOT_FOUND';
      throw err;
    }

    targetVersion = (artifactRecord.latestVersion || 1) + 1;
    isNew = false;
  } else {
    artifactId = crypto.randomUUID();
  }

  // Determine final Title & Description
  const finalTitle = (title && title.trim()) || (artifactRecord?.title) || extractedTitle || 'Untitled Artifact';
  const finalDesc = (description && description.trim()) || (artifactRecord?.description) || extractedDesc || '';
  const versionDesc = (description && description.trim()) || (isNew ? finalDesc : `Version ${targetVersion} update`);

  // Publishing is the activity that re-clocks expiry. An artifact pinned with
  // ttlDays: null stays pinned; one whose metadata predates TTL (no field at
  // all) picks up the default now rather than staying immortal by accident.
  const previousTtlDays = artifactRecord && 'ttlDays' in artifactRecord
    ? artifactRecord.ttlDays
    : defaultTtlDays;
  const ttlDays = resolveTtlDays(ttl, previousTtlDays);
  const expiresAt = computeExpiresAt(ttlDays);

  const versionEntry = {
    versionNumber: targetVersion,
    description: versionDesc.slice(0, 500),
    filePath: `artifacts/${artifactId}/v${targetVersion}.html`,
    fileSize,
    contentHash,
    createdAt: new Date().toISOString()
  };

  const metaPayload = {
    _id: artifactId,
    title: finalTitle.slice(0, 120),
    description: finalDesc.slice(0, 500),
    latestVersion: targetVersion,
    ttlDays,
    expiresAt,
    viewCount: artifactRecord ? (artifactRecord.viewCount || 0) : 0,
    versions: artifactRecord ? [...(artifactRecord.versions || []), versionEntry] : [versionEntry],
    createdAt: artifactRecord ? (artifactRecord.createdAt || new Date().toISOString()) : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Body first, meta last: a reader never sees a version entry whose file is
  // missing. If the meta write fails, remove the just-written body so no
  // orphaned version object stays servable via /raw.
  await bucket.put(versionKey(artifactId, targetVersion), buffer, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    sha256: contentHash
  });
  try {
    await bucket.put(metaKey(artifactId), JSON.stringify(metaPayload, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
  } catch (err) {
    try {
      await bucket.delete(versionKey(artifactId, targetVersion));
    } catch (cleanupErr) {
      console.error(`[Storage] Failed to clean up orphaned version body for ${artifactId} v${targetVersion}:`, cleanupErr);
    }
    throw err;
  }

  return {
    artifact: metaPayload,
    versionNumber: targetVersion,
    isNew
  };
}

/**
 * Re-clocks an artifact's expiry without publishing a new version — the
 * "Keep forever" / "Extend" action. Measured from now, not from the last
 * publish, so extending a nearly-expired artifact grants the full window.
 *
 * @param {R2Bucket} bucket
 * @param {string} uuid
 * @param {unknown} ttl - Lifetime in days, or never/0 to keep forever
 * @returns {Promise<object>} the updated metadata
 */
export async function setArtifactTtl(bucket, uuid, ttl) {
  if (!isValidUuid4(uuid)) {
    const err = new Error('Invalid UUID-4 format for artifact ID.');
    err.code = 'INVALID_UUID_FORMAT';
    throw err;
  }

  const meta = await getArtifactMetadata(bucket, uuid);
  if (!meta) {
    const err = new Error(`Artifact with ID ${uuid} not found.`);
    err.code = 'ARTIFACT_NOT_FOUND';
    throw err;
  }

  const ttlDays = resolveTtlDays(ttl, DEFAULT_TTL_DAYS);
  const updated = { ...meta, ttlDays, expiresAt: computeExpiresAt(ttlDays) };

  await bucket.put(metaKey(uuid), JSON.stringify(updated, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
  return updated;
}

/**
 * Deletes an artifact and all its versions from R2.
 * @param {R2Bucket} bucket
 * @param {string} uuid
 * @returns {Promise<boolean>}
 */
export async function deleteArtifact(bucket, uuid) {
  if (!isValidUuid4(uuid)) return false;

  const keys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: `${ARTIFACT_PREFIX}${uuid}/`, cursor });
    keys.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (keys.length === 0) return false;

  // R2 bulk delete accepts at most 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    await bucket.delete(keys.slice(i, i + 1000));
  }
  return true;
}

/**
 * Lists all artifacts stored in R2, formatted for the history dashboard.
 * @param {R2Bucket} bucket
 * @param {string} baseUrl
 * @returns {Promise<Array<object>>}
 */
export async function listAllArtifacts(bucket, baseUrl) {
  const metaKeys = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: ARTIFACT_PREFIX, cursor });
    for (const obj of page.objects) {
      if (obj.key.endsWith('/meta.json')) metaKeys.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const records = await Promise.all(metaKeys.map(async (key) => {
    try {
      const obj = await bucket.get(key);
      if (!obj) return null;
      const meta = await obj.json();
      return meta && isValidUuid4(meta._id) ? meta : null;
    } catch (err) {
      console.error(`[Storage] Skipping corrupt meta at ${key}:`, err);
      return null;
    }
  }));

  const now = Date.now();
  return formatArtifactList(records.filter(m => m && !isExpired(m, now)), baseUrl);
}

/**
 * Deletes every artifact whose retention window has closed. Driven by the daily
 * cron trigger in src/worker.js.
 *
 * Each artifact costs one R2 GET to inspect, so `maxScan` bounds the work: a
 * Worker invocation has a finite subrequest budget, and silently truncating is
 * better than throwing partway through and deleting nothing. The next run picks
 * up whatever was missed.
 *
 * @param {R2Bucket} bucket
 * @param {object} [opts]
 * @param {number} [opts.now]
 * @param {number} [opts.maxScan] - Max artifacts to inspect in one pass
 * @param {boolean} [opts.dryRun] - Report what would go, delete nothing
 * @returns {Promise<{scanned:number, expired:number, deleted:number, failed:number, truncated:boolean, deletedIds:string[]}>}
 */
export async function sweepExpiredArtifacts(bucket, { now = Date.now(), maxScan = 500, dryRun = false } = {}) {
  const metaKeys = [];
  let cursor;
  let truncated = false;
  do {
    const page = await bucket.list({ prefix: ARTIFACT_PREFIX, cursor });
    for (const obj of page.objects) {
      if (obj.key.endsWith('/meta.json')) metaKeys.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (metaKeys.length > maxScan) {
    truncated = true;
    metaKeys.length = maxScan;
  }

  let scanned = 0;
  let expired = 0;
  let failed = 0;
  const deletedIds = [];

  for (const key of metaKeys) {
    scanned++;
    let meta;
    try {
      const obj = await bucket.get(key);
      if (!obj) continue;
      meta = await obj.json();
    } catch (err) {
      // A corrupt meta.json is never swept — deleting on a parse failure would
      // turn a read bug into data loss.
      console.error(`[Sweep] Skipping unreadable meta at ${key}:`, err);
      failed++;
      continue;
    }

    if (!meta || !isValidUuid4(meta._id) || !isExpired(meta, now)) continue;
    expired++;
    if (dryRun) continue;

    try {
      const ok = await deleteArtifact(bucket, meta._id);
      if (ok) {
        deletedIds.push(meta._id);
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[Sweep] Failed to delete expired artifact ${meta._id}:`, err);
      failed++;
    }
  }

  return { scanned, expired, deleted: deletedIds.length, failed, truncated, deletedIds };
}

/**
 * Bulk deletes artifacts by their UUIDs. Mirrors bulkDeleteArtifacts() from the
 * legacy Express storage service: deduplicates and drops invalid IDs before deleting.
 * @param {R2Bucket} bucket
 * @param {string[]} ids
 * @returns {Promise<{ deletedCount: number, deletedIds: string[], failedIds: string[] }>}
 */
export async function bulkDeleteArtifacts(bucket, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedCount: 0, deletedIds: [], failedIds: [] };
  }

  const validIds = Array.from(
    new Set(
      ids
        .filter(id => typeof id === 'string' && isValidUuid4(id.trim()))
        .map(id => id.trim())
    )
  );

  const deletedIds = [];
  const failedIds = [];

  for (const id of validIds) {
    try {
      const ok = await deleteArtifact(bucket, id);
      if (ok) {
        deletedIds.push(id);
      } else {
        failedIds.push(id);
      }
    } catch (err) {
      console.error(`[Storage] Failed to delete artifact ${id}:`, err);
      failedIds.push(id);
    }
  }

  return {
    deletedCount: deletedIds.length,
    deletedIds,
    failedIds
  };
}
