---
name: open-artifacts
description: Publish and version standalone interactive HTML artifacts (dashboards, charts, games, documents, reports) to an OpenArtifacts server (self-hosted Express or serverless on Cloudflare Workers + R2). Use when the user asks to "publish this artifact", "host this HTML", "share this artifact", "publish with open-artifacts", or update an existing artifact version. Returns a public viewer URL, direct raw URL, and assigned UUID-4.
---

# OpenArtifacts Publisher Skill

Publish and version standalone interactive HTML files (dashboards, reports, games, charts) directly to your **OpenArtifacts** instance. The API is identical whether the instance is the self-hosted Express server or the serverless Cloudflare Workers + R2 deployment (`npm run deploy` in the repo); on the serverless deployment the returned `url`/`rawUrl` are already on the public host.

## Usage

When the user asks to publish or update an HTML artifact:

```bash
/open-artifacts <file_path> [--title "<title>"] [--description "<description>"] [--id "<uuid>"]
```

### Options

| Option | Description |
|---|---|
| `<file_path>` | **Required.** Path to the standalone `.html` file on disk. |
| `--title "<title>"` | *Optional.* Human-readable title for the artifact. If omitted, the server automatically parses `<title>` from the HTML file. |
| `--description "<desc>"` | *Optional.* Summary of what the artifact does or version changelog note. |
| `--id "<uuid>"` | *Optional.* Existing UUID-4 to update and create the next version (v2, v3, etc.). |
| `--server "<url>"` | *Optional.* Custom OpenArtifacts server URL (defaults to `$OPEN_ARTIFACTS_URL` or `http://localhost:3008`). |

---

## Direct CLI Publishing via `curl`

To publish an artifact directly from the terminal or subagent:

```bash
# 1. Publish New Artifact
curl -s -X POST "http://localhost:3008/api/artifacts" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -F "file=@/path/to/artifact.html" \
  -F "title=Q3 Sales Analytics" \
  -F "description=Interactive revenue charts"

# Response (JSON):
# {
#   "id": "a81c2d94-3450-48e2-b13c-0e241764df8a",
#   "version": 1,
#   "title": "Q3 Sales Analytics",
#   "description": "Interactive revenue charts",
#   "url": "http://localhost:3008/a/a81c2d94-3450-48e2-b13c-0e241764df8a",
#   "rawUrl": "http://localhost:3008/raw/a81c2d94-3450-48e2-b13c-0e241764df8a/1"
# }

# 2. Publish an Update / New Version (v2)
curl -s -X POST "http://localhost:3008/api/artifacts" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -F "file=@/path/to/artifact_v2.html" \
  -F "id=a81c2d94-3450-48e2-b13c-0e241764df8a" \
  -F "description=Added currency switcher and dark theme"
```

---

## Token & Connection Discovery

The skill locates configuration in the following order:
1. Environment variables: `ARTIFACT_ACCESS_TOKEN` / `OPEN_ARTIFACTS_TOKEN` and `OPEN_ARTIFACTS_URL`.
2. Local config file: `~/.claude/open-artifacts.json` containing:
   ```json
   {
     "url": "http://localhost:3008",
     "token": "your_secret_access_token_here"
   }
   ```
3. Project `.env` in the current working directory.

---

## Output Response Guidance

When reporting back to the user after publishing:
- State that the artifact has been published successfully.
- Output the **Public Viewer Link** (e.g. `[View Artifact](https://artifacts.example.com/a/<uuid>)`).
- Output the **Direct Raw Link** (e.g. `https://artifacts.example.com/raw/<uuid>/<version>`).
- Mention the assigned **UUID-4** and **Version Number** so they can easily publish subsequent iterations with `--id <uuid>`.
