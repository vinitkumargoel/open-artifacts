# CLAUDE.md

OpenArtifacts — HTML artifact publishing, versioning, and sandboxed viewing.
An Astro SSR app on Cloudflare Workers with R2 storage, live at
https://artifact.vinitk.dev.

## Commands

```bash
npm run dev        # astro dev in real workerd, with live local R2 + DO bindings
npm run build      # astro build -> dist/ (server bundle + wrangler.json)
npm test           # astro build && vitest run (unit + 43-test e2e suite)
npm run test:e2e   # just the e2e suite (boots built worker under wrangler dev)
npm run preview    # astro build && wrangler dev (the exact deploy artifact)
npm run deploy     # astro build && wrangler deploy (production)
npm run migrate:r2 # copy legacy data/artifacts/ disk layout into local R2 sim
```

`astro dev` daemonizes (Astro 7): manage it with `npx astro dev status` /
`npx astro dev stop`; logs in `.astro/dev.log`.

## Architecture

- `src/` — the Astro app (Astro's default srcDir).
  - `src/worker.js` — custom Worker entry (`main` in wrangler.toml): calls
    `handle()` from `@astrojs/cloudflare/handler` and re-exports `RateLimiterDO`.
  - `src/middleware.js` — the cross-cutting stack: CORS preflight,
    trailing-slash 404, the read gate, per-visitor rate limiting, error
    mapping, baseline security headers. Read its comments before touching
    request flow.
  - `src/pages/` — routes (pages + API endpoints). `[...path].js` is the
    content-negotiated 404; `unlock.astro` is the browser token-entry page;
    `api/session.js` mints and clears the read-scope cookie.
  - `src/lib/http.js` — config resolution, error envelope, `drainBody`,
    `authGuard`, `mapError`. `src/lib/readauth.js` — the read gate
    (`readGate`, `isReadAuthorized`, `unauthorizedRead`, `signVersionUrls`).
    `src/lib/artifacts.js` — shared API handlers.
  - `src/scripts/diff.js` — dependency-free Myers diff engine used by the
    client-side version-comparison view.
  - `src/components/` — UploadPortal / HistoryDashboard / ArtifactViewer /
    VersionDiff; the first two were mechanically ported from legacy
    template-literal views, with `is:inline` keeping CSS/JS byte-for-byte
    untouched. VersionDiff is new code and uses a normal bundled `<script>`.
- `worker/` — platform-independent shared modules: `storage.js` (R2 layout
  `artifacts/{uuid}/v{n}.html` + `meta.json`, TTL fields, expiry sweep),
  `auth.js` (timing-safe token), `session.js` (HKDF-derived session cookie
  and `/raw` capability signatures), `ratelimit.js` (`RateLimiterDO`, fixed
  60s window, IPv6 /64 bucketing, plus an instance-wide counter),
  `headers.js` (viewer + raw-sandbox header sets), `sanitize.js`,
  `formatArtifacts.js`.
- `wrangler.toml` drives all bindings (R2 `ARTIFACTS`, DO `RATE_LIMITER`, vars).
  `astro build` emits `dist/server/wrangler.json` plus a
  `.wrangler/deploy/config.json` redirect, so plain `wrangler dev`/`deploy`
  from the repo root always operate on the built output.
- Read env via `import { env } from 'cloudflare:workers'` (safe at module
  scope). `Astro.locals.runtime` does not exist in adapter v14.

## Behavioral invariants (do not regress)

The app preserves the legacy worker's public contract exactly:

- Error envelope is always `{error: {code, message, status}}`; unknown errors
  go through `mapError` (500 message gated by `NODE_ENV`).
- Rate limiting: read scope on pages/raw/API GETs (HEAD counts as GET),
  upload scope on `POST /api/artifacts`, `PATCH`, and both delete routes
  (deletes used to be unlimited, which made them a free token oracle),
  `session` scope on `/api/session` and on every rejected read. 404s and
  `/healthz` are unlimited. **Limiter runs before auth on POST.**
- Reads are token-gated. `/a/*`, `/raw/*`, `/history` and `GET
  /api/artifacts*` require one of: a bearer/`x-access-token` header, a
  capability-signed `/raw` URL, or the `oa_session` cookie. `/`, `/upload`,
  `/unlock`, `/healthz` and `POST /api/session` stay open — they are the
  token-entry surface and carry no artifact data. The gate runs *after* the
  trailing-slash 404 and the OPTIONS short-circuit (or those contracts would
  invert to 401) and *before* the read limiter, so 401 traffic can't exhaust
  a shared-NAT visitor's read budget.
- **The session cookie is read scope only and is never accepted by
  `authGuard`.** It rides along on same-site subresource requests made from
  inside a published artifact, so a cookie honoured for writes would turn
  every artifact into a delete-everything CSRF weapon. Cookie-only
  DELETE/PATCH/POST must 401; there is an e2e test for exactly that.
- Baseline security headers are applied only where a route hasn't set the
  header. `Access-Control-Allow-Origin: *` is set on every route *except* the
  read-gated ones, where a wildcard can never be combined with credentials and
  would only advertise a cross-origin read path that does not exist.
  `Access-Control-Allow-Credentials` is never emitted.
- Cache posture on gated routes must not outlive a session: `/raw/:uuid/:n` is
  `private, max-age=31536000, immutable` (content-versioned URL), the pinned
  viewer shell is `no-store`, and every 401/redirect is `no-store`. No
  `Vary: Cookie` — it is a no-op on a `private` response and `finalize()`
  would clobber it anyway.
- Artifacts expire. `isExpired()` guards every read path (410
  `ARTIFACT_EXPIRED`) whether or not the daily sweep is armed, and expired
  records are filtered out of `listAllArtifacts`.
- HTML responses use `text/html; charset=UTF-8`.
- Trailing-slash paths 404 (never redirect). `trailingSlash: 'ignore'` +
  the middleware check make that happen — `'never'` would 301 before the
  middleware runs, bypassing all headers and rate limiting.
- Every early rejection of a body-carrying request must `await drainBody()`
  first: wrangler dev's ProxyWorker fatally crashes ("Network connection
  lost") when a response completes with the request body unconsumed.
  Production workerd is unaffected, but the e2e suite runs under wrangler dev.
- `security: { checkOrigin: false }` is deliberate: the write API is
  bearer-token only, and Astro's origin check would 403 every non-browser
  POST. This is safe *because* of the rule above — the only cookie in the
  system is read-scope and `authGuard` never looks at it. If that ever
  changes, this setting has to change with it.

## Testing

`npm test` builds first, then runs `test/` sequentially (see
vitest.config.mjs). The e2e suite boots the built worker on port 8799 with a
throwaway R2 store and `TRUST_VISITOR_HEADER=1` (e2e-only visitor spoofing —
never set it on a deployed environment).

Keep a single vite major across the tree (currently vite 8 via vitest 4);
a second vite copy breaks the Cloudflare vite-plugin's workerd runner
("Missing field `moduleType`"). Check with `npm ls vite`.

## Secrets

`ARTIFACT_ACCESS_TOKEN` is a Worker secret in production
(`npx wrangler secret put ARTIFACT_ACCESS_TOKEN`) and lives in `.dev.vars`
locally (`.dev.vars.example` is the template). `.artifact-token.production`
(gitignored) holds the production token for post-deploy verification.
Never commit tokens.

It is now a read credential as well as a write one, so rotating it logs out
every browser and breaks every agent and `~/.claude/open-artifacts.json`.
To revoke browser sessions *without* that blast radius, bump `SESSION_EPOCH`
in `wrangler.toml` instead — it is folded into the HKDF salt, so every
outstanding cookie and capability URL stops verifying.

## Retention

`meta.json` carries `ttlDays` / `expiresAt`; publishing a version re-clocks
them (reading does not). Two layers enforce it: the lazy `isExpired()` check
on every read, and a daily cron (`[triggers] crons` + `scheduled()` in
`src/worker.js`) that actually deletes. The cron is inert until
`EXPIRY_SWEEP_ENABLED=1`, so it can be deployed and watched in dry-run first.
`scripts/backfill-ttl.mjs` sets `expiresAt = updatedAt + 30d` on records that
predate the field; it is dry-run unless given `--apply`.
