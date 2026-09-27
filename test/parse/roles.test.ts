import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/parse/slides.js';

const roles = (md: string) => parseDocument(md).slides.map((s) => s.role);

describe('slide roles', () => {
  it('makes the first slide the cover and the rest content', () => {
    expect(roles('# A\n\n---\n\n# B\n\n---\n\n# C\n')).toEqual(['cover', 'content', 'content']);
  });

  it('honours an explicit role marker', () => {
    expect(roles('# A\n\n---\n\n<!-- role: cta -->\n\n# B\n')).toEqual(['cover', 'cta']);
  });

  it('lets a marker override the automatic cover on slide 1', () => {
    expect(roles('<!-- role: content -->\n\n# A\n\n---\n\n# B\n')).toEqual(['content', 'content']);
  });

  it('tolerates whitespace variations in the marker', () => {
    expect(roles('# A\n\n---\n\n<!--role:cta-->\n\n# B\n')).toEqual(['cover', 'cta']);
  });

  it('ignores an unknown role and leaves the default', () => {
    expect(roles('# A\n\n---\n\n<!-- role: banana -->\n\n# B\n')).toEqual(['cover', 'content']);
  });

  it('a single-slide document is just a cover', () => {
    expect(roles('# Only\n')).toEqual(['cover']);
  });
});
