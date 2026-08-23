/**
 * API route handlers shared between /api/artifacts/[uuid] and
 * /api/artifacts/bulk-delete (whose GET/DELETE fall through to the :uuid
 * handlers in the Hono router, since 'bulk-delete' is just an invalid UUID).
 * Ported one-for-one from worker/index.js.
 */
import { env } from 'cloudflare:workers';
import { isValidUuid4 } from '../../src/utils/sanitize.js';
import { getArtifactMetadata, deleteArtifact, bulkDeleteArtifacts } from '../../worker/storage.js';
import { json, jsonError, baseUrl, authGuard } from './http.js';

export async function handleGetOne(request, uuid) {
  if (!isValidUuid4(uuid)) {
    return jsonError('INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const artifact = await getArtifactMetadata(env.ARTIFACTS, uuid);
  if (!artifact) {
    return jsonError('ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  const origin = baseUrl(request);
  return json({
    id: artifact._id,
    title: artifact.title,
    description: artifact.description,
    latestVersion: artifact.latestVersion,
    viewCount: artifact.viewCount || 0,
    url: `${origin}/a/${artifact._id}`,
    rawUrl: `${origin}/raw/${artifact._id}/${artifact.latestVersion}`,
    versions: (artifact.versions || []).map(v => ({
      versionNumber: v.versionNumber,
      description: v.description,
      fileSize: v.fileSize,
      contentHash: v.contentHash,
      url: `${origin}/a/${artifact._id}/v/${v.versionNumber}`,
      rawUrl: `${origin}/raw/${artifact._id}/${v.versionNumber}`,
      createdAt: v.createdAt
    })),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt
  }, { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
}

export async function handleDeleteOne(request, uuid) {
  const denied = await authGuard(request);
  if (denied) return denied;

  if (!isValidUuid4(uuid)) {
    return jsonError('INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const deleted = await deleteArtifact(env.ARTIFACTS, uuid);
  if (!deleted) {
    return jsonError('ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  return json({
    success: true,
    message: `Artifact ${uuid} and all its versions have been permanently deleted.`
  });
}

export async function handleBulkDelete(request) {
  const denied = await authGuard(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch (err) {
    body = {};
  }
  // Request.json() parses a literal `null`/scalar body without throwing;
  // guard so those get the 400 below instead of a destructuring TypeError.
  if (!body || typeof body !== 'object') {
    body = {};
  }

  const { ids } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonError('INVALID_REQUEST', 'Request body must include a non-empty array of artifact UUIDs in "ids".', 400);
  }

  if (ids.length > 100) {
    return jsonError('BATCH_LIMIT_EXCEEDED', 'Batch size exceeds maximum limit of 100 artifacts per delete operation.', 400);
  }

  // Validate every ID is UUID v4
  const invalidIds = ids.filter(id => typeof id !== 'string' || !isValidUuid4(id.trim()));
  if (invalidIds.length > 0) {
    return jsonError('INVALID_UUID_FORMAT',
      `Found invalid UUID-4 format in ids: ${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}`, 400);
  }

  const result = await bulkDeleteArtifacts(env.ARTIFACTS, ids);
  return json({
    success: true,
    deletedCount: result.deletedCount,
    deletedIds: result.deletedIds,
    failedIds: result.failedIds,
    message: `Successfully deleted ${result.deletedCount} artifact(s).`
  });
}
