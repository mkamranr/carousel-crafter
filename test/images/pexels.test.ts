import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageSearchError, photoFilename, searchPhotos } from '../../src/images/pexels.js';

const photo = (id: number) => ({
  id,
  alt: 'a desk',
  url: `https://www.pexels.com/photo/${id}/`,
  photographer: 'Ada Lovelace',
  photographer_url: 'https://www.pexels.com/@ada',
  src: {
    medium: `https://images.pexels.com/${id}-medium.jpg`,
    large2x: `https://images.pexels.com/${id}-large2x.jpg`,
    original: `https://images.pexels.com/${id}-original.jpg`,
  },
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('searchPhotos', () => {
  it('maps results to what the picker needs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ photos: [photo(7)] })));
    const [result] = await searchPhotos('desk', 'key');
    expect(result).toMatchObject({
      id: 7,
      photographer: 'Ada Lovelace',
      thumb: 'https://images.pexels.com/7-medium.jpg',
      full: 'https://images.pexels.com/7-large2x.jpg',
    });
  });

  it('sends the key bare, not as a Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ photos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await searchPhotos('desk', ' key ');
    // Pexels rejects "Bearer <key>" — this is the single easiest thing to get wrong here.
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('key');
  });

  it('asks for portrait crops, which suit a 4:5 canvas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ photos: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await searchPhotos('desk', 'key');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('orientation=portrait');
  });

  it('refuses to call out without a key', async () => {
    await expect(searchPhotos('desk', '  ')).rejects.toThrow(/No Pexels API key/);
  });

  it('names a rejected key rather than reporting a bare 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(searchPhotos('desk', 'bad')).rejects.toThrow(/rejected the API key/);
  });

  it('names a rate limit, which is recoverable by waiting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(searchPhotos('desk', 'key')).rejects.toThrow(/rate limit/);
  });

  it('wraps a network failure as an ImageSearchError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    await expect(searchPhotos('desk', 'key')).rejects.toThrow(ImageSearchError);
  });

  it('survives a photo with missing fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ photos: [{ id: 1 }] })));
    const [result] = await searchPhotos('desk', 'key');
    expect(result).toMatchObject({ id: 1, photographer: 'Unknown', thumb: '' });
  });
});

describe('photoFilename', () => {
  it('builds a readable, collision-resistant name', () => {
    expect(photoFilename('night city', 42, 'https://x/y-large2x.jpg')).toBe('bg-night-city-42.jpg');
  });

  it('strips punctuation and collapses separators', () => {
    expect(photoFilename('  Dark   Mode!! ', 9, 'https://x/a.png')).toBe('bg-dark-mode-9.png');
  });

  it('falls back when the query slugs to nothing', () => {
    expect(photoFilename('!!!', 3, 'https://x/a.jpg')).toBe('bg-photo-3.jpg');
  });

  it('caps a very long query', () => {
    const name = photoFilename('a'.repeat(200), 1, 'https://x/a.jpg');
    expect(name.length).toBeLessThan(60);
  });
});
