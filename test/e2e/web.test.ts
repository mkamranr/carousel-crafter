/**
 * The anti-drift suite.
 *
 * The web preview exists to show what the export will produce. If the two ever disagree the
 * preview is worse than useless, because it is believed. This is the test that holds them
 * together: for each fixture, the slide count the browser arrives at must equal the slide
 * count the exporter arrives at.
 *
 * It is not hypothetical. The measuring iframe shipped as `display: none`, which has no
 * layout — every measurement read zero, the fit loop "converged" on the first pass, and the
 * preview showed a single overflowing slide where the CLI produced several.
 */

import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../../src/build.js';
import { closeBrowser, getBrowser } from '../../src/capture/browser.js';
import { createServer } from '../../src/web/server.js';

const SOURCE_FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

/**
 * A throwaway copy of the fixtures, never the folder itself.
 *
 * These tests write and delete `carousel.config.json` in whatever folder they serve. Pointed
 * at the real fixtures directory, a test run destroyed a real saved configuration — someone's
 * handles and API keys — which is not a cost a test suite is allowed to impose.
 */
let FIXTURES = '';
const CLIENT_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));
/** Ephemeral, for the same reason as in llm.test.ts. */
let port = 0;

const FIXTURE_NAMES = [
  'minimal.md',
  'sample.md',
  'long-prose.md',
  'overflow-code.md',
  'with-image.md',
];

let server: FastifyInstance;

beforeAll(async () => {
  if (!existsSync(join(CLIENT_DIR, 'index.html'))) {
    throw new Error('web/dist is missing. Run `npm run build:web` before the e2e suite.');
  }
  FIXTURES = await mkdtemp(join(tmpdir(), 'cc-fixtures-'));
  await cp(SOURCE_FIXTURES, FIXTURES, { recursive: true });

  server = await createServer({ root: FIXTURES, port: 0, clientDir: CLIENT_DIR });
  await server.listen({ port: 0, host: '127.0.0.1' });
  port = (server.server.address() as { port: number }).port;
}, 60_000);

afterAll(async () => {
  await server?.close();
  await closeBrowser();
  if (FIXTURES) await rm(FIXTURES, { recursive: true, force: true });
});

/** Slide count as the browser preview computes it, straight from the toolbar. */
async function previewCount(name: string): Promise<number> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.selectOption('select', name);
    // Wait for the preview that describes THIS post. Polling the count alone would match the
    // outgoing post's number and compare the wrong two things.
    await page.waitForSelector(`footer[data-preview-for="${name}"]`, { timeout: 30_000 });
    const text = await page.locator('header span').nth(1).innerText();
    return Number.parseInt(text.trim(), 10);
  } finally {
    await context.close();
  }
}

describe('web preview', () => {
  it.each(FIXTURE_NAMES)('agrees with the exporter on %s', async (name) => {
    const out = await mkdtemp(join(tmpdir(), 'cc-web-'));
    const report = await build({ input: join(FIXTURES, name), out, zip: false });
    expect(await previewCount(name)).toBe(report.slideCount);
  });

  it('exports through the API and reports what it wrote', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/export',
      payload: { name: 'minimal.md' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { slideCount: number; zip: string | null; files: string[] };
    expect(body.slideCount).toBe(2);
    expect(body.zip).toBe('carousel.zip');
    expect(body.files).toEqual(['slide-01.png', 'slide-02.png']);
  });

  it('creates a new post without colliding with an existing one', async () => {
    const first = (await server.inject({ method: 'POST', url: '/api/posts' })).json() as {
      name: string;
    };
    const second = (await server.inject({ method: 'POST', url: '/api/posts' })).json() as {
      name: string;
    };
    expect(second.name).not.toBe(first.name);
    await rm(join(FIXTURES, first.name), { force: true });
    await rm(join(FIXTURES, second.name), { force: true });
  });

  it('round-trips settings through the config file', async () => {
    const put = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { brand: { handle: '@round.trip', instagram: '@rt' } },
    });
    expect(put.statusCode).toBe(200);

    const get = await server.inject({ method: 'GET', url: '/api/config' });
    const body = get.json() as { config: { brand?: { handle?: string } } };
    expect(body.config.brand?.handle).toBe('@round.trip');

    await rm(join(FIXTURES, 'carousel.config.json'), { force: true });
  });

  it('refuses a config with an unknown key so a typo surfaces immediately', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: '/api/config',
      payload: { acent: '#ffffff' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('asks for a search term rather than querying with nothing', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/images/search?q=' });
    expect(response.statusCode).toBe(400);
  });

  it('reports a missing Pexels key as a message, not a crash', async () => {
    const previous = process.env.PEXELS_API_KEY;
    delete process.env.PEXELS_API_KEY;
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/images/search?q=desk',
      });
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: string }).error).toMatch(/Pexels API key/);
    } finally {
      if (previous !== undefined) process.env.PEXELS_API_KEY = previous;
    }
  });

  it('refuses a download with no photo chosen', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/images/download',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to read a link it does not support', async () => {
    // No network involved: the host check happens before any fetch, which is the point —
    // a server that fetches any URL handed to it can be aimed at anything reachable here.
    for (const url of ['https://example.com/x', 'http://169.254.169.254/latest/meta-data/']) {
      const response = await server.inject({
        method: 'GET',
        url: `/api/source?url=${encodeURIComponent(url)}`,
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('refuses to generate from an unsupported link before opening a stream', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { url: 'https://example.com/x' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('asks for a topic or a link, not neither', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/generate',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to caption an empty post', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/caption',
      payload: { name: 'minimal.md', source: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns an empty caption for a post that has none', async () => {
    const response = await server.inject({ method: 'GET', url: '/api/caption/minimal.md' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { caption: string }).caption).toBe('');
  });

  it('serves the exported archive as a download', async () => {
    await server.inject({ method: 'POST', url: '/api/export', payload: { name: 'minimal.md' } });

    const response = await server.inject({
      method: 'GET',
      url: '/api/export/minimal.md/zip',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    // Named after the post: ten files called carousel.zip in a downloads folder are
    // indistinguishable a week later.
    expect(response.headers['content-disposition']).toContain('minimal.zip');
    expect(response.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('reports nothing to download for a post that was never exported', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/export/roles-not-a-real-post.md/zip',
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses a path that escapes the served folder', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/posts/..%2f..%2fpackage.json',
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
