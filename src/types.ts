/**
 * The model that flows through the pipeline.
 *
 * `Slide.blocks` holds mdast block nodes rather than rendered HTML, because splitting an
 * overflowing slide happens here — at the model level — and then re-renders. Splitting the
 * DOM instead would leave the model describing something the page no longer shows.
 */

import type { RootContent } from 'mdast';

export type SlideRole = 'cover' | 'content' | 'cta';

export interface Slide {
  /** Stable within one document. Half of the `data-block-id` the overflow probe reports. */
  id: string;
  role: SlideRole;
  blocks: RootContent[];
  /** Set on slides produced by splitting; carries the id of the slide they continue. */
  continuationOf?: string;
}

export interface SlideDoc {
  frontmatter: Record<string, unknown>;
  slides: Slide[];
}
