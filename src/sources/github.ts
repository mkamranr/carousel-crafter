/**
 * GitHub repositories.
 *
 * Unauthenticated by default: 60 requests an hour is far past what drafting a carousel
 * needs, and requiring a token to read a public README would be a poor trade. `GITHUB_TOKEN`
 * lifts the limit for anyone who already has one.
 */

import { BODY_LIMIT, cleanMarkdown, SourceError, truncate, type SourceDocument } from './types.js';

const API = 'https://api.github.com';

/** GitHub rejects requests without one, so it is not optional. */
const UA = 'carousel-crafter';

interface RepoResponse {
  full_name?: string;
  description?: string | null;
  html_url?: string;
  stargazers_count?: number;
  forks_count?: number;
  language?: string | null;
  topics?: string[];
  license?: { spdx_id?: string; name?: string } | null;
  homepage?: string | null;
}

/** `owner/repo` from any of the URL shapes people paste. */
export function parseRepo(url: string): { owner: string; repo: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;

  const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/i, '') };
}

function headers(): Record<string, string> {
  const base: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': UA,
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) base.authorization = `Bearer ${token}`;
  return base;
}

async function call(path: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { headers: headers() });
  } catch (error) {
    throw new SourceError(`Could not reach GitHub: ${(error as Error).message}`);
  }
  if (response.status === 404) throw new SourceError(`No such repository: ${path.slice(7)}`);
  if (response.status === 403 || response.status === 429) {
    throw new SourceError(
      'GitHub rate limit reached. Wait an hour, or set GITHUB_TOKEN to raise the limit.',
    );
  }
  if (!response.ok) {
    throw new SourceError(`GitHub returned ${response.status} ${response.statusText}.`);
  }
  return response;
}

const number = (value: number | undefined): string =>
  value === undefined ? '' : value.toLocaleString('en-US');

export async function fetchRepo(url: string): Promise<SourceDocument> {
  const target = parseRepo(url);
  if (!target) throw new SourceError(`Not a GitHub repository URL: ${url}`);
  const slug = `${target.owner}/${target.repo}`;

  const repo = (await (await call(`/repos/${slug}`)).json()) as RepoResponse;

  // A repository without a README is unusual but not an error; the description and the facts
  // are still enough to draft from.
  let body = '';
  try {
    const readme = (await (await call(`/repos/${slug}/readme`)).json()) as {
      content?: string;
      encoding?: string;
    };
    if (readme.content && readme.encoding === 'base64') {
      body = Buffer.from(readme.content, 'base64').toString('utf8');
    }
  } catch {
    body = '';
  }

  const facts = [
    { label: 'Stars', value: number(repo.stargazers_count) },
    { label: 'Forks', value: number(repo.forks_count) },
    { label: 'Language', value: repo.language ?? '' },
    { label: 'Licence', value: repo.license?.spdx_id ?? repo.license?.name ?? '' },
    { label: 'Topics', value: (repo.topics ?? []).slice(0, 6).join(', ') },
  ].filter((fact) => fact.value !== '' && fact.value !== 'NOASSERTION');

  return {
    kind: 'GitHub repository',
    title: repo.full_name ?? slug,
    url: repo.html_url ?? `https://github.com/${slug}`,
    summary: repo.description ?? null,
    facts,
    body: truncate(cleanMarkdown(body), BODY_LIMIT),
  };
}
