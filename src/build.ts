/**
 * The pipeline, end to end.
 *
 * Kept out of `cli.ts` so the command layer stays thin and this stays callable — the web UI,
 * when it lands, wants exactly this function rather than a subprocess.
 */

import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { captureSlides } from './capture/screenshot.js';
import { resolveConfig, parseConfigFile, type CliOverrides } from './config/resolve.js';
import type { Unfittable } from './fit/apply.js';
import { parseDocument } from './parse/slides.js';
import { writeSlides } from './pack/write.js';
import { ImageError, inlineImages, inlineOne } from './render/images.js';

/** Instagram accepts at most 20 images in one carousel. Past that the post cannot be made. */
export const MAX_SLIDES = 20;
/** Fewer than this reads as an accident rather than a deck, so it is worth saying out loud. */
export const MIN_SLIDES = 3;

export interface BuildRequest {
  input: string;
  out: string;
  zip: boolean;
  configPath?: string | undefined;
  cli?: CliOverrides;
}

export interface BuildReport {
  files: string[];
  zip: string | null;
  slideCount: number;
  passes: number;
  warnings: string[];
  unfittable: Unfittable[];
}

export class BuildInputError extends Error {}

export async function build(request: BuildRequest): Promise<BuildReport> {
  const source = await readText(request.input, 'markdown file');

  const file = request.configPath
    ? parseConfigFile(JSON.parse(await readText(request.configPath, 'config file')))
    : undefined;

  let doc;
  try {
    doc = parseDocument(source);
  } catch (error) {
    throw new BuildInputError((error as Error).message);
  }

  if (doc.slides.length === 0) {
    throw new BuildInputError('No slides found. Separate slides with `---` on its own line.');
  }

  const config = resolveConfig({ cli: request.cli, frontmatter: doc.frontmatter, file });

  // Once, before the fit loop, so each file is read a single time rather than on every
  // re-render. Paths resolve against the markdown file, not the working directory.
  const baseDir = dirname(request.input);
  let inlined;
  let backgroundUrl: string | null = null;
  try {
    inlined = await inlineImages(doc, baseDir);
    // The background is named in frontmatter, so it misses the mdast walk above and has to
    // be resolved on its own — by the same rules, for the same reason.
    if (config.background) backgroundUrl = await inlineOne(config.background, baseDir);
  } catch (error) {
    if (error instanceof ImageError) throw new BuildInputError(error.message);
    throw error;
  }

  const result = await captureSlides(inlined, {
    canvas: config.canvas,
    deviceScaleFactor: config.deviceScaleFactor,
    tokens: config.tokens,
    handle: config.handle,
    eyebrow: config.eyebrow,
    channels: config.channels,
    backgroundUrl,
    backgroundCredit: config.backgroundCredit,
    backgroundOn: config.backgroundOn,
    fitFloor: config.fitFloor,
  });

  const warnings: string[] = [];
  if (result.slides.length < MIN_SLIDES) {
    warnings.push(`Only ${result.slides.length} slide(s) — carousels usually run to about 10.`);
  }
  for (const { slideId, overflow } of result.unfittable) {
    warnings.push(
      `Slide ${slideId}: content exceeds the canvas by ${overflow}px and cannot be split ` +
        `further. Shorten it or break it manually with \`---\`.`,
    );
  }

  // Written even when over the limit: seeing the slides is how you decide what to cut.
  const written = await writeSlides(result.slides, request.out, { zip: request.zip });

  if (result.slides.length > MAX_SLIDES) {
    warnings.push(
      `${result.slides.length} slides exceeds Instagram's limit of ${MAX_SLIDES}. ` +
        `The images were written, but the post cannot be made as-is.`,
    );
  }

  return {
    files: written.files,
    zip: written.zip,
    slideCount: result.slides.length,
    passes: result.passes,
    warnings,
    unfittable: result.unfittable,
  };
}

async function readText(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new BuildInputError(`Could not read ${label}: ${path}`);
  }
}
