/**
 * End-to-end tests for the Cloudflare Worker port.
 *
 * Boots the real Worker under `wrangler dev` (workerd, local R2 + Durable
 * Object simulation) after migrating the actual data/artifacts/ contents into
 * a fresh local R2 store — so the suite verifies the migration path and the
 * full HTTP lifecycle: serve migrated artifacts, upload, view, raw-stream,
 * history list, bulk delete, auth, and per-visitor rate limiting.
 *
 * Rate limits are lowered via --var so they can be tripped deterministically,
 * and TRUST_VISITOR_HEADER=1 lets each test present a distinct visitor IP
 * (wrangler dev sees every request as loopback otherwise). Every request in
 * this suite sets x-e2e-visitor so tests cannot eat each other's quota.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERSIST_DIR = path.join(PROJECT_ROOT, '.wrangler', 'e2e-state');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const E2E_TOKEN = 'e2e_secret_token_31337';
const READ_LIMIT = 12;
const UPLOAD_LIMIT = 5;

// A migrated artifact known to exist in data/artifacts with a meta.json
const KNOWN_UUID = 'cb348dc9-f66f-4b4a-9fb5-34ef057b39a2';
// Migrated artifacts whose meta.json had to be synthesized
const SYNTH_UUIDS = ['800e6855-37c5-49c7-bff4-ed288ce918b0', 'a1dda13b-1ca2-4d9e-a846-3e3c18b94afd'];

let devProcess = null;
let devProcessError = null;
// wrangler dev output is captured here (and mirrored to DEV_LOG_PATH) so a
// boot failure or unexplained 500 can actually be diagnosed.
let devLog = '';
const DEV_LOG_PATH = path.join(PROJECT_ROOT, '.wrangler', 'e2e-dev.log');

function get(pathName, { visitor = 'default-visitor', headers = {} } = {}) {
  return fetch(`${BASE}${pathName}`, {
    headers: { 'x-e2e-visitor': visitor, ...headers },
    redirect: 'manual'
  });
}

function uploadArtifact({ visitor = 'uploader', token = E2E_TOKEN, html, name = 'test.html', id, title, description } = {}) {
  const fd = new FormData();
  fd.append('file', new File([html], name, { type: name.endsWith('.js') ? 'text/javascript' : 'text/html' }));
  if (id) fd.append('id', id);
  if (title) fd.append('title', title);
  if (description) fd.append('description', description);

  const headers = { 'x-e2e-visitor': visitor };
  if (token) headers['authorization'] = `Bearer ${token}`;

  return fetch(`${BASE}/api/artifacts`, { method: 'POST', headers, body: fd });
}

async function waitForReady(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    if (devProcessError) break;
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(
    `wrangler dev did not become ready on ${BASE}: ${devProcessError || lastErr}\n` +
    `--- wrangler output tail (full log: ${DEV_LOG_PATH}) ---\n${devLog.slice(-4000)}`
  );
}

beforeAll(async () => {
  // Fresh local R2 store, then migrate the real disk artifacts into it.
  await fsPromises.rm(PERSIST_DIR, { recursive: true, force: true });
  execFileSync('node', ['scripts/migrate-to-r2.mjs', '--persist-to', PERSIST_DIR], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });

  devProcess = spawn('npx', [
    'wrangler', 'dev',
    '--port', String(PORT),
    '--persist-to', PERSIST_DIR,
    '--var', 'TRUST_VISITOR_HEADER:1',
    '--var', `READ_RATE_LIMIT_PER_MIN:${READ_LIMIT}`,
    '--var', `UPLOAD_RATE_LIMIT_PER_MIN:${UPLOAD_LIMIT}`,
    '--var', `ARTIFACT_ACCESS_TOKEN:${E2E_TOKEN}`,
    '--var', 'NODE_ENV:test'
  ], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }
  });
  const capture = (chunk) => { devLog += chunk.toString(); };
  devProcess.stdout.on('data', capture);
  devProcess.stderr.on('data', capture);
  devProcess.on('error', (err) => { devProcessError = err; });

  await waitForReady();
}, 180000);

afterAll(async () => {
  try {
    await fsPromises.writeFile(DEV_LOG_PATH, devLog);
  } catch (err) { /* diagnostics only */ }
  if (devProcess?.pid) {
    try {
      process.kill(-devProcess.pid, 'SIGTERM');
    } catch (err) { /* already gone */ }
    await new Promise(r => setTimeout(r, 1500));
    try {
      process.kill(-devProcess.pid, 'SIGKILL');
    } catch (err) { /* already gone */ }
  }
}, 30000);

describe('Worker E2E: health & static assets', () => {
  it('GET /healthz returns status ok', async () => {
    const res = await get('/healthz');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('open-artifacts');
  });

  it('serves /favicon.svg from Workers Assets', async () => {
    const res = await get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('svg');
  });
});

