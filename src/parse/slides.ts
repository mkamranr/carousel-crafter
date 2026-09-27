/**
 * Markdown source → `SlideDoc`.
 *
 * The one subtlety is that remark reports `---`, `***` and `___` as the same `thematicBreak`
 * node, but only `---` separates slides here. The node's source offset tells them apart: the
 * first character of its range is the marker the author actually typed. Without that check a
 * horizontal rule inside a slide would silently break the deck in two.
 */

import type { Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Slide, SlideDoc } from '../types.js';
import { splitFrontmatter } from './frontmatter.js';
import { defaultRole, extractRole } from './roles.js';

const processor = unified().use(remarkParse).use(remarkGfm);

const isSlideBreak = (node: RootContent, body: string): boolean => {
  if (node.type !== 'thematicBreak') return false;
  const offset = node.position?.start?.offset;
  // No position means the node was synthesised rather than parsed. Nothing to inspect, so
  // treat it as a rule — splitting the deck on a guess is the worse failure.
  if (offset === undefined) return false;
  return body[offset] === '-';
};

function groupIntoSlides(children: RootContent[], body: string): RootContent[][] {
  const groups: RootContent[][] = [[]];
  for (const node of children) {
    if (isSlideBreak(node, body)) {
      groups.push([]);
      continue;
    }
    groups[groups.length - 1]!.push(node);
  }
  return groups;
}

export function parseDocument(source: string): SlideDoc {
  const { data, body } = splitFrontmatter(source);
  const root = processor.parse(body) as Root;

  const slides: Slide[] = [];
  for (const group of groupIntoSlides(root.children, body)) {
    const { role, blocks } = extractRole(group);
    // Consecutive separators, or a trailing one, leave groups with nothing to draw.
    if (blocks.length === 0) continue;
    slides.push({
      id: `s${slides.length + 1}`,
      role: role ?? defaultRole(slides.length),
      blocks,
    });
  }

  return { frontmatter: data, slides };
}
