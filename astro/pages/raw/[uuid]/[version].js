/**
 * /raw/:uuid/:version — stream the immutable version body from R2 inside the
 * opaque-origin sandbox header set.
 */
import { env } from 'cloudflare:workers';
import { isValidUuid4, parsePositiveInt } from '../../../../worker/sanitize.js';
import { getArtifactVersionObject } from '../../../../worker/storage.js';
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

  const obj = await getArtifactVersionObject(env.ARTIFACTS, uuid, verNum);
  if (!obj) {
    return jsonError('VERSION_NOT_FOUND', `Version ${verNum} for artifact ${uuid} not found.`, 404);
  }

  const headers = new Headers(RAW_SANDBOX_HEADERS);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { status: 200, headers });
}
