#!/usr/bin/env node

/**
 * OpenArtifacts CLI.
 *
 * Publishes artifacts, and — since reads are token-gated — also fetches and
 * lists them, so an agent handed an artifact URL has a one-liner that works.
 * A plain browser fetch or WebFetch of an artifact URL returns 401.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const args = process.argv.slice(2);

const HELP = `
  ==============================================================
  📦 OpenArtifacts CLI
  ==============================================================

  Publish:
    open-artifacts <file_path> [options]

    --title "<text>"          Custom artifact title
    --description "<text>"    Description / version release note
    --id "<uuid-4>"           Existing UUID-4 to publish next version
    --ttl <days|never>        Retention (default: server's, 30 days).
                              Omit on an update to keep the current setting.

  Read (both send the access token, which reads now require):
    open-artifacts --fetch <uuid>[@version] [-o <file>]
    open-artifacts --list [--json]
    open-artifacts --info <uuid>

  Common:
    --server "<url>"          Server URL (default: $OPEN_ARTIFACTS_URL, then
                              "url" from ~/.claude/open-artifacts.json)
    --token "<token>"         Access token (default: $ARTIFACT_ACCESS_TOKEN)

  Examples:
    open-artifacts ./report.html --title "Q3 Sales Analytics" --ttl 90
    open-artifacts ./report.html --id a81c2d94-3450-48e2-b13c-0e241764df8a
    open-artifacts --fetch a81c2d94-3450-48e2-b13c-0e241764df8a@2 -o v2.html
    open-artifacts --list
  ==============================================================
`;

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

// ------------------------------------------------------------------ options

function flagValue(name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
}

const fetchTarget = flagValue('--fetch');
const infoTarget = flagValue('--info');
const wantsList = args.includes('--list');
const outFile = flagValue('-o') || flagValue('--out');
const asJson = args.includes('--json');

const title = flagValue('--title');
const description = flagValue('--description');
const id = flagValue('--id');
const ttl = flagValue('--ttl');

let serverUrl = flagValue('--server')
  || process.env.OPEN_ARTIFACTS_URL || process.env.BASE_URL || '';
let token = flagValue('--token')
  || process.env.ARTIFACT_ACCESS_TOKEN || process.env.OPEN_ARTIFACTS_TOKEN || '';

// Fall back to the shared config file for whatever the environment didn't give.
if (!serverUrl || !token) {
  const configPath = path.join(os.homedir(), '.claude', 'open-artifacts.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!serverUrl && cfg.url) serverUrl = cfg.url;
      if (!token && cfg.token) token = cfg.token;
    } catch {
      // Ignore JSON parse errors
    }
  }
}

if (!serverUrl) serverUrl = 'http://localhost:3008';
serverUrl = serverUrl.replace(/\/+$/, '');

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function die(message, code = 1) {
  console.error(message);
  process.exit(code);
}

/** Turns the standard {error:{code,message,status}} envelope into one line. */
async function failure(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || JSON.stringify(body);
  } catch {
    detail = (await res.text().catch(() => '')).slice(0, 200);
  }
  if (res.status === 401) {
    return `401 Unauthorized — reads and writes both need ARTIFACT_ACCESS_TOKEN.\n  ${detail}`;
  }
  return `${res.status} — ${detail}`;
}

// ------------------------------------------------------------------- reading

async function runFetch(target) {
  const [uuid, versionPart] = target.split('@');
  const version = versionPart || 'latest';

  let url;
  if (version === 'latest') {
    // /raw/:uuid redirects to the newest version; follow it with the token.
    url = `${serverUrl}/raw/${uuid}`;
  } else {
    url = `${serverUrl}/raw/${uuid}/${version}`;
  }

  const res = await fetch(url, { headers: authHeaders(), redirect: 'follow' });
  if (!res.ok) die(`\n❌ Fetch failed: ${await failure(res)}`);

  const html = await res.text();
  if (outFile) {
    fs.writeFileSync(outFile, html);
    console.error(`Wrote ${html.length} bytes to ${outFile}`);
  } else {
    process.stdout.write(html);
  }
}

async function runList() {
  const res = await fetch(`${serverUrl}/api/artifacts`, { headers: authHeaders() });
  if (!res.ok) die(`\n❌ List failed: ${await failure(res)}`);

  const data = await res.json();
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rows = data.artifacts || [];
  console.log(`\n  ${rows.length} artifact(s) on ${serverUrl}\n`);
  for (const a of rows) {
    const expiry = a.expiresAt
      ? `expires ${new Date(a.expiresAt).toISOString().slice(0, 10)}`
      : 'never expires';
    console.log(`  ${a.id}  v${a.latestVersion}  ${expiry}`);
    console.log(`    ${a.title || 'Untitled'}`);
  }
  console.log('');
}

async function runInfo(uuid) {
  const res = await fetch(`${serverUrl}/api/artifacts/${uuid}`, { headers: authHeaders() });
  if (!res.ok) die(`\n❌ Lookup failed: ${await failure(res)}`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

// ----------------------------------------------------------------- publishing

async function runPublish(filePath) {
  if (!filePath || filePath.startsWith('--') || !fs.existsSync(filePath)) {
    die(`Error: File "${filePath}" does not exist.`);
  }

  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileContent], { type: 'text/html' }), fileName);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);
  if (id) formData.append('id', id);
  // Omitted entirely when unset, so an update keeps its current retention and
  // a new artifact gets the server default.
  if (ttl) formData.append('ttl', ttl);

  console.log(`Publishing "${fileName}" to ${serverUrl}...`);

  const res = await fetch(`${serverUrl}/api/artifacts`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    die(`\n❌ Failed to publish (${res.status}): ${data.error?.message || JSON.stringify(data)}`);
  }

  const retention = data.expiresAt
    ? `${data.ttlDays} days (until ${new Date(data.expiresAt).toISOString().slice(0, 10)})`
    : 'kept forever';

  console.log(`
  ✅ Successfully Published Artifact!
  -------------------------------------------------------------
  • ID:            ${data.id}
  • Title:         ${data.title}
  • Version:       v${data.version} ${data.isNew ? '(New)' : '(Updated)'}
  • Retention:     ${retention}
  • Public Viewer: ${data.url}
  • Direct Raw:    ${data.rawUrl}
  -------------------------------------------------------------
  Anyone opening those links needs the access token — the viewer
  prompts for it once and remembers it in that browser.
  `);
}

// ----------------------------------------------------------------------- main

async function main() {
  if (fetchTarget) return runFetch(fetchTarget);
  if (wantsList) return runList();
  if (infoTarget) return runInfo(infoTarget);
  return runPublish(args[0]);
}

main().catch(err => {
  console.error('Fatal CLI Error:', err.message);
  process.exit(1);
});
