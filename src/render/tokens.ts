/**
 * Design tokens.
 *
 * Layers merge rather than replace: a config file supplies a handful of values while the
 * default theme defines every token, so replacing would blank everything the user did not
 * mention. This is the only place the layers combine — the CLI and, later, the web preview
 * both call it, which is what keeps preview and export from drifting.
 *
 * Emitted as CSS custom properties rather than baked into inline styles, because the fit
 * loop rewrites `--fit-scale` in-page and re-measures without re-rendering.
 */

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  codeBackground: string;
  headingFont: string;
  bodyFont: string;
  monoFont: string;
}

/** Dark, high contrast, built for code. */
export const DARK_THEME: ThemeTokens = {
  background: '#0A0E14',
  surface: '#141C26',
  text: '#F4F7FA',
  muted: '#8093A6',
  accent: '#F0B429',
  border: '#1E2A36',
  codeBackground: '#0E141C',
  headingFont: "'Inter Variable', system-ui, sans-serif",
  bodyFont: "'Inter Variable', system-ui, sans-serif",
  monoFont: "'JetBrains Mono Variable', ui-monospace, monospace",
};

export function resolveTokens(overrides?: Partial<ThemeTokens> | null): ThemeTokens {
  return { ...DARK_THEME, ...(overrides ?? {}) };
}

const CSS_NAMES: Record<keyof ThemeTokens, string> = {
  background: '--cc-background',
  surface: '--cc-surface',
  text: '--cc-text',
  muted: '--cc-muted',
  accent: '--cc-accent',
  border: '--cc-border',
  codeBackground: '--cc-code-background',
  headingFont: '--cc-heading-font',
  bodyFont: '--cc-body-font',
  monoFont: '--cc-mono-font',
};

/** Tokens as a CSS custom-property block, for the `:root` of the rendered document. */
export function tokensToCss(tokens: ThemeTokens): string {
  return (Object.keys(CSS_NAMES) as (keyof ThemeTokens)[])
    .map((key) => `  ${CSS_NAMES[key]}: ${tokens[key]};`)
    .join('\n');
}
