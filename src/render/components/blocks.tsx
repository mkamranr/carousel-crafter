/**
 * mdast blocks → React elements.
 *
 * Goes through hast rather than mapping mdast node types by hand: `mdast-util-to-hast`
 * already knows the whole of Markdown, and Shiki plugs in at the hast layer, so highlighting
 * needs no special case in the template.
 *
 * Each top-level block is tagged with `data-block-id="<slideId>:<n>"`. That attribute is the
 * entire contract between the DOM and the model — the overflow probe reports these ids, and
 * `fit/apply.ts` maps them back to mdast nodes to decide where a slide splits.
 */

import type { Element, ElementContent, Root } from 'hast';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { toHast } from 'mdast-util-to-hast';
import type { RootContent } from 'mdast';
import type { ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { highlightToHast } from '../highlight.js';

export function blockId(slideId: string, index: number): string {
  return `${slideId}:${index}`;
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return '';
  return node.children.map(textOf).join('');
}

function languageOf(code: Element): string | null {
  const classes = code.properties.className;
  if (!Array.isArray(classes)) return null;
  const found = classes.map(String).find((name) => name.startsWith('language-'));
  return found ? found.slice('language-'.length) : null;
}

/** Replace every `<pre><code>` in the subtree with Shiki's highlighted equivalent. */
async function highlightCodeBlocks(node: ElementContent): Promise<ElementContent> {
  if (node.type !== 'element') return node;

  if (node.tagName === 'pre') {
    const code = node.children.find(
      (child): child is Element => child.type === 'element' && child.tagName === 'code',
    );
    if (code) return await highlightToHast(textOf(code), languageOf(code));
  }

  const children: ElementContent[] = [];
  for (const child of node.children) children.push(await highlightCodeBlocks(child));
  return { ...node, children };
}

/**
 * Convert one slide's blocks, returning a React node per top-level block.
 *
 * Returned as an array rather than a single fragment so the caller keeps a one-to-one
 * correspondence with the model's block indices.
 */
export async function blocksToReact(slideId: string, blocks: RootContent[]): Promise<ReactNode[]> {
  const out: ReactNode[] = [];

  for (const [index, block] of blocks.entries()) {
    const root = toHast({ type: 'root', children: [block] }) as Root;
    const element = root.children.find((child): child is Element => child.type === 'element');
    // Whitespace-only nodes produce no element; there is nothing to lay out or measure.
    if (!element) continue;

    const highlighted = await highlightCodeBlocks(element);
    if (highlighted.type !== 'element') continue;

    const tagged: Element = {
      ...highlighted,
      properties: { ...highlighted.properties, 'data-block-id': blockId(slideId, index) },
    };

    out.push(
      toJsxRuntime(
        { type: 'root', children: [tagged] },
        { Fragment, jsx, jsxs, development: false },
      ),
    );
  }

  return out;
}
