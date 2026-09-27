/**
 * `SlideDoc` → one standalone HTML document containing every slide.
 *
 * All N slides share a single document rather than getting one page each. The fit loop
 * re-measures the deck repeatedly, so batching turns (iterations × slides) page loads into
 * (iterations). Capture then screenshots each `.slide` element, which crops exactly to the
 * slide box — so the output is still pixel-exact per slide.
 *
 * Everything is inline: no stylesheet, no script, no network font. A fetch that fails here
 * would do so silently and produce a valid PNG of the wrong thing.
 */

import { Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Channel } from '../config/resolve.js';
import type { SlideDoc } from '../types.js';
import { SlideFrame } from './components/SlideFrame.js';
import { blocksToReact } from './components/blocks.js';
import { SLIDE_CSS } from './styles.js';
import { tokensToCss, type ThemeTokens } from './tokens.js';

export interface Canvas {
  width: number;
  height: number;
}

export interface RenderDocumentOptions {
  canvas: Canvas;
  tokens: ThemeTokens;
  handle: string | null;
  /** Repeated above the heading on content slides. */
  eyebrow?: string | null;
  /** Rendered on the CTA slide only. */
  channels?: Channel[];
  /** Cover/CTA photo, already resolved: a data URI on export, a served path in preview. */
  backgroundUrl?: string | null;
  backgroundCredit?: string | null;
  backgroundOn?: 'cover-cta' | 'cover' | 'all';
  /**
   * The `@font-face` block, supplied rather than read.
   *
   * Reading the woff2 files is the only thing that would tie this module to Node, and this
   * module has to run in the browser too — the web preview calls it to build the very same
   * document Playwright screenshots. The server passes `fontFaceCss()`; the browser fetches
   * the identical string from `/api/font-css`.
   */
  fontCss: string;
}

export async function renderDocument(
  doc: SlideDoc,
  {
    canvas,
    tokens,
    handle,
    fontCss,
    eyebrow = null,
    channels = [],
    backgroundUrl = null,
    backgroundCredit = null,
    backgroundOn = 'cover-cta',
  }: RenderDocumentOptions,
): Promise<string> {
  const frames: string[] = [];

  for (const [index, slide] of doc.slides.entries()) {
    const nodes = await blocksToReact(slide.id, slide.blocks);
    frames.push(
      renderToStaticMarkup(
        <SlideFrame
          id={slide.id}
          role={slide.role}
          index={index + 1}
          total={doc.slides.length}
          handle={handle}
          eyebrow={eyebrow}
          channels={channels}
          backgroundUrl={backgroundUrl}
          backgroundCredit={backgroundCredit}
          backgroundOn={backgroundOn}
        >
          {nodes.map((node, i) => (
            <Fragment key={i}>{node}</Fragment>
          ))}
        </SlideFrame>,
      ),
    );
  }

  const rootVars = [
    tokensToCss(tokens),
    `  --cc-width: ${canvas.width}px;`,
    `  --cc-height: ${canvas.height}px;`,
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>carousel</title>
<style>
${fontCss}

:root {
${rootVars}
}
${SLIDE_CSS}
</style>
</head>
<body>
${frames.join('\n')}
</body>
</html>
`;
}
