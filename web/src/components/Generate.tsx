/**
 * The drafting bar.
 *
 * Streams a post into the editor from a one-line topic. Replaces the editor's contents
 * outright, which is why it asks first when there is unsaved work — a draft arriving over
 * something you were writing is not a recoverable mistake.
 */

import { useState } from 'react';
import { readSource, type SourcePreview } from '../api.js';

interface GenerateProps {
  busy: boolean;
  dirty: boolean;
  onGenerate: (input: { topic: string; url: string }) => void;
  onCancel: () => void;
  onClose: () => void;
}

export function Generate({ busy, dirty, onGenerate, onCancel, onClose }: GenerateProps) {
  const [topic, setTopic] = useState('');
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [source, setSource] = useState<SourcePreview | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** Read the link before drafting, so a bad URL is caught while it is still cheap. */
  const check = async () => {
    if (url.trim() === '') return;
    setSource(null);
    setNote('Reading…');
    try {
      const preview = await readSource(url.trim());
      setSource(preview);
      setNote(null);
    } catch (error) {
      setNote((error as Error).message);
    }
  };

  const start = () => {
    if (topic.trim() === '' && url.trim() === '') return;
    if (dirty && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onGenerate({ topic: topic.trim(), url: url.trim() });
  };

  return (
    <div className="flex items-start gap-2 border-b border-neutral-800 bg-neutral-900 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            value={url}
            disabled={busy}
            placeholder="Optional: a GitHub repo or Hugging Face model link — its README will be read"
            onChange={(event) => {
              setUrl(event.target.value);
              setSource(null);
              setNote(null);
            }}
            onBlur={() => void check()}
            className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy || url.trim() === ''}
            onClick={() => void check()}
            className="rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            Read
          </button>
        </div>

        {source && (
          <p className="truncate text-[11px] text-neutral-500">
            <span className="text-amber-300/80">{source.kind}</span> · {source.title} ·{' '}
            {source.facts.map((fact) => `${fact.label} ${fact.value}`).join(' · ')}
          </p>
        )}
        {note !== null && <p className="text-[11px] break-words text-neutral-400">{note}</p>}

        <textarea
          value={topic}
          rows={2}
          disabled={busy}
          placeholder={
            url.trim() === ''
              ? 'What is the post about? e.g. why React Server Components change where code runs'
              : 'Optional: the angle to take on that link'
          }
          onChange={(event) => {
            setTopic(event.target.value);
            setConfirming(false);
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              start();
            }
          }}
          className="w-full resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {busy ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            disabled={topic.trim() === '' && url.trim() === ''}
            className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
              confirming
                ? 'bg-red-500 text-neutral-50 hover:bg-red-400'
                : 'bg-amber-400 text-neutral-950 hover:bg-amber-300'
            }`}
          >
            {confirming ? 'Replace unsaved?' : 'Generate'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1 text-xs text-neutral-500 hover:text-neutral-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
