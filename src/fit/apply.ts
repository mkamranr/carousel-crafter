/**
 * Applying a measurement to the model.
 *
 * Pure: measurements in, a new `SlideDoc` out. No browser, no DOM, no I/O — which is what
 * lets the hard part of this tool be tested in milliseconds.
 *
 * TERMINATION. Every split strictly decreases the measure `(block count, lines in the first
 * block)` lexicographically on the slide being split, and every slide produced keeps at least
 * one block. Both components are non-negative integers, so the measure is well-founded and
 * the outer loop must terminate. The lexicographic pair is what covers both split kinds: a
 * normal split drops the block count, while a code-fence line split leaves the block count at
 * 1 and reduces the line count instead — which the block count alone would miss.
 *
 * A slide that cannot be divided any further is reported, never retried.
 */

import type { Code, RootContent } from 'mdast';
import type { Slide, SlideDoc } from '../types.js';
import type { SlideFit } from './probe.js';

export interface Unfittable {
  slideId: string;
  overflow: number;
}

export interface SplitResult {
  doc: SlideDoc;
  /** False when no slide could be divided — the caller must stop rather than loop. */
  changed: boolean;
  unfittable: Unfittable[];
}

const blockIndexOf = (blockId: string | null): number | null => {
  if (blockId === null) return null;
  const raw = blockId.slice(blockId.lastIndexOf(':') + 1);
  const index = Number.parseInt(raw, 10);
  return Number.isNaN(index) ? null : index;
};

/** Halve a code fence by lines. Deterministic, and halving reaches one line in log(n) steps. */
function splitCode(node: Code): [Code, Code] | null {
  const lines = node.value.split('\n');
  if (lines.length < 2) return null;
  const at = Math.ceil(lines.length / 2);
  return [
    { ...node, value: lines.slice(0, at).join('\n'), position: undefined },
    { ...node, value: lines.slice(at).join('\n'), position: undefined },
  ];
}

/**
 * How many leading blocks the slide keeps.
 *
 * Clamped into `[1, blocks.length - 1]` so a split always leaves both sides non-empty, which
 * is the invariant the termination argument rests on.
 */
function keepCount(lastFitting: string | null, total: number): number {
  const index = blockIndexOf(lastFitting);
  const desired = index === null ? 1 : index + 1;
  return Math.min(Math.max(desired, 1), total - 1);
}

export function applySplits(doc: SlideDoc, fits: readonly SlideFit[]): SplitResult {
  const overflowing = new Map(
    fits.filter((f) => f.overflow > 0).map((f) => [f.slideId, f] as const),
  );
  if (overflowing.size === 0) return { doc, changed: false, unfittable: [] };

  const slides: Slide[] = [];
  const unfittable: Unfittable[] = [];
  let changed = false;
  let sequence = 0;

  const nextId = (origin: string): string => {
    sequence += 1;
    return `${origin}c${sequence}`;
  };

  for (const slide of doc.slides) {
    const fit = overflowing.get(slide.id);
    if (!fit) {
      slides.push(slide);
      continue;
    }

    if (slide.blocks.length > 1) {
      const keep = keepCount(fit.lastFittingBlockId, slide.blocks.length);
      slides.push({ ...slide, blocks: slide.blocks.slice(0, keep) });
      slides.push({
        id: nextId(slide.id),
        // A continued cover is no longer a cover; only the first part carries that treatment.
        role: 'content',
        blocks: slide.blocks.slice(keep),
        continuationOf: slide.continuationOf ?? slide.id,
      });
      changed = true;
      continue;
    }

    const only = slide.blocks[0];
    const halves = only && only.type === 'code' ? splitCode(only) : null;
    if (halves) {
      const [head, tail] = halves;
      slides.push({ ...slide, blocks: [head as RootContent] });
      slides.push({
        id: nextId(slide.id),
        role: 'content',
        blocks: [tail as RootContent],
        continuationOf: slide.continuationOf ?? slide.id,
      });
      changed = true;
      continue;
    }

    // Nothing left to divide. Report it and move on — retrying would spin forever.
    unfittable.push({ slideId: slide.id, overflow: fit.overflow });
    slides.push(slide);
  }

  return { doc: { ...doc, slides }, changed, unfittable };
}
