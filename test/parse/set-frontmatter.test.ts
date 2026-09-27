import { describe, expect, it } from 'vitest';
import { setFrontmatter, splitFrontmatter } from '../../src/parse/frontmatter.js';
import { parseDocument } from '../../src/parse/slides.js';

describe('setFrontmatter', () => {
  it('adds a block to a file that has none', () => {
    const out = setFrontmatter('# One\n\n---\n\n# Two\n', { background: './a.jpg' });
    expect(splitFrontmatter(out).data).toEqual({ background: './a.jpg' });
    // The slide break in the body must survive untouched.
    expect(parseDocument(out).slides).toHaveLength(2);
  });

  it('merges into an existing block without losing other keys', () => {
    const out = setFrontmatter('---\ntitle: T\n---\n\n# One\n', { background: './a.jpg' });
    expect(splitFrontmatter(out).data).toEqual({ title: 'T', background: './a.jpg' });
  });

  it('replaces a key that is already set', () => {
    const out = setFrontmatter('---\nbackground: ./old.jpg\n---\n\n# One\n', {
      background: './new.jpg',
    });
    expect(splitFrontmatter(out).data).toEqual({ background: './new.jpg' });
  });

  it('removes a key set to null', () => {
    const out = setFrontmatter('---\ntitle: T\nbackground: ./a.jpg\n---\n\n# One\n', {
      background: null,
    });
    expect(splitFrontmatter(out).data).toEqual({ title: 'T' });
  });

  it('drops the block entirely when the last key is removed', () => {
    const out = setFrontmatter('---\nbackground: ./a.jpg\n---\n\n# One\n', { background: null });
    expect(out.startsWith('---')).toBe(false);
    expect(out.trimEnd()).toBe('# One');
  });

  it('keeps the body parseable after a round trip', () => {
    const source = '---\ntitle: T\n---\n\n# One\n\n---\n\n## Two\n\ntext\n';
    const out = setFrontmatter(source, { background: './a.jpg', backgroundCredit: 'Ada' });
    const doc = parseDocument(out);
    expect(doc.slides).toHaveLength(2);
    expect(doc.frontmatter.backgroundCredit).toBe('Ada');
  });
});
