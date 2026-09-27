import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/parse/slides.js';
import { applySplits } from '../../src/fit/apply.js';
import type { SlideFit } from '../../src/fit/probe.js';

const fit = (slideId: string, over: number, last: string | null): SlideFit => ({
  slideId,
  scale: 0.75,
  overflow: over,
  lastFittingBlockId: last,
});

describe('applySplits', () => {
  it('leaves the document alone when nothing overflows', () => {
    const doc = parseDocument('# A\n\nbody\n');
    const result = applySplits(doc, [fit('s1', 0, 's1:1')]);
    expect(result.changed).toBe(false);
    expect(result.doc.slides).toHaveLength(1);
  });

  it('moves blocks after the last fitting one onto a continuation slide', () => {
    const doc = parseDocument('# A\n\none\n\ntwo\n\nthree\n');
    const result = applySplits(doc, [fit('s1', 120, 's1:1')]);
    expect(result.changed).toBe(true);
    expect(result.doc.slides).toHaveLength(2);
    expect(result.doc.slides[0]!.blocks).toHaveLength(2);
    expect(result.doc.slides[1]!.blocks).toHaveLength(2);
    expect(result.doc.slides[1]!.continuationOf).toBe('s1');
  });

  it('always keeps at least one block when even the first overflows', () => {
    const doc = parseDocument('# A\n\none\n\ntwo\n');
    const result = applySplits(doc, [fit('s1', 400, null)]);
    expect(result.doc.slides[0]!.blocks).toHaveLength(1);
    expect(result.doc.slides[1]!.blocks).toHaveLength(2);
  });

  it('inserts the continuation directly after the slide it continues', () => {
    const doc = parseDocument('# A\n\none\n\ntwo\n\n---\n\n# B\n');
    const result = applySplits(doc, [fit('s1', 200, 's1:0')]);
    expect(result.doc.slides.map((s) => s.continuationOf ?? null)).toEqual([null, 's1', null]);
  });

  it('gives a continuation the content role even when continuing a cover', () => {
    const doc = parseDocument('# A\n\none\n\ntwo\n');
    const result = applySplits(doc, [fit('s1', 200, 's1:0')]);
    expect(result.doc.slides[0]!.role).toBe('cover');
    expect(result.doc.slides[1]!.role).toBe('content');
  });

  it('splits a lone oversized code block by lines', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line${i}`).join('\n');
    const doc = parseDocument('```ts\n' + lines + '\n```\n');
    const result = applySplits(doc, [fit('s1', 500, null)]);
    expect(result.changed).toBe(true);
    expect(result.doc.slides).toHaveLength(2);
    const first = result.doc.slides[0]!.blocks[0] as { type: string; value: string; lang: string };
    const second = result.doc.slides[1]!.blocks[0] as { type: string; value: string; lang: string };
    expect(first.type).toBe('code');
    expect(first.lang).toBe('ts');
    expect(second.lang).toBe('ts');
    expect(first.value.split('\n')).toHaveLength(20);
    expect(second.value.split('\n')).toHaveLength(20);
  });

  it('reports a lone indivisible block as unfittable instead of looping', () => {
    const doc = parseDocument('a very long paragraph that cannot be divided further\n');
    const result = applySplits(doc, [fit('s1', 300, null)]);
    expect(result.changed).toBe(false);
    expect(result.unfittable).toEqual([{ slideId: 's1', overflow: 300 }]);
  });

  it('does not split a single code block that is already one line', () => {
    const doc = parseDocument('```ts\nonly\n```\n');
    const result = applySplits(doc, [fit('s1', 300, null)]);
    expect(result.changed).toBe(false);
    expect(result.unfittable).toHaveLength(1);
  });

  it('assigns unique ids to continuation slides', () => {
    const doc = parseDocument('# A\n\none\n\ntwo\n\nthree\n\nfour\n');
    const once = applySplits(doc, [fit('s1', 200, 's1:0')]);
    const twice = applySplits(once.doc, [fit('s1', 200, 's1:0')]);
    const ids = twice.doc.slides.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
