import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slideFilename, writeSlides, ZIP_NAME } from '../../src/pack/write.js';

const fakeSlides = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ index: i + 1, data: Buffer.from(`png-${i}`) }));

describe('slideFilename', () => {
  it('zero-pads so alphabetical order is posting order', () => {
    expect(slideFilename(1)).toBe('slide-01.png');
    expect(slideFilename(10)).toBe('slide-10.png');
    expect([slideFilename(10), slideFilename(2)].sort()).toEqual(['slide-02.png', 'slide-10.png']);
  });
});

describe('writeSlides', () => {
  it('writes one file per slide and creates the directory', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'cc-')), 'nested');
    const result = await writeSlides(fakeSlides(3), dir, { zip: false });
    expect(result.files).toEqual(['slide-01.png', 'slide-02.png', 'slide-03.png']);
    expect(result.zip).toBeNull();
    expect((await readdir(dir)).sort()).toEqual(['slide-01.png', 'slide-02.png', 'slide-03.png']);
  });

  it('writes a zip alongside the PNGs when asked', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cc-'));
    const result = await writeSlides(fakeSlides(2), dir, { zip: true });
    expect(result.zip).toBe(ZIP_NAME);
    const zip = await readFile(join(dir, ZIP_NAME));
    expect(zip.subarray(0, 2).toString()).toBe('PK');
  });

  it('produces identical archive bytes for identical input', async () => {
    const a = await mkdtemp(join(tmpdir(), 'cc-'));
    const b = await mkdtemp(join(tmpdir(), 'cc-'));
    await writeSlides(fakeSlides(2), a, { zip: true });
    await writeSlides(fakeSlides(2), b, { zip: true });
    expect(await readFile(join(a, ZIP_NAME))).toEqual(await readFile(join(b, ZIP_NAME)));
  });
});
