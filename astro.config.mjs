import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// The legacy Express app still lives in src/ until the Astro port is verified,
// so the Astro source tree sits in astro/ instead of the default src/.
export default defineConfig({
  srcDir: './astro',
  output: 'server',
  // Hono's strict router 404'd trailing-slash variants; keep that behavior.
  trailingSlash: 'never',
  // No sessions: without this the adapter auto-provisions a SESSION KV binding.
  session: false,
  devToolbar: { enabled: false },
  // No Astro image processing is used; without this the adapter injects a
  // Cloudflare Images (IMAGES) binding into the deployed Worker.
  adapter: cloudflare({ imageService: 'passthrough' })
});
