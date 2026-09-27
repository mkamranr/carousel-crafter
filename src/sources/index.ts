/**
 * Reading a link.
 *
 * Dispatch is by host, and only known hosts are accepted. That is a deliberate limit rather
 * than an unfinished one: a server that fetches whatever URL it is handed can be pointed at
 * a cloud metadata endpoint or anything else reachable from this machine, and the value of
 * a general fetcher does not cover that.
 */

import { fetchRepo, parseRepo } from './github.js';
import { fetchHuggingFace, parseHuggingFace } from './huggingface.js';
import { SourceError, type SourceDocument } from './types.js';

export { SourceError, type SourceDocument } from './types.js';

export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Whether a link can be read, without fetching it. */
export function isSupported(url: string): boolean {
  return parseRepo(url) !== null || parseHuggingFace(url) !== null;
}

export async function fetchSource(url: string): Promise<SourceDocument> {
  const trimmed = url.trim();
  if (parseRepo(trimmed)) return fetchRepo(trimmed);
  if (parseHuggingFace(trimmed)) return fetchHuggingFace(trimmed);
  throw new SourceError(
    `Only GitHub repositories and Hugging Face models or datasets can be read. Got: ${trimmed}`,
  );
}
