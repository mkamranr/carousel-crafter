/**
 * Syntax highlighting.
 *
 * Runs once, at the hast stage, before the fit loop ever executes — highlighting inside the
 * loop would repeat the most expensive step of the render for every scale probe.
 *
 * Built from `shiki/core` with an explicit language list rather than the `shiki` shorthand.
 * The shorthand lazily loads any grammar on demand, which in a bundled browser build means
 * every grammar Shiki ships becomes a chunk — several hundred of them, plus a 622KB
 * oniguruma wasm engine. The JavaScript regex engine and a curated list cost a fraction of
 * that and cover what tech carousels actually contain.
 *
 * A language outside the list is not an error: it falls back to unhighlighted text, because a
 * carousel with plain-looking code beats no carousel, and the tag is the author's typo to fix.
 */

import type { Element, Root } from 'hast';
import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

export const CODE_THEME = 'github-dark-default';

type LangModule = { default: LanguageRegistration[] };

/** What tech content is actually written in. Add here rather than widening to the full set. */
const LANGUAGES: Record<string, () => Promise<LangModule>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  shellscript: () => import('@shikijs/langs/shellscript'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  sql: () => import('@shikijs/langs/sql'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  yaml: () => import('@shikijs/langs/yaml'),
  markdown: () => import('@shikijs/langs/markdown'),
  diff: () => import('@shikijs/langs/diff'),
};

/** Common spellings mapped onto the grammars above. */
const ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  console: 'shellscript',
  py: 'python',
  rs: 'rust',
  golang: 'go',
  yml: 'yaml',
  md: 'markdown',
};

// One highlighter per process. Creating it per code block would reload the theme every time.
let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [import('@shikijs/themes/github-dark-default')],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

/** Resolve a fence's tag to a loaded grammar, or null to render it as plain text. */
async function resolveLanguage(core: HighlighterCore, tag: string | null): Promise<string | null> {
  if (tag === null) return null;
  const name = ALIASES[tag.toLowerCase()] ?? tag.toLowerCase();
  const load = LANGUAGES[name];
  if (!load) return null;
  if (!core.getLoadedLanguages().includes(name)) {
    await core.loadLanguage(await load());
  }
  return name;
}

/**
 * The caption naming the fence's language.
 *
 * Prepended inside the <pre> rather than added as a sibling so a split code block carries it
 * onto each continuation slide — `fit/apply.ts` moves whole blocks, and the label travels
 * with the one it labels.
 */
function languageCaption(label: string): Element {
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: ['cc-lang'] },
    children: [{ type: 'text', value: label }],
  };
}

export async function highlightToHast(code: string, lang: string | null): Promise<Element> {
  const core = await getHighlighter();
  const resolved = await resolveLanguage(core, lang);

  const root = core.codeToHast(code, {
    lang: resolved ?? 'text',
    theme: CODE_THEME,
  }) as Root;

  const pre = root.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'pre',
  );
  if (!pre) throw new Error('Shiki returned no <pre> element.');

  // Shiki paints its own theme background on the <pre>. The slide stylesheet owns that
  // surface, so the declaration is dropped and only the foreground colours survive.
  delete pre.properties.style;
  delete pre.properties.tabindex;

  // Labelled with what the author wrote, not the grammar it resolved to: someone who typed
  // `sh` should not see SHELLSCRIPT, and a fence tagged with an unsupported language still
  // deserves its name even though it renders unhighlighted.
  if (lang !== null && lang.trim() !== '') {
    pre.children.unshift(languageCaption(lang.trim()));
  }

  return pre;
}
