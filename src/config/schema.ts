/**
 * Configuration shapes.
 *
 * Validated rather than trusted: a config file and a markdown frontmatter block are both
 * hand-written, and a typo like `acent` should be reported at the top of the run, not
 * silently ignored until the colours come out wrong.
 */

import { z } from 'zod';

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const colour = z.string().regex(HEX, 'must be a hex colour such as #F0B429');

export const ThemeOverridesSchema = z
  .object({
    background: colour,
    surface: colour,
    text: colour,
    muted: colour,
    accent: colour,
    border: colour,
    codeBackground: colour,
    headingFont: z.string(),
    bodyFont: z.string(),
    monoFont: z.string(),
  })
  .partial()
  .strict();

/**
 * The accounts a deck points people at.
 *
 * `handle` is what every slide's footer carries. The rest render on the CTA slide and only
 * there — a footer repeating four accounts on all ten slides is noise on nine of them, and
 * the CTA slide is already the one that exists to say "follow me here".
 */
export const BrandSchema = z
  .object({
    handle: z.string().nullable(),
    instagram: z.string(),
    facebook: z.string(),
    youtube: z.string(),
    tiktok: z.string(),
    website: z.string(),
  })
  .partial()
  .strict();

export const CanvasSchema = z
  .object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

/**
 * The model endpoint used to draft posts.
 *
 * OpenAI-compatible on purpose: the same three fields reach Ollama, vLLM, OpenRouter and any
 * hosted OpenAI-compatible API, so there is one code path rather than a provider adapter per
 * vendor. `apiKey` is optional because a local runtime does not want one.
 *
 * Config-file only — deliberately absent from `FrontmatterSchema`. A post is content, and
 * content must never be able to point the server at an endpoint of its choosing.
 */
export const LlmSchema = z
  .object({
    /** Root of the OpenAI-compatible API, e.g. http://localhost:11434/v1 */
    baseUrl: z.string().url(),
    model: z.string(),
    /** Overridden by OPENAI_API_KEY when that is set. Omit entirely for a local runtime. */
    apiKey: z.string(),
    temperature: z.number().min(0).max(2),
  })
  .partial()
  .strict();

/**
 * Stock photo search.
 *
 * Config-file only, like `llm`, and for the same reason: a post is content, and content must
 * not be able to aim the server at an endpoint or spend someone's API quota.
 */
export const ImagesSchema = z
  .object({
    /** Overridden by PEXELS_API_KEY when that is set. */
    pexelsApiKey: z.string(),
  })
  .partial()
  .strict();

/** A `carousel.config.json` file. */
export const ConfigFileSchema = z
  .object({
    /** Shorthand for `brand.handle`, kept because it is what every existing post uses. */
    handle: z.string().nullable(),
    brand: BrandSchema,
    llm: LlmSchema,
    images: ImagesSchema,
    /** A path relative to the posts folder. */
    background: z.string().nullable(),
    backgroundOn: z.enum(['cover-cta', 'cover', 'all']),
    canvas: CanvasSchema,
    scale: z.number().positive().max(4),
    // Below ~0.75 body type stops being readable at phone size, so shrinking further would
    // trade a visible defect for an invisible one. Tunable, but not to nothing.
    fitFloor: z.number().min(0.5).max(1),
    theme: ThemeOverridesSchema,
  })
  .partial()
  .strict();

/**
 * Frontmatter. Deliberately narrower than the config file — per-post overrides are for the
 * handful of things that genuinely vary post to post.
 *
 * Not `.strict()`: `title` and any other authoring note the writer keeps in frontmatter is
 * their business, and rejecting it would make the format hostile.
 */
export const FrontmatterSchema = z
  .object({
    handle: z.string().nullable(),
    accent: colour,
    theme: ThemeOverridesSchema,
    brand: BrandSchema,
    /** Small line above the heading, carrying the deck's subject across every slide. */
    eyebrow: z.string(),
    title: z.string(),
    /** Photo behind this deck's cover and CTA. Relative to the markdown file. */
    background: z.string().nullable(),
    /** Photographer credit, written by the picker so it can be shown if you choose to. */
    backgroundCredit: z.string(),
    /**
     * Which slides carry the photo. Defaults to cover-cta: those two are a headline with
     * room to breathe, where a content or code slide trades readability for atmosphere.
     * `all` is available because that is a judgement, not a law — the scrim is heavier on
     * content slides to keep it survivable.
     */
    backgroundOn: z.enum(['cover-cta', 'cover', 'all']),
  })
  .partial();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export type FrontmatterConfig = z.infer<typeof FrontmatterSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type LlmConfig = z.infer<typeof LlmSchema>;
export type ImagesConfig = z.infer<typeof ImagesSchema>;

/** Ollama's default, because it is the one endpoint that needs no key to try. */
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1';

/** Channels shown on the CTA slide, in the order they render. */
export const CHANNEL_KEYS = ['instagram', 'facebook', 'youtube', 'tiktok', 'website'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
