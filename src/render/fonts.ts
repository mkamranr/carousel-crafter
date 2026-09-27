/**
 * Bundled typefaces, inlined as base64 woff2.
 *
 * Nothing is ever fetched. A network `@font-face` fails *silently*: the render succeeds, the
 * PNG is valid, and only the glyphs are wrong — the worst failure available here, because
 * nothing reports it. Embedding the bytes removes the possibility rather than handling it.
 *
 * Only the `latin` subsets are bundled (~88KB together). The full Inter set is 42 files
 * covering Cyrillic, Greek and Vietnamese; loading them would multiply the document size for
 * glyphs this template will not draw.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Resolved through the package's own module graph, never from `process.cwd()` — the CLI is
// run from wherever the user's markdown lives, not from this package's root.
const require = createRequire(import.meta.url);

interface FaceSpec {
  family: string;
  specifier: string;
  weightRange: string;
}

const FACES: readonly FaceSpec[] = [
  {
    family: 'Inter Variable',
    specifier: '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
    weightRange: '100 900',
  },
  {
    family: 'JetBrains Mono Variable',
    specifier: '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
    weightRange: '100 800',
  },
];

// Encoding ~88KB of font on every fit iteration would be pure waste; the bytes never change
// within a process.
let cached: string | null = null;

export function fontFaceCss(): string {
  if (cached !== null) return cached;

  const blocks = FACES.map(({ family, specifier, weightRange }) => {
    const bytes = readFileSync(require.resolve(specifier));
    return [
      '@font-face {',
      `  font-family: '${family}';`,
      '  font-style: normal;',
      '  font-display: block;',
      `  font-weight: ${weightRange};`,
      `  src: url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2-variations');`,
      '}',
    ].join('\n');
  });

  cached = blocks.join('\n\n');
  return cached;
}
