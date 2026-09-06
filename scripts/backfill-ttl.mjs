#!/usr/bin/env node
/**
 * One-time backfill: gives every artifact published before TTL existed an
 * expiry of `updatedAt + TTL_DAYS`.
 *
 * Artifacts that already carry an `expiresAt`, and artifacts explicitly pinned
 * with `ttlDays: null`, are left alone — so this is safe to re-run.
 *
 * Discovery goes through GET /api/artifacts (R2 has no CLI list command);
 * reads and writes go through `wrangler r2 object`.
 *
 * Usage:
 *   node scripts/backfill-ttl.mjs                    # dry run against production
 *   node scripts/backfill-ttl.mjs --apply            # actually write
 *   node scripts/backfill-ttl.mjs --days 60          # non-default retention
 *   node scripts/backfill-ttl.mjs --local            # local simulator instead of real R2
 *   node scripts/backfill-ttl.mjs --local --persist-to DIR
 *   node scripts/backfill-ttl.mjs --server URL       # override discovery origin
 *   node scripts/backfill-ttl.mjs --token TOKEN      # bearer token for discovery
 */
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { isValidUuid4 } from '../worker/sanitize.js';
import { DEFAULT_TTL_DAYS, computeExpiresAt } from '../worker/storage.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const apply = args.includes('--apply');
const local = args.includes('--local');
const bucket = flag('--bucket', 'open-artifacts');
const persistTo = flag('--persist-to', null);
const days = parseInt(flag('--days', String(DEFAULT_TTL_DAYS)), 10);
const server = (flag('--server', process.env.OPEN_ARTIFACTS_URL || 'https://artifact.vinitk.dev')).replace(/\/+$/, '');
const token = flag('--token', process.env.ARTIFACT_ACCESS_TOKEN || process.env.OPEN_ARTIFACTS_TOKEN || '');

if (!Number.isFinite(days) || days <= 0) {
  console.error(`--days must be a positive integer (got "${flag('--days')}")`);
  process.exit(1);
}

function r2(cliArgs) {
  const full = ['wrangler', 'r2', 'object', ...cliArgs, local ? '--local' : '--remote'];
  if (local && persistTo) full.push('--persist-to', persistTo);
  const res = spawnSync('npx', full,
    { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(`wrangler failed to spawn: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`wrangler exited ${res.status}:\n${res.stderr || res.stdout}`);
  return res.stdout;
}

async function discoverIds() {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${server}/api/artifacts`, { headers });
  if (!res.ok) {
    throw new Error(`GET ${server}/api/artifacts returned ${res.status}. `
      + (res.status === 401 ? 'Pass --token or set ARTIFACT_ACCESS_TOKEN.' : ''));
  }
  const body = await res.json();
  return (body.artifacts || []).map(a => a.id).filter(isValidUuid4);
}

function fmtDays(iso, now) {
  return Math.round((Date.parse(iso) - now) / 86400000);
}

async function main() {
  console.log(`Backfilling ${days}-day retention from each artifact's updatedAt.`);
  console.log(`Discovery: ${server}/api/artifacts    Store: ${local ? 'local simulator' : 'REMOTE R2'} (${bucket})`);
  console.log(apply ? '\nMODE: APPLY — metadata will be rewritten.\n' : '\nMODE: DRY RUN — nothing will be written. Re-run with --apply.\n');

  const ids = await discoverIds();
  console.log(`Found ${ids.length} artifact(s).\n`);

  const now = Date.now();
  const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'oa-ttl-'));
  const planned = [];
  let skipped = 0;
  let failed = 0;

  try {
    for (const id of ids) {
      let meta;
      try {
        meta = JSON.parse(r2(['get', `${bucket}/artifacts/${id}/meta.json`, '--pipe']));
      } catch (err) {
        console.warn(`  ! ${id}: could not read meta.json — ${err.message.split('\n')[0]}`);
        failed++;
        continue;
      }

      if (meta.expiresAt) { skipped++; continue; }
      // An explicit null ttlDays is a deliberate "keep forever" — never override it.
      if ('ttlDays' in meta && meta.ttlDays === null) { skipped++; continue; }

      const base = meta.updatedAt || meta.createdAt;
      if (!base || !Number.isFinite(Date.parse(base))) {
        console.warn(`  ! ${id}: no usable updatedAt/createdAt — skipping`);
        failed++;
        continue;
      }

      const expiresAt = computeExpiresAt(days, new Date(base));
      planned.push({ id, title: meta.title || '(untitled)', base, expiresAt });

      if (apply) {
        const updated = { ...meta, ttlDays: days, expiresAt };
        const tmp = path.join(tmpDir, `${id}.json`);
        await fsPromises.writeFile(tmp, JSON.stringify(updated, null, 2), 'utf-8');
        r2(['put', `${bucket}/artifacts/${id}/meta.json`, '--file', tmp, '--content-type', 'application/json']);
      }
    }
  } finally {
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
  }

  planned.sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));

  console.log(`${apply ? 'Updated' : 'Would update'} ${planned.length} artifact(s); ${skipped} already had a retention policy; ${failed} failed.\n`);
  if (planned.length) {
    const overdue = planned.filter(p => Date.parse(p.expiresAt) <= now);
    console.log('  days  expires                   title');
    console.log('  ----  ------------------------  -----');
    for (const p of planned) {
      const d = fmtDays(p.expiresAt, now);
      console.log(`  ${String(d).padStart(4)}  ${p.expiresAt}  ${p.title.slice(0, 48)}`);
    }
    if (overdue.length) {
      console.log(`\n  !! ${overdue.length} artifact(s) are ALREADY PAST their computed expiry`);
      console.log('     and will be deleted by the first sweep. Pin them first with:');
      console.log(`       curl -X PATCH -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \\`);
      console.log(`            -H 'content-type: application/json' -d '{"ttl":"never"}' \\`);
      console.log(`            ${server}/api/artifacts/<uuid>`);
    }
  }
}

main().catch((err) => {
  console.error('\nBackfill failed:', err.message);
  process.exit(1);
});
