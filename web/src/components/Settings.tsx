/**
 * The settings panel.
 *
 * Edits `carousel.config.json` in the posts folder — the same file the CLI reads with `-c`,
 * so the editor and the command line can never hold different ideas about your handle.
 *
 * `handle` is what every slide's footer carries. The rest render on the CTA slide and only
 * there: a footer repeating four accounts on all ten slides is noise on nine of them.
 */

import { useEffect, useState } from 'react';
import { fetchModels } from '../api.js';

const DEFAULT_BASE_URL = 'http://localhost:11434/v1';

export interface BrandForm {
  handle: string;
  instagram: string;
  facebook: string;
  youtube: string;
  tiktok: string;
  website: string;
}

const EMPTY: BrandForm = {
  handle: '',
  instagram: '',
  facebook: '',
  youtube: '',
  tiktok: '',
  website: '',
};

const FIELDS: { key: keyof BrandForm; label: string; hint: string }[] = [
  { key: 'handle', label: 'Footer handle', hint: 'shown on every slide' },
  { key: 'instagram', label: 'Instagram', hint: '@you' },
  { key: 'facebook', label: 'Facebook page', hint: 'facebook.com/you' },
  { key: 'youtube', label: 'YouTube', hint: 'channel name' },
  { key: 'tiktok', label: 'TikTok', hint: '@you' },
  { key: 'website', label: 'Website', hint: 'you.dev' },
];

export interface LlmForm {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface SettingsValue {
  brand: BrandForm;
  accent: string;
  llm: LlmForm;
  pexelsApiKey: string;
}

interface SettingsProps {
  value: SettingsValue;
  saving: boolean;
  onSave: (value: SettingsValue) => void;
  onClose: () => void;
}

export function Settings({ value, saving, onSave, onClose }: SettingsProps) {
  const [form, setForm] = useState(value);
  useEffect(() => setForm(value), [value]);

  const set = (key: keyof BrandForm, next: string) =>
    setForm((current) => ({ ...current, brand: { ...current.brand, [key]: next } }));

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 text-neutral-500 hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Accent colour</span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(form.accent) ? form.accent : '#F0B429'}
            onChange={(event) => setForm({ ...form, accent: event.target.value })}
            className="h-8 w-10 rounded border border-neutral-700 bg-neutral-900"
          />
          <input
            value={form.accent}
            onChange={(event) => setForm({ ...form, accent: event.target.value })}
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200"
          />
        </div>
      </label>

      <div className="flex flex-col gap-3">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">
              {field.label} <span className="text-neutral-600">· {field.hint}</span>
            </span>
            <input
              value={form.brand[field.key]}
              placeholder={field.hint}
              onChange={(event) => set(field.key, event.target.value)}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600"
            />
          </label>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        The footer handle appears on every slide. The rest appear on the CTA slide — the one marked{' '}
        <code className="text-neutral-400">{'<!-- role: cta -->'}</code>.
      </p>

      <LlmSection value={form.llm} onChange={(llm) => setForm({ ...form, llm })} />

      <section className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
        <h3 className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">
          Stock photos
        </h3>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">
            Pexels API key <span className="text-neutral-600">· free, pexels.com/api</span>
          </span>
          <input
            type="password"
            value={form.pexelsApiKey}
            placeholder="for the Background picker"
            onChange={(event) => setForm({ ...form, pexelsApiKey: event.target.value })}
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600"
          />
        </label>
        <p className="text-xs leading-relaxed text-amber-300/70">
          Stored in plain text like the model key. PEXELS_API_KEY in the environment takes
          precedence and is never written to disk.
        </p>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(form)}
        className="mt-auto rounded-md bg-amber-400 px-3 py-1.5 text-sm font-medium text-neutral-950 hover:bg-amber-300 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </aside>
  );
}

/**
 * Model endpoint settings.
 *
 * One shape for every provider: Ollama, vLLM, OpenRouter and the hosted APIs all speak
 * OpenAI-compatible `/v1/chat/completions`, so a base URL, a model and an optional key are
 * the whole configuration.
 */
