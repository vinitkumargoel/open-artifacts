/**
 * OpenArtifacts on Cloudflare Workers.
 *
 * Serverless port of the Express app (src/app.js + src/routes/*): same routes,
 * same response shapes, same security headers. Artifact bodies and metadata
 * live in R2 (worker/storage.js), rate limiting runs on Durable Objects
 * (worker/ratelimit.js), and the publisher token is a Worker secret.
 * The HTML views in src/views/ are reused verbatim.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { renderUploadHtml } from '../src/views/upload.js';
import { renderHistoryHtml } from '../src/views/history.js';
import { renderViewerHtml } from '../src/views/viewer.js';
import { isValidUuid4, parsePositiveInt } from '../src/utils/sanitize.js';
import {
  getArtifactMetadata,
  getArtifactVersionObject,
  processArtifactUpload,
  deleteArtifact,
  listAllArtifacts,
  bulkDeleteArtifacts
} from './storage.js';
import { verifyToken, extractToken } from './auth.js';
import { checkRateLimit, RateLimiterDO } from './ratelimit.js';
import { VIEWER_SECURITY_HEADERS, RAW_SANDBOX_HEADERS } from './headers.js';

export { RateLimiterDO };

const app = new Hono();

function intVar(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getConfig(env) {
  return {
    maxFileSizeMb: intVar(env.MAX_FILE_SIZE_MB, 25),
    uploadRateLimitPerMin: intVar(env.UPLOAD_RATE_LIMIT_PER_MIN, 30),
    readRateLimitPerMin: intVar(env.READ_RATE_LIMIT_PER_MIN, 500),
    accessToken: env.ARTIFACT_ACCESS_TOKEN || '',
    nodeEnv: env.NODE_ENV || 'production'
  };
}

function baseUrl(c) {
  return (c.env.BASE_URL || new URL(c.req.url).origin).replace(/\/+$/, '');
}

function jsonError(c, code, message, status) {
  return c.json({ error: { code, message, status } }, status);
}

function htmlErrorPage(c, status, heading, body) {
  return c.html(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>${heading}</h2>
          <p style="color:#94a3b8;">${body}</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Back to Upload</a>
        </body></html>
      `, status);
}

// --- Middleware -------------------------------------------------------------

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS']
}));

// Baseline hardening headers on every response (incl. /api/* and /healthz),
// matching the Helmet defaults the Express app applies globally. Route-specific
// header sets (viewer/raw) still take precedence where already present.
const BASELINE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Permitted-Cross-Domain-Policies': 'none'
};

app.use('*', async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    if (!c.res.headers.has(k)) c.res.headers.set(k, v);
  }
});

/**
 * Per-visitor rate limiter, mirroring src/middleware/rateLimit.js semantics
 * (fixed 60s window, standard RateLimit-* headers, per-visitor buckets).
 */
function limiter(scope) {
  return async (c, next) => {
    const config = getConfig(c.env);
    const limit = scope === 'upload' ? config.uploadRateLimitPerMin : config.readRateLimitPerMin;
    const verdict = await checkRateLimit({ request: c.req.raw, env: c.env, scope, limit });

    c.header('RateLimit-Limit', String(verdict.limit));
    c.header('RateLimit-Remaining', String(verdict.remaining));
    c.header('RateLimit-Reset', String(verdict.resetSeconds));

    if (!verdict.allowed) {
      c.header('Retry-After', String(verdict.resetSeconds));
      const message = scope === 'upload'
        ? `Upload rate limit exceeded. Max ${limit} uploads per minute.`
        : `Read rate limit exceeded. Max ${limit} requests per minute.`;
      return jsonError(c, 'RATE_LIMITED', message, 429);
    }

    await next();
  };
}

/** Publisher token guard, mirroring src/middleware/auth.js. */
async function authGuard(c, next) {
  const config = getConfig(c.env);
  if (!config.accessToken) {
    return jsonError(c, 'AUTH_NOT_CONFIGURED',
      'Server ARTIFACT_ACCESS_TOKEN is not configured in environment variables.', 500);
  }
  const ok = await verifyToken(extractToken(c.req.raw), config.accessToken);
  if (!ok) {
    return jsonError(c, 'UNAUTHORIZED',
      'Unauthorized. Missing or invalid access token. Provide a valid Authorization: Bearer <token> or x-access-token header.', 401);
  }
  await next();
}

function viewerHeaders(c) {
  for (const [k, v] of Object.entries(VIEWER_SECURITY_HEADERS)) c.header(k, v);
}

// --- Health -----------------------------------------------------------------

app.get('/healthz', (c) => {
  return c.json({ status: 'ok', service: 'open-artifacts', timestamp: new Date().toISOString() });
});

// --- Portal pages -----------------------------------------------------------

app.get('/', limiter('read'), (c) => {
  viewerHeaders(c);
  return c.html(renderUploadHtml());
});

app.get('/upload', limiter('read'), (c) => {
  viewerHeaders(c);
  return c.html(renderUploadHtml());
});

app.get('/history', limiter('read'), (c) => {
  viewerHeaders(c);
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.html(renderHistoryHtml());
});

