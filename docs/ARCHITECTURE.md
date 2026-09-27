# Architecture and invariants

Markdown → Instagram carousel PNGs. React templates rendered in headless Chromium, measured,
fitted to the canvas, exported.

This file is the engineering contract for the project: the rules that are load-bearing, and
the reasons they exist. Most were learned by breaking them — where that is the case, the
failure is recorded, because the reasoning matters more than the rule.

## Invariants — do not break these

1. **The model splits, not the DOM.** Overflow is measured in the page, but slides are split
   in `fit/apply.ts` and then re-rendered. Mutating the DOM to make something fit leaves the
   model describing a layout the page no longer shows.
2. **Nothing is ever fetched at render time.** Fonts and images are inlined as base64; there
   is no external stylesheet, image URL, or script. A network `@font-face` fails _silently_ —
   the render succeeds and only the glyphs are wrong. Never introduce a remote asset.

   Images had exactly this bug. `page.setContent` loads with no base URL, so a local
   `![](./x.png)` resolved against `about:blank`, never loaded, and produced a valid PNG of a
   broken-image glyph at exit code 0. `render/images.ts` now inlines them and `captureSlides`
   throws on any `<img>` with `naturalWidth === 0`. Any new asset type must be inlined the
   same way, with a fixture that actually uses it — the bug survived because no fixture did.

3. **Never trust a screenshot to reveal overflow.** `.slide` clips by design, so an
   overflowing slide still yields a valid PNG of a truncated sentence. Measure in-page,
   before capture, or the evidence is gone.
4. **The probe checks three things** (`fit/probe.ts`): the content box's scroll vs client
   height, each top-level block's bottom edge, and any _clipping descendant's_ own scroll
   height. Drop the third and a code fence inside a centred slide measures as fitting while
   rendering truncated — this has already happened once.
5. **Type sizes are `calc(base * var(--fit-scale))`.** That indirection is why shrinking is
   one custom-property write in the page instead of a re-render per probe. Never bake a
   computed pixel size into an inline style.
6. **Flex containers need `flex-shrink: 0` on slide content.** Flex items shrink by default,
   which compresses an oversized block to fit and hides the overflow the fit loop exists to
   detect. Centring uses `justify-content: safe center` for the same reason — plain `center`
   splits overflow across both edges, and overflow above the start edge is invisible to
   `scrollHeight`.
7. **The fit loop must provably terminate.** Every split strictly decreases
   `(block count, lines in the first block)` lexicographically, and every slide keeps at
   least one block. Preserve that measure if you change splitting; the `MAX_PASSES` cap is a
   backstop, not the mechanism.
8. **The hard logic stays pure.** `fit/apply.ts` takes measurements in and returns a new
   `SlideDoc` — no browser, no I/O. Keep it that way; it is why the fit engine is testable in
   milliseconds.

## Layout

```
src/parse    markdown → SlideDoc (frontmatter, --- splitting, roles)
src/render   SlideDoc → one self-contained HTML document (React SSR, Shiki, inlined fonts/images)
src/fit      injected probe (impure-by-necessity string) + pure split planning
src/capture  Chromium lifecycle, the fit loop driver, element screenshots
src/pack     PNGs to disk, optional zip
src/build.ts the pipeline end to end — the CLI is a thin wrapper over this
src/images   Pexels search and download (author-time only, never at render time)
src/sources  Reading a GitHub repo or Hugging Face model into drafting material
src/llm      OpenAI-compatible chat client and the drafting prompt
src/web      Fastify server: posts API, /files/* images, font-css, export, generate
web/         the Vite + React editor; web/src/preview.ts is the browser-side pipeline
```

**The web preview shares the pipeline; it does not reimplement it.** `web/src/preview.ts`
calls the same `parseDocument`, `resolveConfig`, `renderDocument`, `fitScales` and
`applySplits` the exporter uses, against an iframe. Two rules keep that true:

- `src/render/document.tsx` must stay browser-safe. It takes `fontCss` as a parameter for
  exactly this reason — reading woff2 files is the only thing that would tie it to Node.
  `fonts.ts` and `images.ts` are the only Node-bound modules under `src/render`.
- `fitScales` must stay **self-contained**. Playwright serialises it into the page and the
  browser calls it against an iframe; a reference to any import or module-level constant
  exists in neither. Its `doc` parameter is how the browser aims it at the iframe.

Two known divergences, both deliberate: the preview loads images from `/files/*` rather than
inlining them (same bytes, avoids re-sending base64 per keystroke), and it bakes the resolved
`--fit-scale` values in as a style block so the displayed document needs no loop.

