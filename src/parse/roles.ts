/**
 * Slide roles.
 *
 * Convention carries the common case — the first slide is the cover, everything else is
 * content — and an HTML comment overrides it when the convention is wrong. The marker is a
 * comment so the source stays valid Markdown that renders sanely anywhere else.
 */

import type { RootContent } from 'mdast';
import type { SlideRole } from '../types.js';

const MARKER = /^<!--\s*role\s*:\s*([A-Za-z]+)\s*-->$/;

const ROLES: readonly SlideRole[] = ['cover', 'content', 'cta'];

const isRole = (value: string): value is SlideRole => (ROLES as readonly string[]).includes(value);

export interface RoleExtraction {
  /** Null when the slide carries no valid marker, leaving the convention to decide. */
  role: SlideRole | null;
  /** The blocks with any role marker removed, so it never reaches the template. */
  blocks: RootContent[];
}

/**
 * Pull a role marker out of a slide's blocks.
 *
 * An unrecognised role is dropped rather than raised: the marker is still removed (it is
 * plainly meant as one, and rendering a raw HTML comment would look broken) but the
 * convention decides the role. `parse/slides.ts` warns about it separately.
 */
export function extractRole(blocks: RootContent[]): RoleExtraction {
  let role: SlideRole | null = null;
  const kept: RootContent[] = [];

  for (const block of blocks) {
    const match = block.type === 'html' ? MARKER.exec(block.value.trim()) : null;
    if (!match) {
      kept.push(block);
      continue;
    }
    const candidate = match[1]!.toLowerCase();
    if (isRole(candidate)) role = candidate;
  }

  return { role, blocks: kept };
}

/** The convention, applied wherever no marker overrode it. */
export function defaultRole(index: number): SlideRole {
  return index === 0 ? 'cover' : 'content';
}