describe('Worker E2E: migrated artifacts are served from R2', () => {
  it('lists every artifact migrated from data/artifacts/', async () => {
    const dirs = fs.readdirSync(path.join(PROJECT_ROOT, 'data', 'artifacts'), { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'tmp');

    const res = await get('/api/artifacts', { visitor: 'migration-check' });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.count).toBeGreaterThanOrEqual(dirs.length);
    const ids = body.artifacts.map(a => a.id);
    expect(ids).toContain(KNOWN_UUID);
    for (const uuid of SYNTH_UUIDS) {
      expect(ids).toContain(uuid);
    }
  });

  it('raw-streams a migrated artifact byte-identical to the disk original', async () => {
    const diskContent = fs.readFileSync(
      path.join(PROJECT_ROOT, 'data', 'artifacts', KNOWN_UUID, 'v1.html'), 'utf-8');

    const res = await get(`/raw/${KNOWN_UUID}/1`, { visitor: 'migration-check' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const served = await res.text();
    expect(served).toBe(diskContent);
  });

  it('renders the viewer shell for a migrated artifact with synthesized meta', async () => {
    const res = await get(`/a/${SYNTH_UUIDS[0]}`, { visitor: 'migration-check' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    const html = await res.text();
    expect(html).toContain(`/raw/${SYNTH_UUIDS[0]}/1`);
  });

  it('redirects /raw/:uuid to the latest version', async () => {
    const res = await get(`/raw/${KNOWN_UUID}`, { visitor: 'migration-check' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(`/raw/${KNOWN_UUID}/`);
  });
});

describe('Worker E2E: upload lifecycle', () => {
  const sampleHtml = '<!DOCTYPE html><html><head><title>E2E Worker Artifact</title></head><body><h1>Hello R2</h1></body></html>';
  const v2Html = '<!DOCTYPE html><html><head><title>E2E Worker Artifact v2</title></head><body><h1>Hello again</h1></body></html>';
  let uuid = '';

  it('publishes a new HTML artifact (201)', async () => {
    const res = await uploadArtifact({ html: sampleHtml, visitor: 'up-lifecycle', description: 'e2e initial' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.isNew).toBe(true);
    expect(body.version).toBe(1);
    expect(body.title).toBe('E2E Worker Artifact');
    expect(body.url).toContain(`/a/${body.id}`);
    uuid = body.id;
  });

  it('serves the uploaded artifact through the viewer and raw routes', async () => {
    const viewer = await get(`/a/${uuid}`, { visitor: 'up-lifecycle' });
    expect(viewer.status).toBe(200);
    expect(await viewer.text()).toContain('E2E Worker Artifact');

    const raw = await get(`/raw/${uuid}/1`, { visitor: 'up-lifecycle' });
    expect(raw.status).toBe(200);
    expect(await raw.text()).toBe(sampleHtml);
  });

  it('lists the new artifact in the history API', async () => {
    const res = await get('/api/artifacts', { visitor: 'up-lifecycle' });
    const body = await res.json();
    const found = body.artifacts.find(a => a.id === uuid);
    expect(found).toBeTruthy();
    expect(found.latestVersion).toBe(1);
  });

  it('publishes v2 against the same UUID', async () => {
    const res = await uploadArtifact({ html: v2Html, id: uuid, visitor: 'up-lifecycle-2' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.isNew).toBe(false);
    expect(body.version).toBe(2);

    const raw = await get(`/raw/${uuid}/2`, { visitor: 'up-lifecycle-2' });
    expect(await raw.text()).toBe(v2Html);

    const meta = await get(`/api/artifacts/${uuid}`, { visitor: 'up-lifecycle-2' });
    const metaBody = await meta.json();
    expect(metaBody.latestVersion).toBe(2);
    expect(metaBody.versions.length).toBe(2);
  });

  it('deletes the artifact and all versions (single delete)', async () => {
    const res = await fetch(`${BASE}/api/artifacts/${uuid}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${E2E_TOKEN}`, 'x-e2e-visitor': 'up-lifecycle-3' }
    });
    expect(res.status).toBe(200);

    const raw = await get(`/raw/${uuid}/1`, { visitor: 'up-lifecycle-3' });
    expect(raw.status).toBe(404);
    const rawBody = await raw.json();
    expect(rawBody.error.code).toBe('VERSION_NOT_FOUND');

    const viewer = await get(`/a/${uuid}`, { visitor: 'up-lifecycle-3' });
    expect(viewer.status).toBe(404);
  });
});

describe('Worker E2E: validation & auth', () => {
  it('rejects uploads without an access token (401)', async () => {
    const res = await uploadArtifact({ html: '<html></html>', token: null, visitor: 'val-1' });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
  });

  it('rejects deletes without an access token (401)', async () => {
    const res = await fetch(`${BASE}/api/artifacts/${KNOWN_UUID}`, {
      method: 'DELETE',
      headers: { 'x-e2e-visitor': 'val-1' }
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-HTML files (400)', async () => {
    const res = await uploadArtifact({ html: 'console.log(1)', name: 'script.js', visitor: 'val-2' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects empty files (400)', async () => {
    const res = await uploadArtifact({ html: '', visitor: 'val-3' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects invalid UUIDs on lookup (400)', async () => {
    const res = await get('/api/artifacts/not-a-uuid', { visitor: 'val-4' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_UUID_FORMAT');
  });

  it('returns JSON 404 for JSON clients and HTML 404 for browser-ish clients', async () => {
    const apiRes = await get('/api/nope', { visitor: 'val-5', headers: { accept: 'application/json' } });
    expect(apiRes.status).toBe(404);
    expect((await apiRes.json()).error.code).toBe('NOT_FOUND');

    // Missing/wildcard Accept gets the HTML page, matching Express req.accepts('html')
    const pageRes = await get('/nope', { visitor: 'val-5', headers: { accept: '*/*' } });
    expect(pageRes.status).toBe(404);
    expect(await pageRes.text()).toContain('Page Not Found');
  });

  it('applies baseline security headers to API responses', async () => {
    const res = await get('/healthz', { visitor: 'val-6' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('rejects a null JSON body on bulk delete with 400 (not 500)', async () => {
    const res = await fetch(`${BASE}/api/artifacts/bulk-delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${E2E_TOKEN}`,
        'x-e2e-visitor': 'val-7'
      },
      body: 'null'
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_REQUEST');
  });
});

describe('Worker E2E: bulk delete', () => {
  function bulkDelete(ids, { visitor = 'bulk', token = E2E_TOKEN } = {}) {
    return fetch(`${BASE}/api/artifacts/bulk-delete`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-e2e-visitor': visitor
      },
      body: JSON.stringify({ ids })
    });
  }

  it('rejects batches over the 100-item safety limit', async () => {
    const ids = Array.from({ length: 101 }, () => crypto.randomUUID());
    const res = await bulkDelete(ids);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('BATCH_LIMIT_EXCEEDED');
  });

  it('rejects batches containing invalid UUIDs', async () => {
    const res = await bulkDelete([crypto.randomUUID(), 'nope']);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_UUID_FORMAT');
  });

  it('deduplicates IDs and deletes uploaded artifacts', async () => {
    const a = await (await uploadArtifact({ html: '<html><title>bulk-a</title></html>', visitor: 'bulk-up' })).json();
    const b = await (await uploadArtifact({ html: '<html><title>bulk-b</title></html>', visitor: 'bulk-up' })).json();

    const res = await bulkDelete([a.id, a.id, b.id]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deletedCount).toBe(2);
    expect(body.deletedIds.sort()).toEqual([a.id, b.id].sort());

    expect((await get(`/raw/${a.id}/1`, { visitor: 'bulk-check' })).status).toBe(404);
    expect((await get(`/raw/${b.id}/1`, { visitor: 'bulk-check' })).status).toBe(404);
  });

  it('reports unknown artifacts as failed', async () => {
    const ghost = crypto.randomUUID();
    const res = await bulkDelete([ghost]);
    const body = await res.json();
    expect(body.deletedCount).toBe(0);
    expect(body.failedIds).toContain(ghost);
  });
});

describe('Worker E2E: per-visitor rate limiting', () => {
  it(`throttles a visitor after ${READ_LIMIT} reads/min while another visitor stays unthrottled`, async () => {
    for (let i = 0; i < READ_LIMIT; i++) {
      const res = await get('/api/artifacts', { visitor: 'rl-reader-a' });
      expect(res.status).toBe(200);
    }

    const throttled = await get('/api/artifacts', { visitor: 'rl-reader-a' });
    expect(throttled.status).toBe(429);
    const body = await throttled.json();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(Number(throttled.headers.get('retry-after'))).toBeGreaterThan(0);

    // The key assertion of the visitor-keyed design: a different visitor is
    // not throttled by the first visitor's usage.
    const other = await get('/api/artifacts', { visitor: 'rl-reader-b' });
    expect(other.status).toBe(200);
  });

  it(`throttles uploads after ${UPLOAD_LIMIT}/min per visitor`, async () => {
    // Tokenless uploads still consume the limiter (it runs before auth),
    // so nothing is actually written during this test.
    for (let i = 0; i < UPLOAD_LIMIT; i++) {
      const res = await uploadArtifact({ html: '<html></html>', token: null, visitor: 'rl-uploader-a' });
      expect(res.status).toBe(401);
    }

    const throttled = await uploadArtifact({ html: '<html></html>', token: null, visitor: 'rl-uploader-a' });
    expect(throttled.status).toBe(429);
    expect((await throttled.json()).error.code).toBe('RATE_LIMITED');

    const other = await uploadArtifact({ html: '<html></html>', token: null, visitor: 'rl-uploader-b' });
    expect(other.status).toBe(401);
  });

  it('buckets IPv6 visitors by /64 prefix', async () => {
    // Same /64, different interface identifiers -> same bucket.
    for (let i = 0; i < READ_LIMIT; i++) {
      await get('/api/artifacts', { visitor: `2001:db8:1:2:aaaa::${i.toString(16)}` });
    }
    const sameSlash64 = await get('/api/artifacts', { visitor: '2001:db8:1:2:bbbb::ffff' });
    expect(sameSlash64.status).toBe(429);

    const differentSlash64 = await get('/api/artifacts', { visitor: '2001:db8:9:9::1' });
    expect(differentSlash64.status).toBe(200);
  });
});
