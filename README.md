# OpenArtifacts (open-artifacts)

> Self-Hosted HTML Artifact Publishing, Versioning & Sandboxed Viewer Service.

**OpenArtifacts** is a lightweight, high-performance Node.js service designed to host, version, and render interactive standalone HTML artifacts (Claude Code artifacts, charts, dashboards, WebGL, React builds, reports) with permanent UUID-4 URLs, zero-trust sandbox execution, and token authorization.

---

## ⚡ Key Features

- **Permanent UUID-4 Identifiers**: Every artifact gets an immutable UUID-4 (e.g. `https://artifacts.example.com/a/a81c2d94-3450-48e2-b13c-0e241764df8a`).
- **Atomic Versioning Engine**: Update an artifact with a new file or changelog note to automatically increment to `v2`, `v3`, while root URLs always render the latest release and historical versions remain pinned.
- **Zero-Trust Iframe Sandbox**: Direct `/raw` streams enforce `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals;` yielding an opaque/null origin that isolates host credentials and cookies.
- **Top Viewer Section**: Prominently displays Artifact Name, Description, and a Version Dropdown defaulting to the latest version.
- **Responsive Viewport Previews**: Toggle between Desktop (100%), Tablet (768px), and Mobile (375px), with Fullscreen and Copy Link controls.
- **Timing-Safe Token Authentication**: Publishing and deletion endpoints require `ARTIFACT_ACCESS_TOKEN` using pre-hashed SHA-256 constant-time comparison.
- **Claude Code Skill (`/open-artifacts`)**: Built-in CLI skill to publish directly from Claude Code sessions with a single command.
- **Hybrid Storage Engine**: MongoDB for metadata queries + local disk streaming with sidecar `meta.json` for 100% self-contained offline durability.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/vinitk/open-artifacts.git
cd open-artifacts
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env` and set your secret access token:
```bash
cp .env.example .env
```

Edit `.env`:
```ini
PORT=3008
NODE_ENV=production
BASE_URL=https://artifacts.yourdomain.com
ARTIFACT_ACCESS_TOKEN=your_secret_access_token_here
MONGO_URI=mongodb://127.0.0.1:27017/open_artifacts
STORAGE_PATH=./data/artifacts
MAX_FILE_SIZE_MB=25
```

### 3. Run Locally
```bash
# Development mode with watch
npm run dev

# Run unit & integration tests
npm test

# Production start
npm start
```

---

## ☁️ Serverless Deployment (Cloudflare Workers + R2)

The service also runs fully serverless on Cloudflare — live at **https://artifact.vinitk.dev**. The Worker (`worker/index.js`) reuses the same views and API surface as the Express app; only the platform layer differs:

| Concern | Express (self-hosted) | Cloudflare Worker |
|---|---|---|
| Artifact bodies & metadata | Local disk + MongoDB | R2 bucket (`artifacts/{uuid}/v{n}.html` + `meta.json`) |
| Per-visitor rate limiting | `express-rate-limit` in-memory | Durable Object per visitor bucket (`RateLimiterDO`) |
| Publisher token | `.env` | Worker secret |
| Static assets | `express.static` | Workers Assets (`public/`) |

### Bindings & secrets

`wrangler.toml` declares the R2 bucket binding (`ARTIFACTS` → bucket `open-artifacts`), the Durable Object namespace (`RATE_LIMITER`), and vars for file size and rate limits. The only secret is the publisher token:

```bash
npx wrangler r2 bucket create open-artifacts        # one-time
npx wrangler secret put ARTIFACT_ACCESS_TOKEN       # publisher token
npm run deploy                                      # wrangler deploy
```

The custom domain (`artifact.vinitk.dev`) is configured via `routes` in `wrangler.toml`; when unset, absolute URLs fall back to the request origin (`BASE_URL` var overrides).

### Local development

```bash
cp .dev.vars.example .dev.vars   # set ARTIFACT_ACCESS_TOKEN for local dev
npm run migrate:r2               # copy data/artifacts/ into the local R2 simulator
npm run dev:worker               # wrangler dev on http://localhost:8787
```

### Migrating existing artifacts

`scripts/migrate-to-r2.mjs` copies the disk layout (`data/artifacts/`) into R2 one-to-one, synthesizing `meta.json` for legacy directories that lack it:

```bash
npm run migrate:r2          # into the local wrangler dev store
npm run migrate:r2:remote   # into the production R2 bucket
```

### E2E tests

`npm run test:e2e` (also part of `npm test`) migrates the real `data/artifacts/` into a throwaway local R2 store, boots the Worker under `wrangler dev`, and exercises the full HTTP lifecycle: migrated artifacts served byte-identical, upload → view → raw → history → bulk delete, auth failures, the 100-item bulk-delete batch limit, and per-visitor rate limiting (including IPv6 /64 bucketing). `TRUST_VISITOR_HEADER=1` is an E2E-only var that lets tests simulate distinct visitors — never set it on a deployed environment.

---

## 🖥️ Home Server & PM2 Deployment

To run OpenArtifacts as a resilient background daemon on your Home Server:

```bash
# Start via PM2
pm2 start ecosystem.config.cjs

