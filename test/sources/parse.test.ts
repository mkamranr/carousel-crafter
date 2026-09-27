import { describe, expect, it } from 'vitest';
import { parseRepo } from '../../src/sources/github.js';
import { parseHuggingFace } from '../../src/sources/huggingface.js';
import { isSupported, looksLikeUrl } from '../../src/sources/index.js';

describe('parseRepo', () => {
  it('reads a plain repository URL', () => {
    expect(parseRepo('https://github.com/vercel/next.js')).toEqual({
      owner: 'vercel',
      repo: 'next.js',
    });
  });

  it('ignores trailing paths people paste from the UI', () => {
    expect(parseRepo('https://github.com/a/b/tree/main/src')).toEqual({ owner: 'a', repo: 'b' });
  });

  it('strips a .git suffix', () => {
    expect(parseRepo('https://github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
  });

  it('accepts www', () => {
    expect(parseRepo('https://www.github.com/a/b')?.repo).toBe('b');
  });

  it('rejects a user page, which is not a repository', () => {
    expect(parseRepo('https://github.com/vercel')).toBeNull();
  });

  it('rejects other hosts, including lookalikes', () => {
    expect(parseRepo('https://gitlab.com/a/b')).toBeNull();
    // A hostname merely containing "github.com" must not pass.
    expect(parseRepo('https://github.com.evil.example/a/b')).toBeNull();
  });

  it('rejects text that is not a URL', () => {
    expect(parseRepo('vercel/next.js')).toBeNull();
  });
});

describe('parseHuggingFace', () => {
  it('reads a model URL', () => {
    expect(parseHuggingFace('https://huggingface.co/openai/whisper-large-v3')).toEqual({
      type: 'models',
      id: 'openai/whisper-large-v3',
    });
  });

  it('reads a dataset URL', () => {
    expect(parseHuggingFace('https://huggingface.co/datasets/squad')).toEqual({
      type: 'datasets',
      id: 'squad',
    });
  });

  it('reads a root-level canonical model', () => {
    expect(parseHuggingFace('https://huggingface.co/gpt2')).toEqual({
      type: 'models',
      id: 'gpt2',
    });
  });

  it('ignores a trailing tab path', () => {
    expect(parseHuggingFace('https://huggingface.co/openai/whisper-large-v3/tree/main')?.id).toBe(
      'openai/whisper-large-v3',
    );
  });

  it('rejects site sections that are not repositories', () => {
    for (const path of ['spaces/a/b', 'docs/hub', 'blog/x', 'papers/1234']) {
      expect(parseHuggingFace(`https://huggingface.co/${path}`)).toBeNull();
    }
  });

  it('rejects other hosts', () => {
    expect(parseHuggingFace('https://huggingface.co.evil.example/a/b')).toBeNull();
  });
});

describe('isSupported', () => {
  it('accepts the two sources that can be read', () => {
    expect(isSupported('https://github.com/a/b')).toBe(true);
    expect(isSupported('https://huggingface.co/a/b')).toBe(true);
  });

  it('refuses everything else', () => {
    // Deliberate: a server that fetches any URL it is handed can be aimed at anything
    // reachable from this machine.
    expect(isSupported('https://example.com/post')).toBe(false);
    expect(isSupported('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isSupported('file:///etc/passwd')).toBe(false);
  });
});

describe('looksLikeUrl', () => {
  it('recognises http and https only', () => {
    expect(looksLikeUrl('https://github.com/a/b')).toBe(true);
    expect(looksLikeUrl('  http://x.dev  ')).toBe(true);
    expect(looksLikeUrl('why RSCs matter')).toBe(false);
    expect(looksLikeUrl('file:///etc/passwd')).toBe(false);
  });
});
