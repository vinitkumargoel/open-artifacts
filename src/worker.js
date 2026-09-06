/**
 * Custom Worker entry point for the Astro build.
 *
 * wrangler.toml points `main` here so the Worker can export the RateLimiterDO
 * Durable Object class and the cron handler alongside the Astro request
 * handler. Everything else — routing, pages, endpoints, middleware — is handled
 * by Astro (src/pages, src/middleware.js) through `handle()`.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { sweepExpiredArtifacts } from '../worker/storage.js';

export { RateLimiterDO } from '../worker/ratelimit.js';

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  /**
   * Daily retention sweep (see `[triggers]` in wrangler.toml).
   *
   * Deletion is irreversible, so this stays inert until EXPIRY_SWEEP_ENABLED is
   * explicitly set — the handler can be deployed and observed in dry-run before
   * it is allowed to remove anything. Reads are already protected by the lazy
   * isExpired() check on every route, so a disabled sweeper only costs storage,
   * never correctness.
   */
  async scheduled(event, env, ctx) {
    const enabled = String(env.EXPIRY_SWEEP_ENABLED ?? '').toLowerCase();
    const dryRun = !(enabled === '1' || enabled === 'true' || enabled === 'yes');

    const result = await sweepExpiredArtifacts(env.ARTIFACTS, { dryRun });

    const summary = `scanned=${result.scanned} expired=${result.expired} `
      + `deleted=${result.deleted} failed=${result.failed}`
      + (result.truncated ? ' truncated=true' : '');

    if (dryRun) {
      console.log(`[Sweep] DRY RUN (set EXPIRY_SWEEP_ENABLED=1 to arm): ${summary}`);
    } else {
      console.log(`[Sweep] ${summary}`);
      if (result.deletedIds.length) {
        console.log(`[Sweep] Deleted: ${result.deletedIds.join(', ')}`);
      }
    }
  }
};
