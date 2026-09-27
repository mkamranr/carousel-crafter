import { useEffect, useRef, useState } from 'react';
import type { SlideFit } from '../../../src/fit/probe.js';

/** Must match the seam in `SLIDE_CSS`, or the badge offsets drift down the deck. */
const SLIDE_GAP = 2;

interface PreviewProps {
  html: string;
  fits: SlideFit[];
  canvas: { width: number; height: number };
}

export function Preview({ html, fits, canvas }: PreviewProps) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);

  // The preview is a 1080px-wide document shown in a pane of whatever width is going, so the
  // scale is recomputed rather than assumed.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const available = entry.contentRect.width - 32;
      setScale(Math.min(available / canvas.width, 0.6));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canvas.width]);

  const slideStride = canvas.height + SLIDE_GAP;
  const documentHeight = Math.max(fits.length, 1) * slideStride;

  return (
    <div ref={container} className="relative h-full overflow-auto bg-neutral-900 p-4">
      <div
        style={{ width: canvas.width * scale, height: documentHeight * scale }}
        className="relative"
      >
        <iframe
          title="slide preview"
          srcDoc={html}
          scrolling="no"
          style={{
            width: canvas.width,
            height: documentHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
          }}
        />

        {fits.map((fit, index) => (
          <Badge
            key={fit.slideId}
            fit={fit}
            index={index}
            top={index * slideStride * scale}
            width={canvas.width * scale}
          />
        ))}
      </div>
    </div>
  );
}

function Badge({
  fit,
  index,
  top,
  width,
}: {
  fit: SlideFit;
  index: number;
  top: number;
  width: number;
}) {
  const overflowing = fit.overflow > 0;
  const shrunk = fit.scale < 1;

  return (
    <div
      className="pointer-events-none absolute flex items-center gap-1.5"
      style={{ top: top + 6, left: width + 8 }}
    >
      <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
        {String(index + 1).padStart(2, '0')}
      </span>
      {overflowing && (
        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] text-red-300">
          overflows {fit.overflow}px
        </span>
      )}
      {!overflowing && shrunk && (
        // Worth surfacing: the slide fits, but only because the type was scaled down. Seeing
        // it is the cue to cut a sentence rather than ship smaller text.
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-300">
          {Math.round(fit.scale * 100)}%
        </span>
      )}
    </div>
  );
}
