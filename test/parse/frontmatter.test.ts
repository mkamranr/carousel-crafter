import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/parse/frontmatter.js';

describe('splitFrontmatter', () => {
  it('extracts a leading frontmatter block', () => {
    const { data, body } = splitFrontmatter('---\ntitle: Hello\n---\n\n# Slide\n');
    expect(data).toEqual({ title: 'Hello' });
    expect(body.trimStart()).toBe('# Slide\n');
  });

  it('returns empty data when the file has no frontmatter', () => {
    const { data, body } = splitFrontmatter('# Slide\n\n---\n\n# Two\n');
    expect(data).toEqual({});
    expect(body).toBe('# Slide\n\n---\n\n# Two\n');
  });

  it('treats a --- that is not on line 1 as body, not frontmatter', () => {
    // The separator between two slides must never be mistaken for frontmatter.
    const { data, body } = splitFrontmatter('\n---\ntitle: No\n---\n');
    expect(data).toEqual({});
    expect(body).toContain('title: No');
  });

  it('keeps --- inside the body once frontmatter is consumed', () => {
    const { body } = splitFrontmatter('---\ntitle: T\n---\n# A\n\n---\n\n# B\n');
    expect(body).toContain('---');
    expect(body).not.toContain('title: T');
  });

  it('throws on an unterminated frontmatter fence', () => {
    expect(() => splitFrontmatter('---\ntitle: T\n# A\n')).toThrow(/unterminated/i);
  });

  it('throws on frontmatter that is not a mapping', () => {
    expect(() => splitFrontmatter('---\n- a\n- b\n---\n# A\n')).toThrow(/mapping/i);
  });
});
