/**
 * Slide measurement and the in-page shrink search.
 *
 * A plain function, not a string. Playwright serialises a function passed to `page.evaluate`
 * and runs it in the page, and the browser preview calls it directly against an iframe's
 * document — so one implementation drives both, and the preview cannot drift from the export.
 *
 * The cost of that is a hard constraint: this function must be **entirely self-contained**.
 * It may not reference an import, a module-level constant, or anything else outside its own
 * body, because none of that exists in the page it is serialised into. The `doc` parameter is
 * how the browser aims it at an iframe; Playwright leaves it at the page's own `document`.
 *
 * Measurement is three-way, because no single check is sufficient:
 *
 *  1. The content box's `scrollHeight` vs `clientHeight` — content that is simply too tall.
 *  2. Each top-level block's bottom edge vs the box's — which also says WHERE to split.
 *  3. Any clipping descendant's own `scrollHeight` vs `clientHeight` — an element hiding its
 *     own overflow, such as a `<pre>`. Neither of the first two can see this: the ancestor's
 *     box stays inside bounds while the content inside it is silently cut off.
 *
 * Check 3 is not hypothetical. Without it, a 60-line code fence on a centred cover slide
 * measured as fitting perfectly while rendering truncated.
 */

export interface SlideFit {
  slideId: string;
  scale: number;
  overflow: number;
  /** The last top-level block that fits, or null when even the first one does not. */
  lastFittingBlockId: string | null;
}

export interface FitArgs {
  /** Smallest acceptable type scale before splitting has to take over. */
  floor: number;
  /** Halvings of the search interval. Six resolves to under half a percent. */
  steps: number;
}

/**
 * Binary-search the largest `--fit-scale` at which each slide fits, and leave it applied.
 *
 * The whole search runs in the page: every probe is a custom-property write plus a forced
 * layout, so six steps cost one round trip instead of six re-renders. That is why every type
 * size in the stylesheet is `calc(base * var(--fit-scale))`.
 */
export function fitScales({ floor, steps }: FitArgs, doc: Document = document): SlideFit[] {
  const view = doc.defaultView;
  if (!view) return [];

  const results: SlideFit[] = [];

  for (const slide of Array.from(doc.querySelectorAll('.slide'))) {
    const box = slide.querySelector('.slide__content');
    if (!box) continue;

    const measure = (): { overflow: number; lastFittingBlockId: string | null } => {
      const rect = box.getBoundingClientRect();
      let worst = Math.max(0, box.scrollHeight - box.clientHeight);
      let lastFitting: string | null = null;

      for (const block of Array.from(box.querySelectorAll(':scope > [data-block-id]'))) {
        const blockRect = block.getBoundingClientRect();
        worst = Math.max(worst, blockRect.bottom - rect.bottom);
        // Half a pixel of slack: sub-pixel layout noise is not overflow.
        if (blockRect.bottom <= rect.bottom + 0.5) {
          lastFitting = block.getAttribute('data-block-id');
        }
      }

      for (const el of Array.from(box.querySelectorAll('*'))) {
        // Only elements that actually clip can hide overflow; visible ones already showed up
        // in the edge comparison above.
        if (view.getComputedStyle(el).overflowY === 'visible') continue;
        worst = Math.max(worst, el.scrollHeight - el.clientHeight);
      }

      return { overflow: Math.max(0, Math.round(worst)), lastFittingBlockId: lastFitting };
    };

    const at = (scale: number) => {
      (slide as HTMLElement).style.setProperty('--fit-scale', String(scale));
      return measure();
    };

    let chosen = 1;
    let reading = at(1);

    if (reading.overflow > 0) {
      // Invariant: lo is the best scale proven to fit (or the floor, unproven), hi is known
      // not to fit. Halving narrows the gap; the floor is the last resort.
      let lo = floor;
      let hi = 1;
      let best: { overflow: number; lastFittingBlockId: string | null } | null = null;
      chosen = floor;

      for (let i = 0; i < steps; i += 1) {
        const mid = (lo + hi) / 2;
        const probe = at(mid);
        if (probe.overflow === 0) {
          chosen = mid;
          best = probe;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      reading = best ?? at(floor);
      if (!best) chosen = floor;
      else at(chosen);
    }

    results.push({
      slideId: slide.getAttribute('data-slide-id') ?? '',
      scale: chosen,
      overflow: reading.overflow,
      lastFittingBlockId: reading.lastFittingBlockId,
    });
  }

  return results;
}
