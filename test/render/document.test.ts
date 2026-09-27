import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/parse/slides.js';
import { renderDocument } from '../../src/render/document.js';
import { fontFaceCss } from '../../src/render/fonts.js';
import { resolveTokens } from '../../src/render/tokens.js';

const render = (md: string, handle: string | null = '@daily.techtalks') =>
  renderDocument(parseDocument(md), {
    canvas: { width: 1080, height: 1350 },
    tokens: resolveTokens(),
    handle,
    fontCss: fontFaceCss(),
  });

describe('renderDocument', () => {
  it('emits one .slide element per slide', async () => {
    const html = await render('# A\n\n---\n\n# B\n\n---\n\n# C\n');
    expect(html.match(/class="slide slide--/g)).toHaveLength(3);
  });

  it('inlines the fonts and references no network resource', async () => {
    const html = await render('# A\n');
    expect(html).toContain('@font-face');
    expect(html).toContain('data:font/woff2;base64,');
    // A network fetch here would fail silently and render fallback glyphs.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('tags every top-level block with a unique data-block-id', async () => {
    const html = await render('# Title\n\nOne.\n\nTwo.\n');
    const ids = [...html.matchAll(/data-block-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['s1:0', 's1:1', 's1:2']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies the role as a modifier class', async () => {
    const html = await render('# A\n\n---\n\n<!-- role: cta -->\n\n# B\n');
    expect(html).toContain('slide slide--cover');
    expect(html).toContain('slide slide--cta');
  });

  it('highlights fenced code with Shiki', async () => {
    const html = await render('# A\n\n```ts\nconst x: number = 1;\n```\n');
    expect(html).toContain('shiki');
    // Shiki emits per-token colour spans; plain <pre> would mean highlighting silently failed.
    expect(html).toMatch(/<span style="color:/);
  });

  it('falls back to plain text for an unknown language instead of failing', async () => {
    const html = await render('# A\n\n```wingdings\nnot a language\n```\n');
    expect(html).toContain('not a language');
  });

  it('renders the canvas size as custom properties', async () => {
    const html = await render('# A\n');
    expect(html).toContain('--cc-width: 1080px;');
    expect(html).toContain('--cc-height: 1350px;');
  });

  it('shows the handle and a 1-based slide index', async () => {
    const html = await render('# A\n\n---\n\n# B\n');
    expect(html).toContain('@daily.techtalks');
    expect(html).toContain('>01 / 02</span>');
  });
});
