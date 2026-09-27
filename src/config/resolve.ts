/**
 * Config resolution.
 *
 * Precedence, highest first: CLI flags, then markdown frontmatter, then the config file,
 * then defaults. The ordering follows how directly the author expressed the intent — a flag
 * typed for this run beats a note in the file, which beats a project-wide setting.
 *
 * Layers merge rather than replace, so a frontmatter `accent` overrides one token and leaves
 * the other nine alone.
 */

import type { Canvas } from '../render/document.js';
import { resolveTokens, type ThemeTokens } from '../render/tokens.js';
import {
  CHANNEL_KEYS,
  ConfigFileSchema,
  FrontmatterSchema,
  type Brand,
  type ChannelKey,
  type ConfigFile,
} from './schema.js';

export const DEFAULT_CANVAS: Canvas = { width: 1080, height: 1350 };
export const DEFAULT_SCALE = 2;
export const DEFAULT_FIT_FLOOR = 0.75;

export interface CliOverrides {
  scale?: number | undefined;
  handle?: string | undefined;
}

/** One channel, ready to draw: a label for the icon slot and the account text. */
export interface Channel {
  key: ChannelKey;
  value: string;
}

export interface ResolvedConfig {
  canvas: Canvas;
  deviceScaleFactor: number;
  fitFloor: number;
  /** Shown in every slide's footer. */
  handle: string | null;
  /** Shown on the CTA slide only. Empty entries are dropped here, not in the template. */
  channels: Channel[];
  /** Small line above the heading on content slides; carries the deck's subject. */
  eyebrow: string | null;
  /** Photo behind the cover and CTA, as written by the author. Resolved to bytes later. */
  background: string | null;
  /** Photographer credit for that photo, if the picker recorded one. */
  backgroundCredit: string | null;
  /** Which slides carry the photo. */
  backgroundOn: 'cover-cta' | 'cover' | 'all';
  tokens: ThemeTokens;
}

function mergeBrand(...layers: (Brand | undefined)[]): Brand {
  return layers.reduce<Brand>((all, layer) => ({ ...all, ...(layer ?? {}) }), {});
}

function toChannels(brand: Brand): Channel[] {
  return CHANNEL_KEYS.flatMap((key) => {
    const value = brand[key]?.trim();
    return value ? [{ key, value }] : [];
  });
}

export function parseConfigFile(raw: unknown): ConfigFile {
  return ConfigFileSchema.parse(raw);
}

export function resolveConfig(input: {
  cli?: CliOverrides;
  frontmatter?: Record<string, unknown>;
  file?: ConfigFile;
}): ResolvedConfig {
  const cli = input.cli ?? {};
  const file = input.file ?? {};
  const front = FrontmatterSchema.parse(input.frontmatter ?? {});

  // `accent` is frontmatter's shorthand for the one token that changes most often; an
  // explicit `theme.accent` in the same block is more specific and wins.
  const frontTokens = {
    ...(front.accent ? { accent: front.accent } : {}),
    ...(front.theme ?? {}),
  };

  const brand = mergeBrand(file.brand, front.brand);

  return {
    canvas: file.canvas ?? DEFAULT_CANVAS,
    deviceScaleFactor: cli.scale ?? file.scale ?? DEFAULT_SCALE,
    fitFloor: file.fitFloor ?? DEFAULT_FIT_FLOOR,
    // `handle` at the top level is the shorthand every existing post already uses, so it
    // stays ahead of `brand.handle` in the same layer.
    handle: cli.handle ?? front.handle ?? brand.handle ?? file.handle ?? brand.instagram ?? null,
    channels: toChannels(brand),
    eyebrow: front.eyebrow ?? front.title ?? null,
    // Per-post beats project-wide: a deck's own cover photo is a more specific intent than a
    // default background set once for the folder.
    background: front.background ?? file.background ?? null,
    backgroundCredit: front.backgroundCredit ?? null,
    backgroundOn: front.backgroundOn ?? file.backgroundOn ?? 'cover-cta',
    tokens: resolveTokens({ ...(file.theme ?? {}), ...frontTokens }),
  };
}