# Save PM2 state for automatic server reboot persistence
pm2 save
pm2 startup
```

---

## 📖 API Reference

### 1. Publish / Upload Artifact
```http
POST /api/artifacts
Authorization: Bearer <TOKEN>
Content-Type: multipart/form-data
```

**Form Fields:**
- `file`: Standalone HTML file (*required*)
- `title`: Artifact Title (*optional, defaults to `<title>` in HTML*)
- `description`: Summary / changelog notes (*optional*)
- `id`: Existing UUID-4 (*optional, pass to create next version*)

**Response (`201 Created`):**
```json
{
  "id": "a81c2d94-3450-48e2-b13c-0e241764df8a",
  "version": 1,
  "title": "Q3 Sales Performance",
  "description": "Interactive revenue charts",
  "isNew": true,
  "url": "http://localhost:3008/a/a81c2d94-3450-48e2-b13c-0e241764df8a",
  "rawUrl": "http://localhost:3008/raw/a81c2d94-3450-48e2-b13c-0e241764df8a/1",
  "createdAt": "2026-08-15T12:00:00.000Z"
}
```

### 2. Get Metadata & Version History (Public)
```http
GET /api/artifacts/:uuid
```

### 3. Delete Artifact (Protected)
```http
DELETE /api/artifacts/:uuid
Authorization: Bearer <TOKEN>
```

### 4. Public Web Viewer
- `GET /a/:uuid` (Renders viewer shell with latest version)
- `GET /a/:uuid/v/:version` (Renders viewer shell pinned to specific version)

### 5. Direct Sandboxed HTML Stream
- `GET /raw/:uuid` (302 redirects to latest version)
- `GET /raw/:uuid/:version` (Streams raw HTML with opaque sandbox CSP header)

---

## 🤖 Claude Code Skill (`/open-artifacts`)

The companion skill is located at `~/.claude/skills/open-artifacts/SKILL.md`.

```bash
# Publish new artifact from Claude Code
/open-artifacts ./dist/report.html --title "Q3 Financials"

# Publish version 2
/open-artifacts ./dist/report.html --id "a81c2d94-3450-48e2-b13c-0e241764df8a" --description "Added dark mode"
```

---

## 🔒 Security Model

1. **Opaque Sandbox Execution**: Served with `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals;` and `X-Content-Type-Options: nosniff`.
2. **Context-Aware Sanitization**: All user-controlled titles and descriptions are HTML-escaped before interpolation into viewer shells and OpenGraph meta tags.
3. **Timing-Safe Auth**: Token comparisons pre-hash with SHA-256 to guarantee 32-byte buffers and prevent length-oracle timing leaks.
4. **Path Traversal Defenses**: Strict UUID-4 regex validation and integer version casting ensure requests remain locked inside `STORAGE_PATH`.

---

## 📄 License
MIT &copy; Vinit & Antigravity
