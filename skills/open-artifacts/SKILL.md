---
name: open-artifacts
description: Publish, version, read and expire standalone interactive HTML artifacts (dashboards, charts, games, documents, reports) on the OpenArtifacts service (Astro SSR on Cloudflare Workers + R2). Use when the user asks to "publish this artifact", "host this HTML", "share this artifact", "publish with open-artifacts", to update an existing artifact version, or to read/download an artifact that returns 401. Returns a viewer URL, direct raw URL, and assigned UUID-4.
---

# OpenArtifacts Publisher Skill

Publish and version standalone interactive HTML files (dashboards, reports, games, charts) on **OpenArtifacts**.

> **Reads are token-gated.** Every `/a/…` and `/raw/…` URL, and every
> `GET /api/artifacts…`, requires the access token. `WebFetch` cannot send
> headers, so **`WebFetch` on an artifact URL always returns 401** — use `curl`
> or `bin/open-artifacts.js --fetch`. A link handed to a human works too, but
> they will be asked for the token once per browser.

## Where the server is

OpenArtifacts runs serverless on Cloudflare Workers + R2 (Worker `open-artifacts`,
repo `~/Official/work/antigravity/vinitk_artifacts`, entry `src/worker.js`).

| | |
|---|---|
| Publish, read, API — and the links you hand the user | `https://artifact.vinitk.dev` |
| Health check (open, no token) | `GET https://artifact.vinitk.dev/healthz` → 200 |
| Storage | R2 bucket `open-artifacts` (`artifacts/{uuid}/v{n}.html` + `meta.json`) |

Publish directly against the public URL — no LAN/Tailscale hop, no URL swapping.

## Usage

```bash
/open-artifacts <file_path> [--title "<title>"] [--description "<desc>"] [--id "<uuid>"] [--ttl <days|never>]
```

### Options

| Option | Description |
|---|---|
| `<file_path>` | **Required.** Path to the standalone `.html` file on disk. |
| `--title "<title>"` | *Optional.* Title. If omitted, the server parses `<title>` from the HTML. |
| `--description "<desc>"` | *Optional.* Summary, or the changelog note for this version. |
| `--id "<uuid>"` | *Optional.* Existing UUID-4 to update — publishes the next version (v2, v3, …). |
| `--ttl <days\|never>` | *Optional.* Retention. Omit for the server default (30 days) on a new artifact, or to keep the current setting on an update. |
| `--server "<url>"` | *Optional.* Defaults to `$OPEN_ARTIFACTS_URL`, else `url` from the config file. |

---

## Publishing with `curl`

```bash
OA=https://artifact.vinitk.dev

# 1. Publish a new artifact
curl -s -X POST "$OA/api/artifacts" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -F "file=@/path/to/artifact.html" \
  -F "title=Q3 Sales Analytics" \
  -F "description=Interactive revenue charts" \
  -F "ttl=90"

# Response (JSON):
# {
#   "id": "a81c2d94-3450-48e2-b13c-0e241764df8a",
#   "version": 1,
#   "title": "Q3 Sales Analytics",
#   "ttlDays": 90,
#   "expiresAt": "2026-12-05T10:14:02.000Z",
#   "url": "https://artifact.vinitk.dev/a/a81c2d94-3450-48e2-b13c-0e241764df8a",
#   "rawUrl": "https://artifact.vinitk.dev/raw/a81c2d94-3450-48e2-b13c-0e241764df8a/1"
# }
# url/rawUrl are already on the public host — report them as-is.

# 2. Publish an update / new version (v2)
curl -s -X POST "$OA/api/artifacts" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -F "file=@/path/to/artifact_v2.html" \
  -F "id=a81c2d94-3450-48e2-b13c-0e241764df8a" \
  -F "description=Added currency switcher and dark theme"
```

---

## Reading a protected artifact

An artifact URL on its own is not enough — the token has to travel with the
request. Every one of these needs `Authorization: Bearer $ARTIFACT_ACCESS_TOKEN`
(`x-access-token: <token>` also works).

