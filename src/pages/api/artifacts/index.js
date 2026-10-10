/**
 * /api/artifacts — list (GET), publish (POST), bulk delete (DELETE).
 * Ported one-for-one from the legacy Hono worker (since removed; see git history).
 */
import { env } from 'cloudflare:workers';
import { listAllArtifacts, listArtifactsPage, LIST_SORTS, processArtifactUpload, resolveTtlDays } from '../../../../worker/storage.js';
import { parsePositiveInt } from '../../../../worker/sanitize.js';
import { json, jsonError, baseUrl, authGuard, getConfig, mapError, drainBody } from '../../../lib/http.js';
import { handleBulkDelete } from '../../../lib/artifacts.js';

export const prerender = false;

const MAX_PAGE_SIZE = 100;

export async function GET({ request }) {
  const noStore = { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } };
  const params = new URL(request.url).searchParams;

  // Without page/limit the full list is returned, as it always was: agents
  // and scripts depend on that shape. The dashboard always paginates.
  if (!params.has('page') && !params.has('limit')) {
    const artifacts = await listAllArtifacts(env.ARTIFACTS, baseUrl(request));
    return json({ artifacts, count: artifacts.length }, noStore);
  }

  const page = parsePositiveInt(params.get('page') ?? '1');
  const limit = parsePositiveInt(params.get('limit') ?? '25');
  if (!page || !limit || limit > MAX_PAGE_SIZE) {
    return jsonError('INVALID_PAGINATION', `page must be a positive integer and limit between 1 and ${MAX_PAGE_SIZE}.`, 400);
  }
  const sort = params.get('sort') || 'updated_desc';
  if (!LIST_SORTS.includes(sort)) {
    return jsonError('INVALID_SORT', `sort must be one of: ${LIST_SORTS.join(', ')}.`, 400);
  }

  const { items, total, stats } = await listArtifactsPage(env.ARTIFACTS, baseUrl(request), {
    page, limit, sort, q: params.get('q') || ''
  });
  return json({
    artifacts: items,
    count: items.length,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    stats
  }, noStore);
}

export async function POST({ request }) {
  const denied = await authGuard(request);
  if (denied) return denied;

  const config = getConfig();
  const maxBytes = config.maxFileSizeMb * 1024 * 1024;

  // Cheap first line of defense: reject declared-oversized bodies before
  // buffering them. (formData() must buffer the whole body, so without this an
  // oversized upload is fully received before the file.size check can run.)
  const contentLength = parseInt(request.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes + 64 * 1024) {
    await drainBody(request);
    return jsonError('FILE_TOO_LARGE', `Uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`, 413);
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonError('UPLOAD_ERROR', 'Malformed multipart/form-data request body.', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonError('INVALID_FILE_TYPE', 'No HTML file attached. Pass a file field in multipart/form-data.', 400);
  }

  const isHtmlExt = /\.(html|htm)$/i.test(file.name || '');
  if (!isHtmlExt && file.type !== 'text/html' && file.type !== 'application/xhtml+xml') {
    return jsonError('INVALID_FILE_TYPE', 'Invalid file type. Only standalone HTML files (.html, .htm) are supported.', 400);
  }

  if (file.size > maxBytes) {
    return jsonError('FILE_TOO_LARGE', `Uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`, 413);
  }

  const id = form.get('id');
  const title = form.get('title');
  const description = form.get('description');
  const ttl = form.get('ttl');

  let result;
  try {
    result = await processArtifactUpload({
      bucket: env.ARTIFACTS,
      file,
      id: typeof id === 'string' ? id : undefined,
      title: typeof title === 'string' ? title : undefined,
      description: typeof description === 'string' ? description : undefined,
      ttl: typeof ttl === 'string' ? ttl : undefined,
      defaultTtlDays: resolveTtlDays(config.defaultTtlDays)
    });
  } catch (err) {
    // Storage-level validation errors (empty file, unknown id, bad UUID) carry
    // err.code and map to the same responses Hono's onError produced.
    return mapError(err);
  }

  const artifactId = result.artifact._id;
  const version = result.versionNumber;
  const origin = baseUrl(request);

  return json({
    id: artifactId,
    version,
    title: result.artifact.title,
    description: result.artifact.description,
    isNew: result.isNew,
    ttlDays: result.artifact.ttlDays,
    expiresAt: result.artifact.expiresAt,
    url: `${origin}/a/${artifactId}`,
    rawUrl: `${origin}/raw/${artifactId}/${version}`,
    createdAt: result.artifact.updatedAt || result.artifact.createdAt
  }, { status: 201 });
}

export async function DELETE({ request }) {
  return handleBulkDelete(request);
}
