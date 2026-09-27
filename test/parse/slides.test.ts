import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/parse/slides.js';

const headingText = (slide: { blocks: unknown[] }): string => {
  const first = slide.blocks[0] as { type: string; children?: { value?: string }[] };
  return first.children?.[0]?.value ?? '';
};

describe('parseDocument', () => {
  it('splits on top-level --- separators', () => {
    const doc = parseDocument('# One\n\n---\n\n# Two\n\n---\n\n# Three\n');
    expect(doc.slides).toHaveLength(3);
    expect(doc.slides.map(headingText)).toEqual(['One', 'Two', 'Three']);
  });

  it('does not split on *** or ___, which stay as rules inside a slide', () => {
    const doc = parseDocument('# One\n\ntext\n\n***\n\nmore\n');
    expect(doc.slides).toHaveLength(1);
    expect(
      doc.slides[0]!.blocks.some((b) => (b as { type: string }).type === 'thematicBreak'),
    ).toBe(true);
  });

  it('consumes frontmatter without producing an empty first slide', () => {
    const doc = parseDocument('---\ntitle: T\n---\n\n# One\n\n---\n\n# Two\n');
    expect(doc.frontmatter).toEqual({ title: 'T' });
    expect(doc.slides).toHaveLength(2);
    expect(headingText(doc.slides[0]!)).toBe('One');
  });

  it('drops empty slides produced by consecutive separators', () => {
    const doc = parseDocument('# One\n\n---\n\n---\n\n# Two\n');
    expect(doc.slides).toHaveLength(2);
  });

  it('assigns stable sequential ids', () => {
    const doc = parseDocument('# One\n\n---\n\n# Two\n');
    expect(doc.slides.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('parses GFM constructs such as strikethrough', () => {
    const doc = parseDocument('# One\n\n~~gone~~\n');
    const json = JSON.stringify(doc.slides[0]!.blocks);
    expect(json).toContain('delete');
  });
});
