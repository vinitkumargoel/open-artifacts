# OpenArtifacts (open-artifacts)

> Self-Hosted HTML Artifact Publishing, Versioning & Sandboxed Viewer Service.

**OpenArtifacts** is a lightweight, high-performance service designed to host, version, and render interactive standalone HTML artifacts (Claude Code artifacts, charts, dashboards, WebGL, React builds, reports) with permanent UUID-4 URLs, zero-trust sandbox execution, and token authorization. It runs as an [Astro](https://astro.build) app on Cloudflare Workers with R2 storage — live at **https://artifact.vinitk.dev**.

---

## ⚡ Key Features

- **Permanent UUID-4 Identifiers**: Every artifact gets an immutable UUID-4 (e.g. `https://artifacts.example.com/a/a81c2d94-3450-48e2-b13c-0e241764df8a`).
- **Atomic Versioning Engine**: Update an artifact with a new file or changelog note to automatically increment to `v2`, `v3`, while root URLs always render the latest release and historical versions remain pinned.
- **Zero-Trust Iframe Sandbox**: Direct `/raw` streams enforce `Content-Security-Policy: sandbox allow-scripts allow-forms allow-popups allow-modals;` yielding an opaque/null origin that isolates host credentials and cookies.
- **Top Viewer Section**: Prominently displays Artifact Name, Description, and a Version Dropdown defaulting to the latest version.
- **Responsive Viewport Previews**: Toggle between Desktop (100%), Tablet (768px), and Mobile (375px), with Fullscreen and Copy Link controls.
- **Timing-Safe Token Authentication**: Publishing and deletion endpoints require `ARTIFACT_ACCESS_TOKEN` using pre-hashed SHA-256 constant-time comparison.
- **Claude Code Skill (`/open-artifacts`)**: Built-in CLI skill to publish directly from Claude Code sessions with a single command.
- **R2 Object Storage**: Artifact bodies and sidecar `meta.json` metadata live in a Cloudflare R2 bucket (`artifacts/{uuid}/v{n}.html` + `meta.json`) — no database to run.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/vinitk/open-artifacts.git
cd open-artifacts
npm install
```

### 2. Environment Setup
Copy `.dev.vars.example` to `.dev.vars` and set your secret access token for local development:
```bash
cp .dev.vars.example .dev.vars
```

### 3. Run Locally
```bash
# Astro dev server (Cloudflare workerd runtime with local R2 + DO bindings)
npm run dev

# Run unit & integration tests (builds the Astro Worker first)
npm test
```

---

## ☁️ Architecture (Astro on Cloudflare Workers + R2)

The Worker is an [Astro](https://astro.build) app (`astro/`, built with `@astrojs/cloudflare`): pages and API endpoints live in `astro/pages/`, the cross-cutting CORS / rate-limit / security-header stack in `astro/middleware.js`, and `astro/worker.js` is the custom Worker entry that exports the `RateLimiterDO` Durable Object. The storage, auth, and rate-limit primitives live in `worker/` as shared modules:

| Concern | Implementation |
|---|---|
| Artifact bodies & metadata | R2 bucket (`artifacts/{uuid}/v{n}.html` + `meta.json`) |
| Per-visitor rate limiting | Durable Object per visitor bucket (`RateLimiterDO`, fixed 60s window, IPv6 /64 bucketing) |
| Publisher token | Worker secret (`ARTIFACT_ACCESS_TOKEN`) |
| Static assets | Workers Assets via the Astro build (`public/`) |
| Views | Astro pages & components (`astro/pages/`, `astro/components/`) |

### Bindings & secrets

`wrangler.toml` declares the R2 bucket binding (`ARTIFACTS` → bucket `open-artifacts`), the Durable Object namespace (`RATE_LIMITER`), and vars for file size and rate limits. The only secret is the publisher token:

```bash
npx wrangler r2 bucket create open-artifacts        # one-time
npx wrangler secret put ARTIFACT_ACCESS_TOKEN       # publisher token
npm run deploy                                      # astro build && wrangler deploy
```

The custom domain (`artifact.vinitk.dev`) is configured via `routes` in `wrangler.toml`; when unset, absolute URLs fall back to the request origin (`BASE_URL` var overrides). `astro build` emits the resolved Worker bundle and `dist/server/wrangler.json`; wrangler picks it up automatically through the `.wrangler/deploy/config.json` redirect, so plain `wrangler deploy` / `wrangler dev` always operate on the built output.

### Local development

```bash
cp .dev.vars.example .dev.vars   # set ARTIFACT_ACCESS_TOKEN for local dev
npm run dev                      # astro dev in workerd, with live R2 + DO bindings
npm run migrate:r2               # copy data/artifacts/ into the local R2 simulator
npm run preview                  # astro build && wrangler dev (the exact deploy artifact)
```

### Migrating existing artifacts

`scripts/migrate-to-r2.mjs` copies the legacy Express-era disk layout (`data/artifacts/`) into R2 one-to-one, synthesizing `meta.json` for legacy directories that lack it:

```bash
npm run migrate:r2          # into the local wrangler dev store
npm run migrate:r2:remote   # into the production R2 bucket
```

### E2E tests

`npm run test:e2e` (also part of `npm test`) builds the Astro Worker, migrates the real `data/artifacts/` into a throwaway local R2 store, boots the built Worker under `wrangler dev`, and exercises the full HTTP lifecycle: migrated artifacts served byte-identical, upload → view → raw → history → bulk delete, auth failures, the 100-item bulk-delete batch limit, and per-visitor rate limiting (including IPv6 /64 bucketing). `TRUST_VISITOR_HEADER=1` is an E2E-only var that lets tests simulate distinct visitors — never set it on a deployed environment.

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
  "url": "https://artifact.vinitk.dev/a/a81c2d94-3450-48e2-b13c-0e241764df8a",
  "rawUrl": "https://artifact.vinitk.dev/raw/a81c2d94-3450-48e2-b13c-0e241764df8a/1",
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
4. **Path Traversal Defenses**: Strict UUID-4 regex validation and integer version casting ensure R2 object keys stay locked inside the `artifacts/{uuid}/` layout.

---

## 📄 License
MIT &copy; Vinit & Antigravity