`test/e2e/web.test.ts` asserts preview and exporter agree on slide count for every fixture.
That test exists because they once did not: the measuring iframe shipped as `display: none`,
which has no layout, so every measurement read zero and the preview showed one overflowing
slide where the CLI produced several. A hidden measuring frame must be positioned off-screen,
at the real canvas width, never `display: none`.

## Backgrounds

Photos are fetched when the author picks one and written into the posts folder. Nothing is
fetched at render time — that is invariant #2, and a stock photo is not an exception to it.
`inlineOne` in `render/images.ts` resolves the background for export exactly as content
images are resolved; the preview serves it from `/files/` like every other image.

Two things to keep right:

- **Pexels takes a bare key, not a Bearer token.** Sending `Bearer <key>` is rejected.
- **Absolutely positioned slide parts carry their own `z-index`.** Do not add them to the
  shared `position: relative; z-index: 1` rule — depending on source order that overrides
  their `position: absolute` and drops them out of place, which is what happened to the
  credit line.

## Reading links

`src/sources` turns a URL into a normalised `SourceDocument`: a few verified facts and a
cleaned README. Three rules:

- **Only known hosts.** `isSupported` gates on host before any fetch. A server that fetches
  any URL it is handed can be pointed at a cloud metadata endpoint or anything else reachable
  from this machine, and a general fetcher does not earn that.
- **Fetched content is data, never instruction.** `sourceMessages` fences it and tells the
  model to describe rather than obey. Nothing downstream executes the output, so the
  realistic failure is a bad carousel — this keeps even that unlikely.
- **Never strip HTML from inside code fences.** `cleanMarkdown` protects them first: the tag
  regex cannot tell `<div>` from `Array<string>` or `function f<T>()`, and a tool about code
  that deletes generics out of every example is worse than one that leaves the badges in.

## Drafting

`src/llm/client.ts` speaks OpenAI-compatible `/v1/chat/completions` directly rather than
through an SDK — that contract is the one thing Ollama, vLLM, OpenRouter and the hosted APIs
all agree on, and a vendor SDK would drag in its own auth assumptions. Rules that matter:

- **No `Authorization` header when there is no key.** An empty bearer token is rejected by
  gateways that would have served the request unauthenticated.
- **`OPENAI_API_KEY` beats the config file**, so a key need never be written to disk. The
  settings panel says so plainly, because it is writing one when you use it.
- **`llm` is config-file only, never frontmatter.** A post is content; content must not be
  able to point the server at an endpoint of its choosing.
- **SSE frames split across chunk boundaries.** The reader buffers and only consumes whole
  frames; `test/llm/client.test.ts` cuts a frame mid-JSON to prove it.
- **Errors after the first byte go in the body**, behind `[[carousel-crafter:error]]`. The
  status line is already sent by then, and a truncated draft must not read as a finished one.

## Tests must never touch a real posts folder

`test/e2e/*` copies `test/fixtures/` into a temp directory and serves the copy. This is not
tidiness: these suites write and delete `carousel.config.json` in whatever folder they serve,
and pointed at a real one a test run destroyed a saved configuration — handles and an API
key. A test suite does not get to impose that cost.

`test/fixtures/` exists for the same reason, one level up: test inputs must be owned by the
suite and edited by nobody. When the tests read from a folder someone also writes posts in,
an ordinary edit turns into a failing assertion about a file the author never knew was load
bearing. Any new test that reads or writes a served folder uses `test/fixtures` and the temp
copy.

## Verifying

Never claim a change works without running these. Note that `npm run typecheck` covers both
tsconfigs, and `lint` has caught a rendered-nowhere component that typecheck could not:

```bash
npm run typecheck && npm run lint
npm test                                        # fast, no browser
npm run test:e2e                                # PNG sizes, zero overflow, reruns, preview/export agreement
node dist/cli.js test/fixtures/sample.md -o /tmp/cc  # then LOOK at the PNGs
```

The e2e suite's real assertion is that **no slide overflows in the final output**. A visual
change that passes the unit tests can still produce a truncated slide.

Visual-regression snapshots are deliberately absent: baselines generated here differ under
Linux font rasterization, and the maintenance cost lands on every intentional design tweak.

---

# Working on this codebase

## 1. Think before coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — do not pick silently.
- If a simpler approach exists, say so.

## 2. Simplicity first

- No features beyond what was asked. No speculative abstraction or configurability.
- If you write 200 lines and it could be 50, rewrite it.

## 3. Surgical changes

- Touch only what you must. Don't refactor what isn't broken. Match existing style.
- Remove only the orphans your own change created.

## 4. Goal-driven execution

- Turn tasks into verifiable goals: "fix the bug" → "write a failing test, then make it pass".
- State a plan with a verify step per item, and run it before claiming completion.
- Report unresolved issues instead of hiding them. Never delete functionality to make a test
  pass.
