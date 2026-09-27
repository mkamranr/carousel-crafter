import { describe, expect, it } from 'vitest';
import { DEFAULT_FIT_FLOOR, DEFAULT_SCALE, resolveConfig } from '../../src/config/resolve.js';
import { parseConfigFile } from '../../src/config/resolve.js';
import { DARK_THEME } from '../../src/render/tokens.js';

describe('resolveConfig', () => {
  it('falls back to defaults with no input at all', () => {
    const c = resolveConfig({});
    expect(c.canvas).toEqual({ width: 1080, height: 1350 });
    expect(c.deviceScaleFactor).toBe(DEFAULT_SCALE);
    expect(c.fitFloor).toBe(DEFAULT_FIT_FLOOR);
    expect(c.handle).toBeNull();
    expect(c.tokens).toEqual(DARK_THEME);
  });

  it('prefers a CLI flag over frontmatter and the config file', () => {
    const c = resolveConfig({
      cli: { handle: '@cli' },
      frontmatter: { handle: '@front' },
      file: { handle: '@file' },
    });
    expect(c.handle).toBe('@cli');
  });

  it('prefers frontmatter over the config file', () => {
    const c = resolveConfig({ frontmatter: { handle: '@front' }, file: { handle: '@file' } });
    expect(c.handle).toBe('@front');
  });

  it('merges theme layers instead of replacing them', () => {
    const c = resolveConfig({ frontmatter: { accent: '#FF0000' } });
    expect(c.tokens.accent).toBe('#FF0000');
    // Every other token must survive a one-key override.
    expect(c.tokens.background).toBe(DARK_THEME.background);
    expect(c.tokens.monoFont).toBe(DARK_THEME.monoFont);
  });

  it('lets an explicit theme.accent beat the accent shorthand', () => {
    const c = resolveConfig({ frontmatter: { accent: '#FF0000', theme: { accent: '#00FF00' } } });
    expect(c.tokens.accent).toBe('#00FF00');
  });

  it('ignores unrelated frontmatter such as title', () => {
    expect(() => resolveConfig({ frontmatter: { title: 'A post', tags: ['x'] } })).not.toThrow();
  });

  it('rejects a malformed colour', () => {
    expect(() => resolveConfig({ frontmatter: { accent: 'goldenrod' } })).toThrow();
  });
});

describe('brand and channels', () => {
  it('collects only the channels that have a value', () => {
    const c = resolveConfig({
      file: { brand: { instagram: '@a', youtube: '', website: 'a.dev' } },
    });
    expect(c.channels).toEqual([
      { key: 'instagram', value: '@a' },
      { key: 'website', value: 'a.dev' },
    ]);
  });

  it('orders channels consistently regardless of key order in the file', () => {
    const c = resolveConfig({ file: { brand: { website: 'a.dev', instagram: '@a' } } });
    expect(c.channels.map((ch) => ch.key)).toEqual(['instagram', 'website']);
  });

  it('merges frontmatter brand over the config file', () => {
    const c = resolveConfig({
      file: { brand: { instagram: '@file', youtube: 'yt' } },
      frontmatter: { brand: { instagram: '@front' } },
    });
    expect(c.channels).toEqual([
      { key: 'instagram', value: '@front' },
      { key: 'youtube', value: 'yt' },
    ]);
  });

  it('falls back to instagram when no handle is given', () => {
    expect(resolveConfig({ file: { brand: { instagram: '@a' } } }).handle).toBe('@a');
  });

  it('prefers an explicit handle over instagram', () => {
    const c = resolveConfig({ file: { brand: { handle: '@h', instagram: '@a' } } });
    expect(c.handle).toBe('@h');
  });

  it('takes the eyebrow from frontmatter, falling back to the title', () => {
    expect(resolveConfig({ frontmatter: { title: 'T' } }).eyebrow).toBe('T');
    expect(resolveConfig({ frontmatter: { title: 'T', eyebrow: 'E' } }).eyebrow).toBe('E');
    expect(resolveConfig({}).eyebrow).toBeNull();
  });

  it('ignores a channel that is only whitespace', () => {
    expect(resolveConfig({ file: { brand: { instagram: '   ' } } }).channels).toEqual([]);
  });
});

describe('parseConfigFile', () => {
  it('accepts a partial file', () => {
    expect(parseConfigFile({ handle: '@x', scale: 1 })).toEqual({ handle: '@x', scale: 1 });
  });

  it('rejects an unknown key so typos surface immediately', () => {
    expect(() => parseConfigFile({ acent: '#fff' })).toThrow();
  });

  it('rejects a fit floor that would make type unreadable', () => {
    expect(() => parseConfigFile({ fitFloor: 0.1 })).toThrow();
  });
});
