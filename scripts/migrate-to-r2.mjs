#!/usr/bin/env node
/**
 * Migrates existing artifacts from the Express disk layout (data/artifacts/)
 * into the Cloudflare R2 bucket used by the Worker.
 *
 * The R2 object layout mirrors the disk layout, so this is a straight copy:
 *   data/artifacts/{uuid}/v{n}.html  -> artifacts/{uuid}/v{n}.html
 *   data/artifacts/{uuid}/meta.json  -> artifacts/{uuid}/meta.json
 *
 * Directories missing meta.json (early uploads that predate the sidecar) get
 * one synthesized with the same title/description extraction, SHA-256 hash,
 * and size accounting the server performs on upload.
 *
 * Usage:
 *   node scripts/migrate-to-r2.mjs                     # -> local sim store (.wrangler/state)
 *   node scripts/migrate-to-r2.mjs --persist-to DIR    # -> local sim store at DIR
 *   node scripts/migrate-to-r2.mjs --remote            # -> real R2 bucket (needs r2 OAuth scope)
 *   node scripts/migrate-to-r2.mjs --dry-run           # list what would be uploaded
 *   node scripts/migrate-to-r2.mjs --bucket NAME       # override bucket (default: open-artifacts)
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  extractTitleFromHtml,
  extractDescriptionFromHtml,
  isValidUuid4
} from '../worker/sanitize.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(PROJECT_ROOT, 'data', 'artifacts');

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const dryRun = args.includes('--dry-run');
const bucketFlag = args.indexOf('--bucket');
const bucket = bucketFlag !== -1 ? args[bucketFlag + 1] : 'open-artifacts';
const persistFlag = args.indexOf('--persist-to');
const persistTo = persistFlag !== -1 ? args[persistFlag + 1] : null;

function putObject(key, filePath, contentType) {
  if (dryRun) {
    console.log(`[dry-run] put ${bucket}/${key}  <- ${path.relative(PROJECT_ROOT, filePath)}`);
    return;
  }
  const cliArgs = [
    'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
    '--file', filePath,
    '--content-type', contentType,
    remote ? '--remote' : '--local'
  ];
  if (!remote && persistTo) cliArgs.push('--persist-to', persistTo);

  const res = spawnSync('npx', cliArgs, { cwd: PROJECT_ROOT, encoding: 'utf-8' });
  if (res.error) {
    throw new Error(`wrangler r2 object put failed to spawn for ${key}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`wrangler r2 object put failed for ${key}:\n${res.stderr || res.stdout}`);
  }
  console.log(`  ✓ ${bucket}/${key}`);
}

async function synthesizeMeta(uuid, dir, versionFiles) {
  const versions = [];
  for (const { versionNumber, filePath } of versionFiles) {
    // Hash the raw bytes (not a decoded string) so synthesized hashes match
    // what the Worker computes for the same file.
    const rawBytes = await fsPromises.readFile(filePath);
    const stat = await fsPromises.stat(filePath);
    versions.push({
      versionNumber,
      description: versionNumber === 1 ? '' : `Version ${versionNumber} update`,
      filePath: `artifacts/${uuid}/v${versionNumber}.html`,
      fileSize: stat.size,
      contentHash: crypto.createHash('sha256').update(rawBytes).digest('hex'),
      createdAt: stat.mtime.toISOString()
    });
  }
  versions.sort((a, b) => a.versionNumber - b.versionNumber);

  const firstContent = await fsPromises.readFile(versionFiles[0].filePath, 'utf-8');
  const latest = versions[versions.length - 1];

  return {
    _id: uuid,
    title: extractTitleFromHtml(firstContent),
    description: extractDescriptionFromHtml(firstContent),
    latestVersion: latest.versionNumber,
    viewCount: 0,
    versions,
    createdAt: versions[0].createdAt,
    updatedAt: latest.createdAt
  };
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const entries = await fsPromises.readdir(SOURCE_DIR, { withFileTypes: true });
  const artifactDirs = entries
    .filter(e => e.isDirectory() && e.name !== 'tmp' && isValidUuid4(e.name))
    .map(e => e.name)
    .sort();

  console.log(`Migrating ${artifactDirs.length} artifact(s) from ${SOURCE_DIR}`);
  console.log(`Target: ${remote ? 'REMOTE R2' : `local simulator (${persistTo || '.wrangler/state'})`}, bucket "${bucket}"\n`);

  let migrated = 0;
  let synthesized = 0;
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oa-migrate-'));

  try {
    for (const uuid of artifactDirs) {
      const dir = path.join(SOURCE_DIR, uuid);
      const files = await fsPromises.readdir(dir);
      const versionFiles = files
        .map(f => {
          const m = f.match(/^v(\d+)\.html$/);
          return m ? { versionNumber: parseInt(m[1], 10), filePath: path.join(dir, f) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.versionNumber - b.versionNumber);

      if (versionFiles.length === 0) {
        console.warn(`  ! Skipping ${uuid}: no vN.html files`);
        continue;
      }

      console.log(`- ${uuid} (${versionFiles.length} version(s))`);

      for (const { versionNumber, filePath } of versionFiles) {
        putObject(`artifacts/${uuid}/v${versionNumber}.html`, filePath, 'text/html; charset=utf-8');
      }

      let metaPath = path.join(dir, 'meta.json');
      if (!fs.existsSync(metaPath)) {
        const meta = await synthesizeMeta(uuid, dir, versionFiles);
        metaPath = path.join(tmpDir, `${uuid}-meta.json`);
        await fsPromises.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        synthesized++;
        console.log(`    (synthesized missing meta.json: "${meta.title}")`);
      }
      putObject(`artifacts/${uuid}/meta.json`, metaPath, 'application/json');

      migrated++;
    }
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }

  const prefix = dryRun ? '[DRY RUN] Nothing uploaded. Would have migrated' : 'Done. Migrated';
  console.log(`\n${prefix} ${migrated}/${artifactDirs.length} artifact(s) (${synthesized} meta.json synthesized).`);
}

main().catch((err) => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
