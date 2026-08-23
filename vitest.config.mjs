import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The worker E2E suite boots wrangler dev and makes many sequential HTTP
    // calls. Generous timeouts + sequential files keep it stable.
    testTimeout: 30000,
    hookTimeout: 180000,
    fileParallelism: false
  }
});
