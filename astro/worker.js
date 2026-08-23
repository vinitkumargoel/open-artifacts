/**
 * Custom Worker entry point for the Astro build.
 *
 * wrangler.toml points `main` here so the Worker can export the RateLimiterDO
 * Durable Object class alongside the Astro request handler. Everything else —
 * routing, pages, endpoints, middleware — is handled by Astro (astro/pages,
 * astro/middleware.js) through `handle()`.
 */
import { handle } from '@astrojs/cloudflare/handler';

export { RateLimiterDO } from '../worker/ratelimit.js';

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  }
};
