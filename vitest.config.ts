import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit and HTML-structure tests only. The Playwright suite lives in
    // vitest.e2e.config.ts so the fast loop never launches a browser.
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // `test/web/*` covers the editor's pure helpers, which import from `web/src` — the app
    // shell itself needs a browser and lives in the e2e suite instead.
    exclude: ['test/e2e/**'],
  },
});
