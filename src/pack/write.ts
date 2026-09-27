/**
 * Writing the output.
 *
 * Filenames are zero-padded so a plain alphabetical listing — in Finder, in the upload
 * dialog, in a shell glob — is already in posting order. Getting slide 10 between 1 and 2
 * is the kind of error you only notice after posting.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import type { CapturedSlide } from '../capture/screenshot.js';

export const ZIP_NAME = 'carousel.zip';

export function slideFilename(index: number): string {
  return `slide-${String(index).padStart(2, '0')}.png`;
}

export interface WriteResult {
  files: string[];
  zip: string | null;
}

export async function writeSlides(
  slides: readonly CapturedSlide[],
  outDir: string,
  { zip }: { zip: boolean },
): Promise<WriteResult> {
  await mkdir(outDir, { recursive: true });

  const files: string[] = [];
  for (const slide of slides) {
    const name = slideFilename(slide.index);
    await writeFile(join(outDir, name), slide.data);
    files.push(name);
  }

  if (!zip) return { files, zip: null };

  const entries: Record<string, Uint8Array> = {};
  for (const slide of slides) entries[slideFilename(slide.index)] = new Uint8Array(slide.data);
  // `mtime` left at fflate's default and level fixed, so the same slides produce the same
  // archive bytes — the checksum check in the e2e suite covers the ZIP too.
  await writeFile(join(outDir, ZIP_NAME), Buffer.from(zipSync(entries, { level: 6 })));

  return { files, zip: ZIP_NAME };
}
