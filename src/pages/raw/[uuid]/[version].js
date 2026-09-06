/**
 * /raw/:uuid/:version — stream the immutable version body from R2 inside the
 * opaque-origin sandbox header set.
 */
import { env } from 'cloudflare:workers';
import { isValidUuid4, parsePositiveInt } from '../../../../worker/sanitize.js';
import { getArtifactVersionObject, getArtifactMetadata, isExpired } from '../../../../worker/storage.js';
import { jsonError } from '../../../lib/http.js';
import { RAW_SANDBOX_HEADERS } from '../../../../worker/headers.js';

export const prerender = false;

export async function GET({ params }) {
  const { uuid, version } = params;

  if (!isValidUuid4(uuid)) {
    return jsonError('INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const verNum = parsePositiveInt(version);
  if (isNaN(verNum)) {
    return jsonError('INVALID_VERSION', 'Version must be a positive integer (e.g. 1, 2, 3).', 400);
  }

  // Fetched together: the body is the hot path, and the metadata is only needed
  // for the expiry check, so serialising them would add a round trip to every
  // artifact view for no reason.
  const [obj, metadata] = await Promise.all([
    getArtifactVersionObject(env.ARTIFACTS, uuid, verNum),
    getArtifactMetadata(env.ARTIFACTS, uuid)
  ]);
  if (!obj) {
    return jsonError('VERSION_NOT_FOUND', `Version ${verNum} for artifact ${uuid} not found.`, 404);
  }
  // Lazy expiry: the daily sweep may not have reached this artifact yet.
  if (isExpired(metadata)) {
    return jsonError('ARTIFACT_EXPIRED', `Artifact ${uuid} expired on ${metadata.expiresAt} and is no longer available.`, 410);
  }

  const headers = new Headers(RAW_SANDBOX_HEADERS);
  // `private`, not `public`: the bytes are token-gated now, and a year-long
  // shared cache entry would outlive both the session and a delete. The URL is
  // content-versioned, so immutability is still correct for the browser cache.
  // No Vary: Cookie — it is a no-op on a private response.
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  return new Response(obj.body, { status: 200, headers });
}