```bash
OA=https://artifact.vinitk.dev
AUTH="Authorization: Bearer $ARTIFACT_ACCESS_TOKEN"

# The HTML of one version
curl -s -H "$AUTH" "$OA/raw/<uuid>/<version>" -o artifact.html

# The latest version (follow the redirect, keeping the header)
curl -sL -H "$AUTH" "$OA/raw/<uuid>" -o artifact.html

# Metadata: every version, its size, content hash, and the expiry
curl -s -H "$AUTH" "$OA/api/artifacts/<uuid>" | jq

# The whole catalogue
curl -s -H "$AUTH" "$OA/api/artifacts" | jq '.artifacts[] | {id, title, latestVersion, expiresAt}'
```

Or, equivalently, through the bundled CLI (it resolves the token the same way):

```bash
node bin/open-artifacts.js --fetch <uuid>[@version] -o artifact.html
node bin/open-artifacts.js --list
node bin/open-artifacts.js --info <uuid>
```

**Do not use `WebFetch` for these URLs.** It cannot set an `Authorization`
header, so it gets a 401 JSON envelope rather than the artifact.

### Status codes worth recognising

| Code | Meaning |
|---|---|
| `401 UNAUTHORIZED` | No token, or the wrong one. |
| `404 ARTIFACT_NOT_FOUND` / `VERSION_NOT_FOUND` | Correct token, wrong id/version. |
| `410 ARTIFACT_EXPIRED` | The retention window lapsed; the artifact is gone. |
| `429 RATE_LIMITED` | Back off for `Retry-After` seconds. |

---

## Retention (TTL)

Artifacts are deleted automatically when their retention lapses.

- Default is **30 days** from the last publish. Publishing a new version
  re-clocks it — reading does not.
- `ttl=never` (or `0`) keeps an artifact indefinitely.
- Change retention later without publishing a version:

```bash
curl -s -X PATCH "$OA/api/artifacts/<uuid>" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ttl": "never"}'
```

**Say the expiry date when you hand over a link.** A default-TTL artifact that
someone bookmarks will 410 in a month, and that is worth one sentence at
publish time.

---

## Images and other assets

There is no asset store: an artifact is a single self-contained HTML file, so
images must be inline `data:` URIs (or remote URLs the viewer can reach). That
is fine for icons and small charts, but base64 costs roughly 4/3 of the raw
bytes, **every version stores its own copy**, and anything that fetches the HTML
pays for the whole payload. Keep inline assets small; the hard cap is 25 MB per
file. The upload portal shows what fraction of a file its `data:` URIs are.

---

## Token & connection discovery

Resolved in this order:

1. Environment: `ARTIFACT_ACCESS_TOKEN` / `OPEN_ARTIFACTS_TOKEN`, and `OPEN_ARTIFACTS_URL`.
2. `~/.claude/open-artifacts.json` (mode 600):
   ```json
   {
     "url": "https://artifact.vinitk.dev",
     "token": "your_secret_access_token_here"
   }
   ```
   `url` is both the publish target and the reported host. **Never print `token`.**
3. Project `.env` in the current working directory.

The live token is a Worker secret. `npx wrangler secret put ARTIFACT_ACCESS_TOKEN`
in the repo rotates it — update the config file to match, since rotating
invalidates every browser session and every agent's stored token at once. A
local copy lives in the repo's gitignored `.artifact-token.production`.

---

## Output response guidance

When reporting back after publishing:

- State that the artifact was published.
- Output the **viewer link**: `[View Artifact](https://artifact.vinitk.dev/a/<uuid>)`.
- Output the **direct raw link**: `https://artifact.vinitk.dev/raw/<uuid>/<version>`.
- Give the **UUID-4** and **version number**, so the next iteration can use `--id <uuid>`.
- Give the **expiry date** (or say it is kept forever).
- Mention that opening the link asks for the access token once per browser.
