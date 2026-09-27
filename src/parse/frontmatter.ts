/**
 * Leading YAML frontmatter, separated from the document body.
 *
 * `---` means three different things in this format: the frontmatter fence, the slide
 * separator, and a Markdown thematic break. Disambiguation is positional and lives here:
 * frontmatter exists ONLY when the very first line of the file is the fence. Every other
 * `---` belongs to the body, where `parse/slides.ts` decides what it means.
 *
 * `gray-matter` would do this too, but its delimiter handling would have to be fought rather
 * than used — and the rule above is the one thing about this format worth owning outright.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface SplitFrontmatter {
  data: Record<string, unknown>;
  body: string;
}

const isFence = (line: string): boolean => line.trimEnd() === '---';

export function splitFrontmatter(source: string): SplitFrontmatter {
  const lines = source.split('\n');
  const first = lines[0];
  if (first === undefined || !isFence(first)) return { data: {}, body: source };

  const closing = lines.findIndex((line, index) => index > 0 && isFence(line));
  if (closing === -1) {
    throw new Error('Unterminated frontmatter: the opening `---` has no matching `---`.');
  }

  const parsed: unknown = parseYaml(lines.slice(1, closing).join('\n'));
  // `null` is what an empty frontmatter block yields, and it is not an error.
  if (parsed === null || parsed === undefined) {
    return { data: {}, body: lines.slice(closing + 1).join('\n') };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Frontmatter must be a YAML mapping of keys to values.');
  }

  return {
    data: parsed as Record<string, unknown>,
    body: lines.slice(closing + 1).join('\n'),
  };
}

/**
 * Set or replace frontmatter keys, leaving the body untouched.
 *
 * Used by the image picker to record a chosen background without the author hand-editing
 * YAML. It lives here, beside `splitFrontmatter`, so the rule about where frontmatter may
 * appear is stated once — a writer that guessed differently would be the fastest way to turn
 * a slide separator into a broken frontmatter block.
 *
 * A key set to null is removed, which is how a background gets cleared.
 */
export function setFrontmatter(source: string, updates: Record<string, string | null>): string {
  const { data, body } = splitFrontmatter(source);

  const merged: Record<string, unknown> = { ...data };
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }

  if (Object.keys(merged).length === 0) {
    // Nothing left to state. Emitting an empty `---\n---` block would leave the file opening
    // on what looks like a slide separator.
    return body.replace(/^\n+/, '');
  }

  const yaml = stringifyYaml(merged).trimEnd();
  return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, '')}`;
}
