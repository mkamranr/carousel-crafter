/** Thin wrapper over the local server. Every failure surfaces its message to the toolbar. */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : response.statusText;
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export interface ExportReport {
  slideCount: number;
  passes: number;
  warnings: string[];
  outDir: string;
  files: string[];
  zip: string | null;
  caption: boolean;
}

export const listPosts = () => request<string[]>('/api/posts');

export const createPost = () => request<{ name: string }>('/api/posts', { method: 'POST' });

export const readPost = (name: string) =>
  request<{ name: string; source: string }>(`/api/posts/${encodeURIComponent(name)}`);

export const savePost = (name: string, source: string) =>
  request<{ saved: boolean }>(`/api/posts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source }),
  });

export const exportPost = (name: string, source: string) =>
  request<ExportReport>('/api/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, source }),
  });

export const readConfig = () =>
  request<{ config: Record<string, unknown>; path: string }>('/api/config');

export const writeConfig = (config: unknown) =>
  request<{ config: Record<string, unknown>; saved: boolean }>('/api/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  });

export const fetchModels = () => request<{ models: string[]; error?: string }>('/api/llm/models');

/**
 * Stream a draft, handing each chunk to `onDelta` as it lands.
 *
 * A local model can take a minute to write a carousel, and a minute of a blank screen is
 * indistinguishable from a hang — so the text appears as it is written.
 *
 * The server cannot send an HTTP error once streaming has begun, so it writes a marker into
 * the body instead. Everything after it is a message, not draft text.
 */
export const ERROR_MARKER = '[[carousel-crafter:error]]';

export const streamGenerate = (
  input: { topic: string; url: string },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) => streamInto('/api/generate', input, onDelta, signal);

export interface PhotoResult {
  id: number;
  thumb: string;
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export const searchPhotos = (query: string) =>
  request<{ photos: PhotoResult[] }>(`/api/images/search?q=${encodeURIComponent(query)}`);

export const downloadPhoto = (body: { url: string; id: number; query: string; credit: string }) =>
  request<{ name: string; bytes: number }>('/api/images/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Ask the browser to save the exported archive.
 *
 * A same-origin anchor with `download` rather than assigning `location`: navigating away and
 * relying on the attachment header to bring you back is fragile, and a click on a detached
 * anchor is the boring thing that works everywhere.
 */
export function downloadExport(name: string): void {
  const anchor = document.createElement('a');
  anchor.href = `/api/export/${encodeURIComponent(name)}/zip`;
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export const readCaption = (name: string) =>
  request<{ caption: string }>(`/api/caption/${encodeURIComponent(name)}`);

export interface SourcePreview {
  kind: string;
  title: string;
  url: string;
  facts: { label: string; value: string }[];
}

export const readSource = (url: string) =>
  request<SourcePreview>(`/api/source?url=${encodeURIComponent(url)}`);

/** Shared by generation and captioning: both stream plain text with the same error marker. */
async function streamInto(
  url: string,
  body: unknown,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const parsed: unknown = await response.json().catch(() => null);
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String(parsed.error)
        : response.statusText;
    throw new Error(message);
  }
  if (!response.body) throw new Error('The server returned no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let seen = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    seen += chunk;
    const marker = seen.indexOf(ERROR_MARKER);
    if (marker !== -1) {
      throw new Error(seen.slice(marker + ERROR_MARKER.length).trim() || 'Generation failed.');
    }
    onDelta(chunk);
  }
}

export const streamCaption = (
  name: string,
  source: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
) => streamInto('/api/caption', { name, source }, onDelta, signal);

export async function fetchFontCss(): Promise<string> {
  const response = await fetch('/api/font-css');
  if (!response.ok) throw new Error('Could not load the bundled fonts.');
  return response.text();
}
