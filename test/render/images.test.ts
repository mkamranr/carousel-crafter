import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/parse/slides.js';
import { ImageError, inlineImages } from '../../src/render/images.js';

const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

const urlsOf = (doc: Awaited<ReturnType<typeof inlineImages>>) => {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const n = node as { type?: string; url?: string; children?: unknown[] };
    if (n.type === 'image' && n.url) found.push(n.url);
    for (const child of n.children ?? []) walk(child);
  };
  for (const slide of doc.slides) for (const block of slide.blocks) walk(block);
  return found;
};

describe('inlineImages', () => {
  it('rewrites a relative path to a data URI', async () => {
    const doc = await inlineImages(parseDocument('![d](./diagram.svg)\n'), FIXTURES);
    expect(urlsOf(doc)[0]).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('resolves relative to the markdown file, not the working directory', async () => {
    // The same source resolved from elsewhere must fail rather than silently find something.
    await expect(inlineImages(parseDocument('![d](./diagram.svg)\n'), '/tmp')).rejects.toThrow(
      ImageError,
    );
  });

  it('leaves an existing data URI untouched', async () => {
    const source = '![d](data:image/png;base64,AAAA)\n';
    const doc = await inlineImages(parseDocument(source), FIXTURES);
    expect(urlsOf(doc)[0]).toBe('data:image/png;base64,AAAA');
  });

  it('refuses a remote URL instead of fetching it', async () => {
    await expect(
      inlineImages(parseDocument('![d](https://example.com/x.png)\n'), FIXTURES),
    ).rejects.toThrow(/network/i);
  });

  it('names the missing file rather than failing silently', async () => {
    await expect(inlineImages(parseDocument('![d](./nope.png)\n'), FIXTURES)).rejects.toThrow(
      /Could not read image: \.\/nope\.png/,
    );
  });

  it('rejects an unsupported image type', async () => {
    await expect(inlineImages(parseDocument('![d](./x.tiff)\n'), FIXTURES)).rejects.toThrow(
      /Unsupported image type/,
    );
  });

  it('does not mutate the document it was given', async () => {
    const doc = parseDocument('![d](./diagram.svg)\n');
    await inlineImages(doc, FIXTURES);
    expect(urlsOf(doc)[0]).toBe('./diagram.svg');
  });

  it('reads a repeated image once', async () => {
    const doc = await inlineImages(
      parseDocument('![a](./diagram.svg)\n\n---\n\n![b](./diagram.svg)\n'),
      FIXTURES,
    );
    const urls = urlsOf(doc);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(urls[1]);
  });
});
