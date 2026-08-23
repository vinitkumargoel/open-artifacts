import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/services/db.js';
import { config } from '../src/config/env.js';

const app = createApp();
const AUTH_TOKEN = config.accessToken || 'test_secret_token_12345';

let createdUuid = '';

describe('OpenArtifacts End-to-End API Test Suite', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('GET /healthz returns status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('open-artifacts');
  });

  it('POST /api/artifacts rejects requests without access token (401)', async () => {
    const res = await request(app)
      .post('/api/artifacts')
      .attach('file', Buffer.from('<html><body>Test</body></html>'), 'test.html');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/artifacts rejects non-HTML files (400)', async () => {
    const res = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .attach('file', Buffer.from('console.log("hello")'), 'script.js');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('POST /api/artifacts rejects 0-byte empty files (400)', async () => {
    const res = await request(app)
      .post('/api/artifacts')
      .set('x-access-token', AUTH_TOKEN)
      .attach('file', Buffer.from(''), 'empty.html');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('POST /api/artifacts accepts auth via x-auth-token header (201)', async () => {
    const res = await request(app)
      .post('/api/artifacts')
      .set('x-auth-token', AUTH_TOKEN)
      .field('title', 'Header Auth Test')
      .attach('file', Buffer.from('<html><head><title>Header Auth</title></head><body>OK</body></html>'), 'auth_test.html');

    expect(res.status).toBe(201);
  });

  it('POST /api/artifacts publishes a new HTML artifact (201)', async () => {
    const sampleHtml = `<!DOCTYPE html>
    <html>
      <head><title>Sales Analytics Dashboard</title></head>
      <body><h1>Revenue Metrics</h1><p>Interactive chart here</p></body>
    </html>`;

    const res = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .field('title', 'Q3 Sales Analytics')
      .field('description', 'Interactive revenue charts with filters')
      .attach('file', Buffer.from(sampleHtml), 'sales.html');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.version).toBe(1);
    expect(res.body.title).toBe('Q3 Sales Analytics');
    expect(res.body.description).toBe('Interactive revenue charts with filters');
    expect(res.body.url).toContain(`/a/${res.body.id}`);
    expect(res.body.rawUrl).toContain(`/raw/${res.body.id}/1`);

    createdUuid = res.body.id;

    // Verify sidecar meta.json was written to disk
    const sidecarPath = path.join(config.storagePath, createdUuid, 'meta.json');
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const metaJson = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    expect(metaJson._id).toBe(createdUuid);
    expect(metaJson.latestVersion).toBe(1);
  });

  it('POST /api/artifacts with existing ID publishes a new version v2 (201)', async () => {
    const updatedHtml = `<!DOCTYPE html>
    <html>
      <head><title>Sales Analytics Dashboard v2</title></head>
      <body><h1>Revenue Metrics v2</h1><p>Added dark theme</p></body>
    </html>`;

    const res = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .field('id', createdUuid)
      .field('description', 'Added dark theme and currency filter')
      .attach('file', Buffer.from(updatedHtml), 'sales_v2.html');

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(createdUuid);
    expect(res.body.version).toBe(2);
    expect(res.body.isNew).toBe(false);

    // Verify both files exist on disk
    const v1Path = path.join(config.storagePath, createdUuid, 'v1.html');
    const v2Path = path.join(config.storagePath, createdUuid, 'v2.html');
    expect(fs.existsSync(v1Path)).toBe(true);
    expect(fs.existsSync(v2Path)).toBe(true);
  });

  it('GET /api/artifacts/:uuid returns full metadata and version list', async () => {
    const res = await request(app).get(`/api/artifacts/${createdUuid}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdUuid);
    expect(res.body.latestVersion).toBe(2);
    expect(res.body.versions.length).toBe(2);
    expect(res.body.versions[0].versionNumber).toBe(1);
    expect(res.body.versions[1].versionNumber).toBe(2);
  });

  it('GET /api/artifacts/invalid-uuid returns 400', async () => {
    const res = await request(app).get('/api/artifacts/not-a-valid-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_UUID_FORMAT');
  });

  it('GET /raw/:uuid redirects (302) to latest version', async () => {
    const res = await request(app).get(`/raw/${createdUuid}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/raw/${createdUuid}/2`);
  });

  it('GET /raw/:uuid/:version streams file with strict CSP sandbox headers', async () => {
    const res = await request(app).get(`/raw/${createdUuid}/2`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain('sandbox allow-scripts allow-forms allow-popups allow-modals');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.text).toContain('Revenue Metrics v2');
  });

  it('GET /raw/:uuid/999 returns 404 for nonexistent version', async () => {
    const res = await request(app).get(`/raw/${createdUuid}/999`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VERSION_NOT_FOUND');
  });

  it('GET /a/:uuid renders Viewer Shell with Top Header and Version Dropdown', async () => {
    const res = await request(app).get(`/a/${createdUuid}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.text).toContain('Q3 Sales Analytics');
    expect(res.text).toContain('versionSelect');
    expect(res.text).toContain(`src="/raw/${createdUuid}/2"`);
    expect(res.text).toContain('property="og:title"');
  });

  it('GET /a/:uuid/v/1 renders Viewer Shell pinned to Version 1', async () => {
    const res = await request(app).get(`/a/${createdUuid}/v/1`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`src="/raw/${createdUuid}/1"`);
  });

  it('GET /upload serves minimal upload portal', async () => {
    const res = await request(app).get('/upload');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Studio Publisher');
    expect(res.text).toContain('dropzone');
  });

  it('GET /history serves the artifact history catalog page', async () => {
    const res = await request(app).get('/history');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.text).toContain('All Published Artifacts');
    expect(res.text).toContain('deleteModal');
  });

  it('GET /api/artifacts returns catalog of published artifacts', async () => {
    const res = await request(app).get('/api/artifacts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('artifacts');
    expect(res.body).toHaveProperty('count');
    expect(Array.isArray(res.body.artifacts)).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
    const found = res.body.artifacts.find(a => a.id === createdUuid);
    expect(found).toBeDefined();
    expect(found.title).toBe('Q3 Sales Analytics');
    expect(found.latestVersion).toBe(2);
  });

  it('POST /api/artifacts/bulk-delete rejects unauthorized requests (401)', async () => {
    const res = await request(app)
      .post('/api/artifacts/bulk-delete')
      .send({ ids: [createdUuid] });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/artifacts/bulk-delete rejects empty or invalid ids array (400)', async () => {
    const resEmpty = await request(app)
      .post('/api/artifacts/bulk-delete')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({ ids: [] });

    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.error.code).toBe('INVALID_REQUEST');

    const resInvalid = await request(app)
      .post('/api/artifacts/bulk-delete')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({ ids: ['not-a-valid-uuid'] });

    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.error.code).toBe('INVALID_UUID_FORMAT');
  });

  it('POST /api/artifacts/bulk-delete successfully bulk deletes artifacts', async () => {
    // First create a second artifact to test bulk deletion of multiple items
    const sampleHtml = `<!DOCTYPE html><html><head><title>Batch Artifact</title></head><body><h1>Batch Item</h1></body></html>`;
    const createRes = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .field('title', 'Batch Item For Deletion')
      .attach('file', Buffer.from(sampleHtml), 'batch.html');

    expect(createRes.status).toBe(201);
    const secondUuid = createRes.body.id;

    // Delete both createdUuid and secondUuid
    const res = await request(app)
      .post('/api/artifacts/bulk-delete')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({ ids: [createdUuid, secondUuid] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedCount).toBe(2);
    expect(res.body.deletedIds).toContain(createdUuid);
    expect(res.body.deletedIds).toContain(secondUuid);

    // Verify disk directories are removed
    const path1 = path.join(config.storagePath, createdUuid);
    const path2 = path.join(config.storagePath, secondUuid);
    expect(fs.existsSync(path1)).toBe(false);
    expect(fs.existsSync(path2)).toBe(false);
  });

  it('DELETE /api/artifacts supports bulk delete as well', async () => {
    // Create an artifact to delete
    const sampleHtml = `<!DOCTYPE html><html><head><title>Delete Route Test</title></head><body><h1>Delete</h1></body></html>`;
    const createRes = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .field('title', 'Delete Route Test')
      .attach('file', Buffer.from(sampleHtml), 'del.html');

    expect(createRes.status).toBe(201);
    const idToDelete = createRes.body.id;

    const res = await request(app)
      .delete('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .send({ ids: [idToDelete] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedCount).toBe(1);
    expect(res.body.deletedIds).toContain(idToDelete);
  });

  it('DELETE /api/artifacts/:uuid removes artifact from DB and filesystem', async () => {
    // Create artifact
    const sampleHtml = `<!DOCTYPE html><html><head><title>Single Delete</title></head><body><h1>Single</h1></body></html>`;
    const createRes = await request(app)
      .post('/api/artifacts')
      .set('Authorization', `Bearer ${AUTH_TOKEN}`)
      .field('title', 'Single Delete Test')
      .attach('file', Buffer.from(sampleHtml), 'single.html');

    const singleId = createRes.body.id;

    const res = await request(app)
      .delete(`/api/artifacts/${singleId}`)
      .set('Authorization', `Bearer ${AUTH_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Subsequent lookup returns 404
    const lookupRes = await request(app).get(`/api/artifacts/${singleId}`);
    expect(lookupRes.status).toBe(404);
  });
});
