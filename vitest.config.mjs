import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The worker E2E suite boots wrangler dev and makes many sequential HTTP
    // calls; the Express suite writes to the same data/artifacts dir the E2E
    // migration reads. Generous timeouts + sequential files keep both stable.
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false
  }
});
