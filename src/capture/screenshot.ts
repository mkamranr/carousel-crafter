/**
 * The fit loop and the capture.
 *
 * Two nested loops. The inner one — shrinking — runs entirely in the page: it writes
 * `--fit-scale` and re-measures, so a six-step binary search costs one round trip and zero
 * re-renders. The outer one splits, which changes the model and therefore must re-render.
 *
 * Overflow is measured BEFORE capture, while it still exists. Once the screenshot is taken at
 * element size the evidence is gone: `.slide` clips its content, so text running past the
 * bottom produces a valid PNG of a truncated sentence rather than any kind of error.
 */

import type { Page } from 'playwright';
import { applySplits, type Unfittable } from '../fit/apply.js';
import { fitScales, type SlideFit } from '../fit/probe.js';
import type { Channel } from '../config/resolve.js';
import { renderDocument, type Canvas } from '../render/document.js';
import { fontFaceCss } from '../render/fonts.js';
import type { ThemeTokens } from '../render/tokens.js';
import type { SlideDoc } from '../types.js';
import { withContext } from './browser.js';

/**
 * Bounded by the termination argument in `fit/apply.ts`; this is the backstop, not the
 * mechanism. Reaching it is reported as a failure rather than retried.
 */
const MAX_PASSES = 8;

/** Six halvings resolve the scale to under half a percent — finer than a reader could see. */
const SEARCH_STEPS = 6;

export interface CaptureOptions {
  canvas: Canvas;
  deviceScaleFactor: number;
  tokens: ThemeTokens;
  handle: string | null;
  eyebrow?: string | null;
  channels?: Channel[];
  backgroundUrl?: string | null;
  backgroundCredit?: string | null;
  backgroundOn?: 'cover-cta' | 'cover' | 'all';
  /** Smallest acceptable type scale before splitting takes over. */
  fitFloor: number;
}

export interface CapturedSlide {
  index: number;
  data: Buffer;
}

export interface CaptureResult {
  slides: CapturedSlide[];
  unfittable: Unfittable[];
  passes: number;
}

async function loadAndFit(page: Page, doc: SlideDoc, options: CaptureOptions): Promise<SlideFit[]> {
  const html = await renderDocument(doc, {
    canvas: options.canvas,
    tokens: options.tokens,
    handle: options.handle,
    eyebrow: options.eyebrow ?? null,
    channels: options.channels ?? [],
    backgroundUrl: options.backgroundUrl ?? null,
    backgroundCredit: options.backgroundCredit ?? null,
    backgroundOn: options.backgroundOn ?? 'cover-cta',
    fontCss: fontFaceCss(),
  });

  // `domcontentloaded`, not `networkidle`: the document is entirely self-contained, so
  // waiting on the network would only ever wait for a timeout.
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  // Fonts must resolve before anything is measured, or the first pass measures fallback
  // metrics and fits the slide to a face it will not render in.
  await page.evaluate(() => document.fonts.ready);
  await assertImagesLoaded(page);

  // Passed as a function, not a string: Playwright serialises it into the page, and the
  // browser preview calls the same function against its iframe. One implementation, so the
  // preview cannot disagree with the export about what fits.
  return page.evaluate(fitScales, { floor: options.fitFloor, steps: SEARCH_STEPS });
}

/**
 * Fail loudly on an image that did not render.
 *
 * A broken `<img>` draws a placeholder glyph and leaves the render "successful" — a valid PNG
 * of a missing diagram, reported by nothing. `inlineImages` should make this unreachable by
 * embedding every image as a data URI; this is the assertion that keeps it that way.
 */
async function assertImagesLoaded(page: Page): Promise<void> {
  const broken = await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((done) => {
              image.addEventListener('load', done, { once: true });
              image.addEventListener('error', done, { once: true });
            }),
        ),
    );
    return images
      .filter((image) => image.naturalWidth === 0)
      .map((image) => (image.getAttribute('src') ?? '').slice(0, 60));
  });

  if (broken.length > 0) {
    throw new Error(`Image failed to render: ${broken.join(', ')}`);
  }
}

export async function captureSlides(
  input: SlideDoc,
  options: CaptureOptions,
): Promise<CaptureResult> {
  return withContext(
    {
      width: options.canvas.width,
      height: options.canvas.height,
      deviceScaleFactor: options.deviceScaleFactor,
    },
    async (context) => {
      const page = await context.newPage();
      try {
        let doc = input;
        let unfittable: Unfittable[] = [];
        let passes = 0;

        for (; passes < MAX_PASSES; passes += 1) {
          const fits = await loadAndFit(page, doc, options);
          const result = applySplits(doc, fits);
          unfittable = result.unfittable;

          // Either everything fits, or nothing further can be divided. Both end the loop;
          // the page currently shows the final layout, ready to capture.
          if (!result.changed) break;
          doc = result.doc;
        }

        const elements = await page.locator('.slide').all();
        const slides: CapturedSlide[] = [];
        for (const [index, element] of elements.entries()) {
          // Deliberately an element screenshot, not `fullPage`: the element's box IS the
          // canvas, and fullPage would silently grow the image when content overflowed.
          slides.push({ index: index + 1, data: await element.screenshot({ type: 'png' }) });
        }

        return { slides, unfittable, passes: passes + 1 };
      } finally {
        await page.close();
      }
    },
  );
}
