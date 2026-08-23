import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The Astro source tree sits in astro/ instead of the default src/ — src/ was
// the legacy Express app's home before its removal, and the shared server
// modules live in worker/ beside it.
export default defineConfig({
  srcDir: './astro',
  output: 'server',
  // Hono's strict router 404'd trailing-slash variants. 'never' would have
  // Astro 301-redirect them before the middleware runs (no headers, no rate
  // limiting); 'ignore' lets them through so astro/middleware.js can return
  // the Hono-parity 404 itself.
  trailingSlash: 'ignore',
  // No sessions: without this the adapter auto-provisions a SESSION KV binding.
  session: false,
  // The publish/delete API is guarded by a bearer token and served under a
  // permissive CORS policy (origin '*'), same as the Hono worker. Astro's
  // origin-header CSRF check would 403 every non-browser POST (CLI, curl, e2e).
  security: { checkOrigin: false },
  devToolbar: { enabled: false },
  // No Astro image processing is used; without this the adapter injects a
  // Cloudflare Images (IMAGES) binding into the deployed Worker.
  adapter: cloudflare({ imageService: 'passthrough' })
});
