#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
  ==============================================================
  📦 OpenArtifacts CLI Publisher
  ==============================================================

  Usage:
    open-artifacts <file_path> [options]

  Options:
    --title "<text>"          Custom artifact title
    --description "<text>"    Description / version release note
    --id "<uuid-4>"           Existing UUID-4 to publish next version
    --server "<url>"          Server URL (default: $OPEN_ARTIFACTS_URL or http://localhost:3008)
    --token "<token>"         Access token (default: $ARTIFACT_ACCESS_TOKEN)

  Examples:
    open-artifacts ./report.html --title "Q3 Sales Analytics"
    open-artifacts ./report.html --id "a81c2d94-3450-48e2-b13c-0e241764df8a"
  ==============================================================
  `);
  process.exit(0);
}

const filePath = args[0];
if (!filePath || !fs.existsSync(filePath)) {
  console.error(`Error: File "${filePath}" does not exist.`);
  process.exit(1);
}

let title = '';
let description = '';
let id = '';
let serverUrl = process.env.OPEN_ARTIFACTS_URL || process.env.BASE_URL || 'http://localhost:3008';
let token = process.env.ARTIFACT_ACCESS_TOKEN || process.env.OPEN_ARTIFACTS_TOKEN || '';

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--title' && args[i + 1]) {
    title = args[++i];
  } else if (args[i] === '--description' && args[i + 1]) {
    description = args[++i];
  } else if (args[i] === '--id' && args[i + 1]) {
    id = args[++i];
  } else if (args[i] === '--server' && args[i + 1]) {
    serverUrl = args[++i];
  } else if (args[i] === '--token' && args[i + 1]) {
    token = args[++i];
  }
}

serverUrl = serverUrl.replace(/\/+$/, '');

async function publish() {
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  const formData = new FormData();
  formData.append('file', new Blob([fileContent], { type: 'text/html' }), fileName);
  if (title) formData.append('title', title);
  if (description) formData.append('description', description);
  if (id) formData.append('id', id);

  console.log(`Publishing "${fileName}" to ${serverUrl}...`);

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${serverUrl}/api/artifacts`, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`\n❌ Failed to publish (${res.status}):`, data.error?.message || data);
    process.exit(1);
  }

  console.log(`
  ✅ Successfully Published Artifact!
  -------------------------------------------------------------
  • ID:            ${data.id}
  • Title:         ${data.title}
  • Version:       v${data.version} ${data.isNew ? '(New)' : '(Updated)'}
  • Public Viewer: ${data.url}
  • Direct Raw:    ${data.rawUrl}
  -------------------------------------------------------------
  `);
}

publish().catch(err => {
  console.error('Fatal CLI Error:', err.message);
  process.exit(1);
});
