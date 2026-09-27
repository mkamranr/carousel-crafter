/**
 * What a fetched link looks like once it has been read.
 *
 * Normalised across sources so the prompt sees one shape: a few hard facts worth putting on
 * a slide, and the prose that explains them. A GitHub repo and a Hugging Face model differ
 * in almost every detail and not at all in what a carousel needs from them.
 */

export interface SourceFact {
  label: string;
  value: string;
}

export interface SourceDocument {
  /** For the prompt's framing, e.g. "GitHub repository". */
  kind: string;
  title: string;
  url: string;
  /** One-line description, where the source provides one. */
  summary: string | null;
  /** Stars, downloads, licence, language — the numbers a slide can carry. */
  facts: SourceFact[];
  /** The README or model card, cleaned and truncated. */
  body: string;
}

export class SourceError extends Error {}

/**
 * Strip a README down to what is worth reading.
 *
 * READMEs open with a wall of badges, centred HTML and logos that carry no information a
 * carousel can use, and every token of it competes with the prose for the model's attention.
 */
export function cleanMarkdown(raw: string): string {
  // Fenced code is protected before anything strips tags. The HTML rule below cannot tell
  // `<div>` from `Array<string>` or `function f<T>()`, and a tool about code that quietly
  // deletes generics out of every example would be worse than one that left the badges in.
  // A private-use character, not NUL: a control character in the restore regex is both a
  // lint error and a needless hazard, and U+E000 cannot appear in a real README.
  const MARK = '\uE000';
  const fences: string[] = [];
  const guarded = raw.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, (block) => {
    fences.push(block);
    return `${MARK}FENCE${fences.length - 1}${MARK}`;
  });

  const cleaned = guarded
    // HTML comments, including the hidden directives some READMEs carry.
    .replace(/<!--[\s\S]*?-->/g, '')
    // Badge rows: a linked image, usually several per line.
    .replace(/^\s*(?:\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*)+$/gm, '')
    .replace(/^\s*(?:!\[[^\]]*\]\([^)]*\)\s*)+$/gm, '')
    // Raw HTML blocks — <p align="center"> wrappers, <img> logos, <div> banners.
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned.replace(/\uE000FENCE(\d+)\uE000/g, (_, index) => fences[Number(index)] ?? '');
}

/**
 * Cut to a budget at a paragraph boundary.
 *
 * READMEs run to tens of thousands of characters and the interesting part is nearly always
 * the top: what it is, why it exists, how you use it. Cutting mid-sentence would leave the
 * model completing a fragment, so the break lands on a blank line where one is near.
 */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const lastBreak = window.lastIndexOf('\n\n');
  const cut = lastBreak > limit * 0.6 ? window.slice(0, lastBreak) : window;
  return `${cut.trim()}\n\n[…truncated]`;
}

/** Characters of README handed to the model. Roughly 3k tokens — the top of any README. */
export const BODY_LIMIT = 12_000;
