/**
 * The browser-backed suite.
 *
 * These assertions are the ones that cannot be made without a real layout engine: that the
 * exported images are the exact size Instagram expects, and — the one that matters most —
 * that NO slide overflows in the final output. `.slide` clips, so an overflowing slide still
 * produces a perfectly valid PNG; only a measurement inside the page can catch it.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { closeBrowser } from '../../src/capture/browser.js';
import { captureSlides } from '../../src/capture/screenshot.js';
import { parseDocument } from '../../src/parse/slides.js';
import { inlineImages } from '../../src/render/images.js';
import { resolveTokens } from '../../src/render/tokens.js';

const CANVAS = { width: 1080, height: 1350 };

const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

const build = async (fixture: string, deviceScaleFactor = 2) => {
  const source = await readFile(new URL(`../fixtures/${fixture}`, import.meta.url), 'utf8');
  const doc = await inlineImages(parseDocument(source), FIXTURES);
  return captureSlides(doc, {
    canvas: CANVAS,
    deviceScaleFactor,
    tokens: resolveTokens(),
    handle: '@daily.techtalks',
    fitFloor: 0.75,
  });
};

/** PNG dimensions live at a fixed offset in the IHDR chunk. */
const pngSize = (data: Buffer) => ({
  width: data.readUInt32BE(16),
  height: data.readUInt32BE(20),
});

afterAll(async () => {
  await closeBrowser();
});

describe('capture', () => {
  it('exports PNGs at exactly 2160x2700 at 2x', async () => {
    const result = await build('minimal.md');
    expect(result.slides).toHaveLength(2);
    for (const slide of result.slides) {
      expect(pngSize(slide.data)).toEqual({ width: 2160, height: 2700 });
    }
  });

  it('exports PNGs at exactly 1080x1350 at 1x', async () => {
    const result = await build('minimal.md', 1);
    expect(pngSize(result.slides[0]!.data)).toEqual({ width: 1080, height: 1350 });
  });

  it('leaves no slide overflowing in the sample deck', async () => {
    const result = await build('sample.md');
    expect(result.slides.length).toBeGreaterThanOrEqual(5);
    expect(result.unfittable).toEqual([]);
  });

  it('splits an oversized code block until every slide fits', async () => {
    const result = await build('overflow-code.md');
    // The fixture is far taller than one canvas, so it must have produced continuations.
    expect(result.slides.length).toBeGreaterThan(1);
    expect(result.unfittable).toEqual([]);
  });

  it('splits long prose across slides without overflowing', async () => {
    const result = await build('long-prose.md');
    expect(result.slides.length).toBeGreaterThan(1);
    expect(result.unfittable).toEqual([]);
  });

  it('terminates well inside the pass cap', async () => {
    const result = await build('long-prose.md');
    expect(result.passes).toBeLessThanOrEqual(8);
  });

  it('renders an inlined image without a broken-image placeholder', async () => {
    // captureSlides throws if any <img> has naturalWidth 0, which is what a failed local
    // path produced before images were inlined.
    const result = await build('with-image.md');
    expect(result.slides).toHaveLength(2);
    expect(result.unfittable).toEqual([]);
  });

  it('renders the same bytes twice for the same input', async () => {
    const a = await build('minimal.md');
    const b = await build('minimal.md');
    expect(a.slides[0]!.data.equals(b.slides[0]!.data)).toBe(true);
  });
});
