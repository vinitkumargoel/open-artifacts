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
- **Token-Gated Reads and Writes**: One `ARTIFACT_ACCESS_TOKEN` guards publishing, deletion *and* viewing. CLI clients send it as a bearer header; browsers exchange it once at `/unlock` for a 7-day read-scope cookie. Comparisons pre-hash with SHA-256 for constant time.
- **Version Diffs**: `GET /a/:uuid/diff?from=N&to=M` compares any two versions three ways — HTML source (word-level, pretty-printed), the two pages rendered side by side or overlaid, and block-level prose. The diff runs in the browser; the Worker never does the O(ND) work.
- **Automatic Retention (TTL)**: Every artifact carries `ttlDays`/`expiresAt`, defaulting to 30 days from the last publish. Expired artifacts return `410` immediately and are deleted by a daily cron sweep. `ttl=never` pins an artifact indefinitely.
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

The Worker is an [Astro](https://astro.build) app (`src/`, built with `@astrojs/cloudflare`): pages and API endpoints live in `src/pages/`, the cross-cutting CORS / rate-limit / security-header stack in `src/middleware.js`, and `src/worker.js` is the custom Worker entry that exports the `RateLimiterDO` Durable Object. The storage, auth, and rate-limit primitives live in `worker/` as shared modules:

| Concern | Implementation |
|---|---|
| Artifact bodies & metadata | R2 bucket (`artifacts/{uuid}/v{n}.html` + `meta.json`) |
| Per-visitor rate limiting | Durable Object per visitor bucket (`RateLimiterDO`, fixed 60s window, IPv6 /64 bucketing) |
| Publisher token | Worker secret (`ARTIFACT_ACCESS_TOKEN`) |
| Static assets | Workers Assets via the Astro build (`public/`) |
| Views | Astro pages & components (`src/pages/`, `src/components/`) |

### Bindings & secrets

`wrangler.toml` declares the R2 bucket binding (`ARTIFACTS` → bucket `open-artifacts`), the Durable Object namespace (`RATE_LIMITER`), the daily expiry cron (`[triggers] crons`), and vars for file size, rate limits, auth and retention. The only secret is the access token:

```bash
npx wrangler r2 bucket create open-artifacts        # one-time
npx wrangler secret put ARTIFACT_ACCESS_TOKEN       # publisher token
npm run deploy                                      # astro build && wrangler deploy
```

| Var | Default | Purpose |
|---|---|---|
| `READ_AUTH_ENABLED` | `1` | Set to `0` to make every read public again. |
| `SESSION_EPOCH` | `1` | Bump to revoke every session cookie and capability URL. |
| `SESSION_RATE_LIMIT_PER_MIN` | `20` | Per-visitor budget for unlock attempts and rejected reads. |
| `AUTH_FAILURE_LIMIT_PER_MIN` | `600` | Instance-wide ceiling on credential failures. |
| `DEFAULT_TTL_DAYS` | `30` | Retention for a new artifact that sends no `ttl`. |
| `EXPIRY_SWEEP_ENABLED` | `0` | The cron logs what it *would* delete until this is `1`. |

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
- `ttl`: Retention in days, or `never` / `0` (*optional; defaults to `DEFAULT_TTL_DAYS`, or the artifact's current setting on an update*)

**Response (`201 Created`):**
```json
{
  "id": "a81c2d94-3450-48e2-b13c-0e241764df8a",
  "version": 1,
  "title": "Q3 Sales Performance",
  "description": "Interactive revenue charts",
  "isNew": true,
  "ttlDays": 30,
  "expiresAt": "2026-09-14T12:00:00.000Z",
  "url": "https://artifact.vinitk.dev/a/a81c2d94-3450-48e2-b13c-0e241764df8a",
  "rawUrl": "https://artifact.vinitk.dev/raw/a81c2d94-3450-48e2-b13c-0e241764df8a/1",
  "createdAt": "2026-08-15T12:00:00.000Z"
}
```

### 2. Get Metadata & Version History (Protected)
```http
GET /api/artifacts/:uuid
Authorization: Bearer <TOKEN>
```
Returns every version with its `versionNumber`, `description`, `fileSize`,
`contentHash` and `createdAt`, plus the artifact's `ttlDays` / `expiresAt`.

### 3. Change Retention Without Publishing (Protected)
```http
PATCH /api/artifacts/:uuid
Authorization: Bearer <TOKEN>
Content-Type: application/json

{"ttl": "never"}
```
`ttl` is a day count, or `never` / `0` to keep the artifact indefinitely. The
clock restarts from now.

### 4. Delete Artifact (Protected)
```http
DELETE /api/artifacts/:uuid
Authorization: Bearer <TOKEN>
```

### 5. Browser Session (Unlock)
```http
POST /api/session          # Authorization: Bearer <TOKEN> -> Set-Cookie: oa_session
DELETE /api/session        # clears it
```
The cookie is a stateless HMAC over an expiry and a nonce, keyed by an HKDF
subkey of the token — the token itself is never in the cookie. It authorises
**reads only**; write endpoints ignore it entirely.

### 6. Web Viewer (Protected)
- `GET /a/:uuid` — viewer shell, latest version
- `GET /a/:uuid/v/:version` — viewer shell pinned to a version
- `GET /a/:uuid/diff?from=N&to=M` — compare two versions (source / rendered / prose)
- `GET /unlock?next=<path>` — token entry; open, and where the routes above
  redirect a browser that has no session

### 7. Direct Sandboxed HTML Stream (Protected)
- `GET /raw/:uuid` (302 redirects to latest version)
- `GET /raw/:uuid/:version` (Streams raw HTML with opaque sandbox CSP header)

Because an `<iframe>` navigation cannot carry an `Authorization` header, the
viewer shell signs each frame URL with a short-lived capability
(`?exp=…&sig=…`) scoped to that one uuid and version.

### Reading from a script or agent

`WebFetch` cannot set headers and will always get a 401. Use curl:

```bash
OA=https://artifact.vinitk.dev
curl -s -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" "$OA/raw/<uuid>/<version>" -o artifact.html
curl -s -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" "$OA/api/artifacts" | jq
```

...or the bundled CLI, which resolves the token from the environment or
`~/.claude/open-artifacts.json`:

```bash
node bin/open-artifacts.js --list
node bin/open-artifacts.js --fetch <uuid>[@version] -o artifact.html
node bin/open-artifacts.js ./report.html --title "Q3" --ttl 90
```

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
5. **Read/Write Scope Separation**: The browser session cookie authorises reads only. It is sent on same-site subresource requests made from *inside* a published artifact, so honouring it for writes would make every artifact a CSRF weapon — `authGuard` never looks at it, and an e2e test asserts a cookie-only `DELETE` returns 401.
6. **Bounded Credential Guessing**: Rejected reads and unlock attempts are counted against their own per-visitor budget (never the read budget) plus an instance-wide window, so a distributed attacker cannot buy extra guesses by spreading across source addresses.
7. **Revocation Without Rotation**: Bumping `SESSION_EPOCH` invalidates every outstanding cookie and capability URL, since it is folded into the HKDF salt — no need to rotate the token and break every CLI consumer.

---

## ⏳ Retention

Artifacts are deleted automatically when their retention lapses.

| Setting | Effect |
|---|---|
| `ttl` omitted, new artifact | `DEFAULT_TTL_DAYS` (30) |
| `ttl` omitted, update | keeps the artifact's current setting |
| `ttl=7` | 7 days from now |
| `ttl=never` (or `0`) | never expires |

Publishing a new version re-clocks the expiry; reading does not. Two layers
enforce it: a lazy `isExpired()` check that makes every read path return `410`
whether or not the sweep has run, and a daily cron (`0 3 * * *`) that performs
the deletion. The cron stays in dry-run until `EXPIRY_SWEEP_ENABLED=1`.

`scripts/backfill-ttl.mjs` gives pre-TTL artifacts `expiresAt = updatedAt + 30d`;
it is dry-run unless passed `--apply`.

## 🖼️ Images and assets

There is no asset store — an artifact is one self-contained HTML file, so
images have to be inline `data:` URIs. Base64 costs ~4/3 of the raw bytes,
every version stores its own copy, and anything fetching the HTML pays for the
whole payload. Fine for icons and small charts; the hard cap is
`MAX_FILE_SIZE_MB` (25). The upload portal shows what fraction of a file its
`data:` URIs account for and warns past 40% or 1 MB.

---

## 📄 License
MIT &copy; Vinit & Antigravity
