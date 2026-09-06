/**
 * /raw/:uuid — redirect to the latest version's immutable raw URL.
 */
import { env } from 'cloudflare:workers';
import { isValidUuid4 } from '../../../../worker/sanitize.js';
import { getArtifactMetadata, isExpired } from '../../../../worker/storage.js';
import { jsonError } from '../../../lib/http.js';

export const prerender = false;

export async function GET({ params }) {
  const uuid = params.uuid;

  if (!isValidUuid4(uuid)) {
    return jsonError('INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const metadata = await getArtifactMetadata(env.ARTIFACTS, uuid);
  if (!metadata) {
    return jsonError('ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  if (isExpired(metadata)) {
    return jsonError('ARTIFACT_EXPIRED', `Artifact ${uuid} expired on ${metadata.expiresAt} and is no longer available.`, 410);
  }

  const latestVer = metadata.latestVersion || 1;
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `/raw/${uuid}/${latestVer}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
