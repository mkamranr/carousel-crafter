/**
 * Local images, inlined as data URIs.
 *
 * `page.setContent` loads the document with no base URL, so every relative or absolute file
 * path in an `<img src>` resolves against `about:blank` and simply never loads. The browser
 * does not complain: it draws a broken-image glyph and the render "succeeds", producing a
 * valid PNG of a missing diagram. Same disease as a network `@font-face`, same cure — put
 * the bytes in the document.
 *
 * A remote URL is refused rather than fetched. Fetching would make the render depend on the
 * network and on whatever that URL serves today, and a failure would again be silent.
 *
 * Runs once per build, before the fit loop, so the files are read once rather than on every
 * re-render.
 */

import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, resolve } from 'node:path';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import type { SlideDoc } from '../types.js';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export class ImageError extends Error {}

const isRemote = (url: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(url);

async function toDataUri(url: string, baseDir: string): Promise<string> {
  const extension = extname(url).toLowerCase();
  const mime = MIME[extension];
  if (!mime) {
    throw new ImageError(
      `Unsupported image type "${extension || url}". Supported: ${Object.keys(MIME).join(', ')}.`,
    );
  }

  const path = isAbsolute(url) ? url : resolve(baseDir, url);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw new ImageError(`Could not read image: ${url} (looked in ${path})`);
  }

  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/**
 * One file, resolved to a data URI.
 *
 * Used for the cover/CTA background, which is named in frontmatter rather than written as
 * Markdown — so it never passes through the mdast walk below, but needs the same treatment
 * for the same reason.
 */
export async function inlineOne(url: string, baseDir: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  if (isRemote(url)) {
    throw new ImageError(
      `Remote background not allowed: ${url}. Pick one through the image search, which ` +
        `downloads it into your posts folder first.`,
    );
  }
  return toDataUri(url, baseDir);
}

/**
 * Rewrite every image URL in the document to a data URI.
 *
 * `baseDir` is the directory of the markdown file, so paths are written relative to the post
 * rather than to wherever the command happened to be run from.
 */
export async function inlineImages(doc: SlideDoc, baseDir: string): Promise<SlideDoc> {
  // Cloned rather than mutated: the caller's parsed document stays a faithful record of the
  // source, which keeps `applySplits` operating on data it can reason about.
  const slides = doc.slides.map((slide) => ({
    ...slide,
    blocks: structuredClone(slide.blocks),
  }));

  const pending: { url: string; set: (value: string) => void }[] = [];
  for (const slide of slides) {
    visit({ type: 'root', children: slide.blocks } as Root, 'image', (node) => {
      // Already inline; nothing to resolve and nothing to fetch.
      if (node.url.startsWith('data:')) return;
      if (isRemote(node.url)) {
        throw new ImageError(
          `Remote image not allowed: ${node.url}. Download it and reference the local file — ` +
            `renders must not depend on the network.`,
        );
      }
      pending.push({
        url: node.url,
        set: (value) => {
          node.url = value;
        },
      });
    });
  }

  // One read per distinct file, however many times it appears.
  const cache = new Map<string, Promise<string>>();
  for (const { url, set } of pending) {
    let encoded = cache.get(url);
    if (!encoded) {
      encoded = toDataUri(url, baseDir);
      cache.set(url, encoded);
    }
    set(await encoded);
  }

  return { ...doc, slides };
}
