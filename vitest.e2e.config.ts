import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    // Chromium launch plus a multi-pass fit loop is well past vitest's 5s default.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One browser, one suite at a time — parallel Chromium instances on a laptop
    // thrash more than they gain.
    fileParallelism: false,
  },
});
