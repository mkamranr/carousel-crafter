import { describe, expect, it } from 'vitest';
import { toConfig, toForm, type SettingsValue } from '../../web/src/components/Settings.js';

const blank: SettingsValue = {
  brand: { handle: '', instagram: '', facebook: '', youtube: '', tiktok: '', website: '' },
  accent: '',
  llm: { baseUrl: '', model: '', apiKey: '' },
  pexelsApiKey: '',
};

describe('toForm', () => {
  it('turns an empty config into blank fields', () => {
    expect(toForm({})).toEqual(blank);
  });

  it('reads the top-level handle shorthand', () => {
    expect(toForm({ handle: '@a' }).brand.handle).toBe('@a');
  });

  it('prefers brand.handle over the shorthand', () => {
    expect(toForm({ handle: '@old', brand: { handle: '@new' } }).brand.handle).toBe('@new');
  });

  it('reads the model endpoint settings', () => {
    const form = toForm({ llm: { baseUrl: 'http://x/v1', model: 'm', apiKey: 'k' } });
    expect(form.llm).toEqual({ baseUrl: 'http://x/v1', model: 'm', apiKey: 'k' });
  });
});

describe('toConfig', () => {
  it('drops empty fields rather than writing them', () => {
    expect(toConfig({ ...blank, brand: { ...blank.brand, handle: '@a', facebook: '  ' } })).toEqual(
      { brand: { handle: '@a' } },
    );
  });

  it('writes the accent under theme', () => {
    expect(toConfig({ ...blank, accent: '#F0B429' })).toEqual({ theme: { accent: '#F0B429' } });
  });

  it('omits the llm block entirely when nothing is configured', () => {
    expect(toConfig(blank)).toEqual({});
  });

  it('writes only the model endpoint fields that were filled in', () => {
    const config = toConfig({ ...blank, llm: { baseUrl: 'http://x/v1', model: 'm', apiKey: '' } });
    // An empty key must not be written: the server treats blank as absent and falls back to
    // the environment, and a stored empty string is noise in a file people read.
    expect(config).toEqual({ llm: { baseUrl: 'http://x/v1', model: 'm' } });
  });

  it('writes the Pexels key under images', () => {
    expect(toConfig({ ...blank, pexelsApiKey: 'pk' })).toEqual({
      images: { pexelsApiKey: 'pk' },
    });
  });

  it('round-trips through toForm', () => {
    const value = toForm({
      brand: { handle: '@a', website: 'a.dev' },
      theme: { accent: '#FFFFFF' },
      llm: { baseUrl: 'http://x/v1', model: 'm' },
    });
    expect(toConfig(value)).toEqual({
      brand: { handle: '@a', website: 'a.dev' },
      theme: { accent: '#FFFFFF' },
      llm: { baseUrl: 'http://x/v1', model: 'm' },
    });
  });
});