// --- Viewer shell -----------------------------------------------------------

app.get('/a/:uuid', limiter('read'), async (c) => {
  const uuid = c.req.param('uuid');
  viewerHeaders(c);

  if (!isValidUuid4(uuid)) {
    return htmlErrorPage(c, 400, 'Invalid Artifact ID', 'The requested artifact ID is not a valid UUID-4 format.');
  }

  const metadata = await getArtifactMetadata(c.env.ARTIFACTS, uuid);
  if (!metadata) {
    return htmlErrorPage(c, 404, 'Artifact Not Found (404)', `No artifact found with ID: <code>${uuid}</code>`);
  }

  const latestVer = metadata.latestVersion || 1;
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.html(renderViewerHtml({ artifact: metadata, currentVersion: latestVer, baseUrl: baseUrl(c) }));
});

app.get('/a/:uuid/v/:version', limiter('read'), async (c) => {
  const { uuid, version } = c.req.param();
  viewerHeaders(c);

  if (!isValidUuid4(uuid)) {
    return htmlErrorPage(c, 400, 'Invalid Artifact ID', 'The requested artifact ID is not a valid UUID-4 format.');
  }

  const verNum = parsePositiveInt(version);
  if (isNaN(verNum)) {
    return htmlErrorPage(c, 400, 'Invalid Version Number', 'Version must be a positive integer.');
  }

  const metadata = await getArtifactMetadata(c.env.ARTIFACTS, uuid);
  if (!metadata) {
    return htmlErrorPage(c, 404, 'Artifact Not Found (404)', `No artifact found with ID: <code>${uuid}</code>`);
  }

  const hasVersion = (metadata.versions || []).some(v => v.versionNumber === verNum);
  if (!hasVersion) {
    return htmlErrorPage(c, 404, 'Version Not Found (404)', `Version ${verNum} does not exist for artifact <code>${uuid}</code>.`);
  }

  // Short TTL: the shell embeds the version dropdown, so a long cache would
  // hide newly published versions on pinned pages. Raw content stays immutable.
  c.header('Cache-Control', 'public, max-age=300');
  return c.html(renderViewerHtml({ artifact: metadata, currentVersion: verNum, baseUrl: baseUrl(c) }));
});

// --- Raw artifact streaming -------------------------------------------------

