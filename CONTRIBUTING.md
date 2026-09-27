# Contributing

## Setup

```bash
npm install
npm run build
```

Node 22+ and Google Chrome. The e2e suite drives a real browser.

## Before opening a pull request

All four must pass:

```bash
npm run typecheck   # both tsconfigs
npm run lint
npx prettier --check .
npm test            # unit and HTML-structure tests, no browser
npm run test:e2e    # Playwright: PNG sizes, zero overflow, preview parity
```

Then look at the output. A change can pass every test and still produce an ugly slide:

```bash
node dist/cli.js test/fixtures/sample.md -o /tmp/check
```

## Rules worth knowing before you change the renderer

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) lists the invariants the render pipeline
depends on, with the failure that taught each one. The short version:

- Nothing is fetched at render time. Fonts and images are embedded.
- Overflow is measured in the page before capture — a screenshot cannot reveal it, because
  the slide clips.
- The fit loop must provably terminate.
- The web preview shares the renderer with the exporter. It must not be reimplemented.
- Test inputs live in `test/fixtures/` and are owned by the suite. Tests that write to a
  served folder copy it to a temp directory first.

## Commits

Conventional Commits. Explain **why** in the body — the reasoning outlives the diff, and most
of the rules above exist because something broke in a way the code alone did not explain.
