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
 * @returns {Promise<{ artifact: object, versionNumber: number, isNew: boolean }>}
 */
export async function processArtifactUpload({ bucket, file, id, title, description }) {
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

  return formatArtifactList(records.filter(Boolean), baseUrl);
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
