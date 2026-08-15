---
name: open-artifacts
description: Publish and version standalone interactive HTML artifacts (dashboards, charts, games, documents, reports) to the self-hosted OpenArtifacts server. Use when the user asks to "publish this artifact", "host this HTML", "share this artifact", "publish with open-artifacts", or update an existing artifact version. Returns a public viewer URL, direct raw URL, and assigned UUID-4.
---

# OpenArtifacts Publisher Skill

Publish and version standalone interactive HTML files (dashboards, reports, games, charts) directly to your self-hosted **OpenArtifacts** instance.

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

# 2. Publish an Update / New Version (v2)
curl -s -X POST "http://localhost:3008/api/artifacts" \
  -H "Authorization: Bearer $ARTIFACT_ACCESS_TOKEN" \
  -F "file=@/path/to/artifact_v2.html" \
  -F "id=a81c2d94-3450-48e2-b13c-0e241764df8a" \
  -F "description=Added currency switcher and dark theme"
```
