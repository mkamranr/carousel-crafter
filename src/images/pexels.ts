/**
 * Pexels search and download.
 *
 * Photos are fetched when you pick one and written into the posts folder, never at render
 * time. That is what keeps renders offline and reproducible — by the time a slide is drawn,
 * a background is an ordinary local file like any other image.
 *
 * `photographer` travels with every result and is stored alongside the download. Pexels'
 * licence does not require attribution for the photo itself, but their API guidelines ask
 * that photographers be credited when photos are sourced through the API. Keeping the name
 * makes crediting possible; whether to credit stays the author's call.
 */

import { writeFile } from 'node:fs/promises';
import { extname } from 'node:path';

const SEARCH_URL = 'https://api.pexels.com/v1/search';

export interface PhotoResult {
  id: number;
  /** Small, for the picker grid. */
  thumb: string;
  /** Large, for the actual download. */
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export class ImageSearchError extends Error {}

interface PexelsPhoto {
  id: number;
  alt?: string;
  url?: string;
  photographer?: string;
  photographer_url?: string;
  src?: Record<string, string>;
}

export async function searchPhotos(
  query: string,
  apiKey: string,
  perPage = 18,
): Promise<PhotoResult[]> {
  if (!apiKey.trim()) {
    throw new ImageSearchError('No Pexels API key. Add one in Settings, or set PEXELS_API_KEY.');
  }

  const url = new URL(SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  // Carousels are 4:5, so portrait crops lose the least when a photo is covered into frame.
  url.searchParams.set('orientation', 'portrait');

  let response: Response;
  try {
    // Pexels takes a bare key, NOT a Bearer token — sending "Bearer <key>" is rejected.
    response = await fetch(url, { headers: { Authorization: apiKey.trim() } });
  } catch (error) {
    throw new ImageSearchError(`Could not reach Pexels: ${(error as Error).message}`);
  }

  if (response.status === 401) {
    throw new ImageSearchError('Pexels rejected the API key.');
  }
  if (response.status === 429) {
    throw new ImageSearchError('Pexels rate limit reached. Wait a minute and try again.');
  }
  if (!response.ok) {
    throw new ImageSearchError(`Pexels returned ${response.status} ${response.statusText}.`);
  }

  const body = (await response.json()) as { photos?: PexelsPhoto[] };
  return (body.photos ?? []).map((photo) => ({
    id: photo.id,
    thumb: photo.src?.medium ?? photo.src?.small ?? '',
    // large2x is ~1880px wide — comfortably past the 1080 canvas at 2x without pulling the
    // multi-megabyte original for something that will be scrimmed and blurred anyway.
    full: photo.src?.large2x ?? photo.src?.large ?? photo.src?.original ?? '',
    alt: photo.alt ?? '',
    photographer: photo.photographer ?? 'Unknown',
    photographerUrl: photo.photographer_url ?? '',
    pexelsUrl: photo.url ?? '',
  }));
}

/** Fetch the bytes and write them into the posts folder. */
export async function downloadPhoto(url: string, destination: string): Promise<number> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new ImageSearchError(`Could not download the photo: ${(error as Error).message}`);
  }
  if (!response.ok) {
    throw new ImageSearchError(`Could not download the photo: ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, bytes);
  return bytes.byteLength;
}

/** A stable, readable filename derived from the search and the photo id. */
export function photoFilename(query: string, id: number, from: string): string {
  const slug =
    query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'photo';
  const extension = extname(new URL(from).pathname) || '.jpg';
  return `bg-${slug}-${id}${extension}`;
}