function LlmSection({ value, onChange }: { value: LlmForm; onChange: (next: LlmForm) => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const loadModels = async () => {
    setNote('Loading…');
    try {
      const result = await fetchModels();
      setModels(result.models);
      setNote(
        result.error ??
          (result.models.length === 0
            ? 'The endpoint listed no models. Type one by hand.'
            : `${result.models.length} model(s).`),
      );
    } catch (error) {
      setNote((error as Error).message);
    }
  };

  return (
    <section className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-neutral-300 uppercase">
        Model endpoint
      </h3>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">
          Base URL <span className="text-neutral-600">· OpenAI-compatible</span>
        </span>
        <input
          value={value.baseUrl}
          placeholder={DEFAULT_BASE_URL}
          onChange={(event) => onChange({ ...value, baseUrl: event.target.value })}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Model</span>
        <input
          value={value.model}
          list="cc-models"
          placeholder="llama3.1 · gpt-4o-mini · anything the endpoint serves"
          onChange={(event) => onChange({ ...value, model: event.target.value })}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600"
        />
        <datalist id="cc-models">
          {models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>

      <button
        type="button"
        onClick={() => void loadModels()}
        className="self-start rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      >
        List models
      </button>
      {note !== null && <p className="text-xs break-words text-neutral-500">{note}</p>}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">
          API key <span className="text-neutral-600">· optional</span>
        </span>
        <input
          type="password"
          value={value.apiKey}
          placeholder="leave blank for a local model"
          onChange={(event) => onChange({ ...value, apiKey: event.target.value })}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs text-neutral-200 placeholder:text-neutral-600"
        />
      </label>

      <p className="text-xs leading-relaxed text-amber-300/70">
        A key typed here is written in plain text to carousel.config.json in your posts folder. To
        avoid that, set OPENAI_API_KEY in the environment instead — it takes precedence and is never
        written to disk.
      </p>
    </section>
  );
}

/** Config file shape → form fields, with every absent value becoming an empty string. */
export function toForm(config: Record<string, unknown>): SettingsValue {
  const brand = (config.brand ?? {}) as Partial<BrandForm>;
  const theme = (config.theme ?? {}) as { accent?: string };
  const llm = (config.llm ?? {}) as Partial<LlmForm>;
  const images = (config.images ?? {}) as { pexelsApiKey?: string };
  return {
    brand: {
      ...EMPTY,
      ...Object.fromEntries(Object.entries(brand).map(([k, v]) => [k, v ?? ''])),
      handle: brand.handle ?? (typeof config.handle === 'string' ? config.handle : '') ?? '',
    },
    accent: theme.accent ?? '',
    llm: { baseUrl: llm.baseUrl ?? '', model: llm.model ?? '', apiKey: llm.apiKey ?? '' },
    pexelsApiKey: images.pexelsApiKey ?? '',
  };
}

/**
 * Form fields → config file shape.
 *
 * Empty strings are dropped rather than written. The schema rejects a malformed colour, and
 * an empty channel would otherwise render as a blank row on the CTA slide.
 */
export function toConfig(value: SettingsValue): Record<string, unknown> {
  const brand = Object.fromEntries(
    Object.entries(value.brand)
      .map(([key, field]) => [key, field.trim()])
      .filter(([, field]) => field !== ''),
  );
  const llm = Object.fromEntries(
    Object.entries(value.llm)
      .map(([key, field]) => [key, field.trim()])
      .filter(([, field]) => field !== ''),
  );

  const config: Record<string, unknown> = {};
  if (Object.keys(brand).length > 0) config.brand = brand;
  if (value.accent.trim() !== '') config.theme = { accent: value.accent.trim() };
  if (Object.keys(llm).length > 0) config.llm = llm;
  if (value.pexelsApiKey.trim() !== '') {
    config.images = { pexelsApiKey: value.pexelsApiKey.trim() };
  }
  return config;
}
