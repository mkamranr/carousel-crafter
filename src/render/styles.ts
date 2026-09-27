/**
 * The slide stylesheet.
 *
 * Lives in TypeScript rather than a `.css` file under `assets/` so it survives `tsc` without
 * a copy step, and so the CLI never has to resolve a path relative to anything.
 *
 * Every type size is `calc(<base>px * var(--fit-scale))`. That indirection is the whole
 * reason the fit loop is cheap: shrinking a slide is one custom-property write in the page,
 * not a re-render from Node. A hard-coded size is silently exempt from fitting, so there
 * should be none — `test/render/styles.test.ts` checks the property is present at all.
 *
 * No backticks anywhere in here. This string is a template literal, and one inside a comment
 * terminates it early with a syntax error far from the cause. It has happened twice.
 */

export const SLIDE_CSS = `
*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: #000;
  /* A missing weight must never be faux-bolded — synthesis differs between machines and
     would quietly make renders non-reproducible. */
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
  /* Stacks the slides with a visible seam. Capture screenshots each .slide element, never
     the page, so this affects only how the document reads when a human opens it — in the web
     preview, or when debugging a render by hand. */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.slide {
  --fit-scale: 1;
  --pad: 84px;
  position: relative;
  width: var(--cc-width);
  height: var(--cc-height);
  padding: var(--pad);
  background: var(--cc-background);
  color: var(--cc-text);
  font-family: var(--cc-body-font);
  display: flex;
  flex-direction: column;
  /* Clips anything that escapes. This is deliberate — and it is exactly why the overflow
     probe walks descendants instead of trusting the root's scrollHeight. */
  overflow: hidden;
}

/* ---- ambient background, cover and CTA only ----
   Generated, never fetched: two soft radial washes of the accent plus a faint grid. Stock
   photography behind a headline is the quickest way to make a carousel less readable, and
   these cost no network request, no API key and no attribution. */

.slide--cover::before,
.slide--cta::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      105% 72% at 6% -12%,
      color-mix(in srgb, var(--cc-accent) 52%, transparent) 0%,
      color-mix(in srgb, var(--cc-accent) 16%, transparent) 38%,
      transparent 66%
    ),
    radial-gradient(
      85% 62% at 110% 108%,
      color-mix(in srgb, var(--cc-accent) 34%, transparent) 0%,
      transparent 60%
    );
  pointer-events: none;
}

.slide--cover::after,
.slide--cta::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--cc-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--cc-border) 1px, transparent 1px);
  background-size: 72px 72px;
  /* Texture, not a grid you consciously notice — but the first pass at 0.16 was invisible. */
  opacity: 0.34;
  mask-image: radial-gradient(80% 60% at 50% 40%, #000 0%, transparent 78%);
  pointer-events: none;
}

/* ---- photo background, cover and CTA only ----
   A photo behind a headline is the fastest way to make a carousel unreadable, so it is never
   shown raw: desaturated, darkened, and covered by a scrim heavy enough that white type holds
   contrast over any photo, not just a convenient one. */

.slide__photo {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  filter: saturate(0.5) contrast(1.04) brightness(0.72);
}

.slide__photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--cc-background) 58%, transparent) 0%,
      color-mix(in srgb, var(--cc-background) 82%, transparent) 55%,
      color-mix(in srgb, var(--cc-background) 94%, transparent) 100%
    );
}

/* With a photo present the grid is clutter on top of detail — the wash still reads. */
.slide--has-photo::after { display: none; }

/* A content slide carries prose and code, so its scrim is far heavier than a cover's. The
   photo is atmosphere there, not subject; anything lighter and syntax highlighting starts
   competing with whatever is behind it. */
.slide--content .slide__photo { filter: saturate(0.35) contrast(1) brightness(0.5); }
.slide--content .slide__photo::after {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--cc-background) 88%, transparent) 0%,
    color-mix(in srgb, var(--cc-background) 93%, transparent) 100%
  );
}

/* Photographer credit, when the author chooses to show one. Small and out of the way; it is
   an obligation being met, not a design element. */
.slide__credit {
  position: absolute;
  right: 84px;
  bottom: 148px;
  z-index: 2;
  font-size: 17px;
  letter-spacing: 0.04em;
  color: var(--cc-muted);
  opacity: 0.75;
}

/* Everything the reader sees sits above the ambient layers.
   Only the in-flow parts are listed. The absolutely positioned ones carry their own z-index
   in their own rules — naming them here would set position: relative on them and, depending
   on rule order, quietly drop them out of place. That is exactly what happened to the
   credit line. */
.slide__content,
.slide__footer { position: relative; z-index: 1; }

.slide__accent {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 100%;
  height: 7px;
  background: linear-gradient(
    90deg,
    var(--cc-accent) 0%,
    color-mix(in srgb, var(--cc-accent) 45%, var(--cc-background)) 100%
  );
}

/* The measured box. Everything the fit loop reasons about lives inside it; the footer and
   the eyebrow sit outside so they never count as overflow. */
.slide__content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* The "safe" keyword matters. A plain center splits overflow across BOTH edges, and
     overflow above the start edge is not reflected in scrollHeight — the fit loop would read
     an overflowing slide as fitting. "safe" falls back to flex-start the moment content does
     not fit, so every overflow stays at the bottom where the probe can measure it. */
  justify-content: safe center;
}

/* Flex items shrink by default, which would quietly compress an oversized block to fit
   instead of overflowing — hiding the very condition the fit loop exists to detect. */
.slide__content > * { flex-shrink: 0; }

/* ---- eyebrow: the deck's subject, repeated so the slides read as one set ---- */

.slide__content > .slide__eyebrow {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--fit-scale));
  /* Tight to the heading it introduces, and more specific than the generic child margin
     below, which would otherwise win on source order. */
  margin-bottom: calc(22px * var(--fit-scale));
  font-size: calc(25px * var(--fit-scale));
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cc-muted);
}

.slide__eyebrow::before {
  content: '';
  flex: 0 0 auto;
  width: calc(26px * var(--fit-scale));
  height: calc(3px * var(--fit-scale));
  border-radius: 2px;
  background: var(--cc-accent);
}

/* ---- footer ---- */

.slide__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 26px;
  margin-top: 26px;
  border-top: 1px solid var(--cc-border);
  color: var(--cc-muted);
  font-size: 26px;
  font-weight: 500;
}

.slide__handle { display: flex; align-items: center; gap: 12px; }

.slide__handle::before {
  content: '';
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--cc-accent);
}

.slide__index {
  font-variant-numeric: tabular-nums;
  font-size: 24px;
  letter-spacing: 0.04em;
  padding: 5px 14px;
  border-radius: 999px;
  background: var(--cc-surface);
  border: 1px solid var(--cc-border);
}

/* ---- content typography, all scaled by --fit-scale ---- */

.slide__content > * { margin: 0 0 calc(26px * var(--fit-scale)); }
.slide__content > *:last-child { margin-bottom: 0; }

.slide__content h1,
.slide__content h2,
.slide__content h3 {
  font-family: var(--cc-heading-font);
  line-height: 1.08;
  letter-spacing: -0.026em;
  font-weight: 700;
  margin-bottom: calc(30px * var(--fit-scale));
  text-wrap: balance;
}

.slide__content h1 { font-size: calc(86px * var(--fit-scale)); }
.slide__content h2 { font-size: calc(68px * var(--fit-scale)); }
.slide__content h3 {
  font-size: calc(41px * var(--fit-scale));
  color: var(--cc-muted);
  font-weight: 600;
  letter-spacing: -0.012em;
}

.slide__content p,
.slide__content li {
  font-size: calc(38px * var(--fit-scale));
  line-height: 1.48;
  color: var(--cc-text);
}

.slide__content ul,
.slide__content ol { padding-left: 0; list-style: none; }
.slide__content li {
  position: relative;
  margin-bottom: calc(18px * var(--fit-scale));
  padding-left: calc(42px * var(--fit-scale));
}
.slide__content ul > li::before {
  content: '';
  position: absolute;
  left: 0;
  /* em-relative, so the dash tracks the line it belongs to at any fit scale. */
  top: 0.58em;
  width: calc(14px * var(--fit-scale));
  height: calc(3px * var(--fit-scale));
  border-radius: 2px;
  background: var(--cc-accent);
}
.slide__content ol { counter-reset: step; }
.slide__content ol > li { counter-increment: step; }
.slide__content ol > li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  font-family: var(--cc-mono-font);
  font-size: calc(24px * var(--fit-scale));
  font-weight: 600;
  color: var(--cc-accent);
  line-height: 1.9;
}

.slide__content a { color: var(--cc-accent); text-decoration: none; }
.slide__content strong { font-weight: 700; color: #fff; }
.slide__content em { font-style: italic; color: var(--cc-muted); }

.slide__content blockquote {
  position: relative;
  background: var(--cc-surface);
  border: 1px solid var(--cc-border);
  border-left: calc(5px * var(--fit-scale)) solid var(--cc-accent);
  border-radius: calc(14px * var(--fit-scale));
  padding: calc(30px * var(--fit-scale)) calc(34px * var(--fit-scale));
}
.slide__content blockquote p {
  font-size: calc(40px * var(--fit-scale));
  font-weight: 500;
  line-height: 1.42;
}
.slide__content blockquote p:last-child { margin-bottom: 0; }

.slide__content code {
  font-family: var(--cc-mono-font);
  font-size: 0.86em;
  background: var(--cc-surface);
  border: 1px solid var(--cc-border);
  border-radius: calc(7px * var(--fit-scale));
  padding: 0.1em 0.34em;
  color: var(--cc-text);
}

/* ---- code blocks ---- */

.slide__content pre {
  background: var(--cc-code-background);
  border: 1px solid var(--cc-border);
  border-radius: calc(16px * var(--fit-scale));
  padding: calc(26px * var(--fit-scale)) calc(30px * var(--fit-scale));
  overflow: hidden;
}

/* The fence's language, drawn as a caption inside the block. Tech carousels are mostly code,
   and naming the language saves the reader a beat of guessing. */
.slide__content pre .cc-lang {
  display: block;
  margin-bottom: calc(18px * var(--fit-scale));
  padding-bottom: calc(14px * var(--fit-scale));
  border-bottom: 1px solid var(--cc-border);
  font-family: var(--cc-mono-font);
  font-size: calc(22px * var(--fit-scale));
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cc-muted);
}

.slide__content pre code {
  display: block;
  font-family: var(--cc-mono-font);
  font-size: calc(29px * var(--fit-scale));
  line-height: 1.5;
  background: none;
  border: 0;
  border-radius: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* An image is capped to the content box so it can never be the sole cause of overflow —
   the one overflow case prevented rather than handled. */
.slide__content img {
  display: block;
  /* Full content width by default: diagrams and screenshots are what appear here, and both
     read better filling the column than sitting at whatever intrinsic size they were
     exported at. max-height still binds for anything tall. */
  width: 100%;
  max-width: 100%;
  max-height: calc(620px * var(--fit-scale));
  object-fit: contain;
  border-radius: calc(16px * var(--fit-scale));
  border: 1px solid var(--cc-border);
}

/* ---- role variants ---- */

/* The cover stays centred (the base rule). Bottom-aligning it was tried twice and abandoned:
   both justify-content: flex-end and a margin-top: auto on the first child inflate the
   measured box's scrollHeight by a few pixels, which the fit loop correctly reports as an
   unsplittable 4px overflow. Only safe center and safe flex-start measure cleanly. */

.slide--cover .slide__content h1 {
  font-size: calc(112px * var(--fit-scale));
  letter-spacing: -0.032em;
}
.slide--cover .slide__content h3 {
  font-size: calc(46px * var(--fit-scale));
  color: var(--cc-text);
  opacity: 0.66;
}

.slide--cta .slide__content h2 { font-size: calc(80px * var(--fit-scale)); }

/* ---- channels, CTA slide only ---- */

.slide__channels {
  display: flex;
  flex-direction: column;
  gap: calc(16px * var(--fit-scale));
  margin-top: calc(38px * var(--fit-scale));
}

.slide__channel {
  display: flex;
  align-items: center;
  gap: calc(16px * var(--fit-scale));
  font-size: calc(34px * var(--fit-scale));
  color: var(--cc-text);
}

.slide__channel-label {
  flex: 0 0 auto;
  min-width: calc(132px * var(--fit-scale));
  font-family: var(--cc-mono-font);
  font-size: calc(19px * var(--fit-scale));
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--cc-accent);
}
`;
