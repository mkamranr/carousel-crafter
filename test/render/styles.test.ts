import { describe, expect, it } from 'vitest';
import { SLIDE_CSS } from '../../src/render/styles.js';

describe('SLIDE_CSS', () => {
  it('contains no backtick, which would terminate its own template literal', () => {
    // This has broken the build twice: a backtick written inside a CSS comment (`.slide`)
    // ends the string early and produces a baffling syntax error far from the cause.
    expect(SLIDE_CSS).not.toContain('`');
  });

  it('drives every type size from --fit-scale', () => {
    // If a size is ever hard-coded, the in-page shrink search silently stops affecting it.
    expect(SLIDE_CSS).toContain('var(--fit-scale)');
  });
});
