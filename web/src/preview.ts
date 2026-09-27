/**
 * The preview pipeline.
 *
 * Deliberately the *same* pipeline as the export: parse → inline nothing → render the
 * identical HTML document → run the identical fit loop → read the identical warnings. The
 * only step it skips is the screenshot, because the iframe already shows the pixels.
 *
 * That sameness is the whole justification for the web UI. A preview that approximated the
 * layout would be worse than no preview, because it would be believed.
 */

import { resolveConfig } from '../../src/config/resolve.js';
import type { ConfigFile } from '../../src/config/schema.js';
import { applySplits } from '../../src/fit/apply.js';
import { fitScales, type SlideFit } from '../../src/fit/probe.js';
import { parseDocument } from '../../src/parse/slides.js';
import { renderDocument } from '../../src/render/document.js';
import type { SlideDoc } from '../../src/types.js';

/** Matches `capture/screenshot.ts`. Both are backstops to the termination argument. */
const MAX_PASSES = 8;
const SEARCH_STEPS = 6;

export interface PreviewResult {
  html: string;
  slideCount: number;
  passes: number;
  unfittable: { slideId: string; overflow: number }[];
  /** Index-aligned with the slides in `html`, for per-slide badges. */
  fits: SlideFit[];
}

export interface PreviewOptions {
  /** The `@font-face` block from `/api/font-css` — the same one the exporter inlines. */
  fontCss: string;
  /**
   * The posts folder's `carousel.config.json`, as the server returned it.
   *
   * Passed in for the same reason as everything else here: `/api/export` reads that file, so
   * a preview that ignored it would disagree with the export about the handle, the accent
   * and the channels.
   */
  file?: ConfigFile | undefined;
}

/**
 * Point relative URLs at the served posts folder.
 *
 * `srcdoc` resolves relative URLs against the *parent* page, so `![](./diagram.svg)` would
 * otherwise look for `/diagram.svg` and miss. This is the one deliberate difference from the
 * export, which inlines image bytes instead: same file, same pixels, same layout — it just
 * avoids re-sending megabytes of base64 on every keystroke.
 */
function withAssetBase(html: string): string {
  // Immediately after <head>, and before the <style> block: a <base> only governs URLs the
  // parser meets after it, so anything earlier resolves against the parent page and 404s.
  return html.replace(
    '<head>\n<meta charset="utf-8">',
    '<head>\n<meta charset="utf-8">\n<base href="/files/">',
  );
}

/**
 * Load a document into a hidden iframe and run the fit loop against it.
 *
 * The iframe is the measuring instrument, not the display: it is the same document the
 * exporter screenshots, so the numbers it yields are the numbers the export will get.
 */
async function measure(
  frame: HTMLIFrameElement,
  html: string,
  fitFloor: number,
): Promise<SlideFit[]> {
  await new Promise<void>((done) => {
    frame.addEventListener('load', () => done(), { once: true });
    frame.srcdoc = withAssetBase(html);
  });

  const doc = frame.contentDocument;
  if (!doc) return [];

  // Same reason as the exporter: measuring before fonts resolve measures fallback metrics
  // and fits the slide to a face it will not render in.
  await doc.fonts.ready;

  // `fitScales` is the function Playwright serialises into the page. Here it runs in this
  // realm against the iframe's document — one implementation, so preview and export cannot
  // disagree about what fits.
  return fitScales({ floor: fitFloor, steps: SEARCH_STEPS }, doc);
}

/**
 * Bake the resolved scales into the document.
 *
 * The fit loop applies `--fit-scale` to the *measuring* frame's live DOM; the HTML string it
 * was built from still says nothing about scale. Showing that string unchanged would render
 * every slide at 100% and display overflow the export will not have — the precise drift this
 * whole design exists to prevent. These rules make the document self-contained, so what is
 * displayed needs no loop to look right.
 */
function withResolvedScales(html: string, fits: SlideFit[]): string {
  const rules = fits
    .filter((fit) => fit.scale < 1)
    .map((fit) => `[data-slide-id="${fit.slideId}"]{--fit-scale:${fit.scale}}`)
    .join('\n');
  if (rules === '') return html;
  return html.replace('</head>', `<style>\n${rules}\n</style>\n</head>`);
}

export async function renderPreview(
  source: string,
  frame: HTMLIFrameElement,
  options: PreviewOptions,
): Promise<PreviewResult> {
  let doc: SlideDoc = parseDocument(source);
  // Resolved exactly as `build.ts` resolves it, from the same frontmatter, so the preview
  // picks up an `accent:` or `handle:` change the instant it is typed.
  const config = resolveConfig({ frontmatter: doc.frontmatter, file: options.file });

  let unfittable: PreviewResult['unfittable'] = [];
  let fits: SlideFit[] = [];
  let html = '';
  let passes = 0;

  for (; passes < MAX_PASSES; passes += 1) {
    html = await renderDocument(doc, {
      canvas: config.canvas,
      tokens: config.tokens,
      handle: config.handle,
      eyebrow: config.eyebrow,
      channels: config.channels,
      // Served rather than inlined, like every other image in the preview: same file, same
      // pixels, without re-sending a megabyte of base64 on each keystroke.
      backgroundUrl: config.background,
      backgroundCredit: config.backgroundCredit,
      backgroundOn: config.backgroundOn,
      fontCss: options.fontCss,
    });

    fits = await measure(frame, html, config.fitFloor);
    const result = applySplits(doc, fits);
    unfittable = result.unfittable;

    // Either everything fits or nothing further can be divided. Both end the loop, and the
    // frame currently holds the final layout.
    if (!result.changed) break;
    doc = result.doc;
  }

  return {
    html: withAssetBase(withResolvedScales(html, fits)),
    slideCount: doc.slides.length,
    passes: passes + 1,
    unfittable,
    fits,
  };
}
