/**
 * Fixture integrity.
 *
 * A fixture that references a file which is not in the repository passes locally, where the
 * file happens to exist, and fails for everyone else. It happened: a fixture drifted into a
 * generated post whose background photo was gitignored, and the failure surfaced as the
 * preview-parity test disagreeing about slide counts — nowhere near the cause.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

/** Every local path a post points at: markdown images, and the frontmatter background. */
function referencedFiles(source: string): string[] {
  const images = [...source.matchAll(/!\[[^\]]*\]\((\.[^)\s]+)\)/g)].map((m) => m[1]!);
  const background = [...source.matchAll(/^background:\s*(\S+)/gm)].map((m) =>
    m[1]!.replace(/^["']|["']$/g, ''),
  );
  return [...images, ...background].filter((ref) => !ref.startsWith('data:'));
}

const posts = readdirSync(FIXTURES).filter((name) => name.endsWith('.md'));

describe('test fixtures', () => {
  it('has fixtures to test with', () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it.each(posts)('%s references only files that exist', (name) => {
    const source = readFileSync(join(FIXTURES, name), 'utf8');
    for (const ref of referencedFiles(source)) {
      expect(existsSync(join(FIXTURES, ref)), `${name} references missing ${ref}`).toBe(true);
    }
  });

  it.each(posts)('%s carries no key-shaped string', (name) => {
    // Fixtures are committed. A generated post pasted in here could carry one.
    const source = readFileSync(join(FIXTURES, name), 'utf8');
    expect(source).not.toMatch(/sk-[a-zA-Z0-9-]{16,}/);
  });
});