app.get('/raw/:uuid', limiter('read'), async (c) => {
  const uuid = c.req.param('uuid');

  if (!isValidUuid4(uuid)) {
    return jsonError(c, 'INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const metadata = await getArtifactMetadata(c.env.ARTIFACTS, uuid);
  if (!metadata) {
    return jsonError(c, 'ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  const latestVer = metadata.latestVersion || 1;
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.redirect(`/raw/${uuid}/${latestVer}`, 302);
});

app.get('/raw/:uuid/:version', limiter('read'), async (c) => {
  const { uuid, version } = c.req.param();

  if (!isValidUuid4(uuid)) {
    return jsonError(c, 'INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const verNum = parsePositiveInt(version);
  if (isNaN(verNum)) {
    return jsonError(c, 'INVALID_VERSION', 'Version must be a positive integer (e.g. 1, 2, 3).', 400);
  }

  const obj = await getArtifactVersionObject(c.env.ARTIFACTS, uuid, verNum);
  if (!obj) {
    return jsonError(c, 'VERSION_NOT_FOUND', `Version ${verNum} for artifact ${uuid} not found.`, 404);
  }

  const headers = new Headers(RAW_SANDBOX_HEADERS);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(obj.body, { status: 200, headers });
});

// --- API --------------------------------------------------------------------

app.get('/api/artifacts', limiter('read'), async (c) => {
  const artifacts = await listAllArtifacts(c.env.ARTIFACTS, baseUrl(c));
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.json({ artifacts, count: artifacts.length });
});

app.post('/api/artifacts', limiter('upload'), authGuard, async (c) => {
  const config = getConfig(c.env);
  const maxBytes = config.maxFileSizeMb * 1024 * 1024;

  // Cheap first line of defense: reject declared-oversized bodies before
  // buffering them. (formData() must buffer the whole body, so without this an
  // oversized upload is fully received before the file.size check can run.)
  const contentLength = parseInt(c.req.header('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes + 64 * 1024) {
    return jsonError(c, 'FILE_TOO_LARGE', `Uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`, 413);
  }

  let form;
  try {
    form = await c.req.raw.formData();
  } catch (err) {
    return jsonError(c, 'UPLOAD_ERROR', 'Malformed multipart/form-data request body.', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonError(c, 'INVALID_FILE_TYPE', 'No HTML file attached. Pass a file field in multipart/form-data.', 400);
  }

  const isHtmlExt = /\.(html|htm)$/i.test(file.name || '');
  if (!isHtmlExt && file.type !== 'text/html' && file.type !== 'application/xhtml+xml') {
    return jsonError(c, 'INVALID_FILE_TYPE', 'Invalid file type. Only standalone HTML files (.html, .htm) are supported.', 400);
  }

  if (file.size > maxBytes) {
    return jsonError(c, 'FILE_TOO_LARGE', `Uploaded file exceeds the maximum allowed size of ${config.maxFileSizeMb}MB.`, 413);
  }

  const id = form.get('id');
  const title = form.get('title');
  const description = form.get('description');

  const result = await processArtifactUpload({
    bucket: c.env.ARTIFACTS,
    file,
    id: typeof id === 'string' ? id : undefined,
    title: typeof title === 'string' ? title : undefined,
    description: typeof description === 'string' ? description : undefined
  });

  const artifactId = result.artifact._id;
  const version = result.versionNumber;
  const origin = baseUrl(c);

  return c.json({
    id: artifactId,
    version,
    title: result.artifact.title,
    description: result.artifact.description,
    isNew: result.isNew,
    url: `${origin}/a/${artifactId}`,
    rawUrl: `${origin}/raw/${artifactId}/${version}`,
    createdAt: result.artifact.updatedAt || result.artifact.createdAt
  }, 201);
});

app.get('/api/artifacts/:uuid', limiter('read'), async (c) => {
  const uuid = c.req.param('uuid');

  if (!isValidUuid4(uuid)) {
    return jsonError(c, 'INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const artifact = await getArtifactMetadata(c.env.ARTIFACTS, uuid);
  if (!artifact) {
    return jsonError(c, 'ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  const origin = baseUrl(c);
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.json({
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
  });
});

app.delete('/api/artifacts/:uuid', authGuard, async (c) => {
  const uuid = c.req.param('uuid');

  if (!isValidUuid4(uuid)) {
    return jsonError(c, 'INVALID_UUID_FORMAT', 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.', 400);
  }

  const deleted = await deleteArtifact(c.env.ARTIFACTS, uuid);
  if (!deleted) {
    return jsonError(c, 'ARTIFACT_NOT_FOUND', `Artifact with ID ${uuid} not found.`, 404);
  }

  return c.json({
    success: true,
    message: `Artifact ${uuid} and all its versions have been permanently deleted.`
  });
});

const handleBulkDelete = async (c) => {
  let body;
  try {
    body = await c.req.json();
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
    return jsonError(c, 'INVALID_REQUEST', 'Request body must include a non-empty array of artifact UUIDs in "ids".', 400);
  }

  if (ids.length > 100) {
    return jsonError(c, 'BATCH_LIMIT_EXCEEDED', 'Batch size exceeds maximum limit of 100 artifacts per delete operation.', 400);
  }

  // Validate every ID is UUID v4
  const invalidIds = ids.filter(id => typeof id !== 'string' || !isValidUuid4(id.trim()));
  if (invalidIds.length > 0) {
    return jsonError(c, 'INVALID_UUID_FORMAT',
      `Found invalid UUID-4 format in ids: ${invalidIds.slice(0, 3).join(', ')}${invalidIds.length > 3 ? '...' : ''}`, 400);
  }

  const result = await bulkDeleteArtifacts(c.env.ARTIFACTS, ids);
  return c.json({
    success: true,
    deletedCount: result.deletedCount,
    deletedIds: result.deletedIds,
    failedIds: result.failedIds,
    message: `Successfully deleted ${result.deletedCount} artifact(s).`
  });
};

app.post('/api/artifacts/bulk-delete', authGuard, handleBulkDelete);
app.delete('/api/artifacts', authGuard, handleBulkDelete);

// --- 404 & errors -----------------------------------------------------------

app.notFound((c) => {
  // Parity with Express req.accepts('html'): a missing Accept header or a
  // wildcard (curl's default */*) also gets the HTML page.
  const accept = c.req.header('accept');
  if (!accept || accept.includes('text/html') || accept.includes('*/*')) {
    return c.html(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;background:#090d16;color:#f8fafc;padding:40px;text-align:center;">
          <h2>404 &bull; Page Not Found</h2>
          <p style="color:#94a3b8;">The requested page could not be found.</p>
          <a href="/upload" style="color:#3b82f6;">&larr; Go to Upload Portal</a>
        </body></html>
      `, 404);
  }
  return jsonError(c, 'NOT_FOUND', `Cannot ${c.req.method} ${new URL(c.req.url).pathname}`, 404);
});

app.onError((err, c) => {
  const config = getConfig(c.env);

  // Application-specific errors thrown by worker/storage.js
  const known = {
    INVALID_FILE_TYPE: [400, err.message || 'Invalid file type. Only standalone HTML files (.html, .htm) are supported.'],
    INVALID_UUID_FORMAT: [400, 'The provided artifact ID must be a valid RFC 4122 UUID-4 string.'],
    ARTIFACT_NOT_FOUND: [404, err.message || 'Artifact not found.'],
    VERSION_NOT_FOUND: [404, err.message || 'The requested artifact version does not exist.'],
    UNAUTHORIZED: [401, err.message || 'Unauthorized access.']
  };

  if (err.code && known[err.code]) {
    const [status, message] = known[err.code];
    return jsonError(c, err.code, message, status);
  }

  console.error('[OpenArtifacts Error]', err);
  return jsonError(c, 'INTERNAL_SERVER_ERROR',
    config.nodeEnv === 'production' ? 'An internal server error occurred.' : err.message, 500);
});

export default app;
