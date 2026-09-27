/**
 * The background picker.
 *
 * Searches Pexels and, on choosing one, downloads the photo into the posts folder and writes
 * its path into the post's frontmatter. The download is the point: by render time a
 * background is an ordinary local file, so exports stay offline and reproducible.
 *
 * Only the cover and CTA carry it. A photo behind a code slide trades the one thing this
 * tool exists for — readable code — for atmosphere.
 */

import { useState } from 'react';
import { downloadPhoto, searchPhotos, type PhotoResult } from '../api.js';

export type BackgroundScope = 'cover-cta' | 'cover' | 'all';

const SCOPES: { value: BackgroundScope; label: string; hint: string }[] = [
  { value: 'cover-cta', label: 'Cover + CTA', hint: 'default' },
  { value: 'cover', label: 'Cover only', hint: '' },
  { value: 'all', label: 'Every slide', hint: 'heavier scrim on content' },
];

interface BackgroundsProps {
  current: string | null;
  scope: BackgroundScope;
  onChosen: (file: string, credit: string) => void;
  onScope: (scope: BackgroundScope) => void;
  onClear: () => void;
  onClose: () => void;
}

export function Backgrounds({
  current,
  scope,
  onChosen,
  onScope,
  onClear,
  onClose,
}: BackgroundsProps) {
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (query.trim() === '') return;
    setBusy(true);
    setStatus('Searching…');
    try {
      const result = await searchPhotos(query.trim());
      setPhotos(result.photos);
      setStatus(result.photos.length === 0 ? 'Nothing found. Try another term.' : null);
    } catch (error) {
      setPhotos([]);
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (photo: PhotoResult) => {
    setBusy(true);
    setStatus('Downloading…');
    try {
      const credit = `Photo: ${photo.photographer} / Pexels`;
      const saved = await downloadPhoto({
        url: photo.full,
        id: photo.id,
        query: query.trim(),
        credit,
      });
      onChosen(`./${saved.name}`, credit);
      setStatus(`Saved ${saved.name} into your posts folder.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-100">Background</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 text-neutral-500 hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <p className="text-xs leading-relaxed text-neutral-500">
        Applied to the cover and CTA only. Downloaded into your posts folder, so exports never
        depend on the network.
      </p>

      <div className="flex gap-2">
        <input
          value={query}
          placeholder="abstract, circuit, night city…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void search();
          }}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-neutral-200 placeholder:text-neutral-600"
        />
        <button
          type="button"
          disabled={busy || query.trim() === ''}
          onClick={() => void search()}
          className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          Search
        </button>
      </div>

      {current !== null && (
        <div className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5">
          <span className="truncate font-mono text-xs text-neutral-400">{current}</span>
          <button
            type="button"
            onClick={onClear}
            className="ml-2 shrink-0 text-xs text-neutral-500 hover:text-red-300"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Applies to</span>
        <div className="flex gap-1">
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onScope(option.value)}
              title={option.hint}
              className={`flex-1 rounded border px-1.5 py-1 text-[11px] ${
                scope === option.value
                  ? 'border-amber-400 bg-amber-400/10 text-amber-200'
                  : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-600">
          Every slide puts a photo behind code, which costs legibility — the scrim is heavier there,
          but it is still a trade.
        </p>
      </div>

      {status !== null && <p className="text-xs break-words text-neutral-400">{status}</p>}

      <div className="grid grid-cols-2 gap-2">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            disabled={busy}
            onClick={() => void choose(photo)}
            title={`${photo.alt || 'Photo'} — ${photo.photographer}`}
            className="group relative overflow-hidden rounded border border-neutral-800 hover:border-amber-400 disabled:opacity-50"
          >
            <img src={photo.thumb} alt={photo.alt} className="aspect-[4/5] w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-neutral-950/80 px-1.5 py-0.5 text-left text-[10px] text-neutral-400">
              {photo.photographer}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-auto text-xs leading-relaxed text-neutral-500">
        Pexels' licence permits commercial use. Their API guidelines ask that photographers be
        credited — the name is written into your post's frontmatter so you can show it or not.
      </p>
    </aside>
  );
}
