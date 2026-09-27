/**
 * Hugging Face models and datasets.
 *
 * No key needed for public repos. The model card is a README with YAML frontmatter carrying
 * the licence and task tags — read for its facts, then stripped, because raw YAML in the
 * prompt reads as noise the model tries to explain.
 */

import { parse as parseYaml } from 'yaml';
import { BODY_LIMIT, cleanMarkdown, SourceError, truncate, type SourceDocument } from './types.js';

const SITE = 'https://huggingface.co';

interface RepoResponse {
  id?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  cardData?: { license?: string | string[]; base_model?: string | string[] };
}

export interface HfTarget {
  /** `models` or `datasets` — the API path segment and the label. */
  type: 'models' | 'datasets';
  id: string;
}

/** Recognise a model or dataset URL, ignoring trailing tabs like /tree/main. */
export function parseHuggingFace(url: string): HfTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)huggingface\.co$/i.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0] === 'datasets') {
    const id = parts.slice(1, 3).join('/');
    return id ? { type: 'datasets', id } : null;
  }
  // Site sections, not repositories.
  if (['spaces', 'docs', 'blog', 'collections', 'papers'].includes(parts[0]!)) return null;

  // A model is owner/name, but a few canonical models sit at the root (e.g. /gpt2).
  const id = parts.length >= 2 ? parts.slice(0, 2).join('/') : parts[0]!;
  return { type: 'models', id };
}

async function get(url: string): Promise<Response> {
  try {
    return await fetch(url, { headers: { 'user-agent': 'carousel-crafter' } });
  } catch (error) {
    throw new SourceError(`Could not reach Hugging Face: ${(error as Error).message}`);
  }
}

/** Pull the frontmatter out of a model card and return it alongside the prose. */
function splitCard(raw: string): { data: Record<string, unknown>; body: string } {
  const lines = raw.split('\n');
  if (lines[0]?.trimEnd() !== '---') return { data: {}, body: raw };

  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---');
  if (closing === -1) return { data: {}, body: raw };

  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = parseYaml(lines.slice(1, closing).join('\n'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed card is still worth drafting from; only its facts are lost.
  }
  return { data, body: lines.slice(closing + 1).join('\n') };
}

const first = (value: unknown): string =>
  Array.isArray(value) ? String(value[0] ?? '') : value === undefined ? '' : String(value);

const number = (value: number | undefined): string =>
  value === undefined ? '' : value.toLocaleString('en-US');

export async function fetchHuggingFace(url: string): Promise<SourceDocument> {
  const target = parseHuggingFace(url);
  if (!target) throw new SourceError(`Not a Hugging Face model or dataset URL: ${url}`);

  const api = await get(`${SITE}/api/${target.type}/${target.id}`);
  if (api.status === 404) throw new SourceError(`No such repository: ${target.id}`);
  if (!api.ok) throw new SourceError(`Hugging Face returned ${api.status} ${api.statusText}.`);
  const repo = (await api.json()) as RepoResponse;

  const prefix = target.type === 'datasets' ? 'datasets/' : '';
  const cardResponse = await get(`${SITE}/${prefix}${target.id}/raw/main/README.md`);
  const { data, body } = splitCard(cardResponse.ok ? await cardResponse.text() : '');

  const facts = [
    { label: 'Downloads (30d)', value: number(repo.downloads) },
    { label: 'Likes', value: number(repo.likes) },
    { label: 'Task', value: repo.pipeline_tag ?? '' },
    { label: 'Library', value: repo.library_name ?? '' },
    { label: 'Licence', value: first(data.license) },
    { label: 'Base model', value: first(data.base_model) },
  ].filter((fact) => fact.value !== '');

  return {
    kind: target.type === 'datasets' ? 'Hugging Face dataset' : 'Hugging Face model',
    title: repo.id ?? target.id,
    url: `${SITE}/${prefix}${target.id}`,
    summary: null,
    facts,
    body: truncate(cleanMarkdown(body), BODY_LIMIT),
  };
}
